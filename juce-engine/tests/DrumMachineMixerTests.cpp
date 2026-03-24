#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/DrumMachine/DrumMachineMixer.h"

using namespace map2::drummachine;

TEST_CASE("DrumMachineMixer exposes the fixed bus surface", "[drums][mixer]") {
    DrumMachineMixer mixer;
    mixer.prepare(48000.0, 128);

    REQUIRE(mixer.setBusEq(0, {3.0f, -1.5f, 850.0f, 2.0f}));
    REQUIRE(mixer.setBusComp(0, {-20.0f, 4.0f, 5.0f, 60.0f, 1.5f}));
    REQUIRE(mixer.setBusOutput(0, {0.75f, -0.25f, false, true}));
    mixer.setMasterVolume(0.8f);

    const auto eq = mixer.getBusEq(0);
    const auto comp = mixer.getBusComp(0);
    const auto output = mixer.getBusOutput(0);

    REQUIRE(eq.lowGainDb == Catch::Approx(3.0f));
    REQUIRE(eq.midFrequencyHz == Catch::Approx(850.0f));
    REQUIRE(comp.ratio == Catch::Approx(4.0f));
    REQUIRE(output.level == Catch::Approx(0.75f));
    REQUIRE(output.pan == Catch::Approx(-0.25f));
    REQUIRE(output.solo);
    REQUIRE(mixer.getMasterVolume() == Catch::Approx(0.8f));
}

TEST_CASE("DrumMachineMixer folds bus pairs into stereo output and records metering", "[drums][mixer]") {
    DrumMachineMixer mixer;
    mixer.prepare(48000.0, 64);

    juce::AudioBuffer<float> busInput(DrumMachineMixer::kBusChannels, 64);
    busInput.clear();
    busInput.applyGain(0.0f);
    busInput.clear();
    busInput.addSample(0, 0, 0.8f);
    busInput.addSample(1, 0, 0.8f);

    juce::AudioBuffer<float> stereoOut(2, 64);
    stereoOut.clear();
    mixer.process(busInput, stereoOut);

    const auto metering = mixer.getMetering();
    REQUIRE(stereoOut.getMagnitude(0, 0, 64) > 0.0f);
    REQUIRE(stereoOut.getMagnitude(1, 0, 64) > 0.0f);
    REQUIRE(metering.busPeak[0] > 0.0f);
    REQUIRE(metering.masterPeakLeft > 0.0f);
    REQUIRE(metering.masterPeakRight > 0.0f);
}

TEST_CASE("DrumMachineMixer bus solo and mute gates are respected", "[drums][mixer]") {
    DrumMachineMixer mixer;
    mixer.prepare(48000.0, 32);

    juce::AudioBuffer<float> busInput(DrumMachineMixer::kBusChannels, 32);
    busInput.clear();
    busInput.addSample(0, 0, 0.7f);
    busInput.addSample(1, 0, 0.7f);
    busInput.addSample(2, 0, 0.6f);
    busInput.addSample(3, 0, 0.6f);

    juce::AudioBuffer<float> stereoOut(2, 32);
    stereoOut.clear();
    mixer.setBusSolo(0, true);
    mixer.setBusMute(1, true);
    mixer.process(busInput, stereoOut);

    REQUIRE(stereoOut.getMagnitude(0, 0, 32) > 0.0f);
    REQUIRE(mixer.getMetering().busPeak[1] > 0.0f);
}

TEST_CASE("DrumMachineMixer applies master FX and bus reverb send on the master pair", "[drums][mixer]") {
    DrumMachineMixer mixer;
    mixer.prepare(48000.0, 64);
    mixer.setMasterFx({
        18.0f,
        -24.0f,
        4.0f,
        5.0f,
        80.0f,
        3.0f,
        0.45f,
        0.75f,
        0.2f,
        1.0f,
        -1.0f,
        60.0f,
    });
    REQUIRE(mixer.setBusReverbSend(0, 0.7f));

    juce::AudioBuffer<float> busInput(DrumMachineMixer::kBusChannels, 64);
    busInput.clear();
    for (int sample = 0; sample < 64; ++sample) {
        busInput.setSample(0, sample, sample == 0 ? 0.8f : 0.0f);
        busInput.setSample(1, sample, sample == 0 ? 0.8f : 0.0f);
    }

    juce::AudioBuffer<float> stereoOut(2, 64);
    stereoOut.clear();
    mixer.process(busInput, stereoOut);

    REQUIRE(mixer.getBusOutput(0).reverbSend == Catch::Approx(0.7f));
    REQUIRE(stereoOut.getMagnitude(0, 0, 64) > 0.0f);
    REQUIRE(stereoOut.getMagnitude(1, 0, 64) > 0.0f);
    REQUIRE(stereoOut.getRMSLevel(0, 1, 63) > 0.0f);
}
