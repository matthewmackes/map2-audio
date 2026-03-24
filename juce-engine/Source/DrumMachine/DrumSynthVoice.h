#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <cstdint>

namespace map2::drummachine {

class DrumSynthVoice {
public:
    enum class OscillatorType {
        Sine = 0,
        Triangle,
        Saw,
        Square,
        Metallic,
    };

    struct Params {
        OscillatorType oscillatorType = OscillatorType::Sine;
        float pitchEnvelopeStartHz = 160.0f;
        float pitchEnvelopeEndHz = 50.0f;
        float pitchEnvelopeDecayMs = 180.0f;
        float noiseLevel = 0.2f;
        float noiseDecayMs = 120.0f;
        float bodyDecayMs = 420.0f;
        float toneAmount = 0.55f;
    };

    void prepare(double sampleRate);
    void reset();
    void noteOn(
        float velocity,
        const Params& params,
        float level,
        float pan,
        float tuneSemitones,
        float filterCutoffHz = 8000.0f);
    void render(juce::AudioBuffer<float>& output, int leftChannel, int rightChannel, int startSample, int numSamples);

    bool isActive() const { return active_; }

private:
    float nextNoise();
    float renderOscillatorSample(float phase) const;
    float cutoffFromTone(float toneAmount) const;
    void updateNoiseFilter(float whiteNoise, float cutoffHz, float& lowpassState, float& highpassState);

    double sampleRate_ = 44100.0;
    bool active_ = false;
    float velocity_ = 0.0f;
    float gainLeft_ = 0.0f;
    float gainRight_ = 0.0f;
    float phase_ = 0.0f;
    float pitchStartHz_ = 160.0f;
    float pitchEndHz_ = 50.0f;
    float pitchDecayRate_ = 0.0f;
    float bodyDecayRate_ = 0.0f;
    float noiseDecayRate_ = 0.0f;
    float bodyEnv_ = 0.0f;
    float noiseEnv_ = 0.0f;
    float toneCutoffHz_ = 8000.0f;
    float noiseLowpassState_ = 0.0f;
    float noiseHighpassState_ = 0.0f;
    Params params_{};
    std::uint32_t randomState_ = 0x12345678u;
};

}  // namespace map2::drummachine
