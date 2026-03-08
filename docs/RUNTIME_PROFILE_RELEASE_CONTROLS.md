# Runtime Profile Release Controls (Features 1/3/5/7)

## Scope

This document defines release-stage controls for:

1. Runtime profile policy (`Edit` vs `Performance`) by node type.
2. Effect residency as default churn-control behavior.
3. Managed RT hardening verification/apply controls.
4. Native JUCE inventory readiness gate.

## API/Observability Fields

## Runtime Profile State

- `GET /api/runtime-profiles/status`
  - `node_type`
  - `audio_capable`
  - `supported_profiles`
  - `default_profile`
  - `current_profile`
  - `profile_policy.graph_mutation_policy`
  - `profile_policy.target_buffer_size`
  - `profile_policy.effect_residency_default`

- `GET /api/runtime-profiles/matrix`
  - Canonical node-type capability matrix and default profile/policy mapping.

- `GET /api/runtime-profiles/defaults-matrix`
  - Standard defaults by environment (`dev`, `lab`, `release`) including kill-switch env vars.

## Effect Residency Telemetry

- `GET /api/plugins/residency/status`
  - `enabled`
  - `current_profile`
  - `node_type`
  - `loaded_count`
  - `parked_count`
  - `stats.parked`
  - `stats.reused`
  - `stats.destroyed`

- `GET /api/plugins/discover`
  - `native_inventory.catalog_count`
  - `native_inventory.discovered_count`
  - `native_inventory.missing_count`
  - `native_inventory.required`
  - `native_inventory.gate_pass`

## RT Hardening Telemetry

- `POST /api/runtime-profiles/rt-harden/verify`
  - Script return status and parsed `grade`.
- `POST /api/runtime-profiles/rt-harden/apply`
  - Managed wrapper over `scripts/setup_realtime.sh`.
- `GET /api/deployment/health/status`
  - Includes `rt_hardening` check outcome via deployment health service.

## Native Inventory Gate Telemetry

- `GET /api/runtime-profiles/native-inventory?probe_load=true`
  - `catalog_count`
  - `probe_count`
  - `loadable_count`
  - `failed_count`
  - `failed_uris`
  - `gate_mode`
  - `gate_pass`

## Release Rollback Runbook

Use this rollback order when release behavior regresses:

1. Switch runtime profile back to safe edit mode:
   - `POST /api/runtime-profiles/switch` with `{"profile":"Edit","force":true}`
2. Disable residency parking if needed:
   - `config_set("plugins.effect_residency", false)` or set `MAP2_DISABLE_EFFECT_RESIDENCY=1`
3. Disable strict runtime profile switching gate (temporary):
   - `MAP2_DISABLE_RUNTIME_PROFILE_SWITCH=1`
4. Disable RT hardening enforcement path (temporary):
   - `MAP2_DISABLE_RT_HARDENING=1`
5. Disable native inventory gate (temporary):
   - `MAP2_DISABLE_NATIVE_INVENTORY_GATE=1`
6. If parked plugin state must be fully destroyed, unload with explicit churn:
   - `POST /api/plugins/unload?destroy_instance=true`

## Release Notes Callouts Template

- Runtime profiles are node-type aware:
  - Audio-capable nodes: `Edit` and `Performance`
  - Control-only nodes: runtime profile is `N/A`
- Performance profile enforces preflight:
  - RT hardening verification
  - Native JUCE inventory readiness gate
- Effect residency defaults to churn-safe behavior in performance contexts with explicit destroy opt-in.
- Operator-visible health and readiness fields are exposed in runtime and plugin APIs.

## Current Risk State (2026-03-08)

- `T062` remains blocked: native JUCE URI load path still fails runtime load probe (`0/18` loadable).
- Release go/no-go (`T063-subE`) remains blocked until native URI path is fixed and lab qualification (`T063-subC`) passes.
