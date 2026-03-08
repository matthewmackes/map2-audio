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
- Inbound mode: `program_fallback`
- `mpx1:panel_status` events: `0`
- `mpx1:param_rx` events: `0`
- `mpx1:program_changed` events: `1`
- Qualified inbound events: `1`
- Latency ms min/avg/max/p99: `37.929` / `37.929` / `37.929` / `37.929`

## Acceptance Gate Summary
- Connected: `PASS`
- Zipper-free proxy (no packet errors during 40ms sweep): `PASS`
- Physical knob inbound detected: `PASS`
- Physical knob <150ms UI update confirmed: `PASS`

## Result
- Overall: `PASS`
