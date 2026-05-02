# T2482 SHIP loop 10 / iter 97 — `/midi/devices` region audit

**Date:** 2026-05-01 (iter 97).
**Scope locks:** the iter-98 DataTable column set and the iter-99 detail-pane stub surface.
**Cross-ref:** `docs/architecture/T2482_LOOP10_PHASE3_PLAN.md` (iter 91 plan).

---

## 1. Existing per-device editor surfaces (the "PEER" set)

These are the per-device pages that currently live at top-level routes. `/midi/devices` does **not** replace them — it lists them, surfaces their canonical bindings count, and links into them.

| Route | Page file | Backend client | What it owns |
|---|---|---|---|
| `/maschine` | `web/src/app/pages/MaschinePage.tsx` | `web/src/map2/clients/maschine.ts` | NI Maschine MK1 daemon: connection, encoder map, firmware, HID traffic, LCD sim, LED preview, ops console, transport |
| `/mcu` | `web/src/app/pages/McuPage.tsx` | `web/src/map2/clients/mcu.ts` | Mackie Control Universal projection daemon |
| `/launch-control` | `web/src/app/pages/LaunchControlPage.tsx` | `web/src/map2/clients/launchControl.ts` | Novation Launch Control projection daemon |
| `/midi-commander` | `web/src/app/pages/MidiCommanderPage.tsx` | `web/src/map2/clients/midiCommander.ts` | MIDI Commander projection daemon |
| `/maschine/midi-map` | `web/src/app/pages/MaschineMidiMapPage.tsx` | embedded in MaschinePage | Maschine encoder→MIDI mapping authoring surface |
| `/mpx1/*` | (8 views, including `/mpx1/perform`, `/mpx1/flow`) | `app/services/mpx1_service.py` | Lexicon MPX-1 SysEx librarian |
| `/intelfx` | (existing) | `app/services/intelfx_service.py` | IntelFX MIDI bridge |
| `/ground-control-pro` | `web/src/app/pages/GroundControlProPage.tsx` | `app/services/ground_control_pro/` | Ground Control Pro daemon |

**Conclusion:** the per-device editor set is **wide** (8+ surfaces). Each is its own daemon with its own projection, mapping, and transport state. `/midi/devices` is therefore an **index + cross-link** surface, not an authoring surface. Each row points at the canonical per-device editor route.

## 2. Canonical bindings shape for `device_pack` consumer

From `app/services/midi/projections/device_pack.py:1-40`:

- `consumer_type = "device_pack"` represents factory-supplied per-pack DEFAULT bindings.
- `consumer_id = device-pack profile_key` (e.g., `"native-instruments/maschine-mk1.midi"`).
- Defaults live in `device-packs/<vendor>/profiles/<model>.midi.yaml`.

Each binding row carries: `binding_id`, `consumer_type`, `consumer_id`, `source_type`, `target_type`, `device_id?`, `scope`, `scope_id?`, `enabled`. The iter-98 DataTable rolls these up by `consumer_id` (one row per device-pack profile) and counts the bindings per row.

## 3. Locked iter-98 DataTable columns

| Column | Type | Source |
|---|---|---|
| `Device` | string | `consumer_id` split on `/` → vendor + model display |
| `Vendor` | string | first segment of `consumer_id` |
| `Profile` | string | last segment of `consumer_id` (e.g., `maschine-mk1.midi`) |
| `Bindings` | number | count of `device_pack` rows matching this `consumer_id` |
| `Enabled` | tag (green/gray) | true if any binding row in the group has `enabled=true` |
| `Editor` | link | per-device route (see §1 mapping table) — fall back to `/midi/devices/{consumer_id}` if no per-device editor exists |

The `Editor` link is computed client-side from a static map keyed by the vendor + model substring. Profiles with no known editor route (e.g., a fresh device-pack imported via Mixxx) point at the iter-99 generic detail stub.

## 4. Locked iter-99 detail-pane stub scope

`/midi/devices/:profile_key` — Carbon `<Section>` + `<Layer>` shell with:

- **Header:** vendor + model + `<Tag>` for `enabled`/`disabled`.
- **Bindings list:** Carbon `<DataTable>` of every binding row matching the profile (no per-row editing in iter 99 — that's iter 100+ scope).
- **Cross-link banner:** if a per-device editor route is known, render an `<InlineNotification kind="info">` with a link to the canonical editor route.
- **No mutation surface in iter 99.** Read-only audit/inspection. Iter 100+ adds the enable/disable toggle + per-row override authoring.

## 5. Routing reservation

`web/src/app/App.tsx` already mounts `/midi/*` (iter 92). The iter-95 overview lives at `/midi/overview`. Iter 98 + 99 add:

```tsx
<Route path="devices" element={<MidiServicesDevicesPage />} />
<Route path="devices/:profileKey" element={<MidiServicesDevicePage />} />
```

Inside the existing `<Route path="/midi/*" element={<MidiServicesShell />}>` block, immediately after the `overview` route declaration.

## 6. Cross-references

- iter 91 plan: `docs/architecture/T2482_LOOP10_PHASE3_PLAN.md`
- canonical projection: `app/services/midi/projections/device_pack.py:1-40`
- per-device pages enumerated in §1
- Carbon DataTable usage pattern reference: `web/src/app/components/MidiHub/*` (existing tables)
