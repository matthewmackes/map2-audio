# Maschine MK1 HID/USB Control Surface Migration (T2459-H4 Slice 10+)

**Owner:** Claude
**Status:** [>] In Progress (slice 10 — scope + audit-test pin shipped 2026-05-06)
**Worklist task:** T2459-H4 (the last code-side slice of the H4 device-pack epic)

This document is the canonical plan for retiring the Python-side
USB/HID transport in `app/services/maschine/` and routing the
Maschine MK1's HID input + bulk display output through the
`map2-controller-host` daemon (the T2459-A6 process). It is the
T2459-H4 analog of `MAP2MIDICONTROLLER_RETIREMENT.md` for the C++
ALSA controller — same pattern: caller audit, build-time gate,
deletion procedure, definition of done.

The Python daemon (`maschine_mk1_daemon.py`, 3 297 LoC) does **not**
go away. After this migration it becomes a thin render-loop process
that reads framebuffer state from the host's bulk-display channel
and reads HID events from the host's HID input channel, instead of
talking directly to the USB device.

## 0. Why migrate

- **Single MIDI/HID I/O backend.** T2459-H1 made libremidi the only
  MIDI backend; T2459-H4 should make the controller-host the only
  process that opens the Maschine USB device. Today, the daemon
  opens `0x17CC:0x0808` directly via `mk1_usb_transport.py`, in
  parallel with whatever the host owns. That's the same parallel-
  store pattern AVB Services + MIDI Services already retired.
- **Crash isolation.** The daemon currently couples USB transport
  errors to the render loop. Once the host owns USB, a transient
  device hotplug failure can't crash the daemon's display thread.
- **MAP2 platform discipline.** The four first-class service
  offerings (MIDI, AVB, Sampler, Audio Effects) all converge on
  "single canonical authority + single canonical surface + no
  parallel I/O." The Maschine HID/USB path is the most visible
  remaining violation of that rule.

## 1. Module-level inventory

| Module | LoC | Disposition | Notes |
|---|---|---|---|
| `maschine_mk1_daemon.py` | 3 297 | **Stays Python** (slimmed) | Render loop, profile system, admin console, framebuffer composition, LED choreography. |
| `mk1_usb_transport.py` | 266 | **Retire** | Direct USB transport — replace with host-client transport. |
| `mk1_host_client_transport.py` | ~250 | **Stays Python** | New (slice 11). Drop-in replacement for `mk1_usb_transport.py`; delegates to controller-host over UDS. |
| `mk1_protocol.py` | 596 | **Move to host** | HID parsing — moves to `juce-engine/Source/ControllerHost/Hid/Map2MaschineMK1.{h,cpp}` (or via device-pack JS). |
| `transport.py` | 783 | **Stays Python** | Operator-facing transport state (clock, BPM, tap tempo); reads from host MIDI events but isn't transport-level. |
| `led_animations.py` | 192 | **Stays Python** | Frame composition; output goes through bulk channel. |
| `led_choreography.py` | 293 | **Stays Python** | Same. |
| `admin_console.py` | 382 | **Stays Python** | Operator console UI; stays in daemon. |
| `boot_sequence.py` / `shutdown_sequence.py` | small | **Stays Python** | Render-side. |
| `incident_log.py` | small | **Stays Python** | Operator state. |
| `long_op_feedback.py` | 413 | **Stays Python** | Render-side. |
| `screensaver.py` | 142 | **Stays Python** | Render-side. |
| `onboarding.py` | 172 | **Stays Python** | Render-side. |
| `midi_map_config.py` | 323 | **Already covered** by T2459-H4 slice 6 (Maschine MK1 MIDI mode device-pack). The daemon's MIDI emission goes through the host already. |
| `render/`, `fonts/`, `profiles/` | ~1 100 | **Stays Python** | Pure render. |

**Net code-move scope:**
- Python deletions/retirements: `mk1_usb_transport.py` (266 LoC).
- Python additions: thin host-client transport facade (~150 LoC).
- C++ additions: Maschine HID parser (`Map2MaschineMK1.cpp`, target ~400 LoC ported from `mk1_protocol.py`) + bulk display sink hook in `Map2BulkController`.
- IPC additions: `maschine_hid_event` framed message; `maschine_bulk_frame` framed message. Both are extensions of the existing controller-host UDS protocol.

## 2. Caller audit (load-bearing references)

The migration must preserve every existing operator-visible behavior.
The daemon's outbound surfaces are:

1. **MIDI events** → already routed through `MidiHostClient.send_*` (T2459-H4 slice 6 confirmed).
2. **WebSocket events** to `/ws/maschine/*` → emitted from the daemon's render loop; stays Python.
3. **Profile activation events** → already `PlatformEvent` consumers.

The daemon's inbound surfaces are:

1. **USB HID input from `0x17CC:0x0808`** — this is the surface the
   migration replaces. Currently entered via `mk1_usb_transport.py`'s
   `read()` loop running on a background thread.
2. **WebSocket commands** (e.g., admin-console clicks, profile set
   requests) — stays Python.
3. **Configuration polling** — stays Python.

### Inbound HID call sites in the daemon (greppable)

```
self._transport: Maschine_MK1_USB_Transport          # construction site
self._transport.read(...)                            # read loop
self._transport.write(...)                           # display write
self._transport.send_initialization_packet(...)      # boot sequence
```

Every replacement site goes through a new
`MaschineHostClientTransport` facade that:
- delegates `read()` to a UDS subscription on `maschine_hid_event` from the host,
- delegates `write(framebuffer)` to a UDS publish on `maschine_bulk_frame`,
- delegates initialization to a `maschine_init` UDS request.

## 3. Slice plan (T2459-H4 slices 11..N)

Slices are atomic and ship one per cycle. Each slice has its own
worklist completion note.

- **Slice 10** (this cycle, 2026-05-06) — Scope doc + audit-test pin
  (a regression-guard test that fails when a new file is added to
  `app/services/maschine/` without classification). **No daemon
  code changes.**
- **Slice 11** — Add `MaschineHostClientTransport` facade (Python),
  defaults to OFF behind `MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1`,
  matches the `Maschine_MK1_USB_Transport` interface byte-for-byte.
- **Slice 12** — Wire the daemon's `_transport` constructor to pick
  the host-client facade when the env flag is set; default still off.
- **Slice 13** — IPC contract additions on the engine side:
  `maschine_hid_event` outbound + `maschine_bulk_frame` inbound +
  `maschine_init` request/response. Schema-pinned by an existing-
  manifest-style test.
- **Slice 14** — Engine-side HID parser stub (`Map2MaschineMK1.cpp`)
  that re-uses `mk1_protocol.py`'s frame-parsing semantics ported
  byte-for-byte to C++.
- **Slice 15** — Engine-side bulk-display sink that forwards bytes
  to the device. **Shipped 2026-05-06 (cycle 17)**: `Map2MaschineMK1Router.h`
  routes `MaschineBulkFrame` envelopes to EP_CONTROL_OUT (led) /
  EP_DISPLAY_OUT (display), handles `maschine_init` requests, and
  consumes raw HID input buffers via the slice-14 decoders to publish
  `MaschineHidEvent` records. Header-only, transport-injectable for
  unit testability. 13 Catch2 cases + 11 Python regression-pin cases.
- **Slice 16** — Build-time retirement gate (mirrors
  `MAP2_USE_LEGACY_MIDI_CONTROLLER`): a `MAP2_USE_MASCHINE_USB_DIRECT`
  env flag controls whether the daemon imports `mk1_usb_transport.py`.
  Default ON during the deprecation window; flips OFF for HIL soak.
- **Slice 17** — Bench HIL evidence run with a physical Maschine
  MK1 + the host owning USB; capture the LED/pad/encoder round-trip
  latency under the new path.
- **Slice 18** — Atomic deletion PR: drop `mk1_usb_transport.py` +
  the daemon's direct-USB code path + the env flag + the audit-test
  EXPECTED set entry.

Each slice is shippable independently; the migration can pause at
any boundary without breaking master.

## 4. Definition of Done for the deletion PR

- [ ] Bench HIL soak passes: 30 min of pad/encoder/transport activity
      with no frame drops, no LED desync, no spurious disconnects.
- [ ] `mk1_usb_transport.py` deleted from disk.
- [ ] Daemon `_transport` construction exclusively goes through
      `MaschineHostClientTransport`.
- [ ] `MAP2_USE_MASCHINE_USB_DIRECT` env flag removed.
- [ ] Audit test `tests/test_maschine_mk1_module_inventory_t2459h4.py`
      EXPECTED set updated to drop the retired module.
- [ ] No imports of `mk1_usb_transport` survive in `app/services/`.
- [ ] Docs updated: this file flips to "Status: ✓ Done" + closeout
      under `docs/fit-for-purpose-evidence/<YYYYMMDD>/maschine-host-usb-migration/`.
- [ ] Commit message references the bench evidence directory.

## 5. Why we're confident this can land autonomously

- **Every step is reversible.** Each slice toggles via env flag; no
  user-visible behavior changes until the operator flips the flag.
- **Shape-pinned by tests at every slice.** The audit test (this
  cycle) is the regression mechanism that prevents drift; every
  later slice ships with its own focused test.
- **Pattern is proven.** `MAP2MIDICONTROLLER_RETIREMENT.md` did the
  exact same shape for the C++ ALSA controller (T2459-H6). That
  retirement has slice 1 + slice 2 already on master and the deletion
  PR queued. This migration mirrors it for Python USB.

## 6. Cross-references

- `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` — the C++ ALSA-side
  template for this migration.
- `juce-engine/Source/ControllerHost/Hid/Map2HidController.{h,cpp}` —
  the existing host-side HID surface this migration plugs into.
- `juce-engine/Source/ControllerHost/Bulk/Map2BulkController.h` —
  the existing host-side bulk surface for display output.
- `app/services/midi_host_client.py` — the existing UDS client
  pattern that `MaschineHostClientTransport` will mirror.
- `device-packs/native-instruments/maschine-mk1/` — the device-pack
  that already covers the MIDI-mode mapping (T2459-H4 slice 6).
- `tests/test_maschine_mk1_module_inventory_t2459h4.py` — the audit
  test shipped in this slice (slice 10).
