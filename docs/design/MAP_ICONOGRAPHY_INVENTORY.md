# MAP Iconography Inventory

Date: 2026-03-15
Owner: Codex
Related worklist items: `T137`, `T137-subB`, `T137-subE`

## Scope

Audit scope:

- `web/src/app/**`
- `web/src/map2/**`

Audit commands used:

```bash
rg -n "@phosphor-icons/react" web/src/app web/src/map2 | cut -d: -f1 | sort -u
rg -n "@mui/icons-material" web/src/app web/src/map2 | cut -d: -f1 | sort -u
python3 audit_icon_usage.py  # local one-off script used during execution
```

## Current totals

| Family | File count | Status | Notes |
| --- | ---: | --- | --- |
| `@carbon/icons-react` | 39 | Approved | Default operational icon set |
| MAP-owned app icons | 2 source files, active across shell and taxonomy | Approved | `web/src/app/components/icons/map/*` |
| `@phosphor-icons/react` | 100 | Legacy holdout | Broadly concentrated in older app pages/components |
| `@mui/icons-material` | 64 | Legacy holdout | Mostly `web/src/map2/**`, Tesira, AVB routing |
| Emoji / symbol glyphs | 58 | Legacy holdout | Mostly status text, education panels, and legacy cards |

## Approved stack

### Carbon UI icons

Use for:

- navigation
- actions
- status affordances
- section headers
- empty-state support icons
- documentation/library affordances

Canonical live surfaces now aligned to Carbon plus MAP-owned icons:

- `web/src/app/data/advancedMenuItems.ts`
- `web/src/app/pages/HomePage.tsx`
- `web/src/app/pages/JuceGridPage.tsx`
- `web/src/app/pages/AboutPage.tsx`
- `web/src/app/pages/PlatformInfoGuideSection.tsx`
- `web/src/app/components/PlatformFooter.tsx`
- `web/src/app/grid/shared.tsx`
- `web/src/app/components/PluginCards/types.ts`
- `web/src/app/components/PluginCards/Base/sectionIcons.tsx`

### MAP-owned app and domain icons

Current source:

- `web/src/app/components/icons/map/MapAppIcons.tsx`
- `web/src/app/components/icons/map/index.ts`

Current usage classes:

- platform/workflow identity in shell navigation
- plugin-category taxonomy where Carbon verbs are too generic
- neutral device-family replacement for removed vendor marks
- footer and route-level domain identifiers

## Retired sources

These sources are no longer active in runtime code:

- `web/src/app/components/icons/fontaudio/*`
- `web/src/app/components/Tesira/BiampIcon.tsx`

The retired sources were removed because they were either third-party stylistic drift or vendor-mark-adjacent assets that no longer fit the approved Carbon/MAP stack.

## Residual legacy concentration

### Phosphor concentration

| Scope | Files | Target |
| --- | ---: | --- |
| `web/src/app/components/PluginCards/**` | 14 | Carbon verbs plus MAP domain icons |
| `web/src/app/components/ClusterDashboard/**` | 10 | Carbon status/action icons; text for education copy |
| `web/src/app/components/HostMachine/**` | 10 | Carbon system/status icons; remove emoji headings |
| `web/src/app/components/MPX1/**` | 6 | Carbon controls; MAP domain icons only where needed |
| `web/src/app/components/library/**` | 5 | Carbon document/media/download icons |
| `web/src/app/pages/**` | 18 | Carbon page-header and status icons |

Representative hot spots:

- `web/src/app/components/PluginCards/Base/PluginCardShell.tsx`
- `web/src/app/components/ClusterDashboard/ClusterOverviewTab.tsx`
- `web/src/app/components/HostMachine/HealthMonitor.tsx`
- `web/src/app/pages/LV2PluginsPage.tsx`
- `web/src/app/pages/MeteringPage.tsx`

### MUI concentration

| Scope | Files | Target |
| --- | ---: | --- |
| `web/src/map2/components/**` | 39 | Route-by-route Carbon migration or retirement of legacy map2 panels |
| `web/src/app/components/Tesira/**` | 13 | Carbon controls plus neutral MAP device icons |
| `web/src/app/components/AvbRouting/**` | 9 | Carbon controls/status icons |
| `web/src/app/components/HostMachine/**` | 2 | Carbon dialog/control icons |
| `web/src/app/hooks/useAlertNotifications.tsx` | 1 | Carbon close/status icons plus non-emoji labels |

Representative hot spots:

- `web/src/map2/components/WorkFlow.tsx`
- `web/src/map2/components/PluginBrowser.tsx`
- `web/src/app/components/Tesira/components/TesiraFirmwareTab.tsx`
- `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`

### Emoji and symbol concentration

| Scope | Files | Target |
| --- | ---: | --- |
| `web/src/app/components/PluginCards/**` | 11 | MAP or Carbon icons, or plain labels |
| `web/src/app/components/HostMachine/**` | 8 | Carbon system/status icons and explicit text |
| `web/src/app/components/ClusterDashboard/**` | 7 | Carbon status icons and tags |
| `web/src/map2/components/**` | 6 | Carbon icons and button labels |
| `web/src/app/components/AvbRouting/**` | 5 | Carbon device/status icons |

Representative hot spots:

- `web/src/app/components/ClusterDashboard/ServicesHealthTab.tsx`
- `web/src/app/components/HostMachine/PerformanceMetrics.tsx`
- `web/src/app/components/AvbRouting/components/RoutingGrid/StickyHeaders.tsx`
- `web/src/map2/components/HistoryPanel.tsx`

## Taxonomy mapping

| Domain | Approved target |
| --- | --- |
| Platform/workflow identity | MAP-owned app icons |
| Generic actions | Carbon UI icons |
| Status and health | Carbon status icons plus text |
| Documentation/library | Carbon document/book/search icons |
| Plugin families | MAP-owned audio-domain icons when Carbon lacks domain clarity |
| Vendor/device references | Neutral MAP-owned device/domain icons plus text labels |

## Replacement priority

1. Canonical surfaces first: shell, home, `/juce-grid`, `/about`, footer, plugin taxonomy.
2. Legacy MUI-heavy feature islands: `web/src/app/components/Tesira/**` and `web/src/app/components/AvbRouting/**`.
3. Legacy `web/src/map2/**` surfaces that still expose MUI and emoji drift.
4. Large Phosphor clusters: Plugin Cards, Cluster Dashboard, Host Machine, page headers.

## Conclusion

The platform now has a clear approved stack:

- Carbon for UI semantics
- MAP-owned icons for platform/domain identity
- no `fontaudio`
- no `BiampIcon`

The remaining work is not discovery anymore; it is execution against the holdout groups documented here and in `MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md`.
