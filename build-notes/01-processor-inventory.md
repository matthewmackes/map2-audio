# MAP2 Native Processor Inventory

## Source Location
All processors: `juce-engine/Source/*Processor.{h,cpp}`

## Processor List (19 confirmed)

| # | Processor Class | Header | Impl | Type | Plugin Ready? | Notes |
|---|----------------|--------|------|------|---------------|-------|
| 1 | Peavey5150Processor | Peavey5150Processor.h | Peavey5150Processor.cpp | Amp | No | 6-stage preamp, tube sim |
| 2 | TweedBassmanProcessor | TweedBassmanProcessor.h | TweedBassmanProcessor.cpp | Amp | No | Bassman 5F6-A |
| 3 | EventideH9Processor | EventideH9Processor.h | EventideH9Processor.cpp | Multi-FX | No | 10 algorithms |
| 4 | H3000Processor | H3000Processor.h | H3000Processor.cpp | Harmonizer | No | |
| 5 | PassionFXProcessor | PassionFXProcessor.h | PassionFXProcessor.cpp | Multi-FX | No | Vai P&W |
| 6 | BossXS1PolyShifterProcessor | BossXS1PolyShifterProcessor.h | BossXS1PolyShifterProcessor.cpp | Pitch | No | |
| 7 | IntelliFX8VoiceChorusProcessor | IntelliFX8VoiceChorusProcessor.h | IntelliFX8VoiceChorusProcessor.cpp | Chorus | No | 8-voice |
| 8 | CircularDelayProcessor | CircularDelayProcessor.h | CircularDelayProcessor.cpp | Delay | No | |
| 9 | DelayProcessor | DelayProcessor.h | DelayProcessor.cpp | Delay | No | |
| 10 | ChorusProcessor | ChorusProcessor.h | ChorusProcessor.cpp | Modulation | No | |
| 11 | PhaserProcessor | PhaserProcessor.h | PhaserProcessor.cpp | Modulation | No | |
| 12 | PitchShifterProcessor | PitchShifterProcessor.h | PitchShifterProcessor.cpp | Pitch | No | |
| 13 | ShoeGazeProcessor | ShoeGazeProcessor.h | ShoeGazeProcessor.cpp | Multi-FX | No | |
| 14 | LexiLoveProcessor | LexiLoveProcessor.h | LexiLoveProcessor.cpp | Reverb | No | |
| 15 | NAMProcessor | NAMProcessor.h | NAMProcessor.cpp | Amp | No | Neural amp modeler |
| 16 | ConvolutionProcessor | ConvolutionProcessor.h | ConvolutionProcessor.cpp | IR | No | Cabinet/Reverb IR |
| 17 | DynamicsProcessor | DynamicsProcessor.h | DynamicsProcessor.cpp | Dynamics | No | Comp/Gate/Limiter |
| 18 | FilterProcessor | FilterProcessor.h | FilterProcessor.cpp | EQ | No | |
| 19 | ParallelMixerProcessor | ParallelMixerProcessor.h | ParallelMixerProcessor.cpp | Routing | No | |

## Existing Plugin Wrapper

| Plugin | Path | Formats | Has VST3? | Status |
|--------|------|---------|-----------|--------|
| WDFAmpPlugin | juce-engine/WDFAmpPlugin/ | Standalone, LV2 | ❌ | Template for others |

## Architecture Notes

1. **Processors are NOT JUCE plugins**: They're DSP classes used in the main engine
2. **To create VST3s**: Need to create plugin wrapper projects (like WDFAmpPlugin) for each processor
3. **WDFAmpPlugin is the template**: Copy and adapt for each processor
4. **Each wrapper needs**:
   - CMakeLists.txt with `juce_add_plugin(...FORMATS VST3...)`
   - PluginProcessor.h/cpp that uses the processor class
   - PluginEditor.h/cpp for UI

## Decision: Initial Subset

**For pilot build**: Start with 3-5 processors to prove the workflow before scaling to all 19.

**Recommended pilot set**:
1. Peavey5150Processor (amp, well-documented)
2. EventideH9Processor (multi-FX, complex)
3. DelayProcessor (simple, good test case)

**Scale later**: Automate the remaining 16 after pilot succeeds.
