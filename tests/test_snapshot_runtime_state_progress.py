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


def test_activation_intent_includes_typed_blockers_and_confirmation_maps(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    monkeypatch.setattr(runtime_state_module, "resolve_local_node_id", lambda: "node-local")

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=16, name="Publish Test"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=16,
            snapshot_name="Publish Test",
            snapshot_revision="rev-16",
            normalized_snapshot_payload={
                "paths": [
                    {"id": "ch_a", "label": "A", "owner_node_id": "rack-1"},
                    {"id": "ch_b", "label": "B"},
                ]
            },
            triggered_by="ui",
        )
        intent = await service.mark_intent_phase(
            intent=intent,
            phase="APPLYING",
            status="in_progress",
            extra={
                "warnings": [
                    {
                        "id": "node_sync_pending:rack-1",
                        "code": "node_sync_pending",
                        "severity": "warning",
                        "scope": "node",
                        "title": "Waiting for confirmation",
                        "operator_message": "Rack-1 has not confirmed this snapshot yet.",
                        "recommended_action": "Wait for confirmation",
                        "related_node_ids": ["rack-1"],
                    }
                ]
            },
        )
        events = await service.list_activation_events(limit=1)
        return intent, events

    intent, events = asyncio.run(_run())

    assert intent["blockers"] == []
    assert intent["warnings"][0]["code"] == "node_sync_pending"
    assert sorted(intent["node_confirmations"]) == ["node-local", "rack-1"]
    assert intent["node_confirmations"]["rack-1"]["status"] == "waiting"
    assert intent["channel_confirmations"]["ch_a"]["status"] == "waiting"
    assert intent["channel_confirmations"]["ch_a"]["related_node_id"] == "rack-1"
    assert events[0]["runtime_metrics"]["warnings"][0]["code"] == "node_sync_pending"


def test_confirm_and_fail_intents_update_confirmation_contracts(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    monkeypatch.setattr(runtime_state_module, "resolve_local_node_id", lambda: "node-local")

    async def _run_success():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=17, name="Success"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=17,
            snapshot_name="Success",
            snapshot_revision="rev-17",
            normalized_snapshot_payload={"paths": [{"id": "ch_a", "label": "A"}]},
            triggered_by="ui",
        )
        intent = await service.mark_intent_phase(intent=intent, phase="VERIFYING", status="in_progress")
        live_state = await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 17, "name": "Success", "live_state": {"paths": []}},
            runtime_metrics={},
        )
        success_events = await service.list_activation_events(limit=1)
        return live_state, success_events

    async def _run_failure():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=18, name="Failure"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=18,
            snapshot_name="Failure",
            snapshot_revision="rev-18",
            normalized_snapshot_payload={"paths": [{"id": "ch_z", "label": "Z"}]},
            triggered_by="ui",
        )
        intent = await service.mark_intent_phase(intent=intent, phase="APPLYING", status="in_progress")
        failed_state = await service.fail_intent(
            intent=intent,
            failure_reason="Engine rejected the publish request.",
            runtime_metrics={},
        )
        failure_events = await service.list_activation_events(limit=1)
        return failed_state, failure_events

    live_state, success_events = asyncio.run(_run_success())
    failed_state, failure_events = asyncio.run(_run_failure())

    assert live_state["runtime_metrics"]["node_confirmations"]["node-local"]["status"] == "confirmed"
    assert live_state["runtime_metrics"]["channel_confirmations"]["ch_a"]["status"] == "confirmed"
    assert success_events[0]["runtime_metrics"]["blockers"] == []

    assert failed_state["runtime_metrics"]["blockers"][0]["code"] == "engine_apply_failed"
    assert failed_state["runtime_metrics"]["blockers"][0]["repair_action_id"] == "retry_publish"
    assert failed_state["runtime_metrics"]["node_confirmations"]["node-local"]["status"] == "failed"
    assert failed_state["runtime_metrics"]["channel_confirmations"]["ch_z"]["status"] == "failed"
    assert failure_events[0]["runtime_metrics"]["blockers"][0]["code"] == "engine_apply_failed"


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


def test_record_retained_runtime_edit_persists_bounded_audit_trail_and_broadcasts(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    fake_ws = _FakeWSManager()

    from app.services import websocket_manager

    monkeypatch.setattr(websocket_manager, "ws_manager", fake_ws)
    monkeypatch.setattr(runtime_state_module, "RETAINED_RUNTIME_EDIT_LIMIT", 2)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=19, name="Live Edit Audit"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=19,
            snapshot_name="Live Edit Audit",
            snapshot_revision="rev-19",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 19, "name": "Live Edit Audit", "live_state": {"paths": []}},
            runtime_metrics={"preload": {"status": "ready"}},
        )
        await service.record_retained_runtime_edit(
            snapshot_id=19,
            snapshot_revision="rev-19",
            mutation_kind="update_snapshot",
            triggered_by="snapshot_service.update_snapshot",
            metadata={"changed_fields": ["name"]},
        )
        await service.record_retained_runtime_edit(
            snapshot_id=19,
            snapshot_revision="rev-19",
            mutation_kind="update_routing",
            triggered_by="snapshot_service.update_routing",
            metadata={"changed_fields": ["mode"]},
        )
        await service.record_retained_runtime_edit(
            snapshot_id=19,
            snapshot_revision="rev-19b",
            mutation_kind="replace_midi_map",
            triggered_by="snapshot_service.replace_midi_map",
            metadata={"entry_count": 2},
        )
        return await service.get_live_state()

    live_state = asyncio.run(_run())

    retained_runtime_edits = live_state["runtime_metrics"]["retained_runtime_edits"]
    assert [entry["mutation_kind"] for entry in retained_runtime_edits] == [
        "update_routing",
        "replace_midi_map",
    ]
    assert retained_runtime_edits[-1]["snapshot_revision"] == "rev-19b"
    assert retained_runtime_edits[-1]["metadata"]["entry_count"] == 2
    assert live_state["runtime_metrics"]["last_retained_runtime_edit_kind"] == "replace_midi_map"
    assert live_state["runtime_metrics"]["last_retained_runtime_edit_triggered_by"] == (
        "snapshot_service.replace_midi_map"
    )
    assert live_state["snapshot_revision"] == "rev-19b"
    assert any(topic == "snapshot_runtime_live_state" for topic, _payload in fake_ws.messages)


def test_record_authority_publication_result_updates_live_state_and_activation_event(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    fake_ws = _FakeWSManager()

    from app.services import websocket_manager

    monkeypatch.setattr(websocket_manager, "ws_manager", fake_ws)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=20, name="Authority Publication"))
            await session.flush()
        service = SnapshotRuntimeStateService()
        intent = await service.create_activation_intent(
            snapshot_id=20,
            snapshot_name="Authority Publication",
            snapshot_revision="rev-20",
            normalized_snapshot_payload={"chains": []},
            triggered_by="ui",
        )
        await service.confirm_live_intent(
            intent=intent,
            live_snapshot_payload={"id": 20, "name": "Authority Publication", "live_state": {"paths": []}},
            runtime_metrics={},
        )
        live_state = await service.record_authority_publication_result(
            snapshot_id=20,
            request_id=str(intent["request_id"]),
            authority_publication={
                "status": "failed",
                "reason": "authority_confirmation_failed",
                "checked_at": "2026-04-16T01:15:00+00:00",
                "technical_detail": "committed authority write failed",
            },
        )
        events = await service.list_activation_events(limit=1)
        return live_state, events

    live_state, events = asyncio.run(_run())

    assert live_state["runtime_metrics"]["authority_publication"]["status"] == "failed"
    assert live_state["runtime_metrics"]["last_authority_publication_at"] == "2026-04-16T01:15:00+00:00"
    assert events[0]["outcome"] == "degraded"
    assert events[0]["failure_reason"] == "authority_confirmation_failed"
    assert events[0]["runtime_metrics"]["authority_publication"]["technical_detail"] == (
        "committed authority write failed"
    )
    assert any(topic == "snapshot_activation_events" for topic, _payload in fake_ws.messages)


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
