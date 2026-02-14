import asyncio
import json

from app.routes import snapshots


def test_snapshot_store_roundtrip(tmp_path, monkeypatch):
    store_path = tmp_path / "engine_snapshots.json"
    monkeypatch.setattr(snapshots, "_snapshot_store_path", store_path)

    with snapshots._snapshot_lock:
        snapshots._snapshots = snapshots._default_snapshot_store()
        snapshots._snapshots[2] = {
            "id": 2,
            "name": "Lead Tone",
            "has_data": True,
            "plugin_states": [{"chain_id": 1, "plugins": [{"uri": "urn:test:plugin"}]}],
        }
        snapshots._current_snapshot = 2

    snapshots._persist_snapshots_to_disk()

    with snapshots._snapshot_lock:
        snapshots._snapshots = snapshots._default_snapshot_store()
        snapshots._current_snapshot = 0

    snapshots._load_snapshots_from_disk()

    with snapshots._snapshot_lock:
        assert snapshots._current_snapshot == 2
        assert snapshots._snapshots[2]["name"] == "Lead Tone"
        assert snapshots._snapshots[2]["has_data"] is True
        assert snapshots._snapshots[2]["plugin_states"][0]["chain_id"] == 1


def test_load_invalid_snapshot_file_keeps_defaults(tmp_path, monkeypatch):
    store_path = tmp_path / "engine_snapshots.json"
    store_path.write_text("{not-json", encoding="utf-8")
    monkeypatch.setattr(snapshots, "_snapshot_store_path", store_path)

    with snapshots._snapshot_lock:
        snapshots._snapshots = snapshots._default_snapshot_store()
        snapshots._current_snapshot = 0

    snapshots._load_snapshots_from_disk()

    with snapshots._snapshot_lock:
        assert snapshots._current_snapshot == 0
        assert snapshots._snapshots[0]["has_data"] is False
        assert len(snapshots._snapshots) == 6


def test_delete_snapshot_persists_default_slot(tmp_path, monkeypatch):
    store_path = tmp_path / "engine_snapshots.json"
    monkeypatch.setattr(snapshots, "_snapshot_store_path", store_path)

    with snapshots._snapshot_lock:
        snapshots._snapshots = snapshots._default_snapshot_store()
        snapshots._snapshots[1] = {
            "id": 1,
            "name": "Will Be Cleared",
            "has_data": True,
            "plugin_states": [{"chain_id": 9}],
        }

    asyncio.run(snapshots.delete_snapshot(1))

    payload = json.loads(store_path.read_text(encoding="utf-8"))
    slot = next(item for item in payload["snapshots"] if item["id"] == 1)
    assert slot["name"] == "Snapshot 2"
    assert slot["has_data"] is False
    assert slot["plugin_states"] == []
