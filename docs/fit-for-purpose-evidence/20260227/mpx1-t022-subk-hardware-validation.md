# MPX1 T022-subK Hardware Validation (2026-02-27)

## Connection
- Connected: `True`
- MIDI in/out indices: `None` / `None`

## Diagnostics Ping
- Samples: `30`
- Latency ms min/avg/max/p99: `0.007` / `0.008` / `0.026` / `0.026`

## 40ms Sweep (UI Knob-Drag Proxy)
- Parameter: `pitch.alg_00.mix`
- Updates sent: `250`
- Packet error delta: `0`
- TX events: `251`
- RX SysEx events: `0`
- RX CC events: `0`

## Raw ALSA Inbound Capture
- Command: `timeout 15s aseqdump -p 24:0`
- Clock events: `720`
- CC events: `0`
- SysEx events: `0`
- Log: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260227/mpx1-t022-subk-aseqdump-15s.log`

## Acceptance Gate Summary
- Connected: `PASS`
- Zipper-free proxy (no packet errors during 40ms sweep): `PASS`
- Physical knob inbound detected: `FAIL`
- Physical knob <150ms UI update confirmed: `FAIL`

## Result
- `T022-subK` remains open pending live inbound knob-event detection and measured `<150ms` physical knob-to-UI confirmation.