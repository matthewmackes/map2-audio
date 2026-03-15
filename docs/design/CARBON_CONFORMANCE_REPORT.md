# Carbon Conformance Report

Date: 2026-03-12 20:27 EDT
Canonical task: T114-subJ
Primary inputs: `docs/design/CARBON_ROUTE_COMPONENT_INVENTORY.md`, `docs/design/CARBON_DRIFT_AUDIT.md`, `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md`, `docs/design/CARBON_CONFORMANCE_MATRIX.md`

## Executive summary

- Carbon conformance governance is now in place for all new/modified UI work (`T114-subA`).
- Full route/component inventory, drift audit, and route-to-pattern mapping were completed (`T114-subB` to `T114-subD`).
- Shared primitive migration and route-level migration waves were executed across major app-shell/library/cluster/IntelFX surfaces (`T114-subF`, `T114-subG`).
- Deferred high-drift route cleanup is complete with Carbon route-shell migration for `AboutPage`, `LCDPage`, `LV2PluginsPage`, and `ApiObservatoryPage` plus focused validation evidence (`T114-subK` done).
- Accessibility validation wave for IntelFX Carbon migrations was completed with new deterministic tests and semantic fixes (`T114-subH`).
- Prior exception scope (`T114-subK` through `T114-subN`) has been closed with explicit artifacts and validation evidence.

## Route inventory

Route inventory source of truth: `docs/design/CARBON_ROUTE_COMPONENT_INVENTORY.md`.

- Frontend top-level routes in `web/src/app/App.tsx`: 36
- Nested child routes in `App.tsx` (`mpx1/*`, `intelfx/*`): 9
- Nested Tesira routes in `web/src/app/components/Tesira/TesiraApp.tsx`: 13

Route migration status snapshot:

| Route family | Status | Notes |
| --- | --- | --- |
| App shell + navigation routes | Migrated | Carbon shell primitives and tokenized nav metadata in place |
| Library/overview/pipewire/chains/cluster-dashboard waves | Migrated | Route-level Carbon pattern adoption and tokenized styles completed |
| IntelFX route family (`/intelfx/*`) | Migrated | Host shell + panel/editor/midi-map/library/perform/diag/flow converted |
| Deferred high-drift routes | Migrated (route shell) | `LCDPage`, `AboutPage`, `LV2PluginsPage`, and `ApiObservatoryPage` now use Carbon layer wrappers/tokens |

## Shared component inventory

Shared inventory source of truth: `docs/design/CARBON_ROUTE_COMPONENT_INVENTORY.md` Section 4.

- Top-level component domains under `web/src/app/components`: 30
- Shared primitive migration coverage completed for:
  - App shell/navigation
  - Notifications/loading
  - Dialogs/modals
  - Shared selector/input/table primitives
  - Library/preset/upload shared flows
- Legacy parallel UI systems are now classified with retain/freeze/migrate guardrails:
  - Classification artifact: `docs/design/CARBON_LEGACY_UI_ISLAND_CLASSIFICATION.md`
  - Retained pipedal icon dependency is wrapped behind a Carbon adapter (`LegacyPluginIcon`)

## Conformance findings by severity

Findings source of truth: `docs/design/CARBON_CONFORMANCE_MATRIX.md`.

- Critical (open):
  - Deep hard-coded token drift still exists in legacy-heavy internals beyond route shells and requires phased cleanup.
- High (open):
  - Legacy/parallel component islands remain partially retained by design and must stay behind explicit wrapper/guardrail boundaries.
- Medium (closed in this wave):
  - Manual responsive/contrast sweep now documented.
  - AI label convention standardization now codified and applied to active AI surfaces.
- Closed/high-impact findings:
  - Carbon runtime installed, IBM Plex baseline enabled, app shell migrated, mixed icon usage reduced on migrated surfaces, IntelFX route family moved to Carbon patterns.

## Refactor plan

1. Keep Carbon conformance gate active for all new UI changes via `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`.
2. Continue phased deep-token cleanup in legacy-heavy internals without regressing business behavior (`T114-subO`).
3. Enforce freeze-path guardrails for `map2`/`pipedal` UI islands and require wrappers for any retained legacy primitives.

## Patch set grouped by file

Governance and standards:

- `docs/design/CARBON_CONFORMANCE_STANDARD.md`
- `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- `docs/design/CARBON_ROUTE_COMPONENT_INVENTORY.md`
- `docs/design/CARBON_DRIFT_AUDIT.md`
- `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md`
- `docs/design/CARBON_CONFORMANCE_MATRIX.md`
- `docs/design/CARBON_LEGACY_UI_ISLAND_CLASSIFICATION.md`
- `docs/design/CARBON_MANUAL_A11Y_SWEEP_2026-03-12.md`
- `docs/design/CARBON_AI_LABEL_CONFORMANCE.md`

Shared primitives and shell:

- `web/src/app/App.tsx`
- `web/src/main.tsx`
- `web/src/index.css`
- `web/src/styles/mobile.css`
- `web/src/app/layout/AppShell.tsx`
- `web/src/app/data/advancedMenuItems.ts`
- `web/src/app/components/Toasts.tsx`
- `web/src/app/components/shared/NodeSelector.tsx`
- `web/src/app/components/PasswordDialog.tsx`
- `web/src/app/components/SpecialSettingsDialog.tsx`
- `web/src/app/components/PluginDetailsModal.tsx`
- `web/src/app/components/ProductDetailDialog.tsx`
- `web/src/app/components/ShoppingSearchDialog.tsx`
- `web/src/app/components/ShoppingSearchDialog.css`
- `web/src/app/components/MidiCluster/MidiClusterConnectionMatrix.tsx`
- `web/src/app/components/library/InstalledAssetsTable.tsx`
- `web/src/app/components/library/LibrarySources.tsx`
- `web/src/app/components/library/Tone3000Config.tsx`
- `web/src/app/components/loaders/IRManagerDialog.tsx`
- `web/src/app/components/loaders/NAMManagerDialog.tsx`
- `web/src/app/components/presets/PresetDeployModal.tsx`
- `web/src/app/components/presets/PresetImportDialog.tsx`

Route migration waves:

- `web/src/app/pages/ClusterDashboardPage.tsx`
- `web/src/app/pages/ChainsPage.tsx`
- `web/src/app/pages/OverviewPage.tsx`
- `web/src/app/pages/PipeWirePage.tsx`
- `web/src/app/pages/MidiHubPage.tsx` (absorbed the former `/midi-hub-2` route)
- `web/src/app/pages/IntelFXPage.tsx`
- `web/src/app/pages/IntelFXPerformView.tsx`
- `web/src/app/pages/IntelFXMonitorView.tsx`
- `web/src/app/pages/IntelFXPanelView.tsx`
- `web/src/app/pages/IntelFXFlowView.tsx`
- `web/src/app/pages/IntelFXLibraryView.tsx`
- `web/src/app/pages/IntelFXMidiMapView.tsx`
- `web/src/app/pages/IntelFXEditorView.tsx`
- `web/src/app/pages/TesiraPage.tsx`
- `web/src/app/pages/TesiraPage.css`
- `web/src/app/pages/AvbRoutingPage.tsx`
- `web/src/app/pages/AvbRoutingPage.css`
- `web/src/app/pages/AboutPage.tsx`
- `web/src/app/pages/AboutPage.css`
- `web/src/app/pages/LCDPage.tsx`
- `web/src/app/pages/LCDPage.css`
- `web/src/app/pages/LV2PluginsPage.tsx`
- `web/src/app/pages/LV2PluginsPage.css`
- `web/src/app/pages/ApiObservatoryPage.tsx`
- `web/src/app/components/IntelFX/IntelFXFlowCanvas.tsx`
- `web/src/app/components/MidiHub/MidiInnovationPanel.tsx`
- `web/src/shared/components/PluginChooser/components/LegacyPluginIcon.tsx`
- `web/src/shared/components/PluginChooser/components/LegacyPluginIcon.css`
- `web/src/shared/components/PluginChooser/components/PluginCard.tsx`
- `web/src/shared/components/PluginChooser/components/CategorySidebar.tsx`
- `web/src/shared/components/PluginChooser/components/PluginPreviewPanel.tsx`

Accessibility validation wave files:

- `web/src/app/pages/IntelFXPage.tsx`
- `web/src/app/pages/IntelFXLibraryView.test.tsx`
- `web/src/app/pages/IntelFXMidiMapView.test.tsx`
- `web/src/app/pages/IntelFXEditorView.test.tsx`
- `web/src/app/pages/AvbRoutingPage.test.tsx`
- `web/src/app/pages/TesiraPage.test.tsx`
- `web/src/app/pages/AboutPage.test.tsx`
- `web/src/app/components/ShoppingSearchDialog.test.tsx`
- `web/src/app/pages/ApiObservatoryPage.test.tsx`

## Accessibility findings

Validation evidence:

- `npm --prefix web run test -- src/app/pages/IntelFXLibraryView.test.tsx src/app/pages/IntelFXMidiMapView.test.tsx src/app/pages/IntelFXEditorView.test.tsx --runInBand` (pass)
- `npm --prefix web run test -- src/app/pages/AboutPage.test.tsx src/app/pages/ApiObservatoryPage.test.tsx src/app/pages/AvbRoutingPage.test.tsx src/app/pages/TesiraPage.test.tsx src/app/components/ShoppingSearchDialog.test.tsx --runInBand` (pass)
- `npm --prefix web run typecheck` (pass)
- `npm --prefix web run build` (pass)

Findings:

- Pass: IntelFX library/midi-map/editor routes expose labeled controls and stable actionable names.
- Pass: IntelFX status-bar mix input and bypass pills now expose explicit semantics (`label`/`htmlFor`, `aria-label`, `aria-pressed`).
- Residual risk: Deep token cleanup remains for legacy-heavy internals and is tracked as `T114-subO`, while route-shell/manual-sweep exception debt is closed for this wave.

## Exceptions and rationale

Exception register source of truth: `docs/design/CARBON_CONFORMANCE_MATRIX.md` (`Exception Register (T114-subI)`).

| Exception ID | Surface | Resolution | Follow-up task |
| --- | --- | --- | --- |
| EX-001 | `web/src/map2/**`, `web/src/pipedal/**` | Closed via classification ledger + wrapper isolation (`docs/design/CARBON_LEGACY_UI_ISLAND_CLASSIFICATION.md`) | Completed (`T114-subL`) |
| EX-002 | Deferred high-drift routes (`LCDPage`, `AboutPage`, `LV2PluginsPage`, `ApiObservatoryPage`) | Closed via Carbon route-shell migration and route validation evidence | Completed (`T114-subK`) |
| EX-003 | Full manual responsive/contrast sweep across migrated routes | Closed via audit artifact (`docs/design/CARBON_MANUAL_A11Y_SWEEP_2026-03-12.md`) | Completed (`T114-subM`) |
| EX-004 | Carbon AI label convention rollout on AI-adjacent surfaces | Closed via AI label rollout + checklist/test gate updates (`docs/design/CARBON_AI_LABEL_CONFORMANCE.md`) | Completed (`T114-subN`) |
