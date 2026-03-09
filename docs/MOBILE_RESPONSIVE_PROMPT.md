# MAP2 Mobile Responsive Audit & Implementation

## Your Role
You are auditing an existing web application for mobile responsiveness. You will work in two phases: audit first, then implementation. Do NOT skip ahead to implementation until Phase 1 is approved.

---

## Tech Stack & Constraints

- **UI framework**: Material-UI (MUI) v6.5.0 with Emotion (`@emotion/react`, `@emotion/styled`)
- **Icons**: Phosphor Icons (`@phosphor-icons/react`) — duotone weight throughout
- **CSS approach**: Multi-strategy — one large global `index.css` (41k lines), plus component-scoped `.css` files co-located with TSX, plus MUI `sx` prop for MUI components. **All new mobile/responsive CSS goes in a new `web/src/styles/mobile.css` file** — do NOT add to `index.css`. Import `mobile.css` from the app entry point alongside `index.css`
- **Theme system**: Custom CSS custom properties applied to `document.documentElement` via `applyTheme()` in `web/src/app/theme/`. 10 built-in themes, all dark. Properties: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--primary`, `--primary-strong`, `--accent`, `--muted`, `--muted-2`, `--border`, `--success`, `--danger`, `--warning`, `--shadow-strong`, `--shadow-soft`, `--color-scheme`. Widget tokens: `--border-radius-sm/md/lg`, `--border-width`, `--surface-gradient`, `--glow-intensity`, `--transition-speed`
- **Animations**: Framer Motion for complex transitions; CSS `@keyframes` for simpler ones
- **Data fetching**: TanStack React Query v5 for REST, custom `Map2WebSocket` class for real-time topics
- **Routing**: React Router v6 with lazy-loaded pages
- **Virtualization**: react-window for large lists
- **Charts**: Recharts, D3
- **Flow diagrams**: ReactFlow (node-based flow editor)
- **3D**: Three.js (grid-3d page)
- **Forms**: React Hook Form v7, Ariakit for accessible combobox/select
- **Build**: Vite v6.4.1, React 19, TypeScript 5.7
- **NO Tailwind** — do not introduce Tailwind or any new CSS framework
- **Viewport**: `<meta name='viewport' content='width=device-width, initial-scale=1'>`

---

## Page & Component Inventory

Review every page below. For each, the route, primary file, and UI patterns are listed.

| Route | Component File | UI Patterns |
|-------|---------------|-------------|
| `/` | `pages/HomePage.tsx` | StatCard grid, CPUStatusOverview, PlatformCapabilities, SystemArchitectureFlow, network share cards |
| `/chains` | `pages/ChainsPage.tsx` | Chain list, preset cards, drag reorder |
| `/presets` | `pages/PresetsPage.tsx` | Preset browser, community tab, import dialog |
| `/plugins` | `pages/LV2PluginsPage.tsx` | Plugin table (sortable, filterable), install/uninstall actions, detail modals |
| `/library` | `pages/LibraryPage.tsx` | InstalledAssetsTable, IR/NAM loader dialogs, upload dialog |
| `/midi` | `pages/MIDIPage.tsx` | MIDI mapping table, binding editor, curve display |
| `/grid` | `pages/GridFlowPage.tsx` | Full ReactFlow grid editor — nodes, edges, knob panels, snapshots |
| `/grid-3d` | `pages/GridFlowAdvancedPage.tsx` | Three.js 3D visualization |
| `/dsp` | `pages/DSPPage.tsx` | Audio processing metrics, charts |
| `/edirol-ua1000` | `pages/EdirolUA1000Page.tsx` | Audio interface config form |
| `/motu-rme` | `pages/MOTURMEPage.tsx` | Audio interface config form |
| `/hotone-jogg` | `pages/HoToneJoGGPage.tsx` | Audio interface config form |
| `/host-machine` | `pages/HostMachinePage.tsx` | System info cards, controls |
| `/cpu-performance` | `pages/CPUPerformancePage.tsx` | CPU profiling, metrics charts |
| `/engine` | `pages/AudioEnginePage.tsx` | JUCE engine status, controls |
| `/metering` | `pages/MeteringPage.tsx` | Real-time VU/peak meters via WebSocket |
| `/pipewire` | `pages/PipeWirePage.tsx` | Audio server status, node list |
| `/welcome` | `pages/WelcomePage.tsx` | Onboarding flow |
| `/lcd` | `pages/LCDPage.tsx` | LCD emulator display |
| `/cluster-dashboard` | `pages/ClusterDashboardPage.tsx` | Multi-node monitoring, MUI DataGrid, live events tab |
| `/drums` | `pages/DrumsPage.tsx` | Drum machine interface |
| `/multi-system` | `pages/MultiSystemDashboardPage.tsx` | Cluster management |
| `/avb-routing` | `pages/AvbRoutingPage.tsx` | AVB stream routing matrix (RoutingGrid), full-bleed layout |
| `/tesira/*` | `pages/TesiraPage.tsx` | Biamp Tesira fleet — device cards, compile controls, block diagrams |
| `/mpx1/panel` | `pages/MPX1PanelView.tsx` | Hardware panel emulation (SVG, knobs) |
| `/mpx1/editor` | `pages/MPX1EditorView.tsx` | Parameter editor with categories |
| `/mpx1/midi-map` | `pages/MPX1MidiMapView.tsx` | MIDI routing matrix/table |
| `/mpx1/matrix` | `pages/MPX1MatrixView.tsx` | Modulation matrix |
| `/mpx1/library` | `pages/MPX1LibraryView.tsx` | Preset librarian, .syx import, version history |
| `/mpx1/perform` | `pages/MPX1PerformView.tsx` | Scene recall, morph faders, setlist navigation |
| `/mpx1/diag` | `pages/MPX1DiagView.tsx` | Diagnostics tables |
| `/mpx1/flow` | `pages/MPX1FlowView.tsx` | Signal flow SVG canvas, drag-and-drop blocks, patch cords, zoom/pan |
| `/about` | `pages/AboutPage.tsx` | System info |

**Scan the `web/src/app/` directory for any routes or components not listed above and include them in the audit.**

---

## Existing Responsive Handling (what's already done)

The codebase already has:
- Hamburger menu toggle at 768px in AppShell.tsx (718 lines)
- `@media (max-width: 768px)` breakpoints scattered through index.css
- Additional breakpoints at 720px, 640px, 600px in some places
- `grid-template-columns: repeat(auto-fill, minmax(XXXpx, 1fr))` fluid grids
- `clamp()` for some spacing values
- `scroll-snap-type: x mandatory` on signal chain view
- Collapsible navigation sections in mobile menu
- Full-bleed layout class for `/avb-routing`

**NOT yet implemented:**
- Consistent mobile-first approach
- Touch gesture handlers (swipe, long-press)
- Landscape/portrait orientation handling
- LCD/hardware-display mobile aesthetic
- Full-screen meter mode
- Systematic touch target sizing (many elements < 44px)
- Font sizes go as low as 9px in navigation labels — well below usable on mobile

---

## Breakpoints and Targets

Target breakpoints: **360px** (phone), **768px** (tablet), and **1024px+** (desktop).

---

## Mobile Theme Strategy

Do NOT create a separate LCD theme or new CSS custom properties for mobile. The existing theme system in `web/src/app/theme/` already provides all the tokens needed (`--bg`, `--surface`, `--surface-2`, `--primary`, `--accent`, `--muted`, `--border`, etc.) and all 10 built-in themes are dark. Mobile views must inherit whichever theme the user has selected — the mobile layout changes, but the color palette stays the same.

The monochrome, high-contrast, hardware-display aesthetic should be achieved through **layout, typography, and information density** — not by overriding theme colors. Use the existing `--bg` for dark backgrounds, `--accent` for readouts, `--muted` for dim text. The hardware feel comes from:
- `font-family: monospace` on numeric readouts and meter values
- Sharp border-radius (2px) on mobile control surfaces
- Large, sparse layouts with generous negative space
- Segmented meter bars using `--primary` for active segments, `--surface` for inactive

---

## Golden Path — Primary Mobile Use Case

The primary mobile user is a **sound engineer standing at FOH with a phone**, needing to:
1. **Check system status at a glance** (CPU, audio engine, connection status)
2. **Recall an MPX-1 scene** (scene list → tap to recall)
3. **Verify audio levels are nominal** (meters, clip indicators)
4. **Adjust one parameter** (tap a value, edit, confirm)

Every screen in that flow must work perfectly at 360px. Everything else is secondary. Prioritize accordingly.

---

## Quality Standards

- Touch targets at least **44×44px**
- No horizontal scroll on any page at 360px
- Readable text without zooming (minimum 14px, inputs 16px)
- Collapsible sidebars instead of hidden content
- Proper spacing on small screens
- Do not rewrite components from scratch
- Do not change functionality or business logic
- Do not add new npm dependencies

---

## Rules by Category

### Navigation
On screens below 768px, collapse the main navigation into a hamburger menu or bottom tab bar. **Modify the existing AppShell.tsx responsive props** — do not create a separate `MobileNavigation.tsx`. The existing hamburger at 768px is a starting point; improve it, don't replace it.

### MPX1 Mega Menu on Mobile
The `MPX1MegaMenu` component in AppShell is a desktop dropdown with live meters (mix/level), program selector, and connection status — ~50 lines of specialized navigation logic. On mobile, this dropdown pattern breaks (too wide, tap targets too small, meters unreadable). On screens below 768px, the MPX1 mega menu should render as a **bottom sheet / drawer** that slides up from the bottom of the screen, showing the program name as a large readout, meters as horizontal bars, and prev/next buttons as full-width tap targets. Do NOT hide the MPX1 status behind the hamburger — it's the most-used control during a live show and needs to be accessible in one tap from any page.

### Data Tables
For any data tables, propose either a card-based layout, horizontal scroll container, or column-hiding strategy — pick the best fit per table. Specifically:
- `LV2PluginsPage` plugin table → card layout on mobile
- `InstalledAssetsTable` → column-hiding with expandable rows
- `ClusterDashboardPage` MUI DataGrid → horizontal scroll container
- AVB `RoutingGrid` matrix → desktop-only with landscape prompt

### CSS Approach
Prefer CSS-only responsive solutions (media queries, flexbox wrap, clamp()) over JavaScript-driven layout changes. Do not use `useMediaQuery` hooks unless CSS alone truly cannot achieve the result. All new `@media` blocks go in `web/src/styles/mobile.css` — do NOT add to the 41k-line `index.css`. Never put `@media` blocks inline in JSX `style` props.

### Auditing the Existing index.css
The global `index.css` is 41,636 lines. Do NOT attempt to read or audit the entire file. Instead, use targeted searches:
- Search for existing `@media` blocks to understand what responsive rules already exist
- Search for hardcoded `px` widths above 360px that may cause overflow
- Search for `font-size` declarations below 14px
- Search for specific class names referenced by components you're auditing
Report what you find, but do not propose restructuring `index.css` itself — that's out of scope.

### Desktop-Only Components
If a component cannot reasonably work on 360px portrait, flag it as desktop-only and show the `LandscapePrompt` overlay. These are likely desktop-only:
- `/grid` — ReactFlow grid editor
- `/grid-3d` — Three.js 3D view
- `/mpx1/flow` — SVG drag-and-drop canvas
- `/avb-routing` — routing matrix
- `/mpx1/matrix` — modulation matrix

Do not spend excessive effort trying to force complex spatial UIs into 360px — just flag and move on. ReactFlow, Three.js, and complex SVG canvas editors are architecturally incompatible with 360px portrait — they require mouse precision, multi-axis panning, and spatial awareness that touch on a small screen cannot provide. Acknowledge this and move on.

### Typography
Use fluid typography with clamp():
- Body text: `clamp(14px, 2.5vw, 16px)` minimum
- Headings: scale proportionally
- **No text smaller than 14px on any breakpoint** — the codebase currently uses 9px (nav labels with `letter-spacing: 0.16em`), 10px (small labels), and 11px (form labels) extensively. Every instance must be raised to 14px minimum on mobile. Search for `font-size` declarations in `index.css` and component CSS files to find all violations
- Inputs: minimum 16px to prevent iOS auto-zoom

### Touch Interactions
Use these gesture mappings consistently:
- Desktop hover tooltip → mobile **tap-to-reveal** (tap again or elsewhere to dismiss)
- Desktop right-click context menu → mobile **long-press** (300ms)
- Desktop drag-and-drop reorder → mobile **long-press to pick up**, drag to reorder, with visual pulse feedback
- Desktop scroll-to-zoom → mobile **pinch-to-zoom** (only on canvas views)
- Desktop double-click to edit → mobile **single tap to edit** (no hover preview available)
- ParameterKnob mouse-drag → mobile **tap-to-edit number input**: tapping a knob on mobile opens an inline numeric input field (HTML `type="number"`) pre-filled with the current value, with step/min/max matching the parameter range. The virtual keyboard appears, the user types or increments, and the value commits on blur or Enter. Do NOT attempt touch-drag knob interactions — they conflict with page scrolling and are frustrating on small screens

### Modals and Dialogs
MUI `Dialog` components should render as full-screen drawers on screens below 768px rather than centered floating boxes. All dialog actions must be reachable without scrolling past the fold. Use MUI's `fullScreen` prop conditionally based on a `useMediaQuery('(max-width: 768px)')` — this is one of the few acceptable uses of `useMediaQuery` since MUI Dialog doesn't support CSS-only fullscreen switching.

### Forms and Inputs
On mobile, inputs should use appropriate HTML input types (`tel`, `email`, `number`) to trigger the correct virtual keyboard. Group related fields vertically, never side-by-side below 768px. React Hook Form fields and Ariakit selects should all have adequate touch target size.

### Information Density on Mobile
On 360px, each page should show only the most critical 3–5 pieces of information, styled as large monospace readouts. Hide secondary details behind a "more" expansion or swipe-to-reveal panel. The mobile view should feel like glancing at a hardware meter bridge — instant read, zero clutter.

### Status Indicators
Replace multi-color status badges with monochrome glyphs and simple on/off states on mobile:
- Connected = filled dot using `var(--success)`
- Disconnected = hollow dot using `var(--muted-2)`
- Error = blinking dot using `var(--danger)` with CSS `@keyframes blink`
Think single-color LED indicators on a rack unit. On mobile, strip away colored badges and decorative icons — just dots and text.

### Meter Mode
For pages that display levels, status, or real-time data (especially `/metering`), offer a dedicated full-screen meter mode on mobile — large segmented-style bars or numeric readouts on `var(--bg)`, optimized for viewing at arm's length. This should feel like holding a dedicated hardware remote display.

**Data source**: Real-time meter data arrives via `Map2WebSocket` (in `web/src/map2/websocket.ts`) on these topics: `meters`, `cpu`, `latency`, `spectrum`, `lufs`, `phase`. The existing `AudioMeter` and `CPUStatusOverview` components already subscribe to these topics. The mobile meter mode must **reuse these same hooks and WebSocket subscriptions** — do not create new REST polling endpoints or duplicate the WebSocket subscription logic. The `useWebSocketTopic()` hook is the standard way to subscribe.

---

## Shared Responsive Utilities

Create `web/src/styles/responsive.module.css` containing reusable responsive utility classes:

```css
/* Example — expand as needed during implementation */
.mobileOnly { display: none; }
.desktopOnly { display: block; }
.mobileStack { /* stacks children vertically below 768px */ }
.mobileFullWidth { /* full width below 768px */ }
.hardwareReadout { /* large monospace numeric display for meters/values */ }
.landscapePrompt { /* desktop-only overlay */ }

@media (max-width: 768px) {
  .mobileOnly { display: block; }
  .desktopOnly { display: none; }
  .mobileStack { flex-direction: column; }
  .mobileFullWidth { width: 100%; }
}
```

Components should import and compose these rather than duplicating `@media` blocks for common patterns.

---

## LandscapePrompt Component Spec

For desktop-only components, show a `LandscapePrompt` overlay below 768px portrait:

- **Location**: `web/src/app/components/shared/LandscapePrompt.tsx`
- **Appearance**: Full-viewport overlay on `var(--bg)`
- **Content**: Inline SVG rotate-phone icon (no icon library), text "Rotate for full editor" in `monospace` at 18px, "Continue anyway" text button below
- **Behavior**: Auto-dismiss if viewport exceeds 768px width (orientation change). "Continue anyway" sets a `sessionStorage` flag so it doesn't reappear for that component in the current session
- Every desktop-only view imports this single component

---

## Mobile Component Verification Checklist

For every component in the audit, verify these 8 checks — report pass/fail:

1. No element wider than viewport at 360px (no horizontal overflow)
2. All interactive elements ≥ 44×44px tap target
3. No text below 14px at 360px viewport
4. No hover-only interactions without touch alternative
5. Inputs use correct HTML `type` attribute
6. No side-by-side form fields below 768px
7. Modals/dialogs use drawer/fullscreen pattern below 768px
8. Page loads with critical info visible above the fold (no scroll required for primary data)

---

## Anti-Patterns — Do NOT Do Any of These

- Don't wrap every component in a `useMediaQuery` hook — use CSS media queries (exception: MUI Dialog fullScreen)
- Don't create separate mobile component files (e.g., `MobileNavigation.tsx`, `MobileDashboard.tsx`)
- Don't add `@media` blocks inline in JSX `style` props — use CSS files
- Don't suggest installing `react-responsive`, `react-swipeable`, or any new npm dependency
- Don't propose a mobile-specific route tree or lazy-loaded mobile variants
- Don't redesign the desktop view — mobile changes must not regress desktop layout
- Don't add decorative animations, transitions, or visual flourishes not in the original
- Don't convert existing MUI components to custom HTML when MUI has responsive props
- Don't create new CSS custom properties or a separate theme — use the existing `--bg`, `--surface`, `--primary`, `--accent`, `--muted` vars
- Don't add comments explaining what CSS does — the code should be self-evident

---

## Priority Ranking

Rank by what a user on a phone would hit first:
1. **Navigation and app shell** (AppShell.tsx, hamburger, active route display)
2. **Primary controls** (MPX1 perform/scene recall — the live-use page)
3. **Real-time data display** (meters, CPU status, engine status)
4. **Configuration pages** (audio interface forms, settings)
5. **Admin/diagnostic views** (cluster dashboard, diagnostics, host machine)
6. **Desktop-only flagging** (grid editor, 3D view, flow canvas, routing matrix)

---

## Output Format

### Phase 1 — Audit Only

For each component file, report in a table:

| File Path | Current Issue | Rule Violated | Checklist (8 pass/fail) | Priority |
|-----------|--------------|---------------|------------------------|----------|

**Do NOT propose fixes yet.** Stop after the audit table and wait for my approval.

### Phase 2 — Implementation Plan (after Phase 1 approval)

Generate the implementation plan as a table:

| File Path | Proposed Fix | Priority | Depends On | Est. Lines Changed | Behavior After Fix (360px) |
|-----------|-------------|----------|------------|-------------------|---------------------------|

After the table, provide a suggested implementation order noting which changes must land first (e.g., `mobile.css` and shared utilities before components that import them, AppShell navigation before page-level changes, LandscapePrompt component before desktop-only pages that use it).
