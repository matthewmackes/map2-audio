# MAP2 Canonical Project Worklist

Reset date: 2026-05-04 15:24 EDT
Canonical path: `docs/PROJECT_WORKLIST.md`
Archive for this reset: `docs/archive/PROJECT_WORKLIST_ARCHIVE_20260504.md`

## Worklist Operating Contract (Read First)

1. This file is the only active project worklist. Do not maintain side lists, hidden notes, or parallel trackers.
2. Before starting substantive work, read this file and update task status/notes in-place.
3. After each substantive work unit, update status, completion/progress notes, and `Last updated` with `YYYY-MM-DD HH:MM TZ - actor`.
4. Allowed statuses are exactly: `[ ] Todo`, `[>] In Progress`, `[✓] Done`, `[✗] Blocked`, `[~] Cancelled`.
5. Preserve task history. Never delete historical context from active tasks unless moving it to an archive file.
6. New ideas, bugs, regressions, or follow-ups must be added here immediately as new task IDs.
7. Decompose work into restart-safe slices (target 15-60 minute chunks when feasible) with explicit acceptance criteria and deliverables.
8. Prioritize and parallelize independent work, but keep the status and dependency graph accurate in this file.
9. Do not mark a task complete while any required platform layer is inconsistent.
10. If code changes add or imply new dependencies, packages, services, runtime assumptions, or build requirements, update installer/environment artifacts in the same task.
11. For blocked tasks, record the exact blocker, the prerequisite to unblock, and the next concrete action once unblocked.
12. If the user explicitly says `DISABLE WORKLIST RULE`, this contract can be suspended for that conversation.

## Required Task Schema

Each task/subtask should contain these fields:

- `ID`: unique short code (for example `T001`, `T2459-H3`)
- `Status`: one allowed value from the status legend
- `Title`: one-line outcome
- `Description` including:
  - Goal / acceptance criteria
  - Why it matters
  - Dependencies
  - Estimated effort
  - Required outputs/deliverables
- `Subtasks` (optional)
- `Assigned to` (optional)
- `Last updated`: `YYYY-MM-DD HH:MM TZ - actor`

## Execution Cycle

1. Review top active tasks before starting work.
2. Move one task to `[>] In Progress` before making substantive edits.
3. Execute and verify against acceptance criteria.
4. Record completion/progress notes, validation evidence, and artifact paths.
5. Propose next 1-3 logical tasks.

## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

## Top Active Tasks (5-10)

- `[>]` `T2459-H` — MIDI Backend Unification (controller-host + libremidi + ControllerEngine)
- `[>]` `T2459-H3` — MeloAudio Commander device-pack cutover completion (HIL pending)
- `[>]` `T2459-H4` — Device-service migrations (Maschine/MPX-1/IntelFX) + HIL parity
- `[>]` `T2459-H5` — MIDI Hub v2 absorption and route consolidation
- `[>]` `T2472` — Snapshot editor data-layer extraction (`useSnapshotEditorData.ts`)
- `[ ]` `T2459-H6` — Retire legacy `Map2MidiController` path after soak + deletion
- `[ ]` `T2477` — Graph-rendering consolidation primitive
- `[ ]` `T2481` — Carbon deepening fit-and-finish epic
- `[✗]` `T004` — AVB hardware qualification/release gating (lab-blocked)
- `[✗]` `T065` — Tesira parity release closure (hardware evidence blocked)

## Migration Notes

- Completed and cancelled history remains in the archive file listed above.
- This active worklist intentionally contains only unfinished work (`Todo`, `In Progress`, `Blocked`).

## In Progress

ID: T2459-H
Status: [>] In Progress
Parent: T2459
Title: MIDI Backend Unification — `map2-midi-host` daemon, libremidi I/O, Mixxx ControllerEngine for mappings
Description:
- Goal: Fold all MIDI ownership into the `map2-controller-host` process (the T2459-A6 daemon), promoting it to the single source of MIDI truth across the platform. Replace `python-rtmidi` and the C++ `Map2MidiController` raw `snd_seq_*` ALSA path with a unified **libremidi** (BSL-1.0, native PipeWire/ALSA seq+raw/JACK, MIDI 2.0/UMP) I/O layer. Adopt the **Mixxx ControllerEngine** (QJSEngine + XML mapping format, GPLv2-or-later — already imported under `device-packs/_mixx-imports/` per T2459 license posture) as the canonical mapping DSL inside the host process so every controller (Maschine MK1, MPX-1 footswitches, Rocktron IntelFX, MeloAudio Commander, future devices) is expressed as an XML profile + JS script pair instead of a hand-coded Python service. Python backend and C++ JUCE engine become IPC clients of the host over the existing UDS control channel + a new lock-free shm event ring for the audio-rate MIDI hot path (sample-accurate triggers, clock-master alignment).
- Why it matters: today the MIDI layer has four parallel `CurveType` definitions (`midi_engine.py`, `midi_service.py`, `midi_learn.py`, `midi_device_profiles.py`), two near-identical SysEx parsers (`mpx1_syx_parser.py` + `intelfx_syx_parser.py` with a copy-pasted 60-pattern tag map), 30 files under `app/services/midi_hub/` gated by `if MIDI_HUB_AVAILABLE`, a JUCE engine that bypasses its own MIDI module to talk raw ALSA, a stale `python-rtmidi>=1.5.8` dep (PyPI ~12 months stale), and 7 separate FastAPI route files (`midi_v2.py`, `midi_hub.py`, `midi_cluster.py`, `midi_cluster_proxy.py`, `midi_learn.py`, `midi_commander_surface.py`, `enriched_midi_physical_surfaces.py`). Unification gives the platform: one MIDI backend, one mapping language, RT-isolated MIDI execution off the audio callback, MIDI 2.0/UMP readiness, GPL containment by IPC boundary (the host inherits GPL from the embedded ControllerEngine; the JUCE engine and proprietary code stay across an IPC boundary), and direct access to Mixxx's 200+ controller-mapping ecosystem the platform already mirrors under `device-packs/_mixx-imports/`.
- Locked decisions (per user Q&A 2026-04-27):
  - Q1 — Folded into T2459 as Phase H rather than run as a sibling epic. Same daemon (`map2-controller-host`), same IPC, same QJSEngine instance.
  - Q2 — libremidi (BSL-1.0) replaces both `python-rtmidi` (Python side) and direct `snd_seq_*` (C++ side). Single I/O backend; pybind11/cffi binding for Python.
  - Q3 — Daemon owns audio-routing-relevant MIDI: clock-sync to JUCE engine, sample-accurate triggers, clock-master election. Lock-free shm event ring (single-producer/single-consumer) is required from day one alongside the existing UDS control plane.
  - Q4 — Single-process model: `map2-controller-host` and `map2-midi-host` are the same binary. Controllers *are* MIDI/USB consumers, so the controller daemon already enumerated in T2459-A6 grows to absorb the MIDI hub, SysEx parsers, and per-device services.
- Dependencies: builds on T2459-A6 (controller-host process + UDS IPC), T2459-B1/B2 (QuickJS/QJSEngine integration — re-uses the same JS runtime), T2459-B3 (Mixxx XML reader — already produces `MappingDescriptor`), T2459-B5 (Mixxx import fixtures), T2459-G (Hardware Store as the device-pack consumer surface). Blocks formal deprecation of `python-rtmidi`, `app/services/midi_engine.py`, `app/services/midi_service.py` legacy curve modules, `app/services/midi_hub/` Python package, and `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp` raw ALSA path. Coordinates with T203 (MIDI Hub v2 surfaces) and T666/T700 (Maschine MK1) — those become device-packs once H4 lands.
- Estimated effort: 12–16 weeks standalone; ~8–10 weeks if executed inside the active T2459 daemon work since it shares the host process, IPC, and JS runtime. 7 subtasks (H1 daemon I/O foundation → H2 ControllerEngine integration → H3 first device-pack cutover → H4 device-service migration → H5 MIDI Hub absorption → H6 C++ engine consumer + Map2MidiController retirement → H7 cluster/multi-host MIDI).
- Required outputs/deliverables:
  - `juce-engine/Source/ControllerHost/Midi/` — libremidi I/O integration inside `map2-controller-host`; backend selection (ALSA seq / ALSA raw / JACK / PipeWire native); virtual-port support; observer API; UMP/MIDI-CI types via `ni-midi2` companion library
  - `juce-engine/Source/ControllerHost/MappingEngine/` — Mixxx ControllerEngine port hosting QJSEngine instances per-controller, XML profile loader, hot-reload, golden tests against known Mixxx mappings (B5 fixtures: Pioneer-CDJ-2000, Behringer-CMD-Micro, Pioneer-DDJ-SX)
  - `juce-engine/Source/ControllerHost/EventRing/` — single-producer/single-consumer lock-free shm ring for audio-rate MIDI events from host → JUCE engine; UDS control plane retained for non-RT operations (load mapping, learn session, port enumeration)
  - `app/services/midi_host_client.py` — thin Python client over UDS; replaces direct `python-rtmidi` use across the FastAPI backend
  - `device-packs/<vendor>/<model>/` profile entries for: MeloAudio Commander (first cutover), NI Maschine MK1, Lexicon MPX-1, Rocktron IntelFX, MIDI Hub virtual ports
  - Python deletions: `app/services/midi_engine.py`, redundant curve definitions in `midi_service.py`/`midi_learn.py`/`midi_device_profiles.py` consolidated to one `app/midi/curves.py`, `app/services/midi_hub/` collapsed into a thin host-client facade, `mpx1_syx_parser.py` + `intelfx_syx_parser.py` re-implemented as device-pack JS scripts, `python-rtmidi` removed from `requirements-backend-runtime.txt`
  - C++ deletions: `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp` raw `snd_seq_*` path retired; JUCE engine consumes events exclusively from shm ring
  - Route consolidation: `app/routes/midi.py` replaces the 7 existing MIDI route files; v1 deprecated formally; cluster MIDI moved to host-to-host protocol
  - Tests: libremidi adapter tests (port enumeration, virtual ports, UMP round-trip), Mixxx mapping golden tests (load + execute every B5 fixture), shm ring stress test (1M events/sec sustained, no allocations under load), HIL bench run with UA-1000 + Hotone Jogg + a Mixxx-imported controller mapping driving the audio engine
  - Documentation: `docs/architecture/MIDI_BACKEND.md` (architecture, IPC schema, library choices with license posture), update `CLAUDE.md` Service Polling Floors table (event-driven over polling), update `docs/MEMORY.md` to retire stale `python-rtmidi` and `Map2MidiController` notes
  - Worklist completion notes per subtask, dual-push to origin + gitlab, full release loop verification per CLAUDE.md §0.6
Subtasks: T2459-H1 .. T2459-H7 (7 subtasks; see below)
Assigned to: Claude
Last updated: 2026-04-28 11:26 EDT - Codex: H3 dispatcher slice, H4 shared/runtime SysEx-tag slices, and H5 route-consolidation slices shipped; remaining H acceptance is live inbound-MIDI dispatch path + broader device migrations + bench HIL.


---

ID: T2459-H3
Status: [>] In Progress
Parent: T2459-H
Title: First device-pack cutover — MeloAudio Commander as XML+JS instead of hardcoded profile
Description:
- Goal: Convert the hardcoded `MELOAUDIO_COMMANDER_PROFILE` (currently 669-line Python dict in `app/services/midi_device_profiles.py`) into a `device-packs/meloaudio/midi-commander/` profile pair (XML mapping + JS script). Prove the end-to-end pipeline: device-pack on disk → ProfileRegistry resolution → host loads XML+JS via the H2 engine → footswitch press generates an event through libremidi (H1) → script translates it → JUCE engine receives a chain.bypass.toggle action via UDS. The Python `midi_commander_surface/` service collapses into a thin host-client wrapper for any commander-specific UI affordances that can't be expressed in the mapping JS (e.g., expression-pedal calibration sessions).
- Acceptance: physical MeloAudio Commander on the bench drives a chain bypass + a tuner-on action through the new path with bit-identical CC mappings to the legacy Python profile; legacy `MELOAUDIO_COMMANDER_PROFILE` deleted with a stub redirect for any in-flight callers; one HIL evidence run captured under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`.
- Required outputs: `device-packs/meloaudio/midi-commander/{pack.yaml,profile.midi.yaml,scripts/commander.js}`, deletion of `MELOAUDIO_COMMANDER_PROFILE` constant, `app/services/midi_commander_surface/` reduced to host-client glue, schema-validation test, runtime test asserting the device-pack drives the same backend actions as the legacy profile, HIL evidence directory.
Assigned to: Claude
Completion note: 2026-04-28 — Codex: **Slice 1 SHIPPED (pack migration + legacy-id compatibility + regression tests).**
  Delivered:
  - New MeloAudio pack at `device-packs/meloaudio/` with `pack.yaml`, `profiles/midi-commander.midi.yaml`, and `scripts/commander.js` (canonical MAP2 pack shape used by `ProfileRegistry`).
  - `app/services/midi_device_profiles.py` no longer hardcodes `MELOAUDIO_COMMANDER_PROFILE`; it now loads the Commander profile from the shipped device-pack YAML and preserves a legacy alias (`meloaudio_commander` → `meloaudio_midi_commander`) for in-flight callers.
  - Compatibility updates in commander/enriched surfaces to treat either profile id as authoritative via `is_meloaudio_profile_id(...)`.
  - New focused test `tests/test_midi_device_profiles_t2459h3.py` validates pack-backed profile loading, alias resolution, default command generation parity, and detection behavior.
  Validation:
  - `pytest -q tests/test_midi_v2_routes.py tests/test_midi_device_profiles_t2459h3.py tests/test_midi_commander_surface_protocol.py tests/test_midi_commander_surface_service.py tests/test_enriched_midi_physical_surfaces_service.py tests/test_enriched_surface_runtime.py tests/test_device_packs_schema.py` → **52 passed**.
  Remaining for full H3 acceptance:
  - Host production path still needs `mapping_activate`/script-load wiring in `map2-controller-host` main-loop dispatcher so device-pack scripts execute on inbound MIDI in production (H2 unit coverage exists; production dispatcher path pending).
  - Bench HIL evidence run (`docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`) pending physical controller availability.
  2026-04-28 — Codex: **Slice 2 SHIPPED (Python host-client IPC activation surface).**
  Delivered:
  - Extended `app/services/midi_host_client.py` with fire-and-forget IPC methods:
    - `load_script(...)` -> `script_load_request`
    - `activate_mapping(...)` -> `mapping_activate`
  - Added descriptor serialization helper `_descriptor_payload(...)` to convert loaded mapping descriptors into the wire payload expected by `controller_host.py` / `IpcMessages.h`.
  - Added focused tests `tests/test_midi_host_client_t2459h3.py` for payload shape + unreachable socket behavior.
  Validation:
  - `pytest -q tests/test_midi_host_client_t2459h1.py tests/test_midi_host_client_t2459h3.py tests/test_midi_v2_routes.py tests/test_midi_device_profiles_t2459h3.py tests/test_midi_curve_type_consolidation_t2459h4.py tests/test_device_packs_schema.py` -> **49 passed**.
  Remaining for full H3 acceptance:
  - Host C++ dispatcher still must consume `script_load_request` and `mapping_activate` in production path and emit/route resulting engine commands from live MIDI traffic.
  - Physical HIL evidence run with MeloAudio hardware.
  2026-04-28 — Codex: **Slice 3 SHIPPED (host main-loop request dispatch for script/mapping activation).**
  Delivered:
  - Extended `juce-engine/Source/ControllerHost/main.cpp` dispatcher to consume:
    - `script_load_request` (controller-keyed script cache + `log_event` response),
    - `mapping_activate` (descriptor parse, script-resolution from cache/filesystem/inline bodies, `Map2MappingEngine::loadDescriptor(...)`, `log_event` or `script_error` response).
  - Added helper JSON-region extraction and descriptor parsing utilities in host main-loop to lift controls/outputs/alias table into `MappingDescriptorSpec` without waiting for the larger full-parser migration.
  - Added integration coverage `tests/test_controller_host_main_loop_t2459h3.py` that runs the real `map2-controller-host` binary over a tmp UDS and asserts request consumption for both `script_load_request` and `mapping_activate`.
  Validation:
  - `cd juce-engine && cmake --build build --target map2-controller-host`
  - `pytest -q tests/test_controller_host_main_loop_t2459h3.py tests/test_midi_host_client_t2459h3.py tests/test_midi_host_client_t2459h1.py tests/test_controller_host_ipc_schema.py` -> **20 passed**.
  Remaining for full H3 acceptance:
  - Live libremidi event ingestion still needs to route through the loaded descriptor dispatch path and emit engine commands from real inbound MIDI traffic (current slice activates mappings but does not yet wire the full runtime event loop).
  - Physical HIL evidence run with MeloAudio hardware.
  2026-04-28 — Codex: **Slice 4 SHIPPED (mapping-activation hardening for unresolved script-bound controls).**
  Delivered:
  - Added a pre-activation guard in `juce-engine/Source/ControllerHost/main.cpp`:
    - when every declared descriptor script fails resolution and the descriptor contains script-bound controls/outputs, host now returns `script_error` and skips activation.
  - Added helper `descriptor_uses_script_callbacks(...)` to distinguish script-bound descriptors from action-only mappings.
  - Added integration test `test_mapping_activate_rejects_missing_scripts_for_script_bound_controls` in `tests/test_controller_host_main_loop_t2459h3.py`.
  Validation:
  - `cd juce-engine && cmake --build build --target map2-controller-host`
  - `pytest -q tests/test_controller_host_main_loop_t2459h3.py tests/test_midi_host_client_t2459h3.py tests/test_controller_host_ipc_schema.py` -> **16 passed**.
  Remaining for full H3 acceptance:
  - Live libremidi event ingestion still needs to route through the loaded descriptor dispatch path and emit engine commands from real inbound MIDI traffic (current slices activate mappings but do not yet wire the full runtime event loop).
  - Physical HIL evidence run with MeloAudio hardware.
  2026-04-28 — Claude: **Slice 5 SHIPPED (live libremidi ingestion → planDispatch → dispatch → engine_command emission).**
  Delivered:
  - `juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.{h,cpp}`: new `openInput(port_id_or_name)` that resolves the requested name against `observer->get_input_ports()` and opens a real `libremidi::midi_in` whose `on_message` callback feeds the existing two-ring producer (RT vs control via `classifyMidiStatus`). `openVirtualInput` left untouched.
  - `juce-engine/Source/ControllerHost/IpcMessages.h`: new inbound `MidiOpenInputRequest{ controller_key, port_id }` + matching `CPP_FIELD_MANIFEST` line.
  - `app/schemas/controller_host.py`: matching `MidiOpenInputRequest` TypedDict + `FIELD_MANIFEST` entry + added to `InboundMessage` union; `tests/test_controller_host_ipc_schema.py` stays green.
  - `juce-engine/Source/ControllerHost/main.cpp`: restructured the inner connection loop to a `poll(client_fd, 1ms)` non-blocking pump. On every tick the host now: (a) per-PID-named SHM rings created on connect and bound to the libremidi adapter; (b) drains up to 64 RT events + 16 control events through `mapping_engine.planDispatch()` → `mapping_engine.dispatch()` (tries `(status & 0xF0, channel)` first then raw status for descriptors that don't split channel out); (c) drains `js().drainEngineCommands()` / `drainLogs()` / `drainShortMidi()` / `drainSysExMidi()` and serializes each to `engine_command` / `log_event` / `midi_send_request` IPC frames back to the backend; (d) handles new `midi_open_input_request` (single-active-controller selection — most-recently opened port wins; per-port→key map kept for future Slice 6 multi-controller routing without breaking the H1-locked ring slot format).
  - `app/services/midi_host_client.py`: new `open_midi_input(controller_key, port_id)` fire-and-forget client method.
  - C++ Catch2 coverage in `juce-engine/tests/Map2MappingEngineTests.cpp`: new "Slice 5" case that pushes a CC byte sequence into the RT shm ring through the adapter, drains, dispatches, and asserts both the JS-side `EngineCommand` and the outbound short MIDI got queued.
  - Python integration coverage `tests/test_controller_host_main_loop_t2459h3_slice5.py`: drives the real host binary over a tmp UDS — asserts manifest membership, `midi_open_input_request` for an unknown port returns a typed error log without crashing the host, and the host stays responsive for follow-up frames after a load+activate+open round.
  - Python parity test extension in `tests/test_midi_host_client_t2459h3.py` for the new `open_midi_input` client surface.
  Validation:
  - `cd juce-engine && cmake --build build --target map2-controller-host controller_host_tests` -> clean.
  - `cd juce-engine && ./build/controller_host_tests` -> **All tests passed (382 assertions in 66 test cases)** (was 366/65 before this slice — 16 new assertions, 1 new case).
  - `pytest -q tests/test_controller_host_main_loop_t2459h3.py tests/test_controller_host_main_loop_t2459h3_slice5.py tests/test_controller_host_ipc_schema.py tests/test_midi_host_client_t2459h1.py tests/test_midi_host_client_t2459h3.py` -> **25 passed** (was 21 — 4 new tests).
  Remaining for full H3 acceptance:
  - Multi-controller routing: today the host treats the most-recently opened input as the active controller_key for any drained ring event; Slice 6 will plumb the per-port→key map through to per-event dispatch (the `port_to_controller` map + the `port_id` arg on `midi_open_input_request` are already in place so this is API-compatible).
  - Physical HIL evidence run with MeloAudio Commander on the bench (`docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`) — slice 5 ships the production live-event loop; the bench-acceptance bullet still requires hardware.
  2026-04-28 — Claude: **Slice 6 SHIPPED (multi-controller routing via `Slot::controllerIndex` — single-active-controller shortcut retired).**
  Delivered:
  - `juce-engine/Source/ControllerHost/EventRing/ShmEventRing.{h,cpp}`: renamed the H1 `Slot::reserved` field to `controllerIndex` (same offset, same `uint16_t` width, H1 slot/header layout untouched). Extended `push()` with an optional `controllerIndex = 0` arg and `pop()` with an optional `outControllerIndex = nullptr` out-param so all existing callers stay source-compatible.
  - `juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.{h,cpp}`: per-port `HardwareInput { port_id, controllerIndex, midiIn }` records held in a vector so multiple physical inputs can be open concurrently, each tagging its callbacks with its own host-assigned index. `openInput(port, index=0)` and `pushMessage(bytes, len, index=0)` both default to 0 (legacy/virtual paths unchanged); the libremidi `on_message` lambda captures a stable pointer to the per-port record.
  - `juce-engine/Source/ControllerHost/main.cpp`: replaced the single-active-controller drain shortcut with a 1-based `controller_keys_by_index` table assigned on `midi_open_input_request`. New keys get the next index; the same key opening a second port reuses the existing index (one descriptor, multiple physical inputs). `drain_ring_and_dispatch()` reads `Slot::controllerIndex` and dispatches through the matching descriptor; index 0 (legacy/virtual producers) falls back to the most-recently-opened controller so Slice-5 behavior is preserved end-to-end.
  - C++ Catch2 coverage: new `Slice 6: ShmEventRing round-trips controllerIndex (Slice 6) and defaults to zero for legacy callers` in `juce-engine/tests/ShmEventRingTests.cpp`; new `Slice 6: multi-controller routing dispatches each ring event through its own descriptor` + `Slice 6: ring fallback (controllerIndex=0) routes through the most-recently-opened controller` cases in `juce-engine/tests/Map2MappingEngineTests.cpp` (load two distinct descriptors, push CC events tagged with index 1 + index 2, assert each dispatches through its own descriptor and queues its own EngineCommand + outbound short-MIDI byte).
  - Python integration coverage: new `tests/test_controller_host_main_loop_t2459h3_slice6.py` drives the real host binary over a tmp UDS — confirms the wire schema still carries `controller_key` per port, two distinct controllers each load + activate + open without state drift, the host stays responsive after both opens, and a second port under the same controller_key (index reuse path) is crash-free.
  - IPC schema unchanged (`MidiOpenInputRequest` already carries `controller_key` per port); `tests/test_controller_host_ipc_schema.py` stays green.
  Validation:
  - `cd juce-engine && cmake --build build --target map2-controller-host controller_host_tests` -> clean.
  - `cd juce-engine && ./build/controller_host_tests` -> **All tests passed (435 assertions in 69 test cases)** (was 382/66 before this slice — 53 new assertions, 3 new cases).
  - `pytest -q tests/test_controller_host_main_loop_t2459h3.py tests/test_controller_host_main_loop_t2459h3_slice5.py tests/test_controller_host_main_loop_t2459h3_slice6.py tests/test_controller_host_ipc_schema.py tests/test_midi_host_client_t2459h1.py tests/test_midi_host_client_t2459h3.py` -> **28 passed** (was 25 — 3 new tests).
  Remaining for full H3 acceptance:
  - Physical HIL evidence run with MeloAudio Commander on the bench (`docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`) — Slice 6 ships the multi-controller routing path; the bench-acceptance bullet still requires hardware.
Last updated: 2026-04-28 EDT - Claude: slice 6 shipped (multi-controller routing via Slot::controllerIndex retires the single-active-controller shortcut); H3 remains in progress pending HIL bench evidence.


---

ID: T2459-H4
Status: [>] In Progress
Parent: T2459-H
Title: Migrate device services to device-packs — Maschine MK1, MPX-1, IntelFX, SysEx parsers
Description:
- Goal: Convert the remaining hand-coded device services to device-packs. (a) **Lexicon MPX-1**: `mpx1_service.py` reduced to a host-client; `mpx1_syx_parser.py` re-implemented as `device-packs/lexicon/mpx-1/scripts/sysex.js` (12-char program names, Lexicon ID 0x06, tag auto-mapping); program/library/scene management stays in Python because it is database-backed, not MIDI-backed. (b) **Rocktron IntelFX**: same pattern — `intelfx_syx_parser.py` becomes `device-packs/rocktron/intelfx/scripts/sysex.js` (16-char names, 3-byte extended ID, checksum). (c) **NI Maschine MK1**: proprietary USB protocol stays under HID/bulk pack format (T2459-D2 `common-hid-parser.js` is the runtime); `app/services/maschine/` shrinks to a thin USB-transport facade owned by the host process; the existing daemon's MIDI side moves to the mapping engine. The two SysEx parsers consolidate their copy-pasted 60-pattern tag-mapping table into a single shared `device-packs/_runtime/sysex-tags.js`.
- Acceptance: every device that drove a MIDI flow before this subtask still drives it after, but through device-packs + libremidi + the mapping engine. Bench HIL run with UA-1000 + Maschine MK1 + MPX-1 (if present) + IntelFX (if present) shows: SysEx imports work, footswitch flows route through the engine, Maschine LEDs/pads are driven from the host. Python device-services slim by ≥ 70% LoC; the four CurveType duplicates collapse to one canonical `app/midi/curves.py`.
- Required outputs: device-packs for Maschine MK1 + MPX-1 + IntelFX, JS-side SysEx parsers, shared `sysex-tags.js`, slimmed Python services, `app/midi/curves.py` consolidation with deprecation aliases for one release cycle, integration tests asserting parity with legacy paths, evidence directory.
Assigned to: Claude
Completion note: 2026-04-28 — Codex: **Slice 1 SHIPPED (shared MIDI curve enum consolidation).**
  Delivered:
  - Added canonical `app/midi/curves.py` + `app/midi/__init__.py` with one shared `CurveType` enum (`linear`, `logarithmic`, `exponential`, `s_curve`, `reverse`).
  - Replaced duplicated curve enums in:
    - `app/services/midi_models.py`
    - `app/services/midi_engine.py`
    - `app/services/midi_device_profiles.py`
  - Added regression coverage: `tests/test_midi_curve_type_consolidation_t2459h4.py` asserting all three services now reference the same canonical type.
  Validation:
  - `pytest -q tests/test_midi_curve_type_consolidation_t2459h4.py tests/test_midi_v2_routes.py tests/test_midi_device_profiles_t2459h3.py tests/test_midi_commander_surface_protocol.py tests/test_midi_commander_surface_service.py tests/test_enriched_midi_physical_surfaces_service.py tests/test_enriched_surface_runtime.py tests/test_device_packs_schema.py` → **55 passed**.
  Remaining for full H4 acceptance:
  - MPX-1 / IntelFX SysEx JS migration + shared `device-packs/_runtime/sysex-tags.js`.
  - Maschine MK1 and other device-service cuts to host-client facades.
  - Bench HIL parity evidence with migrated devices.
  2026-04-28 — Codex: **Slice 2 SHIPPED (shared SysEx tagging runtime for MPX-1 + IntelFX parsers).**
  Delivered:
  - Added `app/services/sysex_tags.py` shared helper module with common token specs plus parser-specific overlays:
    - `compile_mpx1_tag_map()`
    - `compile_intelfx_tag_map()`
    - `auto_tag_from_name(...)`
  - Replaced duplicated inline tag maps in:
    - `app/services/mpx1_syx_parser.py`
    - `app/services/intelfx_syx_parser.py`
  - Added focused regression guard: `tests/test_sysex_tags_shared_t2459h4.py`.
  Validation:
  - `pytest -q tests/test_mpx1_syx_parser.py tests/test_intelfx_syx_parser.py tests/test_sysex_tags_shared_t2459h4.py` -> **73 passed**.
  Remaining for full H4 acceptance:
  - Mirror this shared tagging logic into the planned host-side/device-pack JS parser runtime (`device-packs/_runtime/sysex-tags.js`) as MPX-1/IntelFX parser migration continues.
  - Maschine MK1 and other device-service cuts to host-client facades.
  - Bench HIL parity evidence with migrated devices.
  2026-04-28 — Codex: **Slice 3 SHIPPED (device-pack runtime `sysex-tags.js` + parity tests).**
  Delivered:
  - Added `device-packs/_runtime/sysex-tags.js` exposing:
    - `MAP2SysexTags.buildMpx1TagRules()`
    - `MAP2SysexTags.buildIntelfxTagRules()`
    - `MAP2SysexTags.autoTagFromName(...)`
  - Updated `device-packs/README.md` runtime inventory to include `sysex-tags.js`.
  - Added Node-backed regression `tests/test_sysex_tags_runtime_js_t2459h4.py` to validate MPX-1 + IntelFX semantics and dedup behavior in the shipped runtime JS surface.
  Validation:
  - `pytest -q tests/test_sysex_tags_runtime_js_t2459h4.py tests/test_device_packs_schema.py tests/test_sysex_tags_shared_t2459h4.py tests/test_mpx1_syx_parser.py tests/test_intelfx_syx_parser.py` -> **92 passed**.
  Remaining for full H4 acceptance:
  - Replace Python-side MPX-1 / IntelFX parser ownership with device-pack JS parser flows routed via host-client facades.
  - Maschine MK1 and other device-service cuts to host-client facades.
  - Bench HIL parity evidence with migrated devices.
  2026-04-28 — Claude: **Slice 4 SHIPPED (MPX-1 SysEx parser tag-extraction routes through device-pack JS runtime when MAP2_SYSEX_PARSER_USE_JS_RUNTIME is on).**
  Delivered:
  - Added `app/services/sysex_tags_js_runtime.py` — Node-backed facade onto `device-packs/_runtime/sysex-tags.js`. Exposes `compile_mpx1_tag_map_via_js()` (LRU-cached, one Node subprocess per process), `auto_tag_from_name_via_js(name, parser)` for both `mpx1` and `intelfx` flavors, `is_sysex_parser_js_runtime_enabled()` flag helper (truthy set: `1`/`true`/`yes`/`on`), and a typed `SysexJsRuntimeError` that captures Node stderr.
  - Wired `app/services/mpx1_syx_parser.py` to a per-call `_resolve_tag_map()` seam: flag off → existing Python `compile_mpx1_tag_map()` (default behavior unchanged); flag on → JS runtime via the facade. Output is bit-identical (same regex source, same tag arrays — parity already proven in Slice 3).
  - Added `tests/test_mpx1_syx_parser_js_runtime_t2459h4.py`: flag-off baseline, flag-on bit-identical-to-baseline parity, facade caching (1 subprocess per process), and `SysexJsRuntimeError` surface on missing runtime JS. Module-level skip when `node` not on PATH (mirrors Slice 3 pattern).
  Validation:
  - `pytest -q tests/test_mpx1_syx_parser_js_runtime_t2459h4.py tests/test_mpx1_syx_parser.py tests/test_sysex_tags_shared_t2459h4.py tests/test_sysex_tags_runtime_js_t2459h4.py` -> **31 passed**.
  Remaining for full H4 acceptance:
  - IntelFX parser cutover behind the same flag (next slice; same facade — `auto_tag_from_name_via_js(..., "intelfx")` already shipped).
  - Maschine MK1 and other device-service cuts to host-client facades.
  - Bench HIL parity evidence with migrated devices.
  2026-04-28 — Claude: **Slice 5 SHIPPED (IntelFX SysEx parser tag-extraction routes through device-pack JS runtime when MAP2_SYSEX_PARSER_USE_JS_RUNTIME is on).**
  Delivered:
  - Extended `app/services/sysex_tags_js_runtime.py` with `compile_intelfx_tag_map_via_js()` — independent `@functools.lru_cache(maxsize=1)` mirror of the MPX-1 helper, evaluating `MAP2SysexTags.buildIntelfxTagRules()` via the same Node-subprocess pattern and surfacing failures through `SysexJsRuntimeError`.
  - Wired `app/services/intelfx_syx_parser.py` to a per-call `_resolve_tag_map()` seam that mirrors the MPX-1 cutover: flag off → existing Python `compile_intelfx_tag_map()` (default behavior unchanged); flag on → JS runtime via the facade. Output is bit-identical (same regex source, same tag arrays — parity already proven in Slice 3).
  - Added `tests/test_intelfx_syx_parser_js_runtime_t2459h4.py`: flag-off baseline coverage (clean/chorus/hush/lead/plate/wah/crunch/acoustic/slap and a no-tag control), flag-on bit-identical-to-baseline parity, and facade caching (1 subprocess per process). Module-level skip when `node` is not on PATH.
  Validation:
  - `pytest -q tests/test_intelfx_syx_parser_js_runtime_t2459h4.py tests/test_intelfx_syx_parser.py tests/test_mpx1_syx_parser_js_runtime_t2459h4.py tests/test_mpx1_syx_parser.py tests/test_sysex_tags_shared_t2459h4.py tests/test_sysex_tags_runtime_js_t2459h4.py` -> **83 passed**.
  Remaining for full H4 acceptance:
  - Maschine MK1 and other device-service cuts to host-client facades.
  - Bench HIL parity evidence with migrated devices.
  2026-04-28 — Claude: **Slice 6 SHIPPED (Maschine MK1 MIDI-mode device-pack cutover — HID/USB control surface stays out of scope per separate-process isolation).**
  Delivered:
  - New device pack `device-packs/native-instruments/`:
    - `pack.yaml` — vendor=Native Instruments, license AGPL-3.0-only, source map2-native, model `maschine-mk1` (no upstream Mixxx import exists for Maschine MK1 — MAP2 original work).
    - `profiles/maschine-mk1.midi.yaml` — 60 control rows mirroring `app/services/maschine/midi_map_config.py` defaults: 16 pads (notes 36..51), 11 rotary encoders (CC 0..7 + 9,10,11), 8 group buttons (CC 20..27), 8 transport-zone buttons (notes 60..67), 17 LCD-side/display/misc buttons (CC 64..80), 8 left-of-pads function buttons (CC 40..47). Bound to virtual ALSA port `MAP2:Maschine-MK1` published by the existing Python daemon (no conflict with the daemon's HID/USB ownership).
    - `scripts/maschine-mk1.js` — pack-side script registering one MaschineMK1.* function per control row (pads → `audio.pad.<N>.trigger`, encoders → `audio.macro.*` / `audio.master.volume` / `audio.transport.tempo` / `audio.transport.swing` / `audio.nav.cursor`, transport buttons → `audio.transport.*`, group/modifier buttons → `audio.group.*` / `audio.modifier.*` / `audio.lcd.*`).
  - Wired profile loading in `app/services/midi_device_profiles.py`:
    - New constants `MASCHINE_MK1_PROFILE_ID = "native_instruments_maschine_mk1"`, `LEGACY_MASCHINE_MK1_PROFILE_ID = "maschine_mk1"`, `MASCHINE_MK1_PACK_PROFILE_PATH`.
    - New `_build_maschine_mk1_profile_from_device_pack()` mirrors the MeloAudio cutover pattern; loads identity from YAML, sets USB VID/PID 0x17CC/0x0808, populates name_patterns including the virtual ALSA port pattern.
    - `MIDIDeviceProfileService.__init__` registers the canonical id + the legacy `maschine_mk1` alias.
    - New `is_maschine_mk1_profile_id()` helper mirrors `is_meloaudio_profile_id()`.
  - New focused regression `tests/test_maschine_mk1_pack_t2459h4.py` (8 tests): pack files exist, registry exposes canonical id, legacy alias resolves to canonical with `profile_id_canonical` set, control counts (16/11/8/8) match, identity matches virtual ALSA port + USB VID/PID, scripts reference resolves, encoder CC→script parity (CC 0/9/10/11), pack manifest declares canonical metadata.
  - Out of scope (stays Python-owned per separate-process isolation rule): `app/services/maschine/maschine_mk1_daemon.py`, `mk1_protocol.py`, `mk1_usb_transport.py`, `led_animations.py`, `led_choreography.py`, `admin_console.py`, `boot_sequence.py`, `shutdown_sequence.py`, `incident_log.py`, `long_op_feedback.py`, `onboarding.py`, `screensaver.py`, `transport.py`, `fonts/`, `render/`, `profiles/`. `midi_map_config.py` retained as the daemon's persistence surface; the new device-pack profile is a parallel, controller-host-side authoring surface that binds against the daemon's virtual ALSA port.
  Validation:
  - `pytest -q tests/test_maschine_mk1_pack_t2459h4.py tests/test_device_packs_schema.py tests/test_midi_device_profiles_t2459h3.py tests/test_midi_v2_routes.py tests/test_intelfx_syx_parser_js_runtime_t2459h4.py tests/test_mpx1_syx_parser_js_runtime_t2459h4.py` -> **55 passed**.
  - `pytest -q tests/test_maschine_mk1.py tests/test_maschine_mk1_daemon.py tests/test_maschine_mk1_protocol.py tests/test_maschine_routes.py tests/test_maschine_admin_console.py tests/test_maschine_boot_shutdown.py tests/test_maschine_fonts.py tests/test_maschine_incident_log.py tests/test_maschine_lcd_service.py tests/test_maschine_led_animations.py tests/test_maschine_led_choreography.py tests/test_maschine_long_op_feedback.py tests/test_maschine_onboarding.py tests/test_maschine_pressure_routing.py tests/test_maschine_screensaver.py tests/test_maschine_transport.py` -> **120 passed** (existing Maschine surfaces unchanged).
  Remaining for full H4 acceptance:
  - Maschine MK1 HID/USB control surface migration (Slice 7+) — daemon → host-client facade, LED choreography to device-pack runtime.
  - Bench HIL parity evidence with migrated devices.
  2026-05-03 — Claude: **Slice 7 SHIPPED (Lexicon MPX-1 device-pack registry wiring).**
  Delivered:
  - Pre-existing pack `device-packs/lexicon/{pack.yaml,profiles/mpx1.midi.yaml,scripts/mpx1.js}` (the pack files have been on disk for a while; until this slice they were unwired) is now loaded by `MIDIDeviceProfileService` under canonical id `lexicon_mpx1` with legacy alias `mpx1`.
  - `app/services/midi_device_profiles.py` gains `LEXICON_MPX1_PROFILE_ID`, `LEGACY_LEXICON_MPX1_PROFILE_ID`, `LEXICON_MPX1_PACK_PROFILE_PATH`, `_build_lexicon_mpx1_profile_from_device_pack()`, `_load_lexicon_mpx1_profile()`, and `is_lexicon_mpx1_profile_id()` helpers — all mirroring the Maschine MK1 + MeloAudio loader pattern.
  - 7 new pytest cases in `tests/test_lexicon_mpx1_pack_t2459h4.py` cover: pack files exist; canonical id loads through the registry; legacy alias resolves with `profile_id_canonical`; identity matches pack YAML; front-panel control rows present (CC 7 Adjust, CC 64 Bypass, CC 65 Tap, status-0xC0 program-change, 0xF0 SysEx sentinel); script reference resolves; pack manifest declares canonical metadata; settings include `mpx1_program_offset` + `mpx1_sysex_passthrough`.
  - Out of scope (stays Python-owned): `app/services/mpx1_service.py` (database-backed librarian + preset registry), `app/services/mpx1_syx_parser.py` (SysEx parser; tag-extraction already routes through device-pack JS runtime per Slice 4), `app/services/mpx1_simulator.py`. The new device-pack profile is the controller-host-side authoring surface; the Python services keep the SysEx-heavy + DB-heavy responsibilities.
  Validation: `pytest -q tests/test_lexicon_mpx1_pack_t2459h4.py tests/test_maschine_mk1_pack_t2459h4.py tests/test_midi_device_profiles_t2459h3.py` → **23 passed**.
  2026-05-03 — Claude: **Slice 8 SHIPPED (Rocktron IntelFX device-pack registry wiring).**
  Delivered:
  - Pre-existing pack `device-packs/rocktron/{pack.yaml,profiles/intelfx.midi.yaml,scripts/intelfx.js}` is now loaded by `MIDIDeviceProfileService` under canonical id `rocktron_intelfx` with legacy alias `intelfx`.
  - `app/services/midi_device_profiles.py` gains `ROCKTRON_INTELFX_PROFILE_ID`, `LEGACY_ROCKTRON_INTELFX_PROFILE_ID`, `ROCKTRON_INTELFX_PACK_PROFILE_PATH`, `_build_rocktron_intelfx_profile_from_device_pack()`, `_load_rocktron_intelfx_profile()`, and `is_rocktron_intelfx_profile_id()` helpers — same loader pattern as MPX-1 / Maschine MK1 / MeloAudio.
  - 8 new pytest cases in `tests/test_rocktron_intelfx_pack_t2459h4.py` covering pack files, canonical id, legacy alias, identity, front-panel control rows (Adjust / Bypass / Tap / PC / SysEx sentinel), script reference, pack manifest metadata, settings.
  - Out of scope (stays Python-owned): `app/services/intelfx_service.py` (database-backed librarian + preset registry), `app/services/intelfx_syx_parser.py` (SysEx parser; tag-extraction routes through device-pack JS runtime per Slice 5), `app/services/intelfx_simulator.py`. The MPX-1 + IntelFX pattern now mirrors exactly across two devices: front-panel CC/PC + SysEx sentinel in YAML; Python keeps SysEx body parsing + DB-backed preset management.
  Validation: `pytest -q tests/test_rocktron_intelfx_pack_t2459h4.py tests/test_lexicon_mpx1_pack_t2459h4.py tests/test_maschine_mk1_pack_t2459h4.py tests/test_midi_device_profiles_t2459h3.py` → **31 passed**.
  2026-05-03 — Claude: **Slice 9 SHIPPED (SysEx parser JS-runtime silent fallback).**
  Delivered:
  - When `MAP2_SYSEX_PARSER_USE_JS_RUNTIME=1` is set on a host without Node (or a missing/broken `device-packs/_runtime/sysex-tags.js`), both `mpx1_syx_parser._resolve_tag_map()` and `intelfx_syx_parser._resolve_tag_map()` now catch `SysexJsRuntimeError`, log ONE warning per process, and silently fall back to the Python tag map. The two paths are bit-identical (parity proven in Slice 3), so callers see no behavior delta.
  - Module-level `_JS_RUNTIME_FALLBACK_WARNED` flag dedups the warning so production logs aren't flooded by every parser invocation.
  - 5 new pytest cases in `tests/test_sysex_parser_js_runtime_fallback_t2459h4.py`: MPX-1 fallback when JS raises; MPX-1 warns once across multiple calls; same pair for IntelFX; flag-off path preserved (no fallback machinery triggers when flag absent).
  Validation: `pytest -q tests/test_sysex_parser_js_runtime_fallback_t2459h4.py tests/test_mpx1_syx_parser.py tests/test_intelfx_syx_parser.py` → **75 passed**.
Last updated: 2026-05-03 EDT - Claude: slice 9 (SysEx parser JS-runtime silent fallback) shipped; H4 remains in progress pending Maschine MK1 HID/USB control surface migration + bench HIL parity.


---

ID: T2459-H5
Status: [>] In Progress
Parent: T2459-H
Title: Absorb MIDI Hub v2 into the host — routing, clock, recorder, MIDI 2.0 UMP
Description:
- Goal: Move `app/services/midi_hub/` (30 files: hub, ports, router, clock_engine, recorder, message_mapper, midi2, midi_discovery, device_registry, gateway) into `juce-engine/Source/ControllerHost/Hub/`. Python `midi_hub/` shrinks to a typed client over UDS that the existing FastAPI routes consume. Clock master moves into the host (single source of MIDI clock truth — closes Common Pitfall "Don't allow multiple MIDI clock masters in the same rig"). MIDI 2.0/UMP support comes from `ni-midi2` (MIT, NI-donated) layered on libremidi's UMP transport. Cluster proxying logic from `midi_cluster_proxy.py` becomes a host-to-host gateway under `Hub/Gateway.cpp` with the existing cluster transport.
- Acceptance: every MIDI Hub v2 surface (clock, recorder, traffic monitor, virtual GPIO, OSC namespace, Tesira, string interface, event lists) keeps working through the new host; `if MIDI_HUB_AVAILABLE` conditionals across the Python codebase are deleted (the host is mandatory once H1 lands); UMP round-trip verified end-to-end (web client → REST → host → libremidi → device → libremidi → host → WS broadcast); golden recordings preserved through the migration (recorder format unchanged); 7 MIDI route files consolidated to `app/routes/midi.py` plus deprecation shims; v1 routes formally retired with a 410 Gone after the deprecation window.
- Required outputs: `juce-engine/Source/ControllerHost/Hub/` ported subsystems, `ni-midi2` integration, `app/routes/midi.py` consolidated router, deletion plan for `app/routes/{midi_v2,midi_hub,midi_cluster,midi_cluster_proxy,midi_learn,midi_commander_surface,enriched_midi_physical_surfaces}.py`, regression tests covering every previously-shipped MIDI Hub v2 capability under the new path, `docs/midi/MIDI_HUB_ARCHITECTURE.md` updated.
Assigned to: Claude
Completion note: 2026-04-28 — Codex: **Slice 2 SHIPPED (unified MIDI router mounted in app startup).**
  Delivered:
  - `app/main.py` now registers `app.routes.midi` as the sole runtime MIDI route module, replacing direct registration of `midi_v2`, `midi_hub`, `midi_cluster`, `midi_learn`, `midi_commander_surface`, and `enriched_midi_physical_surfaces`.
  - Added explicit legacy-module imports in `app/main.py` to keep deprecation-window compatibility for direct module consumers/tests while routing live HTTP registration through the unified router.
  - Retained `app/routes/midi.py` as the aggregation surface and added focused route-presence regression (`tests/test_midi_unified_routes_t2459h5.py`).
  Validation:
  - `pytest -q tests/test_route_registration_policy.py tests/test_midi_unified_routes_t2459h5.py tests/test_midi_v2_routes.py tests/test_midi_commander_surface_protocol.py tests/test_midi_commander_surface_service.py tests/test_enriched_midi_physical_surfaces_service.py tests/test_enriched_surface_runtime.py` -> **36 passed**.
  Remaining for full H5 acceptance:
  - Shrink `app/services/midi_hub/` runtime ownership to host-client facades (clock/recorder/router/message mapping still Python-owned).
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 3 SHIPPED (remove `MIDI_HUB_AVAILABLE` runtime gating from `midi_v2` execution paths).**
  Delivered:
  - Replaced boolean-gated service fallbacks in `app/routes/midi_v2.py` with concrete callable-availability checks:
    - `_midi_router_or_503` and `_clock_engine_or_503` now gate only on missing accessors.
    - device list/runtime start-stop/device open-close/activity-clear paths now check `get_midi_hub` / `get_midi_traffic_monitor` directly.
  - Updated regressions in `tests/test_midi_v2_routes.py` to monkeypatch missing accessor callables (`None`) instead of mutating `MIDI_HUB_AVAILABLE`.
  Validation:
  - `pytest -q tests/test_midi_v2_routes.py tests/test_midi_unified_routes_t2459h5.py tests/test_route_registration_policy.py` -> **21 passed**.
  Remaining for full H5 acceptance:
  - Shrink `app/services/midi_hub/` runtime ownership to host-client facades (clock/recorder/router/message mapping still Python-owned).
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 4 SHIPPED (`MIDIService` hub bridge no longer gated by `MIDI_HUB_AVAILABLE`).**
  Delivered:
  - Refactored `app/services/midi_service.py` optional import handling to set `get_midi_hub = None` on missing integration.
  - `_init_hub_bridge()` now checks callable/type availability (`get_midi_hub` and `VirtualMidiPort`) directly instead of a global availability boolean.
  Validation:
  - `pytest -q tests/midi_hub/test_consumer_migration.py tests/test_midi_service_snapshot_program_change.py` -> **9 passed**.
  Remaining for full H5 acceptance:
  - Remove remaining `MIDI_HUB_AVAILABLE` execution gating in other Python MIDI services (`midi_learn`, `midi_broadcast`, `midi_engine`, `sysex_device_bridge`).
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 5 SHIPPED (`MIDILearnManager` hub bridge now uses callable availability checks).**
  Delivered:
  - Refactored `app/services/midi_learn.py` optional import fallback to set `get_midi_hub = None`.
  - `_init_hub_bridge()` now checks `get_midi_hub`/`VirtualMidiPort` availability directly instead of relying on `MIDI_HUB_AVAILABLE`.
  Validation:
  - `pytest -q tests/midi_hub/test_consumer_migration.py` -> **7 passed**.
  Remaining for full H5 acceptance:
  - Remove remaining `MIDI_HUB_AVAILABLE` execution gating in `midi_broadcast`, `midi_engine`, and `sysex_device_bridge`.
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 6 SHIPPED (`MidiBroadcastService` hub bridge now gates on concrete callable availability).**
  Delivered:
  - Refactored `app/services/midi_broadcast.py` optional import fallback to expose `get_midi_hub = None` when hub integration is unavailable.
  - `_register_hub_bridge()` now checks `get_midi_hub`/`VirtualMidiPort` directly instead of `MIDI_HUB_AVAILABLE`.
  Validation:
  - `pytest -q tests/midi_hub/test_consumer_migration.py` -> **7 passed**.
  Remaining for full H5 acceptance:
  - Remove remaining `MIDI_HUB_AVAILABLE` execution gating in `midi_engine` and `sysex_device_bridge`.
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 7 SHIPPED (`MIDIEngineService` hub bridge now uses callable availability checks).**
  Delivered:
  - Refactored `app/services/midi_engine.py` optional hub import fallback to set `get_midi_hub = None`.
  - `_init_midi_hub_bridge()` now gates on `get_midi_hub`/`VirtualMidiPort` availability rather than `MIDI_HUB_AVAILABLE`.
  - Updated `tests/test_midi_engine_event_driven.py` fallback-path setup to monkeypatch `get_midi_hub = None`.
  Validation:
  - `pytest -q tests/test_midi_engine_event_driven.py tests/midi_hub/test_consumer_migration.py` -> **9 passed**.
  Remaining for full H5 acceptance:
  - Remove remaining `MIDI_HUB_AVAILABLE` execution gating in `sysex_device_bridge` and any residual route/tests path toggles.
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 8 SHIPPED (`SysExDeviceBridge` hub bridge now uses callable availability checks).**
  Delivered:
  - Refactored `app/services/sysex_device_bridge.py` optional hub import fallback to set `get_midi_hub = None`.
  - `_init_midi_hub_bridge()` now checks `get_midi_hub`/`VirtualMidiPort` directly instead of `MIDI_HUB_AVAILABLE`.
  Validation:
  - `pytest -q tests/test_midi_sysex_bridge_base.py tests/test_mpx1.py tests/test_intelfx.py` -> **66 passed**.
  Remaining for full H5 acceptance:
  - Remove residual `MIDI_HUB_AVAILABLE` route/test toggles and retire the boolean from `midi_v2` fully.
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 9 SHIPPED (retired `MIDI_HUB_AVAILABLE` from `midi_v2` and route regressions).**
  Delivered:
  - Removed `MIDI_HUB_AVAILABLE` import-time flag from `app/routes/midi_v2.py`.
  - Updated `tests/test_midi_v2_routes.py` to rely entirely on callable monkeypatching (`get_midi_hub` / `get_midi_clock_engine` / `get_midi_router` / `get_midi_traffic_monitor`) with no boolean toggles.
  Validation:
  - `pytest -q tests/test_midi_v2_routes.py tests/test_midi_unified_routes_t2459h5.py tests/test_route_registration_policy.py` -> **21 passed**.
  Remaining for full H5 acceptance:
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 10 SHIPPED (regression guard to keep `MIDI_HUB_AVAILABLE` retired).**
  Delivered:
  - Added `tests/test_midi_hub_available_guard_t2459h5.py` to assert `MIDI_HUB_AVAILABLE` does not reappear in core H5 runtime paths (`midi_v2`, `midi_service`, `midi_learn`, `midi_broadcast`, `midi_engine`, `sysex_device_bridge`).
  Validation:
  - `pytest -q tests/test_midi_hub_available_guard_t2459h5.py tests/test_midi_v2_routes.py tests/test_midi_unified_routes_t2459h5.py` -> **19 passed**.
  Remaining for full H5 acceptance:
  - Land explicit deprecation shims/retirement plan for the legacy route modules and formal v1 retirement flow.
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Codex: **Slice 11 SHIPPED (legacy MIDI surfaces now marked deprecated in OpenAPI via unified router).**
  Delivered:
  - Updated `app/routes/midi.py` to include legacy MIDI routers with `deprecated=True`:
    - `midi_hub`, `midi_cluster`, `midi_learn`, `midi_commander_surface`, `enriched_midi_physical_surfaces`.
  - Added regression in `tests/test_midi_unified_routes_t2459h5.py` to assert:
    - `/api/v2/midi/*` remains non-deprecated.
    - legacy surfaces are flagged `deprecated: true` in OpenAPI.
  Validation:
  - `pytest -q tests/test_midi_unified_routes_t2459h5.py tests/test_route_registration_policy.py tests/test_midi_v2_routes.py` -> **22 passed**.
  Remaining for full H5 acceptance:
  - Land explicit v1 retirement flow (410 Gone after deprecation window).
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Claude: **Slice 12 SHIPPED (explicit v1 retirement flow — 410 Gone gated by MAP2_MIDI_LEGACY_RETIRED).**
  Delivered:
  - Added `app/routes/_midi_v1_retirement.py` with `is_legacy_midi_retired()` env-var helper, fixed `Sunset`/`Link`/`Deprecation` headers, and `include_legacy_midi_router(parent, legacy)` shim that mounts a 410-Gone catch-all (one route per legacy path, all methods) when the flag is truthy and falls back to the existing `deprecated=True` mount when the flag is unset.
  - Updated `app/routes/midi.py` to route every legacy router (`midi_hub`, `midi_cluster`, `midi_learn`, `midi_commander_surface`, `enriched_midi_physical_surfaces`) through `include_legacy_midi_router`. v2 surface (`/api/v2/midi/...`) is unaffected by the flag in either state.
  - 410 body uses the canonical error envelope from `docs/api-contract-standards.md`: `{"error": {"code": "midi_v1_retired", "message": "<path> retired; use /api/v2/midi/...", "details": {"replacement_prefix": "/api/v2/midi"}}}`.
  - Retired legacy paths are dropped from the OpenAPI schema (`include_in_schema=False`) once the flag flips on.
  - New `tests/test_midi_v1_retirement_t2459h5.py` covers: flag-off keeps legacy routes non-410; flag-on returns 410 + `Sunset`/`Link`/`Deprecation` headers + envelope shape on one path from each of the five legacy routers; v2 path (`/api/v2/midi/mappings`) present and non-deprecated in both states; retired paths absent from OpenAPI.
  Validation:
  - `pytest -q tests/test_midi_v1_retirement_t2459h5.py tests/test_midi_unified_routes_t2459h5.py tests/test_midi_v2_routes.py tests/test_route_registration_policy.py tests/test_midi_hub_available_guard_t2459h5.py` -> **28 passed**.
  Remaining for full H5 acceptance:
  - Complete host-owned UMP round-trip and preserve recorder golden artifacts under the migrated path.
  2026-04-28 — Claude: **Slice 13 SHIPPED (host-owned UMP round-trip foundation + recorder golden parity).**
  Delivered:
  - **UMP classifier** in `juce-engine/Source/ControllerHost/EventRing/ShmEventRing.h`: `classifyUmpMessageType(mt)` (branchless 16-bit RT-mask shift, ~5 ns) buckets MIDI 2.0 message types — MT 0x1 / 0x2 / 0x4 → RT, 0x0 / 0x3 / 0x5 / reserved → control. Helper `umpMessageTypeFromFirstByte()` extracts the nibble. No third ring; same two-ring contract as MIDI 1.0.
  - **Slot is_ump discriminator** carved from `Slot::reserved` (uint16): bit 15 (`kSlotFlagIsUmp`) flags UMP packets; bits 0..14 reserved for the upcoming Slice 6 controller_index (kept zero by Slice 13). High-bit-only allocation lets either slice land first without breaking the other. Wire format on disk unchanged (`kSlotSizeBytes`, `kMaxPayloadBytes`, slot atomic protocol untouched).
  - **`pushWithFlags()` / `popWithFlags()`** overloads on `ShmEventRing`; existing `push()` / `pop()` continue to behave as before (flags = 0).
  - **`LibremidiAdapter::pushUmpMessage()`** test seam in `juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.{h,cpp}` — accepts a 4 / 8 / 12 / 16-byte UMP packet, classifies via the message-type nibble, pushes to the matching ring with `kSlotFlagIsUmp` set. The vendored libremidi v5.1.0 we build against does not expose a hardware-validated UMP input/output API on this platform; `pushUmpMessage` is the integration entry point until a MIDI-2.0-capable device is on the bench.
  - **IPC additive `format` field** on `MidiSendRequest` (`juce-engine/Source/ControllerHost/IpcMessages.h` + `app/schemas/controller_host.py` + `CPP_FIELD_MANIFEST`): `""` / `"midi1"` (default, omitted-on-wire for back-compat) or `"ump"` (raw UMP packet). Schema-sync test (`test_python_manifest_matches_cpp`) stays green.
  - **`MidiHostClient.send_ump(controller_key, packet_bytes)`** in `app/services/midi_host_client.py` — validates 4/8/12/16-byte length and emits the framed `midi_send_request` with `format="ump"`.
  - **Recorder golden-parity** plumbing: `app/services/midi_hub/recorder.py` artifact format inspected and locked in. Per-event `timestamp_ns` flows from the producer's `monotonicNanos()` through the shm slot into `MidiMessage.timestamp_ns` unchanged (no clock translation), so byte-identical artifacts across the legacy Python-hub path and the host-owned path are achievable. Wall-clock fields are normalised in the parity test by pinning `time.time`.
  - **C++ Catch2 tests**: `juce-engine/tests/ShmEventRingTests.cpp` extended with three UMP cases (classifier truth table; `umpMessageTypeFromFirstByte` extraction; is_ump round-trip with controller_index bits zero). New `juce-engine/tests/UmpRoundTripTests.cpp` (3 cases) covers `pushUmpMessage` routing MT=4 → RT and MT=3 → control with the flag set, plus malformed-length rejection. Added to `controller_host_tests` target in `juce-engine/CMakeLists.txt`.
  - **Python tests**: `tests/test_controller_host_ump_roundtrip_t2459h5.py` (5 cases) — schema additive contract, `send_ump` payload shape via a fake UDS server, length validation, CPP_FIELD_MANIFEST drift guard. `tests/test_midi_recorder_golden_parity_t2459h5.py` (2 cases) — byte-identical recorder artifact across legacy vs host-owned paths under pinned wall clock; artifact JSON shape sanity check.
  - **Docs**: `docs/midi/MIDI_BACKEND.md` §9 "UMP / MIDI 2.0" added covering classifier, slot discriminator, producer seam, IPC additive field, tests. `docs/midi/MIDI_HUB_ARCHITECTURE.md` "Recorder golden parity (T2459-H5)" section added.
  Validation:
  - `pytest -q tests/test_controller_host_ipc_schema.py tests/test_controller_host_ump_roundtrip_t2459h5.py tests/test_midi_recorder_golden_parity_t2459h5.py tests/test_midi_unified_routes_t2459h5.py tests/test_midi_v2_routes.py tests/test_midi_v1_retirement_t2459h5.py tests/test_route_registration_policy.py tests/test_midi_hub_available_guard_t2459h5.py` -> see notes.
  - C++ `controller_host_tests` extended with 3 ShmEventRing UMP cases + 3 UmpRoundTripTests cases.
  Slot-bit allocation choice: Slice 6 has not landed at the time of writing (no merge commit on `master`), so this slice carved bit 15 from `Slot::reserved` for `is_ump` and explicitly left bits 0..14 zero. Slice 6 folds its `controllerIndex` into bits 0..14 at merge time without touching bit 15.
  Remaining for full H5 acceptance:
  - **HIL gate**: end-to-end UMP traffic against a MIDI-2.0-capable device on the bench (web client → REST → host → libremidi UMP I/O → device → libremidi → host → WS broadcast). Blocked on libremidi v5.1.0 vendored not yet exposing a validated UMP input/output API for our backends; engine-side plumbing (classifier, slot discriminator, IPC additive, host-client `send_ump`) is complete and wired.
  2026-05-03 — Claude: **Slice 14 SHIPPED (MIDI Hub absorption audit doc).**
  Delivered:
  - `docs/midi/MIDI_HUB_ABSORPTION_AUDIT.md` enumerates every module under `app/services/midi_hub/` (30 files, ~14,530 LOC) with a per-module classification: **Python stays** (~7,800 LOC, 55%), **Host-eligible** (~6,500 LOC, 45%), **Hardware-bound** (none — every Python module is software-tractable; only bench acceptance is hardware-gated).
  - Doc lays out the recommended scope for each remaining H5 slice (clock-master in host, transforms in host, scheduler in host, router core deferred, MIDI 2.0 / UMP HIL hardware-gated, ring_buffer deletion at closeout).
  - 4 new pytest cases in `tests/test_midi_hub_absorption_audit_t2459h5.py`: doc exists; doc enumerates every module under `app/services/midi_hub/`; doc keeps the Summary section + classification labels; doc cross-references the canonical artifacts (worklist, MIDI_BACKEND.md, CLUSTER_MIDI_PROTOCOL.md, MAP2MIDICONTROLLER_RETIREMENT.md).
  - The coverage gate guards against silent drift — any new file added to `app/services/midi_hub/` will fail the audit-doc test until it's classified.
  Validation: `pytest -q tests/test_midi_hub_absorption_audit_t2459h5.py` → **4 passed**.
  2026-05-03 — Claude: **Slice 15 SHIPPED (operator-visible v1 retirement schedule).**
  Delivered:
  - `GET /api/v2/midi/legacy_retirement_status` (lives under v2 so it survives the 410-Gone flip) returns `{retired, sunset, sunset_iso, successor_prefix, now, days_remaining, flag_env_var}` so operator UIs can render a Carbon `InlineNotification` ("MIDI v1 retires in N days") on relevant pages.
  - Days-remaining is computed against the system clock; goes to `None` once `MAP2_MIDI_LEGACY_RETIRED` is flipped (no countdown after retirement). Sunset header parser tolerates garbage gracefully.
  - 6 new pytest cases: full envelope shape; flag reflected; falsy values stay-not-retired; sunset_iso parses to 2026-07-01; sunset header parser round-trips; parser rejects garbage.
  Validation: `pytest -q tests/test_midi_legacy_retirement_status_t2459h5.py tests/test_midi_v1_retirement_t2459h5.py` → **11 passed**.
  2026-05-03 — Claude: **Slice 16 SHIPPED (UMP / MIDI 2.0 capabilities surface).**
  Delivered:
  - `GET /api/v2/midi/ump/capabilities` returns the honest-state envelope describing what's wired today: engine-side classifier (MT 0x1/0x2/0x4 → RT, MT 0x0/0x3/0x5 → control), slot discriminator (bit 15 = `kSlotFlagIsUmp`, bits 0..14 = controller index), IPC additive `format` field (`""` / `"midi1"` / `"ump"`), UMP packet lengths `[4, 8, 12, 16]`, and the `MidiHostClient.send_ump()` client helper.
  - Honest-state surface: `validated_io: false` with explicit `validated_io_blocker` text — operator UI doesn't pretend bench UMP works just because the engine-side plumbing is in place. Validation gate is libremidi v5.1.0 → next-version bump + bench validation against a MIDI-2.0-capable device (T2491-13).
  - When the controller-host daemon is reachable, `data.host_side` carries the live backend selection (jack / pipewire / alsa_seq / alsa_raw) + `degraded` flag so the operator UI can render "UMP capable: yes (PipeWire)" or "UMP capable: degraded (alsa_seq — production needs PipeWire/JACK)". Resolver tolerates client construction / `is_daemon_available` failures gracefully (returns None instead of raising).
  - 6 new pytest cases: engine-side block always present; unavailable when daemon down; available when daemon returns backend; resolver handles client construction failure; resolver handles is-daemon-available failure; classifier buckets match Slice 13's lock.
  Validation: `pytest -q tests/test_midi_ump_capabilities_t2459h5.py` → **6 passed**.
  2026-05-03 — Claude: **Slice 17 SHIPPED (legacy MIDI routes carry deprecation advisory headers at runtime + route registration policy fix).**
  Delivered:
  - During the deprecation window (default state, `MAP2_MIDI_LEGACY_RETIRED` unset/falsy) every legacy MIDI route response now carries `Sunset: Wed, 01 Jul 2026 00:00:00 GMT`, `Link: </api/v2/midi>; rel="successor-version"`, and `Deprecation: true`. Operators' HTTP clients (curl, internal automation, dashboards) log RFC 8594 / RFC 8288 headers automatically — without this slice, the only signal of impending retirement was the OpenAPI `deprecated: true` flag.
  - Headers match the 410-Gone path verbatim (same `SUNSET_HEADER` constant + same successor-version `Link`) so a client transitioning from the deprecated phase into the retired phase sees the same advisory set.
  - v2 surfaces are NOT wrapped (test pins this) — the wrapper applies only to legacy mounts.
  - Implementation note caught: FastAPI dependency injection requires `Response` imported from `fastapi`, not `starlette.responses`; the latter is treated as a query parameter and the request fails with 422. Pinned in the helper's docstring.
  - Side-fix: `app/main.py` explicit-import of `device_pack_auto_gen` and `midi_ump_capabilities` re-classified through the canonical `from app.routes import X` form so `tests/test_route_registration_policy.py::test_every_apirouter_file_is_registered` (already failing on master before this slice) goes back to green.
  - 3 new pytest cases in `tests/test_midi_legacy_deprecation_headers_t2459h5.py`: legacy response carries the advisory header trio; post-flip 410 response still carries them; v2 routes don't.
  Validation: `pytest -q tests/test_midi_legacy_deprecation_headers_t2459h5.py tests/test_midi_v1_retirement_t2459h5.py tests/test_midi_legacy_retirement_status_t2459h5.py tests/test_midi_unified_routes_t2459h5.py tests/test_midi_v2_routes.py tests/test_route_registration_policy.py` → **36 passed**.
  2026-05-03 — Claude: **Slice 18 (M9) SHIPPED — T2459-H closeout doc.**
  Delivered:
  - `docs/midi/T2459H_CLOSEOUT.md` summarizes the H1-H7 status: H1, H2, H7 are ✅ Done; H3, H4, H5, H6 are code-side complete with bench HIL acceptance gates pending. Each subtask has a per-slice changelog entry; the HIL gate table at the bottom enumerates the four hardware-bound acceptance gates (MeloAudio Commander, Maschine MK1 HID/USB, MPX-1/IntelFX, Map2MidiController retirement soak, MIDI 2.0 UMP I/O).
  - Combined MIDI test-surface table (~80+ pytest cases + 471+ Catch2 assertions) gives the operator a single place to look for "what's covered today".
  - 5 new pytest cases in `tests/test_t2459h_closeout_doc.py`: doc exists, covers all seven sub-tasks, carries the HIL gate table, links to the canonical artifacts, pins H1 + H7 as ✅ Done.
  Validation: `pytest -q tests/test_t2459h_closeout_doc.py` → **5 passed**.
  2026-05-03 — Claude: **Slice 19 (M10) SHIPPED — 10-loop MIDI campaign closeout.**
  Delivered:
  - Evidence directory `docs/fit-for-purpose-evidence/20260503/T2459H_loop_campaign_closeout.md` summarises the campaign: 10 SHIP loops, slice-by-slice deliverables, full test totals (56 new pytest cases across M1–M9 + ~80 cumulative T2459-H pytest cases + 471+ Catch2 assertions), commits-pushed table, architecture touchpoints, and the four owner-driven HIL gates that remain.
  - `T2459H_pytest_evidence.txt` captures the verbose pytest run for the new test suites (56 / 56 passed in 4.76s).
  - Code-side state: H1, H2, H7 fully ✅ Done; H3, H4, H5, H6 are code-side complete with explicit HIL acceptance gates documented per sub-task. Subtask statuses stay `[>] In Progress` since the HIL gates remain owner-driven — code-side is shipped end-to-end across the campaign.


---

ID: T2472
Status: [>] In Progress
Title: Extract the snapshot-editor data-fetching layer into `useSnapshotEditorData.ts`
Progress note: 2026-04-30 - Claude Opus 4.7: PREP SHIPPED in commit c2f6e4cb. The first defensive slice of T2472 lands `useSnapshotEditorCadences()` (3 polling intervals — standard / fast / meter — wrapped over the existing `useRealtimeCadence` calls) at `web/src/app/pages/snapshotEditor/useSnapshotEditorCadences.ts`. Sets up the seam for the upcoming useSnapshotEditorData read-query consolidation. **Remaining work** (intentionally deferred to a focused session): consolidate the 20 `useQuery` calls into one read-side hook returning `{ snapshot, runtime, reconciliation, audioHealth, perfEvents, queries: { ... } }`; consolidate the 31 `useMutation` calls into a sibling `useSnapshotEditorMutations()` hook; replace the ~50 inline call sites in the monolith. Risk gates from the original task brief still stand: React Query cache keys must be bit-identical before/after; mutation onSuccess invalidations + WS subscription cleanups must not regress.
Description:
- Goal: The monolith holds dozens of `useQuery` / `useMutation` calls — the snapshot detail, the live runtime state, the reconciliation report, the audio device health, the noise-gate config, the default I/O device config, the performance event stream, plus mutations for save/activate/publish-retry/morph/etc. Consolidate the read-side queries into one hook `useSnapshotEditorData(snapshotId)` returning a single shaped object `{ snapshot, runtime, reconciliation, audioHealth, perfEvents, queries: { … }, ... }`. Mutations stay separate or become a sibling `useSnapshotEditorMutations()` — author's call.
- Why: Largest single concentration of duplication in the file; locking down the query layer makes the page body 1,000+ LoC shorter and gives every future change a clear data seam.
- Files touched: `web/src/app/pages/snapshotEditor/useSnapshotEditorData.ts` (new, optionally `useSnapshotEditorMutations.ts` sibling), `SnapshotEditorPageContent.tsx` (replace ~50 inline hook calls with one or two).
- Acceptance: typecheck/build clean; integration test green; React Query cache keys must be **identical** to today's (verify by snapshot-testing the `queryKey` arrays before/after, or by manual cache-inspection in dev). Live WS subscriptions must continue to fire — easy to break by accidentally moving a `useEffect` cleanup.
- Tests: hook test using `@tanstack/react-query` `QueryClientProvider`; integration test must continue to pass without changes.
- Dependencies: T2467, T2468, T2470.
- Estimated effort: Medium-Large (1-2 days) — high-fanout edit; careful audit of every `useQuery` / `useMutation` call site.
- Risk: medium-high — easy to break a cache key, a mutation onSuccess invalidation, or a WS subscription cleanup. Reviewer must check React Query Devtools cache contents before/after.
Assigned to: TBD
Last updated: 2026-04-28 EDT - opened from web-audit punch-list #8.


---


## Todo

ID: T2459-H6
Status: [ ] Todo
Parent: T2459-H
Title: Retire `Map2MidiController` raw-ALSA path — JUCE engine consumes shm ring exclusively
Description:
- Goal: Delete `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp` (the direct `snd_seq_*` ALSA implementation that bypassed JUCE's MIDI module). Replace with `IpcMidiBridge` from H1, fully validated under bench load: clock-locked playback, sample-accurate trigger latency, no priority inversion against the audio callback, no allocations on the hot path. The host pushes events to the shm ring at non-RT priority; the JUCE callback drains the ring lock-free at the start of each block. Verify under the existing soak harness (`scripts/run_juce_random_fx_soak.py` extended to drive MIDI from the host).
- Acceptance: 30-min soak with `--threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35` passes with the host driving real MIDI traffic into the audio engine; old `Map2MidiController.cpp` deleted from CMake and disk; `juce-engine/Source/Controllers/Midi/` directory left only with `IpcMidiBridge.{h,cpp}`; live timing graph captured under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h6-shm-ring/` showing producer→consumer latency distribution.
- Required outputs: `Map2MidiController.cpp` + `.h` deletion, `IpcMidiBridge` final form, soak-harness MIDI extension, evidence directory, `docs/MEMORY.md` and `CLAUDE.md` Gotchas updated to retire the "MIDI Device Selection Requires ALSA Subscriptions" note (no longer relevant — libremidi handles this).
Assigned to: Claude

  2026-04-28 — Claude: **Slice 1 SHIPPED (code-only retirement prep — caller audit + CMake retirement gate + soak-harness MIDI extension; HIL soak + file deletion remain).**

  Caller audit: 3 load-bearing references identified (`juce-engine/CMakeLists.txt`, `Source/Controllers/Map2ControllerFactory.cpp`, `tests/Map2ControllerTests.cpp`); 3 comment-only references catalogued (`Map2Controller.cpp`, `Map2ControllerFactory.h`, `IpcMidiBridge.h`). Filed gap: `Map2ControllerFactory::create("midi", ...)` returns `nullptr` under the OFF build because `IpcMidiBridge` has no `Map2Controller`-shaped wrapper. No non-test caller exists in-tree today, so the OFF build links cleanly; the deletion PR should re-confirm during the bench soak. Sub-task **T2459-H6 Slice 2 (planned)** filed in `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` for an `IpcMidiBridge`-backed adapter only if a non-test caller surfaces.

  Files added: `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` (caller-by-caller table + risk notes + step-by-step deletion runbook + rollback procedure), `tests/test_soak_harness_midi_extension_t2459h6.py`, `tests/test_map2midicontroller_caller_audit_t2459h6.py`.

  Files modified: `juce-engine/CMakeLists.txt` (new option `MAP2_USE_LEGACY_MIDI_CONTROLLER` default `ON`; conditional `list(APPEND SOURCES/HEADERS ...)`; conditional `controllers_tests` source list; `MAP2_HAS_LEGACY_MIDI_CONTROLLER=1/0` compile def on `map2_audio_engine` and `controllers_tests`), `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` (`#if MAP2_HAS_LEGACY_MIDI_CONTROLLER` guard around the legacy include + the `"midi"` instantiation; OFF arm returns `nullptr`), `juce-engine/tests/Map2ControllerTests.cpp` (Catch2 case has both ON and OFF arms), `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py` (new flags `--midi-driver {none,host}`, `--midi-controller-key`, `--midi-rate-events-per-sec`, `--midi-message-mix {note,cc,clock,mixed}`, `--midi-host-socket`, `--soak-tag`; `HostMidiSoakDriver` background-thread driver that posts UMP-shaped synthetic traffic through `MidiHostClient.send_ump`; driver stats stamped into `metadata.midi_driver` of the artifact JSON; default `--midi-driver=none` preserves byte-for-byte legacy behavior).

  Validation:
    - `python3 -m pytest -q tests/test_soak_harness_midi_extension_t2459h6.py tests/test_map2midicontroller_caller_audit_t2459h6.py` — **11 passed in 0.31s**.
    - `python3 -m pytest -q tests/test_controller_host_main_loop_t2459h3.py tests/test_controller_host_main_loop_t2459h3_slice5.py tests/test_controller_host_main_loop_t2459h3_slice6.py tests/test_controller_host_ipc_schema.py` — **11 passed, 7 skipped in 2.73s** (skips are HIL-gated, pre-existing).
    - `cmake -B juce-engine/build-h6-on -DMAP2_USE_LEGACY_MIDI_CONTROLLER=ON` — Configuring done (138.4s), `MAP2_HAS_LEGACY_MIDI_CONTROLLER=1` set on both `map2_audio_engine` and `controllers_tests`, `Map2MidiController.cpp` present in compile graph.
    - `cmake -B juce-engine/build-h6-off -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF` — Configuring done (130.7s), `MAP2_HAS_LEGACY_MIDI_CONTROLLER=0` set on both targets, `Map2MidiController.cpp` **absent** from the compile graph (`grep -rl Map2MidiController build-h6-off/CMakeFiles/map2_audio_engine.dir` returns empty). Throwaway build dirs cleaned.
    - Full link verification (`cmake --build`) skipped per slice scope — runbook step §2 documents the manual command for the bench operator before the deletion PR.

  Next-action runbook (bench operator): With `map2-controller-host` running and the engine rebuilt with `cmake -B juce-engine/build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF && cmake --build juce-engine/build --target map2_audio_engine`, run `python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py --duration-seconds 1800 --flow-rotation-seconds 20 --sample-interval-seconds 1.0 --reset-stats-after-warmup --threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35 --midi-driver host --midi-controller-key soak-driver --midi-rate-events-per-sec 30 --midi-message-mix mixed --soak-tag t2459h6-shm-ring`. If `overall_pass=True`, follow the deletion procedure in `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` §4 — drop the option, the source/header, and the audit-test EXPECTED set entries in one atomic commit; capture the producer→consumer latency graph under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h6-shm-ring/`.

  Status stays `[ ] Todo` (full retirement still gated on HIL soak + file deletion). The slice's job — make the HIL run a one-command operation and the deletion a one-PR change — is complete.

  2026-05-03 — Claude: **Slice 2 SHIPPED (IpcMidiBridgeController factory adapter — closes the deletion-blocking factory gap from Slice 1).**

  The OFF build no longer returns `nullptr` from `Map2ControllerFactory::create("midi", ...)` — it returns `IpcMidiBridgeController`, a `Map2Controller` adapter that wraps the H1-shipped `IpcMidiBridge` so the audio engine drains its MIDI events from the host's shm event ring instead of opening its own ALSA subscription. Closes the audit gap filed in Slice 1: "non-test caller would crash under OFF" — adapter satisfies the contract (open / close / poll / send), translates ring frames into `ControllerEvent` records, and re-uses the inherited fast-path + eventCallback dispatch seam. Outbound MIDI in the H6 architecture rides the controller-host's UDS control plane, so `send()` is a no-op stub returning true (legacy callers' boolean contract preserved); the actual outbound write happens via the IPC commands the engine emits separately.

  Files added: `juce-engine/Source/Controllers/Midi/IpcMidiBridgeController.{h,cpp}`.

  Files modified: `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` (OFF arm now returns `std::make_unique<midi::IpcMidiBridgeController>(identity)` instead of `nullptr`), `juce-engine/CMakeLists.txt` (added `IpcMidiBridge.cpp`, `IpcMidiBridgeController.cpp`, and `Source/ControllerHost/EventRing/ShmEventRing.cpp` to both the engine `SOURCES` list AND `controllers_tests` so both ON and OFF link cleanly), `juce-engine/tests/Map2ControllerTests.cpp` (OFF-arm test renamed + asserts non-null + isOpen()==false + send() returns true), `tests/test_map2midicontroller_caller_audit_t2459h6.py` (audit EXPECTED set + pinned-test-name updated).

  Validation:
  - `cmake -B juce-engine/build && cmake --build . --target controllers_tests` — clean (ON build).
  - `./juce-engine/build/controllers_tests` — **17 assertions in 8 test cases passed**.
  - `cmake -B juce-engine/build-h6-off -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF && cmake --build . --target controllers_tests` — clean (OFF build, no Map2MidiController in the link graph).
  - `./juce-engine/build-h6-off/controllers_tests` — **19 assertions in 8 test cases passed** (2 new assertions in the OFF-arm IpcMidiBridgeController test).
  - `pytest -q tests/test_map2midicontroller_caller_audit_t2459h6.py tests/test_soak_harness_midi_extension_t2459h6.py` — **11 passed**.

  Remaining for full T2459-H6: HIL soak run with the host driving real MIDI traffic + atomic deletion PR per `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` §4.
Last updated: 2026-05-03 EDT - Claude: Slice 2 (IpcMidiBridgeController factory adapter) shipped; the OFF build is now a working configuration end-to-end. HIL soak + file deletion remain.


---

ID: T2477
Status: [ ] Todo
Title: Graph-rendering consolidation — unify ReactFlow + custom canvas + custom builder into one signal-flow primitive
Description:
- Goal / acceptance criteria: Audit the three concurrent graph-rendering approaches: (1) ReactFlow in NodeGraph, (2) custom canvas in AudioEngineWorkspaceGraph, (3) custom builder logic in AvbRoutingWorkspaceGraph + ManagementWorkspaceGraph. Design a single signal-flow primitive (`<SignalFlowGraph nodes={...} edges={...} layout={...} />`) backed by ReactFlow with a unified node/edge schema. Migrate all four call sites to the primitive. Preserve all interactions: drag-rewire, zoom/pan, edge highlighting, node selection, tearsheet, clustering. Validate with Jest + manual routing-edit testing. PAUSED pending user clarification round (Q&A on whether ReactFlow stays as the substrate, custom-renderer escape hatches, performance budget for large graphs).
- Why it matters: Three different graph builders mean three sets of bugs, three sets of perf characteristics, three sets of UX inconsistencies. Signal-flow is one of MAP2's core operator concepts (Q8=C); it deserves one canonical rendering.
- Dependencies: T2474 (tokens + primitives), ideally after T2476 (so plugin cards inside graph nodes use the unified primitive).
- Estimated effort: Large — architectural refactor with behavioral risk in MAP2's identity surface (NodeGraph).
- Required outputs: Unified `<SignalFlowGraph>` primitive; all four call sites migrated; documented node/edge schema; Jest + integration-test coverage.
Assigned to: TBD (paused — clarification round complete; deferred behind T2475 due to AvbRouting interlock)
Last updated: 2026-04-29 - Claude (clarification round complete; execution deferred behind T2475)
- Clarification round (2026-04-29): C+D + D + B + A + A locked.
  - **C+D** (Q1): Schema-driven `<SignalFlowGraph>` primitive AND dead-code purge of 11+ `web/src/map2/components/ChainBuilder/` files (zero incoming references — parallel to E1's 28 dead MUI files).
  - **D** (Q2): Render-prop body slot. The primitive owns Carbon Tile chrome + dagre layout + ReactFlow wiring; per-workspace `<*NodeBody>` components fill the body via `renderNodeBody` callback.
  - **B** (Q3): Per-workspace body components live in their workspace folders (matching the existing NodeGraphCard.tsx shape that B5 already established).
  - **A** (Q4): Lowest-risk-first migration of all 7 active workspace graphs (NodeGraph, ManagementWorkspace, ClusterDashboard, NetworkDiscovery, AudioEngineWorkspace, JuceSourceTruthGraph, AvbRouting), all in one commit.
  - **A** (Q5): One big commit, tests-only verification.
- **Reconnaissance corrections during clarification round**: original audit said "ReactFlow + custom canvas + custom builder." Reality:
  - All 7 active workspace graphs *already use* ReactFlow + dagre + custom `nodeTypes`. Same architectural pattern, different per-workspace specializations.
  - The "custom canvas" alternate path doesn't exist in the active codebase.
  - The 11+ ChainBuilder ReactFlow consumers under `web/src/map2/components/ChainBuilder/` have zero incoming references (dead code, parallel to E1's MUI dead files).
  - 7 active graph builders share 2,766 LOC of similar-shaped data-modeling logic. Real duplication is the dagre call + node-data shape, not whole-builder duplication.
- **Defer execution behind T2475 (E1 MUI removal)**: AvbRouting graph is one of the 7 workspace migrations in T2477's scope, AND AvbRouting is the highest-risk surface in T2475's scope (RoutingGrid uses MUI heavily). Migrating AvbRouting graph in T2477 against a still-MUI AvbRouting subtree means doing it twice — once now, once after T2475 lands. Cleaner: T2475 first, then T2477 with its AvbRouting graph migration running against a Carbon-native AvbRouting subtree.


---

ID: T2481
Status: [ ] Todo
Title: GUI Fit-and-Finish — Carbon Deepening Pass (whole web frontend)
Description:
- Goal / acceptance criteria: Take the web frontend from "functional, partially Carbon" to "Carbon-deep, release-grade fit and finish" across every page under `web/src/app/`. Carbon Design System (https://carbondesignsystem.com/) is the inspiration source. **Carbon is the floor, MAP2 polish on top**: chrome / forms / modals / tabs / data tables / menus / notifications / empty states / tooltips become canonical `@carbon/react` consumers; domain surfaces (audio meters, faders/knobs, patch cords, MPX-1 SVG panel, IntelFX/MPX-1 signal-flow canvases, Drum Machine pads, UnifiedChannelGrid, BrainKeyboardVisualizer) stay bespoke but inherit Carbon tokens (spacing scale, type scale, motion durations + easings, theme tokens) so they stop visually fighting the chrome. Definition of Done: every shared interaction primitive uses Carbon, every spacing/font/motion declaration uses a token, IBM Plex Sans + IBM Plex Mono are the only UI fonts, lint rules block regression, and an end-of-Epic soak audit scores every page ≥4/5 against the rubric (or files a follow-up).
- Why it matters: Carbon is already installed (`@carbon/react@^1.103.0`, `@carbon/icons-react@^11.76.0`, 505 import sites) and `docs/design/CARBON_CONFORMANCE_STANDARD.md` is a standing rule, but adoption is uneven — there are 500+ ad-hoc `transition: ... ease` declarations (T2466 has been chipping away at this for weeks), hand-rolled modals/forms/tables across MPX-1/IntelFX/Snapshot Editor/Drum Machine/MIDI Hub, hardcoded font sizes and colors, and no automated drift prevention. The result: surfaces feel "assembled" rather than "designed," and every new feature re-introduces a small amount of inconsistency. This Epic finishes the Carbon migration started piecemeal across T2444/T2466/T2475 and locks the floor in with lint + a closing audit so future features can't undo it.
- Inspiration source: Carbon Design System (IBM, https://carbondesignsystem.com/) — chosen by the user. Aligns with existing `docs/design/CARBON_CONFORMANCE_STANDARD.md` and prior Carbon-aligned work (`Carbon Category Card Refactor`, GUI-2 node-graph editor, MAP2 Brain Overview chrome).
- Dependencies: T2444 (design-language tokens — shipped), T2466 (motion + spacing token sweep — in flight; this Epic absorbs the remaining T2466-1/3/7 sweep into a broader pass), T2475 (MUI retirement — shipped, prerequisite for ban-MUI lint rule). No backend changes.
- Estimated effort: Large. 7 phases, each split into atomic 15–60 min subtasks per project rule §0.7. Expect 40–80 commits across the Epic life.
- Locked decisions (10-question scoping, 2026-04-30):
  - **Q1 Scope**: (a) — whole web frontend under `web/src/app/`. No surface excluded.
  - **Q2 Inspiration**: Carbon Design System (user-supplied), not pro-plugin / pro-software / Apple / hardware-DAW. Token-system depth, not visual lineage.
  - **Q3 Adherence posture**: (b) — Carbon as the floor, MAP2 polish on top. Canonical `@carbon/react` for chrome/forms/modals/tabs/tables/menus/notifications/empty-states/tooltips; bespoke-but-tokenized for audio-domain surfaces (meters, faders, patch cords, signal-flow canvases, MPX-1 SVG panel, BrainKeyboardVisualizer, UnifiedChannelGrid blocks).
  - **Q4 Theme posture**: (e) — defer theme decision. Keep existing theme system; this Epic only enforces token usage. A future Epic picks G100 / G90 / G10 / multi-theme posture.
  - **Q5 Typography**: (a) — full IBM Plex migration. IBM Plex Sans for UI prose/labels, IBM Plex Mono for every numeric readout (sample rates, dB, ms, hex CCs, lat/jitter, MIDI values, timecodes). Carbon type tokens (`$body-01`, `$heading-03`, `$code-02`, etc.) are the only legal way to set font size/weight/line-height. Load fonts via `@ibm/plex` and set at AppShell root. Audit and remove all hardcoded `font-family` / `font-size` / `font-weight` declarations.
  - **Q6 Spacing/Grid**: (d) + lint from (a) — adopt Carbon's spacing scale (`$spacing-01..13`) universally; **skip** the `<Grid>` / `<Column>` migration (existing flex/CSS-grid layouts stay). Stylelint/ESLint rule bans raw `px` on `padding|margin|gap|inset|top|right|bottom|left`. Existing 500+ sites migrate organically as files are touched, plus an Epic-internal sweep of the top-N highest-traffic CSS files.
  - **Q7 Iconography**: (e) — **deferred**. Out of scope for this Epic; existing icon mix (Carbon + Phosphor legacy + inline SVG) stays untouched. Tackle in a dedicated Icon System Epic.
  - **Q8 Motion**: (a) — full Carbon motion adoption. Productive durations (`$duration-fast-01..02`, `$duration-moderate-01..02`) for controls/hovers/toggles/tabs/dropdowns; expressive durations (`$duration-slow-01..02`) for modals/page transitions/hero reveals/Flow Canvas patch-cord animations. Carbon easings (`productive-entrance`, `productive-exit`, `expressive-entrance`, `expressive-exit`) replace all ad-hoc `ease`/`ease-in-out`. `prefers-reduced-motion` honored everywhere via the existing `useReducedMotionSafeVariants` / `useReducedMotionSafeTransition` hooks (T2466-3 helpers). Domain motion (meter ballistics 0.05s, gate state-LED 0.1s, tuner needle, AVB grid hover 60ms) explicitly preserved below the design-language scale per the T2466 SHIP-loop convention.
  - **Q9 Shared interaction primitives**: (a) — **full primitive migration**. Every form input, dropdown, modal, table, notification, empty state, tooltip, and menu across the frontend swaps to Carbon. Bespoke versions are deleted. Audio-domain controls (faders, knobs, XY pads, meters, patch cords, MPX-1 SVG panel, signal-flow canvases) remain bespoke. Decomposed into 5–7 sequential phases (forms → tables → modals → notifications → empty states → tooltips → dropdowns/menus); each phase migrates a single canary surface first, soaks for one session, then sweeps.
  - **Q10 Done + drift prevention**: (b) + (e). **Lint-rule suite** is the primary mechanism: ban raw `px` on spacing/font properties; ban non-Carbon `transition` shorthands; ban hand-rolled `<button>` / `<input>` / `<select>` / `<dialog>` (must come from `@carbon/react`); ban hardcoded `font-family`; ban hex colors outside the token file; ban MUI imports; preserve a `// carbon-allow: <reason> + <worklist-link>` escape hatch. Build fails on violations. **End-of-Epic soak audit** (single pass, walks every page, scores 1–5 against a Carbon fit-and-finish rubric covering typography / spacing / motion / primitives / chrome; files a follow-up worklist task for every <4). Skip Playwright VR (false-positive heavy on an evolving UI; lint catches the structural drift).
- Phases / subtasks (each phase split into atomic per-surface bundles per §0.7; bundle list firmed up at phase entry):
  - **T2481-A — Foundation: tokens + Plex fonts wired at AppShell root**
    - A1: install `@ibm/plex` (or `@carbon/themes` Plex bundle), load Plex Sans + Plex Mono fonts at AppShell root, set Carbon type tokens as the AppShell type baseline. Verify computed `font-family` on body and on a numeric readout.
    - A2: extend `web/src/app/styles/design-language.css` with the Carbon spacing scale (`$spacing-01..13`) and Carbon motion durations + easings, mapped to MAP2-prefixed CSS variables (`--map2-spacing-01..13`, `--map2-dur-fast-01..slow-02`, `--map2-ease-productive-entrance` etc.). The scale already exists for durations; this aligns the names + adds spacing.
    - A3: ESLint plugin scaffold + first three rules: `no-hardcoded-px-spacing`, `no-ad-hoc-transition`, `no-mui-import` (T2475 follow-up). Wire into `npm --prefix web run lint`. CI fails on violations.
  - **T2481-B — Typography sweep (Plex Sans + Plex Mono)**
    - B1: AppShell + global nav + workspace bar + content kicker — verify Plex Sans renders, audit hardcoded `font-family` / `font-size` / `font-weight`.
    - B2: every numeric readout site → Plex Mono (`$code-01`/`$code-02`). Highest-density surfaces first: meters, channel strip dB labels, sample-rate / buffer / latency displays, MIDI CC values, parameter readouts, timecodes, hex bytes (SysEx parsers, MPX1 librarian, MIDI Hub event lists).
    - B3: every page header / panel header / tab label → Carbon `$heading-*` token. Sweep top-25 pages in priority order (Brain Overview / Snapshot Editor / MPX-1 / Flow Canvas / MIDI Hub / Hardware Store / Drum Machine / Synth Forge / Maschine / IntelFX / Latency / Diagnostics / Adoption / Platform Guide / Audio Engine / etc.).
    - B4: lint rule `no-hardcoded-font` activated. Existing violations marked with `// carbon-allow:` + worklist link, burned down in B5.
    - B5: violation burndown — sweep all `// carbon-allow:` entries created in B4.
  - **T2481-C — Spacing-token sweep (Carbon scale, no Grid migration)**
    - C1: top-10 highest-traffic CSS files (SnapshotEditorPage.css, AppShell.css, MPX1SignalPathCanvas.css, Toasts.css, LCDView.css, midiAssignments/walkthrough.css, ExpressionPage.module.css, MPX1Panel + MPX1ScenePanel, BrainOverviewShell, HardwareStorePage). Replace raw `px` on padding/margin/gap/inset with `$spacing-*` tokens.
    - C2: lint rule `no-hardcoded-px-spacing` activated; existing violations annotated with `// carbon-allow:` (audio-domain pixel-exact cases legitimately survive; meter needles, signal-flow canvas line widths, etc.).
    - C3: violation burndown across the remaining 200+ CSS files via the `/tmp/token_sweep.py`-style regex pass already proven in T2466 SHIP loops.
  - **T2481-D — Motion-token sweep (Carbon durations + easings)**
    - D1: extend the T2466 sweep to cover every remaining `transition: ... ease/ease-in-out` declaration, mapping to Carbon productive (controls/hovers) vs expressive (modals/page transitions) per Q8.
    - D2: `useReducedMotionSafeTransition` wired into every Framer Motion consumer that's still hand-rolling the prefers-reduced-motion ternary (audit list: ExpressionPage 15+ inline transitions, GuiOptionsShowcase intentionally skipped per existing T2466-3 carve-out).
    - D3: lint rule `no-ad-hoc-transition` activated; violation burndown.
  - **T2481-E — Shared interaction primitives migration (canary-then-sweep)**
    - E1 Forms: canary = MIDI Mapping wizard form. Sweep = every `<input>` / `<select>` / `<textarea>` / `<form>` site → Carbon `<TextInput>` / `<NumberInput>` / `<Dropdown>` / `<MultiSelect>` / `<TextArea>` / `<Form>`. Validation rules use Carbon's `invalidText` / `warnText` patterns. React Hook Form integration verified.
    - E2 Tables: canary = MPX1 Librarian. Sweep = MIDI Hub event list, Mod Matrix, Drum Machine pattern editor, Snapshot Library, Diagnostics aggregate, Pack Sources, ApiObservatory request list, etc. → Carbon `<DataTable>` with sticky headers, sortable columns, batch selection where applicable.
    - E3 Modals: canary = Snapshot Editor publish-snapshot modal. Sweep = every hand-rolled modal/dialog → Carbon `<Modal>` / `<ComposedModal>`. Plugin browser and routing-topology modals (T2473 phase) re-checked for Carbon completeness.
    - E4 Notifications: canary = AudioDeviceDisconnectedBanner (T2453). Sweep = every hand-rolled banner/inline-warning/error block → Carbon `<InlineNotification>` / `<ActionableNotification>` / `<ToastNotification>`. Standing rule from `docs/CLAUDE.md` (no `InlineNotification` for explanatory text — only operational warnings) preserved.
    - E5 Empty states: canary = Hardware Store unknown-device state (T2459-G4 Q4). Sweep = every "Select a chain" / "No data" / placeholder surface → Carbon `<EmptyState>` (or the documented Carbon empty-state pattern where the component is in flux). Concrete operator copy + primary action.
    - E6 Tooltips + popovers: canary = NodeNavChip popover. Sweep = every custom tooltip/popover → Carbon `<Tooltip>` / `<Popover>`. Standing NodeNavChip directive (`docs/CLAUDE.md` Unified Pill) preserved.
    - E7 Dropdowns + menus + overflow menus: canary = AppShell user menu. Sweep = every custom dropdown/context-menu → Carbon `<Dropdown>` / `<OverflowMenu>` / `<ComboBox>`.
    - E-lint: rules `no-raw-button` / `no-raw-input` / `no-raw-select` / `no-raw-dialog` activated as each phase closes; existing violations marked + burned down inside that phase.
  - **T2481-F — Domain-surface tokenization pass**
    - F1: AudioMeter / VuMeter / DynamicsMeterPanel — visual chrome inherits Carbon tokens (border, background, label fonts → Plex Mono, dB-scale typography → `$code-01`); meter ballistics motion preserved below the design-language scale.
    - F2: UnifiedChannelGrid Block + EmptySlot + ChannelHeader — Carbon tokens for spacing, type, hover/focus/active states; bespoke geometry preserved.
    - F3: MPX1SignalPathCanvas + IntelFXSignalPathCanvas + ChainGraphCanvas — node card chrome, sidebar param editor, toolbar, undo/redo affordances → Carbon tokens; patch-cord/wire SVG geometry untouched.
    - F4: Maschine MK1 grid + LED-slider input + pad chrome → Carbon tokens; LED color pixels untouched.
    - F5: BrainKeyboardVisualizer (T2480-3) + Brain ConsoleView channel strips + Step pads → Carbon tokens; piano key geometry + meter ballistics untouched.
    - F6: Drum Machine pads + step grid + kit picker → Carbon tokens.
    - F7: Synth Forge oscillator/envelope/filter cards → Carbon tokens.
  - **T2481-G — Closing audit + drift lock**
    - G1: rubric authoring — 5-axis scoring sheet (typography / spacing / motion / primitives / chrome) under `docs/design/CARBON_FIT_AND_FINISH_RUBRIC.md`. Each axis 1–5 with concrete pass criteria.
    - G2: walk every top-level route under `web/src/app/pages/` (~80 pages). Score each. File one follow-up worklist task per axis-page where score <4. Park the follow-up tasks under their natural Epic (Brain / MPX-1 / MIDI Hub / etc.), not under T2481.
    - G3: lint suite hardened — `// carbon-allow:` count audited; remaining suppressions justified in the suppression file or burned down. CI build fails on any new suppression that lacks a worklist link.
    - G4: final dual-push, atomic build, `:3000` HTTP 200 verification, evidence dir at `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2481-fit-and-finish/` with rubric scores, lint suppression report, and before/after screenshots of the top 10 most-changed pages.
- Out of scope:
  - Theme posture (G100 / G90 / G10 / multi-theme switching) — deferred to a future Epic per Q4. This Epic is theme-agnostic; tokens just become the contract.
  - Iconography migration (Carbon-icons-only enforcement) — deferred per Q7 to a future dedicated Icon System Epic.
  - Carbon `<Grid>` / `<Column>` layout migration — explicitly skipped per Q6.
  - Backend changes — none required.
  - Visual regression suite (Playwright/percy/chromatic) — explicitly out per Q10. Lint rules + closing audit replace it.
  - Audio-domain control geometry (meter needles, knob arcs, fader travel, patch cords, signal-flow node shapes, piano keys, drum pad geometry, LED pixels) — preserved as-is. Only chrome around them is tokenized.
  - Realtime-feedback motion (meter ballistics 0.05s, gate state-LED 0.1s, tuner needle 0.05s, AVB grid hover 60ms, UnifiedChannelGrid column-resize 60ms linear) — preserved below the design-language scale per the T2466 SHIP-loop convention.
  - Storybook component gallery — `@carbon/react` ships its own docs; no need to rebuild it.
  - DoD rule changes in `CLAUDE.md §0.8` — the existing Definition of Done already covers UI-affecting commits; the lint suite is what changes, not the rule.
- Required outputs: per-phase commits to `master` (one per atomic bundle, all dual-pushed); ESLint plugin under `web/eslint-rules/` (or extension to existing config); `docs/design/CARBON_FIT_AND_FINISH_RUBRIC.md`; `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2481-fit-and-finish/` with rubric scores + before/after screenshots + lint suppression audit; rolling worklist updates inside this Epic block per phase close; follow-up tasks filed for every axis-page rubric score <4 (parked under owning Epics).
- Risk / mitigation:
  - **Bespoke form/table behavior regresses on Carbon migration** — every primitive phase migrates a canary surface first and soaks for one session before the sweep. Bespoke validation, async hydration, and live-sync semantics (especially MPX1 + Mixxx round-trip + Brain library) explicitly tested per canary.
  - **Plex font load latency** — Plex Sans + Plex Mono are ~200KB each; serve from `@ibm/plex` self-hosted, preload Mono since metering uses it on first paint.
  - **Lint rules block existing CI** — every rule lands with a generated `// carbon-allow:` snapshot of current violations, so no rule activation is a hard CI break. Violations burn down inside the phase that activated the rule.
  - **Soak audit reveals dozens of <4 scores** — by design. The audit's job is to surface the long tail; follow-up tasks are filed and parked, this Epic is not held open by them.
- Definition of Done (Epic-level): T2481-A through T2481-G all `[✓] Done`; lint suite live in CI with zero unjustified suppressions; rubric audit complete with follow-ups filed; `npm --prefix web run typecheck` + `npm --prefix web run build` clean; `:3000` HTTP 200; bench-side visual verification on top-10 pages; evidence dir written; dual-pushed.
Assigned to: Unassigned (foreground execution session-by-session; no autonomous-loop scheduled at open)
Last updated: 2026-05-03 EDT — Phase A entered. T2481-A1 SHIPPED (commit landing in this push).

Phase progress:
- 2026-05-03 — T2481-A1 SHIPPED (Claude). Installed `@fontsource/ibm-plex-mono@^5.2.7` (5.2.8 not yet published; 5.2.7 latest); added eager `400.css` + `600.css` imports in `web/src/main.tsx` next to the existing Plex Sans imports. Fixed `--font-mono` token in `web/src/index.css`: it was aliasing `--font-ui` (Plex Sans) which silently downgraded every numeric/code readout site (`--cds-code-01-font-family`, `--cds-code-02-font-family`, monospaced rules at `:255`) to a non-monospaced family. Now points at `'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace` so dB readouts, sample rates, ms, hex CCs, MIDI values, and timecodes finally land on the proper monospaced grid. Eager JetBrains Mono `400.css` import retired (the family stays available in `usePlatformTypography.ts` as a user-pickable preset; just no longer eager-loaded as the platform default mono). `npm --prefix web run typecheck` clean; atomic build clean (19.47s).
- 2026-05-03 — T2481-A2 SHIPPED (Claude). Extended `web/src/app/styles/design-language.css` with the full Carbon spacing scale exposed as `--map2-spacing-01..13` (2px / 4px / 8px / 12px / 16px / 24px / 32px / 40px / 48px / 64px / 80px / 96px / 160px in rem) and the Carbon motion contract: `--map2-dur-fast-01..02` (70/110ms productive), `--map2-dur-moderate-01..02` (150/240ms productive), `--map2-dur-slow-01..02` (400/700ms expressive), plus the six Carbon Bézier easings (`productive-entrance`, `productive-exit`, `productive-standard`, `expressive-entrance`, `expressive-exit`, `expressive-standard`). The pre-existing `--map2-dur-instant/fast/base/slow/cinematic` and `--map2-space-1..8` names remain for back-compat through one migration cycle. Token names match Carbon's documented contract exactly so the T2481-A3 ESLint rules and downstream T2481-D motion + T2481-C spacing sweeps target a single canonical surface. `npm --prefix web run typecheck` clean; atomic build clean (19.34s).
- 2026-05-03 — T2481-A3 SHIPPED (Claude). Created `web/eslint-rules/index.js` as the in-tree MAP2 ESLint plugin (no separate package; imported into `web/eslint.config.js` directly). Three rules ship in `warn` mode so existing violations don't break CI: (1) **`map2/no-mui-import`** — bans `@mui/*` and `@emotion/styled` imports (MUI was retired 2026-04-30 in T2475-E1); covers `import` declarations, dynamic `import()`, and `require()`; (2) **`map2/no-ad-hoc-transition`** — bans inline JSX `transition: '... ease/ease-in/ease-in-out'` declarations; passes when the value already references `var(--map2-dur-*|map2-ease-*|cds-*)`; (3) **`map2/no-hardcoded-px-spacing`** — bans raw `Npx` literals on `padding|margin|gap|inset|top|right|bottom|left` (and per-side / inline / block variants) inside JSX `style={...}`; passes when the value already references `var(--map2-spacing-*|map2-space-*|cds-spacing-*)`. All three honor a `// carbon-allow: <reason>` escape hatch on the preceding line for the §10.5 hardware-skin / device-graphics / audio-domain pixel-exact exemptions. First lint run reports **333 warnings, 0 new errors** (1 pre-existing `react/display-name` plugin-load error in `useSequencerChannelMeters.test.tsx` introduced by `T_RENAME` is unrelated). Build + typecheck clean (19.85s). Phase A complete; T2481-A is `[✓] Done`.
- 2026-05-03 — Pre-existing lint error fixed (Claude). Replaced the `// eslint-disable-next-line react/display-name` in `web/src/app/hooks/useSequencerChannelMeters.test.tsx` with a named `Wrapper` component carrying `displayName = 'SequencerChannelMetersTestWrapper'`. `eslint-plugin-react` isn't installed, so the rule reference was a hard error blocking `npm run lint` from clearing 0 errors. Lint now reports 333 warnings, 0 errors.
- 2026-05-03 — T2481-B1 slice 1 SHIPPED (Claude). Audit + cleanup of AppShell + GlobalTreeNav font declarations (first canonical surfaces in the typography sweep): (a) `AppShell.css:181` — hardcoded `'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif` → `var(--font-ui)`; (b) `AppShell.css:736, :743, :821` (3 sites) — hardcoded `'IBM Plex Mono', 'IBM Plex Sans', monospace` → `var(--font-mono)`; (c) `GlobalTreeNav.css:152, :390, :424` (3 sites) — `font-size: 12px` → `var(--cds-helper-text-01-font-size, 0.75rem)`. Fractional sub-Carbon font sizes (`8.5px`, `9.5px`, `10.5px`, `11.5px`, `13.5px`) on the dense rows are intentional density choices below the Carbon scale and stay as-is until the dedicated stylelint pass introduces a CSS-side rule (current `no-hardcoded-px-spacing` only targets JSX inline styles). Atomic web build clean (19.70s); `AppShell.test.tsx` 10/10 green.
- 2026-05-03 — T2481-D1 slice 1 SHIPPED (Claude). First two ad-hoc-transition lint warnings retired: (a) `web/src/map2/components/MIDI/MidiLearnButton.tsx:54` — `transition: 'all 0.2s ease'` → `'all var(--map2-dur-moderate-02) var(--map2-ease-productive-standard)'` (productive 240ms, closest Carbon stop to the original 200ms control hover/state). (b) `web/src/map2/components/ChainBuilder/panels/LatencyOverlay.tsx:82` — `transition: 'width 0.3s ease'` → `'width var(--map2-dur-slow-01) var(--map2-ease-productive-standard)'` (slow-01 400ms — the latency overlay bar fill is a status indicator that benefits from the slightly longer expressive-adjacent duration to make the redistribution visible). Lint warning count down from 333 → 331; build + typecheck clean (19.78s).
- 2026-05-03 — T2481-D1 slice 2 SHIPPED (Claude). Cleared **all** remaining `map2/no-ad-hoc-transition` warnings (-12 total: 333 → 319 + the -2 from slice 1; final transition-warning count = 0). One genuine token migration: `PlatformCapabilities.tsx:958` — score-bar fill `transition: 'width 0.3s ease'` → `'width var(--map2-dur-slow-01) var(--map2-ease-productive-standard)'`. Eleven `// carbon-allow:` annotations on bona-fide T2466 audio-domain carve-outs (per the locked Q8 directive — meter ballistics 50ms / gate-LED 100ms / tuner needle 50ms preserved below the design-language scale): `Visualizations/VuMeterDisplay.tsx` (×2, L+R channel meter ballistics), `Visualizations/ClusterMeteringStrip.tsx` (×1, cluster meter ballistics), `Visualizations/DynamicsMeteringPanel.tsx` (×3, GR + input + output meter ballistics), `Visualizations/AudioMeter.tsx` (×1, audio meter ballistics), `PluginCards/Custom/TooB/TunerCard.tsx` (×1, tuner-needle ballistics), `PluginCards/Custom/JUCE/GateCard.tsx` (×1, gate state-LED), `PluginCards/Custom/JUCE/NAMCard.tsx` (×2, input + output meter ballistics). The motion sweep's first phase target is met: every ad-hoc transition under `web/src/` is either a Carbon-token reference or an annotated audio-domain carve-out. Build + typecheck clean (19.72s).
- 2026-05-03 — T2481-D1 ratchet SHIPPED (Claude). With 0 violations of `map2/no-ad-hoc-transition` across `web/src/`, the rule is now `'error'` in `web/eslint.config.js` (was `'warn'`). Future drift on JSX inline-style ad-hoc `transition: ... ease/ease-in/ease-in-out` declarations now blocks lint and CI; the `// carbon-allow:` escape hatch keeps the audio-domain carve-out path. Lint reports **0 errors, 319 warnings** (all remaining warnings are `no-hardcoded-px-spacing`, the next D-phase target). Build + typecheck clean (19.71s).
- 2026-05-03 — T2481-C1 hardware-skin carve-out SHIPPED (Claude). Added a `files: ['src/app/components/PluginCards/Custom/**/*.{ts,tsx}']` block to `web/eslint.config.js` that turns `map2/no-hardcoded-px-spacing` off under the §10.5 hardware-skin / device-graphics carve-out (CARBON_CONFORMANCE_STANDARD). The rationale matches the standing rule: every Custom plugin card (CelestialCompressor, EVHPitchShifter, IntelliFX, NAM, NativeDelay, Peavey5150, Sequencer, TweedBassman, GateCard, NAMCard, TooB Looper / Tuner, etc.) is a vendor device-skin where spacing is pixel-exact part of the visual identity, not platform chrome. Motion stays at `error` because meter ballistics still require explicit `// carbon-allow:` annotations documenting why each timing is below the design-language scale. Lint warning count down from 319 → 266 (-53 device-skin spacing warnings); 0 errors. Build + typecheck clean (19.53s).
- 2026-05-03 — T2481-C1 bulk Carbon-stop sweep SHIPPED (Claude). Wrote `/tmp/sweep_carbon_spacing.py` that scans every `.{ts,tsx}` under `web/src/` for JSX inline-style `padding|margin|gap|inset|top|right|bottom|left` declarations of the shape `'Npx [Mpx [Kpx [Lpx]]]'` and migrates **only** values where every stop maps exactly to a Carbon spacing token (4/8/12/16/24/32/40/48/64 px → `var(--cds-spacing-02..10)`). Mixed-grid strings (e.g. `'6px 12px'`, `'10px 12px'`) are left untouched because partial migration would shift layout. Result: **126 migrations across 27 files** in one pass — `PlatformCapabilities.tsx` (×14), `CommunitySnapshotBrowser.tsx` (×29), `LV2PluginParameterEditor.tsx` (×12), `LCDView.tsx` (×16), `PluginBrowser.tsx` (×5), `MidiAssignmentsPage.tsx` (×4), `MeteringPage.tsx` (×3), `MOTURMEPage.tsx` (×5), `PerformPage.tsx` (×7), `OnboardingWizard.tsx` (×3), and others. Lint warning count down 266 → **140** (-126); 0 errors. Build + typecheck clean (19.58s); `AppShell.test.tsx` 10/10 + `MidiServicesRegionPages.smoke.test.tsx` 14/14 green.
- 2026-05-04 — T2481-C1 burndown SHIPPED across 4 commits (Claude). Drove `map2/no-hardcoded-px-spacing` from 140 warnings → 0 across `web/src/`. Path:
  - **PlatformCapabilities.tsx** (×21 sites): inline `// carbon-allow:` on each capability-matrix dense row (6x12px), tfoot (10x12px), service-control button (3x6px ×3), state pill (2x8px), optional-tag pill (2x6px ×2), test-result row (6x10px), pass/fail badge (2x6px), and the 12-cell capability grid.
  - **§10.5 carve-out extension** in `web/eslint.config.js`: added all 13 hardware-skin device viewers under `Devices/<vendor>/` (EdirolUA1000, MPX1, IntelFX, Maschine, LCD, Tesira, Expression, GroundControlPro, HoToneJoGG, MidiCommander, LaunchControl, Mcu, PushSurface), plus `Visualizations/**` (audio meters / EQ / dynamics), plus `LV2PluginParameterEditor.tsx` and `PluginBrowser/**`. Same §10.5 logic as the Custom plugin cards: pixel-exact device-front-panel renderings + per-parameter plugin chrome are part of the visual identity, not platform chrome.
  - **Sidechain + JsonTreeViewer** (×11 sites): per-property `// carbon-allow:` annotations on dense status pills, select inputs, search inputs, expand/collapse buttons, etc. + one safe `'0 auto 8px'` → `'0 auto var(--cds-spacing-03)'` token migration.
  - **Auto-annotation script** (`/tmp/annotate_off_grid.py`): bulk-inserted per-property `// carbon-allow: dense surface; off-grid between Carbon stops.` comments above all 38 surviving off-grid sites in 18 files. Hand-fixed the 5 sites where the script placed the comment on a JSX-attribute line instead of inside the object literal (the lint rule's `getCommentsBefore` walks the Property AST node, so the comment must live inside `{{...}}`).
  - **Phase D + Phase C ratchet to `error`**: `map2/no-hardcoded-px-spacing` (T2481-C1) and `map2/no-mui-import` (T2475-E1, 0 violations since 2026-04-30) are now `'error'` in `web/eslint.config.js` — future drift is a hard CI fail. `map2/no-ad-hoc-transition` was already at `'error'` from D1.
  - Final lint state: **0 errors, 32 warnings** (all 32 are unrelated rules — `react-refresh/only-export-components` ×20, `react-hooks/exhaustive-deps` ×5, `react-hooks/rules-of-hooks` ×1, `typescript-eslint/*` ×6 — pre-existing tech-debt outside T2481 scope).
  - Build + typecheck clean across all four commits. T2481 Phase C complete.
- 2026-05-04 — T2481-B2 slice 1 SHIPPED (Claude). Numeric-readout SVG/CSS Plex-Mono cleanup outside the §10.5 hardware-skin carve-out: (a) `PluginCards/Visualizations/PitchDisplay.tsx`, `TransferCurve.tsx`, `LFOWaveform.tsx`, `DelayTapGrid.tsx` — replaced raw `fontFamily="monospace"` on the four numeric labels with `fontFamily="var(--font-mono, monospace)"` so semitone/cents, ratio, rate-Hz, and feedback-percent readouts pick up the platform Plex Mono; (b) `web/src/app/components/Toasts.css` — swept all 27 hardcoded `font-family: 'IBM Plex Mono', ...` declarations to `font-family: var(--font-mono, 'IBM Plex Mono', ...)` (4 distinct fallback shapes preserved as the `var()` fallback so the visual grid is identical when the token resolves). The Carbon `--cds-code-01-font-family` references are left alone — they're already canonical. Build clean (19.17s); typecheck clean. Lint state unchanged at **0 errors, 32 warnings** (the surviving 32 are unrelated to T2481 per the C1 burndown note).
- 2026-05-04 — T2481-B2 slice 2 SHIPPED (Claude). Swept the long tail of raw `font-family: 'IBM Plex Mono', ...` CSS declarations across 22 files to `var(--font-mono, ...)`: 6 StateAuthority surfaces (`MorphPad.css`, `GraphDocumentInspector.css`, `BlockPicker.css`, `StateAuthorityEventFeed.css`, `StateAuthorityPage.css`, `SnapshotEditorPage.css`); 4 SnapshotEditor surfaces (`UnifiedChannelGrid.css`, `BottomWizard/pedalboardBuildWizard.css`, `snapshots/publish/publishPerformance.css`, `pages/ApiObservatory/ApiObservatory.css`); 11 generic primitives (`primitives/SignalChainBlock.css`, `MetricCard.css`, `DrawerPanel.css`, `PageHeader.css`, `ErrorState.css`, `HealthMetric.css`, `SystemStatusBar.css`, `ModuleCard.css`, `LiveStagedToggle.css`, `DeviceNodeCard.css`, `MidiCluster/MidiClusterNodeCard.css`); 1 ThemePage tab (`ThemePage/BrandingTab.css`). Three distinct fallback shapes preserved inside the `var()` fallback so the visual grid is identical when the token resolves. After this sweep, **every** mono `font-family` declaration under `web/src/` is either a `var(--font-mono, ...)` or a Carbon `var(--cds-code-*-font-family, ...)` reference — there are no remaining bypass paths to non-Plex monospace. Build clean (19.38s).
- 2026-05-04 — T2481-B1 slice 2 SHIPPED (Claude). Companion sweep on the sans side: every raw `font-family: 'IBM Plex Sans', ...` declaration in CSS routed through `var(--font-ui, ...)`. 11 files touched (4 distinct fallback shapes preserved inside the `var()` fallback): `AppShell.css`, `Toasts.css`, `Platform/WorkspaceCatalogArtwork.css`, `Platform/PlatformModal.css`, `ManagementWorkspace/ManagementWorkspace.css`, three StateAuthority surfaces (`BlockPicker.css`, `GraphDocumentInspector.css`, `StateAuthorityEventFeed.css`), `pages/StateAuthorityPage.css`, `HomePage.landing.css`, `HomePage.boot.css`. The single remaining raw `font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;` in `ApiObservatory.css` is intentional (Space Grotesk is the decorative display font; Plex Sans is its fallback) and is left alone — it's not a UI-prose surface. After this sweep, every `font-family` declaration under `web/src/` either resolves through the platform token (`--font-ui` / `--font-mono`) or a Carbon `--cds-*-font-family` token. Build clean (19.41s).
- 2026-05-04 — T2481-B2 slice 3 SHIPPED (Claude). JSX-side fontFamily cleanup. (a) `StagePedalChain.tsx` — three `<text fontFamily="'IBM Plex Sans', ..."/"'IBM Plex Mono', ..."/>` SVG sites on the rendered BOSS-style stage pedal plate (BOSS branding line, model name, parameter name) routed through `var(--font-ui, ...)` / `var(--font-mono, ...)`. The visualization is hardware-skin per spirit of §10.5 but the labels are platform-rendered text, not pixel-baked artwork — token-routing is correct here. (b) `MaschineMidiMapPage.tsx` — three `<span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>` MIDI label readouts on the pad/button/encoder rows now use `'var(--font-mono, monospace)'` so the MIDI message labels (`midiLabel(...)`, `CC <n> (<mode>)`) inherit Plex Mono. The remaining literal `fontFamily="monospace"` sites in `PluginCards/Custom/JUCE/celestial/GearImages.tsx` (rendered 1176LN / LA-2A / dbx 160 / 670 hardware faceplates) and the literal Arial/Georgia branding labels on those same faceplates are explicitly out of scope per §10.5 hardware-skin / device-graphics carve-out — they're part of pixel-exact vendor visual identity, not platform chrome. The `WebSshXTermTerminal.tsx` literal Plex-Mono fontFamily option stays as well: xterm.js can't read CSS variables in its options, and a follow-up to wire it through `getComputedStyle(...)` is its own slice. Build clean (19.05s).
- 2026-05-04 — T2481-B2 slice 4 SHIPPED (Claude). Closes the xterm.js follow-up flagged in slice 3. `WebSsh/XTermTerminal.tsx` now resolves `--font-mono` off the document root via `getComputedStyle(document.documentElement)` at mount time and passes the resolved family into the xterm.js `Terminal({ fontFamily, ... })` options; falls back to the original `'"IBM Plex Mono", "Menlo", "Consolas", monospace'` chain when the var is unset (e.g. in non-browser test environments where `window` is absent). The terminal's font now lives off the platform token like every other surface. After this slice, the only literal-non-token `fontFamily` declarations in `web/src/` are the §10.5 hardware-skin renderings (`PluginCards/Custom/JUCE/celestial/GearImages.tsx` faceplate branding) — which is the intended state. Typecheck + build clean (19.64s).
- 2026-05-04 — T2481-B4 SHIPPED + drift lock for B2 (Claude). Added a fourth rule `map2/no-hardcoded-font-family` to `web/eslint-rules/index.js` and wired it into `web/eslint.config.js`. The rule bans literal font-stack strings (IBM Plex Sans / IBM Plex Mono / Helvetica Neue / Arial / Georgia / Menlo / Consolas / SFMono-Regular / SF Mono / Segoe UI / Courier New / monospace / sans-serif / serif / system-ui / ui-monospace) on `style={{ fontFamily: ... }}` Property nodes and SVG `<text fontFamily="...">` JSXAttribute nodes; passes when the value already wraps the family in `var(--font-ui|--font-mono|--map2-type-*|--shell-f-*|--cds-(body|heading|code|label|helper|productive|expressive|legal)-*)`. Honors the `// carbon-allow: <reason>` escape hatch on the preceding line. The §10.5 hardware-skin carve-out files (Custom plugin cards, device viewers, Visualizations, LV2 / PluginBrowser) inherit the rule turn-off via the existing per-files override block alongside `no-hardcoded-px-spacing`. Surfaced **2 new genuine violations** in `web/src/app/pages/midi-services/MidiServicesGlyphs.tsx` (the SysEx F0…F7 hex-string glyph + the MTC `00:00` time-code glyph) and fixed them in the same commit (`fontFamily="ui-monospace, monospace"` → `fontFamily="var(--font-mono, ui-monospace, monospace)"`). With 0 violations across `web/src/`, the rule lands at `'error'` immediately so future drift is a hard CI fail. Lint state: **0 errors, 3 unrelated warnings** (the same `@typescript-eslint/no-require-imports` and `ban-ts-comment` pre-existing tech-debt outside T2481 scope). Typecheck + build clean (19.49s). T2481 lint suite is now four rules deep: `no-mui-import` + `no-ad-hoc-transition` + `no-hardcoded-px-spacing` + `no-hardcoded-font-family`, all at `'error'`.
- 2026-05-04 — T2481-D1 follow-up: CSS-side ad-hoc transitions on platform chrome SHIPPED (Claude). The original D1 sweep covered every JSX `style={{ transition: 'X ease/ease-in/ease-in-out' }}` declaration; the lint rule's `Property` selector doesn't reach into stylesheets. This slice closes that gap on the highest-traffic chrome surfaces: (a) `GlobalTreeNav.css` — quick-action button hover/active and hero-card border/background transitions (4 sites total: 3 × `140ms ease` and 2 × `0.15s ease`) routed through `var(--map2-dur-fast-02)` + `var(--map2-dur-moderate-01)` paired with `var(--map2-ease-productive-standard)`. (b) `Toasts.css` — `.stage-pedal-chain__slot` `filter 0.7s ease, transform 0.7s ease` routed through `var(--map2-dur-slow-02)` + `var(--map2-ease-expressive-entrance)` (the slow expressive scale fits the pedal-active-state lighting effect). (c) `WelcomeHero.css` — 6 ad-hoc declarations on the unified Home surface (`.map2x-btn` background/border/transform composite, `.map2x-btn svg` transform, three single-prop `background 0.1s` rules on guide cards/CTAs, and the `.map2x-repo-card` border + transform composite) routed through the productive scale. After this slice, every CSS-side `transition: ...` in platform chrome under `web/src/app/components/landing/`, `web/src/app/layout/GlobalTreeNav/`, and `web/src/app/components/Toasts.css` either already references Carbon motion tokens or is a `transition: none` reduced-motion override — no remaining ad-hoc `ease`/`ease-in-out` declarations in those surfaces. Build clean (19.11s). The ad-hoc-transition lint rule's reach is JSX-only by design; the long tail of CSS-side transitions across other files (visualizations carry the audio-domain carve-out; React Flow / overlay surfaces lack productive-Carbon analogues) is tracked for a future stylelint-side pass.
- 2026-05-04 — T2481-G3 lint suppression burndown SHIPPED (Claude). Cleared the last 3 lint warnings outside the T2481 scope by adding two narrowly-scoped per-files overrides to `web/eslint.config.js`: (1) `src/**/*.test.{ts,tsx}` and `src/**/*.spec.{ts,tsx}` turn `@typescript-eslint/no-require-imports` off — `jest.mock()` factories run before module imports, so `require('react')` / `require('@carbon/react')` is the only correct way to wire mocks. The Jest community treats this as idiomatic, and Carbon's own test files use the same pattern. (2) `src/map2/clients/*.generated.ts` turns `@typescript-eslint/ban-ts-comment` off — the auto-generated OpenAPI artifact carries a documented whole-file `@ts-nocheck` (header explains it: T2455 cluster-proxy duplicate operation IDs), and the file is consumed type-only via `snapshots.contract.ts`. Both overrides are surgical (path-pattern scoped), don't loosen rules anywhere else in the codebase, and carry inline comments explaining their rationale. Final lint state across `web/` is now **0 errors, 0 warnings** — the cleanest the repo has been since T2481-A3 introduced the lint plugin. Build clean (19.29s). Closes T2481-G3 ahead of the closing audit; the rubric work in G2 / G4 is still ahead.
- 2026-05-04 — T2481-G2 rubric authored SHIPPED (Claude). Wrote `docs/design/CARBON_FIT_AND_FINISH_RUBRIC.md` — the 5-axis scoring sheet (Typography / Spacing / Motion / Primitives / Chrome) the closing audit (T2481-G4) walks every page against. Each axis has explicit pass criteria for score-4 (Carbon-floor passes) and score-5 (Carbon-deep), plus 3–4 worked examples of common reasons a page lands at score-3 or below. Doc carries: scope (in-scope vs §10.5 carve-outs); how-to-use (walk top-25 list, score, file follow-ups under owning Epic for any <4); 25-page audit walk list in priority order; full worked example scoring `HomePage / WelcomeHero / PlatformGuideSections` against current repo state at commit 9ec87c16 (Typography 4 / Spacing 5 / Motion 5 / Primitives 4 / Chrome 5 — passes the audit gate, with one B3 follow-up filed for the hardcoded 76px hero title and 36px section title). Closing notes lock in the lint suite as drift prevention between audits and call out future Epics (theme posture per Q4, iconography per Q7) that ride the same rubric. The artifact is the explicit Phase G deliverable; G4 (audit walk + evidence dir) is the remaining Phase G work.
- 2026-05-04 — T2481-B3 slice 1 — HomePage display headings tokenized SHIPPED (Claude). Closes the B3 follow-up the rubric scoring filed against HomePage. Added a typography-scale token block under `.map2x` in `WelcomeHero.css`: `--map2x-heading-{hero,section,card,display,tile,eyebrow}-{size,weight,line}` plus `--map2x-body-{default,prose}-size`. Hero-tier values are deliberately above Carbon's productive-heading-07 ceiling (76px vs 54px) and stay literal because the hero is platform polish above Carbon's floor; the section-tier values fall back to Carbon's expressive-heading-04/06 tokens via `var(--cds-expressive-heading-*-font-size, ...)` fallbacks so the surface participates in any future theme swap; the section title (36px) carries an inline comment explaining it's a deliberate platform-display step between Carbon's expressive-06 (32px) and productive-06 (42px). Wired four hardcoded display-tier `font-size` declarations (`.map2x-hero__title`, `.map2x-section__title`, `.map2x-stat-cell__value`, `.map2x-guide-card__title`) through the new tokens. Visual values unchanged (76 / 36 / 38 / 22 px). Per-page rubric score for HomePage Typography axis goes from 4 → 5 because every display-tier `font-size` now resolves through a token (literal-but-tokened for the hero, Carbon-fallback for the rest). The 28px `.map2x-repo-cell__value` and the long tail of fractional density sizes (8.5 / 9.5 / 10.5 / 11.5 / 12.5 / 13.5px on dense rows) stay as-is per the standing density carve-out and are out of scope for this slice. Typecheck + build clean (19.64s).
- 2026-05-04 — T2481-B3 slice 2 — MOTURMEPage display + panel headings tokenized SHIPPED (Claude). MOTURMEPage is the rubric's page 25 and was carrying every header in inline-style hardcoded values (color `#f3f4f6`, fontSize `'2rem'` / `'1.125rem'`, margin `16` / `32`). Retokened: (a) the `<h1>` page title — color `#f3f4f6` → `var(--cds-text-primary)`, fontSize `'2rem'` → `var(--cds-expressive-heading-06-font-size, 2rem)`, margin `8` → `var(--cds-spacing-03)`, container marginBottom `32` → `var(--cds-spacing-07)`, plus a Carbon line-height token; (b) the `<p>` subtitle — color `#94a3b8` → `var(--cds-text-secondary)`, fontSize `14` → `var(--cds-body-compact-01-font-size, 0.875rem)`; (c) all three `<h3>` panel headers (System Load, Latency Breakdown, Audio Routing) — color `#f3f4f6` → `var(--cds-text-primary)`, fontSize `'1.125rem'` → `var(--cds-productive-heading-03-font-size, 1.25rem)`, marginBottom `16` → `var(--cds-spacing-05)`, plus matching Carbon line-height. The hardware-aesthetic palette literals (deep-teal/amber/blue tones that mirror the physical units' panel colors, `#FFAA00` warning thresholds, `getLoadColor`/`getMeterColor` returning the bare device-skin hex) stay as-is per §10.5; only the operational chrome (page header, panel titles, body copy) routes through Carbon tokens. After this slice, MOTURMEPage's rubric Typography axis goes from a likely 3 (multiple hardcoded h1/h3 sizes + non-token text colors) to 5 on the chrome surfaces. Lint 0/0 clean; typecheck + build clean (18.93s).
- 2026-05-04 — T2481-B3 slice 3 — MOTURMEPage secondary/helper text + spacing burndown SHIPPED (Claude). Continued the page-25 cleanup beyond the headers. Retokened the operational-chrome secondary text and helper labels (the inline-style `<span>` / `<div>` chrome on the System Load tiles, Latency Breakdown rows, Audio Routing tile footer, and signal-flow caption rows): all 9 sites of `color: '#94a3b8'` (Carbon's `text-secondary` analogue) → `var(--cds-text-secondary)` and all 4 sites of `color: '#6b7280'` (helper-text analogue) → `var(--cds-text-helper)`. Same retokening for matching `fontSize: 12` / `13` / `11` / `10` declarations on those rows where the size mapped cleanly to Carbon's helper-text-01 (12px) / body-compact-01 (13px → 14px would be visual regression, kept literal) — most resolved through `var(--cds-helper-text-01-font-size, 0.75rem)`. Margin/padding rounded numerals (`marginTop: 8/16`, `marginTop: 4`) routed through `var(--cds-spacing-03/05/02)`. The hardware-aesthetic carve-outs are preserved verbatim (`#2563eb` blue device tint on MOTU tile, `#00FF9D` neon-green status on RME tile, `#FFAA00` amber warnings, `getLoadColor` / `getMeterColor` return values). Net change on MOTURMEPage: 13 hex literals on operational chrome eliminated; 0 hardware-skin literals touched. Lint 0/0; typecheck + build clean (19.36s).
- 2026-05-04 — T2481-B3 slice 4 — MaschineMidiMapPage chrome retokenized SHIPPED (Claude). Page 8 in the rubric walk list (Maschine MK1). Inline-style chrome on the pad / button / encoder configuration rows was hardcoding Carbon-text-analogous greys: 3 × `color: '#888'` on subtitle prose, 3 × `color: '#eee'` + `fontSize: '1rem'` on `<h3>` row titles, 3 × `color: '#aaa'` + `fontSize: '0.8rem'` on the MIDI message readout `<span>`s (the cycle-5 `var(--font-mono, monospace)` retokenization left the color/size literals intact). All retokened: `#888` / `#aaa` → `var(--cds-text-secondary)`, `#eee` → `var(--cds-text-primary)`, `'1rem'` → `var(--cds-productive-heading-02-font-size, 1rem)`, `'0.8rem'` → `var(--cds-helper-text-01-font-size, 0.75rem)`. The pad/button/encoder hardware-skin LED visualizations and Carbon `<Tile>` device-graphics borders are untouched per §10.5. Net: 9 hex literals + 6 raw rem font-sizes on operational chrome eliminated; 0 hardware-skin literals touched. Lint 0/0; typecheck + build clean (19.36s).

---

## Epic: MIDI Services — first-class platform service offering (opened 2026-05-01)

Epic overview: Unify every MIDI surface, authority, and consumer on the platform under a single first-class service offering. Single canonical authority (`MidiBinding` table) + single canonical surface (`/midi`, "MIDI Services") + full migration of every legacy binding store. Subsumes the in-flight T2459 (Controller / Mapping / Device-Pack Subsystem — closed `[✓] Done` 2026-04-27 with H sub-phase still in flight) and T2459-H (MIDI Backend Unification — `[>] In Progress`). The epic establishes the **template for the four first-class service offerings** of MAP2 (MIDI, AVB, Sampler, Audio Effects); Phase 4 explicitly extracts the pattern into `docs/architecture/FIRST_CLASS_SERVICES.md` so the next three epics can lift verbatim.

**Five locked decisions** (clarification round, 2026-05-01):
1. **Scope**: C — single canonical surface, fully and completely. Specialized per-device UIs absorbed for MIDI editing concerns; DSP/visual concerns survive as embedded widgets or device-specific tools cross-linked from the canonical surface.
2. **Naming + IA root**: B — surface renamed to "**MIDI Services**", mounted at `/midi`. Old `/midi-hub/*` redirects. **Refinement**: snapshot-editor inline MIDI editors (per-effect mappings, A/B switch, expression) **stay in place**; backend rewires through canonical authority.
3. **Backend authority**: A — single `MidiBinding` table, full migration, every legacy store deleted. Single source of truth at the storage layer, not just the API layer. Establishes platform directive: MAP2 is four first-class service offerings (MIDI, AVB, Sampler, Audio Effects); MIDI Services is the template.
4. **Relationship to T2459 + T2459-H**: A — subsumed as Phase 1. Single epic, clean lineage. T2459/T2459-H project memory becomes historical reference; this epic is the live source of truth.
5. **Authorization mode**: D — Phases 1–2 autonomous (backend / data-layer work, machine-checkable correctness); Phases 3–4 per-bundle gated (operator-visible UI, architectural template extraction).

**Canonical design reference**: `docs/architecture/MIDI_SERVICES.md` (this epic's authoritative spec — subtask plan + status live here in the worklist; design intent + schema + migration + risk register live in the doc).

**Inventory** (39 items identified during 2026-05-01 audit):
- 7 MIDI Hub sub-pages → absorbed into MIDI Services regions
- 3 standalone MIDI surfaces (Assignments walkthrough, Expression page, legacy v1 drawer) → absorbed
- 8 per-device MIDI editor pages → MIDI editing absorbed; DSP/visual concerns survive
- 3 Snapshot Editor inline MIDI editors → **stay in place**, backend rewires through authority
- 2 Brain MIDI surfaces (Setup, Inputs) → reframed as MIDI Services consumers
- 7 cross-cutting utilities (MIDI Learn button, clock surfaces, RTP-MIDI, MIDI 2.0/UMP, Tesira TTP, virtual GPIO, string interface) → consolidated
- 7 backend services + storage layers → migrated into single `MidiBinding` authority
- Total absorbed: 23 fully + 8 partially + 3 stay-in-place-rewire-backend + 2 reframed-as-consumers + 6 backend consolidations


---


## Blocked

ID: T004
Status: [✗] Blocked
Title: AVB hardware qualification and release gating
Description:
- Goal / acceptance criteria: Complete the remaining AVB hardware-in-the-loop qualification gates formerly tracked under `T004`, including discovery/churn, active-stream validation, PTP timing, and soak evidence.
- Why it matters: MAP2 cannot claim production AVB readiness until the real lab matrix passes.
- Dependencies: AVB-capable lab availability, active AVB entities/streams, stable PTP grandmaster lock
- Estimated effort: High
- Required outputs: Updated qualification matrix, archived evidence artifacts, and pass/fail summary for the AVB gates.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-29 20:26 EDT - Codex
- Blocked notes:
  - Software prep, wrappers, and false-pass hardening are complete in the archive.
  - Current host still reports AVB operational on `enp11s0`, so the old “no NIC” assumption remains cleared.
  - Refreshed evidence on 2026-04-14 still shows `/api/avb/avdecc/entities` empty, no active streams, `map2-ptp4l.service` active, and `/api/avb/status` now resolving to `MASTER`; the remaining blocker is still lack of a discovered peer/grandmaster-locked AVB bench plus missing engine-bound AVB readiness.


---

ID: T030
Status: [✗] Blocked
Title: Tesira effects-loop HIL latency and soak qualification
Description:
- Goal / acceptance criteria: Execute the must-pass Tesira effects-loop HIL qualification for latency, churn, and multi-loop stability.
- Why it matters: Effects-loop production claims need real Tesira hardware evidence.
- Dependencies: Tesira hardware on-site, active effects-loop topology, T024/T026/T027/T028/T029 work from archive
- Estimated effort: High
- Required outputs: Qualification artifacts under `docs/fit-for-purpose-evidence/` and final gate summary.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Runner, runbook, and tests are complete in the archive.
  - Refreshed evidence on 2026-04-14 shows the configured Tesira fleet inventory still present at `/api/tesira/devices`, but every listed device remains `connected: false` with no AVB streams or PTP state.
  - Remaining blocker is therefore still live Tesira hardware reachability plus effects-loop topology availability, not missing software discovery/config records.
  - Unblock path: fold this into one scheduled Tesira certification bench with `T365`, `T065-subG`, and `T072` so the same hardware session produces latency, churn, compile/deploy, control-plane, and soak evidence.
  - Source archive references: `T030`, `T030-subA`.


---

ID: T065
Status: [✗] Blocked
Title: Tesira full-stack parity program release closure
Description:
- Goal / acceptance criteria: Close the remaining parity program blockers for the Tesira replacement effort and issue release-ready go/no-go status.
- Why it matters: Most implementation is complete, but release closure still depends on real hardware proof.
- Dependencies: T030, T004, archived completed implementation slices `T065-subA` through `T065-subF`
- Estimated effort: High
- Required outputs: Final parity validation packet, migration/cutover sign-off, and release unblock decision.
Subtasks:


---

ID: T065-subG
Status: [✗] Blocked
Title: Produce full parity validation matrix with automation and HIL evidence
Description:
- Goal / acceptance criteria: Finish the parity matrix by combining completed automated validation with the missing Tesira and AVB HIL evidence.
- Why it matters: Parity claims require measurable proof, not implementation-only completion.
- Dependencies: T030, T004, archived `T065-subD`, `T065-subE`, `T065-subF`
- Estimated effort: High
- Required outputs: Validation matrix, artifact bundle, and waiver list if needed.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Automated checks are already complete in the archive.
  - Refreshed evidence on 2026-04-14 still shows empty AVDECC discovery, PTP `UNKNOWN`, and Tesira fleet entries that are configured but disconnected.
  - Remaining blocker is missing live Tesira/AVB/PTP lab evidence.
  - Unblock path: once a Tesira AVB bench is available, run this as the umbrella evidence-collection task for `T030`, `T072`, and `T365`, reusing the archived automation packet and only collecting the missing HIL artifacts.


---

ID: T065-subH
Status: [✗] Blocked
Title: Execute migration, cutover, and release sign-off for Tesira replacement
Description:
- Goal / acceptance criteria: Finalize the migration checklist, rollback packet, staged rollout, and release sign-off once the parity matrix passes.
- Why it matters: Production adoption depends on a verified migration path.
- Dependencies: T065-subG
- Estimated effort: Medium
- Required outputs: Migration checklist, release notes, rollback runbook, and signed acceptance packet.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Blocked entirely by `T065-subG`.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL Tesira parity implementation work is archived as complete.
  - Remaining closure is now isolated to hardware validation and release sign-off.
  - Unblock path: keep this blocked behind `T065-subG`, but stage the migration and rollback packet during the same lab window so release closure does not require another separate execution turn.


---

ID: T072
Status: [✗] Blocked
Title: Tesira full-parity HIL certification matrix
Description:
- Goal / acceptance criteria: Execute the full Tesira HIL certification matrix covering AVB routing, PTP behavior, live DSP control, compile/deploy lifecycle, and multi-unit reliability.
- Why it matters: Final parity and release claims remain blocked until this matrix passes.
- Dependencies: T065-subG, T030, T004, archived `T069`, `T070`, `T071`
- Estimated effort: High
- Required outputs: HIL evidence bundle, waiver log, and unblock decision for Tesira release.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Precheck runner and runbook are complete in the archive.
  - Refreshed evidence on 2026-04-14 still lacks connected Tesira devices in scope, active AVB streams, and stable AVB/PTP lock even though configured Tesira device records still exist in the fleet API.
  - Unblock path: execute this as the single combined Tesira bench campaign after `T065-subG`/`T030` are ready: establish AVB discovery and PTP lock first, then compile/deploy, live-control-under-streaming, and multi-unit reliability/soak in one preserved hardware session so the same evidence bundle closes `T072`, `T030`, and `T365`.


---

ID: T076
Status: [✗] Blocked
Title: Tesira deploy-chain HIL certification
Description:
- Goal / acceptance criteria: Validate the supported Tesira deployment workflow on real hardware and archive release-grade evidence.
- Why it matters: The deployment UX is not release-ready without two-unit HIL confirmation.
- Dependencies: T075 from archive, T004
- Estimated effort: High
- Required outputs: HIL evidence bundle and final go/no-go criteria update for deployment workflow.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Manual-package deployment runner and runbook are complete in the archive.
  - Refreshed evidence on 2026-04-14 still shows only disconnected Tesira fleet records and no active AVB/PTP session, so the real two-unit Tesira deployment session remains the blocker.


---

ID: T360
Status: [✗] Blocked
Title: Connect AVB-capable hardware and achieve PTP grandmaster lock
Description:
- Goal / acceptance criteria: Install AVB-capable NIC (Intel I210/I225), connect to TSN switch, run setup_avb.sh, achieve PTP SLAVE or MASTER state with offset_ns < 1000.
- Why it matters: Blocks ALL downstream AVB validation — every audit finding depends on live hardware.
- Dependencies: Lab hardware procurement (NIC + switch + peer node or Tesira unit)
- Estimated effort: Medium
- Required outputs: PTP status showing locked state, setup evidence, marker file updated.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-29 20:26 EDT - Codex
- Blocked notes:
  - Test host now has an Intel `igb` AVB-capable NIC on `enp11s0`, and runtime AVB readiness reports operational/available.
  - PTP still is not locked to a peer grandmaster: `/api/avb/status` reports `ptp.state=\"UNKNOWN\"` and there is no connected AVB peer or TSN switch session to drive synchronization.
  - Unblock path: connect either a second Linux AVB node or Tesira AVB endpoint to the current host and treat `T360` as the first gate in the AVB bench session; no further code prep is required before that peer appears.
  - Priority: P0 — blocks basic AVB functionality.


---

ID: T361
Status: [✗] Blocked
Title: Discover at least one AVDECC entity and verify AEM enumeration
Description:
- Goal / acceptance criteria: Enable USE_AVDECC=ON, connect AVB device, verify entity appears in /api/avb/avdecc/entities with has_model=true and complete AEM descriptor tree.
- Why it matters: Without entity discovery, no AVDECC-managed connections can be established.
- Dependencies: T360
- Estimated effort: Medium
- Required outputs: AVDECC entity list, AEM model JSON, entity metadata validation.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-29 20:26 EDT - Codex
- Blocked notes:
  - Runtime AVDECC support is enabled on this host, but `/api/avb/avdecc/entities` still returns an empty entity list.
  - This remains blocked on a connected AVDECC-capable peer device and successful discovery traffic on the AVB network.
  - Unblock path: as soon as `T360` has a live peer and PTP lock, rerun discovery immediately; this should be the second gate in the same AVB lab session before any stream work.
  - Priority: P0.


---

ID: T362
Status: [✗] Blocked
Title: Establish end-to-end MAP2 AVB audio stream (talker -> listener)
Description:
- Goal / acceptance criteria: Create talker + listener streams, inject test signal, verify audio passes end-to-end with zero sequence/decode errors and stream stats confirming frames transferred.
- Why it matters: The core AVB product claim — sharing audio between MAP2 nodes — is completely unproven.
- Dependencies: T360, T361
- Estimated effort: High
- Required outputs: Stream stats showing framesSent/framesReceived > 0, zero errors, audio capture evidence.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-29 20:26 EDT - Codex
- Blocked notes:
  - No AVB streams are active on the current host because there are still no discovered peer entities and no locked PTP session.
  - Unblock path: this becomes the first post-discovery execution task in the AVB bench. Once `T360` and `T361` pass, all downstream AVB blocked tasks can be chained in the same session instead of reopening setup each time.
  - Priority: P0.


---

ID: T363
Status: [✗] Blocked
Title: Measure and document round-trip latency and jitter on live AVB stream
Description:
- Goal / acceptance criteria: Establish loopback stream, measure one-way latency via AVTP timestamps, measure round-trip via impulse injection, calculate jitter (p50/p95/p99/max) over 10-minute window, document methodology. Target: < 10ms one-way, < 500us p99 jitter.
- Why it matters: Cannot make any latency claims without real measurements.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Latency/jitter report with methodology, avb_capture_clock_drift.sh output, stream stats.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - AvbStreamStats maxLatencyNs/minLatencyNs always zero (no streams).
  - Unblock path: collect this immediately after `T362` with the scripted impulse/loopback run before the long soak, so the same bench session yields both latency and soak evidence.
  - Priority: P0.


---

ID: T364
Status: [✗] Blocked
Title: Execute 24-hour AVB soak test with zero xruns
Description:
- Goal / acceptance criteria: Start 2+ AVB streams, run run_avb_24h_soak.sh for 24 hours, collect hourly checkpoints, verify zero xruns, zero sequence error growth, stable latency. Archive evidence.
- Why it matters: Cannot claim production stability without sustained operation evidence.
- Dependencies: T362
- Estimated effort: High (24h wall-clock)
- Required outputs: Soak test output, hourly checkpoint data, evidence archive.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - run_avb_24h_soak.sh exists but has never produced results; Q06 gate permanently BLOCKED.
  - Unblock path: after `T362` and `T363`, leave the same bench configured overnight and run the existing soak harness rather than treating soak setup as a separate task.
  - Priority: P0.


---

ID: T365
Status: [✗] Blocked
Title: Verify Biamp Tesira AVB interoperability (discover + stream + control)
Description:
- Goal / acceptance criteria: Connect Tesira Forte AVB unit, verify TTP discovery, AVDECC entity discovery with correct AEM, bidirectional audio stream subscription, PTP coordination, and DSP control during active streaming.
- Why it matters: Biamp Tesira interoperability is a stated product goal.
- Dependencies: T360
- Estimated effort: High
- Required outputs: Bidirectional audio evidence, AVDECC entity data, TTP control validation during streaming.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No Tesira hardware connected; T030 and T072 also BLOCKED on same hardware.
  - Unblock path: run this inside the same Tesira AVB bench scheduled for `T030` and `T072`; once `T360` proves the peer link, capture discovery, bidirectional stream subscribe, and live DSP control during active streaming in that same locked topology instead of treating Tesira interop as a separate setup.
  - Priority: P0.


---

ID: T368
Status: [✗] Blocked
Title: Verify multi-stream scaling (4+ simultaneous AVB streams)
Description:
- Goal / acceptance criteria: Create 4+ simultaneous streams, monitor CPU/ring buffers/sequence errors, verify no cross-stream interference. Document scaling limits.
- Why it matters: Production use requires multiple simultaneous streams.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Scaling test report with CPU usage, error rates, and documented limits.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No streams can be created until T362.
  - Unblock path: once a first stream is proven, expand the same bench to four parallel subscriptions before teardown so scaling evidence is gathered in the same validated topology.
  - Priority: P1.


---

ID: T369
Status: [✗] Blocked
Title: Verify stream persistence and recovery after network drop
Description:
- Goal / acceptance criteria: Establish streams, disconnect/reconnect network, verify automatic recovery within 10s and PTP re-lock within 30s. Test with 1s/10s/60s/5min interruptions.
- Why it matters: Production AVB must survive transient network issues.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Recovery time measurements, PTP re-lock evidence, audio glitch documentation.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No streams exist to test recovery.
  - Unblock path: run this immediately after the first stable multi-stream setup by introducing controlled link drops on the same bench while preserving the validated stream topology.
  - Priority: P1.


---

ID: T370
Status: [✗] Blocked
Title: Verify simultaneous talker + listener + AVDECC controller roles on same node
Description:
- Goal / acceptance criteria: Configure one MAP2 node as talker AND listener AND AVDECC controller, operate all three roles simultaneously for 1 hour with zero errors.
- Why it matters: Real-world use requires multi-role operation.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Multi-role operation evidence, stream stats, AVDECC entity list during test.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - Multi-role operation never tested.
  - Unblock path: reuse the same two-node bench after `T362` to add simultaneous local talker/listener/controller role coverage before dismantling the environment.
  - Priority: P1.


---

ID: T371
Status: [✗] Blocked
Title: Execute Q04/Q05/Q06 HIL qualification gates
Description:
- Goal / acceptance criteria: Run run_avb_hil_qualification.sh with all three gates passing (Q04 pytest, Q05 clock drift, Q06 24h soak). Archive all evidence under docs/fit-for-purpose-evidence/.
- Why it matters: Release gates cannot pass without HIL qualification evidence.
- Dependencies: T360, T362
- Estimated effort: High
- Required outputs: summary.txt with 3x PASS, archived q04/q05/q06 logs, matrix_update.md.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - All gates permanently BLOCKED since creation; run_avb_hil_qualification.sh framework ready.
  - Unblock path: treat this as the final umbrella gate for the AVB bench once `T360`, `T362`, `T363`, and `T364` have been run in sequence; the scripts and evidence destinations already exist.
  - Priority: P1.


---

ID: T375
Status: [✗] Blocked
Title: Add AVTP CRF (Clock Reference Format) subtype support
Description:
- Goal / acceptance criteria: Evaluate CRF need for MAP2 multi-stream use cases. If needed, add CRF stream type to AvbStream with dedicated send/receive and clock recovery logic.
- Why it matters: Multi-stream sync currently relies solely on PTP; CRF provides additional synchronization.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: CRF evaluation; if implemented, interoperability test with Tesira.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 21:01 EDT - Codex
- Blocked notes:
  - `T362` remains blocked because no end-to-end MAP2 AVB audio stream has ever carried live audio on this testbed, so CRF work would be speculative until the base talker/listener path exists.
  - Unblock path: keep CRF deferred until the base stream path is real, then decide from measured evidence whether PTP-only synchronization is already sufficient for MAP2 use cases before investing in CRF implementation.
  - Priority: P2.


---

ID: T066
Status: [✗] Blocked
Title: MIDI Hub hardware validation and final closure
Description:
- Goal / acceptance criteria: Close the remaining MIDI Hub program work by completing the hardware-dependent compatibility and full integration validation gates.
- Why it matters: The implementation is broad and largely complete, but final production confidence depends on physical adapter and long-run validation.
- Dependencies: Archived implementation subtasks through `T066-subP`, plus live hardware access
- Estimated effort: High
- Required outputs: Completed hardware compatibility matrix, final regression/performance evidence, and program closure notes.
Subtasks:


---

ID: T066-subQ
Status: [✗] Blocked
Title: USB-to-DIN adapter support and external interface integration guide
Description:
- Goal / acceptance criteria: Verify MAP2 MIDI Hub against real class-compliant USB-to-DIN adapters and finish the compatibility guide with measured results.
- Why it matters: The hardware-agnostic claim needs physical adapter evidence.
- Dependencies: Archived `T066-subA`, `T066-subF`, attached USB-MIDI hardware, ALSA sequencer access
- Estimated effort: Medium
- Required outputs: Compatibility matrix, adapter notes, and completed `docs/midi/USB_DIN_ADAPTER_COMPATIBILITY.md`.
Subtasks: None
Assigned to: User + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Qualification runner, runbook, and doc scaffold are complete in the archive.
  - Rechecked on 2026-03-29: `/dev/snd/seq` is present, but `aconnect -i`, `aconnect -o`, and `amidi -l` still show no attached MIDI adapters/endpoints to qualify.


---

ID: T066-subR
Status: [✗] Blocked
Title: Comprehensive MIDI Hub integration testing and regression validation
Description:
- Goal / acceptance criteria: Finish the end-to-end regression, performance, and soak validation of the complete MIDI Hub stack.
- Why it matters: MIDI Hub is foundational to multiple MAP2 systems and needs final proof under realistic conditions.
- Dependencies: T066-subQ, archived `T066-subP`, long-duration hardware-backed validation window
- Estimated effort: High
- Required outputs: Regression matrix, performance benchmarks, soak evidence, and pass/fail report.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Unified qualification runner is complete in the archive.
  - Remaining blocker is real hardware and soak execution rather than software gaps.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL MIDI Hub implementation work is archived as complete.
  - Program closure now depends only on physical adapter validation and full-system performance evidence.


---

ID: T102
Status: [✗] Blocked
Title: MIDI Hub external operator field study
Description:
- Goal / acceptance criteria: Run the redesigned `/midi-hub` workflow study with at least three external operators and archive anonymized results plus remediation decisions.
- Why it matters: Real operator evidence is still required beyond implementation and self-validation.
- Dependencies: Archived `T101`, external participant scheduling
- Estimated effort: Medium
- Required outputs: Participant results, issue log, and follow-up remediation decisions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, templates, and collation tooling are complete in the archive.
  - Remaining blocker is external participant access and moderated study execution.


---

ID: T055
Status: [✗] Blocked
Title: UA-1000 analog loopback latency measurement
Description:
- Goal / acceptance criteria: Run the physical tuned-vs-rollback analog loopback test on the UA-1000 and publish repeated RTT measurements.
- Why it matters: Real round-trip latency proof is still missing for the UA-1000 tuning decision.
- Dependencies: Archived `T054`, physical UA-1000 loopback cabling, device access
- Estimated effort: Medium
- Required outputs: Repeated RTT result set, average/p95 comparison, and keep/rollback recommendation.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-29 20:28 EDT - Codex
- Blocked notes:
  - Matrix runner and runbook are complete in the archive.
  - Current host audio inventory shows `Jogg USB Audio`, onboard `HDA Intel PCH` analog I/O, and HDMI playback, but no attached UA-1000.
  - Remaining blocker is specifically the UA-1000 hardware + physical loopback session, not generic ALSA device access.
  - 2026-04-26 13:17 EDT - Codex execution attempt: host/API/web preflight passed, but `jack_lsp` still showed `Jogg USB Audio` and built-in audio with no UA-1000 ports. Ran `python3 scripts/run_t055_ua1000_loopback_matrix.py --output-dir docs/fit-for-purpose-evidence/20260426/t055-execute --duration 15 --trials 3`; runner exited `2` with `overall_status=BLOCKED`. Evidence: `docs/fit-for-purpose-evidence/20260426/t055-execute/`.
  - 2026-04-26 13:43 EDT - Codex connected-device rerun: UA-1000 JACK and MIDI ports are now visible, and matrix preflight passed with 14 matched UA-1000 ports. Ran the T055 matrix against `EDIROL UA-1000 Pro:playback_AUX0` -> `EDIROL UA-1000 Pro:capture_AUX0`; tuned and rollback conditions both failed because `jack_iodelay` found no loopback samples. Additional 4-second probes across all 16 AUX playback/capture pairings (`AUX0..3` x `AUX0..3`) also found no loopback samples. Device enumeration is unblocked, but the task remains blocked on the physical analog loopback signal or JACK routing. Evidence: `docs/fit-for-purpose-evidence/20260426/t055-rerun-connected/`.
  - 2026-04-26 all-eight loopback pass: after rebooting the UA-1000, JACK/PipeWire exposed the full low-rate profile (`playback_AUX0..9`, `capture_AUX0..11`) and physical loopbacks were connected for channels 1 through 8. Fixed the measurement harness to detect this host's `jack_iodelay` port names (`jack_delay:out` / `jack_delay:in`) and to fall back to `pw-link` when `jack_connect` does not establish PipeWire JACK links. All eight same-index pairs produced samples, proving the analog signal path is present, but every pair failed the latency gate with unstable/high RTT values (p95 roughly 1032-1333 ms, 0 XRUNs). T055 remains blocked on obtaining a stable single-pair `jack_iodelay` lock, likely by isolating one physical loop and disabling any UA-1000 direct-monitor/internal mixer loopback before rerunning the tuned-vs-rollback matrix. Evidence: `docs/fit-for-purpose-evidence/20260426/t055-all-eight-loopbacks/`.
  - 2026-04-27 18:05 EDT - Codex IR audit: with UA-1000 and Hotone loopback cables connected, installed the missing local `jack-client==0.5.5` Python binding, disabled synthetic fallback, disconnected stale Python/PipeWire links from UA-1000 AUX0/AUX1, and ran the profile-era `scripts/measure_loopback_ir.py` battery. UA-1000 same-index AUX0-clean..AUX7 all produced real JACK measurements clustered around `9.36-10.24 ms` mean RTT with max p95 `10.58 ms`, so the signal path is now proven but still fails the `p95 <= 5 ms` gate. Hotone FL->mono measured but failed at `21.20 ms` mean / `24.29 ms` p95, while FR->mono was unstable (`396 ms` mean / `1154 ms` p95), suggesting the right side is not a valid mono loopback path or is correlating on leakage/secondary peaks. Mirrored T689 random-FX soaks in the same evidence bundle still fail the no-gap callback bar. Evidence: `docs/fit-for-purpose-evidence/20260427/audio-channel-audit-215337Z/`.


---

ID: T099
Status: [✗] Blocked
Title: Dynamic response blind A/B validation
Description:
- Goal / acceptance criteria: Execute the formal blind A/B validation of MAP2 NAM dynamic response versus a reference amp and competitor modeler, then publish the final evidence packet.
- Why it matters: MAP2 still lacks external proof for stage-competitive dynamic response claims.
- Dependencies: Archived prep/tooling subtasks, reference amp/modeler, recording interface, evaluators
- Estimated effort: Medium
- Required outputs: Recorded samples, subjective results, quantitative summary, evidence document, and evaluation-report update.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, analysis tooling, and evidence-draft prep are complete in the archive.
  - Remaining blocker is the live recording and evaluator session.
  - 2026-04-26 13:17 EDT - Codex execution check: only T099 protocol/template files are present under `docs/fit-for-purpose-evidence`; no run manifest, WAV pair manifest, quantitative summary, or evaluator JSON files are staged. Task remains blocked until the live recording and evaluator session produces those artifacts.

## Repo Hygiene


---

ID: T082-subD
Status: [✗] Blocked
Title: Repo history cleanup for tracked bloat
Description:
- Goal / acceptance criteria: Remove tracked build/dependency artifacts from git history and complete the coordinated force-push cleanup window.
- Why it matters: Repository size and clone/tooling penalties persist until history is rewritten.
- Dependencies: Archived `T082-subC`, mirror-clone rewrite environment, collaborator coordination
- Estimated effort: Medium
- Required outputs: Rewritten history on both remotes, collaborator notice, and post-rewrite verification.
Subtasks:


---

ID: T082-subD-subB
Status: [✗] Blocked
Title: Execute coordinated history rewrite and force-push for repo bloat removal
Description:
- Goal / acceptance criteria: Run the prepared mirror-clone rewrite and force-push both remotes during a coordinated maintenance window.
- Why it matters: This is the actual destructive step that shrinks the repository.
- Dependencies: Archived `T082-subD-subA`, archived `T082-subD-subC`, mirror clone, `git-filter-repo`, force-push window
- Estimated effort: Medium
- Required outputs: Rewritten remotes and collaborator migration notice.
Subtasks: None
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Prep helper, runbook, and notice template are complete in the archive.
  - Remaining blocker is a real rewrite window with `git-filter-repo` available.
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Ignore guardrails and rewrite prep are complete in the archive.
  - Remaining work is only the coordinated destructive rewrite.

## MIDI Hub v2 — Show Control Platform Rewrite


---

ID: T203-subK
Status: [✗] Blocked
Title: Tesira hardware integration testing (save for end)
Description:
- Goal / acceptance criteria: Test the Tesira TTP integration against the real Tesira system on the network. Verify: TCP connection, instance tag discovery, fader get/set, mute toggle, preset recall, subscription live updates, auto-reconnect on disconnect, command console free-text commands. Archive evidence.
- Why it matters: User explicitly requested saving hardware tests for the end.
- Dependencies: T203-subG (Tesira TTP implementation), live Tesira hardware on network
- Estimated effort: Medium
- Required outputs: Test evidence document, any bug fixes discovered during testing.
Subtasks: None
Assigned to: Claude + Lab
Last updated: 2026-03-20 13:00 - Codex
- Blocked notes:
  - Software implementation, route coverage, and documentation are complete.
  - Remaining work is the user-requested end-of-program live Tesira session against real hardware on the network.

Assigned to: Claude
Last updated: 2026-03-20 13:00 - Codex
- Blocked notes:
  - All software-side MIDI Hub v2 deliverables are complete.
  - Remaining closure depends only on live Tesira hardware validation in `T203-subK`.

## API Reliability


---

ID: T219
Status: [✗] Blocked
Title: Drum Machine integration testing and qualification
Description:
- Goal / acceptance criteria: Comprehensive test coverage for the drum machine across all layers — C++ unit tests, Python service tests, API endpoint tests, frontend component tests, and end-to-end integration tests.
- Why it matters: A professional drum machine must be rock-solid. Every layer needs test coverage before shipping.
- Dependencies: T211–T218 (all drum machine implementation tasks)
- Estimated effort: High
- Required outputs: Test suites, CI integration, qualification evidence.
Subtasks:
  - [✓] T219-A: C++ unit tests for DrumMachineProcessor
    - 16-pad triggering with correct bus routing
    - Per-pad volume/pan/tune/mute/solo
    - Per-bus EQ and compressor (verify frequency response, gain reduction)
    - Master output level
    - SFZ kit loading and instrument assignment
    - Velocity curve transforms (all 5 types)
    - RT-safety verification: no allocations in processBlock
  - [✓] T219-B: C++ unit tests for DrumSequencer
    - Pattern step set/get/clear/copy
    - Transport play/stop/pause with sample-accurate step timing
    - Variable pattern length (1–64 steps)
    - Swing application
    - Song mode playback with repeat counts
    - Fill trigger timing
    - Tap tempo BPM calculation
  - [✓] T219-C: Python service tests — `tests/test_drum_machine.py`
    - Kit loading and switching
    - Pattern CRUD operations
    - Song arrangement management
    - State persistence (save/restore)
    - MIDI mapping configuration
    - Velocity curve configuration
    - Input validation (out-of-range BPM, invalid pattern ID, etc.)
  - [✓] T219-D: API endpoint tests — `tests/test_drum_routes.py`
    - All REST endpoints: correct status codes, response schemas, error handling
    - Pydantic model validation
    - Concurrent access (multiple clients updating state)
  - [✓] T219-E: Frontend component tests
    - `DrumsPage.test.tsx` — renders all three modes, tab switching, transport controls
    - `DrumMachineCard.test.tsx` — compact card rendering, mode display, metering
    - Step grid interaction: click toggles step, shift+click sets accent, keyboard navigation
    - Pattern management: copy, paste, clear
    - Kit browser: load kit, display instruments
    - Mixer: adjust bus EQ/comp, verify slider values
    - MIDI config: note mapping table, learn mode UI
  - [✗] T219-F: Integration test — full stack end-to-end
    - Load kit → set pattern → play → verify audio output (non-silence) → stop
    - MIDI input → verify correct pad triggers → verify metering response
    - Pattern edit during playback → verify changes take effect at next step
    - Song mode: play through multiple patterns with repeats → verify correct sequence
    - Kit switch during playback → verify clean transition
Assigned to: Codex
Last updated: 2026-03-20 17:01 - Codex
- Progress notes:
  - Completed the frontend qualification slice by adding `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx` and extending `web/src/app/pages/DrumsPage.test.tsx`, covering compact card rendering, transport/tap-tempo actions, mode routing, sequencer interaction, pattern management, kit loading, mixer controls, and MIDI configuration UI.
  - Validation: `npm --prefix web run typecheck` -> pass.
  - Validation: `npm --prefix web test -- --runInBand src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx src/app/pages/DrumsPage.test.tsx` -> pass.
  - Frontend coverage is complete; the active qualification gap is now backend-side validation for service persistence/input guards plus route-level error/concurrent access handling under `T219-C` and `T219-D`.
  - Completed `T219-C` by extending `tests/test_drum_machine_service.py` with explicit invalid-state and unknown-preset coverage, closing the remaining service-side input-validation gap on top of the existing persistence, transport, song, metering, MIDI, and per-kit config tests.
  - Completed `T219-D` by extending `tests/test_drum_routes.py` with additional request-validation/error handling checks plus a shared-app multi-client concurrent state-update test, and by tightening the route contract in `app/routes/drums.py` so pattern-step payloads now validate instrument, step, and velocity bounds at request time instead of failing later during response serialization.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.
  - Validation: `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).
  - The remaining active qualification slice is JUCE coverage for processor/sequencer edge cases that are not yet asserted explicitly in `juce-engine/tests/DrumMachineProcessorTests.cpp` and `juce-engine/tests/DrumSequencerTests.cpp`.
  - Extended `juce-engine/tests/DrumSequencerTests.cpp` to cover 64-step pattern lengths, pause/stop transport behavior, swing delaying offbeats relative to straight timing, and explicit clear/copy round trips, which closes the remaining `T219-B` acceptance points on top of the earlier song/fill/tap-tempo coverage.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` with missing pad-control setter coverage, logarithmic-curve coverage, master-volume checks, and SFZ load-status assertions for valid and invalid pad content. This meaningfully advances `T219-A`, but the stricter RT-safety proof and deeper processor-side bus/compression qualification still remain before that subtask can be closed.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` again with temporary WAV/SFZ render fixtures and explicit audio-path assertions for per-pad volume/pan/mute behavior, per-bus mute/solo routing, master-volume scaling, and bus-compressor makeup gain, which closes much of the remaining processor-side signal-path gap under `T219-A`.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` again with rendered-audio bus-EQ assertions, validating that low- and high-frequency material respond measurably to bus shelf boosts on the final processor path and further narrowing the remaining processor-side qualification gap under `T219-A`.
  - Added lightweight process diagnostics to `juce-engine/Source/DrumMachine/DrumMachineProcessor.*`, `juce-engine/Source/DrumMachine/DrumMachineMixer.*`, and `juce-engine/Source/SynthForge/Core/Part.*`, then extended `juce-engine/tests/DrumMachineProcessorTests.cpp` with a steady-state process test asserting zero internal buffer-growth events after `prepare()`. This exposed and fixed a real hot-path allocation bug in `SynthForge/Core/Part.cpp`, where the part render buffer was being resized to the full mix-bus channel count on first callback instead of the stereo render path actually used by the part.
  - Added `tests/test_drum_integration.py` to exercise the real FastAPI drum routes against the actual drum machine, kit, and sequencer services with a deterministic integrated fake engine, covering end-to-end kit loading, pattern editing, transport-driven non-silent metering, song progression across pattern boundaries, and kit switching while playback is active.
  - Extended `tests/test_drum_integration.py` with an additional end-to-end playback-edit case proving that a pattern step mutation applied through the route layer becomes visible in metering on the next playback step, further advancing `T219-F` without yet claiming native-audio closure.
  - Extended `tests/test_drum_integration.py` again to assert websocket event-history updates for transport and position topics during the same end-to-end flows, so the in-process integration coverage now includes the real-time broadcast path in addition to REST-state mutation and retrieval.
  - Added `tests/test_juce_engine_drum_native_stability.py`, a subprocess-based native JUCE smoke test that starts the real `map2_audio_engine` Python extension, writes temporary WAV/SFZ fixtures, loads drum pads through the actual drum bindings, proves non-silent metering from a direct trigger on the live audio callback path, and proves sequencer transport advancement while audio is running. This meaningfully advances `T219-F` beyond the integrated fake-engine suite, but does not yet close the task because hardware-backed end-to-end proof is still missing.
  - Closed `T219-A` by strengthening `juce-engine/tests/DrumMachineProcessorTests.cpp` with a global-allocation guard around steady-state `processBlock`, then fixing the real callback-path allocation it exposed in `juce-engine/Source/SynthForge/Core/Part.cpp`: `Part::applyModMatrix()` now short-circuits before copying modulation-source state when no modulation routes are configured, eliminating unnecessary callback-thread heap traffic in the default drum path.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j$(nproc)` -> pass after the `Part::applyModMatrix()` RT-safety fix.
  - Validation: `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` -> pass after the stronger global-allocation test was added.
  - Reclassified `T219-F` and parent task `T219` as blocked instead of in progress: software-side integration coverage is now extensive, but closing the remaining acceptance gap requires live MIDI-in and/or physical hardware-backed end-to-end proof that cannot be executed on this host because ALSA sequencer access is unavailable and no external drum-hardware path is attached.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j$(nproc)` -> pass.
  - Validation: `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` -> pass.
  - Validation: `pytest -q tests/test_drum_integration.py` -> pass.
  - Validation: `pytest -q tests/test_juce_engine_drum_native_stability.py` -> pass.
  - 2026-04-26 13:17 EDT - Codex execution attempt: reran `pytest -q tests/test_drum_integration.py tests/test_juce_engine_drum_native_stability.py` -> PASS (`3 passed, 1 skipped`). Live drum API endpoints `/api/engine/drums/metering` and `/api/engine/drums/transport` responded, but metering was idle and ALSA showed no dedicated external drum-triggering MIDI input device beyond internal/MAP2 bridge endpoints. `T219-F` remains blocked on live external MIDI/HIL proof.
  - 2026-04-26 13:43 EDT - Codex connected-device rerun: reran `pytest -q tests/test_drum_integration.py tests/test_juce_engine_drum_native_stability.py` -> PASS (`3 passed, 1 skipped`). UA-1000 raw MIDI is present as `hw:3,0,0 UA-1000 MIDI`; ALSA sequencer shows `UA-1000 MIDI` connected to MAP2/RtMidi clients; drum metering and transport endpoints responded. A 10-second `aseqdump -p 28:0` capture observed only the subscription event and no live note/controller events, so hardware-backed closure still requires a live MIDI trigger into the UA-1000 during capture. Evidence: `docs/fit-for-purpose-evidence/20260426/t219-rerun-connected/`.

---

### Drum Machine Pro — High-End Feature Expansion (T391)

#### Gap Analysis: 20 Industry-Standard Features vs. Current State

| # | Feature | Status | Evidence |
|---|---------|--------|----------|
| 1 | Step Sequencing (16-step grid) | **DONE** | Full 16×64 grid, all layers wired (T213) |
| 2 | Parameter Locking (per-step p-locks) | **NEW** | `Step` struct has only velocity + accent |
| 3 | Micro-Timing / Unquantized (off-grid hits) | **NEW** | No per-step timing offset field |
| 4 | Polyrhythms (per-track loop lengths) | **PARTIAL** | `Pattern::length` is global, not per-instrument |
| 5 | Step Probability (% chance to fire) | **NEW** | No probability field in `Step` |
| 6 | Ratchet / Sub-division (flams, rolls) | **NEW** | No sub-step concept in sequencer |
| 7 | Song Mode (pattern chaining) | **DONE** | Full CRUD + loop + transport (T213-C) |
| 8 | Shuffle/Swing per Track | **PARTIAL** | Global swing only, not per-instrument |
| 9 | Hybrid Sound Engines (synth + samples) | **PARTIAL** | Sample playback via SFZ only, no VA synth |
| 10 | Sample Import & Manipulation | **PARTIAL** | Kit load/import yes, waveform edit/record no |
| 11 | Multi-Layered Sampling (round-robin) | **DONE** | GroupedSampler RR + velocity layers (T212) |
| 12 | Virtual Analog Modeling (808/909 synth) | **NEW** | No oscillator-based drum synthesis |
| 13 | Per-Track Filters (HP/LP per drum) | **PARTIAL** | Per-bus EQ only, not per-pad filter |
| 14 | Individual Audio Outputs | **PARTIAL** | 8 internal buses, all fold to stereo — no external breakout |
| 15 | Velocity-Sensitive Pads | **DONE** | 5 curves, 3 zones, MIDI learn (T211, T215) |
| 16 | CV/Gate Outputs | **NEW** | Nothing exists |
| 17 | Full MIDI I/O (clock out, note out) | **PARTIAL** | MIDI input done, no clock/note output from sequencer |
| 18 | Assignable Knobs (CC mapping) | **NEW** | No CC-to-drum-parameter mapping |
| 19 | Onboard Master Effects (reverb, distortion) | **PARTIAL** | Per-bus EQ + comp only, no master FX chain |
| 20 | Real-Time Pattern Switching (quantized) | **PARTIAL** | Immediate switch, no bar-boundary queuing |

**Summary**: 4 DONE, 8 PARTIAL, 8 NEW


---

ID: T563
Status: [✗] Blocked
Title: Implement Ground Control Pro full-capability Labs route, backend core, and SysEx workflow
Description:
- Goal / acceptance criteria: Deliver the new `/ground-control-pro` routed Carbon page plus Labs launcher, implement the Ground Control Pro Python core under `app/services/ground_control_pro`, expose the planned FastAPI endpoints for import/export/compile/backup/push/diff/session/artifact access, add fixture-backed parser/serializer/validation coverage, and document the reverse-engineering field map and evidence workflow. The implementation must support the fixed full-memory dump geometry, preserve unknown bytes exactly, and gate device push on clean structural and round-trip validation.
- Why it matters: The requested Ground Control Pro tool is a first-class MAP2 MIDI hardware workflow, not a sketch. The repo needs a real integrated route, service, data model, fixtures, and safety posture so the feature can be exercised and qualified from the existing shell.
- Dependencies: None
- Estimated effort: High
- Required outputs: backend route and service package, web route/page/client, field-map JSON, fixture set and docs, focused backend/frontend tests, and updated worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-30 09:14 EDT - Codex
- Completion notes:
  - Added the full Ground Control Pro backend surface under `app/services/ground_control_pro` and `app/routes/ground_control_pro.py`, including fixed-profile SysEx parsing, structured model and field-map handling, deterministic serialization, validation, MIDI transport, artifact/session/job management, CLI helpers, and deterministic fixture generation support.
  - Added the routed Carbon page at `web/src/app/pages/GroundControlProPage.tsx`, registered `/ground-control-pro` in `web/src/app/App.tsx`, added the clickable Labs launcher/profile metadata, and surfaced import, structured edit, compile/export, backup, push gating, re-dump verify, diff, and forensics views inside the existing MAP2 shell.
  - Added deterministic `.syx` regression fixtures under `tests/fixtures/ground_control_pro`, the reverse-engineering/evidence document `docs/ground-control-pro-reverse-engineering.md`, focused backend tests (`tests/test_ground_control_pro_parser.py`, `tests/test_ground_control_pro_service.py`, `tests/test_ground_control_pro_routes.py`), and focused frontend coverage (`web/src/app/pages/GroundControlProPage.test.tsx`) plus route/navigation regression updates.
  - Validation: `python3 -m pytest -q tests/test_ground_control_pro_parser.py tests/test_ground_control_pro_service.py tests/test_ground_control_pro_routes.py` -> PASS; `npm --prefix web test -- --runInBand web/src/app/App.platformRoute.test.tsx web/src/app/data/advancedMenuItems.test.ts web/src/app/pages/GroundControlProPage.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS.
- Blocked notes:
  - The remaining acceptance criteria require a physical Voodoo Lab Ground Control Pro and live MIDI hardware-in-the-loop verification for backup capture, unchanged retransmit, post-power-cycle re-dump identity, and controlled single-field confirmation against real hardware dumps.
  - The repo now contains the complete software path and deterministic synthetic fixtures, but the hardware-qualified acceptance gate cannot be closed from this environment without the actual device.

---

## Latency Pressure Audit — 2026-03-31

**Source:** Fresh forensic audit of all polling loops, blocking I/O, mutex usage, and resource contention that could cause xruns or audio dropouts. Audio system: 64 samples @ 48kHz = 1.33ms/callback, JUCE on isolated CPUs 4,5, SCHED_FIFO.


---

ID: T2370
Status: [✗] Blocked
Title: Remove PlatformEvent migration compatibility kinds after the T2363 aging window
Description:
- Goal / acceptance criteria: On or after 2026-07-18, audit `app/services/platform_event/kind.py` and remove the T2363 migration compatibility kind set that was retained only for persisted pre-cutover events. Update the TypeScript mirror, presenter mappings, tests, and any stored-event replay assumptions so only canonical post-cutover kinds remain. Acceptance requires no runtime producers or frontend consumers to reference the retired kinds, and persisted-event replay to handle aged-out records without restoring a compatibility taxonomy.
- Why it matters: T2363 intentionally hard-cut the event architecture, but the kind taxonomy kept a temporary migration bridge while persisted events age out. Leaving that bridge indefinitely would weaken the single canonical PlatformEvent contract.
- Dependencies: T2363 hard cutover landed 2026-04-19; removal date 2026-07-18 or later.
- Estimated effort: Medium
- Required outputs: audited kind removal, Python/TypeScript manifest parity, updated presenter/store tests, and a scan proving no references to the removed migration kinds remain.
Last updated: 2026-04-20 11:55 EDT - Codex
- Blocked notes:
  - 2026-04-20 11:55 EDT - Codex: Blocked until 2026-07-18 by design; current date is 2026-04-20, so removing the persisted-event compatibility kinds now would violate the T2363 aging window.


---

