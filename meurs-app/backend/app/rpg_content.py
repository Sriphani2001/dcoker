# rpg_content.py
from __future__ import annotations
from .rpg_graph import GameMap, Node, Option

MAP = GameMap(10, 10)

# Beach (start)
MAP.add(Node(
    id="start_west_coast",
    xy=(1, 8),
    description=(
        "Salt on your lips. Your research skiff is a carcass on the rocks of the west coast. "
        "Your AI companion boots in your earpiece, mapping faintly. If you can reach the east shore, "
        "shipping lanes might spot your flare — you can hold four days at best.\n\n"
        "Three ways present themselves from the beach edge."
    ),
    effects={"hp": 0, "stamina": -1, "day_advance": 0},
    difficulty="easy",
    first_visit_items=[],
    options_first=[
        Option(id="left_cliffs",  label="Clamber left along the cliffs", to="cliff_scrape", dangerous=True),
        Option(id="right_reef",   label="Wade right over the reef",      to="reef_sting",   dangerous=True),
        Option(id="into_jungle",  label="Push into the jungle",           to="jungle_track"),
    ],
    options_revisit=[
        Option(id="into_jungle",  label="Push into the jungle",           to="jungle_track"),
    ]
))

# Cliff branch (dead end)
MAP.add(Node(
    id="cliff_scrape",
    xy=(0, 8),
    description="Jagged basalt. A slip. You catch yourself, but the traverse narrows to a wet, risky ledge.",
    effects={"hp": -2, "stamina": -1, "day_advance": 1},
    difficulty="hard",
    options_first=[
        Option(id="press_on",      label="Press on along the ledge", to="cliff_fall", dangerous=True),
        Option(id="retreat_beach", label="Retreat to the beach",     to="start_west_coast"),
    ],
    options_revisit=[
        Option(id="retreat_beach", label="Retreat to the beach",     to="start_west_coast"),
    ]
))

MAP.add(Node(
    id="cliff_fall",
    xy=(0, 9),
    description="Your handhold peels away. The ocean rises coldly. When you wake, you’re back on the sand — ribs screaming.",
    effects={"hp": -6, "stamina": -2, "day_advance": 1},
    difficulty="hard",
    ending="dead",
))

# Reef branch (dead end)
MAP.add(Node(
    id="reef_sting",
    xy=(2, 9),
    description="Sea urchins bloom like mines. A sting needles your heel; the reef runs long.",
    effects={"hp": -3, "stamina": -2, "day_advance": 1},
    difficulty="hard",
    options_first=[
        Option(id="push_through",   label="Push through the reef", to="reef_infected", dangerous=True),
        Option(id="retreat_beach2", label="Retreat to the beach",  to="start_west_coast"),
    ],
    options_revisit=[
        Option(id="retreat_beach2", label="Retreat to the beach",  to="start_west_coast"),
    ]
))

MAP.add(Node(
    id="reef_infected",
    xy=(3, 9),
    description="By dusk, fever skitters under your skin. The surf hisses. You do not rise.",
    effects={"hp": -10, "stamina": -4, "day_advance": 1},
    difficulty="hard",
    ending="dead",
))

# Correct route
MAP.add(Node(
    id="jungle_track",
    xy=(3, 7),
    description=(
        "The jungle folds around you. Your AI pings a faint river heading east. "
        "A fork ahead: a darker tunnel under strangler figs, or a brighter trail skirting ferns."
    ),
    effects={"hp": 0, "stamina": -1, "day_advance": 1, "flag": {"companion_online": True}},
    difficulty="normal",
    first_visit_items=["stick"],
    options_first=[
        Option(id="dark_tunnel",  label="Take the dark tunnel",              to="snake_bite",   dangerous=True),
        Option(id="bright_trail", label="Follow the brighter trail east",    to="ridge_ascent"),
    ],
    options_revisit=[
        Option(id="bright_trail", label="Follow the brighter trail east",    to="ridge_ascent"),
    ]
))

MAP.add(Node(
    id="snake_bite",
    xy=(2, 6),
    description="A vine twitches — no, a snake. Pain like lightning. The world narrows.",
    effects={"hp": -8, "stamina": -2, "day_advance": 1},
    difficulty="hard",
    ending="dead",
))

MAP.add(Node(
    id="ridge_ascent",
    xy=(5, 6),
    description="You gain the ridge. Wind clears your head. To the east: glittering water and a line of wake trails.",
    effects={"hp": 0, "stamina": -2, "day_advance": 1},
    difficulty="normal",
    options_first=[
        Option(id="descend_north", label="Descend north through thorns", to="thorn_bleed", dangerous=True),
        Option(id="descend_east",  label="Descend east toward the shore", to="east_shore"),
    ],
    options_revisit=[
        Option(id="descend_east",  label="Descend east toward the shore", to="east_shore"),
    ]
))

MAP.add(Node(
    id="thorn_bleed",
    xy=(5, 5),
    description="Thorns rake your shins. The slope drinks your strength; you circle back, late and lightheaded.",
    effects={"hp": -3, "stamina": -2, "day_advance": 1},
    difficulty="hard",
    options_first=[
        Option(id="recover_ridge", label="Back to the ridge", to="ridge_ascent"),
    ],
    options_revisit=[
        Option(id="recover_ridge", label="Back to the ridge", to="ridge_ascent"),
    ]
))

MAP.add(Node(
    id="east_shore",
    xy=(8, 6),
    description=(
        "White sand. Driftwood. Your AI overlays shipping vectors — you’re on the lane. "
        "You lash a flare from magnesium scrap and dry resin."
    ),
    effects={"hp": 0, "stamina": -1, "day_advance": 1, "add": ["improvised_flare"]},
    difficulty="easy",
    first_visit_items=[],
    options_first=[
        Option(id="wait_signal", label="Wait and signal the next wake", to="rescue"),
        Option(id="sleep",       label="Rest first to recover",         to="timeout"),
    ],
    options_revisit=[
        Option(id="wait_signal", label="Wait and signal the next wake", to="rescue"),
        Option(id="sleep",       label="Rest first to recover",         to="timeout"),
    ]
))

MAP.add(Node(
    id="timeout",
    xy=(8, 7),
    description="Sleep runs long. Wake trails fade. By the time you blink awake, no boats cross today.",
    effects={"hp": 0, "stamina": +2, "day_advance": 1},
    difficulty="normal",
    options_first=[
        Option(id="try_again", label="Try to signal tomorrow", to="rescue"),
    ],
    options_revisit=[
        Option(id="try_again", label="Try to signal tomorrow", to="rescue"),
    ]
))

MAP.add(Node(
    id="rescue",
    xy=(9, 6),
    description="A horn, distant. A hull shoulders toward shore. You raise the flare. Smoke flowers. Hands haul you aboard.",
    effects={"hp": +2, "stamina": -1, "day_advance": 0},
    difficulty="easy",
    ending="rescued",
))
