"""Allowance presets for the phone console.

Modes are enforced by the worker, not by the model prompt.
"""

from __future__ import annotations

from typing import Literal

ActionMode = Literal["act_and_log", "act_and_notify", "approve_before", "never"]

LOCKED_NEVER = frozenset({"git_push", "edit_outside_lock", "touch_env_or_secrets"})
TOGGLEABLE = frozenset({"git_commit", "delete_files", "install_deps"})
TOGGLE_MODES = frozenset({"approve_before", "act_and_notify"})

ACTION_CLASSES = (
    "read_repo",
    "edit_locked_files",
    "format_lint",
    "run_tests",
    "git_commit",
    "delete_files",
    "install_deps",
    "mark_done",
    "git_push",
    "edit_outside_lock",
    "touch_env_or_secrets",
)

PRESETS: dict[str, dict[str, ActionMode]] = {
    "watch": {
        "read_repo": "act_and_log",
        "edit_locked_files": "approve_before",
        "format_lint": "approve_before",
        "run_tests": "approve_before",
        "git_commit": "approve_before",
        "delete_files": "approve_before",
        "install_deps": "approve_before",
        "mark_done": "approve_before",
        "git_push": "never",
        "edit_outside_lock": "never",
        "touch_env_or_secrets": "never",
    },
    "routine": {
        "read_repo": "act_and_log",
        "edit_locked_files": "act_and_log",
        "format_lint": "act_and_log",
        "run_tests": "act_and_notify",
        "git_commit": "approve_before",
        "delete_files": "approve_before",
        "install_deps": "approve_before",
        "mark_done": "approve_before",
        "git_push": "never",
        "edit_outside_lock": "never",
        "touch_env_or_secrets": "never",
    },
    "open": {
        "read_repo": "act_and_log",
        "edit_locked_files": "act_and_log",
        "format_lint": "act_and_log",
        "run_tests": "act_and_notify",
        "git_commit": "act_and_notify",
        "delete_files": "approve_before",
        "install_deps": "approve_before",
        "mark_done": "approve_before",
        "git_push": "never",
        "edit_outside_lock": "never",
        "touch_env_or_secrets": "never",
    },
}


def preset_rows(name: str) -> dict[str, ActionMode]:
    try:
        return dict(PRESETS[name])
    except KeyError as exc:
        raise ValueError(f"Unknown preset '{name}'") from exc
