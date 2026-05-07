"""T2459-H Outer Loop 2 — EngineCommandDispatcher tests."""

from __future__ import annotations

import logging

import pytest

from app.services.engine_command_dispatcher import (
    EngineCommandContext,
    EngineCommandDispatcher,
)


def _frame(
    target: str,
    action: str = "set",
    value: float | None = 1.0,
    args: list | None = None,
    controller_key: str = "test-key",
    msg_id: str = "msg-1",
) -> dict:
    """Build a minimal engine_command frame for tests."""
    out: dict = {
        "type": "engine_command",
        "msg_id": msg_id,
        "schema_version": 1,
        "controller_key": controller_key,
        "target": target,
        "action": action,
    }
    if value is not None:
        out["value"] = value
    if args is not None:
        out["args"] = args
    return out


# ---------------------------------------------------------------------------
# Exact-match path
# ---------------------------------------------------------------------------


def test_dispatch_routes_to_exact_handler() -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list[EngineCommandContext] = []
    dispatcher.register("audio.snapshot.recall", lambda ctx: seen.append(ctx))

    dispatcher.dispatch(_frame("audio.snapshot.recall", value=5.0))

    assert dispatcher.dispatched_count == 1
    assert len(seen) == 1
    assert seen[0].target == "audio.snapshot.recall"
    assert seen[0].value == 5.0
    assert seen[0].action == "set"
    assert seen[0].params == []


def test_dispatch_unmatched_target_increments_counter() -> None:
    dispatcher = EngineCommandDispatcher()
    dispatcher.dispatch(_frame("audio.unknown.target"))
    assert dispatcher.dispatched_count == 0
    assert dispatcher.unmatched_count == 1


def test_re_register_overwrites_handler(caplog: pytest.LogCaptureFixture) -> None:
    """A second register() for an existing target replaces the handler.

    The dispatcher logs a warning so the case is observable in logs;
    we don't fail because tests need to be able to override handlers.
    """
    dispatcher = EngineCommandDispatcher()
    first_calls: list = []
    second_calls: list = []

    dispatcher.register("audio.snapshot.recall", lambda c: first_calls.append(c))
    with caplog.at_level(logging.WARNING):
        dispatcher.register("audio.snapshot.recall", lambda c: second_calls.append(c))

    dispatcher.dispatch(_frame("audio.snapshot.recall"))

    assert first_calls == []
    assert len(second_calls) == 1
    assert any("re-registering" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Pattern-match path
# ---------------------------------------------------------------------------


def test_pattern_match_extracts_params() -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list[EngineCommandContext] = []
    dispatcher.register_pattern(
        "audio.chain.*.bypass", lambda ctx: seen.append(ctx)
    )

    dispatcher.dispatch(_frame("audio.chain.5.bypass", value=1.0))

    assert dispatcher.dispatched_count == 1
    assert len(seen) == 1
    assert seen[0].target == "audio.chain.5.bypass"
    assert seen[0].params == ["5"]


def test_pattern_match_first_registered_wins() -> None:
    """When two patterns could both match, registration order decides."""
    dispatcher = EngineCommandDispatcher()
    a_calls: list = []
    b_calls: list = []
    dispatcher.register_pattern(
        "audio.chain.*.bypass", lambda c: a_calls.append(c)
    )
    dispatcher.register_pattern("audio.chain.*.*", lambda c: b_calls.append(c))

    dispatcher.dispatch(_frame("audio.chain.7.bypass"))

    assert len(a_calls) == 1
    assert len(b_calls) == 0


def test_exact_match_beats_pattern_match() -> None:
    """Exact registrations are checked first (O(1) before pattern scan)."""
    dispatcher = EngineCommandDispatcher()
    exact_calls: list = []
    pattern_calls: list = []
    dispatcher.register_pattern(
        "audio.chain.*.bypass", lambda c: pattern_calls.append(c)
    )
    dispatcher.register(
        "audio.chain.7.bypass", lambda c: exact_calls.append(c)
    )

    dispatcher.dispatch(_frame("audio.chain.7.bypass"))
    dispatcher.dispatch(_frame("audio.chain.8.bypass"))

    assert len(exact_calls) == 1  # only "audio.chain.7.bypass"
    assert len(pattern_calls) == 1  # the chain.8 case fell through to pattern


def test_pattern_with_multiple_wildcards() -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list[EngineCommandContext] = []
    dispatcher.register_pattern(
        "audio.chain.*.plugin.*.bypass", lambda c: seen.append(c)
    )
    dispatcher.dispatch(_frame("audio.chain.3.plugin.compressor.bypass"))
    assert seen[0].params == ["3", "compressor"]


# ---------------------------------------------------------------------------
# Frame validation
# ---------------------------------------------------------------------------


def test_dispatch_drops_non_engine_command_frame(
    caplog: pytest.LogCaptureFixture,
) -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list = []
    dispatcher.register("audio.snapshot.recall", lambda c: seen.append(c))

    with caplog.at_level(logging.WARNING):
        dispatcher.dispatch({"type": "controller_event", "target": "audio.snapshot.recall"})

    assert seen == []
    assert dispatcher.dispatched_count == 0
    assert any("non-engine_command" in r.message for r in caplog.records)


def test_dispatch_drops_frame_with_missing_target(
    caplog: pytest.LogCaptureFixture,
) -> None:
    dispatcher = EngineCommandDispatcher()
    with caplog.at_level(logging.WARNING):
        dispatcher.dispatch({"type": "engine_command", "action": "set"})
    assert dispatcher.dispatched_count == 0
    assert any("missing/invalid target" in r.message for r in caplog.records)


def test_dispatch_drops_frame_with_empty_target() -> None:
    dispatcher = EngineCommandDispatcher()
    dispatcher.dispatch(_frame(target=""))
    assert dispatcher.dispatched_count == 0


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def test_handler_exception_does_not_propagate() -> None:
    """The reader thread cannot afford to die. Handler exceptions get
    logged + counted but the dispatch returns normally."""
    dispatcher = EngineCommandDispatcher()

    def bad_handler(ctx: EngineCommandContext) -> None:
        raise RuntimeError("handler bug")

    dispatcher.register("audio.snapshot.recall", bad_handler)
    # Should not raise.
    dispatcher.dispatch(_frame("audio.snapshot.recall"))

    assert dispatcher.dispatched_count == 0
    assert dispatcher.errored_count == 1


def test_on_error_hook_invoked() -> None:
    errors: list[tuple[str, Exception]] = []
    dispatcher = EngineCommandDispatcher(
        on_error=lambda target, exc: errors.append((target, exc))
    )

    def bad_handler(ctx: EngineCommandContext) -> None:
        raise ValueError("boom")

    dispatcher.register("audio.snapshot.recall", bad_handler)
    dispatcher.dispatch(_frame("audio.snapshot.recall"))

    assert len(errors) == 1
    assert errors[0][0] == "audio.snapshot.recall"
    assert isinstance(errors[0][1], ValueError)


def test_on_error_hook_failure_does_not_propagate() -> None:
    """If the on_error hook itself raises, the dispatcher swallows.
    We are explicitly defensive: the reader thread must keep running."""
    def bad_hook(target: str, exc: Exception) -> None:
        raise RuntimeError("hook is also broken")

    dispatcher = EngineCommandDispatcher(on_error=bad_hook)
    dispatcher.register(
        "audio.snapshot.recall", lambda c: (_ for _ in ()).throw(ValueError("x"))
    )
    dispatcher.dispatch(_frame("audio.snapshot.recall"))  # no exception escapes


# ---------------------------------------------------------------------------
# Context normalization
# ---------------------------------------------------------------------------


def test_context_value_normalizes_to_float() -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list[EngineCommandContext] = []
    dispatcher.register("audio.snapshot.recall", lambda c: seen.append(c))

    # int wire value coerces to float
    dispatcher.dispatch(_frame("audio.snapshot.recall", value=7))
    # bool also coerces (True == 1.0)
    dispatcher.dispatch(_frame("audio.snapshot.recall", value=True))
    # None stays None
    dispatcher.dispatch(_frame("audio.snapshot.recall", value=None))

    assert seen[0].value == 7.0
    assert seen[1].value == 1.0
    assert seen[2].value is None


def test_context_args_default_to_empty_list() -> None:
    dispatcher = EngineCommandDispatcher()
    seen: list[EngineCommandContext] = []
    dispatcher.register("audio.snapshot.recall", lambda c: seen.append(c))

    dispatcher.dispatch(_frame("audio.snapshot.recall"))  # no args
    assert seen[0].args == []

    dispatcher.dispatch(_frame("audio.snapshot.recall", args=[1, "x", True]))
    assert seen[1].args == [1, "x", True]


def test_reset_stats_zeros_counters() -> None:
    dispatcher = EngineCommandDispatcher()
    dispatcher.register("audio.snapshot.recall", lambda c: None)
    dispatcher.dispatch(_frame("audio.snapshot.recall"))
    dispatcher.dispatch(_frame("audio.unknown"))
    assert dispatcher.dispatched_count == 1
    assert dispatcher.unmatched_count == 1

    dispatcher.reset_stats()
    assert dispatcher.dispatched_count == 0
    assert dispatcher.unmatched_count == 0
    assert dispatcher.errored_count == 0
