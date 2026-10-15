import subprocess
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from central_hub.mcp_server import server as store
from central_hub.worker.runner import process_available


def _repo(path: Path) -> Path:
    path.mkdir()
    subprocess.run(["git", "init"], cwd=path, check=True, capture_output=True)
    return path


def _wait_for(predicate, timeout: float = 8):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.1)
    raise AssertionError("timed out")


def test_pin_lockout_and_repo_roots(tmp_path: Path, monkeypatch):
    store.clear_pin_attempts()
    assert store.pin_locked() is False
    for _ in range(8):
        store.register_pin_failure()
    assert store.pin_locked() is True
    store.clear_pin_attempts()

    allowed = tmp_path / "projects"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("HACKSWARM_REPO_ROOTS", str(allowed))
    assert store.repo_allowed(allowed) is True
    assert store.repo_allowed(outside) is False
    monkeypatch.delenv("HACKSWARM_REPO_ROOTS", raising=False)


def test_pin_policy_and_commit_gate(tmp_path: Path):
    store.init_db()
    store.sync_pin_from_env()
    repo = _repo(tmp_path / "scratch")

    from central_hub.api.app import app

    client = TestClient(app)
    assert client.post("/api/session", json={"pin": "0000"}).status_code == 401
    assert client.post("/api/session", json={"pin": "2468"}).status_code == 200
    assert client.get("/api/board").status_code == 200

    saved = client.put(
        "/api/projects",
        json={"agent_id": "agent-ui", "repo_path": str(repo)},
    )
    assert saved.status_code == 200

    locked = client.put(
        "/api/policy",
        json={"action_class": "git_push", "mode": "act_and_notify"},
    )
    assert locked.status_code == 400

    created = client.post(
        "/api/tasks",
        json={
            "title": "Leave a scratch note",
            "prompt": "Add a scratch note for the walk test",
            "agent_id": "agent-ui",
            "files": [".hackswarm/notes.md"],
        },
    )
    assert created.status_code == 200
    task_id = created.json()["task_id"]

    worker = threading.Thread(target=process_available, daemon=True)
    worker.start()
    _wait_for(lambda: store.list_approvals("pending"))
    pending = store.list_approvals("pending")
    assert pending[0]["action_class"] == "git_commit"
    assert pending[0]["task_id"] == task_id
    note = repo / ".hackswarm" / "notes.md"
    assert "scratch note" in note.read_text(encoding="utf-8")
    assert subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True).returncode != 0

    stopped = client.post(
        "/api/approvals",
        json={"id": pending[0]["id"], "decision": "stop"},
    )
    assert stopped.status_code == 200
    worker.join(timeout=5)
    assert not worker.is_alive()
    assert store.get_task(task_id)["status"] == "PARKED"
    assert store.get_task(task_id)["locks"] == []


def test_proceed_commits_locally(tmp_path: Path):
    store.init_db()
    repo = _repo(tmp_path / "commit-scratch")
    store.set_project_path("agent-api", str(repo))
    created = store.create_task(
        "Commit the note",
        "Write the note and stop at the done gate",
        "agent-api",
        [".hackswarm/notes.md"],
    )
    task_id = created["task_id"]
    worker = threading.Thread(target=process_available, daemon=True)
    worker.start()
    _wait_for(
        lambda: any(
            row["action_class"] == "git_commit" and row["task_id"] == task_id
            for row in store.list_approvals("pending")
        )
    )
    gate = next(
        row
        for row in store.list_approvals("pending")
        if row["task_id"] == task_id and row["action_class"] == "git_commit"
    )
    assert store.decide_approval(gate["id"], "proceed")["success"]
    _wait_for(
        lambda: any(
            row["action_class"] == "mark_done" and row["task_id"] == task_id
            for row in store.list_approvals("pending")
        )
    )
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True)
    assert head.returncode == 0
    done = next(
        row
        for row in store.list_approvals("pending")
        if row["task_id"] == task_id and row["action_class"] == "mark_done"
    )
    store.decide_approval(done["id"], "stop")
    worker.join(timeout=5)
    assert store.get_task(task_id)["status"] == "PARKED"
