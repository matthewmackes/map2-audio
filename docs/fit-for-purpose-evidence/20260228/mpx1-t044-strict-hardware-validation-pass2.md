# MPX1 Knob Gate Validation

## Connection
- Connected: `True`
- MIDI in/out indices: `1` / `1`

## 40ms Sweep (UI Knob-Drag Proxy)
- Parameter: `pitch.alg_00.mix`
- Updates sent: `120`
- Packet error delta: `0`

## Physical Inbound Capture (WebSocket)
- Duration: `90s`
- Inbound mode: `strict`
- `mpx1:panel_status` events: `2`
- `mpx1:param_rx` events: `0`
- `mpx1:program_changed` events: `2`
- Qualified inbound events: `2`
- Latency ms min/avg/max/p99: `0.764` / `0.969` / `1.174` / `1.170`

## Acceptance Gate Summary
- Connected: `PASS`
- Zipper-free proxy (no packet errors during 40ms sweep): `PASS`
- Physical knob inbound detected: `PASS`
- Physical knob <150ms UI update confirmed: `PASS`

## Result
- Overall: `PASS`
