"""Tests for PlatformEvent emission from the production activation service.

Parallel to `test_state_authority_platform_events.py` which covers kind
registration; this file exercises the module-level emitter helpers in
`state_authority_activation_service.py` that bridge synchronous callers
(the static-method outcome logger) to the async PlatformEventBus.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services.state_authority_activation_service import (
    _emit_activation_outcome_platform_event,
    _emit_activation_started_platform_event,
    _schedule_platform_event,
)


class _FakeBus:
    """In-memory PlatformEventBus replacement that captures every emit."""

    def __init__(self, *, raise_on_emit: bool = False):
        self.emits: list = []
        self._raise = raise_on_emit

    async def emit(self, event):  # noqa: D401
        if self._raise:
            raise RuntimeError("bus is on fire")
        self.emits.append(event)
        return event.event_id


@pytest.fixture
def fake_bus(monkeypatch):
    bus = _FakeBus()
    monkeypatch.setattr(
        "app.services.state_authority_activation_service.logger.debug",
        lambda *a, **kw: None,
    )

    def _fake_get_bus():
        return bus

    # Patch the get_platform_event_bus the module imports lazily.
    import app.services.platform_event.bus as bus_module

    monkeypatch.setattr(bus_module, "get_platform_event_bus", _fake_get_bus)
    return bus


# ---------------------------------------------------------------------------
# started event
# ---------------------------------------------------------------------------


def test_started_event_emits_info_severity_and_canonical_kind(fake_bus):
    async def _run():
        _emit_activation_started_platform_event(
            snapshot_id=42,
            snapshot_name="Sunday Lead",
            snapshot_revision="rev-1",
            request_id="req-1",
            node_id="node-A",
            triggered_by="operator",
        )
        # Give the scheduled task a chance to run
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert len(fake_bus.emits) == 1
    event = fake_bus.emits[0]
    assert event.kind == "snapshot.activation.started"
    assert event.severity == "info"
    assert event.source_service == "state_authority_activation_service"
    assert event.context["snapshot_id"] == 42
    assert event.context["request_id"] == "req-1"
    assert event.context["node_id"] == "node-A"
    assert event.context["triggered_by"] == "operator"


def test_started_event_truncates_title_to_envelope_cap(fake_bus):
    async def _run():
        _emit_activation_started_platform_event(
            snapshot_id=1,
            snapshot_name="X" * 200,  # name way over the 40-char title cap
            snapshot_revision=None,
            request_id="req",
            node_id="node",
            triggered_by="t",
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert len(fake_bus.emits) == 1
    assert len(fake_bus.emits[0].title) <= 40


def test_started_event_handles_null_snapshot_revision(fake_bus):
    async def _run():
        _emit_activation_started_platform_event(
            snapshot_id=1,
            snapshot_name="S",
            snapshot_revision=None,
            request_id="r",
            node_id="n",
            triggered_by="t",
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    event = fake_bus.emits[0]
    assert event.context["snapshot_revision"] is None


# ---------------------------------------------------------------------------
# outcome event — success
# ---------------------------------------------------------------------------


def test_outcome_success_emits_activation_ok_kind(fake_bus):
    async def _run():
        _emit_activation_outcome_platform_event(
            snapshot_id=42,
            snapshot_revision="rev-1",
            request_id="req-1",
            node_id="node-A",
            triggered_by="operator",
            outcome={
                "status": "success",
                "result_code": "live_confirmed",
                "operator_message": "Applied cleanly",
            },
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert len(fake_bus.emits) == 1
    event = fake_bus.emits[0]
    assert event.kind == "snapshot.activation.ok"
    assert event.severity == "info"
    assert "Applied cleanly" in event.message


# ---------------------------------------------------------------------------
# outcome event — degraded
# ---------------------------------------------------------------------------


def test_outcome_degraded_emits_failed_at_warning_severity(fake_bus):
    """Degraded means audio is live but authority confirmation failed —
    surface at warning so operators notice without hitting the critical
    rail."""
    async def _run():
        _emit_activation_outcome_platform_event(
            snapshot_id=42,
            snapshot_revision="rev-1",
            request_id="req-1",
            node_id="node-A",
            triggered_by="operator",
            outcome={
                "status": "degraded",
                "result_code": "authority_confirmation_failed",
                "operator_message": "Engine applied; authority not confirmed",
            },
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    event = fake_bus.emits[0]
    assert event.kind == "snapshot.activation.failed"
    assert event.severity == "warning"


def test_outcome_unknown_status_emits_failed_at_warning(fake_bus):
    """Defensive path: unrecognized status still produces a valid event."""
    async def _run():
        _emit_activation_outcome_platform_event(
            snapshot_id=1,
            snapshot_revision=None,
            request_id="r",
            node_id="n",
            triggered_by="t",
            outcome={"status": "surprise", "result_code": "weird"},
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    event = fake_bus.emits[0]
    assert event.kind == "snapshot.activation.failed"
    assert event.severity == "warning"


# ---------------------------------------------------------------------------
# resilience — bus failures + no-running-loop
# ---------------------------------------------------------------------------


def test_scheduler_silently_swallows_emit_failures(monkeypatch, caplog):
    """Plan Q10 — activation must never be blocked by a dead bus."""
    bus = _FakeBus(raise_on_emit=True)

    import app.services.platform_event.bus as bus_module
    monkeypatch.setattr(bus_module, "get_platform_event_bus", lambda: bus)

    async def _run():
        # Scheduling itself must not raise
        _schedule_platform_event(
            kind="snapshot.activation.ok",
            severity="info",
            title="x",
            message="y",
            context={},
            source_node="n",
            priority=0.3,
        )
        # Give the task a chance to run and raise inside the loop
        await asyncio.sleep(0)

    # No exception should propagate up
    asyncio.run(_run())


def test_scheduler_without_running_loop_does_not_raise(monkeypatch):
    """When called from a purely synchronous context (e.g. a CLI tool), the
    helper must not raise — it simply declines to schedule."""
    bus = _FakeBus()
    import app.services.platform_event.bus as bus_module
    monkeypatch.setattr(bus_module, "get_platform_event_bus", lambda: bus)

    # Calling without a running loop
    _schedule_platform_event(
        kind="snapshot.activation.started",
        severity="info",
        title="t",
        message="m",
        context={"snapshot_id": 1},
        source_node="n",
        priority=0.3,
    )
    # No emits because no loop was running to schedule the task on
    assert len(bus.emits) == 0


def test_scheduler_tolerates_bus_import_failure(monkeypatch):
    """If the platform_event module is unavailable for any reason, emission
    is silently skipped (plan Q10)."""
    import app.services.state_authority_activation_service as svc

    async def _run():
        # Sabotage the module-level import path inside the helper
        def _raise(*_args, **_kwargs):
            raise ImportError("module not available")

        # The helper catches any Exception during its inline import, so
        # even if get_platform_event_bus blows up we don't propagate.
        import app.services.platform_event.bus as bus_module
        monkeypatch.setattr(
            bus_module,
            "get_platform_event_bus",
            _raise,
        )
        svc._schedule_platform_event(
            kind="snapshot.activation.ok",
            severity="info",
            title="t",
            message="m",
            context={},
            source_node="n",
            priority=0.3,
        )
        await asyncio.sleep(0)

    # No exception should propagate
    asyncio.run(_run())
