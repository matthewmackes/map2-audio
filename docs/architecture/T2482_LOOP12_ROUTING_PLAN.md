# T2482 SHIP loop 12 — P3.5 Routing matrix + structured descriptor editors plan (iter 111)

**Date:** 2026-05-01 (iter 111, SHIP loop 12 start).
**Goal:** Loop 12 ships **two related advances**:
  1. **Per-source-type structured descriptor editors** — retire the iter-105/106 JSON textareas (the iter-101 D2 limitation).
  2. **P3.5 Routing region** — flesh out the iter-107 placeholder into a real source→consumer matrix backed by the canonical bindings authority.
**Selected over:** P3.7 Network region (per the iter-110 closing log recommendation).

---

## 1. Backend contract (no changes in loop 12)

The canonical authority surface remains the 8 endpoints from `app/services/midi/routes.py`. Loop 12 is purely frontend work — the structured editors emit the same `source_descriptor` / `target_descriptor` dicts that the projections in `app/services/midi/projections/*.py` emit on the backend side.

**Descriptor shapes per source_type** (extracted from the projection helpers):

| source_type | descriptor keys | notes |
|---|---|---|
| `midi_cc` | `channel`, `cc`, `curve`, `min`, `max` | CC 0-127 |
| `midi_note` | `channel`, `note`, `velocity_min`, `velocity_max` | Note 0-127 |
| `midi_pc` | `channel`, `program_number` | PC 0-127 |
| `midi_nrpn` | `channel`, `nrpn_msb`, `nrpn_lsb`, `curve`, `min`, `max` | MSB/LSB 0-127 each |
| `midi_sysex` | `manufacturer_id`, `pattern_hex`, `match_mode` | hex bytes |
| `midi_clock` | `clock_type` | tick/start/stop/continue |
| `midi_aftertouch` | `channel`, `note?` | poly vs channel |
| `midi_pitchbend` | `channel`, `min`, `max` | -8192..8191 |
| `midi_channel_pressure` | `channel`, `min`, `max` | 0-127 |
| `ttp_subscription` | `device_id`, `attribute_path`, `feedback_attribute?` | Tesira |
| `gpio_input` | `pin_id`, `active_state` | high/low |
| `string_command` | `match_pattern`, `match_mode` | regex/literal |

**Target descriptor shapes per target_type**:

| target_type | descriptor keys | notes |
|---|---|---|
| `engine_param` | `plugin_uri`, `param_index`, `param_label?` | DSP plugin parameter |
| `engine_command` | `command_path`, `args?` | engine RPC |
| `snapshot_action` | `action`, `snapshot_id?` | recall/store |
| `brain_slot` | `slot_id`, `mode` | momentary/latching |
| `device_command` | `device_id`, `command`, `args?` | per-device RPC |
| `macro` | `macro_id`, `args?` | scripted action |
| `gpio_output` | `pin_id`, `pulse_ms?` | high/low/pulse |

The shapes are extracted from production projection code, so this is what the backend actually accepts on `POST /api/midi/bindings`.

---

## 2. Loop 12 scope (iters 111-120)

| Iter | Sub-phase | Goal |
|---|---|---|
| 111 | (this doc) | Audit + plan |
| 112 | Source descriptor types + helpers | New `web/src/app/pages/midi-services/sourceDescriptors.ts` — typed editor metadata for each `BindingSourceType` (which fields, valid ranges, default values). Pure data + helper functions; no React. |
| 113 | Source descriptor editor component | New `SourceDescriptorEditor.tsx` — Carbon `Form` driven by the iter-112 metadata. Renders the right fields for the picked source_type. JSON parse round-trip preserves unknown extras for forward-compat. |
| 114 | Target descriptor types + editor | Mirror of iter-112+113 for `BindingTargetType`. |
| 115 | Wire structured editors into BindingEditDrawer | Replace the iter-105 `source_descriptor_json` + `target_descriptor_json` textareas with the iter-113/114 structured editors. Metadata stays JSON. JSON-textarea fallback retained as an "advanced" disclosure for forward-compat. |
| 116 | Wire structured editors into BindingCreateDrawer | Mirror iter-115 in the create drawer. Default descriptor values populated from iter-112/114 helpers when the operator picks a source_type/target_type. |
| 117 | Routing matrix data layer | New `useRoutingMatrix.ts` hook. Aggregates `/api/midi/bindings` across multiple consumer_types into a source→consumer matrix shape. Cached with TanStack Query. |
| 118 | Routing matrix UI | New `MidiServicesRoutingPage.tsx` (replaces the iter-107 scaffold). Carbon `DataTable` with rows = source descriptors, columns = consumer types, cells = binding count. Click-through to /midi/bindings filtered by both row + column. |
| 119 | Tests | Jest suites: `sourceDescriptors.test.tsx` (vocab + helper coverage), `useRoutingMatrix.test.tsx` (aggregation correctness). |
| 120 | Roll-up | SHIP loop 12 closing log + Phase 3 readiness gate v9. |

---

## 3. Key design decisions (locked for loop 12)

### D1: Structured editors emit dicts, not validated objects
Per iter-101 D2, the backend accepts `dict[str, Any]` for both descriptors. Loop 12's structured editors render named fields per source_type, but on Save they round-trip through a plain JS object — they don't enforce backend-side semantic validation (range clamps, mutual-exclusion). The backend is the authority for that. Frontend validation is purely UX (e.g., a CC field is `<TextInput type="number" min=0 max=127>` so the operator gets immediate feedback, but the dict shape is what gets sent).

### D2: Unknown descriptor keys preserved on edit
When iter-115 loads an existing binding for editing, any descriptor keys NOT in the iter-112 metadata table are preserved in a `_unknownExtras` slot and re-merged on Save. This keeps the editor forward-compatible with backend additions and prevents data loss on round-trip edits.

### D3: JSON-textarea fallback retained as advanced disclosure
Per iter-101 D2 the backend accepts arbitrary JSON; the structured editor is the primary surface but a Carbon `Accordion` "Advanced" disclosure exposes the raw JSON. Operators authoring an experimental binding (or one with backend extensions) can drop down to JSON.

### D4: Routing matrix is a NEW Carbon DataTable, not a port
The iter-107 scaffold is fully replaced. Per the iter-91 design D3 pattern (Overview was new, not ported), the routing matrix is a fresh component sized for the current bindings authority shape — not a port of any pre-T2482 routing UI.

### D5: Matrix cells are click-throughs, not inline editors
Inline matrix-cell editing creates an N×M editor surface that's hard to make robust. Iter 118 ships click-through to `/midi/bindings?consumer_type=X&source_type=Y` instead — operator authoring stays in the iter-105/106 drawer flow.

### D6: Carbon-only (continued)
Same standing rule. No MUI, no Phosphor, no inline color styles.

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Source-type descriptor field set drifts from backend projection code | medium | Iter 112's `sourceDescriptors.ts` cites the projection file for each entry. Adding a new source_type requires a paired backend+frontend change — that's the existing T2482 contract pattern. |
| Operator edits unknown extras via Advanced disclosure, structured editor overwrites them | low | Iter 115 D2 preserves them in `_unknownExtras`. The structured editor never writes a key it doesn't own. |
| Routing matrix gets very wide on small screens (10 consumer types × ~12 source types) | medium | Iter 118 uses Carbon DataTable's horizontal scroll + fixed first column. Above ~6 consumer types we sort columns by total binding count and collapse the tail into "Other". |
| Existing /midi/routing scaffold tests (none) — risk of removing iter 107 page in iter 118 | low | The iter-107 scaffold has no tests. The replacement just needs to keep the route mount + new page mounted at the same path. |
| Adding new TanStack Query keys causes cache thrash | low | The matrix query is keyed by the same `['midi-bindings-list', filter]` shape with a special `MATRIX` discriminator; a soft-invalidate on iter-104/105/106 mutations already covers it. |

---

## 5. Cross-references

- T2482 epic Phase 3 design: `docs/architecture/MIDI_SERVICES.md` §4 (P3.5 sub-phase)
- iter-110 SHIP loop 11 closing log: where loop 12 was queued
- iter-101 Bindings region plan: `docs/architecture/T2482_LOOP11_BINDINGS_PLAN.md` (D2 JSON-textarea limitation that loop 12 retires)
- backend projection helpers (descriptor shape source of truth): `app/services/midi/projections/*.py`
- existing Bindings page + drawers: `web/src/app/pages/midi-services/MidiServicesBindingsPage.tsx`, `BindingEditDrawer.tsx`, `BindingCreateDrawer.tsx`
- existing routing scaffold to be replaced: `web/src/app/pages/midi-services/MidiServicesRoutingPage.tsx` (iter 107)
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
