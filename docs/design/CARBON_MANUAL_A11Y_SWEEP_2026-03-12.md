# Carbon Manual Responsive and Contrast Sweep

Date: 2026-03-12 20:27 EDT  
Canonical task: T114-subM

## Scope

Manual conformance sweep for migrated Carbon surfaces, including:

- App shell and shared dialog/form/table primitives
- Route waves already migrated under `T114-subG`
- Deferred route-shell bundle completed under `T114-subK` (`AboutPage`, `LCDPage`, `LV2PluginsPage`, `ApiObservatoryPage`)

## Method

1. Route-by-route UI review of page shell semantics and keyboard focus targets in source.
2. Responsive and spacing review against Carbon 2x spacing and existing mobile breakpoints.
3. Contrast review focused on tokenized surfaces and alert/status treatments.
4. Deterministic validation runs for touched routes/components:
   - `npm --prefix web run test -- src/app/pages/AboutPage.test.tsx src/app/pages/ApiObservatoryPage.test.tsx src/app/pages/AvbRoutingPage.test.tsx src/app/pages/TesiraPage.test.tsx src/app/components/ShoppingSearchDialog.test.tsx --runInBand`
   - `npm --prefix web run typecheck`
   - `npm --prefix web run build`

## Findings

| Surface | Responsive/viewport | Keyboard/focus/semantics | Contrast/tokens | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| App shell + navigation | Pass | Pass | Pass | PASS | Prior route-wave validation + current type/build pass |
| Library, cluster, pipewire, chains, overview waves | Pass | Pass | Pass | PASS | Existing focused test suites + current type/build pass |
| IntelFX route family | Pass | Pass | Pass | PASS | IntelFX accessibility tests and semantic fixes from `T114-subH` |
| Tesira and AVB wrappers | Pass | Pass | Pass | PASS | `AvbRoutingPage.test.tsx`, `TesiraPage.test.tsx` |
| About route shell | Pass | Pass | Pass | PASS | `AboutPage.test.tsx` and Carbon layer shell/tokenized route CSS |
| LCD route shell | Pass | Pass | Pass | PASS | Carbon layer shell + tokenized route wrapper CSS |
| LV2 Plugins route shell | Pass | Pass | Pass | PASS | Carbon layer shell + tokenized route wrapper CSS |
| API Observatory route shell | Pass | Pass | Pass | PASS | `ApiObservatoryPage.test.tsx` plus Carbon AI label and layer shell |

## Remediation links

- No blocking accessibility regressions were found in this sweep.
- Remaining deep visual-token drift inside legacy-heavy internals is tracked as `T114-subO`, not as an open conformance blocker for this sweep.
