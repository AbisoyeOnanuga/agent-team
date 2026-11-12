from pathlib import Path

from fastapi.testclient import TestClient

from central_hub.api.scale import SCALE_API_REV, SCALE_SLOT_MAX, TEAM_MAX
from central_hub.mcp_server import server as store


def test_configured_shape_survives_free_plan(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'scale.db'}")
    store.init_db()

    assert store.set_plan("scale")["success"] is True
    assert store.set_team_size(7)["configured_team_size"] == 7
    assert store.set_scale_slots(18)["configured_scale_slots"] == 18
    assert store.team_size() == 7
    assert store.max_lanes() == 18
    assert len(store.team_roster()) == 7

    assert store.set_plan("free")["success"] is True
    assert store.configured_team_size() == 7
    assert store.configured_scale_slots() == 18
    assert store.team_size() == 3
    assert store.max_lanes() == 2

    board = store.board_snapshot()
    assert board["configured_team_size"] == 7
    assert board["configured_scale_slots"] == 18
    assert board["team_size"] == 3
    assert board["scale_slots"] == 2
    assert board["slot_max"] == SCALE_SLOT_MAX
    assert board["team_max"] == TEAM_MAX
    assert board["scale_api_rev"] == SCALE_API_REV
    assert any("Free is on" in note for note in board["scale_warnings"])

    assert store.set_plan("scale")["success"] is True
    assert store.team_size() == 7
    assert store.max_lanes() == 18


def test_plan_api_accepts_factory_width(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'plan.db'}")
    monkeypatch.setenv("CONSOLE_PIN", "2468")
    monkeypatch.setenv("HACKSWARM_WORKER", "0")
    store.init_db()
    store.sync_pin_from_env()

    from central_hub.api.app import app

    client = TestClient(app)
    assert client.post("/api/session", json={"pin": "2468"}).status_code == 200
    rejected = client.put("/api/plan", json={"plan": "scale", "scale_slots": 6})
    assert rejected.status_code == 200
    wide = client.put(
        "/api/plan",
        json={"plan": "scale", "team_size": 12, "scale_slots": 24},
    )
    assert wide.status_code == 200, wide.text
    body = wide.json()
    assert body["configured_team_size"] == 12
    assert body["configured_scale_slots"] == 24
    assert body["team_size"] == 12
    assert body["scale_slots"] == 24
