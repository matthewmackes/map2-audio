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
| POST | `/start` | Start legacy MIDI engine monitor | Covered by v2 `/engine/start`; MIDI Hub is preferred with JUCE engine fallback. |
| POST | `/stop` | Stop legacy MIDI engine monitor | Covered by v2 `/engine/stop`; MIDI Hub is preferred with JUCE engine fallback. |
| GET | `/mappings` | List CC mappings | Covered by v2 `/mappings`, with chain/plugin filters. |
| POST | `/mappings` | Create CC mapping from query params | Covered by v2 `/mappings`, but requires JSON body and richer identity fields. |
| DELETE | `/mappings/{mapping_id}` | Delete CC mapping | Covered by v2 `/mappings/{mapping_id}`. |
| POST | `/learn` | Start learn for plugin URI/parameter query params | Covered by v2 `/learn/start`; clients need request-body migration. |
| POST | `/refresh` | Rescan devices | Covered by v2 `/devices/refresh`, sharing the v2 device inventory path. |
| GET/POST/DELETE | `/routing*` | In-memory port-to-port routes | Covered by v2 `/routes`, backed by the durable MIDI Hub route service with legacy `input_port`/`output_port` aliases. |
| GET/PUT | `/filters` | In-memory message-type filters | Gap. No equivalent v2 API; likely retire or move to MIDI Hub processing. |
| GET/POST | `/monitor*` | In-memory recent-message monitor buffer | Covered by v2 `/activity` and `/activity/clear`; v2 uses MIDI Hub traffic monitor when available. |
| GET/PUT/POST | `/clock*` | In-memory MIDI clock config and start/stop | Covered by v2 `/clock`, `/clock/tap`, `/clock/start`, `/clock/stop`, and `/clock/continue`, backed by the MIDI Hub clock engine. |
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

1. Retire or migrate `/filters`; there is no durable v2 equivalent today.
2. Decide whether legacy presets that bundle routes, filters, and clock state
   are obsolete; if not, add an explicit migration/export path before deletion.

## Resolved During T2365-subK

- `2026-04-20`: Added v2 `/engine/start`, `/engine/stop`, `/devices/refresh`,
  and `/activity/clear`; route tests cover MIDI Hub ownership and JUCE engine
  fallback behavior for the lifecycle path.
- `2026-04-20`: Added the v2 `/clock` facade over the existing MIDI Hub clock
  engine, including status, configure, tap, start, stop, and continue coverage.
- `2026-04-20`: Added the v2 `/routes` facade over the durable MIDI Hub route
  service, including legacy `input_port`/`output_port` request aliases.

## Recommended Next Commit

The next commit should explicitly retire or migrate legacy `/filters`, then
settle legacy bundled presets. Those are the remaining blockers to deleting
`app/routes/midi.py`.
