# T2482 historical plan + reality-audit docs

This folder archives the per-loop plan + reality-audit docs from T2482 (MIDI Services Unification). They are kept for history; **the canonical entry point for current readers is one level up**:

- `docs/architecture/T2482_PHASE3_DONE.md` — Phase 3 overview (sub-phase status, `/midi/*` surface map, banner table, test coverage, what was NOT done).
- `docs/architecture/MIDI_SERVICES.md` — original T2482 design doc (Phase 3 §4 marks each sub-phase DONE with loop+iter refs).
- `docs/PROJECT_WORKLIST.md` — per-iter detail in the SHIP-loop closing logs (search "SHIP loop {N} closing log" for N = 9, 10, 11, 12, 13, 14, 15).

## What's here

### Phase 1 (P1.1 + P1.2) — backend unification

| Doc | Phase | Loop |
|---|---|---|
| `T2482_P1_1_LIBREMIDI_FOUNDATION.md` | P1.1 design | pre-loop-9 |
| `T2482_P1_1_REALITY_AUDIT.md` | P1.1 audit | mid-loop-9 |
| `T2482_P1_1_MASCHINE_RTMIDI_DEFERRAL.md` | P1.1 deferral note | iter 47 |
| `T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md` | P1.2 design | pre-loop-9 |
| `T2482_P1_2_REALITY_AUDIT.md` | P1.2 audit v1 | iter 71 |
| `T2482_P1_2_REALITY_AUDIT_v2.md` | P1.2 audit v2 | mid-loop-9 |
| `T2482_LOOP9_RTMIDI_REMOVAL_PLAN.md` | python-rtmidi removal plan | loop 9 (iter 81) |

### Phase 3 — canonical surface (per-loop plans)

| Doc | Loop | Coverage |
|---|---|---|
| `T2482_LOOP10_PHASE3_PLAN.md` | Loop 10 | P3.1 + P3.2 + P3.3 (partial) |
| `T2482_LOOP10_ITER97_DEVICES_AUDIT.md` | Loop 10 (mid-loop) | Devices region scope lock |
| `T2482_LOOP11_BINDINGS_PLAN.md` | Loop 11 | P3.4 Bindings region |
| `T2482_LOOP12_ROUTING_PLAN.md` | Loop 12 | P3.5 Routing matrix + structured descriptors |
| `T2482_LOOP13_NETWORK_PORTS_PLAN.md` | Loop 13 | P3.7 Network + P3.8 misc ports |
| `T2482_LOOP14_REFRAMING_PLAN.md` | Loop 14 | P3.6 Transport + P3.9 per-device + P3.10 Brain |

The loop-15 close-out plan (`T2482_LOOP15_CLOSEOUT_PLAN.md`) intentionally stays one level up next to `T2482_PHASE3_DONE.md` because it's the meta-plan for the close-out itself, not Phase 3 sub-phase work.

## Why these are in archive

Per the iter-141 plan D2: archive folder, not delete. These documents capture per-loop design rationale that's no longer needed for day-to-day operation but is valuable when investigating *why* a particular Phase 3 decision was made. The new `T2482_PHASE3_DONE.md` overview provides the high-level summary; come here when the overview's links lead you back.

`git log` + `git blame` continue to work normally on archived files.
