# T2482-P1.2 (iter 69) — host-process dispatch latency for the iter-64 envelopes

**Date:** 2026-05-01 (iter 69)
**Host:** bench Linux (Fedora 43, kernel 6.18.5-200.fc43)
**Binary:** `juce-engine/build/map2-controller-host` v0.1
**Method:** Python `time.monotonic_ns()` around `MidiHostClient`-shape IPC round-trips. 100 samples per measurement after warmup. 40 ms inter-call sleep so the daemon's single-accept main loop reclaims the previous connection (same constraint documented in iter 50's latency floor measurement).

---

## What this measures

The iter-50 latency floor measurement covered the existing IPC paths
(`is_daemon_available` p99 = 130 µs; `send_short_message` p99 = 193 µs;
`list_ports` p99 = 24 ms). Iter 69 adds the same measurement for the **3
new lifecycle envelopes** that landed in iter 64 / 67:

| Path | p50 | p95 | p99 | Compared to iter 50 |
|---|---|---|---|---|
| `mapping_deactivate` | 4.7 ms | 6.0 ms | **22.5 ms** | within iter-50 `list_ports` p99 envelope |
| `mapping_activate` (empty) | 4.7 ms | 7.7 ms | **22.6 ms** | same |
| `mapping_reload` (empty) | 4.7 ms | 8.9 ms | **13.4 ms** | same |

All three converge around the **daemon's main-loop poll cycle** (~5 ms
p50), exactly as iter 50 found for `list_ports`. The three new envelopes
do NOT add measurable latency above the existing dispatcher's baseline.

The p99 outliers (13–22 ms) are the same accept-loop scheduling artifact
documented in iter 50; production hot-path consumers should use
fire-and-forget paths (`send_short_message`, `send_sysex`) to avoid the
full round-trip cost.

## What this does NOT measure (still deferred)

The iter-50 design doc's "p99 < 100 µs end-to-end" DoD gate requires
measuring the **audio-thread engine-side** path: libremidi callback →
shm event ring write (host producer) → shm read (engine consumer
inside the JUCE audio callback) → MidiBindingApplier dispatch.

Per the iter-61 P1.2 reality audit:

> Gap B (libremidi → MappingEngine end-to-end): PARTIALLY WIRED — shm
> ring producer side done, no consumer pulls events through the
> mapping engine. Biggest remaining gap.

Without the consumer side wired, there is **no audio-thread to measure
the latency of**. The producer side (libremidi → shm ring write) is
already in place but lands in a ring no one reads. SHIP loop 8 (iters
71-74) closes this gap; the engine-side measurement repeats post-Gap-B
with the iter-69 script extended to drive shm-ring-end-to-end traffic.

## Cross-references

- Raw measurement JSON: `T2482_P1_2_DISPATCH_LATENCY.json` (this dir)
- Iter 50 latency floor: `../20260430/T2482_P1_1_LATENCY_FLOOR.md`
- Iter 61 P1.2 reality audit: `../../architecture/T2482_P1_2_REALITY_AUDIT.md`
- Measurement script: `scripts/measure_p1_2_dispatch_latency.py`
