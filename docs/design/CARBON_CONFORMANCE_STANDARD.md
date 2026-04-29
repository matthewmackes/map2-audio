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

## 10. Operator State Discipline (T2474 Visual System Sweep)

Status: Added 2026-04-29 under T2474. Locked Q&A: Q1=A strict Carbon discipline, Q3=A maximum @carbon/react alignment, Q4=D+E expanded multi-palette + formal discipline contract, Q8=C full MAP-concept design pass, Q9=C Carbon SCSS primary, Q10=C full call-site migration.

The T2474 sweep ran across 13 atomic bundles (B0–B12) and established the canonical operator-state token vocabulary, the canonical primitives library, and the Carbon-disciplined visual rules that override any conflicting older guidance.

### 10.1. Retired decoration patterns

The following are removed from MAP2 product UI and must not be reintroduced:

1. **Glassmorphism.** No `backdrop-filter: blur(...)` outside an explicit `none` reset against MUI defaults. Codebase-wide audit at B10 confirmed zero live blur consumers; all four prior locations (HomePage operations table-shell, MidiHubHealthDrawer, three SnapshotEditorPage surfaces) now render as flat Carbon Layers.
2. **Decorative gradients.** No radial-gradient or multi-stop linear-gradient on operator chrome. Exempt: deliberate hardware-skin reproductions (MPX1Panel, IntelFXPanel, IntelFXSignalPathCanvas, MPX1SignalPathCanvas, MaschineLcdSimulatorPanel, MaschineLedPreviewPanel) — these are *device graphics* representing physical gear, not UI chrome.
3. **Drop shadows / glow halos.** No `box-shadow` for hover lift, selection halo, glow ring, or atmospheric depth. Selection states use border-color or 8% accent-tint backgrounds. Exempt: focus rings via Carbon's standard `outline: 2px solid var(--cds-focus)`.
4. **Pseudo-3D skeuomorphism.** No asymmetric light-top + dark-bottom borders simulating raised panels. No inset highlights simulating LED edges. Carbon Layer + flat `--cds-border-subtle` borders only.
5. **Fake hardware skeuomorphism.** UI chrome must not pretend to be hardware. Distinct from rule 2's exemption: rendering a faithful Lexicon MPX-1 face-plate is allowed; making a device-list tile *look like* an LCD panel is not.
6. **Decorative blueprint grids.** Background dot/line patterns simulating engineering blueprint paper (originally on `.app-shell::before` and `.wh-hero__grid`) are retired. Operators read content, not chrome texture.
7. **Cyan/amber/red "active/armed/live" accent palette.** The original `--map2-accent-active/armed/live` system is shimmed to flat Carbon-disciplined replacements (B1) — accent-active → `--cds-focus`, accent-armed → `--cds-support-warning`, accent-live → `--cds-support-error`. New code consumes the MAP semantic tokens (10.2) instead of the accent palette.

### 10.2. MAP semantic token vocabulary

Defined in `web/src/app/styles/scss/_tokens.scss` as Sass variables and emitted as CSS custom properties at `:root` by `web/src/app/styles/scss/_semantic-tokens.scss`. Light-shell variants under `[data-carbon-theme=g10/white]`. Every token is a Carbon palette shade — never a custom hex.

| Token group | Members | Use |
|---|---|---|
| `--map2-state-*` | live, staged, uncommitted, committed | Live vs queued vs operator-edited vs settled config |
| `--map2-health-*` | ok, caution, critical, offline | Node/device health bands |
| `--map2-latency-*` | good, caution, critical | Audio latency bands (≤5 / ≤12 / >12 ms per CLAUDE.md targets) |
| `--map2-clock-*` | master, slave, locked, unlocked | Clock domain status |
| `--map2-avb-*` | locked, unlocked, grandmaster | AVB stream status |
| `--map2-flow-*` | input, output, blocked, sidechain | Signal-flow edge classes |
| `--map2-alert-*` | blocking, advisory | Alert severity (blocks activation vs operator-correctable) |

New code MUST consume these tokens for the operator concepts they cover, instead of routing through generic Carbon support tokens. The blocking-vs-advisory split (`--map2-alert-blocking` / `--map2-alert-advisory`) is the canonical alert vocabulary — operators must know at a glance whether an alert prevents work or merely informs.

### 10.3. Theme discipline contract

`validateThemeContract(theme)` in `web/src/app/theme/themeFactory.ts` enforces four rules on every generated or saved theme. Returns structured violations; non-throwing.

1. **Required keys** — every key in `ThemeColors` is present and non-empty.
2. **Contrast** — `text-primary` on `bg` meets WCAG AA (≥ 4.5:1 for normal text), when both values are concrete hex. CSS-variable-forwarding themes (e.g., `var(--cds-background)`) are exempt — Carbon already guarantees AA pairings at runtime.
3. **Gray-dominance** — `bg`, `surface`, `surface-2`, `surface-3` saturation < 12%. Prevents themes from tinting surfaces with the brand color.
4. **Glow-bound** — `widgets['glow-intensity'] === '0'` and `widgets['widget-shadow'] === '0'`. Carbon discipline forbids decorative glow at the theme level.

Theme-management surfaces (custom theme dialog, palette mappers) must call `validateThemeContract` before save. A theme with violations may not be persisted as a default.

### 10.4. Canonical primitives library

`web/src/app/components/primitives/` is the canonical source for shared UI primitives. Single import path:

```ts
import { StatusChip, AlertPanel, CommitPrompt, LatencyChip } from '@/app/components/primitives'
```

21 primitives + 4 re-exports of pre-existing primitives. Highlights:

- **StatusChip** — canonical status pill, 10 tones (live/staged/uncommitted/committed/ok/caution/critical/offline/info/neutral). Replaces the scattered NodeNavChip-derived, `.rtm__live-focus-chip`, ad-hoc `support-*` Tag implementations.
- **LatencyChip / ClockSyncChip / AvbStatusChip** — specialized StatusChip wrappers that encode MAP-specific band logic.
- **PageHeader / SectionHeader / SystemStatusBar** — operator-page layout primitives.
- **MetricCard / HealthMetric** — token-driven readouts; HealthMetric replaces the inline-style StatCard pattern.
- **ControlPanel / RoutingPanel / ModuleCard / SignalChainBlock / DeviceNodeCard** — bordered, surface-elevated grouping primitives.
- **ActionButton / DangerButton** — Carbon Button wrappers with explicit intent semantics (primary/secondary/ghost; danger with confirm hook).
- **AlertPanel** — canonical blocking-vs-advisory alert with explicit severity contract.
- **CommitPrompt / StagedChangesIndicator / LiveStagedToggle** — uncommitted-changes affordances.
- **ErrorState / DrawerPanel** — sibling of EmptyState/LoadingState, plus the side-panel pattern Carbon doesn't ship.

New code SHOULD prefer these primitives over re-rolling equivalents. Existing call sites of pre-canonical components (Carbon `Tag` for status, hand-rolled tearsheets, inline-style StatCards) keep working unchanged but should migrate at the next significant edit.

### 10.5. Hardware-skin exception

Q1=A's "no fake hardware skeuomorphism" applies to **UI chrome that pretends to be hardware** (e.g., the ManagementWorkspace pseudo-3D panels retired in B8, NodeNavChip's LED-edge inset highlights retired in B9). It does **not** apply to deliberate visual reproductions of physical gear:

- `web/src/app/components/Devices/MPX1/MPX1Panel.css` and the MPX1 signal-path / mega-menu / block-editor / mod-matrix / scene-panel / librarian / page-shell CSS render the Lexicon MPX-1 hardware face-plate.
- `web/src/app/components/Devices/IntelFX/IntelFXPanel.css` and the IntelFX signal-path / page-shell / scene-panel / librarian / midi-mapper CSS render the IntelFX hardware.
- `web/src/app/components/Maschine/MaschineLcdSimulatorPanel.tsx` paints the device's LCD; `MaschineLedPreviewPanel.tsx` simulates LED physics.
- `web/src/app/components/Devices/Tesira/components/TesiraCarbonChrome.css` is a Carbon-flat reset against MUI defaults — already disciplined.

These are *device graphics*, not UI decoration. Operators want to see their hardware represented faithfully. Future device-pack additions follow the same exception.

### 10.6. Deferred follow-ups

The following surfaced during T2474 but were not folded into the sweep:

1. **MUI removal (T2475, paused)** — 21 files actively use `@mui/material` (concentrated in AvbRouting/ subdirs, MidiCluster/, MIDICommanderSetup, EdirolUA1000View, MOTURMEPage). Reclassified Small → Large during B7. Requires its own clarification round.
2. **Plugin-card consolidation (T2476, paused)** — collapse `PluginCards/{Base,Custom,Layouts,Visualizations,...}` into a unified schema-driven primitive. MPX1/IntelFX CSS migration interlocks with this.
3. **Graph-rendering consolidation (T2477, paused)** — unify ReactFlow + custom canvas + custom builder into one signal-flow primitive.
4. **Tag → StatusChip global migration** — workspace-side Tag call sites that flow through centralized helpers (AudioEnginePage `engineStatusTag`/`nodeStateTag`, ClusterDashboardWorkspace `getNodeStatusTagType`/`platformHealthTagType`) were not migrated during B6/B7/B8/B9. Migrating helper return types touches every consumer for no visible change in Carbon-flat mode. Reserved as a future global migration decision.
5. **Retired-token shim cleanup** — the back-compat aliases for `--map2-accent-*`, `--map2-ring-*`, `--map2-material-*`, `.map2-electroluminescent`, and the `--space-*` legacy spacing scale resolve to flat Carbon-disciplined replacements but are still referenced by ~9 consumer files (~85 references). The shim is doing its job; consumer migration is a deferred cleanup.

### 10.7. Bundle audit trail

T2474 progress and per-bundle completion notes live in `docs/PROJECT_WORKLIST.md` under the "Carbon Discipline Visual System Sweep" epic. Each bundle (B0–B12) records files touched, deferrals, and verification outcomes. Visual verification was waived per Q6=E for the sweep itself; T2479 (paused) extends `npm run visual:home-smoke` / `visual:workspace-smoke` with screenshot baselines to catch future drift automatically.
