# MAP Iconography Rules

Date: 2026-03-14
Owner: Codex
Related worklist items: `T137`, `T137-subA`

## Primary sources

- Carbon icons usage: https://carbondesignsystem.com/elements/icons/usage/
- Carbon pictograms overview: https://carbondesignsystem.com/elements/pictograms/overview/
- IBM app icons overview: https://www.ibm.com/design/language/ibm-plex/app-icons/overview/
- IBM app icon packages: https://www.ibm.com/design/language/ibm-plex/app-icons/packages/

## MAP rule set

### 1. UI icons

Use Carbon UI icons for operational interface semantics:

- navigation items
- toolbars
- inline actions
- status affordances
- empty-state support icons
- section headers where a semantic cue genuinely helps scan speed

Rules:

- Prefer Carbon icons before creating a MAP-owned substitute.
- Use Carbon-standard sizes for UI usage: compact controls should stay in the standard UI-icon range rather than inventing custom proportions.
- Functional icons must keep an accessible name through adjacent text or explicit `aria-label`.
- Icon-only actions are allowed only where Carbon behavior already supports them and the action is unmistakable from context.
- Dense operational surfaces must keep text labels when the icon alone would be ambiguous.

### 2. Pictograms

Use Carbon pictograms only for expressive, low-density moments:

- landing-page hero/support moments
- onboarding callouts
- empty states
- documentation or marketing-style sections

Rules:

- Do not use pictograms as replacements for buttons, tabs, toggles, or dense tool controls.
- Do not mix pictograms and UI icons as if they were interchangeable sizes of the same system.

### 3. MAP-owned app or product icons

MAP may create its own platform, workflow, device-family, plugin-family, and library icons when Carbon lacks a suitable semantic match.

Rules:

- Follow IBM construction discipline where useful, but do not copy IBM product/app artwork.
- Treat IBM app icon packages as IBM-owned assets, not a reusable icon library for MAP.
- New MAP-owned icons must have clear ownership, source files, and naming tied to MAP domains rather than borrowed vendor branding.
- Use MAP-owned icons for platform/workflow identity, not for routine UI verbs that Carbon already covers.

### 4. Vendor and brand restrictions

Release-safe default policy:

- Do not ship direct IBM app icons for MAP product identity.
- Do not ship vendor lookalikes or mirrored brand stand-ins until `T137-subF` explicitly approves a safe rule.
- If no safe vendor-inspired treatment is approved, fall back to neutral MAP-owned domain icons plus text labels and `Inspired By` text only where legal review says it is acceptable.

### 5. Text and accessibility rules

- Do not replace persistent navigation labels with decorative icon-only treatments.
- Tables, forms, and dense controls should use icons as secondary cues, not as the sole carrier of meaning.
- Status meaning must remain readable without color alone.
- Decorative icons and purely atmospheric graphics should be hidden from assistive technology.

### 6. MAP surface policy

Allowed icon emphasis:

- navigation
- cards
- page headers
- inline action rows
- controlled empty states
- selected onboarding/hero moments

Restricted icon emphasis:

- dense editor controls where text or numeric values are primary
- legal/compliance language
- compact settings tables where labels already provide the meaning

### 7. Migration implications

- Replace mixed icon systems in place. No wrapper abstraction layer.
- Carbon UI icons should become the default operational set.
- MAP-owned icons are only for domains Carbon cannot cover well enough.
- Existing Phosphor, MUI, emoji, and custom glyph usage must be inventoried and assigned to one of: Carbon UI icon, Carbon pictogram, MAP-owned icon, or text-only fallback.

## Immediate follow-up

1. `T137-subB`: inventory all current icon systems and assign each usage to a target class.
2. `T137-subD`: define route-by-route where richer iconography is allowed versus prohibited.
3. `T137-subF`: decide whether the requested vendor-inspired replacements are actually release-safe.
