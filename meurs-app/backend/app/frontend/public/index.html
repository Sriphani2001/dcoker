# app/main.py
from fastapi import (
    FastAPI, Depends, HTTPException, APIRouter,
    WebSocket, WebSocketDisconnect, status
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from pathlib import Path
import secrets
import json
import time

from . import models, schemas
from .database import SessionLocal, engine

# ---------- App & paths ----------
models.Base.metadata.create_all(bind=engine)
app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent          # .../backend/app
MEDIA_DIR = BASE_DIR.parent / "media"               # .../backend/media
FRONTEND_PUBLIC_DIR = BASE_DIR / "frontend" / "public"
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
    new_user = models.User(username=user.username, password=user.password)
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "User created successfully"}

@api.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "username": db_user.username}

# ---- Media lists ----
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
        for u, ws in self.clients.items():
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
    # Return whether this user is the owner (so UI can show Close button)
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
                for u, ws in room.clients.items():
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
