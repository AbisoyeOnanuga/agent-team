from pathlib import Path

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
    assert any("Free is on" in note for note in board["scale_warnings"])

    assert store.set_plan("scale")["success"] is True
    assert store.team_size() == 7
    assert store.max_lanes() == 18
