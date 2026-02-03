# MAP2 Audio Platform - Plugin Optimization & Custom Cards Implementation Plan

## Overview

This plan addresses three main objectives:
1. **Remove redundant LV2 plugins** - Keep only best-in-class plugins per category
2. **Surface JUCE native processors** in the signal chain menu with human-readable names
3. **Create custom parameter cards** for each plugin with full feature access

---

## Final Plugin List (17 Total)

### JUCE Native Processors (7) - Built into C++ engine
| Name | Category | Description |
|------|----------|-------------|
| **Compressor** | Dynamics | Smooth compression with adjustable ratio and knee |
| **Limiter** | Dynamics | Brick wall limiter for peak control |
| **Noise Gate** | Dynamics | Noise gate with adjustable threshold and timing |
| **8-Band Parametric EQ** | EQ | Professional 8-band parametric equalizer |
| **Cabinet IR** | Cabinet | Cabinet impulse response loader |
| **Reverb IR** | Reverb | Convolution reverb with impulse response |
| **Neural Amp Modeler** | Amplifier | Neural network amp modeling |

### LV2 Plugins to Keep (10)
| Name | Category | Reason |
|------|----------|--------|
| **Dragonfly Room Reverb** | Reverb | Best algorithmic room reverb |
| **Dragonfly Hall Reverb** | Reverb | Best algorithmic hall reverb |
| **Dragonfly Plate Reverb** | Reverb | Best algorithmic plate reverb |
| **TooB CE-2 Chorus** | Modulation | Authentic Boss CE-2 clone |
| **TooB BF-2 Flanger** | Modulation | Authentic Boss BF-2 clone |
| **TooB Phaser** | Modulation | Quality phaser effect |
| **TooB Tremolo** | Modulation | Quality tremolo effect |
| **TooB Delay** | Delay | Flexible delay with feedback |
| **TooB Tuner** | Utility | Essential guitar tuner |
| **TooB 4Looper** | Utility | 4-track looper |

### LV2 Plugins to Remove (19) - Redundant with JUCE
- TooB NAM, TooB ML (→ JUCE NAMProcessor)
- TooB Cab IR, TooB CabSim (→ JUCE ConvolutionProcessor)
- TooB Convolution Reverb, TooB Freeverb (→ JUCE Convolution + Dragonfly)
- TooB Parametric EQ, TooB 3-Band EQ, TooB GE-7, TooB Tone Stack (→ JUCE FilterProcessor)
- TooB Noise Gate (→ JUCE DynamicsProcessor)
- TooB Volume, Mix, Input Stage, Spectrum, Recorder, Player, One-Button Looper (utilities)
- Dragonfly Early Reflections (Room Reverb has this)

---

## Implementation Phases

### Phase 1: Configuration Updates

**Files to modify:**

1. `app/config/default_lv2_effects.json` - Remove redundant plugins
2. `app/config/juce_processors.json` (NEW) - Define JUCE processors with human names
3. `app/routes/plugins.py` - Add JUCE processors to discovery API

### Phase 2: Custom Parameter Cards

**17 custom cards to create:**

#### JUCE Cards (7)
| Card | File | Key Features |
|------|------|--------------|
| CompressorCard | `PluginCards/Custom/JUCE/CompressorCard.tsx` | Threshold, Ratio, Attack, Release, Knee, Makeup + GR Meter + Transfer Curve |
| LimiterCard | `PluginCards/Custom/JUCE/LimiterCard.tsx` | Ceiling, Release + GR Meter |
| GateCard | `PluginCards/Custom/JUCE/GateCard.tsx` | Threshold, Ratio, Attack, Release + Open/Close Indicator |
| ParametricEQCard | `PluginCards/Custom/JUCE/ParametricEQCard.tsx` | 8 bands with Freq/Gain/Q/Type + Interactive EQ Curve |
| CabinetIRCard | `PluginCards/Custom/JUCE/CabinetIRCard.tsx` | IR Browser, Mix, Bypass + IR Visualization |
| ReverbIRCard | `PluginCards/Custom/JUCE/ReverbIRCard.tsx` | IR Browser, Mix, PreDelay + Decay Visualization |
| NAMCard | `PluginCards/Custom/JUCE/NAMCard.tsx` | Model Browser, Input/Output Gain, Normalize + Level Meters |

#### Dragonfly Cards (3)
| Card | File | Key Features |
|------|------|--------------|
| DragonflyRoomCard | `PluginCards/Custom/Dragonfly/DragonflyRoomCard.tsx` | Size, Width, PreDelay, Decay, Diffuse, Spin, Wander, HiCut, LoCut, Early/Late Level |
| DragonflyHallCard | `PluginCards/Custom/Dragonfly/DragonflyHallCard.tsx` | Similar to Room with hall character |
| DragonflyPlateCard | `PluginCards/Custom/Dragonfly/DragonflyPlateCard.tsx` | Plate-specific parameters |

#### TooB Cards (7)
| Card | File | Key Features |
|------|------|--------------|
| CE2ChorusCard | `PluginCards/Custom/TooB/CE2ChorusCard.tsx` | Rate, Depth (minimal like original) + LFO Waveform |
| BF2FlangerCard | `PluginCards/Custom/TooB/BF2FlangerCard.tsx` | Manual, Depth, Rate, Res + LFO Waveform |
| PhaserCard | `PluginCards/Custom/TooB/PhaserCard.tsx` | Rate, Depth, Feedback, Stages + LFO Waveform |
| TremoloCard | `PluginCards/Custom/TooB/TremoloCard.tsx` | Rate, Depth, Waveform + LFO Waveform |
| DelayCard | `PluginCards/Custom/TooB/DelayCard.tsx` | Time, Feedback, Mix, Sync + Delay Tap Grid |
| TunerCard | `PluginCards/Custom/TooB/TunerCard.tsx` | Frequency, Note, Cents + Large Tuner Display |
| LooperCard | `PluginCards/Custom/TooB/LooperCard.tsx` | 4 Tracks, Record/Play/Stop, Volume per track |

### Phase 3: Hook Updates

**New hooks to create:**
- `web/src/app/hooks/useIR.ts` - Cabinet/Reverb IR control
- `web/src/app/hooks/useNAM.ts` - NAM model management (if not already complete)

### Phase 4: Registry Updates

**File:** `web/src/app/components/PluginCards/registry.ts`

Register all 17 custom cards with their plugin URIs.

### Phase 5: Default Chain Templates

Update preset chains to use optimized plugin set.

---

## File Structure After Implementation

```
web/src/app/components/PluginCards/
├── Custom/
│   ├── CardinalCard.tsx (existing)
│   ├── JUCE/
│   │   ├── CompressorCard.tsx
│   │   ├── LimiterCard.tsx
│   │   ├── GateCard.tsx
│   │   ├── ParametricEQCard.tsx
│   │   ├── CabinetIRCard.tsx
│   │   ├── ReverbIRCard.tsx
│   │   └── NAMCard.tsx
│   ├── Dragonfly/
│   │   ├── DragonflyRoomCard.tsx
│   │   ├── DragonflyHallCard.tsx
│   │   └── DragonflyPlateCard.tsx
│   └── TooB/
│       ├── CE2ChorusCard.tsx
│       ├── BF2FlangerCard.tsx
│       ├── PhaserCard.tsx
│       ├── TremoloCard.tsx
│       ├── DelayCard.tsx
│       ├── TunerCard.tsx
│       └── LooperCard.tsx
```

---

## Parameter Research Sources

| Plugin Family | Source Repository |
|---------------|-------------------|
| JUCE Processors | Local: `juce-engine/Source/*.h` |
| Dragonfly Reverb | https://github.com/michaelwillis/dragonfly-reverb |
| TooB/ToobAmp | https://github.com/rerdavies/ToobAmp (PiPedal) |
| Boss CE-2 | Circuit analysis + ToobAmp implementation |
| Boss BF-2 | Circuit analysis + ToobAmp implementation |

---

## Permissions Needed

- **Bash**: Create directories, run build commands
- **File operations**: Create/edit TypeScript, JSON, Python files

---

## Success Criteria

- [ ] Signal chain menu shows all 17 plugins with human-readable names
- [ ] Each plugin has a custom parameter card
- [ ] Cards match consistent visual style (PluginCardShell base)
- [ ] Real-time metering works for dynamics/NAM
- [ ] EQ visualization is interactive
- [ ] All redundant plugins removed from defaults
- [ ] Default chain templates work with new plugin set
