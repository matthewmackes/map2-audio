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
| Phosphor | 0 |
| MUI icons | 0 |
| Emoji / symbol glyphs | 0 |

## Exception groups

### Group A: Legacy `web/src/map2/**`

Status: migration complete for active legacy `map2` surfaces

- 0 files still on `@mui/icons-material`
- 0 files still contain tracked emoji/symbol UI markers

Reason:

- this is the densest remaining legacy feature island and still uses the older MUI-based component architecture

Approved target:

- Carbon UI icons for controls
- MAP-owned icons only for domain identity where required

Representative files:

- `web/src/map2/components/WorkFlow.tsx`
- `web/src/map2/components/SettingsPanel.tsx`
- `web/src/map2/components/ChainBuilder.tsx`
- `web/src/map2/components/AudioEngine.tsx`
- `web/src/map2/components/WWWPanel.tsx`

Latest note:

- Recounted the tracked emoji/symbol UI-marker sweep across `web/src/app` and `web/src/map2` on 2026-03-18; the result is now `TOTAL_FILES 0`.
- Began the legacy MUI cleanup wave by migrating `web/src/map2/components/WorkFlow.tsx`, `FeaturesPanel.tsx`, and `HistoryPanel.tsx` off `@mui/icons-material` while keeping the legacy MUI layout intact.
- Expanded the shared legacy cleanup on 2026-03-18 by migrating `web/src/map2/components/FeatureToolbar.tsx`, `SessionStatusIndicator.tsx`, and `BackupStatusWidget.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `32`.
- Extended that cleanup batch on 2026-03-18 by migrating `web/src/map2/components/PluginCpuIndicator.tsx`, `LatencyDisplay.tsx`, and `ABQuickToggle.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `29`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/SnapshotBar.tsx`, `LFOQuickButton.tsx`, and `ChainABMode.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `26`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/EnvelopeFollowerPanel.tsx`, `IRManager.tsx`, and `NAMManager.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `23`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/MetricsDashboard.tsx`, `NetworkPanel.tsx`, and `Audio/AudioConfigDialog.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `20`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/Automation/TransportControls.tsx`, `AutomationTimeline.tsx`, and `AutomationLane.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `17`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/AutomationEditor.tsx` and `web/src/map2/components/MIDI/MidiMappingsPanel.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `15`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/MIDIMapper.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `14`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/ChainBuilder/nodes/PluginMeterPanel.tsx`, `RoutingNode.tsx`, `DeviceNode.tsx`, and `AudioPluginNode.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `10`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/ChainBuilder/panels/SnapshotBar.tsx`, `MAP2Dashboard.tsx`, and `PluginPresetManager.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `7`.
- Extended it again on 2026-03-18 by migrating `web/src/map2/components/SessionManager.tsx`, `PresetManager.tsx`, and `PluginBrowser.tsx`, reducing the remaining `web/src/map2/**` MUI holdouts to `4`.
- Completed the active `web/src/map2/**` cleanup on 2026-03-18 by migrating `SettingsPanel.tsx`, `AudioEngine.tsx`, `WWWPanel.tsx`, and `ChainBuilder.tsx`; `rg -n "@mui/icons-material" web/src/map2 -g '*.tsx' -g '*.ts'` now returns no matches.
- The active-frontend exit audit now also shows `0` Phosphor files and `0` tracked emoji/symbol UI-icon files across `web/src/app` + `web/src/map2`; residual legacy icon-package imports are now outside this ledger’s active scope in `web/src/pipedal/**` and shared utility surfaces.

### Group B: Tesira feature cluster

Status: migration complete for routed Tesira component cluster

- 0 files still on `@mui/icons-material`

Reason:

- routed control tabs and settings panels were the remaining holdout; that batch is now migrated to Carbon icons

Approved target:

- Carbon controls/status icons
- keep neutral MAP device-family icon only for route/device identity

Representative files:

- `web/src/app/components/Tesira/components/TesiraFirmwareTab.tsx`
- `web/src/app/components/Tesira/components/TesiraControlPanel.tsx`
- `web/src/app/components/Tesira/components/TesiraPresetsTab.tsx`

Latest note:

- Cleared the remaining Tesira component-cluster `@mui/icons-material` imports on 2026-03-18 across presets, fleet/header, device cards, discovery/manual-add dialogs, levels, control, firmware, AVB, faults, and device settings.

### Group C: AVB routing cluster

Status: migration complete for routed AVB component cluster

- 0 files still on `@mui/icons-material`
- 0 files still contain emoji/symbol status text

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

Latest note:

- Cleared the remaining AVB routing cluster `@mui/icons-material` imports on 2026-03-18 across inspector, topology modal, scene diff preview, top bar, node selector, sticky headers, node tree, routing matrix cells, and batch actions.
- Cleared the remaining AVB routed warning-banner glyph on 2026-03-18, so Group C is now free of both MUI icon imports and emoji/symbol UI markers.

### Group D: Plugin card ecosystem

Status: migration complete for tracked active plugin-card icon debt

- 0 files still on Phosphor
- 0 files still contain tracked emoji/symbol UI markers

Reason:

- custom plugin cards still embed family-specific visual language from the earlier icon stack

Approved target:

- Carbon control icons
- MAP-owned category icons where domain identity matters

Representative files:

- `web/src/app/components/PluginCards/Base/PluginCardShell.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`
- `web/src/app/components/PluginCards/Custom/LV2/WhammyCard.tsx`

Latest note:

- The tracked active plugin-card Phosphor and emoji/symbol holdouts were cleared by the 2026-03-18 migration waves; remaining icon debt now lives outside this group.

### Group E: Cluster and Host Machine operational dashboards

Status: temporary holdout for MUI-only tail outside cleared glyph debt

- Cluster Dashboard: 0 Phosphor files, 0 tracked emoji-bearing files
- Host Machine: 0 Phosphor files, 0 tracked emoji-bearing files, 2 MUI files

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

Status: migration complete for tracked active pages

Representative pages:

- `web/src/app/pages/LV2PluginsPage.tsx`
- `web/src/app/pages/MeteringPage.tsx`
- `web/src/app/pages/HostMachinePage.tsx`
- `web/src/app/pages/MidiHubPage.tsx`
- `web/src/app/pages/MPX1Page.tsx`

Reason:

- these pages have not yet been route-by-route normalized after the canonical shell/home/about/grid surfaces

Latest note:

- Active frontend page-level Phosphor holdouts were cleared on 2026-03-18 alongside the emoji/symbol UI-icon sweep; the remaining exception scope is now legacy MUI package debt concentrated in `web/src/map2/**`.

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
