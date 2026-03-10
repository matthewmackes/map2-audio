# MAP2 Bloat and Unnecessary Complexity Audit

Date: 2026-03-10  
Worklist task: `T081-subE`

## Executive assessment

MAP2 has crossed from "feature-rich" into "maintenance-heavy".

The core problem is not just repository size. It is that too much of the codebase now serves secondary product ambitions, experimental surfaces, or overlapping operator experiences rather than the smallest strong version of MAP2's core value: a reliable headless real-time audio appliance.

The bloat pattern appears in four forms:

1. checkout/repository bloat
2. monolithic hotspot files
3. subsystem breadth that exceeds core product value
4. dependency layering without a clear simplification policy

## Quantitative snapshot

### Lines of code by major area

- `app/routes`: `48,427` lines across `103` files
- `app/services`: `99,228` lines across `227` files
- `web/src/app/pages`: `20,288` lines across `38` files
- `web/src/app/components`: `113,491` lines across `381` files
- `juce-engine/Source`: `52,936` lines across `108` files
- `docs`: `52,544` lines across `207` files

### Checkout size hotspots

- `juce-engine/build`: `1.6G`
- `juce-engine/build-asan`: `868M`
- `juce-engine/build-asan-clang`: `692M`
- `juce-engine/build-avdecc-test`: `681M`
- `juce-engine/build-check`: `384M`
- `node_modules`: `110M`
- `docs/fit-for-purpose-evidence`: `80M`
- `data/repair-backups`: `6.3M`

### Large hotspot files

Source and app-owned hotspots from this pass include:

- `tui/screens/chains_refactored.py`: `6092` lines
- `juce-engine/Source/PythonBindings.cpp`: `5287` lines
- `web/src/map2/api.ts`: `4743` lines
- `juce-engine/Source/Map2AudioEngine.cpp`: `4252` lines
- `app/services/backup_service.py`: `3855` lines
- `app/routes/avb.py`: `3842` lines
- `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`: `3833` lines
- `app/services/juce_engine_service.py`: `3409` lines
- `web/src/app/pages/GridFlowPage.tsx`: `2712` lines
- `app/services/avb/avb_router.py`: `2585` lines
- `app/routes/system.py`: `2503` lines

## What is not bloat

Not all large code is bad.

The following are heavy, but justified or at least understandable:

- JUCE engine core and DSP code
- qualification evidence that proves real behavior
- automated tests for critical routing and AVB behavior
- vendor code that is intentionally embedded for a required dependency

This audit is not arguing for indiscriminate deletion. It is arguing for a sharper boundary between core product weight and optional/peripheral weight.

## Specific bloat candidates

| Candidate | Why it looks bloated | Recommendation | Estimated maintenance savings |
| --- | --- | --- | --- |
| Tracked/generated build output (`juce-engine/build*`, `node_modules`, repair backups) | Huge checkout cost with no product value in source control; already acknowledged in `T082-subD`. | Remove from source repo and keep release/build artifacts out of the main tree. | Very high: multi-GB clone/CI savings and less accidental commit churn. |
| Asset scraper families (`app/services/ir_library/*`, `app/services/soundfont_library/*`) | `26` Python files dedicated to downloading third-party assets. Useful, but peripheral to the core appliance. | Move to optional package/sidecar or sharply narrow the supported catalog. | Medium-high: dozens of files and significant long-tail breakage risk removed from the core platform. |
| AVB control-plane sprawl | `app/routes/avb.py` alone is `3842` lines; AVB UI also has very large component/test surfaces. | Break into narrower route domains and hide lab-only flows behind explicit maturity flags. | High: lower regression blast radius for one of the most complex subsystems. |
| Monolithic operator pages | `GridFlowPage.tsx`, `EdirolUA1000Page.tsx`, `LCDPage.tsx`, `AboutPage.tsx`, and `MIDIPage.tsx` are all large enough to resist calm iteration. | Split by workflow, not by visual section alone. | Medium: smaller review surfaces and fewer accidental UX regressions. |
| Overgrown service hubs | `backup_service.py`, `juce_engine_service.py`, `avb_router.py`, `mpx1_service.py`, `service_orchestrator.py` carry multiple responsibilities each. | Split by domain boundary or narrow product scope. | Medium: less cross-feature breakage and easier targeted testing. |
| Visualization stack layering | The frontend carries MUI/Emotion, Ariakit, Phosphor, Lucide, ReactFlow, Three.js, D3, Recharts, and Framer Motion. | Standardize on fewer rendering/visualization paths. | Medium: lower dependency churn, smaller builds, clearer UI conventions. |
| Duplicate or weak-value UI surfaces | 3D Grid, duplicate hardware route usage, multiple broad system/status pages. | Default-hide, merge, or remove surfaces that do not outperform the main workflow. | Medium: clearer product and fewer screens to maintain. |
| TUI/application overlap | A large TUI surface plus a large web shell plus LCD/operator flows means three operator surfaces evolving in parallel. | Define which workflows truly need all three surfaces and narrow the rest. | Medium-high: less duplicated UX/support work. |

## Bloat by subsystem

### 1. Asset acquisition breadth is too high for core product value

MAP2 currently ships many scrapers and download managers for IRs and soundfonts. This is convenient, but it is also classic maintenance bloat:

- third-party sites change
- scraping breaks silently
- legal/provenance expectations grow
- none of this directly improves the audio engine itself

This is the clearest candidate to move out of the core platform or drastically narrow.

### 2. AVB is both strategically important and structurally bloated

AVB is a legitimate differentiator for MAP2, so the answer is not removal.

The answer is to stop letting one subsystem sprawl across:

- very large routes
- very large UI components
- broad tests
- complex qualification scaffolding
- deployment/runbook logic

without stronger internal sub-boundaries.

This is not dead weight. It is live strategic weight that needs decomposition.

### 3. The frontend has too many giant files for a calm product team to live with

The large pages and components are not merely "big files." They are signs that multiple workflows are being maintained inside single components because the product surface expanded faster than the interaction model was simplified.

Examples from this pass:

- `GridFlowPage.tsx` at `2712` lines
- `EdirolUA1000Page.tsx` at `1902` lines
- `LCDPage.tsx` at `1806` lines
- `MIDIPage.tsx` at `1437` lines
- `TopBar.tsx` in AVB routing at `3833` lines

That is expensive UI weight.

### 4. Backup, system, and management surfaces are heavier than the core story needs

`backup_service.py` is one of the largest services in the backend. That may still be justified, but it is an example of a management feature becoming a subsystem in its own right. The same is true of broad `system.py` and `audio.py` route surfaces.

This matters because MAP2 is supposed to be an audio appliance first. Support tooling is valuable, but it should not quietly become the dominant complexity center.

## Dead-weight or low-yield patterns

These are not always removable immediately, but they are the patterns I would challenge first.

1. Experimental visualization surfaces that do not strengthen the main operator workflow
2. Per-device pages that create parallel UX taxonomies instead of capability-based workflows
3. Huge route files that aggregate unrelated controls because "they are both AVB" or "they are both system"
4. Background helpers and managers that exist because the platform grew around them, not because they are a clean abstraction
5. Dependency additions that solve one page's problem but widen the whole frontend stack

## Simplification priorities

### Priority 1: Remove non-source weight from the main repo

This is already recognized in `T082-subD` and remains the fastest high-value win.

### Priority 2: Narrow optional subsystems out of the default product slice

Best candidates:

- asset scrapers/download catalogs
- 3D visualization paths
- duplicated hardware-specific navigation

### Priority 3: Break up the largest route/service/page hotspots

Best candidates:

- `app/routes/avb.py`
- `app/routes/system.py`
- `app/services/juce_engine_service.py`
- `web/src/app/pages/GridFlowPage.tsx`
- `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`

### Priority 4: Reduce dependency overlap in the web app

Aim for fewer visualization and UI stacks doing overlapping jobs.

## Final verdict

MAP2's bloat is not random. It comes from success at adding capabilities without an equally strong rule for saying no.

That has produced a platform that can demonstrate many ideas, but where the maintenance surface is larger than the current finished product slice.

The most important bloat conclusion is:

**MAP2 does not mainly need more code. It needs a harder boundary around what belongs in the core platform.**

That boundary decision will save more time than another month of additive feature work.
