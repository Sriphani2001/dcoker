from __future__ import annotations
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .rpg_survival_game import new_session, get_session, public_state, apply_action
from .rpg_llm import ai_comment

router = APIRouter(prefix="/api/rpg/survival", tags=["rpg-survival"])

class NewGameReq(BaseModel):
    username: str
    seed: Optional[str] = None

class ActReq(BaseModel):
    session_id: str
    action_id: str

class ChooseReq(BaseModel):  # legacy
    session_id: str
    option_id: str

def _payload(session_id: str, state: Dict[str, Any], enc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "state": public_state(state),
        "title": enc.get("title"),
        "narration": enc.get("narration"),
        "options": enc.get("options", []),
        "companion": state.get("companion", ""),  # filled per-request below
        "hint": enc.get("hint"),
        "future_moves": enc.get("future_moves", []),   # NEW: visible future routes
        "is_over": state["is_over"],
        "ending": state.get("ending"),
    }

@router.post("/new")
async def start_game(payload: NewGameReq) -> Dict[str, Any]:
    sid, state, enc = await new_session(username=payload.username, seed=payload.seed)
    companion = await ai_comment(state, narration=enc["narration"])
    state["companion"] = companion
    out = _payload(sid, state, enc)
    out["companion"] = companion
    return out

@router.post("/act")
async def act(payload: ActReq) -> Dict[str, Any]:
    state = get_session(payload.session_id)
    if not state:
        raise HTTPException(404, "Session not found")
    enc, err = await apply_action(state, payload.action_id)
    if err:
        raise HTTPException(400, err)
    companion = await ai_comment(state, narration=enc["narration"])
    state["companion"] = companion
    out = _payload(payload.session_id, state, enc)
    out["companion"] = companion
    return out

@router.post("/choose")  # back-compat for existing frontend
async def choose(payload: ChooseReq) -> Dict[str, Any]:
    state = get_session(payload.session_id)
    if not state:
        raise HTTPException(404, "Session not found")
    enc, err = await apply_action(state, payload.option_id)  # treat option_id == action_id
    if err:
        raise HTTPException(400, err)
    companion = await ai_comment(state, narration=enc["narration"])
    state["companion"] = companion
    out = _payload(payload.session_id, state, enc)
    out["companion"] = companion
    return out
