# DAW Service (Tracktion-backed) — Architecture

> **Status:** filed 2026-05-09 under T2503 Epic. Code-side delivery in 10 ship cycles.
> **License posture:** AGPLv3 (existing) + GPLv3 (Tracktion) → distributes as AGPLv3. See [`LICENSE_COMPATIBILITY.md`](./LICENSE_COMPATIBILITY.md).
> **Build flag:** `-DMAP2_DAW_MODE=ON` (default OFF until Set 10 closes).

---

## 1. Service identity

The **DAW** service is a tier-1 platform service offering, peer to:

- MIDI Services
- AVB Services
- Sampler (re-platformed on Tracktion sampler core under T2503 Set 8 — see [`SAMPLER_REPACKAGING.md`](./SAMPLER_REPACKAGING.md))
- Audio Effects Services

Each service has a single canonical authority, a single canonical surface, and zero parallel implementations. The DAW service follows that pattern: **one engine** (Tracktion embedded in `juce-engine/`), **one IPC channel** (the existing `engine_command` bus, extended with `daw.*` verbs), **one on-disk authority** (the MAP2 State Authority graph).

The **React UI is a non-tier-1 reference surface**. The tier-1 surfaces for DAW control are MIDI control surfaces (NI Maschine MK1, Mackie Control Universal protocol surfaces, generic MIDI learn).

---

## 2. Process and callback model

### Embedding

Tracktion Engine is **embedded inside `juce-engine/`** alongside the existing `Map2AudioEngine`. There is no separate `map2-daw-host` process. This keeps the DAW signal path inside the same address space as the live-mode engine and avoids adding a third audio process to coordinate against PipeWire.

The build flag `-DMAP2_DAW_MODE=ON` controls inclusion. With the flag OFF (default), the DAW source tree compiles to nothing and the live engine is byte-identical to a pre-T2503 build.

### Callback ownership

When DAW mode is engaged, **Tracktion owns the audio device callback**. The transition is a **hard mode switch**:

```
Live mode                                    DAW mode
─────────                                    ────────
Map2AudioEngine.callback (RT)                tracktion::Engine.callback (RT)
   │                                            │
   └─── audio device (UA-1000 @ 64/48k) ───────┘
        single-owner; transition is              single-owner; transition is
        Stop → Release → Init                    Init → Open → Run
```

A brief audio dropout during transition is acceptable (v1). Hot-swap with no dropout is **out of scope**.

### Buffer math

The Tier-A locked device callback is **64 samples / 48 kHz / 1.33 ms** (`juce-engine/Source/Common.h::DEFAULT_BUFFER_SIZE`). That invariant is preserved in DAW mode. To give Tracktion realistic plugin-scheduling and disk-streaming headroom, the DAW signal graph runs internally at **128 samples** through `tracktion::BufferingAudioSource`. The device callback consumes the buffered output at 64 samples — Tracktion absorbs the difference.

| Parameter | Live mode | DAW mode |
| --- | --- | --- |
| Device callback | 64 samples / 48 kHz | 64 samples / 48 kHz (Tier A locked) |
| Internal graph | 64 samples (direct) | 128 samples (`BufferingAudioSource`) |
| Soak gate | 0 xruns / <0.35 ms peak jitter (existing) | 0 xruns / <1 ms peak jitter / 30 min (T2503 Set 10) |

---

## 3. State authority and on-disk format

### Authority

**MAP2 State Authority is the source of truth.** Tracktion's native `Edit` XML is a **regenerated cache**.

```
MAP2 graph (project.json)  ←── authoritative
        │
        │ project (one-way)
        ▼
edit.tracktionedit  ←── generated cache, never edited in place
```

This honors locked decisions A7, A8, A12, A25 simultaneously: the on-disk MAP2 representation is portable and versioned by State Authority migrations; `.tracktionedit` is shipped alongside for tooling compatibility (Waveform, Tracktion's own apps) but is never the source of truth.

### Filesystem layout

Sessions live under `~/.map2/daw/<project>/` (matching the [Configuration Authority Model](./CONFIGURATION_AUTHORITY_MODEL.md) — user/operator/session-scoped state):

```
~/.map2/daw/<project>/
├── project.json                  # MAP2 graph (authoritative)
├── edit.tracktionedit            # generated cache
├── audio/                        # recorded takes
│   └── <track-id>/<take-id>.wav
├── render/                       # bounce / mixdown output
└── .lock                         # single-writer lock
```

### Sync direction

MAP2 → Tracktion is the **only** sync direction. Tracktion is **read-only at the API boundary** — mutations flow through `engine_command` `daw.*` verbs, MAP2 graph mutates, MAP2 re-projects to `edit.tracktionedit`, Tracktion reloads. This eliminates dual-write divergence by construction.

---

## 4. Control plane

### Tier-1 surfaces

1. **NI Maschine MK1** — DAW-mode overlay added to existing `device-packs/native-instruments/maschine-mk1/` (additive, mode-switched).
2. **Mackie Control Universal (MCU) protocol** — `device-packs/mackie/mcu-protocol/` device-pack. Unlocks any MCU-compatible surface (X-Touch, Behringer XR, etc.).
3. **Generic MIDI Learn** — extended `app/services/midi_learn_service.py` with a typed DAW target group.

### Routing

All control flows through **`map2-controller-host` → `engine_command` IPC → DAW handlers**. This is a deliberate choice over Tracktion's native `tracktion::ControlSurface` framework: it preserves single-source-of-truth mapping in the controller-host (per [`CONTROLLER_LAYER.md`](./CONTROLLER_LAYER.md)) and avoids fragmenting MIDI ownership.

```
MIDI surface
   │
   ▼
map2-controller-host (libremidi + Mixxx ControllerEngine)
   │
   ▼ engine_command frame: { verb: "daw.transport.play", args: {} }
   │
   ▼ via shm event ring (audio-rate) or UDS control plane (everything else)
   │
   ▼
juce-engine
   │
   ▼ DawCommandRouter dispatches to DawService method
   │
   ▼
tracktion::Engine
```

### Verb surface

Set 4 introduces 17 `daw.*` verbs covering transport, project lifecycle, tracks, clips, automation, and plugin slots. Each verb has:

- A C++ handler in `Daw/DawCommandRouter.cpp` (one function per verb, no dynamic dispatch).
- A Python-side wrapper in `app/services/engine_command_handlers.py` for testability.
- A REST shape under `/api/v1/daw/*` for the React reference UI.

---

## 5. Transport and sync

### Master

**MAP2's platform clock is canonical.** Tracktion's `TransportControl` follows via `setUseExternalSync(true)`. Position is sample-accurate at 48 kHz.

This inverts the typical DAW arrangement (where Tracktion would be master). The reason: MAP2's tempo service (`app/services/tempo_service.py`) is already the master for the live engine, MIDI Hub, Sampler, and other services. Adding a second master in DAW mode would violate the "one master clock" invariant called out in CLAUDE.md *Common Pitfalls*.

### External sync sources

The tempo service is extended with a sync-source state machine:

| Source | Role | Mutual exclusion |
| --- | --- | --- |
| `internal` | platform-generated clock (default) | — |
| `midi_clock_in` | external MIDI Clock from peer | excludes `midi_clock_out` |
| `mtc` | MIDI Time Code quarter-frame | excludes `ltc` |
| `ltc` | Linear Time Code (SMPTE) | excludes `mtc` |

Tracktion does not see the source choice; it always follows the platform clock.

### Outbound

`Daw/MidiClockOut` emits MIDI Clock at platform tempo through the controller-host MIDI router. `MtcLtcBridge` emits MTC quarter-frame and LTC.

---

## 6. Plugin hosting

### Inventory

A **single shared plugin scanner** (`Daw/PluginScanner`) produces one inventory consumed by both the live engine and the DAW service. Owned by `app/services/plugin_inventory_service.py` and projected over WebSocket as `plugin_inventory.changed` events.

### Formats (day-one scope)

- **LV2** (native Linux ecosystem)
- **Native MAP2 plugins** (NAM, Cabinet IR, Reverb IR, JUCE-internal effects)

VST3, CLAP, VST2 are explicitly deferred to a separate epic. Adding them is mechanical (JUCE supports all three) once the scanner abstraction is in place.

### AVB streams as plugins

AVB streams are exposed to Tracktion as **dedicated plugins** (`Daw/AvbBusPlugin`). One stream descriptor = one plugin instance. The plugin appears in track plugin browsers as `MAP2 ▸ AVB Bus`. `processBlock` reads/writes the existing AVB ring buffers.

---

## 7. Sampler service interaction

The MAP2 Sampler service is **re-platformed on Tracktion's `SamplerPlugin`** as its core. The Sampler service IPC and verb surface are unchanged; the implementation underneath swaps. See [`SAMPLER_REPACKAGING.md`](./SAMPLER_REPACKAGING.md) (filed under T2503 Set 8).

This is asymmetric with the Audio Effects service, which **stays platform-native** (Tracktion sees existing FX as JUCE plugins via the shared scanner). The asymmetry is intentional: Tracktion's sampler is well-tested upstream and used in commercial products; the existing MAP2 effects are tuned to specific live-rig requirements (NAM IR latency, cabinet IR matching) that we do not want to re-validate.

---

## 8. RT contract and soak gate

### RT gate

| Metric | Threshold | Source |
| --- | --- | --- |
| xruns over 30 min | 0 | adapted soak harness |
| Peak block jitter | < 1 ms | adapted soak harness |
| Internal graph size | 128 samples | `Daw/DawDeviceManager` |
| Device callback size | 64 samples | Tier A locked (`Common.h`) |
| Sample rate | 48 kHz | Tier A locked |

### Soak

`.codex/skills/daw-soak/` (T2503 Set 10) replicates the `juce-random-effects-soak` pattern: random clip launches, plugin reorder, tempo nudge, all over 30 minutes. Output to `docs/fit-for-purpose-evidence/<date>/t2503-daw-soak/`.

The soak gate is **mandatory** before declaring DAW tier-1. Until the operator captures a clean run on the UA-1000, the service ships as `[>] In Progress, code-side complete, bench-gate t2503-daw-soak`.

---

## 9. React reference UI scope

Per locked decision A23, the React UI provides **full editing parity** (timeline, plugin params, automation curves) but is explicitly tagged a **non-tier-1 surface**. It exists as:

- A reference implementation that proves the verb surface is complete and round-trippable.
- A debugging tool when MIDI surface state diverges from engine state.
- An onboarding aid for operators who haven't yet provisioned a MIDI surface.

It is **not** the recommended day-to-day surface. Operators run DAW mode through MIDI control. Documentation and onboarding flows must reinforce this — `/daw` carries an "Reference UI — control via MIDI surface" badge in the page header.

---

## 10. Open questions / future work

- **VST3 / CLAP / VST2** — separate epic. Pull in once the LV2 path validates the scanner abstraction.
- **Ableton Link** — separate epic. Network peer-to-peer sync is convenient for ad-hoc jams but not required for studio recording.
- **Hot-swap mode transitions** — v1 ships hard switch (audio dropout). A buffer-aligned hot swap is feasible but adds substantial state-machine complexity; defer until operator demand surfaces.
- **Multi-project active sessions** — v1 supports one open project at a time (one `Edit` instance). Multi-project would require Tracktion's `EditManager` and a project-scoped State Authority subgraph.

---

## 11. References

- Tracktion Engine: https://github.com/Tracktion/tracktion_engine (GPLv3)
- License audit: [`LICENSE_COMPATIBILITY.md`](./LICENSE_COMPATIBILITY.md)
- Sampler re-platform: [`SAMPLER_REPACKAGING.md`](./SAMPLER_REPACKAGING.md) (filed under T2503 Set 8)
- Controller layer: [`CONTROLLER_LAYER.md`](./CONTROLLER_LAYER.md)
- Configuration authority: [`CONFIGURATION_AUTHORITY_MODEL.md`](./CONFIGURATION_AUTHORITY_MODEL.md)
- AVB services (peer): [`AVB_SERVICES.md`](./AVB_SERVICES.md)
- Audio Effects services (peer): [`AUDIO_EFFECTS_SERVICES.md`](./AUDIO_EFFECTS_SERVICES.md)
- Worklist epic entry: [`../PROJECT_WORKLIST.md`](../PROJECT_WORKLIST.md) (T2503)
