"""Free vs Scale: team size, parallel jobs, BYOK hubs, cost hints."""

from __future__ import annotations

from typing import Any

# High-concurrency hubs first. One account scales many simultaneous jobs.
SCALE_PROVIDERS: dict[str, dict[str, str | float]] = {
    "openrouter": {
        "label": "OpenRouter",
        "why": "One key, many models, strong concurrency for large swarms.",
        "key_env": "OPENROUTER_API_KEY",
        "site": "https://openrouter.ai/keys",
        "cost_index": 1.0,
        "throughput": "high",
    },
    "together": {
        "label": "Together AI",
        "why": "Built for high-throughput inference. Good when many jobs run at once.",
        "key_env": "TOGETHER_API_KEY",
        "site": "https://api.together.xyz/settings/api-keys",
        "cost_index": 0.85,
        "throughput": "high",
    },
    "fireworks": {
        "label": "Fireworks",
        "why": "Fast hosted open models. Strong for bursty parallel work.",
        "key_env": "FIREWORKS_API_KEY",
        "site": "https://fireworks.ai/account/api-keys",
        "cost_index": 0.9,
        "throughput": "high",
    },
    "gemini": {
        "label": "Google Gemini",
        "why": "Cheap for many small parallel jobs.",
        "key_env": "GEMINI_API_KEY",
        "site": "https://aistudio.google.com/app/apikey",
        "cost_index": 0.7,
        "throughput": "high",
    },
    "openai": {
        "label": "OpenAI",
        "why": "Solid coding. Watch rate limits when jobs go wide.",
        "key_env": "OPENAI_API_KEY",
        "site": "https://platform.openai.com/api-keys",
        "cost_index": 1.4,
        "throughput": "medium",
    },
    "anthropic": {
        "label": "Anthropic",
        "why": "Careful edits. Better for fewer deep jobs than huge swarms.",
        "key_env": "ANTHROPIC_API_KEY",
        "site": "https://console.anthropic.com/",
        "cost_index": 1.6,
        "throughput": "medium",
    },
    "mistral": {
        "label": "Mistral",
        "why": "Codestral for code. Mid price, solid concurrency.",
        "key_env": "MISTRAL_API_KEY",
        "site": "https://console.mistral.ai/api-keys",
        "cost_index": 0.9,
        "throughput": "high",
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "why": "Hosted GPU models if you already use NVIDIA.",
        "key_env": "NVIDIA_API_KEY",
        "site": "https://build.nvidia.com/",
        "cost_index": 1.1,
        "throughput": "high",
    },
}

PRIVACY_MODES = {
    "local_first": "Private folders prefer your PC. Cloud teammates only see what you lock for them.",
    "balanced": "Local and cloud share work. Shared notes stay in the project, not with the vendor.",
    "cloud_ok": "Cloud goes first for speed. Secrets still never leave locked files.",
}

# Bump when limits change so the phone can detect a stale hub process.
SCALE_API_REV = 3

FREE_TEAM = 3
TEAM_MAX = 12  # core 3 + up to 9 parallel factory mates
FREE_SLOTS = 2
SCALE_SLOT_MAX = 24

# Optimal gain band: ~2 jobs per teammate with split folders.
# Above ~3 jobs/teammate returns little but burns quota.
BANDS: list[dict[str, Any]] = [
    {
        "id": "team",
        "label": "Team",
        "team": 3,
        "slots": 6,
        "fit": "Core three. About 2 jobs each when two areas move at once.",
    },
    {
        "id": "swarm",
        "label": "Swarm",
        "team": 6,
        "slots": 12,
        "fit": "Side-by-side mates. Split folders; keep privacy on.",
    },
    {
        "id": "project",
        "label": "Project",
        "team": 9,
        "slots": 18,
        "fit": "Large feature factory. Needs a high-throughput hub.",
    },
    {
        "id": "factory",
        "label": "Factory",
        "team": 12,
        "slots": 24,
        "fit": "Pro-dev width. Past this, extra jobs rarely beat better folder splits.",
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
            "throughput": meta["throughput"],
        }
        for key, meta in SCALE_PROVIDERS.items()
    ]


def band_for(team: int, slots: int) -> dict[str, Any]:
    score = lambda b: abs(b["team"] - team) + abs(b["slots"] - slots) * 0.25
    return min(BANDS, key=score)


def jobs_per_teammate(team: int, slots: int) -> float:
    return slots / max(team, 1)


def shape_hint(team: int, slots: int) -> str:
    ratio = jobs_per_teammate(team, slots)
    if slots < team:
        return "Jobs below teammate count — some cores stay dark."
    if ratio <= 2.2:
        return "Healthy load: about 1–2 jobs per teammate."
    if ratio <= 3.0:
        return "Wide rack. Gains need split folders and a high-throughput hub."
    return "Jobs far above teammates — mostly queue depth and spend unless work is already split."


def scale_warnings(
    plan: str,
    team: int,
    slots: int,
    missing_folders: list[str],
) -> list[str]:
    notes: list[str] = []
    if plan != "scale" and (team > FREE_TEAM or slots > FREE_SLOTS):
        notes.append("Scale shape is saved, but Free is on — turn on Scale to use it.")
    if missing_folders:
        names = ", ".join(missing_folders[:4])
        more = "…" if len(missing_folders) > 4 else ""
        notes.append(f"Folder missing for {names}{more}. Assign folders before they can work.")
    if plan == "scale" and slots > team * 3:
        notes.append("Many more jobs than teammates — add teammates or lower jobs for better cost.")
    if plan == "scale" and team > FREE_TEAM and slots < team:
        notes.append("More teammates than jobs — raise jobs or lower team size.")
    return notes


def cost_blurb(team: int, slots: int, cloud: str, privacy: str) -> str:
    meta = SCALE_PROVIDERS.get(cloud) or SCALE_PROVIDERS["openrouter"]
    index = float(meta["cost_index"])
    local_cut = 0.65 if privacy == "local_first" else (0.85 if privacy == "balanced" else 1.0)
    relative = (slots / FREE_SLOTS) * index * local_cut
    per_job = relative / max(slots, 1)
    free_per = 1.0 / FREE_SLOTS
    if relative <= 1.2:
        spend = "near Free spend"
    elif relative <= 3:
        spend = f"about {relative:.1f}× Free spend"
    else:
        spend = f"about {relative:.0f}× Free spend"
    mates = f"{team} teammates"
    tip = (
        "Cost per open job can beat Free on a cheap high-throughput hub."
        if per_job < free_per * 0.95 and meta["throughput"] == "high"
        else "More teammates help only when folders are split; idle jobs still burn quota."
    )
    return f"{mates}, {slots} jobs at once · {spend}. {tip}"


def swarm_extra(index: int) -> dict[str, str]:
    return {
        "agent_id": f"agent-swarm-{index}",
        "name": f"Swarm {index}",
        "role": "Parallel",
    }
