#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include <array>
#include <atomic>

namespace map2::drummachine {

class DrumMachineMixer {
public:
    static constexpr int kBusCount = 8;
    static constexpr int kBusChannels = kBusCount * 2;

    struct BusEqConfig {
        float lowGainDb = 0.0f;
        float midGainDb = 0.0f;
        float midFrequencyHz = 1000.0f;
        float highGainDb = 0.0f;
    };

    struct BusCompConfig {
        float thresholdDb = -18.0f;
        float ratio = 2.0f;
        float attackMs = 10.0f;
        float releaseMs = 80.0f;
        float makeupGainDb = 0.0f;
    };

    struct BusOutputConfig {
        float level = 1.0f;
        float pan = 0.0f;
        bool mute = false;
        bool solo = false;
    };

    struct Metering {
        std::array<float, kBusCount> busPeak{};
        std::array<float, kBusCount> busRms{};
        float masterPeakLeft = 0.0f;
        float masterPeakRight = 0.0f;
        float masterRmsLeft = 0.0f;
        float masterRmsRight = 0.0f;
    };

    DrumMachineMixer();

    void prepare(double sampleRate, int samplesPerBlock);
    void process(const juce::AudioBuffer<float>& busInput, juce::AudioBuffer<float>& stereoOutput);

    bool setBusEq(int busIndex, const BusEqConfig& config);
    bool setBusComp(int busIndex, const BusCompConfig& config);
    bool setBusOutput(int busIndex, const BusOutputConfig& config);
    bool setBusLevel(int busIndex, float level);
    bool setBusPan(int busIndex, float pan);
    bool setBusMute(int busIndex, bool mute);
    bool setBusSolo(int busIndex, bool solo);

    BusEqConfig getBusEq(int busIndex) const;
    BusCompConfig getBusComp(int busIndex) const;
    BusOutputConfig getBusOutput(int busIndex) const;

    void setMasterVolume(float volume);
    float getMasterVolume() const;
    Metering getMetering() const;

private:
    using StereoFilter = juce::dsp::ProcessorDuplicator<
        juce::dsp::IIR::Filter<float>,
        juce::dsp::IIR::Coefficients<float>>;

    struct BusState {
        BusEqConfig eq;
        BusCompConfig comp;
        BusOutputConfig output;
        StereoFilter lowShelf;
        StereoFilter midPeak;
        StereoFilter highShelf;
        juce::dsp::Compressor<float> compressor;
    };

    static bool isValidBusIndex(int busIndex);
    static float clampLevel(float value);
    static float clampPan(float value);
    void refreshBusEq(int busIndex);
    void refreshBusComp(int busIndex);

    std::array<BusState, kBusCount> buses_{};
    std::array<float, kBusCount> busPeak_{};
    std::array<float, kBusCount> busRms_{};
    std::atomic<float> masterVolume_{1.0f};
    std::atomic<float> masterPeakLeft_{0.0f};
    std::atomic<float> masterPeakRight_{0.0f};
    std::atomic<float> masterRmsLeft_{0.0f};
    std::atomic<float> masterRmsRight_{0.0f};
    juce::AudioBuffer<float> scratchBuffer_;
    double sampleRate_ = 44100.0;
    int samplesPerBlock_ = 512;
    bool prepared_ = false;
};

}  // namespace map2::drummachine
