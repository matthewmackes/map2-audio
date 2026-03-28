# MAP2 Audio Platform — Full Forensic Audit

**Date:** 2026-03-28
**Scope:** End-to-end platform audit — dead code, unfinished work, architectural consistency, production readiness
**Method:** Automated multi-agent static analysis + cross-layer workflow tracing across ~15,000 source files

---

# 1. Executive Summary

## Overall Health: GOOD — with targeted cleanup opportunities

The MAP2 Audio Platform is architecturally sound and remarkably well-connected across layers. All 10 major end-to-end workflows (audio chains, plugins, MIDI, MPX-1, drums, Tesira, AVB/AVDECC, cluster, backup, library) are **fully wired** from UI → API → service → engine with zero critical disconnects.

**Main risks:**
- **Documentation truthfulness:** README claims "sub-3ms latency" but measured performance is 4–7ms with xrun issues
- **CI/CD broken:** Main CI workflow triggers on `main`/`develop` branches that don't exist (repo uses `master`)
- **2 missing systemd scripts:** `map2-system-check.sh` and `run_pipedal_boot_test.sh` referenced by services but absent
- **Legacy frontend layer:** ~35 components in `web/src/map2/components/` are superseded by `web/src/app/` but still on disk

**Degree of dead code:** LOW — 4 orphaned Python services, 4 dead C++ files, ~12 legacy React components, 22 C++ plugin stub directories
**Degree of unfinished work:** LOW — Phase tests are weak placeholders; Milan Mode AVDECC docs overstate progress
**Degree of architectural drift:** MINIMAL — cross-layer consistency is excellent; file organization in `pages/` needs cleanup

---

# 2. Platform Map

| Subsystem | Role | Files | Status |
|-----------|------|-------|--------|
| **app/** | FastAPI Python backend | ~408 .py | Active, production |
| **app/routes/** | REST API endpoints | 95 route files | All mounted in main.py |
| **app/services/** | Business logic layer | 200+ service files | Active, 4 orphaned |
| **web/src/app/** | React/Carbon frontend (current) | ~600 .tsx/.ts | Active, production |
| **web/src/map2/** | Legacy React frontend | ~120 .tsx/.ts | Partially superseded |
| **juce-engine/Source/** | C++ JUCE audio engine | ~120 .cpp/.h | Active, 4 dead files |
| **juce-engine/*Plugin/** | Standalone VST3 plugin stubs | 22 directories | Scaffolding only |
| **tui/** | Terminal UI (Textual) | ~50 files | Active |
| **lcd/** | LCD display system | 19 .py | Active |
| **systemd/** | Service definitions | 10 units + 3 modes | 2 broken references |
| **scripts/** | Build/deploy/diagnostic | ~100 scripts | Mostly active |
| **config/** | System templates + Grafana | ~30 files | Active |
| **tests/** | Pytest test suite | 264 test files | Active, phase tests weak |
| **docs/** | Architecture + plans | 175+ .md | Some stale claims |
| **installer/** | Installation automation | ~20 files | Active |
| **data/** | Factory content (drums, SFZ) | ~800 assets | Active |

---

# 3. Findings by Severity

## CRITICAL

### C1: README latency claim is false
- **Category:** Documentation truthfulness
- **Location:** `README.md:52`
- **Evidence:** Claims "Sub-3ms round-trip latency." Measured performance per `docs/LATENCY_AUDIT_COMPREHENSIVE_2026.md`: 4–7ms realistic, 38.4ms peak jitter, 2579 xruns in 30-minute soak
- **Why it matters:** External stakeholders, contributors, or users may rely on this claim
- **Confidence:** Confirmed
- **Action:** Add qualifier: "Theoretical 2.67ms buffer floor (64 samples @ 48kHz); measured ~4–7ms with current tuning. See latency audit for details."

### C2: CI/CD pipeline broken — wrong branch triggers
- **Category:** Infrastructure
- **Location:** `.github/workflows/ci-cd.yml:5,7`
- **Evidence:** Triggers on `branches: [main, develop]` but repo uses `master` branch. Push/PR events never fire CI.
- **Why it matters:** No automated test-backend, test-web, or lint jobs run on push
- **Confidence:** Confirmed
- **Action:** Change to `branches: [master]`

### C3: Missing systemd scripts — services will fail
- **Category:** Infrastructure
- **Location:** `systemd/map2-system-check.service:13` → `scripts/map2-system-check.sh` (MISSING); `systemd/map2-pipedal-test.service:13` → `run_pipedal_boot_test.sh` (MISSING)
- **Evidence:** `test -f` confirms both files absent
- **Why it matters:** If enabled, systemd startup fails
- **Confidence:** Confirmed
- **Action:** Create the scripts or disable/remove the service units

## HIGH

### H1: Milan Mode AVDECC docs overstate progress
- **Category:** Documentation truthfulness
- **Location:** `docs/AVB_STANDARDS_RATING_REPORT.md:52` — "Milan Mode in progress"
- **Evidence:** `docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md` classifies it as "Phase 11+ Planning, Not Yet Implemented" with 10.5 hours estimated. No ACMP or format negotiation code exists.
- **Confidence:** Confirmed
- **Action:** Change "in progress" to "Phase 11+ roadmap — not started"

### H2: CI references non-existent test script
- **Category:** Infrastructure
- **Location:** `.github/workflows/ci-cd.yml:123` — `npm run test:avb-routing`
- **Evidence:** No `test:avb-routing` script in `web/package.json`
- **Confidence:** Confirmed
- **Action:** Add the script or remove the CI step

### H3: Standalone-service and orphan-service audit bucket needs splitting
- **Category:** Dead code
- **Location:**
  - `app/services/port80_proxy.py` — standalone TCP proxy launched by `systemd/map2-port80-proxy.service`
  - `app/services/secrets_manager.py` — standalone encrypted secret-store utility with CLI/module helpers
  - `app/services/connection_pool_integration.py` — never imported and not referenced by runtime/service units
  - `app/services/resilience_middleware.py` — utility module only kept alive by its own dedicated tests
- **Confidence:** Mixed — only part of the bucket is truly dead
- **Action:** Delete `connection_pool_integration.py`, decide the secrets/proxy utility ownership explicitly, and remove `resilience_middleware.py` if it remains test-only

### H4: Legacy map2/ dashboard components never used by app/
- **Category:** Dead code
- **Location:** `web/src/map2/components/` — MAP2Dashboard, WorkFlow, HistoryPanel, SessionManager, MetricsDashboard, NetworkPanel, FeaturesPanel, FeatureToolbar, SessionStatusIndicator, BackupStatusWidget, SnapshotBar, ChainBuilder (top-level)
- **Evidence:** These are only imported by each other and `map2/index.ts`. No `app/` code imports `map2/index.ts` or these components. The `app/` layer has its own implementations.
- **Confidence:** Highly likely dead — needs runtime verification that no lazy/dynamic import exists
- **Action:** Verify tree-shaking excludes them from build, then delete

## MEDIUM

### M1: Phase tests are weak placeholders
- **Category:** Test quality
- **Location:** `tests/test_phase1_integration.py` (57 lines, `assert status_code in (200, 400)`), `tests/test_phase3_profiling.py` (15 lines, `assert result is None`), `tests/test_phase5_smoke.py` (disabled by default via env var)
- **Evidence:** Overly permissive assertions that pass on error codes; minimal coverage
- **Confidence:** Confirmed
- **Action:** Tighten assertions or remove if superseded by more specific tests

### M2: 4 dead C++ files on disk but not in CMake
- **Category:** Dead code
- **Location:** `juce-engine/Source/PluginHost.h`, `PluginHost.cpp`, `PluginGraph.h`, `PluginGraph.cpp`
- **Evidence:** Not in CMakeLists.txt. Superseded by JucePluginHost and JuceAudioGraph.
- **Confidence:** Confirmed dead
- **Action:** Delete all 4 files

### M3: 22 standalone plugin stub directories
- **Category:** Dead scaffolding
- **Location:** `juce-engine/BossXS1PolyShifterPlugin/`, `ChorusPlugin/`, `CircularDelayPlugin/`, `ConvolutionPlugin/`, `DelayPlugin/`, `DynamicsPlugin/`, `EventideH9Plugin/`, `FilterPlugin/`, `H3000Plugin/`, `IntelliFX8VoiceChorusPlugin/`, `LexiLovePlugin/`, `Marshall800Plugin/`, `MesaDualRectifierPlugin/`, `NAMPlugin/`, `ParallelMixerPlugin/`, `PassionFXPlugin/`, `Peavey5150Plugin/`, `PhaserPlugin/`, `PitchShifterPlugin/`, `ShoeGazePlugin/`, `TweedBassmanPlugin/`, `WDFAmpPlugin/`
- **Evidence:** Each has its own CMakeLists.txt for standalone VST3/AU builds. Not part of the main engine build. Real processor implementations are in `Source/` and compiled.
- **Confidence:** Likely scaffolding — verify if standalone plugin builds are needed
- **Action:** Keep if standalone plugin distribution is planned; otherwise delete

### M4: Misplaced files in pages/ directory
- **Category:** Organization
- **Location:** `web/src/app/pages/` contains 4 modal components (AudioNodesModal, ChainAssignmentModal, JuceGridAudioPortModal, RoutingTopologyModal), 6+ sub-component panels, 3 utility/state files, 2 helper functions
- **Evidence:** These are not page-level route components but support components and utilities
- **Confidence:** Confirmed
- **Action:** Move modals to `components/modals/`, JuceGrid helpers to `components/JuceGrid/`, utilities to `utils/`

### M5: Orphaned CSS for stub/redirect pages
- **Category:** Dead code
- **Location:** `web/src/app/pages/PlatformShellPage.css` (836 lines for a null-returning page), `MidiHubPage.css` (727 lines for a redirect), IntelFX view CSS files
- **Confidence:** Highly likely dead
- **Action:** Verify no other component imports these CSS files, then delete

### M6: Unused config schema sections
- **Category:** Dead configuration
- **Location:** `app/config.py` — `ConfigSection.AUTOMATION` (line 58) has no usage in app codebase
- **Confidence:** Highly likely dead
- **Action:** Remove unused schema sections

### M7: Buffer size documentation conflict
- **Category:** Documentation consistency
- **Location:** README says "down to 128 samples"; MEMORY.md says DEFAULT_BUFFER_SIZE=64; Latency audit doc says 128
- **Confidence:** Confirmed mismatch
- **Action:** Reconcile all docs to reflect actual `Common.h` value (64)

## LOW

### L1: JuceAudioGraphViz component never imported
- **Category:** Dead code
- **Location:** `web/src/app/components/JuceAudioGraphViz.tsx`
- **Confidence:** Confirmed dead
- **Action:** Delete

### L2: 23 empty function bodies across Python routes
- **Category:** Code quality
- **Location:** `app/routes/audio_diagnostics.py:286`, `cluster_admin.py:210,216,222,908,915`, `dashboard.py:55,77,400`, `dsp.py:124`, `impulse_response.py:289`, `profiling.py:155`, `soundfonts.py:159,184`, `latency_v2.py:103`, `sidechain.py:71`, `delay.py:115`
- **Evidence:** Bodies contain only `pass` or `...`
- **Confidence:** Confirmed
- **Action:** Implement or document why they're intentionally empty

### L3: Disabled build script without explanation
- **Category:** Organization
- **Location:** `scripts/build-airwindows.sh.disabled`
- **Confidence:** Confirmed stale
- **Action:** Delete or add comment explaining why disabled

### L4: TUI documentation redundancy
- **Category:** Documentation
- **Location:** `tui/` contains 40+ "PROJECT_COMPLETE" / "PHASE_COMPLETE" markdown files
- **Confidence:** Confirmed redundant
- **Action:** Consolidate into 1–2 canonical status files

### L5: TODO in C++ engine
- **Category:** Unfinished work
- **Location:** `juce-engine/Source/Map2AudioEngine.cpp:2122` — `// TODO: Implement impulse-response calibration`
- **Confidence:** Confirmed
- **Action:** Implement or remove

---

# 4. Dead Code Register

| Item | Type | Location | Why Dead | Confidence | Action |
|------|------|----------|----------|------------|--------|
| PluginHost.h/cpp | C++ files | juce-engine/Source/ | Not in CMake, superseded by JucePluginHost | Confirmed | Delete now |
| PluginGraph.h/cpp | C++ files | juce-engine/Source/ | Not in CMake, superseded by JuceAudioGraph | Confirmed | Delete now |
| port80_proxy.py | Python standalone utility | app/services/ | Not imported, but launched by `map2-port80-proxy.service` | Confirmed live standalone | Retain and test |
| secrets_manager.py | Python standalone utility | app/services/ | Not route-wired, but exposes real encrypted storage + CLI helpers | Confirmed standalone utility | Retain or delete explicitly, not by import scan alone |
| connection_pool_integration.py | Python service | app/services/ | Never imported and no runtime owner | Confirmed dead | Delete now |
| resilience_middleware.py | Python utility | app/services/ | No production imports; only dedicated self-tests | Likely dead | Delete if no retained owner emerges |
| MAP2Dashboard.tsx | React component | web/src/map2/components/ | Only self-referenced, not used by app/ | Highly likely | Verify build, then delete |
| WorkFlow.tsx | React component | web/src/map2/components/ | Only used by MAP2Dashboard | Highly likely | Delete with MAP2Dashboard |
| HistoryPanel.tsx | React component | web/src/map2/components/ | Only used by WorkFlow | Highly likely | Delete with chain |
| SessionManager.tsx | React component | web/src/map2/components/ | Only used by WorkFlow | Highly likely | Delete with chain |
| MetricsDashboard.tsx | React component | web/src/map2/components/ | Only used by MAP2Dashboard | Highly likely | Delete with chain |
| NetworkPanel.tsx | React component | web/src/map2/components/ | Only used by MAP2Dashboard | Highly likely | Delete with chain |
| FeaturesPanel.tsx | React component | web/src/map2/components/ | Only used by MAP2Dashboard | Highly likely | Delete with chain |
| FeatureToolbar.tsx | React component | web/src/map2/components/ | Only used by FeaturesPanel | Highly likely | Delete with chain |
| SessionStatusIndicator.tsx | React component | web/src/map2/components/ | Only used by FeaturesPanel | Highly likely | Delete with chain |
| BackupStatusWidget.tsx | React component | web/src/map2/components/ | Only used by FeaturesPanel | Highly likely | Delete with chain |
| SnapshotBar.tsx | React component | web/src/map2/components/ | Only used by ChainBuilder/FeaturesPanel | Highly likely | Delete with chain |
| JuceAudioGraphViz.tsx | React component | web/src/app/components/ | Never imported anywhere | Confirmed | Delete now |
| PlatformShellPage.css | CSS file | web/src/app/pages/ | 836 lines for a null-returning page | Highly likely | Verify, then delete |
| MidiHubPage.css | CSS file | web/src/app/pages/ | 727 lines for a redirect page | Highly likely | Verify, then delete |
| ConfigSection.AUTOMATION | Config schema | app/config.py:58 | No usage in codebase | Highly likely | Delete |
| map2-system-check.sh | Script | scripts/ (MISSING) | Referenced by service but doesn't exist | Confirmed missing | Create or remove service |
| run_pipedal_boot_test.sh | Script | root (MISSING) | Referenced by service but doesn't exist | Confirmed missing | Create or remove service |
| build-airwindows.sh.disabled | Script | scripts/ | Disabled, reason undocumented | Confirmed stale | Delete |

---

# 5. Unfinished Work Register

| Feature | Evidence | Layers | What's Missing | Recommendation |
|---------|----------|--------|----------------|----------------|
| Milan Mode AVDECC | Docs say "in progress"; code says Phase 11+ | Service, Engine, Docs | ACMP connect, format negotiation, controller mode | Update docs; keep as roadmap item |
| IR calibration | `TODO` comment at Map2AudioEngine.cpp:2122 | Engine | Implementation | Implement or remove TODO |
| Phase 1 integration tests | test_phase1_integration.py: 57 lines, permissive assertions | Tests | Real validation logic | Tighten or replace |
| Phase 3 profiling tests | test_phase3_profiling.py: 15 lines, `assert result is None` | Tests | Meaningful assertions | Tighten or replace |
| Phase 5 smoke tests | Disabled by env var `MAP2_RUN_INTEGRATION_TESTS` | Tests | CI enablement decision | Document intent |
| 23 empty function bodies | `pass`/`...` in route handlers | API | Actual implementation | Implement or document |
| Standalone plugin builds | 22 plugin directories with CMakeLists.txt | Engine | Build pipeline, distribution | Decide if needed |

---

# 6. Duplicate / Redundant Logic Register

| Item A | Item B | Type | Recommendation |
|--------|--------|------|----------------|
| `web/src/map2/components/MAP2Dashboard` | `web/src/app/pages/` (various dashboards) | UI dashboard | Keep app/, delete map2/ dashboard chain |
| `web/src/map2/components/IRManager` | `web/src/app/components/IRManagerDialog` | IR management UI | Keep app/, delete map2/ |
| `web/src/map2/components/NAMManager` | `web/src/app/components/NAMManagerDialog` | NAM management UI | Keep app/, delete map2/ |
| `web/src/map2/components/ChainBuilder` (top-level) | `web/src/map2/components/ChainBuilder/` (directory) | Chain builder UI | Keep directory version |
| `PluginHost.h/cpp` | `JucePluginHost.h/cpp` | C++ plugin hosting | Keep Juce version, delete legacy |
| `PluginGraph.h/cpp` | `JuceAudioGraph.h/cpp` | C++ audio graph | Keep Juce version, delete legacy |
| `app/routes/midi.py` + `midi_v2.py` + `midi_hub.py` | Three MIDI route files | MIDI API | Verify v1 is still needed or consolidate |

---

# 7. Workflow Completion Audit

| Workflow | Intended Outcome | Completion | Notes |
|----------|-----------------|------------|-------|
| Audio Chain CRUD | Create, configure, deploy signal chains | **Complete** | Full UI → API → service → engine path |
| Plugin Management | Discover, load, configure, preset plugins | **Complete** | Multi-format support (VST3, AU, LV2, LADSPA) |
| MIDI Routing | Route MIDI between devices, learn, map | **Complete** | MIDI Hub v2 with 21 micro-services |
| MPX-1 Control | Full Lexicon MPX-1 parameter control | **Complete** | 601 params, SYX import, scenes, morphing (T022–T042) |
| Drum Machine | Pattern sequencing, kit management, recording | **Complete** | 25 model classes, sample editor |
| Tesira Integration | Biamp device control via TTP | **Complete** | 11 service modules, SSH+TTP, fleet management |
| AVB/AVDECC | Network audio discovery, streaming, routing | **Complete** | la_avdecc v4.3.1.1; Milan Mode is roadmap only |
| Cluster Management | Multi-node orchestration, failover | **Complete** | RAFT consensus, mTLS, ZTP, 30+ service modules |
| Backup/Restore | Snapshot and restore platform state | **Complete** | File-based, configurable retention |
| Library Management | IR, SoundFont, preset browsing/download | **Complete** | 16 scrapers across IR + SoundFont sources |

**All 10 workflows: COMPLETE end-to-end. No breakpoints or missing layers.**

---

# 8. Test Reality Audit

## What is NOT tested
- Standalone VST3 plugin builds (22 plugin directories)
- Milan Mode AVDECC (not implemented, correctly untested)
- Frontend CSS coverage (no visual regression tests)
- The earlier four-file orphan-service bucket was over-broad: `port80_proxy.py` and `secrets_manager.py` now have focused retained-contract coverage, while `connection_pool_integration.py` and `resilience_middleware.py` were deleted in the `T483`-`T491` follow-up cleanup.

## What is MISLEADINGLY tested
- `test_phase1_integration.py`: Accepts both 200 and 400 as "passing" — masks real failures
- `test_phase3_profiling.py`: Asserts `result is None` — validates nothing meaningful
- `test_phase5_smoke.py`: Disabled by default — gives false confidence if not run

## What OBSOLETE tests exist
- `web/src/map2/components/MAP2Dashboard.test.tsx`: Tests legacy dashboard that's unused by app/

## What integration tests are MISSING
- End-to-end CI integration (CI/CD pipeline is broken — doesn't trigger on master)
- `npm run test:avb-routing` referenced in CI but doesn't exist in package.json
- JUCE engine tests skip entirely if engine not compiled (no mock fallback)

---

# 9. Cleanup Plan

## Phase A: Safe Deletions (no functional impact)

1. Delete `juce-engine/Source/PluginHost.h`, `PluginHost.cpp`, `PluginGraph.h`, `PluginGraph.cpp`
2. Delete `web/src/app/components/JuceAudioGraphViz.tsx`
3. Delete `app/services/connection_pool_integration.py` [completed in T483]
4. Delete `app/services/resilience_middleware.py` [completed in T486]
5. Delete `scripts/build-airwindows.sh.disabled`
6. Remove `ConfigSection.AUTOMATION` from `app/config.py` if grep confirms zero usage

## Phase B: Verified Deletions (verify no runtime/standalone usage first)

1. Verify and retain `app/services/port80_proxy.py` as a systemd-backed standalone service [completed in T484]
2. Verify and retain `app/services/secrets_manager.py` as a standalone secret-store utility with optional dependency guard [completed in T485]
3. Verify tree-shaking and delete legacy `web/src/map2/components/` dashboard chain (MAP2Dashboard, WorkFlow, HistoryPanel, SessionManager, MetricsDashboard, NetworkPanel, FeaturesPanel, FeatureToolbar, SessionStatusIndicator, BackupStatusWidget, SnapshotBar)
4. Verify and delete orphaned CSS files (PlatformShellPage.css, MidiHubPage.css)
5. Decide on 22 plugin stub directories — delete if standalone builds not needed

## Phase C: Fix Broken Infrastructure

1. Fix `.github/workflows/ci-cd.yml` branch triggers: `main,develop` → `master`
2. Fix or remove `npm run test:avb-routing` CI reference
3. Create `scripts/map2-system-check.sh` or disable `map2-system-check.service`
4. Create `run_pipedal_boot_test.sh` or disable `map2-pipedal-test.service`

## Phase D: Documentation Corrections

1. README.md: Qualify latency claim with measured data
2. AVB_STANDARDS_RATING_REPORT.md: Change Milan Mode from "in progress" to "roadmap"
3. Reconcile buffer size docs (README vs MEMORY vs audit doc) to match Common.h value (64)
4. Consolidate TUI completion docs (40+ files → 1–2)

## Phase E: Code Quality Improvements

1. Implement or document 23 empty function bodies in routes
2. Tighten phase test assertions or replace with meaningful tests
3. Move misplaced modals/utilities from `pages/` to proper component directories
4. Consider MIDI route consolidation (midi.py + midi_v2.py + midi_hub.py)

---

# 10. Global Worklist

| # | Task | Rationale | Scope | Risk | Priority |
|---|------|-----------|-------|------|----------|
| 1 | Fix CI branch triggers | CI/CD completely non-functional on master | `.github/workflows/ci-cd.yml` | None | **P0** |
| 2 | Fix README latency claim | False marketing claim | `README.md` | None | **P0** |
| 3 | Resolve missing systemd scripts | Services fail if enabled | 2 service files + 2 scripts | Low | **P0** |
| 4 | Delete 4 dead C++ files | Confusion, misleading includes | `juce-engine/Source/` | None | **P1** |
| 5 | Delete 4 orphaned Python services | Dead code bloat | `app/services/` | Verify first | **P1** |
| 6 | Fix CI test:avb-routing reference | CI step fails | `.github/workflows/ci-cd.yml` | None | **P1** |
| 7 | Correct Milan Mode docs | Overstated progress | 2 doc files | None | **P1** |
| 8 | Delete legacy map2/ dashboard chain | ~12 unused components | `web/src/map2/components/` | Verify build | **P2** |
| 9 | Delete orphaned CSS files | ~1500 lines of dead CSS | `web/src/app/pages/` | Verify imports | **P2** |
| 10 | Delete JuceAudioGraphViz | Never imported | `web/src/app/components/` | None | **P2** |
| 11 | Remove AUTOMATION config section | Unused schema | `app/config.py` | None | **P2** |
| 12 | Reconcile buffer size docs | Conflicting values across docs | 3+ doc files | None | **P2** |
| 13 | Tighten phase test assertions | False confidence from weak tests | 3 test files | None | **P2** |
| 14 | Implement empty function bodies | 23 stub handlers in routes | `app/routes/` | Verify intent | **P3** |
| 15 | Reorganize pages/ directory | Misplaced modals/utilities | `web/src/app/pages/` | Medium (imports) | **P3** |
| 16 | Decide on plugin stub directories | 22 directories, scaffolding only | `juce-engine/*Plugin/` | Verify need | **P3** |
| 17 | Consolidate MIDI route files | 3 overlapping route modules | `app/routes/midi*.py` | Medium | **P3** |
| 18 | Consolidate TUI docs | 40+ redundant completion files | `tui/` | None | **P4** |
| 19 | Delete disabled build script | Stale, undocumented | `scripts/` | None | **P4** |
| 20 | Remove C++ TODO or implement | IR calibration placeholder | `Map2AudioEngine.cpp:2122` | None | **P4** |

---

# 11. Completion Scoring by Subsystem

| Subsystem | Score | Notes |
|-----------|-------|-------|
| Python Backend (app/) | **Complete** | 95+ routes mounted, 200+ services active, 4 orphaned |
| React Frontend (app/) | **Complete** | All pages routed, all workflows connected |
| React Legacy (map2/) | **Partially Abandoned** | Core APIs/hooks still used; dashboard components dead |
| C++ Audio Engine | **Complete** | All processors compiled, 4 dead files, 1 TODO |
| MIDI Hub | **Complete** | 21 micro-services, full UI |
| MPX-1 | **Complete** | T022–T042 done, 87+ tests, 8 views |
| Tesira | **Complete** | 11 service modules, TTP protocol, fleet management |
| AVB/AVDECC | **Mostly Complete** | Core discovery/streaming done; Milan Mode is roadmap |
| Cluster | **Complete** | RAFT, mTLS, ZTP, 30+ modules |
| Drum Machine | **Complete** | Full CRUD, sequencing, sample editor |
| CI/CD | **Broken** | Wrong branch triggers, missing test script |
| Systemd | **Mostly Complete** | 2 services reference missing scripts |
| Documentation | **Mostly Complete** | 3 truthfulness issues, some redundancy |
| Tests | **Mostly Complete** | 264 files, but phase tests are weak placeholders |
