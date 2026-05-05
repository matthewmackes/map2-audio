# T2459-H3 — Production Dispatcher Wiring Gap

**Status:** Scoped 2026-05-04 (cycle 59 of autonomous-loop session). Slices 1 and 2 of T2459-H3 already shipped by Codex (pack migration + Python host-client IPC surface). The remaining production-dispatcher wiring lives in a parallel agent's worktree (`.claude/worktrees/agent-*/juce-engine/Source/ControllerHost/`) and is **not yet on `master`**. This doc captures the gap so the next focused session can resume cleanly.

## Background

T2459-H3 converts the hardcoded 669-line `MELOAUDIO_COMMANDER_PROFILE` Python dict into a device-pack pair:

- `device-packs/meloaudio/midi-commander/pack.yaml`
- `device-packs/meloaudio/midi-commander/profiles/midi-commander.midi.yaml`
- `device-packs/meloaudio/midi-commander/scripts/commander.js`

Slice 1 shipped the pack on disk + ProfileRegistry resolution + legacy-id alias compatibility (`meloaudio_commander` → `meloaudio_midi_commander`). Slice 2 shipped the Python host-client IPC methods `load_script(...)` → `script_load_request` and `activate_mapping(...)` → `mapping_activate` with descriptor-payload serialization for `IpcMessages.h`.

The pipeline is now:

```
[device-pack on disk]
  → ProfileRegistry resolution                 ✓ Slice 1
  → Python host-client serializes descriptor   ✓ Slice 2
  → IPC frame to map2-controller-host          ✓ Slice 2 (sender side)
  → host main-loop dispatches the script_load  ✗ GAP
  → host loads JS via QuickJS engine           ✗ GAP (engine exists; production wiring missing)
  → libremidi events flow through the script   ✗ GAP
  → host emits chain.bypass.toggle UDS message ✗ GAP
  → JUCE engine handles the action             ✓ pre-existing
```

The host main-loop dispatcher (`map2-controller-host/main.cpp` or equivalent C++ entry) needs to register handlers for the new `script_load_request` and `mapping_activate` IPC messages and route them through the QuickJS engine (T2459-H2). Without that, the IPC frames the Python side serializes are received but never executed.

## Current source layout

`grep -rln "mapping_activate\|script_load_request"` shows the non-test references currently live in:

- `app/services/midi_host_client.py` (sender — Python)
- `app/schemas/controller_host.py` (IPC schema)
- `scripts/measure_p1_2_dispatch_latency.py` (load measurement)
- `.claude/worktrees/agent-*/juce-engine/Source/ControllerHost/main.cpp` ← **not on master**
- `.claude/worktrees/agent-*/juce-engine/Source/ControllerHost/IpcMessages.h` ← **not on master**

The worktree-resident work is the production dispatcher implementation. Until those branches merge to master, this scope doc parks the work.

## What "done" looks like

Once the worktree branch merges:

1. **Schema completeness:** `tests/test_controller_host_ipc_schema.py` passes including `script_load_request` + `mapping_activate` round-trip cases.
2. **Main-loop dispatch:** `tests/test_controller_host_main_loop_t2459h3.py` + `_slice5.py` + `_slice6.py` exercise the production code path (currently HIL-skipped — `pytest -q ... -m "not hil"`). Move the existing skip markers off once the dispatcher is in tree.
3. **JS execution:** `tests/test_controller_host_main_loop_t2459h3_slice6.py` covers `script_load_request → QuickJS load → mapping_activate → JS-side onMidi(...)`. The test is in tree but skipped pending dispatcher; un-skip after merge.
4. **HIL run:** physical MeloAudio Commander on the bench drives chain bypass + tuner-on through the new pipeline. Capture evidence at `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/` per the original acceptance.

## Why this can't be done in an autonomous-loop cycle

- **Source-of-truth split:** the dispatcher implementation is in another agent's worktree branch. Authoring a competing implementation on `master` would create a merge conflict on a hot path (the controller-host main loop).
- **HIL hardware:** the final acceptance gate is bench-side with the physical MIDI Commander. Not autonomous-loop-executable.

## Recommended next move

The next focused session should:

1. Inspect the agent-`abbc212ce384a2df3` (or whichever) worktree's `main.cpp` + `IpcMessages.h` changes; confirm they implement `script_load_request` + `mapping_activate` dispatch correctly.
2. Either land that worktree onto `master` (fast-forward merge if no conflicts) or open a focused PR.
3. Un-skip the `test_controller_host_main_loop_t2459h3_*.py` HIL-marked cases once the production dispatcher is in tree.
4. Schedule the bench HIL run for evidence capture.

Until then, T2459-H3 stays `[>] In Progress` with slice 1+2 shipped and the production-dispatcher gap documented here.
