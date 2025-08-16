from fastapi import (
    FastAPI, Depends, HTTPException, APIRouter,
    WebSocket, WebSocketDisconnect, status, Request
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from pathlib import Path
import secrets
import json
import time
import httpx
from urllib.parse import urlparse, urlencode

from . import models, schemas
from .database import SessionLocal, engine
from .settings import settings

# ---------- App & paths ----------
models.Base.metadata.create_all(bind=engine)
app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent          # .../backend/app
MEDIA_DIR = BASE_DIR.parent / "media"               # .../backend/media
FRONTEND_PUBLIC_DIR = BASE_DIR / "frontend" / "public"
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"

# ----- CORS -----
_default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if settings.CORS_ORIGINS:
    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
else:
    origins = _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- DB session ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- API router ----------
api = APIRouter(prefix="/api")

# ---- Auth (demo only; plain text) ----
@api.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    new_user = models.User(username=user.username, password=user.password)  # NOTE: plaintext in demo
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "User created successfully"}

@api.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "username": db_user.username}

# ---- Media lists (local) ----
@api.get("/music")
def get_music_list():
    p = MEDIA_DIR / "music"
    p.mkdir(parents=True, exist_ok=True)
    return {"music": [f.name for f in p.iterdir() if f.is_file()]}

@api.get("/videos")
def get_video_list():
    p = MEDIA_DIR / "videos"
    p.mkdir(parents=True, exist_ok=True)
    return {"videos": [f.name for f in p.iterdir() if f.is_file()]}

# ---------- EXTERNAL PROVIDERS (Online) ----------

# ---- Audius (music search) ----
@api.get("/external/music/audius")
async def audius_search(q: str = "lofi", limit: int = 20, cursor: str | None = None):
    """
    Search Audius for tracks and normalize to a common shape.
    `cursor` is an integer offset encoded as string (simple pagination).
    """
    offset = int(cursor or 0)
    async with httpx.AsyncClient(timeout=15) as client:
        # Get a healthy discovery provider
        host_resp = await client.get("https://api.audius.co")
        host_resp.raise_for_status()
        host = host_resp.json()["data"][0]
        # Search tracks
        params = {"query": q, "limit": limit, "offset": offset}
        r = await client.get(f"{host}/v1/tracks/search", params=params)
        r.raise_for_status()
        data = r.json().get("data", [])

    items = []
    for t in data:
        # We resolve the actual stream later via the dedicated proxy below
        stream_url = f"/api/proxy/audius/stream?id={t['id']}"
        items.append({
            "id": t["id"],
            "title": t.get("title"),
            "artist": (t.get("user") or {}).get("name"),
            "duration": t.get("duration"),
            "thumb": (t.get("artwork") or {}).get("150x150"),
            "stream_url": stream_url,
            "source": "audius",
            "license": "Audius terms"
        })
    next_cursor = (offset + len(items)) if items else None
    return {"items": items, "next": str(next_cursor) if next_cursor is not None else None}

@api.get("/proxy/audius/stream")
async def proxy_audius_stream(id: str, request: Request):
    """
    Resolve Audius track streaming URL and proxy it with Range support.
    """
    async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
        host_resp = await client.get("https://api.audius.co")
        host_resp.raise_for_status()
        host = host_resp.json()["data"][0]
        # This endpoint issues a redirect to the CDN; we follow in the proxy call
        meta = await client.get(f"{host}/v1/tracks/{id}/stream", follow_redirects=False)
        meta.raise_for_status()
        # Determine final URL (httpx exposes .headers['location'] if 302)
        final_url = str(meta.headers.get("location") or str(meta.url))
    return await _range_proxy(request, final_url)

# ---- Pixabay (videos) ----
@api.get("/external/videos/pixabay")
async def pixabay_videos(q: str = "nature", page: int = 1, per_page: int = 10):
    """
    Search Pixabay for videos. Requires PIXABAY_KEY in settings/env.
    """
    if not settings.PIXABAY_KEY:
        raise HTTPException(500, "Pixabay key not configured")
    params = {
        "key": settings.PIXABAY_KEY,
        "q": q,
        "page": page,
        "per_page": min(max(per_page, 1), 50),
        "video_type": "all",
        "safesearch": "true",
    }
    url = "https://pixabay.com/api/videos/?" + urlencode(params)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        j = r.json()

    items = []
    for v in j.get("hits", []):
        videos = v.get("videos", {})
        file = videos.get("medium") or videos.get("small") or videos.get("large") or {}
        direct = file.get("url")
        if not direct:
            continue
        items.append({
            "id": str(v["id"]),
            "title": v.get("tags") or f"Pixabay {v['id']}",
            "artist": None,
            "duration": None,
            "thumb": v.get("userImageURL") or v.get("previewURL"),
            "stream_url": f"/api/proxy?u={httpx.URL(direct).human_repr()}",
            "source": "pixabay",
            "license": "Pixabay Content License"
        })
    next_page = page + 1 if items else None
    return {"items": items, "next": str(next_page) if next_page else None}

# ---- Generic proxy with Range support & allowlist ----
ALLOWED_PROXY_HOSTS = {
    "pixabay.com", "cdn.pixabay.com",
    "audius.co", "discoveryprovider.audius.co", "content-node.audius.co",
    "cdn.audius.co", "audius-prod-*.audius.co",  # wildcard hint only; see _host_allowed
    "archive.org", "ia802*.us.archive.org", "ia903*.us.archive.org",  # future: Internet Archive
    "images.pexels.com", "videos.pexels.com", "player.pexels.com"
}

def _host_allowed(url: str) -> bool:
    try:
        h = urlparse(url).hostname or ""
    except Exception:
        return False
    # Accept exact host or simple wildcard pattern like "ia802*.us.archive.org"
    for entry in ALLOWED_PROXY_HOSTS:
        if "*" in entry:
            prefix, suffix = entry.split("*", 1)
            if h.startswith(prefix) and h.endswith(suffix):
                return True
        elif h == entry:
            return True
    return False

@api.get("/proxy")
async def proxy(u: str, request: Request):
    """
    Generic proxy used by the frontend players.
    Only allows hosts from ALLOWED_PROXY_HOSTS.
    """
    if not _host_allowed(u):
        raise HTTPException(400, "Host not allowed")
    return await _range_proxy(request, u)

async def _range_proxy(request: Request, target_url: str) -> StreamingResponse:
    """
    Stream target_url to the client with HTTP Range passthrough
    so <audio>/<video> can scrub. Copies key headers back.
    """
    range_header = request.headers.get("range") or request.headers.get("Range")
    headers = {"Range": range_header} if range_header else {}

    async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
        r = await client.stream("GET", target_url, headers=headers)
        # forward selected headers
        fwd_headers = {}
        for k in ("content-type", "content-length", "accept-ranges", "content-range"):
            if k in r.headers:
                fwd_headers[k] = r.headers[k]
        return StreamingResponse(
            r.aiter_raw(),
            status_code=r.status_code,
            headers=fwd_headers
        )

# ---------- COMUNI (rooms + message memory) ----------
ALLOWED_CHARS = "abcdefghijklmnopqrstuvwxyz123456789!@#$%&*"
MAX_HISTORY = 200  # cap messages kept per room (in memory)

def gen_room_id(length: int = 7) -> str:
    return "".join(secrets.choice(ALLOWED_CHARS) for _ in range(length))

class Room:
    def __init__(self, room_id: str, owner: str):
        self.id = room_id
        self.owner = owner
        self.clients: dict[str, WebSocket] = {}   # username -> websocket
        self.messages: list[dict] = []            # chat & file-header only (no file bytes)

    def add_message(self, item: dict):
        self.messages.append(item)
        if len(self.messages) > MAX_HISTORY:
            self.messages = self.messages[-MAX_HISTORY:]

    async def broadcast_json(self, payload: dict):
        dead = []
        for u, ws in list(self.clients.items()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(u)
        for u in dead:
            self.clients.pop(u, None)

rooms: dict[str, Room] = {}

class CreateRoomBody(BaseModel):
    username: str

class JoinRoomBody(BaseModel):
    username: str

class CloseRoomBody(BaseModel):
    username: str

@api.post("/comuni/rooms")
def create_room(body: CreateRoomBody):
    for _ in range(8):
        rid = gen_room_id()
        if rid not in rooms:
            rooms[rid] = Room(rid, owner=body.username)
            return {"room_id": rid, "owner": body.username}
    raise HTTPException(status_code=500, detail="Could not allocate room id")

@api.post("/comuni/rooms/{room_id}/join")
def join_room(room_id: str, body: JoinRoomBody):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"ok": True, "is_owner": room.owner == body.username}

@api.get("/comuni/rooms/{room_id}")
def room_info(room_id: str):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room.id, "owner": room.owner, "clients": list(room.clients.keys())}

@api.delete("/comuni/rooms/{room_id}")
async def close_room(room_id: str, body: CloseRoomBody):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.owner != body.username:
        raise HTTPException(status_code=403, detail="Only the owner can close the room")
    await room.broadcast_json({"type": "system", "text": "Room closed by owner"})
    for ws in list(room.clients.values()):
        try:
            await ws.close()
        except Exception:
            pass
    rooms.pop(room_id, None)
    return {"closed": True}

app.include_router(api)

# ---- WebSocket endpoint (chat + file relay + history) ----
@app.websocket("/ws/comuni/{room_id}")
async def comuni_ws(websocket: WebSocket, room_id: str):
    user = websocket.query_params.get("user")
    room = rooms.get(room_id)
    if not user or not room:
        return await websocket.close(code=status.WS_1008_POLICY_VIOLATION)

    await websocket.accept()
    room.clients[user] = websocket
    print(f"[WS] {user} connected to room {room_id} (clients={len(room.clients)})")

    # Send existing history to THIS user only
    try:
        await websocket.send_json({"type": "history", "items": room.messages})
    except Exception:
        pass

    await room.broadcast_json({"type": "system", "text": f"{user} joined", "user": user})

    try:
        while True:
            msg = await websocket.receive()

            # Text frames (JSON)
            if msg.get("text") is not None:
                try:
                    data = json.loads(msg["text"])
                    typ = data.get("type")

                    if typ == "chat":
                        text = data.get("text", "")
                        item = {"type": "chat", "from": user, "text": text, "ts": time.time()}
                        room.add_message(item)
                        await room.broadcast_json(item)

                    elif typ == "file" and "filename" in data:
                        fname = data["filename"]
                        header = {"type": "file-header", "from": user, "filename": fname, "ts": time.time()}
                        room.add_message(header)          # store metadata only
                        await room.broadcast_json(header) # next frame will be file bytes
                except Exception as e:
                    print("[WS] bad JSON:", e)

            # Binary frames (file bytes)
            elif msg.get("bytes") is not None:
                blob = msg["bytes"]
                dead = []
                for u, ws in list(room.clients.items()):
                    try:
                        await ws.send_bytes(blob)
                    except Exception:
                        dead.append(u)
                for u in dead:
                    room.clients.pop(u, None)
                print(f"[WS] relayed {len(blob)} bytes to {len(room.clients)} clients")

    except WebSocketDisconnect:
        # user left
        room.clients.pop(user, None)
        print(f"[WS] {user} left {room_id}")

        # If owner leaves: clear history and tell everyone to wipe UI
        if user == room.owner:
            room.messages = []
            await room.broadcast_json({"type": "clear"})
            await room.broadcast_json({"type": "system", "text": "Owner left. Chat cleared"})
        else:
            await room.broadcast_json({"type": "system", "text": f"{user} left", "user": user})

    except Exception as e:
        room.clients.pop(user, None)
        print(f"[WS] {user} error {room_id}: {e}")
        await room.broadcast_json({"type": "system", "text": f"{user} disconnected", "user": user})

# ---------- Static mounts ----------
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(MEDIA_DIR)), name="static")

# Serve frontend at root (prefer /build if it exists, else /public)
if FRONTEND_BUILD_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_BUILD_DIR), html=True), name="frontend")
elif FRONTEND_PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_PUBLIC_DIR), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"message": "Put index.html in app/frontend/public or build to app/frontend/build"}
