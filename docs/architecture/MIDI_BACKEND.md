# MIDI backend — implementation state

**Status**: Living document, updated per phase ship.
**Companion to**: `docs/architecture/MIDI_SERVICES.md` (the design-intent doc + canonical reference).
**Epic**: T2482 (MIDI Services).
**Originally planned by**: T2459-H (since subsumed under T2482 Phase 1).

This document tracks the **as-built state** of the MIDI backend implementation. `MIDI_SERVICES.md` describes what we're building and why; this doc describes what exists today, what's still in place from before the unification, and where the seams are.

---

## 1. Process topology

MIDI on this platform spans three processes:

```
┌──────────────────────────────┐    UDS control plane    ┌──────────────────────────────┐
│  app/ (FastAPI on :8080)     │ ◄────────────────────► │  map2-controller-host         │
│  - REST + WS routes          │                         │  - libremidi I/O (planned)   │
│  - MidiBindingAuthority      │                         │  - QJSEngine mapping host    │
│  - Per-consumer projections  │    SPSC shm event ring │  - Device-pack JS execution  │
│  - Snapshot integration      │    (audio-rate events) │                              │
└──────────────────────────────┘                         └──────────────────────────────┘
                                                                  │
                                                          shm event ring
                                                                  │
                                                                  ▼
                                                       ┌──────────────────────────────┐
                                                       │  juce-engine                 │
                                                       │  - Audio callback consumers  │
                                                       │  - Sample-accurate triggers  │
                                                       │  - Clock sync                │
                                                       └──────────────────────────────┘
```

- **app/** (Python FastAPI, this is the host's main process): owns the `MidiBinding` authority, snapshot/Brain/per-device projections, REST + WebSocket endpoints, and the operator-facing surfaces.
- **map2-controller-host** (separate C++ binary; `juce-engine/build/map2-controller-host`): owns MIDI I/O via libremidi (planned — currently routes through legacy paths), QuickJS-driven mapping execution per-controller, device-pack JS hosting.
- **juce-engine** (the C++ audio engine, embedded in the same Python process via JUCE bindings): consumes audio-rate MIDI events from the shm ring; never speaks to MIDI hardware directly (planned — currently still uses `Map2MidiController.cpp` for raw ALSA, which P1.3 retires).

---

## 2. Current implementation state (as of 2026-05-01)

### 2.1 What exists

| Component | Location | State |
|---|---|---|
| MIDI Hub registry | `app/services/midi_hub/device_registry.py` | **Active**. `MidiDeviceState` + `MidiDeviceBinding` (T2480-5 seed). |
| MIDI Hub router | `app/services/midi_hub/router.py` | **Active**. Routes inbound/outbound MIDI through the singleton hub. |
| MIDI Hub `inbound_traffic_bridge` | `app/services/midi_hub/inbound_traffic_bridge.py` | **Active** (T2480-3). Mirrors every inbound MIDI message into the `midi:traffic` WS topic. Installed unconditionally in app startup since 2026-05-01 (the cluster-gated install bug fixed in commit `fc5b3c2e`). |
| MIDI Hub clock | `app/services/midi_hub/clock_engine.py` + `cluster_clock.py` | **Active**. Clock master/slave + cluster sync. |
| MIDI Hub presets | `app/services/midi_hub/preset_service.py` | **Active**. |
| MIDI Hub macros, scheduler, recorder, scripts, transforms | `app/services/midi_hub/{macros,scheduler,recorder,script_engine,transforms}.py` | **Active**. |
| MIDI Hub network: RTP-MIDI, MIDI 2.0, OSC, Tesira TTP, virtual GPIO, string interface | `app/services/midi_hub/{rtp_transport,midi2,osc_namespace,tesira_client,virtual_gpio,string_interface}.py` | **Active**. |
| MIDI Hub event lists | `app/services/midi_hub/event_list_service.py` | **Active**. |
| MIDI Hub message mapper | `app/services/midi_hub/message_mapper.py` | **Active**. |
| MIDI Hub gateway + cluster | `app/services/midi_hub/gateway.py`, `cluster_gateway.py`, `cluster_router.py`, `midi_discovery.py` | **Active**. |
| Routes consolidation | `app/routes/midi.py` | **Active per T2459-H5 ship 2026-04-28**. Replaces 7 prior route files. |
| Controller-host process | `juce-engine/Source/ControllerHost/` + `juce-engine/build/map2-controller-host` | **Active per T2459 ship 2026-04-27**. QuickJS-driven mapping execution; UDS control plane wired. |
| Controller-host MIDI I/O | _planned_ | **Not yet implemented (T2482-P1.1)**. The host does not yet own MIDI I/O — `Map2MidiController.cpp` still does. |
| Controller-host ControllerEngine | _planned_ | **Not yet implemented (T2482-P1.2)**. QJSEngine instances per-controller + XML profile loader + B5 fixture golden tests. |
| Cluster MIDI host-to-host protocol | _planned_ | **Not yet implemented (T2482-P1.4)**. `app/routes/midi_cluster_proxy.py` still active. |
| Device-packs migrated to controller-host JS | `device-packs/{meloaudio,native-instruments}/profiles/` | **2 of 8 shipped** per the P1.5 audit (2026-05-01): MeloAudio MIDI Commander, NI Maschine MK1. Missing: Lexicon MPX-1, Rocktron IntelFX, Mackie MCU Pro, Novation Launch Control, Ableton Push, Voodoo Lab Ground Control Pro, Biamp Tesira. |
| JUCE engine raw-ALSA path | `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp` | **Active** (slated for retirement in T2482-P1.3). |
| Python MIDI library | `python-rtmidi` (in `requirements-backend-runtime.txt`) | **Active** (PyPI ~12 months stale per T2459-H ship report). Slated for removal once libremidi pybind11 wrapper lands. |
| Per-device SysEx parsers | `app/services/mpx1_syx_parser.py`, `intelfx_syx_parser.py` | **Active**. Slated for re-implementation as device-pack JS scripts (T2482-P1.5). |
| MIDI curves consolidation | `app/midi/curves.py` (per H4 ship) | **Active**. Replaces four parallel `CurveType` definitions. Confirmed during H4 (2026-04-28). |

### 2.2 What's been deleted

Per the T2459-H ship reports:

- **H3 (2026-04-28)**: dispatcher slice — MeloAudio Commander hardcoded Python dict (669 lines) deleted; replaced by device-pack `device-packs/meloaudio/profiles/midi-commander.midi.yaml` + JS scripts.
- **H4 (2026-04-28)**: shared/runtime SysEx-tag consolidation — four parallel `CurveType` defs collapsed into `app/midi/curves.py`.
- **H5 (2026-04-28)**: route consolidation — 7 separate MIDI route files (`midi_v2.py`, `midi_hub.py`, `midi_cluster.py`, `midi_cluster_proxy.py`, `midi_learn.py`, `midi_commander_surface.py`, `enriched_midi_physical_surfaces.py`) consolidated into `app/routes/midi.py`. **Note**: `midi_cluster_proxy.py` still exists as an active dependency until T2482-P1.4 ships the host-to-host protocol.

### 2.3 What's NOT yet been deleted (despite plans)

Per the T2482-P1.6a audit (2026-05-01):

- **`app/services/midi_hub/` (29 Python files)** — every file the H5 plan said would be absorbed into the controller-host. None have been deleted. The file-level absorption requires P1.1 (libremidi I/O) + P1.2 (ControllerEngine) to be complete first, and those haven't shipped yet.

This is the largest remaining cleanup. P1.6 will execute once P1.1 + P1.2 land.

### 2.4 What's been added since the H plan

- **T2480-3 (2026-04-30)**: `app/services/midi_hub/inbound_traffic_bridge.py` — installs at app startup, subscribes to MidiHub, mirrors every inbound message into the `midi:traffic` WS topic. The Brain Setup task's Test phase visualizer depends on this. The bridge is part of the `midi_hub/` directory that's slated for absorption; its install will need to move to the controller-host equivalent in P1.6.
- **T2480-5 (2026-04-30)**: `MidiDeviceState.bindings` field on the registry — first-class device→consumer bindings. This field is **the seed of the canonical `MidiBinding` table**. T2482-P2.1 promotes it to a standalone table; T2482-P2.4 migrates Brain's consumer pattern; T2482-P2.5+ add the per-device consumers.

---

## 3. The shape Phase 2 introduces

### 3.1 `MidiBinding` table

Single source of truth for every binding on the platform. See `MIDI_SERVICES.md` §3.1 for the full schema.

Migration semantics:
- Forward-only by design. Rollback is "restore from backup," not "reverse the migration."
- Every migrated row carries `source="legacy-migration"` + `metadata.legacy_table=<table_name>` + `metadata.legacy_row_id=<id>` for audit traceability.
- Round-trip verification gate: 100-row sample per consumer type must read identically before/after migration.

### 3.2 `MidiBindingAuthority`

Single writer. Lives at `app/services/midi/authority.py` (new directory, will be created in P2.2).

Per-consumer projections live at `app/services/midi/projections/{snapshot,brain,plugin_param,device_pack,transport,tesira_ttp,gpio}.py`. Each projection translates between the canonical `MidiBinding` shape and the consumer-specific request/response shape, so consumers don't have to change their public API to consume the authority.

### 3.3 Surface integration

The canonical `/midi` surface (Phase 3) reads exclusively through the `MidiBindingAuthority` API. Snapshot Editor inline MIDI editors (per-effect mappings, A/B switch, expression) **stay in place visually** but rewire their backend to the authority via `projections/snapshot.py` and `projections/plugin_param.py`. Brain Setup task wires through `projections/brain.py`.

---

## 4. Open questions / risks documented at this point

1. **Inbound traffic bridge migration into controller-host** (T2480-3 → T2482-P1.6 dependency): when `app/services/midi_hub/` is absorbed, the bridge install needs a new home. Likely candidate: a controller-host startup hook that subscribes to the libremidi I/O layer the same way the bridge subscribes to the MIDI hub today. Phase 1 work, not Phase 2.

2. **Ground Control Pro SysEx field-map structure** (T2482-P2.5 risk): the GCP storage is offset-aligned binary blobs, not flat key/value bindings. The `MidiBinding.metadata` JSONB column should accommodate this via projection adapter, but P2.5 is the canary that proves it.

3. **Snapshot schema version bump** (T2482-P2.3): when `controls.midi_map` migration lands, the snapshot schema version increments from `2026.04` → `2026.05`. Coordinate with the State Authority epic to avoid version collisions.

4. **JUCE engine still talks raw ALSA** (P1.3 dependency): `Map2MidiController.cpp` is the engine's current MIDI I/O. Until P1.1 ships libremidi + the shm event ring, the engine bypasses any controller-host MIDI work. P1.3 is the final cutover that makes the controller-host the sole MIDI owner.

---

## 5. References

- `docs/architecture/MIDI_SERVICES.md` — canonical design spec (read this first)
- `docs/architecture/CONTROLLER_LAYER.md` — T2459 controller subsystem locked decisions (preserved as historical reference)
- `docs/PROJECT_WORKLIST.md` — `T2482` epic with subtask plan + status
- `~/.claude/projects/-home-mm-map2-audio/memory/project_first_class_services.md` — four-services platform directive
- `~/.claude/projects/-home-mm-map2-audio/memory/project_t2459_controller_layer.md` — historical (subsumed)
- `~/.claude/projects/-home-mm-map2-audio/memory/project_t2459h_midi_unification.md` — historical (subsumed)
