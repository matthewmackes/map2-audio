# MIDI Services — All closeable epics shipped

**Date:** 2026-05-02 (loop 21 iter 202).
**Scope:** All MIDI epics that can be closed in pure-software loops are DONE. Hardware-blocked items remain open under T2459-H pending bench HIL access.

This doc is the single read for "what is the MIDI surface today + what is left."

---

## Closed epics (shipped end-to-end, public, tested)

| Epic | Status | Closing iter | Description |
|---|---|---|---|
| **T2482** | ✅ Done 2026-05-01 | iter 150 | MIDI Services unification — single canonical authority + `/midi` surface, 10 of 10 P3 sub-phases. See `T2482_PHASE3_DONE.md`. |
| **T2483** | ✅ Done 2026-05-02 | iter 180 | T2482 follow-up polish — 10 of 10 sub-items including server-side matrix endpoint, live MIDI-learn helper, structured descriptor editors. |
| **T2484** | ✅ Done 2026-05-02 | iter 200 | Cluster MIDI peer surface — 4 of 4 sub-items wiring T2483-9's scaffold to real backend with drill-down drawer + per-peer health. |

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
