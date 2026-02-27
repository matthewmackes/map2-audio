# MPX1 T022-subK Inbound SysEx Variant Snapshot (2026-02-27)

- Timestamp: `2026-02-27T17:50:29.511962Z`
- MPX config assumption: receive `omni`, transmit `ch1`
- Connected: `True` (in/out: `1`/`1`)
- Diagnostics count: `500`
- `rx_sysex_unknown`: `56`
- `rx_sysex`: `0`
- `rx_cc`: `0`

## Key Observation
- Live inbound frames include repeated long-form Lexicon SysEx classes (for example `F0 06 09 00 01 01 ... F7`).
- These frames are no longer treated as transport absence; they are real inbound traffic requiring dedicated decode mapping.

## Evidence File
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260227/mpx1-t022-subk-inbound-sysex-variant-snapshot.json`
