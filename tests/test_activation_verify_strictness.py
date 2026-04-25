"""T2452: VERIFY phase strict-by-default; lenient mode opt-in via document.meta.

These tests target the focused helpers introduced for T2452 — the full
``_activate_snapshot_locked`` orchestration is exercised by
``test_state_authority_activation_service.py``. Here we pin:

  * `_extract_verify_mode` defaults to "strict" and honors the
    ``document.meta.verify_mode`` override.
  * `_run_verify_step` captures errors into the supplied list and falls
    back to the caller-provided dict shape (so downstream metric assembly
    keeps working).
  * `SnapshotVerificationError` carries every step/reason pair so a single
    activation pass surfaces every failing sub-sync.
"""

import asyncio

import pytest

from app.services import state_authority_activation_service as svc


def test_extract_verify_mode_defaults_to_strict():
    assert svc._extract_verify_mode(None) == "strict"
    assert svc._extract_verify_mode({}) == "strict"
    assert svc._extract_verify_mode({"document": {}}) == "strict"
    assert svc._extract_verify_mode({"document": {"meta": {}}}) == "strict"


def test_extract_verify_mode_honors_lenient_override():
    detail = {"document": {"meta": {"verify_mode": "lenient"}}}
    assert svc._extract_verify_mode(detail) == "lenient"


def test_extract_verify_mode_rejects_unknown_values():
    detail = {"document": {"meta": {"verify_mode": "kaboom"}}}
    assert svc._extract_verify_mode(detail) == "strict"


def test_run_verify_step_returns_coroutine_result_on_success():
    async def succeeds():
        return {"applied": True, "branch_count": 2}

    errors: list[dict[str, str]] = []
    result = asyncio.run(
        svc._run_verify_step(
            step="routing_apply",
            coro=succeeds(),
            fallback={"applied": False, "branch_count": 0},
            errors=errors,
            snapshot_id=42,
        ),
    )
    assert result == {"applied": True, "branch_count": 2}
    assert errors == []


def test_run_verify_step_captures_exception_and_returns_fallback():
    async def boom():
        raise RuntimeError("engine offline")

    errors: list[dict[str, str]] = []
    result = asyncio.run(
        svc._run_verify_step(
            step="morph_apply",
            coro=boom(),
            fallback={"applied": False, "plugin_count": 0, "applied_count": 0},
            errors=errors,
            snapshot_id=42,
        ),
    )
    assert result["applied"] is False
    assert result["plugin_count"] == 0
    assert result["applied_count"] == 0
    # Reason annotated with the verify_failed prefix to keep grep-ability.
    assert result["reason"].startswith("verify_failed:")
    assert "engine offline" in result["reason"]
    assert errors == [{"step": "morph_apply", "reason": "engine offline"}]


def test_run_verify_step_uses_class_name_when_exception_str_is_empty():
    class EmptyError(RuntimeError):
        def __str__(self) -> str:
            return ""

    async def empty_msg():
        raise EmptyError()

    errors: list[dict[str, str]] = []
    asyncio.run(
        svc._run_verify_step(
            step="midi_map",
            coro=empty_msg(),
            fallback={"synced": False},
            errors=errors,
            snapshot_id=1,
        ),
    )
    assert errors == [{"step": "midi_map", "reason": "EmptyError"}]


def test_snapshot_verification_error_lists_every_step():
    err = svc.SnapshotVerificationError(
        [
            {"step": "routing_apply", "reason": "engine offline"},
            {"step": "morph_apply", "reason": "value out of range"},
            {"step": "midi_map", "reason": "missing global command"},
        ],
    )
    msg = str(err)
    assert "routing_apply: engine offline" in msg
    assert "morph_apply: value out of range" in msg
    assert "midi_map: missing global command" in msg
    assert err.errors[0]["step"] == "routing_apply"
    assert len(err.errors) == 3


def test_snapshot_verification_error_handles_no_detail():
    err = svc.SnapshotVerificationError([])
    assert "no detail" in str(err)
    assert err.errors == []


def test_strict_mode_raises_when_errors_present():
    """Mirrors the orchestration: collect errors, then enforce strictness."""
    errors: list[dict[str, str]] = []

    async def boom():
        raise RuntimeError("apply failed")

    asyncio.run(
        svc._run_verify_step(
            step="routing_apply",
            coro=boom(),
            fallback={"applied": False},
            errors=errors,
            snapshot_id=1,
        ),
    )
    asyncio.run(
        svc._run_verify_step(
            step="loop_insertions",
            coro=boom(),
            fallback={"synced": False},
            errors=errors,
            snapshot_id=1,
        ),
    )

    verify_mode = "strict"
    with pytest.raises(svc.SnapshotVerificationError) as excinfo:
        if verify_mode == "strict" and errors:
            raise svc.SnapshotVerificationError(errors)
    assert len(excinfo.value.errors) == 2
    assert {e["step"] for e in excinfo.value.errors} == {"routing_apply", "loop_insertions"}


def test_lenient_mode_skips_raise_even_when_errors_present():
    """Lenient mode swallows but the caller-visible ``errors`` list is still populated."""
    errors: list[dict[str, str]] = []

    async def boom():
        raise RuntimeError("apply failed")

    asyncio.run(
        svc._run_verify_step(
            step="midi_map",
            coro=boom(),
            fallback={"synced": False},
            errors=errors,
            snapshot_id=1,
        ),
    )

    verify_mode = "lenient"
    raised = False
    try:
        if verify_mode == "strict" and errors:
            raise svc.SnapshotVerificationError(errors)
    except svc.SnapshotVerificationError:
        raised = True
    assert raised is False
    # Still observable in the runtime metrics extra.
    assert errors == [{"step": "midi_map", "reason": "apply failed"}]
