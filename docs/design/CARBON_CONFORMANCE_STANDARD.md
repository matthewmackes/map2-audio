# MAP2 Carbon Conformance Standard

Status: Active
Effective date: 2026-03-11
Canonical task: T114-subA
Scope: All UI changes under `web/` and any backend contract changes that alter UI rendering

## 1. Policy Statement

This document defines the default design language for MAP2.

For all new features and design changes, IBM Carbon and IBM Design Language are the authoritative standard. Existing product code may be retained only when it does not conflict with this standard.

If this standard conflicts with any older guidance, this standard wins.

## 2. Source-of-Truth Priority (Highest to Lowest)

1. Carbon React implementation and Carbon Storybook/docs (`@carbon/react`)
2. Carbon foundations: themes, tokens, typography, spacing, 2x grid, icons, accessibility
3. IBM Design Language foundations and approved IBM brand assets
4. Existing MAP2 product code only when it does not conflict with items 1-3

## 3. Hard Rules (Mandatory)

1. Prefer `@carbon/react` components before introducing or retaining bespoke controls.
2. If deprecated Carbon packages are found, migrate to `@carbon/react`.
3. Use IBM Plex typography with Carbon type tokens.
4. Default to productive type styles for product UI.
5. Use expressive type styles only for editorial/marketing surfaces with explicit justification.
6. Replace hard-coded color, spacing, typography, and icon sizing values with Carbon themes/tokens whenever possible.
7. Use Carbon theming and layering; do not create a parallel palette.
8. Align layouts to the Carbon 2x grid using an 8px base unit and favor 16-column page structures.
9. Use Carbon/IBM icons consistently.
10. Hide decorative icons from assistive technology.
11. Provide accessible labeling for meaningful icons.
12. Replace custom interaction patterns with Carbon patterns for dialogs, empty states, filtering, forms, global header, loading, notifications, search, and common flows.
13. UI copy must be sentence case, plain language, and explicit action wording.
14. Meet Carbon/IBM accessibility requirements for semantics, keyboard support, focus behavior, contrast, and accessible names.
15. For AI functionality, apply Carbon for AI conventions and use the AI label where appropriate.
16. Do not add IBM logos, IBM app icons, or restricted IBM brand marks unless authorized assets already exist in-repo and usage is appropriate.
17. Never redraw, alter, or synthesize restricted IBM brand marks.

## 4. Implementation Workflow

1. Inventory routes, templates, shared components, icon sets, charts, tables, forms, navigation, and brand assets.
2. Detect deprecated Carbon packages, non-Carbon component libraries, custom CSS systems, hard-coded design values, and inconsistent iconography.
3. Map each page to the nearest Carbon pattern/template and define component replacements.
4. Build a conformance matrix with issue, severity, Carbon replacement, token/theme changes, accessibility impact, files to change, and migration risk.
5. Refactor shared primitives first: app shell/navigation, typography, buttons/links, form inputs, tables, dialogs, notifications, spacing/layout, icon usage.
6. Refactor route-level pages after shared primitives are aligned.
7. Preserve business logic, API behavior, analytics hooks, and tests unless conformance or accessibility requires changes.
8. Validate responsiveness, keyboard flow, semantics, and visual consistency after each wave.
9. Record all unresolved exceptions with rationale and tracked follow-up.

## 5. Required Deliverables for the Program

The T114 program must produce all of the following:

1. Executive summary
2. Route inventory
3. Shared component inventory
4. Conformance findings by severity
5. Refactor plan
6. Patch set grouped by file
7. Accessibility findings
8. Exceptions and rationale

## 6. Contribution and Review Gate

All UI pull requests and AI-generated UI changes must pass:

- `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`

Required PR evidence:

1. Checklist completed with explicit pass/fail per item.
2. List of replaced/retained components with rationale for retained non-Carbon components.
3. Accessibility verification notes (keyboard, focus, semantics, contrast).
4. Screenshots or visual notes for impacted surfaces (desktop + mobile where applicable).

## 7. Signal Canvas Primitives

Snapshot Editor, MPX1, IntelFX, and future chain-graph surfaces should use the shared Signal Canvas vocabulary when rendering schematic audio flow.

Required primitive contracts:

1. LCD meters use a seven-segment style, Carbon text/support tokens, and explicit stale/clip states. Stale meters render amber placeholder text; clip states escalate to support-error styling and remain keyboard/click clearable when a clear action exists.
2. LED pips are decorative unless they expose state that is not otherwise named. Decorative LEDs must be hidden from assistive technology; meaningful LEDs need an accessible name or adjacent text.
3. Trace SVGs use right-angle paths, `--cds-*` token-derived stroke colors, no blurred backdrops, and deterministic dash values so light and dark themes behave consistently.
4. Flow animation variants live in `web/src/app/components/shared/signalFlowAnimations.css` and are selected by `data-flow`. Supported values are `cascade`, `dashmarch`, `pulse`, `packet`, `morse`, `reverse`, `scan`, `shimmer`, `heartbeat`, `ants`, `slow`, and `off`.
5. Grid visibility and node shape are data-driven. `data-grid-backdrop="false"` removes grid lines at both canvas and chain-grid levels; `data-node-shape` supports `square`, `rounded`, and `hex`.
6. Plugin nodes use Carbon focus rings, tokenized color, 40px stable node height, and no drag-only affordances. Bypass state must be visible without relying on color alone.
7. Signal Canvas components may use schematic CSS primitives, but command controls, modals, toggles, dropdowns, tags, notifications, and form inputs must remain Carbon components unless this document records an exception.

## 8. Unified Channel Grid (Snapshot Editor)

Status: Added 2026-04-20 under T710. Location: `web/src/app/components/SnapshotEditor/UnifiedChannelGrid/`.

The Unified Channel Grid (UCG) is the canonical Snapshot Editor signal-flow surface. It replaces the earlier chain-row primitives (`ChainRow`, `ChainTab`, `ChainHead`, `ChainSide`, `SignalGrid`, `Node`, `Terminal`, `Joiner`, `Meter`, `tracePath`) with a single 8-slot channel grid that composes Carbon components and schematic CSS primitives.

### 8.1. Composition

- `UnifiedChannelGrid` is the top-level grid; it renders an ordered list of `ChannelRow`s with an optional `WireOverlay`.
- `ChannelRow` composes `ChannelHeader` + 8 `Block` / `EmptySlot` cells in a flex row.
- `ChannelHeader` is the chain identity/status column (name, I/O label, meter, mute/solo controls).
- `Block` is the active plugin cell; `EmptySlot` is the click-to-add placeholder.
- `BlockPicker` is the Carbon modal used to pick a plugin into an empty slot.

### 8.2. Theme variant (`theme-blueprint`)

- UCG reads the active Carbon theme (`white`, `g10`, `g90`, `g100`) via the standard `@carbon/react` ThemeProvider.
- A named preset `theme-blueprint` (registered in `web/src/app/theme/themeBlueprint.css`) layers schematic blueprint hues on top of Carbon tokens for operator-facing live views; it is a preset, not a replacement theme.
- Do not hard-code blueprint colors — they must come from `--cds-*` and `--map2-blueprint-*` CSS variables.

### 8.3. Category hue system

- Categories are enumerated in `categoryHues.ts` and mapped to Carbon support tokens in `gridConstants.ts::CATEGORY_COLOR_TOKENS`.
- The category strip is applied as a left border on `Block` via `borderLeft: ${stripWidth}px solid ${stripColor}`.
- Category tokens: Amplifier, Cabinet, EQ, Dynamics, Modulation, Delay, Reverb, Distortion, Utility, Instrument, Drums, Pitch, Multi-Effect, Effects, AVB.
- Bypass state must remain readable at 0.5 opacity; bypass is also surfaced via `data-bypass="true"` on the Block button so assistive tech and CSS can both react.

### 8.4. FX icon registry

- Icon registry: `web/src/app/components/FxIcons/fxIconRegistry.ts` enumerates 39 canonical effect icons.
- `FxIcon` is the sole component used to render effect-kind iconography inside the grid.
- Blocks choose icon via `CATEGORY_ICON` (preferred) or fall back to `KIND_ICON` (plugin/nam/cabinet-ir/reverb-ir/eq/dynamics/utility).
- Decorative icon usage must still respect Carbon Hard Rules 10-11 (AT-hidden unless the icon is the only carrier of meaning).

### 8.5. Meter + live status

- `useChainMeter(chainId)` wraps `useVuMeters` and returns a `ChainMeterReading` (`{ left, right, isLive, clipped }`).
- dB→linear mapping: `-60 dB → 0`, `0 dB → 1`. Clip threshold: peak-hold ≥ −0.1 dBFS.
- `ChannelHeader` renders two stacked VU tracks with inline `inlineSize: ${pct}%`, a pulsing live dot when `isLive`, and a Carbon `<Tag type="red" size="sm">CLIP</Tag>` when `clipped`.
- `data-live` and `data-clipped` on `.ucg-channel-header` allow CSS to escalate visuals without JS re-renders.

### 8.6. Adapter contract

- `chainToUnifiedRow(chain, pluginMeta, options)` is the sole adapter from snapshot `Chain` → `UnifiedChannelRow`.
- Plugins are placed into slots by `plugin.position`, clamped to `SLOT_COUNT - 1`. Duplicate positions keep the first occupant.
- NAM URIs (`/nam/`, `*nam$`) map to `kind: 'nam'` regardless of category.
- System-block badges (from `getSystemBlockBadgeLabel`) are prefixed to the slot label.

### 8.7. Keyboard + interaction

- `useGridKeyboard` owns arrow-key navigation (Up/Down moves across rows; Left/Right moves within a row), Enter/Space selects, Delete/Backspace removes, Ctrl+Arrow reorders.
- `useRefuseWhenFull` + `isRowFull` block add attempts when all 8 slots are occupied.
- Click-to-add fires `onAddPlugin(slotIndex)` on empty slots; click-to-select fires `onPluginSelect(uri, slotIndex)` on blocks.
- `aria-pressed` on `Block` reflects the selected state so the grid is a proper toggle group.

### 8.8. Rules

1. New signal-flow views for the Snapshot Editor must compose `UnifiedChannelGrid` — do not resurrect the deleted `SignalCanvas/` primitives.
2. Meter wiring must use `useChainMeter`. Direct consumption of `useVuMeters` inside a channel row is a regression.
3. New categories must be added to `categoryHues.ts`, `CATEGORY_COLOR_TOKENS`, and `CATEGORY_ICON` together — partial additions cause silent gray blocks.
4. The grid must remain deterministic at 8 slots per row. Features that need more slots must be filed as a new epic with a backend schema change, not as a UI-only expansion.
5. Operator-facing blueprint theming is a named preset, not a theme override; the base Carbon theme must always remain selectable.

## 9. Exceptions Process

If a change cannot conform immediately:

1. Document the exception in the current task completion notes.
2. State business reason, user impact, and migration risk.
3. Add a follow-up worklist item with dependency links.
4. Include target milestone/date for closure.

No silent exceptions are allowed.
