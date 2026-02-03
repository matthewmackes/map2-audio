# Circular Delays Quick Reference Guide

## What is it?

The Circular Delays effect recreates the famous Yamaha SPX90 circular delays - a spatial effect where multiple delayed repeats pan around the stereo field creating a swirling, 3D sound.

## Quick Start

### Basic Setup
```cpp
map2::CircularDelayProcessor delay;
delay.prepare(sampleRate, blockSize, numChannels);

// Enable the effect
delay.setMix(0.5f);  // 50% wet signal
```

### Processing Audio
```cpp
// In your audio callback
delay.process(audioBuffer);
```

### Key Parameters

| Control | Range | Effect |
|---------|-------|--------|
| **Delay Time** | 100-2000 ms | Loop length of the effect |
| **Taps** | 4-12 | Number of repeating echoes |
| **Feedback** | 0-0.95 | How long repeats last |
| **Pan Rate** | 0.1-5 Hz | Speed of circular rotation |
| **Depth** | 0-1 | Width of stereo movement |
| **Mix** | 0-1 | Wet/dry balance |

## Common Use Cases

### 1. Subtle Spaciousness (Vocals, Acoustic)
```
Delay Time: 250 ms
Taps: 4
Feedback: 0.2
Pan Rate: 0.3 Hz
Depth: 0.3
Mix: 0.25
```

### 2. Classic Echo (Drums, Percussion)
```
Delay Time: 500 ms
Taps: 8
Feedback: 0.5
Pan Rate: 1.0 Hz
Depth: 0.8
Mix: 0.6
```

### 3. Lush Shimmer (Synth, Pads)
```
Delay Time: 800 ms
Taps: 12
Feedback: 0.7
Pan Rate: 0.5 Hz
Depth: 1.0
Mix: 0.7
```

### 4. Psychedelic (Bass, Experimental)
```
Delay Time: 1500 ms
Taps: 12
Feedback: 0.85
Pan Rate: 2.5 Hz
Depth: 1.0
Mix: 0.8
```

### 5. Slapback Delay (Guitar, Retro)
```
Delay Time: 200 ms
Taps: 2
Feedback: 0.3
Pan Rate: 0.5 Hz
Depth: 0.2
Mix: 0.4
```

## Parameter Guide

### Delay Time
- **Short (100-300 ms)**: Tight, rhythmic echoes - good for timing-sensitive sources
- **Medium (300-800 ms)**: Spacious but clear - works on most material
- **Long (800-2000 ms)**: Ambient, lush - great for pads and atmospheric sounds

### Number of Taps
- **4 Taps**: Clear, distinct repeats - natural sounding
- **8 Taps**: Dense but manageable - most versatile
- **12 Taps**: Very full and thick - can blur together

### Feedback
- **0.0-0.2**: Quick decay, speech-like - good for vocals
- **0.2-0.5**: Natural decay - good for most sources
- **0.5-0.8**: Long sustain - good for atmosphere
- **0.8-0.95**: Very long trails - use sparingly

### Pan Rate (LFO Speed)
- **0.1-0.5 Hz**: Slow, subtle rotation - meditative
- **0.5-1.5 Hz**: Medium speed - classic SPX90 feel
- **1.5-3 Hz**: Fast movement - energetic
- **3+ Hz**: Very fast - special effects only

### Depth
- **0.0**: No panning variation (repeats stay centered)
- **0.3-0.7**: Subtle stereo movement - natural
- **0.7-1.0**: Wide stereo field - dramatic

### Mix
- **0.0**: Dry only (effect disabled)
- **0.25-0.5**: Effect visible but not dominant
- **0.5-0.75**: Effect takes center stage
- **0.75-1.0**: Fully wet (no dry signal)

## Listening Tips

### How to Hear the Effect
1. **Start with Mix at 0**: Hear the dry signal
2. **Slowly increase Mix**: Notice the circular motion appearing
3. **Adjust Pan Rate**: Hear the rotation speed change
4. **Increase Depth**: Feel the stereo field widen
5. **Increase Feedback**: Hear the repeats sustain longer

### What to Listen For
- ✓ Smooth panning (no clicks or pops)
- ✓ Repeats fading naturally
- ✓ Circular motion that's pleasant and musical
- ✓ No frequency coloration of the original signal

## Automation Ideas

### Dynamic Effect Intensity
```
Pan Rate: Automate 0.5→2.0 Hz over time
Creates acceleration/deceleration effect
```

### Building Tension
```
Feedback: Automate 0.2→0.8 gradually
Creates growing ambient tension
```

### Creative Sweeps
```
Delay Time: Automation 200→1500 ms
Creates rising/falling pitch effect
```

### Rhythmic Modulation
```
Pan Rate: Sync to tempo (e.g., 1 beat = 1 rotation)
Mix: Pulse effect on/off
```

## Performance Notes

### CPU Usage
- Typical: 2-3% per instance on modern CPU
- Multiple instances stack linearly
- Optimization: Reduce number of taps if needed (e.g., 4 instead of 12)

### Memory
- ~200 KB per instance
- Safe to use multiple instances
- Scales well with sample rate

### Latency
- Zero additional latency
- Can be used on master bus
- Sample-accurate automation supported

## Common Questions

**Q: Why am I not hearing the effect?**
- Check Mix is above 0
- Check Feedback is not too low (< 0.1)
- Verify Delay Time is reasonable (not too short)

**Q: How do I make it rhythmic?**
- Set Delay Time to match a tempo subdivision
- Example: 120 BPM = 500ms per beat
- Use steady Pan Rate (not modulated)

**Q: Can I use it on the master bus?**
- Yes! Zero latency means it's safe
- Use subtle settings (Mix 0.2-0.4)
- Avoid long Delay Times on master

**Q: How is this different from normal delay?**
- Normal delay: repeats stay in same pan position
- Circular delay: repeats rotate around stereo field
- Creates 3D, spatial effect that's unique

## Troubleshooting

### Sound is Thin/Hollow
- Increase Feedback slightly
- Check that multiple taps are enabled
- Verify Mix is not too low

### Sound is Muddy
- Reduce Feedback
- Reduce Delay Time
- Try fewer taps (4-6)

### Hearing Artifacts/Clicks
- Check parameter changes are smooth
- Reduce Feedback below 0.8
- Verify input signal is not clipping

### Effect Too Subtle
- Increase Mix value
- Increase Depth
- Reduce Delay Time (shorter = more noticeable)

### Effect Too Strong
- Reduce Mix value
- Reduce Feedback
- Reduce Depth
- Reduce number of Taps

## Technical Specs

- **Sample Rates**: All rates (44.1kHz, 48kHz, 96kHz, 192kHz)
- **Channels**: Mono and Stereo
- **Latency**: 0 samples
- **CPU**: ~2-3% @ 44.1kHz, 8 taps
- **Memory**: ~200 KB per instance
- **Interpolation**: Cubic Hermite (high quality)
- **Thread Safety**: Real-time safe (atomic parameters)

## For Advanced Users

### Feedback Formula
```
Output Repeats = Input × (1 + Feedback + Feedback² + Feedback³ + ...)
Decay Time = -log(0.01) / (log(Feedback) × SampleRate)
```

### Pan Angle Calculation
```
Pan Angle = (TapIndex / NumTaps) × 360° + LFO_Phase × 360° + Depth × LFO
```

### Buffer Size
```
Max Delay = 2 seconds
Sample Rate 44.1kHz = 88,200 samples
Sample Rate 48kHz = 96,000 samples
```

## Reference Implementations

### Minimal Setup
```cpp
CircularDelayProcessor delay;
delay.prepare(44100.0, 512, 2);
delay.setParameters({
    500.0f,  // delayTime
    8,       // numTaps
    0.5f,    // feedback
    1.0f,    // panRate
    0.8f,    // depth
    0.5f,    // mix
    0.0f,    // initialPanAngle
    false    // bypass
});
```

### Dynamic Adjustment
```cpp
void updateEffect(float intensity) {
    delay.setMix(0.2f + intensity * 0.6f);
    delay.setPanRate(0.5f + intensity * 1.5f);
    delay.setFeedback(0.3f + intensity * 0.5f);
}
```

---

**For detailed implementation and integration guide, see:**
- `CIRCULAR_DELAYS_IMPLEMENTATION.md` - Full technical documentation
- `CIRCULAR_DELAYS_BUILD_INTEGRATION.md` - Build and integration guide
