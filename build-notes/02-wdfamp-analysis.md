# WDFAmpPlugin Structure Analysis

## Location
`juce-engine/WDFAmpPlugin/`

## Directory Structure
```
WDFAmpPlugin/
├── CMakeLists.txt          ← juce_add_plugin() definition (STANDALONE, not subdirectory)
├── build.sh                ← build helper
├── Source/
│   ├── PluginProcessor.h   ← juce::AudioProcessor subclass (WDFAmpAudioProcessor)
│   ├── PluginProcessor.cpp ← Audio callback, parameter handling
│   ├── PluginEditor.h      ← juce::AudioProcessorEditor subclass
│   ├── PluginEditor.cpp    ← UI implementation
│   ├── WDF/                ← WDF-specific DSP (WDFElements, WDFTriode, WDFToneStack)
│   ├── Amps/               ← Amp model classes (Peavey5150, Marshall800, MesaDualRectifier)
│   ├── DSP/                ← Oversampling
│   └── UI/                 ← Custom UI components (AmpKnob, AmpSelector)
├── Tests/
└── build/                  ← Build output directory (exists already)
```

## CMakeLists.txt Key Points
```cmake
juce_add_plugin(WDFAmpPlugin
    COMPANY_NAME "MAP2Audio"
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE Wdfa
    FORMATS Standalone LV2        ← ADD VST3 HERE
    PRODUCT_NAME "WDFAmpSimulator"
    LV2URI "https://map2audio.com/wdf-amp"
)
```

**To add VST3**: Change `FORMATS Standalone LV2` to `FORMATS Standalone LV2 VST3`

## CRITICAL: Standalone CMake Project (NOT subdirectory)
- WDFAmpPlugin is its OWN CMakeLists.txt project, built standalone
- Reuses parent JUCE from: `juce-engine/build/_deps/juce-src/`
- Reuses pre-built juceaide from: `juce-engine/build/_deps/juce-build/tools/.../juceaide`
- Build from: `juce-engine/WDFAmpPlugin/` (not from parent)

## juceaide Status
✅ Pre-built juceaide found at:
`juce-engine/build/_deps/juce-build/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide`

## JUCE Source Status
✅ JUCE 8.0.0 source found at:
`juce-engine/build/_deps/juce-src/`

## Pattern for New Plugins (adapted from WDFAmpPlugin)
1. Each plugin is its own standalone CMake project directory
2. Copy WDFAmpPlugin as template, adapt CMakeLists.txt
3. Point to SAME juce-engine/build/_deps/juce-src/ (reuse JUCE download)
4. Write PluginProcessor that wraps the map2:: DSP class
5. Build from plugin directory using cmake -B build ...

## Peavey5150Processor API (confirmed from header)
```cpp
namespace map2 {
class Peavey5150Processor {
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void process(juce::AudioBuffer<float>& buffer);  // NOT processBlock()
    void reset();
    // Individual setters: setPreGain(), setPostGain(), setLow(), setMid(), ...
    // Getters return float/bool
};
}
```

## Key Deviation: Toolchain
- Guide assumes clang/clang++ — NOT INSTALLED
- Using gcc/g++ (GCC 15.2.1) instead
- Build command: `cmake -DCMAKE_C_COMPILER=gcc -DCMAKE_CXX_COMPILER=g++ ...`
