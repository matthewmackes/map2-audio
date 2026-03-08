# Lexicon MPX1 Connection Guide

## Hardware Path
1. Connect MPX1 MIDI OUT -> host MIDI IN.
2. Connect MPX1 MIDI IN <- host MIDI OUT.
3. Verify both ports are visible in `aconnect -l` (Linux ALSA) or equivalent MIDI utility.

## MAP2 Startup
1. Start MAP2 backend and web UI.
2. Open `/mpx1/diag` and confirm MIDI port discovery is populated.
3. Use **Reconnect** in diagnostics to bind MAP2 to detected MPX1 ports.
4. Verify status dot turns online in `/mpx1/panel` and `/mpx1` status bar.

## Clock Sync and Bitrate Mapping (S/PDIF + AVB)

For synchronized sample-rate/bit-depth mapping across MAP2, PipeWire, systemd, AVB, and MPX1 S/PDIF:

1. List available sync profiles:
   - `python3 scripts/apply_clock_sync_profile.py --list-profiles`
2. Apply one profile (example):
   - `sudo python3 scripts/apply_clock_sync_profile.py --profile dual_locked_48k --avb-interface enp11s0 --restart-backend`
3. Optional one-shot setup wrapper (AVB provisioning + profile apply):
   - `sudo bash scripts/setup_mpx1_spdif_avb.sh --interface enp11s0 --profile dual_locked_48k --yes`

See detailed profile behavior and AI handoff notes:

- `docs/mpx1/SPDIF_AVB_CLOCK_SYNC_OPTIONS.md`

## Recommended MPX MIDI Settings
- MPX MIDI receive channel: **Omni**
- MPX MIDI transmit channel: **1**
- SysEx transmit/receive: **Enabled**
- Panel Button Message (`system.panel_button_message`): **On (1)** during strict telemetry validation
- If diagnostics are flooded with MIDI Clock and control events are hard to inspect,
  disable MPX clock transmit while validating control-data paths.

## Operational Checks
1. Move a physical MPX1 encoder and confirm `/mpx1/diag` traffic updates.
2. Move a web control and confirm MPX1 responds without zipper noise.
3. Trigger **Force Resync** in diagnostics and confirm dump progress reaches 100%.
4. For gate script runs, prefer connection reuse to avoid ALSA sequencer churn:
   - `python3 scripts/run_mpx1_knob_gate_check.py --connect-mode auto ...`
   - add `--probe-midi-ports` only when you specifically need port-scan evidence.

## Troubleshooting
- No ports found:
  - Check USB-MIDI interface power and cable orientation.
  - Restart ALSA/PipeWire MIDI services.
- Connected but no response:
  - Confirm MPX1 MIDI channel and SysEx receive settings.
  - Confirm MPX transmits on channel 1 (or adjust MAP2 MIDI-map channel filters).
  - Verify MIDI loop is not blocked by another process locking ports.
- Repeated gate runs start failing with ALSA sequencer allocation errors:
  - Avoid forcing reconnect on every run (`--connect-mode auto`).
  - Restart backend once to reclaim stale RtMidi ALSA clients, then reconnect.
- High latency:
  - Check host CPU load and real-time scheduling settings.
  - Use diagnostics ping and traffic counters to isolate transport vs. UI delay.
