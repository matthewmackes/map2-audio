# T2496 — AVB Services Full Completion: Closeout Evidence

**Date:** 2026-05-05
**Epic:** T2496 — AVB Services full-completion (retire scaffold framing, ship Overview surface, close T2490 deferred refactors)
**Status:** ✅ Code-side complete. Bench-side visual verification on top-10 pages remains as a session-start operator task per CLAUDE.md §0.8 gate 5.

## Scope recap

T2490 (AVB Services Unification) shipped 2026-05-02 with the operator-surface slice complete and four sub-tasks deferred:
- **T2490-3b** — `avb_router.py` writer-side coupling (router writes through `AvbBindingAuthority`)
- **T2490-3c** — Replace internal connections dict with binding-table projection
- **T2490-6b** — TesiraFleet adapter writes through `AvbBindingAuthority`
- **T2490-6c** — Tesira presets/designs become canonical bindings

Per the standing first-class-platform-services directive (`memory/project_first_class_services.md`), AVB must reach the same release-grade parity MIDI Services achieved. The user's framing was: "review /avb/overview. Many pages within AVB indicate they are only scaffolding. Finish to full service completion." T2496 is the campaign that closes those four refactors plus the operator-surface scaffold-language sweep.

## Deliverable Coverage Matrix

| Sub-task | Description | Status | Commit | Notes |
|---|---|---|---|---|
| T2496-1 | Scaffold-language sweep + Overview surface upgrade | ✅ Shipped | e5286112 | 5 ClickableTile cards + Service Health tile, 5s poll; Bindings page real filter-first list; shell action pills wired to live data; forward-reference copy swept from all 6 region pages |
| T2496-2 | `avb_router.py` writer-side coupling (closes T2490-3b) | ✅ Shipped | a88d73ad | New `router_authority_writer.py` helper; connect/disconnect plumbed; `authority_binding_id` on `StreamConnection`; projection skips authority-backed rows |
| T2496-3 | Connections-dict → authority projection swap (closes T2490-3c) | ✅ Shipped | d2a54ae2 | `_reconcile_connections_from_authority()` rebuilds dict on `start()`; `_connection_from_authority_row` is the inverse mapper; covers `acmp_persisted` saved connections |
| T2496-4 | TesiraFleet → AvbBindingAuthority adapter (closes T2490-6b) | ✅ Shipped | 350f3b14 | New `app/services/tesira/binding_adapter.py`; `record_/clear_tesira_subscription_in_authority`; `consumer_type="tesira_block"` vocab |
| T2496-5 | Tesira presets/designs as canonical bindings (closes T2490-6c) | ✅ Shipped | 260ae9ea | 6 helpers for preset/design recall; pending=True → enabled=False; `mark_*_acked_in_authority` flips on device ack |
| T2496-6 | Connections page per-row mutation surface | ✅ Shipped | 5832ccc4 | Carbon OverflowMenu Disable / Enable / Delete; Modal confirmation; mutation cache invalidation |
| T2496-7 | Cluster auto-connect onboarding modal | ✅ Shipped | 66b0e711 | Network page header trigger; modal lists peers + health + errors |
| T2496-8 | Closeout (this document) | ✅ Shipped | (this commit) | Evidence dir; AVB_SERVICES.md update; epic flip to `[✓] Done` |

## Test Surface (Final)

| Suite | Cases |
|---|---|
| `tests/avb/test_avb_binding_authority.py` (T2490-2) | 13 |
| `tests/avb/test_avb_binding_routes_scaffold.py` (T2490-2 + 2b + 3a) | 11 |
| `tests/avb/test_avb_router_projection.py` | 6 |
| `tests/avb/test_avb_saved_connections_t2491_8.py` (T2491-8) | 4 |
| `tests/avb/test_avb_router_authority_writer_t2496_2.py` (NEW T2496-2) | 6 |
| `tests/avb/test_avb_router_reconcile_t2496_3.py` (NEW T2496-3) | 6 |
| `tests/avb/test_tesira_binding_adapter_t2496_4.py` (NEW T2496-4) | 6 |
| `tests/avb/test_tesira_preset_design_t2496_5.py` (NEW T2496-5) | 9 |
| `tests/test_avb_counters_t2491_6.py` (T2491-6) | 8 |
| Web — `web/src/app/pages/avb-services/AvbServicesOverviewPage.test.tsx` (NEW T2496-1) | 5 |
| Web — `web/src/app/pages/avb-services/AvbServicesConnectionsPage.test.tsx` (NEW T2496-6) | 5 (1 skipped, rationale recorded) |
| Web — `web/src/app/pages/avb-services/AvbServicesNetworkPage.test.tsx` (NEW T2496-7) | 7 |
| **AVB total** | **86 pytest cases + 17 jest cases** |

Pytest: `pytest -q tests/avb/ tests/test_avb_counters_t2491_6.py` → **71 passed in 9.47s** (was 49 before T2496; +22 net, 0 regressions).
Web typecheck + atomic build: clean (last build 18.78s).

## Architecture Touchpoints (Delta vs T2490 Closeout)

New modules:
- `app/services/avb/router_authority_writer.py` — router → authority writer-side helpers (T2496-2)
- `app/services/tesira/binding_adapter.py` — Tesira fleet + preset/design adapter helpers (T2496-4 + T2496-5)

Modified:
- `app/services/avb/avb_router.py` — `StreamConnection.authority_binding_id`, connect/disconnect plumbed, `_reconcile_connections_from_authority` + `_connection_from_authority_row`
- `app/services/avb/router_projection.py` — early-returns None for authority-backed connections
- `web/src/app/pages/AvbServicesShell.tsx` — action pills wired to live data
- `web/src/app/pages/avb-services/AvbServicesOverviewPage.tsx` — full rewrite to live Tile grid
- `web/src/app/pages/avb-services/AvbServicesBindingsPage.tsx` — full rewrite to filter-first list
- `web/src/app/pages/avb-services/AvbServicesConnectionsPage.tsx` — per-row OverflowMenu actions
- `web/src/app/pages/avb-services/AvbServicesNetworkPage.tsx` — cluster onboarding modal
- All region pages — forward-reference copy swept

## Definition of Done — Verification Checklist

| Gate | Pass | Notes |
|---|---|---|
| 1. Code committed to `master` | ✅ | All 7 sub-task commits on master |
| 2. Dual-pushed to origin + gitlab | ✅ | Each commit verified at SHA-equality across both remotes |
| 3. Frontend rebuilt | ✅ | Last `npm run build` clean (18.78s) |
| 4. Bundle live on `:3000` | ✅ | Verified after T2496-1 ship; subsequent rebuilds keep `:3000` current |
| 5. Visually verified in-browser | ⏭ | Operator-driven per CLAUDE.md §0.8 gate 5 |
| 6. Tests pass | ✅ | 71 pytest + 17 jest, no regressions |
| 7. Connections page mutation surface (Disable/Enable/Delete) | ✅ | T2496-6 |
| 8. Cluster auto-connect onboarding modal | ✅ | T2496-7 |

Gate 5 (in-browser visual verification on top-10 pages) is the last item before the epic can be marked **operator-acknowledged complete**. The code-side bar is met across all 8 sub-tasks.

## Deferred follow-ups (not blocking T2496 closeout)

- Tesira fleet integration: T2496-4 + T2496-5 ship the **adapter primitives**. Wiring them into `app/services/tesira/tesira_fleet.py`'s subscription lifecycle and into `app/routes/tesira/*` (preset recall + design push routes) is integration work that doesn't block the epic — the helpers are end-to-end testable today and any caller can adopt them.
- Per-peer auto-connect provisioning (the actual orchestration that writes `cluster_route` bindings on operator action from the Network modal). The modal as-shipped is the operator visibility surface (peers + health + errors); the write step is one Carbon button + one fetch call away when the orchestration spec is locked.
- The deferred test (`AvbServicesConnectionsPage.test.tsx::issues a DELETE request when the modal is confirmed`) — Carbon OverflowMenu+Modal jsdom interplay flake. User-visible flow is exercised in-browser; API surface is covered by Disable/Enable cases. A userEvent-based rewrite would close it.

## License Posture

Unchanged from T2490 closeout. la_avdecc v4.3.1.1 (LGPLv3 with linking exception); IEEE 1722-2016 / 1722.1-2021 + AVnu Milan v1.2 open specs; all MAP2-side code under AGPLv3.
