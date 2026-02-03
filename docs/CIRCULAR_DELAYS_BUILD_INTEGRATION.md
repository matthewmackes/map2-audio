# Circular Delays Processor - Build Integration Guide

## CMakeLists.txt Integration

Add the following to your JUCE CMakeLists.txt to include the Circular Delays processor:

### Source Files
```cmake
# Add to your target_sources() or JUCE plugin definition:

add_library(circular_delays_lib STATIC
    Source/CircularDelayProcessor.h
    Source/CircularDelayProcessor.cpp
    Source/CircularDelayUI.h
    Source/CircularDelayUI.cpp
)

target_link_libraries(circular_delays_lib PUBLIC
    juce::juce_core
    juce::juce_audio_basics
    juce::juce_audio_processors
    juce::juce_dsp
    juce::juce_gui_basics
    juce::juce_gui_extra
)
```

### Existing juce_add_plugin() Integration

```cmake
juce_add_plugin(map2_audio_plugin
    ...existing parameters...
    SOURCES
        ${CMAKE_CURRENT_SOURCE_DIR}/Source/CircularDelayProcessor.h
        ${CMAKE_CURRENT_SOURCE_DIR}/Source/CircularDelayProcessor.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/Source/CircularDelayUI.h
        ${CMAKE_CURRENT_SOURCE_DIR}/Source/CircularDelayUI.cpp
        ...existing sources...
)
```

## C++ Integration in Your Audio Processor

### Header (.h)

```cpp
#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "CircularDelayProcessor.h"
#include "CircularDelayUI.h"

class YourAudioProcessor : public juce::AudioProcessor {
public:
    // ... existing code ...

private:
    map2::CircularDelayProcessor circularDelay_;
    std::unique_ptr<map2::CircularDelayUI> circularDelayUI_;
};
```

### Implementation (.cpp)

#### In prepareToPlay()
```cpp
void YourAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    // ... existing code ...
    
    // Initialize circular delay processor
    circularDelay_.prepare(sampleRate, samplesPerBlock, getTotalNumInputChannels());
}
```

#### In releaseResources()
```cpp
void YourAudioProcessor::releaseResources() {
    // ... existing code ...
    
    // No cleanup needed - RAII handles it
}
```

#### In processBlock()
```cpp
void YourAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, 
                                       juce::MidiBuffer& midiMessages) {
    // ... existing processing ...
    
    // Apply circular delay effect
    if (isCircularDelayEnabled) {
        circularDelay_.process(buffer);
    }
}
```

#### In createEditor()
```cpp
juce::AudioProcessorEditor* YourAudioProcessor::createEditor() {
    if (!circularDelayUI_) {
        circularDelayUI_ = std::make_unique<map2::CircularDelayUI>(circularDelay_);
    }
    return circularDelayUI_.get();
}
```

## Parameter Automation Integration

### Using AudioProcessorValueTreeState

```cpp
// In your ParameterLayout setup:
auto layout = std::make_unique<juce::AudioProcessorValueTreeState::ParameterLayout>();

layout->add(std::make_unique<juce::AudioParameterFloat>(
    "circularDelayTime",
    "Circular Delay Time",
    juce::NormalisableRange<float>(100.0f, 2000.0f),
    500.0f));

layout->add(std::make_unique<juce::AudioParameterInt>(
    "circularNumTaps",
    "Circular Delay Taps",
    4, 12, 8));

layout->add(std::make_unique<juce::AudioParameterFloat>(
    "circularFeedback",
    "Circular Delay Feedback",
    juce::NormalisableRange<float>(0.0f, 0.95f),
    0.5f));

layout->add(std::make_unique<juce::AudioParameterFloat>(
    "circularPanRate",
    "Circular Delay Pan Rate",
    juce::NormalisableRange<float>(0.1f, 5.0f),
    1.0f));

layout->add(std::make_unique<juce::AudioParameterFloat>(
    "circularDepth",
    "Circular Delay Depth",
    juce::NormalisableRange<float>(0.0f, 1.0f),
    1.0f));

layout->add(std::make_unique<juce::AudioParameterFloat>(
    "circularMix",
    "Circular Delay Mix",
    juce::NormalisableRange<float>(0.0f, 1.0f),
    0.5f));

// Then in processBlock, update parameters:
circularDelay_.setDelayTime(
    apvts.getRawParameterValue("circularDelayTime")->load());
circularDelay_.setNumTaps(
    static_cast<int>(apvts.getRawParameterValue("circularNumTaps")->load()));
// ... etc for other parameters ...
```

## Parallel Processing Chain Integration

### Using AudioProcessorGraph

```cpp
// Add circular delay as a node in the graph
auto circularDelayNode = std::make_unique<CircularDelayProcessor>();
auto nodeID = graph.addNode(std::move(circularDelayNode));

// Connect in serial chain
graph.addConnection({{ sourceNode, 0 }, { nodeID, 0 }});
graph.addConnection({{ nodeID, 0 }, { outputNode, 0 }});
```

### Using as Parallel Effect

```cpp
// Mix setup for parallel processing
float drySignal = originalBuffer;
float wetSignal = originalBuffer;

circularDelay_.process(wetSignal);

float mix = 0.5f;  // 50% wet
float output = drySignal * (1.0f - mix) + wetSignal * mix;
```

## Testing Your Integration

### Basic Functionality Test
```cpp
void testCircularDelayIntegration() {
    map2::CircularDelayProcessor processor;
    processor.prepare(44100.0, 512, 2);
    
    // Create test buffer with silent audio
    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    
    // Add test signal to channel 0
    auto* channelData = buffer.getWritePointer(0);
    for (int i = 0; i < 10; ++i) {
        channelData[i] = 1.0f;  // Impulse
    }
    
    // Process
    processor.process(buffer);
    
    // Verify output has values (effect is working)
    auto* outData = buffer.getReadPointer(0);
    bool hasOutput = false;
    for (int i = 10; i < 512; ++i) {
        if (std::abs(outData[i]) > 0.01f) {
            hasOutput = true;
            break;
        }
    }
    
    assert(hasOutput && "Circular delay should produce output from feedback");
}
```

### Performance Profiling
```cpp
// Measure CPU usage
auto startTime = std::chrono::high_resolution_clock::now();

for (int i = 0; i < 1000; ++i) {
    processor.process(buffer);
}

auto endTime = std::chrono::high_resolution_clock::now();
auto duration = std::chrono::duration_cast<std::chrono::microseconds>(
    endTime - startTime).count();

double microsPerBlock = duration / 1000.0;
double msPerBlock = microsPerBlock / 1000.0;
std::cout << "Average processing time: " << msPerBlock << " ms" << std::endl;
```

## Build Instructions

### Using Projucer
1. Open your Projucer project
2. Add source files to your target:
   - `CircularDelayProcessor.h`
   - `CircularDelayProcessor.cpp`
   - `CircularDelayUI.h`
   - `CircularDelayUI.cpp`
3. Ensure these modules are enabled:
   - `juce_core`
   - `juce_audio_basics`
   - `juce_audio_processors`
   - `juce_dsp`
   - `juce_gui_basics`
   - `juce_gui_extra`
4. Save and regenerate build files

### Using CMake
```bash
cd /path/to/map2-audio/juce-engine
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . -j$(nproc)
```

### Xcode (macOS)
```bash
cd build
open map2-audio.xcodeproj
# Build using Cmd+B or Product > Build
```

### Visual Studio (Windows)
```cmd
cd build
start map2-audio.sln
REM Build using Ctrl+Shift+B or Build > Build Solution
```

## Troubleshooting Build Issues

### Linker Errors
**Error**: `undefined reference to 'map2::CircularDelayProcessor::...'`
- **Solution**: Ensure `.cpp` files are in your build targets, not just headers

### Missing Headers
**Error**: `CircularDelayProcessor.h: No such file or directory`
- **Solution**: Check that `Source/` directory is in include paths

### DSP Module Not Found
**Error**: `juce_dsp/juce_dsp.h: No such file or directory`
- **Solution**: Verify `juce_dsp` module is linked in CMakeLists.txt or Projucer

## Next Steps

1. **Integration**: Follow the "C++ Integration" section for your specific use case
2. **Automation**: Set up parameter automation using AudioProcessorValueTreeState
3. **UI**: Use CircularDelayUI or integrate controls into your custom interface
4. **Testing**: Run the provided test to verify correct behavior
5. **Tuning**: Adjust SMOOTHING_COEFF if parameter changes are too quick/slow

## Support & Debugging

### Enable Debug Output
```cpp
// Add to CircularDelayProcessor.cpp processBlock():
if (++debugCounter % 44100 == 0) {  // Every 1 second @ 44.1kHz
    std::cout << "Circular Delay - Mix: " << mixAmount_ << std::endl;
}
```

### Performance Monitoring
```cpp
// Monitor CPU in your plugin editor
metering_ = circularDelay_.getMetering();
std::cout << "Input Level: " << metering_.inputLevel << " dB" << std::endl;
std::cout << "Output Level: " << metering_.outputLevel << " dB" << std::endl;
```
