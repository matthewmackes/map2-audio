import asyncio
from types import SimpleNamespace

import pytest

from app.services.state_authority_activation_service import StateAuthorityActivationService


class _FakeAudioEngine:
    def __init__(self):
        self.is_available = True
        self.is_running = True
        self.calls: list[tuple[dict, bool, int]] = []

    async def load_graph_document(self, document, *, use_independent_crossfade=False, max_crossfade_ms=500):
        self.calls.append((document, use_independent_crossfade, max_crossfade_ms))
        return True


class _FakeSession:
    async def flush(self):
        return None


def _build_service(fake_engine: _FakeAudioEngine, *, owner=None) -> StateAuthorityActivationService:
    async def _default_hook_plan():
        return [
            "push_footswitch_labels",
            "push_maschine_assignments",
            "push_push_surface_state",
            "push_ground_control_pro_assignments",
            "push_mcu_surface_state",
            "push_launch_control_assignments",
            "push_midi_commander_assignments",
            "push_controller_display_preview",
            "schedule_preload",
        ]

    return StateAuthorityActivationService(
        session=_FakeSession(),
        owner=owner or SimpleNamespace(
            state_authority_documents=SimpleNamespace(
                build_validated_document=lambda snapshot, normalized: {
                    "version": "2026.04",
                    "meta": {"name": "Built", "type": "snapshot"},
                    "graph": {"chains": normalized.get("chains", [])},
                }
            )
        ),
        chain_service=SimpleNamespace(),
        runtime_service_module=SimpleNamespace(),
        midi_service=SimpleNamespace(),
        get_audio_engine=lambda: fake_engine,
        push_snapshot_footswitch_labels=lambda *args, **kwargs: None,
        push_snapshot_maschine_assignments=lambda *args, **kwargs: None,
        push_snapshot_push_surface_state=lambda *args, **kwargs: None,
        push_snapshot_ground_control_pro_assignments=lambda *args, **kwargs: None,
        push_snapshot_mcu_surface_state=lambda *args, **kwargs: None,
        push_snapshot_launch_control_assignments=lambda *args, **kwargs: None,
        push_snapshot_midi_commander_assignments=lambda *args, **kwargs: None,
        push_snapshot_controller_display_preview=lambda *args, **kwargs: None,
        schedule_snapshot_preload_for_live_snapshot=lambda snapshot_id: None,
        get_activation_hook_plan=_default_hook_plan,
        build_snapshot_controller_display_preview=lambda *args, **kwargs: {},
        utcnow=lambda: None,
        safe_int=lambda value: int(value) if value is not None else None,
        safe_float=lambda value, default: float(value) if value is not None else default,
        normalize_topology_mutation_stats=lambda payload: payload or {},
        build_activation_topology_metrics=lambda before, after: {},
        snapshot_spillover_native_uris=(),
        canonical_transient_keys=set(),
        canonical_effects_loop_keys=set(),
    )


def test_apply_graph_document_to_engine_builds_document_and_uses_crossfade():
    fake_engine = _FakeAudioEngine()
    service = _build_service(fake_engine)
    snapshot = SimpleNamespace(id=7, document=None)
    normalized = {"chains": [{"plugins": [{"bypass": True}, {"bypass": False}]}]}

    result = asyncio.run(
        service.apply_graph_document_to_engine(
            snapshot=snapshot,
            normalized=normalized,
        )
    )

    # T2454-B: result now carries the dynamically-computed max_crossfade_ms.
    # This normalized fixture has no tail-bearing processors so the value is
    # the 500ms floor.
    assert result == {
        "applied": True,
        "plugin_count": 2,
        "bypass_count": 1,
        "used_independent_crossfade": True,
        "max_crossfade_ms": 500,
    }
    assert fake_engine.calls
    document, use_independent_crossfade, max_crossfade_ms = fake_engine.calls[0]
    assert document["meta"]["name"] == "Built"
    assert use_independent_crossfade is True
    assert max_crossfade_ms == 500


def test_apply_graph_document_to_engine_reuses_snapshot_document_when_present():
    fake_engine = _FakeAudioEngine()
    owner = SimpleNamespace(
        state_authority_documents=SimpleNamespace(
            build_validated_document=lambda snapshot, normalized: {"should_not": "run"}
        )
    )
    service = _build_service(fake_engine, owner=owner)
    snapshot = SimpleNamespace(
        id=8,
        document={
            "version": "2026.04",
            "meta": {"name": "Stored", "type": "snapshot"},
            "graph": {"chains": [{"plugins": []}]},
        },
    )

    result = asyncio.run(
        service.apply_graph_document_to_engine(
            snapshot=snapshot,
            normalized={"chains": []},
        )
    )

    assert result["applied"] is True
    assert fake_engine.calls[0][0]["meta"]["name"] == "Stored"


def test_activate_snapshot_marks_validating_phase_before_preflight_failure(monkeypatch):
    recorded_calls: list[tuple[str, str, str]] = []

    class _FakeRuntimeStateService:
        def __init__(self, _session):
            pass

        async def create_activation_intent(self, **kwargs):
            return {
                "request_id": "req-1",
                "snapshot_id": kwargs["snapshot_id"],
                "snapshot_revision": kwargs["snapshot_revision"],
                "triggered_by": kwargs["triggered_by"],
                "requested_at": "2026-04-06T00:00:00",
                "activation_progress": {"current_phase": "VALIDATING"},
            }

        async def mark_intent_phase(self, *, intent, phase, status="in_progress", note=None, extra=None):
            recorded_calls.append((phase, status, note or ""))
            next_intent = dict(intent)
            next_intent["activation_progress"] = {"current_phase": phase, "status": status}
            return next_intent

        async def fail_intent(self, *, intent, failure_reason, runtime_metrics=None):
            recorded_calls.append(("FAIL", str(intent.get("activation_progress", {}).get("current_phase")), failure_reason))
            return {}

    from app.services import snapshot_runtime_state_service as runtime_state_service_module

    monkeypatch.setattr(runtime_state_service_module, "SnapshotRuntimeStateService", _FakeRuntimeStateService)

    class _FakeSession:
        async def flush(self):
            return None

    snapshot = SimpleNamespace(id=5, name="Broken", document=None)

    async def _get_snapshot_model(snapshot_id):
        return snapshot if snapshot_id == 5 else None

    async def _snapshot_to_normalized(_snapshot):
        return {"chains": []}

    async def _get_snapshot(_snapshot_id):
        return {"id": 5, "name": "Broken", "revision_number": 1, "chains": [], "channels": []}

    async def _validate_snapshot_activation_preflight(_detail):
        raise ValueError("preflight failed")

    owner = SimpleNamespace(
        _get_snapshot_model=_get_snapshot_model,
        _snapshot_to_normalized=_snapshot_to_normalized,
        _snapshot_revision_from_normalized=lambda _normalized: "rev-5",
        _canonicalize_snapshot_normalized=lambda normalized: normalized,
        get_snapshot=_get_snapshot,
        _validate_snapshot_activation_preflight=_validate_snapshot_activation_preflight,
    )
    fake_engine = _FakeAudioEngine()
    service = _build_service(fake_engine, owner=owner)
    service.session = _FakeSession()

    async def _activate():
        await service.activate_snapshot(5)

    with pytest.raises(ValueError, match="preflight failed"):
        asyncio.run(_activate())

    assert recorded_calls[0] == ("VALIDATING", "in_progress", "Running activation preflight checks.")
    assert recorded_calls[-1] == ("FAIL", "VALIDATING", "preflight failed")


def test_activate_snapshot_auto_saves_missing_revision_before_creating_intent(monkeypatch):
    revision_state = {"revision_number": None}
    append_calls: list[tuple[int, int | None]] = []

    class _FakeRuntimeStateService:
        def __init__(self, _session):
            pass

        async def create_activation_intent(self, **kwargs):
            assert revision_state["revision_number"] == 1
            return {
                "request_id": "req-autosave",
                "snapshot_id": kwargs["snapshot_id"],
                "snapshot_revision": kwargs["snapshot_revision"],
                "triggered_by": kwargs["triggered_by"],
                "requested_at": "2026-04-06T00:00:00",
                "activation_progress": {"current_phase": "VALIDATING"},
            }

        async def mark_intent_phase(self, *, intent, phase, status="in_progress", note=None, extra=None):
            next_intent = dict(intent)
            next_intent["activation_progress"] = {"current_phase": phase, "status": status}
            return next_intent

        async def fail_intent(self, *, intent, failure_reason, runtime_metrics=None):
            return {}

    from app.services import snapshot_runtime_state_service as runtime_state_service_module

    monkeypatch.setattr(runtime_state_service_module, "SnapshotRuntimeStateService", _FakeRuntimeStateService)

    class _FakeSession:
        async def flush(self):
            return None

    snapshot = SimpleNamespace(id=6, name="Needs Save", document=None)

    async def _get_snapshot_model(snapshot_id):
        return snapshot if snapshot_id == 6 else None

    async def _snapshot_to_normalized(_snapshot):
        return {"chains": []}

    async def _get_snapshot(_snapshot_id):
        return {
            "id": 6,
            "name": "Needs Save",
            "chains": [],
            "channels": [],
            "routing": {"mode": "series", "series_order": []},
            "revision_number": revision_state["revision_number"],
        }

    async def _append_snapshot_revision(snapshot_id, detail):
        append_calls.append((snapshot_id, detail.get("revision_number")))
        revision_state["revision_number"] = 1
        return {"revision_number": 1}

    async def _validate_snapshot_activation_preflight(_detail):
        raise ValueError("stop after autosave")

    owner = SimpleNamespace(
        _get_snapshot_model=_get_snapshot_model,
        _snapshot_to_normalized=_snapshot_to_normalized,
        _snapshot_revision_from_normalized=lambda _normalized: "rev-6",
        _canonicalize_snapshot_normalized=lambda normalized: normalized,
        get_snapshot=_get_snapshot,
        _append_snapshot_revision=_append_snapshot_revision,
        _validate_snapshot_activation_preflight=_validate_snapshot_activation_preflight,
    )
    fake_engine = _FakeAudioEngine()
    service = _build_service(fake_engine, owner=owner)
    service.session = _FakeSession()

    async def _activate():
        await service.activate_snapshot(6)

    with pytest.raises(ValueError, match="stop after autosave"):
        asyncio.run(_activate())

    assert append_calls == [(6, None)]


def test_run_activation_hooks_uses_configured_order():
    fake_engine = _FakeAudioEngine()
    executed: list[str] = []

    async def _push_footswitch_labels(**kwargs):
        executed.append("push_footswitch_labels")

    async def _push_maschine_assignments(**kwargs):
        executed.append("push_maschine_assignments")
        return {"status": "completed"}

    async def _push_push_surface_state(**kwargs):
        executed.append("push_push_surface_state")
        return {"status": "completed"}

    async def _push_ground_control_pro_assignments(**kwargs):
        executed.append("push_ground_control_pro_assignments")
        return {"status": "completed"}

    async def _push_mcu_surface_state(**kwargs):
        executed.append("push_mcu_surface_state")
        return {"status": "completed"}

    async def _push_launch_control_assignments(**kwargs):
        executed.append("push_launch_control_assignments")

    async def _push_midi_commander_assignments(**kwargs):
        executed.append("push_midi_commander_assignments")

    async def _push_controller_display_preview(**kwargs):
        executed.append("push_controller_display_preview")

    async def _hook_plan():
        return [
            "schedule_preload",
            "push_maschine_assignments",
            "push_push_surface_state",
            "push_ground_control_pro_assignments",
            "push_mcu_surface_state",
            "push_launch_control_assignments",
            "push_midi_commander_assignments",
            "push_footswitch_labels",
            "unknown_hook",
        ]

    service = StateAuthorityActivationService(
        session=_FakeSession(),
        owner=SimpleNamespace(),
        chain_service=SimpleNamespace(),
        runtime_service_module=SimpleNamespace(),
        midi_service=SimpleNamespace(),
        get_audio_engine=lambda: fake_engine,
        push_snapshot_footswitch_labels=_push_footswitch_labels,
        push_snapshot_maschine_assignments=_push_maschine_assignments,
        push_snapshot_push_surface_state=_push_push_surface_state,
        push_snapshot_ground_control_pro_assignments=_push_ground_control_pro_assignments,
        push_snapshot_mcu_surface_state=_push_mcu_surface_state,
        push_snapshot_launch_control_assignments=_push_launch_control_assignments,
        push_snapshot_midi_commander_assignments=_push_midi_commander_assignments,
        push_snapshot_controller_display_preview=_push_controller_display_preview,
        schedule_snapshot_preload_for_live_snapshot=lambda snapshot_id: executed.append("schedule_preload"),
        get_activation_hook_plan=_hook_plan,
        build_snapshot_controller_display_preview=lambda *args, **kwargs: {},
        utcnow=lambda: None,
        safe_int=lambda value: int(value) if value is not None else None,
        safe_float=lambda value, default: float(value) if value is not None else default,
        normalize_topology_mutation_stats=lambda payload: payload or {},
        build_activation_topology_metrics=lambda before, after: {},
        snapshot_spillover_native_uris=(),
        canonical_transient_keys=set(),
        canonical_effects_loop_keys=set(),
    )
    snapshot = SimpleNamespace(id=9, name="Verse")

    results = asyncio.run(
        service._run_activation_hooks(
            snapshot=snapshot,
            refreshed_detail={"controls": {"midi_map": []}, "controller_display_preview": {"name": "Preview"}},
            preload_plan={"candidates": [{"snapshot_id": 10}, {"snapshot_id": 11}]},
        )
    )

    assert executed == [
        "schedule_preload",
        "push_maschine_assignments",
        "push_push_surface_state",
        "push_ground_control_pro_assignments",
        "push_mcu_surface_state",
        "push_launch_control_assignments",
        "push_midi_commander_assignments",
        "push_footswitch_labels",
    ]
    assert [item["hook"] for item in results] == [
        "schedule_preload",
        "push_maschine_assignments",
        "push_push_surface_state",
        "push_ground_control_pro_assignments",
        "push_mcu_surface_state",
        "push_launch_control_assignments",
        "push_midi_commander_assignments",
        "push_footswitch_labels",
        "unknown_hook",
    ]
    assert results[0]["preload_candidate_count"] == 2
    assert results[3]["status"] == "completed"
    assert results[-1]["status"] == "skipped"
    assert results[-1]["reason"] == "unknown_hook"
