# MPX1 SysEx Implementation Notes

## Frame Shape
MAP2 MPX1 parameter messages use this frame layout:

- Prefix: `F0 06 7F 11`
- Address bytes: 4 bytes from registry `address_bytes`
- Value: 14-bit split (`lo`, `hi`) using 7-bit packing
- Suffix: `F7`

## Value Encoding
- Encode: `value -> lo = value & 0x7F`, `hi = (value >> 7) & 0x7F`
- Decode: `(hi << 7) | lo`
- Value is normalized/clamped against registry range before transmit.

## Transport Behavior
- Realtime-safe params are coalesced in a 40ms window.
- Non-realtime params dispatch immediately.
- Incoming SysEx updates shadow state and broadcasts websocket events.

## MIDI Mapper Integration
- Incoming CC events are captured and dispatched through active MIDI maps.
- Learn-mode stores next received CC/channel as a mapping target.
- Multiple mappings may share the same CC (macro behavior).

## Diagnostics
- Service captures traffic ring-buffer entries (`tx_sysex`, `rx_sysex`, `rx_cc`, errors).
- `/api/mpx1/diagnostics` returns recent entries with hex strings for UI display.
- `/api/mpx1/diagnostics/ping` provides API-path latency estimate.

## Known Quirks
- Full opcode coverage depends on registry completeness (`coverage.status=bootstrap_partial`).
- `smoothing_ms` is persisted for mappings but interpolation behavior is currently baseline.
- Hardware round-trip latency depends on host MIDI stack and interface quality.
