# MeloAudio MIDI Commander — Firmware Reference

**Subtask:** T2459-H3-CFG (Commander Configurator)
**Last updated:** 2026-05-07

This document is the canonical operator reference for which firmware can run on a MeloAudio MIDI Commander, how to switch between them, and how to recover from a bad flash.

---

## TL;DR

| Firmware | Source | CC mappings | MAP2 path |
|---|---|---|---|
| **Stock** | MeloAudio (factory) | Hardcoded per-mode; switch modes via boot-time button combos | Run the **Discovery Wizard** in MAP2 to capture per-installation CCs |
| **Custom (harvie256)** | [github.com/harvie256/midi-commander-custom](https://github.com/harvie256/midi-commander-custom) (MIT) | Fully configurable via SysEx | Run **Install Custom Firmware** then **Push MAP2 Canonical Config** |

MAP2 supports both. The Discovery Wizard is recommended for operators who don't want to flash anything; the custom firmware path is for operators who want bit-identical setups across MAP2 benches.

---

## Stock firmware

### What it is

The factory firmware that ships on every MeloAudio MIDI Commander. Identifies itself over USB as:

```
idVendor       0x2EEE  MeloAudio
idProduct      0x0301
iManufacturer  MeloAudio
iProduct       TSMIDI2.0
```

### Mode switching

Stock firmware has multiple **modes**, each with its own CC/PC mapping. The operator switches modes by **holding specific footswitch combinations while powering the device on** (USB hot-plug counts as power-on).

Per the [MeloAudio user manual (PDF)](https://medias.audiofanzine.com/files/ts-midi-manual-482144.pdf), the modes include:

| Mode | Boot combo | Purpose |
|---|---|---|
| Standard / Generic | (default — no combo held) | Generic CC/PC layout |
| Axe-Fx II | varies — see manual | Fractal Axe-Fx II preset/scene/IA layout |
| Axe-Fx III | varies — see manual | Fractal Axe-Fx III preset/scene/IA layout |
| Helix | varies — see manual | Line 6 Helix preset/snapshot layout |
| GT-1000 | varies — see manual | Boss GT-1000 layout |

Each mode emits a different set of CC numbers. **CCs are not user-configurable** — the operator can't change CC 24 → CC 80 in stock firmware.

This is why MAP2 ships the **Discovery Wizard**: rather than guessing which mode the operator is in (or insisting they switch to a "MAP2 canonical" mode that doesn't exist), MAP2 prompts the operator to press each control once, captures whatever CC the device emits, and saves the binding as a per-installation override.

### CC drift example

The 2026-05-07 HIL bench session captured the following on one operator's device, which was apparently in Axe-Fx III mode:

| Control | CC# emitted |
|---|---|
| Top switch 1 | CC 24 |
| Top switch 2 | CC 25 |
| Top switch 3 | CC 22 |
| Top switch 4 | CC 26 |
| Bottom A-D | PC 0-3 |
| Expression pedal 1 | CC 4 |
| Expression pedal 2 | CC 7 |

A different operator in Helix mode would emit a different set. MAP2's `device-packs/meloaudio/profiles/midi-commander.midi.yaml` documents the design-intent CC mapping (CC 80/81/82/14 + CC 7/1) but operators on stock firmware override that with whatever their device actually emits.

---

## Custom firmware (harvie256)

### What it is

[harvie256/midi-commander-custom](https://github.com/harvie256/midi-commander-custom) is an MIT-licensed open-source firmware that replaces the stock firmware on the same STM32 MCU. Once installed, the device:

- Identifies itself with an `iProduct` string containing **STM** (e.g., "STM32 Customisable Midi Foot Controller")
- Reuses the MeloAudio USB vendor/product IDs (no need to re-register a different USB ID)
- Accepts a **SysEx configuration protocol** for runtime config push:
  - Manufacturer ID: `0x7D` (non-commercial / educational reserved by the MMA)
  - `ERASE_FLASH = 52`, `WRITE_FLASH = 54`, `RESET = 60`
  - Operator pushes a CSV-encoded config; MAP2 packs it into 16-byte SysEx chunks; device writes to flash; reboots
- Supports up to **10 MIDI commands per button per bank**, multiple banks, full CC/PC/Note/Pitch-Bend with toggle/momentary/timed modes

### Install path

The MAP2 Configurator UI orchestrates:

1. **Operator clicks "Install Custom Firmware"** in the MeloAudio Commander page (under MIDI Services)
2. **MAP2 prompts the operator to enter DFU mode**
   * Hold the footswitch combo specified by the harvie256 README at power-on
   * The device's USB ID switches to `0483:DF11` (STM32 ROM bootloader)
   * MAP2's detection module surfaces `firmware_kind=dfu_bootloader`
3. **MAP2 invokes `dfu-util`** with the bundled `harvie256-vN.M.dfu` binary at `device-packs/meloaudio/firmware/`
4. **Operator power-cycles the device** (unplug + replug USB) to exit DFU mode
5. **MAP2 detects `firmware_kind=custom`** and the "Push MAP2 Canonical Config" button becomes available
6. **Operator clicks Push Canonical Config** → MAP2 SysEx-pushes the canonical profile → device emits CCs MAP2 expects bit-identically across operators

### Risks / disclaimers

- **Voids warranty.** MeloAudio's warranty doesn't cover devices flashed with third-party firmware.
- **Bricking risk is low but non-zero.** The STM32 ROM bootloader is hardware (mask ROM) — even a botched flash can be recovered via DFU. But a lost / damaged DFU button combo could leave the device in a bad state. Document the recovery path before starting.
- **Re-flashing back to stock is non-trivial.** See "Restore to stock firmware" below.

### License + attribution

harvie256's firmware is MIT-licensed. MAP2 ships:

- The `.dfu` binary at `device-packs/meloaudio/firmware/harvie256-vN.M.dfu` (TBD in Phase 4)
- The MIT LICENSE at `device-packs/meloaudio/firmware/LICENSE-harvie256.md` (TBD in Phase 4)
- This documentation linking back to the upstream project

The Python `cmdBinaryPacker` and `settingsBinaryPacker` modules from harvie256's repo are **ported** into MAP2 (Phase 3) under `app/services/devices/meloaudio/sysex_packer.py` with header attribution preserving the MIT license. The port is necessary because MAP2's controller-host architecture expects the SysEx writer to live in-process, not as an external Python script.

---

## Restore to stock firmware

**MeloAudio does not publish stock firmware binaries.** The harvie256 README includes a partial backup of stock firmware in `backup/`, but its completeness for full restoration is operator-verifiable only.

### Recommended path

1. **Contact MeloAudio support** at [https://meloaudio.com/community/champ/forums](https://meloaudio.com/community/champ/forums) and request the stock firmware `.dfu` for your device's serial number.
   - Provide the device's iSerial (visible via `lsusb -v -d 2eee:0301 | grep iSerial`).
   - State the firmware version (`bcdDevice` field) you'd like to restore to (default: latest production version).
2. **Once you receive the `.dfu` from MeloAudio**, enter DFU mode (same boot combo as for the harvie256 flash) and run:

   ```bash
   dfu-util -a 0 -s 0x08000000:leave -D <stock-firmware>.dfu
   ```

3. **Power-cycle** the device. It should re-enumerate as `iProduct="TSMIDI2.0"` (stock identifier).
4. **Verify** with `lsusb -v -d 2eee:0301` — the iProduct field should show `TSMIDI2.0`.

### Alternative: community-archived backups

The harvie256 repository's `backup/` folder may contain a stock firmware dump (operator-uploaded). Use at your own risk — community dumps may be from older firmware versions or non-standard regional variants. Always prefer a vendor-supplied `.dfu` when possible.

### What MAP2 does on restore-to-stock

1. The detection module starts surfacing `firmware_kind=stock` again.
2. The Configurator UI hides the "Push MAP2 Canonical Config" button (no longer applicable).
3. The Discovery Wizard is re-enabled — operator can re-run discovery to capture the stock firmware's actual CCs.
4. Any previously-saved per-installation override at `~/.map2/devices/meloaudio-commander-discovered.yaml` is preserved; the operator can keep using it OR delete it to let the device-pack defaults apply.

### What's NOT in scope

- MAP2 does not bundle stock firmware (license — MeloAudio's binary isn't public-redistributable)
- MAP2 does not auto-detect stock firmware corruption
- One-click restore is not possible without a vendor-supplied `.dfu`

---

## Discovery Wizard (stock firmware path)

### How it works

The Discovery Wizard subscribes directly to the kernel ALSA sequencer client for the Commander (typically client 32:0; sub-port name `TSMIDI2.0 MIDI 1`). For each step in a 12-control prompt sequence (top 1-4, bottom A-D, expression 1-2, bank up/down), the wizard:

1. Prompts the operator: "Press top switch 1 now."
2. Captures the next non-trivial MIDI message that arrives.
3. Records the binding `CommanderControl.TOP_1 → (status=0xB0, midino=24, channel=1)` in memory.
4. Advances to the next prompt.
5. After all 12 prompts (or operator-skipped prompts), saves the captured bindings to `~/.map2/devices/meloaudio-commander-discovered.yaml`.

### Why it subscribes directly to ALSA seq (not via libremidi)

PipeWire 1.4.10's UMP-MIDI2 ALSA seq clients (clients 142 + 143) don't auto-bridge legacy `[type=kernel]` MIDI 1.0 clients to JACK MIDI ports. The platform's normal MIDI flow goes USB → ALSA seq → PipeWire JACK MIDI bridge → libremidi → controller-host, but the bridge step doesn't fire for MIDI 1.0 kernel clients. Direct ALSA-seq subscription bypasses this gap.

This is filed as a separate platform issue (T2459-H7-PW-UMP) under the parent T2459-H epic. When that issue is resolved, the discovery wizard could move to libremidi for consistency, but the direct-ALSA path is a perfectly serviceable production path in the meantime.

### Override file format

The override is YAML at `~/.map2/devices/meloaudio-commander-discovered.yaml`. Example:

```yaml
schema_version: 1
device: meloaudio_midi_commander
captured_at_utc: "2026-05-07T15:00:00+00:00"
device_serial: "000000000000011"
notes: "Stock firmware, Axe-Fx III mode"
bindings:
  top_1:
    status: "0xB0"
    midino: 24
    channel: 1
    raw_value: 127
  top_2:
    status: "0xB0"
    midino: 25
    channel: 1
    raw_value: 127
  top_3:
    status: "0xB0"
    midino: 22
    channel: 1
    raw_value: 127
  top_4:
    status: "0xB0"
    midino: 26
    channel: 1
    raw_value: 127
  bottom_a:
    status: "0xC0"
    midino: 0
    channel: 1
  bottom_b:
    status: "0xC0"
    midino: 1
    channel: 1
  bottom_c:
    status: "0xC0"
    midino: 2
    channel: 1
  bottom_d:
    status: "0xC0"
    midino: 3
    channel: 1
  expression_1:
    status: "0xB0"
    midino: 4
    channel: 1
    raw_value: 13
  expression_2:
    status: "0xB0"
    midino: 7
    channel: 1
    raw_value: 68
```

The format is human-readable so operators can hand-edit it if a single binding changes (e.g., they re-mapped one footswitch using stock firmware's mode-switch combos).

### When the override is used

At runtime, MAP2 loads the device-pack profile (`device-packs/meloaudio/profiles/midi-commander.midi.yaml`) AND the override (if present). The override's `bindings` table shadows the device-pack's `controls` table on a per-control basis — only the controls that have an override entry are remapped; controls without an override entry use the device-pack default.

This means an operator can override JUST top switch 1 without disturbing the rest of the profile, and an operator who hasn't run the wizard at all sees the device-pack defaults (which match the design-intent / canonical mapping that the harvie256 firmware path produces).

---

## See also

- `docs/midi/MELOAUDIO_COMMANDER_CONFIGURATOR.md` — UI architecture (TBD in Phase 5)
- `docs/architecture/MIDI_BACKEND.md` — overall T2459-H controller-host architecture
- `device-packs/meloaudio/profiles/midi-commander.midi.yaml` — canonical profile
- `device-packs/meloaudio/scripts/commander.js` — JS dispatch script
- `app/services/devices/meloaudio/commander_detection.py` — Phase 1 detection module
- `app/services/devices/meloaudio/commander_discovery.py` — Phase 2 wizard orchestrator
