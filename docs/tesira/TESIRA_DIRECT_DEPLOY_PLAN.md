# Tesira Direct Deployment Plan (Without Tesira Software UI)

## Goal
Enable MAP2 operators to deploy a recommended Tesira signal chain to units without opening the Tesira Software desktop application during normal operations.

## Constraint Summary
- Tesira Text Protocol (TTP) is a runtime control protocol and does not expose full design-authoring + compile primitives.
- Tesira compile/build actions are part of Tesira Software workflows.
- Practical direct path is deployment of precompiled layouts plus runtime parameterization.

Vendor references:
- TTP control surface (no full compiler surface): https://tesira-help.biamp.com/System_Control/Third_Part_Control.htm
- TTP v4.2 reference: https://downloads.biamp.com/assets/docs/default-source/control/tesira_text_protocol_v4-2_jan22.pdf?sfvrsn=100c2497_46
- Compiler workflow in Tesira Software docs: https://tesira-help.biamp.com/System_Design/Compiler.htm
- SageVue layout operations: https://sagevue-help.biamp.com/Tesira_Layouts.htm

## Target Architecture
1. MAP2 stores a catalog of precompiled Tesira layout templates (golden layouts).
2. MAP2 calls SageVue APIs to push selected layout to target Tesira units.
3. MAP2 uses TTP (telnet/ssh) to apply post-deploy runtime parameters (levels, EQ, crosspoints, presets, scenes, GPIO).
4. MAP2 validates AVB/PTP/health and marks deployment success/failure.
5. MAP2 supports one-click rollback to previous known-good layout.

## Implementation Model
### A. Golden Layout Catalog
- Source of truth: signed artifacts generated offline from validated Tesira projects.
- Artifact metadata:
  - `layout_id`, `version`, `device_family`, `channel_profile`, `required_firmware`, `checksum`.
  - expected instance-tag map and supported feature flags.
- Store in MAP2 DB + artifact storage.

### B. Chain Recipe Overlay
- New MAP2 recipe object that references a `layout_id` and runtime overrides.
- Overrides include:
  - Level defaults
  - EQ profiles
  - Mixer crosspoint matrices
  - Preset bindings
  - AVB stream bindings
- Result: deterministic deployable package without rebuilding DSP graph on unit.

### C. Deployment Orchestrator
Deployment transaction per unit:
1. Preflight:
   - Device reachable
   - Model/firmware compatible
   - Maintenance window lock acquired
2. Deploy:
   - Invoke SageVue layout deployment job
   - Stream job status to MAP2 UI
3. Post-deploy hydrate:
   - Reconnect TTP
   - Apply chain overlay values
4. Verify:
   - Core tags probe succeeds
   - AVB streams present
   - PTP state valid
   - Fault baseline captured
5. Commit or rollback:
   - Commit if all checks pass
   - Rollback to prior layout if verification fails

### D. Ops UX
- New `Deploy Chain` action in Tesira device dashboard.
- Dry-run mode showing compatibility report before deploy.
- Live progress timeline:
  - `preflight -> deploy -> hydrate -> verify -> done/rollback`.
- One-click rollback and downloadable deployment report.

## MAP2 Deliverables
### 1) Backend
- `app/services/tesira/sagevue_client.py`
- `app/services/tesira/layout_catalog.py`
- `app/services/tesira/tesira_deploy_orchestrator.py`
- `app/services/tesira/chain_overlay_service.py`
- New routes:
  - `GET /api/tesira/layouts`
  - `POST /api/tesira/layouts/import`
  - `POST /api/tesira/devices/{id}/deploy`
  - `GET /api/tesira/deployments/{job_id}`
  - `POST /api/tesira/deployments/{job_id}/rollback`

### 2) Database
- `TesiraLayoutArtifact`
- `TesiraChainRecipe`
- `TesiraDeploymentJob`
- `TesiraDeploymentEvent`

### 3) Frontend
- `TesiraDeployDialog.tsx`
- `TesiraDeploymentTimeline.tsx`
- `TesiraLayoutCatalogPage.tsx`
- `TesiraChainRecipeEditor.tsx`

### 4) Validation
- Contract tests for deployment APIs and state transitions
- Integration tests with mocked SageVue adapter
- HIL validation on at least 2 units:
  - success deploy
  - failed deploy + rollback
  - post-deploy TTP control readiness

## Delivery Phases
### Phase 1 (MVP)
- Read-only layout catalog
- Single-unit deployment job orchestration
- Post-deploy TTP verification

### Phase 2
- Chain recipe overlays
- Rollback automation
- Deployment timeline UI

### Phase 3
- Fleet/batch deployment
- Maintenance window scheduling
- Policy gates and approval workflow

## Acceptance Criteria
- Operator can deploy a recommended chain from MAP2 without opening Tesira Software UI.
- Deployment succeeds on supported device families with deterministic verification.
- Rollback succeeds to last known-good layout.
- MAP2 regains full runtime control (TTP + dashboards) after deployment.

## Known Limits
- This plan does not make Tesira units self-compiling authoring targets over TTP.
- New DSP topology authoring/compile parity still depends on MAP2-native canvas/compiler roadmap (`T069`, `T070`, `T071`).
