# MPX1 T022-subK Program-Status Decode Validation (2026-02-27)

- Timestamp: `2026-02-27T17:59:24.837448Z`
- Connected before run: `True` (ports `1`/`1`)
- Runs: `2`
- `rx_program_sysex` events: `2`
- `rx_sysex_unknown` events in run window: `0`

## Observation
- Inbound long-form MPX frames with command `01 02` are now classified as `rx_program_sysex` and mapped to concrete `current_program` updates.

## Evidence File
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260227/mpx1-t022-subk-program-status-decode-validation.json`
