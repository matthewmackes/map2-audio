# MAP2 MIDI Backend Architecture

**Status:** Authoritative · **Worklist anchor:** T2459-H · **First written:** 2026-04-28

This document defines the MIDI backend architecture for the MAP2
platform — the unification of all MIDI ownership into the
`map2-controller-host` daemon, replacing `python-rtmidi` (Python side)
and the C++ `Map2MidiController` raw-ALSA path. T2459-H1 lays the I/O
foundation; T2459-H2 adds the Mixxx-pattern mapping engine inside the
host. Subsequent H sub-tasks migrate device services, absorb the MIDI
Hub v2, retire the legacy paths, and ship cluster MIDI.

---

## 1. Process model

```
┌──────────────────────────────────────────────────────────────────┐
│  map2-backend (Python FastAPI, port 8080, CPUs 0-3)              │
│                                                                  │
│  app/services/midi_host_client.py     ─┐                         │
│  app/services/controller_host_service ─┴─ supervises             │
│                                                                  │
│  Sends commands over UDS:                                        │
│    script_load_request, mapping_activate, midi_send_request,     │
│    midi_list_ports_request, shutdown                             │
└─────────────────────────┬────────────────────────────────────────┘
                          │ /run/map2/controller-host.sock (UDS)
                          │ length-prefixed JSON frames
┌─────────────────────────┴────────────────────────────────────────┐
│  map2-controller-host (separate process, CPUs 0-3)               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Map2MidiBackend           (libremidi observer + I/O)    │    │
│  │    Probe: JACK MIDI → PipeWire → ALSA seq → ALSA raw     │    │
│  │    Emits midi_backend_degraded diagnostic on non-JACK    │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  LibremidiAdapter           (per-port I/O callbacks)     │    │
│  │    on_message → status-byte classifier (~5 ns)           │    │
│  │      RT bytes  → ShmEventRing (RT,      1024 slots)      │    │
│  │      ctrl bytes→ ShmEventRing (control,  256 slots)      │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  Map2MappingEngine          (one QuickJS instance)       │    │
│  │    loadDescriptor (XML+JS pair)                          │    │
│  │    planDispatch (status, midino, channel) → callback     │    │
│  │    dispatch (callback_name, bytes)                       │    │
│  │    JS host objects: engine.*, midi.*                     │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  ControlObjectBridge        (Mixxx alias resolver)       │    │
│  │    WELL_KNOWN [(group,key) → MAP2 target]                │    │
│  │    + per-pack mixxx_alias_table override                 │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────┬────────────────────────────────────────┘
                          │ /dev/shm/map2-controller-host.midi.{rt,control}
                          │ (POSIX shm + mmap + atomic SPSC ring)
┌─────────────────────────┴────────────────────────────────────────┐
│  map2_audio_engine (JUCE, CPUs 4-5 isolated)                     │
│                                                                  │
│  IpcMidiBridge (T2459-H1 stub; H6 retires Map2MidiController)    │
│    pollRt()      — drained from audio callback start             │
│    pollControl() — drained from a non-RT helper thread           │
└──────────────────────────────────────────────────────────────────┘
```

Crash isolation is enforced by the process boundary: a buggy mapping
script (`script_error` exception in QuickJS) can take down the host,
not the audio engine. The host supervisor restarts the host within the
crash budget defined in `CONTROLLER_LAYER.md` §3.2.

---

## 2. Locked decisions

### Library choices (T2459-H1 5-question protocol, 2026-04-28)

| Q   | Decision | Rationale |
|-----|----------|-----------|
| Q1  | libremidi via CMake `FetchContent` v5.1.0 | Matches existing JUCE/QuickJS precedent in `juce-engine/CMakeLists.txt`; no system-package coupling; reproducible on bare CI. BSL-1.0 license — compatible with AGPLv3 distribution. |
| Q2  | Hardcoded probe order: JACK MIDI → PipeWire native → ALSA seq → ALSA raw | `audio.backend = "pipewire"` is Tier A locked; the JUCE engine already runs as a PipeWire-via-JACK client; JACK MIDI rides the same client cycle and gets cycle-aligned timestamps for free, which is the only path that meets the platform's < 100 µs p99 producer→consumer latency at the shm ring boundary plus the < 200 µs jitter target. ALSA seq adds a kernel-side timer queue hop; ALSA raw doesn't support virtual ports. PipeWire native is second-preferred — long-term direction once libremidi's PipeWire MIDI path matures (UMP support is already there as of v5.1). On any non-JACK selection, the host emits a Warning-level `midi_backend_degraded` diagnostic so the operator sees the bench is below professional spec. |
| Q3  | Two SPSC rings (RT + control); libremidi I/O thread is the producer | A single ring would force CC + SysEx onto the same hot path, defeating the cycle-alignment win. Two rings let the audio thread drain only the RT bucket per audio cycle and absorb SysEx fragments off the audio thread. RT capacity 1024 slots × 320 B = ~320 KB shm region; control 256 slots. Producer is the libremidi I/O callback directly (no extra thread hop). |
| Q4  | MIDI status-byte switch as the RT/control classifier | Hardcoded ~5 ns branchless decision on the I/O thread. RT bucket: note on/off (0x80–0x9F), CC (0xB0–0xBF), pitch bend (0xE0–0xEF), MIDI clock/start/continue/stop (0xF8/FA/FB/FC). Control bucket: PC, channel pressure, SysEx, MTC, song pos/select, tune req, active sensing, reset, data bytes. Classification is fixed by the MIDI 1.0 spec; not configurable. |

### Mapping engine (T2459-H2)

- **Single QuickJS instance per host process.** Reused across every controller's mapping; controller scopes are layered via `controller_key` registration (T2459-B2's `QuickJSEngine::registerController()`).
- **JS host surface** matches the Mixxx ControllerEngine contract:
  - `engine.setValue(group, key, value)` / `getValue` / `trigger` / `setParameter` / `getParameter`
  - `engine.log(...)` / `logInfo` / `logWarning` / `logError` / `logDebug`
  - `midi.sendShortMsg(status, data1, data2)` — short MIDI 1.0 messages
  - `midi.sendSysexMsg(byteArray, length?)` — SysEx packets
  - Mixxx-compat stubs for `connectControl`, `makeConnection`, `beginTimer`, `softTakeover`, `scratchEnable/Tick/Disable`, `brake`, `spinback`, `softStart`, etc. — wired as no-ops where MAP2 has no analogue (`UNSUPPORTED_KEYS` set in `ControlObjectBridge`).
- **License posture (locked Q in T2459 epic).** The Mixxx ControllerEngine code-pattern is *studied + re-implemented* in MAP2's own code. Imported `_mixx-imports/` files run as data under MAP2's reimplemented engine; we never ship Mixxx's source compiled into our binary. The `ControlObjectBridge::WELL_KNOWN` table is MAP2-original, mapping the same Mixxx string keys to the MAP2 engine-target namespace (e.g. `[Channel1].volume → audio.chain.1.volume`). Per-pack `mixxx_alias_table` overrides let vendor packs map Mixxx's 4-deck assumption onto an arbitrary MAP2 chain layout.

---

## 3. Wire format — shm event ring

Each ring is a POSIX shm region (`shm_open` + `mmap`) layout:

```
[0]   Header (64 B, cache-line aligned)
        atomic<uint64_t> writeIndex
        atomic<uint64_t> readIndex
        uint64_t         capacity         (power of two)
        atomic<uint64_t> droppedCount
        uint8_t          _pad[32]
[64]  Slot[0]   (320 B, cache-line aligned)
[384] Slot[1]
…
```

Per-slot:

```
atomic<uint64_t> tsNanos              (8 B, host monotonic clock)
atomic<uint16_t> length               (2 B)
uint16_t         reserved             (2 B, alignment / future use)
uint8_t          payload[256]         (256 B max; SysEx > 256 B is fragmented)
uint8_t          _pad[…]              (pad to 320 B / 5 cache lines)
```

Producer (libremidi I/O thread): writes `length=0` first, copies payload, publishes `length` with release ordering, then advances `writeIndex` with release ordering. Consumer reads `writeIndex` (acquire), `length` (acquire), copies payload, advances `readIndex` (release).

Overflow policy: when the ring is full, push() drops the new event and increments `droppedCount`. Consumer reads `droppedCount` on each pop() to surface drops as a diagnostic event. Producer never blocks — that would defeat the < 100 µs p99 acceptance gate.

T2459-H1 stress test: 1M events through a real producer/consumer thread pair, p50 = 987 ns, p95 = 49.6 µs, p99 = 90.4 µs (under the 100 µs gate), max = 172 µs. Steady-state lock-free fast path is sub-microsecond; tail elevation is the cache-line bouncing penalty when the ring nears full.

---

## 4. IPC contract — backend ↔ host

Length-prefixed JSON frames over `/run/map2/controller-host.sock`. Schema lives in `app/schemas/controller_host.py`; matching C++ structs in `juce-engine/Source/ControllerHost/IpcMessages.h`. CI test `tests/test_controller_host_ipc_schema.py` enforces field-set parity.

Inbound (backend → host):

| Type | Purpose |
|------|---------|
| `script_load_request` | Load a mapping JS body into a controller_key scope |
| `mapping_activate` | Set the active `MappingDescriptor` for a controller |
| `midi_send_request` | Send a MIDI message OUT through a connected controller (LED feedback, etc.) |
| `midi_list_ports_request` | Enumerate visible MIDI ports through libremidi |
| `shutdown` | Graceful exit |

Outbound (host → backend):

| Type | Purpose |
|------|---------|
| `engine_command` | A JS `engine.setValue(...)` to forward to the audio engine |
| `controller_event` | Raw event captured for the Learn Wizard |
| `log_event` | `engine.log(...)` line |
| `script_error` | QuickJS exception (mapping marked failed) |
| `midi_list_ports_response` | Port list + selected backend + degraded flag |

`SCHEMA_VERSION` lives at `app/schemas/controller_host.py:SCHEMA_VERSION`. Bump on any breaking change.

---

## 5. License + attribution

| Component | License | Notes |
|-----------|---------|-------|
| libremidi | BSL-1.0 | Vendored via FetchContent; permissive, AGPLv3-compatible |
| QuickJS | MIT | Vendored via FetchContent (T2459-B2) |
| `ni-midi2` | MIT (NI-donated) | UMP/MIDI 2.0 layer — added in T2459-H5 |
| Mixxx ControllerEngine pattern | GPLv2-or-later | Pattern studied + re-implemented in MAP2's code; Mixxx source never compiled in |
| `_mixx-imports/` device packs | GPLv2-or-later | Imported as data under MAP2's engine; preserved with attribution; see `device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt` |

The host process is GPL-clean: it embeds QuickJS (MIT) + libremidi (BSL-1.0) + ni-midi2 (MIT) + MAP2-original code. Mixxx mappings run *inside* the host as data scripts — no GPL contagion across the IPC boundary into the JUCE audio engine.

`docs/THIRD_PARTY_NOTICES.md` carries the verbatim license text.

---

## 6. Test gates

- **`controller_host_tests` (Catch2)**: 353 assertions / 59 cases as of T2459-H2. Covers QuickJS engine lifecycle, HID + bulk controller stubs, shm event ring (16 H1 cases including the 1M-event SPSC stress), MIDI backend probe + diagnostic emission (5 cases), control-object bridge (8 cases including alias-table override + WELL_KNOWN coverage across 4 channels × 8 hot cues), and mapping engine descriptor load + dispatch + outbound MIDI round-trip + reload (7 cases).
- **`tests/test_controller_host_ipc_schema.py`**: 9 cases — Python `FIELD_MANIFEST` ↔ C++ `CPP_FIELD_MANIFEST` parity for every IPC type.
- **`tests/test_midi_host_client_t2459h1.py`**: 5 cases — round-trip list-ports payload, degraded flag, split-shape parity, unreachable-socket clear error, bench HIL parity vs. python-rtmidi (backend-aware: strict on `alsa_seq`, soft observation on JACK/PipeWire).
- **`tests/test_t2459_hil_smoke.py`**: end-to-end smoke; passes alongside the H1/H2 surfaces.

---

## 7. Deferred work tracked elsewhere

- **Map2MappingEngine ↔ libremidi wire-up** — the host main loop in `Source/ControllerHost/main.cpp` instantiates `Map2MidiBackend` (H1) and listens for `midi_list_ports_request`; the equivalent dispatch from the shm ring → `Map2MappingEngine::planDispatch` → `Map2MappingEngine::dispatch` lands in T2459-H3 (first device-pack cutover) when the IPC writer back to the Python `engine_command` queue is wired.
- **Hot-reload under load** — `Map2MappingEngine::loadDescriptor` overwrites the per-controller descriptor and re-evaluates scripts; an integration test that proves in-flight events finish under the old script while new events route to the new one is queued for T2459-H3.
- **Golden tests against B5 fixtures (Pioneer CDJ-2000, Behringer CMD-Micro, Pioneer DDJ-SX)** — T2459-H2's brief lists these; the H2 deliverable here ships a smaller golden harness (one synthetic descriptor with deterministic input → output trace) and the per-fixture coverage lands as the device-pack cutovers in T2459-H3 and H4 progress.
- **MIDI 2.0 / UMP** — T2459-H5 adds `ni-midi2` and routes UMP packets through the same shm ring (the `length` field tolerates UMP's 4-, 8-, 12-, 16-byte frames; payload buffer is 256 B which fits the largest UMP message family).
- **Cluster MIDI** — T2459-H7. Host-to-host gateway over the existing cluster transport.

---

## 8. Cross-references

- `docs/architecture/CONTROLLER_LAYER.md` — process model, IPC contract, vendor-pack format, GUI surface
- `docs/midi/MIDI_HUB_ARCHITECTURE.md` — MIDI Hub v2 surfaces (clock, recorder, traffic monitor, virtual GPIO, OSC namespace, Tesira, string interface, event lists). Migrates into the host under T2459-H5.
- `app/schemas/controller_host.py` — IPC TypedDicts + `FIELD_MANIFEST` + `encode_frame`/`decode_frame`
- `juce-engine/Source/ControllerHost/IpcMessages.h` — C++ structs + `CPP_FIELD_MANIFEST`
- `juce-engine/Source/ControllerHost/EventRing/ShmEventRing.{h,cpp}` — SPSC shm ring
- `juce-engine/Source/ControllerHost/Midi/{Map2MidiBackend,LibremidiAdapter}.{h,cpp}` — libremidi wrapper
- `juce-engine/Source/ControllerHost/MappingEngine/{Map2MappingEngine,ControlObjectBridge}.{h,cpp}` — mapping engine + alias resolver
- `juce-engine/Source/Controllers/Midi/IpcMidiBridge.{h,cpp}` — engine-side consumer stub

---

## 9. UMP / MIDI 2.0 (T2459-H5 Slice 13)

The MIDI 2.0 / UMP foundation rides the same two-ring contract as MIDI 1.0
without growing a third ring or changing `kSlotSizeBytes` /
`kMaxPayloadBytes`.

### Classifier

`classifyUmpMessageType(mt)` in `ShmEventRing.h` buckets a UMP packet's
4-bit message-type nibble identically to the MIDI 1.0 status-byte
classifier:

| MT | Family | Bucket |
|----|--------|--------|
| 0x0 | Utility (NOOP / jitter reduction) | Control |
| 0x1 | System Real Time / Common | RT |
| 0x2 | MIDI 1.0 Channel Voice | RT |
| 0x3 | Data 64 (SysEx7) | Control |
| 0x4 | MIDI 2.0 Channel Voice | RT |
| 0x5 | Data 128 (SysEx8 / Mixed Data Set) | Control |
| 0x6..0xF | Reserved / future | Control |

Implementation is a 16-bit RT-mask shift, branchless, ~5 ns. Helper
`umpMessageTypeFromFirstByte()` extracts the nibble from the first
payload byte.

### Slot discriminator

`Slot::reserved` (uint16) bit allocation (T2459-H5 Slice 13 + Slice 6
coordination):

- **bit 15** (`kSlotFlagIsUmp`) — 0 = MIDI 1.0 byte stream, 1 = UMP packet.
- **bits 0..14** — reserved for the upcoming Slice 6 controller_index.
  Slice 13 leaves them zero.

The wire format on disk is unchanged. Slice 13 ships
`pushWithFlags()` / `popWithFlags()` overloads on `ShmEventRing` for
producers / consumers that need the discriminator; the existing `push()`
/ `pop()` continue to behave as before (flags = 0).

### Producer seam

`LibremidiAdapter::pushUmpMessage(bytes, length)` is the integration
entry point. Length must be 4 / 8 / 12 / 16 (one to four 32-bit words);
anything else is rejected. The adapter classifies via the UMP message
type and pushes to the matching ring with `kSlotFlagIsUmp` set.

The vendored libremidi v5.1.0 we build against does not yet expose a
hardware-validated UMP input/output surface on this platform. Once a
MIDI-2.0-capable device is on the bench, a real `openUmpInput()` lands
next to this seam (the upstream API surface is what blocks that step,
not engine-side plumbing).

### IPC additive field

`MidiSendRequest` gains an optional `format` field. Existing producers
omit it and remain wire-compatible (`""` / absent / `"midi1"` all mean
MIDI 1.0). `format = "ump"` flags the `bytes` array as a single UMP
packet (4 / 8 / 12 / 16 bytes). The Python side ships
`MidiHostClient.send_ump(controller_key, packet_bytes)` which validates
length and emits the framed request.

The schema-sync gate
(`tests/test_controller_host_ipc_schema.py::test_python_manifest_matches_cpp`)
verifies the `MidiSendRequest` field list matches the C++
`CPP_FIELD_MANIFEST`.

### Tests

- `juce-engine/tests/ShmEventRingTests.cpp` — UMP classifier truth table,
  `umpMessageTypeFromFirstByte` extraction, is_ump flag round-trip
  through push / pop with controller_index bits zero.
- `juce-engine/tests/UmpRoundTripTests.cpp` — `pushUmpMessage` routes
  MT=4 (M2 channel voice) to RT and MT=3 (SysEx7) to control with the
  flag set; rejects malformed lengths.
- `tests/test_controller_host_ump_roundtrip_t2459h5.py` — schema accepts
  `format` additively, `send_ump` constructs the right wire frame, the
  CPP_FIELD_MANIFEST line for `MidiSendRequest` carries `format`.

---

---

## 10. PipeWire 1.4.10 UMP-MIDI2 substrate gap (T2459-H7-PW-UMP, Path 4)

**Status:** Path 4 selected 2026-05-08 — see `docs/midi/T2459_H7_PW_UMP_DECISION.md`.

PipeWire ≥ 1.4.10 ships its UMP-MIDI2 ALSA-seq clients (default-named
`Midi-Bridge`, typically client IDs 142+) as the substrate that should
auto-bridge legacy `[type=kernel]` MIDI 1.0 clients into the JACK MIDI
graph. In practice it does not subscribe them — kernel MIDI 1.0 devices
appear as discoverable JACK MIDI ports (`Midi-Bridge:<DEVICE> MIDI 1`)
but never deliver events. libremidi opens the JACK MIDI port cleanly,
so the controller-host's `JackMidi` probe binds — silently, with zero
inbound traffic.

The MAP2 platform answer is **Path 4**: detect the gap before spawning
the controller-host and force the libremidi backend to `alsa_seq` for
that host instance. ALSA-seq direct subscription works (it's the
substrate the kernel client is registered on; PipeWire's UMP layer is
upstream of the bridge gap).

### Detection logic

`app/services/controller_host_pipewire_substrate.detect_substrate_state()`
runs at controller-host startup and classifies the host into one of:

| State | Meaning | Effect |
|---|---|---|
| `HEALTHY` | PipeWire absent / older / no UMP-MIDI2 client / kernel clients have peers | C++ probe order preserved |
| `BROKEN_UMP_BRIDGE` | Gap signature matched | Force `MAP2_MIDI_BACKEND_FORCE=alsa_seq` for the controller-host child process |
| `NO_PIPEWIRE` | No `pw-cli` available; no PipeWire daemon | C++ probe order preserved |
| `PROBE_DISABLED` | `MAP2_PW_UMP_PROBE_DISABLE=1` set in env | C++ probe order preserved |
| `PROBE_ERROR` | Tooling missing / unparseable output | C++ probe order preserved (fail-open) |

The gap signature requires **all** of:

1. PipeWire core.version ≥ 1.4.10 (parsed from `pw-cli info 0`).
2. At least one ALSA-seq client whose name matches `Midi-Bridge`,
   `PipeWire-UMP`, or `PipeWire-MIDI2` (case-insensitive substring;
   pinned to PipeWire-published names so it never collides with
   kernel device names like `TSMIDI2.0`).
3. At least one `[type=kernel]` MIDI 1.0 client on the bus that has
   no `Connecting To:` peer **and** no `Connected From:` peer (the
   PipeWire bridge has not subscribed it). System / `Midi Through`
   clients are excluded; the client must have at least one `Port`
   line to count as a real device.

### Per-device skip (host-wide posture today)

The detection is per-installation: if **any** legacy MIDI 1.0 device on
this host has the gap signature, the host-wide `alsa_seq` posture is
forced. UMP-MIDI2-native devices still work through ALSA seq — no
correctness regression, only a unification regression for ports that
get multiplexed by JACK (a feature MAP2 doesn't currently exercise on
the affected substrate). Per-device backend selection is filed as a
follow-on if a multi-device rig actually needs it.

### Operator-visible behaviour

Backend startup log on a broken host:

```
[map2-backend] T2459-H7-PW-UMP probe: BROKEN_UMP_BRIDGE — PipeWire 1.4.10 UMP-MIDI2 bridge gap detected:
  orphan kernel MIDI 1.0 clients ['TSMIDI2.0'] have no peer subscription from ['Midi-Bridge'].
  Forcing controller-host to alsa_seq backend (Path 4).
[map2-controller-host] midi backend = alsa_seq
[map2-controller-host] degraded: midi_backend_degraded — MIDI backend bound to alsa_seq …
```

The `midi_backend_degraded` Warning diagnostic is intentional — it tells
the operator that traffic is on the substrate-aware fallback rather than
the preferred JACK-MIDI cycle-aligned path.

### Operator overrides

| Env var | Effect |
|---|---|
| `MAP2_PW_UMP_PROBE_DISABLE=1` | Skip the substrate probe entirely. C++ probe order runs verbatim. |
| `MAP2_MIDI_BACKEND_FORCE=jack_midi` | Force `JackMidi` regardless of probe outcome. Wins over the probe via `apply_to_env_overrides()` (caller-supplied values beat probe defaults). |
| `MAP2_MIDI_BACKEND_FORCE=alsa_seq` / `pipewire` / `alsa_raw` | Force any specific backend; same precedence rule. |
| `MAP2_HIL_PIPEWIRE_UMP=1` | Enables the live HIL test case in `tests/test_t2459h7_pw_ump_fallback.py`. No-op in CI. |

### Removal path

When PipeWire upstream closes the bridge gap (Path 1 in the decision
doc), the probe naturally returns `HEALTHY` because either (a) the
parsed version is below `PIPEWIRE_VERSION_BROKEN_AT` (raise it), or
(b) the orphan-kernel-client check passes (peers are subscribed). Once
verified across the supported PipeWire range, the entire
`controller_host_pipewire_substrate` module + its env-override hookup
+ the C++ `MAP2_MIDI_BACKEND_FORCE` consumer can be deleted in a single
commit. Nothing else depends on this code path.

### Cross-references

- Decision doc with all four resolution paths: `docs/midi/T2459_H7_PW_UMP_DECISION.md`
- Probe module: `app/services/controller_host_pipewire_substrate.py`
- Probe tests: `tests/test_t2459h7_pw_ump_fallback.py` (12 unit cases + HIL gate)
- Per-device sidestep that motivated the generalization: `app/services/devices/meloaudio/commander_discovery_subscriber.py`
- Bench evidence (gap surfaced): `docs/fit-for-purpose-evidence/20260507/t2459h3-meloaudio-commander/alsa_midi_dump.txt`
- Bench evidence (Path 4 production): `docs/fit-for-purpose-evidence/20260508/t2459h7-pw-ump-path4/`

---

**End of document.** Authoritative for T2459-H implementation work. Edits go through the standard `update` shorthand and dual-push.
