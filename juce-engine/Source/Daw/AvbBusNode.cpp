// =============================================================================
// T2503 Set 9 — AvbBusNode implementation
// =============================================================================

#include "AvbBusNode.h"

namespace map2::daw {

AvbBusNode::AvbBusNode(const AvbStreamDescriptor& descriptor)
    : juce::AudioProcessor(
        BusesProperties()
            .withInput("AVB In", juce::AudioChannelSet::canonicalChannelSet(descriptor.channelCount), true)
            .withOutput("AVB Out", juce::AudioChannelSet::canonicalChannelSet(descriptor.channelCount), true)),
      descriptor_(descriptor) {
    juce::String dirLabel = (descriptor.direction == AvbDirection::Input)
        ? "Input" : "Output";
    name_ = "MAP2 ▸ AVB Bus (" + dirLabel + " — " + juce::String(descriptor.streamId) + ")";
}

void AvbBusNode::prepareToPlay(double sampleRate, int blockSize) {
    sampleRate_ = sampleRate;
    blockSize_ = blockSize;
}

void AvbBusNode::releaseResources() {
    // Bench-gate slice: detach from AvbStream rings here.
}

void AvbBusNode::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) {
    // Set 9 stub: the bench-gate slice will:
    //   - on Input direction: copy from AvbStream ring into buffer.
    //   - on Output direction: copy from buffer into AvbStream ring.
    // Until then we silence the buffer so the graph doesn't pass garbage.
    buffer.clear();
}

int AvbBusNode::getLatencyInSamples() const noexcept {
    // AVB AVTP packet size is the typical lower bound for end-to-end latency.
    // The bench-gate slice will replace this with a live measurement from
    // AvbStream.
    return descriptor_.packetSizeSamples;
}

} // namespace map2::daw
