# T_RENAME — Brain / Drums&Synth → Sequencer (system-wide)

**Status:** [ ] Planned — awaiting user trigger to execute
**Authored:** 2026-05-02
**Estimated diff:** ~150 files (frontend ~50, Python backend ~25, JUCE C++ ~7, tests ~15, docs ~3, plus ~50 cross-reference content updates)
**Estimated execution time:** 2-4 hours focused work
**Branch policy:** master, no feature branch (per CLAUDE.md §0.1)

## What this is

The surface currently called **Brain** (page label), **Drums&Synth** (tree-nav label), and **Performance Brain** (full name in code) is renamed to **Sequencer** across the entire repo — frontend, Python backend, JUCE C++ engine. Everything operator-visible says "Sequencer". Every code symbol uses `Sequencer` (no `Performance` prefix). URL `/brain` is deleted; canonical URL is `/sequencer`. Icon in the global tree nav becomes `Grid`.

Locked decisions (from interactive Q&A 2026-05-02):

1. **Scope:** Full rename including code symbols (file moves, hook renames, CSS class renames, query keys). No leaving "brain" in the source.
2. **Naming:** Drop the `Performance` prefix entirely. `SequencerPage`, `pages/sequencer/*`, `useSequencer*`, `.sequencer-*`. No `PerformanceSequencer*`.
3. **URL bookmarks:** Hard delete `/brain`. No redirect. Stale bookmarks 404 / fall to home.
4. **Sequencer icon:** Carbon `Grid` (step-sequencer / piano-roll mental model).
5. **Backend scope:** Frontend + backend + JUCE C++ all renamed.
6. **Bundle:** One bundle, no commits until user approves.
7. **JUCE plugin URI persistence:** Hard cut. `"map2://juce/brain"` → `"map2://juce/sequencer"`. Existing snapshots referencing the old URI lose their plugin slot; operator re-adds. No alias, no migration script.
8. **API URL atomic deploy:** Hard cut. Standard build → restart → swap sequence. One-shot deploy gap accepted.
9. **`PROJECT_WORKLIST.md`:** Do not touch. Add one migration note at the top: *"As of 2026-05-02, the surface formerly known as Brain / Drums&Synth / Performance Brain is renamed Sequencer; historical entries below preserve original names."*
10. **Plan/architecture docs:** Do not touch filenames or body references. Create `docs/RENAMES.md` with the same migration note.
11. **Verification:** Typecheck + Jest + pytest + JUCE C++ tests + service health-checks + 5-minute soak from `.codex/skills/juce-random-effects-soak/`.

---

## Slice plan

Execute in this order. Stop and report after each slice if anything fails.

### Slice 1 — Frontend file moves + symbol rename

Goal: every `web/src/` file containing "Brain" in its path or symbols moves to "Sequencer". URL stays `/brain` for now (Slice 4 deletes it).

Files to rename:

**Directories:**
- `web/src/app/components/Brain/` → `web/src/app/components/Sequencer/`
- `web/src/app/components/BrainKeyboardVisualizer/` → `web/src/app/components/SequencerKeyboardVisualizer/`
- `web/src/app/pages/brainViews/` → `web/src/app/pages/sequencerViews/`

**Files (path renames, content untouched in this slice):**
- `web/src/map2/clients/brain.ts` → `sequencer.ts`
- `web/src/map2/clients/brain.test.ts` → `sequencer.test.ts`
- `web/src/app/pages/PerformanceBrainPage.tsx` → `SequencerPage.tsx`
- `web/src/app/pages/PerformanceBrainPage.test.tsx` → `SequencerPage.test.tsx`
- `web/src/app/pages/PerformanceBrainPage.css` → `SequencerPage.css`
- `web/src/app/pages/brainHandoff.ts` → `sequencerHandoff.ts`
- `web/src/app/pages/brainViews/brainViews.css` → `sequencerViews.css`
- `web/src/app/pages/brainViews/brainViewShared.tsx` → `sequencerViewShared.tsx`
- `web/src/app/pages/brainViews/BrainOverviewShell.tsx` → `SequencerOverviewShell.tsx`
- `web/src/app/components/Brain/Setup/brainSetupTypes.ts` → `sequencerSetupTypes.ts`
- `web/src/app/components/PluginCards/Custom/JUCE/PerformanceBrainCard.tsx` → `SequencerCard.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/PerformanceBrainCard.test.tsx` → `SequencerCard.test.tsx`
- `web/src/app/hooks/useBrainRuntimeState.ts` → `useSequencerRuntimeState.ts`
- `web/src/app/hooks/useBrainRuntimeState.test.ts` → `useSequencerRuntimeState.test.ts`
- `web/src/app/hooks/useBrainChannelMeters.ts` → `useSequencerChannelMeters.ts`
- `web/src/app/hooks/useBrainChannelMeters.test.tsx` → `useSequencerChannelMeters.test.tsx`

**Symbol renames (find-and-replace, preserve case):**

| Old | New |
|-----|-----|
| `PerformanceBrainPage` | `SequencerPage` |
| `PerformanceBrainCard` | `SequencerCard` |
| `PerformanceBrainCardBase` | `SequencerCardBase` |
| `useBrainRuntimeStateSync` | `useSequencerRuntimeStateSync` |
| `useBrainChannelMeters` | `useSequencerChannelMeters` |
| `useBrainMonitorCandidates` | `useSequencerMonitorCandidates` |
| `useBrainAssetsByDevice` | `useSequencerAssetsByDevice` |
| `BrainContext*` | `SequencerContext*` |
| `BRAIN_CAPABILITY_MAP` | `SEQUENCER_CAPABILITY_MAP` |
| `BRAIN_VIEW_IDS` | `SEQUENCER_VIEW_IDS` |
| `BrainViewId` | `SequencerViewId` |
| `BrainChannelMeter` | `SequencerChannelMeter` |
| `BrainOverviewSharedProps` | `SequencerOverviewSharedProps` |
| `BrainOverviewShell` | `SequencerOverviewShell` |
| `BrainStateModel` (type re-export) | `SequencerStateModel` |
| `BRAIN_PLUGIN_URI` | `SEQUENCER_PLUGIN_URI` |
| `PERFORMANCE_BRAIN_URI` | `PERFORMANCE_SEQUENCER_URI` (deferred — see Slice 3 URI handling) |
| `'brain'` (NODE_PAGE_KEYS already removed; still: any `useQuery(['brain', ...])` keys) | `'sequencer'` |

**CSS class renames:**
- `.brain-` → `.sequencer-`
- `.performance-brain-` → `.performance-sequencer-` (no — drop Performance. Use `.sequencer-`)

**Display strings (anywhere these appear in JSX text or label fields):**
- `"Brain"` → `"Sequencer"`
- `"Performance Brain"` → `"Sequencer"` (no Performance prefix per Q2)
- `"Drums&Synth"` → `"Sequencer"`
- `"Drums & Synth"` → `"Sequencer"`

**Verification after Slice 1:** `npm run typecheck` clean, full Jest suite passing (or only the pre-existing failures noted in earlier sessions still failing).

### Slice 2 — Frontend nav + URL plumbing

- `App.tsx`: `<Route path="/brain"` → `<Route path="/sequencer"`. Lazy import of `PerformanceBrainPage` becomes `SequencerPage`. **Delete `/brain` route entirely** — no redirect (Q3 of setup; matches `/chains` policy).
- `GlobalTreeNav.tsx`: `'/brain'` in `TOP_LEVEL_ROUTE_ORDER`, `BOLD_TOP_LEVEL_ROUTES`, `DEFAULT_EXPANDED_IDS`, `TREE_LABEL_OVERRIDES` — every reference flips to `/sequencer`. Label override `'/sequencer': 'Sequencer'`. Icon override `'/sequencer': Grid` (replacing the prior `Waveform` swap from this same session).
- `launcherCatalog.tsx`: `/brain` storefront override key + treeChildren routes (the 14 `/brain?section=...` entries) → `/sequencer?section=...`.
- `advancedMenuItems.ts`: `to: '/brain'` entries flip to `/sequencer`. Aliases map: any `'/brain': '/sequencer'` entry would be a redirect — per Q3 NO redirects, so just rename the entry.
- `posterManifest.ts`, `homeCardProfiles.ts`, `homeShellNavigation.ts`, `routePrefetch.ts`, `Toasts.tsx`, `useAppShellPresentation.ts`: every `/brain` literal → `/sequencer`.
- `shellRouteMeta.ts`: rename `'/brain'` breadcrumb entry to `'/sequencer'`. Update breadcrumb label `'Brain'` → `'Sequencer'`.
- All inbound `<Link to="/brain">`, `navigate('/brain')`, `to="/brain?section=*"` callsites across the frontend.

**Verification after Slice 2:** `npm run typecheck` clean, `npm run build` clean, all related tests passing or pre-existing-failure (not new).

### Slice 3 — JUCE C++ engine

Files to rename:
- `juce-engine/Source/Brain/` → `juce-engine/Source/Sequencer/`
- `PerformanceBrainProcessor.h/.cpp` → `SequencerProcessor.h/.cpp`
- `PerformanceBrainProcessorTests.cpp` → `SequencerProcessorTests.cpp`

Symbol renames:
- C++ class `PerformanceBrainProcessor` → `SequencerProcessor`
- All methods, constants, namespace members containing `Brain` → `Sequencer`
- Plugin URI string `"map2://juce/brain"` → `"map2://juce/sequencer"` (hard cut per Q1; existing snapshots break)

Build files:
- `juce-engine/CMakeLists.txt`: update source list to point at the new `Sequencer/` directory and renamed files.
- Any FetchContent / target_sources referencing the old paths.

**Verification after Slice 3:** `cmake --build juce-engine/build` succeeds, JUCE unit tests (whatever exists in the build target) pass, the engine loads (smoke test: backend service can start without errors).

### Slice 4 — Backend Python

Files to rename:
- `app/services/performance_brain_service.py` → `app/services/sequencer_service.py` (drop the prefix)
- `app/services/performance_brain_authority_sync.py` → `app/services/sequencer_authority_sync.py`
- `app/services/brain_metering_service.py` → `app/services/sequencer_metering_service.py`
- `app/routes/brain.py` → `app/routes/sequencer.py`
- `app/services/performance_brain/` → `app/services/sequencer/`
  - `brain_action_registry.py` → `sequencer_action_registry.py`
  - `brain_capture_buffer.py` → `sequencer_capture_buffer.py`
  - `models.py` (rename internal model classes)
- `app/services/midi/projections/brain.py` → `app/services/midi/projections/sequencer.py`
- `tests/test_brain_*.py` → `tests/test_sequencer_*.py` (12+ test files)

Class/symbol renames:
- `BrainStateModel` → `SequencerStateModel`
- `BrainTransportStateModel` → `SequencerTransportStateModel`
- `BrainSlotModel` → `SequencerSlotModel`
- `BrainSequenceModel` → `SequencerSequenceModel`
- `BrainSongStateModel` → `SequencerSongStateModel`
- `BrainMixerStateModel` → `SequencerMixerStateModel`
- All Python imports updated.

Route renames (FastAPI):
- `/api/engine/brain/state` → `/api/engine/sequencer/state`
- `/api/engine/brain/transport` → `/api/engine/sequencer/transport`
- `/api/engine/brain/slots` → `/api/engine/sequencer/slots`
- `/api/engine/brain/layers` → `/api/engine/sequencer/layers`
- `/api/engine/brain/sequence` → `/api/engine/sequencer/sequence`
- `/api/engine/brain/song` → `/api/engine/sequencer/song`
- `/api/engine/brain/mixer` → `/api/engine/sequencer/mixer`
- `/api/audio/state/brain/sync` → `/api/audio/state/sequencer/sync`
- `/brain-monitor-candidates` → `/sequencer-monitor-candidates`

Config/registry updates:
- `BRAIN_PLUGIN_URI` constant → `SEQUENCER_PLUGIN_URI`
- Any plugin-URI registry: `"map2://juce/brain"` → `"map2://juce/sequencer"`
- `device-packs/`: `app/services/maschine/profiles/json/t10_brain_seq.json` → `t10_sequencer_seq.json` and any internal path refs

**Verification after Slice 4:** `python3 -m pytest` clean (or only pre-existing failures), backend service `systemctl restart map2-backend.service` succeeds and `/api/health` returns 200, `/api/engine/sequencer/state` returns 200 (no 404).

### Slice 5 — Tests

Every test file that asserts:
- Old URL `/brain` or `/brain?section=...` → assert new URL
- Old display string `"Brain"`, `"Drums&Synth"`, `"Performance Brain"` → assert new
- Old hook/component imports → updated paths
- Snapshot tests: regenerate (`npm test -- -u` for the affected snapshots)

**Verification after Slice 5:** Full Jest + pytest suite green-or-pre-existing.

### Slice 6 — Docs

- Create `docs/RENAMES.md` with the migration note (per Q4):

  > **Brain / Drums&Synth / Performance Brain → Sequencer (2026-05-02)**
  >
  > The surface formerly known as Brain (page label), Drums&Synth (tree-nav label), and Performance Brain (full name in code) was renamed to **Sequencer** across the active codebase on 2026-05-02. The change is system-wide:
  > - Frontend URL `/brain` → `/sequencer` (no redirect; old URL deleted)
  > - Frontend symbols, file paths, hooks, CSS classes all renamed
  > - Backend Python modules, FastAPI routes (`/api/engine/brain/*` → `/api/engine/sequencer/*`)
  > - JUCE C++ engine (class names, plugin URI `"map2://juce/brain"` → `"map2://juce/sequencer"`)
  >
  > Existing snapshots referencing the old plugin URI will lose their Performance Sequencer plugin slot; operators must re-add the plugin from the artifacts library.
  >
  > Historical references in `docs/`, `docs/plans/`, `docs/architecture/`, `docs/PROJECT_WORKLIST.md`, and prior commit messages preserve the original names. Do not "fix" them — they describe the surface as it was named when those tasks shipped.

- Add a single line at the top of `docs/PROJECT_WORKLIST.md`:
  > *Migration note (2026-05-02): "Brain" / "Drums&Synth" / "Performance Brain" → "Sequencer" — see [docs/RENAMES.md](RENAMES.md). Historical entries below preserve original names.*

### Slice 7 — Build, deploy, verify

1. `python3 scripts/build_web_dist_atomic.py` — frontend bundle.
2. `cmake --build juce-engine/build` — JUCE engine.
3. `systemctl restart map2-backend.service` — backend picks up Python changes + new JUCE engine.
4. Restart static server on port 3000 (kill + nohup spawn).
5. Health checks:
   - `curl http://localhost:3000/` returns 200, contains the new bundle hash.
   - `curl http://localhost:3000/sequencer` returns 200 (SPA mounts).
   - `curl http://localhost:8080/api/engine/sequencer/state` returns 200 (or expected non-error response).
   - `curl http://localhost:8080/api/health` returns 200.
6. Run the JUCE soak: `python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py --duration-seconds 300 --flow-rotation-seconds 20 --sample-interval-seconds 1.0 --reset-stats-after-warmup --threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35`. 5-minute test, zero XRuns expected.

If any health check or soak fails: stop, report, do not commit.

If all green: report ready for user approval. **Do not commit/push without explicit user approval (CLAUDE.md §0.5).**

---

## Risks I want to flag explicitly

1. **Snapshot loss.** Per Q1 (hard cut on URI), every snapshot in operator local state that has a Performance Brain plugin in its chain will load with that slot empty after this change ships. There is no migration path. Operators must manually re-add the plugin from the artifacts library, and any snapshot-driven automation (Maschine MK1 device-pack mappings, scenes, etc.) that addresses the brain plugin by URI will break. Acceptable per the user's explicit decision; flagging here so it's not a surprise.

2. **API URL deploy gap.** Per Q2 (hard cut), there's a window during deploy where one half of frontend/backend is updated and the other isn't. If `update` shorthand is used (the `python3 scripts/continuous_release.py` flow), the gap is ~2-3 seconds during which any frontend call to a brain endpoint 404s. Operators not actively using the page during deploy won't notice. Operators with the page open during deploy will see one or two failed network calls, then the new bundle loads on next route navigation.

3. **JUCE engine rebuild risk.** Renaming `PerformanceBrainProcessor` is a large C++ class refactor; if any JUCE include path or registration is missed, the engine will fail to start (silent — `systemctl status map2-backend.service` will show the error). Slice 7 health-check catches this immediately.

4. **PROJECT_WORKLIST.md inconsistency.** Per Q3 (don't touch), the worklist will reference "Brain" in completed-task entries while the active code says "Sequencer". Operators searching the worklist for "Sequencer" will miss historical context. Migration note at the top is the only mitigation.

5. **No rollback path.** This is a single-bundle commit. If a problem emerges 2 days after merge, reverting is a giant revert commit that re-breaks the rename half-way (because subsequent work on master has built on top of the new names). The mitigation is verification at each slice + the 5-minute soak before commit.

---

## Execution trigger

This plan does not execute until the user explicitly says "execute the rename" or equivalent. When that happens, I'll:

1. Re-read this plan to confirm the user hasn't changed any decision since.
2. Execute Slices 1-7 in order, stopping at the first failed verification.
3. Report status after each slice.
4. End with the bundle ready for user approval — **no commit, no push** until separate user authorization.
