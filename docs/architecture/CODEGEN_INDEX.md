# Pydantic → TypeScript Codegen Index

**Status:** Authoritative — Run-14c cycle 8 (2026-05-16)
**Maintainers:** Platform Audio team
**See also:** `web/package.json` (typecheck gate chain), `scripts/build_web_dist_atomic.py` (deploy-time preflight)

---

## TL;DR

The platform has **5 generated TypeScript files** derived from Pydantic
sources. Every one of them is gated by `--check` mode at both `npm run
typecheck` time and `python3 scripts/build_web_dist_atomic.py` time, so
any backend Pydantic schema change without a paired codegen refresh
fails CI + fails the deploy preflight.

This doc indexes:
- Every generated file + its canonical Pydantic source
- The script that produces it + the npm-run alias
- The test contract that pins the codegen output

Use case: when adding a new Pydantic surface that the frontend types,
copy the pattern from one of the existing entries below.

---

## Index (5 entries as of 2026-05-16)

### 1. `snapshots.generated.ts`

| Property | Value |
|----------|-------|
| **Generated file** | `web/src/map2/clients/snapshots.generated.ts` |
| **Pydantic source** | `app/routes/unified_snapshots.py`, `app/services/snapshot/*`, `app/models/audio_state.py` (OpenAPI components filtered to the transitive closure of the snapshot schema roots consumed by `snapshots.contract.ts`) |
| **Generator** | `scripts/generate_typescript_contracts.py` |
| **Generator approach** | `openapi-typescript` (npm dep) consumes the live `/openapi.json` from a running backend, or falls back to spawning the FastAPI app in-process, then filters to the explicit snapshot schema roots before emission so unrelated route model-name collisions cannot drift this contract |
| **npm scripts** | `generate:types` → emit; `verify:contracts` → --check |
| **Codegen gate** | Included in `npm run typecheck` chain (run-14b pick #1) |
| **Deploy gate** | Included in `scripts/build_web_dist_atomic.py` preflight (run-14c cycle 7) |
| **Test contract** | `tests/test_typecheck_gate_wires_codegen_checks.py` |
| **Worklist anchor** | T2455 (2026-04-29) |
| **Known consumers** | `web/src/map2/clients/snapshots.contract.ts` (self-test anchor — no production app consumer; the application uses hand-mirrored types in `web/src/map2/types.ts` instead) |
| **Audit history** | 14-day codegen drift documented at `docs/fit-for-purpose-evidence/20260516/snapshots-codegen-drift-audit/` — drift was dormant, no production impact |

### 2. `meterWsFrame.generated.ts`

| Property | Value |
|----------|-------|
| **Generated file** | `web/src/app/types/meterWsFrame.generated.ts` |
| **Pydantic source** | `app/services/devices/_meter_ws_schema.py` |
| **Generator** | `scripts/generate_meter_ws_types.py` |
| **Generator approach** | Custom Python emitter (imports the Pydantic source for constants, hand-emits TS interfaces) — no external deps |
| **npm scripts** | `generate:meter-ws-types` → emit; `verify:meter-ws-types` → --check |
| **Codegen gate** | Included in `npm run typecheck` chain (run-14b cycle 2) |
| **Deploy gate** | Included in `scripts/build_web_dist_atomic.py` preflight (run-14c cycle 7) |
| **Test contract** | `tests/test_meter_ws_types_codegen.py` + `tests/test_typecheck_gate_wires_codegen_checks.py` |
| **Worklist anchor** | Run-14b cycle 2 (2026-05-15) |
| **Known consumers** | `web/src/app/hooks/validateMeterWsFrame.ts` (dev-build frame validator); the WS hooks reference the validator transitively |
| **Backend authority** | `/api/v1/devices/peak-meters/ws-schema` REST endpoint publishes the JSON Schema for cross-process tooling |

### 3. `sonobusEventsWsFrame.generated.ts`

| Property | Value |
|----------|-------|
| **Generated file** | `web/src/app/types/sonobusEventsWsFrame.generated.ts` |
| **Pydantic source** | `app/services/sonobus/_events_ws_schema.py` |
| **Generator** | `scripts/generate_sonobus_events_ws_types.py` |
| **Generator approach** | Same as meterWsFrame — custom Python emitter |
| **npm scripts** | `generate:sonobus-events-ws-types` → emit; `verify:sonobus-events-ws-types` → --check |
| **Codegen gate** | Included in `npm run typecheck` chain (run-14c cycle 1) |
| **Deploy gate** | Included in `scripts/build_web_dist_atomic.py` preflight (run-14c cycle 7) |
| **Test contract** | `tests/test_sonobus_events_ws_schema.py` + `tests/test_typecheck_gate_wires_codegen_checks.py` |
| **Worklist anchor** | Run-14c cycle 1 (2026-05-16) |
| **Known consumers** | None yet — emitted ahead of consumers per the canonical-schema-first pattern. WS endpoint at `/api/sonobus/events` emits frames the codegen describes. |

### 4. `midiTrafficWsFrame.generated.ts`

| Property | Value |
|----------|-------|
| **Generated file** | `web/src/app/types/midiTrafficWsFrame.generated.ts` |
| **Pydantic source** | `app/services/midi_hub/_traffic_ws_schema.py` |
| **Generator** | `scripts/generate_midi_traffic_ws_types.py` |
| **Generator approach** | Same as meterWsFrame — custom Python emitter |
| **npm scripts** | `generate:midi-traffic-ws-types` → emit; `verify:midi-traffic-ws-types` → --check |
| **Codegen gate** | Included in `npm run typecheck` chain (run-14c cycle 2) |
| **Deploy gate** | Included in `scripts/build_web_dist_atomic.py` preflight (run-14c cycle 7) |
| **Test contract** | `tests/test_midi_traffic_ws_schema.py` + `tests/test_typecheck_gate_wires_codegen_checks.py` |
| **Worklist anchor** | Run-14c cycle 2 (2026-05-16) |
| **Known consumers** | None yet — emitted ahead of consumers. Emitters at `MidiRouter._emit_traffic_event` + `InboundMidiTrafficBridge._publish` produce frames the codegen describes. |

### 5. `avbBindingTypes.ts` (hand-mirrored, not codegen)

| Property | Value |
|----------|-------|
| **File** | `web/src/app/types/avbBindingTypes.ts` |
| **Pydantic source** | `app/services/avb/binding_schemas.py` |
| **Approach** | **Hand-mirrored** — manually maintained TS module, no codegen script |
| **Why not codegen** | 5 small + stable enums (last changed Q4 2025); consumers need runtime helpers (type guards, iterable consts) that codegen would obscure |
| **Drift gate** | `tests/test_avb_binding_types_codegen_pin.py` — parses the TS file, asserts every Literal member matches the Pydantic Literal in `app/services/avb/binding_schemas.py`. Adding a Pydantic enum variant without updating the TS fails this test. |
| **Worklist anchor** | Run-14c cycles 5+6 (2026-05-16) |
| **Known consumers** | `web/src/app/pages/avb-services/useAvbBindings.ts` (narrowed enum types in `AvbBindingRecord` interface) |

---

## When to add a new entry

A new generated TS file should be added to this index when:

1. A new platform WS topic ships (use the cycle 1 / cycle 2 / cycle 4
   pattern from this run as the template).
2. A new REST endpoint surfaces a complex Pydantic response that the
   frontend types narrowly.
3. A new Pydantic enum needs runtime narrowing on the frontend (use the
   cycle 5+6 hand-mirrored pattern).

### Required artefacts per new entry

| Artefact | Pattern |
|----------|---------|
| Pydantic source module | `app/services/<area>/_<name>_ws_schema.py` (private with leading underscore) |
| Codegen script | `scripts/generate_<name>_ws_types.py` with `--check` mode |
| Generated TS file | `web/src/app/types/<name>WsFrame.generated.ts` |
| npm scripts | `generate:<name>-ws-types` + `verify:<name>-ws-types` |
| **Wire into typecheck** | `web/package.json::scripts.typecheck` (chain the new verify before tsc) |
| **Wire into deploy preflight** | `scripts/build_web_dist_atomic.py::CODEGEN_DRIFT_CHECKS` (add new tuple entry) |
| Test contract | `tests/test_<name>_ws_schema.py` + add to `tests/test_typecheck_gate_wires_codegen_checks.py` |
| Update this index | Add an entry under § Index with all 12 fields populated |

The `test_typecheck_gate_wires_codegen_checks.py` test enforces that
every new gate is wired into the typecheck chain. The
`test_build_web_dist_codegen_preflight.py` test enforces that every new
codegen script is wired into the deploy preflight.

---

## Cross-references

- npm script chain: `web/package.json::scripts.typecheck`
- Deploy preflight: `scripts/build_web_dist_atomic.py::run_codegen_drift_preflight`
- Frontend dev-build validation pattern: `web/src/app/hooks/validateMeterWsFrame.ts` (template for runtime validators of generated frame types)
- Schema audit (run-14b/run-14c context): `docs/fit-for-purpose-evidence/20260516/snapshots-codegen-drift-audit/README.md`
