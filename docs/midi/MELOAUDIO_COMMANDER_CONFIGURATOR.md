# MeloAudio MIDI Commander Configurator — Architecture Deep-Dive

**Worklist anchor:** `T2459-H3-CFG` (Phase 6 — docs).
**Status:** Phases 1–5 + Outer Loop 2 dispatcher shipped on `master` 2026-05-07 (`813b6331` + `5d24a35a`).
**Companion docs:** [`MELOAUDIO_COMMANDER_FIRMWARE.md`](MELOAUDIO_COMMANDER_FIRMWARE.md) (mode-table + install runbook), [`ENGINE_COMMAND_DISPATCHER.md`](ENGINE_COMMAND_DISPATCHER.md) (Outer-Loop-2 dispatcher), [`T2459H_CLOSEOUT.md`](T2459H_CLOSEOUT.md) (parent epic state).

---

## 1. Why this exists

The 2026-05-07 HIL bench session with a physical MeloAudio MIDI Commander surfaced two problems that no amount of device-pack tuning could fix:

1. **Stock firmware has multiple hardcoded modes.** Standard / Axe-Fx II / Axe-Fx III / Helix / GT-1000 are selected by holding footswitch combos at boot, and each mode emits a different CC/PC set. The shipped device-pack profile (`device-packs/meloaudio/profiles/midi-commander.midi.yaml`, CC 80/81/82/14 + CC 7/1) matches none of the modes the bench unit actually emits (CC 22/24/25/26 + PC 0..3 + CC 4/7). Baking any single mode into the device-pack only works for one operator on one bench in one mode.
2. **PipeWire 1.4.10's UMP-MIDI2 ALSA-seq clients don't auto-bridge legacy MIDI 1.0 kernel clients.** The `Midi-Bridge:TSMIDI2-0 MIDI 1` JACK port that libremidi opens never sees events from kernel ALSA-seq client `32:0`. Filed as [`T2459-H7-PW-UMP`](../../docs/PROJECT_WORKLIST.md) — substrate gap, separate from this Configurator. The Configurator's discovery wizard sidesteps it via direct ALSA-seq subscription.

The Configurator gives operators two real paths to make their physical hardware emit what MAP2 expects, instead of forcing the platform to chase whichever stock-firmware mode the device happens to be in.

---

## 2. Two operator paths

### 2.1 Stock firmware (no flash)

The Discovery Wizard prompts the operator to press each control in sequence, captures the actual emitted CC/PC numbers, and writes a per-installation override at `~/.map2/devices/meloaudio-commander-discovered.yaml`. At runtime the override **shadows** `device-packs/meloaudio/profiles/midi-commander.midi.yaml`. Resolver merges the two before the descriptor goes to the host.

Operator never has to know which stock mode their device is in — discovery captures *whatever it actually emits*.

### 2.2 Custom firmware (one-time flash)

Operator opts in to flashing the open-source [harvie256/midi-commander-custom](https://github.com/harvie256/midi-commander-custom) firmware (MIT, bundled at `device-packs/meloaudio/firmware/`). After flash, MAP2 pushes a canonical CSV via the firmware's SysEx config protocol. Result: device emits *exactly* what `midi-commander.midi.yaml` declares — bit-identical across operators, no per-installation override required.

Restore-to-stock is documented as "contact MeloAudio support" because they don't publish the stock binary. See [`MELOAUDIO_COMMANDER_FIRMWARE.md`](MELOAUDIO_COMMANDER_FIRMWARE.md).

---

## 3. Module map

```
app/services/devices/meloaudio/
├── __init__.py                          (131 LOC — public exports)
├── commander_detection.py               (270 LOC — Phase 1)
├── commander_discovery.py               (427 LOC — Phase 2 orchestrator)
├── commander_discovery_subscriber.py    (345 LOC — Phase 2 ALSA-seq)
├── commander_resolver.py                (199 LOC — Outer Loop 2)
├── sysex_packer.py                      (793 LOC — Phase 3)
└── dfu_flash.py                         (362 LOC — Phase 4)

app/routes/devices_meloaudio_commander.py   (274 LOC — Phase 5 backend)
app/services/engine_command_dispatcher.py   (293 LOC — Outer Loop 2)
app/services/engine_command_handlers.py     (358 LOC — Outer Loop 2)

web/src/app/pages/midi-services/
├── MeloAudioCommanderConfigurator.tsx          (Phase 5 page)
├── MeloAudioCommanderDiscoveryPanel.tsx        (Phase 5 panel)
└── MeloAudioCommanderFirmwarePanel.tsx         (Phase 5 panel)

device-packs/meloaudio/
├── pack.yaml                            (canonical pack manifest)
├── profiles/midi-commander.midi.yaml    (canonical CC/PC mapping)
├── scripts/commander.js                 (mapping script)
└── firmware/                            (harvie256 .dfu + LICENSE)
```

---

## 4. Phase-by-phase architecture

### 4.1 Phase 1 — Detection (`commander_detection.py`)

**Job:** classify the firmware kind of any connected Commander purely from sysfs USB descriptors. Zero MIDI traffic — works whether or not the device is currently emitting.

**Surface:**

- `CommanderFirmwareKind` enum — `STOCK` / `CUSTOM` / `DFU_BOOTLOADER` / `UNKNOWN` / `NOT_PRESENT`.
- `CommanderStatus` dataclass — VID, PID, product string, sysfs path, kind.
- `detect_commander_status(usb_root=USB_DEVICES_ROOT) -> CommanderStatus`.

**Classification logic** (`_classify_product_string` at `commander_detection.py:167`):
- iProduct contains `"midi-commander-custom"` → `CUSTOM`.
- VID/PID matches STM32 DFU bootloader `0483:DF11` → `DFU_BOOTLOADER`.
- VID/PID matches MeloAudio `2eee:0301` (or product string contains `TSMIDI`) → `STOCK`.
- Connected but unmatched → `UNKNOWN`.
- Nothing on bus → `NOT_PRESENT`.

**Test seam:** `usb_root: Path` argument lets unit tests point at a fake sysfs tree.

**Why sysfs not pyusb:** sysfs reads are non-privileged and don't compete with the controller-host for the USB device handle. The Configurator polls every 2.5s — a libusb-level claim would block libremidi.

### 4.2 Phase 2 — Stock Discovery Wizard (`commander_discovery.py` + `commander_discovery_subscriber.py`)

**Job:** capture per-button emitted CC/PC and persist as a per-installation override.

**Two-module split:**
- **Orchestrator** (`commander_discovery.py`) — pure-Python state machine. Holds the prompt sequence, the captured events, the override-file YAML schema, and atomic save. No I/O dependencies — drop-in testable with synthetic event streams.
- **Subscriber** (`commander_discovery_subscriber.py`) — `mido` + `python-rtmidi` ALSA-seq direct subscription. Sidesteps the PipeWire UMP-MIDI2 bridge gap by talking to `hw:N,M,K` directly. Exposes a callback contract the orchestrator drives.

**Override file format** (`~/.map2/devices/meloaudio-commander-discovered.yaml`):

```yaml
schema_version: 1
captured_at: 2026-05-07T15:23:11Z
device_kind: stock
firmware_mode: standard          # operator-tagged at session start
bindings:
  - control: footswitch_top_1
    channel: 0
    kind: cc
    number: 22
  - control: footswitch_top_2
    channel: 0
    kind: cc
    number: 24
  ...
```

Schema is intentionally minimal — only the *deltas* from the device-pack default. Resolver merges them in (§4.4 below).

**Atomic save** (`save_override` at `commander_discovery.py:243`): write to `<path>.tmp`, `os.replace()` to final path. Crash-safe — never leaves a half-written override file.

**Subscriber lifecycle** (`commander_discovery_subscriber.py`):
1. Open ALSA-seq port (`mido.open_input(f"hw:{card},{device},{sub}")`).
2. Run callback loop on a daemon thread.
3. On cancel: close port, join thread (with timeout), drop reference.

Cleanup on cancel is unit-tested — earlier iterations leaked subscriber threads when the wizard was abandoned mid-capture.

### 4.3 Phase 3 — SysEx Packer (`sysex_packer.py`)

**Job:** encode a `CommanderConfig` (global settings + 8 banks × 8 buttons × 10 commands per button) into a sequence of SysEx frames matching harvie256's binary protocol.

**Port fidelity:** direct port of [`cmdBinaryPacker.py`](https://github.com/harvie256/midi-commander-custom/blob/master/host_software/cmdBinaryPacker.py) + [`settingsBinaryPacker.py`](https://github.com/harvie256/midi-commander-custom/blob/master/host_software/settingsBinaryPacker.py) with attribution preserved at the file head. License: MIT (compatible with MAP2's posture).

**Public surface** — six builders, three SysEx frame types:

| Builder | Returns | Wire intent |
|---|---|---|
| `pack_global_settings(GlobalSettings)` | `bytes` | Global section of flash image |
| `pack_bank_strings(list[BankNaming])` | `bytes` | 8 × 16-byte bank names |
| `pack_button_settings(list[ButtonRow])` | `bytes` | 64 buttons × 10-command rows |
| `build_flash_image(CommanderConfig)` | `bytes` | Full concatenated image |
| `build_erase_flash_frame()` | `SysExFrame` | Manufacturer 0x7D + cmd 52 |
| `build_write_flash_frames(image)` | `list[SysExFrame]` | 16-byte chunked writes |
| `build_reset_frame()` | `SysExFrame` | Manufacturer 0x7D + cmd 60 |
| `build_full_sysex_sequence(CommanderConfig)` | `list[SysExFrame]` | Erase → writes → reset |

**Command types:** `CommandNone`, `CommandStart`, `CommandStop`, `CommandPC`, `CommandCC`, `CommandNote`, `CommandPB`. Channel validated to 0..15 (`_validate_channel` at `sysex_packer.py:386`). PC/CC/Note value bytes validated to 0..127. Encoders are pure functions — no shared state, no IO, no logging. Round-trip fixtures pin every encoder against known-good byte sequences.

**Chunking** (`build_write_flash_frames` at `sysex_packer.py:685`): the firmware accepts WRITE_FLASH frames carrying 16 bytes of payload each, encoded as high-nibble/low-nibble pairs (32 SysEx data bytes per frame). `_split_high_low_nibbles` (at `sysex_packer.py:672`) is the canonical split. `pad_flash_image_to_chunks` zero-pads the image so the last frame is full-width — the firmware rejects partial chunks.

### 4.4 Outer Loop 2 — Resolver (`commander_resolver.py`)

**Job:** merge the device-pack default profile with any per-installation override into a single `EffectiveCommanderProfile` that the rest of the platform consumes.

**Surface:**

- `ResolvedBinding` — one CC/PC binding with provenance (`source: "pack" | "override"`).
- `EffectiveCommanderProfile.find_binding(channel, kind, number) -> ResolvedBinding | None` — single lookup point.
- `resolve_commander_profile(pack_profile, override) -> EffectiveCommanderProfile` — pure function; no IO.

**Merge rule:** override wins per-control. If discovery captured `footswitch_top_1 → CC 22` and the device-pack defaults to `CC 80`, the effective profile binds `CC 22`. Source is tagged so observability surfaces can render "from override" vs "from device-pack" in the operator UI.

**Why a separate module:** the merge is the only place per-installation overrides cross into the canonical platform path. Keeping it pure + small means the rest of the platform (controller-host, dispatcher, handlers) never sees override-vs-pack as a special case — they only see `ResolvedBinding`.

### 4.5 Outer Loop 2 — Dispatcher + Handlers (`engine_command_dispatcher.py` + `engine_command_handlers.py`)

**Job:** translate the controller-host's `engine_command` IPC frames into concrete audio-engine actions.

**Already documented in detail at** [`ENGINE_COMMAND_DISPATCHER.md`](ENGINE_COMMAND_DISPATCHER.md). Summary for completeness:

- Dispatcher = generic routing primitive (exact + glob pattern match, per-target error isolation, observability counters).
- Four canonical handlers ship in tree: `audio.chain.<N>.bypass`, `audio.snapshot.recall`, `audio.master.volume`, `audio.transport.tap_tempo`.
- Adding a new audio-surface target = add a handler and register it via `HandlerHooks` DI. No dispatcher edits, no new frame types, no schema migration.

The dispatcher is the seam between "controller emits an event" and "audio engine does a thing." The Commander Configurator's role ends at the resolver — everything downstream is generic and reused by every other device-pack.

### 4.6 Phase 4 — DFU Flash Orchestrator (`dfu_flash.py`)

**Job:** drive `dfu-util` to flash a bundled `.dfu` binary onto a Commander in DFU bootloader mode (USB ID `0483:DF11`).

**Phase machine** (`DfuFlashPhase` at `dfu_flash.py:59`):

```
IDLE → PRE_CHECK → ERASING → WRITING → VERIFYING → RESETTING → COMPLETE
                ↘ FAILED ↙
```

Each transition emits a `DfuFlashEvent` with `phase`, optional `progress_pct`, optional `message`, optional `error`. Frontend subscribes to the event stream and renders Carbon `<ProgressIndicator>` from it.

**Pre-check** (`run_pre_check` at `dfu_flash.py:156`):
- `dfu-util` binary on PATH (or operator-supplied path).
- Bundled firmware exists.
- USB device in DFU mode (`0483:DF11`).
- Returns `PreCheckResult(ok, reasons)` — operator UI surfaces the reasons before the flash button is enabled.

**Command construction** (`build_dfu_util_command` at `dfu_flash.py:198`): canonical args are `-a 0 -s 0x08000000:leave -D <path>`. The address `0x08000000` is STM32F4 flash base. `:leave` makes the device exit DFU mode after flash.

**Progress parsing** (`parse_dfu_util_progress` at `dfu_flash.py:222`): regex match against `dfu-util`'s stderr line format. Returns 0..100 or `None` if the line isn't a progress update. Robust against version drift — only the percent matters.

**Subprocess seam** (`run_dfu_flash` at `dfu_flash.py:248`): takes `subprocess_runner: Callable` so unit tests inject a fake. Default is `subprocess.Popen`. The seam means the entire flash flow is testable end-to-end without `dfu-util` actually running — exit codes, stderr lines, USB-disconnect mid-flash, permission errors all driven by fixture data.

**Udev rules** ship at `systemd/udev/99-meloaudio-stm32-dfu.rules` (referenced by the firmware doc — operator must install once with `sudo cp` + `sudo udevadm control --reload`).

### 4.7 Phase 5 — Backend Routes (`app/routes/devices_meloaudio_commander.py`)

**Mount point:** `/api/devices/meloaudio/commander/*`

| Route | Method | Returns | Purpose |
|---|---|---|---|
| `/status` | GET | `CommanderStatusResponse` | Live firmware kind + USB descriptor (polled by UI every 2.5s) |
| `/override` | GET | `CommanderOverrideResponse` | Currently saved per-installation override (or null) |
| `/override` | DELETE | 204 | Clear override → fall back to device-pack default |
| `/firmware/bundled` | GET | `BundledFirmwareResponse` | List of `.dfu` binaries shipped under `device-packs/meloaudio/firmware/` |

**Why no `POST /override`:** the override is *always* written by the discovery wizard. There's no operator path that hand-edits an override JSON via REST — the wizard or nothing. This keeps the API surface honest about how operators actually interact with overrides.

**Discovery + flash live behind WebSocket** (not REST): the orchestrator emits a stream of events that the frontend renders in real time. REST is for *state queries*, WS is for *progress*. This split is consistent with the rest of the platform (snapshot publish progress, AVB stream state, etc.).

### 4.8 Phase 5 — Carbon UI

**Mount point:** `/midi/devices/meloaudio-midi-commander/configurator`

**Page hierarchy** (`MeloAudioCommanderConfigurator.tsx`):

```
<MeloAudioCommanderConfigurator>
  <DeviceContextBanner />                       (canonical device-context pattern)
  <Section>
    <StatusCard />                              (firmware kind + raw USB descriptor)
    <Tabs>
      <Tab label="Discovery">
        <MeloAudioCommanderDiscoveryPanel />    (Phase 2 wizard)
      </Tab>
      <Tab label="Firmware">
        <MeloAudioCommanderFirmwarePanel />     (Phase 4 DFU flow + Phase 3 config push)
      </Tab>
    </Tabs>
  </Section>
</MeloAudioCommanderConfigurator>
```

**Polling cadence:** 2.5s for `/status`. Carbon `<InlineNotification>` surfaces `NOT_PRESENT` / `UNKNOWN` states; `<Tag>` renders the firmware kind with appropriate tone (green = `CUSTOM`, blue = `STOCK`, amber = `DFU_BOOTLOADER`).

**Restore-to-stock UX** (per locked decision Q2 2026-05-07): button opens a modal with the MeloAudio support contact link + a copy-friendly message template. No one-click restore — MeloAudio doesn't publish the stock binary.

---

## 5. Data flow end-to-end

### 5.1 Stock-firmware path (recommended default)

```
1. Operator connects Commander on stock firmware.
2. Phase 1 detection classifies → STOCK.
3. Operator opens Configurator → Discovery tab → "Run Wizard".
4. Backend opens ALSA-seq direct subscription (sidesteps PipeWire UMP gap).
5. Operator presses each control on prompt; subscriber captures CC/PC.
6. Wizard saves override at ~/.map2/devices/meloaudio-commander-discovered.yaml.
7. Resolver merges device-pack default + override → EffectiveCommanderProfile.
8. Controller-host loads merged descriptor on next mapping_activate.
9. Live MIDI from Commander → libremidi → host shm ring → mapping engine
   → engine_command IPC → dispatcher → handler → audio engine action.
```

### 5.2 Custom-firmware path

```
1. Operator connects Commander on stock firmware.
2. Phase 1 detection classifies → STOCK.
3. Operator opens Configurator → Firmware tab → "Install Custom Firmware".
4. Modal warns about firmware replacement (warranty implications stated).
5. Operator confirms; UI prompts them to put device in DFU mode (hold combo at boot).
6. Phase 1 re-detects → DFU_BOOTLOADER.
7. Phase 4 pre-check confirms dfu-util + .dfu binary + udev rules.
8. Phase 4 runs dfu-util; Carbon ProgressIndicator tracks phase + percent.
9. Device resets → Phase 1 re-detects → CUSTOM.
10. Operator clicks "Push MAP2 Canonical Config".
11. Phase 3 builds CommanderConfig from the canonical CSV → SysEx frame sequence.
12. Frames sent via MidiHostClient.send_sysex over the controller-host UDS.
13. Device flash now matches device-pack profile bit-identically.
14. No override required — resolver returns the device-pack default unchanged.
```

---

## 6. Design constraints + invariants

1. **Per-installation overrides never touch the device-pack on disk.** Device-pack profiles are version-controlled, attribution-preserved, and shared across every operator. Per-installation behaviour lives strictly in `~/.map2/devices/`.
2. **Resolver is the only consumer of overrides.** Controller-host, dispatcher, handlers all see `ResolvedBinding` — they don't know overrides exist.
3. **Detection is sysfs-only.** Never claims the USB device. Never blocks libremidi.
4. **Discovery uses ALSA-seq direct.** Until [`T2459-H7-PW-UMP`](T2459_H7_PW_UMP_DECISION.md) lands, PipeWire's JACK MIDI bridge is unreliable for MIDI 1.0 kernel clients.
5. **DFU flash is single-threaded + monitored.** Concurrent `dfu-util` invocations corrupt flash. The orchestrator holds an asyncio.Lock for the duration of a flash; UI disables conflicting actions.
6. **Bundled firmware ships with attribution.** `LICENSE-harvie256.md` lives next to every `.dfu` in `device-packs/meloaudio/firmware/`. Per [`feedback_respect_upstream_licenses.md`](/home/mm/.claude/projects/-home-mm-map2-audio/memory/feedback_respect_upstream_licenses.md), no bypass.
7. **Restore-to-stock is operator-driven.** MAP2 doesn't ship MeloAudio's stock firmware; the doc points operators at vendor support.
8. **No silent overrides.** UI surfaces "(from override)" vs "(from device-pack)" provenance on every binding row. Operators see exactly which CC came from where.

---

## 7. Test-surface map

| Phase | Backend tests | Frontend tests |
|---|---|---|
| Phase 1 (detection) | `test_commander_detection.py` (sysfs fixtures, every classification branch) | n/a (status renders straight from response) |
| Phase 2 (discovery) | `test_commander_discovery.py` (orchestrator state machine, save atomicity, override schema) + `test_commander_discovery_subscriber.py` (callback wiring + cancel cleanup) | `MeloAudioCommanderDiscoveryPanel.test.tsx` (per-step rendering, capture display, save flow) |
| Phase 3 (SysEx) | `test_sysex_packer.py` (every encoder, round-trip fixtures, chunking, frame builders) | n/a (frames built backend-side) |
| Phase 4 (DFU) | `test_dfu_flash.py` (pre-check, command construction, progress parser, full flow with subprocess fake — success, permission error, USB disconnect, dfu-util failure) | `MeloAudioCommanderFirmwarePanel.test.tsx` (phase rendering, progress display, error surfacing) |
| Phase 5 (routes) | `test_devices_meloaudio_commander_routes.py` (every route × every state) | `MeloAudioCommanderConfigurator.test.tsx` (page shell, tab switching, status polling) |
| Outer Loop 2 (resolver) | `test_commander_resolver.py` (override wins, missing override = pack default, provenance tagging) | n/a |
| Outer Loop 2 (dispatcher) | `test_engine_command_dispatcher.py` (exact match, glob, error isolation, observability) | n/a |
| Outer Loop 2 (handlers) | `test_engine_command_handlers.py` (each of the 4 canonical handlers × success + error paths) | n/a |
| Integration | `test_commander_end_to_end.py` (fake subscriber → orchestrator → resolver → dispatcher → handler observable) | covered by Configurator integration test |

**Aggregate (per worklist 2026-05-07 ship note):** 53 new backend tests + 12 backend route tests + 20 frontend tests + 6 prior phase suites = **231 passing in the meloaudio + t2459 selector**. Zero failures.

---

## 8. What's left

| Slice | Status | Gate |
|---|---|---|
| Phase 1 detection | ✅ Shipped | n/a |
| Phase 2 discovery | ✅ Shipped | n/a |
| Phase 3 SysEx packer | ✅ Shipped | n/a |
| Phase 4 DFU orchestrator | ✅ Shipped | n/a |
| Phase 5 Carbon UI + routes | ✅ Shipped | n/a |
| Outer Loop 2 dispatcher | ✅ Shipped | n/a |
| Outer Loop 2 handlers | ✅ Shipped | n/a |
| **Phase 6 docs (this doc)** | ✅ Shipped | n/a |
| Phase 7 HIL evidence | ⏳ **Operator gate** | Bench session walks both paths; evidence at `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-cfg-meloaudio-commander/`. See [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md). |

When Phase 7 closes, T2459-H3 acceptance ("physical Commander drives chain bypass + tuner-on through new path with bit-identical CC mappings") is satisfied by either the corrected stock-discovery override OR the canonical custom-firmware push — operator's pick.

---

## 9. Cross-references

- [`MELOAUDIO_COMMANDER_FIRMWARE.md`](MELOAUDIO_COMMANDER_FIRMWARE.md) — stock-mode reference table, install runbook, restore-to-stock contact info.
- [`ENGINE_COMMAND_DISPATCHER.md`](ENGINE_COMMAND_DISPATCHER.md) — Outer Loop 2 dispatcher contract; how to add new audio-surface targets.
- [`T2459_H7_PW_UMP_DECISION.md`](T2459_H7_PW_UMP_DECISION.md) — substrate gap that the Discovery Wizard sidesteps.
- [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md) — bench commands + pass criteria for Phase 7.
- [`T2459H_CLOSEOUT.md`](T2459H_CLOSEOUT.md) — parent epic state across H1–H7.
- [`MAP2MIDICONTROLLER_RETIREMENT.md`](MAP2MIDICONTROLLER_RETIREMENT.md) — H6 (legacy ALSA path retirement) runbook the H3 stack feeds into.
