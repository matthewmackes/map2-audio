# T2483 SHIP loop 16 — polish bundle pick + plan (iter 151)

**Date:** 2026-05-02 (iter 151, SHIP loop 16 start; first non-T2482 loop).
**Goal:** First substantive loop on the T2483 follow-up bundle. Pick the highest-impact sub-items from the iter-148 catalogue and ship them. Per the T2483 DoD, the bundle requires ≥3 of 10 sub-items shipped per loop; loop 16 commits to **5 of 10**.

---

## 1. T2483 sub-item triage (iter 151 audit)

The iter-148 bundle catalogues 10 sub-items. Triage by impact + iteration cost:

| ID | Item | Impact | Cost | Pick? |
|---|---|---|---|---|
| T2483-1 | Per-row binding mutation surface on `/midi/devices/:profileKey` | high (closes the Devices region read-only stub) | medium (reuse iter-105 BindingEditDrawer) | ✅ pick |
| T2483-2 | Dedicated `MidiServicesConnectionsPage` sibling page | medium (closes the only remaining MidiHub-routed entry under /midi/*) | low (iter-122 sibling-page pattern) | ✅ pick |
| T2483-3 | `useSetShellWindow` calls in 6 sibling pages | low (cosmetic) | low | ✅ pick |
| T2483-4 | source-type filter strategy on the iter-103 Bindings list page | medium (lets routing-matrix cells preserve source_type) | medium | ✅ pick |
| T2483-5 | per-source-type structured-editor extensions (live MIDI-learn helper) | medium | high (needs WebSocket + UI redesign) | ◯ defer to loop 17+ |
| T2483-6 | Lift `MidiServicesEventsPage.selectedEventListId` to URL query | low | low | ✅ pick |
| T2483-7 | `MidiServicesCrossLinkBanner` dismissibility flag + localStorage | low (cosmetic) | low | ◯ defer (no operator complaint yet) |
| T2483-8 | Server-side `/api/midi/bindings/matrix` endpoint | high (10× fewer queries on every poll) | high (backend route + pytest) | ◯ defer to loop 17+ |
| T2483-9 | Cluster peer matrix overlay | medium | high (needs cluster discovery wiring) | ◯ defer to loop 17+ |
| T2483-10 | Full interactive Bindings page tests | medium | high (Carbon Modal + QueryClient mocking) | ◯ defer to loop 17+ |

**Loop 16 picks: T2483-1, T2483-2, T2483-3, T2483-4, T2483-6.** Each is a small, atomic change with low blast radius. Loop 17 would carry T2483-5/8/9/10 (the four high-cost items) + T2483-7 if operator feedback materializes.

## 2. Loop 16 scope (iters 151-160)

| Iter | Sub-phase | Goal |
|---|---|---|
| 151 | (this doc) | Audit + plan |
| 152 | T2483-1 part A — DevicePage detail mutation | Add an "Edit binding" OverflowMenu per row in `MidiServicesDevicePage`'s bindings DataTable. Wire it to the existing `BindingEditDrawer`. |
| 153 | T2483-1 part B — DevicePage delete + enable/disable toggles | Match the iter-104 BindingsPage row-action surface: per-row Toggle + delete-confirm Modal. |
| 154 | T2483-2 — `MidiServicesConnectionsPage` sibling | New page mounting the same `MidiHubConnectionsPanel` components. App.tsx route flip. |
| 155 | T2483-3 — `useSetShellWindow` in 7 sibling pages | Network/Presets/Events/Processing/Lab/Transport/Connections all call `useSetShellWindow` with the right `Platform / MIDI Services / *` kicker. |
| 156 | T2483-4 part A — source-type filter in iter-103 list | Add `'source'` strategy to the Bindings page filter form. URL-syncs `?source_type=midi_cc`. |
| 157 | T2483-4 part B — Routing matrix cells preserve source_type | Iter-118 click-through now navigates to `/midi/bindings?consumer_type=X&source_type=Y` instead of just `?consumer_type=X`. |
| 158 | T2483-6 — EventsPage selectedEventListId URL-synced | Lift to React Router `useSearchParams` so navigation away + back preserves the selection. |
| 159 | Tests | Smoke + unit tests for the 5 sub-items shipped. Total midi-services jest coverage growth from 64 → ~75 tests. |
| 160 | Roll-up | SHIP loop 16 closing log + T2483 status update (5 of 10 DONE, 5 deferred to loop 17+). |

---

## 3. Key design decisions (locked for loop 16)

### D1: Reuse iter-105 BindingEditDrawer for T2483-1
The iter-105 drawer already handles single-binding edit. iter 152 just adds the row-action OverflowMenu to the Devices detail page that opens it.

### D2: T2483-2 follows the iter-122 D1 pattern
Same as Network/Presets/Events/Processing/Lab — the new `MidiServicesConnectionsPage` imports the existing panels directly and wraps them in Carbon Section/Layer chrome.

### D3: T2483-3 is one shared call, not 7 copies
A small helper hook `useMidiServicesShellWindow(region: string)` factors out the `useSetShellWindow` boilerplate so each sibling page is one line.

### D4: T2483-4 backend-side semantics
The backend already accepts `source_type` as a filter parameter via the iter-102 `BindingListFilter` — but only as a follow-up filter, not the primary strategy. iter 156 confirms by reading `app/services/midi/routes.py:list_bindings` whether source_type alone is a valid filter; if not, iter-156 combines source_type with the existing consumer/device/scope strategy.

### D5: T2483-6 URL-sync is opportunistic
Carry-over selection across navigation matters when an operator drills into an event then comes back. If the iter-103 URL-sync pattern doesn't drop in cleanly, defer to iter-158 retry rather than fight Carbon's controlled-component plumbing.

### D6: Carbon-only + dual-push every commit (continued)

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `BindingEditDrawer` reuse breaks because it expects different parent state | low | The drawer takes `bindingId` + `open` + `onClose` props — same shape works for Devices detail page. Verified at iter 152. |
| Carbon Modal portal interaction with React Router lazy-loaded route boundary | low | The iter-104 BindingsPage already does this without issue. |
| Source-type filter alone returns 400 from the backend | medium | Iter 156 first reads the backend route to confirm filter-precedence rules. If source_type alone is rejected, the strategy adds it as an OR-modifier on top of consumer/device/scope. |
| EventsPage URL-sync collides with the existing iter-103 BindingsPage `?consumer_type` URL params | low | Different route paths (`/midi/events` vs `/midi/bindings`), separate `useSearchParams` instances. |
| useSetShellWindow shape changes between MidiHub and the sibling pages | medium | Iter 155 reads the iter-122 `useSetShellWindow` calls in the 5 prior sibling pages first; if any are present, that's the shape. If none, iter 155 reads the original MidiHub pages for the contract. |

---

## 5. Cross-references

- T2483 worklist entry: `docs/PROJECT_WORKLIST.md` (search "ID: T2483")
- T2482 close-out: `docs/architecture/T2482_PHASE3_DONE.md`
- iter-105 drawer: `web/src/app/pages/midi-services/BindingEditDrawer.tsx`
- iter-118 routing matrix click-through: `web/src/app/pages/midi-services/MidiServicesRoutingPage.tsx`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
