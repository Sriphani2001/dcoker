from __future__ import annotations
from typing import Dict, Any, Tuple, Optional, List
import uuid
import datetime as dt
import random

from .rpg_llm import generate_full_encounter  # includes hazard tags

# ------------------------------
# Session store
# ------------------------------
_SESSIONS: Dict[str, Dict[str, Any]] = {}

def _sid() -> str:
    return uuid.uuid4().hex

# ------------------------------
# Tuning
# ------------------------------
MISLEAD_PROB = 0.35
ENCOUNTERS_ENABLED = True
MAX_DAYS = 4
MAX_HP = 10
MAX_STAMINA = 10

# ------------------------------
# WORLD GRAPH: west -> east
# ------------------------------
LOCATIONS: Dict[str, Dict[str, Any]] = {
    "west_beach":   {"biome": "beach",  "neighbors": ["cliffs", "reef", "jungle_edge"], "difficulty": "easy"},
    "cliffs":       {"biome": "cliff",  "neighbors": ["west_beach"],                     "difficulty": "hard"},
    "reef":         {"biome": "reef",   "neighbors": ["west_beach"],                     "difficulty": "hard"},
    "jungle_edge":  {"biome": "jungle", "neighbors": ["west_beach", "mid_jungle"],       "difficulty": "normal"},
    "mid_jungle":   {"biome": "jungle", "neighbors": ["jungle_edge", "ridge"],           "difficulty": "normal"},
    "ridge":        {"biome": "ridge",  "neighbors": ["mid_jungle", "thorn_gully", "east_shore"], "difficulty": "normal"},
    "thorn_gully":  {"biome": "jungle", "neighbors": ["ridge"],                          "difficulty": "hard"},
    "east_shore":   {"biome": "shore",  "neighbors": ["ridge"],                          "difficulty": "easy", "goal": "shipping_lane"},
}
START_LOCATION = "west_beach"

# ------------------------------
# Helpers
# ------------------------------
def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))

def _breadcrumbs(path: List[str], k: int = 8) -> str:
    return " → ".join(path[-k:])

def _preview_moves(location: str) -> List[Dict[str, Any]]:
    """Non-clickable preview of neighbors for the UI."""
    out: List[Dict[str, Any]] = []
    for nb in LOCATIONS[location]["neighbors"]:
        node = LOCATIONS[nb]
        out.append({
            "id": f"move_{nb}",
            "to": nb,
            "label": f"Head toward {nb.replace('_',' ')}",
            "biome": node["biome"],
            "difficulty": node.get("difficulty", "normal"),
        })
    return out

def _neighbor_move_options(location: str) -> List[Dict[str, Any]]:
    """Clickable move options (also provided in preview)."""
    out: List[Dict[str, Any]] = []
    for nb in LOCATIONS[location]["neighbors"]:
        nice = nb.replace("_", " ")
        out.append({
            "id": f"move_{nb}",
            "label": f"Head toward {nice}",
            "effects": {"hp": 0, "stamina": -1, "day_advance": 1},
            "move": nb,
        })
    return out

# ------------------------------
# Effects & movement
# ------------------------------
def _apply_effects(state: Dict[str, Any], effects: Dict[str, Any]):
    if not effects:
        return
    state["hp"]      = _clamp(state["hp"] + int(effects.get("hp", 0)), 0, MAX_HP)
    state["stamina"] = _clamp(state["stamina"] + int(effects.get("stamina", 0)), 0, MAX_STAMINA)
    state["day"]    += int(effects.get("day_advance", 0))

    for item in (effects.get("add") or []):
        if item not in state["inventory"]:
            state["inventory"].append(item)

    for k, v in (effects.get("flag") or {}).items():
        state["flags"][k] = v

def _maybe_move(state: Dict[str, Any], move: str):
    if move == "stay":
        return
    neighbors: List[str] = LOCATIONS[state["location"]]["neighbors"]
    if not neighbors:
        return
    prev = state["location"]
    if move == "auto":
        state["location"] = "east_shore" if "east_shore" in neighbors else random.choice(neighbors)
    elif move in neighbors:
        state["location"] = move
    # record path if moved
    if state["location"] != prev:
        state["path"].append(state["location"])

def _item_action_options(state: Dict[str, Any], tags: List[str]) -> List[Dict[str, Any]]:
    inv = set(state["inventory"])
    opts: List[Dict[str, Any]] = []
    # Tag-specific “outs”
    if "thorns" in tags and "machete" in inv:
        opts.append({"id":"machete_cut","label":"Hack through with the machete",
                     "effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"auto"})
    if "snake" in tags and "antivenom_vial" in inv:
        opts.append({"id":"use_antivenom","label":"Inject antivenom from your kit",
                     "effects":{"hp":+2,"stamina":0,"day_advance":0},"move":"stay"})
    if "dark" in tags and "torch_kit" in inv:
        opts.append({"id":"light_torch","label":"Light a torch and proceed",
                     "effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"auto"})
    # Generic
    if state["hp"] <= MAX_HP - 3 and "bandage" in inv:
        opts.append({"id":"bandage","label":"Bandage and disinfect wounds",
                     "effects":{"hp":+2,"stamina":-1,"day_advance":0},"move":"stay"})
    if "rope" in inv and "cliff" in tags:
        opts.append({"id":"rope_down","label":"Rig a rope to bypass the drop",
                     "effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"auto"})
    return opts

def _ensure_min_options(base: List[Dict[str, Any]], needed: int, location: str) -> List[Dict[str, Any]]:
    seen = {o["id"] for o in base}
    fillers = [
        {"id":"scout","label":"Scout the immediate area",
         "effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"stay"},
        {"id":"forage","label":"Forage and patch up",
         "effects":{"hp":+1,"stamina":-1,"day_advance":1},"move":"stay"},
        {"id":"rest","label":"Short rest",
         "effects":{"hp":0,"stamina":+2,"day_advance":1},"move":"stay"},
    ] + _neighbor_move_options(location)
    out = list(base)
    for f in fillers:
        if len(out) >= needed: break
        if f["id"] not in seen:
            out.append(f)
            seen.add(f["id"])
    return out

def _apply_overtime_penalty(state: Dict[str, Any]) -> Optional[str]:
    """
    After day > MAX_DAYS, do NOT end game. Apply gentle attrition and narrate it.
    Returns a short narration suffix if any penalty was applied.
    """
    overtime = max(0, state["day"] - MAX_DAYS)
    state["overtime_days"] = overtime
    if overtime <= 0:
        return None
    # escalating fatigue: -1 stamina always, -1 hp every 2 overtime days
    hp_pen = -1 if (overtime % 2 == 0) else 0
    _apply_effects(state, {"hp": hp_pen, "stamina": -1, "day_advance": 0})
    note = f"\n\n[Overtime] You’re {overtime} day(s) past your ration window—fatigue gnaws (stamina -1{', hp -1' if hp_pen else ''})."
    return note

# ------------------------------
# Public state
# ------------------------------
def public_state(state: Dict[str, Any]) -> Dict[str, Any]:
    loc = LOCATIONS[state["location"]]
    return {
        "username": state["username"],
        "day": state["day"],
        "hp": state["hp"],
        "stamina": state["stamina"],
        "inventory": list(state["inventory"]),
        "max_hp": MAX_HP,
        "max_stamina": MAX_STAMINA,
        "location": state["location"],
        "biome": loc["biome"],
        "path": list(state["path"]),
        "overtime_days": state.get("overtime_days", 0),
    }

def get_session(sid: str) -> Optional[Dict[str, Any]]:
    return _SESSIONS.get(sid)

# ------------------------------
# Encounter lifecycle
# ------------------------------
async def _roll_encounter(state: Dict[str, Any]) -> Dict[str, Any]:
    loc = LOCATIONS[state["location"]]
    enc = await generate_full_encounter(
        state=state,
        biome=loc["biome"],
        difficulty=loc.get("difficulty", "normal"),
        neighbors=list(loc["neighbors"]),
        mislead_prob=MISLEAD_PROB,
        goal=loc.get("goal"),
    )

    # Build header + breadcrumbs (SAFE: no nested f-strings)
    crumbs = _breadcrumbs(state["path"])
    ot = int(state.get("overtime_days", 0) or 0)
    ot_part = f" (+{ot} OT)" if ot > 0 else ""
    header = f"[Day {state['day']}{ot_part}] [{state['location']} • {loc['biome']}]"
    enc["narration"] = f"{header}\nRoute: {crumbs}\n\n" + enc.get("narration", "")

    # Inject backpack options + explicit move options; ensure width
    tags: List[str] = enc.get("tags", []) or []
    injected = _item_action_options(state, tags) + _neighbor_move_options(state["location"])
    enc["options"] = _ensure_min_options((enc.get("options") or []) + injected, needed=5, location=state["location"])

    # Preview future routes for UI
    enc["future_moves"] = _preview_moves(state["location"])

    # Save hint/tags for companion
    state["last_hint"] = enc.get("hint", {})
    state["last_tags"] = tags
    return enc

# ------------------------------
# Session creation
# ------------------------------
async def new_session(username: str, seed: Optional[str] = None) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
    sid = _sid()
    state: Dict[str, Any] = {
        "session_id": sid,
        "created_at": dt.datetime.utcnow().isoformat() + "Z",
        "username": username,
        "day": 0,
        "hp": MAX_HP,
        "stamina": MAX_STAMINA,
        "inventory": ["field_kit", "bandage", "machete", "rope", "torch_kit", "antivenom_vial"],
        "flags": {},
        "location": START_LOCATION,
        "path": [START_LOCATION],
        "overtime_days": 0,
        "is_over": False,
        "ending": None,
        "last_hint": {},
        "last_tags": [],
        "seed": seed or "",
        "active_encounter": None,
    }
    _SESSIONS[sid] = state

    enc = await _roll_encounter(state)
    state["active_encounter"] = enc
    return sid, state, enc

# ------------------------------
# Apply an action
# ------------------------------
async def apply_action(state: Dict[str, Any], action_id: str) -> Tuple[Dict[str, Any], Optional[str]]:
    if state["is_over"]:
        return state.get("active_encounter") or {}, "game_over"

    enc = state.get("active_encounter") or await _roll_encounter(state)
    opt = next((o for o in enc.get("options", []) if o.get("id") == action_id), None)
    if not opt:
        return enc, "invalid_option"

    _apply_effects(state, opt.get("effects", {}))
    _maybe_move(state, opt.get("move", "stay"))

    # Overtime: do NOT end; apply fatigue and append note to narration next turn
    _apply_overtime_penalty(state)

    # Death still ends
    if state["hp"] <= 0:
        state["is_over"] = True
        state["ending"] = "dead"

    # Rescue at east shore when signaling
    if (not state["is_over"]
        and action_id in ("signal", "light_flare")
        and LOCATIONS[state["location"]].get("goal") == "shipping_lane"):
        state["is_over"] = True
        state["ending"] = "rescued"

    # Next encounter
    if not state["is_over"]:
        enc = await _roll_encounter(state)
        # If overtime applied, reflect it in narration
        if state.get("overtime_days", 0) > 0:
            enc["narration"] += "\n\n[Status] Supplies are thin; each extra day adds wear."
        state["active_encounter"] = enc

    return enc, None
