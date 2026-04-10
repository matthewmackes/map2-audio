#include <algorithm>

#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/ParallelMixerProcessor.h"

using map2::ParallelMixerProcessor;

namespace {

juce::AudioBuffer<float> makeProcessBuffer(ParallelMixerProcessor& mixer, int numSamples) {
    juce::AudioBuffer<float> buffer(
        std::max(mixer.getTotalNumInputChannels(), mixer.getTotalNumOutputChannels()),
        numSamples);
    buffer.clear();
    return buffer;
}

void fillInputBus(ParallelMixerProcessor& mixer,
                  juce::AudioBuffer<float>& buffer,
                  int busIndex,
                  float left,
                  float right) {
    const int leftChannel = mixer.getChannelIndexInProcessBlockBuffer(true, busIndex, 0);
    const int rightChannel = mixer.getChannelIndexInProcessBlockBuffer(true, busIndex, 1);
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
        buffer.setSample(leftChannel, sample, left);
        buffer.setSample(rightChannel, sample, right);
    }
}

juce::AudioBuffer<float> getOutputBus(ParallelMixerProcessor& mixer,
                                      juce::AudioBuffer<float>& buffer) {
    return mixer.getBusBuffer(buffer, false, 0);
}

} // namespace

TEST_CASE("ParallelMixerProcessor reads isolated branch buses for A/B blend", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 32);
    mixer.setMode(ParallelMixerProcessor::Mode::ABBlend);
    mixer.setABBlend(1.0f);

    auto buffer = makeProcessBuffer(mixer, 32);
    fillInputBus(mixer, buffer, 0, 0.9f, 0.3f);
    fillInputBus(mixer, buffer, 1, 0.4f, 0.8f);

    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    const auto output = getOutputBus(mixer, buffer);
    REQUIRE(output.getSample(0, 0) == Catch::Approx(0.4f));
    REQUIRE(output.getSample(1, 0) == Catch::Approx(0.8f));
}

TEST_CASE("ParallelMixerProcessor applies branch levels and master gain without callback mutexes", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 32);
    mixer.setMode(ParallelMixerProcessor::Mode::MultiMix);
    mixer.setNumBranches(3);
    mixer.setBranchLevel(0, 1.0f);
    mixer.setBranchLevel(1, 0.5f);
    mixer.setBranchLevel(2, 2.0f);
    mixer.setMasterLevel(0.5f);

    auto buffer = makeProcessBuffer(mixer, 32);
    fillInputBus(mixer, buffer, 0, 1.0f, 1.0f);
    fillInputBus(mixer, buffer, 1, 0.5f, 0.5f);
    fillInputBus(mixer, buffer, 2, 0.25f, 0.25f);

    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    const auto output = getOutputBus(mixer, buffer);
    REQUIRE(output.getSample(0, 0) == Catch::Approx(0.875f));
    REQUIRE(output.getSample(1, 0) == Catch::Approx(0.875f));
}

TEST_CASE("ParallelMixerProcessor bypass copies branch 0 through unchanged", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 32);
    mixer.setBypass(true);
    mixer.setMasterLevel(0.1f);

    auto buffer = makeProcessBuffer(mixer, 32);
    fillInputBus(mixer, buffer, 0, 0.7f, 0.2f);
    fillInputBus(mixer, buffer, 1, 0.3f, 0.9f);

    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    const auto output = getOutputBus(mixer, buffer);
    REQUIRE(output.getSample(0, 0) == Catch::Approx(0.7f));
    REQUIRE(output.getSample(1, 0) == Catch::Approx(0.2f));
}

TEST_CASE("ParallelMixerProcessor hard-switches A/B groups at the next zero crossing", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 128);
    mixer.setMode(ParallelMixerProcessor::Mode::ABBlend);
    mixer.setABBlend(0.0f);

    auto buffer = makeProcessBuffer(mixer, 128);
    const int branchALeft = mixer.getChannelIndexInProcessBlockBuffer(true, 0, 0);
    const int branchARight = mixer.getChannelIndexInProcessBlockBuffer(true, 0, 1);
    const int branchBLeft = mixer.getChannelIndexInProcessBlockBuffer(true, 1, 0);
    const int branchBRight = mixer.getChannelIndexInProcessBlockBuffer(true, 1, 1);
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
        const float valueA = sample < 32 ? 0.6f : -0.6f;
        buffer.setSample(branchALeft, sample, valueA);
        buffer.setSample(branchARight, sample, valueA);
        buffer.setSample(branchBLeft, sample, 0.2f);
        buffer.setSample(branchBRight, sample, 0.2f);
    }

    mixer.triggerABSwitchToBranch(1);
    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    const auto output = getOutputBus(mixer, buffer);
    REQUIRE(output.getSample(0, 0) == Catch::Approx(0.6f));
    REQUIRE(output.getSample(0, 31) == Catch::Approx(0.6f));
    REQUIRE(output.getSample(0, 40) < output.getSample(0, 31));
    REQUIRE(output.getSample(0, 127) == Catch::Approx(0.2f).margin(0.02f));
}

TEST_CASE("ParallelMixerProcessor falls back to a short crossfade when no zero crossing exists", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 128);
    mixer.setMode(ParallelMixerProcessor::Mode::ABBlend);
    mixer.setABBlend(0.0f);

    auto buffer = makeProcessBuffer(mixer, 128);
    fillInputBus(mixer, buffer, 0, 0.9f, 0.9f);
    fillInputBus(mixer, buffer, 1, 0.1f, 0.1f);

    mixer.triggerABSwitchToBranch(1);
    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    const auto output = getOutputBus(mixer, buffer);
    REQUIRE(output.getSample(0, 0) > output.getSample(0, 32));
    REQUIRE(output.getSample(0, 32) > output.getSample(0, 96));
    REQUIRE(output.getSample(0, 127) == Catch::Approx(0.1f).margin(0.02f));
}

TEST_CASE("ParallelMixerProcessor exposes isolated branch tap buffers", "[parallel][mixer]") {
    ParallelMixerProcessor mixer;
    mixer.prepareToPlay(48000.0, 32);
    mixer.setMode(ParallelMixerProcessor::Mode::MultiMix);
    mixer.setNumBranches(2);

    auto buffer = makeProcessBuffer(mixer, 32);
    fillInputBus(mixer, buffer, 0, 0.75f, 0.25f);
    fillInputBus(mixer, buffer, 1, 0.15f, 0.85f);

    juce::MidiBuffer midi;
    mixer.processBlock(buffer, midi);

    juce::AudioBuffer<float> tapA(2, 32);
    juce::AudioBuffer<float> tapB(2, 32);
    REQUIRE(mixer.copyBranchTapToBuffer(0, tapA, 32));
    REQUIRE(mixer.copyBranchTapToBuffer(1, tapB, 32));
    REQUIRE(tapA.getSample(0, 0) == Catch::Approx(0.75f));
    REQUIRE(tapA.getSample(1, 0) == Catch::Approx(0.25f));
    REQUIRE(tapB.getSample(0, 0) == Catch::Approx(0.15f));
    REQUIRE(tapB.getSample(1, 0) == Catch::Approx(0.85f));
}
