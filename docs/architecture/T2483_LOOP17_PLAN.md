# T2483 SHIP loop 17 — deferred items pick + plan (iter 161)

**Date:** 2026-05-02 (iter 161, SHIP loop 17 start).
**Goal:** Pick from the 5 T2483 sub-items deferred in loop 16. Per the iter-160 closing log recommendation, the highest-impact deferred items are T2483-8 (server-side matrix endpoint), T2483-10 (interactive Bindings tests), and T2483-5 (live MIDI-learn helper). **Loop 17 ships T2483-8 + T2483-10 + T2483-7 (banner dismissibility — small but operator-facing).**
**Selected approach:** prioritize backend leverage (T2483-8 changes one query into one row in dist/) + test-coverage closure (T2483-10) + a small UX polish (T2483-7) over the higher-cost items (T2483-5 needs WebSocket + UI redesign; T2483-9 needs cluster discovery wiring).

---

## 1. Picked sub-items + scoping

### T2483-8 — server-side `/api/midi/bindings/matrix` endpoint

**Today**: `useRoutingMatrix` hook fans out 10 separate TanStack Query requests (one per `BindingConsumerType`) every 5s poll.
**After**: one request to a new endpoint that does the source × consumer aggregation server-side.

**Backend work** (Python, `app/services/midi/`):
- New endpoint `GET /api/midi/bindings/matrix` returns `{ matrix: { [source_type]: { [consumer_type]: { count, enabled_count } } }, total_bindings: number }`.
- Implementation: read all bindings via the authority (no filter — the matrix is by definition unfiltered), aggregate in Python.
- Add a pytest case to `tests/test_midi_routes.py` (or wherever the existing route tests live).

**Frontend work** (`useRoutingMatrix.ts`):
- Replace `useQueries` fan-out with a single `useQuery` against `/api/midi/bindings/matrix`.
- Schema mirrors the existing client-side aggregation shape so `MidiServicesRoutingPage` doesn't change.
- `staleTime: 0`, `refetchInterval: 5000` (same cadence).

### T2483-10 — interactive Bindings page jest tests

**Today**: 0 interactive tests on `MidiServicesBindingsPage`. The iter-119 unit tests cover descriptor catalogue + matrix aggregation, but the filter form, mutation flows, and modal-open paths are uncovered.
**After**: `MidiServicesBindingsPage.test.tsx` exercises:
- Filter strategy switching (consumer/device/scope/none) renders the right value-input fields.
- URL sync round-trips the filter to `?consumer_type=...` etc.
- Source-type filter (iter 156) narrows the rendered rows.
- Add-binding button opens the create drawer.
- Per-row OverflowMenu Edit opens the edit drawer.
- Per-row Toggle calls the right mutation (mocked).
- Delete-confirm Modal opens + Cancel closes without calling the API.

**Mocking approach**:
- Mock the `midiBindingsApi` client at the module level (same pattern as iter-108 `useDevicePackBindings.test.tsx`).
- Wrap in `MemoryRouter` + `QueryClientProvider`.
- The Modal portal works inside jsdom per existing midi-services smoke tests.

### T2483-7 — banner dismissibility flag + localStorage persistence

**Today**: `MidiServicesCrossLinkBanner` is non-dismissible; persistent on every per-device page visit.
**After**: optional Carbon close button on the InlineNotification. When dismissed, persist `{profileKey: dismissed_at}` in `localStorage['midi-services.banner-dismissed']`. Banner suppressed when its profileKey is in the map.

---

## 2. Loop 17 scope (iters 161-170)

| Iter | Sub-phase | Goal |
|---|---|---|
| 161 | (this doc) | Audit + plan |
| 162 | T2483-8 backend | New `GET /api/midi/bindings/matrix` route in `app/services/midi/routes.py`. Aggregation logic + Pydantic shape. |
| 163 | T2483-8 backend tests | New pytest cases against the matrix endpoint. |
| 164 | T2483-8 frontend | `useRoutingMatrix.ts` refactored to single `useQuery` against the new endpoint. |
| 165 | T2483-8 frontend tests | Existing `useRoutingMatrix.test.tsx` updated to mock the new endpoint shape. |
| 166 | T2483-7 banner dismissibility | `MidiServicesCrossLinkBanner` accepts `dismissible` prop + uses localStorage. |
| 167 | T2483-10 part A — Bindings filter form tests | Mock midiBindingsApi + render BindingsPage; assert filter-strategy switching + URL sync. |
| 168 | T2483-10 part B — Bindings mutation flow tests | Add-binding button opens create drawer; per-row Edit/Toggle/Delete actions fire. |
| 169 | Verification | Full midi-services jest run + pytest run for the new backend route. |
| 170 | Roll-up | SHIP loop 17 closing log. |

---

## 3. Key design decisions (locked for loop 17)

### D1: T2483-8 backend is the right place to aggregate
The matrix is genuinely a server-side concern: the source-of-truth for binding counts is the authority. Loop 12 iter 117 shipped a client-side fan-out as an interim — loop 17 closes the gap.

### D2: T2483-8 frontend stays compatible with the legacy client-side aggregation
The hook's return shape (`matrix`, `rowTotals`, `colTotals`, `totalBindings`, `isLoading`, `isError`) doesn't change. The new endpoint emits a slightly different wire shape but the hook normalizes. This means `MidiServicesRoutingPage.tsx` is untouched in iter 164.

### D3: T2483-10 mocks the API client, not fetch
Iter 108 mocked `globalThis.fetch`. Iter 167-168 mocks `midiBindingsApi` at the module level — same pattern as the existing `MidiHubLabPage.test.tsx`. Cleaner because mutation tests need to assert on the call shape, not the URL.

### D4: T2483-7 banner state lives in localStorage, not a TanStack-Query'd backend table
Banner dismissal is purely client-local + per-device. Per CLAUDE.md "investigate before adding state" — this is operator UI preference, not platform state. localStorage is the right plane.

### D5: Carbon-only + dual-push every commit (continued)

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| New backend endpoint breaks the existing fan-out hook before iter 164 lands | low | Iter 162 ships the new endpoint additively; iter 164 swaps the hook. The old fan-out keeps working during the cutover. |
| Pytest setup for the matrix endpoint requires DB fixtures | medium | Iter 163 reads existing midi route tests to see the fixture pattern. If DB fixtures are heavy, the test asserts on the route shape with a mocked authority. |
| Carbon Modal portal interaction inside jest mutation tests | medium | The iter-129/139 smoke tests already mount Modal-containing pages; loop-13/14 confirmed the portal works in jsdom. iter 167-168 follow the same jest-dom + render pattern. |
| Banner dismissibility's localStorage key collides with future flag usage | low | Use a single namespaced key `midi-services.banner-dismissed` (per the iter-7 D4 D5 reading: feature-flag-style namespacing). |

---

## 5. Cross-references

- T2483 worklist entry: `docs/PROJECT_WORKLIST.md`
- iter-160 SHIP loop 16 closing log: where loop 17 was queued
- iter-117 useRoutingMatrix client-side fan-out (will be replaced)
- iter-103 BindingsPage (test target for T2483-10)
- iter-133 MidiServicesCrossLinkBanner (T2483-7 target)
- backend authority: `app/services/midi/routes.py` + `authority.py`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
