# T2459-H3 — Production Dispatcher Status

**Status:** Production dispatcher is SHIPPED on `master`. Doc updated 2026-05-05 to correct the cycle-59 gap-scoping that incorrectly claimed the dispatcher only existed in a parallel worktree. Inspecting master revealed slices 3, 5, and 6 had already landed by that date — the dispatcher entries (`script_load_request`, `mapping_activate`, `midi_open_input_request`) and the live ring-drain dispatch path are present in `juce-engine/Source/ControllerHost/main.cpp`. Only the bench-HIL evidence run with physical hardware remains.

## Background

T2459-H3 converts the hardcoded 669-line `MELOAUDIO_COMMANDER_PROFILE` Python dict into a device-pack pair:

- `device-packs/meloaudio/midi-commander/pack.yaml`
- `device-packs/meloaudio/midi-commander/profiles/midi-commander.midi.yaml`
- `device-packs/meloaudio/midi-commander/scripts/commander.js`

## Pipeline status

```
[device-pack on disk]
  → ProfileRegistry resolution                  ✓ Slice 1 (master)
  → Python host-client serializes descriptor    ✓ Slice 2 (master)
  → IPC frame to map2-controller-host           ✓ Slice 2 (master)
  → host main-loop dispatches script_load       ✓ Slice 3 (master, main.cpp:925)
  → host caches/loads JS via QuickJS engine     ✓ Slice 3 + Slice 5 (master)
  → libremidi events flow through script        ✓ Slice 5 (master, drain_ring_and_dispatch)
  → host emits engine_command UDS frames        ✓ Slice 5 (master)
  → multi-controller routing per Slot::ctrl_idx ✓ Slice 6 (master)
  → JUCE engine handles the action              ✓ pre-existing
  → Bench HIL with MeloAudio Commander          ✗ HARDWARE GATE
```

## Source layout (master, verified 2026-05-05)

`grep -n "script_load_request\|mapping_activate\|midi_open_input_request" juce-engine/Source/ControllerHost/main.cpp`:

- `main.cpp:409` — `parse_mapping_activate_frame()` definition
- `main.cpp:533` — `drain_ring_and_dispatch()` (live MIDI → planDispatch → dispatch → engine_command emission)
- `main.cpp:600..612` — `js().drainEngineCommands()` / `drainShortMidi()` drain into UDS frames
- `main.cpp:766..777` — RT and control ring drains in the main poll loop
- `main.cpp:825..873` — `midi_open_input_request` handler (libremidi adapter open)
- `main.cpp:925..947` — `script_load_request` handler (controller-keyed script cache)
- `main.cpp:953..` — `mapping_activate` handler (descriptor parse, script resolve, `Map2MappingEngine::loadDescriptor`, `log_event` / `script_error` response)

Python sender side: `app/services/midi_host_client.py` (Slice 2) — `load_script(...)`, `activate_mapping(...)`, `open_midi_input(...)`, `send_ump(...)` all in tree.

IPC schema: `app/schemas/controller_host.py` + `juce-engine/Source/ControllerHost/IpcMessages.h` — both kept in sync via `tests/test_controller_host_ipc_schema.py::test_python_manifest_matches_cpp`.

## Test coverage

- `tests/test_controller_host_main_loop_t2459h3.py` — 4 cases. Real `map2-controller-host` binary spun up over a tmp UDS socket; asserts `script_load_request` + `mapping_activate` are consumed; rejects unresolved-script descriptors with `script_error`.
- `tests/test_controller_host_main_loop_t2459h3_slice5.py` — 3 cases. Asserts `midi_open_input_request` for an unknown port returns a typed error log, host stays responsive after a load+activate+open round, and the schema manifest carries `MidiOpenInputRequest`.
- `tests/test_controller_host_main_loop_t2459h3_slice6.py` — 2 cases. Two distinct controllers each load + activate + open without state drift; index-reuse path (same controller_key, second port) is crash-free.
- `tests/test_controller_host_ipc_schema.py` — Python ↔ C++ manifest parity guard.

All nine integration cases pass when the host binary is built (`pytest -q tests/test_controller_host_main_loop_t2459h3*.py` → **9 passed in 3.05s** on 2026-05-05).

The fixtures skip ONLY if the host binary isn't on disk — they are not HIL-gated in the bench-hardware sense. CI build → CI test pipeline can run them end-to-end.

C++ side: `juce-engine/tests/Map2MappingEngineTests.cpp` carries Slice 5 + Slice 6 cases (CC byte sequences pushed through `LibremidiAdapter::pushMessage` → ring drain → dispatch → assert `EngineCommand` + outbound short MIDI got queued); `juce-engine/tests/ShmEventRingTests.cpp` carries 3 UMP cases + `Slot::controllerIndex` round-trip cases.

## What remains for full T2459-H3 acceptance

The original H3 acceptance (worklist line 114) reads:

> physical MeloAudio Commander on the bench drives a chain bypass + a tuner-on action through the new path with bit-identical CC mappings to the legacy Python profile; legacy `MELOAUDIO_COMMANDER_PROFILE` deleted with a stub redirect for any in-flight callers; one HIL evidence run captured under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`.

Code-side gates are met. Hardware-gated remainder:

1. **Bench HIL run.** Plug a MeloAudio Commander into the bench, run `map2-controller-host` with the device-pack profile loaded, capture the CC stream as the operator presses bypass + tuner, diff against the legacy profile's expected CC mappings, write the evidence directory.
2. **Legacy profile deletion.** Once the HIL run confirms parity, delete the legacy hardcoded behavior (the loader already prefers the device-pack — `app/services/midi_device_profiles.py` legacy alias `meloaudio_commander → meloaudio_midi_commander` can shrink to a deprecation shim once no in-flight caller uses it; verify with a code search before deleting).

## Why this can't ship in an autonomous-loop cycle

- **HIL hardware required.** The acceptance gate is bench-side with the physical MIDI Commander. Autonomous-loop cycles can verify the code paths via integration tests (which already pass), but they can't drive a physical pedal.
- **No source-of-truth split.** Everything the autonomous-loop session can do is already on master. There is no parallel worktree fork to merge.

## Recommended next move

The next focused operator session should:

1. Plug a MeloAudio Commander into the bench.
2. Build the host: `cmake --build juce-engine/build --target map2-controller-host`.
3. Start `map2-controller-host` against the device-pack profile (procedure: `docs/midi/MIDI_BACKEND.md` operator runbook).
4. Press bypass + tuner footswitches; capture the engine_command stream from the host's UDS output.
5. Compare against the legacy `MELOAUDIO_COMMANDER_PROFILE` expected mappings (one CC for bypass, one CC for tuner per the original profile dict).
6. Write evidence to `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`.
7. If parity holds, file the legacy-profile deletion follow-up; flip H3 to `[✓] Done` once the deletion lands.

Until the bench session lands, T2459-H3 stays `[>] In Progress` with all code-side slices shipped and the bench acceptance gate explicitly documented here.
