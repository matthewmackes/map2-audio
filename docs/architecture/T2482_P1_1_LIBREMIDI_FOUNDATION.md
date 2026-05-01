# T2482-P1.1 — libremidi I/O foundation + SPSC shm event ring

**Status:** Design (iter 38, 2026-04-30) — implementation deferred to dedicated work cycle.
**Owns:** T2459-H1 (subsumed under T2482 epic; see Project Worklist).
**Related:** [`MIDI_SERVICES.md`](MIDI_SERVICES.md), [`MIDI_BACKEND.md`](MIDI_BACKEND.md), [`FIRST_CLASS_SERVICES.md`](FIRST_CLASS_SERVICES.md).

---

## 1. Why this exists

The platform currently uses **python-rtmidi** for every inbound and outbound MIDI surface. T2459-H1 / T2482-P1.1 retires that dependency in favor of **libremidi** (modern C++17 cross-platform MIDI library) running inside the controller-host daemon, with events delivered to the JUCE audio engine through a single-producer/single-consumer (SPSC) shared-memory ring buffer.

The four reasons:

1. **RT path latency.** python-rtmidi runs in Python; every callback crosses the GIL and goes through asyncio. An end-to-end input→engine path of < 100 µs (p99) is incompatible with that. libremidi runs in the controller-host (C++ process) and writes directly to the shm ring; the JUCE engine reads it from inside the audio callback.
2. **Single MIDI authority.** Today rtmidi is opened by **5 separate services** (see §2). Each one fights the OS for ALSA sequencer ports, each one has its own port-naming convention, each one ships its own discovery loop. libremidi-in-the-host gives us **one process that owns every MIDI device** and dispatches downstream over a typed shm ring — matching the four-services discipline the T2482 epic established.
3. **Cluster MIDI.** T2459-H6/H7 wants host-to-host MIDI streaming. That's a non-starter in Python (asyncio + ALSA sequencer + serialization). In libremidi/C++ the SPSC ring becomes the natural transport: shm locally, RDMA/UDP unicast across nodes — same wire format.
4. **Device-pack JS evaluation.** The controller-host already runs JS (QuickJS) for device-pack scripts (T2459-G). Putting MIDI I/O in the same process means the dispatcher can call `MPX1.handle_sysex(bytes)` directly without IPC — exactly the SysEx-cutover work iters 35-37 just landed in JS form.

---

## 2. Audit: who currently uses python-rtmidi

```
app/services/midi_engine.py                       30 references  ← top-level engine, MidiHub spinup
app/services/sysex_device_bridge.py               20 references  ← legacy SysEx I/O
app/services/midi_hub/ports.py                    20 references  ← canonical port wrapper
app/services/ground_control_pro/midi_transport.py 13 references  ← GCP service transport
app/services/maschine/maschine_mk1_daemon.py       9 references  ← Maschine MK1 surface
app/services/intelfx_service.py                   (uses sysex_device_bridge)
app/services/mpx1_service.py                      (uses sysex_device_bridge)
app/services/midi_sysex_bridge_base.py            (shared base — uses rtmidi)
app/services/enriched_midi_physical_surfaces.py   (uses midi_hub)
app/services/midi_host_client.py                  (planned successor — already exists as scaffold)
```

`requirements-backend-runtime.txt` line 48: `python-rtmidi>=1.5.8,<2.0.0` — single dependency line, but reaches 5 service modules + 3 device services + the package_manager.

The `midi_host_client.py` already exists as the planned successor: it's the Python-side client of the controller-host daemon. Today it's a scaffold; under P1.1 it becomes the **only** way Python touches MIDI.

---

## 3. Target architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Python FastAPI                              │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │   midi_host_client (the only MIDI surface in Python)    │       │
│   └────────────────────────────┬────────────────────────────┘       │
│                                │ UDS control plane (JSON)           │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                     controller-host daemon (C++)                    │
│                                                                     │
│   ┌─────────────────┐    ┌──────────────────┐   ┌────────────────┐  │
│   │   libremidi I/O │    │  Device-pack JS  │   │  ClusterGateway │ │
│   │   (in/out per   │───▶│  dispatcher      │──▶│  (T2459-H6/H7)  │ │
│   │    physical     │    │  (QuickJS +      │   │                 │ │
│   │    port)        │    │   handle_sysex)  │   │                 │ │
│   └────────┬────────┘    └─────────┬────────┘   └────────┬────────┘ │
│            │                       │                     │          │
│            └───────────────┬───────┴─────────────────────┘          │
│                            │                                        │
│                            ▼                                        │
│            ┌───────────────────────────────┐                        │
│            │   SPSC shm event ring         │                        │
│            │   (host PRODUCER side)        │                        │
│            └───────────────┬───────────────┘                        │
└────────────────────────────┼────────────────────────────────────────┘
                             │ shm (POSIX shm_open + mmap)
┌────────────────────────────▼────────────────────────────────────────┐
│                     JUCE audio engine                               │
│                                                                     │
│   ┌────────────────────────────────────┐                            │
│   │ SPSC shm event ring (CONSUMER)     │  read inside audio cb,     │
│   │                                    │  no locks, no allocations  │
│   └────────────────────┬───────────────┘                            │
│                        │                                            │
│                        ▼                                            │
│   ┌────────────────────────────────────┐                            │
│   │  MidiBindingApplier                │  consumes events,          │
│   │  (consumes events, applies         │  routes via MidiBinding    │
│   │   binding actions to engine state) │  table dispatch            │
│   └────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Event-ring layout (shm)

A header followed by a power-of-two ring of fixed-size `MidiEvent` slots.

```
Header (cache-line aligned, 64 bytes):
    uint64_t  ring_size_log2     (e.g., 12 → 4096 slots)
    uint64_t  slot_size           (= sizeof(MidiEvent), e.g., 64)
    uint64_t  protocol_version    (= 1)
    atomic_uint64_t  write_seq    (producer-only; relaxed store + release on commit)
    atomic_uint64_t  read_seq     (consumer-only; relaxed store + release on commit)
    char[40]  reserved

MidiEvent (cache-line aligned, 64 bytes):
    uint64_t  timestamp_ns        (monotonic clock from libremidi)
    uint16_t  port_id             (canonical port enum from device-pack registry)
    uint8_t   event_type          (1=CC, 2=Note, 3=PC, 4=PitchBend, 5=SysEx-start,
                                   6=SysEx-cont, 7=SysEx-end, 8=Aftertouch, 9=Clock,
                                   10=Realtime, 11=PortGone, 12=PortAppeared)
    uint8_t   channel             (0..15)
    uint8_t   data[40]            (CC: [num, val]; SysEx: chunk; etc.)
    uint8_t   data_len            (bytes used in data[])
    uint8_t   flags               (bit0=SysEx-truncated; bit1=overflow-mark)
    uint16_t  sequence_id         (per-port, wraps; gap detection)
    uint8_t   reserved[6]
```

**Why fixed 64-byte slots:** matches typical x86_64 cache line; one event = one cache-line load on the consumer side. SysEx larger than 40 bytes is split into start + cont + end events, the consumer reassembles. The platform's largest live SysEx (GCP bulk dump, 16567 bytes) hits **415 events**. At 64-byte slots, the ring fits 4096 events = 256 KB — a full bulk dump consumes 10% of the ring momentarily. That's tolerable; the dispatcher can also bypass the ring for >1KB SysEx and use a separate sideband shm region (deferred decision; P1.1 ships ring-only).

**Why SPSC, not MPSC:** the controller-host has one MIDI thread (pinned to a non-RT core) feeding the ring. The JUCE engine has one audio thread reading it. SPSC gives us a lock-free + wait-free implementation in ~30 lines; MPSC would force CAS loops and is unjustified for this topology.

**Backpressure semantics:** if the engine consumer falls behind by more than `ring_size / 2` events, the producer sets the `overflow-mark` flag on the next event written and increments a counter exported via the host's `/midi/health` UDS endpoint. The engine sees the flag, drops to a "panic" mode that issues all-notes-off on every channel and resumes from the latest event — equivalent to the existing rtmidi panic recovery. This is rare; the steady-state rate is bounded by physical MIDI cable bandwidth (~3125 bytes/s = ~50 events/s).

---

## 4. Why libremidi specifically

| Library | License | C++ version | ALSA seq | JACK | RTMIDI compat | Notes |
|---|---|---|---|---|---|---|
| **libremidi** | BSD-2-Clause | C++17 | yes | yes | rtmidi-compat shim | actively maintained (v4.5 2026); the rtmidi successor; first-class JACK + ALSA seq + RtMidi-compat APIs |
| RtMidi (upstream) | MIT | C++03 | yes | yes | (this is rtmidi) | upstream of python-rtmidi; the unmaintained option, 1-2 commits/yr |
| JUCE MidiInput | ISC | (JUCE) | yes | no | n/a | already linked, but JUCE's MIDI I/O isn't first-class on Linux (no JACK MIDI) and is GUI-thread oriented |
| ALSA seqlib direct | LGPL | C | yes | no (ALSA-only) | n/a | lowest level; we'd reinvent device discovery + JACK bridge |

libremidi wins on three axes:
1. Modern C++17 API (callbacks, RAII, no manual init/cleanup).
2. JACK + ALSA seq + WinMM + CoreMIDI in one binary — when the cluster grows beyond Linux nodes (T2459-H7), no second port is needed.
3. Permissive BSD-2-Clause license, compatible with our build's mix of MIT/BSD/ISC dependencies.

---

## 5. Migration plan (5 phases under P1.1)

The sequence avoids any flag day. Each phase ships independently.

### P1.1.a — vendor libremidi + write the C++ shim (1 week)
- Add `juce-engine/external/libremidi` via `FetchContent` in CMake (header-only mostly; one .cpp for the JACK adapter).
- Build flag `USE_LIBREMIDI=ON` (default ON when libremidi headers present, fallback to rtmidi otherwise during the migration window).
- Create `juce-engine/Source/ControllerHost/MidiHostBackend.{h,cpp}` — wraps libremidi with the controller-host's port-id naming.
- Smoke test: enumerate all ALSA seq + JACK ports, log them, exit. Compare against `aconnect -l` + `jack_lsp` output.

### P1.1.b — implement the SPSC shm event ring (1 week)
- `juce-engine/Source/ControllerHost/MidiEventRing.{h,cpp}` — header-only template, instantiated for the canonical `MidiEvent` slot.
- Producer side mounted in `MidiHostBackend`; consumer side mounted in `juce-engine/Source/Map2AudioEngine.cpp` next to the existing meter ring.
- Unit tests under `juce-engine/Tests/MidiEventRingTests.cpp`: producer-only, consumer-only, full-cycle, overflow, sequence-gap detection.
- Soak test (1 hr): synthetic 5000 evt/s producer, audio-callback consumer, assert zero data loss + zero overflow when ring is sized 4096.

### P1.1.c — write `midi_host_client.py` (the only Python MIDI client) (1 week)
- Existing scaffold `app/services/midi_host_client.py` becomes the actual client.
- UDS protocol: `LIST_PORTS`, `OPEN_PORT(port_id)`, `CLOSE_PORT(port_id)`, `SEND_BYTES(port_id, bytes)`, `SUBSCRIBE_EVENTS(callback)`. JSON envelopes; binary payloads framed as `{op:..., len:N}\n<N bytes>`.
- Implements the full `MidiHubPort` interface so `app/services/midi_hub/ports.py` can swap rtmidi → midi_host_client behind a feature flag.
- pytest coverage: mock the UDS server, assert every op round-trips correctly.

### P1.1.d — flag-flip the 5 rtmidi consumers, one at a time (2 weeks)
The order is by blast radius (smallest first). Each step is a single commit + dual-push.

| Order | Service | Why first/last |
|---|---|---|
| 1 | `ground_control_pro/midi_transport.py` | Single device, single transport file, well-tested in isolation. Lowest blast radius. |
| 2 | `maschine/maschine_mk1_daemon.py` | Standalone daemon, single virtual MIDI port (output only). |
| 3 | `sysex_device_bridge.py` | Used by intelfx + mpx1 — verify both devices live. |
| 4 | `midi_hub/ports.py` | Canonical port wrapper — once flipped, every downstream consumer comes along automatically. |
| 5 | `midi_engine.py` | The top-level coordinator. Ship this last and the rtmidi import line in requirements is the only thing left to delete. |

For each flip:
1. Add `MAP2_USE_MIDI_HOST=1` env var support in the file (default off → rtmidi).
2. Run the device-specific pytest suite under both modes (`MAP2_USE_MIDI_HOST=0` and `=1`).
3. Restart the systemd service and verify the device reconnects + sends/receives.
4. Commit the flip with the env-var default flipped to `1`.
5. After all 5 are flipped, a final commit removes the rtmidi code paths + the env-var checks.

### P1.1.e — drop python-rtmidi from requirements + retire dead code (2 days)
- Remove `python-rtmidi` from `requirements-backend-runtime.txt`.
- Remove all `import rtmidi` blocks (now dead).
- Update `app/services/package_manager.py` and `app/services/backup/recovery.py` references.
- Verify `pip install -r requirements-backend-runtime.txt` clean install.
- Update `MIDI_BACKEND.md` and `MIDI_SERVICES.md` to reflect the new topology.

---

## 6. Definition of Done

P1.1 is `[✓] Done` when **every** gate passes:

1. **No `import rtmidi` in `app/`** — `grep -rn "import rtmidi" app/` returns 0 lines.
2. **`python-rtmidi` not in any `requirements*.txt`**.
3. **All 5 services flipped + their test suites green** — pytest greens for the GCP, Maschine, IntelFX, MPX-1, midi_hub, and midi_engine suites.
4. **Live device verification** — at least one physical MIDI device (Edirol UA-1000 USB MIDI port) sends + receives correctly via the new path. Logged in `docs/fit-for-purpose-evidence/<YYYYMMDD>/`.
5. **Latency floor measured** — synthetic injector measures input→engine p99 < 100 µs. Logged in fit-for-purpose evidence.
6. **No xrun regression** — soak test (1 hr, 5000 evt/s) under the new path matches or beats baseline xrun count.
7. **Docs updated** — this doc moved from `Status: Design` to `Status: Shipped`, `MIDI_SERVICES.md` cross-references the shm ring topology, `MIDI_BACKEND.md` retired or marked superseded.
8. **Dual-pushed** — every flip commit on origin + gitlab.

---

## 7. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| libremidi JACK adapter has bugs we don't catch in pytest | medium | P1.1.a smoke test compares against `aconnect -l` + `jack_lsp`. P1.1.d step 3 hits real hardware per service. |
| SPSC ring overflow under SysEx burst (e.g., GCP bulk dump = 415 events) | medium | Ring size 4096 = 10x burst headroom. Sideband shm path queued for P1.2 if measurements show this is real. |
| midi_host_client UDS adds Python-side latency that masks the C++ improvement | low | midi_host_client is for the **outbound + control plane** only; inbound goes shm-direct to the engine, never through Python. |
| Maschine MK1 virtual MIDI output behaves differently under libremidi | low | P1.1.d step 2 keeps the rtmidi fallback live until the new path is verified on real hardware. |
| Migration commits land in the middle of a SysEx parser cutover (T2482-P1.5) and break the iter 38-40 work | low | This doc is design only; implementation is queued post-iter-40 SHIP roll-up. SysEx cutover finishes first. |
| Cluster MIDI (T2459-H6/H7) wire format diverges from local shm format | medium | The `MidiEvent` slot layout in §3 is intentionally cluster-portable — fixed-size, network byte order considered, sequence_id for gap detection. T2459-H6 will reuse this struct verbatim with an additional `node_id` field in the wrapper envelope, not the slot itself. |

---

## 8. Open questions (to resolve before P1.1.a starts)

1. **MIDI 2.0 / UMP support.** libremidi v4 has experimental UMP support. Skip for P1.1 (slot layout above is MIDI 1.0 + SysEx); reopen when MIDI 2.0 hardware lands on the platform.
2. **shm region naming + permissions.** Proposed: `/dev/shm/map2_midi_event_ring_v1`, mode 0660, group `audio`. Confirms with the existing `/dev/shm/map2_meter_ring_*` pattern.
3. **RT priority for the libremidi MIDI thread inside the controller-host.** Proposed SCHED_FIFO/70 (between the audio callback at 80 and data-loop at 55). Lock down post-implementation when measured.
4. **PortGone / PortAppeared semantics.** Today rtmidi services poll for hot-plug. libremidi has callbacks. The shm ring carries `PortGone` / `PortAppeared` events so the JUCE engine side can re-resolve bindings without polling — confirm the MidiBindingApplier handles this correctly (it should; the table dispatch is by canonical port_id, not by ALSA-seq id).

---

## 9. Cross-references

- T2482 epic (Worklist line 34339): the parent four-services unification epic.
- T2482-P1.2 (Worklist line 34373): controller-host dispatcher integration. Consumes this foundation.
- T2482-P1.5 (iters 35-37): SysEx parser ports to JS. The dispatcher in P1.2 calls those ported parsers via the QuickJS hook in the host process.
- T2459-H6/H7: cluster MIDI host-to-host streaming. Reuses the `MidiEvent` slot layout from §3.
- `juce-engine/Source/ControllerHost/Hub/ClusterGateway.{h,cpp}` (Worklist line 1374): C++ scaffold for the cluster master/slave gateway. Will host the cluster-MIDI sender/receiver.
