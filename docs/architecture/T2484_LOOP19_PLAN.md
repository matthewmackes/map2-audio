# T2484 SHIP loop 19 — cluster MIDI peer wiring plan (iter 181)

**Date:** 2026-05-02 (iter 181, SHIP loop 19 start; first non-T2483 loop).
**Goal:** Wire the iter-177 `usePeerMatrix` scaffold to a real backend that aggregates MIDI binding counts across cluster peers. Loop 19 is **T2484-1 + T2484-2** (the per-peer matrix endpoint + frontend hook flip). Loop 20 is **T2484-3 + T2484-4** (peer health surface integration + tests).

**Epic ID:** **T2484** — Cluster MIDI peer surface (the real backend behind T2483-9's scaffold).
**Why:** T2483-9 shipped a placeholder hook (`usePeerMatrix → {}`) so the routing matrix's `+N` purple badge UI was ready but stayed hidden. T2484 wires it to live cluster data so cluster operators see actual peer counts.

---

## 1. Existing infrastructure (iter 181 audit)

### Backend
- `app/services/node_discovery_service.py` — `NodeDiscoveryService` exposes `get_topology()` (local + peers), `resolve_known_node(node_id)` returning `KnownNodeEndpoint(host, hostname, api_url)`.
- `app/middleware/cluster_proxy.py` — `ClusterProxyMiddleware` proxies any `?node_id=X` request to that peer's `api_url`. EXCLUDES `/api/cluster/*`.
- `app/services/midi/routes.py:get_bindings_matrix` (iter 162) — returns local-node `BindingsMatrixResponse`.
- `httpx` is the existing async HTTP client (used in `node_discovery_service.py`).

### Frontend
- `useRoutingMatrix.ts` (iter 164) — single query against `/api/midi/bindings/matrix`, returns local-only `RoutingMatrix`.
- `usePeerMatrix.ts` (iter 177) — placeholder hook returning `{ peers: {}, totalPeerBindings: 0, hasPeerData: false }`.
- `MidiServicesRoutingPage` (iter 118 + iter 177) — renders `+N` purple Tag badge when `peerMatrix.peers[src]?.[cons] > 0`.

The frontend is fully prepared. The work is backend route + thin frontend swap.

---

## 2. Loop 19 scope (iters 181-190) — T2484-1 + T2484-2

| Iter | Sub-phase | Goal |
|---|---|---|
| 181 | (this doc) | Audit + plan |
| 182 | Backend cluster matrix route | New `GET /api/midi/cluster/bindings/matrix` — fan out to each known peer's `/api/midi/bindings/matrix`; collect into `{ local, peers: {node_id: BindingsMatrixResponse}, errors: {node_id: string} }` shape. |
| 183 | Backend pytest | Cases: empty cluster (no peers), one healthy peer, one unreachable peer (timeout), peer returns malformed payload. Mock `NodeDiscoveryService` + httpx. |
| 184 | Frontend client + types | `midiBindingsApi.clusterMatrix()` + `ClusterBindingsMatrixResponse` type. |
| 185 | Frontend hook flip | `usePeerMatrix` calls the new endpoint via TanStack Query; aggregates per-cell sums across all peers (NOT including local — local is already covered by `useRoutingMatrix`). 5s `refetchInterval` to match the rest of midi-services. |
| 186 | Frontend hook tests | Update `usePeerMatrix.test.tsx`: mock fetch returning the new payload; assert peer aggregation correctness. |
| 187 | RoutingPage integration test | Existing iter-178 RoutingPage tests assert peer-badge rendering — they should keep passing without changes since `usePeerMatrix` is mocked there. Add one new case: hook reports `hasPeerData=true`, badge appears for the right cells. |
| 188 | Worklist entry | Open T2484 entry in `PROJECT_WORKLIST.md` with the 4 sub-items + this loop's status. |
| 189 | Verification | Build + jest + pytest sweep + bundle hash check. |
| 190 | Roll-up | SHIP loop 19 closing log + recommendation for loop 20. |

---

## 3. Loop 20 scope (iters 191-200) — T2484-3 + T2484-4

Locked at iter 181 to avoid plan-drift mid-loop:

| Iter | Sub-phase | Goal |
|---|---|---|
| 191 | T2484-3 plan + audit | Per-cell peer drill-down: clicking a peer-badged cell opens a small drawer listing which peer node has which count. |
| 192 | T2484-3 hook + drawer | New `PeerCellDrillDownDrawer.tsx`. Uses node-display utilities from `web/src/app/utils/nodeDisplay.ts`. |
| 193 | T2484-3 RoutingPage wiring | Click-handler on peer badge opens drawer; cell click still navigates to filtered Bindings page. |
| 194 | T2484-3 tests | Drawer renders peer rows; clicking outside closes. |
| 195 | T2484-4 — backend peer-health field | Extend the iter-182 cluster matrix response with per-peer `health: 'ok' | 'warn' | 'unreachable'` from `NodeHealthService`. |
| 196 | T2484-4 backend tests | Pytest: peer with health='warn' surfaces in payload; unreachable peer surfaces as 'unreachable'. |
| 197 | T2484-4 frontend health visualization | Drawer rows show health Tag (green/amber/red) per peer. |
| 198 | T2484-4 tests | Drawer health-tag tone reflects health value. |
| 199 | Verification + worklist update | Same gate pattern as iter 189; mark T2484 4-of-4 sub-items DONE. |
| 200 | Roll-up + **T2484 EPIC DONE** | SHIP loop 20 closing log. |

---

## 4. Key design decisions (locked for both loops)

### D1: New `/api/midi/cluster/bindings/matrix` route, NOT proxy each peer client-side
Per CLAUDE.md "investigate before adding state": the backend already has `NodeDiscoveryService` + httpx; doing the fan-out server-side keeps the frontend thin AND lets future loops add caching at one layer.

### D2: Cluster matrix excludes the local node
`useRoutingMatrix` already covers local. The peer overlay's job is to show "what's ELSE on the cluster" — including local would double-count. The iter-185 hook subtracts/skips the local entry.

### D3: Peer fan-out is bounded + tolerant
- `httpx` calls with 2s timeout per peer (matches `NodeDiscoveryService.REMOTE_TIMEOUT_S`).
- Failed peers populate the `errors` map but don't fail the whole request.
- Empty peers → empty matrix → frontend renders no badge (correct; same as today).

### D4: T2484-3 drawer is read-only
Per the iter-118 D5 (matrix cells are click-throughs, not inline editors): the per-peer drill-down shows "peer X has 5 bindings here" + a link to that peer's bindings page (via the existing `?node_id=X` proxy URL pattern). No mutation surface in the drawer.

### D5: T2484-4 reuses existing `NodeHealthService`
No new backend service. The route handler reads health for each peer in the same loop body that fetches its matrix.

### D6: Carbon-only + dual-push every commit (continued)

### D7: Two-loop scope is FIRM
Loop 19 ships T2484-1 + T2484-2; loop 20 ships T2484-3 + T2484-4. T2484 closes at iter 200.

---

## 5. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Peer fan-out is slow under high cluster cardinality (e.g. 16 nodes) | medium | iter 182 issues all peer requests concurrently via `asyncio.gather`; total wall-clock = max peer latency, not sum. With 2s timeout per peer, worst-case wall-clock is 2s. |
| `ClusterProxyMiddleware` accidentally catches the new route | low | The middleware excludes `/api/cluster/*`; the new route lives at `/api/midi/cluster/bindings/matrix` — outside that prefix (the middleware only matches `?node_id=X` query param anyway). Confirm in iter 182. |
| `node_discovery_service` is a Singleton; tests can't easily mock it | medium | Iter 183 mocks via `monkeypatch` on the module attribute (existing pattern in `tests/test_node_discovery*.py`). |
| The aggregated payload is large with many peers + many cells | low | Each cell is `{count, enabled_count}` ≈ 2 ints. 12 sources × 10 consumers × N peers = 120N cells. At 16 peers, ≈ 1920 small JSON objects = trivial. |
| iter-177 hook signature change breaks iter-178 mocks | medium | iter 186 explicitly updates the existing `usePeerMatrix.test.tsx` mocks; iter 187 confirms RoutingPage tests stay green. |

---

## 6. Cross-references

- T2483-9 scaffold (the surface this epic populates): `web/src/app/pages/midi-services/usePeerMatrix.ts` + iter 177-178 commits
- iter-162 backend matrix route: `app/services/midi/routes.py`
- iter-164 frontend matrix hook: `web/src/app/pages/midi-services/useRoutingMatrix.ts`
- node discovery infrastructure: `app/services/node_discovery_service.py`
- cluster proxy middleware: `app/middleware/cluster_proxy.py`
- node display utilities (T2484-3 will use): `web/src/app/utils/nodeDisplay.ts`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
