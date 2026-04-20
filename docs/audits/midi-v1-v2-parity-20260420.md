# MIDI v1/v2 Parity Audit - 2026-04-20

## Scope

This audit supports `T2365-subK`, the retirement of the legacy `/api/midi`
router. It compares `app/routes/midi.py` (`/api/midi`, tag `midi-legacy`) with
the authoritative v2 surface in `app/routes/midi_v2.py` (`/api/v2/midi`) and
the MIDI Hub workstation surface in `app/routes/midi_hub.py` (`/api/midi/hub`).

The legacy router is now marked `deprecated: true` in OpenAPI. Deletion is not
safe until the gaps below are either backfilled on v2, migrated to MIDI Hub, or
explicitly retired.

## Route Inventory

Legacy `/api/midi` routes:

| Method | Path | Legacy behavior | Current owner / disposition |
| --- | --- | --- | --- |
| GET | `/status` | Runtime status plus device/mapping counts | Covered by v2 `/status`, with a richer engine status contract. |
| GET | `/devices` | Device discovery via `MIDIEngineService.discover_devices()` | Covered by v2 `/devices`; MIDI Hub is preferred when available. |
| POST | `/start` | Start legacy MIDI engine monitor | Gap. MIDI Hub owns `/api/midi/hub/start`; v2 has no direct start endpoint. |
| POST | `/stop` | Stop legacy MIDI engine monitor | Gap. MIDI Hub owns `/api/midi/hub/stop`; v2 has no direct stop endpoint. |
| GET | `/mappings` | List CC mappings | Covered by v2 `/mappings`, with chain/plugin filters. |
| POST | `/mappings` | Create CC mapping from query params | Covered by v2 `/mappings`, but requires JSON body and richer identity fields. |
| DELETE | `/mappings/{mapping_id}` | Delete CC mapping | Covered by v2 `/mappings/{mapping_id}`. |
| POST | `/learn` | Start learn for plugin URI/parameter query params | Covered by v2 `/learn/start`; clients need request-body migration. |
| POST | `/refresh` | Rescan devices | Gap. v2 `/devices` enumerates live devices; MIDI Hub device refresh is implicit through hub lifecycle. |
| GET/POST/DELETE | `/routing*` | In-memory port-to-port routes | Gap for v2. MIDI Hub `/routes` is the durable workstation routing owner. |
| GET/PUT | `/filters` | In-memory message-type filters | Gap. No equivalent v2 API; likely retire or move to MIDI Hub processing. |
| GET/POST | `/monitor*` | In-memory recent-message monitor buffer | Partially covered by v2 `/activity`; clear-buffer behavior is not covered. |
| GET/PUT/POST | `/clock*` | In-memory MIDI clock config and start/stop | Gap for v2. MIDI Hub `/clock` owns clock configuration and transport. |
| GET/POST/POST/DELETE | `/presets*` | In-memory bundle of routes, filters, clock, and mappings | Partially covered by v2 `/presets`; v2 presets do not preserve legacy in-memory route/filter/clock state. |

Authoritative `/api/v2/midi` routes add capabilities not present on v1:

- Mapping update and feedback test.
- Command trigger CRUD.
- DB-backed routing rules.
- Explicit outbound CC/program/note send APIs.
- Chain program and chain activation actions.
- Learn lifecycle split into start, stop, status, and complete.
- Device open/close by name or index.
- Device-profile, bank, expression-calibration, and firmware workflows.

## Deletion Blockers

Before deleting `app/routes/midi.py` and the compatibility wrappers in
`app/services/midi_engine.py`, the next slice must resolve these blockers:

1. Decide whether `/api/midi/start`, `/api/midi/stop`, and `/api/midi/refresh`
   become v2 engine lifecycle endpoints or are retired in favor of MIDI Hub
   lifecycle.
2. Migrate legacy `/routing` clients to MIDI Hub `/api/midi/hub/routes` or add
   a v2 port-route facade backed by the same durable route service.
3. Retire or migrate `/filters`; there is no durable v2 equivalent today.
4. Migrate `/clock` clients to MIDI Hub `/clock`, or add a v2 bridge if
   non-Hub clients still need engine-clock control.
5. Decide whether legacy presets that bundle routes, filters, and clock state
   are obsolete; if not, add an explicit migration/export path before deletion.
6. Move `/monitor/clear` behavior into v2 `/activity` or retire it with a
   documented no-op replacement.

## Recommended Next Commit

Keep this deprecation commit as the one-release warning required by
`T2365-subK`. The next commit should add focused migration/backfill code for the
start/stop/refresh and activity clear gaps because they are small and unblock
route deletion without touching the larger MIDI Hub route migration.
