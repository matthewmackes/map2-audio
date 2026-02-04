# Eventide H9 - Algorithm Comparison & Recommendation Guide

## Quick Reference Chart

### Algorithm Selection Flowchart

```
What's your goal?
│
├─ Thicken/Add Dimension
│  └─→ MicroPitch (LFO-modulated detuning)
│
├─ Natural Pitch Shifting
│  ├─ For Quality: UltraShift (formant preservation)
│  ├─ For Speed: Transpose (minimal latency)
│  └─ For Intelligence: SmartShift (pitch detection)
│
├─ Multi-Voice Harmony
│  └─→ PitchFactor (4 simultaneous voices)
│
├─ Time-Based Effects
│  ├─ For Drama: ReverseDelays (reversed playback)
│  ├─ For Shimmer: ShimmerVerbs (octave + reverb)
│  └─ For Motion: MotionReverbs (LFO modulation)
│
└─ Textured/Abstract
   ├─ For Clouds: Granular (grain synthesis)
   └─ For Crystals: Crystallize (granular + reverb)
```

---

## Algorithm Details & Use Cases

### 1️⃣ MicroPitch - "Chorus Effect"

```
INPUT: Any source
       ├── Vocoder A (detune + LFO)
       └── Vocoder B (opposite detune + LFO)
PROCESSING: Both processed independently, then mixed
OUTPUT: Thickened, chorus-like effect
```

**Characteristics**:
- Subtle, natural thickening
- Moving, evolving quality
- Non-destructive to original tone
- Stereo width enhancement

**Best For**:
- Vocal enhancement (add warmth)
- Thin guitar doubling
- Synthetic pad thickening
- Background vocal layering

**Settings**:
```
detune: 3-7 cents
modRate: 1.5-3 Hz
modDepth: 2-5 cents
mix: 0.4-0.6 (not too extreme)
```

**CPU/Latency**: 12% / 23ms

---

### 2️⃣ UltraShift - "Premium Pitch Shifter"

```
INPUT: Any source
       ├── FFT Analysis (2048-point)
       ├── Phase Unwrapping
       ├── Frequency Scaling (pitch shift)
       ├── Formant Preservation
       └── IFFT Synthesis
OUTPUT: High-quality pitch-shifted signal
```

**Characteristics**:
- Preserves vocal/instrument character
- Smooth transposition
- Professional-grade sound
- Some processing artifacts on extreme shifts

**Best For**:
- Vocal harmonies (natural sounding)
- Instrument transposition
- Creating pitch-shifted doubles
- Production-quality effects

**Settings**:
```
pitchShift: ±7 to ±12 semitones (most natural)
formantCorrection: 0.9-1.1 (preserve color)
quality: 2 (balanced) or 3 (high-quality)
mix: 0.9-1.0 (blend with original if needed)
```

**CPU/Latency**: 18% / 46ms

---

### 3️⃣ SmartShift - "Intelligent Pitch Shifter"

```
INPUT: Any source
       ├── Pitch Detection (autocorrelation)
       ├── Semitone Calculation
       ├── Pitch Shifting (vocoder)
       └── Smooth Ramping
OUTPUT: Harmonic transposition to target note
```

**Characteristics**:
- Automatic harmony generation
- Requires melodic input
- Musical, intelligent shifting
- Latency-dependent (pitch detection lag)

**Best For**:
- Automatic vocal harmony
- Real-time pitch correction
- Educational applications
- Monophonic instrument doubling

**Settings**:
```
targetNote: 69 (A4) or adjust to key
shiftAmount: -12 to +12 semitones
mix: 1.0 (usually full effect)
```

**CPU/Latency**: 22% / 50ms

---

### 4️⃣ Transpose - "Fast Shifter"

```
INPUT: Any source
       ├── FFT (1024-point, fast)
       ├── Direct Frequency Scaling
       └── IFFT (minimal processing)
OUTPUT: Clean octave/interval shift
```

**Characteristics**:
- Fastest pitch shifting
- Minimal latency
- Clean, digital quality
- CPU-efficient

**Best For**:
- Live performance shifting
- Real-time transposition
- CPU-constrained setups
- Quick octave shifts

**Settings**:
```
transpose: -12 to +12 semitones
mix: 1.0 (full effect)
```

**CPU/Latency**: 10% / 23ms

---

### 5️⃣ PitchFactor - "Harmonizer"

```
INPUT: Source
       ├── Vocoder 1 (voice A pitch)
       ├── Vocoder 2 (voice B pitch)
       ├── Vocoder 3 (voice C pitch)
       ├── Vocoder 4 (voice D pitch)
       └── Mix all 4 voices
OUTPUT: Rich harmonized signal
```

**Characteristics**:
- Multiple simultaneous pitch shifts
- Rich, full harmony
- CPU-intensive (4 vocoders)
- Latency from STFT processing

**Best For**:
- Vocal harmonization (4-part)
- Instrument layering
- Creating rich textures
- Polyphonic doubling

**Presets**:
```
"Unison+Octave": [0, 0, 12, 0]
"Triadic C": [0, 4, 7, 12]
"5th+Octave": [0, 7, 12, 0]
"Doubler": [0, -12, 0, 12]
```

**CPU/Latency**: 28% / 46ms

---

### 6️⃣ ReverseDelays - "Dramatic Time Effect"

```
INPUT: Source
       ├── Circular Buffer (record)
       ├── Reversed Playback (read backwards)
       ├── Pitch Shift on playback
       ├── Feedback loop
       └── Multiple taps
OUTPUT: Reversed delay with pitch modulation
```

**Characteristics**:
- Dramatic, distinctive effect
- Time-reversed playback
- Pitch shifting on delayed signal
- Multi-tap complexity

**Best For**:
- Reversed reverb effects
- Lead-in effects
- Experimental production
- Creative delay textures
- Dramatic breakdowns

**Settings**:
```
delayTime: 250-1000 ms (typical)
feedback: 0.3-0.6 (avoid runaway)
pitchShift: +12 semitones (octave up, classic)
taps: 2-3 (multiple delays)
mix: 0.3-0.5 (effect, not muddy)
```

**CPU/Latency**: 15% / 23ms

---

### 7️⃣ ShimmerVerbs - "Ethereal Reverb"

```
INPUT: Source
       ├── Freeverb Processing
       │   ├── 8 Comb Filters (delays)
       │   └── 4 Allpass Filters (diffusion)
       ├── Split reverb output
       │   ├── Dry reverb (original)
       │   └── Pitch-shifted reverb (+12 semitones)
       └── Blend both
OUTPUT: Lush reverb with high-frequency shimmer
```

**Characteristics**:
- Signature Eventide effect
- Lush, ambient quality
- High-frequency sparkle
- Professional, polished sound

**Best For**:
- Vocal reverbs (ethereal, dreamy)
- Ambient guitar effects
- Pad harmonization
- Signature production sound
- Creating space and size

**Settings**:
```
roomSize: 0.7-0.85 (large spaces)
damping: 0.4-0.6 (natural absorption)
shimmerPitch: 12 semitones (classic)
shimmerMix: 0.3-0.5 (shimmer blend)
wetLevel: 0.4-0.6 (effect presence)
```

**Presets**:
- "Subtle Shimmer": roomSize 0.7, shimmerMix 0.3
- "Lush Cathedral": roomSize 0.85, shimmerMix 0.5
- "Ethereal Pad": roomSize 0.9, shimmerMix 0.6

**CPU/Latency**: 25% / 30ms

---

### 8️⃣ MotionReverbs - "Moving Reverb"

```
INPUT: Source
       ├── 8 Modulated Delays
       │   ├── Each with LFO-controlled read ptr
       │   ├── Phase-offset LFOs (avoid comb)
       │   └── Feedback structure
       └── Blended output
OUTPUT: Reverb with evolving, moving reflections
```

**Characteristics**:
- Dynamic, evolving reverb
- Spatial movement/panning
- Vintage tape-like quality
- Complex, rich textures

**Best For**:
- Ambient soundscapes
- Evolving pad production
- Vintage/retro effects
- Creative texture design
- Polyrhythmic motion

**Settings**:
```
roomSize: 0.6-0.8 (medium to large)
damping: 0.4-0.7 (warmth control)
modRate: 0.5-2 Hz (motion speed)
modDepth: 0.2-0.4 (motion intensity)
wetLevel: 0.5-0.8 (effect prominence)
```

**LFO Rates**:
- Slow (0.5 Hz): Subtle, warm motion
- Medium (1 Hz): Natural, balanced
- Fast (2 Hz): More obvious, visible motion

**CPU/Latency**: 22% / 30ms

---

### 9️⃣ Granular - "Cloud Synthesis"

```
INPUT: Source
       ├── Record into lookahead buffer
       ├── Generate grains (async)
       │   ├── Hann-windowed segments
       │   ├── Random start positions
       │   └── Pitch-shifted playback
       ├── Overlap 32 max grains
       └── Feedback regeneration
OUTPUT: Cloud-like, textured signal
```

**Characteristics**:
- Textured, abstract quality
- Frozen time/timestretching
- Polyphonic granular clouds
- Generative, evolving output

**Best For**:
- Experimental sound design
- Texture creation
- Reverse/scrambled effects
- Ambient pads
- Microsound exploration

**Settings**:
```
grainSize: 50-150 ms (typical)
grainDensity: 2-5 (grains/sec)
pitchShift: 0 to +12 semitones (typical)
scatter: 0.3-0.7 (randomization)
feedback: 0.4-0.7 (loop regen)
mix: 0.5-1.0 (effect strength)
```

**Grain Scenarios**:
- Small + Dense: Fine, delicate texture
- Large + Sparse: Chunky, glitchy quality
- Pitched + High Scatter: Chaotic, experimental

**CPU/Latency**: 18% / 50ms

---

### 🔟 Crystallize - "Granular Reverb Fusion"

```
INPUT: Source
       ├── Granular Processing (grains)
       ├── Reverb Coloration (allpass network)
       │   ├── Allpass 1 (44.1k buffer)
       │   ├── Allpass 2 (88.2k buffer)
       │   └── Damping feedback
       └── Blended output
OUTPUT: Crystalline, harmonic texture
```

**Characteristics**:
- Combines granular + reverb
- Crystalline, harmonic quality
- Rich, evolving textures
- Signature Eventide effect

**Best For**:
- Ethereal, shimmering pads
- Ambient soundscapes
- Evolving textures
- Polyphonic pad creation
- High-end production effects

**Settings**:
```
grainSize: 60-120 ms
grainDensity: 2-4 grains/sec
pitchShift: 0 to +12 semitones
roomSize: 0.7-0.9 (reverb size)
damping: 0.5-0.7 (warmth)
mix: 0.6-1.0 (effect strength)
```

**Sonic Profile**:
- "Crystalline Pad": Small grains, +12 pitch, 0.8 room
- "Ambient Cloud": Large grains, 0 pitch, 0.9 room
- "Ethereal Float": Medium grains, +7 pitch, 0.8 room

**CPU/Latency**: 24% / 50ms

---

## Comparison Table

### By Category

#### Pitch Shifting
| Algorithm | Quality | Speed | CPU | Latency | Best For |
|-----------|---------|-------|-----|---------|----------|
| **Transpose** | Good | Fast | 10% | 23ms | Real-time, performance |
| **UltraShift** | Excellent | Medium | 18% | 46ms | Production, naturalness |
| **SmartShift** | Excellent | Slow | 22% | 50ms | Intelligent harmony |

#### Modulation/Thickening
| Algorithm | Character | CPU | Latency | Best For |
|-----------|-----------|-----|---------|----------|
| **MicroPitch** | Subtle, natural | 12% | 23ms | Vocals, warmth |
| **PitchFactor** | Rich, complex | 28% | 46ms | Harmonies, layering |

#### Reverbs
| Algorithm | Style | CPU | Latency | Best For |
|-----------|-------|-----|---------|----------|
| **ShimmerVerbs** | Ethereal | 25% | 30ms | Vocals, pads |
| **MotionReverbs** | Evolving | 22% | 30ms | Ambient, pads |

#### Time/Experimental
| Algorithm | Character | CPU | Latency | Best For |
|-----------|-----------|-----|---------|----------|
| **ReverseDelays** | Dramatic | 15% | 23ms | Effects, drama |
| **Granular** | Textured | 18% | 50ms | Sound design |
| **Crystallize** | Ethereal | 24% | 50ms | Pads, ambient |

---

## Production Tips

### For Vocals
1. **Clear Lead**: UltraShift + light reverb
2. **Harmonies**: PitchFactor (4-voice blend)
3. **Thickness**: MicroPitch (subtle)
4. **Space**: ShimmerVerbs (ethereal)
5. **Drama**: ReverseDelays (lead-in)

### For Instruments
1. **Doubling**: UltraShift (±5-7 semitones)
2. **Layering**: PitchFactor (octaves)
3. **Texture**: Granular or Crystallize
4. **Ambience**: MotionReverbs
5. **Effects**: ReverseDelays (creative)

### For Ambient
1. **Pad Foundation**: ShimmerVerbs (50% wet)
2. **Texture Layer**: Granular or Crystallize
3. **Movement**: MotionReverbs (0.5-1 Hz LFO)
4. **Space**: Large room sizes (0.8+)
5. **Feedback**: Enable for self-evolving pads

### For Real-Time Performance
1. Use **Transpose** (lowest latency: 23ms)
2. Avoid **SmartShift** (pitch detection lag)
3. Limit **PitchFactor** (high CPU: 28%)
4. Prefer **MicroPitch** (12% CPU)
5. Monitor CPU meter constantly

---

## Summary Decision Tree

```
┌─ Need Harmony?
│  ├─ YES → PitchFactor (4 voices) or UltraShift (natural)
│  └─ NO → Continue
│
├─ Need Reverb/Space?
│  ├─ Static → ShimmerVerbs (shimmer) or Granular (texture)
│  ├─ Dynamic → MotionReverbs (LFO motion)
│  └─ NO → Continue
│
├─ Need Pitch Shift?
│  ├─ Real-time → Transpose (fast)
│  ├─ Quality → UltraShift (formant)
│  ├─ Smart → SmartShift (detection)
│  └─ NO → Continue
│
├─ Need Thickening?
│  └─ YES → MicroPitch (natural, subtle)
│
├─ Need Drama/Experimental?
│  ├─ Reversed → ReverseDelays
│  ├─ Abstract → Granular or Crystallize
│  └─ NO → Done!
│
└─ Result: Selected algorithm(s)
   Apply as insert or send effect
   Adjust mix (dry/wet) to taste
   Enable CPU monitoring
```

---

**Choose your algorithm wisely - Each has a unique sonic character!**
