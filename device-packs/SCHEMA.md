# MAP2 Device Pack Schema Reference

Authoritative reference for the YAML schemas under `_schema/`. Generated examples live alongside this doc.

**Spec:** [`docs/architecture/CONTROLLER_LAYER.md`](../docs/architecture/CONTROLLER_LAYER.md) §4.2 · **Worklist:** T2459-A4

## Schemas

| Schema | File | Applies to |
|---|---|---|
| Pack manifest | [`_schema/pack.schema.yaml`](_schema/pack.schema.yaml) | `<vendor>/pack.yaml` |
| Audio profile | [`_schema/audio-profile.schema.yaml`](_schema/audio-profile.schema.yaml) | `<vendor>/profiles/<model>.audio.yaml` |
| MIDI profile | [`_schema/midi-profile.schema.yaml`](_schema/midi-profile.schema.yaml) | `<vendor>/profiles/<model>.midi.yaml` |
| HID profile | [`_schema/hid-profile.schema.yaml`](_schema/hid-profile.schema.yaml) | `<vendor>/profiles/<model>.hid.yaml` |

All schemas are JSON Schema Draft-07.

## Worked example: `pack.yaml`

```yaml
schema_version: 1
pack_id: edirol-ua
vendor:
  name: Edirol (Roland)
  website: https://www.roland.com/global/categories/computer_music/audio_capture/
  support_url: https://www.roland.com/us/support/
description: |
  Audio interface family from Edirol/Roland's UA series — UA-25, UA-25EX, UA-101,
  UA-700, UA-1000, UA-1010. Includes shared identifier rules (Roland VID 0x0582)
  and a shared override component for R-BUS digital I/O on UAs that have it.
license: AGPL-3.0-only
source: map2-native
identifier_rules_path: shared/identifier_rules.yaml
models:
  - ua-25
  - ua-25ex
  - ua-101
  - ua-700
  - ua-1000
  - ua-1010
```

## Worked example: audio profile

```yaml
schema_version: 1
identity:
  manufacturer: Edirol (Roland)
  model: UA-1000
  family: Edirol UA series
  hardware_id: usb:0582:00ed
  alsa_card_regex: '^UA1000\b'
ports:
  - id: aux0
    kind: analog
    direction: bidirectional
    count: 1
    sample_rates: [44100, 48000, 88200, 96000]
    bit_depths: [24]
    connectors: [trs_quarter_inch]
    jack_node_pattern: 'EDIROL UA-1000 Pro'
mixer_surfaces:
  - id: front_panel_monitor
    kind: hardware
    description: 'Front-panel monitor mix; controlled physically.'
on_device_dsp: []
routing_topology:
  default_matrix: identity_10x10
  allowed_routes: [identity, fan_out, monitor_send]
loopback_ports:
  playback: 'EDIROL UA-1000 Pro:playback_AUX0'
  capture: 'EDIROL UA-1000 Pro:capture_AUX0'
use_case_presets:
  - id: studio_recording_8ch
    name: '8-channel studio recording'
    ports_used: [aux0, aux1, aux2, aux3, aux4, aux5, aux6, aux7]
    routing: identity
metadata:
  product_image_urls:
    - 'https://www.roland.com/us/products/ua-1000/images/ua-1000_front.jpg'
  datasheet_url: 'https://static.roland.com/assets/media/pdf/UA-1000_OM.pdf'
```

## Worked example: MIDI profile

```yaml
schema_version: 1
identity:
  manufacturer: Edirol (Roland)
  model: UA-1000
  alsa_client_pattern: 'UA-1000 MIDI'
  hardware_id: alsa-seq:UA-1000 MIDI:0
scripts:
  - scripts/ua-1000-scripts.js
controls:
  - status: 0xB0
    midino: 64
    target: audio.chain.1.bypass
    action: toggle
    fast_path: true
    description: 'Pedal CC 64 → toggle chain 1 bypass (fast-path C++ binding).'
  - status: 0xB0
    midino: 7
    script: UA1000Mapping.masterVolume
    description: 'CC 7 → JS-driven master volume with curve.'
outputs:
  - status: 0xB0
    midino: 64
    source: audio.chain.1.bypass
    description: 'LED feedback: pedal CC 64 reflects chain 1 bypass state.'
settings:
  - id: master_volume_curve
    label: 'Master volume curve'
    type: choice
    default: linear
    choices: [linear, log, exp, s_curve]
mixxx_alias_table:
  '[Channel1]': audio.chain.1
  '[Channel2]': audio.chain.2
  '[Master]':   audio.master
```

## Validation

CI gate: `pytest tests/test_device_packs_schema.py`. Walks every YAML under `device-packs/` (excluding `_mixx-imports/res/controllers/` since those are upstream Mixxx XML, not MAP2 YAML) and validates against the matching schema.

To validate locally during authoring:

```bash
python3 -c "
import yaml, jsonschema, sys
schema = yaml.safe_load(open('device-packs/_schema/audio-profile.schema.yaml'))
profile = yaml.safe_load(open('device-packs/<vendor>/profiles/<model>.audio.yaml'))
jsonschema.validate(profile, schema)
print('OK')
"
```
