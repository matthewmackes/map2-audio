"""Tests for the activation state machine (plan §Activation)."""

from __future__ import annotations

import asyncio

import pytest

from app.services.snapshot_activation_fsm import (
    ActivationFailedError,
    ActivationHookConfig,
    ActivationPhase,
    ActivationResult,
    DEFAULT_PHASE_TIMEOUTS_MS,
    PhaseProgressEvent,
    SnapshotActivationFSM,
    TOTAL_ACTIVATION_TIMEOUT_MS,
    load_activation_hooks_from_config,
    phase_is_past_apply_boundary,
    phase_order,
)


def _collect_events() -> tuple[list[PhaseProgressEvent], callable]:
    events: list[PhaseProgressEvent] = []
    async def publish(event: PhaseProgressEvent) -> None:
        events.append(event)
    return events, publish


async def _ok(phase_name: str):
    async def _handler(ctx):
        ctx.setdefault("trace", []).append(phase_name)
        return {"handler": phase_name}
    return _handler


def test_phase_order_covers_all_states():
    order = phase_order()
    assert order[0] == ActivationPhase.IDLE
    assert order[-1] == ActivationPhase.LIVE
    assert ActivationPhase.VALIDATING in order
    assert ActivationPhase.STAGING in order
    assert ActivationPhase.APPLYING in order
    assert ActivationPhase.VERIFYING in order


def test_apply_boundary_correctly_identifies_audio_stopping_phases():
    """Q65 — failure during/after APPLYING must stop audio, before must keep old."""
    assert phase_is_past_apply_boundary(ActivationPhase.APPLYING)
    assert phase_is_past_apply_boundary(ActivationPhase.VERIFYING)
    assert phase_is_past_apply_boundary(ActivationPhase.LIVE)
    assert not phase_is_past_apply_boundary(ActivationPhase.VALIDATING)
    assert not phase_is_past_apply_boundary(ActivationPhase.STAGING)
    assert not phase_is_past_apply_boundary(ActivationPhase.IDLE)


def test_default_total_timeout_is_ten_seconds():
    """Q24 — auto-stop-and-report after 10 seconds total."""
    assert TOTAL_ACTIVATION_TIMEOUT_MS == 10_000


def test_default_phase_timeouts_sum_within_total_budget():
    total_per_phase = sum(DEFAULT_PHASE_TIMEOUTS_MS.values())
    # Leave some budget for cross-phase overhead
    assert total_per_phase <= TOTAL_ACTIVATION_TIMEOUT_MS


def test_happy_path_runs_all_phases_and_reaches_live():
    events, publish = _collect_events()
    fsm = SnapshotActivationFSM(
        validator=asyncio.run(_ok("validating")),
        stager=asyncio.run(_ok("staging")),
        applier=asyncio.run(_ok("applying")),
        verifier=asyncio.run(_ok("verifying")),
        publish_progress=publish,
    )
    result = asyncio.run(fsm.activate("snap-1"))
    assert result.success
    assert result.phase == ActivationPhase.LIVE
    assert result.failed_phase is None
    event_phases = [evt.phase for evt in events]
    assert event_phases == [
        ActivationPhase.VALIDATING,
        ActivationPhase.STAGING,
        ActivationPhase.APPLYING,
        ActivationPhase.VERIFYING,
        ActivationPhase.LIVE,
    ]


def test_failure_in_validating_stays_before_apply_boundary():
    async def _fail(_ctx):
        raise RuntimeError("schema mismatch")
    events, publish = _collect_events()
    fsm = SnapshotActivationFSM(validator=_fail, publish_progress=publish)
    result = asyncio.run(fsm.activate("snap-2"))
    assert not result.success
    assert result.phase == ActivationPhase.FAILED
    assert result.failed_phase == ActivationPhase.VALIDATING
    assert not phase_is_past_apply_boundary(result.failed_phase)


def test_failure_in_applying_crosses_apply_boundary_so_audio_must_stop():
    async def _ok_h(_ctx):
        return {}
    async def _fail(_ctx):
        raise RuntimeError("engine rejected ValueTree")
    fsm = SnapshotActivationFSM(validator=_ok_h, stager=_ok_h, applier=_fail)
    result = asyncio.run(fsm.activate("snap-3"))
    assert not result.success
    assert result.failed_phase == ActivationPhase.APPLYING
    assert phase_is_past_apply_boundary(result.failed_phase)


def test_phase_timeout_fires_and_reports_correct_phase():
    async def _ok_h(_ctx):
        return {}
    async def _slow(_ctx):
        await asyncio.sleep(1.0)
    fsm = SnapshotActivationFSM(
        validator=_ok_h,
        stager=_slow,
        phase_timeouts_ms={ActivationPhase.STAGING: 50},
    )
    result = asyncio.run(fsm.activate("snap-4"))
    assert not result.success
    assert result.failed_phase == ActivationPhase.STAGING
    assert "50ms" in result.error


def test_total_timeout_caps_runaway_activation():
    async def _ok_h(_ctx):
        return {}
    async def _very_slow(_ctx):
        await asyncio.sleep(5.0)
    fsm = SnapshotActivationFSM(
        validator=_ok_h,
        stager=_very_slow,
        total_timeout_ms=200,
        phase_timeouts_ms={ActivationPhase.STAGING: 10_000},
    )
    result = asyncio.run(fsm.activate("snap-5"))
    assert not result.success
    assert "200ms" in (result.error or "")


def test_hooks_run_during_verifying_and_report_status():
    called: list[str] = []
    async def _hook_ok(_ctx):
        called.append("midi_map_sync")
    async def _hook_err(_ctx):
        raise RuntimeError("expression offline")

    def resolver(module: str, function: str):
        if function == "sync_midi_map":
            return _hook_ok
        if function == "sync_expression":
            return _hook_err
        return None

    hooks = (
        ActivationHookConfig(name="midi_map_sync", module="m", function="sync_midi_map"),
        ActivationHookConfig(name="expression_sync", module="m", function="sync_expression"),
    )
    async def _ok_h(_ctx):
        return {}
    fsm = SnapshotActivationFSM(
        validator=_ok_h,
        stager=_ok_h,
        applier=_ok_h,
        verifier=_ok_h,
        hooks=hooks,
        hook_resolver=resolver,
    )
    result = asyncio.run(fsm.activate("snap-6"))
    assert result.success
    statuses = {r["name"]: r["status"] for r in result.hook_results}
    assert statuses["midi_map_sync"] == "ok"
    assert statuses["expression_sync"] == "error"  # warn-only, activation succeeded


def test_hook_with_abort_on_error_fails_activation():
    async def _hook_err(_ctx):
        raise RuntimeError("must-abort hook")
    def resolver(_m, _f):
        return _hook_err
    hooks = (
        ActivationHookConfig(name="abort_hook", module="m", function="f", on_error="abort"),
    )
    async def _ok_h(_ctx):
        return {}
    fsm = SnapshotActivationFSM(
        validator=_ok_h, stager=_ok_h, applier=_ok_h, verifier=_ok_h,
        hooks=hooks, hook_resolver=resolver,
    )
    result = asyncio.run(fsm.activate("snap-7"))
    assert not result.success
    assert result.failed_phase == ActivationPhase.VERIFYING


def test_disabled_hooks_are_skipped_with_status_disabled():
    hooks = (
        ActivationHookConfig(name="off", module="m", function="f", enabled=False),
    )
    async def _ok_h(_ctx):
        return {}
    fsm = SnapshotActivationFSM(
        validator=_ok_h, stager=_ok_h, applier=_ok_h, verifier=_ok_h,
        hooks=hooks, hook_resolver=lambda _m, _f: None,
    )
    result = asyncio.run(fsm.activate("snap-8"))
    assert result.success
    assert result.hook_results[0]["status"] == "disabled"


def test_hook_missing_resolver_reports_skipped():
    hooks = (
        ActivationHookConfig(name="ghost", module="nowhere", function="missing"),
    )
    async def _ok_h(_ctx):
        return {}
    fsm = SnapshotActivationFSM(
        validator=_ok_h, stager=_ok_h, applier=_ok_h, verifier=_ok_h,
        hooks=hooks, hook_resolver=lambda _m, _f: None,
    )
    result = asyncio.run(fsm.activate("snap-9"))
    assert result.success
    assert result.hook_results[0]["status"] == "skipped"


def test_load_activation_hooks_from_config_parses_plan_shape():
    """Plan Q90 — hooks are listed in ~/.map2/config.json → activation_hooks."""
    cfg = {
        "activation_hooks": [
            {
                "name": "midi_map_sync",
                "module": "app.services.midi_service",
                "function": "sync_midi_map",
                "phase": "post_apply",
                "enabled": True,
                "timeout_ms": 2000,
                "on_error": "warn",
            },
            {
                "name": "footswitch_labels",
                "module": "app.services.snapshot_footswitch_label_service",
                "function": "push_snapshot_footswitch_labels",
                "enabled": False,
            },
            {"incomplete": True},  # filtered out — missing required fields
        ],
    }
    hooks = load_activation_hooks_from_config(cfg)
    assert len(hooks) == 2
    names = {h.name for h in hooks}
    assert names == {"midi_map_sync", "footswitch_labels"}
    assert hooks[1].enabled is False
    assert hooks[0].timeout_ms == 2000
    assert hooks[0].phase == "post_apply"


def test_load_activation_hooks_from_empty_config_returns_empty_tuple():
    assert load_activation_hooks_from_config({}) == ()
    assert load_activation_hooks_from_config({"activation_hooks": None}) == ()
    assert load_activation_hooks_from_config({"activation_hooks": "not-a-list"}) == ()


def test_missing_phase_handlers_do_not_block_progression():
    """If no handler is wired for a phase, the FSM still emits the event and
    progresses — treats the phase as a no-op."""
    events, publish = _collect_events()
    fsm = SnapshotActivationFSM(publish_progress=publish)
    result = asyncio.run(fsm.activate("snap-noop"))
    assert result.success
    assert result.phase == ActivationPhase.LIVE


def test_result_carries_elapsed_ms_and_hook_results():
    async def _ok_h(_ctx):
        return {}
    fsm = SnapshotActivationFSM(validator=_ok_h, stager=_ok_h, applier=_ok_h, verifier=_ok_h)
    result = asyncio.run(fsm.activate("snap-timing"))
    assert isinstance(result, ActivationResult)
    assert result.elapsed_ms >= 0
    assert isinstance(result.hook_results, list)
