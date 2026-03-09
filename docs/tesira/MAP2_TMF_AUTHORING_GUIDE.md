# MAP2-Compatible TMF Authoring Guide

## Critical Reality

MAP2 does **not** currently generate a real Biamp `.tmf` file.  
MAP2 can only package a `.tmf` that you provide (local file path in `artifact_uri`).

## Required Core Tags (Current MAP2 baseline)

Use these exact instance tags in your Tesira layout:

- `ExplicitAVBOutStream1`
- `ExplicitAVBInStream1`
- `LevelControl1`
- `LevelControl2`
- `Mixer1`
- `Mixer2`
- `PEQ1`
- `PEQ2`

These are the tags used by the default layout profile:

- `layout_id`: `forte_ci_avb_bridge_default`
- `device_family`: `FORTE_CI`
- `channel_profile`: `12x8`

## Feature Coverage Strategy

To expose the largest MAP2 feature surface, follow this naming rule:

- Instance tags should use `BlockType` + index format (examples: `Compressor1`, `GraphicEQ1`, `USBInput1`, `VoIPOutput1`).

MAP2's block registry/profile (`forte_ci_v1`) supports broad families including:

- I/O: `AudioInput`, `AudioOutput`, `USBInput`, `USBOutput`, `ExplicitAVBInStream`, `ExplicitAVBOutStream`, `VoIPInput`, `VoIPOutput`, `Aes67Input`, `Aes67Output`
- Routing: `Mixer`, `MatrixMixer`, `Router`, `SourceSelector`, `AutomaticMixer`, `AudioDelayMatrix`
- EQ/filters: `PEQ`, `GraphicEQ`, `Crossover`, `HighPassFilter`, `LowPassFilter`, `BandPassFilter`, `NotchFilter`, `FIRFilter`
- Dynamics/processing: `Compressor`, `Limiter`, `NoiseGate`, `AGC`, `Ducker`, `Expander`, `DeEsser`, `FeedbackSuppressor`, `LoudnessCompensation`, `AmbientNoiseCompensator`
- Control/metering: `LogicState`, `LogicMeter`, `GpioOutput`, `TimerControl`, `BooleanLogic`, `LevelMeter`, `RmsMeter`, `PeakHoldMeter`
- Utility: `ToneGenerator`, `NoiseGenerator`, `Delay`, `AECInput`, `AECReference`

## Build + Register Workflow

1. Build/compile the layout in Tesira Software and save/export a `.tmf`.
2. Copy the `.tmf` to the MAP2 host, for example:
   - `/home/mm/.map2/tesira/layouts/forte_ci_avb_bridge_default_1_0_0.tmf`
3. Register that file in MAP2 so ZIP export includes it:

```bash
TMF="/home/mm/.map2/tesira/layouts/forte_ci_avb_bridge_default_1_0_0.tmf"
SHA="$(sha256sum "$TMF" | awk '{print $1}')"

curl -sS -X POST "http://localhost:8080/api/tesira/layouts/import" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "layout_id": "forte_ci_avb_bridge_default",
  "version": "1.0.0",
  "name": "Forte CI AVB Bridge Default",
  "device_family": "FORTE_CI",
  "channel_profile": "12x8",
  "required_firmware": "5.5.0.2",
  "checksum": "sha256:${SHA}",
  "artifact_uri": "${TMF}",
  "instance_tag_map": {
    "talker_stream": "ExplicitAVBOutStream1",
    "listener_stream": "ExplicitAVBInStream1",
    "input_level": "LevelControl1",
    "output_level": "LevelControl2",
    "input_mixer": "Mixer1",
    "output_mixer": "Mixer2",
    "primary_eq": "PEQ1",
    "secondary_eq": "PEQ2"
  },
  "feature_flags": ["avb", "crosspoint", "eq", "gpio", "meters", "presets", "ptp"],
  "notes": "MAP2-compatible TMF",
  "is_active": true
}
JSON
```

4. Re-export manual package from MAP2 and verify TMF is inside:

```bash
curl -sS -o /tmp/tesira_pkg.zip \
  "http://localhost:8080/api/tesira/layouts/forte_ci_avb_bridge_default/manual-package?version=1.0.0"

unzip -l /tmp/tesira_pkg.zip
```

## If You Already Have SageVue Installed

If layouts were previously imported in SageVue, check the SageVue layouts folder on Windows:

- `C:\ProgramData\Biamp\SageVue\Layouts`

Copy the desired `.tmf` from there to the MAP2 host and register it with the command above.
