"""T2534: realtime activation-step streaming.

Focused unit tests for ``SnapshotRuntimeStateService.emit_activation_step`` —
the best-effort emitter that broadcasts per-step activation progress (with the
"warming" flag) over the snapshot_activation_events WS topic.
"""

import pytest

from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService


def _service_without_init() -> SnapshotRuntimeStateService:
    # Bypass __init__ (it resolves node identity / DB) — emit_activation_step
    # only needs local_node_id + _broadcast_activation_event.
    svc = SnapshotRuntimeStateService.__new__(SnapshotRuntimeStateService)
    svc.local_node_id = "NODE-TEST"
    return svc


@pytest.mark.asyncio
async def test_emit_activation_step_builds_full_payload():
    svc = _service_without_init()
    captured: dict = {}

    async def fake_broadcast(payload, *, emitted_at):
        captured["payload"] = payload
        captured["emitted_at"] = emitted_at

    svc._broadcast_activation_event = fake_broadcast  # type: ignore[method-assign]

    await svc.emit_activation_step(
        request_id="req-1",
        snapshot_id=7,
        node_id=None,  # should fall back to local_node_id
        phase="STAGING",
        step="audio_device_bindings",
        status="warming",
        index=3,
        subsystem="engine",
        elapsed_ms=1234.567,
        warming=True,
        warming_subsystem="engine",
        note="Waiting for engine…",
    )

    payload = captured["payload"]
    assert payload["kind"] == "activation_step"
    assert payload["request_id"] == "req-1"
    assert payload["snapshot_id"] == 7
    assert payload["node_id"] == "NODE-TEST"
    assert payload["step"] == "audio_device_bindings"
    assert payload["status"] == "warming"
    assert payload["index"] == 3
    assert payload["subsystem"] == "engine"
    assert payload["elapsed_ms"] == 1234.6  # rounded to 1dp
    assert payload["warming"] is True
    assert payload["warming_subsystem"] == "engine"
    assert payload["note"] == "Waiting for engine…"
    assert isinstance(payload["phase"], str) and payload["phase"]
    assert "at" in payload


@pytest.mark.asyncio
async def test_emit_activation_step_null_elapsed_and_explicit_node():
    svc = _service_without_init()
    captured: dict = {}

    async def fake_broadcast(payload, *, emitted_at):
        captured["payload"] = payload

    svc._broadcast_activation_event = fake_broadcast  # type: ignore[method-assign]

    await svc.emit_activation_step(
        request_id="req-2",
        snapshot_id=None,
        node_id="NODE-OTHER",
        phase="APPLYING",
        step="engine_graph_apply",
        status="started",
        index=1,
    )

    payload = captured["payload"]
    assert payload["node_id"] == "NODE-OTHER"
    assert payload["snapshot_id"] is None
    assert payload["elapsed_ms"] is None
    assert payload["warming"] is False
    assert payload["subsystem"] is None
