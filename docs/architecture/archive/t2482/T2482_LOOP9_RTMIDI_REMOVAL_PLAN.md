# T2482 SHIP loop 9 — full python-rtmidi removal plan

**Date:** 2026-05-01 (iter 81, SHIP loop 9 start).
**Goal:** Drop `python-rtmidi` from `requirements-backend-runtime.txt` and remove every `import rtmidi` from `app/`. Empty the iter-79 grep-fail allow-list.
**Selected over:** Phase 3 frontend Carbon scaffold (per user direction at SHIP-loop-8 close).

---

## Current state (iter 81 audit)

After iters 54-78, rtmidi serves 5 narrow secondary surfaces. Each one needs a specific replacement before its `import rtmidi` line can be deleted.

### Surface 1 — GCP `receive_sysex` polling loop

**File**: `app/services/ground_control_pro/midi_transport.py`
**Use**: `_make_midi_in()` returns a `rtmidi.MidiIn` (or test factory). `receive_sysex` polls `midi_in.get_message()` in a loop with a deadline.

**Refactor approach**: replace the polling loop with a `MidiHostClient.subscribe()` event-driven receive. The host already pushes inbound MIDI as `controller_event` IPC frames; `receive_sysex` just needs to subscribe, accumulate bytes between F0/F7, return when the envelope completes or the deadline elapses. Test factories continue to work (rtmidi-shape mock returns the same envelope).

**Iter**: 82.

### Surface 2 — Maschine virtual-port fallback

**File**: `app/services/maschine/maschine_mk1_daemon.py`
**Use**: `VirtualMidiOutput.open()` falls back to `rtmidi.MidiOut().open_virtual_port` when the host's `create_virtual_port` returns `level=error` or daemon unreachable.

**Refactor approach**: drop the rtmidi fallback. Iter-76 made the host path the primary; iter-86 strips the fallback so daemon-down → return False (failed open). Maschine consumers already check the open() return value. Existing dev/CI flows that ran without the daemon need to spin up the daemon (or stub `_get_host_client` / use the test idiom).

**Iter**: 86.

### Surface 3 — `midi_engine` persistent live binding

**File**: `app/services/midi_engine.py`
**Use**: `self._midi_in = rtmidi.MidiIn()` opened against a discovered port for the live MIDI binding callback. Used by `_open_midi_input_with_rtmidi` and the polling loop.

**Refactor approach**: replace with `MidiHostClient.open_midi_input(controller_key, port_id)` (already exists from H3 Slice 5) + `MidiHostClient.subscribe()` (iter 44). The host's libremidi adapter owns the inbound port; events arrive as `controller_event` IPC frames. The MIDI binding callback registers as a `subscribe()` listener.

**Iter**: 83.

### Surface 4 — `midi_hub/ports.py` `AlsaMidiPort.open()`

**File**: `app/services/midi_hub/ports.py`
**Use**: `MidiHub.open_port(port_id)` instantiates `AlsaMidiPort` for ALSA-class ports; the `open()` method does `rtmidi.MidiIn()` + `rtmidi.MidiOut()` per port handle.

**Refactor approach**: introduce `HostBackedMidiPort` — same `MidiPort` interface, but `open()` calls `MidiHostClient.open_midi_input(controller_key, port_id)`; `send()` calls `MidiHostClient.send_short_message`; `receive()` drains a per-port queue populated by a shared `MidiHostClient.subscribe()` reader. Then route `MidiHub.open_port` to construct `HostBackedMidiPort` for ALSA-class ports instead of `AlsaMidiPort`.

**Iter**: 85. Heaviest of the 4 because it changes the MidiHub class hierarchy.

### Surface 5 — `midi_sysex_bridge_base` simulator poll

**File**: `app/services/midi_sysex_bridge_base.py`
**Use**: optional rtmidi import for the IntelFX + MPX-1 simulator path. When rtmidi unavailable, the service runs in simulation mode (no real MIDI). When available, the bridge uses `rtmidi.MidiIn` for live event ingestion in the polling loop.

**Refactor approach**: drop the rtmidi import entirely; the bridge already supports a simulator mode for tests. Production MIDI ingestion goes through the controller-host like every other surface. The IntelFX + MPX-1 services will need to wire their inbound paths via `MidiHostClient.subscribe()` — but that integration is already implied by iters 54-78 (sysex_device_bridge enumeration is host-routed; the live-traffic polling path in the base class is the last rtmidi holdout).

**Iter**: 84.

---

## Per-iter scope

| Iter | File | Refactor | Test count target |
|---|---|---|---|
| 81 | (this doc) | Audit + plan | 0 |
| 82 | `ground_control_pro/midi_transport.py` | `receive_sysex` → `subscribe()` | ~6 |
| 83 | `midi_engine.py` | persistent binding → host-routed + `subscribe()` | ~5 |
| 84 | `midi_sysex_bridge_base.py` | drop rtmidi import; simulator mode unchanged | ~3 |
| 85 | `midi_hub/ports.py` | new `HostBackedMidiPort`; route AlsaMidiPort consumers to it | ~6 |
| 86 | `maschine_mk1_daemon.py` | drop rtmidi fallback; daemon-down → failed open | ~3 |
| 87 | `requirements-backend-runtime.txt` + `app/utils/rtmidi_utils.py` | drop python-rtmidi from runtime; rtmidi_utils becomes a no-op shim | ~2 |
| 88 | `tests/test_no_new_rtmidi_imports_t2482p1_1.py` | empty `ALLOWED_RTMIDI_PATHS = set()` | ~3 |
| 89 | `scripts/measure_loop9_soak.py` | end-to-end soak: every consumer green for 10 minutes | ~1 |
| 90 | (worklist roll-up) | SHIP loop 9 closing log | 0 |

Estimated test-count delta: ~30 new + several rewrites of existing rtmidi-injection tests to use the host path / subscribe mock idiom.

---

## Test idiom shift

The existing rtmidi-injection idioms (e.g. `monkeypatch.setattr(<module>, "rtmidi", _StubRtmidi)`) need to become **MidiHostClient mock** idioms. The prior iter-66 instance-level `_rtmidi_module` escape hatch goes away because the bridge no longer has a `_rtmidi_module()` method — production code routes everything through the host client.

**New idiom**:

```python
from unittest import mock

fake_client = mock.Mock()
fake_client.is_daemon_available.return_value = True
fake_client.list_ports.return_value = (
    MidiBackendStatus(backend="jack_midi", degraded=False),
    [MidiPortInfo(name="GCP In", id="gcp-in", is_input=True, is_virtual=False)],
)

with mock.patch.object(transport, "_get_host_client", return_value=fake_client):
    result = transport.list_ports()
```

This is already the dominant pattern in the iter-46 / iter-54 / iter-77 GCP test suites. Loop 9's per-iter test deltas extend it to the inbound side via `subscribe()` mocks (a new pattern; the iter-44 subscribe test suite has the reference shape).

---

## Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `subscribe()` event-driven receive doesn't match the polling-loop deadline contract for `receive_sysex` | medium | Wrap `subscribe()` in a deadline-aware accumulator; the contract returns the same envelope dict. Tests pin both paths. |
| `HostBackedMidiPort` per-port queue doesn't handle MidiHub's `receive(max_messages=N)` semantics cleanly | medium | Reuse the iter-44 `MidiEventSubscription` reader thread + per-port deque; iter 85 ships the queue + drain logic. |
| Maschine fallback removal breaks dev flows where daemon isn't running | low | Iter 86 ships the rtmidi-removal as a single commit + the M1 user-directive SHIP-loop-9 acknowledgment is the precondition. |
| Empty allow-list (iter 88) reveals a forgotten import elsewhere in `app/` | low | Iter 81 audit confirms only the 5 documented files; iter 88 grep-fail catches anything missed. |
| Cross-consumer soak (iter 89) reveals a real timing/latency regression vs the old rtmidi paths | medium | Iter 89 is the 10-minute end-to-end run — if a regression surfaces, queue an iter-89.5 hotfix or roll back the offending iter rather than shipping the loop-close on iter 90. |

---

## Cross-references

- iter-79 grep-fail allow-list: `tests/test_no_new_rtmidi_imports_t2482p1_1.py`
- iter-79 requirements doc: `requirements-backend-runtime.txt:48` (multi-line comment)
- iter-44 subscribe API: `app/services/midi_host_client.py::MidiHostClient.subscribe`
- iter-43 SysEx send: `app/services/midi_host_client.py::MidiHostClient.send_sysex`
- iter-75 virtual-port IPC: `app/schemas/controller_host.py::MidiCreateVirtualPortRequest`
- iter-50b deferral: `docs/fit-for-purpose-evidence/20260430/T2482_P1_1_RTMIDI_REMOVAL_READINESS.md`
- iter-55 Maschine deferral: `docs/architecture/T2482_P1_1_MASCHINE_RTMIDI_DEFERRAL.md`
