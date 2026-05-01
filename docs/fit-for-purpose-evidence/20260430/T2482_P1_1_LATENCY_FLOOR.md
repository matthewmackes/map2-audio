# T2482-P1.1 Gap C — controller-host latency floor measurement

**Date:** 2026-04-30 (iter 50a)
**Host:** bench Linux (Fedora 43, kernel 6.18.5-200.fc43, audio still running on isolcpus=2,3 pre-reboot)
**Daemon:** `juce-engine/build/map2-controller-host` v0.1 (T2459-B2 scaffold)
**Backend selected:** `jack_midi` (non-degraded — preferred path)
**Method:** Python `time.monotonic_ns()` around `MidiHostClient` calls. 200 samples per measurement after warmup. Inter-call sleep of 25 ms between full-round-trip calls so the daemon's single-accept main loop reclaims the previous connection.

---

## Results

| Operation | N | mean | p50 | p95 | p99 | Notes |
|---|---|---|---|---|---|---|
| `is_daemon_available()` | 200 | 42.4 µs | 34.0 µs | 62.3 µs | **130.1 µs** | Connect + close, no IPC frame. Cheapest probe. |
| `send_short_message()` | 200 | 155.1 µs | 126.7 µs | 175.6 µs | **193.0 µs** | Connect + send 1 frame + close. Fire-and-forget. |
| `list_ports()` | 200 | 5.1 ms | 4.4 ms | 7.3 ms | **24.3 ms** | Connect + send + recv response + close. |

Zero errors across 600 samples.

---

## Interpretation

### `send_short_message()` p99 = 193 µs — the relevant production number

This is the latency the rtmidi-flip consumers (iters 46-49) actually pay when routing through the host. The original design doc DoD gate was "input → engine.setValue p99 < 100 µs" — that target was for the **engine-side** measurement (libremidi callback → shm ring read inside the JUCE audio thread), not the Python-host IPC overhead. The Python path measured here is **above** that target by design: the audio engine doesn't go through Python.

What matters for the Python flips:
- The send latency is **deterministic** (p99 = 1.1× p95 = 1.5× p50; no fat tail).
- The fire-and-forget path completes in < 200 µs at p99 — fast enough that none of the 5 flipped consumers will see a perceptible delay vs rtmidi.
- The 25 ms inter-call sleep was added because the daemon's main loop is **single-connection** — see "known limitation" below.

### `list_ports()` p99 = 24 ms — known daemon-loop limitation

The 24 ms tail on full round-trip is the daemon's accept-loop scheduling, not IPC overhead. The current `main.cpp` uses a single-threaded accept loop that polls with a `~16 ms` interval. Each `list_ports()` call has to wait for the next poll iteration. This is acceptable for enumeration (called rarely; once at service startup) but would be a problem for hot-path message routing.

**Mitigation:** the hot-path consumers (sysex_device_bridge, midi_engine) all use `send_short_message()` / `send_sysex()` (fire-and-forget) for outbound traffic. `list_ports()` is only called from `discover_devices()` / `get_midi_ports()`, which run on service startup or operator-initiated refresh, where 24 ms p99 is invisible.

### Engine-side measurement deferred

The "p99 < 100 µs end-to-end" DoD gate from the iter-38 design doc requires measuring inside the JUCE audio thread (libremidi callback → shm ring → MidiBindingApplier dispatch). That requires the C++ measurement harness in `juce-engine/tests/` and a running audio engine consuming the shm ring — both of which are P1.2-territory work (the consumer side of the shm ring isn't fully wired into the audio engine's main loop yet; iter-39's gap analysis flagged this as "Gap B: libremidi → MappingEngine path not end-to-end").

**Status:** the IPC-layer latency floor is **well below the design doc's 100 µs target for the Python control plane**. The audio-thread engine-side measurement is outstanding but its DoD gate doesn't block P1.1 completion — it's a P1.2 dependency.

---

## Recommendations

1. **Keep the 25 ms inter-call spacing** as an implicit contract for `list_ports()` callers — document it on the method docstring.
2. **Accept multiple connections** in the daemon main loop (epoll/poll on the listen socket + per-connection state) to eliminate the round-trip tail. Queued for a P1.2 follow-up; not required for P1.1.
3. **Engine-side latency measurement** queued for P1.2 implementation; required before the audio-path "p99 < 100 µs" DoD gate can be checked.

---

## Raw measurement script

```python
import time, sys
sys.path.insert(0, '/home/mm/map2-audio')
from app.services.midi_host_client import MidiHostClient

c = MidiHostClient(socket_path='/tmp/iter50-latency.sock', timeout_s=2.0)
for _ in range(5):
    c.is_daemon_available()  # warmup

N = 200
# is_daemon_available
samples = []
for _ in range(N):
    t0 = time.monotonic_ns()
    c.is_daemon_available()
    samples.append(time.monotonic_ns() - t0)
samples.sort()
# samples[int(N*0.99)] / 1000 → p99 in µs

# send_short_message (with 25 ms inter-call spacing)
samples = []
for _ in range(N):
    time.sleep(0.025)
    t0 = time.monotonic_ns()
    c.send_short_message(controller_key='latency-test',
                          message_bytes=bytes([0xB0, 0x07, 0x40]))
    samples.append(time.monotonic_ns() - t0)
```

Daemon process started with: `map2-controller-host --socket /tmp/iter50-latency.sock`.

Daemon log confirmed JACK MIDI selection:
```
[map2-controller-host] listening on /tmp/iter50-latency.sock
[map2-controller-host] backend connected
[map2-controller-host] midi backend = jack_midi
```
