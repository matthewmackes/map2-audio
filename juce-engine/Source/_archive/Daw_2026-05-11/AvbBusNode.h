// =============================================================================
// T2503 Set 9 — AvbBusNode
// =============================================================================
// One AvbBusNode = one AVB stream (input or output) exposed as a
// juce::AudioProcessor that lives inside the DAW signal graph
// (juce::AudioProcessorGraph). Each node:
//   - holds a stream descriptor (AVB entity/talker/listener IDs)
//   - reports getLatencyInSamples() (the AVB ring's own buffering depth)
//   - in processBlock, reads the AVB ring (input direction) or writes it
//     (output direction)
//
// Set 9 ships the AudioProcessor skeleton + descriptor model. The actual
// hookup to AvbStream (juce-engine/Source/AvbStream.cpp) is the bench-gate
// slice; the skeleton's processBlock currently passes silence so the unit
// tests don't need a live AVB ring.
//
// License: AGPLv3-only.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "AvbBusNode.h included but MAP2_DAW_MODE is not set"
#endif

#include <juce_audio_processors/juce_audio_processors.h>

#include <string>

namespace map2::daw {

enum class AvbDirection {
    Input,    // remote talker → this node → graph
    Output    // graph → this node → remote listener
};

struct AvbStreamDescriptor {
    std::string streamId;        // opaque stream identifier
    AvbDirection direction = AvbDirection::Input;
    int channelCount = 8;        // AVB streams are typically 8ch / 1722 frame
    int packetSizeSamples = 256; // AVTP packet size — NOT the audio buffer
};

class AvbBusNode : public juce::AudioProcessor {
public:
    explicit AvbBusNode(const AvbStreamDescriptor& descriptor);

    // juce::AudioProcessor overrides — stable contract for the graph.
    const juce::String getName() const override { return name_; }
    void prepareToPlay(double sampleRate, int blockSize) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override;
    using juce::AudioProcessor::processBlock;

    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    double getTailLengthSeconds() const override { return 0.0; }

    int getLatencyInSamples() const noexcept;

    const AvbStreamDescriptor& descriptor() const noexcept { return descriptor_; }

private:
    AvbStreamDescriptor descriptor_;
    juce::String name_;
    double sampleRate_ = 48000.0;
    int blockSize_ = 64;
};

} // namespace map2::daw
