# MAP2 Renames — Migration Notes

This document tracks system-wide renames where active code uses one name but historical artifacts (commits, prior plans, completed tasks, log files, on-disk persistence) preserve the original name. Operators and contributors searching the repo for the old name should land here for context.

---

## Brain / Drums&Synth / Performance Brain → **Sequencer** (2026-05-02, T_RENAME)

**Plan doc:** [docs/plans/T_BRAIN_TO_SEQUENCER_RENAME.md](plans/T_BRAIN_TO_SEQUENCER_RENAME.md)

The surface previously called **Brain** (page label), **Drums&Synth** (tree-nav label), and **Performance Brain** (full name in code) is now uniformly named **Sequencer** in the active codebase. The change is system-wide:

- **Frontend URL:** `/brain` → `/sequencer`. The `/brain` route is hard-deleted with no redirect; stale bookmarks fall through to home.
- **Frontend symbols:** `PerformanceBrainPage` → `SequencerPage`, `BrainOverviewShell` → `SequencerOverviewShell`, `useBrainRuntimeState` → `useSequencerRuntimeState`, `BrainStateModel` → `SequencerStateModel`, etc. The `Performance` prefix is dropped entirely (no `PerformanceSequencer*` — every symbol is just `Sequencer*`).
- **File paths:** `web/src/app/components/Brain/` → `web/src/app/components/Sequencer/`, `web/src/app/pages/brainViews/` → `web/src/app/pages/sequencerViews/`, `web/src/map2/clients/brain.ts` → `web/src/map2/clients/sequencer.ts`, etc.
- **CSS classes:** `.brain-*` → `.sequencer-*`, `.performance-brain-*` → `.sequencer-*`.
- **Tree-nav icon:** `Music` (collided with MIDI Services) → an interim `Waveform` (this commit's Chains+Icons bundle) → `Grid` (the canonical step-sequencer icon, this commit).
- **Backend Python:** `app/services/performance_brain_service.py` → `sequencer_service.py`, `app/services/performance_brain_authority_sync.py` → `sequencer_authority_sync.py`, `app/services/brain_metering_service.py` → `sequencer_metering_service.py`, `app/services/performance_brain/` → `app/services/sequencer/`, `app/routes/brain.py` → `app/routes/sequencer.py`. The `app/main.py` route registry was updated to load `'sequencer'` instead of `'brain'`.
- **FastAPI routes:** `/api/engine/brain/*` → `/api/engine/sequencer/*`. `/api/audio/state/brain/sync` → `/api/audio/state/sequencer/sync`. `/api/devices/brain-monitor-candidates` → `/api/devices/sequencer-monitor-candidates`. Hard cut, no aliases.
- **JUCE C++ engine:** `juce-engine/Source/Brain/` → `juce-engine/Source/Sequencer/`. Class `PerformanceBrainProcessor` → `SequencerProcessor`. Plugin URI `"map2://juce/brain"` → `"map2://juce/sequencer"`.
- **State extension keys:** `state.extensions["performance_brain"]` → `state.extensions["sequencer"]`.
- **Env var:** `MAP2_BRAIN_ROOT` → `MAP2_SEQUENCER_ROOT`. Default path `~/.map2/performance_brain/` → `~/.map2/sequencer/`.
- **Tests:** all `tests/test_brain_*.py` renamed to `tests/test_sequencer_*.py`.

### Operator-visible breakage

Existing snapshots that reference the old plugin URI `"map2://juce/brain"` will load with the Performance Sequencer plugin slot empty. There is no migration script. Operators must manually re-add the Sequencer plugin from the artifacts library and re-save the snapshot. Same applies to anywhere the URI is persisted (Maschine MK1 device-pack mappings, scenes, etc.).

### Historical context not rewritten

The following are historical artifacts and **were not modified**:

- `docs/PROJECT_WORKLIST.md` — the worklist contains historical task entries (T2438, T2441, T2442, T2443, T2461, etc.) that reference "Brain" / "Performance Brain" because that's what those tasks were named when they shipped. A migration note at the top of the worklist points here.
- `docs/plans/T2438_TOP_CHROME_AND_BRAIN_OVERVIEW_PLAN.md` and other plan docs in `docs/plans/` — preserved as-is.
- `docs/architecture/SAMPLER_SERVICES.md`, `MIDI_SERVICES.md`, `MIDI_BACKEND.md`, `FIRST_CLASS_SERVICES.md`, `STATE_AUTHORITY_DOWNSTREAM_CONTRACT.md`, `MASCHINE_MK1_OPERATION_GUIDE.md` — body references to Brain preserved as-is.
- Git commit history — every commit message that says "Brain" stays.
- Build logs, evidence dirs, soak reports — preserved.

### Comments and string literals in code

Where Brain appears in **code comments** (e.g. `// T2461-A5 — Brain monitor candidates`), those references were left intact. Comments are documentation of the moment, not active behavior.

### Why hard-cut everywhere

Per the plan's locked decisions Q1-Q5 (recorded interactively 2026-05-02): every layer that had a choice between "permanent alias" / "migration script" / "hard cut" landed on **hard cut**. The user's pattern across the prior `/chains` and `/workspace` reorgs was the same — accept bookmark/persistence breakage in exchange for zero permanent legacy debt. Snapshots, URLs, plugin URIs, API routes, env vars all break atomically; there is no transition window.
