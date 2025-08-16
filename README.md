# Meurs 🎵🎬💬

**Meurs** is a FastAPI + WebSocket web app for **media playback** (music/videos) and **real-time communication** (chat + file relay).  
It includes a simple authentication system, per-room chat memory, and a dashboard-style frontend.


## ✨ Features

- **Authentication**
  - Sign up / Login (demo only, plain-text passwords for now).
- **Home**
  - Browse and play **Music** (`media/music/`).
  - Browse and play **Videos** (`media/videos/`).
- **Dashboard (Comuni)**
  - Create/join **rooms** (7-char IDs with a-z, 1-9, symbols).
  - **Chat** with other users in the room.
  - **Send files** directly (no storage, relayed via WebSocket).
  - Per-room chat history (cleared when the room owner leaves).
- **Profile**: shows logged-in user and settings.
- **About Us**: app summary.
- **Games (placeholder)**: reserved space for future additions.

---

## 🏗️ Key Tech & Architecture

- **Backend**: FastAPI + Uvicorn  
- **DB**: SQLite via SQLAlchemy (file on disk; no migrations yet)  
- **Static**: `/static` serves `backend/media` (music/videos)  
- **Frontend**: served by FastAPI from `/` (either `frontend/build` or `frontend/public`)  

### **Comuni (Chat + File Relay)**

- `POST /api/comuni/rooms` → create room → `{room_id, owner}`
- `POST /api/comuni/rooms/{id}/join` → join → `{ok, is_owner}`
- `DELETE /api/comuni/rooms/{id}` → close (owner only)
- `GET /api/comuni/rooms/{id}` → room info
- `WS /ws/comuni/{id}?user=<username>` → WebSocket for chat/files

**WebSocket Frames**  
- Text JSON:  
  - `{"type":"chat","text":"..."}`  
  - `{"type":"file","filename":"..."}`  
- Binary: raw file bytes (relayed to all clients)  

**Special Server Messages**  
- On connect → `{"type":"history","items":[...]}` (chat memory for that room)  
- On owner leave → `{"type":"clear"}` broadcast, history wiped  

---

## 📂 Project Structure

....

# build image
docker build -t meurs:latest .

# start with compose
docker compose up -d

# follow logs
docker compose logs -f

# stop app
docker compose down

# rebuild and restart
docker compose up -d --build

# shell into container
docker compose exec meurs sh

# check running containers
docker ps
