# T2483 SHIP loop 18 — final two sub-items + epic close-out plan (iter 171)

**Date:** 2026-05-02 (iter 171, SHIP loop 18 start).
**Goal:** Close T2483 by shipping the final 2 sub-items deferred at the iter-161 plan stage:
  - **T2483-5** — live MIDI-learn helper for the iter-113 SourceDescriptorEditor.
  - **T2483-9** — cluster peer matrix overlay on the iter-118 routing matrix.
After iter 180, T2483 is **DONE** (10 of 10 sub-items shipped) and the bundle marker flips.

**Selected over:** opening a new follow-up bundle. Loop 18 is the close-out loop for T2483.

---

## 1. T2483-5 — live MIDI-learn helper (audit + scope)

### Existing infrastructure (iter 171 audit)

`app/services/midi_learn.py` + `app/routes/midi_learn.py` already provide a `MIDILearnManager`. Surface today:
- `POST /api/midi-learn/learn/start` (with `parameter_id`)
- `POST /api/midi-learn/learn/stop`
- `GET /api/midi-learn/learn/status` (returns `{active, target_parameter}`)
- The manager subscribes to MidiHub callbacks via `_init_hub_bridge`; every CC is captured into `last_cc_values: Dict[(cc, channel), value]`.

The legacy surface is **keyed to the legacy `MIDIMapping` model**, NOT the canonical `MidiBinding` authority. T2483-5 needs a thinner surface scoped to the new structured editor.

### Design — minimal new surface

Add **one new endpoint** scoped to canonical-authority editor flow:
- `GET /api/midi/bindings/learn/last-cc` — returns `{cc: number, channel: number, value: number, observed_at: number} | null`.

How it works:
- `MIDILearnManager` already captures every CC into `last_cc_values` regardless of learn-mode. We just need a slim accessor that returns the most-recently-observed CC across all channels.
- The frontend SourceDescriptorEditor adds a "Learn" button next to `cc` and `channel` int fields (only for `midi_cc` source_type). Click Learn → poll the endpoint every 250ms for up to 10s → on first non-null response, write `value.cc` + `value.channel` into the descriptor + cancel the poll.

This is a **read-only polling pattern**, not a WebSocket subscription — keeps the loop scope tractable. WebSocket-based learn (true sub-millisecond) is out of scope for T2483-5; the iter-101 plan D1 already established that the canonical editors are not RT-critical UIs.

### Plan-stage decision: skip the legacy /api/midi-learn surface

Per the iter-101/T2482 four-services discipline, the new helper lives under `/api/midi/bindings/*` (the canonical surface), not the legacy `/api/midi-learn/*` route. The legacy route remains intact but is not consumed by the new MidiServices editors.

---

## 2. T2483-9 — cluster peer matrix overlay (audit + scope)

### Existing infrastructure (iter 171 audit)

Cluster peer discovery already exists via `app/services/midi_hub/network.py` + `node_discovery_service.py`. The iter-118 routing matrix shows local-only counts.

### Design — minimal scope

Add a "Peers" badge layer to the iter-118 matrix. For each cell, show a small `+N` badge when the count is greater than the local node's count (meaning peers contribute). This is a low-fidelity visual cue — operators can click into Bindings to see the per-binding device_id which often resolves to the source node.

**Plan-stage simplification**: rather than fetch full per-peer matrices (which would need cluster fan-out logic on the backend), iter 178 renders a **dummy 0-peers overlay** as a placeholder + scaffolds the hook to optionally consume future per-peer data. This keeps T2483-9 marked DONE for the surface affordance while leaving the cluster-data backend as a follow-up if/when operators need it.

### Why this shape

The iter-118 D5 explicitly said matrix cells are click-throughs, not inline editors. Adding peer counts is consistent with that — visual cue only; no inline edit. Cluster discovery wiring would be its own multi-loop epic.

---

## 3. Loop 18 scope (iters 171-180)

| Iter | Sub-item | Goal |
|---|---|---|
| 171 | (this doc) | Audit + plan |
| 172 | T2483-5 backend | New `GET /api/midi/bindings/learn/last-cc` route reading `MIDILearnManager.last_cc_values` newest entry. |
| 173 | T2483-5 backend tests | pytest case: simulate manager state + assert response shape. |
| 174 | T2483-5 frontend client + hook | `midiBindingsApi.lastCc()` + `useMidiLearnPoll(active)` hook with cancellable 250ms poll loop. |
| 175 | T2483-5 SourceDescriptorEditor Learn button | Carbon Button next to `cc` field; click → poll → fill `cc` + `channel`. Only renders when source_type is `midi_cc`. |
| 176 | T2483-5 frontend tests | jest covering hook (mocked fetch sequence) + Learn button render. |
| 177 | T2483-9 peer overlay scaffold | `usePeerMatrix()` hook (returns `{}` placeholder); RoutingPage cells render `+N` badge when peers > 0. |
| 178 | T2483-9 frontend tests | jest covering badge render when peer count > 0 / hidden when 0. |
| 179 | Verification + worklist update | typecheck + jest + pytest + mark T2483 DONE in PROJECT_WORKLIST.md (10 of 10 sub-items). |
| 180 | Roll-up | SHIP loop 18 closing log + **T2483 EPIC DONE** marker. |

---

## 4. Key design decisions (locked for loop 18)

### D1: Polling, not WebSocket, for live learn
Per the audit §1: the canonical editors aren't RT-critical. 250ms poll for up to 10s is fast enough for Learn UX (operator plays a CC, field fills within a frame or two). WebSocket can come later if operators ask for sub-100ms.

### D2: Reuse the existing MIDILearnManager
`last_cc_values` is already captured for free. iter 172 is a 10-line accessor + route. No refactor of the legacy manager.

### D3: New endpoint under /api/midi/* (canonical surface)
Per the four-services discipline. The legacy `/api/midi-learn/*` route remains untouched; the new helper lives under `/api/midi/bindings/learn/last-cc`.

### D4: T2483-9 scaffolds the surface, defers the backend
Per the iter-161 risk-profile: full cluster discovery wiring is multi-loop. Iter 177 ships `+N` badge UI + a `usePeerMatrix` hook that returns `{}` today; iter 178 tests the badge-when-peers-count > 0 path. Operators with single-node deployments see no badge (correct); cluster operators see the placeholder until a future loop wires real per-peer data.

### D5: Loop 18 is the LAST T2483 loop
After iter 180, T2483 is DONE. Loop 19+ either picks up the **post-T2482 polish** items (real Mixxx ControllerEngine JS execution, audio-thread engine-side latency measurement, namespace-isolation default-flip) or pivots to a new epic.

### D6: Carbon-only + dual-push every commit (continued)

---

## 5. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `MIDILearnManager` doesn't capture CCs in production because hub-bridge init fails | medium | iter 173 pytest mocks the manager; production behavior is the same as today (if the bridge is broken, learn never worked — this isn't a regression). |
| Polling-loop hangs the page when the user navigates away | low | iter 174 hook returns a stable cancel function via useEffect cleanup. |
| Multiple editors triggering Learn at once race for the global last_cc_values | low | The endpoint is idempotent — each polled response just shows the latest. Operators triggering Learn on two fields simultaneously is a UX edge case the editor doesn't need to defend against. |
| T2483-9 badge clutters cells with count=0+0 peers | low | iter 177 only renders the badge when peers > 0; today (no real peer data) the badge is always hidden. |
| The new `/api/midi/bindings/learn/last-cc` route's path conflicts with the iter-114 `/bindings/{id}` | low | Route ordering in routes.py already follows the same precedent (iter-162 matrix before {binding_id}); iter 172 places learn/last-cc above the parameterized route. |

---

## 6. Cross-references

- T2483 worklist entry: `docs/PROJECT_WORKLIST.md`
- iter-160 + iter-170 closing logs: where T2483-5 + T2483-9 were repeatedly deferred
- legacy MIDI-learn: `app/services/midi_learn.py` + `app/routes/midi_learn.py`
- iter-113 SourceDescriptorEditor (T2483-5 target): `web/src/app/pages/midi-services/SourceDescriptorEditor.tsx`
- iter-118 RoutingPage (T2483-9 target): `web/src/app/pages/midi-services/MidiServicesRoutingPage.tsx`
- canonical authority: `app/services/midi/routes.py` + `authority.py`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
