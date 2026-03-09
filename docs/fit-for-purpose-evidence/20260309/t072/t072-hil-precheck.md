# T072 HIL Precheck (2026-03-09)

## Summary

- Tesira fleet API reachable with 2 devices (2 connected).
- AVB stack reports operational readiness on host interface `enp11s0`.
- AVB discovered-device count remains `0`.
- AVB stream list remains empty (`0` streams).
- PTP remains `INITIALIZING` with no grandmaster/offset values.

## Gate Impact

- Software control-path preconditions: **pass** (Tesira devices online).
- AVB/PTP topology certification gates: **fail/not ready** (no discovered AVB entities/streams, no stable PTP lock evidence).
- T072 full HIL matrix remains blocked until active AVB routing + stable PTP telemetry are present under load.

## Artifacts

- `docs/fit-for-purpose-evidence/20260309/t072/t072-hil-precheck.json`
- `docs/fit-for-purpose-evidence/20260309/t072/t072-hil-precheck.md`
