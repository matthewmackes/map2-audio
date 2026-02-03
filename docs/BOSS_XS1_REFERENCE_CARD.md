# Boss XS-1 Poly Shifter - Visual Reference Card

## UI Layout

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ BOSS XS-1 Poly Shifter                                                  MODE  ║
║ ─────────────────────────────────────────────────────────────────────────────║
║                                                                        SHIFT   ║
║ ┌────────────────────────────────────────────────────────────────────────┐  ║
║ │                                                                        │  ║
║ │          SHIFT          BALANCE         PEDAL                         │  ║
║ │        ┌──────┐       ┌──────┐       ┌──────┐                        │  ║
║ │        │      │       │      │       │      │                        │  ║
║ │        │      │       │      │       │      │                        │  ║
║ │        └──────┘       └──────┘       └──────┘                        │  ║
║ │        0.0 st         50.0 %         0.0 %                           │  ║
║ │                                                                        │  ║
║ │         GLIDE        FEEDBACK       [MORE CONTROLS]                  │  ║
║ │        ┌──────┐       ┌──────┐                                        │  ║
║ │        │      │       │      │                                        │  ║
║ │        │      │       │      │                                        │  ║
║ │        └──────┘       └──────┘                                        │  ║
║ │        0.0 ms         0.00                                            │  ║
║ │                                                                        │  ║
║ │  INPUT  ████░░░░░░░░░░░░░░░░  -45.2 dB                              │  ║
║ │  OUTPUT ░░░░░░░░░░░░░░░░░░░░  -100.0 dB                             │  ║
║ │                                                                        │  ║
║ │ MIDI: CC#20=Shift | CC#21=Balance | CC#22=Pedal | CC#23=Glide       │  ║
║ │       PC 0-22=Presets | Notes C3-B3=Direct Select                  │  ║
║ │                                                                        │  ║
║ └────────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Color Scheme:
├─ Boss Black (background): #1a1a1a
├─ Boss Orange (accents): #FF6600
├─ Gray (knobs): #333333
├─ Text Primary: #FFFFFF
└─ Status Green/Red: #00FF00 / #FF0000
```

## Control Map

```
┌─────────────────────────────────────────────────────────────┐
│              PRIMARY PARAMETER CONTROLS                     │
├──────────────┬──────────┬──────────┬──────────┬──────────────┤
│ Parameter    │ Range    │ Default  │ Knob CC# │ Curve        │
├──────────────┼──────────┼──────────┼──────────┼──────────────┤
│ Pitch Shift  │ -7 to +7 │ 0.0 st   │ #20      │ Linear       │
│ Balance      │ 0-100%   │ 50%      │ #21      │ Linear       │
│ Pedal Pos    │ 0-100%   │ 0%       │ #22      │ Linear       │
│ Glide Time   │ 0-100ms  │ 0ms      │ #23      │ Linear       │
│ Feedback     │ 0-0.7    │ 0.0      │ #24      │ Linear/Capped│
│ Mode Select  │ S/D      │ Shift    │ #25      │ Toggle       │
└──────────────┴──────────┴──────────┴──────────┴──────────────┘

S = Shift Mode (pitch shifting algorithm)
D = Detune Mode (±20 cents doubling)
```

## Preset Map

```
┌───────────────────────────────────────────────────────────────┐
│              PRESET SELECTION CHART                           │
├──────┬─────────────────────┬──────┬──────────────────────────┤
│ PC # │ Preset Name         │ Mode │ Primary Use              │
├──────┼─────────────────────┼──────┼──────────────────────────┤
│  0   │ Manual              │ -    │ User-defined             │
│  1   │ Drop D (-2 st)      │ Sh   │ Heavy riffing            │
│  2   │ Drop D# (-2.5 st)   │ Sh   │ Variant drop tuning      │
│  3   │ Half Step (-1 st)   │ Sh   │ Universal transposition  │
│  4   │ Capo 2nd (+2 st)    │ Sh   │ Capo simulation          │
│  5   │ Capo 3rd (+3 st)    │ Sh   │ Capo simulation          │
│  6   │ Capo 5th (+5 st)    │ Sh   │ Capo simulation          │
│  7   │ Octave Up (+12 st)  │ Sh   │ 12-string effect         │
│  8   │ Octave Down (-12 st)│ Sh   │ Sub bass layer           │
│  9   │ Octave Up/Down      │ Sh   │ Stereo spread            │
│ 10   │ Micro Wide (±20c)   │ De   │ Thick chorus             │
│ 11   │ Micro Narrow (±8c)  │ De   │ Subtle fattening         │
│ 12   │ Voice Double (±15c) │ De   │ Vocal layering           │
│ 13   │ String Double(±12c) │ De   │ Guitar doubling          │
│ 14   │ Pianist Oct (±10c)  │ De   │ Piano-style blend        │
│ 15   │ Sub Bass (-7 st)    │ Sh   │ Low frequency emphasis   │
│ 16   │ Sonic Screamer(+7)  │ Sh   │ Extreme high effect      │
│ 17   │ Unique Interval     │ Sh   │ Harmonic interest        │
│ 18   │ Minor Third (-3 st) │ Sh   │ Minor chord harmony      │
│ 19   │ Chord Shift (+3 st) │ Sh   │ Harmonic variation       │
│ 20   │ Detune Chorus       │ De   │ Feedback shimmer         │
│ 21   │ Spacey Vibrato      │ De   │ Modulated pitch          │
│ 22   │ Robotic Mod         │ Sh   │ Extreme feedback effect  │
└──────┴─────────────────────┴──────┴──────────────────────────┘

Sh = Shift Mode | De = Detune Mode
```

## Keyboard Mapping (MIDI Notes)

```
MIDI Note Preset Mapping (C3-B3):

Piano Keyboard Octave 3:
┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
│C│D│E│F│G│A│B│C│D│E│F│G│
└┬┴┬┴┬┴┬┴┬┴┬┴┬┴┬┴┬┴┬┴┬┴┬┘
 ↓
┌───────────────────────────────────────────────────────────┐
│ C3(36) = Manual           │ D3(38) = Drop D#              │
│ C#3(37)= Drop D           │ D#3(39)= Half Step Down       │
│ E3(40) = Capo 2nd         │ F3(41) = Capo 3rd             │
│ F#3(42)= Capo 5th         │ G3(43) = Octave Up            │
│ G#3(44)= Octave Down      │ A3(45) = Octave Up/Down       │
│ A#3(46)= Micro Wide       │ B3(47) = Micro Narrow         │
└───────────────────────────────────────────────────────────┘
```

## MIDI Flow Diagram

```
                    MIDI Input
                        │
         ┌──────────────┼──────────────┐
         │              │              │
      Control        Program       Note On/Off
      Change         Change
         │              │              │
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐   ┌──▼──────┐
    │ CC #20  │   │  PC 0-22   │   │ C3-B3   │
    │ CC #21  │   │ Preset     │   │ Direct  │
    │ CC #22  │   │ Selector   │   │ Preset  │
    │ CC #23  │   │            │   │ Load    │
    │ CC #24  │   └─────┬──────┘   └──┬──────┘
    │ CC #25  │         │             │
    └────┬────┘         │             │
         │              │             │
         ▼              ▼             ▼
    ┌────────────────────────────────────────┐
    │ BossXS1PolyShifterProcessor            │
    │ ├─ Parameter Mapping                   │
    │ ├─ Preset Loading                      │
    │ └─ DSP Processing                      │
    └────────────────────┬───────────────────┘
                         │
                    Audio Out
```

## Performance Meter Reference

```
Input/Output Level Meters:

dB Range Scale:
  0 dB ═══════════════════════════════════
 -6 dB ──────────────────────────────────
-12 dB ─────────────────────────
-18 dB ──────────────────
-24 dB ──────────────
-∞ dB  └ (Silent)

Color Coding:
├─ Green:  -∞ to -12 dB (healthy)
├─ Yellow: -12 to -6 dB (approaching clip)
├─ Red:    -6 dB to 0 dB (clipping danger)
└─ Peak:   Over 0 dB (clipped!)

Expected Ranges:
├─ Guitar input:    -24 to -12 dB
├─ Bass input:      -18 to -6 dB
├─ Output (wet):    -6 to 0 dB
└─ Output (dry):    -24 to -12 dB
```

## Control Interaction Map

```
Parameter Relationships:

Pitch Shift (CC#20)
    ├─ Glide Time (CC#23) → Smooths transitions
    └─ Detune Mode (CC#25) → Changes algorithm

Balance (CC#21)
    ├─ 0%  = Dry only (no effect)
    ├─ 50% = Parallel blend
    └─ 100%= Wet only (effect dominant)

Feedback (CC#24)
    ├─ 0.0-0.2 = Subtle shimmer
    ├─ 0.2-0.4 = Noticeable effect
    ├─ 0.4-0.7 = Extreme/self-oscillating
    └─ ⚠ Cap at 0.7 to prevent instability

Mode (CC#25)
    ├─ Shift:  ±7 semitones full range
    └─ Detune: ±20 cents subtle effect

Pedal (CC#22)
    └─ Maps to Pitch Shift range (if enabled)
```

## Quick Settings Guide

```
┌────────────────────────────────────────────────────────────┐
│           COMMON CONFIGURATION PRESETS                     │
├────────────┬─────────────┬─────────────┬──────────────────┤
│ Use Case   │ Shift (CC20)│ Balance(21) │ Other Settings   │
├────────────┼─────────────┼─────────────┼──────────────────┤
│ Clean      │ 0-2 st      │ 50-70%      │ Glide: 10ms      │
│ Capo Sim   │ +2 to +5 st │ 100%        │ Glide: 20ms      │
│ Drop Tune  │ -2 to -3 st │ 100%        │ Glide: 30ms      │
│ 12-String  │ +12 st (Oct)│ 30-50%      │ Glide: 0ms       │
│ Harmony    │ ±4-5 st     │ 70-80%      │ Glide: 50ms      │
│ Doubling   │ 0 st        │ 60-75%      │ Mode: Detune     │
│ Chorus     │ 0 st        │ 50%         │ Feedback: 0.3    │
│ Sub Bass   │ -7 st       │ 100%        │ Glide: 100ms     │
│ Lead Swell │ Variable    │ 80-90%      │ Feedback: 0.2    │
│ Octave Up  │ +12 st      │ 30-50%      │ Glide: 0ms       │
└────────────┴─────────────┴─────────────┴──────────────────┘

Glide: Smoothing time (ms)
Feedback: Special effects intensity (0-0.7)
Mode: Shift (pitch) or Detune (chorus)
```

## Status Indicators

```
Display Status Areas:

┌─────────────────────────────────────┐
│ Mode Indicator                      │
├─────────────────────────────────────┤
│ SHIFT        (normal blue text)     │
│ DETUNE       (orange highlight)     │
│                                     │
│ Active Status                       │
│ ACTIVE       (green)                │
│ BYPASSED     (red)                  │
│                                     │
│ Current Preset                      │
│ Preset: 7 (Octave Up)              │
└─────────────────────────────────────┘
```

---

**Print this card for quick reference at your desk or studio!**

Version 1.0.0 | Boss XS-1 Poly Shifter | February 2, 2026
