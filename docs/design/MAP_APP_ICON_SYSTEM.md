# MAP App Icon System

Date: 2026-03-15
Owner: Codex
Related worklist items: `T137`, `T137-subC`

## Purpose

MAP needs a small owned icon family for platform, workflow, device-family, and plugin-family identity that Carbon cannot cover precisely enough with generic UI verbs.

Current implementation:

- `web/src/app/components/icons/map/MapAppIcons.tsx`
- `web/src/app/components/icons/map/index.ts`

## Construction rules

- Viewbox: `32 x 32`
- Default stroke: `1.8`
- Stroke color: `currentColor`
- Fill usage: only small anchor dots or emphasis points
- Geometry: simple, centered, even padding, no perspective effects
- Runtime API: standard SVG props plus optional `size` and `title`

These icons intentionally follow IBM-style discipline for restraint and geometry, but they are MAP-owned drawings rather than copied IBM app icons.

## Current icon set

| Icon | Meaning | Primary usage |
| --- | --- | --- |
| `MapSignalFlowIcon` | editable/live signal topology | `JUCE-GRID`, flow concepts, route identity |
| `MapRealtimeEngineIcon` | realtime engine runtime | `/engine`, engine identity |
| `MapClusterFabricIcon` | multi-node orchestration | cluster and multi-system routes |
| `MapRoutingMatrixIcon` | crosspoint routing | AVB routing identity |
| `MapPatchLibraryIcon` | saved chain/library state | library route and taxonomy |
| `MapStagePerformanceIcon` | performance/live operation | perform route identity |
| `MapRackDeviceIcon` | host or rack device | host machine and platform hardware |
| `MapMatrixProcessorIcon` | matrix processor / DSP appliance | Tesira-neutral device identity |
| `MapAmplifierIcon` | amp or amplifier domain | NAM and amplifier taxonomy |
| `MapCabinetIcon` | speaker cabinet domain | cabinet and IR taxonomy |
| `MapDelayIcon` | delay/time effect | plugin taxonomy |
| `MapDynamicsIcon` | compression/dynamics | plugin taxonomy |
| `MapEqualizerIcon` | EQ/tone shaping | plugin taxonomy |
| `MapModulationIcon` | modulation family | plugin taxonomy |
| `MapMultiEffectIcon` | multi-effect orchestration | plugin taxonomy |
| `MapPitchIcon` | pitch/harmony family | plugin taxonomy |
| `MapReverbIcon` | space/reverb family | plugin taxonomy |

## Placement rules

Use MAP-owned icons for:

- route identity where Carbon verbs are too generic
- plugin-family taxonomy
- neutral device-family identity replacing vendor marks
- footer/platform acknowledgements

Do not use MAP-owned icons for:

- generic buttons like save, delete, play, refresh, search
- table row affordances
- common modal controls
- dense parameter controls where Carbon already has a clear action/status icon

## Current runtime adoption

Primary live call sites:

- `web/src/app/data/advancedMenuItems.ts`
- `web/src/app/grid/shared.tsx`
- `web/src/app/components/PluginCards/types.ts`
- `web/src/app/components/PluginCards/Base/sectionIcons.tsx`
- `web/src/app/components/PlatformFooter.tsx`
- `web/src/app/pages/AboutPage.tsx`
- `web/src/app/pages/PlatformInfoGuideSection.tsx`
- `web/src/app/components/Tesira/components/TesiraDeviceHeader.tsx`
- `web/src/app/components/Tesira/components/TesiraDeviceCard.tsx`
- `web/src/app/components/Tesira/components/TesiraTopBar.tsx`
- `web/src/app/components/Tesira/components/ManualAddDialog.tsx`
- `web/src/app/components/Tesira/components/DiscoveryDialog.tsx`

## Naming and ownership rules

- Prefix with `Map`
- Name by domain meaning, not by third-party resemblance
- Keep source in the MAP repository as plain SVG React components
- Avoid importing third-party art packs or mirrored vendor lookalikes into this family

## Coverage map

| Domain | Icon family decision |
| --- | --- |
| Platform routes | MAP-owned where route identity matters |
| Plugin verbs | Carbon |
| Plugin families | MAP-owned |
| Device vendors | Neutral MAP-owned icons plus text |
| Compliance/legal/about surfaces | Carbon plus text; MAP icons only as supporting identity |

## Forward rules

- Add to this family only when Carbon lacks a precise domain semantic.
- Keep the family intentionally small and reusable.
- If a future icon cannot be explained as a platform/domain identifier, it probably belongs in Carbon instead.
