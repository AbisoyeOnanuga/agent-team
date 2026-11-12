"""Free vs Scale plan, privacy mode, BYOK cloud hub, and cost-aware capacity."""

from __future__ import annotations

from typing import Any

# One cloud hub for Scale. OpenRouter consolidates many models under one key.
SCALE_PROVIDERS: dict[str, dict[str, str]] = {
    "openrouter": {
        "label": "OpenRouter",
        "why": "One bill, many models. Best when you grow lanes.",
        "key_env": "OPENROUTER_API_KEY",
        "site": "https://openrouter.ai/keys",
        "cost_index": 1.0,
    },
    "openai": {
        "label": "OpenAI",
        "why": "Solid everyday coding if you already pay here.",
        "key_env": "OPENAI_API_KEY",
        "site": "https://platform.openai.com/api-keys",
        "cost_index": 1.4,
    },
    "anthropic": {
        "label": "Anthropic",
        "why": "Careful edits and long context. Higher per job.",
        "key_env": "ANTHROPIC_API_KEY",
        "site": "https://console.anthropic.com/",
        "cost_index": 1.6,
    },
    "gemini": {
        "label": "Google Gemini",
        "why": "Cheap for many small parallel jobs.",
        "key_env": "GEMINI_API_KEY",
        "site": "https://aistudio.google.com/app/apikey",
        "cost_index": 0.7,
    },
    "mistral": {
        "label": "Mistral",
        "why": "Codestral for code. Often mid-priced.",
        "key_env": "MISTRAL_API_KEY",
        "site": "https://console.mistral.ai/api-keys",
        "cost_index": 0.9,
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "why": "Hosted GPU models if you already use NVIDIA.",
        "key_env": "NVIDIA_API_KEY",
        "site": "https://build.nvidia.com/",
        "cost_index": 1.1,
    },
}

PRIVACY_MODES = {
    "local_first": "Private files prefer your PC. Cloud only fills in when Scale is on.",
    "balanced": "Your chosen brain goes first. Local and cloud share the work.",
    "cloud_ok": "Cloud goes first for speed. Still keep secrets out of locked files.",
}

# Pro-dev practice: 3–4 parallel is common; large projects partition work across more.
FREE_SLOTS = 2
TEAM_SLOTS = 6
SWARM_SLOTS = 12
PROJECT_SLOTS = 24
SCALE_SLOT_MAX = PROJECT_SLOTS

# Relative spend vs Free (2 lanes). More lanes = more spend; cheap hubs lower cost/teammate.
BANDS: list[dict[str, Any]] = [
    {
        "id": "team",
        "label": "Team",
        "slots": TEAM_SLOTS,
        "fit": "Day-to-day. About as wide as Free, with room to burst.",
    },
    {
        "id": "swarm",
        "label": "Swarm",
        "slots": SWARM_SLOTS,
        "fit": "Big feature. Split folders so jobs do not collide.",
    },
    {
        "id": "project",
        "label": "Project",
        "slots": PROJECT_SLOTS,
        "fit": "Large push. Best when work is already split across folders.",
    },
]


def catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": key,
            "label": meta["label"],
            "why": meta["why"],
            "site": meta["site"],
            "cost_index": meta["cost_index"],
        }
        for key, meta in SCALE_PROVIDERS.items()
    ]


def band_for(slots: int) -> dict[str, Any]:
    for band in BANDS:
        if slots <= band["slots"]:
            return band
    return BANDS[-1]


def cost_blurb(slots: int, cloud: str, privacy: str) -> str:
    """Rough relative spend vs Free (2 lanes). Not a price quote."""
    meta = SCALE_PROVIDERS.get(cloud) or SCALE_PROVIDERS["openrouter"]
    index = float(meta["cost_index"])
    local_cut = 0.65 if privacy == "local_first" else (0.85 if privacy == "balanced" else 1.0)
    relative = (slots / FREE_SLOTS) * index * local_cut
    per = relative / max(slots, 1)
    free_per = 1.0 / FREE_SLOTS
    if relative <= 1.2:
        spend = "near Free spend"
    elif relative <= 3:
        spend = f"about {relative:.1f}× Free spend"
    else:
        spend = f"about {relative:.0f}× Free spend"
    better = per < free_per * 0.95
    tip = (
        "Cost per open job can beat Free when the hub is cheap and work is split."
        if better
        else "Keep lanes near the work that is ready; idle lanes still burn quota."
    )
    return f"{spend}. {tip}"
