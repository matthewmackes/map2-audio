# T2482 SHIP loop 11 — Phase 3 P3.4 Bindings region plan (iter 101 audit)

**Date:** 2026-05-01 (iter 101, SHIP loop 11 start).
**Goal:** Land the foundational pieces of P3.4 — the **Bindings region** of MIDI Services. Like loop 10, 10 iters can't deliver every sub-feature; loop 11 ships the **filter-first list + read detail + minimal create + enable/disable toggle**. Full mutation authoring (replace source/target descriptors, batch ops, version history) queues for loop 12+.
**Selected over:** P3.5 Routing region (per the iter-100 closing log recommendation).

---

## 1. Backend contract (no changes in loop 11)

The canonical authority is already complete. The backend ships every endpoint loop 11 needs:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/midi/bindings/count` | Global total (already used by Overview) |
| `GET` | `/api/midi/bindings` | List, filter-required (consumer / device / scope) |
| `GET` | `/api/midi/bindings/{id}` | Read one |
| `POST` | `/api/midi/bindings` | Create (Pydantic `MidiBindingCreate`) |
| `PATCH` | `/api/midi/bindings/{id}` | Partial update (Pydantic `MidiBindingUpdate`) |
| `DELETE` | `/api/midi/bindings/{id}` | Hard delete |
| `POST` | `/api/midi/bindings/{id}/enable` | Enable convenience |
| `POST` | `/api/midi/bindings/{id}/disable` | Disable convenience |

**Critical filter constraint** (per `app/services/midi/routes.py:108`): `GET /bindings` returns 400 if the request carries no filter. The frontend MUST commit to a filter before fetching. This shapes the iter-103 list page architecture.

**Vocabularies** (from `app/services/midi/schemas.py`):
- `BindingConsumerType`: snapshot, brain_slot, plugin_param, global_param, performance_preset, device_pack, transport, tesira_ttp, gpio, macro
- `BindingSourceType`: midi_cc, midi_note, midi_pc, midi_nrpn, midi_sysex, midi_clock, midi_aftertouch, midi_pitchbend, midi_channel_pressure, ttp_subscription, gpio_input, string_command
- `BindingTargetType`: engine_param, engine_command, snapshot_action, brain_slot, device_command, macro, gpio_output
- `BindingScope`: global, snapshot, node, cluster

---

## 2. Loop 11 scope (iters 101-110)

| Iter | Sub-phase | Goal |
|---|---|---|
| 101 | (this doc) | Audit + plan |
| 102 | API client | New `web/src/map2/clients/midiBindings.ts` — TanStack-Query-friendly fetch wrappers around all 8 endpoints. Typed against the existing schema vocabularies. |
| 103 | Filter-first list page | New `MidiServicesBindingsPage.tsx` at `/midi/bindings` — Carbon `Form` with consumer-type / device / scope dropdown filter, `Search` for free-text consumer_id, then a Carbon `DataTable` of matching binding rows. Empty state guides the operator to pick a filter. |
| 104 | DataTable polish | Inline enable/disable toggle (`Toggle`) per row; edit + delete `OverflowMenu` per row. Edit + delete are wired to a confirm modal; toggle posts to /enable or /disable directly. |
| 105 | Detail/edit modal | `BindingEditDrawer.tsx` — Carbon `Modal` shell with read-only fields (binding_id, timestamps, author) + editable fields (consumer_label, source_descriptor JSON, target_descriptor JSON, scope, scope_id, device_id, enabled). Form validation against the Pydantic vocabularies. |
| 106 | Create flow | "Add binding" button on the list page opens `BindingCreateDrawer.tsx` — same Modal shell, all fields editable, consumer-type-aware default descriptors. |
| 107 | Routing region scaffold | NEW `/midi/routing` page — placeholder for P3.5 (deferred to loop 12+). This iter just lands the route mount + Carbon shell so the nav has a placeholder. |
| 108 | Tests | Vitest test suites for the new pages: BindingsPage filter validation, DataTable rendering, Edit modal field validation. |
| 109 | Overview integration | Wire the Overview page Tile cards as deep-links: clicking Bindings card navigates to `/midi/bindings`. Clicking Routing navigates to `/midi/routing`. Devices already cross-links. |
| 110 | Roll-up | SHIP loop 11 closing log + Phase 3 readiness gate v8. |

---

## 3. Key design decisions (locked for loop 11)

### D1: Filter is a hard requirement, not a "show all by default"
The backend explicitly rejects unfiltered queries (see §1). The list page's empty state actively guides the operator to pick a filter — no hidden default that would silently return only one slice.

### D2: Source/target descriptors edited as JSON in loop 11
The `source_descriptor` and `target_descriptor` are `dict[str, Any]` — the schema doesn't constrain them. Per-source-type structured editors (e.g., a CC-number picker for `midi_cc`) are out of scope for loop 11 and queue for loop 12+. Iter 105 ships a JSON textarea with on-blur validation.

### D3: Per-row enable/disable uses the dedicated /enable + /disable routes
These exist for a reason — they bypass the full PATCH validation and just flip the boolean. Iter 104 uses them directly so a quick toggle doesn't risk a schema-validation error from elsewhere in the row.

### D4: Edit + create live in a Carbon Modal, not a dedicated route
Per the iter-50 reality audit pattern — a modal keeps the operator in the list context. The existing per-device editor pattern (e.g., `MaschineMidiMapPage`) uses inline panels because it owns its own state authority; the canonical bindings authority is global, so a modal is the right scope.

### D5: Routing region scaffold lands in loop 11 (iter 107) but deferred to loop 12+
Iter 107 is a 30-line placeholder so the nav has a `/midi/routing` route mount and the Overview deep-link works. The actual matrix UI (cluster peers, source→consumer routing) is loop 12+ work.

### D6: Carbon-only (continued from loop 10 D5)
Every new component uses `@carbon/react`. No MUI, no Phosphor, no inline color styles.

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| JSON descriptor textarea is unfriendly for non-engineers | high | Acknowledged limitation. Loop 12+ ships per-source-type structured editors. Iter 105 surfaces JSON-parse errors clearly. |
| The list page becomes slow with 1000+ bindings | low | All filters narrow server-side; no scope returns ALL rows. `enabled_only` further narrows. Carbon DataTable handles ~10k rows comfortably. |
| Filter UX confusion ("which filter should I use?") | medium | Iter 103 ships an empty-state explainer + the Overview deep-link from the Bindings Tile pre-selects a sensible default (consumer_type=plugin_param). |
| New mutation surfaces conflict with Snapshot Editor inline editors | low | Snapshot Editor inline editors already write through the canonical authority — they share the same backend. The list page just exposes a different view of the same data. |
| Carbon Modal portal interferes with React Router lazy-load boundary | low | The existing per-device pages (e.g., MidiHubPage) use Carbon Modals inside lazy routes without issue. |

---

## 5. Cross-references

- T2482 epic Phase 3 design: `docs/architecture/MIDI_SERVICES.md` §4 (P3.4 sub-phase)
- iter-100 SHIP loop 10 closing log: where P3.4 was queued as the next loop's recommendation
- backend authority: `app/services/midi/routes.py` (8 endpoints) + `app/services/midi/schemas.py` (vocabularies) + `app/services/midi/authority.py`
- iter-91 Phase 3 plan (precedent): `docs/architecture/T2482_LOOP10_PHASE3_PLAN.md`
- iter-97 Devices region audit (precedent): `docs/architecture/T2482_LOOP10_ITER97_DEVICES_AUDIT.md`
- existing iter-98 `useDevicePackBindings.ts` pattern: queryKey scheme + 5s refetchInterval baseline
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
