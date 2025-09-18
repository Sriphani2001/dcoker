from __future__ import annotations
from typing import Dict, Any
import os
import httpx
import json
import random

# ========== OpenAI-compatible config (Groq/OpenRouter/Together/etc.) ==========
# LLM_BASE = os.getenv("LLM_BASE", "").rstrip("/")
# LLM_API_KEY = os.getenv("LLM_API_KEY", "")
# LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")


# -----------------------------------------------------------------------------
# Companion one-liner (flavor text)
# -----------------------------------------------------------------------------
SYSTEM = (
    "You are an onboard survival assistant. Give one short sentence of pragmatic advice "
    "for the player's current situation. No emojis, no JSON."
)

async def ai_comment(state: Dict[str, Any], narration: str) -> str:
    # graceful fallback if not configured
    if not LLM_ENABLED:
        if state["day"] >= 3:
            return "Conserve energy and keep eastward—shipping lanes intensify by late afternoon."
        return "Scanning terrain: east remains optimal. Avoid unnecessary risks."

    try:
        payload = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"DAY={state['day']} HP={state['hp']} STAMINA={state['stamina']} INV={state['inventory']}\nNARRATION:\n{narration}\nOne helpful sentence."},
            ],
            "temperature": 0.6,
            "max_tokens": 60,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{LLM_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json=payload
            )
            r.raise_for_status()
            j = r.json()
            return j["choices"][0]["message"]["content"].strip()
    except Exception:
        return "If the shore traffic increases to the east, keep moving; keep stamina above half."

# -----------------------------------------------------------------------------
# Turn-level micro-encounters (adds risk & variability)
# -----------------------------------------------------------------------------

ENCOUNTER_SYSTEM = (
    "You are a deterministic survival encounter generator for a text RPG. "
    "Return STRICT JSON only, matching this schema:\n"
    "{\n"
    '  "narration_add": "1–3 sentences: a vivid micro-event that just happened",\n'
    '  "complication": {"hp": int, "stamina": int, "day_advance": int, "add": ["optional item names"]},\n'
    '  "hint": {"tone": "accurate|vague|misleading", "text": "one sentence advice"}\n'
    "}\n"
    "Rules:\n"
    "- Keep numbers small: hp +/-0..4, stamina +/-0..4, day_advance 0..1.\n"
    "- If difficulty is high, prefer negative complications; on low, keep it light.\n"
    "- Narration must NOT repeat the server narration; it's a follow-up event.\n"
    "- Don't kill the player outright; keep it incremental. Never include markdown or code fences."
)
async def generate_encounter(state: Dict[str, Any], node_id: str, difficulty: str, mislead_prob: float) -> Dict[str, Any]:
    """
    Returns dict:
      { narration_add, complication{hp,stamina,day_advance,add[]}, hint{tone,text} }
    Falls back to canned content if LLM missing or fails.
    """
    # Server decides hint tone (keeps us in control)
    r = random.random()
    if r < mislead_prob:
        tone = "misleading"
    elif r < mislead_prob + 0.25:
        tone = "vague"
    else:
        tone = "accurate"

    if not LLM_ENABLED:
        base = {
            "easy":   {"hp": 0, "stamina": -1, "day_advance": 0, "line": "Low scrub slows us a little."},
            "normal": {"hp": -1, "stamina": -1, "day_advance": 0, "line": "Thorns scrape and the grade steepens."},
            "hard":   {"hp": -2, "stamina": -2, "day_advance": 1, "line": "Slippery ground and dense vines cost us daylight."},
        }.get(difficulty, {"hp": -1, "stamina": -1, "day_advance": 0, "line": "Brush closes in; progress is slow."})
        hint_text = {
            "accurate":   "East looks viable if we skirt the dense growth.",
            "vague":      "Terrain varies ahead; choose carefully.",
            "misleading": "The cliffs might be fastest; they look safe enough.",
        }[tone]
        return {
            "narration_add": base["line"],
            "complication": {"hp": base["hp"], "stamina": base["stamina"], "day_advance": base["day_advance"], "add": []},
            "hint": {"tone": tone, "text": hint_text},
        }

    try:
        user = (
            f"STATE: day={state['day']} hp={state['hp']} stamina={state['stamina']} inventory={state['inventory']}. "
            f"NODE_ID={node_id}. DIFFICULTY={difficulty}. HINT_TONE={tone}.\n"
            "Return strict JSON only. Keep numbers small; don't end the game."
        )
        payload = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": ENCOUNTER_SYSTEM},
                {"role": "user", "content": user},
            ],
            "temperature": 0.7,
            "max_tokens": 140,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{LLM_BASE}/chat/completions",
                                  headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                                  json=payload)
            r.raise_for_status()
            txt = r.json()["choices"][0]["message"]["content"]
        try:
            data = json.loads(txt)
        except Exception:
            data = json.loads(txt.strip().removeprefix("```json").removesuffix("```").strip())

        # Guardrails on numbers
        comp = data.get("complication", {})
        comp["hp"] = int(max(-4, min(4, comp.get("hp", 0))))
        comp["stamina"] = int(max(-4, min(4, comp.get("stamina", 0))))
        comp["day_advance"] = int(max(0, min(1, comp.get("day_advance", 0))))
        comp["add"] = [str(x) for x in (comp.get("add") or [])][:3]
        data["complication"] = comp

        if "hint" not in data or "text" not in data["hint"]:
            data["hint"] = {"tone": tone, "text": "Proceed, but watch footing and conserve stamina."}
        return data
    except Exception:
        return {
            "narration_add": "Brush closes in and footing turns slick.",
            "complication": {"hp": -1, "stamina": -1, "day_advance": 0, "add": []},
            "hint": {"tone": "vague", "text": "I can’t be sure—east still feels right."},
        }
