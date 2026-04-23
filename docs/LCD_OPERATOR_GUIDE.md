# MAP2 LCD Console — Operator Guide

**Last updated:** 2026-04-23 (T2430)
**Surface:** `/devices/lcd/*`
**Audience:** Rig operator, bench technician

---

## What the LCD console is

The MAP2 LCD console drives up to two 20×4 character HD44780 LCDs mounted
on the rig. Each display is fed by the platform event stream: status
readouts, VU meters, chain info, plugin state, alerts, and operator
messages. The web page at `/devices/lcd/*` lets you monitor what every
LCD in the cluster is showing, control local displays, configure
per-display settings, curate presets, and bind snapshot activation to
LCD page state.

---

## The eight sub-routes

| Route | What it's for |
|---|---|
| `/devices/lcd/displays` | Live simulator of both LCDs + D-pad + custom message composer + event-trigger test palette. The operator console. |
| `/devices/lcd/events` | Live event feed (WebSocket) with severity/category filters and pin. Pill-aware: filters to the pill-selected node. |
| `/devices/lcd/nodes` | Per-node LCD preview + health + recent events. Pill-aware scope. |
| `/devices/lcd/alerts` | Alert routing: which event types appear on which LCD, their duration, priority, severity. |
| `/devices/lcd/hardware` | I²C scan, FT232H scan/write, driver health per-LCD, reconnect buttons, raw-write debug tool, system info. |
| `/devices/lcd/settings` | Per-LCD config editor — 14 fields per display, marked snapshot-aware where applicable. |
| `/devices/lcd/presets` | Named presets (5 built-in read-only + user). Load, save current, duplicate, rename, delete. |
| `/devices/lcd/snapshots` | Bind snapshot activations to LCD presets or inline overrides (preset reference or inline override). |

Landing on `/devices/lcd` redirects to `/devices/lcd/displays`.

---

## The Unified Node Pill

LCD is pill-aware. The global node pill in the top nav scopes cluster
views:

- **Scope = "all"** → Events and Nodes show every cluster peer.
- **Scope = specific node** → Events filter to `source_node`, Nodes grid
  narrows to that one peer. The current scope is shown as a Tag on each
  page so you always know what you're looking at.

The other sub-views (Displays, Hardware, Settings, Presets, Snapshots)
target whatever LCD manager is running on the pill-selected node.

---

## Per-LCD settings

The Settings sub-view exposes 14 fields per LCD (×2 displays):

| Field | Type | Range | Snapshot-aware? |
|---|---|---|---|
| `enabled` | bool | on/off | no |
| `adapter` | enum | `native-i2c`, `ft232h` | no |
| `brightness` | int | 0–255 | no (hardware) |
| `contrast` | int | 0–63 | no (hardware) |
| `auto_scroll` | bool | on/off | no |
| `scroll_delay_ms` | int | 50–2000 | no |
| `alert_sound` | bool | on/off | **yes** |
| `alert_sound_freq_hz` | int | 100–5000 | no (hardware) |
| `alert_sound_duration_ms` | int | 10–2000 | no (hardware) |
| `idle_dim_timeout_s` | int | 0–3600 | **yes** |
| `idle_dim_brightness` | int | 0–255 | no (hardware) |
| `auto_cycle_enabled` | bool | on/off | **yes** |
| `auto_cycle_interval_s` | int | 1–600 | **yes** |
| `default_page` | enum | status/vu/chain/plugins/midi/perf/settings/menu | **yes** |

Snapshot-aware fields may be overridden per-snapshot via hooks (see below).
Hardware-calibration fields (brightness, contrast, buzzer pitch, idle
dim brightness) stay node-local: a snapshot recalled on a different rig
would otherwise stomp them wrong.

Brightness/contrast changes apply live to the running driver on save.

---

## Presets

Five built-in read-only presets ship:

- **factory-default** — defaults for every field.
- **performing** — stage mode: max brightness, VU landing page, no auto-cycle, alerts on.
- **rehearsal** — bandroom mode: medium brightness, chain + perf cycling.
- **setup** — bench mode: MIDI + plugins pages, loud alerts.
- **silent** — monitor-only: dimmed, alerts muted, status page.

Built-ins cannot be renamed or deleted but **can be duplicated** as a
starting point for a custom preset. User presets are stored at
`~/.config/map2/lcd_presets/*.json` and support save / rename / delete /
duplicate / apply.

Applying a preset:
1. Writes its `displays` config into `lcd.displays`.
2. Applies `brightness` live to the driver (best-effort).
3. Emits a `lcd.user` PlatformEvent with `operator_action=preset_loaded`.

---

## Snapshot activation hooks

Every snapshot may carry an optional LCD hook. The hook is a **union type**:

- `{preset: "performing"}` — reference a preset by name. When the
  snapshot activates, that preset's snapshot-aware fields apply.
- `{inline: {displays: [{id, default_page, auto_cycle_enabled, ...}]}}` —
  inline override of any subset of the 5 snapshot-aware fields.

**No hook = LCD keeps the current node-local config.** This is the
fallback-to-node-local semantics (Q6a=B): 90 % of snapshots don't need
to touch LCD state.

Hooks are stored at `~/.map2/snapshot_lcd_hooks/<snapshot_id>.json`.

### Morph-aware hooks

When a snapshot is one of the four corners (A/B/C/D) of a morph pad, the
`LCDMorphEvaluator` runs at 5 Hz and interpolates between the corner
hooks:

- Categorical fields (`default_page`) → **snap to the nearest corner**.
- Numeric fields (`auto_cycle_interval_s`, `idle_dim_timeout_s`) →
  **bilinear interpolation**.
- Boolean fields (`alert_sound`, `auto_cycle_enabled`) →
  **threshold at 0.5** after bilinear interpolation of 0/1.

Back-pressure: the evaluator only writes when the interpolated result
differs materially (numeric epsilon = 2; exact for bool/categorical).
This keeps HD44780 I²C write rate sane during a full morph sweep.

---

## Hardware: multi-adapter support

The LCD manager can drive LCD 0 over native I²C and LCD 1 over FT232H
USB-to-I²C simultaneously (or vice versa). Configure `adapter` per-LCD
in Settings:

- `native-i2c` — uses the native Linux I²C bus (`/dev/i2c-1`).
- `ft232h` — uses an FT232H USB bridge via pyftdi.

The Hardware sub-view shows per-driver health: driver class, adapter
type, address, last-write-ago timestamp, write error count, and a
per-driver **Reconnect** button (force disconnect + reconnect).

If the driver falls back to `MockLCDDisplay` on start (hardware absent
or pyftdi missing), the Hardware sub-view surfaces a magenta `MOCK` tag
so you don't mistake a simulated run for a live one.

Raw-write debug tool (Hardware sub-view) writes directly to the primary
native driver via `POST /api/lcd/native/write`, bypassing the event
queue. Useful during 2 am bring-up when you need to know the wiring is
correct before the event stream gets involved. The FT232H equivalent
lives in the same sub-view.

---

## PlatformEvent emission

The LCD manager is a first-class PlatformEvent **producer** (not just
consumer). These semantic operator actions emit `kind=lcd.user` events:

- `page_changed` (POST /api/lcd/page)
- `custom_message` (POST /api/lcd/message)
- `display_reset` (POST /api/lcd/reset/{lcd_id})
- `alert_config_updated` (PUT /api/lcd/alerts/config)
- `settings_changed` (PUT /api/lcd/displays-config)
- `preset_loaded` (POST /api/lcd/presets/{name}/apply)

Events are audit-only (`broadcast=False`, no target surfaces). D-pad
keystrokes are NOT emitted — only semantic transitions that result from
them. Brightness/contrast slider changes are debounced to the settled
value.

---

## Troubleshooting

### "LCD shows MOCK tag in Hardware view"
The driver failed to connect. Check:
- I²C bus permissions (`sudo usermod -aG i2c $USER`; reboot).
- For FT232H: `pip install pyftdi` in the MAP2 venv; check
  `dmesg` for USB device enumeration.
- I²C address — scan via the Hardware sub-view; set `address` in Settings.

### "Events feed is empty"
Check Events sub-view → "WebSocket connected" tag is green. Check
`PLATFORM_EVENT_BUS_ENABLED=1` in `map2-backend.service` environment.

### "Snapshot activates but LCD state doesn't change"
The snapshot has no LCD hook. Open Snapshots sub-view, select the
snapshot, choose `preset` or `inline` mode, save.

### "Morph pad is active but LCD isn't following"
Check `GET /api/lcd/morph-stats` — evals should be increasing at ~5 Hz.
If `applies` stays at 0, all corner snapshots likely lack hooks (the
evaluator only writes when at least one corner has a hook).

### "Backlight button shows success but screen stays dark"
T2430-L fixed the backlight route to actually call `driver.set_backlight()`.
If you're on a pre-T2430 build, rebuild from master.

---

## Reference

- Route definitions: `app/routes/lcd.py`
- Manager: `app/services/lcd_manager.py`
- Drivers: `app/drivers/lcd_display.py` (native), `app/drivers/ft232h_lcd_display.py` (FT232H)
- Hook evaluator: `app/services/snapshot/lcd_hook_evaluator.py`
- Morph evaluator: `app/services/snapshot/lcd_morph_evaluator.py`
- Config schema: `app/config_schema.py` → `LCD_SCHEMA` + `LCD_SNAPSHOT_AWARE_FIELDS`
- Frontend shell: `web/src/app/components/Devices/LCD/LCDShell.tsx`
- Sub-views: `web/src/app/components/Devices/LCD/views/*.tsx`
- API client: `web/src/map2/lcd.ts`
- PlatformEvent kinds: `app/services/platform_event/kind.py` (`lcd.audio`, `lcd.system`, `lcd.network`, `lcd.service`, `lcd.user`, `lcd.alert`)
- Tests: `tests/test_lcd_t2430.py`, `web/src/app/components/Devices/LCD/**/*.test.tsx`
- Hardware wiring: `docs/hardware/LCD_WIRING.md`
