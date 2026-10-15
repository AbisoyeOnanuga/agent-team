"""Run one coding task at a time, and stop before consequential actions."""

from __future__ import annotations

import os
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from central_hub.mcp_server import server as store
from teammate_client.aider_runner import aider_available, run_message

DEFAULT_FILE = ".hackswarm/notes.md"


def worker_loop(stop: Optional[threading.Event] = None) -> None:
    while stop is None or not stop.is_set():
        try:
            process_available()
        except Exception as exc:
            store.record_event(f"Worker error: {exc}", kind="error")
        if stop is not None and stop.wait(1.2):
            return
        if stop is None:
            time.sleep(1.2)


def process_available() -> None:
    task = store.next_todo()
    if not task:
        return
    agent_id = task["assigned_agent"] or ""
    project = store.get_project(agent_id)
    repo_raw = task.get("repo_path") or (project or {}).get("repo_path")
    if not repo_raw or not Path(repo_raw).is_dir():
        store.record_event_once(
            f"{agent_id} has no project folder. The task stays queued.",
            kind="error",
            agent_id=agent_id,
            task_id=task["id"],
        )
        store.touch_agent(agent_id, "idle", None)
        return

    repo = Path(repo_raw).resolve()
    files = task["requested_files"] or [DEFAULT_FILE]
    for rel in files:
        if store.is_secret_path(rel) or store.resolve_inside(repo, rel) is None:
            store.record_event(
                f"Refused '{rel}'. Secret files and paths outside the repo stay at the desk.",
                kind="error",
                agent_id=agent_id,
                task_id=task["id"],
            )
            store.release_task(task["id"], "FAILED")
            return

    name = project["name"] if project else agent_id
    claimed = store.claim_task(task["id"], agent_id, name, files)
    if not claimed.get("success"):
        store.record_event_once(
            claimed.get("error", "Could not claim the task"),
            kind="error",
            agent_id=agent_id,
            task_id=task["id"],
        )
        return

    store.touch_agent(agent_id, "aider", task["id"])
    store.record_event(
        f"Claimed {', '.join(files)}",
        kind="log",
        agent_id=agent_id,
        task_id=task["id"],
    )
    try:
        _run_steps(task, repo, files, agent_id)
    except Exception as exc:
        store.record_event(
            f"Step failed: {exc}",
            kind="error",
            agent_id=agent_id,
            task_id=task["id"],
        )
        store.release_task(task["id"], "FAILED")
        store.touch_agent(agent_id, "idle", None)


def _run_steps(task: dict, repo: Path, files: list[str], agent_id: str) -> None:
    task_id = task["id"]
    prompt = task.get("prompt") or task.get("title") or ""

    if _gate(
        task_id,
        agent_id,
        "read_repo",
        "Read the project folder",
        "The agent needs the file list before editing.",
        "Reads names inside the bound folder only.",
        "The task waits until you allow the read.",
    ) == "stop":
        return
    names = _list_repo(repo)
    store.record_event(
        f"Read {len(names)} paths in {repo.name}",
        kind="log",
        agent_id=agent_id,
        task_id=task_id,
    )

    if _wants_install(prompt):
        outcome = _gate(
            task_id,
            agent_id,
            "install_deps",
            "Install dependencies from the lockfile",
            "The task asked for an install.",
            "Runs npm install or pip install -r requirements.txt inside the project. Nothing is pushed.",
            "Skip the install and continue with the files already there.",
            diff_stat=_lockfile_note(repo),
        )
        if outcome == "stop":
            return
        if outcome == "run":
            _install(repo, agent_id, task_id)

    if _wants_delete(prompt):
        outcome = _gate(
            task_id,
            agent_id,
            "delete_files",
            "Delete the locked files",
            "The task asked for a delete.",
            "Removes only " + ", ".join(files) + ". This is hard to undo if they were never committed.",
            "Leave the files in place.",
        )
        if outcome == "stop":
            return
        if outcome == "run":
            _delete_locked(repo, files, agent_id, task_id)

    while True:
        outcome = _gate(
            task_id,
            agent_id,
            "edit_locked_files",
            "Edit the locked files",
            "The task is ready to write inside the lock.",
            "Changes stay inside " + ", ".join(files) + ". No commit yet.",
            "Skip the edit.",
        )
        if outcome == "stop":
            return
        if outcome == "revise":
            continue
        if outcome == "run":
            _edit(task, repo, files, agent_id)
        break

    for action, summary in (
        ("format_lint", "Record a format check"),
        ("run_tests", "Record the test step"),
    ):
        outcome = _gate(
            task_id,
            agent_id,
            action,
            summary,
            "Routine checks run after the edit.",
            "Logs the step. A test folder is executed only when one is already in the project.",
            "Skip this check.",
        )
        if outcome == "stop":
            return
        if outcome == "run":
            if action == "format_lint":
                store.record_event(
                    "Format check recorded. No formatter was launched.",
                    kind="log",
                    agent_id=agent_id,
                    task_id=task_id,
                )
            else:
                _tests(repo, agent_id, task_id)

    while True:
        stat = _diff_stat(repo, files)
        outcome = _gate(
            task_id,
            agent_id,
            "git_commit",
            f"Commit '{task['title']}'",
            "The edit is local and the worker will not commit until this gate allows it.",
            stat,
            "Leave the files uncommitted and wait for a revise note.",
            diff_stat=stat,
        )
        if outcome == "stop":
            return
        if outcome == "revise":
            _edit(task, repo, files, agent_id)
            continue
        if outcome == "run":
            _commit(repo, files, task["title"], agent_id, task_id)
        break

    outcome = _gate(
        task_id,
        agent_id,
        "mark_done",
        f"Mark '{task['title']}' done",
        "Closing the task releases the file locks.",
        "The task leaves the active board. Push is still not offered.",
        "Leave the task open.",
    )
    if outcome == "run":
        store.update_task_status(task_id, "DONE")
        store.touch_agent(agent_id, "idle", None)
        store.record_event(
            "Marked done. Locks released. Push stays at the desk.",
            kind="system",
            agent_id=agent_id,
            task_id=task_id,
        )


def _gate(
    task_id: str,
    agent_id: str,
    action: str,
    summary: str,
    justification: str,
    blast: str,
    alternative: str,
    diff_stat: str = "",
) -> str:
    mode = store.policy_mode(action)
    if mode == "never":
        store.record_event(
            f"Refused {action}. That action stays off.",
            kind="error",
            agent_id=agent_id,
            task_id=task_id,
        )
        store.release_task(task_id, "FAILED")
        store.touch_agent(agent_id, "idle", None)
        return "stop"
    if mode == "act_and_log":
        return "run"
    if mode == "act_and_notify":
        store.record_event(
            f"Auto-ran {action}. {summary}",
            kind="notify",
            agent_id=agent_id,
            task_id=task_id,
        )
        return "run"

    created = store.enqueue_approval(
        task_id,
        agent_id,
        action,
        summary,
        justification,
        blast,
        alternative,
        diff_stat,
    )
    approval_id = created.get("id")
    if not approval_id:
        return "stop"
    _buzz(summary, blast)
    while True:
        row = store.get_approval(approval_id)
        if not row:
            return "stop"
        if row["status"] == "approved":
            return "run"
        if row["status"] == "revised":
            return "revise"
        if row["status"] == "stopped":
            return "stop"
        time.sleep(0.4)


def _edit(task: dict, repo: Path, files: list[str], agent_id: str) -> None:
    notes = store.consume_steers(agent_id, task["id"])
    message = (task.get("prompt") or "").strip()
    standing = _standing_brief(repo)
    if standing:
        message = standing + "\n\nTask:\n" + message
    if notes:
        message += "\n\nOperator notes:\n" + "\n".join(f"- {note}" for note in notes)
    if store.model_configured() and aider_available():
        def on_line(line: str) -> None:
            store.record_event(line, kind="log", agent_id=agent_id, task_id=task["id"])

        code = run_message(
            provider=os.getenv("HACKSWARM_PROVIDER", "gemini"),
            files=files,
            message=message,
            cwd=repo,
            on_line=on_line,
        )
        if code == 0:
            return
        store.record_event(
            "Aider did not finish. A dry-run note was written inside the lock instead.",
            kind="notify",
            agent_id=agent_id,
            task_id=task["id"],
        )
    else:
        store.record_event(
            "Model offline. Wrote a local dry-run note inside the lock.",
            kind="notify",
            agent_id=agent_id,
            task_id=task["id"],
        )
    _dry_edit(repo, files, message)


def _standing_brief(repo: Path) -> str:
    brief = store.resolve_inside(repo, "HACKSWARM.md")
    if brief is None or not brief.is_file() or store.is_secret_path("HACKSWARM.md"):
        return ""
    text = brief.read_text(encoding="utf-8", errors="replace").strip()
    return text[:4000]


def _dry_edit(repo: Path, files: list[str], message: str) -> None:
    target = store.resolve_inside(repo, files[0])
    if target is None or store.is_secret_path(files[0]):
        raise RuntimeError("Locked file is outside the project")
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = target.read_text(encoding="utf-8") if target.exists() else ""
    stamp = store.now()
    block = f"\n\n# HackSwarm dry-run {stamp}\n{message.strip()}\n"
    target.write_text(existing + block, encoding="utf-8")


def _list_repo(repo: Path) -> list[str]:
    names: list[str] = []
    for path in repo.rglob("*"):
        if ".git" in path.parts or path.name == "__pycache__":
            continue
        if path.is_file():
            names.append(str(path.relative_to(repo)))
        if len(names) >= 40:
            break
    return names


def _wants_install(prompt: str) -> bool:
    text = prompt.lower()
    return any(token in text for token in ("install", "npm ", "pip ", "pnpm ", "yarn "))


def _wants_delete(prompt: str) -> bool:
    text = prompt.lower()
    return "delete" in text or "remove file" in text


def _lockfile_note(repo: Path) -> str:
    if (repo / "package.json").is_file():
        return "Will run npm install in the project folder."
    if (repo / "requirements.txt").is_file():
        return "Will run pip install -r requirements.txt in the project folder."
    return "No package.json or requirements.txt. Proceed records the decision and installs nothing."


def _install(repo: Path, agent_id: str, task_id: str) -> None:
    if (repo / "package.json").is_file():
        cmd = ["npm", "install"]
    elif (repo / "requirements.txt").is_file():
        cmd = ["pip", "install", "-r", "requirements.txt"]
    else:
        store.record_event(
            "Install approved. No lockfile was present, so nothing was installed.",
            kind="notify",
            agent_id=agent_id,
            task_id=task_id,
        )
        return
    _stream(cmd, repo, agent_id, task_id)


def _delete_locked(repo: Path, files: list[str], agent_id: str, task_id: str) -> None:
    for rel in files:
        target = store.resolve_inside(repo, rel)
        if target is None or store.is_secret_path(rel):
            store.record_event(
                f"Skipped delete for {rel}",
                kind="error",
                agent_id=agent_id,
                task_id=task_id,
            )
            continue
        if target.is_file():
            target.unlink()
            store.record_event(
                f"Deleted {rel}",
                kind="notify",
                agent_id=agent_id,
                task_id=task_id,
            )


def _tests(repo: Path, agent_id: str, task_id: str) -> None:
    if (repo / "tests").is_dir():
        _stream(["python", "-m", "pytest", "-q"], repo, agent_id, task_id)
        return
    store.record_event(
        "Test step recorded. This project has no tests folder.",
        kind="notify",
        agent_id=agent_id,
        task_id=task_id,
    )


def _diff_stat(repo: Path, files: list[str]) -> str:
    if not (repo / ".git").is_dir():
        return "This folder is not a git repo. Proceed writes a commit note. Nothing is pushed."
    shown = subprocess.run(
        ["git", "status", "--short", "--", *files],
        cwd=repo,
        capture_output=True,
        text=True,
        timeout=20,
    )
    stat = (shown.stdout or shown.stderr or "").strip()
    return stat or "No diff on the locked files."


def _commit(repo: Path, files: list[str], title: str, agent_id: str, task_id: str) -> None:
    if not (repo / ".git").is_dir():
        note = store.resolve_inside(repo, ".hackswarm/commit-request.txt")
        if note is None:
            return
        note.parent.mkdir(parents=True, exist_ok=True)
        note.write_text(f"Commit requested: {title}\n", encoding="utf-8")
        store.record_event(
            "Commit note written. This folder is not a git repo, and nothing was pushed.",
            kind="notify",
            agent_id=agent_id,
            task_id=task_id,
        )
        return
    env = os.environ.copy()
    identity = subprocess.run(
        ["git", "config", "user.name"],
        cwd=repo,
        capture_output=True,
        text=True,
        timeout=20,
    )
    if identity.returncode != 0 or not identity.stdout.strip():
        env["GIT_AUTHOR_NAME"] = "HackSwarm"
        env["GIT_AUTHOR_EMAIL"] = "hackswarm@localhost"
        env["GIT_COMMITTER_NAME"] = "HackSwarm"
        env["GIT_COMMITTER_EMAIL"] = "hackswarm@localhost"
    add = subprocess.run(
        ["git", "add", "--", *files],
        cwd=repo,
        capture_output=True,
        text=True,
        timeout=20,
        env=env,
    )
    if add.returncode != 0:
        raise RuntimeError(add.stderr.strip() or "git add failed")
    commit = subprocess.run(
        ["git", "-c", "commit.gpgsign=false", "commit", "-m", title],
        cwd=repo,
        capture_output=True,
        text=True,
        timeout=20,
        env=env,
    )
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or commit.stdout.strip() or "git commit failed")
    store.record_event(
        "Committed locally. Push stays at the desk.",
        kind="notify",
        agent_id=agent_id,
        task_id=task_id,
    )


def _stream(cmd: list[str], repo: Path, agent_id: str, task_id: str) -> None:
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=repo,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except FileNotFoundError:
        store.record_event(
            f"Command not found: {cmd[0]}",
            kind="error",
            agent_id=agent_id,
            task_id=task_id,
        )
        return
    assert proc.stdout is not None
    for line in proc.stdout:
        text = line.strip()
        if text:
            store.record_event(text, kind="log", agent_id=agent_id, task_id=task_id)
    code = proc.wait(timeout=90)
    if code != 0:
        store.record_event(
            f"{cmd[0]} exited {code}",
            kind="error",
            agent_id=agent_id,
            task_id=task_id,
        )


def _buzz(title: str, message: str) -> None:
    topic = os.getenv("NTFY_TOPIC", "").strip()
    if not topic:
        return
    try:
        request = urllib.request.Request(
            f"https://ntfy.sh/{urllib.parse.quote(topic)}",
            data=message[:400].encode("utf-8"),
            headers={"Title": title[:80], "Priority": "4", "Tags": "warning"},
            method="POST",
        )
        urllib.request.urlopen(request, timeout=5).read()
    except (urllib.error.URLError, TimeoutError, OSError):
        store.record_event("Phone buzz did not send. The gate is still waiting in the console.", kind="notify")
