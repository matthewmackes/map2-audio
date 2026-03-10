# T088 Recovery and Broadcast Hardening Evidence

Date: 2026-03-10

## Scope

This evidence bundle covers the three runtime hardening changes implemented for `T088`:

- WebSocket slow-client isolation in `app/services/websocket_manager.py`
- Bounded MIDI broadcast queue with drop accounting in `app/services/midi_broadcast.py`
- PipeWire recovery cooldown and post-recovery grace logic in `app/services/pipewire_recovery.py`

## Validation command

```bash
pytest tests/test_websocket_manager.py tests/midi_hub/test_consumer_migration.py tests/test_pipewire_recovery_cooldown.py -q
```

## Result

- Status: PASS
- Tests passed: `12`
- Warnings: `1` deprecation warning from existing datetime usage in unrelated MIDI test support

## What was verified

- Slow WebSocket clients are disconnected on send timeout instead of stalling the whole broadcast fan-out.
- WebSocket fan-out still completes in parallel for healthy clients.
- MIDI broadcast queue capacity is bounded and drops oldest events under pressure instead of growing without limit.
- PipeWire recovery enforces a cooldown between automatic recovery attempts.
- PipeWire recovery defers JACK retry during the post-recovery grace window so the watchdog does not thrash the stack immediately after a successful recovery.

## Remaining follow-up

- This artifact proves the local behavior change and regression coverage.
- Release-grade soak validation should still be collected under broader audio-load conditions when `T091` release evidence is refreshed.
