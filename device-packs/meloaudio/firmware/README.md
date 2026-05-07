# MeloAudio MIDI Commander — Bundled Firmware

This directory holds the third-party firmware images MAP2 can flash onto a MeloAudio MIDI Commander via the in-platform Configurator (T2459-H3-CFG Phase 4).

## Files in this directory

| File | Purpose | License | Status |
|---|---|---|---|
| `harvie256-vN.M.dfu` | harvie256 community custom firmware (`.dfu` binary for `dfu-util`) | MIT (see LICENSE-harvie256.md) | **TBD — bundle in next slice** |
| `LICENSE-harvie256.md` | Upstream MIT license + attribution | MIT | **TBD — bundle in next slice** |
| `README.md` | This file | (project license) | ✅ |

**No stock MeloAudio firmware is bundled** — MeloAudio doesn't publish a redistributable `.dfu` image. To restore stock firmware, contact MeloAudio support per `docs/midi/MELOAUDIO_COMMANDER_FIRMWARE.md` § "Restore to stock firmware."

## Why bundle the harvie256 firmware

- MIT license permits redistribution with attribution
- One-click install (vs. "go download this from GitHub first")
- Pinned version → predictable encoder behavior (the SysEx packer in `app/services/devices/meloaudio/sysex_packer.py` is bound to specific firmware byte layouts)

## Operator path

1. Plug in Commander (stock firmware)
2. Open MAP2 → MIDI Services → MeloAudio Commander Configurator
3. Click "Install Custom Firmware" → MAP2 prompts you to enter DFU mode
4. Hold the bootloader button combo at power-on (per harvie256 README) until the device's USB ID switches to `0483:DF11`
5. MAP2 invokes `dfu-util -a 0 -s 0x08000000:leave -D harvie256-vN.M.dfu` and reports progress
6. Device reboots to normal mode with the new firmware
7. Click "Push MAP2 Canonical Config" → SysEx config sent → device emits MAP2-canonical CCs

## Restoring stock firmware

See `docs/midi/MELOAUDIO_COMMANDER_FIRMWARE.md` § "Restore to stock firmware". TL;DR: contact MeloAudio support, request a `.dfu`, flash with `dfu-util` manually.

## Upgrading the bundled firmware version

When a new harvie256 release ships:

1. Download the new `.dfu` from [github.com/harvie256/midi-commander-custom/releases](https://github.com/harvie256/midi-commander-custom/releases)
2. Verify the SysEx packer constants in `app/services/devices/meloaudio/sysex_packer.py` still match the new firmware's expected byte layout (read the upstream `flash_midi_settings.c` + `cmdBinaryPacker.py` for any wire-format changes)
3. Run the encoder regression tests (`pytest tests/test_meloaudio_sysex_*.py`)
4. Replace `harvie256-vN.M.dfu` here, update version in this README + the worklist
5. Bench-verify with a physical device before tagging the bundle as stable
