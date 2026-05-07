# Carbon Fit-and-Finish Rubric (T2481-G2)

**Status:** Authored 2026-05-04 — used by the T2481 closing audit (T2481-G2) to score every top-level route under `web/src/app/pages/` against the Carbon Deepening Pass.

**Scope:** Every page under `web/src/app/pages/`. Audio-domain control geometry (meter needles, knob arcs, fader travel, patch cords, signal-flow node shapes, piano keys, drum pad geometry, LED pixels) and hardware-skin renderings (`PluginCards/Custom/**`, `Devices/<vendor>/**`, `LV2PluginParameterEditor.tsx`, `PluginBrowser/**`, `Visualizations/**`) are explicitly out of scope per CARBON_CONFORMANCE_STANDARD §10.5.

**How to use:**

1. Walk every page in the `Pages-to-score` list below.
2. For each page, score each of the five axes 1–5 using the criteria defined under each axis.
3. Record scores in `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2481-fit-and-finish/scores.md`.
4. For every axis-page where score is < 4, file a follow-up worklist task under that page's owning Epic (Brain / MPX-1 / MIDI Hub / Snapshot Editor / Hardware Store / etc.) — never under T2481.
5. Average per-page score is informational only; the gate is "no axis on any in-scope page is < 4."

**Score interpretation:**

- **5 — Carbon-deep.** Surface looks designed, not assembled. Every primitive, token, and motion comes from `@carbon/react` / `--map2-*` / `--cds-*`. No hardcoded values. No bespoke chrome where a Carbon component exists.
- **4 — Carbon floor passes.** One or two minor token slips, no primitive regressions. Operator can't tell this is "not all Carbon" without reading source.
- **3 — Mixed.** Carbon dominates but bespoke chrome appears in 2–4 places that have Carbon equivalents. Or one missing primitive (custom modal, custom dropdown).
- **2 — Half-Carbon.** Roughly half the chrome is bespoke. Spacing/type rhythm visibly inconsistent across panels. Multiple custom primitives.
- **1 — Pre-Carbon island.** Surface predates the Carbon migration. Hand-rolled chrome, non-token spacing, ad-hoc transitions everywhere.

---

## Axis 1 — Typography

**What we check:** Every text element on the surface uses a Carbon type token (`$body-*`, `$heading-*`, `$code-*`, `$label-*`, `$helper-text-*`, `$productive-*`, `$expressive-*`, `$legal-*`) or a platform alias (`var(--font-ui)` / `var(--font-mono)`).

**Pass criteria (score 4):**
- Every numeric readout (dB, ms, sample rate, MIDI CC, hex, timecode, lat/jitter) renders Plex Mono.
- Every prose / label / heading renders Plex Sans.
- No raw `'IBM Plex Sans, ...'` / `'IBM Plex Mono, ...'` / `'monospace'` / `'Arial'` strings in JSX or CSS — `npm --prefix web run lint` confirms `map2/no-hardcoded-font-family` reports 0 errors. (Already enforced 2026-05-04.)
- Page header uses a Carbon `$heading-*` token; no hardcoded `font-size: NNpx` on the heading.

**Score 5 adds:**
- Every `font-size` declaration on the page resolves through a Carbon token (`var(--cds-{body,heading,code,label,helper}-*-font-size)`) or its platform alias. Density-only sub-Carbon sizes (8.5/9.5/10.5/11.5/13.5px) carry inline `// carbon-allow:` annotations explaining the density rationale.
- `font-weight` declarations resolve through Carbon weight tokens or are explicitly part of a Carbon component's contract.

**Common reasons a page lands at 3 or below:**
- Heading uses `font-size: 30px` directly instead of `var(--cds-productive-heading-04-font-size)` or `$expressive-heading-*`.
- Numeric readout still uses `font-family: 'monospace'` (caught by lint) — should not happen post-2026-05-04 but flag immediately if seen.
- Bespoke "monospaced" surface uses JetBrains Mono / SF Mono directly without going through `--font-mono`.

---

## Axis 2 — Spacing

**What we check:** Every `padding`, `margin`, `gap`, `inset`, `top`, `right`, `bottom`, `left` declaration uses a Carbon spacing token (`$spacing-01..13` / `--cds-spacing-*` / `--map2-spacing-*`).

**Pass criteria (score 4):**
- `npm --prefix web run lint` reports 0 errors on `map2/no-hardcoded-px-spacing` (already enforced 2026-05-04). The §10.5 hardware-skin / device-graphics carve-outs inherit the rule turn-off via the per-files override.
- Visual spacing rhythm is consistent across panels — a header / section / row triplet repeats the same gap on every panel of the page.
- Carbon `<Layer>` / `<Section>` / `<Tile>` containers handle their own padding via the Carbon contract; no overriding `padding` on the wrapper.

**Score 5 adds:**
- No Carbon component has its `padding` / `margin` overridden via inline styles. Override-via-class is OK if the override resolves through a Carbon spacing token.
- Sub-Carbon density rows (`6px 12px`, `2x6px` chips, etc.) carry inline `// carbon-allow:` annotations explaining the density rationale.
- `0 auto N` reset shapes use `0 auto var(--cds-spacing-*)` in the N slot.

**Common reasons a page lands at 3 or below:**
- Two stacked Carbon Tiles use different inline padding overrides (one says `padding: 24px`, the other says `padding: 16px 12px`).
- Multiple `gap: 8px` / `gap: 12px` / `gap: 1rem` mixed in the same row.
- A custom panel wraps Carbon content with non-token `margin-top: 18px` or `margin: 0 0 24px`.

---

## Axis 3 — Motion

**What we check:** Every `transition`, Framer Motion `transition`, and CSS animation references Carbon motion tokens (`--map2-dur-*` paired with `--map2-ease-*`).

**Pass criteria (score 4):**
- `npm --prefix web run lint` reports 0 errors on `map2/no-ad-hoc-transition` (already enforced 2026-05-03). JSX inline `style={{ transition: '...' }}` declarations are clean.
- CSS-side transitions on platform chrome resolve through `--map2-dur-*` + `--map2-ease-*`. (D1 follow-up shipped 2026-05-04 for the highest-traffic surfaces; long-tail tracked for stylelint pass.)
- `prefers-reduced-motion` is honored — every motion declaration has either a `transition: none` reduced-motion override or the surface uses `useReducedMotionSafeVariants` / `useReducedMotionSafeTransition` (T2466-3 helpers).
- Audio-domain motion (meter ballistics, gate state-LED, tuner needle, AVB grid hover) carries inline `// carbon-allow:` annotations citing the audio-domain rationale.

**Score 5 adds:**
- Every duration on the page maps cleanly to one of the six Carbon stops (fast-01/02 70/110ms, moderate-01/02 150/240ms, slow-01/02 400/700ms). No "compromise" durations between stops.
- Easing curves match Carbon's productive (controls/hovers) vs expressive (modals/page transitions/Flow Canvas reveals) split per Q8 in T2481.
- No bare CSS `animation` keyframes that aren't paired with a Carbon-token duration + easing.

**Common reasons a page lands at 3 or below:**
- A custom modal animates open with `transition: opacity 200ms ease-in-out` — should be Carbon `<Modal>` and `--map2-dur-moderate-02 var(--map2-ease-expressive-entrance)`.
- Transform on hover uses `transition: transform 0.3s` (no easing, ad-hoc duration).
- Page mounts with a CSS `@keyframes` reveal that doesn't honor `prefers-reduced-motion`.

---

## Axis 4 — Primitives

**What we check:** Every shared interaction primitive on the page comes from `@carbon/react` — buttons, form inputs, dropdowns, tabs, modals, data tables, notifications, empty states, tooltips, popovers, menus, overflow menus.

**Pass criteria (score 4):**
- No hand-rolled `<button>` / `<input>` / `<select>` / `<textarea>` / `<dialog>` / `<form>` for interactive primitives. (T2481-E phases land lint rules `no-raw-button` / `no-raw-input` / `no-raw-select` / `no-raw-dialog` per phase close — until then, this is a manual check.)
- Form validation uses Carbon's `invalidText` / `warnText` / `helperText` patterns.
- Tables use `<DataTable>` (or `<StructuredListWrapper>` for thin static tables); no hand-rolled `<table>` with sortable headers.
- Modals use `<Modal>` / `<ComposedModal>`; no hand-rolled `<dialog>` or absolute-positioned overlay div.
- Notifications use `<InlineNotification>` / `<ActionableNotification>` / `<ToastNotification>` (subject to the standing rule from `docs/CLAUDE.md` — no `<InlineNotification>` for explanatory text, only operational warnings).
- Empty states use `<EmptyState>` (or the documented Carbon empty-state pattern). Concrete operator copy + primary action; never a "Select a chain" ghost surface as the canonical present-feature state.
- Tooltips/popovers use `<Tooltip>` / `<Popover>`. NodeNavChip popover stays canonical per `docs/CLAUDE.md` Unified Pill directive.
- Dropdowns and overflow menus use `<Dropdown>` / `<OverflowMenu>` / `<ComboBox>`.

**Score 5 adds:**
- No mixing of Carbon and bespoke primitives for the same role on the same page (e.g. a Carbon `<Button>` next to a hand-rolled link-styled `<a>` that visually approximates a button).
- React Hook Form integration is wired through Carbon's `<TextInput>` / `<NumberInput>` patterns, not Carbon-styled raw `<input>` underneath.
- Hover/focus/active states inherit Carbon's contract — no `:hover` rules that override Carbon's hover background.

**Common reasons a page lands at 3 or below:**
- Custom modal with hand-rolled close-X button + backdrop click handler.
- Dropdown is a `<Menu>`-styled `<ul>` that opens on click — not a Carbon `<Dropdown>`.
- Form submits via raw `<button type="submit">`.
- Coaching / wizard / tutorial UI on the page (operator surfaces are clean — coaching is a pre-Carbon pattern).

---

## Axis 5 — Chrome

**What we check:** The page-frame chrome (page header, panel headers, tab labels, footer chrome, status bars, kicker, eyebrow text, breadcrumbs, side panels) inherits Carbon's design language consistently.

**Pass criteria (score 4):**
- Page header is a Carbon-style header row: title + status `<Tag>` + (optional) actions. No multi-sentence summary paragraphs (per `docs/CLAUDE.md` Page Design Standards).
- Panel headers use `<Layer>` + Carbon-token type. No decorative copy in panel headers — title + status Tags is sufficient.
- Tabs use `<Tabs>` / `<TabList>` / `<Tab>`. No hand-rolled tab bar.
- Status bar uses Carbon `<Tag>` components with appropriate tone (green = healthy, warm-gray = idle/inactive, red = error, yellow = warn).
- The page is a clean operator surface — no coaching / wizard / tutorial UI, no `<InlineNotification>` for explanatory text.
- Live status visible via Tags or compact readouts; polling queries use `refetchInterval` (no manual refresh buttons unless explicitly requested).

**Score 5 adds:**
- Carbon `<Header>` is the only top-of-page header used; no bespoke title row.
- Side panels (drawers, walkthroughs) use Carbon `<SidePanel>` (when stable) or follow the documented walkthrough pattern from MIDI Hub.
- Footer chrome is shipped through `AppShell.css` tokens; no per-page footer rebuild.
- Empty / loading / error states use Carbon's documented patterns; no bespoke "Select a chain" placeholder where the feature itself is the present state.

**Common reasons a page lands at 3 or below:**
- Page header is a custom flex row with a hand-rolled subtitle line — should be a Carbon `<Header>` or kicker + title + Tag row.
- Tabs are styled `<button>` rows that toggle a state value; no Carbon `<Tabs>`.
- The "Select a chain" placeholder shows up as the canonical state for an unselected feature, instead of an operator-actionable empty state.
- Multi-sentence explanatory copy at the top of a panel.

---

## Pages-to-score (T2481-G2 walk list)

Top 25 pages by traffic / surface area, in the order the audit walks them. Each page's owning Epic is in parens.

1. SnapshotEditorPage / SnapshotEditorPageContent (Brain)
2. SequencerPage / SequencerOverviewShell (Brain)
3. PerformPage (Brain)
4. MPX1Page / MPX1Panel + MPX1ScenePanel + MPX1FlowView (MPX-1)
5. IntelFXPage / IntelFXSignalPathCanvas (IntelFX)
6. MidiHubShell + every `MidiHub*Page` under `pages/midi-hub/` (MIDI Hub v2)
7. MidiAssignmentsPage (MIDI Services)
8. MaschinePage / MaschineMidiMapPage (Maschine MK1)
9. HardwareStorePage (T2459-G)
10. AudioEnginePage / EdirolUA1000View (Audio Engine)
11. AudioArtifactsPage (Audio Engine)
12. AvbServicesRoutingPage (AVB)
13. TesiraView (Tesira)
14. PlatformsOverviewTopology (Platform)
15. PlatformCapabilities (Platform)
16. CommunitySnapshotBrowser (Snapshots)
17. SnapshotPublishPage (Snapshots)
18. ApiObservatoryPage (Observability)
19. DiagnosticsPage (Observability)
20. AdoptionPage (Adoption)
21. ThemePage (Theme)
22. HomePage / WelcomeHero / PlatformGuideSections (Landing)
23. StateAuthorityPage (State Authority)
24. ExpressionPage (Expression)
25. MOTURMEPage (Hardware)

Pages outside the top-25 that ship after this rubric is authored go through the same scoring path before merge.

---

## Worked example — HomePage / WelcomeHero (auto-scored against current state)

This is the example page used to prove the rubric runs. Scores reflect repository state at commit `33b7d3d1` (2026-05-04, post-T2481-B3 burndown).

| Axis | Score | Rationale |
|---|---|---|
| Typography | 5 | Plex Sans on prose, Plex Mono on the version-tag row. Every display-tier `font-size` resolves through a token — hero (76px) and the four other display-tier headings flow through `--map2x-heading-{hero,section,display,tile}-*` (literal-but-tokened for the hero, Carbon-fallback for the section/card/display). The 28px `.map2x-repo-cell__value` and the long tail of fractional density sizes (8.5/9.5/10.5/11.5/12.5/13.5px on dense rows) carry the standing density carve-out. |
| Spacing | 5 | All `padding` / `margin` / `gap` resolve through `--cds-spacing-*`. Page-internal `--map2x-gutter` uses a single source of truth. Lint at 0 violations. |
| Motion | 5 | Every CSS transition resolves through `--map2-dur-*` + `--map2-ease-productive-standard`. `:root:has(.map2x){scroll-behavior:smooth}` carries the `prefers-reduced-motion` override. |
| Primitives | 4 | Carbon `<Button>` / `<Tag>` for the CTA row + version pills. The `.map2x-btn` link element is a styled `<a>` anchor (not a Carbon `<Link>`); acceptable for navigation links per Carbon's own pattern. No hand-rolled modals, dropdowns, or forms on this surface. |
| Chrome | 5 | Single-column hero + sectioned guide rows. No coaching/wizard/tutorial UI. No `<InlineNotification>` for explanatory text. Live version metadata reflects the running build. |

**Action:** No <4 axes; this page passes the audit gate. The Typography 4 → 5 lift was shipped under T2481-B3 slice 1 (HomePage display headings tokenized via `--map2x` scale).

---

## Audit progress (T2481-B3 burndown — 2026-05-04 sweep)

Pages already retokened during the B3 sweep cycles (rubric pages where `grep "color: '#"` and `grep "font-size: NNpx"` both report 0 on operational chrome; §10.5 hardware-skin literals retained):

**Pages (top-25 walk list):**

- **HomePage / WelcomeHero / PlatformGuideSections** (cycle 11 — slice 1) — display-tier scale tokens added; 4 hardcoded font sizes routed through `--map2x-heading-*`.
- **MOTURMEPage** (cycles 12, 13, 17 — slices 2, 3, 7) — page header + 3 panel headings + secondary/helper text + spacing + residual chrome (latency mode, audio routing flow, MOTU/RME pills) all retokened. Only device-skin palette literals (`getMeterColor` / `getLoadColor` returns, MOTU `#2563eb`, RME `#00FF9D`, `#FFAA00` warnings) remain per §10.5.
- **MaschineMidiMapPage** (cycle 14 — slice 4) — pad/button/encoder configuration row chrome retokened.
- **MeteringPage** (cycles 15, 18 — slices 5, 8) — page header + status tile colors + accordion + chevron icons retokened. Operational chrome at 0 hex literals.

**Shared chrome components (fix the page shape across all pages that use them):**

- **ApiObservatoryTabPanel** (cycle 16 — slice 6) — shared panel chrome retokened. Surface-fixes every Observatory tab in one shot.
- **SystemArchitectureFlow** (cycle 19 — slice 9) — shared topology component, 23 hex literals retokened. Renders on multiple platform-overview pages.
- **OnboardingWizard** (cycle 21 — slice 10) — 39 hex literals retokened. The first-deployment cluster setup flow.
- **UpdateProgressViewer** (cycle 22 — slice 11) — 28 hex literals retokened. The cluster-update progress dashboard.
- **PlatformCapabilities** (cycle 22 — slice 11) — 99 hex literals retokenized (largest single sweep). The capability matrix renders on PlatformsOverviewTopology + Adoption.
- **MIDICommanderSetup + ParallelRoutingPanel** (cycle 23 — slice 12) — 4 hex literals retokened.
- **ApiObservatory primitives layer** (cycle 24 — slice 13) — 5 sub-components retokened (`SearchableList`, `JsonDiffViewer`, `JsonTreeViewer`, `TimingBreakdownChart`, `CodeSnippetGenerator`). Surfaces fix every Observatory tab via the primitives layer.
- **EffectsLoopSummaryPanel + SidechainPanel + CommunitySnapshotBrowser** (cycle 25 — slice 14) — 25 hex literals → 22 retokened (3 documented panel-identity / tier-accent literals retained).
- **SnapshotArtifactsWorkspace + ChainDeployModal + AvbRouting RoutingContext** (cycle 26 — slice 15) — 7 hex literals retokened.
- **NodeGraph layout + SnapshotModalContent + GuiOptionsShowcase + ChainBuilder LatencyOverlay + MidiLearnButton** (cycle 27 — slice 16) — 17 hex literals → 15 retokened (2 category accents retained).
- **ApiObservatory.css** (cycle 28 — slice 17) — page-stylesheet retoken; 28 → 8 (purple/indigo Observatory visual identity preserved).
- **Toasts.css MIDI message-type accents** (cycle 29 — slice 18) — 7 hex literals routed to Carbon swatches (`--cds-blue-40`, `--cds-green-40`, `--cds-purple-40` — exact-match swatches, no visual change but theme-swap-aware).
- **AppShell.css + publishPerformance.css + AvbRouting CSS** (cycle 31 — slice 19) — 6 hex literals retokenized; 11 reboot-overlay identity-purple literals retained as documented platform chrome.
- **PlatformModal status-tag pills + 4 small CSS files** (cycle 32 — slice 20) — 13 hex literals → 0; the four `.ptop__tag--{green,red,yellow,blue}` pill bg/fg pairs all map to **exact** Carbon swatch tokens (`--cds-{green-80/30, red-90/40, yellow-80/20, blue-80/30}`).
- **SnapshotEditorPage.css** (cycle 33 — slice 21) — rubric page #1: 27 of 40 hex literals retokenized to Carbon swatches; 13 documented dark-tag-foreground category accents retained.
- **MaschineMidiMapPage.css + GuiOptionsShowcase.css** (cycle 34 — slice 22) — 15 hex literals → 0 (text greys + state borders + accent-color).
- **PlatformCapabilities + LV2 + OnboardingWizard JSX backgrounds** (cycle 35 — slice 23) — JSX `background:` literals routed through Carbon `--cds-layer` / `--cds-background` / `--cds-support-*` tokens.
- **UpdateProgressViewer + PerformPage + xterm theme follow-up** (cycle 36 — slice 24) — 5 hex bgs + 4 xterm theme literals now flow through `getComputedStyle(document.documentElement)` for the canvas-rendering case.
- **MOTURMEPage signal-flow connector + MIDICommanderSetup status pill** (cycle 37 — slice 25) — `#3b82f6` signal-flow info bar → `--cds-support-info`; status pill bg → `--cds-layer`.
- **SystemArchitectureFlow + EffectsLoop + OnboardingWizard backgrounds** (cycle 38 — slice 26) — 10 hex backgrounds → 0 (signal-flow connectors + tile bodies + step cards).
- **JSX `border:` hex literals across UpdateProgressViewer + PlatformCapabilities + OnboardingWizard** (cycle 39 — slice 27) — 14 hex border literals retokenized (subtle-greys → `--cds-border-subtle`, status borders → `--cds-support-{error,info,warning}`).
- **Borders + swatch backgrounds across PlatformModal + Maschine + xterm css** (cycle 41 — slice 28) — 11 hex literals retokenized; PlatformModal status dots routed to exact Carbon swatch tokens.
- **JSX `border: '2px solid #...'` sweep across Update + Onboarding + MOTURME** (cycle 42 — slice 29) — 6 sites retokenized; 1 §10.5 site (MOTU device-icon panel-blue) reverted with documenting comment.
- **Display-tier font-size sweep across StateAuthorityPage + MidiHub + walkthrough** (cycle 43 — slice 30) — 5 display-tier sizes routed through Carbon productive-heading swatches; 36px monospace readouts kept literal per density carve-out.
- **GraphDocumentInspector + NodeIdentityCard heading retokenization** (cycle 44 — slice 31) — 3 sites routed to exact Carbon swatch matches (body-02 16px, productive-heading-04 28px).
- **WelcomeHero residual display headings** (cycle 45 — slice 32) — guide-section title + repo-cell value sizes routed through `--map2x-heading-*` token family + Carbon swatches.

**Rolling totals across the B3 burndown sweep (slices 1-32, cycles 11-45):**

- **~485 hex-color literals retokenized** through Carbon `--cds-text-*` / `--cds-support-*` / `--cds-interactive` / `--cds-{blue-40/30,green-40/80/30/20,purple-40,red-90/50/40,yellow-80/30/20,blue-80/30,teal-60,gray-100/80/70/60,magenta-60/70,orange-40/70}` swatches.
- **~50 documented category-accent literals retained** (per-kind color identities like NAM yellow, VST3 purple, Maschine pink, GCP orange, Sidechain panel purple, Observatory indigo, AppShell reboot-overlay purple, SnapshotEditor publish-tag dark-foreground tones, NodeGraph cyan, GuiOptions preset purple, EffectsLoop tier purple, MOTURME MOTU panel-blue, Maschine pad/encoder LED backgrounds) where Carbon has no analogous token and the literal is part of the kind's visual identity.
- **13 hardcoded font-size declarations retokenized** to Carbon heading tokens (productive-heading-04/05/06 + body-02 + `--map2x-heading-*` family).
- **9 documented density carve-out font-sizes** (sub-Carbon stops: 36px monospace readouts, 18px drawer titles, 24px MeteringPage suffix, 26px Expression header, 22px ApiObservatory section, 13px subtitle).
- **~25 JSX inline `background:` literals retokenized** through Carbon layer / background / support tokens.
- **20 JSX inline `border:` literals retokenized** (subtle / status / interactive families across 1px-solid + 2px-solid shapes).
- **9 xterm theme literals + fontFamily** routed through `getComputedStyle()` for the canvas-rendering case.
- **CSS-side border + status-dot backgrounds** retokened on AppShell / publishPerformance / Maschine / Platform tag pills.
- **0 lint regressions** across the entire 32-slice sweep — `map2/no-mui-import`, `map2/no-ad-hoc-transition`, `map2/no-hardcoded-px-spacing`, `map2/no-hardcoded-font-family` all at `'error'`, suite reports 0 errors and 0 warnings.

**Phase B3 substantively closed.** Every operational-chrome `color:` / `background:` / `border:` / `font-size:` declaration on the **top-25 audit pages and 13+ shared chrome components** outside §10.5 carve-outs (PluginCards/Custom/**, Devices/<vendor>/**, Visualizations/**, LV2PluginParameterEditor.tsx, PluginBrowser/**, Dynamics/**, EQ/**, PluginTags/**) now routes through Carbon tokens, swatches, or the `--map2x-heading-*` token family. The closing audit (T2481-G4) walks the full 25-page list with the rubric to score each page; per-page Typography-axis scores should be ≥4 across the swept surfaces.

## Audit progress (T2481 Phase E + F — 2026-05-06 sweep)

**Phase F (domain-surface tokenization):**
- F1 (audio meters) — SHIPPED `bcdc9e0c`: ~26 chrome literals retokenized across `AudioMeter` / `VuMeterDisplay` / `DynamicsMeteringPanel` / `ClusterMeteringStrip` (clip indicators → `--cds-support-error`, peak/CPU/Xrun status colors → `--cds-support-{success,warning,error}`, label/helper text → `--cds-text-{primary,secondary,helper,disabled}`, meter bar bg → `--cds-layer`). Geometry-tier peak markers + dynamics-module category accents preserved with `// carbon-allow:`. 2 panel-identity accents documented (`#37d6c9` VuMeters teal, `#f59e0b` Dynamics amber).
- F2 (UnifiedChannelGrid), F3 (signal-flow canvases), F4 (Maschine MK1) — verified-clean (already token-routed by prior B3 work).
- F5/F6/F7 (Brain / DrumMachine / SynthForge) — cancelled (target surfaces not present in codebase).

**Phase E (primitive migration):**
- E1 canary (MidiAssignmentsPage calibration form) — code-side migration SHIPPED `5445507b`: 14 primitive swaps (1 TextInput, 1 Select, 9 NumberInput, 3 Toggle). Operator visual sign-off pending.
- E1-sweep cycle 1 (AudioInterfaceControl) — SHIPPED `23f14ca6`: 4 selects → Carbon Select+SelectItem, 7 buttons → Carbon Button. 2 range sliders held back with `// carbon-allow:` (Carbon Slider's labelText collides with existing test contract).
- E1-sweep cycle 2 (OnboardingWizard) — SHIPPED `cb7bc9c5`: 2 TextInput, 1 Select, 2 Checkbox; 2 radios held back with `// carbon-allow:` (clickable-card pattern).
- E4 (TesiraOfflineBanner) — SHIPPED `8f3240fa`: hand-rolled banner → Carbon `<ActionableNotification kind="warning">`. AudioDeviceDisconnectedBanner already canonical (T2453); PublishReadyBanner is two-action shape kept as canonical pattern.
- E6 (NodeNavChip popover) — verified-clean: NodeNavBar uses Carbon `<Popover>` + `<PopoverContent>`; NodeNavChip uses `<Tooltip>`.
- E7 (LauncherPanel user menu) — verified-clean: already uses Carbon `<OverflowMenu>` + `<OverflowMenuItem>`.

**Lint plugin gained 4 new primitive-banning rules** (`no-raw-button` / `no-raw-input` / `no-raw-select` / `no-raw-dialog`) at `'warn'`. Initial snapshot: **681/113/73/0**. Post cycle 1+2: **672/99/67/0** (net −9 button, −14 input, −6 select). Modal sweep was already complete by prior work (0 raw `<dialog>` violations).

**Bulk button burndown deferred** — most remaining `<button>` sites in the codebase are bespoke-affordance triggers (custom tablist tabs in ThemePage, color-themed action buttons with `style.background` overrides in MidiAssignmentsPage walkthrough, dense walkthrough micro-buttons, switch-style toggles). They don't fold into Carbon `<Button>` without per-site redesign that risks breaking existing visual contracts. These are tracked as natural follow-ups under their owning Epics (e.g. `T2459-H` for MIDI Assignments deeper Carbon refactor, `T2475` follow-up for ThemePage tabs → Carbon `<Tabs>`), not as T2481 mass-sweep work. The lint rules at `'warn'` keep the violations visible without blocking CI.

---

## Closing notes

- This rubric is the gate for `T2481-G4` (closing audit). The audit walks every page in the list, fills in the score table, and files follow-up tasks for every axis-page < 4.
- The lint suite (`map2/no-mui-import` + `map2/no-ad-hoc-transition` + `map2/no-hardcoded-px-spacing` + `map2/no-hardcoded-font-family`, all at `'error'` as of 2026-05-04) is what prevents future drift between audits. The audit itself catches what lint can't see — primitive usage, chrome composition, motion semantics.
- Future Carbon Epics (theme posture per Q4, iconography per Q7) ride the same rubric; add new axes there.
