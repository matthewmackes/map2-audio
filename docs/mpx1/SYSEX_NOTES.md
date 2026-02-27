# MPX1 SysEx Implementation Notes

## Frame Shape
MAP2 MPX1 parameter transmit messages use this frame layout:

- Prefix: `F0 06 7F 11`
- Address bytes: 4 bytes from registry `address_bytes`
- Value: 14-bit split (`lo`, `hi`) using 7-bit packing
- Suffix: `F7`

Inbound decode accepts both the canonical MAP2 prefix and common Lexicon
hardware variants observed on live MPX units:

- `F0 06 <device_id> <function> ... F7` (for example `F0 06 09 00 ... F7`)
- Optional one-byte command prefix before the 4-byte address payload

Known decoded long-form command classes:

- `... 01 02 ...`: program status frame (decoded to `current_program`)
- `... 01 01 ...`: panel status frame (decoded to `control_value` telemetry)

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
- Registry coverage is complete, but not all inbound SysEx classes are currently
  mapped to param-level updates.
- Some MPX units emit long state/report SysEx frames (for example
  `F0 06 09 00 01 01 ... F7`) that are captured in diagnostics but are not yet
  translated into per-parameter shadow-state changes.
- `smoothing_ms` is persisted for mappings but interpolation behavior is currently baseline.
- Hardware round-trip latency depends on host MIDI stack and interface quality.
