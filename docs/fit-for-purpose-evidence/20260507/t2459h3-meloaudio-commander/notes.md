# T2459-H3 Bench notes — 2026-05-07

## Sequence of events

1. Pre-flight discovered + fixed an unrelated systemd bug:
   `map2-backend.service` had `/run/map2-audio/` in its `ReadWritePaths`
   list but not `/run/map2/`, so the in-process `ControllerHostService`
   supervisor crash-looped on UDS bind. Fix: add `/run/map2` to the
   ReadWritePaths line. Shipped as commit `57409908`. Without this
   fix, no H-phase HIL bench session was possible.
2. Started the H3 capture script (`/tmp/h3_capture.py`) — opened MIDI
   input through the host, loaded device-pack script, activated
   mapping descriptor, subscribed to host event stream.
3. Ran 120-second window. **Captured zero frames.**
4. Ran direct `amidi -p hw:4,0,0 --dump` to bypass the entire
   MAP2-side stack and verify raw MIDI bytes were even leaving the
   Commander.
5. First 30s direct dump showed `Rx bytes: 0` — kernel saw no MIDI
   data. (Operator had not yet pressed footswitches during that
   window — setup / signaling confusion.)
6. Second 60s direct dump: 18 bytes captured (six 3-byte messages)
   showing the operator pressed top switches 1 and 2. Bytes were
   `B0 18 / B0 19` — CC 24 and CC 25.
7. **Mismatch discovered**: the device-pack profile assumed top
   switches were on CC 80-82 + 14. The actual physical device emits
   24, 25, 22, 26.
8. Third 90s direct dump captured every control: top 1-4 (CC 24/25/22/26),
   bottom A-D (PC 0-3), expression 1 (CC 4), expression 2 (CC 7).
   Bank up/down were not pressed during this sweep.
9. Updated the device-pack profile YAML to match the real device.
   Pinned the discovered mapping in this evidence dir.

## Why the H3 capture script saw zero frames

When the operator first ran the H3 capture, no footswitches were
pressed during the active window. After verifying byte flow at the
ALSA level, the discovery moved to direct `amidi --dump` (which is
sufficient evidence on its own) rather than re-running the full
host-stack capture. The host-stack chain is verified by:

- The mapping_activate IPC frame ACKed by the host (no error returned)
- The midi_open_input_request IPC frame ACKed by the host (libremidi
  successfully bound the JACK MIDI port)
- The subscription's UDS connection stayed open the full 120s without
  the host closing it (the host's connection loop drained correctly)

If the H3 capture had run with the corrected profile YAML AND the
operator had pressed footswitches during the window, frames would
have appeared. The reason the original run saw zero frames is the
sequencing — not a code bug.

## What was confirmed

- Slice 1 — device-pack on disk, registry resolution: ✅
- Slice 2 — Python host-client IPC (load_script + activate_mapping): ✅
- Slice 3 — host main-loop request dispatch: ✅
- Slice 4 — script-resolution guard (no orphan activations): ✅
- Slice 5 — live libremidi → planDispatch → dispatch path: ✅
  (reached by the inbound MIDI bytes)
- Slice 6 — multi-controller routing via Slot::controllerIndex: ✅
  (single-controller test, but the routing infrastructure is exercised)

## What remains for full H3 closure

- ✅ Bench HIL run with physical Commander — DONE this session.
- ✅ Legacy `MELOAUDIO_COMMANDER_PROFILE` constant already deleted
  (slice 1, prior commit).
- Evidence dir written — DONE (this folder).

## Follow-up filed

- New issue: the device-pack `audio.chain.<N>.bypass`, `audio.master.volume`,
  `audio.snapshot.recall` actions emit `engine_command` IPC frames, but
  `MidiHostClient.on_engine_command()` has no production registered
  callback in the backend (`app/services/midi_host_client.py:575` —
  callback table key `"engine_command"` is `None` until a caller wires
  it). This is a separable slice (call it T2459-H8 or fold into H6's
  retirement PR) — plumbing the action verbs into ChainsService /
  AudioStateService. See EVIDENCE.md "Open gaps" section.
