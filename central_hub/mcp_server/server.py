"""
Central coordination store for HackSwarm.

SQLite holds the task board, file locks, the approval queue, allowance
policy, and the phone-console session. FastAPI and the worker import
these helpers. They do not trust the model to decide what may run.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
import hashlib
import json
import os
import secrets
import sqlite3
import uuid

from central_hub.api.policy import ACTION_CLASSES, PRESETS, preset_rows

AGENTS = (
    {"agent_id": "agent-ui", "name": "UI", "role": "Interface"},
    {"agent_id": "agent-api", "name": "API", "role": "Services"},
    {"agent_id": "agent-review", "name": "Review", "role": "Review"},
)

SECRET_MARKERS = (".env", "id_rsa", "credential", "secret")


def db_path() -> str:
    raw = os.getenv("DATABASE_URL", "sqlite:///./central_hub/database/swarm.db")
    path = raw.replace("sqlite:///", "", 1)
    return str(Path(path))


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    path = Path(db_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _columns(cursor: sqlite3.Cursor, table: str) -> set[str]:
    return {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}


def _ensure_column(cursor: sqlite3.Cursor, table: str, name: str, decl: str) -> None:
    if name not in _columns(cursor, table):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def init_db() -> None:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'TODO',
            assigned_agent TEXT,
            assigned_dev TEXT,
            locked_files TEXT,
            created_at TEXT,
            updated_at TEXT,
            prompt TEXT,
            repo_path TEXT,
            requested_files TEXT
        )
        """
    )
    _ensure_column(cursor, "tasks", "prompt", "TEXT")
    _ensure_column(cursor, "tasks", "repo_path", "TEXT")
    _ensure_column(cursor, "tasks", "requested_files", "TEXT")
    _ensure_column(cursor, "tasks", "provider", "TEXT")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_registry (
            agent_id TEXT PRIMARY KEY,
            teammate_name TEXT,
            current_tool TEXT,
            current_task TEXT,
            last_heartbeat TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS contracts (
            module_name TEXT PRIMARY KEY,
            author_agent TEXT,
            schema_definition TEXT,
            updated_at TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            agent_id TEXT,
            task_id TEXT,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            payload TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            agent_id TEXT,
            action_class TEXT NOT NULL,
            summary TEXT NOT NULL,
            justification TEXT NOT NULL,
            blast_radius TEXT NOT NULL,
            alternative TEXT NOT NULL,
            diff_stat TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            revise_note TEXT,
            created_at TEXT NOT NULL,
            decided_at TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS policy (
            action_class TEXT PRIMARY KEY,
            mode TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            agent_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            repo_path TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS steers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT,
            task_id TEXT,
            note TEXT NOT NULL,
            created_at TEXT NOT NULL,
            consumed INTEGER DEFAULT 0
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS console_auth (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            pin_hash TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pin_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    cursor.execute("SELECT COUNT(*) AS n FROM policy")
    if cursor.fetchone()["n"] == 0:
        for action, mode in PRESETS["routine"].items():
            cursor.execute(
                "INSERT INTO policy (action_class, mode) VALUES (?, ?)",
                (action, mode),
            )
        cursor.execute(
            "INSERT INTO policy (action_class, mode) VALUES ('__preset__', 'routine')"
        )
    for agent in AGENTS:
        cursor.execute(
            """
            INSERT INTO projects (agent_id, name, role, repo_path)
            VALUES (?, ?, ?, NULL)
            ON CONFLICT(agent_id) DO NOTHING
            """,
            (agent["agent_id"], agent["name"], agent["role"]),
        )
        cursor.execute(
            """
            INSERT INTO agent_registry (agent_id, teammate_name, current_tool, current_task, last_heartbeat)
            VALUES (?, ?, 'idle', NULL, ?)
            ON CONFLICT(agent_id) DO NOTHING
            """,
            (agent["agent_id"], agent["name"], now()),
        )
    conn.commit()
    conn.close()


def is_secret_path(rel: str) -> bool:
    name = Path(rel).name.lower()
    return any(marker in name for marker in SECRET_MARKERS)


def resolve_inside(repo: Path, rel: str) -> Optional[Path]:
    if not rel or rel.startswith(("/", "\\")):
        return None
    parts = Path(rel).parts
    if ".." in parts:
        return None
    root = repo.resolve()
    full = (root / rel).resolve()
    if not full.is_relative_to(root):
        return None
    return full


def record_event(
    message: str,
    kind: str = "log",
    agent_id: Optional[str] = None,
    task_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> int:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO events (created_at, agent_id, task_id, kind, message, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            now(),
            agent_id,
            task_id,
            kind,
            message,
            json.dumps(payload) if payload else None,
        ),
    )
    event_id = int(cursor.lastrowid)
    conn.commit()
    conn.close()
    return event_id


def record_event_once(
    message: str,
    kind: str = "log",
    agent_id: Optional[str] = None,
    task_id: Optional[str] = None,
) -> Optional[int]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT message FROM events
        WHERE task_id IS ? AND kind = ?
        ORDER BY id DESC LIMIT 1
        """,
        (task_id, kind),
    )
    row = cursor.fetchone()
    conn.close()
    if row and row["message"] == message:
        return None
    return record_event(message, kind=kind, agent_id=agent_id, task_id=task_id)


def list_events(after: int = 0, limit: int = 200) -> list[dict[str, Any]]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, created_at, agent_id, task_id, kind, message, payload
        FROM events WHERE id > ? ORDER BY id ASC LIMIT ?
        """,
        (after, limit),
    )
    rows = [_event_dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def list_events_tail(limit: int = 40) -> list[dict[str, Any]]:
    """Newest events, oldest of that window first, so the phone can tail the log."""
    limit = max(1, min(int(limit), 80))
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, created_at, agent_id, task_id, kind, message, payload
        FROM events ORDER BY id DESC LIMIT ?
        """,
        (limit,),
    )
    rows = [_event_dict(row) for row in cursor.fetchall()]
    conn.close()
    rows.reverse()
    return rows


def _event_dict(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload"]) if row["payload"] else None
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "agent_id": row["agent_id"],
        "task_id": row["task_id"],
        "kind": row["kind"],
        "message": row["message"],
        "payload": payload,
    }


def create_task(
    title: str,
    prompt: str,
    agent_id: str,
    files: Optional[list[str]] = None,
    repo_path: Optional[str] = None,
) -> dict[str, Any]:
    known = {agent["agent_id"] for agent in AGENTS}
    if agent_id not in known:
        return {"success": False, "error": "Unknown agent"}
    clean_files = files or [_role_note(agent_id)]
    for rel in clean_files:
        if is_secret_path(rel):
            return {"success": False, "error": "Secret files stay at the desk"}
        if Path(rel).is_absolute() or ".." in Path(rel).parts:
            return {"success": False, "error": f"Refusing file '{rel}'"}
    if repo_path is None:
        project = get_project(agent_id)
        repo_path = project["repo_path"] if project else None
    task_id = "TASK-" + uuid.uuid4().hex[:8]
    stamp = now()
    conn = connect()
    conn.execute(
        """
        INSERT INTO tasks (
            id, title, description, status, assigned_agent, assigned_dev,
            locked_files, created_at, updated_at, prompt, repo_path, requested_files
        ) VALUES (?, ?, ?, 'TODO', ?, ?, '[]', ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            title.strip(),
            prompt.strip(),
            agent_id,
            agent_id,
            stamp,
            stamp,
            prompt.strip(),
            repo_path,
            json.dumps(clean_files),
        ),
    )
    conn.commit()
    conn.close()
    record_event(
        f"Queued '{title.strip()}' for {agent_id}",
        kind="system",
        agent_id=agent_id,
        task_id=task_id,
    )
    return {"success": True, "task_id": task_id}


def _role_note(agent_id: str) -> str:
    return {
        "agent-ui": ".hackswarm/ui.md",
        "agent-api": ".hackswarm/api.md",
        "agent-review": ".hackswarm/review.md",
    }.get(agent_id, ".hackswarm/notes.md")


def lane_ready(name: str) -> bool:
    if name == "ollama":
        return True
    if name != "gemini":
        return False
    value = os.getenv("GEMINI_API_KEY", "").strip()
    return bool(value) and not value.startswith("your_")


def _free_provider(cursor: sqlite3.Cursor) -> Optional[str]:
    busy = {
        row["provider"]
        for row in cursor.execute(
            """
            SELECT provider FROM tasks
            WHERE status = 'IN_PROGRESS' AND provider IS NOT NULL AND provider != ''
            """
        )
    }
    first = active_provider()
    if first not in ("gemini", "ollama"):
        first = "gemini"
    second = "ollama" if first == "gemini" else "gemini"
    for lane in (first, second):
        if lane not in busy and lane_ready(lane):
            return lane
    return None


def peek_free_provider() -> Optional[str]:
    conn = connect()
    provider = _free_provider(conn.cursor())
    conn.close()
    return provider


def claim_task(
    task_id: str,
    agent_id: str,
    teammate_name: str,
    files_to_lock: list[str],
) -> dict[str, Any]:
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, locked_files FROM tasks WHERE status = 'IN_PROGRESS' AND id != ?",
        (task_id,),
    )
    conflict_files: list[tuple[str, str]] = []
    for other in cursor.fetchall():
        other_locked = json.loads(other["locked_files"] or "[]")
        for rel in files_to_lock:
            if rel in other_locked:
                conflict_files.append((rel, other["id"]))
    if conflict_files:
        conn.close()
        return {
            "success": False,
            "error": "File lock conflict detected",
            "conflicts": conflict_files,
        }

    provider = _free_provider(cursor)
    if not provider:
        conn.close()
        return {"success": False, "error": "Both models are already working"}
    stamp = now()
    cursor.execute(
        """
        UPDATE tasks
        SET status = 'IN_PROGRESS', assigned_agent = ?, assigned_dev = ?,
            locked_files = ?, provider = ?, updated_at = ?
        WHERE id = ? AND status = 'TODO'
        """,
        (agent_id, teammate_name, json.dumps(files_to_lock), provider, stamp, task_id),
    )
    if cursor.rowcount != 1:
        conn.close()
        return {"success": False, "error": "Task is not waiting"}
    cursor.execute(
        """
        UPDATE agent_registry
        SET current_tool = 'aider', current_task = ?, last_heartbeat = ?
        WHERE agent_id = ?
        """,
        (task_id, stamp, agent_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Task {task_id} claimed by {teammate_name}."}


def update_task_status(
    task_id: str, new_status: str, notes: Optional[str] = None
) -> dict[str, Any]:
    del notes
    conn = connect()
    stamp = now()
    status = new_status.upper()
    if status == "DONE":
        conn.execute(
            """
            UPDATE tasks
            SET status = 'DONE', locked_files = '[]', updated_at = ?
            WHERE id = ?
            """,
            (stamp, task_id),
        )
    else:
        conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
            (status, stamp, task_id),
        )
    conn.commit()
    conn.close()
    return {"success": True, "task_id": task_id, "new_status": status}


def release_task(task_id: str, status: str = "TODO") -> None:
    conn = connect()
    conn.execute(
        """
        UPDATE tasks
        SET status = ?, locked_files = '[]', updated_at = ?
        WHERE id = ?
        """,
        (status, now(), task_id),
    )
    conn.commit()
    conn.close()


def publish_contract(module_name: str, author_agent: str, schema_code: str) -> dict[str, Any]:
    conn = connect()
    stamp = now()
    conn.execute(
        """
        INSERT INTO contracts (module_name, author_agent, schema_definition, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(module_name) DO UPDATE SET
            author_agent = excluded.author_agent,
            schema_definition = excluded.schema_definition,
            updated_at = excluded.updated_at
        """,
        (module_name, author_agent, schema_code, stamp),
    )
    conn.commit()
    conn.close()
    return {"success": True, "module": module_name, "message": "Contract broadcasted across swarm."}


def get_task(task_id: str) -> Optional[dict[str, Any]]:
    conn = connect()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return _task_dict(row) if row else None


def next_todo() -> Optional[dict[str, Any]]:
    conn = connect()
    row = conn.execute(
        """
        SELECT * FROM tasks
        WHERE status = 'TODO' AND assigned_agent IS NOT NULL
          AND assigned_agent NOT IN (
            SELECT assigned_agent FROM tasks WHERE status = 'IN_PROGRESS'
          )
        ORDER BY created_at ASC LIMIT 1
        """
    ).fetchone()
    conn.close()
    return _task_dict(row) if row else None


def _task_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "assigned_agent": row["assigned_agent"],
        "assigned_dev": row["assigned_dev"],
        "locks": json.loads(row["locked_files"] or "[]"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "prompt": row["prompt"],
        "repo_path": row["repo_path"],
        "requested_files": json.loads(row["requested_files"] or "[]"),
        "provider": row["provider"] if "provider" in row.keys() else None,
    }


def touch_agent(agent_id: str, tool: str, task_id: Optional[str]) -> None:
    conn = connect()
    conn.execute(
        """
        UPDATE agent_registry
        SET current_tool = ?, current_task = ?, last_heartbeat = ?
        WHERE agent_id = ?
        """,
        (tool, task_id, now(), agent_id),
    )
    conn.commit()
    conn.close()


def get_team_status() -> dict[str, Any]:
    conn = connect()
    tasks = conn.execute(
        "SELECT id, title, status, assigned_dev, locked_files FROM tasks"
    ).fetchall()
    agents = conn.execute(
        "SELECT agent_id, teammate_name, current_tool, current_task, last_heartbeat FROM agent_registry"
    ).fetchall()
    conn.close()
    return {
        "tasks": [
            {
                "id": task["id"],
                "title": task["title"],
                "status": task["status"],
                "assigned_dev": task["assigned_dev"],
                "locks": json.loads(task["locked_files"] or "[]"),
            }
            for task in tasks
        ],
        "agents": [
            {
                "agent_id": agent["agent_id"],
                "dev": agent["teammate_name"],
                "tool": agent["current_tool"],
                "task": agent["current_task"],
                "last_seen": agent["last_heartbeat"],
            }
            for agent in agents
        ],
    }


def list_tasks() -> list[dict[str, Any]]:
    conn = connect()
    rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_task_dict(row) for row in rows]


def get_project(agent_id: str) -> Optional[dict[str, Any]]:
    conn = connect()
    row = conn.execute("SELECT * FROM projects WHERE agent_id = ?", (agent_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "agent_id": row["agent_id"],
        "name": row["name"],
        "role": row["role"],
        "repo_path": row["repo_path"],
    }


def list_projects() -> list[dict[str, Any]]:
    conn = connect()
    rows = conn.execute("SELECT * FROM projects ORDER BY name").fetchall()
    conn.close()
    return [
        {
            "agent_id": row["agent_id"],
            "name": row["name"],
            "role": row["role"],
            "repo_path": row["repo_path"],
        }
        for row in rows
    ]


def set_project_path(agent_id: str, repo_path: str) -> dict[str, Any]:
    project = get_project(agent_id)
    if not project:
        return {"success": False, "error": "Unknown agent"}
    folder = Path(repo_path).expanduser()
    if not folder.is_dir():
        return {"success": False, "error": "Project folder does not exist"}
    if not repo_allowed(folder):
        return {"success": False, "error": "That folder is outside the allowed project roots"}
    conn = connect()
    conn.execute(
        "UPDATE projects SET repo_path = ? WHERE agent_id = ?",
        (str(folder.resolve()), agent_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "agent_id": agent_id, "repo_path": str(folder.resolve())}


def get_policy() -> dict[str, Any]:
    conn = connect()
    rows = conn.execute("SELECT action_class, mode FROM policy").fetchall()
    conn.close()
    modes = {row["action_class"]: row["mode"] for row in rows}
    preset = modes.pop("__preset__", "routine")
    for action in ACTION_CLASSES:
        modes.setdefault(action, PRESETS["routine"][action])
    return {"preset": preset, "modes": modes}


def apply_preset(name: str) -> dict[str, Any]:
    rows = preset_rows(name)
    conn = connect()
    for action, mode in rows.items():
        conn.execute(
            """
            INSERT INTO policy (action_class, mode) VALUES (?, ?)
            ON CONFLICT(action_class) DO UPDATE SET mode = excluded.mode
            """,
            (action, mode),
        )
    conn.execute(
        """
        INSERT INTO policy (action_class, mode) VALUES ('__preset__', ?)
        ON CONFLICT(action_class) DO UPDATE SET mode = excluded.mode
        """,
        (name,),
    )
    conn.commit()
    conn.close()
    return get_policy()


def set_action_mode(action_class: str, mode: str) -> dict[str, Any]:
    from central_hub.api.policy import LOCKED_NEVER, TOGGLE_MODES, TOGGLEABLE

    if action_class not in TOGGLEABLE:
        return {"success": False, "error": "That action cannot be unlocked from the phone"}
    if mode not in TOGGLE_MODES:
        return {"success": False, "error": "Choose approve before, or act and notify"}
    if action_class in LOCKED_NEVER:
        return {"success": False, "error": "That action stays off"}
    conn = connect()
    conn.execute(
        """
        INSERT INTO policy (action_class, mode) VALUES (?, ?)
        ON CONFLICT(action_class) DO UPDATE SET mode = excluded.mode
        """,
        (action_class, mode),
    )
    conn.execute(
        """
        INSERT INTO policy (action_class, mode) VALUES ('__preset__', 'custom')
        ON CONFLICT(action_class) DO UPDATE SET mode = excluded.mode
        """
    )
    conn.commit()
    conn.close()
    return {"success": True, **get_policy()}


def policy_mode(action_class: str) -> str:
    return str(get_policy()["modes"].get(action_class, "approve_before"))


def enqueue_approval(
    task_id: str,
    agent_id: str,
    action_class: str,
    summary: str,
    justification: str,
    blast_radius: str,
    alternative: str,
    diff_stat: str = "",
) -> dict[str, Any]:
    conn = connect()
    existing = conn.execute(
        """
        SELECT id FROM approvals
        WHERE task_id = ? AND status = 'pending'
        """,
        (task_id,),
    ).fetchone()
    if existing:
        conn.close()
        return {
            "success": False,
            "error": "A gate is already waiting on this task",
            "id": existing["id"],
        }
    approval_id = "GATE-" + uuid.uuid4().hex[:8]
    stamp = now()
    conn.execute(
        """
        INSERT INTO approvals (
            id, task_id, agent_id, action_class, summary, justification,
            blast_radius, alternative, diff_stat, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """,
        (
            approval_id,
            task_id,
            agent_id,
            action_class,
            summary,
            justification,
            blast_radius,
            alternative,
            diff_stat,
            stamp,
        ),
    )
    conn.execute(
        "UPDATE tasks SET status = 'REVIEW', updated_at = ? WHERE id = ?",
        (stamp, task_id),
    )
    conn.commit()
    conn.close()
    record_event(
        summary,
        kind="hold",
        agent_id=agent_id,
        task_id=task_id,
        payload={"approval_id": approval_id, "action_class": action_class},
    )
    return {"success": True, "id": approval_id}


def list_approvals(status: str = "pending") -> list[dict[str, Any]]:
    conn = connect()
    rows = conn.execute(
        """
        SELECT * FROM approvals
        WHERE status = ?
        ORDER BY created_at ASC
        """,
        (status,),
    ).fetchall()
    conn.close()
    return [_approval_dict(row) for row in rows]


def get_approval(approval_id: str) -> Optional[dict[str, Any]]:
    conn = connect()
    row = conn.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
    conn.close()
    return _approval_dict(row) if row else None


def _approval_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "task_id": row["task_id"],
        "agent_id": row["agent_id"],
        "action_class": row["action_class"],
        "summary": row["summary"],
        "justification": row["justification"],
        "blast_radius": row["blast_radius"],
        "alternative": row["alternative"],
        "diff_stat": row["diff_stat"] or "",
        "status": row["status"],
        "revise_note": row["revise_note"],
        "created_at": row["created_at"],
        "decided_at": row["decided_at"],
    }


def pending_for_task(task_id: str) -> Optional[dict[str, Any]]:
    conn = connect()
    row = conn.execute(
        """
        SELECT * FROM approvals
        WHERE task_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
        """,
        (task_id,),
    ).fetchone()
    conn.close()
    return _approval_dict(row) if row else None


def decide_approval(approval_id: str, decision: str, note: str = "") -> dict[str, Any]:
    approval = get_approval(approval_id)
    if not approval:
        return {"success": False, "error": "Gate not found"}
    if approval["status"] != "pending":
        return {"success": False, "error": "Gate is already decided"}
    if decision not in {"proceed", "revise", "stop"}:
        return {"success": False, "error": "Unknown decision"}
    if decision == "revise" and not note.strip():
        return {"success": False, "error": "Revise needs a note"}
    if approval["action_class"] == "git_push":
        return {"success": False, "error": "Push stays at the desk"}

    status = {"proceed": "approved", "revise": "revised", "stop": "stopped"}[decision]
    conn = connect()
    conn.execute(
        """
        UPDATE approvals
        SET status = ?, revise_note = ?, decided_at = ?
        WHERE id = ? AND status = 'pending'
        """,
        (status, note.strip() or None, now(), approval_id),
    )
    conn.commit()
    conn.close()

    if decision == "revise":
        add_steer(approval["agent_id"], note.strip(), task_id=approval["task_id"])
        conn = connect()
        conn.execute(
            "UPDATE tasks SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?",
            (now(), approval["task_id"]),
        )
        conn.commit()
        conn.close()
        record_event(
            f"Revise: {note.strip()}",
            kind="log",
            agent_id=approval["agent_id"],
            task_id=approval["task_id"],
        )
    elif decision == "stop":
        release_task(approval["task_id"], "PARKED")
        touch_agent(approval["agent_id"] or "", "idle", None)
        record_event(
            "Stopped. Locks released.",
            kind="system",
            agent_id=approval["agent_id"],
            task_id=approval["task_id"],
        )
    else:
        conn = connect()
        conn.execute(
            "UPDATE tasks SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?",
            (now(), approval["task_id"]),
        )
        conn.commit()
        conn.close()
        record_event(
            f"Proceed on {approval['action_class']}",
            kind="log",
            agent_id=approval["agent_id"],
            task_id=approval["task_id"],
        )
    return {"success": True, "id": approval_id, "status": status}


def add_steer(agent_id: str, note: str, task_id: Optional[str] = None) -> dict[str, Any]:
    text = note.strip()
    if not text:
        return {"success": False, "error": "Note is empty"}
    conn = connect()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO steers (agent_id, task_id, note, created_at, consumed)
        VALUES (?, ?, ?, ?, 0)
        """,
        (agent_id, task_id, text, now()),
    )
    steer_id = int(cursor.lastrowid)
    conn.commit()
    conn.close()
    record_event(
        f"Steer: {text}",
        kind="log",
        agent_id=agent_id,
        task_id=task_id,
    )
    return {"success": True, "id": steer_id}


def consume_steers(agent_id: str, task_id: str) -> list[str]:
    conn = connect()
    rows = conn.execute(
        """
        SELECT id, note FROM steers
        WHERE consumed = 0 AND (task_id = ? OR (task_id IS NULL AND agent_id = ?))
        ORDER BY id ASC
        """,
        (task_id, agent_id),
    ).fetchall()
    notes = [row["note"] for row in rows]
    if rows:
        conn.executemany(
            "UPDATE steers SET consumed = 1 WHERE id = ?",
            [(row["id"],) for row in rows],
        )
        conn.commit()
    conn.close()
    return notes


def hash_pin(pin: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(pin.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + ":" + digest.hex()


def verify_pin(pin: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split(":", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.scrypt(pin.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return secrets.compare_digest(digest.hex(), digest_hex)


def sync_pin_from_env() -> bool:
    pin = os.getenv("CONSOLE_PIN", "").strip()
    if len(pin) < 4:
        return pin_configured()
    conn = connect()
    conn.execute(
        """
        INSERT INTO console_auth (id, pin_hash) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash
        """,
        (hash_pin(pin),),
    )
    conn.commit()
    conn.close()
    return True


def pin_configured() -> bool:
    conn = connect()
    row = conn.execute("SELECT pin_hash FROM console_auth WHERE id = 1").fetchone()
    conn.close()
    return bool(row and row["pin_hash"])


def check_pin(pin: str) -> bool:
    conn = connect()
    row = conn.execute("SELECT pin_hash FROM console_auth WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return False
    return verify_pin(pin, row["pin_hash"])


def _attempt_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()


def pin_locked() -> bool:
    conn = connect()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM pin_attempts WHERE created_at >= ?",
        (_attempt_cutoff(),),
    ).fetchone()
    conn.close()
    return int(row["n"]) >= 8


def register_pin_failure() -> None:
    conn = connect()
    conn.execute("INSERT INTO pin_attempts (created_at) VALUES (?)", (now(),))
    conn.execute("DELETE FROM pin_attempts WHERE created_at < ?", (_attempt_cutoff(),))
    conn.commit()
    conn.close()


def clear_pin_attempts() -> None:
    conn = connect()
    conn.execute("DELETE FROM pin_attempts")
    conn.commit()
    conn.close()


def workspace_root() -> Path:
    raw = os.getenv("HACKSWARM_WORKSPACE", r"D:\Documents\vscode").strip()
    return Path(raw).expanduser().resolve()


def list_workspace_dirs(folder: str) -> dict[str, Any]:
    root = workspace_root()
    if not root.is_dir():
        return {"ok": False, "error": "Workspace folder is missing"}
    target = Path(folder).expanduser() if folder.strip() else root
    if not target.is_absolute():
        target = root / target
    try:
        resolved = target.resolve()
    except OSError:
        return {"ok": False, "error": "That folder cannot be opened"}
    if resolved != root and not resolved.is_relative_to(root):
        return {"ok": False, "error": "Stay inside the workspace"}
    if not resolved.is_dir():
        return {"ok": False, "error": "That path is not a folder"}
    skip = {
        ".git",
        "node_modules",
        ".venv",
        ".next",
        "__pycache__",
        "dist",
        "build",
    }
    names = []
    try:
        children = list(resolved.iterdir())
    except OSError:
        return {"ok": False, "error": "That folder cannot be listed"}
    for child in children:
        if not child.is_dir():
            continue
        if child.name in skip or child.name.startswith("."):
            continue
        if is_secret_path(child.name):
            continue
        names.append(child.name)
    parent = "" if resolved == root else str(resolved.parent)
    return {
        "ok": True,
        "path": str(resolved),
        "parent": parent,
        "dirs": sorted(names, key=str.lower),
    }


def repo_allowed(folder: Path) -> bool:
    raw = os.getenv("HACKSWARM_REPO_ROOTS", "").strip()
    if not raw:
        return True
    resolved = folder.resolve()
    for part in raw.split(";"):
        root = Path(part.strip()).expanduser()
        if not part.strip():
            continue
        root = root.resolve()
        if resolved == root or resolved.is_relative_to(root):
            return True
    return False


def open_session() -> str:
    token = secrets.token_urlsafe(32)
    stamp = datetime.now(timezone.utc)
    conn = connect()
    conn.execute(
        "INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
        (token, stamp.isoformat(), (stamp + timedelta(days=7)).isoformat()),
    )
    conn.commit()
    conn.close()
    return token


def session_valid(token: str) -> bool:
    if not token:
        return False
    conn = connect()
    row = conn.execute(
        "SELECT expires_at FROM sessions WHERE token = ?",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        return False
    expires = datetime.fromisoformat(row["expires_at"])
    return expires > datetime.now(timezone.utc)


def drop_session(token: str) -> None:
    conn = connect()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def board_snapshot() -> dict[str, Any]:
    policy = get_policy()
    return {
        "agents": [
            {
                **project,
                "tool": _agent_tool(project["agent_id"]),
                "last_seen": _agent_seen(project["agent_id"]),
                "current_task": _agent_task(project["agent_id"]),
            }
            for project in list_projects()
        ],
        "tasks": list_tasks(),
        "pending_approvals": list_approvals("pending"),
        "events": list_events(after=0, limit=40)[-40:],
        "policy": policy,
        "model_offline": not model_configured(),
        "provider": active_provider(),
        "ollama_model": ollama_model_name(),
        "ntfy_enabled": bool(os.getenv("NTFY_TOPIC", "").strip()),
    }


def _agent_tool(agent_id: str) -> str:
    conn = connect()
    row = conn.execute(
        "SELECT current_tool FROM agent_registry WHERE agent_id = ?",
        (agent_id,),
    ).fetchone()
    conn.close()
    return row["current_tool"] if row else "idle"


def _agent_seen(agent_id: str) -> Optional[str]:
    conn = connect()
    row = conn.execute(
        "SELECT last_heartbeat FROM agent_registry WHERE agent_id = ?",
        (agent_id,),
    ).fetchone()
    conn.close()
    return row["last_heartbeat"] if row else None


def _agent_task(agent_id: str) -> Optional[str]:
    conn = connect()
    row = conn.execute(
        "SELECT current_task FROM agent_registry WHERE agent_id = ?",
        (agent_id,),
    ).fetchone()
    conn.close()
    return row["current_task"] if row else None


def ollama_model_name() -> str:
    return os.getenv("OLLAMA_CODE_MODEL", "gemma3:4b").strip() or "gemma3:4b"


def active_provider() -> str:
    conn = connect()
    row = conn.execute("SELECT value FROM settings WHERE key = 'provider'").fetchone()
    conn.close()
    if row and row["value"] in ("gemini", "ollama"):
        return row["value"]
    env = os.getenv("HACKSWARM_PROVIDER", "gemini").strip().lower()
    return env if env in ("gemini", "ollama") else "gemini"


def agent_briefs() -> dict[str, str]:
    conn = connect()
    rows = conn.execute(
        "SELECT key, value FROM settings WHERE key LIKE 'brief:%'"
    ).fetchall()
    conn.close()
    stored = {row["key"].split(":", 1)[1]: row["value"] for row in rows}
    return {agent["agent_id"]: stored.get(agent["agent_id"], "") for agent in AGENTS}


def agent_brief(agent_id: str) -> str:
    return agent_briefs().get(agent_id, "").strip()


def set_agent_brief(agent_id: str, brief: str) -> dict[str, Any]:
    known = {agent["agent_id"] for agent in AGENTS}
    if agent_id not in known:
        return {"success": False, "error": "Unknown role"}
    text = brief.strip()
    if len(text) > 4000:
        return {"success": False, "error": "Keep the brief under 4000 characters"}
    conn = connect()
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (f"brief:{agent_id}", text),
    )
    conn.commit()
    conn.close()
    return {"success": True, "agent_id": agent_id, "brief": text}


def set_active_provider(name: str) -> dict[str, Any]:
    if name not in ("gemini", "ollama"):
        return {"success": False, "error": "Choose Gemini or the local Ollama model."}
    conn = connect()
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES ('provider', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (name,),
    )
    conn.commit()
    conn.close()
    return {"success": True, "provider": name}


def model_configured() -> bool:
    return _model_configured()


def _model_configured() -> bool:
    placeholders = {
        "",
        "your_gemini_api_key_here",
        "your_mistral_api_key_here",
        "your_openrouter_api_key_here",
        "your_nvidia_api_key_here",
        "your_opencode_api_key_here",
        "your_xai_api_key_here",
    }
    for env_name in (
        "XAI_API_KEY",
        "GEMINI_API_KEY",
        "MISTRAL_API_KEY",
        "OPENROUTER_API_KEY",
        "NVIDIA_API_KEY",
        "GROQ_API_KEY",
    ):
        value = os.getenv(env_name, "").strip()
        if value and value not in placeholders and not value.startswith("your_"):
            return True
    return os.getenv("HACKSWARM_PROVIDER", "").strip().lower() == "ollama"


init_db()


if __name__ == "__main__":
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"[*] HackSwarm database ready at {db_path()}")
    print("[*] Phone console API: python -m uvicorn central_hub.api.app:app --host 127.0.0.1 --port 8797")
