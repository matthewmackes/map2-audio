# T2522-E — Chrome Review (Maschine Extended GUI)

**Filed:** 2026-05-14 · cycle 15 of the T2522 Continue run
**Scope:** Audit the full T2522 surface (5 tabs at `/maschine` + entry button on the Hardware Catalog) for chrome quality across Carbon conformance, header / spacing / typography hierarchy, scroll-anchor consistency, Hardware Twin SVG fit & responsive scaling, AppShell action-chip behavior across tab transitions, deep-link UX, accessibility, motion-reduce / dark-theme parity, and per-tab empty-state polish.

## What landed in cycle 15

Two immediate fixes shipped in this cycle's commit:

1. **AppShell `Hardware Layout` action only renders on the Diagnostics tab.** Previously the chip was rendered unconditionally; clicking it on the Twin / Workbench / Performance / Mapping tabs no-op'd silently because no `#hardware-layout` element exists in those bodies. The action now appears + disappears as the user switches tabs.
2. **Profile Workbench LCD canvases gained `role="img"` + descriptive `aria-label`** (e.g., `"Left LCD preview for CTRL profile (param-list template)"`) so screen readers describe the rendered preview rather than skipping a bare `<canvas>`.

Two new jest cases lock both behaviors into the regression net (`T2522-E cycle 15 — AppShell Hardware Layout action is hidden outside the Diagnostics tab` + `… is present on the Diagnostics tab`).

## Follow-on findings (for cycles 31-39 of the extended Continue run)

Each item below is scoped narrowly enough to ship in a single ~30 min cycle, ordered roughly by user-visible impact.

### F1 — Cross-tab navigation polish (cycle 31)
- Add a `?tab` setter helper that animates the tab-change transition (currently snaps).
- Surface the active tab title in the breadcrumb so the AppShell kicker reads `Platform / Maschine MK1 / Hardware Twin` etc.
- Wire deep-link survival across browser back/forward (the `setSearchParams({ replace: true })` pattern from cycle 2 may need promoting to a non-replace push for nav-history correctness).

### F2 — Dark-theme + a11y audit (cycle 32)
- Run axe-core via `@axe-core/react` against each tab body; resolve any contrast violations.
- Verify Carbon `--cds-*` token usage in every custom `.maschine-*` class (no hardcoded colors except the LCD canvas pixel palette which intentionally mirrors the device).
- Ensure Tab key navigation reaches every Twin SVG control (pads with `role=button`, encoders, group buttons).

### F3 — Motion-reduce + responsive checks (cycle 33)
- Audit every animation (Twin pad pulse, Twin activity flash, Performance pad pulse, scene-cell hover) for the `@media (prefers-reduced-motion: reduce)` opt-out. Spot checks: Twin pad pulse and the activity-flash already opt out; verify Performance pad-press transform also does.
- Add a 1024px-and-below media query pass: confirm Mapping Studio panes stack rather than overflow; confirm Workbench preview canvases scale to viewport width.

### F4 — Empty-state + error-state polish (cycle 34)
- Mapping Studio empty-state currently reads "No chain blocks mounted on the active snapshot". Add a "Set up your first chain →" deep-link that routes to the Snapshot Editor.
- LED choreography editor and pressure-curve editor both surface generic "Failed to load…" copy on backend error. Add the underlying status code + a Retry button.
- Profile Workbench empty draft list is silent; add a microcopy line below the editor explaining the localStorage persistence model.

### F5 — Hardware Twin chrome enhancements (cycle 35)
- Hover state on encoders should reveal the live label even when the encoder has no HID activity (currently only the `<title>` tooltip surfaces it on long-hover).
- Add a "View on Diagnostics" jump-link on the Twin (operator wants to dive deeper).
- Live BPM display next to the connection chip (mirror the Performance header).

### F6 — Performance tab chrome enhancements (cycle 36)
- Pad grid: when an audio-grid block is mounted, the visible block name truncates at 10 chars without an ellipsis indicator. Switch to CSS truncation with `text-overflow: ellipsis`.
- Step sequencer: add a "Bar marker" overlay every 4 steps even when no pattern is mounted (currently only column-header coloring shows the downbeat).
- Quad Morph: surface the live X/Y position as numeric coordinates next to the corner legend.

### F7 — Mapping Studio chrome enhancements (cycle 37)
- The drag-source list scrolls independently of the targets pane; add a sticky search box at the top of the source list.
- SHIFT toggle is a Carbon `Toggle`; add a keyboard shortcut hint (`Tab` to focus, `Space` to flip) in a tooltip.
- Surface the post-save activation phase via the Phase Strip immediately after Save (today the Phase Strip polls at 1Hz so the phase change can take up to a second to appear).

### F8 — Profile Workbench chrome enhancements (cycle 38)
- The DSL JSON editor is a `<TextArea>` (no syntax highlighting). Pull in `react-simple-code-editor` + Prism for JSON to surface mismatched braces visually.
- Saved-drafts list lacks a "Diff vs starter" view — operators can't tell at a glance how their draft differs from the canonical T1/T2/etc.
- Add a "Reset draft" button that overwrites the current JSON with the canonical starter content.

### F9 — Diagnostics tab chrome enhancements (cycle 39)
- The HID traffic panel doesn't pause auto-scroll when the operator scrolls up; add a sticky "Pause auto-scroll" toggle.
- Operations Console grid pads use a different visual idiom from the Twin SVG pads + Performance pads — three pad-shape stylings across the page is one too many. Pick one (likely the Twin's SVG with cycle-4 polish) and unify.
- The Maschine MIDI Map editor at the bottom of the Diagnostics tab predates the new shell; verify it still renders correctly inside a tab panel (was previously the only body).

## Methodology

For each follow-on cycle:
1. Open the affected surface in a browser at `http://localhost:3000/maschine?tab=<id>`.
2. Verify the issue reproduces.
3. Ship the fix.
4. Add a regression-test case (jest or pytest as appropriate).
5. Re-run the affected suite; confirm green.
6. Atomic web build; commit + dual-push.
