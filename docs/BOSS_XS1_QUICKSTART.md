# Boss XS-1 Poly Shifter - Quick Start Guide

## Installation & Setup (5 minutes)

### 1. Add to Your JUCE Project

Copy these files to your `juce-engine/Source/` directory:
```
├── BossXS1PolyShifterProcessor.h
├── BossXS1PolyShifterProcessor.cpp
├── BossXS1UI.h
└── BossXS1UI.cpp
```

### 2. Create & Prepare

```cpp
// In your audio component class
#include "BossXS1PolyShifterProcessor.h"
#include "BossXS1UI.h"

class MyAudioComponent {
private:
    map2::BossXS1PolyShifterProcessor shifter;
    std::unique_ptr<map2::BossXS1UI> shifterUI;
};

// In constructor or init:
void MyAudioComponent::setupAudio(double sampleRate, int blockSize) {
    shifter.prepare(sampleRate, blockSize, 2);  // stereo
    
    shifterUI = std::make_unique<map2::BossXS1UI>(shifter);
    addAndMakeVisible(shifterUI.get());
    shifterUI->setBounds(0, 0, 800, 380);
}
```

### 3. Process Audio

```cpp
void MyAudioComponent::processBlock(juce::AudioBuffer<float>& buffer) {
    shifter.process(buffer);  // Apply pitch shifting
}
```

### 4. Add MIDI Handling

```cpp
void MyAudioComponent::handleMidiMessage(const juce::MidiMessage& msg) {
    if (msg.isController()) {
        shifter.setMidiCC(msg.getControllerNumber(), 
                         msg.getControllerValue() / 127.0f);
    }
    else if (msg.isProgramChange()) {
        shifter.handleProgramChange(msg.getProgramChangeNumber());
    }
    else if (msg.isNoteOn()) {
        shifter.setMidiNote(msg.getNoteNumber(), msg.getVelocity());
    }
}
```

---

## Basic Usage Patterns

### Pattern 1: Drop D Tuning (Live)

```cpp
// Manual setup
auto params = shifter.getParameters();
params.shiftAmount = -2.0f;      // Drop D
params.balance = 100.0f;         // 100% wet
params.bypass = false;
shifter.setParameters(params);

// OR: Use preset
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::DropD);
```

### Pattern 2: Thick Doubling Effect

```cpp
auto params = shifter.getParameters();
params.detuneMode = true;         // Enable detune
params.balance = 70.0f;           // 70% wet for blend
params.feedback = 0.15f;          // Subtle shimmer
shifter.setParameters(params);
```

### Pattern 3: Octave Harmony

```cpp
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::OctaveUp);
// Already configured: shift=+12st, balance=50%, detune=off
```

### Pattern 4: Expression Pedal Control

```cpp
// Setup pedal parameters
auto params = shifter.getParameters();
params.pedalEnabled = true;
params.pedalMin = -2.0f;          // Heel position
params.pedalMax = +2.0f;          // Toe position
shifter.setParameters(params);

// In MIDI CC handler:
if (ccNumber == 22 || ccNumber == 11) {  // Pedal CCs
    shifter.setMidiCC(BossXS1PolyShifterProcessor::MIDI_CC_PEDAL, 
                      ccValue / 127.0f);
}
```

---

## Quick Parameter Reference

### Main Controls

| Parameter | Type | Range | Default | Use Case |
|-----------|------|-------|---------|----------|
| Shift | Continuous | -7 to +7 st | 0 st | Pitch change |
| Balance | Continuous | 0-100% | 50% | Wet/dry blend |
| Detune | Toggle | on/off | off | Chorus effect |
| Pedal | Continuous | 0-100% | 0% | Expression control |

### Fine Controls

| Parameter | Type | Range | Default | Use Case |
|-----------|------|-------|---------|----------|
| Glide | Continuous | 0-100ms | 0ms | Smooth transitions |
| Feedback | Continuous | 0-0.7 | 0 | Shimmer/special FX |
| Mode | Toggle | Shift/Detune | Shift | Algorithm select |

---

## MIDI CC Quick Reference

```
Connect your MIDI controller:
┌─────────────────────────────────┐
│ CC #20 → Pitch Shift (main knob)│
│ CC #21 → Balance (wet/dry)      │
│ CC #22 → Expression Pedal       │
│ CC #23 → Glide Time             │
│ CC #24 → Feedback Amount        │
│ CC #25 → Mode Select            │
└─────────────────────────────────┘
```

**Pro Tip**: Assign your expression pedal to CC #22 for real-time pitch bending!

---

## Preset Quick Selection

### Load by Program Change
```cpp
// PC 1 = Drop D
// PC 7 = Octave Up
// PC 10 = Micro Wide (±20c)
shifter.handleProgramChange(7);  // Load Octave Up
```

### Load by Name
```cpp
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::DropD);
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::Capo3rdFret);
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::StringDoubling);
```

### List All Presets
```cpp
for (int i = 0; i < 23; i++) {
    auto preset = static_cast<BossXS1PolyShifterProcessor::Preset>(i);
    std::cout << BossXS1PolyShifterProcessor::getPresetName(preset) << std::endl;
}
```

---

## Audio Processing Examples

### Example 1: Clean Capo Simulation
```cpp
// Simulate a capo on 3rd fret without retuning
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::Capo3rdFret);
// Auto-configured: shift=+3st, balance=100%, detune=off
```

### Example 2: 12-String Guitar Effect
```cpp
// Layer shifted signal with original
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::StringDoubling);
// Auto-configured: shift=0, detune=±12c, balance=65%
```

### Example 3: Bass Octave Stack
```cpp
// Fatten up a bass guitar with octave down + doubling
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::SubBass);
// Outputs sub frequencies for depth
```

### Example 4: Lead Vocal Enhancement
```cpp
// Add thickness to lead vocal
shifter.loadPreset(BossXS1PolyShifterProcessor::Preset::VoiceDoubling);
// Carefully tuned ±15 cents for vocal blend
```

---

## Performance Optimization Tips

### For Live Performance
1. Pre-load all presets you'll use
2. Set glide time > 0 for smooth switching
3. Keep feedback < 0.4 to prevent runaway oscillation
4. Test MIDI connections before the show

### For Studio Recording
1. Enable detailed metering (check output levels)
2. Bounce to audio to free CPU
3. Experiment with glide/feedback for unique tones
4. Save custom presets for consistency

### CPU Efficiency
```cpp
// Processor is already optimized, but:
// - Use higher buffer sizes in DAW (512+) for less overhead
// - Don't automate CC values excessively (smooth changes)
// - Monitor CPU with multiple instances
```

---

## Troubleshooting

### No Sound Output
- [ ] Check bypass is OFF (display shows "ACTIVE")
- [ ] Verify balance > 0% (not 100% dry)
- [ ] Check input levels (meter should show activity)

### Preset Not Changing
- [ ] Confirm glide time allows parameter change
- [ ] Check Program Change sent on correct channel
- [ ] Verify preset number 0-22

### MIDI Not Responding
- [ ] Check CC# values (20-25 only, or 22 for pedal)
- [ ] Verify MIDI input enabled in DAW
- [ ] Test with MIDI monitor to see incoming data

### Sound Quality Issues
- [ ] High feedback (>0.6) may cause artifacts
- [ ] Extreme pitch shifts (±7st) work best with glide
- [ ] Stereo mixes better than mono for this effect

---

## Next Steps

1. **Integrate into DAW** - Load as VST3/AU/LV2
2. **Map Your Controller** - Test CC#20-25
3. **Create Presets** - Customize for your songs
4. **Experiment** - Try extreme settings for new sounds
5. **Perform Live** - Use expression pedal for dynamics

---

## Support & Resources

- **Full Documentation**: See `BOSS_XS1_IMPLEMENTATION.md`
- **MIDI Reference**: See `BOSS_XS1_MIDI_MAPPING.md`
- **Boss Official**: https://www.boss.info/us/products/xs-1/

---

**Happy Shifting! 🎸**

Version 1.0.0 | February 2, 2026
