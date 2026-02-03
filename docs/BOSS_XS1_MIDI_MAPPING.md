# Boss XS-1 MIDI Control Reference Guide

## Quick Reference Card

### Control Change (CC) Mapping

```
╔═══════════════════════════════════════════════════════════════╗
║              BOSS XS-1 MIDI CC ASSIGNMENTS                    ║
╠═══════════╦══════════════╦═════════════╦═══════════════════════╣
║ CC Number ║ Parameter    ║ Range       ║ Default/Note          ║
╠═══════════╬══════════════╬═════════════╬═══════════════════════╣
║ #20       ║ SHIFT        ║ -7 to +7 st ║ Pitch amount (0-127)  ║
║ #21       ║ BALANCE      ║ 0-100%      ║ Wet/Dry mix           ║
║ #22       ║ PEDAL        ║ 0-100%      ║ Expression pedal      ║
║ #23       ║ GLIDE        ║ 0-100ms     ║ Smoothing time        ║
║ #24       ║ FEEDBACK     ║ 0-0.7       ║ Shimmer/spiral        ║
║ #25       ║ MODE         ║ Toggle      ║ 0=Shift, 127=Detune   ║
╚═══════════╩══════════════╩═════════════╩═══════════════════════╝

Program Change: 0-22 (Selects Preset)
Note Range: C3-B3 (MIDI Notes 36-47) = Direct Preset Mapping
```

## Detailed MIDI Implementation

### CC #20 - PITCH SHIFT
**Purpose**: Control the main pitch shift amount
**Range**: CC Value 0-127 maps to -7.0 to +7.0 semitones
**Curve**: Linear
**Behavior**: 
- CC 0 = -7 semitones (perfect 5th down)
- CC 64 = 0 semitones (no shift)
- CC 127 = +7 semitones (perfect 5th up)

**Typical Use Cases**:
- Real-time pitch bending with expression pedal
- Capo simulation
- Drop tuning selection
- Harmonic shifts during performance

### CC #21 - BALANCE (Wet/Dry Mix)
**Purpose**: Control balance between dry (original) and wet (shifted) signal
**Range**: CC Value 0-127 maps to 0-100% wet
**Curve**: Linear
**Behavior**:
- CC 0 = 100% dry (no effect)
- CC 64 = 50% dry, 50% wet (parallel blend)
- CC 127 = 100% wet (effect only)

**Typical Use Cases**:
- Gradual effect introduction
- 12-string effect (octave up at 50% mix)
- Preserve original tone while adding harmonies
- Creative sound design

### CC #22 - EXPRESSION PEDAL
**Purpose**: Dynamic control from external expression pedal
**Range**: CC Value 0-127 maps to 0-100% pedal travel
**Curve**: Linear
**Behavior**:
- Responds to continuous MIDI CC (typically CC7, CC11, or custom)
- Pedal minimum/maximum are configured separately
- Creates smooth pitch sweeps from heel to toe

**Setup Example**:
```
Pedal Minimum: -2 semitones (Drop D)
Pedal Maximum: +2 semitones (Capo 2nd)
→ Smooth range adjustment for live performance
```

### CC #23 - GLIDE (Portamento)
**Purpose**: Smoothing time for pitch changes
**Range**: CC Value 0-127 maps to 0-100ms
**Curve**: Linear
**Behavior**:
- CC 0 = Instant pitch changes (no glide)
- CC 64 = 50ms glide time
- CC 127 = 100ms glide (smooth vocal-like)

**Musical Applications**:
- Glitch-free preset switching
- Smooth manual pitch shifts
- Create vocal-like legato effects
- Reduce digital artifacts

### CC #24 - FEEDBACK
**Purpose**: Add feedback for special effects
**Range**: CC Value 0-127 maps to 0-0.7 (bounded)
**Curve**: Linear (capped at 0.7 to prevent infinite feedback)
**Behavior**:
- CC 0 = No feedback
- CC 64 ≈ 0.35 feedback (subtle)
- CC 100 = 0.55 feedback (strong shimmer)
- CC 127 = 0.7 feedback (max, self-oscillating)

**Effect Characteristics**:
- Low feedback (0-0.2): Subtle shimmer, 12-string effect
- Medium (0.2-0.4): Noticeable feedback, chorus-like
- High (0.4-0.7): Extreme pitch swelling, self-resonance

### CC #25 - MODE SELECT
**Purpose**: Toggle between Shift and Detune algorithms
**Range**: Binary (0-63=Shift, 64-127=Detune)
**Behavior**:
- CC 0 = SHIFT mode (±7 semitones pitch shift)
- CC 127 = DETUNE mode (±20 cents doubling)

**Mode Characteristics**:

**SHIFT Mode**:
- Full pitch shifting algorithms
- Maintains clarity across wide ranges
- Best for: Drop tunings, capos, harmonies

**DETUNE Mode**:
- ±20 cents maximum deviation
- Creates thick chorus/doubling effect
- Best for: 12-string simulation, fattening tone

---

## Program Change Mapping

### PC 0-22 - Preset Selection

```
╔══════════╦════════════════════════════════════════════════╗
║ PC Value ║ Preset Name                                    ║
╠══════════╬════════════════════════════════════════════════╣
║    0     ║ Manual (User-defined settings)                 ║
║    1     ║ Drop D                                         ║
║    2     ║ Drop D#                                        ║
║    3     ║ Half Step Down                                 ║
║    4     ║ Capo 2nd Fret                                  ║
║    5     ║ Capo 3rd Fret                                  ║
║    6     ║ Capo 5th Fret                                  ║
║    7     ║ Octave Up                                      ║
║    8     ║ Octave Down                                    ║
║    9     ║ Octave Up/Down (stereo)                        ║
║   10     ║ Micro Pitch Wide (±20c)                        ║
║   11     ║ Micro Pitch Narrow (±8c)                       ║
║   12     ║ Voice Doubling (±15c)                          ║
║   13     ║ String Doubling (±12c)                         ║
║   14     ║ Pianist Octaves (±10c)                         ║
║   15     ║ Sub Bass (-7 semitones)                        ║
║   16     ║ Sonic Screamer (+7 semitones)                  ║
║   17     ║ Unique Intervals (Major 3rd)                   ║
║   18     ║ Minor Third (-3 semitones)                     ║
║   19     ║ Chord Shift (+3 semitones)                     ║
║   20     ║ Detune Chorus (feedback effect)                ║
║   21     ║ Spacey Vibrato (glide effect)                  ║
║   22     ║ Robotic Mod (extreme feedback)                 ║
╚══════════╩════════════════════════════════════════════════╝
```

**Program Change Behavior**:
- Instant recall of all parameters
- No parameter interpolation (direct jump)
- Useful for switching between songs/sections
- Can be sequenced in DAW for automatic changes

---

## Note Mapping

### MIDI Note to Preset (C3-B3)

Direct MIDI note assignment for keyboard-based control:

```
╔═══════════════════════════════════════════════════════════╗
║         NOTE-TO-PRESET MAPPING (MIDI Notes 36-47)         ║
╠═══════════════════════════════════════════════════════════╣
║ Note  │ Name  │ MIDI# │ Preset                            ║
╠───────┼───────┼───────┼───────────────────────────────────╣
║  C3   │  C    │  36   │ Manual                            ║
║  C#3  │  C#   │  37   │ Drop D                            ║
║  D3   │  D    │  38   │ Drop D#                           ║
║  D#3  │  D#   │  39   │ Half Step Down                    ║
║  E3   │  E    │  40   │ Capo 2nd Fret                     ║
║  F3   │  F    │  41   │ Capo 3rd Fret                     ║
║  F#3  │  F#   │  42   │ Capo 5th Fret                     ║
║  G3   │  G    │  43   │ Octave Up                         ║
║  G#3  │  G#   │  44   │ Octave Down                       ║
║  A3   │  A    │  45   │ Octave Up/Down                    ║
║  A#3  │  A#   │  46   │ Micro Pitch Wide                  ║
║  B3   │  B    │  47   │ Micro Pitch Narrow                ║
╚═══════════════════════════════════════════════════════════╝
```

**Implementation**:
```cpp
if (noteNumber >= 36 && noteNumber <= 47 && velocity > 0) {
    int presetIdx = noteNumber - 36;
    shifter.loadPreset(static_cast<Preset>(presetIdx));
}
```

**Advantages**:
- Quick access without program change delay
- Intuitive keyboard layout
- Can be played back from keyboard notes
- Supports velocity (could add variation)

---

## Real-World MIDI Setup Examples

### Example 1: Expression Pedal Control (Live Performance)

**Scenario**: Control pitch shift in real-time with expression pedal

```
Physical Setup:
┌─────────────────────────────┐
│ MIDI Controller             │
│ ├─ Expression Pedal → CC22  │
│ ├─ Footswitch 1 → PC 1      │  (Drop D)
│ ├─ Footswitch 2 → PC 7      │  (Octave Up)
│ └─ Footswitch 3 → CC25      │  (Mode Toggle)
└─────────────────────────────┘
         ↓
    MIDI → Plugin
         ↓
    Pitch Shifter
```

**Configuration**:
```
CC22 (Expression Pedal): 
  - Minimum: 40 (maps to -4 semitones)
  - Maximum: 88 (maps to +4 semitones)
  - Curve: Linear
  - Usage: Smooth pitch bending during performance
```

### Example 2: Keyboard Preset Selection (Studio)

**Scenario**: Select presets from keyboard keys

```
MIDI Keyboard Setup:
┌──────────────────────────────┐
│ Keyboard Notes C3-B3         │
│ └─ Trigger Preset 0-11       │
└──────────────────────────────┘
         ↓
    Note Messages
         ↓
    Plugin Preset Loader
```

**Workflow**:
```
Press C3  → Load "Manual" (customize)
Press C#3 → Load "Drop D" 
Press D3  → Load "Drop D#"
...etc for quick auditioning
```

### Example 3: DAW Automation (Mixing)

**Scenario**: Automate parameters during mixdown

```
DAW Automation:
┌──────────────────────────────────┐
│ Track Automation Lanes           │
│ ├─ CC #21 (Balance)              │
│ ├─ CC #22 (Pedal Position)       │
│ ├─ CC #23 (Glide)                │
│ └─ CC #24 (Feedback)             │
└──────────────────────────────────┘
         ↓
    Draws automation curves
         ↓
    Real-time parameter changes
```

**Example Automation**:
- 0:00-0:30: Gradually increase Balance (0→100)
- 0:30-1:00: Sweep Pedal Position (0→100→0)
- 1:00+: Gentle Glide increase for smooth transitions

### Example 4: Synchronized Switching

**Scenario**: Automatic preset switching on beat

```
Synchronization Setup:
┌──────────────────────────────┐
│ MIDI Beat/Sync Clock         │
│ └─ Trig on 1.1.1             │
└──────────────────────────────┘
         ↓
    PC Sequence Controller
         ↓
    PC 7 → PC 4 → PC 10 → PC 7  (repeating)
```

**Timing**:
- Bar 1: Octave Up (PC 7)
- Bar 2: Capo 2nd (PC 4)
- Bar 3: Micro Wide (PC 10)
- Bar 4: Repeat cycle

---

## Advanced Techniques

### MIDI Learn Mode (Suggested Feature)

For custom MIDI mapping:

```cpp
shifter.enableMidiLearnMode(true);
shifter.assignMidiCC(humanReadableParam, ccNumber);
// User twists knob on controller → auto-detect CC
// Store in profile for next session
```

### CC Curve Customization

For non-linear parameter ranges:

```cpp
enum class MidiCurve {
    Linear,       // 1:1 mapping
    Logarithmic,  // Useful for frequencies
    Exponential,  // Useful for feedback/gain
    SCurve        // Smooth ramping
};

// Apply curve when setting CC
float curvedValue = applyCurve(ccValue, MidiCurve::Logarithmic);
shifter.setMidiCC(ccNumber, curvedValue);
```

### MIDI Clock Integration

For tempo-synchronized effects:

```cpp
void onMidiClock() {
    // Potential future: Sync glide time to tempo
    // Sync feedback oscillation to beat
    // Sync detune LFO to tempo
}
```

---

## Troubleshooting MIDI

| Issue | Cause | Solution |
|-------|-------|----------|
| No response to CC | Wrong CC#, channel mute | Check CC # is 20-25, unmute track |
| Preset not switching | PC# out of range | Use PC 0-22 only |
| Values jump instead of smoothing | No glide time set | Set CC #23 > 0 |
| MIDI data not received | Controller offline | Verify MIDI connections, test with DAW |
| Feedback oscillating uncontrollably | CC #24 too high | Reduce to <100 (max 0.7) |
| Notes triggering wrong presets | Note range wrong | Ensure sending C3-B3 (MIDI 36-47) |

---

## MIDI Implementation Checklist

- [ ] CC #20 (Shift) responds to controller input
- [ ] CC #21 (Balance) properly mixes wet/dry
- [ ] CC #22 (Pedal) maps to 0-100% travel
- [ ] CC #23 (Glide) smooths parameter changes
- [ ] CC #24 (Feedback) adds effects without distortion
- [ ] CC #25 (Mode) toggles Shift↔Detune
- [ ] PC 0-22 switches between presets
- [ ] Note C3-B3 loads corresponding presets
- [ ] All CC values normalized 0-127
- [ ] No MIDI latency (<5ms)
- [ ] Feedback capped at 0.7 (no infinite resonance)
- [ ] Parameter smoothing active for click-free changes

---

**Last Updated**: February 2, 2026
**Status**: Production Ready
