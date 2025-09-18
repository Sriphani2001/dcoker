from __future__ import annotations
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .rpg_survival_game import (
    new_session, get_session, public_state,
    apply_choice, _run_encounter_and_merge  # NOTE: apply_choice is async now
)
from .rpg_llm import ai_comment

router = APIRouter(prefix="/api/rpg/survival", tags=["rpg-survival"])

class NewGameReq(BaseModel):
  username: str
  seed: Optional[str] = None

class ChooseReq(BaseModel):
  session_id: str
  option_id: str

@router.post("/new")
async def start_game(payload: NewGameReq) -> Dict[str, Any]:
    sid, state, node = new_session(username=payload.username, seed=payload.seed)
    narration = node["narration"]
    # Run an initial encounter so turn 1 already has spice
    enc_text = await _run_encounter_and_merge(state, state["node_id"])
    if enc_text:
        narration = narration + "\n\n" + enc_text
    companion = await ai_comment(state, narration=narration)

    return {
        "session_id": sid,
        "state": public_state(state),
        "narration": narration,
        "companion": companion,
        "options": node["options"],
        "is_over": state["is_over"],
        "ending": state.get("ending"),
        "hint": state.get("last_hint", None),
    }

@router.post("/choose")
async def choose(payload: ChooseReq) -> Dict[str, Any]:
    state = get_session(payload.session_id)
    if not state:
        raise HTTPException(404, "Session not found")

    node, narration, err = await apply_choice(state, payload.option_id)  # await (async)
    if err:
        raise HTTPException(400, err)

    companion = await ai_comment(state, narration=narration)

    return {
        "session_id": payload.session_id,
        "state": public_state(state),
        "narration": narration,
        "companion": companion,
        "options": node["options"] if node else [],
        "is_over": state["is_over"],
        "ending": state.get("ending"),
        "hint": state.get("last_hint", None),
    }
