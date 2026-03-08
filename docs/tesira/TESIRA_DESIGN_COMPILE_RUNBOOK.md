# Tesira Design Compile Runbook (MAP2 Native)

This runbook describes the MAP2-native compile/recompile flow for Tesira design workspaces.

## Scope

Applies to design workspaces managed under:

- `GET /api/tesira/devices/{device_id}/designs`
- `POST /api/tesira/devices/{device_id}/designs`

Compile pipeline capabilities:

- Compile one design
- Force recompile one design
- Compile active design
- Compile all designs
- Compile uncompiled designs only
- Read compile diagnostics

## Endpoint Summary

- `POST /api/tesira/devices/{device_id}/designs/{design_id}/compile`
  - Body: `{ "optimize": bool, "recompile": bool }`
- `POST /api/tesira/devices/{device_id}/designs/{design_id}/recompile`
  - Body: `{ "optimize": bool }`
- `POST /api/tesira/devices/{device_id}/designs/compile-active`
  - Body: `{ "optimize": bool, "recompile": bool }`
- `POST /api/tesira/devices/{device_id}/designs/compile-all`
  - Body: `{ "optimize": bool, "recompile": bool, "include_templates": bool }`
- `POST /api/tesira/devices/{device_id}/designs/compile-uncompiled`
  - Body: `{ "optimize": bool, "recompile": bool, "include_templates": bool }`
- `GET /api/tesira/devices/{device_id}/designs/{design_id}/diagnostics`

## Compile Status Model

- `UNCOMPILED`: design has never been compiled or graph changed
- `COMPILED`: latest compile succeeded
- `FAILED`: validation/compile failed
- Result status `UP_TO_DATE`: no-op compile when graph hash is unchanged and `recompile=false`

## Operational Workflow

1. Save design changes from `/tesira/{deviceId}/design`.
2. Validate graph (`/validate`) and correct any errors.
3. Run `/compile` (or `/recompile` for forced rebuild).
4. Review diagnostics and warnings (`/diagnostics`).
5. For fleet/batch operations, use `/compile-active`, `/compile-all`, or `/compile-uncompiled`.

## Diagnostics Interpretation

`diagnostics.validation` includes deterministic graph checks:

- node/edge/group integrity
- instance-tag uniqueness
- domain compatibility (`audio` vs `control`)
- channel mismatch warnings
- cycle warnings

`diagnostics.extra` includes quality checks:

- disconnected nodes
- missing explicit output block
- graph size summary

## Frontend UX Notes

The MAP2 design canvas (`/tesira/:deviceId/design`) exposes:

- `Compile`
- `Recompile`
- `Compile Active`
- `Compile All`
- `Compile Uncompiled`
- `Optimize: On/Off`
- compile status + revision summary and diagnostics alerts

## Expected Outputs

Compile responses include:

- revision increment (`compile_revision`)
- deterministic `graph_hash`
- optional compile artifact estimates:
  - partition count
  - estimated DSP load
  - estimated latency

These values are software-model estimates for authoring feedback and not a substitute for final HIL validation.
