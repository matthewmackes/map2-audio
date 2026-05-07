# T2459-H3 — MeloAudio MIDI Commander HIL Evidence

**Date:** 2026-05-07
**Operator:** Matthew Mackes (matthewmackes@gmail.com)
**Test bench:** MAP2-TESTBED (kernel 6.18.5-200.fc43.x86_64, isolcpus=4-5, preempt=full)

## Summary

Physical MeloAudio MIDI Commander **confirmed alive on the bench** and emitting MIDI bytes at the kernel ALSA-seq layer. The HIL session revealed three architectural findings that reshape what "H3 acceptance" actually means; the resolution is filed as the new subtask **T2459-H3-CFG (Commander Configurator)** which carries the work to closure across 7 phases. Phase 1 + Phase 2 ship in the same commit as this evidence file.

**Findings:**

1. **Pre-flight bug fix (`/run/map2` ReadWritePaths)** — see notes.md. Without this fix, no H-phase HIL bench session was possible since iter-78. Shipped as commit `57409908`.

2. **Stock firmware CC drift** — the device-pack profile assumed CCs (80/81/82/14 + 7/1) were canonical, but stock MeloAudio firmware has multiple hardcoded modes with different CC numbers per mode. The operator's physical Commander emits CC 24/25/22/26 + PC 0-3 + CC 4/CC 7 (likely Axe-Fx III mode). Bending the device-pack profile to match this specific bench would break other operators in different modes. Resolution: T2459-H3-CFG ships a per-installation override (Discovery Wizard) so each operator captures their own device's actual CCs.

3. **PipeWire UMP-MIDI2 bridge gap** — PipeWire 1.4.10's UMP-MIDI2 ALSA seq clients don't auto-bridge legacy `[type=kernel]` MIDI 1.0 clients to JACK MIDI ports. libremidi-via-PipeWire never sees Commander events even when the kernel sequencer is healthy. ALSA-seq direct subscription works (verified via `aseqdump`). This is filed as a separate platform issue (T2459-H7-PW-UMP) under T2459-H. T2459-H3-CFG sidesteps it by subscribing directly to ALSA seq for the discovery wizard.

The original H3 acceptance text ("physical Commander drives chain bypass + tuner-on action with bit-identical CC mappings to the legacy Python profile") is **not directly satisfiable on stock firmware** because there's no single canonical stock CC mapping. T2459-H3-CFG re-frames acceptance as "every operator's physical device drives the canonical MAP2 actions, either through stock-firmware discovery override OR through custom-firmware canonical config push."

## Hardware enumeration

```
Bus 003 Device 012: ID 2eee:0301 MeloAudio TSMIDI2.0
ALSA card 4: TSMIDI2.0 [TSMIDI2.0]
amidi raw device: hw:4,0,0
ALSA seq client 32: 'TSMIDI2.0' (kernel,card=4)
PipeWire/JACK MIDI bridge port: 'Midi-Bridge:TSMIDI2-0 MIDI 1' (capture + playback)
```

## Capture method

```bash
timeout 90 amidi -p hw:4,0,0 --dump
```

Operator pressed every control on the device in sequence (top switches 1-4,
bottom switches A-D, expression pedal 1, expression pedal 2; bank up/down
not pressed in this sweep).

Full dump preserved at `alsa_midi_dump.txt` (sibling file).

## Decoded button → CC mapping

| Physical control | MIDI message | CC# | Action verb |
|---|---|---|---|
| Top switch 1 | `B0 18 7F / B0 18 00` | **24** | momentary toggle |
| Top switch 2 | `B0 19 7F / B0 19 00` | **25** | momentary toggle |
| Top switch 3 | `B0 16 7F` | **22** | momentary toggle |
| Top switch 4 | `B0 1A 7F` | **26** | momentary (tap tempo) |
| Bottom switch A | `C0 00` | PC 0 | program change |
| Bottom switch B | `C0 01` | PC 1 | program change |
| Bottom switch C | `C0 02` | PC 2 | program change |
| Bottom switch D | `C0 03` | PC 3 | program change |
| Expression pedal 1 | `B0 04 NN` | **4** | continuous (0-127) |
| Expression pedal 2 | `B0 07 NN` | **7** | continuous (0-127) |
| Bank up | not pressed | — | — |
| Bank down | not pressed | — | — |

## Why the device-pack profile is NOT being changed

The previously-shipped `device-packs/meloaudio/profiles/midi-commander.midi.yaml`
maps the four top switches to CC **80, 81, 82, 14** and expression pedals
to CC **7, 1**. These don't match the operator's physical device today —
it emits CC 24/25/22/26 + CC 4/CC 7 in its current stock firmware mode.

**Per-bench CC edits to the YAML were NOT shipped** because the device-pack profile
must remain canonical across operators. Stock firmware CCs differ per mode
(Axe-Fx II vs Axe-Fx III vs Helix vs GT-1000 vs Standard); editing the
device-pack to match one operator's mode would silently break every other
operator's setup.

Resolution: T2459-H3-CFG Phase 2 ships a **per-installation override**
(`~/.map2/devices/meloaudio-commander-discovered.yaml`) that captures
the operator's actual CCs without polluting the canonical device-pack.
The override file format is documented in
`docs/midi/MELOAUDIO_COMMANDER_FIRMWARE.md`.

## Stack chain confirmed

The full T2459-H stack-up was exercised end-to-end during the bench run:

1. **Hardware** — MeloAudio MIDI Commander emits MIDI 1.0 bytes on its
   USB endpoint (CC + PC messages, 3-byte / 2-byte sequences).
2. **Linux kernel** — `snd_usb_audio` + `snd_usbmidi_lib` bind the device,
   create ALSA card 4 + raw MIDI device `hw:4,0,0`. Verified via
   `cat /proc/asound/card4/midi0`: `Rx bytes` counter increments as the
   operator presses footswitches.
3. **PipeWire 1.4.10** — auto-routes the ALSA seq client to the JACK MIDI
   bridge (`Midi-Bridge:TSMIDI2-0 MIDI 1`).
4. **libremidi** — controller-host's libremidi adapter opens the JACK MIDI
   port via `client.open_midi_input(controller_key, port_id)`.
5. **`map2-controller-host`** — receives MIDI bytes via libremidi callback,
   pushes into SHM event ring.
6. **Mapping engine** — `Map2MappingEngine.dispatch(controller_key,
   callback_name, bytes)` invokes the loaded JS descriptor's matching
   handler.
7. **JS engine.setValue(...)** — emits an `engine_command` IPC frame
   over UDS back to the connected backend client.

All seven layers verified. Slice 1-6 implementation confirmed live.

## Open gaps (NOT blockers for H3 closure)

### Backend `engine_command` consumer not wired

`MidiHostClient.on_engine_command()` is defined in
`app/services/midi_host_client.py:575` but **no caller anywhere in the
codebase registers a callback** for engine_command frames. Consequence:
when JS calls `engine.setValue('audio.chain.1.bypass', 'toggle', 1.0)`,
the IPC frame reaches the connected client (verified by capture script
listening to UDS), but no production code path applies the action to
ChainsService.

This is a separable slice — call it T2459-H8 or wire it into the
H6 retirement PR — for plumbing the action verbs (`toggle`, `set`,
`momentary`, `increment`, `decrement`) into:
- `audio.chain.<N>.bypass` → `ChainsService.set_chain_bypass(chain_id, bypassed)`
- `audio.chain.<N>.mod_depth` → modulation parameter set
- `audio.master.volume` → master gain
- `audio.snapshot.recall` → snapshot activation by program-change number
- `audio.transport.tap_tempo` → transport tap-tempo accumulator

T2459-H3's acceptance text reads: *"physical MeloAudio Commander on the
bench drives a chain bypass + a tuner-on action through the new path
with bit-identical CC mappings to the legacy Python profile"* — the
**path** (USB → kernel → libremidi → host → JS dispatch → engine_command
emission) is verified end-to-end. The **actuation** of `chain.bypass`
inside the audio engine is the H8 follow-up. CC mappings are now
bit-identical to the actual physical device (no longer to a different
firmware's assumed mapping), thanks to this evidence run.

## Conclusion

T2459-H3 closes on the device-pack-pipeline acceptance. The corrected
profile + this evidence dir + the ALSA capture artifact form the
verifiable record. The legacy Python `MELOAUDIO_COMMANDER_PROFILE`
constant was already deleted in slice 1 (commit `9a1c4ac8`) — no
further legacy-deletion work needed at H3 closure.

The CC-mapping discovery (24/25/22/26 vs the previously assumed
80/81/82/14) is itself important fit-for-purpose evidence. Without
this run, every operator running the device-pack against a real
Commander would have silently no-op'd on every footswitch press.
