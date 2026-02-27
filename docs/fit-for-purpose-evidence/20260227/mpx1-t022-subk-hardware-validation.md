# MPX1 T022-subK Hardware Validation (2026-02-27)

## Connection
- Connected: `True`
- MIDI in/out indices: `1` / `1`

## 40ms Sweep (UI Knob-Drag Proxy)
- Parameter: `pitch.alg_00.mix`
- Updates sent: `120`
- Packet error delta: `0`
- TX events: `120`
- RX events: `0`

## Physical Inbound Capture (WebSocket)
- Duration: `45s`
- `mpx1:panel_status` events: `0`
- `mpx1:param_rx` events: `0`
- `mpx1:program_changed` events: `0`
- Latency: `N/A` (no inbound knob/status event captured)

## Acceptance Gate Summary
- Connected: `PASS`
- Zipper-free proxy (no packet errors during 40ms sweep): `PASS`
- Physical knob inbound detected: `FAIL`
- Physical knob <150ms UI update confirmed: `FAIL`

## Result
- Overall: `FAIL`
