# WDF Amp Plugin

A high-fidelity JUCE audio plugin modeling three iconic tube amplifiers using Wave Digital Filter (WDF) techniques.

## Amp Models

### Peavey 5150
- Classic American high-gain tone
- 3-stage preamp with bright switch
- 6L6 power section
- Signature aggressive distortion

### Marshall JCM800
- British high-gain character
- Long-tailed pair phase inverter  
- EL34 power tubes
- Classic rock/metal tones

### Mesa Dual Rectifier
- Modern high-gain design
- 5-stage preamp cascade
- Silicon/Tube rectifier simulation
- Massive low-end with tight response

## Features

- **Wave Digital Filter Modeling**: Physics-based circuit simulation
- **Nonlinear Triode Models**: Koren tube equations with Newton-Raphson solver
- **Authentic Tone Stacks**: Per-amp EQ networks
- **Oversampling**: Up to 16x for alias-free distortion
- **Power Supply Sag**: Tube rectifier dynamics
- **Full Parameter Automation**: DAW-compatible

## Building

### Requirements

- CMake 3.22+
- C++17 compatible compiler
- JUCE 7.x (via CMake package)

### Build Steps

```bash
# Configure
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build . --config Release -j$(nproc)
```

### Output Formats

- VST3
- AU (macOS)
- LV2
- Standalone

## Controls

| Parameter | Description |
|-----------|-------------|
| Gain | Preamp gain/drive |
| Bass | Low frequency EQ |
| Mid | Midrange EQ |
| Treble | High frequency EQ |
| Presence | High frequency emphasis |
| Master | Output level |
| Bright | High frequency boost switch |
| Resonance | Low frequency feedback |
| Sag | Power supply dynamics |
| Bias | Power tube bias point |

## Technical Details

### WDF Architecture

```
Input -> Series/Parallel Adaptors -> Triode Stages -> Tone Stack -> Phase Inverter -> Power Stage -> Transformer -> Output
```

### Triode Model

Uses Koren equations for accurate tube simulation:
- Plate current computation
- Newton-Raphson solver for nonlinear junction
- Dynamic plate resistance calculation

### Oversampling

Polyphase FIR filtering with:
- Kaiser-windowed sinc interpolation
- Anti-aliasing decimation
- DC blocking

## License

MIT License - See LICENSE file

## Credits

- WDF theory: Alfred Fettweis, Kurt Werner
- Tube modeling: Norman Koren
- JUCE framework: ROLI/PACE
