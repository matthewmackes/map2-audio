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

## Recommended MPX MIDI Settings
- MPX MIDI receive channel: **Omni**
- MPX MIDI transmit channel: **1**
- SysEx transmit/receive: **Enabled**
- If diagnostics are flooded with MIDI Clock and control events are hard to inspect,
  disable MPX clock transmit while validating control-data paths.

## Operational Checks
1. Move a physical MPX1 encoder and confirm `/mpx1/diag` traffic updates.
2. Move a web control and confirm MPX1 responds without zipper noise.
3. Trigger **Force Resync** in diagnostics and confirm dump progress reaches 100%.

## Troubleshooting
- No ports found:
  - Check USB-MIDI interface power and cable orientation.
  - Restart ALSA/PipeWire MIDI services.
- Connected but no response:
  - Confirm MPX1 MIDI channel and SysEx receive settings.
  - Confirm MPX transmits on channel 1 (or adjust MAP2 MIDI-map channel filters).
  - Verify MIDI loop is not blocked by another process locking ports.
- High latency:
  - Check host CPU load and real-time scheduling settings.
  - Use diagnostics ping and traffic counters to isolate transport vs. UI delay.
