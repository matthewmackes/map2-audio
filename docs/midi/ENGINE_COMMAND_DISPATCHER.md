# Engine-Command Dispatcher

**Last updated:** 2026-05-07
**Owner:** T2459-H Outer Loop 2
**Source:** [`app/services/engine_command_dispatcher.py`](../../app/services/engine_command_dispatcher.py), [`app/services/engine_command_handlers.py`](../../app/services/engine_command_handlers.py)
**Tests:** [`tests/test_engine_command_dispatcher_t2459h.py`](../../tests/test_engine_command_dispatcher_t2459h.py), [`tests/test_engine_command_handlers_t2459h.py`](../../tests/test_engine_command_handlers_t2459h.py), [`tests/test_meloaudio_engine_command_integration_t2459h.py`](../../tests/test_meloaudio_engine_command_integration_t2459h.py)

This module is the consumer side of the controller-host's
`engine_command` IPC frame. It receives `engine.setValue(target,
value, action)` calls produced by vendor mapping JS scripts running
in the host's QuickJS runtime, routes them to typed handlers, and
actuates the side effect on the audio-engine surface.

---

## 1. Where this fits in the controller-host pipeline

```
┌─────────────────────┐    raw MIDI/HID     ┌────────────────────┐
│ Physical device     │   ──────────────►   │ controller-host    │
│ (Commander, MK1, …) │                     │ (libremidi I/O)    │
└─────────────────────┘                     └─────────┬──────────┘
                                                      │  matches a
                                                      │  registered
                                                      ▼  vendor mapping?
                                          ┌──────────────────────┐
                                          │ Vendor mapping JS    │
                                          │ (QuickJS sandbox)    │
                                          └─────────┬────────────┘
                                                    │  emits via
                                                    ▼
                                          ┌──────────────────────┐
                                          │ engine_command frame │
                                          │ (IPC → backend UDS)  │
                                          └─────────┬────────────┘
                                                    │
                                                    │ MidiHostClient.subscribe()
                                                    │ .on_engine_command(...)
                                                    ▼
                            ┌───────────────────────────────────────────┐
                            │  EngineCommandDispatcher.dispatch(frame)  │
                            │  ┌─────────────────────────────────────┐  │
                            │  │ exact-match registry                │  │
                            │  │  "audio.snapshot.recall"            │  │
                            │  │  "audio.master.volume"              │  │
                            │  │  "audio.transport.tap_tempo"        │  │
                            │  └─────────────────────────────────────┘  │
                            │  ┌─────────────────────────────────────┐  │
                            │  │ pattern-match registry              │  │
                            │  │  "audio.chain.*.bypass"             │  │
                            │  └─────────────────────────────────────┘  │
                            └───────────────────────┬───────────────────┘
                                                    │
                                                    ▼
                                  HandlerHooks.set_chain_bypass(...)
                                  HandlerHooks.recall_snapshot(...)
                                  HandlerHooks.set_master_volume(...)
                                  HandlerHooks.tap_tempo(...)
```

---

## 2. Wire-up

The dispatcher is created once at backend startup:

```python
from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import HandlerHooks, register_default_handlers
from app.services.midi_host_client import MidiHostClient

dispatcher = EngineCommandDispatcher()
register_default_handlers(
    dispatcher,
    hooks=HandlerHooks(
        set_chain_bypass=lambda chain_id, bypass: chain_service.set_chain_bypass(chain_id, bypass),
        recall_snapshot=lambda snapshot_id: snapshot_runtime_service.recall(snapshot_id),
        set_master_volume=lambda volume: audio_engine.set_master_volume(volume),
        tap_tempo=lambda timestamp_ns: transport.tap_tempo(timestamp_ns),
    ),
)

midi_host = MidiHostClient(socket_path=config.controller_host_socket)
sub = midi_host.subscribe()
sub.on_engine_command(dispatcher.dispatch)
sub.start()
```

When `hooks=None` (the default for unit tests) handlers are
side-effect-free no-ops that increment dispatcher counters but don't
touch any service. This lets the dispatch path land before audio-engine
APIs are stable, without forcing CI to mock real services.

---

## 3. Frame contract

`EngineCommand` (defined in [`app/schemas/controller_host.py`](../../app/schemas/controller_host.py)):

| Field            | Required | Notes                                                                 |
|------------------|----------|-----------------------------------------------------------------------|
| `type`           | yes      | Always `"engine_command"`. Other types are dropped with a log entry. |
| `msg_id`         | yes      | Host-assigned, opaque. Used in logs for correlation.                  |
| `schema_version` | yes      | Currently `1`.                                                        |
| `controller_key` | yes      | Identifies which controller mapping produced the command.             |
| `target`         | yes      | Dotted action ID — `audio.chain.5.bypass`, `audio.snapshot.recall`, … |
| `action`         | yes      | `"set"` / `"toggle"` / `"increment"` / `"decrement"` / …              |
| `value`          | optional | Numeric payload. Coerced to `float` or kept `None`.                   |
| `args`           | optional | List of mixed types. Used for tap-tempo timestamps + future targets.  |

---

## 4. Routing semantics

### 4.1 Exact match (O(1))

Register a target string verbatim:

```python
dispatcher.register("audio.snapshot.recall", handler)
```

Re-registering an existing exact target overwrites the previous
handler and emits a `WARNING` log entry. This is intentional — tests
need to swap in fakes — but in production it indicates a wiring bug.

### 4.2 Pattern match (single-segment glob)

Patterns use `*` to match a single dotted segment:

```python
dispatcher.register_pattern("audio.chain.*.bypass", handler)
```

Matched segments are passed to the handler as `ctx.params` (a `list[str]`):

```python
def handler(ctx):
    chain_id = int(ctx.params[0])  # for "audio.chain.5.bypass" → "5"
```

When a target could match multiple patterns, the **first registered
pattern wins**. Register specific patterns before catch-alls.

### 4.3 Match precedence

1. Exact match (O(1) dictionary lookup).
2. Pattern match (linear scan, registration order).
3. Unmatched → log at `INFO`, increment `unmatched_count`. No exception.

---

## 5. Action semantics for the four canonical handlers

### 5.1 `audio.chain.<N>.bypass` — pattern handler

| Action      | `value`    | Effect                                                       |
|-------------|------------|--------------------------------------------------------------|
| `set`       | truthy     | Bypass the chain (set bypass=True).                          |
| `set`       | 0 or none  | Un-bypass.                                                   |
| `toggle`    | ignored    | Flip bypass (first toggle without state defaults to True).   |
| anything else | -        | Logged + dropped.                                            |

The handler tracks per-chain bypass state internally so consecutive
`toggle` actions alternate correctly without depending on the audio
engine echoing state back. The engine's actual value remains
authoritative if it diverges (e.g. UI-driven bypass).

### 5.2 `audio.snapshot.recall` — exact handler

| Action  | `value` | Effect                                  |
|---------|---------|-----------------------------------------|
| `set`   | int     | Recall snapshot `int(value)`.           |
| `set`   | none    | Logged + dropped.                       |
| anything else | -  | Logged + ignored. Recall is set-only.   |

### 5.3 `audio.master.volume` — exact handler

| Action       | `value`  | Effect                                                         |
|--------------|----------|----------------------------------------------------------------|
| `set`        | float    | Clamp `[0.0, 1.0]` and forward.                                |
| `increment`  | float    | Add `value` (default 0.05) to current, clamp.                  |
| `decrement`  | float    | Subtract `value` (default 0.05) from current, clamp.           |
| anything else | -       | Logged + dropped.                                              |

The handler tracks last-known volume so increment/decrement work
without engine echo. Audio engine's value is authoritative if they
diverge.

### 5.4 `audio.transport.tap_tempo` — exact handler

| Source      | Behavior                                                        |
|-------------|-----------------------------------------------------------------|
| `args[0]` is int | Pass as `timestamp_ns` to the transport.                  |
| `args[0]` missing/non-int | Pass `None` — transport uses arrival time.       |

Action and value are ignored — every invocation is one tap.

---

## 6. Error handling

Handlers run **synchronously on the UDS reader thread** (see
[`MidiEventSubscription._run`](../../app/services/midi_host_client.py)).
A misbehaving handler must not kill the reader, or the entire mapping
path goes silent.

The dispatcher wraps every handler call in `try/except`:

- **Handler exception** → logs at `ERROR` with traceback, increments
  `dispatcher.errored_count`, optionally calls the constructor's
  `on_error(target, exc)` hook, and continues.
- **`on_error` hook itself raises** → swallowed; logger captures the
  secondary failure. We are explicitly defensive: the reader keeps
  running.

---

## 7. Observability

Three integer counters exposed on the dispatcher instance:

| Counter             | Increments when                                         |
|---------------------|---------------------------------------------------------|
| `dispatched_count`  | Handler ran without raising.                            |
| `unmatched_count`   | Frame valid but no handler registered for `target`.     |
| `errored_count`     | Handler raised an exception.                            |

Reset with `dispatcher.reset_stats()`. Log lines around dispatch:

- **Match miss** → `INFO` (kept low so experimental targets are quiet).
- **Bad frame** (non-engine_command type, missing target) → `WARNING`.
- **Handler crash** → `ERROR` with full traceback.
- **Re-registration** → `WARNING` once at `register()` time.

---

## 8. Adding a new target

1. Open [`app/services/engine_command_handlers.py`](../../app/services/engine_command_handlers.py).
2. Add a new optional callable to `HandlerHooks`:
   ```python
   set_my_thing: Optional[Callable[[int], None]] = None
   ```
3. Write a `_make_my_thing_handler(hooks)` factory next to the others.
4. Call it from `register_default_handlers`:
   ```python
   dispatcher.register("audio.my.thing", _make_my_thing_handler(actual_hooks))
   ```
5. Add tests under
   [`tests/test_engine_command_handlers_t2459h.py`](../../tests/test_engine_command_handlers_t2459h.py)
   covering: success path, missing-value, unknown action, no-hook
   fallback.
6. Document the new target in §5 above.

For pattern targets, use `register_pattern` and document the
`ctx.params` contract for handler authors.

---

## 9. Open questions / future work

- **Cluster fan-out**: today the dispatcher is local to one backend
  process. Cluster-wide engine commands (e.g. an Audio Node receiving a
  command from a remote Management Node's mapping script) need a
  separate fan-out tier — likely on top of the existing
  `PlatformEventBus`. Not blocking for the H3-CFG ship.
- **Async handlers**: handlers are sync-only because the reader thread
  is sync. Heavy actuation (e.g. snapshot recall that hits the DB)
  should queue to an asyncio task. The dispatcher itself stays
  thread-safe; the *adapter* between sync handler and async work is
  per-handler.
- **Coverage of the rest of the audio surface**: chain.bypass +
  snapshot.recall + master.volume + tap_tempo are the four MVP
  targets. Plugin-level targets (`audio.chain.<N>.plugin.<URI>.bypass`,
  parameter writes, etc.) follow the same pattern; the seam is open.

---

## 10. Test counts (as of 2026-05-07)

| Suite                                                                | Count |
|----------------------------------------------------------------------|-------|
| `tests/test_engine_command_dispatcher_t2459h.py`                     | 16    |
| `tests/test_engine_command_handlers_t2459h.py`                       | 18    |
| `tests/test_meloaudio_engine_command_integration_t2459h.py`          | 6     |
| **Total**                                                            | **40**|
