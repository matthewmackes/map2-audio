# React Staggered Reveal — universal page effect

**Status:** shipped 2026-05-09 (replaces the legacy "Hyperactive Block Reveal").
**Owners:** UI / Theme platform.
**Setting:** Theme page → Behavior tab → Page Transitions → "React Staggered Reveal".

## What it is

A slow, Framer-Motion-style staggered fade-and-slide-up cascade applied
universally across the GUI on every navigation, tab swap, and opt-in
disclosure. Each grid/list item arrives in turn with a soft slide from
+12px below to its resting position over ~350ms, with ~50ms between
items.

The effect runs in two layers:

1. **Page-transition overlay** ([PageTransition.tsx](../web/src/app/components/PageTransition.tsx)) —
   a subtle radial wash on top of the page during route changes. Total
   duration ~600ms.
2. **Universal in-content stagger** ([UniversalStagger.tsx](../web/src/app/components/UniversalStagger.tsx)) —
   walks the `<main>` subtree on every navigation, finds layout grids
   and lists, and applies a Web Animations API (WAAPI) cascade across
   their direct children.

## How it's wired

| Layer | File | Responsibility |
|---|---|---|
| Persisted preset | [effectsSettingsStore.ts](../web/src/app/stores/effectsSettingsStore.ts) | `pageTransitionPreset: 'staggered-reveal' \| 'pager-slide'` + `staggerSpeed: 'slower' \| 'slow' \| 'normal' \| 'faster'`. Default is `staggered-reveal` / `slow`. Legacy `'hyperactive-block'` values silently migrate. |
| Reduced-motion bridge | [useReducedEffectsPreference.ts](../web/src/app/hooks/useReducedEffectsPreference.ts) | Resolves the OS `prefers-reduced-motion` query and the user's "Reduce effects" toggle. When either is on, the stagger collapses to an 80ms fade-only path with no transform. |
| Page overlay | [PageTransition.tsx](../web/src/app/components/PageTransition.tsx) | Renders the wash overlay on every route change in any of the named scopes (home, audio-artifacts, juce-grid, midi-hub) plus a `workspace` fallback for everything else. |
| Universal in-content | [UniversalStagger.tsx](../web/src/app/components/UniversalStagger.tsx) | `<UniversalStaggerProvider />` (mounted in `AppShell`) listens to route changes; on first paint and every navigation it auto-detects layout grids/lists in the active `<main>` and runs the WAAPI cascade. |
| Tab/disclosure opt-in | [UniversalStagger.tsx](../web/src/app/components/UniversalStagger.tsx) | `useStaggerOnMount(ref, deps)` and `<StaggerReveal triggerKey={...}>` for any non-route surface (tab swaps, modal opens, custom shells). |
| Live preview | [StaggerPreviewTile.tsx](../web/src/app/components/StaggerPreviewTile.tsx) | 6-cell sample grid sitting next to the radio option in Theme → Behavior. Reflects the user's selected speed and shows a "Reduced motion" badge when applicable. |

## Auto-detection rules (universal in-content)

The provider walks the `<main>` element on each route change and
considers an element a stagger container if any of:

- `[role="list"]` or `[role="grid"]` with ≥ 2 children
- `<ul>` or `<ol>` with ≥ 2 children
- Any element with a computed `display: grid | flex | inline-grid | inline-flex` and ≥ 3 children

When two qualifying containers nest, only the outer-most runs (no
double-staggering rows inside columns).

### Exclusions

These never animate, even when their children would otherwise qualify:

- `[data-no-stagger]` (or any ancestor)
- `[role="meter" | "progressbar" | "status" | "log" | "tablist" | "toolbar" | "navigation"]`
- `[aria-live]` (live regions update too often)
- Class names matching `/(meter|level|vu|peak|loglist|logstream|stream|liveregion|toast)/i`

If a real-time surface ever animates by mistake, the simplest fix is
to add `data-no-stagger` to its container.

## Speeds

| Speed | per-item | step | total budget |
|---|---|---|---|
| Slower | 500ms | 80ms | 1400ms |
| Slow (default) | 350ms | 50ms | 900ms |
| Normal | 240ms | 30ms | 600ms |
| Faster | 160ms | 18ms | 400ms |

The cap is 16 staggered children per container so a 1000-item virtualised
list does not block the UI for 50 seconds — items past the cap reuse the
last delay.

## Devtools / debugging

- DOM marker: while a child is animating it carries
  `data-stagger-applied="true"` and `data-stagger-run-id="<runId>"`.
  Both are removed on animation finish or cancel.
- Dev-mode console trace: when `NODE_ENV=development` (or the
  `globalThis.__MAP2_STAGGER_TRACE__ = true` flag is set in the
  console), every run logs:
  ```
  [stagger] run=42 elements=8 reduced=false duration=350ms step=50ms
  ```

## Removing or replacing the effect

- The preset name is `staggered-reveal` everywhere — search for that
  string to find every wiring point.
- The legacy `hyperactive-block` preset is migrated, not present in
  the type union; remove the migration map in
  `effectsSettingsStore.ts` after the next major release.
- A future "Reveal v2" should follow the same shape: persist a preset,
  wire it through `useReducedEffectsPreference`, render an overlay in
  `PageTransition`, run an auto-detect in `UniversalStagger`. Keep
  the WAAPI approach so virtualised lists, ag-grid, and other
  non-React-controlled DOM keep working without a component swap.
