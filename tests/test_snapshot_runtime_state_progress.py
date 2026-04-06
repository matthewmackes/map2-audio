import asyncio
from datetime import datetime, timedelta, timezone

from app import database as database_module
from app.database import Snapshot
from app.services import snapshot_runtime_state_service as runtime_state_module
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


def test_refresh_live_snapshot_health_records_reconciliation_metrics(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    reports: list[dict] = []

    class _FakeReconciliationService:
        async def reconcile_live_snapshot_payload(self, live_snapshot_payload, **kwargs):
            reports.append({"payload": live_snapshot_payload, **kwargs})
            return {
                "checked_at": "2026-04-06T12:00:00+00:00",
                "status": "healthy",
                "correction_count": 0,
                "reactivation_required": False,
            }

    monkeypatch.setattr(
        runtime_state_module,
        "StateAuthorityReconciliationService",
        lambda: _FakeReconciliationService(),
    )

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=13, name="Chorus"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=13,
            snapshot_name="Chorus",
            snapshot_revision="rev-13",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 13, "name": "Chorus", "chains": [], "live_state": {"paths": []}},
            runtime_metrics={},
        )
        return await service.refresh_live_snapshot_health(source="post_activation", emit=False)

    live_state = asyncio.run(_run())

    assert len(reports) == 1
    assert reports[0]["apply_corrections"] is True
    reconciliation = live_state["runtime_metrics"]["state_authority_reconciliation"]
    assert reconciliation["status"] == "healthy"
    assert reconciliation["source"] == "post_activation"
    assert live_state["runtime_metrics"]["last_state_authority_reconciliation_source"] == "post_activation"


def test_refresh_live_snapshot_health_skips_reconciliation_within_interval(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    call_count = 0

    class _FakeReconciliationService:
        async def reconcile_live_snapshot_payload(self, live_snapshot_payload, **kwargs):
            nonlocal call_count
            call_count += 1
            return {"checked_at": datetime.now(timezone.utc).isoformat(), "status": "healthy", "correction_count": 0}

    monkeypatch.setattr(
        runtime_state_module,
        "StateAuthorityReconciliationService",
        lambda: _FakeReconciliationService(),
    )

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=14, name="Verse"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=14,
            snapshot_name="Verse",
            snapshot_revision="rev-14",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 14, "name": "Verse", "chains": [], "live_state": {"paths": []}},
            runtime_metrics={
                "state_authority_reconciliation": {
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                    "status": "healthy",
                }
            },
        )
        return await service.refresh_live_snapshot_health(source="continuous_watch", emit=False)

    live_state = asyncio.run(_run())

    assert call_count == 0
    assert live_state["runtime_metrics"]["state_authority_reconciliation"]["status"] == "healthy"


def test_refresh_live_snapshot_health_reruns_reconciliation_after_interval(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    call_count = 0

    class _FakeReconciliationService:
        async def reconcile_live_snapshot_payload(self, live_snapshot_payload, **kwargs):
            nonlocal call_count
            call_count += 1
            return {
                "checked_at": "2026-04-06T12:05:00+00:00",
                "status": "self_healed",
                "correction_count": 2,
                "reactivation_required": False,
            }

    monkeypatch.setattr(
        runtime_state_module,
        "StateAuthorityReconciliationService",
        lambda: _FakeReconciliationService(),
    )

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=15, name="Bridge"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=15,
            snapshot_name="Bridge",
            snapshot_revision="rev-15",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 15, "name": "Bridge", "chains": [], "live_state": {"paths": []}},
            runtime_metrics={
                "state_authority_reconciliation": {
                    "checked_at": (datetime.now(timezone.utc) - timedelta(seconds=6)).isoformat(),
                    "status": "healthy",
                }
            },
        )
        return await service.refresh_live_snapshot_health(source="continuous_watch", emit=False)

    live_state = asyncio.run(_run())

    assert call_count == 1
    reconciliation = live_state["runtime_metrics"]["state_authority_reconciliation"]
    assert reconciliation["status"] == "self_healed"
    assert reconciliation["correction_count"] == 2
    assert live_state["runtime_metrics"]["last_state_authority_correction_at"] == "2026-04-06T12:05:00+00:00"


def test_cluster_reconciliation_report_summarizes_node_statuses(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _fake_cluster_live_state(self):
        return {
            "local_node_id": "node-a",
            "generated_at": "2026-04-06T12:10:00+00:00",
            "count": 3,
            "nodes": [
                {
                    "node_id": "node-a",
                    "state": "live",
                    "snapshot_id": 1,
                    "snapshot_revision": "rev-a",
                    "snapshot_name": "Verse",
                    "display_state": "live",
                    "display_label": "Live",
                    "runtime_metrics": {
                        "state_authority_reconciliation": {
                            "checked_at": "2026-04-06T12:10:00+00:00",
                            "status": "healthy",
                            "correction_count": 0,
                        }
                    },
                },
                {
                    "node_id": "node-b",
                    "state": "live",
                    "snapshot_id": 1,
                    "snapshot_revision": "rev-a",
                    "snapshot_name": "Verse",
                    "display_state": "live",
                    "display_label": "Live",
                    "runtime_metrics": {
                        "state_authority_reconciliation": {
                            "checked_at": "2026-04-06T12:10:00+00:00",
                            "status": "self_healed",
                            "correction_count": 2,
                            "parameter_drift_count": 2,
                        }
                    },
                },
                {
                    "node_id": "node-c",
                    "state": "live",
                    "snapshot_id": 1,
                    "snapshot_revision": "rev-a",
                    "snapshot_name": "Verse",
                    "display_state": "live",
                    "display_label": "Live",
                    "runtime_metrics": {
                        "state_authority_reconciliation": {
                            "checked_at": "2026-04-06T12:10:00+00:00",
                            "status": "reactivation_required",
                            "correction_count": 0,
                            "reactivation_required": True,
                            "topology_drift": True,
                        }
                    },
                },
            ],
        }

    monkeypatch.setattr(SnapshotRuntimeStateService, "get_cluster_live_state", _fake_cluster_live_state)

    report = asyncio.run(SnapshotRuntimeStateService().get_cluster_reconciliation_report())

    assert report["count"] == 3
    assert report["healthy_nodes"] == 1
    assert report["drifted_nodes"] == 2
    assert report["self_healed_nodes"] == 1
    assert report["reactivation_required_nodes"] == 1
    assert report["correction_total"] == 2
