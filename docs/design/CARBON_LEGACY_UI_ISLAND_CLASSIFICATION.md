# Carbon Legacy UI Island Classification

Date: 2026-03-12 20:27 EDT  
Canonical task: T114-subL

## Inventory snapshot

- `web/src/map2/components/**`: 66 files
- `web/src/pipedal/**`: 229 files
- Direct app/runtime imports from `map2/components`: 6 call sites
- Direct app/runtime imports from `pipedal`: routed through PluginChooser type/icon utilities

## Retain / freeze / migrate decisions

| Surface | Decision | Rationale | Action in this wave |
| --- | --- | --- | --- |
| `web/src/map2/api/**`, `web/src/map2/hooks/**`, `web/src/map2/types/**` | Retain | Non-visual data/access layers are stable and not a Carbon concern. | Keep as-is; no UI token debt introduced. |
| `web/src/map2/components/NumberInput.tsx` | Retain + migrate later | Active in core pages (`MIDIPage`, `EdirolUA1000Page`, `MIDICommanderSetup`), but replacement impacts multiple flows and needs a dedicated regression pass. | Isolated as an active legacy dependency; queued for dedicated Carbon control migration follow-up. |
| `web/src/map2/components/MIDI/MidiLearnButton.tsx` | Retain + migrate later | Active in `JuceGridPage`; currently custom/styled control. | Isolated as an active legacy dependency; queued for dedicated Carbon button/icon follow-up. |
| `web/src/map2/components/Audio/AudioConfigDialog.tsx` | Freeze pending legacy-map2 cleanup | No longer reachable through active app routes after GridFlow retirement; still present in `web/src/map2/components/ChainBuilder.tsx`. | Do not re-expose in the app shell without a dedicated Carbon dialog migration plan. |
| `web/src/map2/components/AudioInterfaceControl.tsx` | Retain + migrate later | Active in `HoToneJoGGPage`; large custom UI and behavior surface. | Deferred to focused route bundle with test expansion. |
| Remaining `web/src/map2/components/**` not imported by app routes | Freeze | Not in active route paths for the Carbon wave and high migration blast radius. | Freeze path documented; do not expand usage without Carbon wrapper/plan. |
| `web/src/pipedal/Lv2Plugin.ts` type exports | Retain | Shared plugin taxonomy used by unified PluginChooser. | Keep type-only usage. |
| `web/src/pipedal/PluginIcon.tsx` visual primitive | Retain + wrapped | Still needed for plugin taxonomy/icon mapping while Carbon icon migration is phased. | Wrapped behind a Carbon layer adapter (`LegacyPluginIcon`) and removed direct imports from UI surfaces. |
| Remaining `web/src/pipedal/**` | Freeze | Legacy stack with high coupling and minimal active UI touch points in this wave. | Freeze path documented; no new direct app imports allowed. |

## Wrapper migrations completed in this task

- Added Carbon wrapper adapter for retained `pipedal` icon surface:
  - `web/src/shared/components/PluginChooser/components/LegacyPluginIcon.tsx`
  - `web/src/shared/components/PluginChooser/components/LegacyPluginIcon.css`
- Replaced direct `pipedal/PluginIcon` imports in active PluginChooser UI:
  - `web/src/shared/components/PluginChooser/components/PluginCard.tsx`
  - `web/src/shared/components/PluginChooser/components/CategorySidebar.tsx`
  - `web/src/shared/components/PluginChooser/components/PluginPreviewPanel.tsx`

## Freeze-path guardrails

- No new direct imports from `web/src/pipedal/**` into `web/src/app/**` are allowed.
- No new direct imports from non-retained `web/src/map2/components/**` into `web/src/app/**` are allowed.
- Any future unfreeze must include:
  - Carbon replacement/wrapper decision,
  - focused validation evidence,
  - canonical worklist task link.
