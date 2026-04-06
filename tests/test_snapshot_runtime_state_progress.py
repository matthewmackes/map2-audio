import asyncio

from app import database as database_module
from app.database import Snapshot
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-runtime-progress.db'}")


class _FakeWSManager:
    def __init__(self) -> None:
        self.messages: list[tuple[str, dict]] = []

    async def broadcast_json(self, payload, *, topic):
        self.messages.append((topic, payload))


def test_runtime_state_service_tracks_activation_phase_progress(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    fake_ws = _FakeWSManager()

    from app.services import websocket_manager

    monkeypatch.setattr(websocket_manager, "ws_manager", fake_ws)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=11, name="Verse A"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=11,
            snapshot_name="Verse A",
            snapshot_revision="rev-11",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        intent = await service.mark_intent_phase(
            intent=intent,
            phase="VALIDATING",
            status="in_progress",
            note="Checking snapshot dependencies.",
        )
        intent = await service.mark_intent_phase(
            intent=intent,
            phase="VALIDATING",
            status="completed",
            note="Validation passed.",
        )
        live_state = await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 11, "name": "Verse A", "live_state": {"paths": []}},
            runtime_metrics={"params_applied": 2},
        )
        events = await service.list_activation_events(limit=1)
        return live_state, events

    live_state, events = asyncio.run(_run())

    progress = live_state["runtime_metrics"]["activation_progress"]
    assert progress["current_phase"] == "LIVE"
    assert progress["status"] == "completed"
    assert progress["completed_phases"] == ["VALIDATING", "LIVE"]
    assert [entry["phase"] for entry in progress["phase_history"]] == [
        "VALIDATING",
        "VALIDATING",
        "LIVE",
    ]
    assert events[0]["runtime_metrics"]["activation_progress"]["current_phase"] == "LIVE"
    assert any(topic == "snapshot_activation_events" for topic, _payload in fake_ws.messages)


def test_runtime_state_service_marks_current_phase_failed(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=12, name="Bridge"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=12,
            snapshot_name="Bridge",
            snapshot_revision="rev-12",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        intent = await service.mark_intent_phase(
            intent=intent,
            phase="APPLYING",
            status="in_progress",
            note="Applying engine state.",
        )
        failed_state = await service.fail_intent(
            intent=intent,
            failure_reason="Engine apply failed.",
            runtime_metrics={"reason": "apply_failed"},
        )
        events = await service.list_activation_events(limit=1)
        return failed_state, events

    failed_state, events = asyncio.run(_run())

    progress = failed_state["runtime_metrics"]["activation_progress"]
    assert progress["current_phase"] == "APPLYING"
    assert progress["status"] == "failed"
    assert progress["note"] == "Engine apply failed."
    assert progress["completed_phases"] == []
    assert events[0]["outcome"] == "failed"
    assert events[0]["runtime_metrics"]["activation_progress"]["current_phase"] == "APPLYING"
