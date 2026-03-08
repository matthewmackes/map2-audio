# Tesira Block Registry (Versioned)

MAP2 now uses a versioned Tesira block-definition registry to drive both:

- design-canvas block palette (`/devices/{id}/designs/library`)
- runtime DSP probing profiles (`tesira_dsp_model.py`)

## Active Profile

- `forte_ci_v1`

## Profile Contents

Each block declaration includes:

- `block_type` (instance-tag prefix)
- `title`
- `category`
- `io` ports (domain + channels)
- `parameter_map` (value type, unit, range, step)
- `probe` metadata (runtime block type, probe attribute, default channels)
- `editor` family hint

## Major Families Included

- I/O: `AudioInput`, `AudioOutput`, `USBInput`, `USBOutput`
- Gain/Metering: `LevelControl`, `LevelMeter`
- Routing: `Mixer`, `MatrixMixer`, `Router`, `SourceSelector`
- EQ/Filter: `PEQ`, `GraphicEQ`, `Crossover`
- Dynamics: `Compressor`, `Limiter`, `NoiseGate`, `AGC`, `Ducker`
- Time: `Delay`
- AEC: `AECInput`, `AECReference`
- Logic/Control: `LogicState`, `LogicMeter`
- Network/Streams: `ExplicitAVBInStream`, `ExplicitAVBOutStream`, `VoIPInput`, `VoIPOutput`
- Generators: `ToneGenerator`, `NoiseGenerator`

## API Notes

`GET /api/tesira/devices/{device_id}/designs/library`

- Optional query: `?profile=forte_ci_v1`
- Response now includes:
  - `profile`
  - `available_profiles`
  - `blocks`

## UI Notes

- Design canvas exposes profile selector before block chooser.
- DSP Explorer now surfaces block title/family metadata and search by family/title.
- DSP Block panel shows the editor family hint.
