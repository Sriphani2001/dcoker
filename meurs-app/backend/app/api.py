from fastapi import APIRouter, Depends, HTTPException, Request, Body, Query
from sqlalchemy.orm import Session
import httpx
import datetime as dt
from pathlib import Path
from typing import Optional, Dict, Any, List

from . import models, schemas
from .dependencies import get_db
from .settings import settings
from .services import (
    audius_search_tracks, audius_resolve_stream,
    pixabay_video_search, range_proxy
)
from .utils import list_files, host_allowed
from .ws import create_room, get_room, close_room

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR.parent / "media"

# ---- helpers ---------------------------------------------------------------

def _year_from_date(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    # Accept ISO-ish strings; only the first 10 chars are used (YYYY-MM-DD)
    try:
        return dt.date.fromisoformat(s[:10]).year
    except Exception:
        return None

# ---- Auth (demo plaintext)
@router.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(400, "Username already registered")
    new_user = models.User(username=user.username, password=user.password)
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "User created successfully"}

@router.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(400, "Invalid credentials")
    return {"message": "Login successful", "username": db_user.username}

# ---- Local media lists
@router.get("/music")
def get_music_list():
    return {"music": list_files(MEDIA_DIR / "music")}

@router.get("/videos")
def get_video_list():
    return {"videos": list_files(MEDIA_DIR / "videos")}

# =============================================================================
# SEARCH ENDPOINTS expected by the front-end
# =============================================================================

# ---- /api/search/music  (Audius)
@router.get("/search/music")
async def search_music(
    q: str = Query(..., min_length=1),
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """
    Search Audius and normalize results for the UI.
    Returns items with fields the client already understands:
    id, title, artist, artwork, source, release_date, year, stream_url
    """
    rows = await audius_search_tracks(q=q, limit=limit, offset=offset)
    items: List[Dict[str, Any]] = []

    for t in rows:
        tid = t.get("id")
        user = (t.get("user") or {}).get("name") or ""
        art = (t.get("artwork") or {})
        artwork = art.get("480x480") or art.get("1000x1000") or art.get("150x150")
        release = t.get("release_date") or t.get("created_at")
        year = _year_from_date(release)
        items.append({
            "id": tid,
            "title": t.get("title") or "Untitled",
            "artist": user,
            "artwork": artwork,
            "source": "audius",
            "release_date": release,
            "year": year,
            # IMPORTANT: front-end can play this directly
            "stream_url": f"/api/music/stream/{tid}" if tid else None,
        })
    return {"items": items}

# ---- /api/music/stream/{track_id}  (range-capable stream)
@router.get("/music/stream/{track_id}")
async def music_stream(track_id: str, request: Request):
    # Resolve to final CDN URL, then pipe with Range support
    final_url = await audius_resolve_stream(track_id)
    return await range_proxy(request, final_url)

# ---- /api/search/videos  (Pixabay)
@router.get("/search/videos")
async def search_videos(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(12, ge=1, le=50),
) -> Dict[str, Any]:
    """
    Search Pixabay videos and normalize results.
    Returns items with: title, thumbnail, source, year, stream_url
    """
    j = await pixabay_video_search(q, page, per_page)
    hits = j.get("hits", []) or []

    items: List[Dict[str, Any]] = []
    for v in hits:
        videos = v.get("videos", {}) or {}
        file = videos.get("large") or videos.get("medium") or videos.get("small") or {}
        direct = file.get("url")
        if not direct:
            continue
        # Prefer a thumbnail if present
        thumb = None
        pics = v.get("video_pictures")
        if isinstance(pics, list) and pics:
            thumb = pics[0].get("picture")
        thumb = thumb or v.get("userImageURL") or v.get("previewURL")

        items.append({
            "id": str(v.get("id")),
            "title": v.get("tags") or f"Pixabay {v.get('id')}",
            "thumbnail": thumb,
            "source": "pixabay",
            "year": None,  # Pixabay doesn't provide an ISO publish date
            # IMPORTANT: use your range proxy; front-end will play this
            "stream_url": f"/api/proxy?u={httpx.URL(direct).human_repr()}",
        })

    return {"items": items}

# ---- Existing external endpoints (kept for compatibility)
@router.get("/external/music/audius")
async def audius_search_external(q: str = "lofi", limit: int = 20, cursor: str | None = None):
    offset = int(cursor or 0)
    data = await audius_search_tracks(q, limit, offset)
    items = []
    for t in data:
        items.append({
            "id": t["id"],
            "title": t.get("title"),
            "artist": (t.get("user") or {}).get("name"),
            "duration": t.get("duration"),
            "thumb": (t.get("artwork") or {}).get("150x150"),
            "stream_url": f"/api/proxy/audius/stream?id={t['id']}",
            "source": "audius",
            "license": "Audius terms"
        })
    next_cursor = (offset + len(items)) if items else None
    return {"items": items, "next": str(next_cursor) if next_cursor is not None else None}

@router.get("/proxy/audius/stream")
async def proxy_audius_stream(id: str, request: Request):
    final_url = await audius_resolve_stream(id)
    return await range_proxy(request, final_url)

@router.get("/external/videos/pixabay")
async def pixabay_videos_external(q: str = "nature", page: int = 1, per_page: int = 10):
    j = await pixabay_video_search(q, page, per_page)
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

# ---- Generic proxy (now accepts u OR url)
@router.get("/proxy")
async def proxy(
    request: Request,
    u: Optional[str] = Query(default=None),
    url: Optional[str] = Query(default=None),
):
    target = u or url
    if not target:
        raise HTTPException(400, "Missing url (use ?u= or ?url=)")
    if not host_allowed(target):
        raise HTTPException(400, "Host not allowed")
    return await range_proxy(request, target)

# ============================================================================
# COMUNI: Accept username from JSON body OR from ?username= query param
# ============================================================================

def _extract_username(body: dict | None, username_qs: str | None) -> str | None:
    return (body or {}).get("username") or username_qs

@router.post("/comuni/rooms")
def create_comuni_room(
    body: dict | None = Body(default=None),
    username: str | None = Query(default=None),
):
    uname = _extract_username(body, username)
    if not uname:
        raise HTTPException(422, "username is required (send JSON {'username': '...'} or ?username=...)")

    created = create_room(uname)
    if not created:
        raise HTTPException(500, "Could not allocate room id")
    return created

@router.post("/comuni/rooms/{room_id}/join")
def join_comuni_room(
    room_id: str,
    body: dict | None = Body(default=None),
    username: str | None = Query(default=None),
):
    uname = _extract_username(body, username)
    if not uname:
        raise HTTPException(422, "username is required")

    room = get_room(room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    return {"ok": True, "is_owner": room.owner == uname}

@router.get("/comuni/rooms/{room_id}")
def room_info(room_id: str):
    room = get_room(room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    return {"room_id": room.id, "owner": room.owner, "clients": list(room.clients.keys())}

@router.delete("/comuni/rooms/{room_id}")
async def close_comuni_room(
    room_id: str,
    username: str | None = Query(default=None),
    body: dict | None = Body(default=None),
):
    uname = _extract_username(body, username)
    if not uname:
        raise HTTPException(422, "username is required")

    result = await close_room(room_id, uname)
    if not result.get("closed"):
        if result.get("reason") == "not_found":
            raise HTTPException(404, "Room not found")
        if result.get("reason") == "forbidden":
            raise HTTPException(403, "Only the owner can close the room")
        raise HTTPException(500, "Could not close")
    return {"closed": True}
