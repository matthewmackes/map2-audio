#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include <atomic>

namespace map2::drummachine {

class DrumMasterFx {
public:
    struct Config {
        float driveDb = 0.0f;
        float compressorThresholdDb = -18.0f;
        float compressorRatio = 2.0f;
        float compressorAttackMs = 10.0f;
        float compressorReleaseMs = 80.0f;
        float compressorMakeupGainDb = 0.0f;
        float reverbMix = 0.18f;
        float reverbSize = 0.45f;
        float reverbDamping = 0.35f;
        float reverbWidth = 1.0f;
        float limiterThresholdDb = -0.5f;
        float limiterReleaseMs = 60.0f;
    };

    DrumMasterFx();

    void prepare(double sampleRate, int samplesPerBlock);
    void process(juce::AudioBuffer<float>& mixBuffer, const juce::AudioBuffer<float>& reverbSendBuffer);

    void setConfig(const Config& config);
    Config getConfig() const;
    void reset();

    int getScratchBufferResizeCount() const { return scratchBufferResizeCount_.load(std::memory_order_relaxed); }
    void resetProcessDiagnostics();

private:
    static float clampUnit(float value);
    void refreshConfig();

    Config config_{};
    juce::dsp::Compressor<float> compressor_{};
    juce::dsp::Limiter<float> limiter_{};
    juce::Reverb reverb_{};
    juce::AudioBuffer<float> workingBuffer_;
    juce::AudioBuffer<float> wetBuffer_;
    std::atomic<int> scratchBufferResizeCount_{0};
    double sampleRate_ = 44100.0;
    int samplesPerBlock_ = 512;
    bool prepared_ = false;
};

}  // namespace map2::drummachine
