# MAP Icon Migration Exception Ledger

Date: 2026-03-15
Owner: Codex
Related worklist items: `T137`, `T137-subE`

## Completed migration wave

Completed in-place replacements now live in:

- shell navigation and home metadata
- `JUCE-GRID`
- `/about`
- platform guide/document library surface
- footer architecture/acknowledgement surface
- plugin-category taxonomy and card section icons
- Tesira header/device/topbar neutralized away from vendor-mark usage

This wave also removed:

- `web/src/app/components/icons/fontaudio/*`
- `web/src/app/components/Tesira/BiampIcon.tsx`

## Remaining exception totals

| Holdout type | Remaining files |
| --- | ---: |
| Phosphor | 100 |
| MUI icons | 64 |
| Emoji / symbol glyphs | 58 |

## Exception groups

### Group A: Legacy `web/src/map2/**`

Status: temporary holdout

- 39 files still on `@mui/icons-material`
- 6 files still contain emoji/symbol UI text

Reason:

- this is the densest remaining legacy feature island and still uses the older MUI-based component architecture

Approved target:

- Carbon UI icons for controls
- MAP-owned icons only for domain identity where required

Representative files:

- `web/src/map2/components/WorkFlow.tsx`
- `web/src/map2/components/PluginBrowser.tsx`
- `web/src/map2/components/SettingsPanel.tsx`
- `web/src/map2/components/HistoryPanel.tsx`

### Group B: Tesira feature cluster

Status: temporary holdout

- 13 files still on `@mui/icons-material`

Reason:

- control tabs and settings panels still use MUI iconography even after route/header neutralization

Approved target:

- Carbon controls/status icons
- keep neutral MAP device-family icon only for route/device identity

Representative files:

- `web/src/app/components/Tesira/components/TesiraFirmwareTab.tsx`
- `web/src/app/components/Tesira/components/TesiraControlPanel.tsx`
- `web/src/app/components/Tesira/components/TesiraPresetsTab.tsx`

### Group C: AVB routing cluster

Status: temporary holdout

- 9 files still on `@mui/icons-material`
- 5 files still contain emoji/symbol status text

Reason:

- AVB routing still carries older grid/table/header affordances from the pre-Carbon implementation

Approved target:

- Carbon table/status icons
- text tags for state
- no emoji device or availability markers

Representative files:

- `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
- `web/src/app/components/AvbRouting/components/RoutingGrid/StickyHeaders.tsx`
- `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.tsx`

### Group D: Plugin card ecosystem

Status: temporary holdout

- 14 files still on Phosphor
- 11 files still contain emoji/symbol copy

Reason:

- custom plugin cards still embed family-specific visual language from the earlier icon stack

Approved target:

- Carbon control icons
- MAP-owned category icons where domain identity matters

Representative files:

- `web/src/app/components/PluginCards/Base/PluginCardShell.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`
- `web/src/app/components/PluginCards/Custom/LV2/WhammyCard.tsx`

### Group E: Cluster and Host Machine operational dashboards

Status: temporary holdout

- Cluster Dashboard: 10 Phosphor files, 7 emoji-bearing files
- Host Machine: 10 Phosphor files, 8 emoji-bearing files, 2 MUI files

Reason:

- these panels still carry mixed iconography from earlier diagnostic/education iterations

Approved target:

- Carbon health/status/action icons
- text labels for service names and node roles

Representative files:

- `web/src/app/components/ClusterDashboard/ClusterOverviewTab.tsx`
- `web/src/app/components/ClusterDashboard/ServicesHealthTab.tsx`
- `web/src/app/components/HostMachine/HealthMonitor.tsx`
- `web/src/app/components/HostMachine/PerformanceMetrics.tsx`

### Group F: Remaining Phosphor pages

Status: temporary holdout

Representative pages:

- `web/src/app/pages/LV2PluginsPage.tsx`
- `web/src/app/pages/MeteringPage.tsx`
- `web/src/app/pages/HostMachinePage.tsx`
- `web/src/app/pages/MidiHubPage.tsx`
- `web/src/app/pages/MPX1Page.tsx`

Reason:

- these pages have not yet been route-by-route normalized after the canonical shell/home/about/grid surfaces

## Migration rule for every exception

- replace in place
- do not add a wrapper abstraction
- prefer Carbon for verbs/status
- use MAP-owned icons only for route/domain identity
- remove emoji if a Carbon icon plus text carries the meaning

## Exit condition

This ledger can be retired when:

1. `@phosphor-icons/react` count reaches zero in `web/src/app/**` and `web/src/map2/**`
2. `@mui/icons-material` count reaches zero in active frontend code
3. emoji/symbol UI markers are limited to legitimate text content rather than acting as UI icons
