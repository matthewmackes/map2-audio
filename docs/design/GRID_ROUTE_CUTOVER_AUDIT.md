# Grid Route Cutover Audit

Date: 2026-03-14
Owner: Codex
Related worklist items: `T136`, `T136-subA`, `T136-subB`, `T136-subC`, `T136-subD`, `T136-subE`

## Current runtime state

| Surface | File | Current state |
| --- | --- | --- |
| Supported editor route | `web/src/app/pages/JuceGridPage.tsx` | `JUCE-GRID` is the sole supported signal-flow editor surface. |
| Legacy route alias | `web/src/app/App.tsx` | `/grid` redirects to `/juce-grid`. |
| Legacy route alias | `web/src/app/App.tsx` | `/grid-3d` redirects to `/juce-grid`. |
| Canonical guide route | `web/src/app/pages/AboutPage.tsx` | `/about` is the single platform information surface. |
| Legacy guide alias | `web/src/app/pages/WelcomePage.tsx` | `/welcome` redirects to `/about`. |
| Navigation and posters | `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/homeCardProfiles.ts`, `web/src/app/pages/posterManifest.ts` | Only `JUCE-GRID` remains operator-facing; the `GridFour` treatment now belongs to `/juce-grid`. |

## Dependency proof and removal outcome

The only shared ownership that survived the cutover is the neutral `JUCE-GRID` module:

| Owned by | Files | Purpose |
| --- | --- | --- |
| Neutral shared module | `web/src/app/grid/shared.tsx` | Category metadata plus `MidiMapping` and `AutomationLane` types used by `JUCE-GRID` without depending on a retired route tree. |

Deleted in this cutover:

- `web/src/app/pages/GridFlowPage.tsx`
- `web/src/app/pages/GridFlowAdvancedPage.tsx`
- all files under the retired `web/src/app/components/GridFlow/` tree
- all files under the retired `web/src/app/components/GridFlowAdvanced/` tree
- legacy-only docs: `docs/AI_GRIDFLOW_COMPONENT_MAP.md`, `docs/GRID_ADVANCED_IMPLEMENTATION.md`, `docs/GRID_ADVANCED_QUICK_REFERENCE.md`
- obsolete repository tests tied only to the retired GridFlow components

Verified outcome:

- `web/src/app/pages/JuceGridPage.tsx` imports from `web/src/app/grid/shared.tsx`, not from any `GridFlow` module.
- no runtime route imports reference `GridFlowPage` or `GridFlowAdvancedPage`.
- no active app component domain named `GridFlow` or `GridFlowAdvanced` remains in the source tree.

## Documentation cleanup status

Updated to describe the post-cutover state:

- `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md`
- `docs/design/CARBON_ROUTE_COMPONENT_INVENTORY.md`
- `docs/design/CARBON_LEGACY_UI_ISLAND_CLASSIFICATION.md`
- `docs/OPERATOR_NAVIGATION_MODEL.md`
- `docs/MOBILE_RESPONSIVE_PROMPT.md`
- `docs/evaluation/01-platform-inventory.md`
- `docs/evaluation/T092-GUI-PROFESSIONALISM-PLAN.md`
- `docs/subsystem-maturity-matrix.md`
- `docs/subsystem-maturity-matrix.json`
- `docs/tesira/FORTE_CI_SETUP.md`
- `docs/tesira/PLATFORM_SPEC.md`
- `docs/VITE_TROUBLESHOOTING_GUIDE.md`

Intentionally retained as historical evidence of prior states:

- `docs/AVB_MASTER_WORK_PLAN.md`
- `docs/ARCHITECTURE_FIXES_COMPLETE_2026-02-11.md`
- `docs/evaluation/05-bloat-audit.md`
- `docs/fit-for-purpose-evidence/**`

## Cutover policy

| Legacy path | Operator-facing policy | Notes |
| --- | --- | --- |
| `/grid` | Redirect to `/juce-grid` | Preserves inbound links while making the supported editor obvious. |
| `/grid-3d` | Redirect to `/juce-grid` | The retired 3D view no longer has independent workflow status. |
| `/welcome` | Redirect to `/about` | Keeps legacy guide links stable without split ownership. |
| `GridFour` icon | Assigned to `/juce-grid` | Explicit user requirement preserved during the cutover. |
