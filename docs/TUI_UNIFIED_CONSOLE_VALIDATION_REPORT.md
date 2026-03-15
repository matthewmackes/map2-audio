# TUI Unified Console Validation Report

Date: 2026-03-13
Status: Go for `T050` closure and unified-host feature-branch cutover review.

## Executive Summary

The MAP2 local console now runs through one unified Textual host app in `tui/app.py`. The operator path uses grouped navigation, Carbon-aligned native themes, centralized polling, built-in command palette providers, shared runtime output, shared modal handling, in-app onboarding, Ctrl+Z suspend-to-shell behavior, and backend-owned native workflow execution for the major setup flows.

The active host path is validated and the remaining legacy non-host style islands were retired. Regression guards now enforce that raw hex colors stay confined to `tui/theme/carbon.py`, shared TCSS stays confined to `tui/styles/carbon.tcss`, and inline screen CSS does not return under `tui/`.

## Updated Entrypoint Inventory

- Primary unified host app: `tui/app.py`
- Shell launchers routed to the unified experience: `map2.sh`, `m2.sh`, `map2-info`, `map2-install`
- Compatibility entrypoints redirected to the host app: `tui/node_console/__main__.py`, `tui/node_console/app.py`, `tui/apps/cluster_management_app.py`

## Current-to-Target Architecture Map

| Current state | Target state | Current implementation |
| --- | --- | --- |
| Multiple TUI app boundaries | One host app | `tui/app.py` is the single unified host shell |
| Custom theme engine | Native Textual themes | `tui/theme/carbon.py` registers `carbon-dark` and `carbon-light` |
| Custom command palette logic | Built-in Textual command providers | `tui/commands/providers.py` |
| Per-screen timers and polling | One centralized poll manager | `tui/poll_manager.py` |
| Monolithic API client | Domain-based API modules | `tui/api/{audio,chains,midi,cluster,plugins,system}.py` |
| Fragmented shell/setup workflows | Native workflow route plus backend-owned execution | `tui/workflows.py`, `tui/screens/unified_console.py`, `app/routes/system.py`, `app/routes/avb.py` |
| Standalone node/cluster apps | Compatibility wrappers into the host shell | `tui/node_console/app.py`, `tui/apps/cluster_management_app.py` |

## Unified Screen and Mode Map

- Dashboard group: `Dashboard`
- Audio group: `Audio`, `Chains`, `Effects`, `MIDI`, `Guitar`, `Stage`
- Platform group: `Platform`, `Cluster`, `Monitor`, `Network`, `AVB`, `LCD`
- Settings group: `Settings`, `Config`, `Mode`, `Workflow`, `Backup`, `Updates`, `Diagnostics`
- Startup flow: first run opens onboarding; returning users land on `Dashboard`

## Theme and Token Plan

- Shared stylesheet: `tui/styles/carbon.tcss`
- Registered themes: `carbon-dark`, `carbon-light`
- Dark defaults: background `#000000`, foreground `#ffffff`, surface `#1a1a1a`, panel `#2a2a2a`
- Semantic token families in use: primary action, secondary action, accent, success, warning, error, border subtle, border strong, focus, selected, disabled, text secondary, runtime panel
- Regression guards exist for:
  - single shared `.tcss` source under `tui/`
  - no inline CSS on active modal classes
  - removed dead inline-styled legacy modules
  - raw hex literals confined to `tui/theme/carbon.py`
  - `set_interval()` confined to the centralized poll tick and loading animation

## Fragmentation Findings by Severity

- High: none on the live `tui/` product path
- Medium: archival implementation reports still reference pre-unification screen names and auxiliary utilities in places
- Low: some historical documentation still describes earlier keybinding and rollout models

## Refactor Summary

- Host shell and routing: `tui/app.py`, `tui/base_screen.py`, `tui/screens/unified_console.py`
- Theme and command model: `tui/theme/carbon.py`, `tui/styles/carbon.tcss`, `tui/commands/providers.py`
- Polling and session state: `tui/poll_manager.py`, `tui/session_state.py`, `tui/versioning.py`
- Native workflows and backend bridges: `tui/workflows.py`, `tui/api/system.py`, `app/routes/system.py`, `app/routes/avb.py`
- Shell/fallback consolidation: `branding/map2-welcome.sh`, `map2.sh`, `m2.sh`, `map2-info`, `map2-install`
- Standalone-app absorption: `tui/node_console/app.py`, `tui/node_console/__main__.py`, `tui/apps/cluster_management_app.py`

## Patch Set Grouped by File Area

- Unified shell: `tui/app.py`, `tui/base_screen.py`, `tui/screens/unified_console.py`
- Shared UX system: `tui/modals.py`, `tui/styles/carbon.tcss`, `tui/theme/carbon.py`, `tui/commands/providers.py`
- Backend/API split: `tui/api/`, `app/routes/system.py`, `app/routes/avb.py`
- Compatibility and launch surface: `branding/map2-welcome.sh`, `map2.sh`, `m2.sh`, `map2-info`, `map2-install`
- Deletions already completed: `tui/theme_engine.py`, `tui/command_palette.py`, duplicate screen variants, legacy per-app `.tcss` files, the dead widget monitoring suite, old non-host diagnostics/stage/LCD screens, and dead inline-styled legacy modules removed during `T050-subG`
- Validation: `tui/tests/test_unified_console_app.py`, `tui/tests/test_unified_poll_and_api.py`, `tui/tests/test_workflows.py`, `tests/test_system_node_install_routes.py`, `tests/test_avb_setup_routes.py`, `tests/test_branding_shell.py`, `tui/tests/test_widget_export_smoke.py`

## Validation Evidence

- `python3 -m py_compile tui/screens/__init__.py tui/screens/chains_manager_screen.py tui/screens/midi.py tui/tests/test_unified_console_app.py tui/tests/test_widget_export_smoke.py`
- `pytest -q tui/tests/test_unified_console_app.py tui/tests/test_unified_poll_and_api.py tui/tests/test_workflows.py tui/tests/test_widget_export_smoke.py tests/test_system_node_install_routes.py tests/test_avb_setup_routes.py tests/test_branding_shell.py`
- Result: `52 passed in 11.34s`

Validated behaviors include:

- first-run onboarding
- returning-user startup to `Dashboard`
- grouped landing-route smoke coverage for `Dashboard`, `Audio`, `Platform`, and `Settings`
- built-in command provider discovery and search
- route cache capacity fixed at 8
- Ctrl+Z suspend action and resume refresh path
- Carbon theme registration and theme persistence
- centralized polling and native workflow execution paths
- regression guards for deleted legacy inline-styled modules
- regression guards for canonical unsuffixed screen exports only
- regression guards for raw hex confinement, no inline Python CSS, and approved `set_interval()` usage only

## Remaining Exceptions and Rationale

- No blocker-grade exceptions remain on the `tui/` code path for the unified-host refactor.
- The live operator-facing TUI docs now reflect the unified host app; only archival project reports still mention older screen names/utilities.

## Go/No-Go

- Go: use the unified host app as the primary feature-branch console path and treat `T050` as implementation-complete
- Go: proceed with cutover review and any remaining non-TUI cleanup as follow-on work, not as blockers for the unified-host refactor
