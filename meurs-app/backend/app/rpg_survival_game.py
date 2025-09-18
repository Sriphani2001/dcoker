from __future__ import annotations
from typing import Dict, Any, Tuple, Optional
import uuid
import datetime as dt

from .rpg_llm import generate_encounter  # NEW

# in-memory sessions (swap to DB/Redis later if needed)
_SESSIONS: Dict[str, Dict[str, Any]] = {}

def _sid() -> str:
    return uuid.uuid4().hex

# tuning knobs for encounters
MISLEAD_PROB = 0.35          # 35% misleading hints
ENCOUNTERS_ENABLED = True    # quick kill switch

# --- STORY GRAPH ---
# single “correct” path: beach -> jungle -> ridge -> east_shore -> rescue
STORY: Dict[str, Dict[str, Any]] = {
    "start_west_coast": {
        "narration": (
            "Salt on your lips. Your research skiff is a carcass on the rocks of the west coast. "
            "Your AI companion boots in your earpiece, mapping faintly. If you can reach the east shore, "
            "shipping lanes might spot your flare — you can hold four days at best.\n\n"
            "Three ways present themselves from the beach edge."
        ),
        "effects": {"hp": 0, "stamina": -1, "day_advance": 0},
        "difficulty": "easy",  # NEW
        "options": [
            {"id": "left_cliffs", "label": "Clamber left along the cliffs", "to": "cliff_scrape"},
            {"id": "right_reef", "label": "Wade right over the reef", "to": "reef_sting"},
            {"id": "into_jungle", "label": "Push into the jungle", "to": "jungle_track"},
        ],
    },

    # Dead end 1
    "cliff_scrape": {
        "narration": "Jagged basalt. A slip. You catch yourself, but the traverse narrows to a wet, risky ledge.",
        "effects": {"hp": -2, "stamina": -1, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [
            {"id": "press_on", "label": "Press on along the ledge", "to": "cliff_fall"},
            {"id": "retreat_beach", "label": "Retreat to the beach", "to": "start_west_coast"},
        ],
    },
    "cliff_fall": {
        "narration": "Your handhold peels away. The ocean rises coldly. When you wake, you’re back on the sand — ribs screaming.",
        "effects": {"hp": -6, "stamina": -2, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [],
        "ending": "dead",
    },

    # Dead end 2
    "reef_sting": {
        "narration": "Sea urchins bloom like mines. A sting needles your heel; the reef runs long.",
        "effects": {"hp": -3, "stamina": -2, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [
            {"id": "push_through", "label": "Push through the reef", "to": "reef_infected"},
            {"id": "retreat_beach2", "label": "Retreat to the beach", "to": "start_west_coast"},
        ],
    },
    "reef_infected": {
        "narration": "By dusk, fever skitters under your skin. The surf hisses. You do not rise.",
        "effects": {"hp": -10, "stamina": -4, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [],
        "ending": "dead",
    },

    # Correct route
    "jungle_track": {
        "narration": (
            "The jungle folds around you. Your AI pings a faint river heading east. "
            "A fork ahead: a darker tunnel under strangler figs, or a brighter trail skirting ferns."
        ),
        "effects": {"hp": 0, "stamina": -1, "day_advance": 1, "add": ["stick"], "flag": {"companion_online": True}},
        "difficulty": "normal",  # NEW
        "options": [
            {"id": "dark_tunnel", "label": "Take the dark tunnel", "to": "snake_bite"},
            {"id": "bright_trail", "label": "Follow the brighter trail east", "to": "ridge_ascent"},
        ],
    },
    "snake_bite": {
        "narration": "A vine twitches — no, a snake. Pain like lightning. The world narrows.",
        "effects": {"hp": -8, "stamina": -2, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [],
        "ending": "dead",
    },
    "ridge_ascent": {
        "narration": "You gain the ridge. Wind clears your head. To the east: glittering water and a line of wake trails.",
        "effects": {"hp": 0, "stamina": -2, "day_advance": 1},
        "difficulty": "normal",  # NEW
        "options": [
            {"id": "descend_north", "label": "Descend north through thorns", "to": "thorn_bleed"},
            {"id": "descend_east", "label": "Descend east toward the shore", "to": "east_shore"},
        ],
    },
    "thorn_bleed": {
        "narration": "Thorns rake your shins. The slope drinks your strength; you circle back, late and lightheaded.",
        "effects": {"hp": -3, "stamina": -2, "day_advance": 1},
        "difficulty": "hard",  # NEW
        "options": [
            {"id": "recover_ridge", "label": "Back to the ridge", "to": "ridge_ascent"},
        ],
    },
    "east_shore": {
        "narration": (
            "White sand. Driftwood. Your AI overlays shipping vectors — you’re on the lane. "
            "You lash a flare from magnesium scrap and dry resin."
        ),
        "effects": {"hp": 0, "stamina": -1, "day_advance": 1, "add": ["improvised_flare"]},
        "difficulty": "easy",  # NEW
        "options": [
            {"id": "wait_signal", "label": "Wait and signal the next wake", "to": "rescue"},
            {"id": "sleep", "label": "Rest first to recover", "to": "timeout"},
        ],
    },
    "timeout": {
        "narration": "Sleep runs long. Wake trails fade. By the time you blink awake, no boats cross today.",
        "effects": {"hp": 0, "stamina": +2, "day_advance": 1},
        "difficulty": "normal",  # NEW
        "options": [
            {"id": "try_again", "label": "Try to signal tomorrow", "to": "rescue"},
        ],
    },
    "rescue": {
        "narration": "A horn, distant. A hull shoulders toward shore. You raise the flare. Smoke flowers. Hands haul you aboard.",
        "effects": {"hp": +2, "stamina": -1, "day_advance": 0},
        "difficulty": "easy",  # NEW
        "options": [],
        "ending": "rescued",
    },
}

START_NODE = "start_west_coast"
MAX_DAYS = 4
MAX_HP = 10
MAX_STAMINA = 10

def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))

def new_session(username: str, seed: Optional[str] = None) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
    sid = _sid()
    state = {
        "session_id": sid,
        "created_at": dt.datetime.utcnow().isoformat() + "Z",
        "username": username,
        "day": 0,
        "hp": MAX_HP,
        "stamina": MAX_STAMINA,
        "inventory": ["field_kit"],
        "flags": {},
        "node_id": START_NODE,
        "is_over": False,
        "ending": None,
        "last_hint": {},             # NEW: last encounter hint
        "story": {"nodes": STORY},   # keep for quick node access
        "seed": seed or "",
    }
    _apply_effects(state, STORY[START_NODE].get("effects", {}))
    _SESSIONS[sid] = state
    return sid, state, STORY[START_NODE]

def get_session(sid: str) -> Optional[Dict[str, Any]]:
    return _SESSIONS.get(sid)

def public_state(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "username": state["username"],
        "day": state["day"],
        "hp": state["hp"],
        "stamina": state["stamina"],
        "inventory": list(state["inventory"]),
        "max_hp": MAX_HP,
        "max_stamina": MAX_STAMINA,
    }

async def _run_encounter_and_merge(state: Dict[str, Any], node_id: str) -> str:
    """Calls LLM for a micro-encounter and applies small effects. Returns added narration text."""
    if not ENCOUNTERS_ENABLED:
        return ""
    diff = STORY[node_id].get("difficulty", "normal")
    data = await generate_encounter(state, node_id, diff, MISLEAD_PROB)
    comp = data.get("complication", {})
    # apply tiny deltas (bounded inside generate_encounter)
    state["hp"] = _clamp(state["hp"] + int(comp.get("hp", 0)), 0, MAX_HP)
    state["stamina"] = _clamp(state["stamina"] + int(comp.get("stamina", 0)), 0, MAX_STAMINA)
    state["day"] += int(comp.get("day_advance", 0))
    for it in comp.get("add") or []:
        if it not in state["inventory"]:
            state["inventory"].append(it)
    state["last_hint"] = data.get("hint", {})
    return data.get("narration_add", "")

async def apply_choice(state: Dict[str, Any], option_id: str) -> Tuple[Optional[Dict[str, Any]], str, Optional[str]]:
    if state["is_over"]:
        return None, "Game already ended.", "game_over"

    node = STORY[state["node_id"]]
    opt = next((o for o in node["options"] if o["id"] == option_id), None)
    if not opt:
        return node, "", "invalid_option"

    next_id = opt["to"]
    next_node = STORY[next_id]
    state["node_id"] = next_id

    _apply_effects(state, next_node.get("effects", {}))

    # LLM encounter (adds danger & flavor)
    enc_text = await _run_encounter_and_merge(state, next_id)
    narration = next_node["narration"] + ("\n\n" + enc_text if enc_text else "")

    # time/health checks
    if state["day"] > MAX_DAYS:
        state["is_over"] = True
        state["ending"] = "timeout"
    if state["hp"] <= 0:
        state["is_over"] = True
        state["ending"] = "dead"

    if "ending" in next_node:
        state["is_over"] = True
        state["ending"] = next_node["ending"]

    return next_node, narration, None

def _apply_effects(state: Dict[str, Any], effects: Dict[str, Any]):
    if not effects:
        return
    state["hp"] = _clamp(state["hp"] + effects.get("hp", 0), 0, MAX_HP)
    state["stamina"] = _clamp(state["stamina"] + effects.get("stamina", 0), 0, MAX_STAMINA)
    state["day"] += effects.get("day_advance", 0)
    for item in effects.get("add", []) or []:
        if item not in state["inventory"]:
            state["inventory"].append(item)
    flags = effects.get("flag", {}) or {}
    for k, v in flags.items():
        state["flags"][k] = v
