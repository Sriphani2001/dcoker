from __future__ import annotations
from typing import Dict, Any, List, Optional
import os
import httpx
import json
import random
import time

# ================= Config =================
LLM_BASE = os.getenv("LLM_BASE", "").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
LLM_ENABLED = bool(LLM_BASE and LLM_API_KEY)

# ================ Companion ================
COMPANION_SYSTEM = (
    "You are an onboard survival assistant. Give ONE short sentence of pragmatic advice. "
    "If hazard tags match backpack items, recommend the most relevant item. No emojis, no JSON."
)

async def ai_comment(state: Dict[str, Any], narration: str) -> str:
    tags = state.get("last_tags", [])
    inv  = state.get("inventory", [])
    loc  = state.get("location", "")
    if not LLM_ENABLED:
        if "snake" in tags and "antivenom_vial" in inv:
            return "If bitten, use the antivenom now and immobilize the limb."
        if "thorns" in tags and "machete" in inv:
            return "Cut a narrow lane with the machete rather than forcing through."
        if "dark" in tags and "torch_kit" in inv:
            return "Light a torch before proceeding to avoid costly stumbles."
        if "boat" in tags:
            return "Ready your flare and signal as soon as a wake passes."
        return "Keep pressing east; rest briefly when stamina falls below half."
    try:
        payload = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": COMPANION_SYSTEM},
                {"role": "user", "content":
                 f"WHERE={loc} TAGS={tags} DAY={state['day']} HP={state['hp']} STAMINA={state['stamina']} "
                 f"BACKPACK={inv}\nNARRATION:\n{narration}\nOne concrete, helpful sentence:"},
            ],
            "temperature": 0.4,
            "max_tokens": 60,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{LLM_BASE}/chat/completions",
                                  headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                                  json=payload)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return "Conserve energy and use the right tool—machete for thorns, antivenom for bites, torch for dark, flare at the east shore."

# ============== Encounter gen ==============
ENCOUNTER2_SYSTEM = (
    "You create self-contained survival encounters for a text RPG.\n"
    "Return STRICT JSON ONLY with this schema:\n"
    "{\n"
    '  "title": "short",\n'
    '  "narration": "2–4 vivid sentences describing the situation",\n'
    '  "options": [ {"id":"scout","label":"Scout ahead","effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"stay"} ],\n'
    '  "tags": ["thorns","snake","dark","cliff","reef","boat","none"],\n'
    '  "hint": {"tone":"accurate|vague|misleading","text":"one sentence"}\n'
    "}\n"
    "Rules: effects small (hp +/-0..4, stamina +/-0..4, day_advance 0..1). "
    "Provide 3–4 distinct options. 'move' is 'stay', 'auto', or a specific neighbor id I provide. "
    "No markdown or code fences."
)

def _parse_strict_json(txt: str) -> Dict[str, Any]:
    """Robustly parse JSON even if the model wraps with code fences or extra text."""
    s = txt.strip()
    # Attempt direct parse first
    try:
        return json.loads(s)
    except Exception:
        pass
    # Strip ```json ... ``` fences or any prefix/suffix around the outermost object
    i = s.find("{")
    j = s.rfind("}")
    if i != -1 and j != -1 and j > i:
        return json.loads(s[i:j+1])
    # If still failing, raise the original error
    return json.loads(s)  # will raise with a clear message

async def generate_full_encounter(
    state: Dict[str, Any],
    biome: str,
    difficulty: str,
    neighbors: List[str],
    mislead_prob: float,
    goal: Optional[str] = None,
) -> Dict[str, Any]:
    r = random.random()
    tone = "misleading" if r < mislead_prob else ("vague" if r < mislead_prob + 0.25 else "accurate")

    # ----- Canned (no LLM) -----
    if not LLM_ENABLED:
        lines = {
            "beach":  ("Wind strafes the sand while driftwood rattles; tracks angle east.", ["none"]),
            "reef":   ("Surge sucks at your ankles over serrated coral; fish scatter in flashes.", ["reef"]),
            "cliff":  ("Basalt steps shear away in places; gulls wheel over a sudden drop.", ["cliff"]),
            "jungle": ("Vines and thorn-laced creepers knot the understory; something rustles close.", ["thorns"]),
            "ridge":  ("The ridge opens sightlines but offers little shelter from gusts.", ["none"]),
            "shore":  ("Tide pools glimmer; distant wakes streak the horizon.", ["none"]),
        }
        text, tags = lines.get(biome, ("Terrain ahead is uncertain.", ["none"]))
        if goal == "shipping_lane":
            if "boat" not in tags: tags.append("boat")
        options = [
            {"id":"scout","label":"Scout carefully","effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"stay"},
            {"id":"forage","label":"Forage and patch up","effects":{"hp":+1,"stamina":-1,"day_advance":1},"move":"stay"},
            {"id":"move","label":"Push forward","effects":{"hp":-1,"stamina":-2,"day_advance":1},"move":"auto"},
            {"id":"rest","label":"Short rest","effects":{"hp":0,"stamina":+2,"day_advance":1},"move":"stay"},
        ]
        if goal == "shipping_lane":
            options.insert(0, {"id":"signal","label":"Signal the shipping lane",
                               "effects":{"hp":0,"stamina":-1,"day_advance":0},"move":"stay"})
        hint_text = {
            "accurate":"Higher ground east looks safest today; move when stamina allows.",
            "vague":"Conditions shift; weigh daylight against risk.",
            "misleading":"The cliffs look fastest and safe enough right now.",
        }[tone]
        return {
            "title": f"{biome.title()} encounter",
            "narration": text,
            "options": options,
            "tags": tags,
            "hint": {"tone": tone, "text": hint_text},
        }

    # ----- LLM path -----
    user = (
        f"STATE day={state['day']} hp={state['hp']} stamina={state['stamina']} inv={state['inventory']} "
        f"BIOME={biome} DIFFICULTY={difficulty} NEIGHBORS={neighbors} GOAL={goal or 'none'} HINT_TONE={tone}. "
        "Offer 3–4 distinct options and include appropriate hazard tags."
    )
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role":"system","content":ENCOUNTER2_SYSTEM},
                     {"role":"user","content":user}],
        "temperature": 0.7,
        "max_tokens": 260,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{LLM_BASE}/chat/completions",
                                  headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                                  json=payload)
            r.raise_for_status()
            txt = r.json()["choices"][0]["message"]["content"]
        data = _parse_strict_json(txt)

        # sanitize options
        clean_opts: List[Dict[str, Any]] = []
        for o in data.get("options", []):
            eff = o.get("effects", {}) or {}
            hp = int(eff.get("hp", 0)); st = int(eff.get("stamina", 0)); dy = int(eff.get("day_advance", 0))
            eff["hp"] = max(-4, min(4, hp))
            eff["stamina"] = max(-4, min(4, st))
            eff["day_advance"] = max(0, min(1, dy))
            move = o.get("move", "stay")
            if move not in (["stay","auto"] + neighbors):
                move = "stay"
            clean_opts.append({
                "id": str(o.get("id","act")),
                "label": str(o.get("label","Act")),
                "effects": eff,
                "move": move
            })
        tags = [str(t) for t in (data.get("tags") or [])][:4]
        if goal == "shipping_lane" and "boat" not in tags:
            tags.append("boat")
        if "hint" not in data or "text" not in data["hint"]:
            data["hint"] = {"tone": tone, "text": "Proceed, but conserve stamina and avoid unnecessary climbs."}

        return {
            "title": str(data.get("title", f"{biome.title()} encounter")),
            "narration": str(data.get("narration", "You consider your next move.")),
            "options": clean_opts[:4],
            "tags": tags,
            "hint": data["hint"],
        }
    except Exception:
        # Safe fallback
        return {
            "title": f"{biome.title()} encounter",
            "narration": "Brush closes in and footing turns slick.",
            "options": [
                {"id":"move","label":"Push forward","effects":{"hp":-1,"stamina":-2,"day_advance":1},"move":"auto"},
                {"id":"rest","label":"Short rest","effects":{"hp":0,"stamina":+2,"day_advance":1},"move":"stay"},
            ],
            "tags": ["none"],
            "hint": {"tone":"vague","text":"East still feels right, but watch your footing."},
        }

# ============== Diagnostics (optional) ==============
async def llm_diagnostics() -> Dict[str, Any]:
    if not LLM_ENABLED:
        return {"configured": False, "ok": False, "latency_ms": None,
                "provider_base": LLM_BASE, "model": LLM_MODEL,
                "sample": None, "error": "Missing LLM_BASE or LLM_API_KEY"}
    payload = {"model": LLM_MODEL,
               "messages":[{"role":"system","content":"Reply with the single word: OK"},
                           {"role":"user","content":"Say OK"}],
               "temperature":0.0,"max_tokens":3}
    t0 = time.monotonic()
    sample = None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{LLM_BASE}/chat/completions",
                                  headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                                  json=payload)
            r.raise_for_status()
            j = r.json()
            sample = (j["choices"][0]["message"]["content"] or "").strip()
        return {"configured": True, "ok": sample.upper().startswith("OK"),
                "latency_ms": round((time.monotonic()-t0)*1000,1),
                "provider_base": LLM_BASE, "model": LLM_MODEL,
                "sample": sample, "error": None}
    except Exception as e:
        return {"configured": True, "ok": False, "latency_ms": None,
                "provider_base": LLM_BASE, "model": LLM_MODEL,
                "sample": sample, "error": str(e)}
