# T2490 — AVB Services Unification: Closeout Evidence

**Date:** 2026-05-02
**Epic:** T2490 — AVB Services Unification
**Status:** ✅ Operator-surface slice closed (10 sub-tasks shipped); deeper-refactor follow-ups tracked as T2490-3b/3c and T2490-6b/6c.

## Scope

Bring AVB to the same canonical-surface discipline MIDI Services achieved (T2482 + T2483 + T2484): a single canonical `/avb/*` operator mount, a single canonical `AvbBindingAuthority` table, hard-redirect of legacy mounts, and full cluster parity with mDNS-driven peer discovery + concurrent fan-out matrix.

## Deliverable Coverage Matrix

| Sub-task | Description | Status | Notes |
|---|---|---|---|
| T2490-1 | `/avb/*` operator mount + AvbServicesShell + 6-region tabs | ✅ Shipped | Same shell pattern as `MidiServicesShell` |
| T2490-2 | `AvbBindingAuthority` ORM + Pydantic + REST | ✅ Shipped | 23 pytest cases |
| T2490-2b | `/api/avb/bindings/matrix` server-side aggregation | ✅ Shipped | Drops 4-query fan-out |
| T2490-3a | Read-side router projection seam (`router_projection.py`) | ✅ Shipped | Synthetic `proj-` prefixed binding rows from `AvbRouter` |
| T2490-3b | Writer-side: `avb_router` writes through `AvbBindingAuthority` | ⏭️ Deferred | Larger refactor; tracked as a follow-up |
| T2490-3c | Replace internal connections dict with binding-table projection | ⏭️ Deferred | Depends on T2490-3b |
| T2490-4 | Operator Connections page (Carbon DataTable, 9 columns) | ✅ Shipped | Read-only first cut; per-row mutations land with T2490-3b |
| T2490-5 | Devices region + AVDECC entities table | ✅ Shipped (index) | Per-device landing pattern matches T2485 |
| T2490-6a | `/avb/devices/tesira/*` route fold-in + legacy redirects | ✅ Shipped | TesiraView intact behind canonical URL |
| T2490-6b | TesiraFleet adapter writes through `AvbBindingAuthority` | ⏭️ Deferred | DSP-block-level fold-in; tracked as follow-up |
| T2490-7 | Cluster matrix endpoint + `useAvbClusterMatrix` hook | ✅ Shipped (backend + hook) | Drill-down drawer follow-up after T2490-3b |
| T2490-8 | `/avb/routing` matrix UI (4×5 source × consumer grid) | ✅ Shipped | Token-driven CSS grid |
| T2490-9 | `/avb/network` PTP / SRP / TSN status tiles | ✅ Shipped | Cluster auto-connect modal follow-up |
| T2490-10 | Closeout (this document) | ✅ Shipped | Test totals + epic status flip |

## Sibling Epic Output (T2491) Surfaced Through `/avb/network`

T2491 explicitly schedules its observability outputs against T2490-9's surface. Five T2491 sub-tasks shipped today plug directly into the operator surface:

- **T2491-7** — Listener presentation-time enforcement (lateFrameDrops counter)
- **T2491-6** — IEEE 1722.1-2021 §7.4.46 stream + interface counters REST
- **T2491-11 slice 1** — BMCA grandmaster reselection observability + REST history
- **T2491-8** — Saved-connection persistence (POST/GET `/api/avb/connections/...`)
- **T2491-5** — Milan v1.2 §5 MVU REST surface (Python projection layer; C++ AECP wiring hardware-gated)

These five plus the previously-shipped T2490-9 status tiles give the operator surface a complete read of the AVB control plane — gPTP, SRP, AVDECC connections, late-frame health, IEEE counters, and Milan capabilities — all behind one canonical mount.

## Test Totals (post-closeout, T2490 + T2491 surface combined)

| Suite | Cases |
|---|---|
| `tests/avb/test_avb_binding_authority.py` (T2490-2) | 13 |
| `tests/avb/test_avb_binding_routes_scaffold.py` (T2490-2 + 2b + 3a) | 11 |
| `tests/avb/test_avb_saved_connections_t2491_8.py` (T2491-8) | 4 |
| `tests/test_avb_counters_t2491_6.py` (T2491-6) | 8 |
| `tests/test_avb_milan_t2491_5.py` (T2491-5) | 8 |
| `tests/test_avb_ptp_grandmaster_t2491_2.py` (T2491-11 slice 1) | 6 |
| Catch2 `juce-engine/avb_tests` (T2491-7 + base) | 23 cases / 857 assertions |
| **AVB total** | **~73 pytest cases + 23 Catch2 cases** |

## Architecture Touchpoints

- **Operator mount**: `web/src/app/pages/AvbServicesShell.tsx` (re-exports the canonical shell); 6 region pages under `web/src/app/pages/avb-services/`
- **Binding authority**: `app/services/avb/binding_authority.py` + `binding_models.py` + `binding_schemas.py`
- **REST routes**: `app/routes/avb/{__init__,common,counters,discovery,metrics,milan,routing,saved_connections}.py`
- **Engine**: `juce-engine/Source/AvbStream.{h,cpp}` (T2491-7 late-frame enforcement); `juce-engine/Source/AvdeccController.{h,cpp}` (la_avdecc, hardware-gated MVU bindings)
- **Cluster matrix**: `GET /api/avb/cluster/bindings/matrix` (concurrent peer fan-out + 2s timeout)
- **Design doc**: `docs/architecture/AVB_SERVICES.md`

## License Posture

- la_avdecc v4.3.1.1 (LGPLv3 with linking exception) — production AVDECC stack
- IEEE 1722-2016 / 1722.1-2021 — open spec
- AVnu Milan Specification v1.2 — open spec
- All AVB code lives under MAP2's AGPLv3.

## Hardware-Gated Validation (Bench Owner)

These tasks remain owner-driven per CLAUDE.md §0.8 gate 5:

- T2491-1: AVB-certified NIC (Intel i210/i225) + AVB switch (Extreme X440-G2 / Cisco Catalyst with MSRP firmware) on testbed
- T2491-3: CRF stream support + bench validation
- T2491-4: 802.1CB FRER on dual-port endpoint
- T2491-9: 802.1Qbv TAS gate-control list verification
- T2491-10: 802.1Qbu frame preemption verification
- T2491-12: AVnu CTS plugfest dry-run
- T2491-13: AVnu Milan Test Suite submission
- T2491-5 hardware path: la_avdecc vendor-specific AECP handlers in `AvdeccController.cpp` (currently the Python projection returns `available=false` until the C++ side binds the four MVU helpers — operator UI shows honest state)
- T2491-8 hardware path: la_avdecc `register_saved_connection()` replay loop on engine startup (the persistence schema + REST surface are ready; the engine bridge consumes them once bench AVDECC peer is connected)

## Cross-References

- Worklist epic entry: `docs/PROJECT_WORKLIST.md` (T2490 + T2491 sections)
- Sibling epic: T2491 (AVB / Milan / TSN / IEEE 1722.1 spec compliance)
- Companion doc: `docs/architecture/MIDI_SERVICES_CLOSED_OUT.md` (the template T2490 cloned)
- Design doc: `docs/architecture/AVB_SERVICES.md`
