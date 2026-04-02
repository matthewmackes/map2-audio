#include <cmath>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "../Source/ConvolutionProcessor.h"

using map2::ConvolutionProcessor;

namespace {

std::vector<float> makeStereoInterleavedIR(int numSamples, float leftScale, float rightScale) {
    std::vector<float> data(static_cast<size_t> (numSamples) * 2u, 0.0f);
    for (int sample = 0; sample < numSamples; ++sample) {
        const float left = sample == 0 ? leftScale : 0.0f;
        const float right = sample == 0 ? rightScale : 0.0f;
        data[static_cast<size_t> (sample) * 2u] = left;
        data[static_cast<size_t> (sample) * 2u + 1u] = right;
    }
    return data;
}

bool bufferIsFinite(const juce::AudioBuffer<float>& buffer) {
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
            if (! std::isfinite(buffer.getSample(channel, sample))) {
                return false;
            }
        }
    }
    return true;
}

} // namespace

TEST_CASE("ConvolutionProcessor accepts repeated control-plane IR loads while processing", "[convolution][rt]") {
    ConvolutionProcessor processor;
    processor.prepare(48000.0, 64, 2);

    juce::AudioBuffer<float> block(2, 64);

    for (int iteration = 0; iteration < 16; ++iteration) {
        const float leftScale = 1.0f - (static_cast<float>(iteration) * 0.03f);
        const float rightScale = 0.5f + (static_cast<float>(iteration) * 0.02f);
        auto ir = makeStereoInterleavedIR(32, leftScale, rightScale);

        REQUIRE(processor.loadImpulseResponseFromData(ir.data(), 32, 2, 48000.0));
        REQUIRE(processor.isIRLoaded());

        block.clear();
        block.setSample(0, 0, 1.0f);
        block.setSample(1, 0, 1.0f);

        processor.process(block);
        REQUIRE(bufferIsFinite(block));
    }
}
