# T2482-P1.1 Maschine MK1 daemon — rtmidi deferral note

**Date:** 2026-04-30 (iter 55)
**Status:** Maschine MK1 daemon retains rtmidi as a HARD dependency until a future P1.2 IPC extension lands.

---

## Why Maschine is the exception

Iters 54-58 strip the rtmidi fallback from the 5 P1.1 consumers consumer-by-consumer. Maschine MK1 is the **only** consumer that cannot fully strip rtmidi in SHIP loop 6:

- Maschine publishes a **virtual MIDI port** (`MAP2:Maschine-MK1`) that downstream apps (DAWs, MIDI utilities) connect to.
- The `VirtualMidiOutput.open()` path in `app/services/maschine/maschine_mk1_daemon.py` calls `rtmidi.MidiOut().open_virtual_port(name)` to create that port.
- The C++ controller-host has the equivalent surface (`LibremidiAdapter::openVirtualOutput` in `juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.cpp:156`) but **no `MidiCreateVirtualPortRequest` IPC envelope** wires it to Python.
- Without the IPC envelope, Python cannot ask the host to publish a virtual port on its behalf — so the Maschine daemon must keep using rtmidi for port creation.

## What iter 55 actually delivers

Behaviorally: nothing changes for Maschine in iter 55. The virtual-port creation stays rtmidi; the per-message send still runs as a host shadow.

Documentationally: the `_maschine_use_midi_host()` docstring is rewritten to make the deferral explicit, and this doc is added to the architecture corpus so the next operator who reads `app/services/maschine/maschine_mk1_daemon.py` understands why the rtmidi import survives an otherwise-rtmidi-free codebase.

## Impact on iter 59 (drop python-rtmidi)

Iter 59 cannot drop `python-rtmidi` from `requirements-backend-runtime.txt` while Maschine still needs it. Two options:

**A. Keep python-rtmidi as a Maschine-scoped optional dependency.**
Move `python-rtmidi` from the unconditional install list to a `[maschine]` extras group. Map2 deploys without Maschine hardware skip the dep; Maschine deploys install it explicitly. Iter 59's CI grep-fail check then targets `app/` excluding `app/services/maschine/`.

**B. Land the P1.2 IPC extension before iter 59.**
Add `MidiCreateVirtualPortRequest` to `app/schemas/controller_host.py` + the C++-side dispatcher in `juce-engine/Source/ControllerHost/main.cpp`, then strip Maschine's rtmidi entirely. ~3 days of work — small but not iter-sized. Queued as a P1.2 follow-up; not blocking SHIP loop 6.

**Decision for SHIP loop 6:** option A — keep python-rtmidi in requirements scoped via deferral note in the iter 60 roll-up. Iter 59's CI check skips `app/services/maschine/` until option B lands.

## Recommended sequencing

1. **Iter 56-58** strip rtmidi from the other 3 consumers (sysex_device_bridge, midi_hub/ports, midi_engine).
2. **Iter 59** drops `python-rtmidi` from `requirements-backend-runtime.txt` BUT preserves it in a Maschine-scoped extras / explicit install instruction. CI grep-fail excludes `app/services/maschine/`.
3. **P1.2 follow-up** (post-loop-6): add the `MidiCreateVirtualPortRequest` IPC envelope, flip Maschine virtual-port creation to host, then drop the Maschine rtmidi dependency in a dedicated commit.

## Cross-references

- iter-47 commit `8c908b52` (initial Maschine flip with shadow-send)
- iter-53 strict-mode tests (`tests/test_midi_host_strict_mode_t2482p1_1.py::MaschineStrictModeTests`)
- C++ surface: `juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.cpp:156` (`openVirtualOutput`)
- IPC schemas: `app/schemas/controller_host.py` (no `MidiCreateVirtualPortRequest` yet)
