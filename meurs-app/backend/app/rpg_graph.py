# rpg_graph.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional

@dataclass
class Option:
    id: str
    label: str
    to: str
    requires: List[str] = field(default_factory=list)  # inventory needed for safe traversal
    dangerous: bool = False                            # if True and missing reqs -> death

    def to_public(self) -> Dict:
        return {
            "id": self.id,
            "label": self.label,
            "to": self.to,
            "requires": list(self.requires),
            "dangerous": self.dangerous,
        }

@dataclass
class Node:
    id: str
    xy: Tuple[int, int]                                 # position on grid (0..9, 0..9)
    description: str
    effects: Dict = field(default_factory=dict)         # base enter effects (hp, stamina, day_advance, add[], flag{})
    difficulty: str = "normal"
    first_visit_items: List[str] = field(default_factory=list)
    options_first: List[Option] = field(default_factory=list)
    options_revisit: List[Option] = field(default_factory=list)
    ending: Optional[str] = None                        # "dead" | "rescued" | "timeout" | None

    def on_enter(self, state: Dict) -> Dict[str, str]:
        """
        Applies base effects and first-visit loot; increments visit count.
        Returns {"visit_note": "..."} for UI messaging on revisits.
        """
        visits = state["visit_counts"].get(self.id, 0)
        state["visit_counts"][self.id] = visits + 1

        from .rpg_survival_game import _apply_effects  # reuse util
        _apply_effects(state, self.effects)

        # first-visit loot only
        if visits == 0:
            for it in (self.first_visit_items or []):
                if it not in state["inventory"]:
                    state["inventory"].append(it)

        note = ""
        if visits >= 1:
            if self.first_visit_items:
                note = "Nothing more to take here. "
            note += "You've been here already."
        return {"visit_note": note}

    def available_options(self, state: Dict) -> List[Option]:
        visits = state["visit_counts"].get(self.id, 0)
        opts = self.options_first if visits == 0 else (self.options_revisit or self.options_first)
        return opts

class GameMap:
    def __init__(self, cols: int = 10, rows: int = 10):
        self.cols, self.rows = cols, rows
        self.nodes: Dict[str, Node] = {}
        self.by_xy: Dict[Tuple[int, int], str] = {}

    def add(self, node: Node):
        self.nodes[node.id] = node
        self.by_xy[node.xy] = node.id

    def get(self, node_id: str) -> Node:
        return self.nodes[node_id]
