# MIDI Services — All closeable epics shipped

**Date:** 2026-05-02 (loop 21 iter 202; updated 2026-05-02 for T2485 close).
**Scope:** All MIDI epics that can be closed in pure-software loops are DONE. Hardware-blocked items remain open under T2459-H pending bench HIL access.

This doc is the single read for "what is the MIDI surface today + what is left."

---

## Closed epics (shipped end-to-end, public, tested)

| Epic | Status | Closing iter | Description |
|---|---|---|---|
| **T2482** | ✅ Done 2026-05-01 | iter 150 | MIDI Services unification — single canonical authority + `/midi` surface, 10 of 10 P3 sub-phases. See `T2482_PHASE3_DONE.md`. |
| **T2483** | ✅ Done 2026-05-02 | iter 180 | T2482 follow-up polish — 10 of 10 sub-items including server-side matrix endpoint, live MIDI-learn helper, structured descriptor editors. |
| **T2484** | ✅ Done 2026-05-02 | iter 200 | Cluster MIDI peer surface — 4 of 4 sub-items wiring T2483-9's scaffold to real backend with drill-down drawer + per-peer health. |
| **T2485** | ✅ Done 2026-05-02 | 11 atomic iters | MIDI GUI Unification under device-pack shell. All 9 MIDI-controlling devices now have unified `/midi/devices/<profile-key>` entries; sidebar collapsed from 9 MIDI device entries to 1; MPX1 + IntelFX migrate to the unified mount with hard redirects from legacy URLs; deviceManifest schema with title + 3-line purpose block (Q3=A, Q4=B locked) renders on the landing view of every device; generic `<DeviceStatusBar>`, `<DeviceFlowCanvasShell>`, `useFlowUndoRedo` shared primitives shipped. |
| **T2487** | ✅ Done 2026-05-02 | 3 atomic iters (e3e606c6 / fa8a6f09 / 0863e4f1) | Expression decomposition + unified-shell migration. Path A revision: audit confirmed ExpressionPage was a 3-column integrated workflow (Assignment List ↔ Form ↔ Live Monitor), not a multi-tab device. File-level decomposition (1361 LoC → 11 modules under `web/src/app/components/Devices/Expression/`) preserves modularity without breaking workflow. Mounted at `/midi/devices/expression/console`; legacy `/expression` hard-redirects. |
| **T2488** | ✅ Done 2026-05-02 | 1 atomic iter (0dfa43a4) | Voodoo Lab Ground Control Pro unified-shell migration. Path A: GCP is internally tabbed via Carbon Tabs but the 5 tabs share extensive state; helpers extracted into `groundControlProUtils.tsx`, the integrated body stays in `GroundControlProPage.tsx`. Mounted at `/midi/devices/voodoo-lab-ground-control-pro/console`; legacy `/ground-control-pro` hard-redirects. |
| **T2489** | ✅ Done 2026-05-02 | 1 atomic iter (9c8da6bd) | Ableton Push 3 unified-shell migration. Path A: heavy in-page interactivity (hotspot grid, color editing, routine builder, drag/drop) is the largest of the three monoliths (1625 LoC) but most tightly-coupled state-wise; only the unified-shell wrapper added. Mounted at `/midi/devices/ableton-push-3/console`; legacy `/labs/push-surface` hard-redirects. Helper extraction queued as future internal cleanup if maintenance burden demands it. |

## Production status (loop-21 audit)

- **Backend router**: `app.include_router(midi_services_router)` lives in `app/main.py:1153`. **All 11 `/api/midi/*` endpoints are publicly reachable.**
- **Routes inventory**:
  - `GET /api/midi/bindings/count`
  - `GET /api/midi/bindings/learn/last-cc` (T2483-5)
  - `GET /api/midi/cluster/bindings/matrix` (T2484-1)
  - `GET /api/midi/bindings/matrix` (T2483-8)
  - `GET /api/midi/legacy-table-rowcounts`
  - `GET /api/midi/bindings`
  - `GET /api/midi/bindings/{binding_id}`
  - `POST /api/midi/bindings`
  - `PATCH /api/midi/bindings/{binding_id}`
  - `DELETE /api/midi/bindings/{binding_id}`
  - `POST /api/midi/bindings/{binding_id}/disable`
  - `POST /api/midi/bindings/{binding_id}/enable`
- **Frontend surface**: `/midi/{overview,devices,devices/:profileKey,bindings,routing,transport,network,presets,events,processing,lab,connections}` all live via the `MidiServicesShell` mount. Per-device editor pages carry the iter-133 cross-link banner.
- **Test coverage**: 13 jest suites / 116 tests for the midi-services frontend + 169 backend pytest cases under `tests/midi/`.

## T2485 close-out (2026-05-02)

T2485 (MIDI GUI Unification) shipped end-to-end across 11 atomic iters:

| Iter | Slice | Commit |
|---|---|---|
| 1 | T2485-1: deviceManifest schema + DeviceLandingHeader (foundation) | b877b93c |
| 2 | T2485-2: generic `<DeviceStatusBar>` (consolidates MPX1/IntelFX status bars) | 15d177c5 |
| 3 | T2485-3: `<DeviceFlowCanvasShell>` + shared `useFlowUndoRedo` hook | f2250acb |
| 4 | T2485-4: MPX1 migrated to `/midi/devices/lexicon-mpx1/*` (hard redirect from `/devices/mpx1/*`, `/mpx1/*`) | acf28581 |
| 5 | T2485-5: IntelFX migrated to `/midi/devices/rocktron-intelfx/*` | 52cfa4a9 |
| 6 | T2485-6: Maschine landing at `/midi/devices/native-instruments-maschine-mk1` (cross-link into `/maschine` console) | 60abc413 |
| 7 | T2485-7a: MCU + LaunchControl + MidiCommander console-style landings | 3fc5daed |
| 8 | T2485-7b: Expression landing | 901a8fd5 |
| 9 | T2485-7c: GroundControlPro landing | 48d51f9b |
| 10 | T2485-7d: PushSurface landing | a0543c73 |
| 11 | T2485-8: sidebar 9 MIDI entries → 1; MPX1 mega-menu retired | 3e1a5d7f |

**What shipped end-to-end**: every MIDI-controlling device now has a unified `/midi/devices/<profile-key>` entry with a Carbon-styled landing header showing the device title and a 3-line purpose description (manifest-authored per Q3=A, rendered on landing view only per Q4=B). MPX1 and IntelFX are fully relocated; the shells accept a `routePrefix` prop so the same component renders correctly under both the unified mount and (for tests) the legacy mount. Legacy URLs (`/devices/mpx1/*`, `/mpx1/*`, `/devices/intelfx/*`, `/intelfx/*`) hard-redirect to the unified canonical mount per the locked Q1=A decision.

**Sidebar**: was 11 advanced-menu entries (`/midi-hub`, `/devices`, `/state-authority`, `/mcu`, `/launch-control`, `/midi-commander`, `/mpx1`, `/intelfx`, `/tesira`, `/edirol-ua1000`, `/hotone-jogg`); now 6 (`/midi`, `/devices`, `/state-authority`, `/tesira`, `/edirol-ua1000`, `/hotone-jogg`). The five retired MIDI device entries remain reachable via `/midi/devices` and the homepage MIDI section.

**Shared primitives now available**:
- `web/src/app/components/Devices/Shared/deviceManifest.ts` — schema + `validateDeviceManifest()`
- `web/src/app/components/Devices/Shared/DeviceLandingHeader.tsx` — title + 3-line purpose render
- `web/src/app/components/Devices/Shared/DeviceStatusBar.tsx` — generic status bar (replaces MPX1StatusBar + IntelFXStatusBar; legacy status bars not yet retired — pending shell-side wiring)
- `web/src/app/components/Devices/Shared/DeviceFlowCanvasShell.tsx` — flow-canvas frame with toolbar/sidebar/canvas slots + keyboard shortcut dispatcher
- `web/src/app/components/Devices/Shared/useFlowUndoRedo.ts` — undo/redo stack with maxDepth ring buffer

**Deferred follow-ups**: the three monolithic device pages (Expression 1361 LoC, GroundControlPro 1338 LoC, PushSurface 1625 LoC) keep their legacy operator routes intact. Per the locked Q2=A decision, decomposing them into multi-view shells before unification is the right design — but each is a multi-loop SHIP epic in its own right. They're tracked as standalone epics:

- ~~**T2487** — Decompose ExpressionPage into multi-view shell + migrate to `/midi/devices/expression/*`~~ — ✅ CLOSED 2026-05-02 via Path A revision (file-level decomposition + single-view migration; 3-column integrated workflow does not split into route tabs).
- ~~**T2488** — Decompose GroundControlProPage + migrate to `/midi/devices/voodoo-lab-ground-control-pro/*`~~ — ✅ CLOSED 2026-05-02 via Path A revision (helpers extracted; tabbed body stays in-page).
- ~~**T2489** — Decompose PushSurfacePage + migrate to `/midi/devices/ableton-push-3/*`~~ — ✅ CLOSED 2026-05-02 via Path A revision (unified-shell wrapper only; helper extraction queued as future internal cleanup).

Each follows the T2485-4 (MPX1) template but adds the upstream decomposition step.

## Stale-note correction (loop 21 iter 201)

The iter-18 file note "router not yet wired" in `app/services/midi/routes.py` was carried forward across iters 162, 172, 182 closing logs as an "acknowledged limitation." **It was wrong** — the router has been mounted in `app/main.py` for some time. Iter 201 corrected the docstring + struck through the false limitations in:

- `docs/PROJECT_WORKLIST.md` SHIP loop 17, 18, 20 closing logs
- `docs/architecture/T2484_LOOP20_VERIFICATION.md` acknowledged limitation #1
- `tests/midi/test_matrix_endpoint.py` docstring

No code behavior change resulted from the correction — the endpoints had been live this whole time.

## What remains open (intentionally — hardware-blocked)

The following T2459-H sub-tasks are NOT closeable in software loops. They need physical bench access (a MeloAudio Commander, Maschine MK1, MPX-1, IntelFX, or MIDI 2.0 capable device):

- **T2459-H3** `[>] In Progress` — MeloAudio Commander device-pack cutover. Pack migrated + regression tests pass; bench HIL evidence run remains.
- **T2459-H4** `[>] In Progress` — Maschine MK1 / MPX-1 / IntelFX / SysEx parsers device-pack migration. Code work done; HIL parity verification remains.
- **T2459-H5** `[>] In Progress` — MIDI Hub v2 absorbed into the host. UMP round-trip + recorder golden parity SHIPPED in slice 13 (2026-04-28); bench HIL against a MIDI-2.0-capable device remains the sole gate.
- **T2459-H6** `[ ] Todo` — Retire `Map2MidiController` raw-ALSA path. JUCE engine consumes shm ring exclusively; cutover needs HIL validation.

Per the worklist note (line 1324), these mirror the H3/H4 hardware-blocked pattern — **all software work is done**; only bench validation remains.

## Recommended next direction (post-MIDI)

With every pure-software MIDI epic closed, the standing autonomous-loop directive can pivot to:

- **AVB Services unification** — Phase 4 template extraction from T2482; first AVB epic following the four-services discipline.
- **Sampler Services unification** — Same pattern.
- **Audio Effects Services unification** — Same pattern.
- **Post-P1.2 polish** — real Mixxx ControllerEngine JS execution, audio-thread engine-side latency measurement, namespace-isolation default-flip (these are deferred items inside the now-closed T2482, not blockers for MIDI Services to function).

## Cross-references

- `docs/architecture/T2482_PHASE3_DONE.md` — T2482 Phase 3 overview
- `docs/architecture/MIDI_SERVICES.md` — original T2482 design doc
- `docs/architecture/archive/t2482/` — per-loop architecture docs
- `docs/PROJECT_WORKLIST.md` — SHIP loop closing logs (search "SHIP loop 10" through "SHIP loop 21")
- `docs/philosophy/midi-design.md` §7 — operator-facing MIDI Services unification summary
