"""Per-vendor device-specific service modules.

Each subdirectory is a vendor namespace; modules within are device-specific
(detection, configurators, vendor-protocol bridges) that don't fit the
generic patterns under `app/services/controllers/` or
`app/services/midi_hub/`.

T2459-H3-CFG opened this namespace with `meloaudio/` for the
MeloAudio MIDI Commander Configurator (firmware detection + discovery
wizard + custom-firmware DFU install + canonical SysEx config push).
"""
