# Carbon Conformance Inventory: Routes, Templates, and Shared UI Surfaces

Date: 2026-03-11 23:14 EDT
Canonical task: T114-subB
Scope: Frontend runtime routes, nested route templates, shared components, icon systems, chart/table/form surfaces, navigation data, and brand assets.

## 1. Inventory Method

Primary scan sources:

- `web/src/app/App.tsx` (runtime route registry)
- `web/src/app/components/Tesira/TesiraApp.tsx` (nested Tesira route registry)
- `web/src/app/layout/AppShell.tsx` and `web/src/app/pages/*` (layout/templates)
- `web/src/app/components/**` + `web/src/map2/components/**` + `web/src/pipedal/**` (shared/legacy component systems)
- `web/src/app/data/advancedMenuItems.ts` and `web/src/app/pages/posterManifest.ts` (navigation and home catalog)
- `web/src/app/components/icons/**` and icon imports across `web/src/**` (iconography)
- `branding/**`, `web/public/**`, `docs/images/**` (brand/visual asset inventory)
- `app/routes/**` (backend API route surface that drives UI)

Snapshot metrics captured in this pass:

- Frontend absolute routes in `App.tsx`: `36`
- Nested child route entries in `App.tsx` (`mpx1/*`, `intelfx/*`): `9`
- Nested Tesira route entries in `TesiraApp.tsx`: `13`
- Backend route modules in `app/routes`: `112`
- Backend route decorators (`@router.get/post/put/delete/patch/websocket`): `1425`
- Top-level app component domains in `web/src/app/components`: `30`

## 2. Route Inventory

### 2.1 Frontend runtime routes (`web/src/app/App.tsx`)

Shell templates:

- Full-window route without shell chrome: `/perform` -> `PerformPage`
- Standard app-shell wrapper route: `/*` -> `AppShell` containing all primary routes

Primary route table:

| Path | Component | File |
| --- | --- | --- |
| `/` | `HomePage` | `web/src/app/pages/HomePage.tsx` |
| `/overview` | `OverviewPage` | `web/src/app/pages/OverviewPage.tsx` |
| `/chains` | `ChainsPage` | `web/src/app/pages/ChainsPage.tsx` |
| `/presets` | `PresetsPage` | `web/src/app/pages/PresetsPage.tsx` |
| `/legacy` | `LegacyPage` | `web/src/app/pages/LegacyPage.tsx` |
| `/about` | `AboutPage` | `web/src/app/pages/AboutPage.tsx` |
| `/plugins` | `LV2PluginsPage` | `web/src/app/pages/LV2PluginsPage.tsx` |
| `/library` | `LibraryPage` | `web/src/app/pages/LibraryPage.tsx` |
| `/midi` | `MIDIPage` | `web/src/app/pages/MIDIPage.tsx` |
| `/midi-hub` | `MidiHubPage` | `web/src/app/pages/MidiHubPage.tsx` |
| `/midi-hub-2` | `Navigate` | `web/src/app/App.tsx` |
| `/juce-grid` | `JuceGridPage` | `web/src/app/pages/JuceGridPage.tsx` |
| `/grid` | `Navigate` | `web/src/app/App.tsx` |
| `/grid-3d` | `Navigate` | `web/src/app/App.tsx` |
| `/dsp` | `DSPPage` | `web/src/app/pages/DSPPage.tsx` |
| `/edirol-ua1000` | `EdirolUA1000Page` | `web/src/app/pages/EdirolUA1000Page.tsx` |
| `/motu-rme` | `MOTURMEPage` | `web/src/app/pages/MOTURMEPage.tsx` |
| `/hotone-jogg` | `HoToneJoGGPage` | `web/src/app/pages/HoToneJoGGPage.tsx` |
| `/host-machine` | `HostMachinePage` | `web/src/app/pages/HostMachinePage.tsx` |
| `/cpu-performance` | `CPUPerformancePage` | `web/src/app/pages/CPUPerformancePage.tsx` |
| `/engine` | `AudioEnginePage` | `web/src/app/pages/AudioEnginePage.tsx` |
| `/metering` | `MeteringPage` | `web/src/app/pages/MeteringPage.tsx` |
| `/pipewire` | `PipeWirePage` | `web/src/app/pages/PipeWirePage.tsx` |
| `/welcome` | `WelcomePage` (redirect alias) | `web/src/app/pages/WelcomePage.tsx` |
| `/lcd` | `LCDPage` | `web/src/app/pages/LCDPage.tsx` |
| `/cluster-dashboard` | `ClusterDashboardPage` | `web/src/app/pages/ClusterDashboardPage.tsx` |
| `/platform?layer=midi-cluster` | `PlatformShellPage` | `web/src/app/pages/PlatformShellPage.tsx` |
| `/platform?layer=single-node` | `PlatformShellPage` | `web/src/app/pages/PlatformShellPage.tsx` |
| `/api-observatory` | `ApiObservatoryPage` | `web/src/app/pages/ApiObservatoryPage.tsx` |
| `/drums` | `DrumsPage` | `web/src/app/pages/DrumsPage.tsx` |
| `/avb-routing` | `AvbRoutingPage` | `web/src/app/pages/AvbRoutingPage.tsx` |
| `/expression` | `ExpressionPage` | `web/src/app/pages/ExpressionPage.tsx` |
| `/tesira/*` | `TesiraPage` (delegates nested routes) | `web/src/app/pages/TesiraPage.tsx` |
| `/mpx1/*` | `MPX1Page` + child outlet routes | `web/src/app/pages/MPX1Page.tsx` |
| `/intelfx/*` | `IntelFXPage` + child outlet routes | `web/src/app/pages/IntelFXPage.tsx` |
| `*` | Redirect to `/` | `web/src/app/App.tsx` |

### 2.2 Nested route groups

MPX1 child routes (`/mpx1/*`, defined in `web/src/app/App.tsx`):

- `panel` -> `MPX1PanelView`
- `editor` -> `MPX1EditorView`
- `midi-map` -> `MPX1MidiMapView`
- `matrix` -> `MPX1MatrixView`
- `library` -> `MPX1LibraryView`
- `perform` -> `MPX1PerformView`
- `diag` -> `MPX1DiagView`
- `flow` -> `MPX1FlowView`

IntelFX child routes (`/intelfx/*`, defined in `web/src/app/App.tsx`):

- `panel` -> `IntelFXPanelView`
- `editor` -> `IntelFXEditorView`
- `midi-map` -> `IntelFXMidiMapView`
- `library` -> `IntelFXLibraryView`
- `perform` -> `IntelFXPerformView`
- `diag` -> `IntelFXMonitorView`
- `flow` -> `IntelFXFlowView`

Tesira nested routes (defined in `web/src/app/components/Tesira/TesiraApp.tsx`):

- `:deviceId/dashboard`
- `:deviceId/design`
- `:deviceId/dsp`
- `:deviceId/levels`
- `:deviceId/mixer`
- `:deviceId/eq`
- `:deviceId/presets`
- `:deviceId/avb`
- `:deviceId/faults`
- `:deviceId/loops`
- `:deviceId/settings`

### 2.3 Backend API route surface supporting UI

Current backend route inventory snapshot:

- Route modules: `112` (`app/routes/*.py`)
- Route decorators: `1425`

Top route modules by endpoint count:

- `app/routes/midi_hub.py` (`99`)
- `app/routes/tesira.py` (`74`)
- `app/routes/mpx1.py` (`46`)
- `app/routes/intelfx.py` (`46`)
- `app/routes/midi_v2.py` (`41`)
- `app/routes/cluster_admin.py` (`38`)
- `app/routes/engine.py` (`37`)
- `app/routes/avb.py` (`37`)
- `app/routes/audio.py` (`37`)
- `app/routes/synthforge.py` (`33`)

## 3. Template and Layout Inventory

Primary shell/layout templates:

- `web/src/app/layout/AppShell.tsx` (global nav, pinned routes, advanced menu, mobile/desktop shell)
- `web/src/app/App.tsx` (`PageLoader` fallback and route-level `ErrorBoundary` wrappers)
- `web/src/app/pages/TesiraPage.tsx` (route-scoped custom MUI theme wrapper)
- `web/src/app/pages/MPX1Page.tsx` and `web/src/app/pages/IntelFXPage.tsx` (rack-style layout shells with route outlets)

Reusable plugin-card templates:

- `web/src/app/components/PluginCards/Templates/DelayTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/DistortionTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/DynamicsTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/EQTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/ModulationTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/PitchTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/ReverbTemplate.tsx`
- `web/src/app/components/PluginCards/Templates/UtilityTemplate.tsx`

## 4. Shared Component Inventory

Top-level UI domain directories under `web/src/app/components` (`29` domains):

- `ApiObservatory`, `AudioEngine`, `AvbRouting`, `BottomRoutingPanel`, `ChainPanel`, `ClusterDashboard`, `Controls`, `Dynamics`, `EQ`, `HorizontalSignalChain`, `HostMachine`, `IntelFX`, `MPX1`, `MidiCluster`, `MidiHub`, `PluginBrowser`, `PluginCards`, `PluginTags`, `Routing`, `Tesira`, `Visualizations`, `branding`, `chains`, `icons`, `library`, `loaders`, `presets`, `shared`, `upload`

Cross-page primitives with direct reuse intent:

- API Observatory primitives: `web/src/app/components/ApiObservatory/primitives/*`
- Shared selectors/prompts: `web/src/app/components/shared/NodeSelector.tsx`, `web/src/app/components/shared/LandscapePrompt.tsx`
- Toast/error shell primitives: `web/src/app/components/Toasts.tsx`, `web/src/app/components/ErrorBoundary.tsx`

Legacy/parallel component systems still active in-repo:

- `web/src/map2/components`: `31` component files (plus nested folders)
- `web/src/pipedal`: `163` component files

These are in-scope for Carbon conformance drift analysis because they import and render non-Carbon controls and themes.

## 5. Iconography Inventory

Icon library usage by file count (snapshot):

- `@carbon/icons-react`: `1` file (currently concentrated in `web/src/app/pages/HomePage.tsx`)
- `@mui/icons-material`: `44` files
- `@phosphor-icons/react`: `148` files
- `lucide-react`: `0` files

Custom icon components and icon assets:

- Historical snapshot: `web/src/app/components/icons/fontaudio/*` was part of the earlier mixed stack and has since been removed.
- Historical snapshot: `web/src/app/components/Tesira/BiampIcon` was previously used by the navigation catalog and has since been removed.
- Extensive static icon/image assets in `web/public/img/*` and `web/public/posters/*`

## 6. Charts, Tables, and Forms Inventory

Recharts-backed chart surfaces (`8` files):

- `web/src/app/components/ClusterDashboard/MetricsDashboardTab.tsx`
- `web/src/app/components/HostMachine/MetricsCharts.tsx`
- `web/src/app/components/HostMachine/MetricsChartsEnhanced.tsx`
- `web/src/app/components/HostMachine/PerformanceMetrics.tsx`
- `web/src/app/components/Tesira/components/TesiraFaultsTab.tsx`
- `web/src/app/components/Visualizations/FrequencyResponseChart.tsx`
- `web/src/app/components/Visualizations/ReverbMSEGChart.tsx`
- `web/src/app/components/Visualizations/ReverbTailChart.tsx`

Table-heavy surfaces (representative):

- `web/src/app/components/library/InstalledAssetsTable.tsx`
- `web/src/app/components/MidiCluster/MidiClusterConnectionMatrix.tsx`
- `web/src/app/components/ClusterDashboard/AVBNetworkTab.tsx`
- `web/src/app/components/ClusterDashboard/MultiNodeMonitoringTab.tsx`
- `web/src/app/components/Tesira/components/TesiraAvbTab.tsx`
- `web/src/app/components/Tesira/components/TesiraDspExplorer.tsx`

Form/dialog surfaces (representative):

- `web/src/app/components/PasswordDialog.tsx`
- `web/src/app/components/ThemeCreatorDialog.tsx`
- `web/src/app/components/SpecialSettingsDialog.tsx`
- `web/src/app/components/PluginCards/Dialogs/MidiMappingDialog.tsx`
- `web/src/app/components/MidiHub/MidiPatchbay.tsx`

## 7. Navigation Inventory

Canonical navigation data and shell state:

- `web/src/app/data/advancedMenuItems.ts`
- `web/src/app/layout/AppShell.tsx`
- `web/src/app/layout/advancedMenuState.ts`

Poster/navigation media binding:

- `web/src/app/pages/posterManifest.ts`
- `web/public/posters/manifest.json`
- `web/public/posters/*.webp`

## 8. Brand Asset Inventory

Asset pools identified for design-language audit:

- `branding/**` (`9` files)
- `web/public/**` (`156` files)
- `docs/images/**` (`35` files)

Key brand-relevant files:

- `branding/README.md`
- `branding/MACKESAUDIOPLATFORM - Banner-transparent.png`
- `web/public/branding/MACKESAUDIOPLATFORM - Banner-transparent.png`
- `web/public/map2-banner.png`
- `docs/images/disclaimer-banner.svg`
- `docs/images/map2-banner.png`

## 9. Inventory Notes for Next Phase (T114-subC)

High-confidence drift signals discovered during inventory:

1. Active mixed icon systems (`@mui/icons-material`, `@phosphor-icons/react`, limited Carbon icon usage).
2. Route-scoped custom MUI theming with hard-coded color palettes (`TesiraPage.tsx`).
3. Significant legacy component surface (`web/src/pipedal`, `web/src/map2/components`) still in repo and likely non-Carbon.
4. Broad backend route surface that will need UI contract triage by domain during conformance matrix generation.

This document is the baseline input for package/style drift detection and route-to-pattern mapping.
