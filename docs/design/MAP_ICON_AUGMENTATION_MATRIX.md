# MAP Icon Augmentation Matrix

Date: 2026-03-15
Owner: Codex
Related worklist items: `T137`, `T137-subD`

## Policy

Carbon remains the default UI icon system. Extra iconography is allowed only where it improves recognition without replacing labels, status text, or accessibility semantics.

## Allowed/prohibited matrix

| Surface | Allowed icon type | Allowed intensity | Prohibited pattern | Current examples |
| --- | --- | --- | --- | --- |
| Top navigation | Carbon or MAP-owned route icon | One icon per item, persistent text label | icon-only nav items | `advancedMenuItems.ts` |
| Home route cards | MAP-owned route icon, optional Carbon support icon | Header or badge-level | decorative icon clutter on every metadata row | `HomePage.tsx` |
| Page headers | Carbon default, MAP-owned if route identity matters | One leading icon | multiple decorative icons competing with title | `/about`, `/juce-grid` |
| Section headers | Carbon semantic icon | Low | replacing text heading with icon-only blocks | `/about`, footer |
| Dense editors | Carbon action/status only | Minimal | pictograms or decorative app icons inside control clusters | `JuceGridPage.tsx` |
| Plugin taxonomy | MAP-owned family/domain icons | Moderate | mixed third-party icon libraries per card | `grid/shared.tsx`, `PluginCards/types.ts` |
| Cards and empty states | Carbon or MAP-owned depending on domain | Moderate | emoji-only callouts | guide/document library surfaces |
| Tables and inspector rows | Carbon status/action icons | Minimal | icon-only meaning with no text state | AVB/Tesira/host tables |
| Status badges | Carbon status icons plus label text | Minimal | color-only or emoji-only severity | cluster/host surfaces |
| Docs/marketing moments | Carbon pictograms or one MAP-owned app icon | Moderate | using pictograms as controls | about/footer/landing support moments |
| Legal/compliance text | Usually none; Carbon only if necessary | Very low | decorative icons replacing legal section labels | `/about` legal panel |

## Compact-surface rule

For any surface with dense operational controls:

- labels stay primary
- icons are secondary cues
- icon-only controls are allowed only where the action is already standard and obvious

This rule especially applies to:

- `JUCE-GRID`
- AVB routing
- Tesira device controls
- legacy `web/src/map2/**` editors

## Text-first rule

Prefer text or status tags instead of extra iconography for:

- legal/compliance notices
- dense settings tables
- form field groups
- inline explanations and educational copy
- multi-step operator instructions

## Approved augmentation zones

- route identity in navigation and landing cards
- plugin-family taxonomy
- hero/support blocks on `/about` and home
- footer acknowledgements
- empty states and document/library affordances

## Disallowed augmentation zones

- replacing vendor names with lookalike symbols
- mixing Carbon pictograms into dense button rows
- emoji status decoration in operational dashboards
- competing icon systems inside the same panel

## Implementation consequence

When upgrading a holdout surface:

1. Replace action/status icons with Carbon first.
2. Add a MAP-owned icon only if the surface needs domain identity.
3. Remove emoji if text or Carbon status icons can carry the meaning cleanly.
