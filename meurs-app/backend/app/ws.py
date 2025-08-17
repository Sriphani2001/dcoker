import json, time
from typing import Dict
from fastapi import WebSocket, WebSocketDisconnect, status, Request
from .utils import gen_room_id

MAX_HISTORY = 200

class Room:
    def __init__(self, room_id: str, owner: str):
        self.id = room_id
        self.owner = owner
        self.clients: Dict[str, WebSocket] = {}
        self.messages: list[dict] = []

    def add_message(self, item: dict):
        self.messages.append(item)
        if len(self.messages) > MAX_HISTORY:
            self.messages[:] = self.messages[-MAX_HISTORY:]

    async def broadcast_json(self, payload: dict):
        dead = []
        for u, ws in list(self.clients.items()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(u)
        for u in dead:
            self.clients.pop(u, None)

rooms: Dict[str, Room] = {}

# --- HTTP helpers used by /api (import from api.py) ---
def create_room(owner: str):
    for _ in range(8):
        rid = gen_room_id()
        if rid not in rooms:
            rooms[rid] = Room(rid, owner)
            return {"room_id": rid, "owner": owner}
    return None

def get_room(room_id: str) -> Room | None:
    return rooms.get(room_id)

async def close_room(room_id: str, username: str):
    room = rooms.get(room_id)
    if not room:
        return {"closed": False, "reason": "not_found"}
    if room.owner != username:
        return {"closed": False, "reason": "forbidden"}
    await room.broadcast_json({"type": "system", "text": "Room closed by owner"})
    for ws in list(room.clients.values()):
        try: await ws.close()
        except Exception: pass
    rooms.pop(room_id, None)
    return {"closed": True}

# --- WebSocket endpoint ---
async def comuni_ws(websocket: WebSocket, room_id: str):
    user = websocket.query_params.get("user")
    room = rooms.get(room_id)
    if not user or not room:
        return await websocket.close(code=status.WS_1008_POLICY_VIOLATION)

    await websocket.accept()
    room.clients[user] = websocket

    # send history to this user
    try:
        await websocket.send_json({"type": "history", "items": room.messages})
    except Exception:
        pass

    await room.broadcast_json({"type": "system", "text": f"{user} joined", "user": user})

    try:
        while True:
            msg = await websocket.receive()

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
                        room.add_message(header)
                        await room.broadcast_json(header)
                except Exception:
                    pass

            elif msg.get("bytes") is not None:
                blob = msg["bytes"]
                dead = []
                for u, ws in list(room.clients.items()):
                    try: await ws.send_bytes(blob)
                    except Exception: dead.append(u)
                for u in dead:
                    room.clients.pop(u, None)

    except WebSocketDisconnect:
        room.clients.pop(user, None)
        if user == room.owner:
            room.messages = []
            await room.broadcast_json({"type": "clear"})
            await room.broadcast_json({"type": "system", "text": "Owner left. Chat cleared"})
        else:
            await room.broadcast_json({"type": "system", "text": f"{user} left", "user": user})
    except Exception:
        room.clients.pop(user, None)
        await room.broadcast_json({"type": "system", "text": f"{user} disconnected", "user": user})
