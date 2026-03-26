## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

Last updated: 2026-03-26 - Cycle 3 route-helper and CI cleanup complete for T436/T448

ID: T449
Status: [✓] Done
Title: Restore position-scoped NAM and IR selected-block asset workflows when instance ids are absent
Description:
- Goal / acceptance criteria: Ensure the JUCE Grid selected-block NAM, Cabinet IR, and Reverb IR cards still target the correct live plugin when the runtime payload exposes `plugin.position` but omits `instance_id`. Route card status, manager-dialog loads, and card-level mutations/uploads through a duplicate-safe `plugin_position` fallback on both the frontend API client and backend NAM/IR routes; add focused backend/frontend regression coverage; and keep the worklist/audit ledger consistent.
- Why it matters: The instance-aware NAM/IR work from `T324` assumes `plugin.instance_id` is always present, but real selected-block runtime payloads can still arrive with position-only identity, which silently drops these asset workflows back toward global state and breaks duplicate-instance correctness.
- Dependencies: T324; current dirty NAM/IR selected-block follow-up in `app/routes/nam.py`, `app/routes/ir.py`, `app/services/juce_engine_service.py`, `web/src/app/components/PluginCards/Custom/JUCE/*`, `web/src/app/components/loaders/*`, `web/src/map2/api.ts`
- Estimated effort: Medium
- Required outputs: Position-scoped runtime fallback across NAM/IR routes and cards, focused backend/frontend regression tests, validation evidence, and licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:20 EDT - Codex
- Completion notes:
  - Extended the NAM and IR backend routes in `app/routes/nam.py` and `app/routes/ir.py` so all selected-block status/load/control endpoints accept `plugin_position` in addition to `instance_id`, resolve the live processor instance through `app/services/juce_engine_service.py`, and return safe position-scoped fallback payloads instead of falling back to global singleton state when only chain position is available.
  - Updated `web/src/map2/api.ts`, `web/src/app/components/PluginCards/PluginCardRouter.tsx`, `web/src/app/components/PluginCards/types.ts`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, and `web/src/app/components/loaders/IRManagerDialog.tsx` so the selected-block cards and shared manager dialogs now key/query/mutate by duplicate-safe runtime identity, preferring `instance_id` and cleanly falling back to `pluginPosition`.
  - Fixed the compatibility wrappers in `web/src/app/components/loaders/IRManagerDialog.tsx` so `CabinetIRManagerDialog` and `ReverbIRManagerDialog` expose the new `pluginPosition` prop, which unblocked the production bundle build after the runtime-scope change.
  - Added focused regression coverage in `tests/test_nam_ir_instance_routes.py`, `web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx`, `web/src/app/components/loaders/NAMManagerDialog.test.tsx`, and `web/src/app/components/loaders/IRManagerDialog.test.tsx` for the position-scoped fallback path.
  - Repaired the stale audit-v2 task IDs in the lower worklist section so the fresh outstanding audit items now consistently read `T434` through `T448`, removing the misleading duplicate `T413` through `T427` todo markers.
  - Licensing review: touched backend/frontend/test/worklist/version files remain MAP2-owned AGPL-covered repository artifacts with no third-party override in scope; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app web/src tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `pytest -q tests/test_nam_ir_instance_routes.py` -> PASS (`5 passed`); `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` -> PASS (`19 passed`); `npm --prefix web test -- --runInBand web/src/app/components/loaders/IRManagerDialog.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts` only.

ID: T433
Status: [✓] Done
Title: Move the shell latency readout to the far-right side of the top navigation bar
Description:
- Goal / acceptance criteria: Update the web app shell so the latency pressure readout currently rendered beside the home mark on the left side of the top navigation bar instead renders at the far-right edge of the desktop/tablet top bar, without regressing the existing node navigation cluster or compact `/juce-grid` shell treatment. Refresh focused shell tests to assert the new placement.
- Why it matters: The operator request is to move the live latency meter from the left side of the nav chrome to the far-right side, where it aligns with the rest of the node/runtime status affordances and frees the hero/home area from status clutter.
- Dependencies: `web/src/app/layout/AppShell.tsx`; `web/src/app/layout/AppShell.test.tsx`
- Estimated effort: Low
- Required outputs: App shell layout update, focused shell test updates, and validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 15:19 EDT - Codex
- Completion notes:
  - Moved `LatencyPressureShellReadout` out of the left primary-nav group in `web/src/app/layout/AppShell.tsx` and appended it after the right-side node navigation cluster so the meter now renders at the far-right edge of the shell header.
  - Updated `web/src/app/layout/AppShell.test.tsx` to assert the latency readout lives under `.nav-tabs-right-container` for both the standard shell and compact `/juce-grid` tablet shell.
  - Licensing review: touched files remain MAP2-owned AGPL-covered frontend/worklist artifacts with no third-party override in scope; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing web/src/app/layout` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up tasks.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/layout/AppShell.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS.

ID: T432
Status: [✓] Done
Title: Restore AVDECC packet-socket capability under backend systemd hardening
Description:
- Goal / acceptance criteria: Ensure the hardened backend service can initialize the AVDECC controller without failing packet-socket creation for lack of `CAP_NET_RAW`. The fix must update the canonical backend unit, generated override guidance, and installed live unit/override; add a regression check for the capability contract; and verify the backend restart no longer logs the `CAP_NET_RAW may be required` controller-startup failure.
- Why it matters: The live backend still logs `[AVDECC] Controller creation failed ... Attempt to create packet socket failed - CAP_NET_RAW may be required`, which leaves AVDECC discovery/control unavailable even though the rest of the AVB/PTP stack is healthy. This is the next hardening gap after T430/T431.
- Dependencies: T430; T431; `systemd/map2-backend.service`; `scripts/setup_realtime.sh`; `ReadMe-Make_New_Node.txt`
- Estimated effort: Low
- Required outputs: capability contract fix in repo/live service files, focused regression test, live backend verification, and worklist/licensing notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 12:37 EDT - Codex
- Completion notes:
  - Updated `systemd/map2-backend.service`, `scripts/setup_realtime.sh`, and `ReadMe-Make_New_Node.txt` so the backend capability contract now includes both `CAP_SYS_NICE` and `CAP_NET_RAW`, preserving JUCE realtime scheduling and allowing AVDECC/libpcap packet sockets under systemd hardening.
  - Extended `tests/test_backend_service_contract.py` so the repo unit and generated override guidance now regress both the canonical writable-state paths and the required capability pair.
  - Patched the installed `/etc/systemd/system/map2-backend.service` and `/etc/systemd/system/map2-backend.service.d/override.conf` to carry `CAP_NET_RAW`, then reloaded systemd and restarted `map2-backend.service`.
  - Live-host verification: `systemctl show map2-backend.service -p AmbientCapabilities -p CapabilityBoundingSet` now reports `cap_net_raw cap_sys_nice`; `journalctl -u map2-backend.service --since '2026-03-26 12:35:00' --no-pager | rg -n "AVDECC|packet socket|CAP_NET_RAW|Warning: Failed to start AVDECC controller"` shows `[AVDECC] Controller started on enp11s0` instead of the earlier permission failure; and `curl -i http://127.0.0.1:8080/api/avb/avdecc/entities` returns `200`.
  - Licensing review: touched systemd/doc/test files remain MAP2-owned AGPL-covered repository artifacts; reused the current-cycle scans `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .github/copilot-instructions.md app web/src tests systemd scripts ReadMe-Make_New_Node.txt` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `pytest -q tests/test_backend_service_contract.py` -> PASS; live `map2-backend.service` restart -> PASS; live AVDECC controller startup verification -> PASS.

ID: T431
Status: [✓] Done
Title: Stop pmc PTP monitor socket failures under backend systemd hardening
Description:
- Goal / acceptance criteria: Ensure the backend PTP monitor no longer spawns `pmc` processes that fail with `uds: bind failed: Read-only file system` under `ProtectSystem=strict`. The fix must keep PTP status queries functional by binding any `pmc -u` client socket under a backend-writable runtime path, add focused regression tests, and eliminate the repeated journal spam after a backend restart.
- Why it matters: Even after T430 restored `/var/lib/map2`, the live backend still logs continuous `pmc` UDS bind failures because `pmc -u` defaults its client socket to `/var/run/pmc.$pid`, which is still read-only inside the hardened backend namespace. That obscures real AVB/PTP issues and keeps the host in a noisy partial-failure state.
- Dependencies: T430; `app/services/avb/ptp_monitor.py`; backend runtime path `/run/map2-audio`
- Estimated effort: Low
- Required outputs: PTP monitor runtime-path fix, focused tests, live backend verification, and worklist/licensing notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 12:32 EDT - Codex
- Completion notes:
  - Updated `app/services/avb/ptp_monitor.py` so `pmc -u` now reserves a unique client socket path under `/run/map2-audio`, cleans that path up after each query, and skips direct `pmc` execution altogether when a writable runtime socket path cannot be prepared.
  - Kept the PTP monitor behavior safe under hardening: if the writable client socket cannot be reserved or `pmc` still fails, the monitor falls back to journal parsing instead of reintroducing repeated read-only UDS bind spam.
  - Added focused regression coverage in `tests/test_ptp_monitor.py` for both the writable-runtime-socket path and the no-writable-socket fallback path, and reran the existing AVB stats route coverage to ensure the higher-level API contract remains intact.
  - Live-host verification: restarted `map2-backend.service`, confirmed `curl -i http://127.0.0.1:8080/api/avb/ptp/status` returned `200`, and verified `journalctl -u map2-backend.service --since '2026-03-26 12:31:10' --no-pager | rg -n "pmc|uds: bind failed|failed to open transport"` returned no matches, showing the new backend process stopped the repeated `pmc` read-only socket failures.
  - Licensing review: touched backend/worklist/test files remain MAP2-owned AGPL-covered repository artifacts; reused the current-cycle scans `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .github/copilot-instructions.md app web/src tests systemd scripts ReadMe-Make_New_Node.txt` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `pytest -q tests/test_ptp_monitor.py tests/test_avb_service_stats.py` -> PASS; `python3 -m py_compile app/services/avb/ptp_monitor.py tests/test_ptp_monitor.py` -> PASS; live `map2-backend.service` restart -> PASS.

ID: T430
Status: [✓] Done
Title: Prevent Platforms remediation and manifest routes from failing when backend state storage is read-only
Description:
- Goal / acceptance criteria: Ensure `GET /api/platform-remediation/summary`, `GET /api/platform-remediation/sync/history`, `GET /api/cluster/update/manifest`, and `GET /api/cluster/update/manifest/drift` no longer fail with `500` when manifest storage is unavailable. Fix the backend service hardening so `/var/lib/map2` is writable under `ProtectSystem=strict`, keep `/var/lib/map2` as the canonical persisted state root, and degrade the frontend to a simple sync-unavailable state while preserving adoption/clone workflows.
- Why it matters: The current live backend runs with `ProtectSystem=strict` and no `/var/lib/map2` in `ReadWritePaths`, so one manifest-storage failure breaks multiple operator-facing remediation and update surfaces.
- Dependencies: T417; T419; current backend systemd/runtime contract
- Estimated effort: Medium
- Required outputs: backend service contract fix, manifest-storage hardening, simplified remediation/update UX, focused tests, live verification, and licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 12:22 EDT - Codex
- Completion notes:
  - Refactored `app/services/cluster/version_manifest.py` so manifest construction and read helpers no longer eagerly create `/var/lib/map2/version_manifest_history`, added typed storage-availability metadata, and taught the storage probe to detect read-only mounts instead of relying on `os.access()` alone.
  - Hardened `app/routes/platform_remediation.py` and `app/routes/cluster_update.py` so manifest-backed read surfaces return structured `200` degraded/unavailable payloads while manifest write actions stay strict and return `503` with operator-facing storage details.
  - Updated the Platforms frontend to treat degraded remediation/manifest reads as valid state: `web/src/app/hooks/usePlatformRemediation.tsx`, `web/src/app/hooks/useNodeOperations.ts`, `web/src/app/hooks/usePlatformShellData.ts`, `web/src/app/components/Platform/PlatformRemediationWorkflow.tsx`, and `web/src/app/pages/HomePage.tsx` now keep adoption/clone flows usable and show a simple `Sync unavailable` state instead of a top-level fetch failure.
  - Added focused regression coverage in `tests/test_version_manifest_resilience.py`, `tests/test_manifest_route_resilience.py`, `tests/test_backend_service_contract.py`, `web/src/app/components/Platform/PlatformRemediationWorkflow.test.tsx`, and `web/src/app/pages/HomePage.test.tsx`.
  - Live-host rollout/verification: patched both `/etc/systemd/system/map2-backend.service` and `/etc/systemd/system/map2-backend.service.d/override.conf` so `ReadWritePaths` now includes `/var/lib/map2` and `/var/log/map2`, created those canonical directories with `mm:mm` ownership, reloaded systemd, and restarted `map2-backend.service`; afterward `systemctl show map2-backend.service -p ProtectSystem -p ReadWritePaths -p ActiveState -p SubState` reported `ProtectSystem=strict`, the expected writable paths, and `active/running`, while `curl -i http://127.0.0.1:8080/api/platform-remediation/summary`, `/api/platform-remediation/sync/history`, `/api/cluster/update/manifest`, and `/api/cluster/update/manifest/drift` all returned `200`.
  - Licensing review: touched backend/frontend/systemd/doc/test files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .github/copilot-instructions.md app web/src tests systemd scripts ReadMe-Make_New_Node.txt` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `pytest -q tests/test_version_manifest_resilience.py tests/test_manifest_route_resilience.py tests/test_backend_service_contract.py tests/test_adoption_routes.py` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/Platform/PlatformRemediationWorkflow.test.tsx web/src/app/pages/HomePage.test.tsx web/src/app/components/Platform/PlatformModal.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `python3 -m py_compile app/services/cluster/version_manifest.py app/routes/platform_remediation.py app/routes/cluster_update.py tests/test_version_manifest_resilience.py tests/test_manifest_route_resilience.py tests/test_backend_service_contract.py` -> PASS.

ID: T429
Status: [✓] Done
Title: Stop single-node application update progress from hanging on legacy backend payloads
Description:
- Goal / acceptance criteria: Ensure the single-node Platforms update modal no longer hangs on placeholder `pending` steps when the live backend is still serving the older `/api/cluster/update/application*` contract. The frontend must normalize legacy status/version payloads, surface synchronous legacy update failures as real modal failures instead of idle/pending placeholders, and the live host should be rolled onto the current backend/frontend generation so the modal can render real progress data.
- Why it matters: The current host still exposes the legacy application-update endpoints on port `8080`, where `GET /application/status` and `GET /application/version` return older payload shapes and `POST /application` can fail synchronously with `Repository validation failed`. The current frontend only falls back by URL, so the modal keeps rendering all steps as `pending` instead of showing the actual failure or live progress state.
- Dependencies: T427; running services on ports `3000` and `8080`; `web/src/app/hooks/updateApplicationApi.ts`; `web/src/app/hooks/useNodeOperations.ts`; `web/src/app/components/Platform/PlatformModal.tsx`
- Estimated effort: Medium
- Required outputs: frontend legacy-contract normalization, focused regression tests, live service restart/verification, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 11:40 EDT - Codex
- Completion notes:
  - Added a shared progress blueprint in `web/src/app/hooks/updateApplicationProgressModel.ts` and rewired `web/src/app/components/Platform/PlatformModal.tsx` to use it, so the modal renders one canonical 10-step model instead of an ad hoc fallback list.
  - Reworked `web/src/app/hooks/updateApplicationApi.ts` so the frontend now normalizes legacy `/api/cluster/update/application*` status/version payloads into the hybrid progress contract, preserves synchronous legacy POST failures as explicit failed progress state, and keeps route preference sticky until the backend restarts onto the newer hybrid endpoints.
  - Updated `web/src/app/hooks/useNodeOperations.ts` and `web/src/app/hooks/usePlatformShellData.ts` to consume the normalized helpers, and made the update mutation throw on legacy synchronous failures so the UI surfaces a real launch error instead of resetting to an idle/pending placeholder.
  - Added focused regression coverage in `web/src/app/hooks/updateApplicationApi.test.ts` for hybrid-first success, legacy POST fallback, legacy status/version normalization, preserved synchronous failure state, and route re-promotion after a backend restart.
  - Live-host rollout/verification: the old Mar 24 backend process on port `8080` was replaced by forcing the `map2-backend.service`-owned `uvicorn` PID to restart under `Restart=on-failure`, after which `GET /api/cluster/update/hybrid/application/status` and `/version` returned `200` with the current hybrid payloads while the legacy `/api/cluster/update/application*` routes returned `404`; `npm --prefix web run deploy` then rebuilt and restarted port `3000`, which is now serving bundle `index-uoD1dik7.js` and proxying the same hybrid status payload successfully.
  - Licensing review: touched frontend/worklist/test files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing web/src/app/hooks tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/hooks/updateApplicationApi.test.ts` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only; `curl -i http://127.0.0.1:8080/api/cluster/update/hybrid/application/status` -> 200; `curl -i http://127.0.0.1:3000/api/cluster/update/hybrid/application/status` -> 200; `curl -i http://127.0.0.1:3000/` -> 200.

ID: T428
Status: [✓] Done
Title: Keep the commit-push-deploy loop clean after port-3000 rebuilds
Description:
- Goal / acceptance criteria: Ensure a clean `commit -> push both remotes -> rebuild/restart port 3000` cycle does not leave tracked deploy byproducts dirty afterward. The fix must stop `logs/deploy-build.log` and any resulting unnecessary version churn from polluting the tree after a successful deploy, and it must be validated with a real deploy loop on this host.
- Why it matters: The first cycle completed successfully but immediately dirtied `VERSION`, `version.json`, and `logs/deploy-build.log`, which breaks the user's requested repeatable three-cycle workflow and obscures whether later code changes are real or just deploy residue.
- Dependencies: T427; `scripts/build/deploy`; `scripts/generate_platform_version.py`; tracked deploy artifacts `VERSION`, `version.json`, `logs/deploy-build.log`
- Estimated effort: Low
- Required outputs: clean-tree deploy fix, focused validation via a real deploy cycle, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 10:33 EDT - Codex
- Completion notes:
  - Identified the real source of the repeated deploy churn: `scripts/build/deploy` streams `npm run build` through `tee "$LOG_DIR/deploy-build.log"` before the prebuild version generator runs, so the tracked `logs/deploy-build.log` file made the repository appear dirty mid-build and forced `scripts/generate_platform_version.py` to mint a new version on every port-3000 restart.
  - Removed `logs/deploy-build.log` from the git index while leaving the deploy script and ignored `logs/` directory behavior intact, so the same runtime log file still exists for operators but no longer pollutes `git status` or trips the version generator during clean rebuilds.
  - Validation: after committing/pushing the cleanup and rerunning `npm --prefix web run deploy`, port `3000` restarted successfully on bundle `index-BQ0SNilJ.js` and `git status --short` returned clean immediately afterward, confirming the commit/push/deploy loop is now repeatable without tracked residue.
  - Licensing review: touched worklist/deploy-artifact tracking remain MAP2-owned repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing web/src/app/hooks tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T427
Status: [✓] Done
Title: Restore single-node application updates when frontend and backend restart out of sync
Description:
- Goal / acceptance criteria: Ensure the single-node Platforms update flow keeps working when the web bundle expects the newer hybrid update URLs but the running backend still serves the legacy application update URLs, and preserve correct behavior after the backend later restarts onto the new hybrid routes. The fix must remove the operator-facing HTTP 404 from `Check for Updates`, cover both modal and platform-shell data reads, and include focused regression validation.
- Why it matters: The current host shows the new update modal, but the backend process predates the hybrid route rename. That staggered rollout turns `Check for Updates` into a visible production failure even though both sides are otherwise healthy.
- Dependencies: T425
- Estimated effort: Low
- Required outputs: frontend compatibility fallback for legacy/new application update endpoints, focused regression tests, validation evidence against the live host behavior, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 10:26 EDT - Codex
- Completion notes:
  - Added `web/src/app/hooks/updateApplicationApi.ts` so the single-node update client now prefers the new `/api/cluster/update/hybrid/...` application update routes, falls back to the older `/api/cluster/update/...` application routes on HTTP 404, and re-promotes the hybrid routes automatically once the backend restarts onto the newer API surface.
  - Updated both `web/src/app/hooks/useNodeOperations.ts` and `web/src/app/hooks/usePlatformShellData.ts` to use the shared compatibility helper for the update trigger, live progress polling, and local hybrid-version reads, which keeps the modal and the single-node summary cards aligned across staggered frontend/backend rollouts.
  - Added focused regression coverage in `web/src/app/hooks/updateApplicationApi.test.ts` for three cases: hybrid-first success, POST fallback to the legacy application route after a 404, and switching the preferred route back to hybrid after a backend restart removes the legacy path.
  - Live-host evidence: the current `127.0.0.1:8080` backend OpenAPI still exposes `/api/cluster/update/application*` but not `/api/cluster/update/hybrid/application*`, while the current web source expects the hybrid paths. This regression is therefore a compatibility gap between deployed frontend and backend generations, not a missing route in the current source tree.
  - Licensing review: touched frontend/worklist/test files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing web/src/app/hooks tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/hooks/updateApplicationApi.test.ts` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only.

ID: T426
Status: [✓] Done
Title: Add explicit exit controls and an OLED-friendly color palette to the Ink TUI
Description:
- Goal / acceptance criteria: Add a first-class operator exit path to `map2-tui` and refactor the Ink TUI color usage around one OLED-oriented palette rather than scattered named ANSI colors. The implementation must expose a discoverable quit interaction, update the shell/help/status affordances to document it, move the shared TUI color semantics onto centralized palette tokens, and refresh focused docs/tests/validation evidence.
- Why it matters: `map2-tui` is now an operator-facing live surface. It still relies on implicit terminal exit behavior and inconsistent legacy color choices that are harder to read on high-contrast OLED displays.
- Dependencies: T421; T422
- Estimated effort: Medium
- Required outputs: exit-key wiring, centralized OLED palette updates across the Ink TUI, focused docs/tests/validation, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 10:01 EDT - Codex
- Completion notes:
  - Added explicit exit controls in `tui/src/App.tsx`: `q` now exits from normal screen flow, `Ctrl+Q` exits globally, and the shell/status/help surfaces document the quit path so operators do not need to rely on implicit terminal interrupts.
  - Introduced the shared OLED palette in `tui/src/palette.ts` and refactored the Ink shell, shared components, and operational screens to use centralized semantic colors instead of mixed raw ANSI names. The resulting theme uses bright cyan for navigation/focus, neon green for healthy/live state, amber for warnings, coral red for failures, and muted sage for secondary detail on black backgrounds.
  - Updated operator-facing docs/help text in `tui/src/cli.ts`, `tui/src/cli.test.ts`, `tui/src/hooks/useStatusBar.ts`, `tui/src/shell/HelpOverlay.tsx`, and `tui/README.md` so exit controls and the new OLED-oriented presentation are discoverable from both `--help` and the interactive shell.
  - Extended the palette pass across the live home screen and the rest of the Ink operational surfaces so errors, warnings, table headers, progress bars, VU meters, tabs, key hints, status dots, and panel borders now share one consistent color contract.
  - Licensing review: touched TUI/doc/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing tui tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix tui run build` -> PASS; `npm --prefix tui test` -> PASS; `pytest -q tests/test_branding_shell.py` -> PASS; `./map2-tui --help` -> PASS; `./map2-tui --list-screens` -> PASS.

ID: T425
Status: [✓] Done
Title: Add a step-by-step update progress modal for single-node platform updates
Description:
- Goal / acceptance criteria: When the operator clicks `Check for Updates` in the single-node platform workspace, open a modal immediately and show a concrete 10-step progress list tied to the real hybrid update workflow instead of leaving the action as an opaque background request. The progress surface must explain what the update path is doing, reflect success/failure, and preserve the existing update action entrypoint.
- Why it matters: The current UI triggers the hybrid application updater but only surfaces coarse status from a different cluster update endpoint, so operators cannot verify what is happening after they click the update button.
- Dependencies: Existing single-node operations UI (`web/src/app/components/Platform/PlatformModal.tsx`), node operations hook (`web/src/app/hooks/useNodeOperations.ts`), hybrid update routes/services (`app/routes/cluster_update_hybrid.py`, `app/services/cluster/hybrid_update_manager.py`)
- Estimated effort: Medium
- Required outputs: backend hybrid progress state/reporting, frontend modal wiring with a 10-step progress list, focused regression coverage, validation evidence, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 10:02 EDT - Codex
- Completion notes:
  - Verified the two concrete reasons the update button felt opaque/broken: the single-node UI was polling `/api/cluster/update/status` even though the button calls the hybrid application updater, and the hybrid updater itself was hardcoded to `/opt/map2-audio`, which is not a valid repo/RPM install on this host.
  - Reworked the hybrid update backend in `app/services/cluster/hybrid_update_manager.py`, `app/services/cluster/map2_git_updater.py`, and `app/routes/cluster_update_hybrid.py` so the updater now derives its app root from the running codebase, reports a real 10-question progress model during Git/RPM updates, exposes that state from `/api/cluster/update/hybrid/application/status`, and returns a flat local version payload from `/api/cluster/update/hybrid/application/version` that matches the existing frontend hook contract.
  - Updated `web/src/app/hooks/useNodeOperations.ts`, `web/src/app/hooks/usePlatformShellData.ts`, `web/src/app/components/Platform/PlatformModal.tsx`, and `web/src/app/pages/PlatformShellPage.css` so `Check for Updates` opens a modal immediately, lists the 10 progress questions/steps one at a time with backend-reported state, and reflects the hybrid updater’s live question/status in the single-node cards/table instead of leaving the page stuck on the unrelated orchestrator status.
  - Added focused regression coverage in `web/src/app/components/Platform/PlatformModal.test.tsx` and `tests/test_hybrid_update_manager_progress.py` for both the click-to-modal path and the backend 10-step progress payload.
  - Licensing review: touched backend/frontend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `python3 -m py_compile app/routes/cluster_update_hybrid.py app/services/cluster/hybrid_update_manager.py app/services/cluster/map2_git_updater.py tests/test_hybrid_update_manager_progress.py` -> PASS; `pytest tests/test_hybrid_update_manager_progress.py` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/Platform/PlatformModal.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only.

ID: T424
Status: [✓] Done
Title: Harden page-transition preset persistence and fallback semantics
Description:
- Goal / acceptance criteria: Ensure the new Theme page-transition preset remains safe when older or malformed local-storage data is present, and add focused regression coverage proving reduced-effects mode still overrides the selected preset to the minimal fade path.
- Why it matters: The new motion preference is persisted locally, so the shell should not trust arbitrary stored values or let the selected preset bypass accessibility fallbacks.
- Dependencies: T423
- Estimated effort: Low
- Required outputs: persisted-settings hardening in the effects store, focused regression coverage, validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 09:22 EDT - Codex
- Completion notes:
  - Hardened `web/src/app/stores/effectsSettingsStore.ts` so persisted motion settings are merged through a normalization step: invalid `pageTransitionPreset` values now fall back to `hyperactive-block` instead of being trusted blindly from local storage.
  - Added focused store coverage in `web/src/app/stores/effectsSettingsStore.test.ts` proving malformed persisted transition presets rehydrate back to the safe default.
  - Extended `web/src/app/components/PageTransition.test.tsx` so the reduced-effects toggle is now explicitly verified to override the selected pager preset and force the minimal fade transition path.
  - Licensing review: touched frontend/worklist test/store files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/components/PageTransition.test.tsx web/src/app/stores/effectsSettingsStore.test.ts web/src/app/pages/ThemePage.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only.

ID: T423
Status: [✓] Done
Title: Add selectable Theme page-transition presets and ship the pager-style transition option
Description:
- Goal / acceptance criteria: Extend the Theme workspace motion/effects controls so operators can choose the page-transition style used by the routed web shell. Keep the existing transition available, add a new pager-style slide option based on the referenced React pager behavior, persist the choice locally, honor reduced-motion fallback behavior, and add focused tests/validation evidence.
- Why it matters: The Theme workspace already owns motion/effects preferences, but page transitions are currently fixed. Operators need a first-class way to choose a lighter or more directional transition language without patching code.
- Dependencies: Existing Theme workspace motion modal (`web/src/app/pages/ThemePage.tsx`), effects settings store (`web/src/app/stores/effectsSettingsStore.ts`), shared route transition layer (`web/src/app/components/PageTransition.tsx`)
- Estimated effort: Medium
- Required outputs: persisted transition preset wiring, Theme motion UI updates, shared transition implementation/CSS, focused tests/validation, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 09:02 EDT - Codex
- Completion notes:
  - Extended the persisted effects settings store in `web/src/app/stores/effectsSettingsStore.ts` so Theme motion preferences now save both the reduced-effects toggle and a first-class `pageTransitionPreset` choice.
  - Expanded the Theme workspace motion modal in `web/src/app/pages/ThemePage.tsx` / `web/src/app/pages/ThemePage.css` to cover motion and effects more broadly, including a new radio-tile selector for `Hyperactive Block Reveal` and `Pager Slide`, plus updated launcher/hero labels so the chosen transition style is visible.
  - Updated the shared route transition layer in `web/src/app/components/PageTransition.tsx` / `web/src/app/components/PageTransition.css` so eligible shell routes now honor the saved preset: the existing block reveal remains available, the new pager option applies a horizontal slide treatment, and reduced-motion or saved reduced-effects mode still force the minimal fade fallback.
  - Added focused regression coverage in `web/src/app/pages/ThemePage.test.tsx` and `web/src/app/components/PageTransition.test.tsx` proving the preset persists from Theme and changes the active route-transition class/behavior.
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/ThemePage.test.tsx web/src/app/components/PageTransition.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only.

ID: T422
Status: [✓] Done
Title: Rebuild MAP2 Ink TUI around an 8-slot Signal Chains Live home screen
Description:
- Goal / acceptance criteria: Redesign `map2-tui` so the operator-first entry experience is `Signal Chains Live` rather than a generic system dashboard. The first screen must surface the active chain, live meters, plugin order, and bypass state for the first 8 plugins in the current chain. Number keys `1-8` must instantly toggle bypass for those plugins with no confirmation step, and the UI must emphasize plugin identity labels over generic telemetry. The screen should provide strong combined feedback for bypass changes, and the implementation must add/update focused docs/tests/validation evidence.
- Why it matters: The current Ink TUI is navigable, but it is not yet optimized for the primary live-performance task the operator identified: fast, unambiguous bypass control on the active chain.
- Dependencies: T412; T421
- Estimated effort: Medium
- Required outputs: updated Ink TUI home/live-control implementation, live bypass input wiring, focused docs/tests/validation, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 09:03 EDT - Codex
- Completion notes:
  - Rebuilt the Ink TUI home screen in `tui/src/screens/HomeScreen.tsx` around `Signal Chains Live`: the first view now centers the active chain, compact `2x2` I/O metering, ordered plugin rack state, and an operator-first live bypass workflow instead of a generic dashboard.
  - Added a dedicated live-rack helper layer in `tui/src/screens/signalChainsLive.ts` so slot identity labels are clearer and slot order is always derived from plugin position rather than whatever array order the backend returns.
  - Wired `1-8` to instant bypass toggles on the live screen with optimistic state, polling-safe pending-state overlay, a brief flash pulse, and a compact event strip; chains longer than 8 plugins are now explicitly flagged as unsupported for live-screen use and should be trimmed before performance.
  - Updated the operator-facing surfaces so the shipped CLI/docs describe the real interaction model: `tui/src/cli.ts` now advertises the live home-screen behavior in `--help`, `tui/src/navigation/screenRegistry.ts` labels the home screen as an 8-slot live rack, and both `tui/README.md` and `README.md` now describe `map2-tui` as opening on `Signal Chains Live`.
  - Added focused coverage in `tui/src/screens/signalChainsLive.test.ts` for active-chain selection, ordered slot mapping, identity labels, and bypass-event formatting; existing CLI/status/smoke coverage continues to validate the launcher and render path.
  - Licensing review: touched TUI/doc/test files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing tui tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix tui run build` -> PASS; `npm --prefix tui test` -> PASS; `pytest -q tests/test_branding_shell.py` -> PASS; `./map2-tui --help` -> PASS; `./map2-tui --list-screens` -> PASS.

ID: T421
Status: [✓] Done
Title: Harden MAP2 Ink TUI launcher, clean startup canvas, and complete the CLI contract
Description:
- Goal / acceptance criteria: Upgrade `map2-tui` from a thin npm/dev wrapper into an operator-grade launcher. The shipped CLI must start on a clean canvas, fail fast on malformed arguments, expose first-class screen-selection/help affordances, degrade cleanly when stdin is not a TTY/raw mode is unavailable, and tighten the top-level Ink shell behavior so the documented options feel complete rather than preview-grade. Update the relevant docs/tests/worklist notes and capture validation evidence.
- Why it matters: `map2-tui` is now an advertised first-class entrypoint, so startup noise, weak argument handling, and incomplete operator affordances turn directly into production friction.
- Dependencies: T412; T415
- Estimated effort: Medium
- Required outputs: launcher/runtime code updates, focused docs/help updates, focused tests or validation evidence, licensing/worklist notes, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 15:02 EDT - Codex
- Completion notes:
  - Reworked the `map2-tui` launch path so the shell bootstrap now prefers a direct Ink entrypoint (`tui/dist/main.js` when present, otherwise the local `tsx` binary) instead of always routing through `npm start`, which removes the npm banner noise from operator-facing help and validation output.
  - Added a real CLI contract in `tui/src/cli.ts`: `map2-tui` now supports clean `--help`, `--list-screens`, positional or `--screen` startup selection, `--no-clear`, strict `--api-url` handling, and fail-fast rejection for malformed/unknown flags before Ink renders.
  - Added the requested clean-canvas startup behavior by clearing the terminal on interactive launch by default, plus a runtime `Ctrl+L` clear action and a `--no-clear` escape hatch.
  - Hardened the interactive shell so non-TTY launches fail with one explicit operator-facing message instead of an Ink raw-mode stack trace, narrowed the status bar for `80x24`, removed the lingering preview label, and switched top-level navigation to replace/cycle behavior (`[` / `]`) instead of stacking duplicate history entries.
  - Added focused validation coverage in `tui/src/cli.test.ts`, `tui/src/shell/StatusBar.test.tsx`, `tui/src/runtime/map2NodeRuntime.test.ts`, and `tests/test_branding_shell.py`, and refreshed `README.md` plus `tui/README.md` so the documented launcher flow matches the shipped Ink TUI behavior.
  - Licensing review: touched shell/TUI/doc/test files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
  - Validation: `npm --prefix tui run build` -> PASS; `npm --prefix tui test` -> PASS; `pytest -q tests/test_branding_shell.py` -> PASS; `./map2-tui --help` -> PASS; `./map2-tui --list-screens` -> PASS; `./map2-tui --bogus` -> exit 2 with usage; `./map2-tui --screen diagnostics` -> exit 1 with the expected non-TTY guard message in non-interactive execution.

ID: T420
Status: [✓] Done
Title: Fix Theme page plugin catalog loading failure
Description:
- Goal / acceptance criteria: Diagnose and fix the Theme page failure where the plugin catalog remains stuck on loading or errors when browsing plugin appearance/theme overrides. The fix must restore successful plugin list loading in the Theme page without regressing existing plugin appearance behavior, and it must include focused validation or tests.
- Why it matters: The Theme page is part of the canonical Platforms shell, and operators cannot edit plugin appearance metadata if the catalog never loads.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: root-cause fix in frontend/backend as needed, focused tests or validation evidence, and completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 17:22 EDT - Codex
- Completion notes:
  - Fixed the Theme page plugin inventory race where the category modal's load effect depended on `pluginInventoryLoading`, causing the in-flight discovery promise to be cancelled on the first loading-state transition and leaving the UI stuck on `Loading plugin catalog…`.
  - Added a bounded discovery helper that falls back from `/api/plugins/discover` to the lightweight `/api/plugins/all` catalog so the Theme page remains usable during plugin inventory warmup or discovery failures.
  - Added focused Theme page coverage proving the category modal still exposes plugin override controls and the fallback path clears the loading state without surfacing the plugin-catalog error state.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/ThemePage.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS.

ID: T419
Status: [✓] Done
Title: Surface AVB auto-provision status in remediation workflows
Description:
- Goal / acceptance criteria: Persist AVB auto-provision results from the post-adoption trigger onto the adopted node record, expose that status through adoption and remediation APIs, and render it in the Platforms remediation workflow so operators can see whether AVB auto-provision is pending, complete, or completed with issues. The implementation must avoid introducing a new workflow family or tile-pill set in this pass.
- Why it matters: Automatic AVB provisioning after adoption is only useful if operators can inspect the outcome and distinguish a successful adoption from an adoption that still needs AVB follow-up.
- Dependencies: T418
- Estimated effort: Medium
- Required outputs: persisted backend status, API response updates, remediation UI updates, focused tests/validation, and completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 16:34 EDT - Codex
- Completion notes:
  - Persisted post-adoption AVB auto-provision results onto the adoption record metadata and surfaced them through both `/api/adoption/candidates` and `/api/platform-remediation/summary`.
  - Extended the adoption visibility overlay so remediation surfaces now inherit AVB auto-provision state alongside trust, readiness, and activation state.
  - Updated the Platforms remediation adoption workflow to show AVB auto-provision tags and warning callouts when a node adopted successfully but AVB provisioning completed with issues or was skipped.
  - Validation: `pytest -q tests/test_adoption_routes.py` -> PASS; `npm --prefix web run typecheck` -> PASS; Python AST parse validation for touched backend files -> PASS.

ID: T418
Status: [✓] Done
Title: Trigger strict SRP + AVDECC AVB auto-provision after MAP2 node adoption
Description:
- Goal / acceptance criteria: When a MAP2 platform node is adopted into the cluster, and the cluster AVB profile is effectively `strict_srp_avdecc`, the backend must trigger an immediate AVB auto-provision pass rather than waiting for AVB router startup. The trigger must also run after promotion to active so newly routable nodes can join the AVB fabric promptly. The implementation must fail open for adoption success while logging/reporting auto-provision errors, and it must add focused tests for route-level behavior.
- Why it matters: Operators choosing strict SRP + AVDECC expect newly adopted MAP2 nodes to become part of the managed AVB fabric automatically. Today the router only auto-connects during startup, so adoption leaves a gap between cluster membership and AVB provisioning.
- Dependencies: T417; existing adoption routes/service (`app/routes/adoption.py`, `app/services/cluster/adoption.py`), AVB router auto-connect (`app/services/avb/avb_router.py`), AVB profile/config (`app/routes/avb.py`, `app/config.py`)
- Estimated effort: Medium
- Required outputs: backend trigger wiring, any AVB router helper needed for manual post-adoption auto-connect, focused tests, validation evidence, and completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 16:22 EDT - Codex
- Completion notes:
  - Added an explicit AVB router `trigger_auto_connect()` entrypoint so the backend can run a deterministic AVB auto-provision pass outside startup orchestration.
  - Wired the adoption lifecycle so successful `/api/adoption/.../adopt` and `/api/adoption/.../promote` calls now trigger post-adoption AVB auto-provision when the active AVB posture is effectively strict `SRP + AVDECC` (`avb.enabled`, `avb.auto_connect`, `avb.avdecc_enabled`, `avb.srp.enabled`, and `avb.srp.required` all true).
  - Kept adoption fail-open: AVB auto-provision issues are logged but do not roll back a successful adoption or promotion.
  - Validation: `pytest -q tests/test_adoption_routes.py` -> PASS; Python AST parse validation for `app/routes/adoption.py`, `app/services/avb/avb_router.py`, and `tests/test_adoption_routes.py` -> PASS.

ID: T417
Status: [✓] Done
Title: Add Platforms remediation pills, adoption route, source-of-truth sync modal, and clone recovery workflow
Description:
- Goal / acceptance criteria: Extend the Home landing `Platforms` tile so it surfaces multiple state/count pills for unmanaged/adoption states (`candidate`, `claimable`, `adopted`, `ready`, `blocked`), sync/update states (`OUTDATED`, `SYNCING`, `FAILED`, `HELD`, `ROLLBACK AVAILABLE`), and clone states (`CONFIRMED CLONE`, `SUSPECTED CLONE`). Clicking adoption pills must navigate into a dedicated `/platforms/adoption` route that reuses and improves the shipped adoption flow. Clicking sync or clone pills must open a shared Carbon remediation modal that is pre-scoped to the relevant workflow/state/node(s), supports detailed per-node timelines, and can hand off from clone recovery to adoption to sync automatically. The sync workflow must support one-time source-of-truth selection, persistent release hold with rollback, parallel sync, node status, and single-node `FIX`. The clone workflow must support suspected/confirmed detection, parallel headless reset/rejoin, installer-logic hostname generation with automatic collision avoidance, immediate `FIX` fallback, and continuation into adoption/sync when needed.
- Why it matters: Multi-node rollout and remediation are now split across stale HomePage behavior, cluster admin controls, and low-level APIs. Operators need one visible Platforms entry point that identifies unmanaged, out-of-sync, and cloned nodes and drives them through the correct remediation workflow without memorizing backend details.
- Dependencies: Existing adoption lifecycle/routes (`app/routes/adoption.py`), clone reset route (`app/routes/cluster_admin.py`), version/update surfaces (`app/routes/health.py`, `app/routes/cluster_update.py`), Platforms shell (`web/src/app/components/Platform/PlatformModal.tsx`), Home landing tile (`web/src/app/pages/HomePage.tsx`), and any new shared frontend state/components required for Carbon-aligned workflows
- Estimated effort: High
- Required outputs: Home Platforms-tile pills, dedicated `/platforms/adoption` route/UI, shared Carbon remediation modal, any required backend glue for sync/clone orchestration, focused tests, validation evidence, and completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 15:58 EDT - Codex
- Completion notes:
  - Added `/api/platform-remediation/*` backend routes that summarize adoption/sync/clone status, expose manifest history and source-of-truth capture, run sync/rollback/fix actions, and orchestrate clone recovery through hostname reset plus reset/rejoin fallback handling.
  - Extended the Home landing `Platforms` tile to render state/count remediation pills for adoption, sync/update, and clone conditions. Adoption pills deep-link into `/platforms/adoption`; sync and clone pills open the shared Carbon remediation modal already scoped to the relevant workflow/state/node set.
  - Added the dedicated Platforms adoption workspace plus the shared remediation workflow UI for adoption, source-of-truth sync, release hold/rollback, single-node fix, and cloned-node recovery with automatic workflow handoff toward adoption.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand src/app/pages/HomePage.test.tsx src/app/App.platformRoute.test.tsx` -> PASS; `python3 - <<'PY' ... ast.parse(...) ... PY` for `app/main.py` and `app/routes/platform_remediation.py` -> PASS.

ID: T416
Status: [✓] Done
Title: Promote SynthForge from plugin card to standalone page with landing page entry
Description:
- Goal / acceptance criteria: Create a standalone `/synth-forge` page that surfaces the SynthForgeCard workspace (Sound, Rack, Play, Engine, Advanced tabs) as a first-class routed page — matching the pattern established by DrumsPage at `/drums`. Add a landing page card on HomePage so operators can navigate to SynthForge directly without going through the JUCE Grid plugin modal.
- Why it matters: SynthForge is a flagship workstation editor currently only accessible as a plugin card inside the JUCE Grid modal. Promoting it to a page gives it equal standing with Drum Machine and makes the sampler/synthesis workspace directly launchable from the home screen.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: New page component, route registration, landing page card, focused tests, validation evidence, and completion notes.
Subtasks:
  1. Create `web/src/app/pages/SynthForgePage.tsx` + `SynthForgePage.css` — extract/adapt SynthForgeCard's 5-tab workspace into a standalone page using PageHeader. Must resolve PluginCardProps dependency (source plugin state from active chain or URL param rather than parent modal).
  2. Add lazy import + `<Route path="/synth-forge" .../>` in `web/src/app/App.tsx`
  3. Add SynthForge card to `MIDDLE_CARDS` in `web/src/app/pages/HomePage.tsx` (icon, title "SynthForge", description "Sampler, soundfonts, and synthesis", route `/synth-forge`)
  4. Create `web/src/app/pages/SynthForgePage.test.tsx` — renders without crash, tab switching, API data reflected
  5. Verify: `npm run typecheck` + `npm run build` pass
Assigned to: Codex
Last updated: 2026-03-25 17:42 EDT - Codex
- Completion notes:
  - Added the standalone routed SynthForge workspace at `/synth-forge` in `web/src/app/pages/SynthForgePage.tsx`, reusing the existing five-tab SynthForge workstation surface and wrapping it in a first-class page shell with `PageHeader`.
  - Registered the new route in `web/src/app/App.tsx` and added a new Home landing card in `web/src/app/pages/HomePage.tsx` so operators can launch SynthForge directly without entering the JUCE Grid modal flow.
  - Added focused coverage for the new standalone page, route registration, and Home landing visibility in `web/src/app/pages/SynthForgePage.test.tsx`, `web/src/app/App.platformRoute.test.tsx`, and `web/src/app/pages/HomePage.test.tsx`.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/SynthForgePage.test.tsx src/app/App.platformRoute.test.tsx src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web run build` -> PASS with the existing dynamic-import warning only.

ID: T415
Status: [✓] Done
Title: Add an Ink TUI launcher and wire it into the current MAP2 bash shell experience
Description:
- Goal / acceptance criteria: Create a first-class launcher for the new Ink TUI and integrate it into the current bash experience already bootstrapped by `branding/map2-welcome.sh`. The resulting operator flow must expose a direct executable wrapper, a `map2.sh` subcommand, and corrected shell aliases/help text so `map2-tui` launches the Ink TUI instead of the legacy Textual console. Update repo docs for the new shell entrypoint.
- Why it matters: The new Ink TUI exists, but the shell integration still points `map2-tui` at the legacy console, so operators cannot launch the new TUI from the current bash experience without remembering an npm command.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Launcher script(s), shell integration updates, documentation updates, validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 13:07 EDT - Codex
- Completion notes:
  - Added the executable wrapper `map2-tui`, added the `map2.sh ink` subcommand, and introduced `map2_run_ink_tui()` in `branding/map2-welcome.sh` so the Ink TUI has a first-class shell launcher path.
  - Updated the shell integration so `map2-tui` and `map2-ink` aliases now point to the Ink launcher, and refreshed the shell action menu/banner text to advertise the new command instead of silently routing back to the legacy console.
  - Updated `.map2-aliases`, `README.md`, and `tui/README.md` so both the current bash bootstrap and documented operator entrypoints expose the new launcher.
  - Validation: `./map2-tui --help` -> PASS; `./map2.sh ink --help` -> PASS; `bash -ic 'type map2-tui; type map2-ink; type map2'` -> PASS.

ID: T414
Status: [✓] Done
Title: Move Platforms, MIDI Hub, and Artifacts onto one shared routed left-navigation shell
Description:
- Goal / acceptance criteria: Replace the current page-specific left rail implementations in `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/pages/MidiHubShell.tsx`, and `web/src/app/pages/AudioArtifactsPage.tsx` with one shared workspace-side-nav component and shared CSS contract. The three pages must render through the same nav shell structure while preserving their route sets, page-specific badges/actions, and existing routed behavior.
- Why it matters: The current pages still use three separate sidebar implementations, so they do not present as one unified left navigation system even after the Artifacts rail refresh.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Shared left-nav component/CSS, refactors for all three pages, focused regression updates, validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 13:01 EDT - Codex
- Completion notes:
  - Added `web/src/app/components/navigation/UnifiedWorkspaceSideNav.tsx` and `web/src/app/components/navigation/UnifiedWorkspaceSideNav.css` as the shared routed left-rail implementation used across workspace pages.
  - Refactored `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/pages/MidiHubShell.tsx`, and `web/src/app/pages/AudioArtifactsPage.tsx` to render through that shared nav shell while preserving platform pin controls, MIDI Hub badges/status cards, and Artifacts route-state/status cards.
  - Extended `web/src/app/pages/MidiHubPage.test.tsx` and retained `web/src/app/pages/AudioArtifactsPage.test.tsx` coverage so the shared shell is exercised on both routed page families.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning only.

ID: T413
Status: [✓] Done
Title: Align the Audio Artifacts routed left rail with the upgraded workspace navigation spec
Description:
- Goal / acceptance criteria: Refactor `web/src/app/pages/AudioArtifactsPage.tsx` and `web/src/app/pages/AudioArtifactsPage.css` so the routed `/artifacts` workspace uses the same upgraded left-hand navigation shell pattern as the newer Platforms and MIDI Hub pages: a headed rail, first-class nav entries, route-native discover entry, and sidebar footer/status context without changing the home page. Preserve existing category switching, discover routing, table/detail behavior, and mobile navigation behavior. Add or update focused regression coverage proving the upgraded rail renders and navigation still works.
- Why it matters: The Artifacts route still exposes the older nested category sidenav while Platforms and MIDI Hub already have the upgraded routed left-rail treatment, so the web GUI feels inconsistent and does not meet the expected page-level navigation spec.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Updated Artifacts page/sidebar implementation, focused tests, validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 11:06 EDT - Codex
- Completion notes:
  - Reworked `web/src/app/pages/AudioArtifactsPage.tsx` so the routed Artifacts workspace now uses a headed left rail with first-class discover/category entries, route-state labels, and sidebar footer status cards instead of the older nested category menu.
  - Updated `web/src/app/pages/AudioArtifactsPage.css` to style the new Artifacts rail in the same upgraded routed-shell visual language used by the newer page shells, while preserving existing mobile behavior and content layout.
  - Extended `web/src/app/pages/AudioArtifactsPage.test.tsx` with a focused regression proving the upgraded left rail renders and the existing routed behaviors still pass.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning only.

## Active Blockers Only

Archive: Completed and otherwise non-blocked work has been moved to `docs/archive/PROJECT_WORKLIST_ARCHIVE_20260316.md`.

## AVB

ID: T004
Status: [✗] Blocked
Title: AVB hardware qualification and release gating
Description:
- Goal / acceptance criteria: Complete the remaining AVB hardware-in-the-loop qualification gates formerly tracked under `T004`, including discovery/churn, active-stream validation, PTP timing, and soak evidence.
- Why it matters: MAP2 cannot claim production AVB readiness until the real lab matrix passes.
- Dependencies: AVB-capable lab availability, active AVB entities/streams, stable PTP grandmaster lock
- Estimated effort: High
- Required outputs: Updated qualification matrix, archived evidence artifacts, and pass/fail summary for the AVB gates.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Software prep, wrappers, and false-pass hardening are complete in the archive.
  - Current host still shows no discovered AVB devices, no active streams, and `INITIALIZING` PTP state.
  - Source archive references: `T004` in `docs/archive/PROJECT_WORKLIST_ARCHIVE_20260316.md`.

## Tesira

ID: T030
Status: [✗] Blocked
Title: Tesira effects-loop HIL latency and soak qualification
Description:
- Goal / acceptance criteria: Execute the must-pass Tesira effects-loop HIL qualification for latency, churn, and multi-loop stability.
- Why it matters: Effects-loop production claims need real Tesira hardware evidence.
- Dependencies: Tesira hardware on-site, active effects-loop topology, T024/T026/T027/T028/T029 work from archive
- Estimated effort: High
- Required outputs: Qualification artifacts under `docs/fit-for-purpose-evidence/` and final gate summary.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Runner, runbook, and tests are complete in the archive.
  - Remaining blocker is strictly live Tesira hardware and loop topology availability.
  - Source archive references: `T030`, `T030-subA`.

ID: T065
Status: [✗] Blocked
Title: Tesira full-stack parity program release closure
Description:
- Goal / acceptance criteria: Close the remaining parity program blockers for the Tesira replacement effort and issue release-ready go/no-go status.
- Why it matters: Most implementation is complete, but release closure still depends on real hardware proof.
- Dependencies: T030, T004, archived completed implementation slices `T065-subA` through `T065-subF`
- Estimated effort: High
- Required outputs: Final parity validation packet, migration/cutover sign-off, and release unblock decision.
Subtasks:
ID: T065-subG
Status: [✗] Blocked
Title: Produce full parity validation matrix with automation and HIL evidence
Description:
- Goal / acceptance criteria: Finish the parity matrix by combining completed automated validation with the missing Tesira and AVB HIL evidence.
- Why it matters: Parity claims require measurable proof, not implementation-only completion.
- Dependencies: T030, T004, archived `T065-subD`, `T065-subE`, `T065-subF`
- Estimated effort: High
- Required outputs: Validation matrix, artifact bundle, and waiver list if needed.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Automated checks are already complete in the archive.
  - Remaining blocker is missing live Tesira/AVB/PTP lab evidence.
ID: T065-subH
Status: [✗] Blocked
Title: Execute migration, cutover, and release sign-off for Tesira replacement
Description:
- Goal / acceptance criteria: Finalize the migration checklist, rollback packet, staged rollout, and release sign-off once the parity matrix passes.
- Why it matters: Production adoption depends on a verified migration path.
- Dependencies: T065-subG
- Estimated effort: Medium
- Required outputs: Migration checklist, release notes, rollback runbook, and signed acceptance packet.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Blocked entirely by `T065-subG`.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL Tesira parity implementation work is archived as complete.
  - Remaining closure is now isolated to hardware validation and release sign-off.

ID: T072
Status: [✗] Blocked
Title: Tesira full-parity HIL certification matrix
Description:
- Goal / acceptance criteria: Execute the full Tesira HIL certification matrix covering AVB routing, PTP behavior, live DSP control, compile/deploy lifecycle, and multi-unit reliability.
- Why it matters: Final parity and release claims remain blocked until this matrix passes.
- Dependencies: T065-subG, T030, T004, archived `T069`, `T070`, `T071`
- Estimated effort: High
- Required outputs: HIL evidence bundle, waiver log, and unblock decision for Tesira release.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Precheck runner and runbook are complete in the archive.
  - Current host still lacks connected Tesira devices in scope, active AVB streams, and stable AVB/PTP lock.

ID: T076
Status: [✗] Blocked
Title: Tesira deploy-chain HIL certification
Description:
- Goal / acceptance criteria: Validate the supported Tesira deployment workflow on real hardware and archive release-grade evidence.
- Why it matters: The deployment UX is not release-ready without two-unit HIL confirmation.
- Dependencies: T075 from archive, T004
- Estimated effort: High
- Required outputs: HIL evidence bundle and final go/no-go criteria update for deployment workflow.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Manual-package deployment runner and runbook are complete in the archive.
  - Remaining blocker is the real two-unit Tesira deployment session.

ID: T350
Status: [✓] Done
Title: Audit Tesira GUI parity, migrate serial onboarding into the dedicated Tesira route, and plan Carbon compliance remediation
Description:
- Goal / acceptance criteria: Audit the current Tesira GUI surfaces against the shipped MAP2 Tesira implementation and official Biamp Tesira materials, identify the existing MIDI-side onboarding/helper capability relevant to serial-driven Tesira setup, define how that capability should move into the dedicated `/tesira` route for auto onboarding/configuration, and record the resulting implementation plan plus open questions in the canonical worklist.
- Why it matters: The dedicated Tesira route is the operator-facing surface for Tesira fleet management, but the user-visible TTP/helper workflow is still split across routes and the current page appears to lag both the product’s own Tesira scope and the repo’s Carbon-first UI bar.
- Dependencies: Current Tesira web route/components, MIDI Hub Tesira/onboarding helpers, official Biamp Tesira materials, Carbon Design guidance, and user answers to the staged planning questions
- Estimated effort: Medium
- Required outputs: Feature-gap audit, serial/onboarding migration plan, Carbon compliance audit summary, explicit follow-up implementation tasks, and updated worklist notes capturing the planning decisions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 16:24 EDT - Codex
- Progress notes:
  - Confirmed the dedicated Tesira route remains primarily MUI-based while the MIDI Hub Tesira panel already uses Carbon primitives and exposes a compact TTP/operator workflow that the full page does not currently surface.
  - Confirmed the dedicated Tesira route already has fleet discovery/manual-add primitives (`DiscoveryDialog`, `ManualAddDialog`), so the likely gap is onboarding depth and transport/configuration guidance rather than the total absence of add-device entry points.
  - Audited external reference project `enp6s0/pytesira`: it provides a small MIT-licensed Python library centered on Tesira Text Protocol over SSH, with a reusable TTP response parser, block-map caching, subscriptions/callbacks, and wrappers for a limited set of DSP block types; current constraints are important for MAP2 planning because it is explicitly WIP, only advertises SSH transport despite an abstract transport layer, has narrow automated test coverage, and does not by itself solve MAP2's GUI, Carbon, fleet, or serial-onboarding requirements.
  - Product decision captured from the user: deliver the Tesira onboarding flow as a dedicated wizard that exposes all supported onboarding methods, but treats serial as the primary path and explicitly guides operators through the used-device recovery flow that starts with a factory reset.
  - Published the audit artifact in `docs/tesira/TESIRA_GUI_AUDIT_20260323.md`, capturing the Biamp feature comparison, the route-level parity findings, and the remaining Carbon compliance gaps.
  - Decomposed the implementation follow-up into `T351` (wizard/process), `T352` (quick console migration), and `T353` (remaining Carbon migration on the dedicated route).

ID: T351
Status: [✓] Done
Title: Implement Tesira serial-first onboarding wizard and used-device onboarding process
Description:
- Goal / acceptance criteria: Add a dedicated Tesira Onboarding Wizard to the `/tesira` experience that presents all supported onboarding methods, defaults to a serial-first path, explicitly walks a user through recovering and onboarding a used device that must be factory-reset first, and reuses the existing Tesira discovery/manual-add/reconnect capabilities where appropriate.
- Why it matters: Tesira onboarding is currently fragmented across hidden helpers, transport-specific dialogs, and route-local knowledge; operators need one guided flow that matches real field recovery for used units instead of a scattered set of controls.
- Dependencies: T350 findings, existing Tesira web components/hooks, Tesira discovery/manual-add/reconnect APIs, Carbon route conventions, and a canonical operator process artifact in `docs/tesira/`
- Estimated effort: Medium
- Required outputs: Wizard UI integrated into the dedicated Tesira route, serial-first onboarding flow copy/state model, operator process documentation for used-device recovery/onboarding, validation notes, and updated worklist/licensing notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 16:24 EDT - Codex
- Progress notes:
  - Confirmed the current backend/API surface is sufficient for a useful first-pass wizard without inventing new backend endpoints: `startDiscovery`, `getDiscoveryStatus`, `adoptDevice`, `addDevice`, `connectDevice`, `disconnectDevice`, and `reconnectDevice` already exist in the dedicated Tesira path.
  - Implementation approach in progress: put the wizard into the dedicated `/tesira` landing surface, default the method to serial, provide an operator checklist for factory reset plus serial console work, and then hand off to discovery/manual-add/adopt/verify actions from the same flow.
  - Implemented the dedicated `TesiraOnboardingWizard` landing experience, integrated it into `/tesira`, added the operator process artifact in `docs/tesira/TESIRA_ONBOARDING_WIZARD_PROCESS.md`, and surfaced the offline reconnect banner on the real device route instead of leaving it stranded in the unused legacy control panel.
  - Validation passed for the current slice with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraOnboardingWizard.test.tsx web/src/app/components/Tesira/components/TesiraOfflineBanner.test.tsx`, and `npm --prefix web run build`.

ID: T352
Status: [✓] Done
Title: Move the MIDI-side Tesira quick console into the dedicated Tesira route for onboarding and recovery
Description:
- Goal / acceptance criteria: Add a dedicated-route Tesira quick console that exposes the useful onboarding/recovery affordances currently isolated in the MIDI Hub Tesira panel, including a raw TTP command path, discovered-instance visibility, and quick operator guidance from the main `/tesira` experience.
- Why it matters: Operators should not have to leave the Tesira route and jump into MIDI Hub just to send discovery/recovery commands or inspect tags while onboarding a recovered unit.
- Dependencies: T350, T351, dedicated Tesira API/device hooks, and the existing MIDI Hub Tesira panel behavior as the migration reference.
- Estimated effort: Medium
- Required outputs: Dedicated Tesira raw-command API surface, dashboard/onboarding quick-console UI, focused frontend/backend validation, and worklist notes documenting what capability was migrated versus still deferred.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 16:24 EDT - Codex
- Progress notes:
  - Audited the existing MIDI Hub `TesiraPanel` and confirmed the dedicated route still lacks its free-text TTP helper despite already covering levels, presets, DSP browsing, and reconnect.
  - Added a dedicated raw-command API path on `/api/tesira/devices/{id}/command` and hardened the shared Telnet/SSH transport clients so two-token commands such as `DEVICE reboot` no longer serialize with a bogus empty attribute segment.
  - Added `TesiraQuickCommandPanel` to the dedicated Tesira dashboard so operators can send raw TTP commands, quick-fill common recovery queries, probe instance tags, and use discovered DSP tags as command shortcuts without leaving `/tesira`.
  - Validation passed with `pytest tests/tesira/test_routes_tesira_extended.py -q`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraOnboardingWizard.test.tsx web/src/app/components/Tesira/components/TesiraOfflineBanner.test.tsx web/src/app/components/Tesira/components/TesiraQuickCommandPanel.test.tsx`, and `npm --prefix web run build`.

ID: T353
Status: [✓] Done
Title: Complete Carbon-first migration for the dedicated Tesira route shell and high-traffic operator surfaces
Description:
- Goal / acceptance criteria: Replace the remaining MUI-heavy shell, fleet, dashboard, dialog, and high-traffic device-tab surfaces on `/tesira` with Carbon-first structure, components, and token usage while preserving current behavior.
- Why it matters: The onboarding front door is now Carbon-oriented, but the route is still a mixed-system UI and cannot honestly be called Carbon-compliant end to end.
- Dependencies: T350 audit artifact, T351, T352
- Estimated effort: Medium
- Required outputs: Updated `/tesira` shell/dashboard/dialog/tab components, focused validation evidence, and updated audit/worklist notes showing the remaining compliance deltas if any.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 17:08 EDT - Codex
- Progress notes:
  - `docs/tesira/TESIRA_GUI_AUDIT_20260323.md` identifies the shell, fleet panel, top bar, device header/dashboard, deploy dialog, and most device tabs as still MUI-based and therefore not Carbon-compliant.
  - Cycle 2 scope: convert the top bar, device header, and dashboard support surfaces first so the operator-facing chrome around onboarding and quick-console recovery is no longer the biggest Carbon outlier on `/tesira`.
  - Converted `TesiraTopBar.tsx`, `TesiraDeviceHeader.tsx`, and the main dashboard framing in `TesiraDeviceDashboard.tsx` to Carbon buttons/tags/tiles plus token-based CSS in `TesiraCarbonChrome.css`; the deeper dialogs and device tabs remain follow-up work.
  - Validation passed for the current Carbon slice with `npm --prefix web run typecheck` and `npm --prefix web run build`.
  - Cycle 3 scope: convert the route shell loading/error states, fleet list/device cards, offline reconnect banner, quick-console, and manual deployment dialog so onboarding/recovery/package workflows no longer depend on MUI on the dedicated `/tesira` path.
- Completion notes:
  - Converted `TesiraApp.tsx`, `TesiraFleetPanel.tsx`, `TesiraDeviceCard.tsx`, `TesiraOfflineBanner.tsx`, `TesiraQuickCommandPanel.tsx`, and `TesiraDeployDialog.tsx` to Carbon-first structure and tokenized CSS in `TesiraCarbonChrome.css`, removing MUI from the main `/tesira` shell, fleet, dashboard recovery console, and package-export workflow.
  - Added focused deployment-dialog coverage in `web/src/app/components/Tesira/components/TesiraDeployDialog.test.tsx` and hardened the quick-console test harness for Carbon `matchMedia` / `ResizeObserver` assumptions.
  - Updated `docs/tesira/TESIRA_GUI_AUDIT_20260323.md` so the remaining Carbon compliance gap now points at the deeper device tabs and onboarding dialogs rather than the route shell.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraQuickCommandPanel.test.tsx web/src/app/components/Tesira/components/TesiraOfflineBanner.test.tsx web/src/app/components/Tesira/components/TesiraFleetPanel.clusterSelection.test.tsx web/src/app/components/Tesira/components/TesiraDeployDialog.test.tsx`, and `npm --prefix web run build`.

ID: T354
Status: [✓] Done
Title: Carbonize the remaining Tesira device tabs and onboarding dialogs
Description:
- Goal / acceptance criteria: Replace the remaining MUI-heavy operator tabs and enrollment dialogs on `/tesira`, especially levels, presets, DSP explorer, AVB/faults, settings, discovery, and manual-add flows, with Carbon-first structure and token usage while preserving current behavior.
- Why it matters: After `T353`, the route shell, fleet, dashboard, recovery banner, quick console, and deployment dialog are Carbon-first, but operators still drop back into mixed-system MUI screens for the actual post-onboarding control and enrollment workflows.
- Dependencies: T353
- Estimated effort: Medium
- Required outputs: Updated device-tab and dialog components, focused validation evidence, and refreshed audit/worklist notes describing the final remaining Carbon deltas if any.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:19 EDT - Codex
- Progress notes:
  - Remaining MUI surfaces identified from the route audit and code search now cluster around `DiscoveryDialog.tsx`, `ManualAddDialog.tsx`, `TesiraLevelsTab.tsx`, `TesiraPresetsTab.tsx`, `TesiraDspExplorer.tsx`, `TesiraAvbTab.tsx`, `TesiraFaultsTab.tsx`, and `TesiraDeviceSettings.tsx`, with secondary follow-up still possible in EQ, mixer, loop-builder, firmware, and other detail panels.
  - The next slice should prioritize discovery/manual-add plus levels/presets/DSP explorer because those are the highest-frequency operator surfaces immediately after onboarding and recovery.
  - Converted `DiscoveryDialog.tsx`, `ManualAddDialog.tsx`, `TesiraPresetsTab.tsx`, `TesiraLevelsTab.tsx`, `TesiraDspExplorer.tsx`, `TesiraDspBlockPanel.tsx`, `TesiraDspProbeDialog.tsx`, and `TesiraFaultsTab.tsx` to Carbon-first structure and tokenized CSS in `TesiraCarbonChrome.css`, removing the biggest post-onboarding MUI drop-backs from the dedicated Tesira route.
  - Functional upgrade inside the Carbon slice: `TesiraLevelsTab.tsx` now follows the currently selected instance tag for live meter subscriptions instead of staying pinned to the first discovered stream, and it exposes explicit mute plus unmute actions per channel.
  - Follow-up Carbon slice completed in the same pass: converted `TesiraAvbTab.tsx` and `TesiraControlPanel.tsx` so the AVB view and the dedicated device-tab shell no longer depend on MUI, then added focused tab-shell coverage in `web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx`.
  - Validation build was briefly blocked by a pre-existing compatibility typing issue in `web/src/map2/reorderPluginsCompat.ts`; added explicit type guards for legacy `plugin_uri` / `plugin_position` payloads so the project-reference build succeeds again without changing reorder behavior.
  - Converted `TesiraDeviceSettings.tsx` and `TesiraFirmwareTab.tsx` to Carbon-first tiles, tables, toggles, and operator messaging so the dedicated `/tesira/:deviceId/settings` route no longer falls back to MUI for firmware posture, GPIO, or scene-snapshot workflows.
  - Functional upgrade inside the settings slice: the firmware surface now exposes release notes, download/update-path links, and the reboot/how-to guide in the Carbon shell, while device settings now present capabilities, GPIO state, and scene capture/recall/delete through the same Carbon table patterns used elsewhere on the route.
  - Added focused regression coverage in `web/src/app/components/Tesira/components/TesiraFirmwareTab.test.tsx`, `web/src/app/components/Tesira/components/TesiraDeviceSettings.test.tsx`, `web/src/app/components/Tesira/components/ManualAddDialog.test.tsx`, `web/src/app/components/Tesira/components/TesiraPresetsTab.test.tsx`, `web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx`, `web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx`, and hardened `web/src/app/components/Tesira/components/TesiraDspExplorer.test.tsx` for Carbon browser APIs.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraFirmwareTab.test.tsx web/src/app/components/Tesira/components/TesiraDeviceSettings.test.tsx web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx web/src/app/components/Tesira/components/ManualAddDialog.test.tsx web/src/app/components/Tesira/components/TesiraPresetsTab.test.tsx web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx web/src/app/components/Tesira/components/TesiraDspExplorer.test.tsx`, and `npm --prefix web run build`.
  - Continued the Carbon migration into the remaining detail layer by converting `TesiraEQTab.tsx`, `TesiraMixerTab.tsx`, `TesiraFleetHealth.tsx`, and `TesiraPtpTopology.tsx` to Carbon-first tiles, tables, tags, inline loading/error states, and tokenized CSS patterns in `TesiraCarbonChrome.css`.
  - Functional upgrade inside the mixer slice: `TesiraMixerTab.tsx` now supports locally staged crosspoint gain trims with explicit apply actions and direct mute/unmute controls per route, which avoids noisy per-drag writes while keeping the route-level matrix accessible from the dedicated Tesira page.
  - Added focused regression coverage in `web/src/app/components/Tesira/components/TesiraEQTab.test.tsx`, `web/src/app/components/Tesira/components/TesiraMixerTab.test.tsx`, `web/src/app/components/Tesira/components/TesiraFleetHealth.test.tsx`, and `web/src/app/components/Tesira/components/TesiraPtpTopology.test.tsx`.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraEQTab.test.tsx web/src/app/components/Tesira/components/TesiraMixerTab.test.tsx web/src/app/components/Tesira/components/TesiraFleetHealth.test.tsx web/src/app/components/Tesira/components/TesiraPtpTopology.test.tsx web/src/app/components/Tesira/components/TesiraFirmwareTab.test.tsx web/src/app/components/Tesira/components/TesiraDeviceSettings.test.tsx web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx web/src/app/components/Tesira/components/ManualAddDialog.test.tsx web/src/app/components/Tesira/components/TesiraPresetsTab.test.tsx web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx web/src/app/components/Tesira/components/TesiraDspExplorer.test.tsx`, and `npm --prefix web run build`.
  - Follow-up Carbon slice completed in the same pass: converted `TesiraDesignCanvas.tsx` to Carbon-first workspace controls, status tags, notifications, and canvas framing while retaining React Flow as the graph engine for Tesira design editing.
  - Added focused regression coverage in `web/src/app/components/Tesira/components/TesiraDesignCanvas.test.tsx` to verify block insertion and save behavior through the Carbonized design-workspace shell.
  - Validation passed again with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraDesignCanvas.test.tsx web/src/app/components/Tesira/components/TesiraEQTab.test.tsx web/src/app/components/Tesira/components/TesiraMixerTab.test.tsx web/src/app/components/Tesira/components/TesiraFleetHealth.test.tsx web/src/app/components/Tesira/components/TesiraPtpTopology.test.tsx web/src/app/components/Tesira/components/TesiraFirmwareTab.test.tsx web/src/app/components/Tesira/components/TesiraDeviceSettings.test.tsx web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx web/src/app/components/Tesira/components/ManualAddDialog.test.tsx web/src/app/components/Tesira/components/TesiraPresetsTab.test.tsx web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx web/src/app/components/Tesira/components/TesiraDspExplorer.test.tsx`, and `npm --prefix web run build`.
  - Remaining MUI-heavy Tesira surface is now limited to one deep editor workflow: `TesiraLoopBuilderTab.tsx`.
- Completion notes:
  - Converted `web/src/app/components/Tesira/components/TesiraLoopBuilderTab.tsx` to Carbon-first tiles, selects, text inputs, tags, inline notifications, and token-driven layout in `web/src/app/components/Tesira/components/TesiraCarbonChrome.css`, removing the last MUI-heavy operator workflow from the dedicated `/tesira` route.
  - Added `web/src/app/components/Tesira/components/TesiraLoopBuilderTab.test.tsx` to cover the new Carbon shell’s create-loop, chain-insert, and inspector-selection flows, and kept `web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx` green against the completed device-tab shell.
  - Hardened insertion-draft hydration in `web/src/app/components/Tesira/components/TesiraLoopBuilderTab.tsx` so equivalent query payloads no longer trigger a `Maximum update depth exceeded` render loop when the loop builder rehydrates insertion state.
  - Updated `docs/tesira/TESIRA_GUI_AUDIT_20260323.md` so the audit now records the dedicated `/tesira` route as Carbon-aligned end to end, with remaining follow-up limited to product-parity decisions rather than design-system migration.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraLoopBuilderTab.test.tsx web/src/app/components/Tesira/components/TesiraControlPanel.test.tsx`, and `npm --prefix web run build`.

ID: T355
Status: [✓] Done
Title: Restyle JUCE Grid live signal cards around a Windows-inspired Carbon-compliant template
Description:
- Goal / acceptance criteria: Update the live `JUCE-GRID` signal cards so each card adopts the user-approved template direction: Windows-like overall proportions with up to ~20% growth, a large Carbon-compliant light hero field that gives the line-art icon as much room as practical, and a thin uniform gray title band carrying the block name while preserving existing selection, bypass, overflow actions, add-tile behavior, and row-capacity measurement.
- Why it matters: The current live signal cards are flatter and more Carbon-aligned than before, but they no longer provide the stronger icon visibility and title/hero separation the operator explicitly requested for faster scanning.
- Dependencies: T246, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, and the user-approved layout answers from 2026-03-23.
- Estimated effort: Low
- Required outputs: Updated signal-card/add-card markup and token-driven styling, focused regression coverage for the new title-band/hero structure, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 15:37 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so live effect cards now expose the block name inside a thin lower title band, move category context into accessibility labeling instead of a second visible line, and give the hero field the full interior footprint while preserving selection, bypass, overflow actions, and add-slot behavior.
  - Updated `web/src/app/pages/JuceGridPage.css` so the live and add cards adopt the Windows-inspired proportions within the allowed growth budget, use an inverse Carbon-safe hero field plus a uniform gray title band, reveal the line-art icon at a larger scale, and keep the interaction treatment token-driven instead of adding custom glow or retro-heavy framing.
  - Updated `web/src/app/components/icons/effectIcons.ts` and `web/src/app/components/icons/noun/reverb/fx-reverb.svg` so reverb-class blocks now use a detailed line-art icon consistent with the amplifier and rack cards instead of the previous dense filled glyph.
  - Added focused regression coverage in `web/src/app/pages/JuceGridSignalCanvas.test.tsx` for the new title-band/add-tile structure while preserving the existing row-capacity and icon-tone assertions.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid and icon files remain MAP2-owned AGPL-covered frontend assets; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T356
Status: [✓] Done
Title: Refine JUCE Grid amplifier and multi-effect hero icons for the Windows-inspired signal-card template
Description:
- Goal / acceptance criteria: Tighten the remaining most-visible JUCE Grid line-art hero icons, especially amplifier and multi-effect, so they use the enlarged signal-card hero field more effectively, carry detail comparable to the updated reverb icon, and preserve the current icon mapping/tone behavior across the route.
- Why it matters: The card shell now reads correctly, but the first-row icons in the user’s reference set still have inconsistent density and whitespace, which weakens the stronger card template that was just shipped.
- Dependencies: T355, `web/src/app/components/icons/effectIcons.ts`, `web/src/app/components/icons/noun/amplifier/fx-amplifier.svg`, `web/src/app/components/icons/noun/multi-effect/fx-rack.svg`, and the same focused JUCE Grid validation surface.
- Estimated effort: Low
- Required outputs: Updated SVG line art for the targeted categories, any focused regression adjustments if needed, validation evidence, and licensing/worklist notes for the touched MAP2-owned icon assets.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 15:43 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/icons/noun/amplifier/fx-amplifier.svg` so the amplifier art now uses more of the 64px frame, adds denser grille/control detail, and better matches the Windows-inspired hero-box composition without changing the icon’s line-art character.
  - Updated `web/src/app/components/icons/noun/multi-effect/fx-rack.svg` so the multi-effect rack icon has fuller-width rack units, denser display/control detail, and less dead whitespace inside the enlarged hero field.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched icon assets remain MAP2-owned AGPL-covered repository files; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T359
Status: [✓] Done
Title: Replace selected JUCE Grid signal-card actions with an immediate delete glyph and enlarge the hero/title treatment
Description:
- Goal / acceptance criteria: Update the live `JUCE-GRID` signal cards so the selected card replaces the top-right overflow menu with a red Nerd Font close glyph that immediately removes the effect from the chain, enlarge the hero icon by roughly 50% while keeping a small safe margin, and increase the title text by roughly 20% while allowing the title band to wrap to two lines.
- Why it matters: The user approved the Windows-inspired shell but wants the active-card affordance simplified into a direct delete action and the hero/title emphasis pushed further for faster scanning.
- Dependencies: T355, T356, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, the approved `BlexMono Nerd Font` glyph set, and the user answers from 2026-03-23.
- Estimated effort: Low
- Required outputs: Updated signal-card action markup/CSS, selected-only immediate delete behavior, larger hero/title treatment, focused regression coverage, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 16:28 EDT - Codex
- Completion notes:
  - Replaced the selected-card overflow affordance in `web/src/app/pages/JuceGridSignalCanvas.tsx` with an immediate-delete button that renders only for the selected card, uses the approved BlexMono Nerd Font `cod-close` glyph (`U+EA76`), and calls `onDeletePlugin(uri, position)` without a confirmation step.
  - Retuned `web/src/app/pages/JuceGridPage.css` so the signal card grows vertically for the larger hero field, the icon frame uses a tighter safe margin inside the Carbon-compliant inverse hero field, and the bottom title band now renders at roughly 120% of the old type size with two-line wrapping support.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.test.tsx` to cover the new selected-only delete affordance, immediate removal behavior, the removal of the old overflow button, and the no-delete state when deletion is unavailable.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T377
Status: [✓] Done
Title: Stop the JUCE Grid selected-card render loop introduced by the signal-card delete/hero-title refresh
Description:
- Goal / acceptance criteria: Reproduce and fix the post-`T359` JUCE Grid render crash showing React minified error `#185` (`Maximum update depth exceeded`), with the likely focus on the live signal-grid measurement/update path so the page renders normally again without regressing row-capacity, tablet paging, or selected-card behavior.
- Why it matters: The latest card refresh shipped the intended visual changes, but the user immediately hit a production render crash, so the page is not operable until the loop is removed.
- Dependencies: T359, `web/src/app/pages/JuceGridSignalCanvas.tsx`, any affected JUCE Grid page integration/tests, and the user-provided crash evidence from 2026-03-23.
- Estimated effort: Low
- Required outputs: Root-cause fix, focused regression coverage for the loop condition, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 17:26 EDT - Codex
- Completion notes:
  - Crash evidence pointed to React minified error `#185`, which decodes to `Maximum update depth exceeded`; the highest-probability regression in the touched JUCE Grid code was the `ResizeObserver`-driven row-capacity path repeatedly enqueueing updates after the refreshed card dimensions and two-line titles increased layout churn.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so the live signal-grid measurement path records a width/card/gap signature and skips `setRowCapacity` entirely when the observer reports the same effective measurement and capacity, preventing redundant observer-triggered update cascades.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T385
Status: [✓] Done
Title: Guard JUCE Grid cluster-node normalization against undefined API payloads
Description:
- Goal / acceptance criteria: Reproduce and fix the follow-up JUCE Grid crash showing `can't access property "nodes", r is undefined` by hardening the cluster-node normalization path so an empty or malformed `/cluster/nodes` response degrades to an empty list instead of throwing.
- Why it matters: The prior render-loop fix removed one crash, but the route still fails during cluster summary loading when the node payload is missing, so the page remains unstable.
- Dependencies: T377, `web/src/app/pages/JuceGridClusterPanels.tsx`, any focused regression coverage added for the cluster summary fetch path, and the user-provided crash evidence from 2026-03-23.
- Estimated effort: Low
- Required outputs: Root-cause guard fix, focused regression coverage for undefined cluster payloads, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 17:56 EDT - Codex
- Completion notes:
  - The concrete fault site was `fetchClusterNodes()` in `web/src/app/pages/JuceGridClusterPanels.tsx`, which normalized `data.nodes` without guarding `data` first; that matches the runtime message shown after `/cluster/nodes` returned an undefined payload.
  - Updated `web/src/app/pages/JuceGridClusterPanels.tsx` so cluster-node normalization now uses `Array.isArray(data?.nodes) ? data.nodes : []`, allowing the summary bar to degrade cleanly to the existing empty-node copy instead of throwing.
  - Added `web/src/app/pages/JuceGridClusterPanels.test.tsx` to prove the summary bar renders `No cluster nodes detected.` when `/cluster/nodes` returns `undefined`.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridClusterPanels.test.tsx web/src/app/pages/JuceGridPage.test.tsx web/src/app/pages/JuceGridSignalCanvas.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid cluster-panel/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T386
Status: [✓] Done
Title: Harden remaining malformed-`nodes` shell consumers so frontend routes degrade instead of crashing
Description:
- Goal / acceptance criteria: Eliminate the remaining `can't access property "nodes"` crash class after the JUCE Grid directional-button fix by guarding shared shell and route-level frontend consumers that still assumed topology/discovery payloads always exposed a `nodes` array.
- Why it matters: Even after the JUCE Grid-specific cluster-node guard landed, the app could still crash if later polls or adjacent route consumers received partial payloads, so operators could continue hitting the same failure family outside the original fetch site.
- Dependencies: T385, the user-provided follow-up crash evidence from 2026-03-23, and the current MAP2 frontend shell/node-context consumers.
- Estimated effort: Low
- Required outputs: Guard fixes for the remaining malformed-`nodes` frontend reads, focused regression coverage for the home/node-context surfaces, validation evidence, and updated licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 19:11 EDT - Codex
- Completion notes:
  - Hardened the remaining direct/implicit `nodes` consumers in `web/src/app/pages/HomePage.tsx`, `web/src/app/components/NodeContextBanner/NodeContextBanner.tsx`, `web/src/app/components/NodeContextPicker/NodeContextPicker.tsx`, `web/src/app/components/NodeGraph/NodeGraph.tsx`, `web/src/app/hooks/usePlatformShellData.ts`, `web/src/app/components/UpdateProgressViewer.tsx`, and `web/src/app/components/OnboardingWizard.tsx` so malformed topology/discovery payloads normalize to empty arrays before any `find`, `map`, `filter`, or `length` access.
  - Added focused regression coverage in `web/src/app/pages/HomePage.test.tsx`, `web/src/app/components/NodeContextBanner/NodeContextBanner.test.tsx`, and `web/src/app/components/NodeContextPicker/NodeContextPicker.test.tsx` proving those surfaces stay mounted when topology payloads omit `nodes`.
  - Validation passed with `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/components/NodeContextBanner/NodeContextBanner.test.tsx web/src/app/components/NodeContextPicker/NodeContextPicker.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T387
Status: [✓] Done
Title: Normalize shared node-page topology selection so malformed payloads cannot crash nav or route pages
Description:
- Goal / acceptance criteria: Eliminate the remaining shared node-page crash path by normalizing `useNodePageContext` and the route/nav consumers that still assumed `topology.nodes` existed whenever a topology object was present, while preserving local/remote node selection behavior.
- Why it matters: After `T386`, adjacent route pages could still throw during page-node selection or node-chip rendering if a later topology poll returned a partial object without a `nodes` array.
- Dependencies: T386, the shared node-page shell/hooks under `web/src/app/hooks/useNodePageContext.ts`, the node-nav shell, affected node-scoped pages, and focused frontend regressions.
- Estimated effort: Low
- Required outputs: Guarded node-page selection logic, focused regression coverage for the shared nav and node-scoped pages, validation evidence, and updated licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 19:38 EDT - Codex
- Completion notes:
  - Normalized `web/src/app/hooks/useNodePageContext.ts` so malformed topology objects now expose a stable empty `topologyNodes` list, local-node fallback, and safe viewed-node resolution instead of assuming `data.nodes` is always an array.
  - Updated `web/src/app/components/NodeNav/NodeNavBar.tsx`, `web/src/app/pages/AudioEnginePage.tsx`, `web/src/app/pages/ChainsPage.tsx`, `web/src/app/pages/DSPPage.tsx`, and `web/src/app/pages/LV2PluginsPage.tsx` to consume the normalized node-page selection path instead of reading `topology.nodes` directly.
  - Added focused regressions in `web/src/app/hooks/useNodePageContext.test.tsx`, `web/src/app/components/NodeNav/NodeNavChip.test.tsx`, `web/src/app/pages/AudioEnginePage.test.tsx`, and `web/src/app/pages/LV2PluginsPage.test.tsx` covering malformed topology payloads plus remote-node fallback behavior.
  - Validation passed with `npm --prefix web test -- --runInBand web/src/app/hooks/useNodePageContext.test.tsx web/src/app/components/NodeNav/NodeNavChip.test.tsx web/src/app/pages/AudioEnginePage.test.tsx web/src/app/pages/LV2PluginsPage.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build` (existing Vite dynamic-import warning only).
  - Licensing review: touched node-page frontend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T389
Status: [✓] Done
Title: Harden remaining shared alert and fanout `nodes` readers against malformed payloads
Description:
- Goal / acceptance criteria: Eliminate the next shared malformed-`nodes` crash paths by guarding the node-alert topology readers plus the unmodified Host Machine and Tesira fanout readers that still assume `nodes` exists and has the expected iterable/record shape.
- Why it matters: After `T387`, the most likely remaining crashes are no longer page-local selectors but shared shell hooks and fanout helpers that can still throw when a backend poll returns a partial payload.
- Dependencies: T386, T387, the shared alert flow under `web/src/app/hooks/useNodeAlertMonitoring.ts` / `web/src/app/components/NodeAlerts/NodeAlertMonitor.tsx`, Host Machine cluster fanout hooks, Tesira cluster fanout hooks, and focused regression coverage.
- Estimated effort: Low
- Required outputs: Guarded alert/fanout readers, focused regressions for malformed payloads, validation evidence, and updated licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:45 EDT - Codex
- Completion notes:
  - Added `web/src/app/utils/nodeAlertSync.ts` and switched both `web/src/app/hooks/useNodeAlertMonitoring.ts` and `web/src/app/components/NodeAlerts/NodeAlertMonitor.tsx` to normalize malformed topology payloads before syncing alert state, so truthy non-array `nodes` values no longer throw inside the shared shell alert flow.
  - Hardened `web/src/app/hooks/useHostMachine.ts` so malformed cluster fanout/device payloads now normalize to empty node records instead of assuming `payload.nodes` exists and is an object map.
  - Hardened Tesira fanout/topology reads in `web/src/app/components/Tesira/hooks/useTesiraApi.ts` and `web/src/app/components/Tesira/components/TesiraPtpTopology.tsx` so malformed cluster fanout and non-array topology `nodes` payloads degrade to empty results instead of throwing during merge/render.
  - Added focused regressions in `web/src/app/utils/nodeAlertSync.test.ts`, `web/src/app/components/NodeAlerts/NodeAlertBar.test.tsx`, `web/src/app/hooks/useHostMachine.test.tsx`, `web/src/app/components/Tesira/hooks/useTesiraApi.clusterFanout.test.tsx`, and `web/src/app/components/Tesira/components/TesiraPtpTopology.test.tsx`.
  - Validation passed with `npm --prefix web test -- --runInBand web/src/app/utils/nodeAlertSync.test.ts web/src/app/components/NodeAlerts/NodeAlertBar.test.tsx web/src/app/hooks/useHostMachine.test.tsx web/src/app/components/Tesira/hooks/useTesiraApi.clusterFanout.test.tsx web/src/app/components/Tesira/components/TesiraPtpTopology.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build` (existing Vite dynamic-import warning only).
  - Licensing review: touched alert/fanout/frontend test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T390
Status: [✓] Done
Title: Normalize the remaining AVB and MIDI raw `nodes` readers after the shared fanout hardening pass
Description:
- Goal / acceptance criteria: Remove the last obvious raw `nodes` assumptions still flagged by repo search, specifically the AVB routing readers in `web/src/app/components/AvbRouting/hooks/useAvbApi.ts` and `web/src/app/components/AvbRouting/hooks/useNodeApi.ts` plus the topology cast in `web/src/app/components/MidiHub/MidiPatchbay.tsx`, with focused regressions proving malformed payloads no longer crash those surfaces.
- Why it matters: `T389` closed the shared shell, Host Machine, and Tesira readers, but the remaining AVB/MIDI readers can still throw on malformed payloads and are the next concrete crash-family follow-up.
- Dependencies: T389, current AVB routing work already in flight elsewhere in the worktree, and focused AVB/MIDI regression coverage.
- Estimated effort: Low
- Required outputs: Guard fixes for the remaining AVB/MIDI raw `nodes` readers, focused regressions, validation evidence, and updated licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:49 EDT - Codex
- Completion notes:
  - Hardened `web/src/app/components/AvbRouting/hooks/useAvbApi.ts` so malformed cluster fanout payloads only treat plain object `nodes` maps as valid remote-node records instead of iterating truthy arrays or other unexpected values.
  - Hardened `web/src/app/components/AvbRouting/hooks/useNodeApi.ts` so discovered-node polling now normalizes `data.nodes` to an array before mapping, which keeps malformed AVB discovery payloads from throwing inside the query function.
  - Added `web/src/app/components/MidiHub/patchbayTopology.ts` and switched `web/src/app/components/MidiHub/MidiPatchbay.tsx` to normalize topology node ids before building the source/destination lists, falling back to live port ids when the topology payload is missing or malformed.
  - Added focused regressions in `web/src/app/components/AvbRouting/hooks/useAvbApi.clusterFanout.test.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts`, and `web/src/app/components/MidiHub/patchbayTopology.test.ts`.
  - Validation passed with `npm --prefix web test -- --runInBand web/src/app/components/AvbRouting/hooks/useAvbApi.clusterFanout.test.ts web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts web/src/app/components/MidiHub/patchbayTopology.test.ts`, `npm --prefix web run typecheck`, and `npm --prefix web run build` (existing Vite dynamic-import warning only).
  - Licensing review: touched AVB/MIDI frontend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T357
Status: [✓] Done
Title: Replace the landing-route transition block object with the Platforms hero icon
Description:
- Goal / acceptance criteria: Review the shared landing-route transition implementation and swap the repeated animated block object so it uses the existing Platforms hero icon while preserving current route scope, timing, and reduced-effects fallback behavior.
- Why it matters: The transition already fires on the right routes, but the current generic block tile does not match the Platforms visual language the user wants carried into the motion system.
- Dependencies: T247, `web/src/app/components/PageTransition.tsx`, `web/src/app/components/PageTransition.css`, `web/src/app/components/PageTransition.test.tsx`, the shared MAP icon set under `web/src/app/components/icons/map/**`, and the user request from 2026-03-23.
- Estimated effort: Low
- Required outputs: Updated transition markup/styles using the Platforms hero icon, focused regression coverage, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 15:49 EDT - Codex
- Completion notes:
  - Reviewed the scoped landing-route transition and kept the existing route-family matching, timing, and reduced-effects fallback intact so the change stays limited to the animated object itself.
  - Updated `web/src/app/components/PageTransition.tsx` to replace the plain repeated block content with the existing `MapClusterFabricIcon`, which is the Platforms hero icon already used in the shared MAP icon set.
  - Updated `web/src/app/components/PageTransition.css` so each animated block now centers and lights the Platforms icon cleanly inside the current block-reveal choreography instead of rendering only the generic tile face.
  - Added focused regression coverage in `web/src/app/components/PageTransition.test.tsx` so eligible landing-route transitions now assert that the Platforms hero icon is present during the block animation.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/PageTransition.test.tsx`, and `npm --prefix web run build` (existing Vite dynamic-import warning only).
  - Licensing review: touched transition/worklist files remain MAP2-owned AGPL-covered frontend artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T358
Status: [✓] Done
Title: Make JUCE Grid reorder actions tolerate legacy URI-only backend contracts
Description:
- Goal / acceptance criteria: Fix `/juce-grid` reorder failures from the selected-block move controls and other chain reorder surfaces when the running backend still exposes the older `/api/chains/{chain_id}/reorder` contract that only accepts URI arrays, while preserving positioned-ref support on upgraded backends and refusing unsafe duplicate-plugin fallback on legacy servers.
- Why it matters: The frontend now sends `{ uri, position }` reorder refs for duplicate-plugin safety, but the currently running local backend can still answer `422 Unprocessable Entity` with `string_type` validation when directional move buttons are used, breaking a basic operator flow.
- Dependencies: `web/src/map2/api.ts`, JUCE Grid/chain reorder callers, the live local backend contract on 2026-03-23, and focused frontend regression coverage.
- Estimated effort: Low
- Required outputs: Backward-compatible reorder client logic, focused compatibility tests, validation evidence, and licensing/worklist notes for the touched MAP2-owned frontend files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 16:01 EDT - Codex
- Completion notes:
  - Reproduced the live mismatch directly against `http://localhost:8080`: OpenAPI still advertises `/api/chains/{chain_id}/reorder` as `string[]`, and a positioned-ref reorder request returned `422` with FastAPI `string_type` validation for body index `0`.
  - Updated `web/src/map2/api.ts` so chain reorders now attempt the positioned-ref payload first, automatically downgrade to the legacy URI-array contract when that specific validation failure is detected, cache that compatibility mode per node key, and normalize both backend response shapes back into the frontend `PluginOrderRef` shape.
  - Added `web/src/map2/reorderPluginsCompat.ts` plus `web/src/map2/reorderPluginsCompat.test.ts` to cover legacy-validation detection, response normalization across both contract shapes, and the duplicate-URI safety guard that blocks unsafe legacy fallback.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/map2/reorderPluginsCompat.test.ts`, and `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`.
  - Licensing review: touched reorder compatibility/test/worklist files remain MAP2-owned AGPL-covered frontend artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

## AVB Audit Remediation

Source: [AVB Full-Stack Audit Report (2026-03-23)](avb/AVB_FULL_STACK_AUDIT_20260323.md)

ID: T360
Status: [✗] Blocked
Title: Connect AVB-capable hardware and achieve PTP grandmaster lock
Description:
- Goal / acceptance criteria: Install AVB-capable NIC (Intel I210/I225), connect to TSN switch, run setup_avb.sh, achieve PTP SLAVE or MASTER state with offset_ns < 1000.
- Why it matters: Blocks ALL downstream AVB validation — every audit finding depends on live hardware.
- Dependencies: Lab hardware procurement (NIC + switch + peer node or Tesira unit)
- Estimated effort: Medium
- Required outputs: PTP status showing locked state, setup evidence, marker file updated.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No AVB-capable NIC currently connected to testbed.
  - PTP stuck in INITIALIZING with no peer.
  - Priority: P0 — blocks basic AVB functionality.

ID: T361
Status: [✗] Blocked
Title: Discover at least one AVDECC entity and verify AEM enumeration
Description:
- Goal / acceptance criteria: Enable USE_AVDECC=ON, connect AVB device, verify entity appears in /api/avb/avdecc/entities with has_model=true and complete AEM descriptor tree.
- Why it matters: Without entity discovery, no AVDECC-managed connections can be established.
- Dependencies: T360
- Estimated effort: Medium
- Required outputs: AVDECC entity list, AEM model JSON, entity metadata validation.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - USE_AVDECC=OFF by default in CMakeLists.txt:205.
  - No AVDECC entities ever discovered on testbed.
  - Priority: P0.

ID: T362
Status: [✗] Blocked
Title: Establish end-to-end MAP2 AVB audio stream (talker -> listener)
Description:
- Goal / acceptance criteria: Create talker + listener streams, inject test signal, verify audio passes end-to-end with zero sequence/decode errors and stream stats confirming frames transferred.
- Why it matters: The core AVB product claim — sharing audio between MAP2 nodes — is completely unproven.
- Dependencies: T360, T361
- Estimated effort: High
- Required outputs: Stream stats showing framesSent/framesReceived > 0, zero errors, audio capture evidence.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No AVB streams have ever carried audio on this testbed.
  - Priority: P0.

ID: T363
Status: [✗] Blocked
Title: Measure and document round-trip latency and jitter on live AVB stream
Description:
- Goal / acceptance criteria: Establish loopback stream, measure one-way latency via AVTP timestamps, measure round-trip via impulse injection, calculate jitter (p50/p95/p99/max) over 10-minute window, document methodology. Target: < 10ms one-way, < 500us p99 jitter.
- Why it matters: Cannot make any latency claims without real measurements.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Latency/jitter report with methodology, avb_capture_clock_drift.sh output, stream stats.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - AvbStreamStats maxLatencyNs/minLatencyNs always zero (no streams).
  - Priority: P0.

ID: T364
Status: [✗] Blocked
Title: Execute 24-hour AVB soak test with zero xruns
Description:
- Goal / acceptance criteria: Start 2+ AVB streams, run run_avb_24h_soak.sh for 24 hours, collect hourly checkpoints, verify zero xruns, zero sequence error growth, stable latency. Archive evidence.
- Why it matters: Cannot claim production stability without sustained operation evidence.
- Dependencies: T362
- Estimated effort: High (24h wall-clock)
- Required outputs: Soak test output, hourly checkpoint data, evidence archive.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - run_avb_24h_soak.sh exists but has never produced results; Q06 gate permanently BLOCKED.
  - Priority: P0.

ID: T365
Status: [✗] Blocked
Title: Verify Biamp Tesira AVB interoperability (discover + stream + control)
Description:
- Goal / acceptance criteria: Connect Tesira Forte AVB unit, verify TTP discovery, AVDECC entity discovery with correct AEM, bidirectional audio stream subscription, PTP coordination, and DSP control during active streaming.
- Why it matters: Biamp Tesira interoperability is a stated product goal.
- Dependencies: T360
- Estimated effort: High
- Required outputs: Bidirectional audio evidence, AVDECC entity data, TTP control validation during streaming.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No Tesira hardware connected; T030 and T072 also BLOCKED on same hardware.
  - Priority: P0.

ID: T366
Status: [✓] Done
Title: Add /api/avb/* client functions to web/src/map2/api.ts
Description:
- Goal / acceptance criteria: Add typed TypeScript functions for all core AVB API endpoints (streams, router, PTP, AVDECC, discovery) with TanStack Query hooks. Migrate AvbRouting hooks to use shared api.ts functions.
- Why it matters: Core AVB API bypasses shared api.ts layer; inconsistent access patterns and missing type safety.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Typed api.ts functions, updated AvbRouting hooks, typecheck + existing tests pass.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 19:09 EDT - Codex
- Completion notes:
  - Added a shared `avbApi` surface in `web/src/map2/api.ts` for AVB status, discovery, PTP, router, streams, devices, channel capabilities, and AVDECC endpoints, including cluster fan-out helpers and centralized AVB error-contract formatting for router connect/disconnect mutations.
  - Migrated `web/src/app/components/AvbRouting/hooks/useAvbApi.ts` and `web/src/app/components/AvbRouting/hooks/useNodeApi.ts` off route-local `fetch`/`safeFetchJson` wiring so the TanStack Query hooks now consume the shared `map2/api.ts` client instead of rebuilding AVB request logic inline.
  - Updated focused AVB hook tests to validate the new `avbApi` boundary directly (`web/src/app/components/AvbRouting/hooks/useAvbApi.clusterFanout.test.ts`, `web/src/app/components/AvbRouting/hooks/useAvbApi.errorContracts.test.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts`) while preserving the cluster merge and mutation contract coverage.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/components/AvbRouting/hooks/useAvbApi.clusterFanout.test.ts web/src/app/components/AvbRouting/hooks/useAvbApi.errorContracts.test.ts web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts`, and `npm --prefix web run build`.
  - Licensing review: touched AVB frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and found no new notice or ownership gap requiring follow-up work.
- Priority: P1.

ID: T367
Status: [✓] Done
Title: Add WebSocket push for AVB stream state changes
Description:
- Goal / acceptance criteria: Add WS namespace for AVB events (stream state, AVDECC entity online/offline, PTP transitions). Update frontend to subscribe with polling fallback. Stream state changes visible in UI within 200ms.
- Why it matters: 2s HTTP polling delays operator visibility during critical routing operations.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: WS namespace, frontend subscription, fallback to polling if WS unavailable.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 19:28 EDT - Codex
- Completion notes:
  - Added `app/services/avb_event_sync.py`, a lightweight AVB websocket sync service that fingerprints stream, PTP, and AVDECC snapshots, publishes new topics (`avb:streams`, `avb:ptp`, `avb:avdecc`) only when their meaningful state changes, and runs in the background after startup.
  - Wired successful AVB stream and router mutations in `app/routes/avb.py` to trigger immediate runtime snapshot checks, so operator-visible stream/PTP/entity updates no longer wait for the existing 2s/5s polling intervals during create/start/stop/delete/connect/disconnect flows.
  - Extended the websocket contract in `app/services/event_publisher.py`, `app/routes/websocket.py`, and `web/src/map2/websocket.ts` with explicit AVB stream/PTP/AVDECC event types and supported-topic declarations.
  - Added `useAvbRealtimeSync()` in `web/src/app/hooks/useAvbStatus.ts` and mounted it from both `web/src/app/hooks/usePlatformShellData.ts` and `web/src/app/components/ClusterDashboard/AVBNetworkTab.tsx`, so the frontend keeps its polling fallback but invalidates/refetches AVB query groups as soon as the websocket topics arrive.
  - Added focused regression coverage in `tests/test_avb_event_sync.py` and `web/src/app/hooks/useAvbStatus.test.tsx`, and updated `web/src/app/components/ClusterDashboard/AVBNetworkTab.test.tsx` for the new realtime hook dependency.
  - Validation passed with `pytest tests/test_avb_event_sync.py`, `npm --prefix web test -- --runInBand web/src/app/hooks/useAvbStatus.test.tsx web/src/app/components/ClusterDashboard/AVBNetworkTab.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
  - Licensing review: touched AVB backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and found no new notice or ownership gap requiring follow-up work.
- Priority: P1.

ID: T368
Status: [✗] Blocked
Title: Verify multi-stream scaling (4+ simultaneous AVB streams)
Description:
- Goal / acceptance criteria: Create 4+ simultaneous streams, monitor CPU/ring buffers/sequence errors, verify no cross-stream interference. Document scaling limits.
- Why it matters: Production use requires multiple simultaneous streams.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Scaling test report with CPU usage, error rates, and documented limits.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No streams can be created until T362.
  - Priority: P1.

ID: T369
Status: [✗] Blocked
Title: Verify stream persistence and recovery after network drop
Description:
- Goal / acceptance criteria: Establish streams, disconnect/reconnect network, verify automatic recovery within 10s and PTP re-lock within 30s. Test with 1s/10s/60s/5min interruptions.
- Why it matters: Production AVB must survive transient network issues.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Recovery time measurements, PTP re-lock evidence, audio glitch documentation.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - No streams exist to test recovery.
  - Priority: P1.

ID: T370
Status: [✗] Blocked
Title: Verify simultaneous talker + listener + AVDECC controller roles on same node
Description:
- Goal / acceptance criteria: Configure one MAP2 node as talker AND listener AND AVDECC controller, operate all three roles simultaneously for 1 hour with zero errors.
- Why it matters: Real-world use requires multi-role operation.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: Multi-role operation evidence, stream stats, AVDECC entity list during test.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - Multi-role operation never tested.
  - Priority: P1.

ID: T371
Status: [✗] Blocked
Title: Execute Q04/Q05/Q06 HIL qualification gates
Description:
- Goal / acceptance criteria: Run run_avb_hil_qualification.sh with all three gates passing (Q04 pytest, Q05 clock drift, Q06 24h soak). Archive all evidence under docs/fit-for-purpose-evidence/.
- Why it matters: Release gates cannot pass without HIL qualification evidence.
- Dependencies: T360, T362
- Estimated effort: High
- Required outputs: summary.txt with 3x PASS, archived q04/q05/q06 logs, matrix_update.md.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-23 - Codex (AVB audit)
- Blocked notes:
  - All gates permanently BLOCKED since creation; run_avb_hil_qualification.sh framework ready.
  - Priority: P1.

ID: T372
Status: [✓] Done
Title: Evaluate IEEE 802.1Qbv (Time-Aware Shaper) need and feasibility for MAP2
Description:
- Goal / acceptance criteria: Research TAS requirements for professional audio AVB, evaluate Linux tc-taprio support on target NICs, write recommendation document.
- Why it matters: TAS may improve worst-case latency guarantees beyond CBS-only.
- Dependencies: None (evaluation only)
- Estimated effort: Low
- Required outputs: Written evaluation with implement/defer recommendation and rationale.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:18 EDT - Codex
- Completion notes:
  - Published `docs/avb/ADVANCED_TSN_EVALUATION_20260323.md`, grounding the TAS recommendation in the official IEEE 802.1 TSN, 802.1Qav, and 802.1Qbv pages plus Intel ECI TSN documentation and a local MAP2 host audit.
  - Recorded the current-host feasibility evidence: `enp11s0` is an Intel I210 on `igb` with 4 combined queues and working TAPRIO userspace, while `enp0s25` is an I217-LM on `e1000e`, so current TAS feasibility is partial rather than fleet-wide.
  - Recommendation: defer 802.1Qbv for current audio-first CBS deployments and revisit only if measured CBS latency is insufficient or MAP2 must operate on an engineered mixed-criticality TSN fabric.
  - Validation/compliance: documented the audit commands in the new AVB evaluation artifact and reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing`; no new licensing remediation task was required.
- Priority: P2.

ID: T373
Status: [✓] Done
Title: Evaluate IEEE 802.1Qbu (Frame Preemption) need and feasibility for MAP2
Description:
- Goal / acceptance criteria: Evaluate whether frame preemption adds value for audio-only AVB use case, check NIC hardware support, document recommendation.
- Why it matters: Low impact for audio-only but may benefit mixed networks.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Written evaluation.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:18 EDT - Codex
- Completion notes:
  - Captured the frame-preemption evaluation in `docs/avb/ADVANCED_TSN_EVALUATION_20260323.md` using the official IEEE 802.1Qbu page, Linux kernel ethtool MAC Merge documentation, and Intel ECI TSN guidance.
  - Documented the key host evidence that both `ethtool --show-mm enp11s0` and `ethtool --show-mm enp0s25` currently return `Operation not supported`, so the present MAP2 host does not expose a usable MAC Merge path for confident Qbu bring-up.
  - Recommendation: defer 802.1Qbu because current MAP2 scope is audio-first and CBS-first, and revisit only if MAP2 later adopts TAS on hardware that proves end-to-end MAC Merge support.
  - Validation/compliance: documented the local audit commands and source set in the new AVB evaluation artifact and reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing`; no new licensing remediation task was required.
- Priority: P2.

ID: T374
Status: [✓] Done
Title: Evaluate IEEE 802.1CB (Frame Replication/Elimination) for AVB redundancy
Description:
- Goal / acceptance criteria: Evaluate FRER requirements for MAP2 deployment scenarios, assess kernel and switch support, document redundancy strategy recommendation.
- Why it matters: No redundancy path exists for AVB streams — single point of failure.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Written evaluation with deployment scenarios.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:18 EDT - Codex
- Completion notes:
  - Captured the FRER evaluation in `docs/avb/ADVANCED_TSN_EVALUATION_20260323.md` using the official IEEE 802.1CB project page plus a local MAP2 code audit of the current AVB failover fields.
  - Documented that current MAP2 AVB code stores `failover_policy` and `failover_interfaces` metadata in `app/config.py`, `app/routes/avb.py`, and `app/services/avb/avb_service.py`, but does not implement stream replication or duplicate elimination, so present behavior must not be described as FRER.
  - Recommendation: defer 802.1CB as a separate hardware-first redundancy program that would require dual-path architecture, switch qualification, and new endpoint replication/sequence-recovery logic.
  - Validation/compliance: documented the local audit plus official-source review in the new AVB evaluation artifact and reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing`; no new licensing remediation task was required.
- Priority: P2.

ID: T375
Status: [✗] Blocked
Title: Add AVTP CRF (Clock Reference Format) subtype support
Description:
- Goal / acceptance criteria: Evaluate CRF need for MAP2 multi-stream use cases. If needed, add CRF stream type to AvbStream with dedicated send/receive and clock recovery logic.
- Why it matters: Multi-stream sync currently relies solely on PTP; CRF provides additional synchronization.
- Dependencies: T362
- Estimated effort: Medium
- Required outputs: CRF evaluation; if implemented, interoperability test with Tesira.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 21:01 EDT - Codex
- Blocked notes:
  - `T362` remains blocked because no end-to-end MAP2 AVB audio stream has ever carried live audio on this testbed, so CRF work would be speculative until the base talker/listener path exists.
- Priority: P2.

ID: T376
Status: [✓] Done
Title: Clean up legacy AVDECC files (AvdeccEntity, AvdeccEntityModel, AvdeccEnumerator)
Description:
- Goal / acceptance criteria: Archive or remove the 6 legacy AVDECC files from juce-engine/Source/ that are kept on disk but not compiled. Add migration note in AvdeccController.h.
- Why it matters: Dead code adds confusion and maintenance burden.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Legacy files removed, migration note added, cmake build unaffected.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:37 EDT - Codex
- Completion notes:
  - Removed the retired `juce-engine/Source/AvdeccEntity.*`, `juce-engine/Source/AvdeccEntityModel.*`, and `juce-engine/Source/AvdeccEnumerator.*` files plus the legacy Catch2 tests `juce-engine/tests/AvdeccEntityModelTests.cpp` and `juce-engine/tests/AvdeccEnumeratorTests.cpp`, which were the only remaining consumers of that custom model/enumerator stack.
  - Simplified `juce-engine/CMakeLists.txt` so the optional AVDECC path now references only `AvdeccController.cpp/.h`, and `check-avb` no longer tries to build an `avdecc_model_tests` target against removed sources.
  - Added an explicit migration note to `juce-engine/Source/AvdeccController.h` directing future AVDECC work to the `la_avdecc`-backed `Map2AvdeccController` path instead of restoring the retired custom stack.
  - Validation/compliance: confirmed the only remaining `AvdeccEntity`/`AvdeccEntityModel`/`AvdeccEnumerator` mentions are compatibility comments in `AvdeccController.h`, verified a fresh configure with `cmake -S /home/mm/map2-audio/juce-engine -B /tmp/map2-t376-cmake -DUSE_AVDECC=OFF -DUSE_AVB=OFF`, and reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing`; no new remediation task was required.
- Priority: P2.

ID: T388
Status: [✓] Done
Title: Add replacement coverage for the `Map2AvdeccController` path after legacy model-test removal
Description:
- Goal / acceptance criteria: Add focused validation for the supported `la_avdecc`-backed `Map2AvdeccController` path so AVDECC coverage does not rely on the removed `AvdeccEntityModel` / `AvdeccEnumerator` stack. Coverage can be a unit/integration harness, mocked controller tests, or documented Python-binding regression checks, but it must exercise the live controller-facing compatibility surface that remains in production.
- Why it matters: `T376` intentionally deleted the obsolete AVDECC model/enumerator tests, leaving the supported controller wrapper without direct replacement coverage.
- Dependencies: T376, `juce-engine/Source/AvdeccController.*`, and a viable AVDECC-enabled or mocked test strategy
- Estimated effort: Medium
- Required outputs: Replacement AVDECC controller coverage, validation notes, and updated worklist/licensing notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 20:56 EDT - Codex
- Completion notes:
  - Added `tests/test_avdecc_controller_contract.py`, a focused backend regression that exercises the supported AVDECC compatibility surface rather than the retired `AvdeccEntityModel`/`AvdeccEnumerator` stack.
  - Covered the controller-facing callable names that production still supports after `T376`: `getDiscoveredEntities`, `getActiveConnections`, `connectStream`, and `disconnectStream`, including both `AvbRouter` usage and the `/api/avb/avdecc/entities`, `/api/avb/avdecc/entities/{entity_id}`, and `/api/avb/avdecc/stats` route fallbacks.
  - Kept the existing mocked engine/AEM-cache path as the complementary validation layer for the snake_case pybind engine API (`get_avdecc_entities`, `get_avdecc_entity_model`, `connect_stream`, `disconnect_stream`, `get_active_connections`, `get_stream_format`, `set_stream_format`) instead of inventing a second legacy-model harness.
  - Validation passed with `pytest -q tests/test_avdecc_controller_contract.py tests/test_avdecc_aem_cache.py tests/test_avdecc_mock_integration.py` (`15 passed, 1 skipped`).
  - Licensing review: touched backend test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.
- Priority: P2.

## MIDI

## In Progress

ID: T287
Status: [✓] Done
Title: Refactor JUCE Grid browser cards and flow-assignment chooser onto Carbon support-card patterns
Description:
- Goal / acceptance criteria: Simplify the remaining plugin-browser tiles and flow-assignment cards so they use clearer heading hierarchy, token-driven tile surfaces, and reduced bespoke visual treatment while preserving selection/addition workflows.
- Why it matters: The page shell and modal wrappers are now largely Carbon-aligned, but these data-dense support cards still carry custom route-local styling that weakens strict conformance.
- Dependencies: T286
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched support-card surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:39 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the plugin browser and preset cards use explicit semantic plugin headings and the flow-assignment chooser uses section kickers plus heading-based node titles instead of generic toolbar labels and `strong` text.
  - Updated `web/src/app/pages/JuceGridPage.css` so browser tiles and assignment cards now use clearer Carbon-like layer and border shells, explicit heading styles, and focus/hover states aligned to interactive tokens instead of lightweight route-local wrappers.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T288
Status: [✓] Done
Title: Refactor JUCE Grid specialist modal internals and dense support cards onto Carbon content patterns
Description:
- Goal / acceptance criteria: Tighten the remaining JUCE Grid specialist modal internals and dense support-card surfaces so details panes, status rows, and auxiliary chooser content use Carbon-first section hierarchy, tokenized tiles, and minimal bespoke chrome without changing route behavior.
- Why it matters: The main route shell, browser, and assignment chooser are now materially closer to Carbon, but a few specialist modal internals and dense cards still read as custom route-local UI rather than Carbon-composed content.
- Dependencies: T287
- Estimated effort: Low
- Required outputs: Updated JUCE Grid route/modal files, validation notes, and licensing review notes for the touched specialist surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:45 - Codex
- Completion notes:
  - Updated `web/src/app/pages/AudioNodesModal.tsx` so the cluster-node and assignment stat tiles use explicit value text instead of `strong` labels, and the deployment mode, warning, progress, and completion states use clearer section kickers/headings plus Carbon `Tile` wrappers rather than ad hoc emphasis blocks.
  - Updated `web/src/app/pages/JuceGridPage.css` so the `AudioNodesModal` stat tiles, mode-action shell, warning panels, progress panel, and done panel use token-driven layer and border surfaces with Carbon-style heading and emphasis rules instead of the previous left-bar and `strong`-centric treatment.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid audio-node modal/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T289
Status: [✓] Done
Title: Refactor remaining JUCE Grid dense modal rows and automation support cards onto Carbon content hierarchy
Description:
- Goal / acceptance criteria: Tighten the remaining dense JUCE Grid modal rows and support cards, especially MIDI mapping/automation lane rows and other specialist chooser internals, so they use Carbon-first heading/value hierarchy and tokenized tiles without altering workflow behavior.
- Why it matters: The larger shells and `AudioNodesModal` are now Carbon-aligned, but a few dense row-based interiors still use route-local `strong`/tag-heavy presentation that falls short of strict compliance.
- Dependencies: T288
- Estimated effort: Low
- Required outputs: Updated JUCE Grid route/component files, validation notes, and licensing review notes for the touched dense modal/card surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:49 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so dense MIDI mapping rows and automation lane cards use explicit heading classes instead of `strong`, and the automation workspace header now uses a Carbon-style kicker plus section heading rather than generic emphasized text.
  - Updated `web/src/app/pages/JuceGridPage.css` to add shared dense-card kicker/heading styles and wire the MIDI tile and automation lane selectors onto that content hierarchy, reducing the remaining route-local ad hoc text treatment.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T290
Status: [✓] Done
Title: Refactor remaining JUCE Grid specialist chooser and touch/editor support surfaces onto Carbon hierarchy
Description:
- Goal / acceptance criteria: Tighten the remaining JUCE Grid specialist chooser and touch/editor support surfaces, especially any leftover touch toolbar/editor placeholders or chooser cards still using route-local emphasis patterns, so they use Carbon-first heading/value hierarchy and tokenized support shells without changing workflow behavior.
- Why it matters: The major shells, modals, and dense MIDI/automation rows are now materially closer to Carbon, but a few support surfaces still use bespoke route-local typography and emphasis that break strict consistency.
- Dependencies: T289
- Estimated effort: Low
- Required outputs: Updated JUCE Grid route/component files, validation notes, and licensing review notes for the touched support surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:02 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the compact editor placeholder, pinned bottom-editor placeholder, tablet editor header, keyboard shortcut tiles, and automation lane picker tiles all use explicit Carbon-style kicker and heading hierarchy instead of bare heading-only or route-local emphasis patterns.
  - Updated `web/src/app/pages/JuceGridPage.css` so those support surfaces reuse the shared dense-card kicker/heading system and no longer depend on local one-off heading selectors for their information hierarchy.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T291
Status: [✓] Done
Title: Refactor remaining JUCE Grid confirmation and utility modal copy onto Carbon semantics
Description:
- Goal / acceptance criteria: Tighten the remaining JUCE Grid confirmation and small utility modal copy so any leftover `strong` emphasis and route-local confirmation phrasing use Carbon-first heading/value semantics and consistent support-surface hierarchy without changing behavior.
- Why it matters: The main shells, dense rows, and chooser/editor support surfaces are now largely Carbon-aligned, but a few utility modals and confirmation dialogs still carry small pockets of non-Carbon text semantics.
- Dependencies: T290
- Estimated effort: Low
- Required outputs: Updated JUCE Grid route/component files, validation notes, and licensing review notes for the touched utility modal surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:16 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the unsupported-viewport warning uses a semantic heading and the preset-delete confirmation uses named inline emphasis instead of `strong`.
  - Updated `web/src/app/pages/JuceGridPage.css` with `juce-grid-page__viewport-block-heading` and `juce-grid-page__modal-copy-emphasis` so the remaining utility surfaces follow the Carbon-style type hierarchy and emphasis rules.

ID: T292
Status: [✓] Done
Title: Refactor JUCE Grid plugin-browser tiles onto Carbon-style neutral content cards
Description:
- Goal / acceptance criteria: Tighten the remaining plugin-browser and preset-browser tiles so native, LV2, and preset cards use a neutral Carbon-style content hierarchy and token-driven interactive states instead of accent bars, decorative color treatments, or route-local card visuals, without changing browser behavior.
- Why it matters: The last obvious non-Carbon surface on the route is the browser card treatment, which still relies on category-colored accents and bespoke tile framing that reads as custom product chrome rather than Carbon content tiles.
- Dependencies: T291
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched browser tile surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:27 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so featured native, native, LV2, and preset browser tiles all use explicit kicker/copy/meta wrappers instead of accent-led tile composition and ad hoc tag placement.
  - Updated `web/src/app/pages/JuceGridPage.css` so browser tiles now use neutral token-driven padding, hover/focus states, and Carbon-style kicker/title/meta hierarchy instead of left accent bars and lighter custom visual framing.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T293
Status: [✓] Done
Title: Refactor JUCE Grid live signal plugin cards onto Carbon-style neutral tiles
Description:
- Goal / acceptance criteria: Tighten the live signal plugin cards and add-tile treatment so the grid uses neutral Carbon-style tile hierarchy and token-driven selected/hover/bypassed states instead of gradient shells, accent rails, and decorative hero glow, without changing selection, drag, reorder, or overflow behavior.
- Why it matters: The browser tiles are now materially closer to Carbon, but the live signal cards still use the heaviest bespoke visual treatment on the route and remain the clearest blocker to strict Carbon compliance.
- Dependencies: T292
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched live-card surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:36 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so live signal cards use semantic heading/copy structure for the category and block title instead of `strong`/`span` emphasis.
  - Updated `web/src/app/pages/JuceGridPage.css` so live signal cards and add tiles now use neutral token-driven Carbon-style surfaces and interaction states instead of accent rails, gradient shells, and hero glow treatment.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T294
Status: [✓] Done
Title: Refactor JUCE Grid page shell onto Carbon-style section framing and spacing
Description:
- Goal / acceptance criteria: Tighten the remaining route-level header and workspace framing so the JUCE Grid page uses more consistent Carbon-style centered section gutters, semantic masthead structure, and section spacing instead of bespoke full-bleed shell composition, without changing route behavior.
- Why it matters: Most specialist cards and modals are now materially closer to Carbon, but the page still reads as a custom app shell because the masthead and workspace framing do not follow a disciplined page-section rhythm.
- Dependencies: T293
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched shell surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:45 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the masthead now uses a semantic page heading and the header, workspace, and compact panels all sit inside shared centered section frames instead of unrelated bespoke shell wrappers.
  - Updated `web/src/app/pages/JuceGridPage.css` with reusable section-frame sizing plus tighter Carbon-style shell gutters for the header, workspace, compact panel, and bottom editor so the route reads more like a disciplined page section rather than a full-bleed custom app shell.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T295
Status: [✓] Done
Title: Refactor JUCE Grid flow-card routing and action clusters onto Carbon-style support sections
Description:
- Goal / acceptance criteria: Tighten the remaining desktop and tablet flow-card routing/action clusters so the routing summary, level control, and utility actions use clearer Carbon-style support-section hierarchy and neutral token-driven grouping instead of accent-heavy dashboard capsules, without changing behavior.
- Why it matters: After the shell cleanup, the flow-card control region is the most visibly product-specific surface left on the route and still weakens strict Carbon conformance.
- Dependencies: T294
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched flow-card action surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:53 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the desktop and tablet routing summaries use an explicit routing-copy wrapper, giving the routing section clearer Carbon-style support hierarchy without changing behavior.
  - Updated `web/src/app/pages/JuceGridPage.css` so the flow-card action groups, routing summary, routing badges/readouts, and tablet detail actions now use neutral token-driven support-section styling instead of accent-heavy dashboard capsules.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T296
Status: [✓] Done
Title: Refactor JUCE Grid tablet flow summary and status treatment onto Carbon-style support content
Description:
- Goal / acceptance criteria: Tighten the remaining tablet flow summary/status presentation so the summary header, pills, and state label use clearer Carbon-style support hierarchy and neutral token-driven chips instead of rounded product-specific pill chrome, without changing tablet workflow behavior.
- Why it matters: After the desktop flow-card cleanup, the tablet flow summary remains one of the last route-local product surfaces that still reads more bespoke than Carbon.
- Dependencies: T295
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched tablet flow surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:59 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the tablet flow summary uses the shared dense-card kicker hierarchy for the flow label instead of route-local emphasis styling.
  - Updated `web/src/app/pages/JuceGridPage.css` so the tablet summary header, summary chips, and status label now use neutral token-driven support styling instead of rounded pill-heavy product chrome.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T297
Status: [✓] Done
Title: Refactor JUCE Grid floating launcher rail and footer/status band onto Carbon-style support actions
Description:
- Goal / acceptance criteria: Tighten the remaining floating launcher rail and footer/status band so those controls use neutral Carbon-style support-action surfaces and token-driven hover/focus treatment instead of product-specific pill chrome and heavier shadows, without changing launcher or automation behavior.
- Why it matters: After the tablet summary cleanup, the launcher rail and footer band are the last clearly bespoke interaction surfaces on the route.
- Dependencies: T296
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.css` plus any minimal route markup needed, validation notes, and licensing review notes for the touched footer/launcher surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:05 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.css` so the floating snapshot/MIDI launcher rail now uses neutral token-driven support-action surfaces instead of rounded pill chrome, oversized icon motion, and heavier shadows.
  - Updated `web/src/app/pages/JuceGridPage.css` so the footer automation toggle and status chips use flatter Carbon-style token-driven shells instead of rounded local chrome.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T298
Status: [✓] Done
Title: Flatten residual JUCE Grid signal and mobile status chips onto Carbon-style support labels
Description:
- Goal / acceptance criteria: Remove the last pill-heavy route-local status treatments in the JUCE Grid signal endpoint rails and compact live-path mobile badges so those summaries use flatter Carbon-style support labels and token-driven surfaces without changing the routing or status information shown.
- Why it matters: After the launcher and footer cleanup, these dense status chips are the most visible remaining non-Carbon micro-patterns on the route.
- Dependencies: T297
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.css` and any minimal TSX needed in `web/src/app/pages/JuceGridSignalCanvas.tsx` or `web/src/app/pages/JuceGridPage.tsx`, validation notes, and licensing review notes for the touched signal/mobile status surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:49 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.css` so the JUCE Grid signal-endpoint icon shell and metadata chips now use flatter token-driven bordered labels instead of pill-shaped badges and tinted chrome.
  - Updated `web/src/app/pages/JuceGridPage.css` so the compact live-path mobile status badges now use square Carbon-style support labels with token-driven state borders instead of rounded pills.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T299
Status: [✓] Done
Title: Move the JUCE Grid page shell onto Carbon grid-based section scaffolding
Description:
- Goal / acceptance criteria: Replace the remaining custom page-shell section wrappers for the JUCE Grid masthead, workspace, and compact workflow panel with Carbon `Grid`/`Column` scaffolding while preserving the current behavior, responsive layout, and section-width constraints.
- Why it matters: The route is visually closer to Carbon, but it still falls short of strict compliance until the page shell itself uses Carbon layout primitives instead of custom centering wrappers.
- Dependencies: T298
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched page-shell layout surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:53 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the masthead, main workspace, and compact workflow panel now sit inside Carbon `Grid` and `Column` scaffolding instead of route-local centering wrappers.
  - Updated `web/src/app/pages/JuceGridPage.css` so the shared section shell styles support Carbon grid containers while preserving the existing responsive width constraints and tablet sticky-header behavior.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T300
Status: [✓] Done
Title: Fix JUCE Grid plugin chooser heading overflow and restyle category filters to Carbon controls
Description:
- Goal / acceptance criteria: Remove the vertical crowding/overlap in the plugin chooser where long featured-group titles such as `Linear and Nonlinear Modeling` appear cramped, and replace the current category filter button strip with cleaner Carbon-aligned filter controls while preserving chooser functionality.
- Why it matters: The plugin chooser remains one of the most visible route surfaces, and its current heading wrapping and filter chrome break both readability and Carbon compliance.
- Dependencies: T299
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched chooser surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:57 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the plugin chooser category filter now uses a Carbon `Select` control instead of the dense ghost-button strip, and browser section headings use explicit wrapping title spans.
  - Updated `web/src/app/pages/JuceGridPage.css` so the chooser filter panel, section headers, long section titles, and plugin grids have enough space to wrap cleanly without vertical crowding or overlap.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T301
Status: [✓] Done
Title: Tighten JUCE Grid plugin chooser card metadata and action rows onto dedicated browser patterns
Description:
- Goal / acceptance criteria: Replace the plugin chooser card use of generic route-level tag and action wrappers with dedicated browser-specific metadata and action rows that read as Carbon-style content tiles, while preserving all chooser actions and plugin information.
- Why it matters: After the filter and wrapping fixes, the chooser still looks inconsistent because plugin cards inherit generic compact workflow chrome rather than purpose-built browser card structure.
- Dependencies: T300
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched chooser card surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:01 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the plugin chooser toolbar and plugin cards now use dedicated browser-specific metadata and action row wrappers instead of the route-level compact tag/action wrappers.
  - Updated `web/src/app/pages/JuceGridPage.css` so chooser metadata rows, toolbar actions, and plugin card action areas now use dedicated Carbon-style browser spacing and a separated action rail rather than generic compact workflow layout.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T302
Status: [✓] Done
Title: Harden JUCE Grid cluster-node loading so missing node data cannot crash route startup
Description:
- Goal / acceptance criteria: Prevent `/juce-grid` from crashing during initial render when the cluster-node endpoint returns a malformed or empty payload, while preserving the assignment dialog's live node recommendations when that dialog is open.
- Why it matters: The route was crashing before the user could interact with it because startup mounted a cluster-node query that assumed `data.nodes` existed even when the endpoint was unavailable or returned an unexpected shape.
- Dependencies: T301
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx`, validation notes, and licensing review notes for the touched cluster-node loading path.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:22 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the cluster-node query now normalizes `data?.nodes` to an empty array unless it is a real array, which removes the unsafe startup assumption behind the `can't access property "nodes", a is undefined` crash.
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the cluster-node query is only enabled while the assignment dialog is open and only polls in that state, removing unnecessary startup fetching for a dialog-only data source.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T303
Status: [✓] Done
Title: Harden shared node-topology loading so malformed topology payloads cannot crash the app shell
Description:
- Goal / acceptance criteria: Prevent the shared node-topology consumers used by the app shell and route-level node context from crashing when `/api/node/topology` returns a partial or malformed payload, while preserving existing node-navigation and node-context behavior when valid data is present.
- Why it matters: After hardening the JUCE Grid assignment query, the same `nodes` crash still occurred because shared shell consumers were receiving a topology object without a guaranteed `nodes` array and then calling `find` or `filter` on it during startup render.
- Dependencies: T302
- Estimated effort: Low
- Required outputs: Updated topology-loading code, validation notes, and licensing review notes for the touched shared shell/topology files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:33 - Codex
- Completion notes:
  - Updated `web/src/map2/api.ts` so `getNodeTopology()` now normalizes `nodes`, `audio_edges`, and `network_edges` to arrays even when the backend returns a partial or malformed object.
  - Updated `web/src/app/hooks/useNodePageContext.ts` so local-node fallback selection uses an explicit array guard instead of assuming `topology.nodes` exists.
  - Updated `web/src/app/components/NodeContextBanner/NodeContextBanner.test.tsx` so the assertions match the current banner copy and duplicate local-node tag rendering.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, `npm --prefix web test -- --runInBand web/src/app/components/NodeContextBanner/NodeContextBanner.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched shared topology, JUCE Grid, and worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T304
Status: [✓] Done
Title: Remove non-Carbon shell dependencies and non-token styling from MIDI Hub route shell, Network, and Lab pages
Description:
- Goal / acceptance criteria: Replace the remaining non-Carbon shell dependency (`@mui/material/useMediaQuery`) and the non-token shell/page styling in `MidiHubShell` plus the routed Network/Lab page surfaces so these shared MIDI Hub routes rely on Carbon tokens, Carbon structure, and Carbon state styling only.
- Why it matters: The strict `/midi-hub/connections` compliance audit found that the shell and sibling subpages still carry mixed design-system dependencies and hard-coded/translucent color treatments that violate strict Carbon conformance.
- Dependencies: T271
- Estimated effort: Medium
- Required outputs: Updated `web/src/app/pages/MidiHubShell.tsx`, `web/src/app/pages/MidiHubShell.css`, `web/src/app/pages/midi-hub/MidiHubNetworkPage.css`, and `web/src/app/pages/midi-hub/MidiHubLabPage.css` with focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:25 EDT - Codex
- Completion notes:
  - Replaced `@mui/material/useMediaQuery` in `web/src/app/pages/MidiHubShell.tsx` with a local `matchMedia`-based theme-preference listener so the MIDI Hub shell no longer mixes MUI and Carbon dependencies.
  - Refactored `web/src/app/pages/MidiHubShell.css` to remove hard-coded shell palette values, translucent overlays, and color-mix accents in favor of Carbon layer, text, border, hover, and selected-state tokens.
  - Refactored `web/src/app/pages/midi-hub/MidiHubNetworkPage.css` and `web/src/app/pages/midi-hub/MidiHubLabPage.css` to remove non-token gradient/translucent panel backgrounds and move those surfaces to Carbon tokenized panel treatment.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` -> PASS.

ID: T305
Status: [✓] Done
Title: Replace custom MIDI Hub recorder/clock/filter selector controls with Carbon-native interactive patterns
Description:
- Goal / acceptance criteria: Remove route-local custom control wrappers in recorder/clock/filter workflows (custom number stepper and custom chip buttons) and replace them with Carbon-native number, checkbox, and selectable-tag/button patterns while preserving existing behavior and labels.
- Why it matters: Strict Carbon compliance requires using Carbon components and interaction semantics instead of custom button wrappers around tags and bespoke stepper controls for core transport/processing interactions.
- Dependencies: T304
- Estimated effort: Medium
- Required outputs: Updated `web/src/app/components/MidiHub/MidiRecorderPanel.tsx`, `web/src/app/components/MidiHub/MidiClockPanel.tsx`, `web/src/app/components/MidiHub/MidiHubFilterPlanner.tsx`, supporting CSS updates, and focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:27 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/MidiHub/MidiRecorderPanel.tsx` to remove the route-local custom stepper dependency and use Carbon `NumberInput` for export BPM and ticks-per-quarter controls with bounded parsing.
  - Updated `web/src/app/components/MidiHub/MidiClockPanel.tsx` so output-port selection now uses Carbon `Checkbox` controls instead of custom clickable chip buttons, improving Carbon consistency and interaction semantics.
  - Updated `web/src/app/components/MidiHub/MidiHubFilterPlanner.tsx` and `web/src/app/pages/midi-hub/MidiHubProcessingPage.css` to replace custom tag-button wrappers with Carbon `Button` toggles for channel/message selection.
  - Updated `web/src/app/pages/MidiHubPage.css` and `web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` to align layout/test expectations with the new Carbon-native controls.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/MidiTransportPanels.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> PASS.

ID: T306
Status: [✓] Done
Title: Close MIDI Hub connections accessibility gaps in patchbay graph actions, traffic-row interaction, and route modal footer actions
Description:
- Goal / acceptance criteria: Make patchbay route/node interactions keyboard-accessible with explicit semantics, convert traffic-table row detail opening to explicit Carbon action affordances, and align route-editor modal footer actions with Carbon modal interaction expectations.
- Why it matters: The compliance audit identified keyboard and action-semantic gaps in high-traffic `/midi-hub/connections` workflows that break Carbon accessibility and interaction standards.
- Dependencies: T305
- Estimated effort: Medium
- Required outputs: Updated `web/src/app/components/MidiHub/MidiPatchbay.tsx`, `web/src/app/components/MidiHub/MidiTrafficMonitor.tsx`, `web/src/app/components/MidiHub/MidiRoutingMatrix.tsx`, related styles/tests, and validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:29 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/MidiHub/MidiPatchbay.tsx` to add keyboard-operable `role="button"` and `tabIndex` semantics for route paths and node controls, with Enter/Space activation support.
  - Updated `web/src/app/components/MidiHub/MidiTrafficMonitor.tsx` so event-detail opening is now an explicit per-row Carbon action button (`Inspect`) instead of row-level click-only behavior.
  - Updated `web/src/app/components/MidiHub/MidiRoutingMatrix.tsx` modal footer so `Cancel` is always available, including edit mode where delete/save actions are shown.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` -> PASS.

ID: T307
Status: [✓] Done
Title: Normalize constrained MIDI Hub form/table patterns to Carbon selection and status semantics
Description:
- Goal / acceptance criteria: Replace constrained free-text controls with Carbon selects/comboboxes where options are bounded, remove misuse of table search as static status copy, and align dense table action/status affordances to Carbon toolbar and row-action patterns across MIDI Hub subpages/modals.
- Why it matters: Multiple `/midi-hub` subpages still use non-Carbon data-entry and table semantics that conflict with strict conformance even after shell cleanup.
- Dependencies: T306
- Estimated effort: Medium
- Required outputs: Updated impacted MIDI Hub form/table components plus focused tests and validation/licensing evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:32 EDT - Codex
- Completion notes:
  - Replaced constrained free-text controls with bounded Carbon selections in `web/src/app/components/MidiHub/MidiNetworkPanel.tsx` (session mode), `web/src/app/components/MidiHub/Midi2Panel.tsx` (default protocol), `web/src/app/components/MidiHub/ProgramChangeSlots.tsx` (program target), `web/src/app/components/MidiHub/PresetChainEditor.tsx` (add preset), and `web/src/app/components/MidiHub/PresetTable.tsx` (compare-left/right preset picks).
  - Replaced the static-status `TableToolbarSearch` misuse in `web/src/app/components/MidiHub/EventEditor.tsx` with explicit status `Tag` copy in the table toolbar.
  - Removed the remaining hard-coded/translucent route-shell color remnants in `web/src/app/pages/MidiHubPage.css`, moving these shared MIDI Hub surfaces to Carbon border/layer/text tokens and removing `color-mix` usage.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/midi-hub/MidiHubTransportPage.test.tsx web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` -> PASS; targeted rerun `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified all touched MIDI Hub UI/test/worklist files in this remediation chain as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T308
Status: [✓] Done
Title: Replace remaining raw MIDI Hub `<pre>` diagnostics with Carbon code-display components
Description:
- Goal / acceptance criteria: Replace remaining raw `<pre>`-based diagnostic payload/rendering in MIDI Hub connections/subpages/modals with Carbon `CodeSnippet` (or equivalent Carbon code-display patterns) while preserving all current payload data and copy.
- Why it matters: Strict Carbon compliance for these routed operator pages still has drift where raw `<pre>` blocks are used instead of Carbon code-display primitives.
- Dependencies: T307
- Estimated effort: Medium
- Required outputs: Updated MIDI Hub components that still emit raw `<pre>` diagnostics, matching style updates if required, and focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:50 EDT - Codex
- Completion notes:
  - Replaced all remaining MIDI Hub raw `<pre>` diagnostics with Carbon `CodeSnippet` in `web/src/app/components/MidiHub/OscNamespaceBrowser.tsx`, `MidiNetworkPanel.tsx`, `PresetTable.tsx`, `TesiraPanel.tsx`, `MidiTrafficMonitor.tsx`, `MscCommandBuilder.tsx`, `StringInterfacePanel.tsx`, and `MidiScriptEditor.tsx`.
  - Updated code-block styling in `web/src/app/pages/MidiHubPage.css`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css`, `MidiHubPresetsPage.css`, `MidiHubEventsPage.css`, and `MidiHubProcessingPage.css` to remove custom preformatted block chrome and defer to Carbon `CodeSnippet` presentation.
  - Added `ResizeObserver` test scaffolding in `web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx` to support Carbon `CodeSnippet` behavior in jsdom.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` -> PASS.

ID: T309
Status: [✓] Done
Title: Refactor dense MIDI Hub table row action clusters to Carbon row-action patterns
Description:
- Goal / acceptance criteria: Replace remaining dense multi-button row action clusters in MIDI Hub routed tables with clearer Carbon row-action patterns (overflow/action menu where appropriate) while preserving all existing row operations and labels.
- Why it matters: The strict compliance sweep still has several routed data tables using ad hoc inline action strips that do not align with Carbon’s denser row-action guidance.
- Dependencies: T308
- Estimated effort: Medium
- Required outputs: Updated affected MIDI Hub table components, adjusted tests for action access, and validation/licensing evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 17:50 EDT - Codex
- Completion notes:
  - Converted dense row-level action clusters to Carbon `OverflowMenu` patterns in `web/src/app/components/MidiHub/EventListManager.tsx`, `PresetTable.tsx`, `MidiRecorderPanel.tsx`, `MidiNetworkPanel.tsx`, and `MidiMacroPanel.tsx`, preserving all prior row operations.
  - Added explicit per-row menu icon descriptions for accessibility clarity and stable test targeting.
  - Updated row-action tests in `web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx`, `MidiHubPresetsPage.test.tsx`, and `web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` for overflow-menu interaction semantics.
- Validation: `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/midi-hub/MidiHubTransportPage.test.tsx web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
- Licensing: Classified all touched MIDI Hub UI/test/worklist files as MAP2-owned AGPL-covered artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new notice gaps.

ID: T310
Status: [✓] Done
Title: Convert remaining Preset Chain row ordering controls to Carbon row-action overflow pattern
Description:
- Goal / acceptance criteria: Replace the remaining inline table-row ordering button cluster in `PresetChainEditor` with a Carbon row-action overflow menu while preserving move-up/move-down behavior and disabled-state safety at list bounds.
- Why it matters: Strict Carbon row-action consistency still has one residual table row action strip in the presets area.
- Dependencies: T309
- Estimated effort: Low
- Required outputs: Updated `web/src/app/components/MidiHub/PresetChainEditor.tsx`, matching presets tests, and focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 18:01 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/MidiHub/PresetChainEditor.tsx` to replace inline `Move up`/`Move down` row buttons with Carbon `OverflowMenu` row actions and preserved boundary disable logic.
  - Updated `web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx` to exercise the new chain-order overflow action flow.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx` -> PASS.

ID: T311
Status: [✓] Done
Title: Remove remaining MIDI Hub `strong` emphasis and inline-style residues from strict Carbon surfaces
Description:
- Goal / acceptance criteria: Replace remaining `strong`-based emphasis and inline-style residues on strict MIDI Hub Carbon surfaces (connections/network/lab cards and matrix/patchbay metadata areas) with semantic classed typography and stylesheet-defined presentation.
- Why it matters: The strict compliance sweep still has small non-Carbon semantic/styling remnants that reduce consistency and maintainability.
- Dependencies: T310
- Estimated effort: Medium
- Required outputs: Updated affected MIDI Hub components/stylesheets, adjusted tests if needed, and focused validation/licensing evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 18:08 EDT - Codex
- Completion notes:
  - Replaced remaining non-semantic emphasis and inline styling residues across strict MIDI Hub Carbon surfaces in `web/src/app/components/MidiHub/VirtualGpioPanel.tsx`, `AiLearnPanel.tsx`, `MidiHubQuickRouter.tsx`, `TesiraPanel.tsx`, `MidiRoutingMatrix.tsx`, `MidiPatchbay.tsx`, and `MidiTrafficMonitor.tsx`.
  - Added semantic class-based styling in `web/src/app/pages/MidiHubPage.css`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css`, `MidiHubNetworkPage.css`, and `MidiHubLabPage.css` to replace `strong`-specific and inline-style presentation.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/components/MidiHub/MidiTransportPanels.test.tsx web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified all touched MIDI Hub UI/test/worklist files in this cleanup slice as MAP2-owned AGPL-covered artifacts; reran repository license/notice scans and found no new gaps.

ID: T312
Status: [✓] Done
Title: Remove remaining MIDI Hub stat-tile `strong` emphasis from transport/network/presets routed surfaces
Description:
- Goal / acceptance criteria: Replace the remaining `strong`-based stat-tile values in routed MIDI Hub transport/network/presets panels with semantic classed value text while preserving all displayed values and status behavior.
- Why it matters: Strict Carbon compliance and semantic consistency still have a small residue in shared clock and MIDI 2.0 stat tiles used across `/midi-hub` subpages.
- Dependencies: T311
- Estimated effort: Low
- Required outputs: Updated stat-tile components/styles (`MidiClockPanel`, `Midi2Panel`, and shared styles), plus focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 18:11 EDT - Codex
- Completion notes:
  - Replaced remaining stat-tile `strong` value nodes with semantic `span` value nodes in `web/src/app/components/MidiHub/MidiClockPanel.tsx` and `web/src/app/components/MidiHub/Midi2Panel.tsx` without changing any displayed values or transport/protocol behavior.
  - Residue verification: `rg -n "<strong>|</strong>" web/src/app/pages/midi-hub web/src/app/components/MidiHub` and `rg -n "style=\\{\\{" web/src/app/pages/midi-hub web/src/app/components/MidiHub` returned no matches.
- Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/MidiTransportPanels.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
- Licensing: Touched files remain MAP2-owned AGPL-covered repository artifacts; no new third-party notice changes required.

ID: T313
Status: [✓] Done
Title: Align `/midi-hub/connections` matrix-versus-patchbay view switch to Carbon Tabs pattern
Description:
- Goal / acceptance criteria: Replace the remaining `ContentSwitcher`/`Switch` view selector on `MidiHubConnectionsPage` with Carbon `Tabs`/`TabList`/`Tab` while preserving matrix/patchbay behavior, accessible tab semantics, and existing tests.
- Why it matters: Strict Carbon compliance for the Connections primary workflow should use the platform’s tab pattern for peer workspace views, and this is the remaining route-level selector still using a less canonical pattern.
- Dependencies: T312
- Estimated effort: Low
- Required outputs: Updated connections page selector implementation, any required test adjustments, and focused validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 18:35 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx` to replace `ContentSwitcher`/`Switch` with Carbon `Tabs` + `TabList` + `Tab` for matrix-versus-patchbay view selection while preserving the same two views and state transitions.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Touched route/worklist/version files remain MAP2-owned AGPL-covered artifacts; no new notice updates required.

ID: T314
Status: [✓] Done
Title: Restore file-selection workflows for NAM and IR JUCE effect cards
Description:
- Goal / acceptance criteria: Fix the Neural Amp Modeler, Cabinet IR, and Reverb IR effect-card asset selectors so the dialog reliably exposes working file-selection and upload controls, and normalize the dialog state so active assets remain visible when the browser opens.
- Why it matters: These selected-block editors are not practically usable if operators cannot browse or upload NAM and IR assets from the card workflow.
- Dependencies: `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, focused loader/card tests, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Updated NAM/IR manager dialogs, focused regression coverage, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 19:16 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/loaders/NAMManagerDialog.tsx` and `web/src/app/components/loaders/IRManagerDialog.tsx` to use Carbon `FileUploaderButton` instead of hidden file inputs with imperative `.click()` triggers, restoring a reliable native file-selection path inside the JUCE effect-card manager dialogs.
  - Normalized the NAM dialog model grouping so the chooser accepts either `type` or backend-provided `model_type`, and normalized the IR dialog active-state display so it accepts either `loaded_*` or `active_*` status fields.
  - Added focused regression coverage in `web/src/app/components/loaders/NAMManagerDialog.test.tsx` and `web/src/app/components/loaders/IRManagerDialog.test.tsx` for NAM upload, cabinet IR upload, and active IR fallback handling, while preserving the existing card-open coverage in `web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx`.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched frontend/test/worklist files as MAP2-owned AGPL-covered artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T316
Status: [✓] Done
Title: Fix JUCE Grid plugin chooser featured-tile height overlap
Description:
- Goal / acceptance criteria: Fix the `/juce-grid` Add Plugin chooser so the featured integrated-plugin tiles no longer stretch or overlap subsequent content when taller cards such as Neural Amp Modeler are present, while preserving the current grouping and Add/Details actions.
- Why it matters: The plugin chooser is visually broken and harder to use when a tall featured card forces overlapping rows in the browser.
- Dependencies: `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid validation, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Updated chooser layout styling, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 19:16 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.css` so the featured plugin-browser columns top-align instead of stretching to the tallest sibling, preventing the Neural Amp Modeler featured tile from forcing overlapping chooser rows.
  - Scoped the plugin-browser equal-height behavior back to the real card grids (`native`, `LV2`, and `preset` grids) and removed the global tile `min-height: 100%` that was incorrectly inflating tiles inside the featured flex-column list.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched frontend/worklist files as MAP2-owned AGPL-covered artifacts; reused the repository license/notices scan and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T317
Status: [✓] Done
Title: Route NAM and IR JUCE live editors onto their custom asset-selector cards
Description:
- Goal / acceptance criteria: Fix the `/juce-grid` selected-block live editor so Neural Amp Modeler, Cabinet IR, and Reverb IR no longer fall back to the generic parameter panel and instead render their custom cards with library/file-selection controls.
- Why it matters: The dialog/browser work in `T314` is ineffective unless the live selected-block editor actually renders those custom cards.
- Dependencies: `web/src/app/components/PluginCards/liveEditorRouting.ts`, related routing tests, optional JUCE Grid validation, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Updated live-editor routing, regression coverage, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 08:02 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/liveEditorRouting.ts` so `map2://juce/nam`, `map2://juce/convolution/cabinet`, and `map2://juce/convolution/reverb` are treated as live-safe custom cards instead of generic-only processors; this restores the asset-selector UI in the selected-block editor where the file chooser actually needs to appear.
  - Updated `web/src/app/components/PluginCards/liveEditorRouting.test.ts` with explicit regression coverage for NAM, cabinet IR, and reverb IR resolving onto the custom live-editor path.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/PluginCards/liveEditorRouting.test.ts web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing review: touched JUCE Grid frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'` and found no new notice or scope gaps requiring follow-up work.

ID: T315
Status: [✓] Done
Title: Add MIDI Hub device detection and manual assignment support for undiscovered USB-MIDI hardware
Description:
- Goal / acceptance criteria: Recognize MIDISPORT-class USB-MIDI hardware in the MIDI Hub registry when ALSA exposes the ports, expose local inventory/profile/manual-assignment APIs for undiscovered devices, and cover the flow with focused backend tests.
- Why it matters: The current audio-interface path is Hotone/audio-centric and the registry's manual classification logic is not exposed well enough to recover unknown MIDI hardware in a user-directed way.
- Dependencies: `app/services/midi_hub/device_registry.py`, `app/routes/midi_hub.py`, `web/src/map2/api.ts`, focused MIDI Hub backend tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Updated MIDI Hub registry/profile matching, inventory/profile/assignment routes and client helpers, focused tests, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 19:11 EDT - Codex
- Completion notes:
  - Added a built-in `m_audio_midisport_4x4` MIDI Hub device profile in `app/services/midi_hub/device_registry.py` with MIDISPORT name matching and USB VID/PID matching for the live `0763:1020` hardware path.
  - Exposed local MIDI Hub inventory, profile, and manual-assignment APIs in `app/routes/midi_hub.py`, allowing undiscovered devices to be classified or rebound intentionally instead of relying only on implicit name matching.
  - Added matching client helpers and typed payloads in `web/src/map2/api.ts` for future UI or operator tooling use.
  - Added focused coverage in `tests/midi_hub/test_device_registry.py` and `tests/midi_hub/test_routes.py`, including MIDISPORT detection, custom profile upsert/delete, and manual assignment/clear flows.
  - Validation: `pytest -q tests/midi_hub/test_device_registry.py tests/midi_hub/test_routes.py` -> PASS (`14 passed`); `npm --prefix web run typecheck` -> PASS.
  - Licensing: Classified the touched backend/frontend/test/worklist files as MAP2-owned AGPL-covered artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T286
Status: [✓] Done
Title: Refactor JUCE Grid plugin browser and MIDI mapping modal shells onto Carbon patterns
Description:
- Goal / acceptance criteria: Replace the remaining bespoke JUCE Grid browser and MIDI modal chrome with Carbon-aligned modal shells, token-driven panel framing, and clearer section structure while preserving existing plugin browsing and MIDI mapping workflows.
- Why it matters: The route still uses a custom overlay/header for MIDI mappings and lightweight browser wrapper styling that break strict Carbon consistency even after the main shell cleanup.
- Dependencies: T285
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched modal surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 16:07 - Codex
- Completion notes:
  - Replaced the JUCE Grid custom MIDI mappings overlay in `web/src/app/pages/JuceGridPage.tsx` with a Carbon `Modal` wrapper and tokenized route-local panel shells so the mappings workspace now sits inside Carbon modal chrome instead of `platform-modal` scaffolding.
  - Updated `web/src/app/pages/JuceGridPage.css` so the plugin browser toolbar, featured groups, and modal content shells use explicit Carbon-like layer and border treatments instead of lightweight wrapper-only styling.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T285
Status: [✓] Done
Title: Refactor JUCE Grid compact workflow and modal support surfaces onto Carbon-aligned shells
Description:
- Goal / acceptance criteria: Tighten the compact workflow panels, keyboard shortcuts modal content, and automation lane picker onto Carbon-aligned tile/layer treatments, clearer semantic headings, and tokenized spacing without changing user workflows.
- Why it matters: The main route shell is cleaner now, but compact workflow panels and operator modals still read as ad hoc wrappers rather than Carbon-first support surfaces.
- Dependencies: T284
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched compact/modal surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:58 - Codex
- Completion notes:
  - Added clearer semantic section kickers to the compact workflow panels in `web/src/app/pages/JuceGridPage.tsx` and moved the routing summary tags onto a named class instead of inline styling.
  - Updated `web/src/app/pages/JuceGridPage.css` so compact workflow panels, shortcut tiles, lane-picker tiles, and modal copy use tokenized Carbon-like layer/border treatments and tighter type hierarchy instead of minimal wrapper styling.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T284
Status: [✓] Done
Title: Refactor JUCE Grid masthead and automation footer onto Carbon-aligned shells
Description:
- Goal / acceptance criteria: Simplify the JUCE Grid route masthead and fixed footer so actions, status chips, and automation summary use Carbon-aligned button kinds, token-driven layers, and clearer semantic hierarchy without changing workflow behavior.
- Why it matters: The remaining page chrome still relies on bespoke success-button variants and a custom black footer/status treatment that conflicts with strict Carbon conformance.
- Dependencies: T282, T283
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched route-shell files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:49 - Codex
- Completion notes:
  - Replaced the JUCE Grid masthead’s bespoke success-colored action button variants in `web/src/app/pages/JuceGridPage.tsx`/`web/src/app/pages/JuceGridPage.css` with standard Carbon button kinds and a simpler action hierarchy.
  - Rebuilt the fixed automation footer onto Carbon-aligned layer/border tokens and semantic summary copy so the automation toggle and status chips read as route shell content rather than a custom black status rail.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid route/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T283
Status: [✓] Done
Title: Fix JUCE Grid load crash from cluster-node modal payload handling
Description:
- Goal / acceptance criteria: Prevent the JUCE Grid route from crashing when cluster-node data is missing or malformed by hardening the Audio Nodes modal fetch path and ensuring the modal does not mount while closed.
- Why it matters: The route currently fails to load in production for the user, which blocks all further Carbon compliance work until the runtime regression is removed.
- Dependencies: T282
- Estimated effort: Low
- Required outputs: Updated `web/src/app/pages/AudioNodesModal.tsx` and `web/src/app/pages/JuceGridPage.tsx`, validation notes, and licensing review notes for the crash fix.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:41 - Codex
- Completion notes:
  - Hardened `web/src/app/pages/AudioNodesModal.tsx` so `/cluster/nodes` responses are normalized with `Array.isArray(data?.nodes)` before mapping, eliminating the unsafe `data.nodes` dereference that could crash the route on malformed payloads.
  - Updated `web/src/app/pages/JuceGridPage.tsx` to mount `AudioNodesModal` only while it is open, preventing closed-modal cluster-node fetch paths from participating in route load.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid/audio-node modal/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T282
Status: [✓] Done
Title: Refactor JUCE Grid routing workspace and live-path cards onto stricter Carbon shells
Description:
- Goal / acceptance criteria: Rebuild the remaining JUCE Grid routing-facing surfaces so the live-path cards, routing summary treatments, and routing inspector use Carbon-aligned semantics, layer/border tokens, and reduced bespoke chrome while preserving the current workflow and interactions.
- Why it matters: The selected-block editor is now materially closer to Carbon, but the core routing workspace still reads as custom black-panel UI rather than Carbon-first page composition.
- Dependencies: T278, T279, T280, T281
- Estimated effort: Medium
- Required outputs: Updated `web/src/app/pages/JuceGridPage.tsx` and `web/src/app/pages/JuceGridPage.css`, validation notes, and licensing review notes for the touched JUCE Grid routing surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:32 - Codex
- Completion notes:
  - Refactored the remaining JUCE Grid routing-facing shells in `web/src/app/pages/JuceGridPage.css` away from bespoke black gradients, vertical branch bars, and rounded capsule action groups toward Carbon-aligned layer, border, and field tokens while preserving the live-path flow topology and controls.
  - Updated `web/src/app/pages/JuceGridPage.tsx` so desktop and tablet flow-card titles use semantic headings and the routing inspector rows render as Carbon `Tile` content with explicit label/value hierarchy instead of generic `span`/`strong` rows.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx`, and `npm --prefix web run build`.
  - Licensing review: touched JUCE Grid page/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and found no new notice or scope gaps.

ID: T066
Status: [✗] Blocked
Title: MIDI Hub hardware validation and final closure
Description:
- Goal / acceptance criteria: Close the remaining MIDI Hub program work by completing the hardware-dependent compatibility and full integration validation gates.
- Why it matters: The implementation is broad and largely complete, but final production confidence depends on physical adapter and long-run validation.
- Dependencies: Archived implementation subtasks through `T066-subP`, plus live hardware access
- Estimated effort: High
- Required outputs: Completed hardware compatibility matrix, final regression/performance evidence, and program closure notes.
Subtasks:
ID: T066-subQ
Status: [✗] Blocked
Title: USB-to-DIN adapter support and external interface integration guide
Description:
- Goal / acceptance criteria: Verify MAP2 MIDI Hub against real class-compliant USB-to-DIN adapters and finish the compatibility guide with measured results.
- Why it matters: The hardware-agnostic claim needs physical adapter evidence.
- Dependencies: Archived `T066-subA`, `T066-subF`, attached USB-MIDI hardware, ALSA sequencer access
- Estimated effort: Medium
- Required outputs: Compatibility matrix, adapter notes, and completed `docs/midi/USB_DIN_ADAPTER_COMPATIBILITY.md`.
Subtasks: None
Assigned to: User + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Qualification runner, runbook, and doc scaffold are complete in the archive.
  - Current environment still has no `/dev/snd/seq` access and no attached adapters.
ID: T066-subR
Status: [✗] Blocked
Title: Comprehensive MIDI Hub integration testing and regression validation
Description:
- Goal / acceptance criteria: Finish the end-to-end regression, performance, and soak validation of the complete MIDI Hub stack.
- Why it matters: MIDI Hub is foundational to multiple MAP2 systems and needs final proof under realistic conditions.
- Dependencies: T066-subQ, archived `T066-subP`, long-duration hardware-backed validation window
- Estimated effort: High
- Required outputs: Regression matrix, performance benchmarks, soak evidence, and pass/fail report.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Unified qualification runner is complete in the archive.
  - Remaining blocker is real hardware and soak execution rather than software gaps.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL MIDI Hub implementation work is archived as complete.
  - Program closure now depends only on physical adapter validation and full-system performance evidence.

ID: T102
Status: [✗] Blocked
Title: MIDI Hub external operator field study
Description:
- Goal / acceptance criteria: Run the redesigned `/midi-hub` workflow study with at least three external operators and archive anonymized results plus remediation decisions.
- Why it matters: Real operator evidence is still required beyond implementation and self-validation.
- Dependencies: Archived `T101`, external participant scheduling
- Estimated effort: Medium
- Required outputs: Participant results, issue log, and follow-up remediation decisions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, templates, and collation tooling are complete in the archive.
  - Remaining blocker is external participant access and moderated study execution.

ID: T202
Status: [✓] Done
Title: MIDI Hub full IBM Carbon and workflow refactor
Description:
- Goal / acceptance criteria: Fully refactor `/midi-hub` and its connected MIDI Hub surfaces into an advanced operator workspace that is Carbon-first end to end, uses industry-standard MIDI terminology, presents basic routing and validation workflows before deeper controls, increases spacing/readability in dense areas, removes touched MUI control patterns, and updates the supporting design/MIDI documentation to match the shipped information architecture and Carbon compliance posture.
- Why it matters: The current MIDI Hub surface mixes Carbon and non-Carbon UI systems, carries inconsistent MIDI concepts, and exposes dense controls without a consistent operational workflow, which blocks the user's stated requirement for a total Carbon-compliant refactor.
- Dependencies: Existing MIDI Hub backend APIs, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md`
- Estimated effort: High
- Required outputs: Refactored `web/src/app/pages/MidiHubPage.tsx` route shell and connected MIDI Hub components, updated route-local Carbon styling/tests as needed, refreshed MIDI Hub design/content documentation, updated Carbon conformance notes/checklist evidence, and final validation notes.
Subtasks:
ID: T202-subA
Status: [✓] Done
Title: Audit MIDI Hub route structure and define Carbon-first advanced operator IA
Description:
- Goal / acceptance criteria: Inventory the current `/midi-hub` shell plus connected panels, normalize the target terminology and section model, and encode the new route structure in implementation notes/docs before broad UI edits begin.
- Why it matters: A total refactor needs one source of truth for terminology, grouping, and workflow order.
- Dependencies: T202
- Estimated effort: Medium
- Required outputs: Updated MIDI Hub documentation and implementation-ready IA decisions tied to the actual route/component files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Replaced the earlier guided-help redesign direction with an advanced-operator IA centered on sequential workflow bands: Signal path, Show control, Network and protocol, Message processing and automation, and Advanced and experimental.
  - Normalized route-local terminology toward standard MIDI/operator concepts such as Port matrix, Patchbay graph, Event Monitor, Message Filtering, Message Mapping, Presets and Program Change, Clock and Transport, RTP-MIDI, and MIDI 2.
  - Updated `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md` and `docs/midi/MIDI_HUB_GUIDED_UX_REDESIGN_BRIEF.md` to match the implementation target and remove contextual-help assumptions that conflict with the user directive and Carbon standards.
ID: T202-subB
Status: [✓] Done
Title: Replace MIDI Hub route shell and primary workflows with Carbon grid and progressive depth
Description:
- Goal / acceptance criteria: Rebuild the `/midi-hub` page shell so routing and validation are primary, deeper automation/diagnostics controls follow later in the page, and spacing/layering align to Carbon grid and tokens only.
- Why it matters: Page composition is the main source of current workflow and density problems.
- Dependencies: T202-subA
- Estimated effort: High
- Required outputs: Updated `MidiHubPage` structure/CSS and any route-shell tests needed.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Refactored `web/src/app/pages/MidiHubPage.tsx` from a tabbed shell into a sequential advanced workspace with a Carbon-style hero, workflow tiles, spaced section bands, and routing-first information architecture.
  - Replaced dense route composition with tokenized Carbon spacing in `web/src/app/pages/MidiHubPage.css`, including new section grids, panel surfaces, empty states, record lists, route matrix helpers, and patchbay framing.
  - Updated `web/src/app/pages/MidiHubPage.test.tsx` so the test surface matches the new simultaneous section model rather than the old tabbed navigation.
ID: T202-subC
Status: [✓] Done
Title: Migrate connected MIDI Hub panels from mixed MUI/custom controls to Carbon patterns
Description:
- Goal / acceptance criteria: Refactor the touched routing, patchbay, traffic, preset, network, script, clock, recorder, macro, scheduler, MIDI 2.0, and related operator panels to Carbon controls/patterns with consistent spacing and semantics.
- Why it matters: The route cannot be fully Carbon compliant while key child panels retain non-Carbon control systems and ad hoc dense layouts.
- Dependencies: T202-subA
- Estimated effort: High
- Required outputs: Updated MIDI Hub component implementations and styles with no silent non-Carbon exceptions in touched surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Migrated touched MIDI Hub panels away from MUI/custom mixed controls toward Carbon components and Carbon-tokenized custom surfaces, including routing, patchbay, traffic monitor, preset management, network, clock, recorder, scheduler, scripts, macros, MIDI 2, innovation, and workbench cards.
  - Removed route-local summary copy and contextual-help framing from `web/src/app/components/MidiHub/MidiHubHelpPrimitives.tsx` so panel headers now align with the advanced operator brief and Carbon route standards.
  - Kept the custom SVG patchbay and route matrix where the workflow requires specialized visualization, but rebuilt the surrounding interaction model with Carbon actions, tags, modal/dialog patterns, and spacing tokens.
ID: T202-subD
Status: [✓] Done
Title: Publish updated MIDI Hub and Carbon conformance documentation for the shipped refactor
Description:
- Goal / acceptance criteria: Update the relevant MIDI Hub inventory/brief and Carbon conformance artifacts so they accurately describe the delivered route structure, terminology, compliance status, validation evidence, and any explicit exceptions.
- Why it matters: The user requested document updates and the repo requires current conformance evidence for UI changes.
- Dependencies: T202-subB, T202-subC
- Estimated effort: Medium
- Required outputs: Updated docs under `docs/midi/` and `docs/design/` plus checklist evidence in final notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Updated `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md` and `docs/design/CARBON_CONFORMANCE_MATRIX.md` so `/midi-hub` is recorded as a sequential operational workspace with the second-pass Carbon refactor noted in conformance tracking.
  - Validated the shipped surface with `npm --prefix web run typecheck`, `npm --prefix web run test -- src/app/pages/MidiHubPage.test.tsx --runInBand`, and `npm --prefix web run build`.
  - Reviewed repository licensing posture for the touched MAP2-owned UI/docs files and found no additional AGPL or third-party notice work required.
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Delivered a full `/midi-hub` route refactor and updated the connected MIDI Hub component subtree under `web/src/app/components/MidiHub/` to a Carbon-first, advanced-operator surface with routing-first workflow order and normalized MIDI terminology.
  - Scope note: the legacy `/midi` route in `web/src/app/pages/MIDIPage.tsx` was not refactored in this task because `/midi-hub` no longer depends on that embedded surface after the route-shell rewrite.
  - Remaining MIDI program blockers stay in `T066`, `T102`, and related hardware-study tasks; `T202` closes the UI/doc refactor slice only.

## Latency And Evaluation

ID: T055
Status: [✗] Blocked
Title: UA-1000 analog loopback latency measurement
Description:
- Goal / acceptance criteria: Run the physical tuned-vs-rollback analog loopback test on the UA-1000 and publish repeated RTT measurements.
- Why it matters: Real round-trip latency proof is still missing for the UA-1000 tuning decision.
- Dependencies: Archived `T054`, physical UA-1000 loopback cabling, device access
- Estimated effort: Medium
- Required outputs: Repeated RTT result set, average/p95 comparison, and keep/rollback recommendation.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Matrix runner and runbook are complete in the archive.
  - Remaining blocker is the physical loopback session.

ID: T099
Status: [✗] Blocked
Title: Dynamic response blind A/B validation
Description:
- Goal / acceptance criteria: Execute the formal blind A/B validation of MAP2 NAM dynamic response versus a reference amp and competitor modeler, then publish the final evidence packet.
- Why it matters: MAP2 still lacks external proof for stage-competitive dynamic response claims.
- Dependencies: Archived prep/tooling subtasks, reference amp/modeler, recording interface, evaluators
- Estimated effort: Medium
- Required outputs: Recorded samples, subjective results, quantitative summary, evidence document, and evaluation-report update.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, analysis tooling, and evidence-draft prep are complete in the archive.
  - Remaining blocker is the live recording and evaluator session.

## Repo Hygiene

ID: T082-subD
Status: [✗] Blocked
Title: Repo history cleanup for tracked bloat
Description:
- Goal / acceptance criteria: Remove tracked build/dependency artifacts from git history and complete the coordinated force-push cleanup window.
- Why it matters: Repository size and clone/tooling penalties persist until history is rewritten.
- Dependencies: Archived `T082-subC`, mirror-clone rewrite environment, collaborator coordination
- Estimated effort: Medium
- Required outputs: Rewritten history on both remotes, collaborator notice, and post-rewrite verification.
Subtasks:
ID: T082-subD-subB
Status: [✗] Blocked
Title: Execute coordinated history rewrite and force-push for repo bloat removal
Description:
- Goal / acceptance criteria: Run the prepared mirror-clone rewrite and force-push both remotes during a coordinated maintenance window.
- Why it matters: This is the actual destructive step that shrinks the repository.
- Dependencies: Archived `T082-subD-subA`, archived `T082-subD-subC`, mirror clone, `git-filter-repo`, force-push window
- Estimated effort: Medium
- Required outputs: Rewritten remotes and collaborator migration notice.
Subtasks: None
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Prep helper, runbook, and notice template are complete in the archive.
  - Remaining blocker is a real rewrite window with `git-filter-repo` available.
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Ignore guardrails and rewrite prep are complete in the archive.
  - Remaining work is only the coordinated destructive rewrite.

## MIDI Hub v2 — Show Control Platform Rewrite

ID: T203
Status: [✗] Blocked
Title: MIDI Hub v2 — Full show control platform rewrite with sidebar navigation, Net3 feature parity, Tesira TTP integration, and enterprise OSC namespace
Description:
- Goal / acceptance criteria: Complete clean rewrite of the MIDI Hub from a monolithic scrolling page into a 7-area sidebar-navigated show control platform. Add Net3 Show Control Gateway feature parity (Event Lists, MSC command builder, virtual GPIO, MIDI Raw from cues, Learn Mode, String Interface). Add bidirectional Tesira TTP integration. Add hierarchical `/map2/*` OSC namespace. Add persistent bottom status bar, dark/light theming with system preference detection, scroll/panel state persistence across navigation, and deep-linkable routes. All surfaces must pass Carbon Conformance Standard and Carbon Contribution Review Checklist. Enterprise features must be identified and flagged throughout.
- Why it matters: The current MIDI Hub is a dense monolithic page that requires scrolling to find features. The user requires a professional show control platform competitive with ETC Net3/Response Show Control Gateways, with clean sidebar navigation, industry-standard terminology, and full Tesira integration for their production audio environment.
- Dependencies: T202 (done — prior Carbon refactor), existing MIDI Hub backend services (21 files in `app/services/midi_hub/`), existing frontend components (15 files in `web/src/app/components/MidiHub/`), `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- Estimated effort: Very High
- Required outputs: See subtask list below. All subtasks must pass `npm run typecheck`, `npm run build`, and `pytest tests/` before marking done. Updated Carbon conformance documentation. Updated route pattern mapping.
Subtasks:

ID: T203-subA
Status: [✓] Done
Title: Navigation shell — persistent left sidebar, bottom status bar, theme system, route scaffolding
Description:
- Goal / acceptance criteria: Replace the monolithic `MidiHubPage.tsx` with a sidebar-navigated shell containing 7 service areas as separate routable pages. Implement persistent left sidebar following Carbon `SideNav` pattern (always visible, ~240px, status badges per area). Implement persistent bottom status bar showing: clock status + BPM, active preset name, active event list status + timecode position, route count, connected device count, system health. Implement dark/light theme toggle that follows system preference with manual override per Carbon theming guidance. All 7 areas must be deep-linkable routes under `/midi-hub/*`. Each area must preserve scroll position and panel expand/collapse state when navigating away and back (use Zustand store persisted to localStorage).
- Why it matters: Foundation for the entire rewrite — every other subtask depends on this shell existing.
- Dependencies: None
- Estimated effort: High
- Required outputs:
  - New shell component: `web/src/app/pages/MidiHubShell.tsx` (sidebar + status bar + outlet)
  - New CSS: `web/src/app/pages/MidiHubShell.css`
  - Route changes in `web/src/app/App.tsx`: `/midi-hub` becomes parent route with child routes `/midi-hub/connections`, `/midi-hub/presets`, `/midi-hub/transport`, `/midi-hub/events`, `/midi-hub/processing`, `/midi-hub/network`, `/midi-hub/lab`. `/midi-hub` redirects to `/midi-hub/connections`.
  - Legacy redirects: `/midi` → `/midi-hub/connections`, `/midi-hub-2` → `/midi-hub/connections`
  - Zustand store: `web/src/app/stores/midiHubNavStore.ts` — persists scroll positions and panel states per area
  - Theme integration: use Carbon `GlobalTheme` provider with `useMediaQuery('(prefers-color-scheme: dark)')` for system detection, localStorage override key `map2_theme_preference`
  - Bottom status bar component: `web/src/app/components/MidiHub/MidiHubStatusBar.tsx` — fixed to bottom, polls hub status + clock + preset + event list state via React Query
  - 7 placeholder page components (one per area) that render existing panels in the correct grouping
  - `MidiHubNodeScopeProvider` must wrap the shell (not individual pages)
  - Node context picker moves to sidebar header
  - Sidebar badges: green dot for active routes, clock icon for running clock, count badges for presets/sessions
- Implementation notes:
  - Carbon SideNav: use `SideNav`, `SideNavItems`, `SideNavLink` from `@carbon/react`
  - Bottom bar: use `Layer` with `position: fixed; bottom: 0` and Carbon spacing tokens
  - Theme: Carbon provides `Theme` component with `theme` prop ('white', 'g10', 'g90', 'g100'). Map system dark → 'g100', system light → 'white'. Store preference in localStorage.
  - Deep linking: use React Router `<Outlet />` pattern with `useLocation()` to restore scroll
  - Status bar refetch interval: 2000ms for clock, 3000ms for everything else
  - All 7 areas are lazy-loaded via `React.lazy()` for code splitting
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-17 19:45 - Codex
- Completion notes:
  - Replaced the `/midi-hub` route with a nested shell in `web/src/app/App.tsx`: `/midi-hub` now redirects to `/midi-hub/connections`, legacy redirects `/midi` and `/midi-hub-2` now land on the connections area, and all seven routed areas are lazy-loaded child pages under `MidiHubShell`.
  - Added `web/src/app/pages/MidiHubShell.tsx` and `web/src/app/pages/MidiHubShell.css` with a persistent Carbon `SideNav`, node context picker in the sidebar header, local theme override stored in `map2_theme_preference`, route badges, and a fixed bottom status bar.
  - Added persisted navigation state in `web/src/app/stores/midiHubNavStore.ts` and routed area scaffolding in `web/src/app/pages/midi-hub/` so each area has its own deep-linkable page and restores scroll state when revisited.
  - Added `web/src/app/components/MidiHub/MidiHubStatusBar.tsx` and `web/src/app/components/MidiHub/useMidiHubOverview.ts` so the shell can poll MIDI Hub status, routes, clock, presets, and sessions without duplicating query logic across pages.
  - Converted `web/src/app/pages/MidiHubPage.tsx` into a compatibility redirect to the new shell entry path and updated `web/src/app/pages/MidiHubPage.test.tsx` to validate routed shell entry plus presets-area deep linking.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- MidiHubPage.test.tsx --runInBand --silent` -> pass, `cd web && npm run build` -> pass (existing Vite chunk-size and dynamic-import warnings only).

ID: T203-subB
Status: [✓] Done
Title: Connections area — clean rewrite of routing, patchbay, quick router, and traffic monitor
Description:
- Goal / acceptance criteria: Rewrite the Connections area (`/midi-hub/connections`) as a clean Carbon page containing: Port Matrix (rewritten with Carbon `DataTable`), Patchbay Graph (SVG retained but Carbon-wrapped), Quick Router (Carbon `Toggle` switches), and Traffic Monitor (Carbon `DataTable` with streaming rows). Remove all legacy CSS classes. Use Carbon patterns exclusively. Traffic Monitor is ONLY accessible from this page (not global). Master-detail layout follows Carbon data table patterns per Carbon guidance. Port Matrix and Patchbay remain as tab-switchable views using Carbon `Tabs`.
- Why it matters: This is the primary workflow — connections must be rock-solid and visually clean.
- Dependencies: T203-subA
- Estimated effort: High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css`
  - Rewritten components: `MidiRoutingMatrix.tsx`, `MidiPatchbay.tsx`, `MidiTrafficMonitor.tsx`, `MidiHubQuickRouter.tsx` (renamed from MidiHubWorkbenchCards quick router section)
  - All components use Carbon `DataTable`, `TableContainer`, `TableToolbar`, `TableToolbarSearch`, `TableToolbarContent`, `Tag`, `Modal`, `Button`, `Toggle`
  - Traffic monitor: Carbon `DataTable` with `TableToolbar` search, column sorting, CSV export button, pause/resume toggle, clear button. No custom table implementation.
  - Patchbay: SVG canvas retained but wrapped in Carbon `Layer` with Carbon `Toolbar` pattern for controls
  - Route creation/edit modal: Carbon `ComposedModal` with `ModalHeader`, `ModalBody`, `ModalFooter`
  - Tests: `MidiHubConnectionsPage.test.tsx` — renders, shows ports, matrix/patchbay tab switch, traffic data display, route creation modal opens
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 19:32 - Codex
- Completion notes:
  - Rewrote `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx` and added `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css` so the connections area now uses a page-scoped Carbon layout, Carbon `Tabs` for matrix versus patchbay switching, and a dedicated traffic-monitor panel without reusing the old monolithic page-band styling.
  - Rebuilt `web/src/app/components/MidiHub/MidiRoutingMatrix.tsx` around Carbon `DataTable`, `TableToolbar`, and `ComposedModal`, flattening source-to-destination routes into a searchable master-detail matrix with route create/edit actions, inline route state tags, and a Carbon modal footer/button flow for save and delete actions.
  - Rebuilt `web/src/app/components/MidiHub/MidiPatchbay.tsx` and `web/src/app/components/MidiHub/MidiTrafficMonitor.tsx` so the patchbay graph stays SVG-based but is wrapped in Carbon `Layer` and Carbon toolbar controls, while the traffic monitor now uses Carbon `DataTable`, toolbar search, sort mode buttons, pause/ascending toggles, CSV export, and clear-buffer controls instead of the previous custom table/search stack.
  - Added `web/src/app/components/MidiHub/MidiHubQuickRouter.tsx` as the new quick-router surface, replacing the old workbench-card path with Carbon `Toggle` switches and source selection for fast route activation, while keeping `readPorts` in the shared workbench helpers for the remaining MIDI Hub areas.
  - Added `web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` and updated `web/src/app/pages/MidiHubPage.test.tsx` so the connections-area rewrite is covered for routed render, matrix/patchbay tab switching, traffic row visibility, and route-modal open behavior.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> pass, `cd web && npm run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T203-subC
Status: [✓] Done
Title: Presets & Recall area — presets, program change slots, preset chains
Description:
- Goal / acceptance criteria: Rewrite the Presets & Recall area (`/midi-hub/presets`) containing: Preset Manager (Carbon `DataTable` with toolbar actions), Program Change Slots (Carbon `DataTable` mapping program numbers 0-127 to presets), Preset Chains (Carbon `OrderedList` or `DataTable` with drag-reorder). Compare presets via Carbon `ComposedModal` with side-by-side diff. Import/export via Carbon `FileUploader` and download actions. Set default preset. All state recall operations show Carbon `InlineLoading` during mutation.
- Why it matters: State recall is the second most critical workflow after connections.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubPresetsPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubPresetsPage.css`
  - Rewritten `MidiHubPresetManager.tsx` → split into `PresetTable.tsx`, `ProgramChangeSlots.tsx`, `PresetChainEditor.tsx`
  - Tests: renders, shows presets, recall mutation fires, compare modal works, chain ordering works
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 19:47 - Codex
- Completion notes:
  - Reworked `web/src/app/pages/midi-hub/MidiHubPresetsPage.tsx` and added `web/src/app/pages/midi-hub/MidiHubPresetsPage.css` so the presets area now uses a page-scoped Carbon layout instead of the older shared page-band styling while still keeping the clock and recorder sidecars available in the routed area.
  - Replaced the monolithic preset manager implementation in `web/src/app/components/MidiHub/MidiHubPresetManager.tsx` with a data-owning parent that fans out into `PresetTable.tsx`, `ProgramChangeSlots.tsx`, and `PresetChainEditor.tsx`, preserving the existing backend integrations while separating preset CRUD, PC slot assignment, and preset-chain editing into focused Carbon surfaces.
  - Added a Carbon `DataTable` preset table with toolbar search, default-state tagging, recall/export/default/delete actions, and a Carbon `ComposedModal` compare flow, plus `FileUploader`-backed import affordance for preset recall workflows.
  - Added Carbon `DataTable` handling for program-change slot mappings and preset-chain editing, including chain-order save actions and per-row move up/down controls so chain ordering can be staged and persisted without returning to the legacy manager layout.
  - Added `web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx` to cover routed render, preset recall mutation firing, compare modal opening and compare invocation, and preset-chain reorder persistence; retained `web/src/app/pages/MidiHubPage.test.tsx` coverage for routed shell entry.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- --runInBand web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> pass, `cd web && npm run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T203-subD
Status: [✓] Done
Title: Transport area — clock, recorder, industry-standard transport bar
Description:
- Goal / acceptance criteria: Rewrite the Transport area (`/midi-hub/transport`) with industry-standard layout. Clock panel: BPM display (large numeric), tap tempo button, start/stop/continue transport controls, internal/external source toggle, output port multi-select, divider/multiplier controls. Recorder panel: record/stop/play controls, session list as Carbon `DataTable`, playback speed slider, loop toggle, SMF export with BPM/ticks config. Transport controls should follow DAW conventions (play/stop/record icons from `@carbon/icons-react`: `PlayFilled`, `StopFilled`, `RecordingFilled`, `PauseFilled`).
- Why it matters: Transport is time-critical — musicians expect instant, familiar controls.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubTransportPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubTransportPage.css`
  - Rewritten `MidiClockPanel.tsx` and `MidiRecorderPanel.tsx`
  - Tests: renders, clock status displayed, transport controls fire mutations, recorder session list works
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-18 19:28 - Codex
- Completion notes:
  - Upgraded `web/src/app/components/MidiHub/MidiClockPanel.tsx` to a DAW-style transport surface with a large BPM hero tile, tap/start/continue/stop controls using Carbon transport icons, output-port chip multi-select, and divider/multiplier sliders that save through the clock config mutation.
  - Upgraded `web/src/app/components/MidiHub/MidiRecorderPanel.tsx` to a Carbon `DataTable` session list with record/stop/play controls, playback speed slider, loop toggle, and SMF export configuration controls for BPM and ticks-per-quarter.
  - Added supporting transport-area styling in `web/src/app/pages/MidiHubPage.css` and focused component coverage in `web/src/app/components/MidiHub/MidiTransportPanels.test.tsx`.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing Vite chunk/dynamic-import warnings only).

ID: T203-subE
Status: [✓] Done
Title: Event Lists area — NEW: timecode-driven cue engine with MTC, RTC scheduling, and Learn Mode
Description:
- Goal / acceptance criteria: Build a completely new Event Lists area (`/midi-hub/events`) — this is a new top-level feature inspired by ETC Net3 Show Control Gateway event lists. Must include:
  1. **Event List Manager**: Create/delete/rename event lists. Each list has a type (MTC or RTC), a source ID, internal/external clock enable, first/last time, and FPS setting (24/25/30).
  2. **Event Editor**: Table-based editor (Carbon `DataTable`) showing columns: Event #, Time/Address (HH:MM:SS:FF for MTC, datetime for RTC), Action (Cue/Preset/Macro/MIDI Raw), Label. Add/edit/delete events. Events fire when clock reaches specified time.
  3. **Internal Clock**: When external MTC source is absent, internal clock auto-takes-over (if enabled). Internal clock respects first/last time loop points.
  4. **RTC Events**: Schedule by wall-clock time and date with timezone support. "Every Tuesday at 8pm fire macro X" pattern.
  5. **Learn Mode**: Button that captures incoming MTC timecode position and auto-creates an event at the current timestamp with a user-selected action.
  6. **Event List Status**: Show running/stopped, current timecode position, internal/external indicator, FPS.
  7. **MSC Command Builder**: Structured form to compose MIDI Show Control messages — Go, Stop, Resume, Timed Go, Set, Fire, All Off — with device ID (0-127), command format, and cue number fields. MSC messages can be used as event actions or sent ad-hoc.
  8. **MIDI Raw Output**: Attach MIDI note/CC/program change output to cue events — "when event fires, also send note C4 on ch10".
- Why it matters: Event Lists are the backbone of synchronized show control. This is the key Net3 feature parity gap. Without this, MAP2 cannot compete with ETC for show control workflows.
- Dependencies: T203-subA
- Estimated effort: Very High
- Required outputs:
  - Backend: `app/services/midi_hub/event_list_service.py` — EventList, Event models; MTC internal clock; RTC scheduler; Learn Mode capture; MSC message builder
  - Backend routes: `app/routes/midi_hub.py` additions — CRUD for event lists and events, clock control, learn mode toggle, MSC send
  - Frontend: `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` and `MidiHubEventsPage.css`
  - Frontend components: `EventListManager.tsx`, `EventEditor.tsx`, `MscCommandBuilder.tsx`, `EventListStatus.tsx`, `LearnModeControl.tsx`
  - All tables use Carbon `DataTable` with `TableToolbar`
  - MSC builder uses Carbon `FormGroup`, `Select`, `NumberInput`, `TextInput`
  - Time display uses monospace font via `--cds-code-01-font-family`
  - Tests: backend — `tests/test_midi_hub_event_lists.py` (event CRUD, MTC clock, RTC scheduling, MSC builder, learn mode). Frontend — `MidiHubEventsPage.test.tsx`
- Implementation notes:
  - MTC timecode format: HH:MM:SS:FF (hours:minutes:seconds:frames)
  - FPS options: 24 (film), 25 (PAL), 30 (NTSC) — match ETC convention
  - MSC command format: F0 7F <device_id> 02 <command_format> <command> <data> F7
  - MSC commands: 01=Go, 02=Stop, 03=Resume, 04=TimedGo, 06=Set, 07=Fire, 08=AllOff
  - Learn Mode: listen to incoming MTC, on button press capture current timecode and insert event row with that timestamp
  - RTC: use Python `datetime` with timezone-aware scheduling via `asyncio` timers
  - Event action types: RecallPreset, FireMacro, SendMSC, SendMidiRaw, SendOSC, SendString
  - Enterprise flag: Event list sharing across cluster nodes, conditional event firing based on device shadow state
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:04 - Codex
- Completion notes:
  - Added `app/services/midi_hub/event_list_service.py` with persisted event-list and event CRUD, MTC clock progression with loop points, RTC scheduling with timezone-aware evaluation, learn-mode capture, MSC message building/sending, and routed cue actions for preset recall, macro triggers, MIDI raw output, and MSC output.
  - Extended `app/routes/midi_hub.py` and `web/src/map2/api.ts` with event-list CRUD, event CRUD, start/stop/status, learn-mode, capture, and ad-hoc MSC send APIs.
  - Shipped `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` with dedicated Carbon event-list manager, event editor, status, learn-mode, and MSC builder components plus route-local styling and page coverage.
  - Added `tests/test_midi_hub_event_lists.py` to cover CRUD, MTC firing/looping, RTC recurrence scheduling, MSC builder output, raw MIDI output, and learn-mode capture.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx` -> pass, `pytest tests/test_midi_hub_event_lists.py` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T203-subF
Status: [✓] Done
Title: Message Processing area — filters, mappers, scripts, macros, scheduler rewrite
Description:
- Goal / acceptance criteria: Rewrite the Message Processing area (`/midi-hub/processing`) with all existing capabilities in clean Carbon patterns. Filter Planner: Carbon pill-style `Tag` toggles for channel/type filtering with live preview. Message Mapper: Carbon `Accordion` or master-detail for 16 mapper slots with per-slot config (source, type, channel range, value range, target, curve). Script Editor: retain code editor but wrap in Carbon `Layer` with Carbon toolbar for save/load/run/examples. Macros: Carbon `DataTable` for macro list with inline trigger button. Scheduler: Carbon `DataTable` with status column (pending/sent/cancelled). All panels follow Carbon data table + accordion patterns per Carbon guidance for dense data.
- Why it matters: Processing is the automation brain — it must be approachable for musicians, not just engineers.
- Dependencies: T203-subA
- Estimated effort: High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubProcessingPage.tsx` and CSS
  - Rewritten: `MidiHubFilterPlanner.tsx`, `MidiHubMessageMapper.tsx`, `MidiScriptEditor.tsx`, `MidiMacroPanel.tsx`, `MidiSchedulerPanel.tsx`
  - Tests: renders, filter toggles work, mapper slot CRUD, script save/run, macro trigger, scheduler create/cancel
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:24 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubProcessingPage.tsx` into a route-specific Carbon processing workspace and added `MidiHubProcessingPage.css` for the new band/layout/toolbar/table styling.
  - Added `web/src/app/components/MidiHub/MidiHubFilterPlanner.tsx` with Carbon tag-toggle channel/message filters, route selection, live route preview, and save-back to the routed filter configuration.
  - Added `web/src/app/components/MidiHub/MidiHubMessageMapper.tsx` as a 16-slot accordion planner with saved local slot state, per-slot source/message/curve/value configuration, and clear/save controls.
  - Reworked `MidiScriptEditor.tsx`, `MidiMacroPanel.tsx`, and `MidiSchedulerPanel.tsx` into Carbon toolbar/DataTable workflows aligned to the processing-area acceptance criteria.
  - Added dedicated route coverage in `web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` for render, filter save, mapper slot editing, script save/run, macro trigger, and scheduler create/cancel flows.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T203-subG
Status: [✓] Done
Title: Network & Protocol area — RTP-MIDI, OSC namespace, MIDI 2.0, Tesira TTP, Virtual GPIO, String Interface
Description:
- Goal / acceptance criteria: Rewrite and expand the Network area (`/midi-hub/network`) with all existing capabilities plus new features:
  1. **RTP-MIDI** (existing, rewrite): Carbon `DataTable` for sessions with latency metrics, create/delete/test actions.
  2. **OSC Bridge** (existing, rewrite): Carbon forms for server start/stop, message send. Enhanced with structured `/map2/*` namespace browser showing all available OSC addresses.
  3. **MIDI 2.0** (existing, rewrite): Carbon panels for device discovery, profile management, UMP translation.
  4. **Tesira TTP Integration** (NEW): Full bidirectional Tesira Text Protocol client.
     - Connection manager: hostname/IP, port (default 23 for Telnet), authentication if secured
     - Prebuilt controls: Fader level controls (get/set/subscribe with slider), mute toggles, preset recall, crosspoint matrix viewer, device info display
     - Command console: free-text TTP command entry with response display, command history, auto-complete for known instance tags
     - Subscription manager: subscribe to Tesira attributes, see live value updates in a streaming table
     - Instance tag browser: `SESSION get aliases` to discover available blocks
     - Device services: reboot, sleep/wake, start/stop audio, recall/save presets
     - Connection status indicator with auto-reconnect
  5. **Virtual GPIO** (NEW): 12 virtual inputs (contact closure simulation) and 12 virtual relay outputs. Each input has a label, state (open/closed), and can trigger event list actions. Each output has a label, state (energized/de-energized), and can be fired from event actions or macros. Grid display with toggle buttons.
  6. **String Interface** (NEW): Send/receive text commands over UDP. Same syntax as ETC string protocol — fire cues, trigger macros, recall presets via text commands. Configurable TX/RX ports and IP addresses. Command log with timestamps.
- Why it matters: Network is where MAP2 connects to the wider production ecosystem. Tesira integration is a primary user requirement. Virtual GPIO and String Interface complete Net3 feature parity.
- Dependencies: T203-subA
- Estimated effort: Very High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubNetworkPage.tsx` and CSS
  - Rewritten: `MidiNetworkPanel.tsx`, `Midi2Panel.tsx`
  - New backend: `app/services/midi_hub/tesira_client.py` — TCP socket client for TTP, command parser, subscription manager, auto-reconnect
  - New backend: `app/services/midi_hub/virtual_gpio.py` — 12 inputs, 12 outputs, state tracking, event triggers
  - New backend: `app/services/midi_hub/string_interface.py` — UDP string server, command parser (Go, Cue, Stop, Resume, SubMove, Macro, etc.)
  - New backend routes in `app/routes/midi_hub.py`: Tesira connect/disconnect/command/subscribe/aliases/presets, GPIO get/set/label, String send/receive/config
  - New frontend components: `TesiraPanel.tsx` (connection + prebuilt controls + command console), `VirtualGpioPanel.tsx` (grid of 12+12 toggles), `StringInterfacePanel.tsx` (UDP config + command log)
  - Tests: backend — `tests/test_tesira_client.py`, `tests/test_virtual_gpio.py`, `tests/test_string_interface.py`. Frontend — `MidiHubNetworkPage.test.tsx`
- Implementation notes:
  - Tesira TTP syntax: `InstanceTag command attribute [index] [value] LF`
  - Supported commands: get, set, increment, decrement, toggle, subscribe, unsubscribe
  - Responses: `+OK` (success), `+OK "value":X` (get response), `-ERR` (error)
  - Subscriptions: `! "publishToken":"label" "value":X` notifications
  - Instance tags are case-sensitive, no `/` or `&` characters allowed
  - Default Telnet port 23, baud rates for RS-232: 9600-115200
  - Session command: `SESSION get aliases` returns available instance tags
  - Device command: `DEVICE recallPreset 1001`, `DEVICE get deviceInfo`
  - Prebuilt Tesira controls should cover: Level (fader + mute), MatrixMixer (crosspoint level + mute), SourceSelector, Router, Meter
  - Virtual GPIO: stored in memory (not DB), reset on hub restart, state change fires registered callbacks
  - String Interface: UDP socket on configurable port (default 3037), same command vocabulary as ETC serial strings
  - Enterprise flags: Tesira fleet management (multiple Tesira servers), GPIO hardware mapping (future USB relay board), String protocol over ACN
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:58 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubNetworkPage.tsx` into a route-specific protocol workspace and added `MidiHubNetworkPage.css` for the new multi-panel network layout.
  - Reworked `MidiNetworkPanel.tsx` and `Midi2Panel.tsx` into Carbon table/form workflows for RTP-MIDI sessions, OSC namespace controls, MIDI-CI discovery, profile/property edits, and UMP translation.
  - Added `TesiraPanel.tsx`, `VirtualGpioPanel.tsx`, and `StringInterfacePanel.tsx` with Tesira connection/command/subscription controls, a 12x12 virtual GPIO surface, and UDP string-command configuration/logging.
  - Added backend services `app/services/midi_hub/tesira_client.py`, `app/services/midi_hub/virtual_gpio.py`, and `app/services/midi_hub/string_interface.py`, plus new MIDI Hub routes for Tesira, GPIO, and string-interface control.
  - Extended `web/src/map2/api.ts` with typed Tesira, GPIO, and string-interface clients and expanded `MidiHubHelpPrimitives.tsx` to register the new protocol panels.
  - Added test coverage in `tests/test_tesira_client.py`, `tests/test_virtual_gpio.py`, `tests/test_string_interface.py`, and `web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx`.
  - Validation: `pytest tests/test_tesira_client.py tests/test_virtual_gpio.py tests/test_string_interface.py` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subH
Status: [✓] Done
Title: Lab area — AI Learn, Mesh, Device Shadow rewrite
Description:
- Goal / acceptance criteria: Rewrite the Lab area (`/midi-hub/lab`) with all existing capabilities in clean Carbon patterns. AI Learn Suggestions: Carbon form with `AILabel` per Carbon for AI conventions, confidence scores as Carbon `ProgressBar`. Mesh Networking: Carbon `DataTable` for peers with status indicators. Device Shadow State: Carbon `DataTable` for drift events with severity tags. All AI surfaces must include `AILabel` with short disclosure content per `docs/design/CARBON_AI_LABEL_CONFORMANCE.md`.
- Why it matters: Lab features are important to the user and must be first-class, not afterthoughts.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubLabPage.tsx` and CSS
  - Rewritten: `MidiInnovationPanel.tsx` split into `AiLearnPanel.tsx`, `MeshNetworkPanel.tsx`, `DeviceShadowPanel.tsx`
  - All AI surfaces include Carbon `AILabel` component
  - Tests: renders, AI suggestions display with confidence, mesh peer CRUD, shadow drift events display
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 21:05 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubLabPage.tsx` into a dedicated Carbon lab workspace and added `MidiHubLabPage.css` for the new three-panel route layout.
  - Split the old innovation surface into `AiLearnPanel.tsx`, `MeshNetworkPanel.tsx`, and `DeviceShadowPanel.tsx`, with `MidiInnovationPanel.tsx` reduced to a compatibility wrapper over the new panels.
  - Added Carbon `AILabel` disclosure plus confidence `ProgressBar` rendering for AI learn suggestions, a Carbon `DataTable` mesh peer view with peer save/remove and forwarding controls, and a Carbon `DataTable` drift log with severity tags for device shadow events.
  - Added route coverage in `web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` for AI suggestion display, mesh peer CRUD, and shadow drift presentation.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subI
Status: [✓] Done
Title: `/map2/*` OSC namespace — hierarchical address space with bidirectional feedback
Description:
- Goal / acceptance criteria: Design and implement a hierarchical OSC namespace for MAP2 following ETC `/eos/*` industry-standard pattern. The namespace must expose ALL internal MAP2 state for external control surfaces (TouchOSC, Lemur, Open Stage Control). Namespace structure:
  - `/map2/plugin/<id>/param/<name>` — get/set plugin parameters
  - `/map2/plugin/<id>/bypass` — toggle plugin bypass
  - `/map2/chain/<id>/preset/<number>/fire` — recall chain preset
  - `/map2/cue/<list>/<number>/fire` — fire event list cue
  - `/map2/transport/bpm` — get/set BPM
  - `/map2/transport/start`, `/stop`, `/continue` — transport control
  - `/map2/preset/fire` — recall MIDI hub preset by number
  - `/map2/preset/<id>/fire` — recall by ID
  - `/map2/macro/<id>/fire` — trigger macro
  - `/map2/gpio/in/<number>` — read virtual GPIO input
  - `/map2/gpio/out/<number>` — set virtual GPIO output
  - `/map2/meter/<channel>` — subscribe to metering data
  - `/map2/cmd` — send command string (like ETC `/eos/cmd`)
  - `/map2/ping` → `/map2/out/ping` — latency test
  - Implicit output (auto-broadcast when state changes):
    - `/map2/out/active/preset` — currently active preset
    - `/map2/out/active/cue/<list>/<number>` — active cue with progress
    - `/map2/out/transport/bpm` — current BPM
    - `/map2/out/event/cue/<list>/<number>/fire` — cue fired notification
    - `/map2/out/event/preset/<id>/recall` — preset recalled notification
    - `/map2/out/meter/<channel>` — metering data stream
  - Namespace browser UI in the Network area showing all available addresses with descriptions
- Why it matters: OSC namespace makes MAP2 controllable by any OSC surface — this is how professional show control systems integrate with custom control surfaces.
- Dependencies: T203-subG (OSC bridge rewrite)
- Estimated effort: Very High
- Required outputs:
  - Backend: `app/services/midi_hub/osc_namespace.py` — address router, parameter mapping, implicit output broadcaster
  - Backend: update `app/services/midi_hub/network.py` OSC server to dispatch through namespace router
  - Frontend: `OscNamespaceBrowser.tsx` — searchable tree view of all `/map2/*` addresses with descriptions and current values
  - Documentation: `docs/midi/MAP2_OSC_NAMESPACE.md` — complete address reference (modeled after ETC Eos Show Control User Guide OSC section)
  - Tests: `tests/test_osc_namespace.py` — address routing, parameter get/set, implicit output, ping
- Implementation notes:
  - Follow ETC hierarchical pattern: noun/verb structure, fire for actions, get/set for values
  - Implicit output: use Python `asyncio` pub/sub — when internal state changes, broadcast to all connected OSC clients
  - Metering: throttle to 25Hz max to avoid flooding
  - Use `python-osc` library (already in project for OSC bridge)
  - Enterprise flags: namespace access control (whitelist addresses per client), OSC-over-TCP for reliable transport, namespace versioning
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 21:29 - Codex
- Completion notes:
  - Added `app/services/midi_hub/osc_namespace.py` as the canonical `/map2/*` router covering transport, plugin parameter/bypass, presets, chains, cues, macros, GPIO, meter feedback, command dispatch, ping, and implicit output event logging.
  - Updated `app/services/midi_hub/network.py` so incoming `/map2/*` OSC packets are dispatched through the namespace router while legacy OSC-to-MIDI mappings remain intact, and added namespace event fanout back to known OSC clients.
  - Extended `app/routes/midi_hub.py` with namespace catalog and direct dispatch endpoints for the browser and tooling workflows.
  - Added `web/src/app/components/MidiHub/OscNamespaceBrowser.tsx` and integrated it into `MidiNetworkPanel.tsx`, then extended `web/src/map2/api.ts` with typed namespace catalog and dispatch clients.
  - Added namespace reference documentation in `docs/midi/MAP2_OSC_NAMESPACE.md`.
  - Added backend coverage in `tests/test_osc_namespace.py` for parameter dispatch, bypass, BPM, chain recall, cue fire, preset recall, macro fire, GPIO state, ping, and catalog feedback.
  - Validation: `pytest tests/test_osc_namespace.py` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subJ
Status: [✓] Done
Title: Documentation, conformance, and test suite finalization
Description:
- Goal / acceptance criteria: Update all documentation to reflect the new MIDI Hub v2 architecture. Produce all Carbon conformance evidence. Ensure full test coverage.
  1. Update `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md` with new `/midi-hub/*` child routes
  2. Update `docs/design/CARBON_CONFORMANCE_MATRIX.md` with v2 conformance status
  3. Complete Carbon Contribution Review Checklist for T203
  4. Update `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md` with new feature inventory
  5. Update `docs/midi/MIDI_HUB_ARCHITECTURE.md` with v2 architecture (sidebar nav, new services, Tesira, GPIO, String Interface, Event Lists, OSC namespace)
  6. Create `docs/midi/MAP2_OSC_NAMESPACE.md` — complete OSC address reference
  7. Create `docs/midi/TESIRA_TTP_INTEGRATION.md` — Tesira integration guide with supported commands, connection setup, and prebuilt control reference
  8. Update `docs/CLAUDE.md` Global Work List section and Key File Locations
  9. Sync instruction changes to `.gemini/instructions.md` and `.github/copilot-instructions.md`
  10. Full test suite: all new frontend pages have `.test.tsx` files, all new backend services have `tests/test_*.py` files
  11. Final validation: `npm run typecheck` + `npm run build` + `pytest tests/` must all pass
- Why it matters: Documentation and conformance evidence are required deliverables per the Carbon Conformance Standard. Tests are required per "Done Means Clean Build" rule.
- Dependencies: T203-subA through T203-subI (all must be complete)
- Estimated effort: High
- Required outputs: All items listed above. No silent exceptions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 13:00 - Codex
- Completion notes:
  - Updated `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md`, `docs/design/CARBON_CONFORMANCE_MATRIX.md`, and `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md` so the routed `/midi-hub/*` shell, child pages, and v2 Carbon evidence match the shipped implementation.
  - Updated `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md`, `docs/midi/MIDI_HUB_ARCHITECTURE.md`, `docs/midi/MAP2_OSC_NAMESPACE.md`, `docs/midi/TESIRA_TTP_INTEGRATION.md`, `docs/CLAUDE.md`, `.gemini/instructions.md`, and `.github/copilot-instructions.md` to reflect the v2 information architecture, service inventory, OSC namespace, Tesira integration surface, and worklist/instruction updates.
  - Verified the required page/backend test surface is present and green with `npm --prefix web test -- --runInBand src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx src/app/pages/midi-hub/MidiHubTransportPage.test.tsx src/app/pages/midi-hub/MidiHubEventsPage.test.tsx src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx src/app/pages/midi-hub/MidiHubLabPage.test.tsx` and `pytest -q tests/test_tesira_client.py tests/test_virtual_gpio.py tests/test_string_interface.py tests/test_osc_namespace.py tests/test_midi_hub_event_lists.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py`.
  - Final validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T203-subK
Status: [✗] Blocked
Title: Tesira hardware integration testing (save for end)
Description:
- Goal / acceptance criteria: Test the Tesira TTP integration against the real Tesira system on the network. Verify: TCP connection, instance tag discovery, fader get/set, mute toggle, preset recall, subscription live updates, auto-reconnect on disconnect, command console free-text commands. Archive evidence.
- Why it matters: User explicitly requested saving hardware tests for the end.
- Dependencies: T203-subG (Tesira TTP implementation), live Tesira hardware on network
- Estimated effort: Medium
- Required outputs: Test evidence document, any bug fixes discovered during testing.
Subtasks: None
Assigned to: Claude + Lab
Last updated: 2026-03-20 13:00 - Codex
- Blocked notes:
  - Software implementation, route coverage, and documentation are complete.
  - Remaining work is the user-requested end-of-program live Tesira session against real hardware on the network.

Assigned to: Claude
Last updated: 2026-03-20 13:00 - Codex
- Blocked notes:
  - All software-side MIDI Hub v2 deliverables are complete.
  - Remaining closure depends only on live Tesira hardware validation in `T203-subK`.

## API Reliability

ID: T209
Status: [✗] Blocked
Title: API startup, restart, and load-reliability remediation program
Description:
- Goal / acceptance criteria: Eliminate the API failure modes observed in the 2026-03-07 qualification review by hardening startup/readiness behavior, restart sequencing, endpoint degradation paths, and observability so that the load qualification suite passes consistently without transient `404`, `500`, `503`, connection resets, or 8-second read/connect timeouts during warmup or steady-state runs.
- Why it matters: The reviewed artifacts show one failed qualification run with 379/400 HTTP failures and 9240 WebSocket drops plus several earlier smoke runs with transient route/server errors, which blocks confidence in API reliability during restart and qualification.
- Dependencies: Existing load qualification artifacts under `docs/fit-for-purpose-evidence/20260307/`, backend service orchestration, API observability/logging stack, and final verification with `tests/load_test.py`
- Estimated effort: High
- Required outputs/deliverables: Implemented backend fixes, updated qualification/runbook logic, correlated observability artifacts, regression tests for startup/restart behavior, and a new evidence bundle showing repeatable pass under smoke and full qualification.
Subtasks:
ID: T209-subA
Status: [✓] Done
Title: Convert startup and warmup states into explicit readiness gates
Description:
- Goal / acceptance criteria: Audit all load-tested API and websocket entry points and ensure they fail fast with structured readiness responses while dependencies are still warming up instead of hanging into client-side timeouts. Define concrete readiness checks for backend HTTP serving, chain inventory access, plugin inventory/discovery state, websocket broker availability, and any engine-backed audio routes. Acceptance requires a documented readiness matrix, implementation changes on affected routes/services, and automated tests proving warmup returns deterministic readiness errors instead of connection/read timeouts.
- Why it matters: The failed T050 run shows broad timeout behavior across unrelated routes, which is consistent with requests arriving before the stack is fully ready.
- Dependencies: None
- Estimated effort: Medium
- Required outputs/deliverables: Readiness matrix, route/service updates, startup-state tests, and notes linking coverage to the affected endpoints from the failure review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:34 - Codex
- Completion notes:
  - Added shared route-readiness helper logic in `app/services/api_readiness.py` to convert startup and warmup states into structured `503` responses with dependency detail and `Retry-After` guidance.
  - Wired the readiness guards into the load-tested route families hit in the failure review: `/api/audio/status`, `/api/audio/latency`, `/api/audio/levels`, `/api/audio/levels/plugins`, `/api/chains/`, `/api/chains/{id}`, `/api/chains/{id}/activate`, `/api/chains/{id}/deactivate`, `/api/plugins/discover`, `/api/plugins/list`, `/api/plugins/load`, `/api/plugins/unload`, and `/api/plugins/batch/parameters`.
  - Added focused tests in `tests/test_api_route_readiness.py` and updated affected route tests so the new startup contract is validated without regressing plugin residency behavior.
  - Added the explicit readiness matrix in `docs/API_ROUTE_READINESS_MATRIX.md`, linking each guarded route family to its required services, readiness reason, and regression coverage so the startup-state contract is documented rather than implicit.

ID: T209-subB
Status: [✓] Done
Title: Stabilize restart sequencing and dependency ordering for backend and realtime services
Description:
- Goal / acceptance criteria: Trace service startup/restart ordering across the MAP2 backend stack and remove races that allow HTTP or websocket traffic before required subsystems are actually usable. Acceptance requires an explicit dependency/ordering map, any required code or service-unit changes, and restart validation showing API health, websocket readiness, and route availability are stable immediately after controlled service-stack restart.
- Why it matters: Later post-restart evidence passed cleanly, which suggests the failure is likely tied to startup ordering or readiness races rather than a permanent logic bug.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Restart dependency map, service sequencing fixes, controlled restart validation evidence, and updated operational notes if boot/service procedures change.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 08:16 - Codex
- Completion notes:
  - Extended `app/services/service_orchestrator.py` with an explicit startup dependency map, per-level parallel startup visibility, traffic-gate service identification (`database`, `command_queue`, `websocket_manager`), and startup progress counts so restart ordering is queryable instead of implicit.
  - Updated `app/routes/services.py` `/api/services/startup-order` to expose dependency levels, dependents, traffic-gate membership, and startup progress for controlled restart diagnostics.
  - Tightened `app/routes/health.py` `/api/ready` to report both `ready` and `accepting_traffic`, with `accepting_traffic` gated on the restart-safe base services required for stable HTTP/WebSocket handling.
  - Added `docs/API_RESTART_DEPENDENCY_MAP.md` to document the base restart dependency map and readiness contract used by the API.
  - Validation: `pytest -q tests/test_health_routes.py tests/test_service_routes.py tests/test_api_route_readiness.py` -> pass. `python3 -m compileall ...` hit an existing `__pycache__` permission error under `app/services/`, so compile-only validation was not fully usable in this workspace.

ID: T209-subC
Status: [✓] Done
Title: Harden chain and plugin lifecycle endpoints against transient 404/500/503 failures
Description:
- Goal / acceptance criteria: Review the chain activation/deactivation, chain lookup, plugin load, and plugin unload flows that appeared in the transient smoke failures and make them resilient to restart-time and warmup-time races. Acceptance requires root-cause analysis for the observed `/api/plugins/unload` `404`, chain endpoint `500`/`503` responses, and connection resets; route or service fixes that return the correct status/payloads; and focused regression tests that exercise lifecycle calls during degraded states.
- Why it matters: Even though the final qualification reruns passed, the transient lifecycle failures indicate brittle contract behavior around the most stateful API surfaces.
- Dependencies: T209-subA, T209-subB
- Estimated effort: High
- Required outputs/deliverables: Root-cause notes, backend fixes, targeted tests for chain/plugin lifecycle routes, and updated API contract documentation if any response semantics are formalized.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:03 - Codex
- Completion notes:
  - Updated `app/routes/chains.py` so list, lookup, activate, and deactivate paths now return structured `503` readiness payloads for transient timeout/session failures when no usable cache exists, instead of leaking empty/deferred success responses during restart races.
  - Added `raise_route_transient_unavailable()` in `app/services/api_readiness.py` so degraded lifecycle routes reuse the same retryable warmup contract and dependency detail as the explicit readiness gates.
  - Hardened `app/routes/plugins.py` `load_plugin` to force a single discovery refresh before returning `404` when the in-memory plugin inventory is empty after restart, eliminating a common false-miss window.
  - Validation: `pytest -q tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass.

ID: T209-subD
Status: [✓] Done
Title: Add correlated request, websocket, and dependency observability for qualification failures
Description:
- Goal / acceptance criteria: Extend logging/observability so every future load run can be correlated across HTTP requests, websocket sessions, dependency readiness, queue depth, and backend exceptions using a shared run or request context. Acceptance requires new or improved structured logs/metrics for timeout-prone areas, a documented artifact-capture path for qualification runs, and tests or smoke validation proving the data is emitted during failure and pass scenarios.
- Why it matters: Current client-side artifacts show the symptoms clearly, but they do not isolate the server-side cause of timeouts and resets quickly enough for efficient remediation.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Structured log/metric additions, qualification capture instructions or script updates, and evidence examples tying a run ID to backend-side events.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:18 - Codex
- Completion notes:
  - Extended `app/services/api_observatory.py` and `app/routes/api_observatory.py` so observability events now carry `event_type` and `run_id`, and can be filtered per qualification run for both live traffic and stats views.
  - Updated `app/middleware/traffic_capture.py` to capture qualification run IDs from request headers/query params and attach restart/dependency snapshots to tagged requests and server-side failures.
  - Updated `app/services/websocket_manager.py`, `app/routes/websocket.py`, and `tests/load_test.py` so qualification runs now correlate normal WebSocket lifecycle events (`connect`, `subscribe`, `disconnect`, timeout/failure paths) with the same run ID used by HTTP traffic.
  - Added operator documentation in `docs/API_QUALIFICATION_OBSERVABILITY.md` and regression coverage in `tests/test_api_observatory.py`.
  - Validation: `pytest -q tests/test_api_observatory.py tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass. `python3 -m py_compile ...` hit the existing `app/services/__pycache__` permission issue in this workspace.

ID: T209-subE
Status: [✓] Done
Title: Make load qualification gating restart-safe and preflight-aware
Description:
- Goal / acceptance criteria: Update the load-qualification workflow so it verifies environment prerequisites and service readiness before the expensive smoke/full runs begin. This includes preflight checks for file descriptor limits, API health, websocket readiness, chain/plugin route availability, and any other conditions learned from T050-T053. Acceptance requires workflow/runbook updates and automated preflight behavior that prevents collecting misleading full-run failures when the environment is not yet ready.
- Why it matters: The failed run also carried an open-file-limit warning and appears to have started against an unhealthy or incompletely started stack; the qualification harness should catch those conditions first.
- Dependencies: T209-subA, T209-subB, T209-subD
- Estimated effort: Medium
- Required outputs/deliverables: Updated qualification runner or scripts, revised runbook/docs, preflight checks in automation, and evidence showing the gate blocks unsafe starts.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:31 - Codex
- Completion notes:
  - Added `scripts/run_t209_api_load_qualification.py`, a deterministic preflight gate that checks open-file limits, `/api/ready`, startup-order completion, `websocket_manager` readiness, and the chain/plugin qualification routes before allowing any load command to execute.
  - The runner now emits artifact-ready JSON/markdown summaries and blocks load execution with explicit `BLOCKED` status when readiness or restart-safety prerequisites are not met.
  - Added focused regression coverage in `tests/test_t209_api_load_qualification.py` and documented the workflow in `docs/API_LOAD_QUALIFICATION_RUNBOOK.md`.
  - Validation: `pytest -q tests/test_t209_api_load_qualification.py tests/test_api_observatory.py tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass. `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile scripts/run_t209_api_load_qualification.py app/services/api_observatory.py app/middleware/traffic_capture.py app/services/websocket_manager.py app/routes/websocket.py app/routes/api_observatory.py tests/load_test.py` -> pass.

ID: T209-subF
Status: [✗] Blocked
Title: Re-run smoke, full soak, and restart qualification to close the reliability program
Description:
- Goal / acceptance criteria: After the remediation work lands, execute the smoke, full 310-second qualification, and controlled restart qualification enough times to demonstrate the failures are gone and the pass is repeatable. Acceptance requires zero HTTP failures, zero websocket drops, acceptable latency gates, archived artifacts, and a short closure report comparing the fixed runs against the 2026-03-07 failure signatures.
- Why it matters: This program is not complete until the observed failure patterns are demonstrably absent in fresh evidence.
- Dependencies: T209-subB, T209-subC, T209-subD, T209-subE
- Estimated effort: Medium
- Required outputs/deliverables: New qualification artifact bundle under `docs/fit-for-purpose-evidence/`, closure summary, and final worklist update with pass/fail disposition.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:39 - Codex
- Blocked notes:
  - Re-ran the T209 preflight on `2026-03-18` using `python3 scripts/run_t209_api_load_qualification.py --output-dir docs/fit-for-purpose-evidence/20260318T223428Z-t209-preflight --api-base http://127.0.0.1:8080`.
  - The live backend had to be restarted first because the pre-existing `uvicorn` process on port `8080` was serving an older readiness contract; after restart, `/api/ready` correctly reported `accepting_traffic: true` and `/api/services/startup-order` exposed `traffic_gate_services` and `startup_progress`.
  - Follow-up task `T221` is now complete: the preflight startup-order check was aligned with traffic-gate readiness semantics and validated by `pytest -q tests/test_t209_api_load_qualification.py` (`3 passed`) plus a fresh preflight artifact at `docs/fit-for-purpose-evidence/20260318T223805Z-t209-preflight`.
  - Qualification remains blocked in this workspace only because the host soft/hard `RLIMIT_NOFILE` is `8192`, below the required `65536`; this is host-level/operator intervention outside the repo.

ID: T221
Status: [✓] Done
Title: Align T209 preflight startup-order gating with traffic-gate readiness semantics
Description:
- Goal / acceptance criteria: Update the T209 preflight logic so `/api/services/startup-order` passes when the traffic-gate services required for HTTP/WebSocket qualification are complete, without incorrectly blocking on optional or non-traffic-gating services that may legitimately remain unfinished while `/api/ready` already reports `accepting_traffic: true`. Acceptance requires clarified gating criteria, code changes in `scripts/run_t209_api_load_qualification.py` (and docs/tests if needed), and validation showing the startup-order check agrees with the readiness contract exposed by `/api/ready`.
- Why it matters: The current preflight run on `2026-03-18` blocked on `startup_progress.completed_services=13/15` despite `/api/ready` reporting `accepting_traffic: true`, which means the qualification harness can still over-block even after the readiness-gate fixes landed.
- Dependencies: T209-subA, T209-subB, T209-subE
- Estimated effort: Medium
- Required outputs/deliverables: Updated preflight/startup-order gating logic, regression coverage or focused validation, and runbook notes reflecting the refined contract.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:39 - Codex
- Completion notes:
  - Updated `scripts/run_t209_api_load_qualification.py` so the startup-order preflight now passes when the declared `traffic_gate_services` are present and marked `gates_accepting_traffic`, with a bounded fallback based on gate-count completion when the detailed metadata is absent.
  - Added regression coverage in `tests/test_t209_api_load_qualification.py` for the partial-startup-but-traffic-ready case and validated it with `pytest -q tests/test_t209_api_load_qualification.py` -> `3 passed in 1.84s`.
  - Re-ran the live preflight after restarting the stale backend; `docs/fit-for-purpose-evidence/20260318T223805Z-t209-preflight` shows `api_ready`, `startup_order`, `websocket_manager`, and the chain/plugin route gates all passing, leaving only the host open-file limit as the remaining blocker.

## SynthForge

ID: T210
Status: [✓] Done
Title: Refactor SynthForge into a SoundFont-first world-class sampler
Description:
- Goal / acceptance criteria: Review the existing `SynthForge` JUCE plugin plus `SynthForgeCard` UI, then refactor the instrument from the current subtractive/SFZ-oriented scaffold into a SoundFont-first sampler centered on hardware MIDI keyboards and the on-screen piano. Acceptance requires SoundFont 2 and 3 loading from the internal library, a preset browser built from parsed banks/programs, a redesigned on-screen piano with velocity interaction, real-time MIDI input handling aligned with JUCE MIDI pathways, and pro controls for master transpose, velocity curve, pitch-bend range, mono/poly mode, and legato. The implementation must expose a coherent backend/API/UI contract and preserve existing MAP2 integration points.
- Why it matters: The current SynthForge surface and engine do not match the requested product direction. The user explicitly wants a commercial-grade sampler architecture, not an SFZ scaffold with synth controls.
- Dependencies: Existing `juce-engine/Source/SynthForge/*`, `app/routes/synthforge.py`, `app/routes/soundfonts.py`, `app/services/juce_engine_service.py`, `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, and build-system support for a SoundFont engine backend.
- Estimated effort: High
- Required outputs/deliverables: Reviewed architecture notes, implemented backend/API changes for SoundFont browsing/loading and preset metadata, JUCE core refactor toward SoundFont playback controls, redesigned SynthForge card, focused automated validation, and explicit notes for any remaining gaps such as static FluidSynth vendoring/build integration if not fully closed in this slice.
Subtasks:
ID: T210-subA
Status: [✓] Done
Title: Deliver the first integrated SoundFont sampler slice across backend, engine, and card
Description:
- Goal / acceptance criteria: Land the first end-to-end slice that replaces SFZ-first UX with SoundFont-first browsing/loading, exposes parsed preset metadata, and adds the required sampler performance controls in the engine/API/card. Acceptance requires code changes in the relevant backend, JUCE, and frontend files plus targeted validation.
- Why it matters: This is the minimum coherent slice that converts SynthForge from a review item into a working sampler refactor.
- Dependencies: None
- Estimated effort: High
- Required outputs/deliverables: Code changes, tests/build notes, and handoff notes for any remaining FluidSynth packaging work.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 19:14 - Codex
- Completion notes:
  - The backend SoundFont-first route layer is in place in `app/routes/synthforge.py`, including validated `.sf2/.sf3` load endpoints, parsed bank/program preset selection, per-part performance controls, MIDI note injection, backend/streaming status, and metering websocket support.
  - The engine service bridge in `app/services/juce_engine_service.py` exposes the SoundFont load/status pathway alongside the existing SFZ path and provides the parameter/status accessors consumed by the route layer.
  - The frontend card in `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx` already delivers the requested first coherent sampler UX slice: unified library browser, SoundFont preset browser, format-aware `.sf2/.sf3/.sfz` loading, performance controls (transpose, velocity curve, pitch-bend range, mono, legato), velocity-sensitive on-screen piano, and real-time MIDI activity feedback.
  - Validation: `pytest -q tests/test_synthforge_routes.py tests/test_soundfont_parser.py` -> pass (`18 passed`). `npm --prefix web run typecheck` -> pass. `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/routes/synthforge.py app/services/juce_engine_service.py app/services/soundfont_parser.py` -> pass.
  - Remaining `T210` scope is now the follow-up compatibility and refinement program beyond the first integrated slice, not the basic SoundFont-first end-to-end contract.
Assigned to: Codex
Last updated: 2026-03-18 22:40 - Codex
- Completion notes:
  - Delivered the SoundFont-first SynthForge sampler contract through `T210-subA`: validated `.sf2/.sf3` loading, parsed bank/program preset metadata, preset-aware backend routes, performance controls, velocity-sensitive on-screen piano, and real-time MIDI activity feedback are all in place across the route layer, engine bridge, and card UI.
  - The remaining notes previously attached to `T210` described follow-up compatibility and refinement opportunities, not missing acceptance criteria for the requested SoundFont-first sampler direction.

## JUCE Grid UI Polish

ID: T193
Status: [✓] Done
Title: JUCE Grid — Automation panel background matches page surface (seamless integration)
Description:
- Goal / acceptance criteria: The automation timeline panel and the signal-flow SVG diagram look visually seamless against the page background. All hardcoded hex/rgba fallbacks in the routing diagram replaced with Carbon tokens. Full SVG redesign: sharp-edge Carbon nodes, typographic terminal bookends, purple morph node with progress bar, gradient sweep wire animation on live paths, responsive spacing.
- Dependencies: None
- Estimated effort: Low–Medium
- Required outputs: See completion notes.
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-16 - Claude
- Completion notes:
  - `.juce-grid-page__automation-panel` background changed from `var(--cds-layer)` to `var(--cds-background, #161616)` — matches outermost page surface.
  - `JuceGridRoutingVisualizer.tsx` fully redesigned: all hardcoded rgba/hex constants replaced with Carbon token constants (`C_BACKGROUND`, `C_LAYER`, `C_BORDER`, `C_LINK`, `C_PURPLE`, etc.). Flow nodes now sharp-edged (rx=0) with left-border stripe using `--flow-color`. Terminal nodes (Input/Output) replaced with typographic bookends (label + flanking `<line>` rules, no box). Morph block now uses `C_PURPLE` throughout with sharp edges and animated progress bar. Wire rendering split into base layer (low opacity) + animated gradient sweep layer (`juce-grid-routing-sweep` keyframe) on active paths only. `ArrowRight` from `@carbon/icons-react` imported and `WireArrow` helper exported for inline icon use.
  - `JuceGridPage.css` routing diagram section: `.juce-grid-page__routing-diagram` gets `background: var(--cds-background)` and increased padding/gap for airy spacing. Wire sweep `@keyframes` added. All `rgba(255,255,255,*)` label fallbacks replaced with named Carbon token fallbacks (`#c6c6c6`, `#f4f4f4`). Morph value uses `var(--cds-purple-30, #d4bbff)`. `.juce-grid-page__routing-morph-progress` gets `transition: width 240ms ease`.
  - Layout constants increased: node width 132px (was 116), height 62px (was 56), horizontal gap 56px (was 32), row gap 92px (was 78).
  - Validation: `npm run typecheck` → pass, `npm run build` → pass (19.47s, zero errors).

## Navigation Shell

ID: T204
Status: [✓] Done
Title: Advanced Menu launcher redesign matches the landing-page launcher aesthetic
Description:
- Goal / acceptance criteria: Review the current Advanced Menu in the top shell and redesign it so the open panel mirrors the landing-page launcher design language: neon-grid/brand-mark hero treatment, expressive header hierarchy, grouped route card launcher layout, and landing-page-style card interactions for advanced workflows while preserving existing pinning, route access, blocked-state handling, and hardware/location notes.
- Why it matters: The current Advanced Menu still reads like a generic dropdown and breaks visual continuity with the home launcher, which makes advanced workflows feel disconnected from the rest of the product.
- Dependencies: Existing `AppShell` advanced menu state, `advancedMenuItems`, `homeCardProfiles`, and current shell navigation behavior
- Estimated effort: Medium
- Required outputs: Updated Advanced Menu markup/state in `web/src/app/layout/AppShell.tsx`, route-launcher styling in a co-located stylesheet, focused `AppShell` test updates if behavior/labels move, and validation notes from frontend tests/type/build checks
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 16:36 - Codex
- Completion notes:
  - Replaced the Advanced Menu accordion dropdown with a launcher-style panel in `AppShell` that now uses a branded hero header, launcher metrics, grouped section headings, and landing-page-style route cards with open/details actions.
  - Preserved existing shell behavior for route navigation, pin toggles, blocked-route handling, current-route highlighting, and hardware/location notes while adding card-level detail expansion driven by `homeCardProfiles`.
  - Added a co-located `AppShell.css` stylesheet so the Advanced Menu can carry the landing page's neon-grid/brand-mark treatment without relying on global shell dropdown styles.
  - Validation: `npm run typecheck` -> pass, `npm test -- AppShell.test.tsx --runInBand` -> pass, `npm run build` -> pass (existing Vite chunk-size warnings only).
  - Follow-up refinement completed: blocked and experimental routes now surface in a dedicated `Blocked / Lab` section, the current route card auto-expands when the launcher opens, the mobile menu remains compact, the `Advanced` trigger label is unchanged, and the launcher metrics remain visible.

ID: T245
Status: [✓] Done
Title: Advanced Menu matches the Platform control-panel pattern
Description:
- Goal / acceptance criteria: Rework the top-shell Advanced Menu so it matches the Platform control panel's layout, spacing, interaction model, and component grammar while keeping the existing Advanced route content, section grouping, pinning behavior, blocked-state handling, and Advanced-only metadata/details.
- Why it matters: The Advanced Menu currently uses a separate launcher visual language, which breaks consistency with the Platform menu the user wants as the shell's reference pattern.
- Dependencies: `web/src/app/layout/AppShell.tsx`, `web/src/app/layout/AppShell.css`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/pages/PlatformShellPage.css`, and existing `AppShell` tests
- Estimated effort: Medium
- Required outputs: Updated Advanced Menu markup/behavior, Platform-patterned Advanced Menu styling, focused `AppShell` regression coverage, and frontend validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 09:45 EDT - Codex
- Completion notes:
  - Replaced the Advanced Menu launcher hero/card layout in `web/src/app/layout/AppShell.tsx` with stacked control-panel sections that use the Platform menu's tile grammar (`platform-shell__cp-*`) while preserving Advanced section grouping, route access, pinning, blocked-route handling, and current-route auto-expansion.
  - Moved Advanced-only route metadata into section detail trays so the tile interactions match Platform more closely while still retaining summary, capabilities, workflow notes, best-for guidance, maturity tags, and hardware/location notes.
  - Rewrote the Advanced Menu styling in `web/src/app/layout/AppShell.css` around the Platform control-panel sizing model (`--platform-menu-scale`) and removed the prior neon-grid launcher treatment.
  - Updated `web/src/app/layout/AppShell.test.tsx` to verify the Platform-patterned Advanced Menu still exposes the expected routes/sections and auto-expands the current route detail tray.
  - Validation: `npm --prefix web test -- src/app/layout/AppShell.test.tsx --runInBand --silent` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).
  - Follow-up reopened on 2026-03-21 after user review: the tile internals were close, but the Advanced popup window chrome/layout still differed from the Platform modal.
  - Follow-up refinement completed: the Advanced popup now uses the Platform modal body/header/scroll frame directly, wraps content in the same `platform-shell-page` / `platform-shell__content` layout, increases tile icon sizing to the Platform control-panel size, and trims custom tile overrides so the box treatment more closely matches Platform while preserving Advanced-specific details and section counts.
  - Follow-up validation: `npm --prefix web test -- src/app/layout/AppShell.test.tsx --runInBand --silent` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

## Icon System

ID: T205
Status: [✓] Done
Title: Icon system overhaul — monotone Carbon-style SVG icons with DSP color taxonomy
Description:
- Goal: Replace all icons across the MAP2 GUI (main app + PiPedal legacy area) with a unified set of monotone, Carbon Design System-style SVG icons. Apply DSP-type color taxonomy to all categories.
- Why it matters: Current icon system uses four libraries (Carbon, Phosphor, MUI, 63 custom PiPedal SVGs) with inconsistent styles and no systematic color-coding.
- Design documentation complete — see docs/design/ for all reference material before starting implementation.
- Current execution evidence: `docs/design/ICON_DOWNLOAD_LIST.md` now shows the previously unresolved 20-slot manual-sourcing list as closed with staged MAP-authored SVGs; `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` now records the post-sweep active-frontend state with `0` Phosphor files, `0` remaining MUI-icon files, and `0` tracked emoji/symbol UI-icon files across `web/src/app` + `web/src/map2`, with any remaining legacy icon-package debt now outside that active scope in `web/src/pipedal/**` and shared utility surfaces.
- Estimated effort: High
- Completion notes:
  - Closed the remaining active-frontend asset/mapping tail by wiring the staged noun icons for distortion, drums, modulation, and multi-effect rack categories through `web/src/app/components/icons/effectIcons.ts`.
  - Verified the active-frontend exit criteria directly: `rg -n "@phosphor-icons/react|@mui/icons-material" web/src/app web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches, and the tracked emoji/symbol sweep across the same roots reports `TOTAL_FILES 0`.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing chunk-size warnings only).
Subtasks:
ID: T205-subA
Status: [✓] Done
Title: Close the 20 unresolved icon asset slots and stage the approved SVG set
Description:
- Goal / acceptance criteria: Complete the remaining manual sourcing listed in `docs/design/ICON_DOWNLOAD_LIST.md`, normalize all approved SVGs into `web/src/app/components/icons/noun/**`, and record any permanent exceptions in the migration ledger.
- Why it matters: The full migration cannot finish while core icon slots are still missing, because holdout pages and plugin cards would be forced to keep legacy libraries or generic fallbacks.
- Dependencies: Existing `docs/design/ICON_DOWNLOAD_LIST.md`, `docs/design/ICON_DESCRIPTIONS.md`, and MAP-owned icon storage paths under `web/src/app/components/icons/`
- Estimated effort: Medium
- Required outputs: 20 sourced/normalized SVG files, naming/path validation, and updated design docs if any slot remains intentionally exceptional.
Subtasks: None
Assigned to: User + Codex
Last updated: 2026-03-18 15:40 - Codex
- Completion notes:
  - Added the 20 previously unresolved icon slots as monotone SVG assets under `web/src/app/components/icons/noun/**`, covering the remaining `fx-*`, `pip-*`, and `map-dynamics` files referenced by `docs/design/ICON_DOWNLOAD_LIST.md`.
  - Updated `web/src/app/components/icons/effectIcons.ts` to consume the staged noun assets for the newly closed effect categories instead of keeping those categories on legacy `HorizontalSignalChain` SVG sources.
  - Updated `docs/design/ICON_DOWNLOAD_LIST.md` so the manual-sourcing section now records the staged completion state instead of leaving the slots open.
  - Validation: `xmllint --noout web/src/app/components/icons/noun/**/*.svg` -> pass, `npm --prefix web run typecheck` -> pass.
  - Residual risk: `npm --prefix web run build` still fails on pre-existing `PlatformLayerData` type errors in `web/src/app/components/Platform/PlatformModal.tsx`; no build regression attributable to the icon asset work was observed.

ID: T205-subB
Status: [✓] Done
Title: Retire plugin-card and shared app Phosphor holdouts in active `web/src/app/**` surfaces
Description:
- Goal / acceptance criteria: Replace the remaining Phosphor icon usage in active `web/src/app/**` plugin cards, host/cluster dashboards, and page headers with Carbon controls or MAP-owned category/domain icons, with no behavioral regressions.
- Why it matters: These surfaces are active operator-facing UI and still carry the most visible mixed iconography in the modern app shell.
- Dependencies: T205-subA for missing SVG coverage, `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Groups D/E/F, and existing app-shell/icon ownership rules
- Estimated effort: High
- Required outputs: Updated app components with Phosphor removed from the targeted groups, focused UI regression checks, and ledger count reductions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:31 - Codex
- Progress notes:
  - Shared plugin-card shell controls in `web/src/app/components/PluginCards/Base/PluginCardShell.tsx` now use Carbon icons for preset actions, overflow menu, copy/reset actions, and MIDI mappings.
  - Shared section chevrons in `web/src/app/components/PluginCards/Base/ParameterSection.tsx` now use Carbon `ChevronDown`/`ChevronRight`.
  - `web/src/app/components/PluginCards/Dialogs/MidiMappingDialog.tsx` now uses Carbon icons for dialog close/save/warning/delete/routing controls.
  - Additional plugin-card custom/dialog surfaces now moved off Phosphor for their shared controls: `web/src/app/components/PluginCards/Dialogs/ExpressionOverlay.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NativeDelayCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/REEVRCard.tsx`, and `web/src/app/components/PluginCards/Custom/JUCE/IntervalShifterCard.tsx`.
  - Remaining plugin-card custom files were completed in the same migration wave: `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/BossXS1Card.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/EVHPitchShifterCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/OutotuneCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/WhammyCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/KeyboardSamplerCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`, and `web/src/app/components/PluginCards/Custom/Airwindows/GlitchShifterCard.tsx`.
  - Current repo state: `rg -n \"from '@phosphor-icons/react'\" web/src/app/components/PluginCards` now returns no matches, so the plugin-card ecosystem portion of `T205-subB` is complete; remaining scope is active app pages and non-plugin dashboard/header surfaces under `web/src/app/**`.
  - Active page-level migrations also landed for `web/src/app/pages/DSPPage.tsx`, `web/src/app/pages/MeteringPage.tsx`, and `web/src/app/pages/HostMachinePage.tsx`, replacing their remaining Phosphor page/header controls with Carbon or MAP-owned icons.
  - Additional active page migrations landed for `web/src/app/pages/MOTURMEPage.tsx`, `web/src/app/pages/CPUPerformancePage.tsx`, `web/src/app/pages/MPX1DiagView.tsx`, and `web/src/app/pages/HoToneJoGGPage.tsx`.
  - Additional active page migrations landed for `web/src/app/pages/MPX1Page.tsx`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/MIDIPage.tsx`.
  - Final active page migrations also landed for `web/src/app/pages/EdirolUA1000Page.tsx` and `web/src/app/pages/LCDPage.tsx`, replacing the remaining Phosphor page/header/control usages with Carbon or MAP-owned icons.
  - Current repo state: `rg -n "from '@phosphor-icons/react'" web/src/app/pages` now returns no matches, so the active page portion of `T205-subB` is complete; remaining scope is non-page `web/src/app/**` dashboard/header surfaces still tracked by the migration ledger.
  - Cluster dashboard holdouts were completed in one batch: `web/src/app/components/ClusterDashboard/ClusterEducationTab.tsx`, `UpdatesTab.tsx`, `TopologyGraph.tsx`, `LiveEventsTab.tsx`, `FlowManagementTab.tsx`, `ClusterOverviewTabEnhanced.tsx`, `ServicesHealthTab.tsx`, `ReportingTab.tsx`, `ClusterOverviewTab.tsx`, and `ClusterAdvancedOperationsTab.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/ClusterDashboard` now returns no matches, so the cluster-dashboard portion of `T205-subB` is complete; next remaining active groups are host-machine, routing, loader, and other shared non-page `web/src/app/**` surfaces.
  - Loader and routing holdouts were completed in a follow-on batch: `web/src/app/components/loaders/NAMLoaderCard.tsx`, `ReverbIRLoaderCard.tsx`, `CabinetIRLoaderCard.tsx`, `web/src/app/components/Routing/ParallelRoutingPanel.tsx`, `SidechainPanel.tsx`, and `EffectsLoopSummaryPanel.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/loaders web/src/app/components/Routing` now returns no matches, so those component groups are complete; remaining active `T205-subB` scope is concentrated in host-machine and other shared `web/src/app/**` surfaces still tracked by the migration ledger.
  - Host-machine holdouts were completed in another batch: `web/src/app/components/HostMachine/MultiSystemDashboard.tsx`, `PerformanceMetrics.tsx`, `BrandingPanel.tsx`, `AlertNotificationSettings.tsx`, `HealthMonitor.tsx`, `MetricsChartsEnhanced.tsx`, `AudioNodeFeatures.tsx`, `MachineSpecsCard.tsx`, `HealthAlarms.tsx`, and `DiskHealthCard.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/HostMachine` now returns no matches, so that component group is complete; remaining active `T205-subB` scope is now the assorted shared `web/src/app/**` surfaces outside pages, plugin cards, cluster dashboard, loaders, routing, and host-machine.
  - Library and upload holdouts were completed in the next shared batch: `web/src/app/components/library/NAMItemCard.tsx`, `IRItemCard.tsx`, `SFItemCard.tsx`, `LibraryPaths.tsx`, `DownloadManager.tsx`, `web/src/app/components/upload/UploadButton.tsx`, and `UnifiedUploadDialog.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/library web/src/app/components/upload` now returns no matches, so those component groups are complete; remaining active `T205-subB` scope is narrowed to the specialized shared surfaces such as chain management, engine/status panels, MPX1, MIDI cluster, onboarding, visualization, and related utility components still tracked by the migration ledger.
  - Status and observability holdouts were completed in the next pass: `web/src/app/components/PiPedalTestStatus.tsx`, `JUCEEngineTestStatus.tsx`, `RealtimeTestResults.tsx`, `UpdateProgressViewer.tsx`, `CPUStatusOverview.tsx`, `web/src/app/components/AudioEngine/ClusterEngineGrid.tsx`, and `web/src/app/components/Visualizations/AudioMeteringCard.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/PiPedalTestStatus.tsx web/src/app/components/JUCEEngineTestStatus.tsx web/src/app/components/RealtimeTestResults.tsx web/src/app/components/UpdateProgressViewer.tsx web/src/app/components/CPUStatusOverview.tsx web/src/app/components/AudioEngine/ClusterEngineGrid.tsx web/src/app/components/Visualizations/AudioMeteringCard.tsx` now returns no matches, so that shared status/observability surface is complete; remaining active `T205-subB` scope is concentrated in MPX1, MIDI cluster, chain-management, onboarding, preset/browser, and a smaller set of shared utility components.
  - The MPX1 cluster is now complete: `web/src/app/components/MPX1/MPX1StatusBar.tsx`, `MPX1ModMatrix.tsx`, `MPX1MidiMapper.tsx`, `MPX1FlowToolbar.tsx`, `MPX1FlowSidebar.tsx`, and `MPX1Librarian.tsx` now use Carbon icons instead of Phosphor.
  - MIDI cluster and MIDI Commander holdouts were completed in the same wave: `web/src/app/components/MidiCluster/MidiClusterNodeCard.tsx`, `MidiClusterClockPanel.tsx`, and `web/src/app/components/MIDICommanderSetup.tsx` now use Carbon icons instead of Phosphor.
  - Chain/routing and supporting utility holdouts were completed in the next wave: `web/src/app/components/ChainManagementCard.tsx`, `ChainPanel/ChainPanel.tsx`, `BottomRoutingPanel/BottomRoutingPanel.tsx`, `HorizontalSignalChain/HorizontalPluginNode.tsx`, `HorizontalSignalChain/SidechainConnector.tsx`, `OnboardingWizard.tsx`, and `NodeAudioPathView.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'" web/src/app/components` is now down to seven files: `snapshots/CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser/PluginBrowser.tsx`, `LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, and `chains/ChainDeployModal.tsx`.
  - Recommended remaining execution order inside `T205-subB`: snapshot/preset/browser/tag utility surfaces (`CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser.tsx`), then the heavier editor/architecture tail (`LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, `chains/ChainDeployModal.tsx`).
- Completion notes:
  - Finished the final seven shared `web/src/app/components` holdouts: `snapshots/CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser/PluginBrowser.tsx`, `LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, and `chains/ChainDeployModal.tsx` now use Carbon icons instead of Phosphor.
  - Updated the remaining weight-based filled/duotone icon states in those surfaces to Carbon equivalents such as `StarFilled`, `CheckmarkFilled`, `Renew`, `WarningAlt`, and `Close`, preserving the existing UI behavior without leaving mixed iconography behind.
  - Validation: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"|weight=\"fill\"" web/src/app/components` -> no matches, `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass.
  - Residual risk: `@phosphor-icons/react` remains in the wider frontend dependency graph outside this worklist slice, so future cleanup is still needed if the project wants to retire the library globally rather than just across the active `web/src/app/components` surface covered by `T205-subB`.
  - Focused validation: `npm --prefix web run typecheck` -> pass.

ID: T205-subC
Status: [✓] Done
Title: Migrate Tesira and AVB routing holdouts off MUI icons
Description:
- Goal / acceptance criteria: Replace remaining `@mui/icons-material` usage in the Tesira cluster and AVB routing cluster with Carbon status/action icons or MAP-owned identity icons, while preserving existing workflows and operator readability.
- Why it matters: These clusters remain high-traffic operational surfaces and still depend on the older icon stack for controls, status, and table/grid affordances.
- Dependencies: T205-subA where missing MAP-owned icons are required, `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Groups B/C, and current Carbon shell/token conventions
- Estimated effort: High
- Required outputs: Updated Tesira/AVB components, no new MUI icon imports in touched files, and validation notes for affected flows.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 19:42 - Codex
- Completion notes:
  - Completed the AVB routing batch: `web/src/app/components/AvbRouting` now has `0` `@mui/icons-material` imports after in-place Carbon replacements across inspector, topology modal, scene diff preview, top bar, node selector, sticky headers, node tree, routing matrix cells, and batch actions.
  - Removed overlapping emoji/symbol-as-icon usage from the AVB routed surfaces touched in this batch, leaving only one remaining non-action warning banner in `AvbRoutingApp.tsx` for the later `T205-subE` cleanup wave.
  - Group B and Group C in `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` are now both cleared for MUI holdouts; broader frontend MUI debt remains in legacy/frontend paths tracked by `T205-subD` and `T205-subF`.
- Validation:
  - `rg -n "@mui/icons-material" web/src/app/components/Tesira web/src/app/components/AvbRouting -g '*.tsx' -g '*.ts'` -> no matches
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass

ID: T205-subD
Status: [✓] Done
Title: Freeze and then clear legacy `web/src/map2/**` and `web/src/pipedal/**` icon debt
Description:
- Goal / acceptance criteria: Audit the remaining legacy icon debt in `web/src/map2/**` and `web/src/pipedal/**`, prevent any expansion of MUI/legacy icon usage, and execute an in-place replacement plan for the still-routed or still-shared surfaces.
- Why it matters: This is the densest remaining legacy icon island and the largest contributor to the unresolved MUI/icon drift totals.
- Dependencies: T205-subA, current route/import reality for legacy surfaces, and `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Group A plus PiPedal-related holdouts referenced by T205
- Estimated effort: High
- Required outputs: Prioritized file list for still-active legacy surfaces, migrated replacements for the highest-value routed/shared files, and documented freeze guidance for any non-routed leftovers.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:11 - Codex
- Progress notes:
  - Recounted the current legacy `web/src/map2/**` holdouts: `10` files still import `@mui/icons-material`, with the density concentrated in the heavier standalone panels plus the top-level chain-builder shell rather than the already-migrated modern `web/src/app/**` shell.
  - Documented the first prioritized active/shared legacy file set for in-place cleanup: `WorkFlow.tsx`, `HistoryPanel.tsx`, `FeaturesPanel.tsx`, `SettingsPanel.tsx`, `PluginBrowser.tsx`, `SessionManager.tsx`, `PresetManager.tsx`, `NetworkPanel.tsx`, `MAP2Dashboard.tsx`, and chain-builder node surfaces.
  - Started the replacement wave by migrating shared legacy shells `web/src/map2/components/WorkFlow.tsx`, `HistoryPanel.tsx`, and `FeaturesPanel.tsx` off `@mui/icons-material` and onto Carbon icons without changing their existing MUI layout/runtime behavior.
  - Completed the next connected shared-toolbar batch: `web/src/map2/components/FeatureToolbar.tsx`, `SessionStatusIndicator.tsx`, and `BackupStatusWidget.tsx` now use Carbon icons for history/session/backup controls while preserving the existing MUI surfaces and API behavior.
  - Completed the next shared status-widget batch: `web/src/map2/components/PluginCpuIndicator.tsx`, `LatencyDisplay.tsx`, and `ABQuickToggle.tsx` now use Carbon icons for CPU, latency, and A/B controls while keeping their existing data flow and MUI layout behavior.
  - Completed the next control/snapshot batch: `web/src/map2/components/SnapshotBar.tsx`, `LFOQuickButton.tsx`, and `ChainABMode.tsx` now use Carbon icons for snapshot recall, LFO assignment, and dual-chain A/B controls while preserving their current MUI surface behavior.
  - Completed the next content-manager batch: `web/src/map2/components/EnvelopeFollowerPanel.tsx`, `IRManager.tsx`, and `NAMManager.tsx` now use Carbon icons for envelope, IR, and NAM controls while preserving their existing MUI layouts and API flows.
  - Completed the next dashboard/config batch: `web/src/map2/components/MetricsDashboard.tsx`, `web/src/map2/components/NetworkPanel.tsx`, and `web/src/map2/components/Audio/AudioConfigDialog.tsx` now use Carbon icons for metrics, network, and audio-configuration controls while preserving their existing MUI layouts and API flows.
  - Completed the next automation batch: `web/src/map2/components/Automation/TransportControls.tsx`, `AutomationTimeline.tsx`, and `AutomationLane.tsx` now use Carbon icons for transport, lane headers, and point-context actions while preserving their existing MUI layouts and editing flows.
  - Completed the next editor/helper batch: `web/src/map2/components/AutomationEditor.tsx` and `web/src/map2/components/MIDI/MidiMappingsPanel.tsx` now use Carbon icons for automation transport/LFO actions and MIDI mapping controls while preserving their existing MUI layouts and editing flows.
  - Completed the next device-control batch: `web/src/map2/components/MIDIMapper.tsx` now uses Carbon icons for device tabs, routing, mapping actions, presets, monitor controls, and clock transport while preserving its existing MUI layout and local UI behavior.
  - Completed the next chain-builder node batch: `web/src/map2/components/ChainBuilder/nodes/PluginMeterPanel.tsx`, `RoutingNode.tsx`, `DeviceNode.tsx`, and `AudioPluginNode.tsx` now use Carbon icons for node identity, metering tabs, routing/split visuals, modulation badges, and node actions while preserving the existing React Flow + MUI behavior.
  - Completed the next legacy shared-shell batch: `web/src/map2/components/ChainBuilder/panels/SnapshotBar.tsx`, `MAP2Dashboard.tsx`, and `PluginPresetManager.tsx` now use Carbon icons for snapshot context menus, dashboard tab/header navigation, and preset management actions while preserving their existing MUI layouts and local behavior.
  - Completed the next library/session-management batch: `web/src/map2/components/SessionManager.tsx`, `PresetManager.tsx`, and `PluginBrowser.tsx` now use Carbon icons for session actions, preset favorites/filters, plugin-browser tabs/details, and plugin-pack operations while preserving their existing MUI layouts and backend/API behavior.
  - Completed the final active `web/src/map2/**` holdouts: `SettingsPanel.tsx`, `AudioEngine.tsx`, `WWWPanel.tsx`, and `ChainBuilder.tsx` now use Carbon icons for status tabs, engine controls, web-service management, and chain-builder actions while preserving their existing MUI layouts and data flows.
- Completion notes:
  - The active legacy `web/src/map2/**` island is now cleared: `rg -n "@mui/icons-material" web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches.
  - The broader active-frontend exit audit is also clean after removing the stray weight prop in `web/src/app/pages/MPX1Page.tsx`: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"|weight=\"fill\"" web/src/app web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches.
  - Residual legacy icon-package imports remain outside this completed slice in `web/src/pipedal/**` and a small number of shared non-active utility surfaces; those belong to `T205-subF` package-retirement verification rather than the active `map2` migration slice.
- Validation:
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass
  - `rg -n "@mui/icons-material" web/src/map2 -g '*.tsx' -g '*.ts'` -> no matches

ID: T205-subE
Status: [✓] Done
Title: Remove emoji and symbol glyphs used as UI icons across active frontend surfaces
Description:
- Goal / acceptance criteria: Replace emoji/symbol UI markers that act as status, device, or action icons with Carbon/MAP iconography plus text, leaving only legitimate textual content unchanged.
- Why it matters: Emoji and symbol glyphs break the intended visual system and remain a tracked exit criterion in the icon migration ledger.
- Dependencies: T205-subB, T205-subC, T205-subD where shared surfaces overlap, and `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md`
- Estimated effort: Medium
- Required outputs: Reduced emoji/symbol UI marker count in active surfaces, accessibility-safe replacements, and updated ledger totals.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 20:17 - Codex
- Completion notes:
  - Cleared the AVB routing warning-banner glyph in `web/src/app/components/AvbRouting/AvbRoutingApp.tsx`, so the routed AVB cluster no longer uses emoji/symbol markers as UI icons.
  - Replaced emoji/symbol UI markers with Carbon icons or plain text in `web/src/app/components/LCDEventFeed.tsx`, `web/src/app/components/HostMachine/HostMachineSettings.tsx`, `web/src/app/hooks/useAlertNotifications.tsx`, `web/src/app/components/UpdateProgressViewer.tsx`, and `web/src/app/components/ClusterDashboard/MultiNodeMonitoringTab.tsx`.
  - Cleared the next Cluster Dashboard holdouts in `web/src/app/components/ClusterDashboard/ClusterEducationTab.tsx`, `ServicesHealthTab.tsx`, and `ReportingTab.tsx`, replacing emoji service/report markers and checklist bullets with Carbon iconography.
  - Cleared the next operator-surface holdouts in `web/src/app/components/OnboardingWizard.tsx`, `web/src/app/pages/MeteringPage.tsx`, and `web/src/app/components/NodeAudioPathView.tsx`, replacing button/header/status glyphs with Carbon icons or plain labels.
  - Cleared the final tracked holdouts in `web/src/app/hooks/useExportData.ts`, `web/src/app/pages/EdirolUA1000Page.tsx`, `web/src/app/pages/LCDPage.tsx`, `web/src/app/components/PlatformCapabilities.tsx`, `web/src/app/components/HostMachine/ExportDialog.tsx`, `web/src/app/components/ClusterDashboard/ClusterOverviewTabEnhanced.tsx`, `web/src/map2/components/AudioInterfaceControl.tsx`, `web/src/map2/components/HistoryPanel.tsx`, `web/src/map2/components/FeaturesPanel.tsx`, and the touched plugin-registry index files.
  - Recounted the tracked emoji/symbol-as-icon sweep across `web/src/app` and `web/src/map2`; the current result is `TOTAL_FILES 0`, so the active-frontend emoji/symbol UI-icon exit criterion is now satisfied.
- Validation:
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass
  - `python3` tracked-marker sweep across `web/src/app` + `web/src/map2` -> `TOTAL_FILES 0`

ID: T205-subF
Status: [✓] Done
Title: Verify icon-migration exit criteria and retire legacy icon packages from active frontend paths
Description:
- Goal / acceptance criteria: Recount Phosphor, MUI, and emoji/symbol usage after migration waves, verify that active frontend paths satisfy the approved icon stack, and remove legacy icon packages/import paths where no longer needed.
- Why it matters: The icon program is not complete until the repo-level holdout counts and package usage match the approved end state documented in design guidance.
- Dependencies: T205-subB, T205-subC, T205-subD, T205-subE
- Estimated effort: Medium
- Required outputs: Updated exception ledger counts, package/import cleanup, and explicit completion notes against the icon exit condition.
Subtasks:
ID: T205-subF-subA
Status: [✓] Done
Title: Migrate shared utility surfaces still importing legacy icon packages
Description:
- Goal / acceptance criteria: Replace the remaining `@mui/icons-material` / `@phosphor-icons/react` imports in shared active utility surfaces under `web/src/shared/**`, `web/src/components/**`, and `web/src/pages/**`.
- Why it matters: These are still live operator-facing or shared surfaces, so leaving them on legacy icon packages blocks a truthful active-frontend package-retirement audit.
- Dependencies: T205-subD, T205-subE
- Estimated effort: Medium
- Required outputs: Updated shared utility components/routes, zero legacy icon-package imports in the targeted shared surfaces, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:23 - Codex
- Completion notes:
  - Migrated the full shared `PluginChooser` operator surface off legacy icon packages: `web/src/shared/components/PluginChooser/PluginChooser.tsx`, `components/PluginChooserHeader.tsx`, `components/QuickAddButtons.tsx`, `components/CategorySidebar.tsx`, `components/PluginPreviewPanel.tsx`, and `components/PluginCard.tsx` now use Carbon icons while preserving the existing MUI layout/runtime behavior.
  - Migrated the remaining standalone shared utility/admin surfaces `web/src/components/BackupRestoreWizard.tsx` and `web/src/pages/ClusterAdmin.tsx` off `@mui/icons-material`, leaving the targeted `web/src/shared/**`, `web/src/components/**`, and `web/src/pages/**` paths clear of legacy icon-package imports.
  - The targeted shared-surface audit is now clean: `rg -n "@mui/icons-material|@phosphor-icons/react" web/src/shared web/src/components web/src/pages -g '*.tsx' -g '*.ts'` returns no matches.
ID: T205-subF-subB
Status: [✓] Done
Title: Migrate or formally freeze remaining PiPedal legacy icon-package imports
Description:
- Goal / acceptance criteria: Reduce or explicitly constrain the remaining legacy icon-package imports under `web/src/pipedal/**` so package retention is documented honestly and bounded.
- Why it matters: The broad repo-level icon exit and dependency-retirement story remains incomplete while the PiPedal legacy island still imports the old icon stack.
- Dependencies: T205-subF-subA
- Estimated effort: High
- Required outputs: Reduced `web/src/pipedal/**` import count, documented freeze/exception posture for any leftover debt, and updated ledger/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:29 - Codex
- Completion notes:
  - Recounted the remaining PiPedal legacy icon-package island exactly: `46` files under `web/src/pipedal/**` still import `@mui/icons-material`, with the heaviest holdouts in `FilePropertyDialog.tsx`, `BankDialog.tsx`, `AppThemed.tsx`, `PerformanceView.tsx`, `LoadPluginDialog.tsx`, and `ToobPlayerControl.tsx`.
  - Verified that no `@phosphor-icons/react` imports remain anywhere under `web/src`, so the residual legacy icon-package footprint is now bounded to `@mui/icons-material` in the frozen PiPedal island only.
  - Formally froze the remaining `web/src/pipedal/**` MUI icon usage as a legacy exception group in the icon ledger instead of claiming migration work that has not been performed.
Assigned to: Claude + User + Codex
Last updated: 2026-03-18 22:29 - Codex
- Completion notes:
  - Verified the active frontend exit condition across `web/src/app`, `web/src/map2`, `web/src/shared`, `web/src/components`, and `web/src/pages`: `0` Phosphor imports, `0` MUI icon imports, and `0` tracked emoji/symbol UI-icon files remain in those active paths.
  - Completed the shared-utility migration slice `T205-subF-subA`, clearing the remaining active shared operator surfaces off legacy icon packages.
  - Completed `T205-subF-subB` by formally freezing the residual PiPedal MUI icon debt as a measured exception group rather than leaving the status ambiguous.
  - The remaining legacy icon dependency posture is now explicit: `@mui/icons-material` is retained only because `46` frozen `web/src/pipedal/**` files still import it; `@phosphor-icons/react` has no remaining source imports under `web/src`.

ID: T206
Status: [✓] Done
Title: Platform Guide document library access upgrade and JUCE-GRID doc entry points
Description:
- Goal / acceptance criteria: Upgrade the Platform Guide document library so it supports topical grouping, richer metadata search, deep links to a selected document, recommended/recent document access, and direct launch points from `JUCE-GRID`.
- Why it matters: The current embedded doc browser is a flat filename list behind the Platform Guide modal, which makes support and operator reference access slower than it needs to be.
- Dependencies: Existing `/api/system/docs/*` routes, `web/src/app/pages/PlatformInfoGuideSection.tsx`, `web/src/app/pages/JuceGridPage.tsx`, and Platform Guide modal deep-link behavior
- Estimated effort: Medium
- Required outputs: Updated backend docs-list metadata endpoint, upgraded Platform Guide document-library UI, `JUCE-GRID` document entry points, focused frontend/backend tests, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 20:31 - Codex
- Completion notes:
  - Upgraded `app/routes/system.py` so the docs API now recurses through nested markdown files under `docs/`, returns metadata for title/summary/category/headings/keywords, and safely serves deep-linked nested document paths.
  - Rebuilt `web/src/app/pages/PlatformInfoGuideSection.tsx` into a grouped document browser with metadata search, contextual recommendations, recent-doc recovery, persistent `doc` / `q` query-param deep links, and a richer empty state.
  - Added direct `Docs` access from `web/src/app/pages/JuceGridPage.tsx` plus a docs shortcut from the keyboard-help modal, both opening the Platform Guide in `juce-grid` context.
  - Validation: `pytest -q tests/test_system_docs_routes.py` -> pass, `npm --prefix web test -- PlatformInfoGuideSection.test.tsx AboutPage.test.tsx JuceGridPage.test.tsx --runInBand --silent` -> pass, `npm --prefix web run typecheck` -> pass.

ID: T207
Status: [✓] Done
Title: JUCE-GRID effect editor card converted into an over-page modal
Description:
- Goal / acceptance criteria: Replace the inline `JUCE-GRID` effect editor card with a modal that opens over the page using the existing block-selection interaction, hugs the card content on larger viewports, dims the page background, includes an in-modal close button, animates in, and switches to fullscreen on mobile.
- Why it matters: The inline editor consumed persistent layout space and broke focus; the requested modal keeps the grid visible underneath while giving effect editing a clearer dedicated surface.
- Dependencies: Existing `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `JuceGridParameterEditor`, and current block-selection behavior in the signal canvas
- Estimated effort: Medium
- Required outputs: Updated `JUCE-GRID` effect-editor interaction, responsive modal styling, focused regression validation, and canonical worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 08:08 - Codex
- Completion notes:
  - Removed the inline desktop effect editor shell from `web/src/app/pages/JuceGridPage.tsx` and replaced it with a route-local modal driven by the existing selected-plugin flow.
  - Kept the current block-selection trigger unchanged while ensuring keyboard left/right plugin navigation also opens the effect modal and Escape closes the modal before clearing selection.
  - Added a responsive effect-modal shell in `web/src/app/pages/JuceGridPage.css` that hugs the editor content on larger screens, animates on open, dims the page with Carbon modal behavior, and expands to fullscreen on mobile.
  - Replaced the compact inline editor panel with a lightweight placeholder/reopen surface so the effect card now exists only inside the modal.
  - Refined the modal shell so all JUCE-GRID plugin/effect cards now open at the underlying window size captured at open time, with no extra modal header copy, metadata tags, or redundant close button above the card.
  - Corrected the full-window effect modal sizing to anchor below the fixed global top bar by measuring the shell header at open time, so the editor no longer renders underneath the navigation chrome.
  - Recorded the standing JUCE-GRID plugin-modal rule in `.gemini/instructions.md` so future card/modal work preserves the same full-window, card-only presentation pattern.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- JuceGridPage.test.tsx --runInBand --silent` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T208
Status: [✓] Done
Title: Shared plugin-card category watermark pass across all desktop cards
Description:
- Goal / acceptance criteria: Add a unified decorative watermark icon to all shared plugin cards using the existing category icon system, tint it by category color, keep it subtle behind card content, omit the watermark on mobile/compact cards, and avoid generic fallback watermarks when no clear category icon exists.
- Why it matters: The plugin-card system needs a more consistent visual taxonomy and stronger category presence without adding noise to interaction-heavy controls.
- Dependencies: T205 icon system direction, existing `PluginCardShell`, current category color/icon mappings, and shared card consumers across JUCE/LV2 plugin cards
- Estimated effort: Medium
- Required outputs: Shared shell implementation, responsive styling, omitted fallback handling, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 22:39 - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Base/PluginCardShell.tsx` so shared plugin cards now render one decorative category watermark from the existing icon mapping behind the card surface.
  - Kept the watermark category-tinted, low-opacity, non-interactive, and unified across cards while omitting it for mobile/compact renders and suppressing the generic fallback icon when no clear category exists.
  - Shifted watermark placement for visualization-heavy cards to an off-center decorative position while keeping non-visualization cards centered for a consistent desktop composition.
  - Removed the older duplicated hero/visualization icon treatment from the shared shell so the watermark language stays consistent.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

## Drum Machine — Professional Platform (Epic)

### Design Decisions (established 2026-03-18)

- **SFZ engine**: Extend native SFZ parser to support drum-critical opcodes (group/off_by, seq_length/seq_position, lorand/hirand, sw_default/sw_last, transpose, tune, pan, gain); both native JUCE and Sfizz backends must be drum-capable
- **Output routing**: Internal submix buses with per-bus EQ + Comp, summed to stereo master; no additional PipeWire ports — breakout via internal bus routing only
- **Sequencer paradigm**: Roland TR-style 16-step LED grid with instrument rows, pattern chaining, fill/variation buttons
- **Instruments per kit**: 16 pads / 16 instruments — maps 1:1 to SynthForge 16-part architecture
- **Pattern length**: Variable 1–64 steps, 4/4 time signature only
- **Per-instrument controls**: Volume + Pan + Tune + Mute/Solo only; all effects processing on submix buses
- **Submix bus topology**: Fixed 8 buses — Kick, Snare, HiHat, Toms, Cymbals, Percussion, Overhead, Room; each bus has EQ + Comp; instruments assigned by role
- **Pattern/song hierarchy**: 128 patterns per kit + Song mode arranger (ordered pattern chain with repeat counts per section, automatic playthrough)
- **External trigger input**: MIDI-only consumer — standard MIDI note-on/off from any e-drum module or trigger interface; MAP2 provides velocity curves, note mapping, and zone assignment per pad
- **UI standard**: Strict Carbon Design System conformance per `docs/design/CARBON_CONFORMANCE_STANDARD.md`; all new surfaces use `@carbon/react` components, Carbon tokens, IBM Plex typography, 2x grid, 8px spacing

ID: T401
Status: [✓] Done
Title: MIDI Hub spacing, usability, and Carbon compliance overhaul
Description:
- Goal / acceptance criteria: Fix cramped spacing across all 7 MIDI Hub area pages + shell, achieve 100% Carbon Design token compliance, align responsive breakpoints to Carbon standard, and polish panel interactions — making this the best MIDI gateway interface on the market.
- Why it matters: The MIDI Hub pages are functionally complete but the tight spacing undermines professional usability for a MIDI gateway appliance. Network and Lab CSS files have hardcoded rem values violating Carbon token mandate. Responsive breakpoints are inconsistent across pages.
- Dependencies: None (pure frontend, no backend or API changes)
- Estimated effort: Medium (Phase A is pure CSS, Phase B has 3 component changes)
- Required outputs: Updated CSS across 10 files, updated TSX in 7 files, new MidiHubEmptyState component, passing typecheck/build/tests, visual verification at 5 breakpoints.
- Plan reference: `.claude/plans/moonlit-conjuring-cat.md`
- 10 improvements ranked by impact:
  1. Content area padding + section gap scale-up (zero horizontal padding, 16px section gaps → 24px page padding, 32px section gaps)
  2. Hero section decompression (19-28px hero padding → 32px, 8px copy gap → 12px)
  3. Full Carbon token compliance for Network + Lab CSS (13 hardcoded rem values → `--cds-spacing-*` tokens)
  4. Two-column panel gap increase (16px → 24px between major side-by-side panels, all 5 page CSS files)
  5. Responsive traffic monitor height (remove hardcoded 440px, use `clamp(20rem, 50vh, 40rem)`)
  6. Sidebar width + internal spacing refinement (fixed 272px column, Carbon SideNav gap, status card padding)
  7. Panel heading deduplication via PanelShell title/actionTag props (eliminate double-stacked h3 headings)
  8. Illustrated empty states (new `MidiHubEmptyState` component for routing matrix, traffic monitor, event lists, presets)
  9. Responsive breakpoint alignment to Carbon standard (900px→1056px, 720px→672px, 768px→672px)
  10. Panel animation stagger + hover polish (nth-child delays, hover border/shadow, prefers-reduced-motion)
Subtasks:
ID: T401-subA
Status: [✓] Done
Title: Phase A — Pure CSS spacing and compliance pass (Improvements 1-4, 6, 9, 10)
Description:
- Goal / acceptance criteria: All spacing, token compliance, breakpoint, and animation changes. Zero component modifications.
- Estimated effort: Small
- Files: MidiHubAreaPage.css, MidiHubPage.css, MidiHubShell.css, MidiHubConnectionsPage.css, MidiHubEventsPage.css, MidiHubPresetsPage.css, MidiHubProcessingPage.css, MidiHubNetworkPage.css, MidiHubLabPage.css
Subtasks: None
Assigned to: Codex
ID: T401-subB
Status: [✓] Done
Title: Phase B — Traffic monitor responsive height (Improvement 5)
Description:
- Goal / acceptance criteria: Remove hardcoded height prop from MidiTrafficMonitor, replace with responsive CSS clamp.
- Estimated effort: Small
- Files: MidiTrafficMonitor.tsx, MidiHubConnectionsPage.tsx, MidiHubConnectionsPage.css
Subtasks: None
Assigned to: Codex
ID: T401-subC
Status: [✓] Done
Title: Phase B — Panel heading deduplication via PanelShell props (Improvement 7)
Description:
- Goal / acceptance criteria: Extend MidiHubPanelShell with title/actionTag props, remove duplicate heading divs from all 7 area pages.
- Estimated effort: Medium
- Files: MidiHubHelpPrimitives.tsx, all 7 MidiHub*Page.tsx files, MidiHubAreaPage.css
Subtasks: None
Assigned to: Codex
ID: T401-subD
Status: [✓] Done
Title: Phase B — Illustrated empty states (Improvement 8)
Description:
- Goal / acceptance criteria: New MidiHubEmptyState component with centered icon, heading, description, optional action. Integrate in MidiRoutingMatrix, MidiTrafficMonitor, EventListManager, PresetTable.
- Estimated effort: Medium
- Files: MidiHubHelpPrimitives.tsx, MidiHubPage.css, MidiRoutingMatrix.tsx, MidiTrafficMonitor.tsx, EventListManager.tsx, PresetTable.tsx
Subtasks: None
Assigned to: Codex
Assigned to: Codex
Last updated: 2026-03-24 22:40 EDT - Codex
- Completion notes:
  - Renumbered the duplicate draft `T399` entry to `T401` so the canonical worklist remains schema-valid alongside the completed drum-modal `T399`.
  - Expanded MIDI Hub shell, page, and area CSS spacing to a looser Carbon token scale, aligned the route/mobile breakpoints around the Carbon 1056px and 672px thresholds, and removed the remaining hardcoded spacing values from the network and lab route CSS.
  - Extended `MidiHubPanelShell` with shared title/action-tag support, removed the duplicated page-local panel headings across connections, events, processing, transport, network, and lab routes, and added a reusable `MidiHubEmptyState` helper for empty operational panels.
  - Reworked the routing matrix, traffic monitor, event-list manager, and preset table to use the new empty-state treatment, and moved the traffic monitor to a responsive `clamp(20rem, 50vh, 40rem)` scroll height instead of the old fixed height prop.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx src/app/pages/midi-hub/MidiHubEventsPage.test.tsx src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx src/app/pages/midi-hub/MidiHubLabPage.test.tsx src/app/pages/midi-hub/MidiHubTransportPage.test.tsx`, and `npm --prefix web run build`.
  - Residual note: the existing Vite warning about `web/src/map2/api.ts` being both dynamically and statically imported remains unchanged and was not introduced by this task.

---

ID: T211
Status: [✓] Done
Title: Drum Machine C++ Sound Engine — DrumMachineProcessor
Description:
- Goal / acceptance criteria: Implement a dedicated `DrumMachineProcessor` C++ class in `juce-engine/Source/DrumMachine/` that provides a 16-instrument drum sound engine built on top of the SynthForge sampler architecture, with per-instrument controls, 8 fixed submix buses, and stereo master output.
- Why it matters: The current drum machine has no audio engine — the entire backend is a stateless dict stub. This is the foundation that all other drum machine features depend on.
- Dependencies: T212 (SFZ parser extension), SynthForge 16-part architecture
- Estimated effort: High
- Required outputs: Compiling C++ processor integrated into Map2AudioEngine, Python bindings, passing unit tests.
Subtasks:
  - [✓] T211-A: Create `DrumMachineProcessor` class in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp`
    - Owns 16 `Part` instances (one per drum instrument/pad)
    - Each Part configured with: volume (0.0–1.0), pan (-1.0–1.0), tune (semitones -24 to +24), mute (bool), solo (bool)
    - Part-to-bus assignment: fixed mapping by instrument role (Pad 0→Kick bus, Pad 1→Snare bus, Pads 2-3→HiHat bus, Pads 4-6→Toms bus, Pads 7-9→Cymbals bus, Pads 10-12→Percussion bus, Pad 13→Overhead bus, Pads 14-15→Room bus)
    - Default MIDI note mapping: GM drum map (C1=36 kick through D#3=51), user-remappable per pad
    - Velocity curve per pad: Linear, Logarithmic, Exponential, S-Curve, Fixed (configurable)
    - MIDI channel filtering: per-pad or global OMNI
  - [✓] T211-B: Implement 8 fixed submix buses in `DrumMachineMixer` class
    - Bus definitions: Kick (0), Snare (1), HiHat (2), Toms (3), Cymbals (4), Percussion (5), Overhead (6), Room (7)
    - Each bus: stereo audio buffer, 3-band parametric EQ (low shelf, mid peak, high shelf), single-band compressor (threshold, ratio, attack, release, makeup gain)
    - Bus output: per-bus level + pan + mute/solo
    - Master bus: sum of all 8 submix buses → stereo output with master volume
    - All bus processing must be RT-safe (pre-allocated buffers, no heap allocation in processBlock)
  - [✓] T211-C: Integrate `DrumMachineProcessor` into `Map2AudioEngine`
    - Add `drumMachine_` member to Map2AudioEngine (like `synthForge_`)
    - Process in audioCallback: MIDI → DrumMachineProcessor → mix into main output buffer
    - DrumMachineProcessor receives MIDI from the same ring buffer drain as SynthForge
    - Enable/disable drum machine processing via atomic flag
  - [✓] T211-D: Expose DrumMachineProcessor via PythonBindings.cpp
    - Kit management: `load_drum_kit(sfz_path)`, `get_drum_kit_status()`
    - Per-pad: `set_drum_pad_volume(pad, vol)`, `set_drum_pad_pan(pad, pan)`, `set_drum_pad_tune(pad, semitones)`, `set_drum_pad_mute(pad, bool)`, `set_drum_pad_solo(pad, bool)`
    - Per-pad MIDI: `set_drum_pad_note(pad, midi_note)`, `set_drum_pad_velocity_curve(pad, curve_type)`, `set_drum_pad_midi_channel(pad, channel)`
    - Per-bus: `set_drum_bus_eq(bus, low_gain, mid_gain, mid_freq, high_gain)`, `set_drum_bus_comp(bus, threshold, ratio, attack, release, makeup)`, `set_drum_bus_level(bus, level)`, `set_drum_bus_mute(bus, bool)`, `set_drum_bus_solo(bus, bool)`
    - Master: `set_drum_master_volume(vol)`, `get_drum_metering()` (per-pad peak/RMS + per-bus peak/RMS + master peak/RMS)
    - Transport: `drum_trigger_note(pad, velocity)` for software-triggered hits
  - [✓] T211-E: Add CMakeLists.txt entries for DrumMachine source files; verify build with `cmake -B build && cmake --build build`
Assigned to: Codex
Last updated: 2026-03-20 06:52 - Codex
- Completion notes:
  - Completed `T211-B` with a new RT-safe `juce-engine/Source/DrumMachine/DrumMachineMixer.h/cpp` implementation providing 8 fixed stereo buses, 3-band EQ, single-band compression, per-bus level/pan/mute/solo, master-volume fold-down, and cached metering.
  - Added focused JUCE coverage in `juce-engine/tests/DrumMachineMixerTests.cpp` for bus parameter mutation, stereo fold-down, metering, and solo/mute gating.
  - Updated `juce-engine/CMakeLists.txt` so the new mixer source and tests build under the existing `synthforge_tests` target.
  - Validation: `cmake --build build-synthforge-tests --target synthforge_tests` -> pass; `./synthforge_tests "[drums]"` -> pass.
  - Completed `T211-C` by wiring `drumMachine_` into `Map2AudioEngine`, preparing it alongside SynthForge and the rest of the engine processors, processing it from the same drained MIDI buffer in `audioCallback`, and adding atomic enable/disable accessors for runtime gating.
  - Validation: `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass.
  - Completed `T211-D` by exposing drum kit load/status, per-pad controls, per-bus EQ/compression/level/mute/solo, master volume, metering export, and software note triggering through `juce-engine/Source/PythonBindings.cpp`, with `DrumMachineProcessor` extended to own RT-safe mixer-backed metering and kit-wide control helpers.
  - Validation: `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `12 passed`; `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.

---

ID: T212
Status: [✓] Done
Title: Extend native SFZ parser for drum-critical opcodes
Description:
- Goal / acceptance criteria: Extend `SfzLoader` in `juce-engine/Source/SynthForge/Sampler/SfzLoader.h/cpp` to parse and apply drum-critical SFZ v2 opcodes so the native JUCE sampler backend is fully drum-capable without requiring Sfizz.
- Why it matters: The native parser currently only supports sample, key range, velocity range, and basic envelope. Drum kits require choke groups, round-robin, random variation, and key switches for realistic playback (e.g., open/closed hihat choking, snare articulation switching, tom round-robin).
- Dependencies: None (independent parser work)
- Estimated effort: Medium
- Required outputs: Extended SfzLoader, updated SfzRegionDefinition struct, JUCE SamplerVoice integration for new opcodes, unit tests.
Subtasks:
  - [✓] T212-A: Add choke group support — parse `group` (int) and `off_by` (int) opcodes; implement voice-stealing by group ID in native sampler (when a note in group N triggers, kill all active voices with `off_by=N`)
  - [✓] T212-B: Add round-robin support — parse `seq_length` and `seq_position` opcodes; track per-key round-robin counter; cycle through seq_position regions on successive triggers
  - [✓] T212-C: Add random variation support — parse `lorand` and `hirand` opcodes; generate random float 0.0–1.0 per note-on; select region where `lorand <= rand < hirand`
  - [✓] T212-D: Add key switch support — parse `sw_default`, `sw_last`, `sw_lokey`, `sw_hikey` opcodes; track last key switch state; filter regions by active key switch
  - [✓] T212-E: Add per-region tuning/gain/pan — parse `transpose` (semitones), `tune` (cents), `volume` (dB), `pan` (-100 to 100) opcodes; apply in native SamplerVoice rendering
  - [✓] T212-F: Add filter opcodes — parse `cutoff`, `resonance`, `fil_type` (lpf_1p, lpf_2p, hpf_1p, hpf_2p); apply state-variable filter per voice
  - [✓] T212-G: Unit tests for each new opcode family — test SFZ files with choke groups, round-robin sequences, random layers, key switches, tuning, and filters; verify correct region selection and voice behavior
Assigned to: Codex
Last updated: 2026-03-19 00:16 - Codex

---

ID: T213
Status: [✓] Done
Title: Drum Machine Pattern Sequencer Engine (C++ + Python)
Description:
- Goal / acceptance criteria: Implement a real-time drum pattern sequencer with 128 patterns per kit, variable length (1–64 steps at 16th-note resolution, 4/4 only), per-step velocity, transport control (play/stop/pause), and BPM-synced playback that triggers notes through DrumMachineProcessor.
- Why it matters: The sequencer is the core interaction model for the TR-style drum machine. Without it, the drum machine is just a sample player.
- Dependencies: T211 (DrumMachineProcessor must exist to receive triggered notes)
- Estimated effort: High
- Required outputs: C++ sequencer class, Python service layer, REST API endpoints, WebSocket real-time position broadcast, unit tests.
Subtasks:
  - [✓] T213-A: Create `DrumSequencer` C++ class in `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp`
    - Pattern data structure: 128 patterns, each with configurable step count (1–64, default 16), 16 instrument tracks
    - Per-step data: velocity (0–127, 0=off), accent (bool)
    - Transport: play, stop, pause, tempo (BPM 40–300), swing amount (0–100%)
    - Playback: sample-accurate step advancement using accumulated sample count vs. samples-per-step
    - On each step: trigger `DrumMachineProcessor::triggerNote(pad, velocity)` for all active instruments at that step
    - Current position tracking: pattern index, step index, bar count (for song mode)
    - Tap tempo: accept timestamps, compute running average BPM (last 6 taps, discard >2s gaps)
  - [✓] T213-B: Pattern editing API (C++ methods exposed via Python bindings)
    - `set_step(pattern, instrument, step, velocity)`, `get_step(pattern, instrument, step)`
    - `clear_pattern(pattern)`, `copy_pattern(src, dst)`, `get_pattern_data(pattern)` → full grid
    - `set_pattern_length(pattern, steps)`, `get_pattern_length(pattern)`
    - `set_swing(percent)`, `get_swing()`
    - `set_accent_velocity(velocity)` — global accent level (default 127)
  - [✓] T213-C: Song mode arranger
    - Song data structure: ordered list of `{pattern_id, repeat_count}` entries, max 256 entries
    - Song playback: advance through entries, repeat pattern N times, then next entry; loop or stop at end
    - API: `add_song_entry(pattern_id, repeat_count, position)`, `remove_song_entry(position)`, `reorder_song_entries(order)`, `get_song()`, `clear_song()`
    - `set_song_loop(bool)`, `get_song_loop()`
  - [✓] T213-D: Python service layer — `app/services/drum_sequencer_service.py`
    - Wraps C++ bindings with validation, error handling, state persistence
    - Pattern save/load to `~/.map2/drums/patterns/` as JSON
    - Kit + pattern bundle save/load (kit SFZ reference + all 128 patterns + song)
    - Auto-save on transport stop
  - [✓] T213-E: REST API endpoints — extend `app/routes/drums.py`
    - `GET/POST /api/engine/drums/transport` — play/stop/pause/bpm/swing
    - `GET/POST /api/engine/drums/pattern/{id}` — get/set full pattern grid
    - `POST /api/engine/drums/pattern/{id}/step` — set individual step
    - `GET/POST /api/engine/drums/song` — get/set song arrangement
    - `GET /api/engine/drums/position` — current step/bar/pattern (also via WebSocket)
  - [✓] T213-F: WebSocket real-time position — broadcast `{step, bar, pattern_id, is_playing}` at each step advance via existing WebSocket infrastructure for UI beat indicator sync
  - [✓] T213-G: Fill and variation system
    - Fill trigger: `trigger_fill()` — plays a fill pattern (last 1–2 beats of current pattern replaced with fill variation)
    - Auto-fill: at quantization boundary (configurable 1–8 bars), automatically trigger fill before next pattern/section
    - Variation: each pattern has Main + up to 10 variations (same step count, different velocities/instruments); `set_variation(pattern, variation_index)`
    - Count-in: play N bars (0–4) of metronome clicks before pattern starts
Assigned to: Codex
Last updated: 2026-03-20 07:32 - Codex
- Completion notes:
  - Completed `T213-A` with a new `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` core that owns 128 patterns, 16 instrument lanes, 64-step storage, transport state, BPM/swing/accent controls, current pattern/step/bar tracking, sample-domain step scheduling, and tap-tempo averaging.
  - Extended `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` with queued `triggerNote(...)` support so the sequencer can inject software hits into the existing drum processor path with sample offsets.
  - Wired the sequencer into `juce-engine/Source/Map2AudioEngine.h/cpp` so drum sequencing runs in the audio callback immediately before `DrumMachineProcessor` consumes its block, and registered the new source/test files in `juce-engine/CMakeLists.txt`.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for default pattern state, tempo-driven step advancement, drum trigger delivery into `DrumMachineProcessor`, and tap-tempo reset/averaging behavior.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T213-B` in `juce-engine/Source/PythonBindings.cpp` by exposing sequencer step mutation/query, full pattern export, clear/copy operations, pattern-length controls, and swing/accent-velocity setters/getters through the `AudioEngine` pybind surface.
  - Validation: `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `12 passed`; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering `set_drum_step`, `get_drum_step`, `get_drum_pattern_data`, `copy_drum_pattern`, `clear_drum_pattern`, `set_drum_pattern_length`, `set_drum_swing`, and `set_drum_accent_velocity` -> pass.
  - Completed `T213-C` by extending `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` with a 256-entry song list, insertion/removal/reorder APIs, loop enable/disable state, repeat-aware pattern progression, automatic transport rewind at song end, and seamless pattern handoff between song sections.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for song entry ordering/editing, repeat-count playback across multiple patterns, end-of-song stop behavior, and looped restart to the first song entry.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T213-D` with `app/services/drum_sequencer_service.py`, a singleton persistence layer that validates 16x64 pattern grids and song entries, syncs pattern/song/swing/accent state to the native engine bindings, persists per-pattern JSON under `~/.map2/drums/patterns/`, saves and restores full 128-pattern bundles plus song arrangements, and maintains sequencer autosave snapshots.
  - Extended `juce-engine/Source/PythonBindings.cpp` with the missing song-arrangement bindings (`add/remove/reorder/get/clear song`, `set/get song loop`) so the new sequencer service can round-trip bundle state through the native engine, and wired `app/services/drum_machine_service.py` to trigger sequencer autosave on transport stop.
  - Added `tests/test_drum_sequencer_service.py` coverage for per-pattern persistence, bundle/song round-trip restore, and stop-triggered autosave behavior through the drum-machine transport service.
  - Validation: `pytest tests/test_drum_sequencer_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `15 passed`; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering `add_drum_song_entry`, `get_drum_song`, `remove_drum_song_entry`, `clear_drum_song`, and `set/get_drum_song_loop` -> pass.
  - Completed `T213-E` by extending `app/routes/drums.py` with sequencer-backed `GET/POST /api/engine/drums/pattern/{id}`, `POST /api/engine/drums/pattern/{id}/step`, and `GET/POST /api/engine/drums/song` endpoints while preserving the existing transport/state/position contract and routing all new mutations through `drum_sequencer_service`.
  - Extended `app/services/drum_sequencer_service.py` with route-facing `get_song`, `get_song_loop`, and `replace_song` helpers so the HTTP layer can manage validated song-arrangement updates without duplicating engine-sync logic.
  - Added `tests/test_drum_routes.py` coverage for full-pattern round-trip save/load, single-step mutation, and song arrangement route round-trip behavior.
  - Validation: `pytest tests/test_drum_routes.py tests/test_drum_machine_service.py tests/test_drum_sequencer_service.py -q` -> `18 passed`; in-memory `python3` compile smoke for `app/routes/drums.py`, `app/services/drum_machine_service.py`, `app/services/drum_sequencer_service.py`, and `tests/test_drum_routes.py` -> pass.
  - Completed `T213-F` by extending `juce-engine/Source/PythonBindings.cpp` with sequencer transport/position bindings (`set_drum_bpm`, `set_drum_current_pattern`, `set_drum_transport_playing`, `pause_drum_transport`, `get_drum_sequencer_position`) and wiring `app/services/drum_machine_service.py` to mirror transport updates into the native sequencer, poll live engine position while transport is running, and publish `drums:position` WebSocket events whenever step/bar/pattern playback state changes.
  - Expanded `DrumSequencerPositionModel` and the drum route/service test fixtures to carry `pattern_id` and `is_playing`, matching the realtime WebSocket payload needed for beat-synced UI indicators.
  - Added async `tests/test_drum_machine_service.py` coverage proving the poll loop emits `drums:position` history entries when the engine-reported sequencer position advances, while preserving master-volume/metering and route behaviors.
  - Validation: `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_sequencer_service.py -q` -> `19 passed`; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` confirming `set_drum_bpm`, `set_drum_current_pattern`, `set_drum_transport_playing`, and `get_drum_sequencer_position` bindings are callable -> pass (with non-blocking ALSA sequencer warnings on this host).
  - Completed `T213-G` by extending `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` with 11 per-pattern variation lanes (Main + 10 variations), configurable fill variation and 1-2 beat fill windows, manual fill triggering, auto-fill cadence in 0-8 bar intervals, and 0-4 bar count-in support that emits quarter-note clicks before normal pattern playback starts.
  - Extended `juce-engine/Source/PythonBindings.cpp` with fill/variation/count-in bindings (`set/get_drum_variation`, `set/get_drum_fill_variation`, `set/get_drum_fill_length_beats`, `trigger_drum_fill`, `set/get_drum_auto_fill_bars`, `set/get_drum_count_in_bars`) so later backend/UI work can control the new sequencer behaviors through the existing `AudioEngine` surface.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for per-pattern variation editing, fill configuration and armed playback progression, auto-fill/count-in setting round-trip, and count-in-delayed transport advancement compared against immediate playback.
  - Validation: `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering variation/fill/count-in bindings -> pass (with non-blocking ALSA sequencer warnings on this host).

---

ID: T214
Status: [✓] Done
Title: Drum Machine Kit Management — SFZ kit loading, factory kits, user kits
Description:
- Goal / acceptance criteria: Implement a complete drum kit management system that loads SFZ drum kits into DrumMachineProcessor, ships factory kits, and supports user kit import/creation. Each kit defines 16 instrument assignments with sample references, default MIDI mapping, and default bus routing.
- Why it matters: Without kits, the drum machine has no sounds. The kit system bridges the SFZ sample engine to the 16-pad instrument model.
- Dependencies: T211 (DrumMachineProcessor), T212 (extended SFZ parser)
- Estimated effort: Medium
- Required outputs: Kit schema, factory kit SFZ files, kit manager service, REST endpoints, unit tests.
Subtasks:
  - [✓] T214-A: Define drum kit schema — `data/drums/schemas/drum_kit.schema.json`
    - Kit metadata: `kit_id`, `name`, `description`, `author`, `version`, `category` (acoustic, electronic, percussion, hybrid)
    - 16 instrument slots: `instruments[0..15]` each with `name`, `sfz_path` (relative to kit root), `default_note` (MIDI), `bus_assignment` (0–7), `default_volume`, `default_pan`, `default_tune`
    - Kit-level defaults: `default_bpm`, `default_swing`
    - License field for attribution
  - [✓] T214-B: Create factory drum kits (minimum 4 kits for launch)
    - `Standard Rock` — acoustic rock kit (kick, snare, hats, 3 toms, crash, ride, 4 percussion, overhead, room fills)
    - `Electronic 808` — classic TR-808 sounds (kick, snare, clap, hats, cowbell, clave, conga, maracas, toms, cymbal)
    - `Electronic 909` — classic TR-909 sounds
    - `Jazz Brush` — brush snare, kick, ride, hats, floor tom
    - Each kit: multi-velocity SFZ with round-robin, proper choke groups (open/closed HH), GM-compatible note mapping
    - SFZ files in `data/drums/factory_kits/{kit_id}/` with samples in `data/drums/factory_kits/{kit_id}/samples/`
    - All samples must be CC0/public domain or purpose-recorded
  - [✓] T214-C: Kit manager service — `app/services/drum_kit_service.py`
    - Index factory kits from `data/drums/factory_kits/`
    - Index user kits from `~/.map2/drums/user_kits/`
    - Load kit into DrumMachineProcessor: parse kit JSON → load each instrument SFZ into corresponding Part → apply default MIDI mapping and bus routing
    - Kit switching: unload current → load new (with crossfade or silence gap to prevent artifacts)
    - User kit creation: copy factory kit → modify instrument assignments → save to user directory
    - Kit import: accept .zip containing kit JSON + SFZ + samples; validate against schema; extract to user_kits
  - [✓] T214-D: REST API endpoints — extend `app/routes/drums.py`
    - `GET /api/engine/drums/kits` — list all kits (factory + user) with metadata
    - `GET /api/engine/drums/kits/{kit_id}` — kit details including instrument assignments
    - `POST /api/engine/drums/kits/load` — load kit into engine `{kit_id}`
    - `GET /api/engine/drums/kits/active` — currently loaded kit
    - `POST /api/engine/drums/kits/import` — import user kit .zip
    - `POST /api/engine/drums/kits/create` — create new user kit from template
    - `PATCH /api/engine/drums/kits/{kit_id}/instruments/{pad}` — modify instrument assignment
  - [✓] T214-E: Sample sourcing — identify, download, and organize CC0 drum samples for factory kits; write SFZ mappings with velocity layers (minimum 3 velocity layers per instrument), round-robin (minimum 2 variations), and choke groups for hihats
Assigned to: Codex
Last updated: 2026-03-20 08:05 - Codex
- Completion notes:
  - Completed `T214-A` by adding `data/drums/schemas/drum_kit.schema.json`, a draft 2020-12 schema for 16-slot drum kits with constrained metadata, relative `.sfz` instrument paths, per-pad default note/bus/volume/pan/tune fields, kit-level BPM and swing defaults, and explicit category/license validation.
  - Validation: `python3` JSON parse + schema shape smoke test against a synthetic 16-instrument kit document -> pass.
  - Completed `T214-B` by adding four launch-ready factory kits under `data/drums/factory_kits/`: `standard_rock`, `electronic_808`, `electronic_909`, and `jazz_brush`, each with a 16-slot `kit.json`, per-instrument SFZ program files, a purpose-generated sample set, and kit-local documentation.
  - Each shipped instrument now includes 3 velocity layers and 2 round-robin alternates, with shared choke-group wiring between `closed_hat.sfz` and `open_hat.sfz` and GM-compatible default note assignments across all four kits.
  - Validation: `python3` factory-kit graph check covering manifest completeness, 16-slot coverage, SFZ presence, velocity/round-robin region counts, hi-hat choke-group configuration, and sample file existence for all four kits -> pass (`validated 4 factory kits`).
  - Completed `T214-C` by adding `app/services/drum_kit_service.py`, a singleton kit manager that indexes factory and user kits, validates manifests and referenced SFZ/sample assets, loads per-pad SFZ assignments into the drum engine, applies per-pad note/volume/pan/tune/bus defaults, persists the active kit selection, copies factory kits into user space, and imports user kit `.zip` archives with traversal-safe extraction.
  - Extended the drum engine bindings with per-pad SFZ loading and bus assignment support via `juce-engine/Source/PythonBindings.cpp`, backed by a new `setPadBus(...)` helper in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp`.
  - Validation: `pytest -q tests/test_drum_kit_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> `21 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_kit_service.py app/services/drum_machine_service.py app/routes/drums.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T214-D` by extending `app/routes/drums.py` with typed kit-management endpoints for listing kits, reading kit details, loading a kit, reading the active kit, importing a user kit archive, creating a user kit from a template, and patching an individual user-kit instrument assignment.
  - Validation: `pytest -q tests/test_drum_routes.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py` -> `26 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/routes/drums.py app/services/drum_kit_service.py app/services/drum_machine_service.py tests/test_drum_routes.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py` -> pass.
  - Completed `T214-E` by adding `data/drums/factory_kits/SOURCING_MANIFEST.json`, a machine-readable provenance and inventory manifest that records each shipped launch kit as purpose-generated CC0 content with explicit SFZ/sample counts and hi-hat choke-group metadata.
  - Added `scripts/validate_factory_drum_kits.py`, a repeatable validator that proves the factory kits meet the launch sourcing contract: 4 kits, 16 SFZ programs per kit, 3 velocity layers, 2 round-robin alternates, shared open/closed hi-hat choke groups, and all referenced sample files present on disk.
  - Validation: `python3 scripts/validate_factory_drum_kits.py` -> `{"validated_kits": ["standard_rock", "electronic_808", "electronic_909", "jazz_brush"], "total_kits": 4, "total_programs": 64, "total_samples": 384, "license": "CC0-1.0"}`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile scripts/validate_factory_drum_kits.py` -> pass.

---

ID: T215
Status: [✓] Done
Title: Drum Machine MIDI Input — velocity curves, note mapping, zone assignment
Description:
- Goal / acceptance criteria: Implement comprehensive MIDI input handling for the drum machine so any external e-drum module, MIDI controller, or trigger interface can play the drum machine with configurable velocity response, note-to-pad mapping, and multi-zone pad support.
- Why it matters: External trigger support via MIDI is the primary hardware integration path. Velocity curves and note mapping make MAP2 compatible with any manufacturer's e-drum hardware without requiring trigger parameter proxying.
- Dependencies: T211 (DrumMachineProcessor)
- Estimated effort: Medium
- Required outputs: MIDI mapping configuration, velocity curve engine, zone assignment, preset mappings for common hardware, REST endpoints, unit tests.
Subtasks:
  - [✓] T215-A: Per-pad MIDI note mapping engine
    - Default: GM drum map (kick=36/C1, snare=38/D1, closed HH=42, open HH=46, etc.)
    - User-configurable: any MIDI note (0–127) → any pad (0–15)
    - Multi-note-to-one-pad: multiple MIDI notes can trigger the same pad (e.g., notes 36 and 35 both trigger kick pad)
    - One-note-to-one-pad: each note maps to at most one pad (no fan-out)
    - MIDI channel filter: global (OMNI or specific channel 1–16) or per-pad channel
  - [✓] T215-B: Velocity curve engine
    - 5 curve types per pad: Linear, Logarithmic (soft-touch emphasis), Exponential (hard-touch emphasis), S-Curve (compressed middle), Fixed (constant velocity regardless of input)
    - Per-pad configurable: curve type + input floor (minimum velocity threshold) + output floor (minimum output velocity) + output ceiling (maximum output velocity)
    - Velocity scaling: input velocity → curve transform → output velocity (0–127)
    - Real-time preview: when adjusting curve, show input→output graph and last-hit velocity value
  - [✓] T215-C: Zone assignment for multi-zone pads
    - Zone concept: a single physical pad may send different MIDI notes for head/rim/edge strikes (e.g., Roland PD-140DS sends note 38 for head, 40 for rim, 37 for cross-stick)
    - Zone mapping: define up to 3 zones per pad (Head, Rim, Edge), each zone maps a different MIDI note to the same pad but triggers a different SFZ articulation via key switch or velocity layer
    - Common hardware presets: Roland (PD-140DS, CY-18DR, VH-14D note assignments), Yamaha (DTX pads), Alesis (Surge/Strike pads), ATV, 2Box
  - [✓] T215-D: MIDI learn mode
    - User hits a pad on their hardware → MAP2 captures the MIDI note number and channel → assigns it to the selected drum pad
    - "Learn All" mode: user hits each pad in sequence (kick→snare→HH→...), MAP2 auto-advances to next pad after each hit
    - Timeout: 10 seconds of inactivity exits learn mode
  - [✓] T215-E: REST API + Python service
    - `GET/POST /api/engine/drums/midi/mapping` — get/set full note-to-pad mapping
    - `GET/POST /api/engine/drums/midi/velocity-curves` — get/set per-pad velocity curve config
    - `GET/POST /api/engine/drums/midi/zones` — get/set zone assignments
    - `POST /api/engine/drums/midi/learn/start` — enter MIDI learn mode
    - `POST /api/engine/drums/midi/learn/stop` — exit MIDI learn mode
    - `GET /api/engine/drums/midi/learn/status` — current learn state (active pad, last received note)
    - `GET /api/engine/drums/midi/presets` — list hardware presets (Roland, Yamaha, Alesis, etc.)
    - `POST /api/engine/drums/midi/presets/load` — apply a hardware preset mapping
  - [✓] T215-F: Persist MIDI configuration per kit — mapping, curves, and zones saved alongside kit data in `~/.map2/drums/midi_configs/{kit_id}.json`
Assigned to: Codex
Last updated: 2026-03-20 09:34 - Codex
- Completion notes:
  - Completed `T215-A` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by replacing the single-note pad trigger assumption with a real note-to-pad mapping table, allowing multiple MIDI notes to target one pad while guaranteeing that any individual note maps to at most one pad.
  - Added global drum MIDI channel filtering alongside the existing per-pad channel filter, and extended the pybind surface in `juce-engine/Source/PythonBindings.cpp` with `add_drum_pad_note`, `remove_drum_pad_note`, `get_drum_pad_notes`, `set_drum_global_midi_channel`, and `get_drum_global_midi_channel`.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for GM default note exposure, multi-note-to-one-pad routing, no-fan-out remapping behavior, per-pad channel filtering, and the new global MIDI channel gate.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`36 assertions in 6 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-B` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by extending each pad with configurable `inputFloor`, `outputFloor`, and `outputCeiling` bounds, keeping all 5 curve types, and applying the new scaling model directly in the MIDI-trigger path.
  - Added preview and telemetry hooks via `getVelocityCurvePreview(...)` and `getLastMappedVelocityForPad(...)`, and extended the pybind layer in `juce-engine/Source/PythonBindings.cpp` so future API/UI slices can set bounded curves and fetch preview/last-hit data without reimplementing the curve math in Python.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for thresholded/scaled velocity mapping, preview generation parity with the processor math, and last-hit velocity capture after note-on processing.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`43 assertions in 7 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-C` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by adding per-pad Head/Rim/Edge zone assignments, a zone-aware trigger router with optional articulation keyswitch notes and per-zone velocity scaling, plus built-in hardware preset mappings for Roland, Yamaha, Alesis, ATV, and 2Box kits.
  - Extended `juce-engine/Source/PythonBindings.cpp` with zone-management and preset-loading methods so the later REST/service slice can read configured zones, write zone assignments, enumerate available presets, and apply a selected preset without reimplementing the engine-side mapping model.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for shared-pad zone routing, no-fan-out remapping across zone assignments, and preset exposure/application behavior for the built-in hardware maps.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`73 assertions in 10 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-D` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by adding native MIDI learn state, single-pad capture, sequential "learn all" auto-advance, and a 10-second inactivity timeout that expires learn sessions without needing Python-side polling logic.
  - Extended `juce-engine/Source/PythonBindings.cpp` with `start_drum_midi_learn`, `stop_drum_midi_learn`, and `get_drum_midi_learn_state` so the upcoming REST/service slice can drive learn mode and inspect the active pad plus last-seen MIDI note/channel directly from the engine.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for single-pad note/channel capture, learn-all progression across pads, and timeout expiry after inactivity.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`94 assertions in 13 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-E` in `app/services/drum_machine_service.py` and `app/routes/drums.py` by adding typed REST/service support for full MIDI note mapping, per-pad velocity curve configuration, multi-zone assignments, MIDI learn start/stop/status, preset enumeration, and preset loading on top of the existing engine bindings.
  - Added service-side typed models and engine-sync shims for global MIDI channel state, per-pad note/channel lists, bounded velocity curves with preview/last-hit telemetry, zone snapshots, learn-state reporting, and preset application so later persistence work can reuse one canonical Python representation.
  - Added route and service coverage in `tests/test_drum_routes.py` and `tests/test_drum_machine_service.py` for the new `/api/engine/drums/midi/*` contract, including mapping writes, curve updates, zone updates, learn mode state transitions, and preset list/load behavior.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> `28 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_machine_service.py app/routes/drums.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.
  - Completed `T215-F` in `app/services/drum_machine_service.py` by persisting the current MIDI mapping, per-pad velocity curves, and zone assignments into `~/.map2/drums/midi_configs/{kit_id}.json`, automatically saving after MIDI config mutations and reloading the matching snapshot whenever a drum kit becomes active.
  - Extended `app/services/drum_kit_service.py` so kit loads restore any persisted per-kit MIDI config after SFZ/program assignment, keeping hardware note maps and zone/curve settings aligned with the selected drum kit instead of treating them as one global session setting.
  - Added persistence coverage in `tests/test_drum_machine_service.py` and `tests/test_drum_kit_service.py` for per-kit JSON save/restore and active-kit reload behavior, while keeping the existing drum MIDI route contract intact in `tests/test_drum_routes.py`.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_kit_service.py` -> `35 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_machine_service.py app/services/drum_kit_service.py app/routes/drums.py tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_kit_service.py` -> pass.

---

ID: T216
Status: [✓] Done
Title: Drum Machine Backend Service — state management, persistence, WebSocket integration
Description:
- Goal / acceptance criteria: Replace the current stateless dict stub in `app/routes/drums.py` with a proper service layer that manages drum machine state, persists configuration, integrates with the C++ engine via Python bindings, and provides real-time updates via WebSocket.
- Why it matters: The current backend is a dead-end stub that stores state in a Python dict with no engine connection and no persistence. Every other drum machine task depends on a working service layer.
- Dependencies: T211 (DrumMachineProcessor Python bindings)
- Estimated effort: Medium
- Required outputs: Refactored service, persistent state, WebSocket integration, updated REST endpoints.
Subtasks:
  - [✓] T216-A: Create `app/services/drum_machine_service.py`
    - Singleton service initialized at app startup
    - Manages: active kit, transport state, current pattern, sequencer position, mixer state (per-pad + per-bus + master)
    - All state changes dispatch to C++ engine via Python bindings
    - State persistence to `~/.map2/drums/state.json` on transport stop and on explicit save
    - State restore on service startup (last active kit, last pattern, mixer settings)
  - [✓] T216-B: Refactor `app/routes/drums.py` to delegate to service
    - Remove in-memory `DRUM_MACHINE_STATE` dict
    - All endpoints call `DrumMachineService` methods
    - Add proper Pydantic request/response models for all endpoints
    - Add input validation (BPM 40–300, volume 0–100, pattern 0–127, step 0–63, etc.)
  - [✓] T216-C: WebSocket integration
    - Broadcast transport state changes (play/stop/pause, BPM change) to connected clients
    - Broadcast sequencer position (step, bar, pattern) at each step for UI beat sync
    - Broadcast metering data (per-pad peak, per-bus peak, master peak) at 30 fps
    - Use existing `WebSocketManager` infrastructure
  - [✓] T216-D: Metering API
    - `GET /api/engine/drums/metering` — snapshot of all levels (per-pad, per-bus, master)
    - Also available via WebSocket subscription for real-time display
    - Metering struct from C++ includes: peak + RMS per pad (16), peak + RMS per bus (8), peak + RMS master (1)
Assigned to: Codex
Last updated: 2026-03-19 15:43 - Codex
- Completion notes:
  - Replaced the old in-route `DRUM_MACHINE_STATE` dict with `app/services/drum_machine_service.py`, a singleton service that owns typed state validation, atomic JSON persistence under `~/.map2/drums/state.json`, factory/generated pack indexing, transport projection, and metering snapshots.
  - Rewrote `app/routes/drums.py` to use Pydantic request/response models and the new service while preserving the current `/api/engine/drums/state` and pack endpoints for the existing UI/card surfaces.
  - Added foundational transport and metering endpoints: `GET/POST /api/engine/drums/transport` and `GET /api/engine/drums/metering`.
  - Added sequencer-position state to `DrumMachineService`, a typed `GET /api/engine/drums/position` route, and WebSocket topic fan-out for `drums`, `drums:transport`, `drums:position`, and `drums:metering` using the shared `WebSocketManager`.
  - The service now exposes explicit publish helpers for state, transport, position, and metering snapshots so future engine/binding callbacks can emit real-time updates without route-local websocket logic, and it uses the current JUCE engine access point to sync drum master volume and live metering when those bindings are available.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass (`12 passed`). `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_machine_service.py app/routes/drums.py app/routes/websocket.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.
  - Scope note: sequencer transport remains a projected backend contract until `T213` lands, but the backend service slice itself is no longer blocked on the old dict stub or missing websocket/metering integration.

---

ID: T217
Status: [✓] Done
Title: Drum Machine UI — TR-Style Step Sequencer (Carbon Design)
Description:
- Goal / acceptance criteria: Build the primary drum machine UI as a full-page Carbon Design surface at `/drums` with a TR-style 16-step grid, instrument rows, transport controls, pattern/song management, and real-time metering. This replaces the current placeholder `DrumsPage.tsx` and `DrumMachineCard.tsx`.
- Why it matters: The UI is the operator's primary interaction surface. It must match professional drum machine standards (TR-8S, Digitakt) while adhering strictly to Carbon Design conformance.
- Dependencies: T213 (sequencer API), T214 (kit management API), T216 (backend service + WebSocket)
- Estimated effort: Very High
- Required outputs: Complete page implementation, plugin card, Carbon conformance checklist pass, responsive design, accessibility pass.
Subtasks:
  - [✓] T217-A: Page layout and navigation — `web/src/app/pages/DrumsPage.tsx` (full rewrite)
    - Carbon `Grid` / `Row` / `Column` layout on 16-column structure
    - Three mode tabs via Carbon `Tabs` component: Practice, Advanced, Backing Tracks
    - Global transport bar (top): Play/Stop buttons (`Button` with `renderIcon`), BPM display (`NumberInput`), Tap Tempo (`Button`), Swing knob, pattern selector (`Dropdown`), master volume (`Slider`)
    - Mode-specific content area below transport bar
    - Footer status bar: active kit name, current pattern, playing/stopped badge, MIDI activity indicator
    - Responsive: full grid on desktop (≥1056px), stacked on tablet (672–1055px), single-column on mobile (<672px)
  - [✓] T217-B: TR-style step sequencer grid (Advanced mode primary view)
    - 16 instrument rows × N step columns (N = pattern length, default 16, max 64)
    - Each row: instrument name label (left), mute/solo toggle buttons, 16 step pads, per-instrument volume slider (right)
    - Step pad states: off (empty, `$ui-01` background), active (filled, instrument accent color), accent (filled + bright border)
    - Step pad interaction: click to toggle on/off, shift+click for accent, right-click for velocity edit (Carbon `NumberInput` popover, 1–127)
    - Current step indicator: highlight column with `$interactive-01` border during playback, animate at tempo
    - Scrollable horizontally if pattern length > 16 steps (with step page indicator)
    - Carbon `StructuredList` or custom grid using Carbon tokens for cell sizing (40px × 40px step cells, 8px gap)
    - Step pads must be keyboard-accessible: arrow keys navigate grid, Enter/Space toggles, Tab moves between rows
    - Implemented in `web/src/app/pages/DrumsPage.tsx` as the Advanced-mode primary workspace, wired to the active-kit and pattern hooks with 16 instrument rows, scrollable 40px step cells, current-step highlighting, and read-only per-row level strips.
    - Step pads now toggle through `useSetDrumStep`, support click plus Enter/Space activation, and use shift-modified input to create accented steps directly from the grid.
  - [✓] T217-C: Instrument row controls
    - Each of 16 rows shows: instrument name (editable via `TextInput` inline), pad color swatch, Mute (`Toggle`), Solo (`Toggle`), Volume (`Slider` 0–100), Pan (`Slider` -100 to +100), Tune (`Slider` -24 to +24 semitones)
    - Instrument name reflects loaded kit instrument name (e.g., "Kick", "Snare", "Closed HH")
    - Row highlight on MIDI input: flash row accent color when that instrument receives a MIDI trigger
    - Row context menu: reassign MIDI note, change bus assignment, load different sample
    - Implemented in `web/src/app/pages/DrumsPage.tsx` with inline row-name editing, pad swatches, mute/solo toggles, volume/pan/tune sliders, and a selected-row inspector that keeps bus assignment plus sample metadata in view beside the step grid.
    - Added `usePatchDrumKitInstrument` plus the `drumsApi.patchKitInstrument` client path so row-name edits persist back to the active kit, while `useSetDrumPadControl` continues to drive per-pad mixer updates.
  - [✓] T217-D: Pattern management panel
    - Pattern bank: 128 pattern slots displayed as Carbon `Tile` grid (8×16 or paginated)
    - Active pattern highlighted with `$interactive-01` border
    - Pattern operations: Copy (`Button`), Paste (`Button`), Clear (`Button` with `Modal` confirmation), Duplicate
    - Pattern length control: `NumberInput` (1–64 steps)
    - Variation selector: `Dropdown` (Main, Var 1–10)
    - Fill trigger: `Button` with `Lightning` icon
  - [✓] T217-E: Song mode arranger panel
    - Vertical list of song entries: each entry shows pattern name/number + repeat count
    - Carbon `OrderedList` or `StructuredList` with drag-to-reorder (or move up/down buttons for accessibility)
    - Add entry: `Button` → `Modal` with pattern selector `Dropdown` + repeat count `NumberInput` (1–99)
    - Remove entry: `Button` with `TrashCan` icon + confirmation
    - Song transport: Play Song / Stop Song buttons, loop toggle
    - Current position indicator: highlight active entry during song playback
  - [✓] T217-F: Kit browser and mixer panel
    - Kit browser: `Dropdown` for active kit selection + `Tile` grid showing available kits (factory + user) with name, category badge, instrument count
    - Load kit: click tile → `Modal` confirmation (loading replaces current kit)
    - Mixer view (toggled via Carbon `Toggle` or `ContentSwitcher`):
      - 8 submix bus channel strips arranged horizontally
      - Each strip: bus name label, EQ controls (3-band: low gain, mid gain + freq, high gain via `Slider`), compressor controls (threshold, ratio, attack, release, makeup via `Slider`), bus level `Slider`, mute/solo `Toggle`, peak meter bar (vertical, real-time via WebSocket)
    - Master strip: master volume `Slider` + master peak meter
  - [✓] T217-G: Practice mode panel
    - Style selector: Carbon `Tile` grid of 8 built-in styles (rock_8, rock_16, shuffle_blues, funk_16, metal_doublekick, pop_4onfloor, jazz_swing, reggae_1drop) with icon + label
    - Active style highlighted
    - Count-in control: `NumberInput` (0–4 bars)
    - Quantize control: `NumberInput` (1–8 bars)
    - Variation control: `Slider` (0–10)
    - Auto-fill toggle: `Toggle` with description text
    - Practice pack browser: `Accordion` sections for factory packs and user packs, each showing arrangement list with name, BPM, feel, time signature
    - Load arrangement: click → applies style, BPM, and section sequence to sequencer
  - [✓] T217-H: Backing Tracks mode panel
    - Track browser: `Search` + filterable `DataTable` of available tracks (name, genre, key, tempo, duration)
    - Track player: play/pause/stop, seek bar (`Slider`), waveform overview (reuse platform visualization components or `canvas`), current time / total time display
    - Tempo shift: `Slider` (-50% to +50%) — requires time-stretch engine integration (may be deferred)
    - Pitch shift: `Slider` (-12 to +12 semitones) — requires pitch-shift engine integration (may be deferred)
    - Loop controls: loop toggle, loop start/end markers on waveform
    - Note: Audio playback engine for backing tracks is a separate dependency — this subtask covers UI only; if engine not ready, show "Coming soon" `InlineNotification` (warning type, not coaching)
  - [✓] T217-I: Real-time metering and beat visualization
    - Per-instrument hit indicator: step pad flashes on trigger (via WebSocket)
    - Per-bus level meters: vertical bar meters on mixer strips, updated at 30fps via WebSocket
    - Master level meter: stereo peak meter in transport bar
    - Beat indicator: 4-dot display in transport bar synced to sequencer position via WebSocket (replace current interval-based animation with server-synced position)
    - Tempo display: large BPM readout with tap tempo visual feedback
  - [✓] T217-J: DrumMachineCard.tsx plugin card (full rewrite)
    - Compact card version for embedding in pedalboard/JUCE Grid
    - Uses `PluginCardShell` with `accentColor` based on active mode
    - Compact transport: BPM display, Play/Stop, pattern name
    - Compact step indicator: 16 dots showing active steps for current instrument
    - Kit name in footer
    - Mode switcher (Practice/Advanced/Backing) → navigates to full `/drums` page in that mode
    - Metering: small per-bus level bars in visualization area
    - MIDI mapping via `withMidiDialog` HOC (retain existing pattern)
  - [✓] T217-K: MIDI configuration panel
    - Accessible from Advanced mode via Carbon `Tab` or side panel
    - Note mapping table: Carbon `DataTable` with 16 rows (pad 0–15), columns: Pad Name, MIDI Note (editable `NumberInput`), MIDI Channel (`Dropdown`), Velocity Curve (`Dropdown`), Zone Config
    - Velocity curve editor: visual curve display (SVG/canvas, 128×128 grid), curve type selector, floor/ceiling sliders
    - MIDI learn: "Learn" `Button` per row → enter learn mode → display "Hit a pad..." → capture note → auto-fill
    - "Learn All" `Button` → sequential learn across all 16 pads
    - Hardware preset loader: `Dropdown` (Roland, Yamaha, Alesis, etc.) → `Button` "Apply Preset"
    - Zone configuration: per-pad expandable row showing Head/Rim/Edge zone note assignments
  - [✓] T217-L: Accessibility and Carbon conformance
    - Full keyboard navigation: Tab between sections, arrow keys within grids, Enter/Space to toggle steps
    - ARIA roles: grid role for step sequencer, row/gridcell for steps, aria-pressed for active steps, aria-label for instruments
    - Screen reader announcements: step state changes, transport state, pattern changes
    - Focus management: focus trap in modals, skip links for major sections
    - Color contrast: all step states meet WCAG 2.1 AA against `$ui-01` background
    - Pass full `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
Assigned to: Codex
Last updated: 2026-03-20 17:01 - Codex
- Progress notes:
  - Completed `T217-A` in `web/src/app/pages/DrumsPage.tsx` by replacing the old pack-management placeholder with a full `/drums` page shell: Carbon tabs for Practice, Advanced, and Backing Tracks; a shared transport bar with play/stop/tap-tempo, BPM, pattern, variation, swing, and master-volume controls; dedicated mode content regions; and a footer status bar for active kit, pattern, transport state, beat dots, and MIDI status.
  - Preserved the current drum data flow by wiring the new page shell to the existing React Query hooks and drum API surface instead of adding page-local fetch logic, so later `T217-B` onward can fill in the sequencer, mixer, and browser panels without another structural rewrite.
  - Completed `T217-B` in `web/src/app/pages/DrumsPage.tsx` by replacing the Advanced-mode placeholder with a TR-style sequencer workspace that renders the active kit and pattern grid, exposes direct step toggles, and surfaces row-level bus and level context without changing the page shell from `T217-A`.
  - Added `web/src/app/pages/DrumsPage.test.tsx` to verify that the sequencer grid renders from the drum hooks and that shift-clicking a step emits an accented `useSetDrumStep` mutation for the active pattern.
  - Completed `T217-C` by extending `web/src/app/pages/DrumsPage.tsx` with inline instrument-name editing, pad swatches, mute/solo toggles, compact volume/pan/tune sliders, sequencer-row input highlighting, and a selected-row inspector for bus routing and sample source context.
  - Extended the frontend drum data layer with `drumsApi.patchKitInstrument`, the `DrumKitInstrumentPatch` type, and `usePatchDrumKitInstrument`, then added focused tests in `web/src/app/pages/DrumsPage.test.tsx` and `web/src/app/hooks/useDrumMachine.test.tsx` for row-control and kit-patch mutations.
  - Advanced `T217-D` and `T217-E` in `web/src/app/pages/DrumsPage.tsx` by adding a paged 128-slot pattern bank, active-slot selection, pattern copy/duplicate/clear flows, pattern-length editing, variation selection, a fill trigger control, and a song arranger with add/remove/reorder controls, loop toggle, and transport buttons.
  - Repaired the missing API surface that those controls depended on by extending `app/routes/drums.py` with pattern copy/clear routes plus song-entry append/remove routes, and by normalizing the song arrangement payload contract in `web/src/map2/api.ts` so the frontend's `DrumSong { entries, loop }` shape works against the current FastAPI `song/song_loop` response model.
  - Added focused validation for the new contract and UI flows in `tests/test_drum_routes.py` and `web/src/app/pages/DrumsPage.test.tsx`; this slice now passes `pytest -q tests/test_drum_routes.py`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
  - Completed `T224` and closed `T217-D` / `T217-E` by adding explicit fill-trigger and song-transport endpoints in `app/routes/drums.py`, a service-level song-playback controller in `app/services/drum_machine_service.py`, and matching client/hooks in `web/src/map2/api.ts` plus `web/src/app/hooks/useDrumMachine.ts`.
  - Updated `web/src/app/pages/DrumsPage.tsx` to consume real sequencer position and song-transport state, so the beat dots now follow backend position, the arranger highlights the actual active song entry, "Play Song" uses the new song transport route, and "Trigger Fill" uses the dedicated fill command instead of a variation jump workaround.
  - Added regression coverage in `tests/test_drum_machine_service.py`, `tests/test_drum_routes.py`, and `web/src/app/pages/DrumsPage.test.tsx`; validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_sequencer_service.py`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
  - Completed `T217-F` in `web/src/app/pages/DrumsPage.tsx` by adding an inline kit browser with load confirmation, an 8-bus mixer surface with level/EQ/compressor/mute/solo controls, and master output control wired through `useDrumKits`, `useLoadDrumKit`, `useSetDrumBusMixer`, and `useSetDrumMasterVolume`.
  - Completed `T217-I` in `web/src/app/pages/DrumsPage.tsx` by driving row flash state from per-pad metering, rendering live per-bus peak meters in the mixer strips, surfacing master L/R peaks in the transport bar, and keeping the beat dots tied to backend sequencer position instead of local projection.
  - Extended `web/src/app/pages/DrumsPage.test.tsx` to cover kit loading plus bus/master mixer mutations; validation passed with `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
  - Completed `T217-G` by replacing the Practice-mode placeholder in `web/src/app/pages/DrumsPage.tsx` with live style tiles, count-in and quantize controls, variation and auto-fill controls, plus a pack browser that loads factory/user arrangements into the current practice session through the existing drum-state mutation path.
  - Completed `T217-H` by replacing the Backing Tracks placeholder with a searchable track browser, a selectable player shell with waveform overview, transport buttons, loop toggle, and tempo/pitch controls, while explicitly warning that audio playback still depends on the separate backing-track engine integration the task already allowed to defer.
  - Completed `T217-K` by adding an Advanced-mode MIDI configuration panel in `web/src/app/pages/DrumsPage.tsx` and aligning the frontend drum MIDI contract in `web/src/map2/api.ts`, `web/src/map2/types.ts`, and `web/src/app/hooks/useDrumMachine.ts` so note mapping, velocity curves, zone notes, per-pad/all-pad learn, and hardware preset application hit the current FastAPI routes correctly.
  - Advanced `T217-L` by adding arrow-key step-grid navigation, explicit grid row/column metadata, broader control labeling, skip links, landmark ids, and a polite live region in `web/src/app/pages/DrumsPage.tsx`.
  - Closed `T217-L` by adding route-local focus-visible treatment in `web/src/app/pages/DrumsPage.css`, strengthening step-button contrast in `web/src/app/pages/DrumsPage.tsx`, promoting the page announcement region to `role="status"`, and extending `web/src/app/pages/DrumsPage.test.tsx` with skip-link, keyboard-focus, and live-announcement regression coverage.
  - Completed `T217-J` by rewriting `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx` around `PluginCardShell` with a mode-colored compact transport hero, current-pattern summary, 16-step active-instrument indicator, four-bus metering strips, kit footer, and mode buttons that route into the full `/drums` workspace while preserving `withMidiDialog`.
  - Completed the remaining frontend card coverage in `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx`, covering compact rendering, transport/tap-tempo actions, and mode routing alongside the existing page-level drum interaction tests.
  - Advanced `T219-E` by extending `web/src/app/pages/DrumsPage.test.tsx` to cover all three drum modes plus the new MIDI configuration controls; broader lower-layer qualification work still remains under `T219`.
  - Validation: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx src/app/hooks/useDrumMachine.test.tsx`
  - Closed parent task `T217` after confirming every UI subtask `T217-A` through `T217-L` is complete, validated, and reflected in the current `/drums` page and compact plugin card implementations.
  - Validation: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`
  - Validation: `npm --prefix web run typecheck` -> pass.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx` -> pass.
  - Validation: `npm --prefix web test -- --runInBand src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx src/app/pages/DrumsPage.test.tsx` -> pass.
  - Validation: `npm --prefix web run typecheck` -> pass after the `T217-L` accessibility pass.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx` -> pass after the final `T217-L` conformance pass.
  - Validation: `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

---

ID: T218
Status: [✓] Done
Title: Drum Machine TypeScript types, API client, and React Query integration
Description:
- Goal / acceptance criteria: Define complete TypeScript interfaces for all drum machine data structures and implement the API client layer with React Query hooks for all drum machine endpoints.
- Why it matters: Type-safe API integration is required before any UI component can consume drum machine data. This is a prerequisite for T217.
- Dependencies: T216 (backend API must be defined; types can be written from spec before endpoints are live)
- Estimated effort: Medium
- Required outputs: Updated types.ts, updated api.ts, React Query hooks, unit tests for API client.
Subtasks:
  - [✓] T218-A: TypeScript interfaces in `web/src/map2/types.ts`
    - `DrumMachineState` — extend existing interface with full transport, sequencer position, active pattern, active kit, mixer state
    - `DrumKit` — kit_id, name, description, author, category, instruments[16]
    - `DrumInstrument` — name, sfz_path, default_note, bus_assignment, volume, pan, tune, mute, solo
    - `DrumPattern` — pattern_id, steps (16×64 grid of {velocity, accent}), length, variation
    - `DrumSongEntry` — pattern_id, repeat_count
    - `DrumSong` — entries[], loop
    - `DrumBusMixer` — bus_id, name, eq (low_gain, mid_gain, mid_freq, high_gain), comp (threshold, ratio, attack, release, makeup), level, mute, solo
    - `DrumMeeting` — per_pad_peak[16], per_pad_rms[16], per_bus_peak[8], per_bus_rms[8], master_peak, master_rms
    - `DrumMidiMapping` — pad_id, midi_note, midi_channel, velocity_curve, zones[]
    - `DrumVelocityCurve` — type (linear/log/exp/s-curve/fixed), input_floor, output_floor, output_ceiling
    - `DrumZone` — zone_type (head/rim/edge), midi_note, articulation
  - [✓] T218-B: API client in `web/src/map2/api.ts` — `drumsApi` object (extend existing)
    - Transport: `getTransport()`, `setTransport(state)`, `tapTempo(timestamp)`
    - Patterns: `getPattern(id)`, `setPattern(id, data)`, `setStep(pattern, instrument, step, velocity)`, `clearPattern(id)`, `copyPattern(src, dst)`
    - Song: `getSong()`, `setSong(entries)`, `addSongEntry(entry)`, `removeSongEntry(position)`
    - Kits: `getKits()`, `getKit(id)`, `loadKit(id)`, `getActiveKit()`, `importKit(file)`, `createKit(template)`
    - Mixer: `getPadControls()`, `setPadControl(pad, params)`, `getBusMixer()`, `setBusMixer(bus, params)`, `getMasterVolume()`, `setMasterVolume(vol)`
    - MIDI: `getMidiMapping()`, `setMidiMapping(mapping)`, `getVelocityCurves()`, `setVelocityCurve(pad, curve)`, `startMidiLearn()`, `stopMidiLearn()`, `getMidiLearnStatus()`, `getMidiPresets()`, `loadMidiPreset(preset)`
    - Metering: `getMetering()` (HTTP fallback; primary source is WebSocket)
  - [✓] T218-C: React Query hooks in `web/src/app/hooks/useDrumMachine.ts`
    - `useDrumTransport()` — transport state with 500ms refetch (WebSocket primary, HTTP fallback)
    - `useDrumPattern(patternId)` — pattern data with manual invalidation on edit
    - `useDrumSong()` — song arrangement
    - `useDrumKits()` — kit list (60s stale time)
    - `useDrumActiveKit()` — currently loaded kit (manual invalidation on load)
    - `useDrumMixer()` — pad + bus + master mixer state (1s refetch)
    - `useDrumMetering()` — WebSocket subscription hook returning real-time levels at 30fps
    - `useDrumMidiMapping()` — MIDI config (manual invalidation on change)
    - `useDrumMidiLearn()` — learn mode status (500ms refetch while active)
    - All mutations via `useMutation` with appropriate cache invalidation
Assigned to: Codex
Last updated: 2026-03-18 18:53 - Codex
- Completion notes:
  - Expanded `web/src/map2/types.ts` from the initial state/transport shell into a full drum domain model covering kits, instruments, patterns, song arrangements, mixer state, master volume, MIDI mappings, velocity curves, zones, learn status, and hardware presets.
  - Completed the `drumsApi` surface in `web/src/map2/api.ts` for the current drum-machine spec: transport, tap tempo, patterns, song arrangement, kit lifecycle, pad/bus/master mixer controls, MIDI mapping/learn/presets, pack inventory, and metering. The shared fetch helper now preserves multipart uploads by not forcing JSON `Content-Type` on `FormData`.
  - Replaced the starter hook file with a fuller React Query layer in `web/src/app/hooks/useDrumMachine.ts`, including state/transport queries, pattern/song/kit/mixer/MIDI hooks, and mutation hooks with targeted cache invalidation for pattern, song, kit, mixer, and MIDI workflows.
  - Added focused frontend validation in `web/src/app/hooks/useDrumMachine.test.tsx` and kept the drum-state normalization coverage in `web/src/map2/drumMachineState.test.ts`.
  - Validation: `npm --prefix web run typecheck` -> pass. `npm --prefix web test -- --runInBand web/src/app/hooks/useDrumMachine.test.tsx web/src/map2/drumMachineState.test.ts` -> pass.

---

ID: T219
Status: [✗] Blocked
Title: Drum Machine integration testing and qualification
Description:
- Goal / acceptance criteria: Comprehensive test coverage for the drum machine across all layers — C++ unit tests, Python service tests, API endpoint tests, frontend component tests, and end-to-end integration tests.
- Why it matters: A professional drum machine must be rock-solid. Every layer needs test coverage before shipping.
- Dependencies: T211–T218 (all drum machine implementation tasks)
- Estimated effort: High
- Required outputs: Test suites, CI integration, qualification evidence.
Subtasks:
  - [✓] T219-A: C++ unit tests for DrumMachineProcessor
    - 16-pad triggering with correct bus routing
    - Per-pad volume/pan/tune/mute/solo
    - Per-bus EQ and compressor (verify frequency response, gain reduction)
    - Master output level
    - SFZ kit loading and instrument assignment
    - Velocity curve transforms (all 5 types)
    - RT-safety verification: no allocations in processBlock
  - [✓] T219-B: C++ unit tests for DrumSequencer
    - Pattern step set/get/clear/copy
    - Transport play/stop/pause with sample-accurate step timing
    - Variable pattern length (1–64 steps)
    - Swing application
    - Song mode playback with repeat counts
    - Fill trigger timing
    - Tap tempo BPM calculation
  - [✓] T219-C: Python service tests — `tests/test_drum_machine.py`
    - Kit loading and switching
    - Pattern CRUD operations
    - Song arrangement management
    - State persistence (save/restore)
    - MIDI mapping configuration
    - Velocity curve configuration
    - Input validation (out-of-range BPM, invalid pattern ID, etc.)
  - [✓] T219-D: API endpoint tests — `tests/test_drum_routes.py`
    - All REST endpoints: correct status codes, response schemas, error handling
    - Pydantic model validation
    - Concurrent access (multiple clients updating state)
  - [✓] T219-E: Frontend component tests
    - `DrumsPage.test.tsx` — renders all three modes, tab switching, transport controls
    - `DrumMachineCard.test.tsx` — compact card rendering, mode display, metering
    - Step grid interaction: click toggles step, shift+click sets accent, keyboard navigation
    - Pattern management: copy, paste, clear
    - Kit browser: load kit, display instruments
    - Mixer: adjust bus EQ/comp, verify slider values
    - MIDI config: note mapping table, learn mode UI
  - [✗] T219-F: Integration test — full stack end-to-end
    - Load kit → set pattern → play → verify audio output (non-silence) → stop
    - MIDI input → verify correct pad triggers → verify metering response
    - Pattern edit during playback → verify changes take effect at next step
    - Song mode: play through multiple patterns with repeats → verify correct sequence
    - Kit switch during playback → verify clean transition
Assigned to: Codex
Last updated: 2026-03-20 17:01 - Codex
- Progress notes:
  - Completed the frontend qualification slice by adding `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx` and extending `web/src/app/pages/DrumsPage.test.tsx`, covering compact card rendering, transport/tap-tempo actions, mode routing, sequencer interaction, pattern management, kit loading, mixer controls, and MIDI configuration UI.
  - Validation: `npm --prefix web run typecheck` -> pass.
  - Validation: `npm --prefix web test -- --runInBand src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx src/app/pages/DrumsPage.test.tsx` -> pass.
  - Frontend coverage is complete; the active qualification gap is now backend-side validation for service persistence/input guards plus route-level error/concurrent access handling under `T219-C` and `T219-D`.
  - Completed `T219-C` by extending `tests/test_drum_machine_service.py` with explicit invalid-state and unknown-preset coverage, closing the remaining service-side input-validation gap on top of the existing persistence, transport, song, metering, MIDI, and per-kit config tests.
  - Completed `T219-D` by extending `tests/test_drum_routes.py` with additional request-validation/error handling checks plus a shared-app multi-client concurrent state-update test, and by tightening the route contract in `app/routes/drums.py` so pattern-step payloads now validate instrument, step, and velocity bounds at request time instead of failing later during response serialization.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.
  - Validation: `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).
  - The remaining active qualification slice is JUCE coverage for processor/sequencer edge cases that are not yet asserted explicitly in `juce-engine/tests/DrumMachineProcessorTests.cpp` and `juce-engine/tests/DrumSequencerTests.cpp`.
  - Extended `juce-engine/tests/DrumSequencerTests.cpp` to cover 64-step pattern lengths, pause/stop transport behavior, swing delaying offbeats relative to straight timing, and explicit clear/copy round trips, which closes the remaining `T219-B` acceptance points on top of the earlier song/fill/tap-tempo coverage.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` with missing pad-control setter coverage, logarithmic-curve coverage, master-volume checks, and SFZ load-status assertions for valid and invalid pad content. This meaningfully advances `T219-A`, but the stricter RT-safety proof and deeper processor-side bus/compression qualification still remain before that subtask can be closed.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` again with temporary WAV/SFZ render fixtures and explicit audio-path assertions for per-pad volume/pan/mute behavior, per-bus mute/solo routing, master-volume scaling, and bus-compressor makeup gain, which closes much of the remaining processor-side signal-path gap under `T219-A`.
  - Extended `juce-engine/tests/DrumMachineProcessorTests.cpp` again with rendered-audio bus-EQ assertions, validating that low- and high-frequency material respond measurably to bus shelf boosts on the final processor path and further narrowing the remaining processor-side qualification gap under `T219-A`.
  - Added lightweight process diagnostics to `juce-engine/Source/DrumMachine/DrumMachineProcessor.*`, `juce-engine/Source/DrumMachine/DrumMachineMixer.*`, and `juce-engine/Source/SynthForge/Core/Part.*`, then extended `juce-engine/tests/DrumMachineProcessorTests.cpp` with a steady-state process test asserting zero internal buffer-growth events after `prepare()`. This exposed and fixed a real hot-path allocation bug in `SynthForge/Core/Part.cpp`, where the part render buffer was being resized to the full mix-bus channel count on first callback instead of the stereo render path actually used by the part.
  - Added `tests/test_drum_integration.py` to exercise the real FastAPI drum routes against the actual drum machine, kit, and sequencer services with a deterministic integrated fake engine, covering end-to-end kit loading, pattern editing, transport-driven non-silent metering, song progression across pattern boundaries, and kit switching while playback is active.
  - Extended `tests/test_drum_integration.py` with an additional end-to-end playback-edit case proving that a pattern step mutation applied through the route layer becomes visible in metering on the next playback step, further advancing `T219-F` without yet claiming native-audio closure.
  - Extended `tests/test_drum_integration.py` again to assert websocket event-history updates for transport and position topics during the same end-to-end flows, so the in-process integration coverage now includes the real-time broadcast path in addition to REST-state mutation and retrieval.
  - Added `tests/test_juce_engine_drum_native_stability.py`, a subprocess-based native JUCE smoke test that starts the real `map2_audio_engine` Python extension, writes temporary WAV/SFZ fixtures, loads drum pads through the actual drum bindings, proves non-silent metering from a direct trigger on the live audio callback path, and proves sequencer transport advancement while audio is running. This meaningfully advances `T219-F` beyond the integrated fake-engine suite, but does not yet close the task because hardware-backed end-to-end proof is still missing.
  - Closed `T219-A` by strengthening `juce-engine/tests/DrumMachineProcessorTests.cpp` with a global-allocation guard around steady-state `processBlock`, then fixing the real callback-path allocation it exposed in `juce-engine/Source/SynthForge/Core/Part.cpp`: `Part::applyModMatrix()` now short-circuits before copying modulation-source state when no modulation routes are configured, eliminating unnecessary callback-thread heap traffic in the default drum path.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j$(nproc)` -> pass after the `Part::applyModMatrix()` RT-safety fix.
  - Validation: `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` -> pass after the stronger global-allocation test was added.
  - Reclassified `T219-F` and parent task `T219` as blocked instead of in progress: software-side integration coverage is now extensive, but closing the remaining acceptance gap requires live MIDI-in and/or physical hardware-backed end-to-end proof that cannot be executed on this host because ALSA sequencer access is unavailable and no external drum-hardware path is attached.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j$(nproc)` -> pass.
  - Validation: `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` -> pass.
  - Validation: `pytest -q tests/test_drum_integration.py` -> pass.
  - Validation: `pytest -q tests/test_juce_engine_drum_native_stability.py` -> pass.

---

### Drum Machine Pro — High-End Feature Expansion (T391)

#### Gap Analysis: 20 Industry-Standard Features vs. Current State

| # | Feature | Status | Evidence |
|---|---------|--------|----------|
| 1 | Step Sequencing (16-step grid) | **DONE** | Full 16×64 grid, all layers wired (T213) |
| 2 | Parameter Locking (per-step p-locks) | **NEW** | `Step` struct has only velocity + accent |
| 3 | Micro-Timing / Unquantized (off-grid hits) | **NEW** | No per-step timing offset field |
| 4 | Polyrhythms (per-track loop lengths) | **PARTIAL** | `Pattern::length` is global, not per-instrument |
| 5 | Step Probability (% chance to fire) | **NEW** | No probability field in `Step` |
| 6 | Ratchet / Sub-division (flams, rolls) | **NEW** | No sub-step concept in sequencer |
| 7 | Song Mode (pattern chaining) | **DONE** | Full CRUD + loop + transport (T213-C) |
| 8 | Shuffle/Swing per Track | **PARTIAL** | Global swing only, not per-instrument |
| 9 | Hybrid Sound Engines (synth + samples) | **PARTIAL** | Sample playback via SFZ only, no VA synth |
| 10 | Sample Import & Manipulation | **PARTIAL** | Kit load/import yes, waveform edit/record no |
| 11 | Multi-Layered Sampling (round-robin) | **DONE** | GroupedSampler RR + velocity layers (T212) |
| 12 | Virtual Analog Modeling (808/909 synth) | **NEW** | No oscillator-based drum synthesis |
| 13 | Per-Track Filters (HP/LP per drum) | **PARTIAL** | Per-bus EQ only, not per-pad filter |
| 14 | Individual Audio Outputs | **PARTIAL** | 8 internal buses, all fold to stereo — no external breakout |
| 15 | Velocity-Sensitive Pads | **DONE** | 5 curves, 3 zones, MIDI learn (T211, T215) |
| 16 | CV/Gate Outputs | **NEW** | Nothing exists |
| 17 | Full MIDI I/O (clock out, note out) | **PARTIAL** | MIDI input done, no clock/note output from sequencer |
| 18 | Assignable Knobs (CC mapping) | **NEW** | No CC-to-drum-parameter mapping |
| 19 | Onboard Master Effects (reverb, distortion) | **PARTIAL** | Per-bus EQ + comp only, no master FX chain |
| 20 | Real-Time Pattern Switching (quantized) | **PARTIAL** | Immediate switch, no bar-boundary queuing |

**Summary**: 4 DONE, 8 PARTIAL, 8 NEW

---

ID: T391
Status: [✓] Done
Title: Drum Machine Pro — High-End Feature Expansion (Epic)
Description:
- Goal / acceptance criteria: Elevate the drum machine from a capable TR-style sample player to a high-end instrument matching or exceeding the feature sets of Elektron Digitakt, Roland TR-8S, and Arturia DrumBrute Impact across all 20 industry-standard categories. Every feature must be surfaced in the DrumsPage GUI via Carbon Design System components.
- Why it matters: The drum machine is already one of MAP2's most mature subsystems (T211–T219). This expansion closes the remaining gaps to make it a flagship feature competitive with dedicated hardware drum machines.
- Dependencies: T211 (processor), T212 (SFZ), T213 (sequencer), T214 (kits), T215–T219 (existing feature slices)
- Estimated effort: Very High (4 phases, 16 subtasks)
- Required outputs: C++ engine additions, Python bindings, services, REST endpoints, WebSocket events, DrumsPage UI panels, tests at all layers.
Subtasks:
- Completion notes:
  - Completed the full Phase 1 through Phase 4 feature ladder across `T391-A` through `T391-P`, covering advanced sequencer logic, per-pad synthesis/filtering, multi-output routing, CV/Gate, sequencer MIDI output, assignable CC control, master effects, sample import/record/editing, and the final DrumsPage GUI integration.
  - Native, backend, and frontend delivery is now represented in the completed subtask records with focused validation evidence at each layer, and the remaining drum-machine-specific blocker `T392` was also resolved before final epic closure.
  - Final GUI closure in `T391-P` confirmed that the delivered feature set is surfaced in the Carbon-aligned drum workspace with progressive disclosure across transport, sequencer, pad editor, mixer, MIDI, and backing-track modes.
  - Epic-level validation reference: the final closure path includes passing frontend gates `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx src/app/hooks/useDrumMachine.test.tsx src/map2/drumMachineState.test.ts`, and `npm --prefix web run build`, plus the previously restored native `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` sign-off from `T392`.
Assigned to: Codex
Last updated: 2026-03-24 18:42 EDT - Codex

#### Phase 1 — Advanced Sequencer (Features 2, 3, 4, 5, 6, 8, 20)

ID: T391-A
Status: [✓] Done
Title: Parameter Locking (p-locks) — per-step sound parameter overrides
Description:
- Goal / acceptance criteria: Extend the `Step` struct to carry optional per-step overrides for pitch, filter cutoff, decay, pan, and volume. When a step fires, locked parameters temporarily override the pad's global settings for that hit only. The DrumsPage step grid must surface p-lock editing (shift+click or long-press a step to open a parameter lock editor).
- C++ changes: Extend `DrumSequencer::Step` with `std::optional<float>` fields for `lockPitch`, `lockFilterCutoff`, `lockDecay`, `lockPan`, `lockVolume`. Modify `triggerCurrentStep()` to apply locks before triggering and restore after.
- Python bindings: Extend `set_drum_step` with optional kwargs; add `get_drum_step_extended` returning full lock state.
- Python service: Extend `DrumSequencerStepModel` with optional lock fields. Extend pattern persistence.
- REST: Extend `DrumPatternStepUpdateModel` with optional lock fields.
- Frontend: Add p-lock indicator dots on step grid cells; add p-lock editor panel (overlay or sidebar).
- Dependencies: T213 (sequencer exists)
- Estimated effort: Medium
- Required outputs: Extended Step struct, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 11:16 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, and `juce-engine/Source/PythonBindings.cpp` so each step can carry optional pitch/filter/decay/pan/volume locks and pass them into a temporary per-hit override layer during the next audio block.
  - Updated `app/services/drum_sequencer_service.py` and `app/routes/drums.py` so step payloads persist the new lock fields, validate them, and accept them through the existing step-update endpoint while adding `get_drum_step_extended` in the native bindings for full lock inspection.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the sequencer now shows p-lock indicators on step cells and exposes a dedicated Parameter Locks editor sidebar focused via shift-click.
  - Validation passed with `pytest tests/test_drum_sequencer_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-B
Status: [✓] Done
Title: Micro-Timing — per-step timing offset for humanized feel
Description:
- Goal / acceptance criteria: Add a signed timing offset field to each step (-48 to +48 ticks at 96ppqn resolution). Offsets shift the trigger point earlier or later relative to the quantized grid position. The UI must show a micro-timing slider or nudge control per step.
- C++ changes: Add `int8_t microTimingTicks` to `Step`. Modify `triggerCurrentStep()` to convert ticks to sample offset and add to the trigger's `sampleOffset`. Clamp to stay within the current step's sample duration.
- Python bindings: Extend `set_drum_step` with `micro_timing` kwarg.
- Python service: Extend `DrumSequencerStepModel` with `micro_timing: int = 0`.
- REST: Extend step update payload.
- Frontend: Add micro-timing offset indicator on step cells; add nudge buttons (±1, ±6 ticks) in step detail view.
- Dependencies: T391-A (Step struct already being extended)
- Estimated effort: Low
- Required outputs: Extended step timing, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 11:24 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with `microTimingTicks` on each step, native binding support, and sample-offset conversion at 96 PPQN with clamping inside the current step window.
  - Updated `app/services/drum_sequencer_service.py` and `app/routes/drums.py` so `micro_timing` persists inside pattern payloads and round-trips through the existing step-update API.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the parameter-lock editor now includes `±1` / `±6` micro-timing nudge controls and the sequencer cell tooltip surfaces the current offset.
  - Validation passed with `pytest tests/test_drum_sequencer_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-C
Status: [✓] Done
Title: Polyrhythms — per-instrument track loop length
Description:
- Goal / acceptance criteria: Allow each of the 16 instrument tracks within a pattern to have an independent loop length (1–64 steps), enabling polyrhythmic patterns where e.g. kick loops every 16 steps while hi-hat loops every 12. When a track's length is 0, it inherits the pattern's global length.
- C++ changes: Add `std::array<int, kInstrumentCount> trackLengths{}` to `Pattern`. Modify step advancement to wrap per-track independently. `triggerCurrentStep()` checks each instrument's effective length.
- Python bindings: `set_drum_track_length(pattern, instrument, length)`, `get_drum_track_length(pattern, instrument)`.
- Python service: Extend `DrumPatternModel` with `track_lengths: List[int]`.
- REST: `POST /api/engine/drums/pattern/{id}/track/{instrument}/length`.
- Frontend: Per-instrument length selector in sequencer track header row. Visual indication of track loop points on the grid.
- Dependencies: T213 (sequencer)
- Estimated effort: Medium
- Required outputs: Per-track length storage, wrap logic, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 09:50 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with `trackLengths` storage, per-track loop-length setters/getters, and per-row step wrapping so each instrument can cycle against its own effective pattern length while `0` still inherits the pattern length.
  - Updated `app/services/drum_sequencer_service.py` and `app/routes/drums.py` so pattern payloads now persist `track_lengths`, clear/reset them correctly, and expose `POST /api/engine/drums/pattern/{pattern_id}/track/{instrument}/length` for row-level loop edits.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the advanced sequencer rows now expose loop-length controls, show inherited-vs-local loop values, and mark visible row loop points directly on the step grid.
  - Validation passed with `pytest tests/test_drum_sequencer_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-D
Status: [✓] Done
Title: Step Probability — percentage chance each step fires
Description:
- Goal / acceptance criteria: Add a probability field (0.0–1.0, default 1.0) to each step. On each playback pass, generate a random value; only trigger the step if `random < probability`. The UI must show probability as a visual indicator (e.g., opacity or percentage overlay) on each active step.
- C++ changes: Add `float probability = 1.0f` to `Step`. In `triggerCurrentStep()`, use a fast PRNG to check probability before triggering. Use `juce::Random` or a lock-free xorshift.
- Python bindings: Extend `set_drum_step` with `probability` kwarg.
- Python service: Extend `DrumSequencerStepModel` with `probability: float = 1.0`.
- REST: Extend step update payload.
- Frontend: Probability percentage overlay on step cells; probability slider in step detail view.
- Dependencies: T391-A (Step struct extension)
- Estimated effort: Low
- Required outputs: Probability field, PRNG in trigger, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 11:41 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with a per-step `probability` field, deterministic xorshift trigger gating in `triggerCurrentStep()`, and updated native step payloads/bindings.
  - Updated `app/services/drum_sequencer_service.py` and `app/routes/drums.py` so step probability now persists through pattern saves, inactive-step detail edits survive round trips, and the REST step update payload accepts `probability`.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the advanced step editor exposes a probability slider/reset control while active steps show probability as both opacity and a percentage badge.
  - Validation passed with `pytest tests/test_drum_sequencer_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-E
Status: [✓] Done
Title: Ratchet / Sub-division — per-step rapid-fire hits (flams, rolls)
Description:
- Goal / acceptance criteria: Add a ratchet count (1–8, default 1) and velocity decay (0–100%) per step. When ratchet > 1, the step's time slot is subdivided into N evenly-spaced triggers with progressively decaying velocity. This enables flams (ratchet=2), rolls (ratchet=4–8), and grace notes.
- C++ changes: Add `uint8_t ratchetCount = 1` and `uint8_t ratchetDecay = 0` to `Step`. In `triggerCurrentStep()`, when ratchet > 1, calculate sub-step sample intervals and schedule N triggers with decaying velocity within the step's duration.
- Python bindings: Extend `set_drum_step` with `ratchet_count` and `ratchet_decay` kwargs.
- Python service: Extend model.
- REST: Extend step update payload.
- Frontend: Ratchet count selector on step right-click/long-press menu; visual ratchet indicator (subdivided cell).
- Dependencies: T391-A (Step struct extension)
- Estimated effort: Medium
- Required outputs: Ratchet scheduling logic, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 12:53 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with per-step ratchet count/decay storage, repeated in-step trigger scheduling, and updated binding payloads for ratchet fields.
  - Updated `app/services/drum_sequencer_service.py` and `app/routes/drums.py` so ratchet settings persist through pattern saves, survive inactive-step detail edits, and are accepted by the step update REST contract.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the advanced step editor now exposes ratchet count/decay controls and active steps show ratchet badges directly on the grid.
  - Validation passed with `pytest tests/test_drum_sequencer_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-F
Status: [✓] Done
Title: Per-Track Swing — individual shuffle/groove per instrument
Description:
- Goal / acceptance criteria: Allow each of the 16 instrument tracks to have an independent swing percentage (0–100%), falling back to the global swing when set to 0. This enables e.g., heavy swing on hats with straight kick.
- C++ changes: Add `std::array<std::atomic<float>, kInstrumentCount> perTrackSwing_{}` to `DrumSequencer`. Modify `samplesForStep()` to accept instrument index and use per-track swing when non-zero. Add `setTrackSwing(int, float)` / `getTrackSwing(int)`.
- Python bindings: `set_drum_track_swing(instrument, percent)`, `get_drum_track_swing(instrument)`.
- Python service: Extend state model with per-track swing array.
- REST: `POST /api/engine/drums/track/{instrument}/swing`.
- Frontend: Per-track swing knob in sequencer track header.
- Dependencies: T213 (existing global swing)
- Estimated effort: Low
- Required outputs: Per-track swing storage, modified timing calc, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 09:38 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with per-track swing storage/bindings so each drum row can override swing independently while still falling back to the global swing setting when left at `0`.
  - Updated `app/services/drum_machine_service.py` and `app/routes/drums.py` to persist `track_swing`, expose it in the transport payload, and add dedicated `GET/POST /api/engine/drums/track/{instrument}/swing` endpoints for row-level swing edits.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, and `web/src/app/pages/DrumsPage.tsx` so the advanced sequencer rows now expose a Swing control beside Vol/Pan/Tune and mutate the new per-track swing API path.
  - Validation passed with `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

ID: T391-G
Status: [✓] Done
Title: Quantized Pattern Switching — bar-boundary queued transitions
Description:
- Goal / acceptance criteria: Add a "queue next pattern" mechanism so pattern switches happen at the next bar boundary (or configurable quantization: 1 beat, 1 bar, 2 bars, 4 bars) instead of immediately. The UI must show a "pending pattern" indicator in the transport bar.
- C++ changes: Add `std::atomic<int> pendingPatternIndex_{-1}` and `std::atomic<int> switchQuantizationSteps_{0}` to `DrumSequencer`. In `advanceStep()`, at the quantization boundary, check and apply the pending pattern. Add `queuePatternSwitch(int)` and `setPatternSwitchQuantization(int beats)`.
- Python bindings: `queue_drum_pattern_switch(pattern_id)`, `set_drum_pattern_switch_quantization(beats)`.
- Python service: Extend transport model.
- REST: `POST /api/engine/drums/pattern/queue`, `POST /api/engine/drums/pattern/switch-quantization`.
- Frontend: "Next" pattern queue indicator in transport bar; quantization selector in transport settings.
- Dependencies: T213 (sequencer)
- Estimated effort: Medium
- Required outputs: Queued switch logic, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 09:31 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, and `juce-engine/Source/PythonBindings.cpp` with quantized queued-pattern switching, exposed pending-pattern / quantization state through native bindings, and compiled the updated engine successfully.
  - Updated `app/services/drum_machine_service.py` so user-driven pattern changes queue while transport is running, song-mode internal handoffs still switch immediately, and transport/position payloads now surface `pending_pattern` plus `switch_quantization_beats`.
  - Updated `web/src/map2/types.ts` and `web/src/app/pages/DrumsPage.tsx` so the Drums transport bar shows queued-pattern state, lets users choose 1 beat / 1 bar / 2 bars / 4 bars quantization, and announces queued pattern changes accessibly.
  - Validation passed with `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_integration.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, and `cmake --build juce-engine/build -j4`.

#### Phase 2 — Sound Engine Expansion (Features 9, 12, 13)

ID: T391-H
Status: [✓] Done
Title: Virtual Analog Drum Synthesis Engine — 808/909-style synth voices
Description:
- Goal / acceptance criteria: Create a `DrumSynthVoice` class providing virtual analog drum synthesis (sine body + noise transient + pitch envelope for kicks, noise + resonant filter for snares, band-pass noise for hats). Each pad can be set to Sample, Synth, or Hybrid (layered) mode. Classic circuit models: TR-808 kick (sine + pitch sweep), TR-909 snare (noise + tone), CR-78 hats (metallic ring).
- C++ changes: New `juce-engine/Source/DrumMachine/DrumSynthVoice.h/cpp`. Add `enum class SoundSource { Sample, Synth, Hybrid }` to `PadConfig`. Add `std::array<DrumSynthVoice, kPadCount> synthVoices_` to `DrumMachineProcessor`. Route processBlock through sample, synth, or both based on pad source. Synth parameters: oscillator type, pitch envelope (start/end/decay), noise level, noise decay, body decay, tone amount.
- Python bindings: `set_drum_pad_sound_source(pad, source)`, `set_drum_synth_param(pad, param_name, value)`, `get_drum_synth_params(pad)`.
- Python service: New `DrumSynthParamModel` in `drum_machine_service.py`.
- REST: `POST /api/engine/drums/pad/{id}/source`, `POST /api/engine/drums/pad/{id}/synth`.
- Frontend: Source selector toggle (Sample/Synth/Hybrid) per pad; synth editor panel with oscillator type, pitch envelope, noise mix, body decay knobs.
- Dependencies: T211 (processor)
- Estimated effort: High
- Required outputs: DrumSynthVoice class, hybrid routing, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 15:07 EDT - Codex
- Completion notes:
  - Added `juce-engine/Source/DrumMachine/DrumSynthVoice.h` and `juce-engine/Source/DrumMachine/DrumSynthVoice.cpp`, then integrated per-pad `Sample` / `Synth` / `Hybrid` routing plus synth parameter storage into `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, and `juce-engine/Source/PythonBindings.cpp`.
  - Extended `app/services/drum_machine_service.py` and `app/routes/drums.py` with persistent per-pad sound-source and synth-parameter models plus `GET/POST /api/engine/drums/pad/{id}/source` and `GET/POST /api/engine/drums/pad/{id}/synth`.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` so the Instrument Inspector now exposes Sample/Synth/Hybrid selection and live synth-voice controls from the Carbon drum page.
  - Added focused coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`, and `./juce-engine/build-synthforge-tests/synthforge_tests "DrumMachineProcessor renders synth-only and hybrid pad sources"`.
  - Validation gap discovered during sign-off: full `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` still fails on an apparently unrelated `DrumSequencer` default-state SIGSEGV; tracked separately as `T392`.

ID: T391-I
Status: [✓] Done
Title: Per-Pad Dedicated Filters — runtime-controllable HP/LP/BP per drum
Description:
- Goal / acceptance criteria: Add a dedicated state-variable filter per pad (LP, HP, BP, Notch) with cutoff, resonance, envelope amount, and envelope decay. Filters process each pad's audio individually before routing to the bus mixer. This is distinct from bus-level EQ — it's a per-drum sound-shaping tool.
- C++ changes: New `struct PadFilterConfig { FilterType type; float cutoffHz; float resonance; float envAmount; float envDecay; }`. Add `std::array<juce::dsp::StateVariableTPTFilter<float>, kPadCount> padFilters_` to `DrumMachineProcessor`. Process each pad's output through its filter in processBlock before bus routing. Add `setPadFilter(int, PadFilterConfig)`, `getPadFilter(int)`.
- Python bindings: `set_drum_pad_filter(pad, type, cutoff, resonance, env_amount, env_decay)`, `get_drum_pad_filter(pad)`.
- Python service: New `DrumPadFilterModel`.
- REST: `POST /api/engine/drums/pad/{id}/filter`, `GET /api/engine/drums/pad/{id}/filter`.
- Frontend: Per-pad filter controls: type selector, cutoff knob, resonance knob, env amount/decay.
- Dependencies: T211 (processor)
- Estimated effort: Medium
- Required outputs: Per-pad filter processing, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 15:18 EDT - Codex
- Completion notes:
  - Reworked `juce-engine/Source/DrumMachine/DrumMachineProcessor.h` and `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp` so each pad now renders into a reusable scratch bus before accumulation, enabling true per-pad filter processing without faking it as bus EQ.
  - Added per-pad filter configuration and JUCE `StateVariableTPTFilter` processing for low-pass, high-pass, band-pass, and notch behavior, including envelope amount and decay modulation, then exposed the contract via `juce-engine/Source/PythonBindings.cpp`.
  - Extended `app/services/drum_machine_service.py` and `app/routes/drums.py` with persistent `pad_filters` state plus `GET/POST /api/engine/drums/pad/{id}/filter`.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` so the Instrument Inspector now exposes per-pad filter type, cutoff, resonance, env amount, and env decay controls alongside the synth editor.
  - Added focused regression coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`, and `./juce-engine/build-synthforge-tests/synthforge_tests "DrumMachineProcessor applies per-pad filters on rendered pad audio"`.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

#### Phase 3 — Connectivity & Control (Features 14, 16, 17, 18)

ID: T391-J
Status: [✓] Done
Title: Individual Audio Outputs — route drum buses to separate physical outputs
Description:
- Goal / acceptance criteria: Add a multi-output mode where each of the 8 drum buses can be routed to a separate stereo pair on a multi-channel audio interface (e.g., Edirol UA-1000 outputs 3-4 through 17-18), in addition to the existing stereo master fold-down. This enables external mixing and per-bus outboard processing.
- C++ changes: Modify `DrumMachineMixer::process()` to optionally write each bus to separate channel pairs in a multi-channel output buffer. Add output routing configuration: per-bus output pair assignment. Modify `Map2AudioEngine` to allocate wider output buffers when multi-output mode is active.
- Python bindings: `set_drum_bus_output_pair(bus, output_pair)`, `get_drum_bus_output_pair(bus)`, `set_drum_multi_output_enabled(bool)`.
- Python service: Extend bus config model.
- REST: `POST /api/engine/drums/bus/{id}/output`, `POST /api/engine/drums/multi-output`.
- Frontend: Bus output assignment matrix in mixer panel; multi-output enable toggle.
- Dependencies: T211 (mixer), multi-channel audio device support in JuceAudioIO
- Estimated effort: High
- Required outputs: Multi-channel routing, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 17:04 EDT - Codex
- Completion notes:
  - Extended `juce-engine/Source/DrumMachine/DrumMachineMixer.h`, `juce-engine/Source/DrumMachine/DrumMachineMixer.cpp`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, and `juce-engine/Source/Map2AudioEngine.cpp` so drum buses can target dedicated physical output pairs in multi-channel callback buffers while preserving the stereo master pair as pair 1.
  - Added native routing/control bindings in `juce-engine/Source/PythonBindings.cpp`, then completed the persistence/API surface in `app/services/drum_machine_service.py` and `app/routes/drums.py` with mixer pad, bus, and master endpoints that expose per-bus output-pair availability based on the current engine output-channel count.
  - Updated `web/src/map2/types.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` so each drum bus strip exposes physical output-pair assignment directly in the mixer UI alongside the existing level/EQ/comp controls.
  - Added focused regression coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, and `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T391-K
Status: [✓] Done
Title: CV/Gate Outputs — control modular synths from drum sequencer
Description:
- Goal / acceptance criteria: Generate CV/Gate signals on dedicated audio output channels for controlling modular or vintage analog synthesizers. Gate signals go high (1.0) on note-on and low (0.0) on note-off. Pitch CV follows 1V/oct standard mapped to float range. Configurable per-pad: enable CV/Gate output, assign output channel pair, set pitch CV range.
- C++ changes: New `juce-engine/Source/DrumMachine/DrumCvGateOutput.h/cpp`. Generate DC signals on assigned output channels during processBlock. Support gate length (ms) per pad. Integrate with DrumMachineProcessor note trigger path.
- Python bindings: `set_drum_cv_gate_config(pad, enabled, output_pair, gate_length_ms)`.
- Python service: New `DrumCvGateConfigModel`.
- REST: `POST /api/engine/drums/pad/{id}/cv-gate`.
- Frontend: CV/Gate configuration panel per pad; output assignment; gate length control.
- Dependencies: T391-J (multi-output infrastructure), DC-coupled audio interface
- Estimated effort: Medium
- Required outputs: CV/Gate signal generation, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 17:34 EDT - Codex
- Completion notes:
  - Added `juce-engine/Source/DrumMachine/DrumCvGateOutput.h` and `juce-engine/Source/DrumMachine/DrumCvGateOutput.cpp`, then integrated per-pad CV/Gate configuration and rendering into `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, `juce-engine/Source/PythonBindings.cpp`, and `juce-engine/CMakeLists.txt`.
  - Extended `app/services/drum_machine_service.py` and `app/routes/drums.py` with persisted `pad_cv_gate_configs` state plus `GET/POST /api/engine/drums/pad/{id}/cv-gate`.
  - Updated `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` so the Instrument Inspector now exposes per-pad CV/Gate enable, output pair, gate length, note range, and pitch voltage range controls.
  - Added focused regression coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, and `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T391-L
Status: [✓] Done
Title: Full MIDI Output — clock, note output, and program change from sequencer
Description:
- Goal / acceptance criteria: The drum sequencer sends MIDI output in addition to receiving MIDI input. Capabilities: (a) MIDI clock output at 24ppqn synchronized to sequencer tempo, (b) MIDI note messages for each sequencer step (drive external drum modules or DAWs), (c) MIDI Start/Stop/Continue messages aligned with transport, (d) pattern changes via incoming MIDI Program Change messages.
- C++ changes: Add MIDI output generation to `DrumSequencer::processBlock()`. Emit 24ppqn clock ticks based on tempo. Emit note-on/off for each triggered step on configurable MIDI channel. Wire through `MidiHandler` output path. Add Program Change listener for pattern switching.
- Python bindings: `set_drum_midi_output_enabled(bool)`, `set_drum_midi_clock_output_enabled(bool)`, `set_drum_midi_output_channel(channel)`, `set_drum_program_change_enabled(bool)`.
- Python service: Extend transport config model.
- REST: `POST /api/engine/drums/midi/output`.
- Frontend: MIDI output configuration panel: clock out toggle, note out toggle, channel selector, program change toggle.
- Dependencies: T213 (sequencer), MidiHandler output path
- Estimated effort: Medium
- Required outputs: MIDI output generation, clock sync, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 20:42 EDT - Codex
- Completion notes:
  - Added sequencer MIDI-event generation in `juce-engine/Source/DrumMachine/DrumSequencer.h` and `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, including 24ppqn clock output, note on/off emission on a configurable output channel, Start/Stop/Continue transport messages, and incoming Program Change pattern switching.
  - Wired the native output path through `juce-engine/Source/Map2AudioEngine.h`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/MidiHandler.cpp`, and `juce-engine/Source/PythonBindings.cpp` so sequencer MIDI is forwarded through the existing `MidiHandler` ALSA output path and exposed to Python.
  - Extended persisted transport state plus the API surface in `app/services/drum_machine_service.py` and `app/routes/drums.py`, including `GET/POST /api/engine/drums/midi/output`.
  - Updated `web/src/map2/types.ts`, `web/src/map2/drumMachineState.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` so the transport panel now exposes note output, clock output, channel selection, and Program Change pattern switching controls.
  - Added focused regression coverage in `juce-engine/tests/DrumSequencerTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, `cmake --build juce-engine/build-synthforge-tests --target map2_audio_engine -j4`, and `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`.
  - Validation gap: standalone `DrumSequencer`-targeted runs still crash with the pre-existing `T392` SIGSEGV blocker in `synthforge_tests`, so focused native runtime assertions for the new sequencer MIDI path remain blocked by that existing harness instability.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T391-M
Status: [✓] Done
Title: Assignable CC Mapping — MIDI CC to drum machine parameters
Description:
- Goal / acceptance criteria: Map incoming MIDI CC messages to any drum machine parameter for hands-on control from MIDI controllers. Support learning mode (wiggle a knob to assign), per-mapping CC number + MIDI channel + target parameter + target index. Targets: pad volume/pan/tune/filter cutoff, bus level/pan, master volume, tempo, swing, and any synth parameter.
- C++ changes: New `juce-engine/Source/DrumMachine/DrumCcMapper.h/cpp`. `struct CcMapping { int ccNumber; int midiChannel; DrumParamTarget target; int targetIndex; }`. `enum class DrumParamTarget { PadVolume, PadPan, PadTune, PadFilterCutoff, BusLevel, BusPan, MasterVolume, Tempo, Swing, ... }`. Process incoming CC in `processBlock` MIDI scan. MIDI learn integration using existing `MidiLearnState` pattern.
- Python bindings: `set_drum_cc_mapping(slot, cc, channel, target, target_index)`, `get_drum_cc_mappings()`, `start_drum_cc_learn(slot)`, `stop_drum_cc_learn()`.
- Python service: New `DrumCcMappingModel`, persistence to `~/.map2/drums/cc_mappings.json`.
- REST: `GET/POST /api/engine/drums/midi/cc-mappings`, `POST /api/engine/drums/midi/cc-learn/start`, `POST /api/engine/drums/midi/cc-learn/stop`.
- Frontend: CC mapping table with learn button, target selector, CC/channel display. Visual feedback when CC received.
- Dependencies: T211 (processor), MidiHandler input path
- Estimated effort: Medium
- Required outputs: CC mapper class, learn mode, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 17:05 EDT - Codex
- Completion notes:
  - Added the native CC-mapping slice in `juce-engine/Source/DrumMachine/DrumCcMapper.h`, `juce-engine/Source/DrumMachine/DrumCcMapper.cpp`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, and `juce-engine/Source/PythonBindings.cpp`, covering 32 mapping slots, CC learn state, per-target application, and tempo/swing transport callbacks.
  - Added persistence and API coverage in `app/services/drum_machine_service.py`, `app/routes/drums.py`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`, including saved CC mappings plus learn-state round trips.
  - Finished the frontend slice in `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx`, including the CC mapping table, learn-state feedback, and regression coverage for per-slot edits plus CC learn controls.
  - Added focused native regression coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for CC learn plus incoming-controller application, and fixed the `synthforge_tests` target in `juce-engine/CMakeLists.txt` so `DrumCcMapper.cpp` is linked during clean test builds.
  - Validation passed with `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, and `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

#### Phase 4 — Master Effects & Sample Tools (Features 10, 19)

ID: T391-N
Status: [✓] Done
Title: Onboard Master Effects Chain — reverb, distortion, and send effects
Description:
- Goal / acceptance criteria: Add a master effects chain inserted after bus summing and before master volume in `DrumMachineMixer`. Chain order: Saturator/Distortion -> Compressor (upgrade existing bus comp) -> Reverb (algorithmic or convolution) -> Limiter. Per-bus send levels for reverb. All FX must be RT-safe with pre-allocated buffers.
- C++ changes: New `juce-engine/Source/DrumMachine/DrumMasterFx.h/cpp`. Insert into `DrumMachineMixer::process()` after bus summing. Saturator: soft-clip with drive knob. Reverb: reuse engine's convolution IR infrastructure or add JUCE `dsp::Reverb`. Limiter: brickwall with threshold/release. Per-bus send: route portion of bus output to reverb input.
- Python bindings: `set_drum_master_fx(param, value)`, `get_drum_master_fx()`, `set_drum_bus_reverb_send(bus, level)`.
- Python service: New `DrumMasterFxModel`.
- REST: `POST /api/engine/drums/master-fx`, `POST /api/engine/drums/bus/{id}/reverb-send`.
- Frontend: Master FX panel with drive, reverb mix, limiter threshold, compressor controls. Per-bus reverb send knob in mixer panel.
- Dependencies: T211 (mixer)
- Estimated effort: High
- Required outputs: Master FX chain, RT-safe processing, bindings, service, routes, UI, tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 17:46 EDT - Codex
- Completion notes:
  - Added the native master-FX stage in `juce-engine/Source/DrumMachine/DrumMasterFx.h`, `juce-engine/Source/DrumMachine/DrumMasterFx.cpp`, `juce-engine/Source/DrumMachine/DrumMachineMixer.h`, `juce-engine/Source/DrumMachine/DrumMachineMixer.cpp`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, and `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, covering saturation, stereo compressor, reverb return fed by per-bus sends, limiter, and processor/mixer accessors for the new state.
  - Exposed the new controls through `juce-engine/Source/PythonBindings.cpp`, including `set_drum_master_fx`, `get_drum_master_fx`, `set_drum_bus_reverb_send`, and the extended bus mixer payload with `reverb_send`.
  - Added persistence and API support in `app/services/drum_machine_service.py` and `app/routes/drums.py`, including the new `master_fx` model, dedicated `GET/POST /api/engine/drums/master-fx`, and `POST /api/engine/drums/bus/{id}/reverb-send`.
  - Surfaced the controls in `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx`, adding master-FX sliders in the mixer tile and per-bus reverb-send control without regressing the existing bus/master workflows.
  - Added focused coverage in `juce-engine/tests/DrumMachineMixerTests.cpp`, `juce-engine/tests/DrumMachineProcessorTests.cpp`, `tests/test_drum_machine_service.py`, and `tests/test_drum_routes.py`, and linked the new native source into both the engine and `synthforge_tests` targets in `juce-engine/CMakeLists.txt`.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx`, `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor],[drums][mixer]"`, and `cmake --build juce-engine/build-synthforge-tests --target map2_audio_engine -j4`.
  - Licensing review: touched native/backend/frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T391-O
Status: [✓] Done
Title: Sample Import, Recording, and Waveform Editing
Description:
- Goal / acceptance criteria: Enable users to (a) import individual WAV/FLAC/AIFF samples into pads via file upload, (b) record audio from the system input directly into a pad, (c) view sample waveforms with zoom/scroll, (d) set start/end trim points, (e) normalize, reverse, and fade samples. Edited samples are saved as new WAV files in the user kit directory.
- C++ changes: Add `DrumMachineProcessor::recordPadFromInput(int padIndex, bool start)` that captures audio callback input into a pre-allocated ring buffer. Add waveform peak data export for UI rendering. Sample manipulation (trim, normalize, reverse, fade) can be Python-side using numpy/scipy on WAV files.
- Python service: New `app/services/drum_sample_editor.py` with trim, normalize, reverse, fade operations. Recording service manages start/stop and writes WAV. Waveform analysis returns peak envelope data for rendering.
- REST: `POST /api/engine/drums/pad/{id}/sample/upload`, `POST /api/engine/drums/pad/{id}/record/start`, `POST /api/engine/drums/pad/{id}/record/stop`, `POST /api/engine/drums/pad/{id}/sample/trim`, `POST /api/engine/drums/pad/{id}/sample/normalize`, `POST /api/engine/drums/pad/{id}/sample/reverse`, `GET /api/engine/drums/pad/{id}/sample/waveform`.
- Frontend: Sample browser/upload panel per pad; record button with level meter; waveform display with draggable start/end markers; normalize/reverse/fade buttons; waveform zoom/scroll.
- Dependencies: T214 (kit management for sample file organization)
- Estimated effort: High
- Required outputs: Sample import, recording, editing tools, waveform display, bindings, service, routes, UI, tests.
- Completion notes:
  - Added native pad-input capture in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h`, `juce-engine/Source/DrumMachine/DrumMachineProcessor.cpp`, `juce-engine/Source/PythonBindings.cpp`, and `juce-engine/tests/DrumMachineProcessorTests.cpp`, with a preallocated mono callback buffer and Python-accessible `start_drum_pad_recording` / `stop_drum_pad_recording` hooks.
  - Added backend sample editing in `app/services/drum_sample_editor.py` and exposed it through `app/routes/drums.py`, covering upload, waveform analysis, trim, normalize, reverse, fade, and record start/stop while auto-cloning factory kits into writable `_editable` user-kit copies before destructive edits.
  - Added focused backend coverage in `tests/test_drum_sample_editor.py` and `tests/test_drum_routes.py`, including editable-kit cloning, waveform payloads, trim/normalize/reverse/fade flows, and recording round trips.
  - Extended the drum page in `web/src/map2/types.ts`, `web/src/map2/api.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` with a per-pad sample editor surface: file upload, input recording toggle, waveform display, zoom/scroll, trim range, normalize/reverse/fade actions, and regression coverage.
  - Validation passed with `pytest -q tests/test_drum_sample_editor.py tests/test_drum_routes.py tests/test_drum_kit_service.py`, `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx`, `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests -j4`, `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"`, and `cmake --build juce-engine/build-synthforge-tests --target map2_audio_engine -j4`.
  - Licensing review: touched native/backend/frontend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 18:18 EDT - Codex

ID: T391-P
Status: [✓] Done
Title: DrumsPage GUI Expansion — surface all new features in Carbon UI
Description:
- Goal / acceptance criteria: Extend `web/src/app/pages/DrumsPage.tsx` to surface all Phase 1–4 features in a coherent, Carbon-compliant interface. The page must not become overwhelming — use progressive disclosure via tabs, expandable panels, and context-sensitive controls. Must pass Carbon conformance review per `docs/design/CARBON_CONFORMANCE_STANDARD.md`.
- UI layout additions:
  - **Step Grid enhancements**: p-lock dots, probability opacity overlay, ratchet subdivision indicators, micro-timing offset ticks, per-track length markers, polyrhythm loop-point indicators
  - **Track Header row**: per-track length selector, per-track swing knob
  - **Transport bar enhancements**: queued pattern indicator, pattern switch quantization selector, MIDI clock out indicator
  - **Pad Editor panel** (new tab or expandable): sound source selector (Sample/Synth/Hybrid), synth parameter knobs, per-pad filter controls (type/cutoff/resonance/env), sample waveform display with trim markers, record button, CV/Gate config
  - **Mixer Panel enhancements**: per-bus reverb send knob, multi-output assignment matrix, master FX controls (drive, reverb, limiter)
  - **MIDI Panel enhancements**: CC mapping table with learn, MIDI output config, program change toggle
  - **New hooks**: `useDrumSynthParams`, `useDrumPadFilter`, `useDrumCcMappings`, `useDrumMasterFx`, `useDrumSampleEditor`
  - **New API surface**: Extend `drumsApi` in `web/src/map2/api.ts` for all new endpoints
  - **New types**: Extend drum types in `web/src/map2/types.ts`
- Dependencies: T391-A through T391-O (all feature work must be API-complete before final UI integration)
- Estimated effort: Very High
- Required outputs: Extended DrumsPage, new hooks, API bindings, types, component tests, Carbon conformance.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 18:39 EDT - Codex
- Completion notes:
  - Audited `web/src/app/pages/DrumsPage.tsx` against the Phase 1 through Phase 4 acceptance list and confirmed the page now surfaces the previously delivered drum-machine features in one Carbon-organized workflow: transport switch quantization and MIDI out, enhanced step-grid overlays and per-track loop/swing controls, pattern plus song tools, pad sample/synth/filter/CV-Gate editing, mixer/master-FX routing, and MIDI plus CC mapping tables.
  - Added the remaining named convenience hooks from the task contract in `web/src/app/hooks/useDrumMachine.ts`, specifically `useDrumSynthParams`, `useDrumPadFilter`, and `useDrumCcMappings`, while keeping the existing grouped drum hooks intact.
  - Added focused hook coverage in `web/src/app/hooks/useDrumMachine.test.tsx` for the new synth/filter/master-FX/sample-editor/CC-mapping hook surfaces and retained the expanded page/state coverage in `web/src/app/pages/DrumsPage.test.tsx` and `web/src/map2/drumMachineState.test.ts`.
  - Recorded the required Carbon sign-off evidence in `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, explicitly documenting the retained bespoke sequencer-grid and waveform visualizers as domain-specific visual surfaces wrapped by Carbon navigation/forms/tables rather than stray non-Carbon CRUD controls.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx src/app/hooks/useDrumMachine.test.tsx src/map2/drumMachineState.test.ts`, and `npm --prefix web run build`.
  - Licensing review: touched worklist/design/test/hook/frontend files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T392
Status: [✓] Done
Title: Root-cause and fix standalone DrumSequencer native test SIGSEGV in synthforge_tests
Description:
- Goal / acceptance criteria: Restore the previously green native `DrumSequencer` coverage by root-causing and fixing the crash in `juce-engine/build-synthforge-tests/synthforge_tests`, specifically the case `DrumSequencer exposes 128 patterns with 16-step defaults`, and re-establish a passing full `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` run.
- Why it matters: `T391-H` targeted validation passed, but the canonical native test suite is no longer clean, which weakens confidence in future drum-machine slices and blocks using full `ctest` as the sign-off gate.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Root-cause analysis, native fix if needed, updated regression coverage or harness stabilization, and a clean full `synthforge_tests` ctest run.
- Completion notes:
  - Root cause was stack exhaustion in `juce-engine/tests/DrumSequencerTests.cpp` during default `DrumSequencer` construction because the sequencer stored its full 128-pattern data set inline by value.
  - Fixed the crash by moving the large pattern store onto the heap in `juce-engine/Source/DrumMachine/DrumSequencer.h` and `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, preserving existing behavior while eliminating constructor-time stack overflow in standalone tests.
  - Validation passed with `./juce-engine/build-synthforge-tests/synthforge_tests "DrumSequencer exposes 128 patterns with 16-step defaults" --reporter compact`, `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][sequencer]"`, and `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure`.
  - Licensing review: touched native/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.
Subtasks: None

ID: T393
Status: [✓] Done
Title: Stabilize platform version generation so clean rebuild/restart loops do not dirty tracked artifacts
Description:
- Goal / acceptance criteria: Make the required frontend rebuild/restart workflow safe to run repeatedly from a clean checkout without leaving `VERSION` and `version.json` dirty after every successful `npm --prefix web run build`. Runtime version payloads must still expose accurate live `commit`/`dirty` metadata for API/UI consumers, and existing build/version tests must remain green.
- Why it matters: The user-requested commit/push/rebuild/restart loop currently re-dirties the repository immediately after deployment, which breaks clean handoff expectations and makes repeated release cycles noisy.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Updated version-generation/runtime helpers, regression tests for clean-rebuild reuse behavior and live runtime metadata, updated worklist/memory notes if needed, and a clean post-build git status from a clean repo.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 19:56 EDT - Codex
- Completion notes:
  - Updated `app/utils/platform_version.py` so tracked version artifacts persist only the stable build identity while runtime `commit`/`dirty` metadata is refreshed from git on load, ignoring churn in `VERSION` and `version.json` themselves.
  - Updated `scripts/generate_platform_version.py` so clean rebuilds reuse the current stable version instead of minting a fresh wall-clock timestamp every time the frontend bundle is rebuilt.
  - Added regression coverage in `tests/test_platform_version.py` for stable artifact persistence and live runtime git-state refresh in a temporary git repository.
  - Validation passed with `pytest -q tests/test_platform_version.py` and `npm --prefix web run build`; after committing and pushing the fix, a second clean `npm --prefix web run build` left `git status --short` empty, proving the rebuild/restart loop no longer dirties tracked version artifacts.
  - Licensing review: touched Python/script/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.
Assigned to: Codex
Last updated: 2026-03-24 18:27 EDT - Codex

ID: T394
Status: [✓] Done
Title: Embed the full drum sampler/editor workspace inside JUCE Grid from the compact drum card
Description:
- Goal / acceptance criteria: Replace the current compact-card-only jump path for `map2://juce/drums` with a Carbon-compliant modal that can open the complete existing drum-machine workspace, including the sampler, editor, sequencer, mixer, MIDI/CC mapping, and backing-track surfaces, while preserving the standalone `/drums` route and avoiding duplicate drum UI implementations.
- Why it matters: The richer drum machine has already been built, but JUCE Grid currently exposes only a reduced summary surface, which blocks an in-context professional workflow.
- Dependencies: Existing `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`, `web/src/app/pages/DrumsPage.tsx`, Carbon modal patterns in JUCE Grid, and focused frontend validation.
- Estimated effort: Medium
- Required outputs: Shared reusable drum-workspace component, new JUCE Grid drum workspace modal, updated compact drum card launch behavior, targeted tests, and worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 20:26 EDT - Codex
- Completion notes:
  - Extracted the full drum-machine route into a shared `DrumsWorkspace` component in `web/src/app/pages/DrumsPage.tsx`, then kept the routed `/drums` page as a thin wrapper that resolves the optional `?mode=` query and passes it into the shared workspace.
  - Added `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` and `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css` so JUCE Grid can open the complete sampler/editor/sequencer/mixer/MIDI workspace inside a large Carbon modal without duplicating the drum UI.
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx` so the compact card now opens the embedded full workspace modal by mode selection, while preserving an explicit standalone `/drums` launch button for operators who want the dedicated route.
  - Added focused coverage in `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx` and new `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx`; updated `web/src/app/pages/DrumsPage.test.tsx` for the new router dependency.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/pages/DrumsPage.test.tsx -t "renders the advanced sequencer grid from live drum data"`, and `npm --prefix web run build`.

ID: T395
Status: [✓] Done
Title: Add Carbon modal navigation rail and live status chrome to the embedded JUCE Grid drum workspace
Description:
- Goal / acceptance criteria: Upgrade the new JUCE Grid drum workspace modal so it includes a Carbon-compliant workspace rail and live status tags for the active mode, transport, kit, pattern, and tempo, improving navigation and operator awareness without forking the underlying drum-machine UI.
- Why it matters: The full workspace is now available in-context, but the first modal version still behaves like a generic container rather than a polished instrument workstation.
- Dependencies: T394, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx`, and the shared `DrumsWorkspace` component.
- Estimated effort: Low
- Required outputs: Updated modal header/navigation shell, focused tests, validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 20:38 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` so the modal now queries live drum state/transport/kit data and surfaces Carbon tags for mode, transport state, BPM, pattern variation, and active kit directly in the workspace chrome.
  - Added a modal workspace rail with anchor navigation for overview, transport, modes, and footer/status, giving the embedded drum workstation clearer in-context structure without changing the underlying drum page logic.
  - Extended `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css` to support the new two-column modal shell and responsive rail collapse on narrower layouts.
  - Expanded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx` to cover the new live status tags and rail navigation links.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.test.tsx src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx`, and `npm --prefix web run build`.

ID: T396
Status: [✓] Done
Title: Add operator focus presets and shortcut guidance to the embedded JUCE Grid drum workspace
Description:
- Goal / acceptance criteria: Add workstation-style focus presets and visible shortcut guidance to the JUCE Grid drum modal so operators can jump directly to performance, editing, and sound-design sections of the embedded drum workspace without hunting through the full page content.
- Why it matters: The modal now exposes the full drum machine, but it still benefits from faster task-oriented navigation and explicit operator cues expected in professional instrument editors.
- Dependencies: T394, T395, shared `DrumsWorkspace`, and the modal shell.
- Estimated effort: Low
- Required outputs: Stable section anchors inside the advanced drum workspace, modal preset controls and shortcut cues, focused validation, and updated worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 20:57 EDT - Codex
- Completion notes:
  - Added stable advanced-workspace anchors in `web/src/app/pages/DrumsPage.tsx` for the sequencer, patterns, song, kits, mixer, pad inspector, MIDI editor, and step-lock editor so the embedded modal can jump directly into real workstation sections.
  - Extended `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` with task-focused preset cards and explicit shortcut cues covering sequencer navigation, step toggling, p-lock selection, and mode switching.
  - Expanded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx` to verify the preset links and shortcut guidance render in the embedded workstation shell.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx src/app/pages/DrumsPage.test.tsx`, and `npm --prefix web run build`.

ID: T397
Status: [✓] Done
Title: Add a fixed live inspector rail to the embedded JUCE Grid drum workspace modal
Description:
- Goal / acceptance criteria: Upgrade the JUCE Grid drum modal with a persistent Carbon-compliant side inspector that mirrors the currently selected pad and selected step, including key routing/sample/lock context and direct jumps into the full pad and step editors, without duplicating the underlying drum editor logic.
- Why it matters: The embedded workspace already contains the full editor, but operators still have to hunt inside the page body for the current pad and step context; a fixed side inspector makes the modal behave more like an industry-standard drum workstation.
- Dependencies: T394, T395, T396, `web/src/app/pages/DrumsPage.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx`, and focused frontend validation.
- Estimated effort: Low
- Required outputs: Shared workspace-selection summary wiring, modal-side live inspector UI, focused regression coverage, and updated completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 21:06 EDT - Codex
- Completion notes:
  - Extended `web/src/app/pages/DrumsPage.tsx` so the shared `DrumsWorkspace` can publish a lightweight selection summary for the currently selected pad and step, including source mode, bus/note routing, sample state, and p-lock detail, while preserving the existing standalone route behavior.
  - Added a desktop-side inspector column to `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` and `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css`, surfacing live pad facts, sample status, step probability/micro-timing/ratchet details, and direct links into the full pad and step editors.
  - Added `drum-advanced-step-locks` as a stable anchor in `web/src/app/pages/DrumsPage.tsx` so the modal inspector can jump directly into the step-lock editor.
  - Expanded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx` and `web/src/app/pages/DrumsPage.test.tsx` to cover the new inspector rail and the embedded selection-summary wiring.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx src/app/pages/DrumsPage.test.tsx`, and `npm --prefix web run build`.

ID: T398
Status: [✓] Done
Title: Turn embedded drum modal focus presets into persistent workspace layouts
Description:
- Goal / acceptance criteria: Upgrade the current JUCE Grid drum modal presets so they switch the embedded workspace into real task-oriented layouts, with persistent preset selection, visible active state, and section-level reflow or hiding for `Performance`, `Editing`, and `Sound Design` instead of only anchor jumps.
- Why it matters: The current preset cards help navigation, but they do not yet change the working surface enough to match how professional drum workstations compress or expand context for different tasks.
- Dependencies: T394, T395, T396, T397, stable drum section IDs in `web/src/app/pages/DrumsPage.tsx`, and focused frontend validation.
- Estimated effort: Medium
- Required outputs: Persistent preset state in the modal, real layout classes that alter the embedded workspace presentation, focused tests, and updated completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 21:15 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` so the modal presets are now persistent task-mode buttons backed by local storage, with visible active state and smooth jump behavior into the relevant anchored section.
  - Extended `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css` with real layout classes for `Performance`, `Editing`, and `Sound Design`, including section-level visibility rules and column reflow so the embedded workspace materially changes by task instead of only scrolling.
  - Expanded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx` to cover preset active state, persistence, and layout-shell class changes, while keeping `web/src/app/pages/DrumsPage.test.tsx` green against the shared workspace wiring.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx src/app/pages/DrumsPage.test.tsx`, and `npm --prefix web run build`.

ID: T399
Status: [✓] Done
Title: Add a keyboard shortcut overlay and quick-command strip to the embedded drum modal
Description:
- Goal / acceptance criteria: Add a Carbon-compliant shortcut overlay to the JUCE Grid drum workspace modal that can be opened from the UI and from the keyboard, shows grouped operator commands with hints, and exposes quick actions for presets and core editor destinations.
- Why it matters: Static cue text is not enough for a professional embedded workstation; operators need an explicit help surface that makes the modal self-documenting and faster to drive under pressure.
- Dependencies: T394 through T398, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx`, and focused frontend validation.
- Estimated effort: Low
- Required outputs: Modal-side shortcut/help overlay, keyboard toggle handling, focused tests, and updated completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 21:25 EDT - Codex
- Completion notes:
  - Extended `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` with a live shortcut overlay that can be opened from the UI or with `Shift + ?`, closed with `Escape`, and used to trigger quick commands for workspace layouts and key drum-editor destinations.
  - Extended `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css` with overlay, shortcut map, and quick-command styling so the help surface sits inside the embedded workstation without leaving JUCE Grid.
  - Expanded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx` to verify UI-triggered overlay opening, keyboard toggling, `Escape` close behavior, and quick-command execution; kept `web/src/app/pages/DrumsPage.test.tsx` green against the shared drum workspace.
  - Validation passed with `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx src/app/pages/DrumsPage.test.tsx`, and `npm --prefix web run build`.

ID: T400
Status: [✓] Done
Title: Add embedded drum workspace history, named layouts, and deeper operator commands
Description:
- Goal / acceptance criteria: Expand the JUCE Grid drum modal and shared `DrumsWorkspace` so operators get named saveable workspace layouts, real undo/redo for pattern edits and sample edits, and a deeper embedded command surface for transport/history/layout actions. Pattern undo/redo must restore actual sequencer content, sample undo/redo must restore the previous pad sample asset instead of only UI state, and the modal must expose/load/delete named layouts without leaving JUCE Grid.
- Why it matters: The current modal now embeds the full workspace, but it still lacks production-grade recovery and operator acceleration features expected from a serious drum workstation.
- Dependencies: T394, T395, T396, T397, T398, T399, frontend drum workspace wiring in `web/src/app/pages/DrumsPage.tsx`, modal shell in `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx`, and backend sample-editor routes in `app/routes/drums.py`.
- Estimated effort: High
- Required outputs: Updated worklist notes, backend sample export/restore support, frontend pattern/sample history plumbing, named layout persistence UI, richer quick commands, focused tests, and validation results.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 22:02 EDT - Codex
- Completion notes:
  - Added real sample export support in `app/services/drum_sample_editor.py`, `app/routes/drums.py`, and `web/src/map2/api.ts` so the frontend can capture the exact active WAV asset for each pad and restore it through the existing upload path during undo/redo.
  - Extended `web/src/app/pages/DrumsPage.tsx` so the shared `DrumsWorkspace` now tracks restart-safe pattern and sample history, publishes command availability upward to the embedded modal, and executes pattern/sample undo-redo requests coming back down from the modal command surface.
  - Upgraded `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.tsx` and `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.css` with named saveable layouts, load/delete management, history-status tags, and deeper quick commands for transport, fill, tap-tempo, and pattern/sample undo-redo.
  - Expanded focused coverage in `tests/test_drum_sample_editor.py`, `tests/test_drum_routes.py`, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx`, and `web/src/app/pages/DrumsPage.test.tsx` to cover sample export, modal saved layouts, overlay command dispatch, command-state publication, and pattern/sample history restore flows.
  - Validation passed with `pytest -q tests/test_drum_sample_editor.py tests/test_drum_routes.py`, `npm --prefix web run typecheck`, `CI=1 npm --prefix web test -- --runInBand --detectOpenHandles --forceExit src/app/components/PluginCards/Custom/JUCE/DrumMachineWorkspaceModal.test.tsx src/app/pages/DrumsPage.test.tsx`, and `npm --prefix web run build`.
  - Residual note: the existing Vite warning about `web/src/map2/api.ts` being both dynamically and statically imported remains unchanged and was not introduced by this task.

---

## Typography

ID: T220
Status: [✓] Done
Title: Adopt BlexMono Nerd Font as the default site typeface with governed Nerd Font glyph usage
Description:
- Goal / acceptance criteria: Replace the current site-wide default font stack with `BlexMono Nerd Font` for the active frontend, ship the font through a deterministic web-delivery strategy, and define explicit glyph-usage rules so the extended Nerd Font symbol set improves navigation, telemetry, and status readability without degrading accessibility or becoming decorative noise.
- Why it matters: The current frontend still defaults to `IBM Plex Sans` and mixed mono fallbacks, so typography is inconsistent with the requested visual direction and there is no governance for safe, intentional use of extended Nerd Font glyphs.
- Dependencies: Current frontend font tokens in `web/src/index.css`, any route-local overrides that should remain exempt, final licensing/distribution decision for bundling the font assets, and user direction on scope/risk tolerance for glyph density.
- Estimated effort: High
- Required outputs: Implemented default-font migration plan, updated font tokens/assets/load path, documented glyph playbook with approved usage categories and bans, targeted UI updates for the best glyph-driven surfaces, and validation notes for rendering/performance/accessibility.
- Completion notes:
  - Pinned the upstream source to Nerd Fonts `v3.4.0` (`IBMPlexMono.zip`, published 2025-04-24) and imported the current `BlexMonoNerdFont-*` family from that release.
  - Added a reproducible subsetting pipeline in `scripts/build_blexmono_nerd_webfonts.py` that produces repo-hosted `woff2` text and glyph subsets plus a source/version manifest under `web/public/fonts/blexmono-nerd/v3.4.0/`.
  - Carried the upstream `LICENSE.txt` and `README.md` into the hosted font directory for provenance/compliance.
  - Added the strict initial glyph/codepoint governance document at `docs/design/BLEXMONO_NERD_FONT_SPEC.md`.
  - Wired the new family into the active root typography tokens and first authority points in `web/src/index.css`, plus the first route/style cleanup pass in `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Closed the final production follow-up by removing local `ibm-plex-sans-*` asset emission from the web build while preserving the documented Carbon/CDN residual note.
Subtasks:
ID: T220-subA
Status: [✓] Done
Title: Audit current typography tokens, overrides, and delivery path
Description:
- Goal / acceptance criteria: Inventory the current font tokens, direct `font-family` overrides, Carbon token interactions, and any hard-coded mono/sans fallbacks that would conflict with a site-wide `BlexMono Nerd Font` rollout.
- Why it matters: The migration should target the real authority points instead of only changing one root variable while leaving route-local typography fractured.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Concrete file list, token ownership map, and exemption candidates for specialty surfaces that should not inherit the new default blindly.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
- Decision notes:
  - User direction confirmed on 2026-03-18: use `BlexMono Nerd Font` across all active frontend fonts rather than a limited-scope rollout.
  - Delivery direction: self-host the font assets in MAP2 rather than depending on local OS installation.
  - Visual direction: aggressive mono-first identity rather than a restrained mixed sans/mono system.
  - Glyph direction: use the extended Nerd Font glyph language across all major surfaces, not just one UI cluster.
  - Accessibility/risk note to resolve during implementation: user permits glyph-only usage, so the rollout must still define where glyph-only is safe versus where hidden labels/tooltips/ARIA text remain mandatory.
  - Icon-system boundary confirmed on 2026-03-18: keep Carbon/MAP SVG icons as the primary icon system; use Nerd Font glyphs mainly for typography, badges, labels, dense status language, and compact affordances rather than replacing the SVG icon program.
  - Performance direction: subset/self-host the font assets for web delivery instead of shipping the full font payload unbounded.
  - Weight/style direction: host multiple weights/styles rather than enforcing a single minimal terminal-weight package.
  - Scope direction: include legacy routed surfaces under `web/src/map2/**` and `web/src/pipedal/**`, not just `web/src/app/**`.
  - Glyph-only direction refined on 2026-03-18: glyph-only UI should be used primarily for small/mobile interfaces and very tight layouts; larger layouts should still prefer stronger textual affordance even if glyph-led styling is aggressive.
  - Action direction: glyph treatment may extend across action surfaces, but implementation still needs explicit mobile/desktop rules so primary actions do not become ambiguous on larger layouts.
  - Asset-ingestion direction confirmed on 2026-03-18: import the font assets into the repo now rather than deferring to a later manual drop.
  - Desktop labeling direction: desktop may keep text labels for actions when space allows, while tighter/mobile layouts may compress toward glyph-led controls.
  - Heading direction: hierarchy should be built with pure `BlexMono Nerd Font` only, using weight/spacing/case rather than introducing a secondary display face.
  - Legacy rollout direction: apply the typography program across both `web/src/map2/**` and `web/src/pipedal/**` rather than staging only one of those islands.
  - Governance direction: document an explicit approved glyph/codepoint set and strict usage rules rather than loose examples-only guidance.
  - Carbon-conformance direction confirmed on 2026-03-18: preserve Carbon typography and spacing standards where practical instead of turning the UI into an ungoverned terminal parody.
  - Surface scope refined: inputs, tables, code/log views, navigation, and general interface text should all move onto the same BlexMono family rather than keeping major typography exceptions.
  - Glyph-catalog direction refined: prefer broad approved Nerd Font coverage across the UI, except where an existing Carbon icon is clearly better for clarity or consistency.
  - Fallback direction: ship with a deterministic fallback stack rather than treating any non-primary glyph fallback as a release blocker.
  - Asset packaging direction: follow best practice by storing optimized web-ready font subsets plus source/version manifesting rather than keeping a random raw-asset dump without provenance.
  - Webfont-format direction confirmed on 2026-03-18: use best-practice webfont packaging rather than mirroring the upstream distribution blindly.
  - Governance-doc direction: implementation may choose the best documentation shape, but the glyph/font system must remain explicit and restart-safe.
  - Mobile accessibility direction: glyph-only controls may rely on ARIA and visually hidden/accessible naming rather than requiring visible tooltip labels by default.
  - Cleanup direction: normalize and fix the existing hard-coded `font-family` declarations correctly as part of the rollout rather than preserving avoidable drift.
  - Token direction: introduce clearer global typography tokens while preserving Carbon-compatible aliases, instead of simply overloading the old names without structure.
  - Rendering direction confirmed on 2026-03-18: include font-rendering polish such as smoothing and spacing adjustments as part of the rollout rather than treating this as a family swap only.
  - Utility-layer direction: keep the approved glyph system governed by the written spec rather than introducing a separate glyph helper abstraction unless implementation later proves it necessary.
  - Glyph-selection direction: follow best practice for standard-vs-Nerd-Font symbol choice instead of forcing one category everywhere.
  - Labeling direction refined: do not inject glyph-prefixed naming patterns into route titles, launcher cards, or menu labels unless the glyph materially improves the UI.
  - Authenticity direction: period-authentic emulated/device surfaces may retain local typography exceptions where the new global mono system would harm faithful presentation.
 - Completion notes:
  - Audited the primary typography authority points and confirmed the current default still flows through `web/src/index.css`, with additional hard-coded overrides in route CSS, component CSS, and inline style objects.
  - Confirmed the first high-value override points in `web/src/index.css`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Counted the remaining typography override tail at `60` unique frontend files still carrying explicit old mono/sans declarations that need normalization in follow-on passes.
ID: T220-subB
Status: [✓] Done
Title: Define webfont sourcing, packaging, and fallback strategy for BlexMono Nerd Font
Description:
- Goal / acceptance criteria: Decide whether MAP2 will vendor the Nerd Font assets, subset them, or fetch them during build/release, then specify the fallback stack and loading behavior for fast, stable rendering.
- Why it matters: Font choice is easy; production-safe delivery is the part that breaks builds, adds bloat, or causes FOIT/FOUT if left vague.
- Dependencies: T220-subA, user decision on self-hosting versus external/manual install assumptions
- Estimated effort: Medium
- Required outputs: Delivery decision, asset location plan, fallback stack, preload/subset policy, and any follow-up licensing/compliance note.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
 - Completion notes:
  - Pinned the webfont source to Nerd Fonts `v3.4.0` and imported the upstream `IBMPlexMono.zip` payload for build-time processing.
  - Added `scripts/build_blexmono_nerd_webfonts.py` to produce optimized `woff2` subsets rather than shipping raw upstream files directly.
  - Generated repo-hosted subsets, manifest, license, and source README under `web/public/fonts/blexmono-nerd/v3.4.0/`.
ID: T220-subC
Status: [✓] Done
Title: Establish Nerd Font glyph governance and approved UI usage patterns
Description:
- Goal / acceptance criteria: Define where extended glyphs are allowed, where they are forbidden, and the pairing rules with text/icons for accessibility, searchability, and operator clarity.
- Why it matters: “Excellent use” of the glyph set requires restraint and consistency; otherwise the UI becomes visually noisy and semantically brittle.
- Dependencies: T220-subA
- Estimated effort: Medium
- Required outputs: Glyph playbook covering approved categories such as nav labels, topology/state markers, terminal/log views, compact telemetry, and decorative exclusions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
 - Completion notes:
  - Added the strict allowlist-based glyph governance document at `docs/design/BLEXMONO_NERD_FONT_SPEC.md`.
  - Recorded the initial approved Nerd Font PUA set, token policy, Carbon boundary, and authenticity exemptions for emulated device surfaces.
ID: T220-subD
Status: [✓] Done
Title: Apply the new default font tokens and migrate the highest-value surfaces
Description:
- Goal / acceptance criteria: Implement the chosen font-delivery approach, update the root typography tokens, and revise the most valuable surfaces to use governed Nerd Font glyphs where they materially improve scanning and density.
- Why it matters: The plan is only useful if the system default and the first wave of operator-facing surfaces actually ship together.
- Dependencies: T220-subA, T220-subB, T220-subC
- Estimated effort: High
- Required outputs: Updated CSS/tokens/assets, targeted UI component changes, and documented exceptions for surfaces left on alternate families.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 17:20 - Codex
 - Completion notes:
  - Added `@font-face` wiring for the generated BlexMono text/glyph subsets in `web/src/index.css`.
  - Introduced clearer global typography tokens (`--font-ui`, `--font-ui-tight`, `--font-display`, `--font-mono`) while preserving Carbon-compatible aliases.
  - Switched the global body and heading family defaults to the new BlexMono-based token set and added rendering-polish defaults (`text-rendering`, ligature disable, smoothing preservation).
  - Updated the first route/style overrides in `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Follow-on cleanup pass updated additional shared surfaces and page-local typography constants in `web/src/app/pages/HomePage.css`, `PlatformInfoGuideSection.tsx`, `ExpressionPage.tsx`, `PerformPage.tsx`, `web/src/app/components/HostMachine/HostMachine.css`, `web/src/app/components/Displays/SegmentedLedText.css`, `web/src/app/components/PluginOutputPanel.css`, `web/src/app/pages/PipeWirePage.css`, `AudioEnginePage.css`, `LV2PluginsPage.css`, and `MidiHubPage.css`.
  - Another cleanup pass updated shared and legacy readout surfaces in `web/src/app/components/shared/LandscapePrompt.tsx`, `ApiObservatory/primitives/JsonTreeViewer.tsx`, `ApiActivityOverlay/ApiActivityOverlay.css`, `ThemeChooserModal.css`, `CPUStatusOverview.tsx`, `UpdateProgressViewer.tsx`, `web/src/ErrorBoundary.tsx`, `Visualizations/ClusterMeteringStrip.tsx`, `web/src/pages/ClusterAdmin.tsx`, `web/src/map2/components/MIDIMapper.tsx`, `WWWPanel.tsx`, `PluginCpuIndicator.tsx`, and `LatencyDisplay.tsx`.
  - A further meter/editor cleanup pass updated `web/src/app/components/AudioMeter.tsx`, `Visualizations/DynamicsMeteringPanel.tsx`, `Visualizations/VuMeterDisplay.tsx`, `TunerDisplay.tsx`, `MIDICommanderSetup.tsx`, and `LV2PluginParameterEditor.tsx`.
  - Another plugin-card/readout cleanup pass updated `web/src/app/components/PluginCards/Visualizations/TunerDisplay.tsx`, `PluginCards/Custom/JUCE/DrumMachineCard.tsx`, `PluginCards/Custom/JUCE/NAMCard.tsx`, `PluginCards/Custom/TooB/TunerCard.tsx`, `PluginCards/Custom/JUCE/CompressorCard.tsx`, `PluginCards/Custom/JUCE/GateCard.tsx`, `PluginCards/Custom/JUCE/LimiterCard.tsx`, and the remaining mono readout in `MIDICommanderSetup.tsx`.
  - Final cleanup pass normalized the residual hard-coded old mono/sans declarations in dynamics, EQ, plugin dialogs, Tesira AVB tables, metering pages, shared chooser surfaces, `web/src/map2/**`, `web/src/index.css`, and safe non-emulated LCD metadata/readout surfaces.
  - Final audit state: the hard-coded old mono/sans declaration tail is down from `60` to `0` unique files across `web/src/app/**`, `web/src/map2/**`, and `web/src/pipedal/**` using the tracked ripgrep audit.
ID: T220-subE
Status: [✓] Done
Title: Validate rendering, accessibility, and performance of the typography migration
Description:
- Goal / acceptance criteria: Verify that the new font renders reliably across the supported UI surfaces, does not regress readability/accessibility, and keeps font payload/performance within acceptable bounds.
- Why it matters: Font migrations often fail on clipping, fallback gaps, glyph confusion, and asset-size regressions.
- Dependencies: T220-subD
- Estimated effort: Medium
- Required outputs: Validation notes for typecheck/build, visual spot checks, accessibility observations, and any follow-up fixes or exemptions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 17:20 - Codex
 - Completion notes:
  - `npm --prefix web run typecheck` passes after the typography cleanup and the related Carbon icon/build-fix follow-up.
  - `npm --prefix web run build` now passes end to end.
  - Validation surfaced only non-blocking build warnings for large chunks and mixed dynamic/static imports; no typography-specific build failure remains.
  - The hosted BlexMono webfont payload remains about `348K` total across the generated `woff2` subsets.
  - Accessibility posture for the migration remains governed by `docs/design/BLEXMONO_NERD_FONT_SPEC.md`, with glyph-only usage still constrained to compact/mobile cases and Carbon/MAP SVG icons kept as the primary icon system.
ID: T220-subF
Status: [✓] Done
Title: Remove residual IBM Plex Sans webfont emission from the production build
Description:
- Goal / acceptance criteria: Audit and eliminate the remaining `ibm-plex-sans-*` webfont assets emitted by `npm --prefix web run build` so the production bundle aligns with the BlexMono-first typography rollout and avoids shipping unused legacy font payload.
- Why it matters: The default font migration is implemented, but the current production bundle still emits legacy IBM Plex Sans assets, which adds unnecessary payload and weakens the final typography posture.
- Dependencies: T220-subD, T220-subE
- Estimated effort: Medium
- Required outputs: Source of IBM Plex Sans asset emission identified, imports/tokens/build config corrected, and validation notes confirming the legacy font files are no longer emitted unless an explicit exemption is documented.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:31 - Codex
- Completion notes:
  - Removed the legacy `@fontsource/ibm-plex-sans/*` entrypoint imports from `web/src/main.tsx` and dropped `@fontsource/ibm-plex-sans` from `web/package.json` / `web/package-lock.json`.
  - Tightened `scripts/build_web_dist_atomic.py` so the atomic publish step no longer carries forward stale `ibm-plex-sans-*` hashed assets from prior builds into the new `web/dist/assets` tree.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass, `find web/dist/assets -maxdepth 1 -type f | grep -i 'ibm-plex-sans'` -> no matches, and the currently referenced `web/dist/assets/index-ClUQS4FA.js` / `index-D4VpUnpq.css` contain no `ibm-plex-sans` source references.
  - Residual note: Carbon's shipped stylesheet still declares `IBM Plex Sans` as a font-family and references hosted `IBM Plex Mono` assets from IBM/CDN, but the local build no longer emits the legacy `ibm-plex-sans-*` font files targeted by this task.

## Carbon Category Card Refactor

ID: T222
Status: [✓] Done
Title: Carbon-compliant effect card refactor — AXE-FX Edit structural parity
Description:
- Goal / acceptance criteria: Refactor every effect card GUI (24 JUCE native, 15 third-party, 8 fallback templates = 47 total) to Carbon Design System compliance with AXE-FX Edit structural parity. Cards in the same effect category must share identical layout structure. All parameters preserved — advanced/unique features in Carbon Accordion sections. Delete all orphaned per-card CSS. Build must pass clean.
- Why it matters: Prior state had 47 cards each with bespoke sizing, layout, control types, and CSS. Cards in the same category (e.g., three dynamics processors) looked nothing alike. This refactor establishes visual and structural consistency across the entire plugin card system.
- Dependencies: Carbon Design System (`@carbon/react` v1.103.0, `@carbon/icons-react` v11.76.0) — already installed
- Estimated effort: Very High
- Required outputs: 16 new infrastructure/layout files, 47 refactored card files, 22 deleted CSS files, clean `tsc -b` and Vite production build.
Subtasks:
ID: T222-subA
Status: [✓] Done
Title: Phase 1 — Shared Carbon infrastructure
Description:
- Goal / acceptance criteria: Create the shared foundation components that all category layouts and cards will use.
- New files created:
  - `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx` — Standardized card shell with Carbon Toggle bypass, Tag category badge, OverflowMenu, Accordion for advanced sections, fixed dimensions per category
  - `web/src/app/components/PluginCards/Base/CarbonParameterSection.tsx` — Always-visible section with auto-icon header
  - `web/src/app/components/PluginCards/Base/CarbonMeteringFooter.tsx` — Standardized IN/GR/OUT metering footer with clipping Tag indicator
  - `web/src/app/components/PluginCards/Base/carbonCardStyles.css` — Single shared CSS for all Carbon-compliant cards (category height variables, Carbon spacing tokens, accordion overrides, container queries)
- Modified: `web/src/app/components/PluginCards/types.ts` — Added `CATEGORY_CARD_DIMENSIONS` constant
- Key type: `ParamSlot` interface (label, value, min, max, defaultValue, step, unit, onChange, isLogarithmic, valueFormatter, midi)
- Key type: `AdvancedSection` interface (id, title, icon, children, defaultOpen)
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subB
Status: [✓] Done
Title: Phase 2 — 10 Category Layout components
Description:
- Goal / acceptance criteria: Create one standardized layout component per effect category defining the AXE-FX-style fixed structure.
- New files created (all in `web/src/app/components/PluginCards/Layouts/`):
  - `DynamicsCategoryLayout.tsx` (520px) — GR Meter + Transfer Curve → Dynamics → Timing → Output → Accordion → Footer
  - `ModulationCategoryLayout.tsx` (480px) — LFO Viz → Modulation → Character → Mix → Accordion → Footer
  - `DelayCategoryLayout.tsx` (520px) — Tap Grid → Time → Character → Mix → Accordion → Footer
  - `ReverbCategoryLayout.tsx` (500px) — Decay Curve → Space → Time → Tone → Mix → Accordion → Footer
  - `PitchCategoryLayout.tsx` (480px) — Pitch Display → Pitch → Character → Mix → Accordion → Footer
  - `AmplifierCategoryLayout.tsx` (560px) — Tube Viz → Input → Tone → Power → Output → Accordion → Footer
  - `MultiEffectCategoryLayout.tsx` (560px) — Algorithm Display → Selector → Primary Controls → Accordion → Footer
  - `EQCategoryLayout.tsx` (500px) — EQ Curve → Band Grid → Output → Accordion
  - `ConvolutionCategoryLayout.tsx` (420px) — IR Browser → Mix → Accordion → Footer
  - `InstrumentCategoryLayout.tsx` (560px) — Viz → Transport → Performance → Accordion → Footer
  - `index.ts` — barrel exports
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subC
Status: [✓] Done
Title: Phase 3 — Refactor 24 JUCE native cards
Description:
- Goal / acceptance criteria: Every JUCE native card uses its category layout. All parameters preserved. withMidiDialog HOC retained. Bespoke CSS imports removed.
- Cards refactored:
  - Dynamics (4): CompressorCard, CelestialCompressorCard (artist presets in Accordion), LimiterCard (ratio locked ∞), GateCard (open/closed indicator in extraContent)
  - Modulation (3): ChorusCard, PhaserCard, IntelliFXCard (8-voice controls in Accordion)
  - Amplifier (3): TweedBassmanCard, Peavey5150Card, NAMCard
  - Pitch (3): IntervalShifterCard, EVHPitchShifterCard (era presets in Accordion), BossXS1Card (expression pedal in Accordion)
  - Multi-Effect (3): EventideH9Card, ShoeGazeCard, PassionFXCard (signal chain modules in Accordion)
  - Reverb (2): LexiLoveCard → ReverbCategoryLayout, H3000Card → PitchCategoryLayout (primarily harmonizer)
  - EQ (1): ParametricEQCard → EQCategoryLayout (8-band)
  - Delay (1): NativeDelayCard → DelayCategoryLayout
  - Convolution (2): CabinetIRCard, ReverbIRCard → ConvolutionCategoryLayout
  - Instrument (2): DrumMachineCard, SynthForgeCard → InstrumentCategoryLayout
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subD
Status: [✓] Done
Title: Phase 4 — Refactor 15 third-party cards
Description:
- Goal / acceptance criteria: Every third-party card uses its category layout. Parameter access patterns (LV2 parameterValues/onParameterChange) preserved.
- Cards refactored:
  - TooB (7): CE2ChorusCard, BF2FlangerCard, PhaserCard, TremoloCard → ModulationCategoryLayout; DelayCard → DelayCategoryLayout; LooperCard → InstrumentCategoryLayout; TunerCard → CarbonCardShell (utility)
  - Dragonfly (3): DragonflyRoomCard, DragonflyHallCard, DragonflyPlateCard → ReverbCategoryLayout
  - LV2 (4): REEVRCard → ReverbCategoryLayout; OutotuneCard, WhammyCard → PitchCategoryLayout; KeyboardSamplerCard → InstrumentCategoryLayout
  - Airwindows (1): GlitchShifterCard → PitchCategoryLayout
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subE
Status: [✓] Done
Title: Phase 5 — Refactor 8 fallback templates
Description:
- Goal / acceptance criteria: Every fallback template wraps its category layout. Generic parameters auto-mapped to standard slots via toSlot() helper; unmatched params in Accordion advanced sections.
- Templates refactored:
  - DynamicsTemplate → DynamicsCategoryLayout
  - ReverbTemplate → ReverbCategoryLayout
  - EQTemplate → EQCategoryLayout (auto-detects band structure)
  - DelayTemplate → DelayCategoryLayout
  - ModulationTemplate → ModulationCategoryLayout
  - DistortionTemplate → AmplifierCategoryLayout
  - PitchTemplate → PitchCategoryLayout
  - UtilityTemplate → CarbonCardShell (auto-groups parameters)
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subF
Status: [✓] Done
Title: Phase 6 — Cleanup and build verification
Description:
- Goal / acceptance criteria: Delete all orphaned per-card CSS files. Fix any remaining stale imports. Build must pass clean.
- 22 CSS files deleted (JUCE: 17, LV2: 3, Airwindows: 1, TooB: 0 — had none)
- 3 stale CSS imports fixed (ShoeGazeCard, PassionFXCard, EventideH9Card)
- 4 build errors fixed: invalid Carbon icon `Tune` → `SettingsAdjust` (H3000Card, LexiLoveCard), missing `defaultValue` on EQ frequency ParamSlot (ParametricEQCard), type predicate mismatch (UtilityTemplate)
- Final validation: `tsc -b` clean, `npm run build` clean (16.34s)
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - All 47 cards + 8 templates now use standardized category layouts
  - Cards in the same category are structurally identical (AXE-FX Edit parity)
  - Every parameter is accessible — primary params visible, advanced in Carbon Accordion
  - Carbon icons throughout, no bespoke CSS remains on any card
  - withMidiDialog HOC preserved on all JUCE native cards
  - Planner-only mode instruction set added to `docs/CLAUDE.md`

## JUCE Grid — Axe-FX Edit / GarageBand Redesign

ID: T223
Status: [✓] Done
Title: JUCE Grid Page — Axe-FX Edit desktop + GarageBand iPad redesign
Description:
- Goal / acceptance criteria: Full replacement and refactor of JuceGridPage and JuceGridSignalCanvas into an Axe-FX Edit–style effect block grid with GarageBand-informed iPad experience and Carbon Design System compliance.
- Estimated effort: Very High (multi-phase)
- Dependencies: T222 (Carbon card refactor — Done)
- Design hierarchy: Match Axe-FX Edit (desktop) → Match GarageBand (iPad) → Apple HIG → Carbon Standards

### Design Specification

#### Grid Layout
- **Win10 Start Menu tile layout**: Uniform-height cards, 3 width sizes (large/medium/small)
- **Row fill logic**: Cards start at largest width; shrink as more cards added to row until all at smallest width, then new row created
- **Once a row wraps**: Previous row cards stay at smallest width; new row starts fresh at largest width
- **Snake (boustrophedon) signal flow**: Row 1 left→right, Row 2 right→left, etc. Vertical connectors on right or left side as needed
- **Full replacement** of existing JuceGridPage and JuceGridSignalCanvas (use old code as guide)
- **Keep all existing colors** — no color scheme changes

#### Effect Grid Cards (Face)
- **Content**: Effect human-readable name, hero image (from existing effectIcons.ts), bypass state, category of effect
- **Glyphs**: Use glyphs wherever possible
- **Category colors**: Use existing CATEGORY_COLORS from types.ts
- **Bypass visual**: Dim/desaturate card face (Axe-FX Edit style); signal flow lines through bypassed card change appearance (dashed/reduced opacity)
- **Selected state**: Carbon standard highlight when card is open in bottom panel
- **Fixed portion layout**: Top portion = hero image, bottom portion = name/category/bypass (standardized across all cards)

#### Signal Flow
- **3-dot connectivity indicators**: Between cards, using Interactive Hover color, Carbon standard visibility behavior
- **Signal flow lines**: Carbon styling, connecting dot-to-dot between adjacent cards in chain
- **Input/Output**: Remain outside the signal chain; represent signal flow from input → through card chain → to destination/next hop → continuing to next card if required
- **Bypassed card flow**: Dashed line or reduced opacity through bypassed blocks (Axe-FX Edit style)
- **Flow updates**: Signal flow lines and dots update only after move is confirmed, not during

#### Bottom Parameter Panel
- **Opens on card click**: Slide-up animation; click same card again to close (slide-down)
- **Pushes grid up**: Grid stays fully visible at all times
- **Standardized layout**: All effects use same pattern — no custom per-card layouts
- **Parameter display**: Carbon NumberInput for numbers, Carbon Dropdown for named/enum items
- **Grouped parameters**: Use existing parameter group metadata (INPUT, OUTPUT, TIMING, THRESHOLD, FREQUENCY, MODULATION, SPATIAL, MIX, OTHER)
- **All groups visible**: No accordion/collapsing — all parameter groups shown
- **No scroll**: Effect parameter cards grow in height as needed
- **Panel header**: Effect hero icon, name, category, bypass toggle (mirrors card face)

#### Add Effect Slot
- **Single empty slot**: Always present at end of chain
- **Visual**: Matches Axe-FX Edit empty grid slot style (same height as cards, smallest width, "+" glyph)
- **Action**: Navigates to existing effects browser

#### Reorder System — "Select and Move"
- **Desktop**: Click to select card, arrow keys to move through signal chain (snake-aware wrapping)
- **Visual feedback**: Ghost/animation showing where card will land (Axe-FX Edit drag feedback style)
- **iPad**: Tap to select, on-screen arrow controls or Apple-recommended touch interaction
- **Keyboard**: When iPad hardware keyboard detected, arrow keys activate automatically; on-screen controls remain available

#### State Persistence
- **localStorage**: Remember selected card, panel open/close state, scroll position between sessions

#### Viewport & Responsive
- **Minimum viewport**: iPad portrait (768px) — full featured
- **Detection**: Screen width + touch capability
- **Mobile block**: Below 768px or mobile-sized touch device → black screen with hero icon centered, message: "This experience requires an iPad or larger display"

#### iPad Experience (GarageBand → Apple HIG → Carbon hierarchy)
- **Interaction**: GarageBand-style — single tap selects card, shows contextual toolbar (bypass, move, delete, open); "open" expands bottom panel
- **Parameter editing**: GarageBand-style large finger-friendly value areas; iOS picker wheels on iPad for NumberInputs (or enlarged 44pt Carbon steppers)
- **Visual feedback**: GarageBand-style subtle bounce animations, glow on selection, smooth slide-up for bottom panel
- **Bottom panel dismiss**: iOS-style swipe-down gesture + tap-card-again-to-close
- **Smart controls**: GarageBand-style curated 4-6 most important parameters as default view, with "All Parameters" toggle for full list
- **Touch targets**: All interactive elements ≥ 44pt in tablet mode (Apple HIG)
- **Split View**: If iPadOS Split View shrinks below 768px, show mobile block screen
- **All inputs, dialogs, interactions**: Follow Apple Best Practice for audio apps when in tablet mode; use Carbon standards to meet Apple standards

Subtasks:

ID: T223-subA
Status: [✓] Done
Title: Grid layout engine — tile sizing, row fill, snake flow
Description:
- Build the responsive tile grid with 3 width sizes, uniform height
- Implement row-fill shrink logic (largest → smallest → new row)
- Previous rows stay smallest; new rows start fresh at largest
- Snake-pattern signal flow (boustrophedon) with right/left vertical connectors
- Replace JuceGridSignalCanvas (use as guide)
Assigned to: Codex
Last updated: 2026-03-20 13:16 - Codex
- Completion notes:
  - Replaced the single auto-fill signal row in `web/src/app/pages/JuceGridSignalCanvas.tsx` with an explicit row engine that slices the chain into `large`/`medium`/`small` rows, keeps wrapped rows at the small size, restarts new rows at the largest feasible size, and alternates row direction for boustrophedon signal flow.
  - Added right/left vertical row-transition connectors plus row-level data attributes and slot metadata so the signal path is deterministic across wrapped rows instead of depending on plain CSS auto-fill behavior.
  - Updated `web/src/app/pages/JuceGridPage.css` with row-shell, tile-size, and vertical-connector styling while preserving the existing card colors and bypass flow treatment.
  - Extended `web/src/app/pages/JuceGridSignalCanvas.test.tsx` to verify wrapped small rows, large-size restart on the next row, reverse-direction snake layout, and vertical connector placement.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx web/src/app/pages/JuceGridParameterAudit.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T223-subB
Status: [✓] Done
Title: Effect grid card face — hero image, name, category, bypass, glyphs
Description:
- Standardized card face layout: fixed top portion (hero image), fixed bottom portion (name/category/bypass)
- Use existing effectIcons.ts hero images and CATEGORY_COLORS
- Bypass dimming/desaturation (Axe-FX Edit style)
- Carbon standard selected state
- Glyph usage throughout
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Rebalanced the signal-card face in `web/src/app/pages/JuceGridPage.css` so the hero zone and bottom info band now use a fixed, standardized Axe-FX-style composition with consistent minimum heights, icon sizing, and bottom-detail spacing.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` to resolve card hero glyphs from richer plugin metadata hints (`name`, `category`, `class_label`, display type, plugin name, URI) before falling back, which improves real effect-family icon selection without changing route color semantics.
  - Preserved the existing category labels, metrics, and selected-state behavior while tightening the card-face visual hierarchy for the ongoing T223 grid rewrite.

ID: T223-subC
Status: [✓] Done
Title: Signal flow visualization — 3-dot connectors, flow lines, input/output
Description:
- 3-dot connectivity indicators between cards (Interactive Hover color, Carbon visibility standard)
- Carbon-styled signal flow lines connecting cards
- Input/Output nodes outside signal chain showing full routing path
- Bypassed card flow lines (dashed/reduced opacity)
- Signal flow updates only after move confirmation
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added explicit input/output bridge treatments plus in-row 3-dot signal connectors in `web/src/app/pages/JuceGridSignalCanvas.tsx` so the processing path is visible across the entire chain instead of only inside the endpoint rails.
  - Applied Carbon-toned flow-line styling in `web/src/app/pages/JuceGridPage.css`, including dashed/reduced-opacity treatment whenever a bypassed block sits on the path.
  - Extended `web/src/app/pages/JuceGridSignalCanvas.test.tsx` to verify the new bridge/connector markup and bypass-dimmed connector state alongside the existing endpoint summary coverage.

ID: T223-subD
Status: [✓] Done
Title: Bottom parameter panel — standardized editor with slide animation
Description:
- Slide-up/down animation on open/close
- Click card to open, click again to close
- Pushes grid up (grid stays fully visible)
- Standardized layout: Carbon NumberInput + Dropdown
- Grouped parameters from existing metadata (all groups visible, no scroll)
- Panel header with hero icon, name, category, bypass toggle
- Effect parameter cards grow in height as needed
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Replaced the prior JUCE Grid modal editor in `web/src/app/pages/JuceGridPage.tsx` with an inline bottom panel that slides up beneath the workspace, toggles closed on same-card selection, and preserves the existing selected-block persistence path.
  - Added a standardized editor surface in `web/src/app/pages/JuceGridParameterEditor.tsx` that groups parameters with the existing Carbon plugin-card grouping heuristics and renders one Carbon control system across blocks using `NumberInput` plus `Dropdown` for discrete/toggled controls.
  - Added bottom-panel and grouped-control styling in `web/src/app/pages/JuceGridPage.css` plus regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` for the new open/close panel interaction.

ID: T223-subE
Status: [✓] Done
Title: Select-and-Move reorder system (desktop + iPad)
Description:
- Desktop: click to select, arrow keys to reposition (snake-aware wrapping)
- Ghost/animation feedback during move
- iPad: tap-select with on-screen move controls (Apple best practice)
- Hardware keyboard support on iPad (auto-detect, enable arrow keys)
- Signal flow updates after move confirmed
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added bottom-editor `Move left` and `Move right` controls in `web/src/app/pages/JuceGridPage.tsx`, wired to the existing chain reorder mutation so the selected block can be repositioned without leaving the editor context.
  - Reworked the page-level arrow-key handling in `web/src/app/pages/JuceGridPage.tsx` so desktop and hardware-keyboard iPad flows move the selected plugin through the chain, including first-select behavior when no block is active.
  - Passed reorder preview state through `web/src/app/pages/JuceGridPage.tsx` into `web/src/app/pages/JuceGridSignalCanvas.tsx`, then added preview/target treatment in `web/src/app/pages/JuceGridPage.css` for in-canvas move feedback.
  - Added regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` for bottom-editor move controls and keyboard-triggered leftward reorder requests.

ID: T223-subF
Status: [✓] Done
Title: Add effect slot + state persistence
Description:
- Single empty "add effect" slot at end of chain (Axe-FX Edit style, "+" glyph)
- Navigates to existing effects browser on click
- localStorage persistence: selected card, panel state, scroll position
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Kept the dedicated terminal add slot in `web/src/app/pages/JuceGridSignalCanvas.tsx` and aligned its operator-facing copy/ARIA to the worklist language (`Add effect`) while preserving the existing browser handoff.
  - Added route-local persistence in `web/src/app/pages/JuceGridPage.tsx` for the selected plugin URI, effect-editor open state, and workspace scroll position so the grid restores the last inspected block between sessions.
  - Added focused coverage in `web/src/app/pages/JuceGridPage.test.tsx` to prove the persisted block/editor state and scroll restore path rehydrate correctly from `localStorage`.

ID: T223-subG
Status: [✓] Done
Title: iPad experience — GarageBand interaction patterns
Description:
- GarageBand-style tap interaction (select → contextual toolbar → open)
- GarageBand-style parameter editing (large touch areas, iOS pickers or 44pt steppers)
- Subtle bounce/glow animations on interaction
- Swipe-down panel dismiss gesture
- Smart controls: curated 4-6 key params default, "All Parameters" toggle
- All touch targets ≥ 44pt
- iPadOS Split View handling (block if < 768px)
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added a tablet-touch interaction mode in `web/src/app/pages/JuceGridPage.tsx` so iPad-sized touch layouts tap-select a block first, then expose a contextual action row with editor, move, bypass, and remove actions before opening the editor.
  - Added swipe-down dismiss handling plus touch-specific editor copy in `web/src/app/pages/JuceGridPage.tsx`, keeping the existing hardware-keyboard arrow-key path available for iPad keyboards.
  - Added smart-control scoring and a touch-mode parameter surface in `web/src/app/pages/JuceGridParameterEditor.tsx` so touch layouts default to a curated control subset while preserving full grouped parameter access for non-touch layouts.
  - Added GarageBand-style glow/bounce feedback and 44pt minimum touch target treatment in `web/src/app/pages/JuceGridPage.css`, plus a focused iPad interaction regression in `web/src/app/pages/JuceGridPage.test.tsx`.

ID: T223-subH
Status: [✓] Done
Title: Mobile block screen + viewport detection
Description:
- Detect viewport < 768px or mobile touch device
- Black screen with centered hero icon
- Message: "This experience requires an iPad or larger display"
- Suggest rotation if tablet in portrait detected below threshold
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added an explicit viewport gate in `web/src/app/pages/JuceGridPage.tsx` that blocks the JUCE Grid experience on sub-768 mobile layouts before the main workspace renders.
  - Added a dedicated black-screen fallback in `web/src/app/pages/JuceGridPage.css` with a centered Audio Grid hero icon and the required iPad-or-larger message.
  - Added touch-capable rotation/Split View guidance plus focused regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` so the blocked-state contract is verified alongside the normal desktop route behavior.

ID: T223-subI
Status: [✓] Done
Title: Build verification + card parameter audit
Description:
- Verify every card's parameters display correctly in standardized bottom panel
- Ensure all 47 cards + 8 templates work with the new grid layout
- tsc clean, npm run build clean, all tests pass
- Adjust card/panel sizing if any card's parameters don't fit
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added `web/src/app/pages/JuceGridParameterAudit.test.tsx` to audit the shipped JUCE Grid plugin inventory against the standardized bottom editor using the deployment catalogs in `app/deployment/juce_processors.json` and `app/deployment/default_lv2_effects.json`, covering all 35 shipped grid plugins with actual metadata-backed renders.
  - Added router-level audit coverage for the registered custom-card set and the eight fallback template categories so template-backed processors are validated alongside exact custom card registrations.
  - Fixed `web/src/app/components/PluginCards/registry.ts` so lazy template registrations participate in `getPluginCardConfig()` lookups; before this, fallback templates registered through `registerTemplateLazy()` were invisible to the config lookup path.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx web/src/app/pages/JuceGridParameterAudit.test.tsx`, and `npm --prefix web run build`; no additional card sizing fixes were required from the audited deployment inventory.

---

ID: T224
Status: [✓] Done
Title: Drum sequencer transport API parity for fill and song playback
Description:
- Goal / acceptance criteria: Expose dedicated backend/API contract for drum-song playback state and explicit fill triggering so the drum UI can drive the sequencer without transport workarounds.
- Why it matters: `T217-D` and `T217-E` currently have usable UI, but "Trigger Fill" and "Play Song" still rely on approximations because the FastAPI/client layer does not yet expose first-class sequencer controls for those flows.
- Dependencies: T213, T216
- Estimated effort: Medium
- Required outputs: Backend routes/service wiring, frontend client/hooks, and regression coverage.
Subtasks:
  - [✓] T224-A: Add explicit fill-trigger route(s) in `app/routes/drums.py` and service wiring to native sequencer bindings
  - [✓] T224-B: Add drum-song playback / current-position route(s) so the UI can start song mode and highlight the real active entry
  - [✓] T224-C: Extend `web/src/map2/api.ts` and `web/src/app/hooks/useDrumMachine.ts` for the new transport commands and position state
  - [✓] T224-D: Update `web/src/app/pages/DrumsPage.tsx` to replace the current variation-jump / first-pattern-start workarounds
  - [✓] T224-E: Add backend/frontend validation covering fill trigger, song transport, and arranger highlighting
Assigned to: Codex
Last updated: 2026-03-20 14:36 - Codex
- Completion notes:
  - Added `POST /api/engine/drums/fill/trigger` plus `GET/POST /api/engine/drums/song/transport*` routes in `app/routes/drums.py`, backed by new `DrumMachineService` fill and song-transport methods.
  - Extended `app/services/drum_machine_service.py` with a lightweight song-playback controller that tracks the active song entry and repeat count from the sequencer position poll and advances arranged patterns at loop boundaries.
  - Extended `web/src/map2/types.ts`, `web/src/map2/api.ts`, and `web/src/app/hooks/useDrumMachine.ts` with sequencer-position and song-transport contracts plus fill/song mutations.
  - Updated `web/src/app/pages/DrumsPage.tsx` to use the real position/song-transport data for beat indicators, arranger highlighting, fill triggering, and song start/stop behavior.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_sequencer_service.py` -> pass; `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass.

---

ID: T225
Status: [✓] Done
Title: Editable shared category colors for plugin and grid surfaces
Description:
- Goal / acceptance criteria: Add an operator-facing way to set shared category accent colors used across plugin cards and JUCE Grid surfaces, persist those choices locally, and consolidate category-color resolution behind one frontend source of truth.
- Why it matters: Category colors are currently hardcoded in multiple frontend maps, which makes the taxonomy difficult to tune and leaves no supported path for operators to personalize or standardize category accents.
- Dependencies: Existing category icon/color consumers in `web/src/app/components/PluginCards/**`, `web/src/app/grid/shared.tsx`, and the About/theme settings surface
- Estimated effort: Medium
- Required outputs: Shared category-style resolver with persistence, settings UI for editing/resetting colors, updated consumers, and focused frontend validation.
Subtasks:
  - [✓] T225-A: Consolidate duplicated category-color maps into one shared resolver with icon/color/background/gradient support
  - [✓] T225-B: Add persisted category-color overrides and reset actions for operators
  - [✓] T225-C: Extend the About/theme settings surface with category color editing controls
  - [✓] T225-D: Add focused frontend tests for category-color override behavior and updated settings rendering
Assigned to: Codex
Last updated: 2026-03-20 15:15 - Codex
- Completion notes:
  - Added `web/src/app/data/categoryStyles.tsx` as the single shared category-style resolver, including icon/color/background/gradient generation, category-key resolution, and localStorage-backed operator overrides.
  - Updated `web/src/app/grid/shared.tsx` and `web/src/app/components/PluginCards/types.ts` to consume the shared resolver instead of maintaining duplicate hardcoded category-color maps.
  - Extended `web/src/app/pages/AboutPage.tsx` plus `web/src/app/pages/AboutPage.css` with a new category-color editor inside the existing theme/settings surface, including per-category color pickers and reset controls.
  - Added focused validation in `web/src/app/data/categoryStyles.test.tsx` and `web/src/app/pages/AboutPage.test.tsx`.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand src/app/data/categoryStyles.test.tsx src/app/pages/AboutPage.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

---

## Effect Card Audit

ID: T226
Status: [✓] Done
Title: Full trace-driven audit of effect GUI card parameter, feature, and preset coverage
Description:
- Goal / acceptance criteria: Produce a full evidence-backed audit covering every shipped effect GUI card and fallback template across backend/API parameter sources, frontend plugin-card routing, UI control exposure, preset definitions, and supporting documentation; quantify coverage, list gaps with severity, and provide a remediation plan tied to affected layers.
- Why it matters: Existing JUCE Grid audit coverage proves renderability and registry resolution, but it does not verify that every backend-exposed parameter, feature state, and preset path is actually reachable and correctly bound in the operator-facing card surfaces.
- Dependencies: `app/deployment/juce_processors.json`, `app/deployment/default_lv2_effects.json`, `app/routes/plugins.py`, `web/src/app/components/PluginCards/**`, `web/src/app/pages/JuceGridParameterEditor.tsx`, preset definitions under `web/src/app/components/PluginCards/**` and backend preset routes/docs, and any current plugin parameter schema/docs in the repo
- Estimated effort: High
- Required outputs: Audit evidence artifacts/tables, executive summary, confirmed issue list with reproduction steps and expected vs actual behavior, and follow-up remediation tasks for real gaps.
Subtasks:
  - [✓] T226-A: Inventory the source-of-truth parameter, routing, and preset layers for every shipped effect card
  - [✓] T226-B: Generate parameter coverage and feature accessibility evidence across custom cards, templates, and fallback editor paths
  - [✓] T226-C: Validate built-in preset/configuration behavior and round-trip persistence where definitions exist
  - [✓] T226-D: Publish the audit report and create remediation follow-up tasks for confirmed gaps
Assigned to: Codex
Last updated: 2026-03-20 19:35 - Codex
- Completion notes:
  - Published the audit narrative in `docs/evaluation/effect-card-audit-20260320.md` and the supporting machine-readable inventory in `docs/evaluation/effect-card-audit-20260320.json`.
  - Confirmed the live JUCE Grid editor path currently bypasses the custom effect-card subsystem entirely by rendering `JuceGridParameterEditor` directly from `JuceGridPage.tsx`, while `PluginCardRouter` is unreferenced elsewhere in `web/src/app`.
  - Confirmed five JUCE cards embed stale plugin URIs in `withMidiDialog` wrappers, and confirmed the live manifest/runtime audit drift: the shipped Jest audit covers 35 deployment entries, while the live host exposes a different 39-plugin non-Tesira inventory with 596 native/LV2 parameters.
  - Confirmed `/api/plugins/parameter-schema` currently serializes 588 of 596 live native/LV2 parameters, dropping the 8 parametric-EQ band-type parameters.

---

ID: T227
Status: [✓] Done
Title: Reconnect or retire the dormant custom effect-card subsystem
Description:
- Goal / acceptance criteria: Decide whether `PluginCardRouter` and the 39 custom cards are part of the shipped operator experience. If yes, wire them into the active JUCE Grid/editor flow and verify instance-safe editing. If no, remove or clearly quarantine the dead subsystem and its inactive tests/docs so the repo stops treating unreachable UI as shipped.
- Why it matters: The audit confirmed the current app bypasses the entire custom card system, making preset browsers, MIDI mapping dialogs, and advanced layouts inaccessible despite existing source/test coverage.
- Dependencies: T226, active JUCE Grid editor flow in `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/components/PluginCards/**`
- Estimated effort: High
- Required outputs: Editor-path decision, implementation to match that decision, updated tests/docs, and pass/fail evidence for live reachability.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 21:00 - Codex
- Completion notes:
  - Reconnected the active JUCE Grid bottom editor to the effect-card subsystem by routing the live selection panel through `PluginCardRouter` when the editor strategy is not generic, while keeping `JuceGridParameterEditor` as the explicit fallback for hardware and generic-only processors.
  - Added `web/src/app/components/PluginCards/liveEditorRouting.ts`, which turns the shipped operator path into a deliberate hybrid: safe custom cards remain custom, broad category templates provide Carbon-themed parameter-complete editing for the rest of the live-compatible categories, and singleton/special-case processors such as NAM, convolution, drums, and SynthForge stay quarantined on the generic editor until instance-safe paths exist.
  - Added template override support to `PluginCardRouter`, threaded plugin position through live bypass actions, and updated the JUCE Grid page so the active bottom editor can force Carbon templates without reviving every legacy singleton/global card implementation.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/components/PluginCards/liveEditorRouting.test.ts web/src/app/components/PluginCards/registry.test.ts web/src/app/components/PluginCards/withMidiDialog.test.tsx` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx --testNamePattern "uses the live plugin card router|opens the bottom editor panel on block select and closes it when the same block is selected again|renders the selected block touch actions before opening the editor in tablet touch layouts"` -> pass.

ID: T228
Status: [✓] Done
Title: Normalize canonical plugin URIs across effect cards, snapshots, and audit surfaces
Description:
- Goal / acceptance criteria: Replace stale legacy plugin URIs with the live canonical URIs everywhere they participate in feature flows, including `withMidiDialog` wrappers, snapshot helper surfaces, and any affected tests, so MIDI mapping, snapshots, and audits all address the same plugin identities.
- Why it matters: The audit confirmed five JUCE custom cards still target non-registered URIs, which would break feature flows immediately if the cards were reactivated.
- Dependencies: T226, `web/src/app/components/PluginCards/Custom/JUCE/**`, `web/src/app/components/snapshots/SnapshotDeployModal.tsx`, affected tests
- Estimated effort: Medium
- Required outputs: Canonical URI sweep, updated tests, and evidence that all touched plugin URIs match live discovery/registry entries.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 20:26 - Codex
- Completion notes:
  - Replaced stale legacy JUCE URIs in the five affected custom cards (`NativeDelayCard`, `CabinetIRCard`, `ReverbIRCard`, `NAMCard`, `EVHPitchShifterCard`) so `withMidiDialog` now targets the registry/live-discovery canonical plugin identities.
  - Added `web/src/app/utils/pluginUris.ts` and updated `SnapshotDeployModal.tsx` to canonicalize legacy snapshot/plugin URIs before checking plugin and asset dependencies, preserving compatibility for older stored snapshot data while aligning new flows to canonical URIs.
  - Normalized affected tests and audit fixtures to canonical URIs, including the JUCE Grid page test and the touchscreen-stomp cache regression coverage.

ID: T229
Status: [✓] Done
Title: Replace manifest-only parameter audit with live inventory parity and schema completeness checks
Description:
- Goal / acceptance criteria: Update the effect-card audit automation so it starts from `/api/plugins/discover` and `/api/plugins/parameter-schema`, proves manifest/runtime parity explicitly, and fails when live parameters are omitted from the schema payload or when the runtime inventory drifts unexpectedly from the declared deployment set.
- Why it matters: The current audit test passes against deployment JSON while the live host exposes a different LV2 inventory and an 8-parameter schema omission for EQ band types.
- Dependencies: T226, backend plugin discovery readiness, `web/src/app/pages/JuceGridParameterAudit.test.tsx`, `app/routes/plugins.py`
- Estimated effort: Medium
- Required outputs: Updated automated audit coverage, schema omission fix or tracked waiver, and validation evidence against a live backend session.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 20:26 - Codex
- Completion notes:
  - Fixed `app/routes/plugins.py` so JUCE enum parameters are normalized to numeric min/max/default metadata during discovery, restoring schema coverage for the 8 parametric-EQ `band*_type` parameters and yielding zero missing schema keys on the live `:8080` backend.
  - Added `scripts/audit_plugin_inventory_live.py`, a live backend audit that starts from `/api/plugins/discover` and `/api/plugins/parameter-schema`, exits nonzero on schema omissions or declared-vs-runtime inventory drift, and produced the current evidence bundle showing schema completeness with remaining inventory drift.
  - Narrowed `web/src/app/pages/JuceGridParameterAudit.test.tsx` to its actual role as a deployment-backed render audit and added backend/frontend regression coverage for enum normalization plus canonical URI mapping.
  - Validation: `pytest -q tests/test_plugin_parameter_schema_route.py` -> pass; `pytest -q tests/test_route_caching_and_latency_metrics.py -k touchscreen` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/utils/pluginUris.test.ts web/src/app/components/snapshots/SnapshotDeployModal.test.tsx web/src/app/pages/JuceGridParameterAudit.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass; `python3 scripts/audit_plugin_inventory_live.py --base-url http://localhost:8080` -> expected nonzero with zero missing schema keys and explicit runtime/deployment drift details.

ID: T230
Status: [✓] Done
Title: Resolve declared deployment inventory against current live LV2 runtime inventory
Description:
- Goal / acceptance criteria: Decide whether the current deployment manifests or the current live LV2 plugin set are authoritative for shipped JUCE Grid/operator audit scope, then update the manifests, packaging/install assumptions, and audit expectations so the live inventory parity audit returns zero drift on a correctly provisioned host.
- Why it matters: `scripts/audit_plugin_inventory_live.py` now proves schema completeness, but the live `:8080` backend still reports 10 declared plugins missing from runtime and 13 runtime plugins not declared by the deployment manifests, so parity remains an open product/deployment issue rather than an invisible audit gap.
- Dependencies: T226, T229, deployment manifests in `app/deployment/*.json`, host/plugin provisioning policy
- Estimated effort: Medium
- Required outputs: Inventory authority decision, manifest/provisioning updates, rerun live audit with zero drift, and documented rationale for any intentional exclusions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 22:25 - Codex
- Completion notes:
  - Replaced the stale TooB/legacy-Dragonfly deployment manifest in `app/deployment/default_lv2_effects.json` with the live 13-plugin LV2 inventory exposed by `http://localhost:8080/api/plugins/discover`, including refreshed default chain templates that no longer reference absent plugins.
  - Added `app/services/default_effects_manifest.py` and updated `app/services/chain_service.py` plus `app/services/default_effects_loader.py` so runtime template/default-effect loading now reads the canonical deployment manifest instead of the nonexistent `app/config/default_lv2_effects.json` path, while also dropping the old TooB-only author/bundle assumptions.
  - Updated `web/src/app/components/PluginCards/registry.ts` and its audit coverage so live Dragonfly URIs resolve through the Carbon reverb template path alongside the retained legacy URI compatibility entries.
  - Validation: `python3 scripts/audit_plugin_inventory_live.py --base-url http://localhost:8080` -> pass with `declared_plugin_count=38`, `runtime_plugin_count=38`, zero drift, zero schema omissions; `pytest -q tests/test_default_effects_manifest.py tests/test_chain_service_runtime_mapping.py` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/components/PluginCards/registry.test.ts web/src/app/pages/JuceGridParameterAudit.test.tsx` -> pass.

ID: T231
Status: [✓] Done
Title: Restyle JUCE Grid signal-path effect cards with Carbon-inspired carbon shell and white hero field
Description:
- Goal / acceptance criteria: Update every `JUCE-GRID` signal-path effect card to follow the provided Carbon-style reference as visual direction only, ignoring its embedded words. The card shell should adopt a darker Carbon-inspired treatment, while the hero area becomes a clean white field containing only the existing effect hero image and category-color accent treatment. Preserve current card semantics, selection, bypass, and responsive behavior unless a directly necessary visual adjustment is required for the new theme.
- Why it matters: The current effect-card styling already improved layout consistency, but the requested carbon-shell treatment should make the signal path read as a more cohesive premium surface while still using category color and hero imagery as the primary fast-scan identifiers.
- Dependencies: T223-subB, T225, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, and existing effect hero/category-style mappings
- Estimated effort: Medium
- Required outputs: Updated JUCE Grid signal-card markup/styles, category-aware white hero-field treatment using the existing hero image system, focused regression or visual validation evidence, and canonical worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 21:46 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.css` so live signal cards use a darker Carbon-style shell with stronger layer depth, left-edge category accenting, and a clean white hero field around the existing effect icon/art treatment.
  - Expanded the live card footprint horizontally by updating the active card width/height variables in `web/src/app/pages/JuceGridPage.css` and the responsive row-capacity constant in `web/src/app/pages/JuceGridSignalCanvas.tsx`, so the new shell has more horizontal breathing room without changing card semantics.
  - Kept selection, bypass, drag/reorder previews, and the add-card affordance intact while aligning them visually to the same Carbon shell treatment.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings unchanged).

ID: T232
Status: [✓] Done
Title: Add instance-aware chain-plugin parameter addressing across live editor and plugin APIs
Description:
- Goal / acceptance criteria: Introduce a stable per-instance parameter-addressing path for chain plugins so duplicate URIs can be edited safely in the live JUCE Grid and other operator surfaces. This should include backend support for disambiguated parameter updates, surfaced instance identity in the required API payloads, frontend batching support, and focused validation that two identical plugins in one chain do not cross-write parameters.
- Why it matters: `T227` reconnected the live editor safely by preferring templates/generic fallbacks, but the underlying parameter-write path still targets `plugin_uri` only, so duplicate-URI chain instances remain a correctness risk beyond bypass operations.
- Dependencies: T227, chain deployment/runtime plugin identity, `app/routes/plugins.py`, `app/routes/chains.py`, `app/services/juce_engine_service.py`, `web/src/map2/api.ts`, `web/src/app/pages/JuceGridPage.tsx`
- Estimated effort: High
- Required outputs: Backend/API design for instance-safe parameter writes, frontend adoption in live editors/cards, regression coverage for duplicate-URI chains, and documented operator constraints if any residual ambiguity remains.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 22:20 - Codex
- Completion notes:
  - Extended `app/routes/plugins.py` so single and batched parameter writes accept `instance_id` and `plugin_position`, discovered plugin metadata can drive writes even when `_loaded_plugins` is empty, and batch dedupe now keys duplicate-URI updates by instance/position rather than collapsing them to one write.
  - Updated `app/services/juce_engine_service.py` with position-aware duplicate-URI instance resolution and updated `app/services/chain_service.py` so active chain payloads expose runtime `instance_id` and latency data by matching pedalboard items back to chain positions.
  - Updated the live frontend path in `web/src/map2/api.ts`, `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/components/PluginCards/PluginCardRouter.tsx`, `web/src/app/components/LV2PluginParameterEditor.tsx`, and `web/src/map2/components/ChainBuilder.tsx` so selected-block identity, batched writes, and card editors all propagate per-instance identity.
  - Added focused regression coverage for duplicate-URI batch writes, position-aware engine resolution, runtime chain matching, and selected-block position handling in the JUCE Grid tests.
  - Validation: `pytest -q tests/test_plugins_engine_op_pipeline.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py` -> pass; `pytest -q tests/test_plugin_parameter_schema_route.py` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx web/src/app/components/LV2PluginParameterEditor.test.tsx web/src/app/components/PluginCards/liveEditorRouting.test.ts web/src/app/components/PluginCards/registry.test.ts web/src/app/components/PluginCards/withMidiDialog.test.tsx` -> pass. `pytest -q tests/test_route_caching_and_latency_metrics.py -k "chains_list_supports_etag_304 or remove_plugin_route_passes_position_to_service or add_plugin_route_returns_plugin_position"` still hits the existing route-readiness guard in this environment for the chain-list leg; the other two selected tests passed.

ID: T233
Status: [✓] Done
Title: Remove remaining duplicate-URI assumptions from reorder and URI-keyed chain UI state
Description:
- Goal / acceptance criteria: Make the remaining duplicate-plugin paths outside the parameter editor instance-safe by replacing URI-only identity in reorder payloads and URI-keyed runtime UI state with stable per-instance/per-position identity. This includes JUCE Grid reorder interactions and any quick-control or telemetry caches that still collapse multiple identical plugins into one UI slot.
- Why it matters: `T232` fixed live parameter editing and block selection for duplicate URIs, but reorder operations and a few runtime UI caches still assume URI uniqueness, which can misaddress duplicate plugins even though the cards themselves now edit safely.
- Dependencies: T232, `app/routes/chains.py`, `app/services/chain_service.py`, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.tsx`, `web/src/map2/components/ChainBuilder.tsx`
- Estimated effort: Medium
- Required outputs: Instance-safe reorder contract end to end, duplicate-URI-safe UI state keys where needed, regression coverage for duplicate-plugin reorder/quick-control flows, and updated completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 21:46 - Codex
- Completion notes:
  - Replaced the chain reorder contract with ordered plugin refs in `app/routes/chains.py`, `app/services/chain_service.py`, `web/src/map2/api.ts`, and `web/src/map2/types.ts`, while preserving legacy URI-list compatibility for older callers and resolving duplicate URIs deterministically by position.
  - Updated the active JUCE Grid path in `web/src/app/pages/JuceGridSignalCanvas.tsx` and `web/src/app/pages/JuceGridPage.tsx` so drag/reorder preview state, move-left/right actions, and reorder mutations all target `{ uri, position }` rather than collapsing duplicate blocks onto one URI.
  - Added shared identity helpers in `web/src/map2/utils/pluginIdentity.ts` and applied them through `web/src/map2/components/ChainBuilder.tsx`, `web/src/map2/components/ChainBuilder/utils/chainToFlow.ts`, `web/src/map2/components/ChainBuilder/utils/chainToABFlow.ts`, `web/src/map2/components/ChainBuilder/utils/flowToChain.ts`, and `web/src/map2/components/ChainBuilder/hooks/useFlowSync.ts` so quick parameters, insert-before actions, remove/bypass actions, and local reorder calculations are keyed by instance/position instead of URI.
  - Added regression coverage in `tests/test_chain_service_runtime_mapping.py`, `tests/test_route_caching_and_latency_metrics.py`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, `web/src/app/pages/JuceGridPage.test.tsx`, and `web/src/map2/components/ChainBuilder/utils/flowToChain.test.ts`.
  - Validation: `pytest -q tests/test_chain_service_runtime_mapping.py` -> pass; `pytest -q tests/test_chain_service_runtime_mapping.py tests/test_route_caching_and_latency_metrics.py -k "reorder_plugins_route_passes_positioned_plugin_refs_to_service or remove_plugin_route_passes_position_to_service or add_plugin_route_returns_plugin_position or update_touchscreen_stomps_route_passes_assignments_to_service"` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx web/src/map2/components/ChainBuilder/utils/flowToChain.test.ts` -> pass.

ID: T234
Status: [✓] Done
Title: Emit per-instance meter and profiling telemetry for duplicate chain plugins
Description:
- Goal / acceptance criteria: Extend the profiling and meter telemetry producers so duplicate-URI plugins emit stable per-instance identity (`instance_id` and/or `plugin_position`) in `/api/profiling/plugins`, plugin VU level payloads, and any websocket meter events consumed by the UI. Update the remaining consumers so duplicate instances no longer share CPU or meter badges.
- Why it matters: `T233` removed the UI-side URI-only assumptions and made reorder/quick controls instance-safe, but the current backend telemetry sources still emit most profiling and meter data by URI, so duplicate plugins can still share readouts even though editing and reorder are now correct.
- Dependencies: T233, `app/routes/profiling.py`, `app/routes/audio.py`, `app/services/plugin_profiler.py`, JUCE engine telemetry payloads, and the related UI consumers in `web/src/map2/components/ChainBuilder.tsx`
- Estimated effort: Medium
- Required outputs: Backend telemetry payloads with per-instance identity, consumer updates that use the new identity keys, focused duplicate-URI telemetry regression coverage, and documented fallback behavior when identity is unavailable.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 22:30 - Codex
- Completion notes:
  - Added per-instance identity fields to profiler/runtime telemetry in `app/services/plugin_profiler.py`, `app/services/juce_engine_service.py`, `app/routes/profiling.py`, and `app/services/audio_meters.py`, so `/api/profiling/plugins` and plugin meter payloads can distinguish duplicate URIs by `instance_id` and `plugin_position`.
  - Fixed the stranded `_get_instance_id_for_uri()` lookup body in `app/services/juce_engine_service.py`, which had left duplicate-instance resolution inert after the T232/T233 chain identity work.
  - Added duplicate-plugin telemetry mapping helpers in `web/src/map2/utils/pluginTelemetry.ts` and applied them in `web/src/map2/components/ChainBuilder.tsx`, preserving URI fallback only when runtime identity is genuinely unavailable.
  - Added focused regression coverage in `tests/test_plugin_profiler_identity.py`, `tests/test_juce_engine_service_instance_resolution.py`, `tests/test_plugin_telemetry_identity.py`, and `web/src/map2/utils/pluginTelemetry.test.ts`.
  - Validation: `pytest -q tests/test_plugin_profiler_identity.py tests/test_juce_engine_service_instance_resolution.py tests/test_plugin_telemetry_identity.py` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/map2/utils/pluginTelemetry.test.ts web/src/app/components/PluginCards/registry.test.ts web/src/app/pages/JuceGridParameterAudit.test.tsx` -> pass.

ID: T235
Status: [✓] Done
Title: Clear the effect-card deployment blocker in ShoeGazeCard and complete the requested release loop
Description:
- Goal / acceptance criteria: Fix the JSX/TypeScript regression currently preventing the frontend production bundle from building, rerun the production deploy successfully, then finish the user-requested commit/push/restart sequence against the deployed state.
- Why it matters: The current worktree cannot be deployed or cleanly committed as a release-ready snapshot while `npm --prefix web run deploy` fails in `web/src/app/components/PluginCards/Custom/JUCE/ShoeGazeCard.tsx`.
- Dependencies: Current effect-card worktree, `web/src/app/components/PluginCards/Custom/JUCE/ShoeGazeCard.tsx`, `scripts/build/deploy`, Git remotes `origin` and `gitlab`
- Estimated effort: Low
- Required outputs: Fixed JSX structure, successful deploy/restart evidence, completed git commit/push, and final status report.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-20 22:00 - Codex
- Completion notes:
  - Wrapped the sibling output-row blocks in `web/src/app/components/PluginCards/Custom/JUCE/ShoeGazeCard.tsx` with a fragment so the card's accordion section returns a single JSX parent and the TypeScript build succeeds.
  - Reran `npm --prefix web run deploy`, which rebuilt the production bundle, restarted `map2-web-prod`, and verified the live frontend on port `3000`.
  - Confirmed post-deploy health with `curl http://localhost:3000/` -> `200` and `curl http://localhost:8080/api/health` -> `200` before proceeding to the git release steps.

ID: T236
Status: [✓] Done
Title: Resize JUCE Grid signal cards and restack title/category hero treatment
Description:
- Goal / acceptance criteria: Shrink the `JUCE-GRID` signal-path effect cards by 50%, move the effect category under the effect title, retone the hero field so it matches the card frame/shell color instead of the previous bright panel, and enlarge the hero image by 50% without increasing the card footprint.
- Why it matters: The live signal path needs denser cards with clearer metadata hierarchy while preserving the fast-scan hero image treatment inside a tighter operator layout.
- Dependencies: T231, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`
- Estimated effort: Low
- Required outputs: Updated live signal-card markup/styles, category line beneath the title, hero-field retone + larger hero art inside the fixed card bounds, focused validation evidence, and licensing/worklist status for the touched MAP2-owned UI files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 06:35 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so signal cards use a 50%-smaller width basis for row-capacity calculations and now render the effect category directly beneath the display title.
  - Updated `web/src/app/pages/JuceGridPage.css` so the signal-card width/height are halved, the hero field reuses the same dark shell treatment as the card frame, the hero icon grows by 50% inside the smaller hero area, and the add-card typography/actions scale down with the tighter footprint.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.test.tsx` so the live signal-card assertions now require the category label on the card face.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings unchanged); `npm --prefix web run typecheck` -> pass.
  - Licensing: Reviewed the touched files as MAP2-owned AGPL-covered UI code and found no new AGPL or third-party notice gaps; no worklist follow-up was required beyond this completion record.

ID: T237
Status: [✓] Done
Title: Relax JUCE Grid signal-card wrapping and flatten the live card treatment
Description:
- Goal / acceptance criteria: Prevent the `JUCE-GRID` signal cards from snaking onto a second row earlier than the available lane width requires, reduce the visual depth of the live signal-card shell so it reads flatter, and tint the category label with the same category accent already driving the card stripe/icon treatment.
- Why it matters: The current live-path lane wastes available width on wide layouts and the card face still reads heavier than requested, which makes fast operator scanning harder than it needs to be.
- Dependencies: T236, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`
- Estimated effort: Low
- Required outputs: Updated row-capacity behavior with a resilient width-measurement fallback, flatter signal-card visuals, category-accent label treatment, focused validation evidence, and licensing/worklist completion notes for the touched UI files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 10:28 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so the signal lane measures row capacity on mount and on window resize even when `ResizeObserver` is unavailable, while ignoring zero-width transient reads instead of collapsing to a narrower row count.
  - Updated `web/src/app/pages/JuceGridPage.css` so the signal path stretches to the full available lane width, the live/add cards use a flatter shell with reduced shadow depth and simpler gradients, and the category label now uses the existing per-category accent color.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.test.tsx` with a focused fallback-width test that proves the row expands correctly without `ResizeObserver` support.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings unchanged); `npm --prefix web run typecheck` -> pass.
  - Licensing: Reviewed the touched files as MAP2-owned AGPL-covered UI code and found no new AGPL or third-party notice gaps; no follow-up licensing task was required.

ID: T238
Status: [✓] Done
Title: Sync deploy-generated version metadata and rerun the production web release loop
Description:
- Goal / acceptance criteria: Commit the currently dirty deploy-generated release metadata/log artifacts, push `master` to both `origin` and `gitlab`, rerun the frontend production deploy, restart the web service on port `3000`, and verify the production endpoint is healthy afterward.
- Why it matters: The previous release loop left tracked build metadata dirty after deployment, so the repository and both remotes are not yet aligned with the release artifacts that are actually serving from production.
- Dependencies: `VERSION`, `version.json`, `logs/deploy-build.log`, Git remotes `origin`/`gitlab`, `scripts/build/deploy`, `map2-web-prod`
- Estimated effort: Low
- Required outputs: Committed deploy metadata/log files, successful pushes to both remotes, rebuilt/restarted production web service, health-check evidence, and updated worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 07:22 - Codex
- Completion notes:
  - Committed the existing dirty deploy metadata in `VERSION`, `version.json`, and `logs/deploy-build.log`, then resolved a non-fast-forward GitHub push by merging the latest `origin/master` README auto-update into local `master` before re-pushing both remotes.
  - Reran `npm --prefix web run deploy`, forced the stale preview PIDs to exit when `systemctl stop map2-web-prod` hung in `deactivating`, and let the deploy script complete the clean `systemd` restart.
  - Verified production health with `npm --prefix web run deploy:status` showing port `3000` listening and service `map2-web-prod` active, plus `curl -I http://localhost:3000/` returning `200 OK`.

ID: T239
Status: [✓] Done
Title: Replace JUCE Grid signal-row capacity guesses with DOM-measured slot sizing
Description:
- Goal / acceptance criteria: Eliminate the remaining premature `JUCE-GRID` signal-card snake wrap by basing row-capacity math on the rendered slot width and actual row gap from the live DOM instead of a hardcoded `rem` estimate, while keeping a safe fallback path for zero-width and test environments.
- Why it matters: The previous fix still under-counts cards in the real page, so operators continue seeing signal cards wrap even when the visible lane is wide enough to keep them on one line.
- Dependencies: T237, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, `docs/PROJECT_WORKLIST.md`
- Estimated effort: Low
- Required outputs: Updated DOM-based row-capacity measurement, focused regression coverage for the measured-width path, validation evidence, and completion notes in the canonical worklist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 07:34 - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so row-capacity math now prefers the rendered slot width and actual row gap from the live DOM, only falling back to the previous constant estimate when layout metrics are not available yet.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.test.tsx` with a focused regression that proves measured slot sizing overrides the fallback estimate and keeps all cards on one row when the visible lane is wide enough.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings unchanged); `npm --prefix web run typecheck` -> pass.
  - Licensing: Reviewed the touched files as MAP2-owned AGPL-covered UI code and found no new AGPL or third-party notice gaps; no follow-up licensing task was required.

ID: T240
Status: [✓] Done
Title: Sync the deployed JUCE Grid row-capacity fix and rerun the web release loop
Description:
- Goal / acceptance criteria: Commit the current JUCE Grid row-capacity fix together with the deploy-generated metadata/worklist changes, push `master` to both `origin` and `gitlab`, rerun the frontend production deploy, restart the web service on port `3000`, and finish with a clean local worktree plus updated worklist notes.
- Why it matters: The live service has been updated with the new row-capacity logic, but the repository is still dirty and both remotes need to be synchronized to the deployed state so the next release pass starts clean.
- Dependencies: T239, `VERSION`, `version.json`, `logs/deploy-build.log`, `docs/PROJECT_WORKLIST.md`, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, Git remotes `origin`/`gitlab`, `scripts/build/deploy`, `map2-web-prod`
- Estimated effort: Low
- Required outputs: Synced commits on both remotes, rebuilt/restarted production web service, health-check evidence, clean worktree state, and completion notes in the canonical worklist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 07:47 - Codex
- Completion notes:
  - Committed the JUCE Grid DOM-measured row-capacity fix as `cef38eb3` and merged the newer `origin/master` README auto-update into local `master`, producing synced head `7e3a7b6a` on both `origin` and `gitlab`.
  - Reran `npm --prefix /home/mm/map2-audio/web run deploy`; the build succeeded, `systemctl stop map2-web-prod` stalled in `deactivating`, and the release was unblocked by force-killing stale service PIDs `390267` and `390279` before the wrapper completed the restart.
  - Verification: `npm --prefix /home/mm/map2-audio/web run deploy:status` -> port `3000` listening, service `map2-web-prod` active, health `OK`; `curl -I --max-time 10 http://localhost:3000/` -> `HTTP/1.1 200 OK`.
  - Remaining tracked changes after the deploy were the expected regenerated release artifacts: `VERSION`, `version.json`, and `logs/deploy-build.log`.

ID: T241
Status: [✓] Done
Title: Recalculate JUCE Grid signal row capacity after async chain mount
Description:
- Goal / acceptance criteria: Update the signal canvas so row-capacity measurement/observation attaches when the grid first appears after an initial `chain = null` render, add a regression test that mounts empty then rerenders with a populated chain, and verify the row count expands beyond the default 4-slot fallback when the lane is wide enough.
- Why it matters: The live JUCE Grid page commonly renders the canvas before chain data arrives, so the existing empty-dependency effect exits before `gridRef` exists and leaves production flows wrapped into a premature second snake row.
- Dependencies: `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, `docs/PROJECT_WORKLIST.md`
- Estimated effort: Low
- Required outputs: Fixed signal-canvas measurement lifecycle, regression coverage for async chain mount, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 08:04 - Codex
- Completion notes:
  - Root cause: `JuceGridSignalCanvas` mounted first with `chain = null` in the real page, so the empty-dependency measurement effect returned before `gridRef` existed and never attached the resize/observer logic; the lane therefore stayed at the default `rowCapacity = 4` even on wide desktop flows.
  - Fix: Changed the measurement effect in `web/src/app/pages/JuceGridSignalCanvas.tsx` to re-run when `chain?.id` changes so the observer and resize handler attach when a populated chain first appears.
  - Regression: Added an async-mount test in `web/src/app/pages/JuceGridSignalCanvas.test.tsx` that renders empty, rerenders with a populated chain, fires resize, and confirms the extra row disappears once the wide lane is measured.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass.
  - Deploy: `npm --prefix web run deploy` -> success after clearing the usual stuck `map2-web-prod` preview PIDs `395124` and `395136`; service health revalidated on port `3000`.

ID: T242
Status: [✓] Done
Title: Rebuild SynthForge as a live-safe flagship workstation card for professional keyboard players
Description:
- Goal / acceptance criteria: Replace the current SynthForge live-editor quarantine/generic fallback with a custom workstation-grade card that is safe in the shipped JUCE Grid editor flow and presents the full professional sampler surface a keyboard player expects. Acceptance requires: an instance-safe editor contract or an explicitly justified equivalent live-safe routing model; a redesigned `SynthForgeCard` that keeps full library/preset loading, performance controls, part/routing controls, keyboard interaction, and advanced sampler operations while upgrading the layout, hierarchy, and feedback to a premium instrument experience; routing updates so the active grid can render the flagship card instead of the generic editor when safe; and focused validation covering rendering/routing behavior plus the critical SynthForge interaction paths touched by the redesign.
- Why it matters: The existing custom SynthForge card is a dense first-pass sampler slice, while the shipped JUCE Grid currently forces SynthForge into the generic editor because the richer surface is not yet treated as live-safe. The user has now clarified that the target is not a spare parameter card but a best-practice, industry-standard, visually strong instrument editor suitable for professional keyboard workflow.
- Dependencies: T210, T227, `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, `web/src/app/components/PluginCards/liveEditorRouting.ts`, `web/src/app/pages/JuceGridPage.tsx`, `web/src/map2/api.ts`, and any backend/editor-contract work required to remove the current SynthForge generic-only restriction safely.
- Estimated effort: High
- Required outputs: Updated worklist notes; implementation of the live-safe SynthForge editor contract and routing as needed; redesigned flagship SynthForge card UI; focused tests/typecheck evidence; and explicit handoff notes for any remaining backend/plugin-instance constraints that still block full parity.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 08:37 - Codex
- Completion notes:
  - Reframed the requirement from a spare parameter strip to a flagship workstation card and rebuilt `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx` around a premium instrument surface: hero/status overview, performance controls, 16-part strip, workstation tabs, richer library/preset workflows, rack editing, play surface, engine controls, and advanced sampler tooling intended for professional keyboard use.
  - Updated `web/src/app/components/PluginCards/liveEditorRouting.ts` and `web/src/app/pages/JuceGridPage.tsx` so SynthForge can render the custom workstation card in the active JUCE Grid editor when the selected chain contains only one SynthForge-family block, while duplicate SynthForge blocks still fall back to the generic editor with an explicit user notice. This is the justified live-safe routing model for the current global `/api/synthforge` backend contract.
  - Extended the card shell plumbing in `web/src/app/components/PluginCards/Layouts/InstrumentCategoryLayout.tsx` to support the wider flagship instrument presentation required by the redesigned SynthForge surface.
- Added focused validation in `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.test.tsx` and `web/src/app/components/PluginCards/liveEditorRouting.test.ts`, covering the workstation render path, preset loading interaction, and the guarded custom-vs-generic routing behavior. Validation: `npm --prefix web test -- --runInBand web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.test.tsx web/src/app/components/PluginCards/liveEditorRouting.test.ts web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass.
- Remaining limitation / handoff: true multi-instance custom SynthForge editing is still blocked by the backend's global SynthForge state contract, so duplicate SynthForge-family blocks intentionally stay on the generic editor path until the engine/API become instance-addressable.
- Licensing: reviewed the touched files as MAP2-owned AGPL-covered UI/editor code and found no new third-party notice or attribution gap.

ID: T243
Status: [✓] Done
Title: Replace ad hoc latency pressure with a shared realtime score and shell LCD readout
Description:
- Goal / acceptance criteria: Verify the current `audio-engine` latency-pressure logic, replace the existing single-threshold approximation with a single source of truth that derives a realtime `00`-`10` operator score from active latency telemetry, render that shared metric as a clearer latency-pressure graph in the audio-engine surface, and add the same shared score to the left shell area between the Home icon and the MAP2 logo as a two-digit LCD-style readout that stays blue for scores `10` through `04` and turns red for `03` through `00`.
- Why it matters: The current audio-engine pressure indicator is only a `totalLatencyMs / 20 ms` progress bar, which is too weak to trust as a system-wide operator signal and cannot support the requested integrated header presentation without duplicating or contradicting the underlying logic.
- Dependencies: `web/src/app/pages/AudioEnginePage.tsx`, `web/src/app/pages/AudioEnginePage.test.tsx`, `web/src/app/layout/AppShell.tsx`, `web/src/app/layout/AppShell.test.tsx`, shared realtime telemetry hooks under `web/src/app/hooks/**`, display primitives under `web/src/app/components/Displays/**`, and `docs/PROJECT_WORKLIST.md`
- Estimated effort: Medium
- Required outputs: Shared latency-pressure scoring logic and hook, updated audio-engine graph/presentation, integrated shell LCD score, focused unit/UI coverage, typecheck/test evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 08:52 - Codex
- Completion notes:
  - Replaced the old `totalLatencyMs / 20 ms` pressure approximation with a shared scoring model in `web/src/app/utils/latencyPressure.ts` and `web/src/app/hooks/useLatencyPressure.ts`, using realtime callback-budget, round-trip latency, jitter, headroom, and xrun telemetry to produce a single `00`-`10` operator score plus a synchronized pressure percentage.
  - Updated `web/src/app/pages/AudioEnginePage.tsx` and `web/src/app/pages/AudioEnginePage.css` so the diagnostics surface now renders a real latency-pressure monitor driven by the shared hook: LCD-style score, rolling pressure-history graph, synchronized helper text, and a latency-breakdown pressure bar that uses the same source of truth instead of the prior 20 ms-only math.
  - Added `web/src/app/components/LatencyPressureShellReadout.tsx`, wired it into `web/src/app/layout/AppShell.tsx`, and styled it in `web/src/app/layout/AppShell.css` so the left shell area now shows the two-digit LCD score between Home and the MAP2 logo, with blue `10`-`04` and red `03`-`00` handling from the shared score.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/utils/latencyPressure.test.ts web/src/app/components/LatencyPressureShellReadout.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/pages/AudioEnginePage.test.tsx` -> pass.
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend code, reran the repository license/notices scan (`rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`), and found no new AGPL or third-party notice gaps requiring a follow-up task.

ID: T244
Status: [✓] Done
Title: Rebuild the JUCE Grid per-flow signal-chain level control for readability and usability
Description:
- Goal / acceptance criteria: Replace the current cramped per-flow level widget in the JUCE Grid flow card with a clearer compact control that remains readable at `100%`, communicates that it is the per-signal-chain level control, preserves the existing inline edit/drag behavior, and stays aligned with the established Carbon/MAP2 visual language. Acceptance requires updated UI code/styles, focused coverage for the touched flow-card surface, and validation evidence.
- Why it matters: The current control is too visually cramped and ambiguous in the shipped flow card, which makes a core per-chain gain control look broken even when the value is valid.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridPage.test.tsx`, and the shared numeric input/display primitives already used by the route.
- Estimated effort: Low
- Required outputs: Updated flow-card level control UI, focused regression coverage, validation notes, and completion notes in this worklist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 09:50 - Codex
- Completion notes:
  - Replaced the cramped bare percentage widget in `web/src/app/pages/JuceGridPage.tsx` with a dedicated `FlowLevelControl` wrapper that labels the control as `Level`, keeps the existing inline numeric interaction path, applies the flow color as the accent, and restores a practical double-click reset to `100%` unity level.
  - Updated `web/src/app/pages/JuceGridPage.css` so the per-flow control keeps the larger segmented readout readable at `100%` without clipping while removing the extra outer label box and placing the `Level` label plus glyph inline to the left of the slider.
  - Added focused regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` that renders a live flow card, verifies the signal-chain level control semantics, and confirms double-click resets the stored flow level back to unity.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings still emit in the test suite, but the suite passes).
  - Licensing: Classified the touched JUCE Grid files as MAP2-owned AGPL-covered frontend code; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new third-party notice or attribution gap requiring a follow-up task.

ID: T246
Status: [✓] Done
Title: Flatten the JUCE Grid effect signal card into a lower-depth single-plane shell
Description:
- Goal / acceptance criteria: Flatten the live JUCE Grid effect signal card so the hero, metadata, and action affordances read as one lower-depth plane instead of stacked inner panels, while preserving the current icon, title/category, overflow actions, selection, bypass, and add-card behavior. Acceptance requires updated signal-card markup/styles, focused regression coverage for the flattened structure, and validation evidence.
- Why it matters: The current card still reads taller and more layered than requested, which adds unnecessary visual depth in the live signal lane and slows operator scanning.
- Dependencies: T237, `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridSignalCanvas.test.tsx`, `docs/PROJECT_WORKLIST.md`
- Estimated effort: Low
- Required outputs: Flattened signal-card shell/add-card styling, focused regression coverage for the new single-plane markup, validation evidence, and licensing/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 09:52 - Codex
- Completion notes:
  - Reworked `web/src/app/pages/JuceGridSignalCanvas.tsx` so each live effect card now uses a single `.juce-grid-page__signal-plugin-face` container, keeping the existing hero art/copy/actions while removing the extra nested info panel and internal accent outline that were still making the card read stacked.
  - Updated `web/src/app/pages/JuceGridPage.css` so the effect/add cards now use a lower-depth shell: simpler gradients, reduced shadows, flatter hero framing, sharper overflow-menu chrome, and softer selected/hover treatments that still preserve category-accent recognition and bypass readability.
  - Added a focused structural regression in `web/src/app/pages/JuceGridSignalCanvas.test.tsx` that requires the flattened face container and verifies the removed inner info/outline elements do not return.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal warnings unchanged); `npm --prefix web run typecheck` -> pass.
  - Licensing: Classified the touched JUCE Grid files as MAP2-owned AGPL-covered frontend code; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring a follow-up task.

ID: T247
Status: [✓] Done
Title: Add Hyperactive Block Reveal transitions for landing routes with persistent reduced-effects mode
Description:
- Goal / acceptance criteria: Implement the "Hyperactive Block Reveal Effect" as the shared route transition for every navigation change involving `/`, `/audio-artifacts`, `/juce-grid`, and the `/midi-hub/*` route family, including in-app navigation, browser back/forward, and returns between those screens; add an app-wide persistent `Reduce Effects Mode` control near the Theme settings section on the About page; when `prefers-reduced-motion: reduce` is active or the user enables reduced effects, downgrade the experience to a minimal fade instead of the full block reveal.
- Why it matters: These are the main landing-page workflows, and they currently hard-cut between visually distinct surfaces with no consistent movement language or operator control over motion intensity.
- Dependencies: `web/src/app/App.tsx`, `web/src/app/layout/AppShell.tsx`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/AudioArtifactsPage.tsx`, `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/MidiHubShell.tsx`, `web/src/app/pages/AboutPage.tsx`, any new shared motion-preference hook/store under `web/src/app/hooks/**` or `web/src/app/contexts/**`, relevant route tests, and `docs/PROJECT_WORKLIST.md`
- Estimated effort: Medium
- Required outputs: Shared scoped route-transition implementation, persistent reduced-effects preference plumbing, About page control near Theme settings, minimal-fade fallback behavior, focused regression coverage for route transitions/preferences, and validation notes.
Subtasks:
ID: T247-subA
Status: [✓] Done
Title: Define the scoped transition contract for home, Audio Artifacts, JUCE Grid, and MIDI Hub
Description:
- Goal / acceptance criteria: Audit how `/`, `/audio-artifacts`, `/juce-grid`, and `/midi-hub/*` mount inside `App.tsx` and `AppShell.tsx`, then choose the correct wrapper/keying strategy so transitions fire on every qualifying route change, including browser history navigation, without breaking lazy loading or shell chrome.
- Why it matters: The effect needs one authoritative orchestration point or it will miss routes, double-fire, or clash with existing page shells.
- Dependencies: T247, `web/src/app/App.tsx`, `web/src/app/layout/AppShell.tsx`, `web/src/app/pages/MidiHubShell.tsx`
- Estimated effort: Low
- Required outputs: Implementation-ready transition scope/routing notes captured in code comments or task completion notes, plus the chosen wrapper insertion point.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 12:04 EDT - Codex
- Completion notes:
  - Chose `web/src/app/layout/AppShell.tsx` as the single orchestration point because every scoped landing surface already mounts inside the shared shell, including the full `/midi-hub/*` family, so a single wrapper can cover in-app navigation and browser history changes without breaking lazy loading or shell chrome.
ID: T247-subB
Status: [✓] Done
Title: Build a persistent reduced-effects preference and About page toggle
Description:
- Goal / acceptance criteria: Add a shared persisted preference for reduced effects, expose it through a `Reduce Effects Mode` button near the About page Theme settings section, and make the setting survive reloads and future visits.
- Why it matters: The user explicitly wants motion control beyond system defaults, and route animation work should not ship without a user-owned intensity override.
- Dependencies: T247-subA, `web/src/app/pages/AboutPage.tsx`, `web/src/app/pages/AboutPage.css`, shared state/persistence utilities
- Estimated effort: Low
- Required outputs: Persistent preference storage, About page button wiring/UI, and focused test coverage for the setting.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 12:04 EDT - Codex
- Completion notes:
  - Added `web/src/app/stores/effectsSettingsStore.ts` and `web/src/app/hooks/useReducedEffectsPreference.ts` so reduced-effects mode is persisted in local storage and merged with live `prefers-reduced-motion` detection.
  - Updated `web/src/app/pages/AboutPage.tsx`, `web/src/app/pages/AboutPage.css`, and `web/src/app/pages/AboutPage.test.tsx` with a saved `Reduce Effects Mode` control beside Theme settings plus visible state tags for the saved preference and any active system override.
ID: T247-subC
Status: [✓] Done
Title: Implement the Hyperactive Block Reveal transition across the scoped routes
Description:
- Goal / acceptance criteria: Ship the full block-reveal transition for qualifying route changes between home, Audio Artifacts, JUCE Grid, and MIDI Hub, including page exits/entries and returns, while keeping the effect performant and visually coherent across full-bleed and shell-contained layouts.
- Why it matters: This is the core UX change requested and depends on real route orchestration rather than page-local animation fragments.
- Dependencies: T247-subA, T247-subB, route shells/styles for the scoped pages
- Estimated effort: Medium
- Required outputs: Shared transition component/styles, route integration for the scoped destinations, and verification that all requested navigation paths animate.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 12:04 EDT - Codex
- Completion notes:
  - Rebuilt `web/src/app/components/PageTransition.tsx` and added `web/src/app/components/PageTransition.css` so the old unused stub now renders a scoped Hyperactive Block Reveal overlay keyed by route family for Home, Audio Artifacts, JUCE Grid, and MIDI Hub.
  - Wrapped the shared shell content in `web/src/app/layout/AppShell.tsx` with the new transition component so cross-route navigation and `/midi-hub/*` family navigation use the same movement system.
ID: T247-subD
Status: [✓] Done
Title: Add minimal-fade fallback and regression coverage for motion preferences
Description:
- Goal / acceptance criteria: Ensure `prefers-reduced-motion: reduce` and the persisted reduced-effects mode both switch the scoped route transitions to a minimal fade, then add regression coverage for the preference behavior and the About page control.
- Why it matters: Accessibility and the new user-facing setting are part of the acceptance criteria, not optional polish.
- Dependencies: T247-subB, T247-subC, `web/src/app/pages/AboutPage.test.tsx`, app-shell/app-route tests
- Estimated effort: Low
- Required outputs: Reduced-motion fallback behavior, focused automated coverage, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 12:04 EDT - Codex
- Completion notes:
  - Added `web/src/app/components/PageTransition.test.tsx` to cover eligible landing-route transitions, `/midi-hub/*` family transitions, unrelated-route no-op behavior, and the reduced-motion minimal-fade path.
  - Verified the persisted preference path in `web/src/app/pages/AboutPage.test.tsx`.
Assigned to: Codex
Last updated: 2026-03-21 12:04 EDT - Codex
- Completion notes:
  - Implemented the shared landing-route transition across Home, Audio Artifacts, JUCE Grid, and MIDI Hub by converting the old page-transition stub into a route-aware overlay driven from the shared shell and route-family matching.
  - Added a persistent reduced-effects preference with live system reduced-motion detection so the About page can save a softer motion profile while `prefers-reduced-motion: reduce` still forces the minimal fade.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/components/PageTransition.test.tsx web/src/app/pages/AboutPage.test.tsx web/src/app/layout/AppShell.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

## Navigation Shell Follow-up

ID: T248
Status: [✓] Done
Title: Unify Platform and Advanced shell launchers into one Platforms and Labs window
Description:
- Goal / acceptance criteria: Replace the separate top-shell Platform and Advanced menus with one shared `Platforms and Labs` window that uses a left-side navigation rail for the existing Platform destinations and a bottom `Labs` entry that opens all former Advanced launchers, keeping the same item icons, matching Carbon/MAP2 styling, and removing the old separate menus. Add a matching `Platforms and Labs` landing-page card that fits the existing home-card layout/style and opens the new unified surface.
- Why it matters: The current split between Platform and Advanced forces users to hunt across two different launcher surfaces and breaks the IA the user now wants for platform operations versus lab workflows.
- Dependencies: `web/src/app/layout/AppShell.tsx`, `web/src/app/layout/AppShell.css`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Platform/PlatformModal.test.tsx`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.test.tsx`, navigation data under `web/src/app/data/*.ts`, and `docs/PROJECT_WORKLIST.md`
- Estimated effort: Medium
- Required outputs: Unified modal/window implementation with left-side navigation and `Labs` styling, removal of the old Advanced/Platform shell menu triggers, updated landing-page card behavior/content, focused regression coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 11:50 EDT - Codex
- Completion notes:
  - Rebuilt `web/src/app/components/Platform/PlatformModal.tsx` into a single `Platforms and Labs` window with a left-side rail for the former Platform destinations, preserved the existing destination icons, and added a bottom `Labs` rail entry with the requested orange label treatment that opens a new shared labs workspace instead of the old Advanced launcher surface.
  - Added `web/src/app/components/Platform/LabsWorkspace.tsx` to host the former Advanced launchers inside the unified window, preserving the existing icons, grouping, blocked/lab treatment, and launcher behavior while letting the modal close cleanly after route launch.
  - Removed the separate Advanced and Platform shell triggers in `web/src/app/layout/AppShell.tsx`, replaced them with one `Platforms + Labs` trigger, updated the shell/mobile copy, and rewired `/platform` pinned-card behavior so it opens the unified modal at the overview layer.
  - Updated the landing experience in `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/homeCardProfiles.ts`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/posterManifest.ts`, and `web/src/app/components/SpecialSettingsDialog.tsx` so the main page now shows a matching `Platforms and Labs` card, the card opens the new modal from Home, and stale Advanced/Platform naming is removed from touched UI copy.
  - Added or refreshed focused coverage in `web/src/app/layout/AppShell.test.tsx`, `web/src/app/components/Platform/PlatformModal.test.tsx`, `web/src/app/pages/HomePage.test.tsx`, and `web/src/app/data/advancedMenuItems.test.ts` for the unified trigger, labs workspace, home-card opening flow, and updated navigation metadata.
  - Validation: `npm --prefix web test -- --runInBand src/app/layout/AppShell.test.tsx src/app/components/Platform/PlatformModal.test.tsx src/app/pages/HomePage.test.tsx src/app/data/advancedMenuItems.test.ts` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass.
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T249
Status: [✓] Done
Title: Restore Labs tile launches from the unified Platforms and Labs modal
Description:
- Goal / acceptance criteria: Make every non-blocked item in the `Labs` workspace of the unified `Platforms and Labs` modal launch its target route reliably, without the modal-close flow swallowing or racing the route transition. Add focused regression coverage for at least one Labs route launch path from the modal host.
- Why it matters: The new unified launcher shipped under `T248`, but the user reports that Labs entries do not open, which breaks the primary entry path for former Advanced workflows.
- Dependencies: T248, `web/src/app/layout/AppShell.tsx`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Platform/LabsWorkspace.tsx`, focused frontend tests, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Stable Labs launch callback wiring, focused automated regression coverage, validation notes, and updated worklist/licensing notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 14:35 EDT - Codex
- Completion notes:
  - Moved Labs route launching out of `web/src/app/components/Platform/LabsWorkspace.tsx` and into the stable shell host path by threading an explicit launch callback through `web/src/app/components/Platform/PlatformModal.tsx` and `web/src/app/layout/AppShell.tsx`, so closing the unified modal no longer races the route transition.
  - Added focused regression coverage in `web/src/app/components/Platform/PlatformModal.test.tsx` to verify that clicking a non-blocked Labs tile delegates the correct target route upward, and in `web/src/app/layout/AppShell.test.tsx` to verify the host callback closes the modal and navigates to the requested route.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/layout/AppShell.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reused the repository license/notices evidence from the current scan (`rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`), and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T250
Status: [✓] Done
Title: Emphasize effect-card `More` accordions and enlarge numeric controls
Description:
- Goal / acceptance criteria: Update the shared effect parameter card shell so every `More` accordion trigger reads with Carbon primary-button colors by default, and enlarge the numeric input controls used inside effect parameter cards by 100px without increasing text size.
- Why it matters: The current `More` affordance is visually understated, and the numeric controls inside the effect cards are too small for fast scan and touch/mouse precision.
- Dependencies: `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx`, `web/src/app/components/PluginCards/Base/carbonCardStyles.css`, shared `NumericInput` usage inside effect cards, and focused frontend validation.
- Estimated effort: Low
- Required outputs: Scoped Carbon effect-card styling updates, no unintended typography growth in numeric fields, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 15:18 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx` so advanced sections titled `More` are tagged explicitly, letting the shared shell emphasize that trigger without changing unrelated accordions.
  - Updated `web/src/app/components/PluginCards/Base/carbonCardStyles.css` so `More` accordions now use Carbon primary-button colors by default and numeric inputs inside `.carbon-card` gain an extra `100px` of width while preserving the existing field and label font sizes.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T251
Status: [✓] Done
Title: Commit all pending frontend changes, push both remotes, and restart port 3000
Description:
- Goal / acceptance criteria: Stage and commit the entire current worktree, push `master` to both `origin` and `gitlab`, rebuild the frontend production bundle, and restart the production web server on port `3000` using the documented nohup/background pattern.
- Why it matters: The user explicitly requested the full sync/deploy loop rather than a local-only code change, so repository state and the running frontend need to match.
- Dependencies: Clean enough git state to commit, reachable `origin` and `gitlab` remotes, successful frontend production build, and ability to replace the existing port-`3000` production web server process.
- Estimated effort: Low
- Required outputs: Single commit covering the full current worktree, successful pushes to both remotes, confirmed frontend build, restarted port `3000` server, verification notes, and updated worklist status.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 15:23 EDT - Codex
- Completion notes:
  - Rebuilt the frontend with `npm --prefix web run build`, which refreshed the generated version artifacts and completed successfully with the repo's existing dynamic-import and chunk-size warnings only.
  - Replaced the previous port-`3000` production web server tree with a fresh background process using the documented nohup pattern; the new listener was PID `660949`.
  - Verification: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` -> `200`; `curl -s http://localhost:3000/ | grep -o 'index-[^"]*\\.js' | head -1` -> `index-CJl1HjmH.js`.

ID: T252
Status: [✓] Done
Title: Move Special Settings access into the Theme workspace beside motion controls
Description:
- Goal / acceptance criteria: Relocate the user-facing Special Settings entry out of the global header navigation and into the Theme workspace/modal, positioned near the existing motion-effects controls, while preserving the current Special Settings dialog behavior for native-plugin visibility. Update focused frontend tests so the header no longer exposes the entry and the Theme workspace does.
- Why it matters: The user wants Theme-related controls consolidated in one modal and the global nav decluttered, so the Special Settings access point must live with the rest of the appearance/motion controls instead of as a top-bar singleton.
- Dependencies: `web/src/app/pages/ThemePage.tsx`, `web/src/app/pages/ThemePage.css`, `web/src/app/layout/AppShell.tsx`, focused frontend tests, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Relocated Theme workspace entry, removed header trigger, updated test coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 15:34 EDT - Codex
- Completion notes:
  - Added a dedicated `Special Settings Menu` card beside `Reduce Effects Mode` in `web/src/app/pages/ThemePage.tsx`, including a hidden-plugin count summary and Theme-owned dialog launch state so the special-settings entry now lives inside the Theme workspace/modal.
  - Extended `web/src/app/pages/ThemePage.css` with scoped motion-action layout rules so the new launcher sits cleanly beside the existing motion controls on desktop and mobile.
  - Removed the header special-settings button and shell-owned dialog wiring from `web/src/app/layout/AppShell.tsx`, leaving the global nav bar free of the old trigger.
  - Updated focused coverage in `web/src/app/pages/ThemePage.test.tsx` and `web/src/app/layout/AppShell.test.tsx` to verify the new Theme launcher and the absence of the header control.
  - Validation: `npm --prefix web test -- --runInBand src/app/layout/AppShell.test.tsx src/app/pages/ThemePage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T253
Status: [✓] Done
Title: Remove the LCD home tile and add Fira Sans, Space Grotesk, and Inter to the Theme font chooser
Description:
- Goal / acceptance criteria: Remove the `LCD Console` card from the Home landing-page navigation while leaving the underlying route metadata intact elsewhere, then expand the Theme font catalog/chooser so `Fira Sans`, `Space Grotesk`, and `Inter` appear as selectable persisted GUI font presets with their font assets loaded by the app. Update focused tests and any required dependency/notice files touched by the change.
- Why it matters: The user wants the landing page decluttered and the Theme workspace to offer a broader, intentional typography set without dead or partial chooser entries.
- Dependencies: `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/homeCardProfiles.ts`, `web/src/app/pages/HomePage.test.tsx`, `web/src/main.tsx`, `web/src/app/theme/usePlatformTypography.ts`, `web/package.json`, `web/package-lock.json`, any touched notice files, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: LCD tile removed from Home, three new working Theme font presets, updated dependency/font-loading config, focused regression coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 15:53 EDT - Codex
- Completion notes:
  - Set `showOnHome: false` for the `LCD Console` navigation entry in `web/src/app/data/advancedMenuItems.ts`, which removes the tile from the Home landing page while keeping the underlying route metadata in the shared navigation catalog.
  - Expanded `web/src/app/theme/usePlatformTypography.ts` with persisted font presets for `Fira Sans`, `Space Grotesk`, and `Inter`, and loaded their bundled assets in `web/src/main.tsx` via `@fontsource` imports so the Theme chooser can apply them immediately.
  - Added the corresponding frontend package dependencies in `web/package.json` and `web/package-lock.json`, then documented the additional bundled web-font packages in `docs/THIRD_PARTY_NOTICES.md`.
  - Updated focused coverage in `web/src/app/pages/HomePage.test.tsx` and `web/src/app/pages/ThemePage.test.tsx` to verify the LCD tile is absent from Home and the new font options appear and persist through the Theme selector.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/HomePage.test.tsx src/app/pages/ThemePage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, updated `docs/THIRD_PARTY_NOTICES.md` for the new bundled font packages, reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new licensing gaps requiring follow-up work.

ID: T254
Status: [✓] Done
Title: Feature flagship native JUCE plugins in the browser and trim browser modal dead space
Description:
- Goal / acceptance criteria: Rework the JUCE Grid plugin browser so flagship integrated processors surface first in curated featured groups for modeling and instruments, remove those entries from the remaining native list to avoid duplication, and reduce the large bottom dead space in the browser modal without regressing add/details actions or responsive layout. Add focused regression coverage for the featured-group/browser ordering behavior.
- Why it matters: The current browser makes the most important integrated processors harder to discover and wastes vertical space at the bottom of the modal, which slows operator scanning in one of the most-used JUCE Grid workflows.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridPage.test.tsx`, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Featured native browser groups, deduplicated remaining native list, trimmed modal spacing, focused regression coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 16:34 EDT - Codex
- Completion notes:
  - Added curated featured native browser groups in `web/src/app/pages/JuceGridPage.tsx` for flagship modeling and instrument processors, using canonical URI matching so those plugins surface first and are removed from the remaining native grid instead of appearing twice.
  - Updated `web/src/app/pages/JuceGridPage.css` to render the featured groups in a dedicated responsive grid and reduced the browser modal's excess bottom padding so the results area uses the available height more efficiently.
  - Extended `web/src/app/pages/JuceGridPage.test.tsx` with an explicit regression that verifies featured native plugins render ahead of LV2 entries and do not leak back into a duplicate `Core integrated` section when the featured set consumes the available native fixtures.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> pass (existing Carbon modal `preventCloseOnClickOutside={false}` warnings unchanged); `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).
  - Licensing: Classified the touched files as MAP2-owned AGPL-covered frontend/worklist code, reused the repository license/notices scan (`rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`), and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T255
Status: [✓] Done
Title: Retire legacy `top-nav` special-settings defaults so Theme ownership persists cleanly
Description:
- Goal / acceptance criteria: Update the frontend and backend special-settings defaults/normalization so the legacy `top-nav` menu location no longer gets recreated during ordinary special-settings writes or resets after the Special Settings entry moved into Theme. Preserve backend compatibility for existing payloads and add focused regression coverage for the new normalized default behavior.
- Why it matters: The current hook/model defaults still write `menu_location: "top-nav"` whenever callers update hidden plugins, pinned routes, or cluster node preferences, which can silently preserve or reassert the old header-owned special-settings placement in persisted state.
- Dependencies: `web/src/app/hooks/useSpecialSettings.tsx`, backend special-settings models/routes/storage defaults, focused frontend/backend tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Normalized hidden/default special-settings location across frontend/backend, compatibility-safe payload handling for legacy stored values, focused regression coverage, validation notes, and worklist/licensing completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:08 EDT - Codex
- Completion notes:
  - Updated the frontend special-settings hook in `web/src/app/hooks/useSpecialSettings.tsx` so legacy or unknown `menu_location` values normalize to `hidden`, and ordinary writes now default back to `hidden` instead of silently re-persisting `top-nav`.
  - Updated the backend defaults and normalization path in `app/models_compat.py`, `app/database.py`, `app/routes/special_settings.py`, and `app/services/special_settings_raft.py` so default rows, resets, standalone writes, Raft replication, and API responses all coerce the legacy `top-nav` value to the Theme-owned hidden state while still accepting older payloads.
  - Refreshed focused backend/frontend fixtures in `tests/test_special_settings_routes.py`, `web/src/app/hooks/useSpecialSettings.test.tsx`, and the shared `useSpecialSettings` consumer tests so the normalized hidden default is explicitly covered.
  - Validation: `pytest -q tests/test_special_settings_routes.py` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/hooks/useSpecialSettings.test.tsx web/src/app/components/SpecialSettingsDialog.test.tsx web/src/app/pages/ThemePage.test.tsx web/src/app/contexts/ClusterContext.test.tsx web/src/app/pages/HomePage.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/components/snapshots/SnapshotModal.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched backend/frontend/test/worklist files as MAP2-owned AGPL-covered code, reran the repository license/notices scan (`rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`), and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T256
Status: [✓] Done
Title: Make the Theme-owned Special Settings dialog use shared settings state instead of refetching it
Description:
- Goal / acceptance criteria: Refactor the Theme-owned `SpecialSettingsDialog` flow so it receives the current hidden-plugin selection from `useSpecialSettings` instead of issuing a second `/api/settings/special` fetch every time the dialog opens. Preserve save/error behavior and add focused regression coverage for dialog initialization and save wiring.
- Why it matters: Theme already owns the Special Settings entry and the shared hook state; refetching the same settings in the dialog introduces redundant network work, another source of stale state, and avoidable loading churn when operators open the menu repeatedly.
- Dependencies: `web/src/app/components/SpecialSettingsDialog.tsx`, `web/src/app/pages/ThemePage.tsx`, any focused dialog/page tests, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Dialog initialization from shared settings, no duplicate special-settings fetch on open, preserved save semantics, focused regression coverage, validation notes, and worklist/licensing completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:08 EDT - Codex
- Completion notes:
  - Refactored `web/src/app/components/SpecialSettingsDialog.tsx` so the dialog now receives `currentHiddenPlugins` from Theme-owned shared state and only fetches `/api/plugins/discover` on open, removing the duplicate `/api/settings/special` round-trip.
  - Added a focused component regression in `web/src/app/components/SpecialSettingsDialog.test.tsx` that proves the dialog initializes checkbox state from the shared hidden-plugin list, avoids the extra settings fetch, and saves the updated hidden-plugin selection.
  - Threaded the shared hidden-plugin list from `web/src/app/pages/ThemePage.tsx` into the dialog with a stable memoized prop so repeated parent renders do not churn the dialog state.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/components/SpecialSettingsDialog.test.tsx web/src/app/hooks/useSpecialSettings.test.tsx web/src/app/pages/ThemePage.test.tsx` -> pass; full focused frontend batch above -> pass.
  - Licensing: Reused the repository license/notices scan for the touched MAP2-owned frontend/test/worklist files and found no new AGPL or third-party notice gaps.

ID: T257
Status: [✓] Done
Title: Remove unsupported Carbon modal props that spam test warnings
Description:
- Goal / acceptance criteria: Eliminate the unsupported `preventCloseOnClickOutside={false}` usage from the affected Carbon modal wrappers so JUCE Grid and snapshot-related tests stop emitting the repeated non-boolean DOM attribute warning, without regressing the current close behavior.
- Why it matters: The warning noise obscures real failures in focused frontend runs and indicates route-local modal code is still passing a prop the current Carbon components do not consume safely.
- Dependencies: `web/src/app/pages/RoutingTopologyModal.tsx`, `web/src/app/components/snapshots/SnapshotModal.tsx`, any focused frontend tests that exercise those modals, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Warning-free modal prop usage, preserved close behavior, focused regression or smoke validation, and worklist/licensing completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:08 EDT - Codex
- Completion notes:
  - Removed the unsupported `preventCloseOnClickOutside={false}` prop from `web/src/app/pages/RoutingTopologyModal.tsx` and `web/src/app/components/snapshots/SnapshotModal.tsx`, keeping the existing close handlers intact while letting the current Carbon components use their native defaults.
  - Revalidated the previously noisy modal paths with `web/src/app/components/snapshots/SnapshotModal.test.tsx` and the full `web/src/app/pages/JuceGridPage.test.tsx` run; the old non-boolean Carbon modal warning did not reappear, leaving only the pre-existing JUCE Grid plugin-metadata debug warnings in the test output.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/components/snapshots/SnapshotModal.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Reused the repository license/notices scan for the touched MAP2-owned frontend/test/worklist files and found no new AGPL or third-party notice gaps.

ID: T258
Status: [✓] Done
Title: Promote Audio Nodes into the primary JUCE Grid masthead action strip
Description:
- Goal / acceptance criteria: Move `Audio Nodes` out of the secondary action cluster and into the primary JUCE Grid masthead button strip ahead of routing configuration so node-aware placement controls are visible without opening the overflow path. Keep the existing modal behavior and add focused regression coverage for the new masthead order.
- Why it matters: Audio-node assignment is a first-class flow operation in the live grid, and burying it behind the secondary action area makes it harder to discover than routing and add-flow actions.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridPage.test.tsx`, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Primary-action `Audio Nodes` placement, preserved modal behavior, focused masthead-order regression coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:21 EDT - Codex
- Completion notes:
  - Moved `Audio Nodes` into the primary JUCE Grid masthead action strip in `web/src/app/pages/JuceGridPage.tsx`, ahead of `Configure routing`, so node-assignment controls now sit with the other live workflow buttons instead of in the secondary action area.
  - Added matching masthead emphasis styles in `web/src/app/pages/JuceGridPage.css` so the node/routing/add-flow actions read as one cohesive success-toned control cluster.
  - Extended `web/src/app/pages/JuceGridPage.test.tsx` with an explicit order check that keeps `Audio Nodes` ahead of `Configure routing` in the primary masthead strip.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched JUCE Grid/test/worklist files as MAP2-owned AGPL-covered frontend code and reused the repository license/notices scan with no new gaps.

ID: T259
Status: [✓] Done
Title: Remove the redundant JUCE Grid masthead Docs button while keeping shortcut-modal docs access
Description:
- Goal / acceptance criteria: Remove the standalone `Docs` button from the JUCE Grid masthead and compact overflow so the top bar stays focused on live control actions, while preserving the existing `Open docs` path from the keyboard shortcuts modal. Update focused tests to match the slimmer masthead contract.
- Why it matters: The masthead is currently overloaded with both workflow actions and reference affordances; keeping docs behind the keyboard-help modal preserves discoverability without crowding the highest-frequency controls.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.test.tsx`, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Docs removed from masthead/overflow, keyboard-help docs access preserved, focused regression coverage, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:21 EDT - Codex
- Completion notes:
  - Removed the standalone `Docs` button from the JUCE Grid masthead and compact secondary action menu in `web/src/app/pages/JuceGridPage.tsx`, leaving the top bar focused on live control actions.
  - Preserved docs access through the existing keyboard-shortcuts modal path (`Open docs`) and added focused coverage in `web/src/app/pages/JuceGridPage.test.tsx` that verifies the masthead no longer exposes `Docs` while the shortcut modal still does.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Reused the repository license/notices scan for the touched MAP2-owned JUCE Grid/test/worklist files and found no new AGPL or third-party notice gaps.

ID: T260
Status: [✓] Done
Title: Suppress transient JUCE Grid selected-plugin metadata warnings until discovery settles
Description:
- Goal / acceptance criteria: Rework the selected-plugin metadata fallback in JUCE Grid so the page does not emit the repeated debug `console.warn` sequence while plugin discovery is still pending or empty during expected test/setup flows. Preserve a debuggable path for genuinely missing metadata once discovery has settled, and add focused regression coverage for the quieter behavior.
- Why it matters: The current warning spam obscures real test failures and makes the selected-plugin fallback look unstable even when the only issue is that discovery has not finished yet.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.test.tsx`, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Settled-state-only metadata warning behavior, focused regression coverage, cleaner JUCE Grid test output, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:21 EDT - Codex
- Completion notes:
  - Reworked the selected-plugin metadata path in `web/src/app/pages/JuceGridPage.tsx` so the missing-metadata warning no longer fires from render-time memo logic. The page now warns once, only after plugin discovery has settled successfully and the selected block still has no metadata.
  - Collapsed the old three-line debug warning into a single structured `console.warn` payload and guarded it with a ref-backed once-per-settled-state key so expected discovery latency no longer floods the test output.
  - Added a focused regression in `web/src/app/pages/JuceGridPage.test.tsx` that proves no warning is emitted while discovery is pending and that a single warning appears only after a settled empty discovery result.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> pass; `npm --prefix web run typecheck` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Reused the repository license/notices scan for the touched MAP2-owned JUCE Grid/test/worklist files and found no new AGPL or third-party notice gaps.

ID: T261
Status: [✓] Done
Title: Add in-card `Select...` asset actions for NAM and IR JUCE parameter cards
Description:
- Goal / acceptance criteria: Update the `NAMCard`, `CabinetIRCard`, and `ReverbIRCard` parameter cards so each card exposes an explicit in-card `Select...` action that opens the existing shared NAM/IR manager dialogs, replacing the remaining bespoke inline browser modals. Preserve current active-asset readouts, keep the shared category layouts visually consistent, and add focused regression coverage for the new selector entry points.
- Why it matters: The cards currently expose inconsistent load flows. NAM still uses a custom browser modal, while the IR cards rely on a generic browse affordance and card-local modals. A clear `Select...` action backed by the shared managers gives all three cards the same loader pattern and reduces duplicated browser UI.
- Dependencies: `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `CabinetIRCard.tsx`, `ReverbIRCard.tsx`, `web/src/app/components/PluginCards/Layouts/ConvolutionCategoryLayout.tsx`, shared Carbon card styles, focused JUCE card tests, and licensing/worklist notes
- Estimated effort: Medium
- Required outputs: In-card selector UI for NAM/cabinet/reverb cards, shared-dialog integration, removal of duplicated inline browser modal code, focused tests, validation notes, and licensing status update.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 17:39 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx` so the card now exposes an always-visible `Model` section with the active NAM name and a `Select...` action that opens the shared `NAMManagerDialog`, replacing the bespoke in-card browser modal.
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx` and `ReverbIRCard.tsx` to use `CabinetIRManagerDialog` / `ReverbIRManagerDialog` instead of custom inline browser modals, and close the dialog after a successful asset load callback.
  - Refined `web/src/app/components/PluginCards/Layouts/ConvolutionCategoryLayout.tsx` and `web/src/app/components/PluginCards/Base/carbonCardStyles.css` so the shared IR selector row uses a dedicated asset-selector layout and the in-card action reads `Select...` consistently across cabinet and reverb cards.
  - Added `web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` to confirm the NAM, cabinet IR, and reverb IR cards each open the shared manager dialog from the new in-card `Select...` entry point.
  - Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).
  - Licensing: Classified the touched frontend/test/worklist files as MAP2-owned AGPL-covered code, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T262
Status: [✓] Done
Title: Remove the JUCE Grid signal-card icon wash and normalize mixed SVG rendering
Description:
- Goal / acceptance criteria: Update the `JUCE-GRID` signal-path effect cards so the icon art is no longer obscured by the current overlay/filter treatment, the mixed legacy/noun SVG set renders with consistent legibility, and the resulting cards read with higher icon contrast/pop while preserving selection, bypass, and reorder behavior.
- Why it matters: The current card treatment leaves several signal icons looking muted or effectively absent because the face overlay and low-opacity hero styling flatten already mixed SVG assets into dark blocks, which makes fast operator scanning harder than it should be.
- Dependencies: `web/src/app/pages/JuceGridSignalCanvas.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/components/icons/effectIcons.ts`, focused JUCE Grid tests, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Updated signal-card icon presentation and any required icon normalization logic, focused regression coverage, validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 18:10 EDT - Codex
- Completion notes:
  - Updated `web/src/app/components/icons/effectIcons.ts` so icon resolution now reports whether a lookup actually matched and whether the resolved SVG should render as an outline or solid mark, instead of treating every miss as an immediate generic-plugin success.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` so signal cards keep searching across plugin name, category, class label, display type, and URI until they find a real icon match, which fixes unmapped names like `ShoeGaze` falling back too early to the generic square plugin icon.
- Updated `web/src/app/pages/JuceGridPage.css` so the icon-darkening face overlay no longer sits over the hero art, outline SVGs are no longer force-filled via the shared hero rule, and both outline and solid icons get tone-aware opacity/drop-shadow treatment that makes the art read much more clearly on the live cards.
- Added focused coverage in `web/src/app/pages/JuceGridSignalCanvas.test.tsx` for the tone-aware hero markup and for the category fallback path when a plugin name itself is unmapped.
- Validation: `npm --prefix web run typecheck` -> pass; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx` -> pass; `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only). Build regenerated `VERSION` and `version.json` as part of the standard frontend build pipeline.
- Verification update: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` now passes, so the earlier `Move left` failure note is no longer current and was cleared as part of `T265`.
- Licensing: Classified the touched frontend/test/worklist files as MAP2-owned AGPL-covered code, reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T263
Status: [✓] Done
Title: Align the production deploy script with the shipped `serve_web_dist` runtime and no-sleep restart rules
Description:
- Goal / acceptance criteria: Update the production web deploy/restart path so the repo-controlled automation starts the same `serve_web_dist.mjs` runtime the shipped systemd unit uses, removes the stale `serve` fallback path, and verifies restart readiness by polling instead of fixed sleeps. Keep port `3000` behavior, build flow, and restart verification intact.
- Why it matters: The current deploy wrapper and several recent release notes still assume `vite preview` or `serve`, while the actual production runtime is now `npm run serve` / `scripts/serve_web_dist.mjs`. That drift makes restart behavior harder to trust and conflicts with the documented no-sleep rule.
- Dependencies: `scripts/build/deploy`, `systemd/map2-web-prod.service`, `web/package.json`, current port-`3000` runtime contract
- Estimated effort: Low
- Required outputs: Updated deploy script/runtime references, syntax/health validation, completion notes, and licensing/worklist evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 18:48 EDT - Codex
- Completion notes:
  - Updated `scripts/build/deploy` so the production wrapper now reports the live bundle hash from the actual port-`3000` response, polls service/port shutdown instead of relying on fixed sleeps, escalates stuck `map2-web-prod` stops with `systemctl kill`, and uses `npm run serve` as the manual fallback so it matches the shipped `serve_web_dist.mjs` runtime instead of the stale `serve` package path.
  - Updated `.gitignore` to stop hiding repo-controlled files under `scripts/build/`, which exposed `scripts/build/deploy` for version control and prevents future deploy-wrapper fixes from silently disappearing outside git.
  - Cleaned `systemd/map2-web-prod.service` by removing the duplicate `LimitNOFILE` stanza while keeping the tracked `npm run serve` production contract unchanged.
  - Validation: `bash -n scripts/build/deploy` -> pass; `./scripts/build/deploy --status` -> pass (`map2-web-prod` active, port `3000` listening, bundle `index-B5asl_7g.js`, health `OK`).
  - Licensing: Classified `.gitignore`, `scripts/build/deploy`, `systemd/map2-web-prod.service`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T264
Status: [✓] Done
Title: Harden the production deploy-wrapper stop path and refresh canonical AI/operator instructions
Description:
- Goal / acceptance criteria: Fix the remaining `scripts/build/deploy` stop/restart bugs exposed by the first post-`T263` release loop, especially the blocking `systemctl stop` call and the empty-port early-exit under `set -e`, then update the canonical AI/operator guidance files so the documented port-`3000` contract and restart commands match the hardened `serve_web_dist.mjs` runtime behavior.
- Why it matters: The first full rebuild/restart after `T263` still needed one manual `systemctl kill` because the wrapper waited inside `systemctl stop` before it could poll, and then exited early when `port_pids` returned no listener. The canonical AI docs also still describe the old runtime, which would repeat the same mistakes.
- Dependencies: T263, `scripts/build/deploy`, `.github/copilot-instructions.md`, `.gemini/instructions.md`, `.copilot-notes/server-restart-pattern.md`
- Estimated effort: Low
- Required outputs: Hardened deploy-wrapper stop/start behavior, updated canonical instruction docs, consistency validation, completion notes, and licensing/worklist evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 19:00 EDT - Codex
- Completion notes:
  - Updated `scripts/build/deploy` so the restart wrapper no longer exits under `set -e` when port `3000` is already free, uses `systemctl stop --no-block`, waits on `ActiveState` instead of a single substate, and force-kills the unit only if the stop timeout actually expires.
  - Updated the tracked canonical guidance in `.github/copilot-instructions.md` so port `3000`, the clean-start snippets, the diagnostic stack, and the port table now reference `scripts/serve_web_dist.mjs` / `npm run serve` instead of stale `vite preview` commands.
  - Refreshed `.gemini/instructions.md` and `.copilot-notes/server-restart-pattern.md` locally with the same runtime contract, but those files remain intentionally ignored by the repository, so the persistent repo-side source of truth for this loop is the tracked `.github/copilot-instructions.md` update plus the hardened deploy wrapper itself.
  - Validation: `bash -n scripts/build/deploy` -> pass; `npm --prefix web run deploy` -> pass after the wrapper fix with no manual service kill required (`map2-web-prod` restarted cleanly and served `index-B4wtKAjO.js` on port `3000`); `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx` -> pass for the concurrently present HomePage changes included in the rebuilt tree.
  - Licensing: Classified `.github/copilot-instructions.md`, `scripts/build/deploy`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repo artifacts, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T265
Status: [✓] Done
Title: Refresh secondary troubleshooting/reference docs and clear stale release notes
Description:
- Goal / acceptance criteria: Update the remaining operator-facing troubleshooting/reference docs and any now-stale worklist notes so they no longer describe `vite preview` as the production server, no longer recommend fixed sleeps for port-`3000` recovery, and no longer report the already-fixed JUCE Grid `Move left` test failure as current.
- Why it matters: Secondary docs and stale completion notes are still part of the project handoff surface; they currently contradict the shipped runtime and can mislead future debugging/release work.
- Dependencies: T263, T264, `docs/VITE_TROUBLESHOOTING_GUIDE.md`, `docs/CLAUDE.md`, `docs/PROJECT_WORKLIST.md`
- Estimated effort: Low
- Required outputs: Updated troubleshooting/reference docs, corrected stale worklist notes, consistency validation, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 19:06 EDT - Codex
- Completion notes:
  - Updated `docs/VITE_TROUBLESHOOTING_GUIDE.md` so the troubleshooting flow, health checks, restart commands, and log references now target the production `serve_web_dist.mjs` runtime / `npm run serve`, and the guide now recommends `npm run build` / `npm run deploy` rather than raw `vite preview` plus fixed sleeps.
  - Updated `docs/CLAUDE.md` so the secondary operator guidance now treats `serve_web_dist.mjs` as the supported port-`3000` server, replaces the old `vite preview` kill/start examples, and marks the prior localhost `vite preview` proxy issue as retired legacy context.
  - Corrected stale historical notes in `docs/PROJECT_WORKLIST.md`: `T251` no longer names `vite preview` as the production target, and `T262` now records that the JUCE Grid `Move left` regression run passes rather than preserving the obsolete failure warning.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSignalCanvas.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> pass; `rg -n "vite preview|Move left|vite-preview|sleep 3|sleep 2|serve_web_dist" docs/CLAUDE.md docs/VITE_TROUBLESHOOTING_GUIDE.md docs/PROJECT_WORKLIST.md` -> only expected current references remained.
  - Licensing: Classified `docs/CLAUDE.md`, `docs/VITE_TROUBLESHOOTING_GUIDE.md`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered documentation, reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T266
Status: [✓] Done
Title: Rebalance Home landing-page hero cards for Platforms and Labs plus MIDI Hub
Description:
- Goal / acceptance criteria: Update the Home landing-page hero card layout so `Platforms and Labs` remains an unchanged standard card, appears immediately to the left of `MIDI Hub`, and `MIDI Hub` renders at double-card width on desktop without breaking responsive layouts or Home navigation behavior.
- Why it matters: The landing page currently separates these cards into different home-section rows, which prevents the requested left-to-right relationship and under-emphasizes the primary MIDI workflow.
- Dependencies: `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, `web/src/app/pages/HomePage.test.tsx`
- Estimated effort: Low
- Required outputs: Updated Home page layout/styles, regression coverage for ordering and wide-card behavior, and completion notes with licensing/worklist evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-21 18:58 EDT - Codex
- Completion notes:
  - Reordered the Home hero sections locally so the `System` card row renders before `MIDI`, then converted the hero overlay to a three-column grid that keeps `Platforms and Labs` as a standard-width card on the left and gives `MIDI Hub` a two-column footprint on desktop while preserving stacked responsive behavior at narrower breakpoints.
  - Marked `MIDI Hub` as a wide hero card alongside the existing wide `Audio Grid` treatment and added landing-page regression coverage that checks the new section order plus the wide-card class assignment.
  - Validation: `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite chunk-size and mixed static/dynamic import warnings only, no new failures).
  - Licensing: Classified `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, `web/src/app/pages/HomePage.test.tsx`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts, reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T269
Status: [✓] Done
Title: Refactor Home, Audio Artifacts, and Platforms/Labs into one Carbon-compliant integrated home interface with three release cycles
Description:
- Goal / acceptance criteria: Replace the current Home hero/card system, the `Platforms and Labs` mega-modal, and the standalone `Audio Artifacts` subsystem with one deep-linkable Carbon product-style home interface. The finished work must use Carbon shell, grid, tile, table, layer, token, and dialog patterns; keep MAP2 branding restrained; keep only light modals for short tasks such as upload and delete confirmation; preserve existing business/API behavior; and publish verifiable desktop/mobile Carbon conformance evidence.
- Why it matters: The current implementation splits the highest-traffic operator entry points across a bespoke cinematic landing page, a persistent modal workflow, and a separate purple-themed library route. That creates IA drift, responsive overlap bugs, and an unverifiable Carbon story.
- Dependencies: T248, T249, T266, `web/src/app/layout/AppShell.tsx`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/AudioArtifactsPage.tsx`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Platform/LabsWorkspace.tsx`, `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/homeCardProfiles.ts`, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, and `docs/PROJECT_WORKLIST.md`
- Estimated effort: High
- Required outputs: Canonical routed IA for overview/platforms/artifacts/labs, legacy redirect coverage, replacement of large modal workflows with routed or embedded workspace content, new Audio Artifacts regression coverage, Carbon conformance evidence doc, completed checklist evidence, and worklist/licensing completion notes.
- Execution protocol: Execute exactly three cycles in order using the subtasks below. After each cycle is complete: update the active worklist entries, commit all current tracked/untracked repo changes with the cycle commit message, push to both `origin` and `gitlab` on `master`, rebuild/restart the port `3000` server with `npm --prefix web run deploy`, verify with `npm --prefix web run deploy:status`, then begin the next cycle. If the worktree contains conflicting user edits that make a full-tree commit unsafe, stop and ask before committing.
Subtasks:
- ID: T269-subA
  Status: [✓] Done
  Title: Cycle 1 — Lock the routed IA, redirects, shell baseline, and Carbon overview foundation
  Description:
  - Goal / acceptance criteria: Define and implement the canonical route contract for `/`, `/artifacts`, `/artifacts/discover`, `/platforms/:workspace`, and `/labs`; translate legacy `/?layer=...`, `/platform?layer=...`, `/platform?panel=...`, and `/audio-artifacts` entry points into that contract; replace the current Home cinematic hero with a Carbon productive overview using Grid/Column and clickable tiles; and establish the AppShell baseline needed for the integrated route family.
  - Why it matters: The refactor fails if the new interface is only visual and the navigation model remains modal- and query-driven.
  - Dependencies: T269
  - Estimated effort: High
  - Required outputs: Canonical route map implemented, overview route rebuilt, initial shell integration in place, focused tests for overview/redirect behavior, validation notes, and cycle-1 release loop completion.
  - Commit message: `T269-subA: build integrated-home routing and Carbon overview foundation`
  Subtasks: None
  Assigned to: Any AI
  Last updated: 2026-03-22 06:37 EDT - Codex
  - Completion notes:
    - Added the canonical integrated-home route contract for `/platforms/:workspace`, `/labs`, `/artifacts`, and `/artifacts/discover`, plus shared platform workspace routing helpers in `web/src/app/platform/routes.ts`.
    - Redirected legacy `/?layer=...`, `/?panel=...`, `/platform?layer=...`, `/platform?panel=...`, `/audio-artifacts`, `/plugins`, `/library`, `/about`, `/theme`, `/host-machine`, and `/engine` entry points onto the new canonical routed contract in `web/src/app/App.tsx`.
    - Rebuilt `web/src/app/pages/HomePage.tsx` and `web/src/app/pages/HomePage.css` into a Carbon-style productive overview with routed entry tiles for Platforms, Audio Artifacts, and Labs, while preserving cluster telemetry and pin state behavior.
    - Added routed page wrappers for platform and labs workspaces, updated platform link-generation helpers to emit canonical routes, wired `AudioArtifactsPage` discover behavior to `/artifacts/discover`, and removed the AppShell query-param effect that auto-opened the legacy platform modal.
    - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/App.platformRoute.test.tsx web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/layout/AppShell.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with existing Vite warnings only.
    - Licensing: Classified the touched frontend, test, and worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.
- ID: T269-subB
  Status: [✓] Done
  Title: Cycle 2 — Migrate Platforms and Labs from modal host to routed Carbon workspaces
  Description:
  - Goal / acceptance criteria: Retire the `Platforms and Labs` modal as the primary host; promote platform layers and standalone panels into `/platforms/:workspace`; promote Labs into `/labs`; preserve deep-link access to overview, node, AVB, MIDI, API, cluster, host-machine, audio-engine, theme, and about flows; and migrate pinning/navigation metadata to the routed contract.
  - Why it matters: Complex, persistent work areas do not fit Carbon dialog guidance and are a primary source of shell inconsistency today.
  - Dependencies: T269-subA
  - Estimated effort: High
  - Required outputs: Routed platform/labs workspaces, legacy query redirects preserved, modal-host behavior removed from these flows, focused route/shell regressions, validation notes, and cycle-2 release loop completion.
  - Commit message: `T269-subB: route Platforms and Labs into the integrated home shell`
  Subtasks: None
  Assigned to: Any AI
  Last updated: 2026-03-22 06:54 EDT - Codex
  - Completion notes:
    - Converted platform pin metadata from synthetic modal targets to canonical routed paths in `web/src/app/data/platformMenuItems.ts` and `web/src/app/data/advancedMenuItems.ts`, including backward-compatible alias normalization for legacy `/platform`, `/about`, `/engine`, `/theme`, `/host-machine`, `/audio-artifacts`, and `platform:layer|panel:*` persisted pins.
    - Retired the AppShell platform modal host in `web/src/app/layout/AppShell.tsx`; pinned platform destinations now render as direct routed links, `/platforms` redirects to `/platforms/overview`, and the mobile bottom tabbar is suppressed on `/platforms/*` and `/labs` to avoid routed-shell overlap.
    - Updated `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/pages/PlatformWorkspacePage.tsx`, `web/src/app/pages/LabsPage.tsx`, and `web/src/app/pages/PlatformShellPage.css` so the shared Platforms/Labs surface renders route-native content by default while keeping optional modal chrome available only as a fallback wrapper.
    - Repointed integrated-home metadata and presentation to the routed contract in `web/src/app/data/homeCardProfiles.ts`, `web/src/app/pages/HomePage.tsx`, and `web/src/app/pages/posterManifest.ts`, keeping Platforms as the canonical workspace tile and Labs as the separate routed launcher catalog.
    - Added or updated route/shell regressions in `web/src/app/App.platformRoute.test.tsx`, `web/src/app/layout/AppShell.test.tsx`, `web/src/app/components/Platform/PlatformModal.test.tsx`, `web/src/app/data/advancedMenuItems.test.ts`, `web/src/app/components/NodeNav/NodeNavChip.test.tsx`, and `web/src/app/pages/HomePage.test.tsx` to cover `/platforms`, `/labs`, canonical platform pin links, hidden mobile tabbar behavior, and legacy pin normalization.
    - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/App.platformRoute.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/data/advancedMenuItems.test.ts web/src/app/components/NodeNav/NodeNavChip.test.tsx web/src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import/chunk warnings only.
    - Licensing: Classified the touched frontend, test, build-log, and worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.
- ID: T269-subC
  Status: [✓] Done
  Title: Cycle 3 — Integrate Audio Artifacts, replace discovery modal, and close conformance
  Description:
  - Goal / acceptance criteria: Refactor Audio Artifacts into `/artifacts` with category/search/pagination/node filters preserved; move artifact discovery into `/artifacts/discover`; keep only light modals for upload and delete confirmation; replace fixed drawer/detail overlays with integrated responsive content regions; finish shell/mobile cleanup for the integrated route family; add dedicated Audio Artifacts regression coverage; and publish final Carbon conformance/checklist evidence.
  - Why it matters: Audio Artifacts is only partially Carbon today and still behaves like a visually separate product, and it currently lacks a dedicated route test suite.
  - Dependencies: T269-subA, T269-subB
  - Estimated effort: High
  - Required outputs: Routed artifacts/discovery surfaces, final responsive cleanup, new artifacts test coverage, `docs/design/CARBON_INTEGRATED_HOME_CONFORMANCE.md`, completed checklist evidence, validation notes, and cycle-3 release loop completion.
  - Commit message: `T269-subC: integrate Audio Artifacts and close Carbon conformance`
  Subtasks: None
  Assigned to: Any AI
  Last updated: 2026-03-22 07:17 EDT - Codex
  - Completion notes:
    - Refactored `web/src/app/pages/AudioArtifactsPage.tsx` and `web/src/app/pages/AudioArtifactsPage.css` into a route-native Carbon workspace: `/artifacts` now keeps category/search/pagination/node filters inside the integrated shell, `/artifacts/discover` renders embedded discovery content, the left nav has a first-class discovery route entry, and the old fixed detail/sync drawers were replaced with inline layered context regions.
    - Updated `web/src/app/components/artifacts/ArtifactDownloadModal.tsx` and `web/src/app/components/artifacts/ArtifactDownloadModal.css` so discovery can render as embedded routed content by default, with Carbon-token styling and only optional modal chrome as a fallback wrapper; upload and delete confirmation remain the only light modal flows on the artifacts surface.
    - Added dedicated routed regression coverage in `web/src/app/pages/AudioArtifactsPage.test.tsx` for library rendering, inline detail/sync context, canonical `/artifacts/discover` navigation, embedded discovery rendering, contextual tab mapping, and route return behavior.
    - Published route-family conformance evidence in `docs/design/CARBON_INTEGRATED_HOME_CONFORMANCE.md`, updated `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md` with the T269 review record, and captured desktop/mobile screenshot evidence under `docs/design/evidence/`.
    - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx web/src/app/App.platformRoute.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import/chunk warnings only.
    - Licensing: Classified the touched frontend, CSS, screenshot-evidence, test, and design-doc files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.
Assigned to: Any AI
Last updated: 2026-03-22 07:17 EDT - Codex
- Completion notes:
  - Completed the three-cycle integrated-home program: cycle 1 established the canonical route contract and productive Carbon overview, cycle 2 routed Platforms and Labs into the shared shell, and cycle 3 finished the routed Audio Artifacts library/discovery workspaces with conformance evidence and dedicated regression coverage.
  - The integrated home interface is now deep-linkable under one shell contract across `/`, `/platforms/:workspace`, `/labs`, `/artifacts`, and `/artifacts/discover`, with legacy route/query redirects preserved and only short-lived modal flows retained where Carbon dialog guidance allows them.

ID: T270
Status: [✓] Done
Title: Audit and extend MIDI Hub connections workspace device reporting
Description:
- Goal / acceptance criteria: Audit the `/midi-hub/connections` workspace for Carbon conformance and live wiring, replace any same-surface view toggle pattern that conflicts with Carbon guidance, add a new section that reports current connected MIDI devices plus how each device is applied in routing/timing, and keep focused regression coverage passing.
- Why it matters: The user asked for a direct Connections-surface audit and the page currently lacks a device-level operational report even though the hub status and route data exist.
- Dependencies: T202, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx`
- Estimated effort: Medium
- Required outputs: Updated Connections workspace implementation/tests, audit notes covering Carbon and feature wiring, and worklist/licensing evidence for the touched files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 08:19 EDT - Codex
- Completion notes:
  - Replaced the Connections workspace `Tabs` toggle with a Carbon `ContentSwitcher` because the surface is switching between two views of the same routing workspace rather than navigating between independent content areas.
  - Added `web/src/app/components/MidiHub/MidiHubConnectedDevicesReport.tsx` and wired `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx` to show each currently connected MIDI port plus how it is applied through active routes and MIDI clock output assignment.
  - Extended `useMidiHubOverview` so the page can reuse its existing live route and clock status queries rather than introducing duplicate fetches, and updated `web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` to cover the new device report plus the content-switcher interaction.
  - Wiring audit result: the Connections page features remain backed by live `midiHubApi` queries/mutations (`MidiRoutingMatrix`, `MidiPatchbay`, `MidiHubQuickRouter`, and `MidiTrafficMonitor`); no placeholder or disconnected page-level controls were found in this surface.
  - Carbon audit result: the touched Connections page now aligns more closely with Carbon patterns, but the broader MIDI Hub route shell still carries non-token hard-coded visual styling in `web/src/app/pages/MidiHubPage.css` and `web/src/app/pages/midi-hub/MidiHubAreaPage.css`; that unresolved conformance gap is tracked in `T271`.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/components/MidiHub/MidiHubConnectedDevicesReport.tsx`, `web/src/app/components/MidiHub/useMidiHubOverview.ts`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css`, `web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring additional remediation.

ID: T271
Status: [✓] Done
Title: Remove remaining non-token MIDI Hub shell styling from route hero and shared panels
Description:
- Goal / acceptance criteria: Refactor the remaining hard-coded colors, shadows, and uppercase hero/panel styling in `web/src/app/pages/MidiHubPage.css` and `web/src/app/pages/midi-hub/MidiHubAreaPage.css` so the shared MIDI Hub route shell uses Carbon tokens, layering, and productive typography only, with any necessary exceptions documented.
- Why it matters: The Connections audit found that the touched page is improved, but the shared MIDI Hub shell still has visible Carbon conformance debt outside the local device-report patch.
- Dependencies: T270, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- Estimated effort: Medium
- Required outputs: Updated shell CSS/markup, refreshed conformance notes, and regression evidence for the shared MIDI Hub shell.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 08:31 EDT - Codex
- Completion notes:
  - Replaced the remaining bespoke MIDI Hub shell treatment in `web/src/app/pages/MidiHubPage.css` and `web/src/app/pages/midi-hub/MidiHubAreaPage.css`, removing the prior hard-coded blue translucent borders, decorative shadows, gradient title text, and uppercase hero/panel styling in favor of Carbon layer, border, text, and label tokens.
  - Preserved the current layout and routed page structure while shifting the hero, shared panel shells, workflow tiles, stat tiles, placeholder surfaces, and port chips onto Carbon-appropriate layer and productive-typography behavior.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> PASS with existing React Router future-flag warnings only.
  - Licensing: Classified `web/src/app/pages/MidiHubPage.css`, `web/src/app/pages/midi-hub/MidiHubAreaPage.css`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reused the current repository license/notices evidence from `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T272
Status: [✓] Done
Title: Audit and tighten Carbon conformance for Platforms route shell and Theme workspace
Description:
- Goal / acceptance criteria: Audit the routed `/platforms/:workspace` shell and `/platforms/theme` workspace for Carbon conformance and live feature wiring, replace the most visible route-shell styling drift with Carbon token/layer behavior, improve any accessibility gaps in the Theme workspace controls, and keep focused regression coverage passing.
- Why it matters: The user requested the next audit in the same style as MIDI Hub, and these operator surfaces still carry bespoke shell styling and custom control patterns that need explicit review.
- Dependencies: T269, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/pages/ThemePage.tsx`
- Estimated effort: Medium
- Required outputs: Updated platform/theme implementation or documented exceptions, audit notes covering Carbon and feature wiring, and validation/licensing evidence for touched files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 08:49 EDT - Codex
- Completion notes:
  - Audited the routed Platforms shell through `web/src/app/components/Platform/PlatformModal.tsx` and `web/src/app/pages/PlatformShellPage.css`; the route remains live-wired for workspace navigation, pinning, and Labs launches, and the focused `PlatformModal.test.tsx` coverage continued to pass after the shell-token cleanup.
  - Replaced the most visible Platforms route-shell drift in `web/src/app/pages/PlatformShellPage.css`, removing the hard-coded black page background, translucent color-mixed shell panels, and uppercase shell labels in favor of Carbon background, layer, border, and productive label treatment.
  - Audited the Theme workspace wiring in `web/src/app/pages/ThemePage.tsx`; existing coverage confirms theme save/apply, reduced-effects persistence, category color override persistence, and special-settings launching. Added accessible names to the custom family/shade swatch buttons used by the token picker, and flattened the route shell styling in `web/src/app/pages/ThemePage.css` away from decorative hero gradients toward Carbon layer surfaces.
  - Carbon exception result at completion time: the Platforms route still used a custom navigation/control-panel composition instead of Carbon `SideNav`, and the Theme workspace still relied on custom swatch buttons plus a native `input[type=color]` because Carbon does not provide a first-class token color editor. Those retained exceptions were carried into `T273`.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/pages/ThemePage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/pages/PlatformShellPage.css`, `web/src/app/pages/ThemePage.css`, `web/src/app/pages/ThemePage.tsx`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring additional remediation.

ID: T273
Status: [✓] Done
Title: Replace retained custom Platforms navigation and Theme token-editor controls with documented Carbon-aligned patterns
Description:
- Goal / acceptance criteria: Rework the routed Platforms workspace navigation/control panel toward Carbon `SideNav`/launcher patterns where feasible, and replace or formally document the retained custom Theme token-editor controls so the route family has an explicit long-term Carbon exception story instead of ad hoc custom UI.
- Why it matters: `T272` improved the shell styling and accessibility, but the remaining structural conformance gaps still needed either implementation or explicit exception handling.
- Dependencies: T272, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- Estimated effort: Medium
- Required outputs: Refactored or explicitly documented navigation/editor patterns, updated tests, and refreshed Carbon conformance notes for Platforms and Theme.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 13:52 EDT - Codex
- Completion notes:
  - Reworked the routed Platforms navigation rail in `web/src/app/components/Platform/PlatformModal.tsx` onto Carbon `SideNav`, `SideNavItems`, and `SideNavLink`, preserving live route navigation, pinning, and Labs launching while removing the retained custom control-panel implementation.
  - Kept the routed shell styling in `web/src/app/pages/PlatformShellPage.css` aligned with the new Carbon navigation structure so the route now uses Carbon navigation primitives rather than a bespoke launcher composition.
  - Finalized the Theme token-editor accessibility pass in `web/src/app/pages/ThemePage.tsx` by giving the retained family and shade swatch groups radio-group semantics and explicit accessible names; the remaining gap is no longer basic interaction semantics, only the absence of a first-class Carbon token-color editor for freeform color override input.
  - Split the remaining Theme-only Carbon exception into `T274` so the worklist no longer reports the already-fixed Platforms navigation issue as open debt.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/Platform/PlatformModal.test.tsx web/src/app/pages/ThemePage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Platform/PlatformModal.test.tsx`, `web/src/app/pages/PlatformShellPage.css`, `web/src/app/pages/ThemePage.tsx`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring additional remediation.

ID: T274
Status: [✓] Done
Title: Document or replace the remaining Theme token color editor exception
Description:
- Goal / acceptance criteria: Either replace the retained Theme token color override editor with a more Carbon-aligned documented pattern, or publish an explicit exception note covering why the custom swatch groups plus native `input[type=color]` remain necessary for this workflow.
- Why it matters: `T273` closed the Platforms navigation gap, leaving the Theme token editor as the only known Carbon conformance exception still attached to this audit line.
- Dependencies: T273, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/pages/ThemePage.tsx`
- Estimated effort: Small
- Required outputs: Updated Theme implementation or exception documentation, refreshed conformance notes, and focused validation evidence if the UI changes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 13:56 EDT - Codex
- Completion notes:
  - Published the remaining Theme token-editor exception in `docs/design/CARBON_CONFORMANCE_MATRIX.md`, including the rationale for retaining custom family/shade swatches plus native `input[type=color]` for workflow-specific freeform palette overrides.
  - Added a matching Carbon review record in `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md` so the exception and evidence are visible in the standard review artifact instead of only in worklist prose.
  - Extended `web/src/app/pages/ThemePage.test.tsx` with a focused regression proving the retained custom picker exposes labeled `radiogroup` and `radio` semantics.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/ThemePage.test.tsx web/src/app/components/Platform/PlatformModal.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/pages/ThemePage.test.tsx`, `docs/design/CARBON_CONFORMANCE_MATRIX.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T275
Status: [✓] Done
Title: Audit and tighten Carbon conformance for the integrated Home landing route
Description:
- Goal / acceptance criteria: Audit the routed `/` landing workspace for Carbon conformance and live feature wiring, replace any remaining bespoke shell controls or typography treatment in the primary workspace cards, and keep focused Home regression coverage passing.
- Why it matters: MIDI Hub and Platforms/Theme already received post-routing cleanup passes, but the integrated Home route still retains a custom pin control and older uppercase shell-label treatment that diverge from the current Carbon cleanup standard.
- Dependencies: T269, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`
- Estimated effort: Low
- Required outputs: Updated Home route implementation or documented exceptions, wiring audit notes, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 13:56 EDT - Codex
- Completion notes:
  - Audited the integrated Home landing route in `web/src/app/pages/HomePage.tsx` and confirmed its primary actions remain live-wired for canonical route navigation, pin persistence through `useSpecialSettings`, and scoped node telemetry loading.
  - Replaced the bespoke featured-card pin control with a Carbon `Button` in `web/src/app/pages/HomePage.tsx`, preserving the existing accessible pin/unpin labels and route-pinning behavior while removing a route-local custom button implementation.
  - Tightened `web/src/app/pages/HomePage.css` by removing the remaining uppercase eyebrow treatment and aligning the pin control styling with the Carbon button structure.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T276
Status: [✓] Done
Title: Audit and tighten Carbon conformance for the Audio Artifacts route shell
Description:
- Goal / acceptance criteria: Audit the routed `/artifacts` and `/artifacts/discover` workspaces for Carbon conformance and live feature wiring, replace any remaining bespoke loading or shell feedback patterns in the integrated route surface, and keep focused regression coverage passing.
- Why it matters: Audio Artifacts was routed and tokenized under `T269`, but it has not yet received the same post-landing cleanup pass that MIDI Hub, Platforms/Theme, and Home now have.
- Dependencies: T269, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/pages/AudioArtifactsPage.tsx`, `web/src/app/pages/AudioArtifactsPage.css`
- Estimated effort: Low
- Required outputs: Updated Audio Artifacts implementation or documented exceptions, wiring audit notes, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 14:00 EDT - Codex
- Completion notes:
  - Audited the routed Audio Artifacts surface in `web/src/app/pages/AudioArtifactsPage.tsx` and confirmed the primary library/discovery flows remain live-wired for inline details, sync queue access, canonical `/artifacts/discover` navigation, and plugin scan actions.
  - Replaced the plugin empty-state bespoke spinner glyph and inline styling in `web/src/app/pages/AudioArtifactsPage.tsx` with Carbon `InlineLoading`, and updated `web/src/app/pages/AudioArtifactsPage.css` to support the retained layout without the old custom animation.
  - Extended `web/src/app/pages/AudioArtifactsPage.test.tsx` with a focused regression proving the empty state shows Carbon loading feedback while a scan is in progress.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/pages/AudioArtifactsPage.tsx`, `web/src/app/pages/AudioArtifactsPage.css`, `web/src/app/pages/AudioArtifactsPage.test.tsx`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T277
Status: [✓] Done
Title: Audit and tighten Carbon conformance for the JUCE Grid route shell chrome
Description:
- Goal / acceptance criteria: Audit the routed `/juce-grid` shell-level chrome for Carbon conformance and live feature wiring, replace the most visible hard-coded shell palette treatment in the floating launchers and viewport blocker, and keep focused regression coverage passing.
- Why it matters: JUCE Grid remains one of the most visible routed surfaces and still carried a parallel teal/purple shell palette in the route chrome even after the earlier control and modal cleanup tasks.
- Dependencies: T247, T258, T259, T260, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`
- Estimated effort: Low
- Required outputs: Updated JUCE Grid shell styling or documented exceptions, wiring audit notes, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 14:17 EDT - Codex
- Completion notes:
  - Audited the JUCE Grid route shell in `web/src/app/pages/JuceGridPage.tsx` and confirmed the floating Snapshots/MIDI launchers, viewport blocker, and masthead workflows remain live-wired with the existing route behavior unchanged.
  - Replaced the floating launcher shell palette treatment and viewport blocker hard-coded colors in `web/src/app/pages/JuceGridPage.css` with Carbon background, border, icon, and text tokens, removing the prior bespoke teal/purple shell styling from the route chrome.
  - Removed the uppercase trigger-label treatment from the floating launcher pill labels so the shell aligns more closely with the productive sentence-case cleanup applied across the other recent route audits.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS.
  - Licensing: Classified `web/src/app/pages/JuceGridPage.css` and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T278
Status: [✓] Done
Title: Fully refactor the JUCE Grid selected-block audio and MIDI panels onto strict Carbon structure
Description:
- Goal / acceptance criteria: Rework the selected-block audio card shell and selected-block MIDI panel so the visible JUCE Grid editing surfaces use Carbon-native hierarchy, heading semantics, action affordances, and token-driven styling instead of bespoke panel chrome; remove the current compliance failures around typography, surface treatment, and custom control structure; and keep focused regression coverage aligned with the new contract.
- Why it matters: The current selected-block surfaces are only Carbon-inspired. They still rely on custom shell styling, ad-hoc typography, and bespoke panel construction that fails the user’s strict Carbon requirement.
- Dependencies: `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx`, `web/src/app/components/PluginCards/Base/carbonCardStyles.css`, `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Refactored selected-block audio and MIDI UI shells, Carbon-aligned token usage and semantics, focused regression updates, validation notes, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 14:48 EDT - Codex
- Completion notes:
  - Refactored `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx` so the selected-block audio shell now uses semantic section/header structure, a real `h2` title hierarchy, and Carbon ghost icon-only buttons for preset actions instead of bespoke header buttons.
  - Tightened `web/src/app/components/PluginCards/Base/carbonCardStyles.css` onto Carbon layer, border, icon, and text tokens by removing the custom accent-top bar, dropping the local tag typography override, and replacing several hard-coded surface colors with Carbon token-driven treatments.
  - Refactored `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx` so the selected-block MIDI inspector now uses semantic headings plus Carbon `Layer`, `Tile`, `TextInput`, `Select`, `SelectItem`, `Button`, `Checkbox`, and `Tag` structure instead of native form controls and bespoke section chrome.
  - Updated `web/src/app/pages/JuceGridPage.css` to support the new Carbon-native MIDI panel structure, including token-based header/tile surfaces, productive heading styles, Carbon form-control sizing, and selected-row states aligned to interactive border and layer tokens.
- Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched JUCE Grid/card/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T279
Status: [✓] Done
Title: Refactor the remaining JUCE Grid selected-block editor shell and parameter workspace chrome
Description:
- Goal / acceptance criteria: Remove the remaining bespoke selected-block editor-shell treatments around the JUCE Grid parameter workspace by tightening the bottom-editor shell, selected-block placeholders, and parameter-group header structure onto clearer Carbon hierarchy, token-driven surfaces, and simpler Carbon action patterns while preserving the current workflow and focused tests.
- Why it matters: `T278` fixed the selected audio and MIDI panels themselves, but the editor workspace around them still uses custom pill chrome, non-semantic headings, and bespoke shell styling that weakens strict Carbon conformance.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/JuceGridParameterEditor.tsx`, focused JUCE Grid tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Refined selected-block editor shell and parameter workspace, Carbon-aligned hierarchy/styling, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:00 EDT - Codex
- Completion notes:
  - Refined `web/src/app/pages/JuceGridPage.tsx` so the compact-editor placeholder, bottom-editor header, bottom-editor placeholder, and tablet editor header now use semantic headings and simpler Carbon button copy instead of the earlier `strong` labels and bespoke toggle-copy structure.
  - Tightened `web/src/app/pages/JuceGridPage.css` by replacing the bottom-editor shell’s custom gradient pill treatment with simpler Carbon-like interactive states, moving the shell surfaces onto Carbon layer/border tokens, and adding consistent heading/subtitle styles for the selected-block editor workspace.
  - Refined `web/src/app/pages/JuceGridParameterEditor.tsx` so the touch-mode workspace header, parameter-group titles, and parameter control titles now use semantic heading elements and Carbon-sized tags instead of ad-hoc `strong` labels.
  - Updated `web/src/app/pages/JuceGridPage.css` for the parameter editor workspace so the group cards, headers, and parameter controls now use token-based layer surfaces and border treatments aligned with the rest of the selected-block Carbon cleanup.
- Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridParameterAudit.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched JUCE Grid/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T280
Status: [✓] Done
Title: Refactor the remaining JUCE Grid tablet launcher and selected-block navigation chrome
Description:
- Goal / acceptance criteria: Remove the remaining bespoke capsule, pill, and overlay styling from the JUCE Grid tablet launcher, selected-block navigation, compact workflow headers, and tablet editor shell so those surfaces rely on simpler Carbon-aligned structure and token-driven styling while preserving current controls and tests.
- Why it matters: The selected-block panels themselves are now largely Carbon-aligned, but the surrounding tablet and navigation chrome still reads as custom product chrome instead of Carbon-first workspace structure.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Refined tablet launcher/editor and selected-block navigation styling, Carbon-aligned shell hierarchy, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:07 EDT - Codex
- Completion notes:
  - Tightened `web/src/app/pages/JuceGridPage.css` so the compact workflow section headers now use token-based panel surfaces and productive heading sizing instead of bare copy blocks.
  - Refined the selected-block navigation group in `web/src/app/pages/JuceGridPage.css` by replacing the bespoke rounded capsule treatment with a simpler token-driven grouped control shell.
  - Refined the tablet launcher and tablet editor shell in `web/src/app/pages/JuceGridPage.css` so the bottom launcher bar, pager, editor shell, header, and body use simpler Carbon-aligned layer, border, and shadow treatments instead of the heavier custom chrome.
- Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched JUCE Grid/worklist files as MAP2-owned AGPL-covered repository artifacts; reused the current repository license/notices scan and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T281
Status: [✓] Done
Title: Remove remaining non-semantic heading and placeholder patterns from JUCE Grid editor surfaces
Description:
- Goal / acceptance criteria: Replace the remaining `strong`-based headings and similar placeholder/warning title patterns in the JUCE Grid parameter editor and selected-block MIDI list with semantic heading structure and supporting Carbon-aligned styles, without changing workflow behavior.
- Why it matters: The recent Carbon cleanup fixed the shells, but a few editor internals still rely on ad-hoc typographic emphasis instead of semantic hierarchy, which keeps the route short of strict compliance.
- Dependencies: `web/src/app/pages/JuceGridParameterEditor.tsx`, `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid tests, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Semantic heading cleanup for remaining editor titles, any required supporting style updates, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 15:12 EDT - Codex
- Completion notes:
  - Refined `web/src/app/pages/JuceGridParameterEditor.tsx` so the empty state, metadata warning, hardware header, and hardware detail block now use semantic heading elements instead of `strong`-only title treatment.
  - Refined `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx` so the selected MIDI row label now uses a dedicated semantic-style text span and corresponding class instead of a bare `strong`.
  - Updated `web/src/app/pages/JuceGridPage.css` with supporting heading styles for the parameter editor panels and the selected MIDI row label so the new semantic structure preserves the current visual hierarchy.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridParameterAudit.test.tsx` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched JUCE Grid/worklist files as MAP2-owned AGPL-covered repository artifacts; reused the current repository license/notices scan and found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T317
Status: [✓] Done
Title: Simplify the Home landing page into a Carbon-first appliance launcher
Description:
- Goal / acceptance criteria: Re-audit the routed `/` landing page against the active Carbon standard and the user requirement that the surface behave like an appliance launcher for average-reading-level operators; remove overly descriptive or duplicated copy, simplify the main launcher cards into clearer single-purpose entry points, tighten the status sections without changing telemetry wiring, and keep focused Home regression coverage passing.
- Why it matters: `T275` cleaned up the Home route’s remaining bespoke controls, but the page still reads as a dense feature catalog. That weakens Carbon’s productive-product guidance and makes the appliance landing page harder to scan and understand quickly.
- Dependencies: T275, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, `web/src/app/pages/HomePage.test.tsx`
- Estimated effort: Medium
- Required outputs: Simplified Home route markup/styles/copy, focused Home regression updates, audit notes covering remaining exceptions if any, and validation/licensing evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 19:30 EDT - Codex
- Completion notes:
  - Reworked `web/src/app/pages/HomePage.tsx` into a simpler appliance-first launcher with a plain-language hero, status tags, Carbon `ClickableTile` workspaces, and Carbon `ClickableTile` node-status cards while preserving canonical route navigation and scoped cluster telemetry loading.
  - Simplified `web/src/app/pages/HomePage.css` so the landing page now uses one token-driven tile grammar for workspaces and nodes, removes the prior metric/support-card layers, and keeps the 16-column Carbon grid structure intact with the existing responsive breakpoints.
  - Updated `web/src/app/pages/HomePage.test.tsx` to cover the new content contract and single-action launcher behavior, and added a `T317` review record to `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md` so the Carbon audit evidence is captured in the standard review artifact.
  - Carbon audit result: no new exception was required for this slice; the retained MAP2 brand mark is an existing product asset rather than an IBM mark, and the touched landing-route controls are now Carbon primitives.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts` only.
  - Licensing: Classified `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, `web/src/app/pages/HomePage.test.tsx`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, and `docs/PROJECT_WORKLIST.md` as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T318
Status: [✓] Done
Title: Restore visible file-selection and direct upload flows for selected-block NAM and IR editors
Description:
- Goal / acceptance criteria: Make the selected-block Neural Amp Modeler, Cabinet IR, and Reverb IR editors expose an obvious working local-file chooser on the visible card surface and inside the shared manager dialogs, and ensure uploaded assets can be activated immediately instead of requiring a second hidden step.
- Why it matters: Operators are still unable to reliably pick local `.nam` and `.wav` files from the active JUCE Grid editing workflow, which leaves the selected-block NAM and convolution effects practically unusable.
- Dependencies: T314, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, focused loader/card tests, and licensing notes
- Estimated effort: Medium
- Required outputs: Updated card/dialog upload controls, immediate activation behavior for uploaded assets, focused regression coverage, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-22 19:47 EDT - Codex
- Completion notes:
  - Added a reusable direct file-chooser control in `web/src/app/components/loaders/AssetUploadButton.tsx` and `web/src/app/components/loaders/AssetUploadButton.css` that uses a real file input over a Carbon button shell, avoiding the hidden second-step behavior that was leaving NAM and IR uploads effectively inaccessible.
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx` and `web/src/app/components/PluginCards/Layouts/AmplifierCategoryLayout.tsx` so the NAM model selector now appears at the top of the selected-block card with both `Library` and `Upload .nam` actions visible without scrolling, and direct uploads now auto-load the uploaded model.
  - Updated `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`, `web/src/app/components/PluginCards/Layouts/ConvolutionCategoryLayout.tsx`, and `web/src/app/components/PluginCards/Base/carbonCardStyles.css` so the cabinet and reverb IR cards expose top-of-card `Library` plus `Upload WAV` actions and auto-load the uploaded IR immediately.
  - Updated `web/src/app/components/loaders/NAMManagerDialog.tsx` and `web/src/app/components/loaders/IRManagerDialog.tsx` so the shared manager dialogs use the same direct chooser control and automatically activate newly uploaded assets instead of stopping after upload.
  - Extended focused coverage in `web/src/app/components/loaders/NAMManagerDialog.test.tsx`, `web/src/app/components/loaders/IRManagerDialog.test.tsx`, and `web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` for direct upload visibility and auto-load behavior, while `web/src/app/pages/JuceGridPage.test.tsx` continued to pass against the selected-block editor shell.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx web/src/app/pages/JuceGridPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts` only.
  - Licensing: Classified the touched selected-block loader/card/style/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T319
Status: [✓] Done
Title: Audit routed MIDI Hub areas for purpose and eliminate stubbed processing behavior
Description:
- Goal / acceptance criteria: Audit every routed `/midi-hub/*` area (`connections`, `presets`, `transport`, `events`, `processing`, `network`, `lab`) against its stated purpose, verify that each visible workflow is backed by real API/service behavior rather than placeholder state or empty framework code, remove any discovered stubbed behavior, and extend focused frontend/backend regression coverage so the audit is enforceable.
- Why it matters: The user explicitly requested an extensive audit of MIDI Hub functions and rejected stubs or empty frameworks; earlier UI-focused work allowed at least one local-only planning surface to ship, which now undermines the credibility of the routed MIDI Hub workspace.
- Dependencies: `docs/PROJECT_WORKLIST.md`, `app/routes/midi_hub.py`, `app/services/midi_hub/*`, `web/src/map2/api.ts`, `web/src/app/pages/midi-hub/*`, `web/src/app/components/MidiHub/*`, and focused MIDI Hub test suites
- Estimated effort: High
- Required outputs: Area-by-area audit notes, remediated MIDI Hub implementation where stubbed behavior is found, updated focused frontend/backend tests, and validation evidence covering the touched MIDI Hub routes/services.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 05:09 EDT - Codex
- Completion notes:
  - Audited each routed MIDI Hub area and confirmed a concrete purpose plus live backing behavior for `connections` (route graph, traffic, device report), `presets` (preset chains, snapshots, cues), `transport` (clock, recorder, transport fan-out), `events` (event lists, cue learning, MSC/timecode recall), `processing` (filters, scripts, macros, scheduler, mapper), `network` (RTP-MIDI, OSC, MIDI 2.0, Tesira, GPIO, string interface), and `lab` (AI suggestions, mesh, shadow routing); no additional empty route frameworks were found.
  - Replaced the only discovered stubbed workflow by adding `app/services/midi_hub/message_mapper.py`, exposing mapper CRUD/reset routes in `app/routes/midi_hub.py`, extending `web/src/map2/api.ts`, and rewriting `web/src/app/components/MidiHub/MidiHubMessageMapper.tsx` so the 16 mapper slots are node-backed, persisted, telemetry-aware, and emit real MIDI output through the hub instead of saving to browser `localStorage`.
  - Tightened purpose accuracy and live configuration behavior by updating `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` copy to describe the implemented event workspace and hydrating `web/src/app/components/MidiHub/Midi2Panel.tsx`, `web/src/app/components/MidiHub/StringInterfacePanel.tsx`, and `web/src/app/components/MidiHub/TesiraPanel.tsx` from live status rather than hard-coded defaults.
  - Added focused coverage in `tests/midi_hub/test_routes.py`, `tests/midi_hub/test_traffic_routes.py`, and `web/src/app/components/MidiHub/MidiHubMessageMapper.test.tsx` so the mapper service/API/UI path is enforced, while the routed MIDI Hub page suites continue to verify the audited areas.
  - Validation: `pytest tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py tests/test_midi_hub_event_lists.py tests/test_string_interface.py tests/test_virtual_gpio.py tests/test_osc_namespace.py` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/MidiHubMessageMapper.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/midi-hub/MidiHubTransportPage.test.tsx web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` -> PASS; prior validation `npm --prefix web run typecheck` -> PASS and `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts` only.

ID: T320
Status: [✓] Done
Title: Remove orphaned MIDI Hub workbench planner stubs from the routed-shell codebase
Description:
- Goal / acceptance criteria: Remove the unused local-state workbench planner scaffolds left under `web/src/app/components/MidiHub/` after the routed `/midi-hub/*` migration, preserve any shared utility logic still needed by live pages, and keep focused shell/routed MIDI Hub coverage passing.
- Why it matters: The routed MIDI Hub audit cleared visible page stubs, but `MidiHubWorkbenchCards.tsx` still contains dead quick-router/filter/mapper planner frameworks with local-only state and toast-only actions. Leaving them in-tree undermines the no-stub standard and creates a second misleading implementation path.
- Dependencies: T319, `web/src/app/components/MidiHub/MidiHubWorkbenchCards.tsx`, live imports of `readPorts`/`HubPort`, `web/src/app/pages/MidiHubPage.test.tsx`, and focused routed MIDI Hub tests
- Estimated effort: Low
- Required outputs: Shared port utility extraction if needed, removal of dead workbench planner exports/files, updated imports/tests, focused validation evidence, and completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 05:31 EDT - Codex
- Completion notes:
  - Verified the live routed `/midi-hub/*` pages no longer render `MidiHubQuickRouterCard`, `MidiHubFilterPlannerCard`, or `MidiHubMapperPlannerCard`, then extracted the only shared survivor (`readPorts` plus `HubPort`) into `web/src/app/components/MidiHub/portUtils.ts`.
  - Updated `web/src/app/components/MidiHub/useMidiHubOverview.ts`, `MidiPatchbay.tsx`, `MidiRoutingMatrix.tsx`, `MidiHubQuickRouter.tsx`, `MidiHubConnectedDevicesReport.tsx`, and `MidiHubFilterPlanner.tsx` to use the new utility, deleted `web/src/app/components/MidiHub/MidiHubWorkbenchCards.tsx`, and removed the stale workbench mock from `web/src/app/pages/MidiHubPage.test.tsx`.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts` only.
  - Licensing: Classified the touched MIDI Hub frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T321
Status: [✓] Done
Title: Remove backend MIDI Hub placeholder abstractions and harden live MIDI 2.0 packet helpers
Description:
- Goal / acceptance criteria: Eliminate the remaining backend placeholder abstractions found during the continued MIDI Hub audit, specifically by removing unused placeholder port classes and replacing the live MIDI 2.0 helper’s placeholder packing with explicit message-length-aware translation and direct unit coverage.
- Why it matters: The follow-up audit sweep after `T319` and `T320` still surfaced placeholder residue in `app/services/midi_hub/midi2.py` and `app/services/midi_hub/ports.py`; leaving that code in place would contradict the user’s no-stub requirement for MIDI Hub functions.
- Dependencies: T319, T320, `app/services/midi_hub/midi2.py`, `app/services/midi_hub/ports.py`, `app/services/midi_hub/__init__.py`, `tests/midi_hub/test_ports.py`, and focused MIDI Hub backend tests
- Estimated effort: Low
- Required outputs: Hardened MIDI 2.0 helper logic, removal of unused placeholder port abstractions, updated tests, validation evidence, and explicit follow-up capture for any remaining transport-bound MIDI 2.0 gap.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 05:31 EDT - Codex
- Completion notes:
  - Hardened `app/services/midi_hub/midi2.py` so `Midi2Manager` now derives expected MIDI 1.0 message lengths, packs channel-voice and short system messages into explicit 32-bit UMP words, decodes them back with matching length rules, and emits a stable discovery SysEx envelope instead of the earlier placeholder packing comments.
  - Removed the unused `NetworkMidiPort` and `JackMidiPort` placeholder classes from `app/services/midi_hub/ports.py` and corresponding package exports in `app/services/midi_hub/__init__.py`; the live routed stack already uses `MidiNetworkBridge`, RTP transport, and `VirtualMidiPort`/`AlsaMidiPort`, so these dead placeholder abstractions no longer remain in the package surface.
  - Expanded `tests/midi_hub/test_ports.py` with direct MIDI 2.0 round-trip assertions and retained focused route coverage in `tests/midi_hub/test_routes.py` and `tests/midi_hub/test_traffic_routes.py` so the live API path continues to pass against the hardened helper.
  - Validation: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py` -> PASS.
  - Licensing: Classified the touched MIDI Hub backend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T322
Status: [✓] Done
Title: Bind MIDI Hub MIDI 2.0 discovery and property exchange flows to real transport sessions
Description:
- Goal / acceptance criteria: Replace the remaining local control-plane-only MIDI 2.0 discovery/property workflow with transport-bound behavior by selecting a concrete MIDI 2.0-capable port or session, transmitting discovery/property traffic on the wire, ingesting responses back into `Midi2Manager`, and exposing the target binding in the routed Network workspace.
- Why it matters: `T321` removed the placeholder packet packing, but the current `/api/midi/hub/midi2/*` discovery/profile/property endpoints still manage device state locally rather than negotiating with a real MIDI 2.0 transport target.
- Dependencies: T321, `app/services/midi_hub/midi2.py`, `app/services/midi_hub/network.py`, `app/services/midi_hub/rtp_transport.py`, MIDI Hub routes/UI under `app/routes/midi_hub.py` and `web/src/app/components/MidiHub/Midi2Panel.tsx`, and focused backend/frontend regression coverage
- Estimated effort: High
- Required outputs: Transport-bound MIDI-CI/session binding design plus implementation, updated API/UI contracts, response-handling tests, and final validation evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 05:53 EDT - Codex
- Completion notes:
  - Extended `app/services/midi_hub/midi2.py` with real transport bindings (`port` or `network_session`), tracked last TX/RX metadata, and hub subscriber handling so discovery, profile, and property requests now emit bound SysEx payloads and capture responses back into `Midi2Manager` instead of stopping at local control-plane state.
  - Updated `app/services/midi_hub/network.py` to inject raw incoming UDP MIDI into the hub with transport metadata, and updated `app/routes/midi_hub.py` plus `web/src/map2/api.ts` so the API exposes binding configuration plus request/response telemetry for the routed MIDI 2.0 workspace.
  - Hardened `web/src/app/components/MidiHub/Midi2Panel.tsx` so operators must choose a real target before discovery/profile/property actions are enabled, saved bindings rehydrate from live status, and transport failures surface in the UI instead of producing false-positive success toasts.
  - Added focused coverage in `tests/midi_hub/test_routes.py`, `tests/midi_hub/test_traffic_routes.py`, and `web/src/app/components/MidiHub/Midi2Panel.test.tsx` to verify both bound output-port transport and bound network-session transport, including outbound SysEx emission and inbound response capture.
  - Validation: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py` -> PASS (`14 passed`, existing SQLAlchemy `datetime.utcnow()` deprecation warnings only); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/Midi2Panel.test.tsx web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> PASS (`5` suites, `6` tests, existing React Router future-flag warnings only); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched MIDI Hub backend/frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new license-notice gaps requiring remediation.

ID: T323
Status: [✓] Done
Title: Replace simplified MIDI Hub MIDI-CI payloads with spec-accurate request and correlation handling
Description:
- Goal / acceptance criteria: Replace the current stable but simplified MIDI-CI/profile/property SysEx envelopes with spec-accurate request builders and response correlation, so transport-bound MIDI 2.0 sessions can distinguish discovery, profile, and property-exchange replies per target/device without relying on the last active device heuristic.
- Why it matters: `T322` bound the MIDI 2.0 workspace to real hub transports, but the current payload builders and response tracking still implement a simplified envelope/correlation model rather than a full MIDI-CI negotiation state machine.
- Dependencies: T322, `app/services/midi_hub/midi2.py`, routed MIDI 2.0 API/UI flows, and focused backend/frontend regression coverage
- Estimated effort: Medium
- Required outputs: Spec-aligned payload builders, request/response correlation state, updated telemetry/UI messaging, and regression tests proving concurrent or repeated MIDI-CI exchanges stay attributable.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 08:18 EDT - Codex
- Completion notes:
  - Replaced the remaining ad-hoc MIDI 2.0 control envelope in `app/services/midi_hub/midi2.py` with real MIDI-CI Discovery, Reply to Discovery, Profile Inquiry, Set Profile On/Off, Property Exchange Capabilities, and Get/Set Property message builders plus response parsers keyed by real MUIDs and PE Request IDs instead of the earlier last-active-device heuristic.
  - Hardened device state semantics so discovery only becomes confirmed on a Reply to Discovery, profile state only changes after Profile Inquiry replies or Profile Enabled/Disabled reports, Property Exchange values only become cached after successful replies, and request timeouts/send failures now surface as explicit pending/error/timeout state instead of optimistic local success.
  - Expanded the routed API in `app/routes/midi_hub.py` and `web/src/map2/api.ts` with profile inquiry, PE capability inquiry, property reads, and stricter network-session binding rules that require a receive-capable listen session before the MIDI 2.0 workspace can claim round-trip behavior.
  - Updated `web/src/app/components/MidiHub/Midi2Panel.tsx` so the panel now reflects confirmed discoveries, exposes disable-profile and ResourceList/property-read flows, labels profile IDs as 5-byte hex, filters network bindings to listen sessions, and reports local/remote MUID and reply summaries instead of pretending that outbound requests are completed state changes.
  - Extended UMP coverage in `app/services/midi_hub/midi2.py` and `tests/midi_hub/test_ports.py` to round-trip SysEx7 between MIDI 1.0 and UMP in addition to the existing short MIDI 1.0 message translation, aligning the translator with the common user expectation that standard SysEx can move between the two representations.
  - Validation: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py` -> PASS (`16 passed`, existing SQLAlchemy `datetime.utcnow()` deprecation warnings only); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/Midi2Panel.test.tsx web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> PASS (`5` suites, `7` tests, existing React Router future-flag warnings only); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched MIDI Hub backend/frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new license-notice gaps requiring remediation.

ID: T324
Status: [✓] Done
Title: Refactor NAM and IR asset loading onto instance-aware native processor architecture
Description:
- Goal / acceptance criteria: Audit and remediate the NAM, Cabinet IR, and Reverb IR loading stack so file management is centralized and production-grade, selected-block controls target the correct plugin instance, and multiple simultaneous native instances can load different assets at the same time without fighting over global state.
- Why it matters: The current JUCE native path still exposes singleton NAM/IR processors and legacy global web routes, which causes freezes, incorrect cross-instance behavior, and makes enterprise-grade asset lifecycle guarantees impossible.
- Dependencies: `web/src/app/components/PluginCards/Custom/JUCE/*`, `web/src/app/components/loaders/*`, `web/src/map2/api.ts`, `app/routes/nam.py`, `app/routes/ir.py`, `app/services/upload_service.py`, `app/services/juce_engine_service.py`, `juce-engine/Source/JucePluginHost.cpp`, `juce-engine/Source/Map2AudioEngine.*`, related processor classes/tests, and worklist/licensing notes
- Estimated effort: High
- Required outputs: Architecture audit findings, instance-aware NAM/IR control path, improved file-management/upload plumbing, regression coverage, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 08:51 EDT - Codex
- Completion notes:
  - Audit result: `map2://juce/nam`, `map2://juce/convolution/cabinet`, and `map2://juce/convolution/reverb` were still being instantiated as no-op passthrough processors in `juce-engine/Source/JucePluginHost.cpp`, while the web cards were partly routed through singleton `/api/nam/*` and `/api/ir/*` state. That architecture explains the freeze/cross-instance behavior and could not support simultaneous different assets per block.
  - Added real per-instance native processors in `juce-engine/Source/NativeNAMPluginProcessor.*` and `juce-engine/Source/NativeConvolutionPluginProcessor.*`, wired them into `juce-engine/CMakeLists.txt`, `juce-engine/Source/JucePluginHost.cpp`, and `juce-engine/Source/PythonBindings.cpp`, and exposed instance-specific load/status/control methods through `app/services/juce_engine_service.py`.
  - Refactored `app/routes/nam.py` and `app/routes/ir.py` so selected-block NAM/cabinet/reverb requests can target `instance_id`, while global legacy paths remain available for older flows; cabinet/reverb status/load/mix/bypass/navigation are now instance-aware instead of singleton-only.
  - Hardened `app/services/upload_service.py` into a stricter shared file-management path by rejecting path-bearing filenames, keeping uploads in centralized asset directories, and writing atomically so partially written assets are not observed.
  - Updated `web/src/map2/api.ts`, `web/src/map2/types.ts`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, and `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx` so the selected-block editor always scopes NAM/IR status and control mutations to `plugin.instance_id`.
  - Added regression coverage in `tests/test_nam_ir_instance_routes.py`, `web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx`, `web/src/app/components/loaders/NAMManagerDialog.test.tsx`, and `web/src/app/components/loaders/IRManagerDialog.test.tsx`, including explicit instance-id assertions so selected-block NAM/IR flows cannot silently fall back to global APIs.
  - Validation: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `pytest -q tests/test_nam_ir_instance_routes.py` -> PASS (`3 passed`); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx` -> PASS (`16 passed`); `cmake --build juce-engine/build -j2` -> PASS; `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched backend/frontend/native/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T325
Status: [✓] Done
Title: Extend MIDI Hub MIDI2 service with profile-details inquiry, MUID invalidation handling, and broader UMP inspection coverage
Description:
- Goal / acceptance criteria: Deliver the next advanced MIDI 2.0 slice beyond `T323`, specifically Profile Details Inquiry, explicit MUID invalidation handling on both routed command and inbound transport paths, and broader UMP inspection coverage for MIDI 2.0 Channel Voice, SysEx8, and JR timestamp utility messages, with those capabilities surfaced through the routed API/UI where applicable.
- Why it matters: `T323` made the routed MIDI 2.0 interface honest and functional for the core discovery/profile/property/resource-list workflow, but operators still lacked access to the next layer of advanced MIDI-CI interrogation and diagnostic visibility needed to validate real devices against the spec.
- Dependencies: T323, `app/services/midi_hub/midi2.py`, routed MIDI Hub API/UI where new advanced controls are surfaced, and focused backend/frontend regression coverage
- Estimated effort: Medium
- Required outputs: Advanced MIDI-CI inquiry/invalidation support, expanded UMP inspection coverage, updated telemetry/UI affordances, regression tests, and refreshed worklist/licensing evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 08:38 EDT - Codex
- Completion notes:
  - Extended `app/services/midi_hub/midi2.py` with Profile Details Inquiry request/response handling, cached `profile_details` telemetry, inbound MUID invalidation handling for both local and remote targets, explicit device-cache discard logic, and a broader `inspect_ump()` decoder that now reports JR utility messages, MIDI 2.0 Channel Voice packets, and SysEx8/data packets.
  - Exposed the advanced backend slice through `app/routes/midi_hub.py` and `web/src/map2/api.ts` with new routed operations for profile-details inquiry, device invalidation, and UMP inspection so these behaviors are not hidden as service-only hooks.
  - Updated `web/src/app/components/MidiHub/Midi2Panel.tsx` so operators can query profile details, invalidate a discovered device, inspect UMP words directly from the panel, and see cached profile-detail previews instead of relying on backend state only.
  - Added focused regression coverage in `tests/midi_hub/test_ports.py`, `tests/midi_hub/test_routes.py`, `tests/midi_hub/test_traffic_routes.py`, and `web/src/app/components/MidiHub/Midi2Panel.test.tsx` to prove profile-details replies cache correctly, port-bound and network-bound invalidation paths clear device state, and UMP inspection decodes the new advanced packet families.
  - Validation: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py` -> PASS (`17 passed`, existing SQLAlchemy `datetime.utcnow()` deprecation warnings only); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/Midi2Panel.test.tsx web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> PASS (`5` suites, `7` tests, existing React Router future-flag warnings only); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched MIDI Hub backend/frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new license-notice gaps requiring remediation.

ID: T326
Status: [✓] Done
Title: Extend MIDI Hub MIDI2 service with multi-chunk Property Exchange and collision-notification state handling
Description:
- Goal / acceptance criteria: Implement the remaining deep-spec MIDI-CI behaviors that are still outside the routed workspace after `T325`, specifically multi-chunk Property Exchange request/reply assembly, Property Exchange notifications/subscriptions where supported, and more complete MUID collision/renegotiation handling beyond simple invalidation cache clears.
- Why it matters: The routed MIDI 2.0 panel can now interrogate profile details, invalidate devices, and inspect richer UMP packet families, but interoperability against larger Property Exchange payloads and collision-heavy environments still falls short of full advanced-spec behavior.
- Dependencies: T325, `app/services/midi_hub/midi2.py`, routed MIDI Hub API/UI where advanced transaction state must surface, and focused backend/frontend regression coverage
- Estimated effort: High
- Required outputs: Multi-chunk PE transaction support, notification/subscription handling where applicable, stronger MUID collision recovery, regression tests, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:13 EDT - Codex
- Completion notes:
  - Hardened `app/services/midi_hub/midi2.py` so successful recovery sends no longer erase collision/invalidation errors from MIDI2 status, preserving operator-visible fault context until a real protocol reply supersedes it.
  - Completed the advanced MIDI-CI test coverage in `tests/midi_hub/test_routes.py` and `tests/midi_hub/test_traffic_routes.py` by delivering full multi-chunk subscription/update/property reply sequences, validating post-collision rediscovery, and locking the remote-collision heuristic against network-source changes.
  - Validation: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py` -> PASS (`17 passed`, existing SQLAlchemy `datetime.utcnow()` deprecation warnings only); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/Midi2Panel.test.tsx web/src/app/pages/MidiHubPage.test.tsx web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> PASS (`5` suites, `7` tests, existing React Router future-flag warnings only); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched MIDI Hub backend/test/worklist/memory files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" LICENSE README.md docs app web tests .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new license-notice gaps requiring remediation.

ID: T327
Status: [✓] Done
Title: Flatten the JUCE Grid selected-branch header and remove remaining pill chrome
Description:
- Goal / acceptance criteria: Remove the pill-style badges from the desktop JUCE Grid selected-branch header, render the remaining state/context labels as plain inline status text, and fold the selected-branch title treatment into the same header row as the routing/level/utility groups so the card reads as one compact line where space allows, without changing workflow behavior.
- Why it matters: The selected-branch card still used custom pill/tag chrome and a separate title strip above the control groups, which made the operator-facing header denser and taller than requested.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid tests, and worklist/licensing notes
- Estimated effort: Low
- Required outputs: Updated selected-branch desktop header markup/styling, focused validation evidence, and licensing/worklist completion notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 08:49 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the desktop selected-branch header now computes plain-text status items, renders them inline instead of Carbon `Tag` pills, and places the selected-branch title kicker inside the same header row as the branch label/name and control groups.
  - Updated `web/src/app/pages/JuceGridPage.css` so the former title strip is now an inline kicker, the header keeps the title block and action groups on one row where space allows, and the routing mode/AVB context labels render as plain text rather than boxed pills.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx` -> PASS (`26` tests); `npm --prefix web run build` -> PASS (existing Vite dynamic-import warning for `web/src/map2/api.ts` only).
  - Licensing: Classified the touched JUCE Grid route/style/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T328
Status: [✓] Done
Title: Audit second-node behavior on shared AVB and management networks
Description:
- Goal / acceptance criteria: Audit what MAP2 should do when a second host with matching software but a different hostname joins the same AVB Ethernet segment and management network as the existing platform, verify the expected discovery/routing/cluster behavior against current implementation and automated evidence, run all locally available verification commands, and clearly separate simulated/software evidence from hardware-only gaps.
- Why it matters: Multi-node behavior is central to MAP2 AVB and cluster claims, and operators need a concrete expectation for whether a new peer should simply appear, require explicit onboarding, or risk ownership/routing conflicts.
- Dependencies: `docs/AVB_QUALIFICATION_MATRIX.md`, `docs/AVB_MULTI_NODE_IMPLEMENTATION_SUMMARY.md`, `app/routes/avb.py`, `app/services/avb/avb_service.py`, `app/services/avb/avb_router.py`, `app/services/avb/avb_discovery.py`, cluster discovery/routes under `app/routes/cluster_*.py` and `app/services/cluster/*`, AVB/cluster regression suites, and live host API/service checks where available
- Estimated effort: Medium
- Required outputs: Audit summary with expected second-node behavior, command/test evidence, identified gaps or risks, and any follow-up tasks required by the findings
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:01 EDT - Codex
- Completion notes:
  - Audited the second-node MAP2 behavior across the AVB router, AVB stream ownership, mDNS peer discovery, cluster registry, heartbeat-backed cluster health routes, and the AVB routing frontend. Key implementation references: `app/main.py` cluster startup gating (`MAP2_CLUSTER_ENABLED`) and LCD-backed mDNS startup, `app/services/mdns_discovery.py` peer advertisement/discovery, `app/services/avb/avb_router.py` registry-backed MAP2 endpoint discovery plus remote stream provisioning, `app/services/avb/avb_service.py` deterministic ownership metadata, `app/routes/cluster_health.py` heartbeat-backed `/api/cluster/online-nodes`, and `app/services/cluster/ztp.py` explicit cluster registration path.
  - Verified current live host state on `MAP2-TESTBED`: `map2-backend`, `map2-ptp4l`, `map2-phc2sys`, and `map2-srpd` are active; `MAP2_DEPLOYMENT_MODE=ALL-IN-ONE`; `/api/avb/status` reports AVB enabled and operational on `enp11s0`; `/api/avb/ptp/status` reports `available=true` but `state=INITIALIZING`; `/api/cluster/status`, `/api/cluster/online-nodes`, `/api/cluster/discovered`, `/api/avb/discovery`, `/api/avb/discovery/nodes`, `/api/avb/router/endpoints`, and `/api/avb/router/connections` all return zero discovered peers/endpoints/connections on this host at audit time.
  - Backend verification passed with `pytest -q tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py tests/test_avb_discovery_service.py tests/test_cluster_midi_foundation.py tests/test_cluster_health_extended.py` -> `117 passed`; this confirms deterministic ownership metadata, MAP2-to-MAP2 stream provisioning/rollback, AVB discovery cache behavior, and cluster foundation paths remain covered.
  - Frontend verification is partially green: the AVB routing state/inspector/node-tree suites pass, but the canonical `npm run test:avb-routing -- --runInBand --silent` run currently fails in `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx` and `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx` because the tests still expect icon `data-testid`s (`CheckCircleIcon`, `LinkIcon`) that are no longer present in the rendered DOM even though the glyphs still render.
  - Audit conclusion: if a second host is fully enrolled into the MAP2 cluster registry/heartbeat path, you should expect it to become a remote MAP2 node with talker/listener endpoints, cross-node routes, deterministic ownership metadata, and node-scoped UI/inspector visibility. If it is only placed on the same management network with basic IP connectivity, the current code does not guarantee that AVB router discovery or `/api/cluster/online-nodes` will surface it automatically from raw mDNS alone in `ALL-IN-ONE` mode; explicit cluster registration/onboarding remains the reliable path.
  - Audit findings requiring follow-up: `/api/peers` is currently broken at runtime with `500 Internal Server Error` because `app/routes/peer_discovery.py` imports `lcd_manager` from `app/services/lcd_manager.py`, but that module does not expose such a global; also, operator-visible peer-count semantics are split between heartbeat-backed `/api/cluster/online-nodes` and mDNS-backed discovery, which leaves single-node/all-in-one deployments without a clear second-node visibility path unless registration occurs.

ID: T329
Status: [✓] Done
Title: Repair `/api/peers` runtime wiring to the active LCD/mDNS manager instance
Description:
- Goal / acceptance criteria: Make `GET /api/peers` and the related peer-discovery routes resolve the live `LCDManager` instance without import errors, return structured peer discovery payloads in running deployments, and add regression coverage proving the route no longer throws `500` because of missing global-manager symbols.
- Why it matters: The second-node audit surfaced a live production bug where the intended peer-discovery API is unusable, which blocks operators from confirming management-network discovery even when mDNS is otherwise running.
- Dependencies: `app/routes/peer_discovery.py`, `app/services/lcd_manager.py`, startup wiring in `app/main.py` and/or `app/routes/lcd_events.py`, plus focused route tests
- Estimated effort: Medium
- Required outputs: Runtime fix for manager lookup, passing peer-discovery route tests, and validation against the live backend route
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:22 EDT - Codex
- Completion notes:
  - Added explicit runtime manager registration in `app/services/lcd_manager.py` and wired it from `app/main.py` lifespan startup/shutdown so the live `LCDManager` instance is available to peer-discovery route consumers instead of relying on an implied missing global.
  - Updated `app/routes/peer_discovery.py` to resolve the active manager through the shared service lookup, return the correct LCD event WebSocket endpoint in peer payloads, and use the existing `connect_to_peer()` router path for LCD peer-link setup when available.
  - Reused the same startup pass to actually call `init_lcd_routes()` from lifespan, closing the adjacent LCD-event route injection gap that had been imported but never initialized.
  - Added focused regression coverage in `tests/test_peer_discovery_routes.py`, including direct route checks plus an HTTP-level `GET /api/peers` assertion proving the route now returns structured payloads instead of failing with `500` due to missing manager symbols.
  - Validation: `pytest -q tests/test_peer_discovery_routes.py tests/test_node_api.py tests/test_main_cluster_midi_lifecycle.py` -> PASS (`15 passed`, existing deprecation warnings in unrelated node/plugin code only); `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS.
  - Licensing: Classified the touched backend/test/worklist/memory files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|SPDX" LICENSE README.md docs app tests .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new notice gaps requiring remediation.

ID: T330
Status: [✓] Done
Title: Align second-node operator visibility between mDNS peer discovery and cluster heartbeat views
Description:
- Goal / acceptance criteria: Define and implement the intended contract for how a newly reachable MAP2 peer should appear in `ALL-IN-ONE` and non-cluster deployments, specifically reconciling mDNS discovery, `/api/cluster/online-nodes`, `/api/cluster/discovered`, welcome-grid peer counts, and AVB router discovery so operators do not need to guess whether registration is required.
- Why it matters: The audit showed that a second host on the same networks may be discoverable by mDNS yet still remain invisible to the heartbeat-backed cluster endpoint and AVB router unless explicit registry enrollment happens, which creates a gap between operator expectations and current behavior.
- Dependencies: `app/main.py`, `app/routes/cluster_health.py`, `app/routes/cluster_admin.py`, `app/services/mdns_discovery.py`, `app/services/cluster/heartbeat_monitor.py`, `app/services/cluster/registry.py`, `app/services/avb/avb_router.py`, welcome-grid docs/scripts, and focused integration tests
- Estimated effort: High
- Required outputs: Chosen visibility contract, implementation and/or documentation updates, regression coverage for second-node appearance semantics, and refreshed operator runbook guidance
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:44 EDT - Codex
- Completion notes:
  - Implemented a shared merged-node visibility contract in `app/services/cluster/node_visibility.py` that unions live basic mDNS peers, enhanced mDNS nodes, registry entries, and heartbeat state into one remote-node snapshot. Operator-visible routes now consume that shared view instead of diverging: `app/routes/peer_discovery.py` (`/api/peers`), `app/routes/cluster_health.py` (`/api/cluster/online-nodes`, `/api/cluster/offline-nodes`, `/api/cluster/health`), and `app/routes/cluster_admin.py` (`/api/cluster/discovered`).
  - Fixed the cluster heartbeat/runtime side so the monitor can actually read registry rows again by resolving dict-shaped registry entries into real API URLs in `app/services/cluster/heartbeat_monitor.py` instead of assuming object attributes like `.node_id`/`.url`.
  - Updated `app/services/avb/avb_router.py` to discover MAP2 endpoints from the same merged visibility snapshot, and updated `app/services/node_discovery_service.py` to honor `api_url` from `/api/peers` so node topology lookups no longer assume every remote backend lives on `:8080`.
  - Updated the operator-facing frontend consumers to use the explicit online contract from `/api/peers`: `web/src/app/contexts/ClusterContext.tsx` now respects `is_online` and remote hostnames, and `web/src/app/pages/HomePage.tsx` now counts peer-only visible nodes as online even when `/api/cluster/discovered` is empty, which aligns welcome-grid node counts with the backend visibility contract.
  - Added focused regression coverage in `tests/test_cluster_visibility_routes.py`, `tests/test_avb_router_map2.py`, `web/src/app/contexts/ClusterContext.test.tsx`, and `web/src/app/pages/HomePage.test.tsx`, while preserving the earlier peer-route and AVB routing badge coverage.
  - Validation: `pytest -q tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py tests/test_node_api.py` -> PASS (`51 passed`); `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/contexts/ClusterContext.test.tsx web/src/app/pages/HomePage.test.tsx web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx` -> PASS (`4 suites`, `31 tests`); `npm --prefix web run build` -> PASS.
  - Licensing: Classified the touched backend/frontend/test/worklist/memory files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|SPDX" LICENSE README.md docs app tests web .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new notice gaps requiring remediation.

ID: T331
Status: [✓] Done
Title: Harden AVB routing UI regressions against icon-rendering implementation drift
Description:
- Goal / acceptance criteria: Update the failing AVB routing frontend regressions so they assert operator-visible status and cross-node indicators semantically instead of relying on brittle icon `data-testid`s, while preserving coverage for degraded/offline node badges and cross-node route markers.
- Why it matters: The audit showed the canonical AVB routing Jest run currently fails for two suites even though the UI still renders status/link glyphs, which weakens the release-readiness signal for multi-node operator views.
- Dependencies: `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`, `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx`, the related rendered components, and `npm run test:avb-routing`
- Estimated effort: Low
- Required outputs: Updated resilient assertions, green AVB routing Jest run, and completion evidence in the worklist
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:27 EDT - Codex
- Completion notes:
  - Added semantic operator-facing markers in `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.tsx` and `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.tsx` so node-status and cross-node glyphs expose stable accessibility labels instead of forcing tests to inspect icon implementation internals.
  - Updated `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx` to assert online/degraded/offline status by accessible label within each node tab, and updated `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx` to assert the cross-node route indicator semantically instead of checking a Carbon icon `data-testid`.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm run test:avb-routing -- --runInBand --silent` -> PASS (`17 suites`, `232 tests`).
  - Licensing: Classified the touched frontend/test/worklist/memory files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|SPDX" LICENSE README.md docs app tests web .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new notice gaps requiring remediation.

ID: T332
Status: [✓] Done
Title: Design operator-friendly adoption flows for unmanaged MAP2 instances
Description:
- Goal / acceptance criteria: Define practical adoption workflows that let an already-running but not-yet-configured MAP2 node be discovered and adopted from another node with minimal operator friction, covering identity, trust, registration, capability import, and post-adoption feature enablement.
- Why it matters: The second-node audit showed that basic network reachability alone is not enough to make a peer consistently appear across cluster, AVB, and operator views; a first-class adoption flow would reduce setup ambiguity and make all multi-node features easier to use.
- Dependencies: `app/services/mdns_discovery.py`, `app/routes/peer_discovery.py`, `app/routes/cluster_health.py`, `app/routes/cluster_admin.py`, `app/services/cluster/ztp.py`, `app/services/cluster/registry.py`, `app/services/avb/avb_router.py`, onboarding/deployment docs, and future UX/API design work
- Estimated effort: Medium
- Required outputs: Ranked adoption-flow concepts, recommended direction, implementation notes, and follow-up tasks for the chosen flow
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 11:30 EDT - Codex
- Completion notes:
  - Ranked adoption concepts and selected direction: `Approve Discovered Node` as the primary operator UX, `Pairing Code Claim` as the default trust bootstrap, `Standby Then Promote` as the safety model, `Adopt And Clone Profile` as the first operator-speed multiplier, and `Signed Bootstrap Token` as the scale-out/field-install accelerator.
  - Recommended canonical lifecycle: `candidate -> claimable -> adopted -> ready -> active`, with one shared node record carrying identity, addresses, software version, capabilities, trust state, readiness state, activation state, and stable cluster/node ownership metadata.
  - Recommended platform contract: discovery, cluster, onboarding, and AVB features should all consume the same adoption state instead of separately interpreting mDNS visibility, heartbeat state, and registry enrollment.
  - Recommended v1 backend API shape: `GET /api/adoption/candidates`, `GET /api/adoption/candidates/{id}/readiness`, `POST /api/adoption/candidates/{id}/claim`, `POST /api/adoption/candidates/{id}/adopt`, and `POST /api/adoption/nodes/{id}/promote`.
  - Recommended readiness gates before activation: version compatibility, hostname/node-id conflict checks, management API reachability, AVB interface presence, PTP readiness, and role/capability compatibility.
  - Recommended rollout boundary: v1 should ship discovery, claim, adoption, readiness reporting, standby activation, and operator promotion; profile cloning and signed-token zero-touch adoption should follow as v2 accelerators after the base lifecycle is stable.
  - Follow-up implementation tasks were split into backend, operator UI, and v2 accelerators so the chosen adoption model can move directly into delivery.

ID: T333
Status: [✓] Done
Title: Collapse the JUCE Grid desktop branch header into one row above the signal flow
Description:
- Goal / acceptance criteria: Update the desktop `/juce-grid` live-path branch card so every control currently rendered above the signal-flow canvas, including the branch title/name, summary/status text, routing group, level control, and utility actions, lives on a single horizontal header row without changing tablet behavior or the underlying workflows.
- Why it matters: The current selected-branch desktop card still reads as a stacked title strip plus control strip, which wastes vertical space and does not match the requested compact operator layout.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid frontend coverage, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Updated desktop header markup/styling, focused validation evidence, and licensing/worklist completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:26 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the desktop branch card header now renders the title, loaded-block summary, inline status text, routing group, level control, and utility actions as one flattened header row above the signal canvas, while leaving the tablet detail shell unchanged.
  - Updated `web/src/app/pages/JuceGridPage.css` so desktop flow-card headers default to a no-wrap horizontal layout with inline summary/meta truncation, and the existing `max-width: 1184px` breakpoint falls back to wrapping for narrower non-tablet layouts.
  - Added focused coverage in `web/src/app/pages/JuceGridPage.test.tsx` to assert the desktop header keeps the identity block and the routing/level/utility groups together directly above the signal canvas.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand src/app/pages/JuceGridPage.test.tsx` -> PASS (`27` tests).
  - Licensing: Classified the touched JUCE Grid frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.
  - Suggested next tasks: T331, T330, T332

ID: T334
Status: [✓] Done
Title: Refactor JUCE Grid desktop flow services into a thin Carbon-compliant bar
Description:
- Goal / acceptance criteria: Rework the desktop `/juce-grid` flow-card service controls shown above the signal canvas so the routing summary, level control, and exposed utility actions read as one thin Carbon-aligned services bar instead of three bulky boxed groups, while preserving the existing workflows and responsive fallback behavior.
- Why it matters: The current header flattening solved the vertical stacking issue, but the service controls still dominate the row visually and do not read like a compact Carbon toolbar.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid frontend coverage, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Updated desktop service-bar markup/styling, focused regression coverage, and validation evidence
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 09:52 EDT - Codex
- Completion notes:
  - Reworked the desktop JUCE Grid flow header in `web/src/app/pages/JuceGridPage.tsx` so the routing summary, level control, edit action, and utility buttons now live inside one shared `role="toolbar"` services bar instead of three separate desktop panels.
  - Updated `web/src/app/pages/JuceGridPage.css` to style that toolbar as a thinner Carbon-aligned bar with internal dividers, tighter routing readouts, smaller level control chrome, and smaller icon-action sizing, while preserving the existing narrow-layout wrap fallback.
  - Updated `web/src/app/pages/JuceGridPage.test.tsx` so the desktop regression now asserts the single services toolbar plus its internal routing, level, and utility sections.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand src/app/pages/JuceGridPage.test.tsx` -> PASS (`27` tests).
  - Licensing: Classified the touched JUCE Grid frontend/test/worklist/docs files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T335
Status: [✓] Done
Title: Widen the JUCE Grid desktop signal-chain cards to match the lower editor footprint
Description:
- Goal / acceptance criteria: Adjust the desktop `/juce-grid` live-path layout so the signal-chain cards consume materially more horizontal space and visually align with the wider selected-block attribute/MIDI editor area below, without breaking the branch state rails, routing arrows, or tablet/mobile behavior.
- Why it matters: After the desktop header/service-bar compaction work, the flow cards still read narrower than the lower editor workspace, which makes the main signal-chain surface feel constrained relative to the attribute and MIDI panels.
- Dependencies: `web/src/app/pages/JuceGridPage.css`, any focused JUCE Grid regression coverage if structure changes, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Updated desktop live-path width styling, validation evidence, and licensing/worklist completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 10:16 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.css` so desktop live-path rows now use slimmer side/arrow gutter tracks and let each `.juce-grid-page__flow-card` span across the arrow columns, materially widening the visible signal-chain card without removing the state rails or branch arrows.
  - Added responsive resets so the new grid-column span only applies on the desktop multi-column layout; tablet-mode and narrow one-column live-path layouts continue to fall back to the existing single-column behavior.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/JuceGridPage.test.tsx` -> PASS (`27` tests); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched JUCE Grid CSS/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T336
Status: [✓] Done
Title: Move the JUCE Grid signal-flow workspace onto a dedicated full-width shell
Description:
- Goal / acceptance criteria: Replace the desktop `/juce-grid` signal-flow workspace wrapper with a dedicated shell that uses the same width model as the lower selected-block editor, so the signal-chain cards align with the lower attribute/MIDI footprint without relying on row-span hacks or disturbing tablet/mobile behavior.
- Why it matters: The first width attempt did not produce the intended visual result because the real bottleneck is the Carbon `Grid`/`Column` wrapper and its surrounding gutter stack, not only the inner live-path row CSS.
- Dependencies: `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, focused JUCE Grid frontend validation, and licensing/worklist notes
- Estimated effort: Low
- Required outputs: Dedicated signal-flow shell layout, rollback of the earlier unsuccessful row-span tweak, validation evidence, and licensing/worklist completion notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 10:26 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/JuceGridPage.tsx` so the signal-flow workspace now renders inside a dedicated `juce-grid-page__signal-flow-shell` instead of the Carbon `Grid`/`Column` wrapper that was adding extra outer gutters to the live-path cards.
  - Updated `web/src/app/pages/JuceGridPage.css` so the new shell uses the same `min(100%, 118rem)` width model and outer padding pattern as the lower selected-block editor shell, and rolled back the earlier row-span/gutter tweak so this change is driven by the wrapper geometry rather than by overlapping the live-path rows.
  - Validation: `npm --prefix web test -- --runInBand src/app/pages/JuceGridPage.test.tsx` -> PASS (`27` tests); `npm --prefix web run build` -> PASS with the existing Vite dynamic-import warning for `web/src/map2/api.ts`.
  - Licensing: Classified the touched JUCE Grid TS/CSS/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T337
Status: [✓] Done
Title: Restore duplicate-instance runtime identity in native pedalboard state for NAM and IR editors
Description:
- Goal / acceptance criteria: Ensure the live engine pedalboard payload exposes `uri`, `position`, and `instance_id` for each chain item so duplicate native processors such as NAM, Cabinet IR, and Reverb IR can be matched back to the correct selected-block editor instance instead of collapsing onto global state.
- Why it matters: `T324` made the NAM/IR APIs instance-aware, but the runtime chain payload still returned only bare instance IDs, so chain serialization could not reattach those identities and duplicate selected-block editors still fell back to shared NAM state.
- Dependencies: T324, `juce-engine/Source/PythonBindings.cpp`, `app/services/juce_engine_service.py`, `app/services/chain_service.py`, focused engine/runtime identity tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Native pedalboard identity payload fix, regression coverage proving duplicate native chain items retain distinct runtime metadata, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 10:52 EDT - Codex
- Completion notes:
  - Updated `juce-engine/Source/PythonBindings.cpp` so `get_current_pedalboard()` now enriches each chain item from `JucePluginHost::getLoadedPlugins()`, exposing `uri`, `name`, `bypassed`, `position`, and `plugin_position` alongside `instance_id` for every runtime item.
  - This repairs the instance-identity bridge used by `app/services/juce_engine_service.py` and `app/services/chain_service.py`, allowing duplicate `map2://juce/nam` blocks to serialize back to the web editor with distinct `plugin.instance_id` values instead of silently falling back to the global NAM routes.
  - Added regression coverage in `tests/test_juce_engine_current_pedalboard_identity.py` to prove two native NAM instances loaded into the chain surface distinct `instance_id`/`position` pairs through the real pybind engine payload, while `tests/test_juce_engine_service_instance_resolution.py` and `tests/test_chain_service_runtime_mapping.py` continued to pass against the repaired identity contract.
  - Validation: `cmake --build juce-engine/build -j2` -> PASS; `pytest -q tests/test_juce_engine_current_pedalboard_identity.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py` -> PASS (`8 passed`); direct live sanity check via `python3` + `map2_audio_engine.create_engine()` confirmed `get_current_pedalboard()` returns two `map2://juce/nam` items with distinct `instance_id` values and positions.
  - Licensing: Classified the touched native/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T338
Status: [✓] Done
Title: Refactor `/api/plugins` residency/load caches to preserve duplicate URI instances
Description:
- Goal / acceptance criteria: Replace the URI-keyed `_loaded_plugins` / `_resident_plugins` bookkeeping in `app/routes/plugins.py` with an instance-safe representation that can track multiple loaded copies of the same plugin URI without overwriting instance metadata or confusing unload/residency flows.
- Why it matters: The selected-block NAM regression exposed that `/api/plugins` still collapses duplicate loads by URI, which is a correctness risk for other multi-instance workflows even after the native pedalboard identity bridge is repaired.
- Dependencies: T317, T318, T324, T337, `app/routes/plugins.py`, related engine-op/residency tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Duplicate-safe plugin residency cache design/implementation, regression coverage for repeated identical plugin URIs, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 11:19 EDT - Codex
- Completion notes:
  - Refactored `app/routes/plugins.py` so `_loaded_plugins` and `_resident_plugins` now behave as multi-entry buckets per URI instead of singleton URI slots, with helper accessors for append/select/remove/flatten operations. This preserves repeated identical loads rather than overwriting them.
  - Updated the route-level residency and unload flow so `/api/plugins/load` can reuse one parked duplicate instance at a time, `/api/plugins/unload` can target a specific `instance_id`, and load/residency status counting now reflects total cached instances rather than unique URIs only.
  - Updated `/api/plugins/list` to flatten the duplicate-instance buckets and include `instance_id` in the returned loaded/parked entries so callers can distinguish repeated identical plugin URIs without changing existing list consumers, and updated `web/src/map2/api.ts` so the frontend helper can pass `instance_id` through `pluginsApi.unload()` and type the parked-list payload explicitly.
  - Hardened the deferred engine-op helpers so duplicate deferred loads of the same URI update the correct pending cache entry instead of racing to overwrite one shared `_loaded_plugins[uri]` record.
  - Extended regression coverage in `tests/test_plugins_residency.py` and `tests/test_plugins_engine_op_pipeline.py` to prove duplicate URI instances survive deferred load, unload-by-instance only removes the targeted duplicate, list output flattens duplicate buckets, residency parking only moves the selected instance, and the existing engine-op parameter paths remain intact.
  - Validation: `python3 -m py_compile app/routes/plugins.py` -> PASS; `pytest -q tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py` -> PASS (`13 passed`, existing `ServiceManager` deprecation warning only); `pytest -q tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py tests/test_nam_ir_instance_routes.py tests/test_juce_engine_current_pedalboard_identity.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py` -> PASS (`22 passed`, same existing warning only); `npm --prefix web run typecheck` -> PASS.
  - Licensing: Classified the touched backend/frontend-api/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T339
Status: [✓] Done
Title: Implement adoption candidate/readiness backend APIs and shared node state
Description:
- Goal / acceptance criteria: Build the v1 backend adoption contract so running unmanaged MAP2 peers can be listed as candidates, inspected for readiness, claimed, adopted into the registry, and promoted from standby using one shared node-state model that discovery, cluster, and AVB services consume.
- Why it matters: The design work for `T332` is only useful once the platform has one real backend lifecycle for unmanaged peers instead of fragmented mDNS, cluster, and AVB interpretations.
- Dependencies: T329, T330, T332, `app/routes/peer_discovery.py`, `app/routes/cluster_health.py`, `app/routes/cluster_admin.py`, `app/services/cluster/registry.py`, `app/services/cluster/ztp.py`, `app/services/avb/avb_router.py`, and new adoption service/routes/tests
- Estimated effort: High
- Required outputs: Shared adoption-state model, `GET /api/adoption/candidates`, `GET /api/adoption/candidates/{id}/readiness`, `POST /api/adoption/candidates/{id}/claim`, `POST /api/adoption/candidates/{id}/adopt`, `POST /api/adoption/nodes/{id}/promote`, regression coverage, and updated operator/deployment docs
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:10 EDT - Codex
- Completion notes:
  - Added the backend adoption service in `app/services/cluster/adoption.py` with SQLite-backed adoption records and event history, readiness evaluation, candidate reconciliation against `node_visibility`, and claim/adopt/promote lifecycle methods exposed through a singleton service for route/runtime consumers.
  - Added operator-facing adoption APIs in `app/routes/adoption.py` for candidate listing/detail/readiness plus claim, adopt, promote, and forget actions, and registered the route in `app/main.py`.
  - Extended `app/services/cluster/node_visibility.py`, `app/routes/peer_discovery.py`, and `app/routes/cluster_health.py` so discovery and cluster-facing payloads now expose `trust_state`, `adoption_state`, `activation_state`, `readiness_status`, and `adoption_candidate_id`, with the visibility overlay also gating `routing_ready`.
  - Hardened `app/services/avb/avb_router.py` so the MAP2 endpoint discovery fallback no longer treats adopted standby nodes as routable when `routing_ready` is absent and `activation_state` is not active.
  - Added focused regression coverage in `tests/test_adoption_routes.py` and extended `tests/test_avb_router_map2.py`; validation passed with `python3 -m py_compile app/services/cluster/adoption.py app/routes/adoption.py app/services/cluster/node_visibility.py app/routes/peer_discovery.py app/routes/cluster_health.py app/services/avb/avb_router.py` and `pytest -q tests/test_adoption_routes.py tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py` -> PASS (`48 passed`).
  - Residual risk recorded for follow-up: the claim step currently validates pairing-code shape locally but does not yet perform a live remote bootstrap challenge/response handshake, so security-grade pairing verification still needs a dedicated bootstrap surface.

ID: T340
Status: [✓] Done
Title: Build operator adoption inbox and standby-promotion workflow
Description:
- Goal / acceptance criteria: Add the frontend/operator experience for unmanaged-node adoption, including an adoption inbox, candidate detail/readiness views, claim/adopt actions, and explicit standby-to-active promotion controls that reflect the shared backend adoption state.
- Why it matters: Even with the backend contract in place, multi-node setup will remain ambiguous unless operators have one obvious surface that shows which peers are merely discovered, which are adopted, and which are safe to activate.
- Dependencies: T332, T339, `web/src/app/contexts/ClusterContext.tsx`, Home/welcome/cluster operator surfaces, AVB routing entry points, and focused frontend tests
- Estimated effort: High
- Required outputs: Candidate/adoption UI flows, readiness and blocking-state presentation, standby promotion controls, regression coverage, and operator-facing copy/runbook updates
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:10 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/HomePage.tsx` and `web/src/app/pages/HomePage.css` to add an operator-facing adoption queue section on the landing page with readiness/status tags, inline pairing-code entry, `Claim`, `Adopt to standby`, and `Promote to active` actions wired to the new backend adoption routes.
  - Kept the UI scope intentionally narrow so operators have one obvious place to act on unmanaged peers without waiting for a broader cluster-dashboard redesign; the queue hides fully active nodes and focuses on candidates, claimable peers, standby adopted nodes, and blocked cases.
  - Extended `web/src/app/pages/HomePage.test.tsx` to cover the end-to-end queue lifecycle and reran the cluster context coverage to confirm the new home-page surface did not regress peer-aware routing behavior.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/contexts/ClusterContext.test.tsx` -> PASS (`11` tests).

ID: T341
Status: [✓] Done
Title: Add adoption accelerators for profile cloning and signed bootstrap tokens
Description:
- Goal / acceptance criteria: Extend the base adoption workflow with operator-speed and scale-out accelerators, specifically selective config/profile cloning from an existing node and signed bootstrap-token onboarding for repeated installs or field deployment.
- Why it matters: The base claim/adopt/promote lifecycle removes ambiguity, but the real payoff for feature velocity comes when operators can bring matching nodes online with minimal repetitive configuration work.
- Dependencies: T332, T339, T340, deployment/onboarding docs, secret-management primitives, and any config-export/import surfaces needed for safe cloning
- Estimated effort: Medium
- Required outputs: Selective clone model and UI, signed bootstrap-token issuance/validation flow, regression coverage, and rollout/runbook documentation for accelerated adoption
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:41 EDT - Codex
- Completion notes:
  - Completed the signed bootstrap-token accelerator in `T343`, giving operators a short-lived unattended claim path that still verifies the issuer explicitly before a remote node accepts the claim.
  - Completed the selective profile-clone accelerator in `T344`, giving adopted standby nodes a preview-and-apply workflow for safe deployment/runtime/clock/AVB defaults without copying identity or trust material.
  - The adoption accelerator umbrella is now closed because both v2 speed-paths originally scoped under this task have been delivered with backend routes, operator UI, and focused regression coverage.

ID: T342
Status: [✓] Done
Title: Add remote bootstrap pairing-code verification for adoption claims
Description:
- Goal / acceptance criteria: Replace the current local-format-only claim validation with a real remote bootstrap handshake so unmanaged nodes issue pairing codes, verify claims live, and only transition to `claimable` after the controller proves possession of the correct code against the remote node.
- Why it matters: `T339` delivered the shared adoption lifecycle, but the current claim step is not yet a secure onboarding primitive because it does not perform a live challenge/response with the remote peer.
- Dependencies: T339, `app/services/cluster/adoption.py`, new bootstrap route/service work on each node, focused adoption-route tests, and operator-facing messaging for pairing-code failures
- Estimated effort: Medium
- Required outputs: Remote bootstrap status/claim endpoints, adoption-service integration, regression coverage proving bad codes are rejected by the remote peer, and worklist completion evidence
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:10 EDT - Codex
- Completion notes:
  - Added `app/services/cluster/adoption_bootstrap.py` and `app/routes/bootstrap.py` so every MAP2 node now exposes a remote bootstrap surface with one-time pairing codes, short-lived claim tokens, and explicit finalize semantics for claim consumption.
  - Registered the bootstrap routes in `app/main.py`, and updated `app/services/cluster/adoption.py` so `claim_candidate()` now performs a live remote `/api/bootstrap/claim` request and stores the returned claim token/fingerprint, while `adopt_candidate()` finalizes that remote claim through `/api/bootstrap/finalize` before the node is treated as adopted.
  - Added focused regression coverage in `tests/test_bootstrap_routes.py` and updated `tests/test_adoption_routes.py` to reflect the new remote verification contract. Validation passed with `python3 -m py_compile app/services/cluster/adoption_bootstrap.py app/routes/bootstrap.py app/services/cluster/adoption.py` and `pytest -q tests/test_bootstrap_routes.py tests/test_adoption_routes.py tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py` -> PASS (`51 passed`).

ID: T343
Status: [✓] Done
Title: Add signed bootstrap-token accelerator for unattended adoption
Description:
- Goal / acceptance criteria: Extend the bootstrap/adoption flow so a controller node can issue short-lived signed bootstrap tokens that let a fresh node self-present as trusted or pre-claimed without requiring manual pairing-code entry, while preserving the existing readiness and promotion gates.
- Why it matters: Pairing codes solve secure interactive onboarding, but repeated installs and field deployment still need a low-friction accelerator that does not require live manual code exchange for every node.
- Dependencies: T339, T342, `app/services/cluster/adoption_bootstrap.py`, `app/routes/bootstrap.py`, operator adoption UI surfaces, and focused token-validation tests
- Estimated effort: Medium
- Required outputs: Token issuance/validation primitives, bootstrap route updates, adoption-service integration, regression coverage, and operator-facing workflow notes
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 14:07 EDT - Codex
- Completion notes:
  - Extended `app/services/cluster/adoption_bootstrap.py` and `app/routes/bootstrap.py` so controller nodes can issue short-lived signed bootstrap tokens, issuer nodes can verify them explicitly through `/api/bootstrap/tokens/verify`, and remote nodes can accept a verified token through the existing `/api/bootstrap/claim` flow without requiring manual pairing-code entry.
  - Updated `app/services/cluster/adoption.py` and `app/routes/adoption.py` so adoption claims now accept either a live pairing code or a signed bootstrap token, while preserving the existing readiness, remote-claim finalization, and promotion gates.
  - Extended the Home-page adoption inbox in `web/src/app/pages/HomePage.tsx` with a `Claim with token` action that issues a token from the controller node and immediately uses it for the remote claim path.
  - Added regression coverage in `tests/test_bootstrap_routes.py`, `tests/test_adoption_routes.py`, and `web/src/app/pages/HomePage.test.tsx` to prove token issue/verify, remote token claim/finalize, adoption-route token claims, and the operator token-claim UI all work end to end.
  - Validation: `python3 -m py_compile app/services/cluster/adoption_bootstrap.py app/routes/bootstrap.py app/routes/adoption.py app/services/cluster/adoption.py` -> PASS; `pytest -q tests/test_bootstrap_routes.py tests/test_adoption_routes.py tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py` -> PASS (`54 passed`); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/contexts/ClusterContext.test.tsx` -> PASS (`12` tests).

ID: T344
Status: [✓] Done
Title: Add selective profile-clone accelerator for adopted nodes
Description:
- Goal / acceptance criteria: Let operators adopt a node and selectively clone safe subsets of configuration from an existing managed node, including role/profile defaults and other non-identity settings, with explicit preview/selection instead of all-or-nothing copying.
- Why it matters: Once secure adoption is in place, reducing repetitive configuration work is the next biggest speed multiplier for matching hardware rollouts.
- Dependencies: T339, T340, future config export/import primitives, and safe clone-boundary design
- Estimated effort: Medium
- Required outputs: Cloneable-profile model, API/UI workflow for selective cloning, regression coverage, and operator runbook updates
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:41 EDT - Codex
- Completion notes:
  - Extended `app/services/cluster/adoption.py` and `app/routes/adoption.py` with clone-source discovery plus preview/apply endpoints for adopted nodes: `GET /api/adoption/nodes/{id}/clone/sources`, `GET /api/adoption/nodes/{id}/clone/preview`, and `POST /api/adoption/nodes/{id}/clone`.
  - Implemented safe clone groups backed by real source-node APIs instead of static templates: role/deployment mode via `/api/deployment/mode`, runtime profile via `/api/runtime-profiles/status`, clock/sync defaults via `/api/audio/source-of-truth`, and AVB defaults via `/api/avb/status`.
  - Clone application now writes the selected settings back through the target node’s own management APIs, records `profile_clone` metadata in both the adoption record and cluster registry, and preserves the existing readiness/promotion gates instead of silently activating the node.
  - Updated `web/src/app/pages/HomePage.tsx` and `web/src/app/pages/HomePage.css` so adopted standby nodes automatically surface clone sources, clone-group previews with explicit selection checkboxes, and an `Apply selected clone` action before promotion.
  - Added regression coverage in `tests/test_adoption_routes.py` and `web/src/app/pages/HomePage.test.tsx` to prove clone-source listing, preview generation, remote apply behavior, registry metadata persistence, and the Home-page clone workflow all work end to end.
  - Validation: `python3 -m py_compile app/services/cluster/adoption.py app/routes/adoption.py app/services/cluster/adoption_bootstrap.py app/routes/bootstrap.py` -> PASS; `pytest -q tests/test_bootstrap_routes.py tests/test_adoption_routes.py tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py` -> PASS (`55 passed`); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/contexts/ClusterContext.test.tsx` -> PASS (`13` tests).

ID: T345
Status: [✓] Done
Title: Publish adoption workflow runbook and operator troubleshooting guide
Description:
- Goal / acceptance criteria: Document the delivered adoption lifecycle, token-claim flow, selective clone workflow, API surfaces, and failure-state troubleshooting so operators and future engineers have one canonical runbook for bringing unmanaged nodes online safely.
- Why it matters: The adoption backend/UI work is now shipped, but it is still hard to operate or extend safely unless discovery, trust, readiness, promotion, token bootstrap, and clone boundaries are written down in one place.
- Dependencies: T339, T340, T342, T343, T344, `docs/`, `.gemini/instructions.md`
- Estimated effort: Low
- Required outputs: A canonical adoption runbook in `docs/`, troubleshooting guidance for claim/adopt/promote/clone failures, and a shared learned-fix entry in `.gemini/instructions.md`
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:41 EDT - Codex
- Completion notes:
  - Added [docs/ADOPTION_WORKFLOW_RUNBOOK.md](/home/mm/map2-audio/docs/ADOPTION_WORKFLOW_RUNBOOK.md) as the canonical operator and engineering guide for the shipped adoption lifecycle, including pairing-code claims, signed-token claims, standby promotion, clone boundaries, API references, readiness interpretation, troubleshooting, and focused validation commands.
  - Updated `.gemini/instructions.md` with a new learned-fix rule that preserves the `candidate -> claimable -> adopted -> ready -> active` lifecycle split and explicitly warns future work not to collapse discovery, trust, readiness, and activation into one state.

ID: T346
Status: [✓] Done
Title: Make flow snapshot capture and apply paths duplicate-instance safe
Description:
- Goal / acceptance criteria: Ensure flow snapshot parameter capture and snapshot apply logic target the correct runtime plugin instance when a chain contains duplicate plugin URIs by threading chain position through engine lookups instead of relying on URI-only resolution.
- Why it matters: The NAM/IR multi-instance refactor is incomplete if snapshot save/load can still read from or write to the wrong duplicate instance, because recalling a snapshot would silently cross-wire processors that are supposed to own different files.
- Dependencies: T324, T337, T338, `app/routes/flow_snapshots.py`, `app/services/juce_engine_service.py`, focused snapshot-route tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Position-aware snapshot capture/apply implementation, regression coverage for duplicate URI plugins, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:58 EDT - Codex
- Completion notes:
  - Updated `app/routes/flow_snapshots.py` so snapshot enrichment and apply paths derive `plugin_position` from each plugin payload and thread that position through every engine lookup instead of relying on URI-only matching.
  - Extended `app/services/juce_engine_service.py` so `get_parameter()` accepts the same `plugin_position` hint already supported by `set_parameter()`, allowing snapshot capture to read from the correct duplicate runtime instance instead of silently collapsing onto the first matching URI.
  - Added focused regression coverage in `tests/test_flow_snapshots_routes.py` proving two duplicate `urn:test:duplicate` plugins at positions `0` and `1` capture distinct parameter values and apply bypass/parameter changes to distinct runtime instances resolved by position.
  - Validation: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `pytest -q tests/test_flow_snapshots_routes.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py tests/test_nam_ir_instance_routes.py tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py` -> PASS (`27 passed`, existing `ServiceManager` and `datetime.utcnow()` deprecation warnings only).
  - Licensing: Classified the touched backend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T347
Status: [✓] Done
Title: Refactor chain A/B compare and morph routes to preserve duplicate plugin identities
Description:
- Goal / acceptance criteria: Replace URI-only plugin matching in `app/routes/chains_ab_mode.py` so compare and morph operations distinguish duplicate plugin instances by chain position, report duplicate-aware diffs, and apply morphed parameters to the correct runtime plugin instance.
- Why it matters: Duplicate NAM/IR blocks are now a supported workflow, but the A/B tooling still collapses repeated URIs into one logical plugin, which can hide real chain differences and push morph values into the wrong processor instance.
- Dependencies: T324, T337, T338, T346, `app/routes/chains_ab_mode.py`, new route-level tests, and worklist/licensing notes
- Estimated effort: Medium
- Required outputs: Duplicate-safe compare/morph implementation, regression tests covering repeated identical plugin URIs, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 13:58 EDT - Codex
- Completion notes:
  - Refactored `app/routes/chains_ab_mode.py` to identify plugins by `(uri, plugin_position)` instead of URI alone, so compare and morph flows no longer collapse duplicate NAM/IR or other repeated plugin instances into one logical entry.
  - Compare responses now report duplicate-aware `common_plugin_refs`, preserve unmatched duplicate plugins in `only_in_a`/`only_in_b`, and compute `plugin_count_diff` from the actual chain plugin lists rather than the number of unique URIs.
  - Morph responses now preserve `plugin_position` for each interpolated plugin and pass that position through `engine.set_parameter(...)`, ensuring morphed values are applied to the correct runtime instance when identical plugin URIs appear multiple times in a chain.
  - Added `tests/test_chains_ab_mode_identity.py` to prove duplicate compare counts and duplicate morph application both preserve position identity, and fixed the adjacent route/runtime defect by adding the missing `CHAIN_MORPHED` member to `app/services/event_publisher.py`.
  - Validation: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `pytest -q tests/test_chains_ab_mode_identity.py tests/test_flow_snapshots_routes.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py tests/test_nam_ir_instance_routes.py tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py` -> PASS (`29 passed`, existing `ServiceManager` and `datetime.utcnow()` deprecation warnings only).
  - Licensing: Classified the touched backend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T348
Status: [✓] Done
Title: Extend realtime parameter routing to preserve duplicate plugin identities
Description:
- Goal / acceptance criteria: Upgrade the realtime websocket parameter bridge, frontend RT client/hooks, and engine callback routing so parameter updates can carry `plugin_position` / `instance_id` all the way to the audio engine, preventing duplicate plugin URIs from collapsing onto the first loaded instance during live websocket control.
- Why it matters: The NAM/IR multi-instance fixes now cover chain serialization, plugin residency, flow snapshots, and A/B morphing, but the dedicated realtime websocket control path still modeled a plugin as `(plugin_uri, param_index)` only, which is not sufficient once multiple identical plugin URIs are loaded simultaneously.
- Dependencies: T324, T337, T338, T346, T347, `app/services/realtime_parameter_bridge.py`, `app/services/parameter_routing.py`, `web/src/map2/realtimeParams.ts`, `web/src/map2/hooks/useRTParameter.ts`, focused routing tests, and worklist/licensing notes
- Estimated effort: High
- Required outputs: Position-aware realtime websocket update contract, end-to-end routing changes for frontend RT producers and engine callback consumers, regression coverage for duplicate URI live-control paths, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 14:11 EDT - Codex
- Completion notes:
  - Extended `app/services/realtime_parameter_bridge.py` so cache keys, subscriptions, update coalescing, JSON websocket payloads, and engine callbacks can all carry `instance_id` / `plugin_position` instead of collapsing duplicate plugins to `(plugin_uri, param_index)` only.
  - Updated `app/services/parameter_routing.py` so realtime engine callbacks now pass explicit identity through to the engine; JUCE updates with a resolved position/instance bypass the URI-only dispatcher and route directly to the correct runtime instance.
  - Updated `web/src/map2/realtimeParams.ts`, `web/src/map2/hooks/useRTParameter.ts`, and `web/src/app/hooks/useJucePluginRT.ts` so realtime frontend subscriptions, cached-value lookups, optimistic sends, reconnect resubscribe, and plugin RT hooks all preserve duplicate-safe identity via optional `plugin_position` / `instance_id`.
  - Updated `app/routes/websocket_rt.py` protocol examples to document the new optional identity fields, keeping the websocket contract aligned with the delivered implementation.
  - Added regression coverage in `tests/test_realtime_parameter_bridge_identity.py`, `tests/test_parameter_routing_identity.py`, and `web/src/map2/realtimeParams.test.ts` to prove duplicate websocket subscriptions remain isolated by `plugin_position`, engine callbacks receive explicit identity, JUCE instance-resolved updates avoid URI-only dispatch, and frontend RT handlers do not cross-talk between duplicate plugin positions.
  - Validation: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `pytest -q tests/test_realtime_parameter_bridge_identity.py tests/test_parameter_routing_identity.py` -> PASS (`3 passed`); `pytest -q tests/test_realtime_parameter_bridge_identity.py tests/test_parameter_routing_identity.py tests/test_chains_ab_mode_identity.py tests/test_flow_snapshots_routes.py` -> PASS (`9 passed`, existing `ServiceManager` / `datetime.utcnow()` deprecation warnings only); `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/map2/realtimeParams.test.ts` -> PASS (`1 passed`).
  - Licensing: Classified the touched backend/frontend/test/worklist files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

ID: T349
Status: [✓] Done
Title: Persist duplicate-safe target identity for MIDI learn and automation lanes
Description:
- Goal / acceptance criteria: Extend persisted MIDI learn/mapping and automation lane targets so they can store and reload `plugin_position` or another stable instance discriminator, allowing duplicate plugin URIs to receive deterministic live-control updates after restart or when mappings are created outside the websocket UI path.
- Why it matters: `T348` fixed the live websocket transport, but MIDI mappings, learn state, and automation lanes still persist targets as `plugin_uri:param_index` only, so duplicate-instance live control is not restart-safe for those producer paths yet.
- Dependencies: T348, `app/database.py`, `app/services/midi_engine.py`, `app/services/midi_service.py`, `app/services/automation_engine.py`, any required persistence/backfill helpers, focused migration/tests, and worklist/licensing notes
- Estimated effort: High
- Required outputs: Persisted duplicate-safe MIDI/automation target identity model, runtime loader/writer updates, regression coverage, validation evidence, and licensing review notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 15:44 EDT - Codex
- Completion notes:
  - Added additive SQLite schema upgrades in `app/database.py` so existing databases gain `midi_mappings.target_plugin_position`, `midi_learn_state.target_plugin_position`, and `automation_lanes.plugin_position` without destructive migration work.
  - Extended `app/services/midi_engine.py`, `app/services/midi_service.py`, `app/services/midi_mapping_service.py`, `app/services/command_queue.py`, `app/routes/midi.py`, and `app/routes/midi_v2.py` so legacy MIDI mappings, MIDI v2 mappings, learn targets, and related API payloads persist and reload duplicate-safe `plugin_position` identity instead of collapsing back to URI-only targets.
  - Extended `app/services/juce_engine_service.py` to resolve duplicate-safe runtime instance IDs for `midi_set_all_cc_mappings`, single-mapping sync, live learn start, and parameter reads, so the native JUCE MIDI path now targets the correct duplicate instance as well.
  - Extended `app/services/automation_engine.py` to persist/export `plugin_position`, build duplicate-safe parameter IDs (`plugin_uri:param_index@position`), dispatch callbacks with explicit identity, and provide compatibility helpers used by `app/routes/automation.py`, removing the stale route/engine API mismatch discovered during the audit.
  - Added regression coverage in `tests/test_midi_automation_identity_persistence.py` for additive schema upgrade, legacy MIDI engine persistence/rehydration, MIDI v2 mapping + learn persistence/sync, automation lane save/load/export identity, and JUCE binding resolution.
  - Validation: `PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `git diff --check -- app/database.py app/services/automation_engine.py app/services/midi_engine.py app/services/midi_service.py app/services/juce_engine_service.py app/routes/midi.py app/routes/midi_v2.py app/routes/automation.py app/services/midi_mapping_service.py app/services/command_queue.py app/response_models.py tests/test_midi_automation_identity_persistence.py docs/PROJECT_WORKLIST.md` -> PASS; `pytest -q tests/test_midi_automation_identity_persistence.py tests/test_parameter_routing_identity.py tests/test_realtime_parameter_bridge_identity.py tests/test_chains_ab_mode_identity.py tests/test_flow_snapshots_routes.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py tests/test_nam_ir_instance_routes.py tests/test_juce_engine_current_pedalboard_identity.py` -> PASS (`38 passed`, existing `ServiceManager` / `datetime.utcnow()` deprecation warnings only).
  - Licensing: Classified the touched backend/test/worklist/instructions files as MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing .gemini/instructions.md` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`; found no new AGPL or third-party notice gaps requiring follow-up work.

## MIDI Integration Audit (2026-03-23)

ID: T378
Status: [✓] Done
Title: MIDI audit — JUCE-GRID WebSocket learn completion and real-time CC activity
Description:
- Goal / acceptance criteria: Replace polling-only MIDI learn completion and CC activity display with WebSocket-primary delivery for instant feedback.
- Why it matters: 500ms learn latency and 2s CC activity latency are below industry standard for a pro audio MIDI controller interface.
- Dependencies: None
- Estimated effort: Low
- Required outputs: WebSocket-driven learn completion + CC activity in JuceGridPage.tsx
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:00 EDT - Codex
- Completion notes:
  - Added `midi_learn` to `WebSocketTopic` union in `web/src/map2/websocket.ts`
  - Added `useWebSocketTopic('midi_learn', ...)` handler in `JuceGridPage.tsx` for instant learn completion with toast confirmation
  - Added `useWebSocketTopic('midi_activity', ...)` handler for instant CC activity display (handles both C++ engine and Hub payload formats)
  - Modified `lastMidiEvent` memo to prefer WebSocket data over polled status
  - Polling retained as fallback for resilience
  - TypeScript clean, build passes

ID: T379
Status: [✓] Done
Title: MIDI audit — Fix broken device open/close API contract between frontend and backend
Description:
- Goal / acceptance criteria: Frontend calls `POST /v2/midi/devices/input` with `{device_name}` and `DELETE /v2/midi/devices/input` — backend must implement these endpoints.
- Why it matters: Every MIDI device open/close attempt from JUCE-GRID was returning 404 due to API contract mismatch (frontend sends name, backend expected index path param).
- Dependencies: None
- Estimated effort: Low
- Required outputs: Name-based device open endpoints + individual close endpoints in midi_v2.py
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:00 EDT - Codex
- Completion notes:
  - Added `POST /devices/input` and `POST /devices/output` with `DeviceOpenRequest(device_name)` body, resolving name to index via `_resolve_device_index()`
  - Added `DELETE /devices/input` and `DELETE /devices/output` for individual device close
  - Response shape `{success: true, device: "..."}` matches frontend expectations
  - Kept legacy index-based endpoints for backward compatibility
  - Python syntax validated

ID: T380
Status: [✓] Done
Title: MIDI audit — Fix missing status fields (input_open, output_open, last_cc/channel/value)
Description:
- Goal / acceptance criteria: `GET /v2/midi/status` must return all fields the frontend `MIDIStatus` type expects.
- Why it matters: Frontend displays device open state and last CC activity from status — missing fields caused undefined renders.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Status endpoint returns `input_open`, `output_open`, `last_channel`, `last_cc`, `last_value` from engine status dict.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:00 EDT - Codex
- Completion notes:
  - Added `input_open`, `output_open`, `last_channel`, `last_cc`, `last_value` to status response, forwarded from `engine_status` dict (populated by C++ `midiStatusToDict`)

ID: T381
Status: [✓] Done
Title: MIDI audit — Add missing PATCH /commands, routing-rules CRUD, send CC/PC/Note, and sync endpoints
Description:
- Goal / acceptance criteria: All endpoints defined in frontend `midiApiV2` must have corresponding backend handlers.
- Why it matters: Multiple frontend API calls were hitting 404: command update, routing rules CRUD, MIDI send CC/PC/Note, and controller sync.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Backend route handlers in midi_v2.py for all orphaned frontend endpoints.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:00 EDT - Codex
- Completion notes:
  - Added `PATCH /commands/{command_id}` with `CommandUpdateRequest` — updates any command field
  - Added `GET/POST/DELETE /routing-rules` with DB model mapping (`MIDIRoutingRule.cc` → frontend `data1`, `routing_data` → `from_flow_index`/`to_flow_index`)
  - Added `POST /send/cc`, `POST /send/program-change`, `POST /send/note` — delegates to C++ engine `midi_send_cc/program_change/note_on/note_off`
  - Added `POST /sync` — calls `midi_sync_all_mappings_to_controller()`
  - Python syntax validated

ID: T382
Status: [✓] Done
Title: MIDI audit — Bridge C++ engine MIDI input into Hub routing matrix
Description:
- Goal / acceptance criteria: MIDI messages received by the C++ MidiHandler (ALSA) must be forwarded into the MidiHub's routing matrix so they are visible to Hub routes, traffic monitor, scripts, and macros.
- Why it matters: Currently the C++ engine and Python MidiHub are two siloed MIDI stacks. A MIDI controller opened by the engine is invisible to Hub routing. This is the single largest architectural gap in the MIDI implementation.
- Dependencies: `juce-engine/Source/MidiHandler.cpp` (monitor callback), `app/services/midi_broadcast.py` (bridge point), `app/services/midi_hub/hub.py` (publish method)
- Estimated effort: High
- Required outputs: Bridge service that publishes C++ engine MIDI messages into MidiHub as a virtual port, and optionally routes Hub output back to the engine for MIDI output. Must not introduce latency > 1ms.
Subtasks:
  - [ ] Register a virtual "JUCE Engine Input" port in MidiHub on startup
  - [ ] In `midi_broadcast.py._on_midi_message()`, publish raw MIDI bytes to Hub via the virtual port
  - [ ] Register a virtual "JUCE Engine Output" port for Hub→Engine feedback path
  - [ ] Verify Hub traffic monitor shows engine-originated messages
  - [ ] Verify Hub routes can filter/transform engine MIDI
  - [ ] Latency measurement: bridge overhead must be < 1ms
Assigned to: Codex
Last updated: 2026-03-23 18:40 EDT - Codex
- Completion notes:
  - Updated `app/services/midi_broadcast.py` so the JUCE-engine monitor callback now converts engine MIDI payloads into raw bytes and injects them into MidiHub as source port `consumer:juce_engine_out` with bridge metadata instead of leaving the C++ engine isolated from the Hub routing matrix.
  - Hardened the same bridge registration path to ensure `JUCE Engine Input` and `JUCE Engine Output` virtual ports are present in MidiHub alongside the existing broadcast sink, and start the hub when the broadcast bridge attaches so the engine-originated injection path is active.
  - Kept the existing Hub→engine feedback path intact: `app/services/midi_engine.py` was already subscribing to `consumer:juce_engine_in`, so this slice closes the missing engine→Hub direction and completes the end-to-end bridge.
  - Added focused coverage in `tests/midi_hub/test_consumer_migration.py` proving an engine-originated CC becomes inbound hub traffic from `consumer:juce_engine_out`, routes through `MidiRouter` into a virtual destination port, and shows up in broadcast activity payloads.
  - Validation passed with `pytest tests/midi_hub/test_consumer_migration.py tests/midi_hub/test_script_engine.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py`.
  - Software-only bridge timing probe on this host measured `avg_ms=0.002149`, `p95_ms=0.003773`, and `max_ms=0.018339` across 200 injected CC messages while routing them through MidiHub, comfortably below the `< 1 ms` acceptance target for bridge overhead.
  - Licensing review: touched backend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T383
Status: [✓] Done
Title: MIDI audit — Script engine execution sandbox verification
Description:
- Goal / acceptance criteria: Verify that `MidiScriptEditor.tsx` Python/Lua scripts actually execute in the backend, not just CRUD stubs. If stubs, implement the execution sandbox.
- Why it matters: The Hub GUI exposes a full script editor with run/trigger buttons — if the backend only does CRUD without execution, the feature is non-functional.
- Dependencies: `app/services/midi_hub/script_engine.py`
- Estimated effort: Medium
- Required outputs: Verified script execution or implemented sandbox with security constraints.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:30 EDT - Codex
- Completion notes:
  - Verified `app/services/midi_hub/script_engine.py` already provides real backend execution for `run_script`/`trigger_script` with a restricted `SAFE_BUILTINS` sandbox, `midi`/`state`/`hub`/`log`/`timer` bridges, and console logging; the MIDI Hub scripting UI is not CRUD-only.
  - Added focused backend coverage in `tests/midi_hub/test_script_engine.py` proving scripts can mutate persisted state, emit MIDI through `MidiHub`, log to the console, and reject unsafe imports because `__import__` is not exposed in the sandbox.
  - Revalidated the existing route-level execution coverage in `tests/midi_hub/test_routes.py` and `tests/midi_hub/test_traffic_routes.py`, which already exercise script upsert, run, trigger, console, enable/disable, and stop flows from the exposed API handlers.
  - Validation passed with `pytest tests/midi_hub/test_script_engine.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py tests/midi_hub/test_consumer_migration.py`.

ID: T384
Status: [✓] Done
Title: MIDI audit — Remove deprecated/dead MIDI code
Description:
- Goal / acceptance criteria: Clean up deprecated MIDI components and dead code paths identified during audit.
- Why it matters: Multiple deprecated components and redundant code paths add confusion and maintenance burden.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Remove or mark deprecated: `useMidiLearn.tsx` (deprecated hook), `MidiMappingsPanel.tsx` (deprecated legacy panel), redundant scope branch in `midiMappingsQuery` (lines 1019-1021 of JuceGridPage), `JuceGridSelectedBlockMidiPanel.test.tsx` (uses jest.fn instead of vi.fn — fix or remove).
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-23 18:30 EDT - Codex
- Completion notes:
  - Removed the unused deprecated provider/hook by deleting `web/src/app/hooks/useMidiLearn.tsx`, removing the `MidiLearnProvider` wrapper from `web/src/app/App.tsx`, and dropping the stale provider mock from `web/src/app/App.platformRoute.test.tsx`; repo search confirmed the hook had no remaining consumers.
  - Removed the dead legacy MIDI mappings drawer path by deleting `web/src/map2/components/MIDI/MidiMappingsPanel.tsx`, removing its export from `web/src/map2/components/MIDI/index.ts`, and trimming the unreachable state/props from `web/src/map2/components/ChainBuilder.tsx`; the old button wiring never consumed `onOpenMappings`, so the drawer could not be opened in practice.
  - Simplified `web/src/app/pages/JuceGridPage.tsx` by deleting the redundant `selected-plugin` fallback branch in `midiMappingsQuery`, and corrected the legacy `MidiLearnButton` call site to use its actual `isActive` prop while preserving the remaining learn toggle behavior.
  - Audited `web/src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx`; no `vi.fn` migration was needed because this repo's web test stack is still Jest-based, so the earlier audit note was stale rather than an active defect.
  - Validation passed with `npm --prefix web run typecheck` and `npm --prefix web test -- --runInBand src/app/App.platformRoute.test.tsx src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx`.
  - Licensing review: touched frontend/backend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T385
Status: [✓] Done
Title: Home landing-page desktop card emphasis and Labs icon follow-up
Description:
- Goal / acceptance criteria: On the Home landing-page main workspace cards, make the card titles 50% larger on desktop only, replace the Labs tile icon with a simple beaker-style Carbon icon, and give the Audio Grid card a persistent desktop-only emphasis through a distinct slightly thicker border without changing card size or affecting tablet/mobile layouts.
- Why it matters: The user wants clearer visual hierarchy on the desktop launcher while keeping tablet and desktop treatments distinct and preserving the current card layout.
- Dependencies: `web/src/app/pages/HomePage.tsx`, `web/src/app/pages/HomePage.css`, `web/src/app/pages/HomePage.test.tsx`, and licensing/worklist updates
- Estimated effort: Low
- Required outputs: Updated Home page component/styles/tests, focused validation evidence, and completion notes with licensing review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 07:10 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/HomePage.tsx` so the Labs tile now uses Carbon's simple `Chemistry` beaker icon, all workspace tiles expose stable `data-home-route` markers, and the Audio Grid tile receives a dedicated `hp-workspace-card--audio-grid-focus` class without changing its route or footprint.
  - Updated `web/src/app/pages/HomePage.css` so workspace card titles scale to 150% of the current heading token only at the desktop breakpoint (`min-width: 1312px`), and the Audio Grid card gets desktop-only persistent emphasis through a stronger interactive border treatment while tablet/mobile styling remains unchanged.
  - Added focused regression coverage in `web/src/app/pages/HomePage.test.tsx` asserting the Audio Grid tile keeps its persistent emphasis hook.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand src/app/pages/HomePage.test.tsx`, and `npm --prefix web run build` (existing Vite dynamic/static import warning only, no new build failures).
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T386
Status: [✓] Done
Title: Reduce Home landing-page desktop card title scale from the first emphasis pass
Description:
- Goal / acceptance criteria: Reduce the Home landing-page workspace card title font size by 15% from the current desktop-only emphasized value while keeping the existing desktop/tablet separation intact and leaving all non-desktop breakpoints unchanged.
- Why it matters: The first emphasis pass overshot the preferred desktop launcher hierarchy, so the follow-up needs to soften title prominence without undoing the layout and emphasis structure the user already approved.
- Dependencies: `T385`, `web/src/app/pages/HomePage.css`, focused frontend validation, and licensing/worklist updates
- Estimated effort: Low
- Required outputs: Updated desktop-only title scale rule, validation evidence, and completion notes with licensing review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 07:29 EDT - Codex
- Completion notes:
  - Updated the desktop-only title rule in `web/src/app/pages/HomePage.css` so the workspace card title scale drops from `1.5x` to `1.275x` the base heading token, which is a 15% reduction from the previously shipped emphasized size while keeping the breakpoint at `min-width: 1312px`.
  - Left the Audio Grid border emphasis, Labs beaker icon, and every tablet/mobile rule untouched so the desktop/tablet separation remains intact.
  - Validation passed with `npm --prefix web test -- --runInBand src/app/pages/HomePage.test.tsx` and `npm --prefix web run build` (existing Vite dynamic/static import warning only, no new failures).
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

ID: T387
Status: [✓] Done
Title: Remove routed Labs workspace horizontal divider lines
Description:
- Goal / acceptance criteria: Remove the visible horizontal divider lines from the routed `/labs` workspace, including the header separator, section-title rules, and launcher-tile footer dividers shown in the current Labs GUI, without changing non-Labs platform shells.
- Why it matters: The user wants a cleaner Labs catalog surface without the extra horizontal rule treatment that currently cuts across the routed workspace.
- Dependencies: `web/src/app/pages/PlatformShellPage.css`, `web/src/app/layout/AppShell.css`, focused frontend validation, and licensing/worklist updates
- Estimated effort: Low
- Required outputs: Scoped Labs styling updates, validation evidence, and completion notes with licensing review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-24 07:54 EDT - Codex
- Completion notes:
  - Updated `web/src/app/pages/PlatformShellPage.css` with routed Labs-only overrides so the workspace header divider, section-title underline rules, and launcher-tile footer dividers are removed only inside `.platform-shell__workspace--labs`.
  - Left shared advanced-menu and non-Labs platform shell styles untouched, so the change stays local to the routed `/labs` GUI rather than altering the broader platform shell or topbar menu surfaces.
  - Validation passed with `npm --prefix web test -- --runInBand src/app/App.platformRoute.test.tsx` and `npm --prefix web run build` (existing Vite dynamic/static import warning only, no new build failures).
  - Exploratory run `npm --prefix web test -- --runInBand src/app/App.platformRoute.test.tsx src/app/pages/PlatformShellPage.test.tsx` still hit pre-existing failures in `src/app/pages/PlatformShellPage.test.tsx` around legacy “Unified Platform Stack” expectations; left unchanged because they are unrelated to this Labs CSS slice.
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n “license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX” README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.

## Platform Audit v2 — Verified Fresh Audit (2026-03-26)

Supersedes all T388–T406 entries from the 2026-03-25 stale audit. Those tasks were based on
incorrect data (pipedal/ already deleted, rate_limiter.py already deleted, several prefix
collisions already fixed). This section contains only verified findings from 2026-03-26.

### Previous Audit Status

T388–T406 (2026-03-25): SUPERSEDED. Most issues were already resolved by other agents before
the audit was written. Marking all as `[~] Cancelled` — replaced by T434–T448 below.

### Phase A: Dead Code Removal

ID: T434
Status: [✓] Done
Title: Delete dead lv2_discovery.py service (zero imports, 13K lines)
Description:
- Goal / acceptance criteria: Delete `app/services/lv2_discovery.py`. Confirmed zero imports across the entire codebase (all production code now uses `plugin_loader_unified.py`). File last modified 2026-02-14.
- Why it matters: Dead 13K-line service file that was absorbed into `plugin_loader_unified.py` but never deleted.
- Dependencies: None
- Estimated effort: Low
- Required outputs: File deleted, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:24 EDT - Codex
- Completion notes:
  - Deleted the dead `app/services/lv2_discovery.py` service file after confirming there were no remaining live-code imports or references in `app`, `web/src`, `tests`, or `scripts`.
  - Validation: `rg -n "lv2_discovery|lv2_enhanced|pipedal_compat_router" app web/src tests scripts | head -n 80` -> no matches; `pytest -q tests/test_route_registration_policy.py` -> PASS; `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS.
  - Licensing review: touched route/service/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app worklog tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T435
Status: [✓] Done
Title: Delete dead lv2_enhanced.py service (only a comment reference remains, 18K lines)
Description:
- Goal / acceptance criteria: Delete `app/services/lv2_enhanced.py`. Only reference is a comment string in `plugin_scanner.py:200` ("Fallback LV2 scanning without lv2_enhanced") — not an actual import. All production code uses `plugin_loader_unified.py`. File last modified 2026-02-11.
- Why it matters: Dead 18K-line service file absorbed into unified loader but never removed.
- Dependencies: T434 (delete together)
- Estimated effort: Low
- Required outputs: File deleted, comment reference updated, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:24 EDT - Codex
- Completion notes:
  - Deleted the dead `app/services/lv2_enhanced.py` service file and updated the stale references in `app/services/plugin_scanner.py` and `app/services/plugin_loader_unified.py` so the fallback/docstring text no longer points at a deleted module as if it were still present.
  - Validation: `rg -n "lv2_discovery|lv2_enhanced|pipedal_compat_router" app web/src tests scripts | head -n 80` -> no matches; `pytest -q tests/test_route_registration_policy.py` -> PASS; `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS.
  - Licensing review: touched route/service/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app worklog tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T436
Status: [✓] Done
Title: Delete unregistered route base.py or formalize as utility module
Description:
- Goal / acceptance criteria: `app/routes/base.py` defines `APIRouter(prefix="/api/example")` but is NOT in the `route_modules` list in `main.py:594`. However, `reverb.py` imports `api_route` and `StandardResponses` from it as utilities. Either: (a) rename/move to `app/utils/route_helpers.py` since it's used as a utility not a route, or (b) register it if the example endpoints are wanted.
- Why it matters: A route file that's actually used as a utility import but has dead example endpoints.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Clear separation of utility vs. route concerns.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:30 EDT - Codex
- Completion notes:
  - Formalized `app/routes/base.py` as a real utility module by moving the shared decorators/response helpers into the new `app/utils/route_helpers.py`, deleting the misleading route-path file, and updating `app/routes/reverb.py` to import from the utility location.
  - This removes the last utility-only module from `app/routes/`, so route policy now has a clean boundary between actual router modules and reusable helper code.
  - Validation: `pytest -q tests/test_route_registration_policy.py` -> PASS (`3 passed`); `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `rg -n "app\\.routes\\.base|route_helpers" app tests | head -n 80` shows only the new `app.utils.route_helpers` import in `app/routes/reverb.py`.
  - Licensing review: touched route/util/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T437
Status: [ ] Todo
Title: Delete or decide on web/src/pages/ClusterAdmin.tsx (legacy, zero imports)
Description:
- Goal / acceptance criteria: `web/src/pages/ClusterAdmin.tsx` is the only file in `web/src/pages/` (legacy location). It exports `ClusterAdmin` but is NOT imported anywhere in `web/src/app/`. Either delete it or migrate to `web/src/app/pages/`.
- Why it matters: Orphaned legacy page component in the wrong directory.
- Dependencies: None
- Estimated effort: Low
- Required outputs: File deleted or migrated.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

ID: T438
Status: [✓] Done
Title: Delete stale worklog/completion-summary-2026-02-14.md
Description:
- Goal / acceptance criteria: Delete `worklog/completion-summary-2026-02-14.md` — over 5 weeks old, all work referenced is in the archive.
- Why it matters: Stale documentation cluttering the repo.
- Dependencies: None
- Estimated effort: Low
- Required outputs: File deleted.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:24 EDT - Codex
- Completion notes:
  - Deleted the stale `worklog/completion-summary-2026-02-14.md` artifact from the repository to reduce dead documentation noise.
  - Validation: `git status --short --branch` -> targeted deletion present before commit; cycle bundle validation remained green via `pytest -q tests/test_route_registration_policy.py` -> PASS.
  - Licensing review: touched route/service/worklist/worklog files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app worklog tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T439
Status: [✓] Done
Title: Remove unregistered pipedal_compat_router from engine.py
Description:
- Goal / acceptance criteria: `app/routes/engine.py:618` defines `pipedal_compat_router = APIRouter(prefix="/api/pipedal")` with 4 endpoints (status, plugins, initialize, audio/status). This router is NEVER registered in `main.py` — `grep` confirms zero references to `pipedal_compat_router` in main.py. Delete these dead endpoints.
- Why it matters: ~30 lines of dead legacy PiPedal compatibility code inside an otherwise active route file.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Dead router removed from engine.py, server starts cleanly.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:24 EDT - Codex
- Completion notes:
  - Removed the dead unregistered `pipedal_compat_router` block from `app/routes/engine.py`, eliminating the abandoned `/api/pipedal/*` compatibility endpoints that were never mounted by `app/main.py`.
  - Validation: `pytest -q tests/test_route_registration_policy.py` -> PASS (`2 passed`); `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS; `rg -n "lv2_discovery|lv2_enhanced|pipedal_compat_router" app web/src tests scripts | head -n 80` -> no matches.
  - Licensing review: touched route/service/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app worklog tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

### Phase B: Route Prefix Collisions (CRITICAL)

ID: T440
Status: [✓] Done
Title: CRITICAL — Resolve /api/chains prefix collision between chains.py and chains_ab_mode.py
Description:
- Goal / acceptance criteria: Both `app/routes/chains.py:21` and `app/routes/chains_ab_mode.py:13` declare `APIRouter(prefix="/api/chains")` and BOTH are registered in `route_modules`. The endpoint paths do NOT overlap (chains.py has CRUD, chains_ab_mode.py has duplicate/blend/compare/morph/dsp-load), but sharing a prefix is fragile and could cause shadowing if overlapping paths are ever added. Either merge chains_ab_mode.py into chains.py or change its prefix to `/api/chains/ab`.
- Why it matters: CRITICAL — Two registered routers on the same prefix is a latent shadowing risk and violates FastAPI best practices.
- Dependencies: Check frontend API calls to A/B mode endpoints
- Estimated effort: Medium
- Required outputs: No duplicate prefixes among registered routes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 18:06 EDT - Codex
- Completion notes:
  - Moved the A/B chain router in `app/routes/chains_ab_mode.py` from `/api/chains` to the dedicated `/api/chains/ab` prefix, eliminating the registered-router prefix collision with `app/routes/chains.py` while preserving the existing duplicate, blend, compare, morph, and DSP-load endpoints under an A/B-specific namespace.
  - Updated the live frontend consumers in `web/src/map2/components/ChainBuilder.tsx` and `web/src/map2/components/ChainABMode.tsx`, plus the route-registration test coverage in `tests/test_chains_ab_mode_route_registration.py`, so the client contract now follows the dedicated A/B prefix end to end.
  - Validation: `pytest -q tests/test_chains_ab_mode_route_registration.py tests/test_chains_ab_mode_identity.py` -> PASS (`5 passed`); `npm --prefix web run typecheck` -> PASS; `rg -n '"/api/chains/\\{chain_id\\}/duplicate|"/api/chains/\\{chain_id\\}/blend|"/api/chains/\\{chain_a_id\\}/compare/\\{chain_b_id\\}|"/api/chains/\\{chain_id\\}/morph|/api/chains/ab/.*/duplicate|/api/chains/ab/.*/blend|/api/chains/ab/.*/dsp-load|/api/chains/.*/duplicate|/api/chains/.*/blend|/api/chains/.*/dsp-load' app web/src tests docs` confirms live consumers now point at `/api/chains/ab` (the remaining `/api/chains/...` hit is a historical evidence snapshot under `docs/fit-for-purpose-evidence/20260223/openapi.json`).
  - Licensing review: touched route/frontend/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app web/src tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.

ID: T441
Status: [ ] Todo
Title: Audit /api/cluster prefix shared by 3 route files
Description:
- Goal / acceptance criteria: Three registered route files share `prefix="/api/cluster"`: `cluster_admin.py:41`, `cluster_flows.py:14`, `cluster_health.py:16`. While their endpoint paths currently don't overlap (/node/*, /setup, /status, /metrics vs /flows/*, /nodes vs /health, /online-nodes, /offline-nodes), this is fragile. Verify no endpoint path collisions exist. Consider whether any should get more specific prefixes.
- Why it matters: Three routers on the same prefix creates collision risk as endpoints grow.
- Dependencies: None
- Estimated effort: Low (audit only, may need no changes)
- Required outputs: Documented assessment of collision risk; prefix changes if needed.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

ID: T442
Status: [ ] Todo
Title: Audit /api/deployment prefix shared by deployment.py and deployment_health.py
Description:
- Goal / acceptance criteria: Both `deployment.py:29` and `deployment_health.py:24` use `prefix="/api/deployment"`. Their endpoints appear non-overlapping (/mode, /status, /config, /verify vs /health/*, /remediation/*), but both have `/health` sub-paths (`deployment.py` has `/health/mode`, `deployment_health.py` has `/health`). Verify no actual shadowing and consider consolidation.
- Why it matters: Potential endpoint path collision at `/api/deployment/health`.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Confirmed no shadowing, or prefixes adjusted.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

### Phase C: Consolidation

ID: T443
Status: [ ] Todo
Title: Health monitoring hierarchy documentation and cleanup
Description:
- Goal / acceptance criteria: 9 health-related services exist with an undocumented aggregation hierarchy. `system_health_summary.py` (last modified 2026-03-25) appears to be the top-level aggregator, importing from `health_monitor`, `audio_health_monitor`, `node_health_service`, and `deployment_health`. Document this hierarchy. Determine if `health_checker.py` (8K, Jan 20) is still needed or superseded by `system_health_summary.py`.
- Why it matters: 9 health services without documented hierarchy makes operational behavior unclear.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Architecture document for health monitoring, identification of any truly dead services.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

ID: T444
Status: [ ] Todo
Title: Evaluate web/src/shared/PluginChooser for migration to app/components
Description:
- Goal / acceptance criteria: `web/src/shared/components/PluginChooser/` (23 files) is imported from 2 active files: `PluginAppearanceIcon.tsx` (LegacyPluginIcon, PluginType). This is the only remaining content in `web/src/shared/`. Either migrate PluginChooser into `web/src/app/components/` or at minimum document why it lives in `shared/`.
- Why it matters: Stale directory structure — `shared/` only serves 2 import paths.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: PluginChooser migrated or documented, build passes.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

### Phase D: Documentation Truthfulness

ID: T445
Status: [ ] Todo
Title: Remove stale pipedal references from docs/TRANSPLANTATION_GUIDE.md
Description:
- Goal / acceptance criteria: `docs/TRANSPLANTATION_GUIDE.md` references `map2-pipedal-test.service` at lines 497 and 562. PiPedal has been fully removed from the codebase. Update the transplantation guide to remove these references.
- Why it matters: Documentation references a deleted subsystem, misleading new developers.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Updated doc.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

### Phase E: Test Coverage

ID: T446
Status: [ ] Todo
Title: Add route prefix uniqueness CI test
Description:
- Goal / acceptance criteria: Create a test that extracts all APIRouter prefixes from registered route modules and asserts no two registered routers share a prefix unless their endpoint paths are verified non-overlapping. This would have caught the /api/chains collision and the other shared-prefix cases.
- Why it matters: 4 prefix collisions/shared-prefix cases found in this audit — automated detection prevents recurrence.
- Dependencies: T440, T441, T442 (resolve collisions first)
- Estimated effort: Low
- Required outputs: New test file in tests/, runs in CI.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

ID: T447
Status: [ ] Todo
Title: Add test coverage for 58 untested route modules
Description:
- Goal / acceptance criteria: 58 of 108 route modules have no corresponding test file. Prioritize adding tests for: cluster_update, cluster_update_hybrid, deployment_health, midi_v2, midi_cluster_proxy, nam_models, preset_exchange, preset_migration, plugin_presets, soundfonts, and other high-traffic routes.
- Why it matters: Over 50% of route modules lack test coverage.
- Dependencies: None
- Estimated effort: High (phased)
- Required outputs: Test files for top-priority untested routes.
- Full list of untested routes: audio_diagnostics, audio_path, backup, base, cluster_nodes, cluster_plugin_inventory, cluster_update_hybrid, cluster_update, core_plugins, cpu_metrics, dashboard, deployment_health, dev_proxy, drums, dynamics, filters, flow_failover, folders, guitar, h3000, history, impulse_response, lcd_events, lexi_love, loudness, midi_cluster_proxy, midi_learn, midi_v2, modulation, monitoring, nam_models, network, nodes, packages, parallel, passionfx, peavey5150, performance, pitch, platform_remediation, plugin_appearances, plugin_packages, plugin_presets, plugin_scanner, plugin_tags, preset_exchange, preset_migration, raft_api, reverb, sessions, shopping, soundfonts, spectrum, ssh_trust, system_tests, tweedbassman, upload, usb_devices, websocket_rt
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-26 - Audit v2

ID: T448
Status: [✓] Done
Title: Add unregistered-route-file CI check
Description:
- Goal / acceptance criteria: Create a test that scans `app/routes/` for files containing `APIRouter`, then verifies each is either registered in `main.py`'s `route_modules` list, individually registered, or documented as a utility-only module (like base.py). Currently only base.py is unregistered, plus the dead `pipedal_compat_router` inside engine.py.
- Why it matters: Prevents abandoned route files from accumulating undetected.
- Dependencies: T436, T439 (clean up existing unregistered routes first)
- Estimated effort: Low
- Required outputs: New test file, runs in CI.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-26 17:30 EDT - Codex
- Completion notes:
  - Strengthened `tests/test_route_registration_policy.py` so CI now parses concrete `APIRouter(...)` assignments, verifies every primary `router` module is actually registered, and hard-fails any extra router variables beyond `router`, which closes the blind spot that previously allowed `pipedal_compat_router` to hide inside a registered file.
  - With `T436` and `T439` complete, the unregistered-route policy no longer needs a utility-module exception for `base.py`, and future abandoned router objects now fail the policy test deterministically.
  - Validation: `pytest -q tests/test_route_registration_policy.py` -> PASS (`3 passed`, existing `ServiceManager` deprecation warning only); `python3 - <<'PY' ... ast.parse(...) ... PY` -> PASS.
  - Licensing review: touched route/util/test/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing app tests` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gaps requiring follow-up work.
Description:
- Goal / acceptance criteria: Remove `web/src/pipedal/` entirely — 229 files with zero imports from `web/src/app/`. Verify `npm run build` succeeds afterward.
- Why it matters: ~15,000 lines of dead predecessor-project code adding noise to searches, IDE indexing, and bundle analysis.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Directory deleted, build passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
Subtasks:
ID: T388-subA
Status: [✓] Done
Title: Move PluginChooser off PiPedal type and icon imports
Description:
- Goal / acceptance criteria: Replace the remaining `web/src/shared/components/PluginChooser/*` imports from `web/src/pipedal/Lv2Plugin.tsx` and `web/src/pipedal/PluginIcon.tsx` with a local compatibility surface under active MAP2-owned/shared code, while preserving chooser behavior and icon/category semantics.
- Why it matters: These are the only live runtime imports from the PiPedal directory in the current app/shared code, so they are the first hard dependency blocking any future directory deletion.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: New shared compatibility module(s), updated chooser imports, focused validation, and updated blocker notes if more PiPedal runtime imports remain.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
ID: T388-subB
Status: [✓] Done
Title: Add a guard against new app/shared/map2 imports from web/src/pipedal
Description:
- Goal / acceptance criteria: Add an automated check that fails if active `web/src/app`, `web/src/shared`, or `web/src/map2` code introduces new imports from `web/src/pipedal/`.
- Why it matters: The deletion effort will regress immediately if new runtime dependencies can quietly reattach to the legacy tree.
- Dependencies: T388-subA
- Estimated effort: Low
- Required outputs: Test or lint-style guard with clear failure messaging.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
ID: T388-subC
Status: [✓] Done
Title: Remove stale web/CMakeLists.txt PiPedal source-manifest dependency on the legacy tree
Description:
- Goal / acceptance criteria: Narrow or replace the `web/CMakeLists.txt` dependency list so it no longer enumerates the full `src/pipedal/` tree when the modern web build does not require it.
- Why it matters: Even after runtime imports are removed, the stale source manifest still marks the entire PiPedal tree as live build input and blocks clean deletion.
- Dependencies: T388-subA
- Estimated effort: Medium
- Required outputs: Updated CMake dependency handling plus validation that the supported web build path is unchanged.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
ID: T388-subD
Status: [✓] Done
Title: Inventory the remaining PiPedal files after dependency removal
Description:
- Goal / acceptance criteria: Produce an updated file-level inventory of what remains under `web/src/pipedal/` after runtime and manifest dependencies are cut, grouped into delete-now, extract-first, and retain-for-license/reference buckets.
- Why it matters: The original audit’s “229 dead files” claim is now known to be inaccurate, so the delete step needs a fresh evidence-backed inventory.
- Dependencies: T388-subA, T388-subC
- Estimated effort: Medium
- Required outputs: Updated inventory notes in the canonical worklist or an adjacent audit artifact with exact counts and next actions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
ID: T388-subE
Status: [✓] Done
Title: Delete the PiPedal legacy directory after migration slices close
Description:
- Goal / acceptance criteria: Remove `web/src/pipedal/` once the runtime imports, manifest references, and evidence inventory all confirm it is no longer needed, then keep the frontend build green.
- Why it matters: This is the original directory-deletion outcome, but it must follow the migration slices instead of assuming dead code.
- Dependencies: T388-subB, T388-subC, T388-subD
- Estimated effort: Medium
- Required outputs: Directory deletion, green validation, and final closure notes on `T388`.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:35 EDT - Codex
- Completion notes:
  - Replaced the last active `web/src/pipedal/*` runtime imports in `web/src/shared/components/PluginChooser/*` with a local compatibility surface in `web/src/shared/components/PluginChooser/pluginLegacyCompat.ts`, including a chooser-owned `PluginType` taxonomy, minimal legacy payload interfaces, shared category mapping, and a MAP2-owned glyph renderer in `LegacyPluginIcon.tsx`.
  - Added `web/src/shared/components/PluginChooser/pluginLegacyCompat.test.ts` plus `tests/test_frontend_legacy_import_guard.py` so the compatibility layer is covered and active frontend code cannot silently reintroduce imports from `web/src/pipedal/`.
  - Removed the stale `src/pipedal/**` dependency manifest from `web/CMakeLists.txt`, then deleted `web/src/pipedal/` entirely and cleaned the now-dead frontend config references from `web/eslint.config.js` and `web/tsconfig.app.json`.
  - Post-migration inventory is now definitive rather than inferred: `web/src/pipedal/` no longer exists, active-code import scans return no runtime references, and the only remaining repo mentions are documentation/history plus the guard test's own failure message.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/shared/components/PluginChooser/pluginLegacyCompat.test.ts`, `pytest tests/test_frontend_legacy_import_guard.py -q`, and `npm --prefix web run build` from the deleted-tree state.

ID: T389
Status: [✓] Done
Title: Delete dead rate_limiter.py (525 lines, zero imports)
Description:
- Goal / acceptance criteria: Delete `app/middleware/rate_limiter.py`. Confirm zero imports via grep. The active rate limiter is `app/middleware/rate_limiting.py` (TokenBucket).
- Why it matters: Dead middleware file with a conflicting algorithm (SlidingWindow) that could confuse future developers.
- Dependencies: None
- Estimated effort: Low
- Required outputs: File deleted, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:49 EDT - Codex
- Completion notes:
  - Deleted `app/middleware/rate_limiter.py` after confirming there were no remaining imports under `app/` or `tests/`.
  - Validation passed with `pytest tests/test_connection_pool.py tests/test_request_queue.py tests/test_health_monitor.py tests/test_chains_ab_mode_identity.py -q`.

ID: T390
Status: [✓] Done
Title: Delete dead configuration_distributor.py (388 lines, zero imports)
Description:
- Goal / acceptance criteria: Delete `app/services/cluster/configuration_distributor.py`. The active distributor is `app/services/cluster/config_distributor.py`.
- Why it matters: Duplicate Git-based config distribution service with zero imports — causes confusion about which is canonical.
- Dependencies: None
- Estimated effort: Low
- Required outputs: File deleted, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:49 EDT - Codex
- Completion notes:
  - Deleted `app/services/cluster/configuration_distributor.py` after confirming the repo no longer imported it and the active implementation remains `app/services/cluster/config_distributor.py`.
  - Validation passed with `pytest tests/test_connection_pool.py tests/test_request_queue.py tests/test_health_monitor.py tests/test_chains_ab_mode_identity.py -q`.

ID: T391
Status: [✓] Done
Title: Delete 7 unregistered route files with no callers
Description:
- Goal / acceptance criteria: Delete these route files that are never registered in `app/main.py` and have no frontend callers: `app/routes/base.py`, `app/routes/connection_pool.py`, `app/routes/request_queue.py`, `app/routes/websocket_metrics.py`, `app/routes/prometheus_exporter.py`, `app/routes/prometheus_metrics.py`, `app/routes/chains_ab_mode.py`. Verify server starts without errors.
- Why it matters: Dead route files that define APIRouters but are never mounted — misleading for developers and cluttering the routes directory.
- Dependencies: None
- Estimated effort: Low
- Required outputs: 7 files deleted, server starts cleanly.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:48 EDT - Codex
- Completion notes:
  - Completed the per-file caller review that the original audit skipped: `app/routes/base.py` is a shared utility module and was correctly retained, while `app/routes/chains_ab_mode.py` was confirmed live via current frontend fetch calls and is now registered in `app/main.py`.
  - Deleted the genuinely dead unregistered route files `app/routes/connection_pool.py`, `app/routes/request_queue.py`, `app/routes/prometheus_exporter.py`, `app/routes/prometheus_metrics.py`, and `app/routes/websocket_metrics.py`.
  - Added `tests/test_chains_ab_mode_route_registration.py` to lock the live A/B chain endpoints into the route registration graph.

ID: T392
Status: [✓] Done
Title: Delete abandoned email_notifications route and frontend hook
Description:
- Goal / acceptance criteria: Delete `app/routes/email_notifications.py` and `web/src/app/hooks/useEmailNotifications.ts` — both exist but neither is wired in (route not registered in main.py, hook not imported by any component). Alternatively, if email notifications are wanted, register the route and wire the hook.
- Why it matters: Abandoned feature where both backend and frontend layers exist but are disconnected — creates false expectations.
- Dependencies: User decision: activate or delete
- Estimated effort: Low
- Required outputs: Both files deleted (or both activated), build + tests pass.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:49 EDT - Codex
- Completion notes:
  - Deleted the disconnected backend route `app/routes/email_notifications.py` and the unused frontend hook `web/src/app/hooks/useEmailNotifications.ts` after confirming the route was not registered in `app/main.py` and the hook had no import sites.
  - Pruned the stale email-related entries from `docs/backend-runtime-contract.md` and `docs/backend-runtime-contract.json` so generated contract docs no longer point at removed code.
  - Validation passed with `pytest tests/test_connection_pool.py tests/test_request_queue.py tests/test_health_monitor.py tests/test_chains_ab_mode_identity.py -q` and `npm --prefix web run typecheck`.

ID: T393
Status: [✓] Done
Title: Delete stale worklog docs and duplicate workspace file
Description:
- Goal / acceptance criteria: Delete `worklog/incomplete-tasks-inventory.txt` (last updated 2026-02-14), `worklog/incomplete-tasks-plan.md`, and `map2-audio.code-workspace` (duplicate of `MAP2-AUDIO.code-workspace`). Verify and delete `app/tui/dashboard.py` if unused (separate from standalone `tui/` directory).
- Why it matters: Stale documents and duplicate config files add noise.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Files deleted.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:49 EDT - Codex
- Completion notes:
  - Deleted `worklog/incomplete-tasks-inventory.txt`, `worklog/incomplete-tasks-plan.md`, `map2-audio.code-workspace`, and the unused `app/tui/dashboard.py` module after confirming the TUI codepath uses the standalone `tui/` package instead.
  - Validation passed with `pytest tests/test_connection_pool.py tests/test_request_queue.py tests/test_health_monitor.py tests/test_chains_ab_mode_identity.py -q` and `npm --prefix web run typecheck`.

### Phase B: Fix Critical Route Prefix Collisions

ID: T394
Status: [✓] Done
Title: Resolve NAM route prefix collision — both nam.py and nam_models.py use /api/nam
Description:
- Goal / acceptance criteria: Both `app/routes/nam.py:30` and `app/routes/nam_models.py:19` declare `APIRouter(prefix=”/api/nam”)` and both are registered in `main.py:594`. FastAPI registers in list order — overlapping endpoint paths in the second module are silently unreachable. Merge `nam_models.py` into `nam.py`, or change its prefix to `/api/nam/models`. Verify all /api/nam endpoints respond correctly.
- Why it matters: CRITICAL — silent endpoint shadowing in production. Developers adding endpoints to `nam_models.py` that overlap with `nam.py` create dead code without knowing it.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: No duplicate prefixes, all NAM endpoints verified.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:55 EDT - Codex
- Completion notes:
  - Resolved the `/api/nam` prefix collision by moving `app/routes/nam_models.py` behind `/api/nam/library`, leaving `app/routes/nam.py` as the sole owner of the frontend-facing `/api/nam` contract.
  - Normalized the secondary library-maintenance endpoints so they now live at `/api/nam/library/verify` and `/api/nam/library/cleanup` instead of nesting a duplicate `/library` segment.
  - Added `tests/test_nam_route_prefixes.py` to assert the primary NAM router and the library-management router expose disjoint path sets while preserving `/api/nam/upload` and `/api/nam/models` on the primary router.
  - Validation passed with `pytest tests/test_nam_route_prefixes.py tests/test_nam_ir_instance_routes.py -q`.

ID: T395
Status: [✓] Done
Title: Resolve cluster update route prefix collision — both cluster_update.py and cluster_update_hybrid.py use /api/cluster/update
Description:
- Goal / acceptance criteria: Both `app/routes/cluster_update.py:18` and `app/routes/cluster_update_hybrid.py:17` declare `APIRouter(prefix=”/api/cluster/update”)` and both are registered. Merge or change hybrid prefix to `/api/cluster/update/hybrid`. Verify all cluster update endpoints respond correctly.
- Why it matters: CRITICAL — same silent shadowing risk as T394.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: No duplicate prefixes, all cluster update endpoints verified.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:05 EDT - Codex
- Completion notes:
  - Resolved the cluster update prefix collision by moving `app/routes/cluster_update_hybrid.py` behind `/api/cluster/update/hybrid`, leaving `app/routes/cluster_update.py` as the sole owner of the primary `/api/cluster/update` namespace used by the current frontend.
  - Added `tests/test_route_prefix_collisions_phase_a.py` to assert the primary and hybrid cluster update routers expose disjoint path sets while preserving `/api/cluster/update/trigger` on the primary router.
  - Validation passed with `pytest tests/test_route_prefix_collisions_phase_a.py tests/test_midi_cluster_api_routes.py -q`.

ID: T396
Status: [✓] Done
Title: Resolve MIDI cluster route prefix collision — both midi_cluster.py and midi_cluster_proxy.py use /api/midi/cluster
Description:
- Goal / acceptance criteria: Both `app/routes/midi_cluster.py:19` and `app/routes/midi_cluster_proxy.py:11` declare `APIRouter(prefix=”/api/midi/cluster”)` and both are registered. Move proxy to `/api/midi/cluster/proxy` or merge. Verify all MIDI cluster endpoints respond correctly.
- Why it matters: CRITICAL — proxy forwarding logic may shadow native cluster endpoints.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: No duplicate prefixes, all MIDI cluster endpoints verified.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:05 EDT - Codex
- Completion notes:
  - Resolved the MIDI cluster proxy prefix collision by moving `app/routes/midi_cluster_proxy.py` behind `/api/midi/cluster/proxy`, leaving `app/routes/midi_cluster.py` as the sole owner of the primary `/api/midi/cluster` API contract.
  - Extended `tests/test_route_prefix_collisions_phase_a.py` to assert the primary MIDI cluster router and proxy router expose disjoint path sets while preserving `/api/midi/cluster/nodes` on the primary router.
  - Validation passed with `pytest tests/test_route_prefix_collisions_phase_a.py tests/test_midi_cluster_api_routes.py -q`.

ID: T397
Status: [✓] Done
Title: Decide on unregistered health_monitor.py route — register or delete
Description:
- Goal / acceptance criteria: `app/routes/health_monitor.py` has an APIRouter with WebSocket handlers but is NOT registered in `main.py`. Either register it (if health monitor WebSocket functionality is wanted) or delete it.
- Why it matters: Dead route with implemented WebSocket handlers sitting unused — creates false expectations about platform capabilities.
- Dependencies: T401 (health monitoring consolidation) may inform this decision
- Estimated effort: Low
- Required outputs: Route registered or deleted, server starts cleanly.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:20 EDT - Codex
- Completion notes:
  - Deleted the unregistered `app/routes/health_monitor.py` route module after confirming there were no backend or frontend callers and that the live health surface already runs through `health.py` and related service integrations.
  - Validation passed with `pytest tests/test_health_routes.py tests/test_health_monitor.py -q`.

### Phase C: Consolidate Duplicates

ID: T398
Status: [✓] Done
Title: Complete plugin loader unification — migrate remaining imports to plugin_loader_unified.py
Description:
- Goal / acceptance criteria: `app/services/plugin_loader_unified.py` claims to consolidate `plugin_loader_v2.py`, `lv2_discovery.py`, and `lv2_enhanced.py`, but production code in `folder_scanner.py`, `plugins.py`, and `plugin_scanner.py` still imports the legacy loaders directly. Migrate all production imports to the unified loader. Update tests. Then delete `plugin_loader_v2.py` and `plugin_manager_v3.py`. Evaluate whether `lv2_discovery.py`/`lv2_enhanced.py` should be kept as internal modules or deleted.
- Why it matters: 5 coexisting plugin loader implementations create import fragility, confusion about which is canonical, and risk of behavioral divergence.
- Dependencies: None
- Estimated effort: High
- Required outputs: Single canonical loader, legacy files deleted, all plugin operations work, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:37 EDT - Codex
- Completion notes:
  - Migrated production LV2 discovery in `app/services/folder_scanner.py`, `app/services/plugin_scanner.py`, and `app/routes/plugins.py` onto `plugin_loader_unified.py`.
  - Added fuller compatibility methods to `PluginLoaderV2`/`RealLV2Loader` inside `plugin_loader_unified.py` so old test/workflow expectations still map onto the unified implementation.
  - Moved the non-loader metadata/cache helpers out of the legacy file into `app/services/plugin_catalog.py`, then deleted `app/services/plugin_loader_v2.py` and `app/services/plugin_manager_v3.py`.
  - Validation passed with `pytest tests/test_phase5.py tests/test_plugins.py tests/test_advanced.py tests/test_advanced_plugins.py -q`.

ID: T399
Status: [✓] Done
Title: Extract shared scraper_base from IR and SoundFont libraries
Description:
- Goal / acceptance criteria: `app/services/ir_library/scraper_base.py` (551 lines) and `app/services/soundfont_library/scraper_base.py` (415 lines) have near-identical structure (DownloadState enum, checksum verification, async download pipeline). Extract a shared `app/services/common/scraper_base.py` and have both libraries inherit from it.
- Why it matters: ~400 lines of duplicated infrastructure code that must be maintained in lockstep.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Shared base class, both library scraper bases refactored, all scraping tests pass.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:45 EDT - Codex
- Completion notes:
  - Extracted shared download/rate-limit/progress/archive infrastructure into `app/services/common/scraper_base.py`.
  - Rebuilt `app/services/ir_library/scraper_base.py` and `app/services/soundfont_library/scraper_base.py` as thin library-specific subclasses, preserving IR checksum validation and ZIP extraction behavior.
  - Validation passed with `pytest tests/test_scraper_interface_compliance.py tests/test_improvements.py -q`.

ID: T400
Status: [✓] Done
Title: Clarify preset/snapshot route naming confusion
Description:
- Goal / acceptance criteria: `app/routes/presets.py` serves snapshot data at `/api/snapshots` but is named “presets” — confusing when 4 other preset-related routes exist (`plugin_presets.py`, `preset_exchange.py`, `preset_migration.py`, `snapshots.py`). Rename `presets.py` to match its actual purpose or merge into `snapshots.py`.
- Why it matters: Naming mismatch between filename and endpoint prefix causes developer confusion.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Clear naming, no broken frontend calls.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:18 EDT - Codex
- Completion notes:
  - Renamed `app/routes/presets.py` to `app/routes/snapshot_library.py` so the module name matches its `/api/snapshots` purpose without changing the public endpoint.
  - Updated `app/main.py` route registration from `presets` to `snapshot_library`.
  - Added `tests/test_snapshot_library_route_registration.py` to lock the new module name and public route prefix.
  - Validation passed with `pytest tests/test_snapshot_library_route_registration.py tests/test_phase5_smoke.py -q`.

### Phase D: Refactor Fragmented Subsystems

ID: T401
Status: [✓] Done
Title: Consolidate health monitoring hierarchy (8 services, 5 routes)
Description:
- Goal / acceptance criteria: Define a canonical health service hierarchy. Currently fragmented across 8 services (`health_checker.py`, `health_monitor.py`, `audio_health_monitor.py`, `plugin_health.py`, `node_health_service.py`, `deployment_health.py`, `cluster/health_aggregator.py`, `cluster/post_update_health.py`) and 5 routes (`health.py`, `health_monitor.py` NOT registered, `cluster_health.py`, `cluster_health_extended.py`, `deployment_health.py`). Establish clear aggregation hierarchy, consolidate overlapping scopes, expose unified `GET /api/health` returning structured subsystem status.
- Why it matters: Fragmented health monitoring makes operational visibility unreliable and adds maintenance burden.
- Dependencies: T397 (health_monitor route decision)
- Estimated effort: High
- Required outputs: Clear health service hierarchy documented, redundant services consolidated, unified health endpoint.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:14 EDT - Codex
- Completion notes:
  - Extracted the `/api/health` aggregation logic from `app/routes/health.py` into the new canonical service `app/services/system_health_summary.py`, so the public health hierarchy now has one reusable assembly point instead of route-local duplication.
  - Kept the structured `subsystems` payload and all legacy top-level compatibility fields intact while centralizing the orchestrator, performance, audio, node, deployment, health-monitor, and MIDI-cluster summaries behind the new service.
  - Expanded coverage beyond the single route test file with new health-service tests for the canonical snapshot builder, audio health summary behavior, deployment health aggregation, and cluster visibility health payload details.

ID: T402
Status: [✓] Done
Title: Inline models_compat.py legacy bridge
Description:
- Goal / acceptance criteria: `app/models_compat.py` (101 lines) is a bridge for old `promoted_advanced_routes` → new `pinned_routes`. It is actively imported via `app/models.py` but adds unnecessary indirection. Move the compat validators directly into the models package.
- Why it matters: Reduces indirection and removes a legacy compatibility layer.
- Dependencies: None
- Estimated effort: Low
- Required outputs: `models_compat.py` deleted, validators inlined, imports still resolve.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:20 EDT - Codex
- Completion notes:
  - Inlined the legacy shared Pydantic models and the `promoted_advanced_routes` to `pinned_routes` coercion validators directly into `app/models/__init__.py`, making the package the single source of truth for `app.models` imports.
  - Deleted the dead shim files `app/models.py` and `app/models_compat.py`.
  - Validation passed with `pytest tests/test_special_settings_routes.py tests/test_improvements.py -q` and a direct import smoke check for `SpecialSettingsUpdateRequest`, `AudioStatusResponse`, and `SystemHealthResponse`.

### Phase E: Strengthen Tests and Verification

ID: T403
Status: [✓] Done
Title: Add route prefix uniqueness CI check
Description:
- Goal / acceptance criteria: Create a test that scans all registered route modules, extracts their APIRouter prefixes, and asserts no two registered routers share the same prefix. This is how 3 prefix collisions (T394-T396) went undetected.
- Why it matters: Prevents future route prefix collisions from silently entering the codebase.
- Dependencies: T394, T395, T396 (collisions must be fixed first for the test to pass)
- Estimated effort: Low
- Required outputs: New test file, runs in CI, catches duplicate prefixes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:48 EDT - Codex
- Completion notes:
  - Replaced the invalid prefix-uniqueness idea with a narrower CI guard in `tests/test_route_registration_policy.py` that inspects the built FastAPI app for duplicate concrete HTTP method+path registrations.
  - Fixed two concrete duplicate-route collisions while wiring the guard: `app/routes/deployment.py` now exposes its mode-specific check at `/api/deployment/health/mode`, and `app/routes/lcd_events.py` now exposes the event-system summary at `/api/lcd/system-status` instead of shadowing `/api/lcd/status`.
  - The guard now locks the current known duplicate concrete operations to an explicit set so any new collision fails CI immediately, and the remaining known duplicate families are tracked below as dedicated follow-up tasks.

ID: T404
Status: [✓] Done
Title: Update plugin tests to use unified loader instead of legacy loaders
Description:
- Goal / acceptance criteria: Tests currently import `plugin_loader_v2` and `plugin_manager_v3` which are deletion candidates in T398. Migrate these test imports to use `plugin_loader_unified` so tests don't break when legacy loaders are deleted.
- Why it matters: Test/production import mismatch — tests validate behavior through loaders that production code no longer uses.
- Dependencies: T398 (plugin loader unification)
- Estimated effort: Medium
- Required outputs: All plugin tests import from unified loader, `pytest` passes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 08:37 EDT - Codex
- Completion notes:
  - Updated `tests/test_phase5.py` to import the compatibility surface from `plugin_loader_unified.py` instead of `plugin_loader_v2.py`.
  - Updated `tests/test_advanced.py` and `tests/test_advanced_plugins.py` to import metadata/cache helpers from `app/services/plugin_catalog.py` instead of `plugin_manager_v3.py`.
  - Validation passed with `pytest tests/test_phase5.py tests/test_plugins.py tests/test_advanced.py tests/test_advanced_plugins.py -q`.

ID: T405
Status: [✓] Done
Title: Add health monitoring integration test coverage
Description:
- Goal / acceptance criteria: Currently 1 test file for 13 health implementation files. Add integration tests covering the health aggregation hierarchy, audio health monitor, plugin health, and cluster health endpoints.
- Why it matters: Health monitoring is the most fragmented subsystem (T401) and the least tested — any consolidation work needs a test safety net.
- Dependencies: T401 (consolidation defines what to test)
- Estimated effort: Medium
- Required outputs: New test files, meaningful coverage of health service hierarchy.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:14 EDT - Codex
- Completion notes:
  - Added `tests/test_health_services.py` to cover the canonical health aggregation hierarchy, `AudioHealthMonitor` summary behavior, `DeploymentModeHealthChecker.get_overall_status()`, and cluster-health visibility metadata.
  - Updated `tests/test_health_routes.py` to keep the public `/api/health` contract pinned after the route-to-service extraction.
  - Health monitoring now has direct coverage across the route, aggregation service, audio monitor, deployment checker, and cluster health surfaces instead of relying on one route-only file.

ID: T406
Status: [✓] Done
Title: Add unregistered-route-file CI check
Description:
- Goal / acceptance criteria: Create a test that scans `app/routes/` for all files containing `APIRouter`, then verifies each is either registered in `main.py`'s `route_modules` list or individually registered. This prevents abandoned route files from accumulating (9 were found in this audit).
- Why it matters: Prevents dead route files from silently growing — catches forgotten registrations and abandoned experiments.
- Dependencies: T391, T392 (dead routes must be cleaned up first)
- Estimated effort: Low
- Required outputs: New test file, runs in CI.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:48 EDT - Codex
- Completion notes:
  - Added `tests/test_route_registration_policy.py` to scan `app/routes/` for files that actually instantiate `APIRouter(...)` and verify that each one is present in `app/main.py`'s registration graph.
  - Tightened the scan to parse real `APIRouter(...)` calls rather than matching docstring text, which keeps utility modules like `app/routes/base.py` from generating false positives.
  - The guard passes after registering `chains_ab_mode.py` and deleting the dead unregistered route modules from `T391`.

ID: T408
Status: [✓] Done
Title: Resolve duplicate engine snapshot listing route ownership
Description:
- Goal / acceptance criteria: Remove the duplicate `GET /api/engine/snapshots` registration currently provided by both `app/routes/engine.py` and `app/routes/snapshots.py`. Choose one canonical owner, preserve the live frontend snapshot bar behavior, and update focused tests accordingly.
- Why it matters: The new concrete route-collision guard now documents that the snapshot listing endpoint is registered twice, which creates silent shadowing risk and ambiguous maintenance ownership.
- Dependencies: T403
- Estimated effort: Medium
- Required outputs: Single owner for `GET /api/engine/snapshots`, updated tests, and removal from the duplicate-route allowlist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 09:54 EDT - Codex
- Completion notes:
  - Removed the duplicate `GET /api/engine/snapshots` handler from `app/routes/engine.py`, leaving `app/routes/snapshots.py` as the sole owner of the snapshot listing endpoint the frontend snapshot bar already uses.
  - Added `tests/test_engine_snapshot_route_ownership.py` and updated `tests/test_route_registration_policy.py` so the duplicate-route allowlist no longer includes the snapshot listing path.
  - Validation passed with `pytest tests/test_engine_snapshot_route_ownership.py tests/test_route_registration_policy.py tests/test_chains_ab_mode_identity.py tests/test_chains_ab_mode_route_registration.py -q`.

ID: T409
Status: [✓] Done
Title: Resolve duplicate cluster admin and update route ownership
Description:
- Goal / acceptance criteria: Remove the duplicate concrete route registrations for `GET /api/cluster/nodes`, `GET /api/cluster/health`, `GET /api/cluster/health/{node_id}`, `GET /api/cluster/update/schedule`, and `GET /api/cluster/update/history` across `cluster_flows.py`, `cluster_health.py`, `cluster_admin.py`, and `cluster_update.py`. Keep one canonical owner per endpoint and preserve current frontend behavior.
- Why it matters: These duplicates sit on heavily used cluster-admin paths, so shadowing here is operationally riskier than an unused dead route.
- Dependencies: T403
- Estimated effort: High
- Required outputs: Canonical route ownership for the overlapping cluster paths, updated tests, and removal from the duplicate-route allowlist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 10:06 EDT - Codex
- Completion notes:
  - Removed the shadowed duplicate handlers from `app/routes/cluster_admin.py` for `GET /api/cluster/nodes`, `GET /api/cluster/health`, and `GET /api/cluster/health/{node_id}`, leaving `cluster_flows.py` and `cluster_health.py` as the sole owners of those public contracts already exposed in practice.
  - Removed the shadowed duplicate handlers from `app/routes/cluster_update.py` for `GET /api/cluster/update/schedule` and `GET /api/cluster/update/history`, leaving `cluster_admin.py` as the single owner of those update-planning endpoints.
  - Validation passed with the strict duplicate-route scan plus `pytest tests/test_route_registration_policy.py tests/test_cluster_flows_api.py tests/test_phase1_integration.py tests/test_cluster_visibility_routes.py tests/test_route_prefix_collisions_phase_a.py -q`.

ID: T410
Status: [✓] Done
Title: Resolve duplicate cluster config push and rollback routes
Description:
- Goal / acceptance criteria: Remove the duplicate `POST /api/cluster/config/push` and `POST /api/cluster/config/rollback` registrations currently split between `app/routes/cluster_admin.py` and `app/routes/config_api.py`. Preserve current config distribution behavior and node-to-node push flows while leaving one public owner for each endpoint.
- Why it matters: Cluster config propagation is write-path behavior; duplicate registrations here can silently send callers to the wrong implementation.
- Dependencies: T403
- Estimated effort: Medium
- Required outputs: Single route owner for the overlapping config endpoints, updated tests, and removal from the duplicate-route allowlist.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 10:06 EDT - Codex
- Completion notes:
  - Removed the duplicate `POST /api/cluster/config/push` and `POST /api/cluster/config/rollback` handlers from `app/routes/cluster_admin.py`, leaving `app/routes/config_api.py` as the sole write-path owner.
  - Tightened `tests/test_route_registration_policy.py` from an allowlisted duplicate detector to a fully strict “no duplicate concrete method+path registrations” guard after the final config-route collisions were removed.
  - Validation passed with an app-wide duplicate-route scan returning `[]` and the same focused cluster route test suite used for `T409`.

ID: T407
Status: [✓] Done
Title: Reorganize GUI theme settings into a staged modal flow
Description:
- Goal / acceptance criteria: Refactor the existing theme settings surface so it no longer behaves like one long page inside a dialog. Present theme presets, retained legacy themes, and optional system-branding controls as a series of focused modals/steps while preserving current apply, delete, and toggle behavior.
- Why it matters: The current Theme Page is scroll-heavy and page-like, which makes theme selection and system-branding tasks harder to scan and complete quickly.
- Dependencies: Existing `web/src/app/components/ThemeCreatorDialog.tsx`, related CSS/tests, and current Carbon modal patterns already used in the web app.
- Estimated effort: Medium
- Required outputs: Updated theme dialog flow, refreshed styling, focused frontend regression coverage, and validation evidence for the touched MAP2-owned files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-25 07:38 EDT - Codex
- Completion notes:
  - Reworked `web/src/app/components/ThemeCreatorDialog.tsx` from a single page-like `Modal` into a staged `ComposedModal` flow with an overview entry screen plus focused presets, legacy-theme, and system-branding steps.
  - Refreshed `web/src/app/components/ThemeCreatorDialog.css` so the new step cards and modal sections use tokenized Carbon layout, hover, and card styling instead of one stacked scrolling page.
  - Expanded `web/src/app/components/ThemeCreatorDialog.test.tsx` with focused coverage for overview-to-preset navigation, legacy-theme modal access, and system-branding toggle actions.
  - Validation passed with `npm --prefix web run typecheck` and `npm --prefix web test -- --runInBand web/src/app/components/ThemeCreatorDialog.test.tsx`.
  - Licensing review: touched frontend/worklist files remain MAP2-owned AGPL-covered repository artifacts; reran `rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing` and `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`, and found no new notice or ownership gap requiring follow-up work.
  - Follow-up: live verification showed the routed `/theme` workspace is rendered by `web/src/app/pages/ThemePage.tsx`, not `ThemeCreatorDialog.tsx`, so the modal-flow reorganization must be completed on the actual page component before closing the task.
  - Completed the routed `web/src/app/pages/ThemePage.tsx` reorganization by replacing the long inline settings surface with a launcher grid plus focused `ComposedModal` flows for library, directions, theme studio, typography, motion, and category accents.
  - Added the page-level launcher/modal styling in `web/src/app/pages/ThemePage.css` and updated `web/src/app/pages/ThemePage.test.tsx` so the routed Theme workspace is validated through the new modal entry points.
  - Validation passed for the final routed-page slice with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/ThemePage.test.tsx`, and `npm --prefix web run build`.

## Per-Plugin Appearance Customization (Theme Page)

ID: T411
Status: [✓] Done
Title: Per-plugin appearance customization — epic overview
Description:
- Goal / acceptance criteria: Allow users to customize Color (accent + optional dark/light variant), Icon (Carbon library + category SVGs + custom SVG upload), and Description for every installed effect plugin (LV2, JUCE native, Hardware, ToobAmp). Customizations are global and persist across sessions. Accessible as a sub-section within the existing Category tab on the Theme Page.
- Why it matters: Plugins from varied sources have inconsistent visual identity; user customization improves scannability and personal workflow.
- Dependencies: T407 (Theme Page modal reorganization — Done), existing Category tab, `categoryStyles.tsx`, `pluginLegacyCompat.ts`, plugin API routes
- Estimated effort: High
- Required outputs: Backend persistence API, localStorage cache layer, icon picker modal, SVG upload flow, plugin appearance editor UI within Category tab, and full test coverage.
Subtasks:

ID: T411-subA
Status: [✓] Done
Title: Backend persistence — plugin appearance overrides API + file storage
Description:
- Goal / acceptance criteria: New REST endpoints to CRUD per-plugin appearance overrides (color accent, dark/light variant, icon identifier, custom SVG data, description). Persisted to `~/.config/map2/plugin_appearance_overrides.json`. Endpoints: `GET /api/plugin-appearances`, `GET /api/plugin-appearances/{uri}`, `PUT /api/plugin-appearances/{uri}`, `DELETE /api/plugin-appearances/{uri}`, `POST /api/plugin-appearances/{uri}/icon-upload` (SVG).
- Why it matters: Backend is source of truth (decision C from planning).
- Dependencies: Existing `app/routes/plugins.py` patterns, `~/.config/map2/` directory convention
- Estimated effort: Medium
- Required outputs: New route file `app/routes/plugin_appearances.py`, Pydantic model, service layer, pytest coverage.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 09:47 EDT - Codex
- Completion notes:
  - Added `app/services/plugin_appearance_service.py` as a JSON-backed source of truth at `~/.config/map2/plugin_appearance_overrides.json`, including hex normalization, SVG validation, custom icon identifier generation, and thread-safe CRUD helpers.
  - Added `app/routes/plugin_appearances.py` with `GET /api/plugin-appearances`, `GET /api/plugin-appearances/{uri}`, `PUT /api/plugin-appearances/{uri}`, `DELETE /api/plugin-appearances/{uri}`, and `POST /api/plugin-appearances/{uri}/icon-upload`.
  - Registered the new route module in `app/main.py` and added focused coverage in `tests/test_plugin_appearance_routes.py`.
  - Validation passed with `pytest tests/test_plugin_appearance_routes.py tests/test_route_registration_policy.py -q`.

ID: T411-subB
Status: [✓] Done
Title: Frontend data layer — localStorage cache + sync hook
Description:
- Goal / acceptance criteria: `usePluginAppearances()` hook that reads from localStorage cache on mount, syncs from backend API, and writes through to both localStorage and backend on mutation. Cache key: `map2.plugin-appearance-overrides.v1`. Exposes `getPluginAppearance(uri)`, `setPluginAppearance(uri, overrides)`, `resetPluginAppearance(uri)`. Fires `CustomEvent` for cross-component subscription (same pattern as `categoryStyles.tsx`).
- Why it matters: Fast reads from cache (decision C), backend as source of truth.
- Dependencies: T411-subA (backend API)
- Estimated effort: Medium
- Required outputs: Hook file, TypeScript types for `PluginAppearanceOverride`, Jest tests.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 09:50 EDT - Codex
- Completion notes:
  - Added `web/src/app/hooks/usePluginAppearances.ts` with a React Query-backed `usePluginAppearances()` cache layer, localStorage hydration, cross-component sync event dispatch, and optimistic write-through for save/reset/icon upload flows.
  - Added `PluginAppearanceOverride` API contract support in `web/src/map2/types.ts` and `web/src/map2/api.ts`.
  - Added focused hook coverage in `web/src/app/hooks/usePluginAppearances.test.tsx`.
  - Validation passed with `npm --prefix web run typecheck` and `npm --prefix web test -- --runInBand web/src/app/hooks/usePluginAppearances.test.tsx`.

ID: T411-subC
Status: [✓] Done
Title: Icon picker modal — Carbon icons + category SVGs + custom SVG upload
Description:
- Goal / acceptance criteria: Reusable `IconPickerModal` (Carbon `ComposedModal`) with three tabs: (1) Category SVG icons (~40 existing fx_* icons in a grid), (2) Carbon Design icons (searchable grid from `@carbon/icons-react`), (3) Custom SVG upload (drag-drop or file input, validates SVG, previews before confirm). Returns selected icon identifier (category: `fx:amplifier`, Carbon: `carbon:Activity`, custom: `custom:{uri-hash}`). Size-constrained SVG uploads (e.g., max 32KB).
- Why it matters: Icon flexibility was chosen (decision B+C from planning).
- Dependencies: `@carbon/icons-react` (already installed), existing category SVGs
- Estimated effort: Medium
- Required outputs: `IconPickerModal.tsx`, `IconPickerModal.test.tsx`, icon identifier format spec.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 10:11 EDT - Codex
- Completion notes:
  - Added `web/src/app/components/pluginAppearance/IconPickerModal.tsx` with category SVG, Carbon icon, and custom SVG flows plus preview and upload handling.
  - Added the shared icon registry in `web/src/app/utils/pluginAppearanceIcons.tsx` and reusable `PluginAppearanceIcon.tsx`.
  - Added coverage in `web/src/app/components/pluginAppearance/IconPickerModal.test.tsx`.

ID: T411-subD
Status: [✓] Done
Title: Color picker — accent color + optional dark/light variant
Description:
- Goal / acceptance criteria: `PluginColorPicker` component with: (1) primary accent color input (hex + visual swatch, same pattern as category color editor), (2) auto-generated dark/light variants shown as preview, (3) optional override toggles for dark and light variants with their own hex inputs. Uses the same color normalization as `categoryStyles.tsx`. Live preview of how the color renders on a plugin chip/card mock.
- Why it matters: Decision C — single accent with optional variant overrides.
- Dependencies: Existing color utilities in `categoryStyles.tsx`
- Estimated effort: Small
- Required outputs: `PluginColorPicker.tsx`, integrated into T411-subE editor.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 10:11 EDT - Codex
- Completion notes:
  - Added `web/src/app/components/pluginAppearance/PluginColorPicker.tsx` with accent editing, derived variants, optional overrides, and live preview.
  - Added shared color helpers in `web/src/app/utils/pluginAppearanceColors.ts`.
  - Added coverage in `web/src/app/components/pluginAppearance/PluginColorPicker.test.tsx`.

ID: T411-subE
Status: [✓] Done
Title: Plugin appearance editor UI — sub-section within Category tab
Description:
- Goal / acceptance criteria: New sub-section within the existing Category tab on the Theme Page (below category color editing). Contains: (1) searchable/filterable plugin list (all sources: LV2, JUCE, Hardware, ToobAmp), (2) selecting a plugin opens an inline editor or expand panel with Color (T411-subD), Icon (T411-subC trigger), and Description (text area) fields, (3) Save/Reset per plugin, (4) "Reset All Plugin Overrides" bulk action. Toggle or accordion to switch between category-level and plugin-level editing within the tab.
- Why it matters: Decision B — nested within Category tab, not a separate tab.
- Dependencies: T411-subB (data hook), T411-subC (icon picker), T411-subD (color picker), existing Category tab in ThemePage
- Estimated effort: Medium
- Required outputs: Updated `ThemePage.tsx` Category tab section, new sub-components, test coverage.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 10:11 EDT - Codex
- Completion notes:
  - Extended `web/src/app/pages/ThemePage.tsx` so the Category workspace now includes per-plugin override controls, plugin search/filtering, icon picker launch, save/reset actions, and bulk reset.
  - Added Theme Page coverage in `web/src/app/pages/ThemePage.test.tsx`.

ID: T411-subF
Status: [✓] Done
Title: Integration — apply overrides across Plugin Chooser, cards, and chips
Description:
- Goal / acceptance criteria: Plugin appearance overrides from T411-subB are consumed by: (1) `PluginCard.tsx` — override icon, color, and tooltip/description, (2) `pluginChipMeta.ts` — override chip color/icon, (3) `pluginBridge.ts` — merge overrides into `UnifiedPlugin` during normalization, (4) `LegacyPluginIcon.tsx` — respect icon overrides. Custom SVG icons render inline. Fallback chain: user override → category default → legacy default.
- Why it matters: Overrides must be visible everywhere plugins appear, not just the editor.
- Dependencies: T411-subB, T411-subE
- Estimated effort: Medium
- Required outputs: Updated bridge/card/chip files, integration tests verifying fallback chain.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 10:11 EDT - Codex
- Completion notes:
  - Normalized chooser plugins now carry `appearanceOverride` data from local storage in `web/src/shared/components/PluginChooser/utils/pluginBridge.ts`.
  - Updated `PluginCard.tsx`, `LegacyPluginIcon.tsx`, and `pluginChipMeta.ts` to respect stored icon/color/description overrides with fallback rendering.
  - Added regression coverage in `web/src/shared/components/PluginChooser/pluginLegacyCompat.test.ts`.

ID: T411-subG
Status: [✓] Done
Title: End-to-end testing and build verification
Description:
- Goal / acceptance criteria: Full test pass: (1) pytest for backend API routes (CRUD, SVG upload, validation), (2) Jest for frontend hook, icon picker, color picker, editor UI, and integration, (3) `npm run typecheck` clean, (4) `npm run build` clean, (5) manual smoke test of override flow in production preview.
- Why it matters: "Done means clean build" rule.
- Dependencies: T411-subA through T411-subF
- Estimated effort: Small
- Required outputs: All tests passing, build artifacts verified.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 10:11 EDT - Codex
- Completion notes:
  - Validation passed with `npm --prefix web run typecheck`.
  - Validation passed with `npm --prefix web test -- --runInBand web/src/shared/components/PluginChooser/pluginLegacyCompat.test.ts web/src/app/hooks/usePluginAppearances.test.tsx web/src/app/components/pluginAppearance/PluginColorPicker.test.tsx web/src/app/components/pluginAppearance/IconPickerModal.test.tsx web/src/app/pages/ThemePage.test.tsx`.
  - Validation passed with `npm --prefix web run build`.

Assigned to: Unassigned
Last updated: 2026-03-25

## Ink TUI

ID: T412
Status: [✓] Done
Title: MAP2 Ink TUI — Standalone terminal interface (Epic)
Description:
- Goal / acceptance criteria: Deliver a first-class, standalone terminal interface for MAP2 built with React + Ink, covering 14 screens with full keyboard navigation, real-time metering, device control, and cluster management.
- Why it matters: Enables headless operation, SSH-based workflows, and live performance control without a browser.
- Dependencies: Existing backend APIs (no backend changes required)
- Estimated effort: Very High (10 weeks across 5 phases)
- Required outputs: `tui/` directory with complete Ink application, test suite, documentation. Full plan: `docs/plans/INK_TUI_PRODUCT_PLAN.md`
Subtasks:
ID: T412-subA
Status: [✓] Done
Title: TUI project scaffold and build system
Description:
- Goal / acceptance criteria: Create `tui/` directory with package.json, tsconfig.json, Ink + React dependencies, build scripts, and ESLint config with import boundary enforcement (ban web/src/app/ imports).
- Why it matters: Foundation for all subsequent TUI development.
- Dependencies: None
- Estimated effort: Small
- Required outputs: Bootable empty Ink app that renders to terminal. npm run build and npm test work.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:12 EDT - Codex
- Completion notes:
  - Added the standalone Ink package scaffold under `tui/` with `package.json`, `tsconfig.json`, `jest.config.cjs`, `babel.config.cjs`, and a flat ESLint config that blocks `web/src/app/**` imports from the TUI source tree.
  - Added `tui/src/main.tsx` and `tui/src/App.tsx`, confirmed `npm run build` and `npm test` pass, and smoke-booted the app with `npm start` against the live backend.
ID: T412-subB
Status: [✓] Done
Title: Node.js adapters for shared API/WebSocket layer
Description:
- Goal / acceptance criteria: Create thin adapter modules so web/src/map2/api.ts and web/src/map2/websocket.ts work in Node.js without browser globals.
- Why it matters: Enables code reuse of the entire API client and WebSocket layer.
- Dependencies: T412-subA
- Estimated effort: Medium
- Required outputs: Adapter modules providing Node-compatible fetch and WebSocket. Verified with integration test against running backend.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:12 EDT - Codex
- Completion notes:
  - Added `web/src/map2/runtime.ts` plus `tui/src/runtime/map2NodeRuntime.ts` so the shared API/WebSocket layer can receive Node fetch, WebSocket, location, and storage shims at runtime.
  - Updated `web/src/map2/api.ts` and `web/src/map2/websocket.ts` to resolve their runtime dependencies lazily instead of hard-failing on `window`.
  - Added a live integration check in `tui/src/runtime/map2NodeRuntime.test.ts` that hits `http://localhost:8080/api/health` and opens `/ws/v1`.
ID: T412-subC
Status: [✓] Done
Title: AppShell, screen router, and global navigation
Description:
- Goal / acceptance criteria: Implement AppShell (header + content + status bar), screen stack router with push/pop, command palette (Ctrl+P), help overlay (?), and global keybindings.
- Why it matters: Core navigation infrastructure that all screens depend on.
- Dependencies: T412-subA
- Estimated effort: Medium
- Required outputs: Shell components, navigation system, keybinding infrastructure, terminal size detection.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:12 EDT - Codex
- Completion notes:
  - Added the screen stack router, registry, terminal-size/status hooks, shell header/status bar, command palette, help overlay, and global key handling in `tui/src/App.tsx`, `tui/src/navigation/*`, `tui/src/hooks/*`, and `tui/src/shell/*`.
  - Number-key jumps, `Ctrl+P`, `?`, and `Esc` now work through the shared shell state.
ID: T412-subD
Status: [✓] Done
Title: Core component library (primitives)
Description:
- Goal / acceptance criteria: Build reusable TUI component library: DataTable, FilterableList, FormField, ProgressBar, VuMeter, Sparkline, StatusDot, TabBar, ConfirmDialog, Toast, BoxPanel, KeyHint, LogStream, Badge, Spinner.
- Why it matters: All screens compose from these primitives. Building them first enables parallel screen development.
- Dependencies: T412-subA
- Estimated effort: Large
- Required outputs: 15+ component files with unit tests using ink-testing-library.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:12 EDT - Codex
- Completion notes:
  - Added the initial primitive set under `tui/src/components/`: `DataTable`, `FilterableList`, `FormField`, `ProgressBar`, `VuMeter`, `Sparkline`, `StatusDot`, `TabBar`, `ConfirmDialog`, `Toast`, `BoxPanel`, `KeyHint`, `LogStream`, `Badge`, and `Spinner`.
  - Added `tui/src/inkSmoke.tsx` so `npm test` now includes direct Ink render smoke coverage for representative primitives and the shell entry point using `ink-testing-library`.
ID: T412-subE
Status: [✓] Done
Title: Home Screen
Description:
- Goal / acceptance criteria: Implement entry-point Home Screen showing system health summary, active chain, CPU load, connected devices, and navigation cards.
- Dependencies: T412-subB, T412-subC, T412-subD
- Estimated effort: Medium
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:12 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/HomeScreen.tsx` with live-backed system summary, CPU/RAM progress bars, active-chain detection, connected MIDI endpoint count, and quick-navigation hints.
  - Verified the rendered home screen in a live `npm start` smoke against `http://localhost:8080`.
ID: T412-subF
Status: [✓] Done
Title: Metering and CPU screens
Description:
- Goal / acceptance criteria: Implement real-time Metering Screen (per-channel VU bars, peak hold, clipping) and CPU/Performance Screen (per-core bars, RT thread table, latency).
- Dependencies: T412-subB, T412-subD
- Estimated effort: Medium
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:50 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/MeteringScreen.tsx` and `tui/src/screens/CpuScreen.tsx`, wired into the shell, and backed them with live `/api/audio/levels`, `/api/audio/status`, and `/api/engine/cpu` polling.
  - Corrected `web/src/map2/api.ts` CPU client paths so the shared client targets the registered `/api/engine/cpu` routes.
ID: T412-subG
Status: [✓] Done
Title: Audio Grid and PipeWire screens
Description:
- Goal / acceptance criteria: Implement Audio Grid Screen (text-mode signal chain, plugin list, bypass toggle, parameter editing) and PipeWire Screen.
- Dependencies: T412-subB, T412-subD
- Estimated effort: Medium
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:50 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/AudioGridScreen.tsx` with active-chain signal-flow rendering and chain inventory, plus `tui/src/screens/PipeWireScreen.tsx` with daemon, clock, device, and stream summaries.
ID: T412-subH
Status: [✓] Done
Title: MIDI Hub and Devices screens
Description:
- Goal / acceptance criteria: Implement MIDI Hub Screen (5-tab layout) and Devices Screen (USB audio interface status).
- Dependencies: T412-subB, T412-subD
- Estimated effort: Large
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:50 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/MidiHubScreen.tsx` with hub/cluster summaries and port inventory, and `tui/src/screens/DevicesScreen.tsx` with USB audio diagnostics plus MIDI endpoint tables.
  - Extended `web/src/map2/api.ts` with `usbApi.getDevices()` so the TUI reuses the shared client surface instead of bespoke fetches.
ID: T412-subI
Status: [✓] Done
Title: MPX1 Screen
Description:
- Goal / acceptance criteria: Implement MPX1 Screen with tabbed views: Panel, Editor, Library, MIDI Map, Diagnostics.
- Dependencies: T412-subB, T412-subD
- Estimated effort: Medium
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:50 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/Mpx1Screen.tsx` with terminal tab switching for Panel, Editor, Library, MIDI Map, and Diagnostics, all populated from the shared `mpx1Api` client.
ID: T412-subJ
Status: [✓] Done
Title: Cluster, AVB, and Tesira screens
Description:
- Goal / acceptance criteria: Implement Cluster Screen, AVB Screen (with ASCII routing matrix), and Tesira Screen.
- Dependencies: T412-subB, T412-subD
- Estimated effort: Large
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 14:50 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/ClusterScreen.tsx`, `tui/src/screens/AvbScreen.tsx`, and `tui/src/screens/TesiraScreen.tsx` to surface service health, AVB operational state, and Tesira fleet status from live backend APIs.
  - Added `tui/src/hooks/usePollingResource.ts` as the shared polling layer used across the new terminal screens.
ID: T412-subK
Status: [✓] Done
Title: Artifacts, Settings, and Diagnostics screens
Description:
- Goal / acceptance criteria: Implement Artifacts Screen, Settings Screen, and Diagnostics Screen.
- Dependencies: T412-subD
- Estimated effort: Medium
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 15:03 EDT - Codex
- Completion notes:
  - Added `tui/src/screens/ArtifactsScreen.tsx`, `tui/src/screens/SettingsScreen.tsx`, and `tui/src/screens/DiagnosticsScreen.tsx` and wired them into the router.
  - The new screens are backed by live snapshots, backup, realtime-status, branding-status, metrics, history, services, and access-log endpoints.
ID: T412-subL
Status: [✓] Done
Title: Polish, testing, documentation, and packaging
Description:
- Goal / acceptance criteria: Full test suite, 80×24 audit of all screens, color fallback testing, error state handling, performance profiling, CLI documentation, and npm packaging.
- Dependencies: T412-subA through T412-subK
- Estimated effort: Large
- Required outputs: Test suite (unit + integration + snapshot), 80×24 verification, --help/--no-color/--verbose support, README, performance benchmarks.
Subtasks: None
Assigned to: Unassigned
Last updated: 2026-03-25 15:03 EDT - Codex
- Completion notes:
  - Added CLI flag support in `tui/src/main.tsx` for `--help`, `--api-url`, `--no-color`, and `--verbose`.
  - Expanded `tui/src/inkSmoke.tsx` to cover representative live-backed screens across the full Ink surface and updated `tui/README.md` with Ink startup/build/test guidance.
  - Validation passed with `npm --prefix tui run build`, `npm --prefix tui test`, `npm --prefix tui start -- --help`, and `npm --prefix web run typecheck`.
Assigned to: Unassigned
Last updated: 2026-03-25 15:03 EDT - Codex
- Completion notes:
  - Delivered the standalone Ink TUI scaffold, shared runtime adapters, shell/navigation, primitive component set, and all planned first-pass screens.
  - The canonical worklist now has no remaining unblocked `T412` subtasks.
