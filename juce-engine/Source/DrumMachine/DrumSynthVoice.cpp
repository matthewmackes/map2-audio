#include "DrumMachine/DrumSynthVoice.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace map2::drummachine {

namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

}  // namespace

void DrumSynthVoice::prepare(double sampleRate) {
    sampleRate_ = std::max(1.0, sampleRate);
    reset();
}

void DrumSynthVoice::reset() {
    active_ = false;
    velocity_ = 0.0f;
    gainLeft_ = 0.0f;
    gainRight_ = 0.0f;
    phase_ = 0.0f;
    bodyEnv_ = 0.0f;
    noiseEnv_ = 0.0f;
    noiseLowpassState_ = 0.0f;
    noiseHighpassState_ = 0.0f;
}

void DrumSynthVoice::noteOn(
    float velocity,
    const Params& params,
    float level,
    float pan,
    float tuneSemitones,
    float filterCutoffHz) {
    params_ = params;
    velocity_ = std::clamp(velocity, 0.0f, 1.0f);
    const float clampedLevel = std::clamp(level, 0.0f, 1.0f);
    const float clampedPan = std::clamp(pan, -1.0f, 1.0f);
    gainLeft_ = clampedLevel * (clampedPan <= 0.0f ? 1.0f : 1.0f - clampedPan);
    gainRight_ = clampedLevel * (clampedPan >= 0.0f ? 1.0f : 1.0f + clampedPan);
    phase_ = 0.0f;

    const float pitchScale = std::pow(2.0f, std::clamp(tuneSemitones, -24.0f, 24.0f) / 12.0f);
    pitchStartHz_ = std::clamp(params.pitchEnvelopeStartHz, 20.0f, 4000.0f) * pitchScale;
    pitchEndHz_ = std::clamp(params.pitchEnvelopeEndHz, 20.0f, 4000.0f) * pitchScale;
    pitchDecayRate_ = std::exp(-1.0f / static_cast<float>(sampleRate_ * std::max(0.001f, params.pitchEnvelopeDecayMs / 1000.0f)));
    bodyDecayRate_ = std::exp(-1.0f / static_cast<float>(sampleRate_ * std::max(0.001f, params.bodyDecayMs / 1000.0f)));
    noiseDecayRate_ = std::exp(-1.0f / static_cast<float>(sampleRate_ * std::max(0.001f, params.noiseDecayMs / 1000.0f)));
    bodyEnv_ = 1.0f;
    noiseEnv_ = std::clamp(params.noiseLevel, 0.0f, 1.0f);
    toneCutoffHz_ = std::clamp(filterCutoffHz > 0.0f ? filterCutoffHz : cutoffFromTone(params.toneAmount), 100.0f, 18000.0f);
    noiseLowpassState_ = 0.0f;
    noiseHighpassState_ = 0.0f;
    active_ = velocity_ > 0.0f && clampedLevel > 0.0f;
}

void DrumSynthVoice::render(
    juce::AudioBuffer<float>& output,
    int leftChannel,
    int rightChannel,
    int startSample,
    int numSamples) {
    if (!active_ || numSamples <= 0) {
        return;
    }

    auto* left = output.getWritePointer(leftChannel, startSample);
    auto* right = output.getWritePointer(rightChannel, startSample);
    const float sampleRate = static_cast<float>(sampleRate_);

    for (int sample = 0; sample < numSamples; ++sample) {
        const float currentHz = pitchEndHz_ + ((pitchStartHz_ - pitchEndHz_) * bodyEnv_);
        const float phaseIncrement = (kTwoPi * currentHz) / sampleRate;
        phase_ += phaseIncrement;
        if (phase_ >= kTwoPi) {
            phase_ -= kTwoPi;
        }

        const float bodySample = renderOscillatorSample(phase_) * bodyEnv_;
        float lowpassState = noiseLowpassState_;
        float highpassState = noiseHighpassState_;
        updateNoiseFilter(nextNoise(), toneCutoffHz_, lowpassState, highpassState);
        noiseLowpassState_ = lowpassState;
        noiseHighpassState_ = highpassState;

        const float shapedNoise = (lowpassState + highpassState) * 0.5f;
        const float outputSample = velocity_ * ((bodySample * (1.0f - (params_.noiseLevel * 0.35f))) + (shapedNoise * noiseEnv_));
        left[sample] += outputSample * gainLeft_;
        right[sample] += outputSample * gainRight_;

        bodyEnv_ *= bodyDecayRate_;
        noiseEnv_ *= noiseDecayRate_;
        toneCutoffHz_ = std::max(80.0f, toneCutoffHz_ * pitchDecayRate_);
    }

    if (bodyEnv_ < 0.0005f && noiseEnv_ < 0.0005f) {
        reset();
    }
}

float DrumSynthVoice::nextNoise() {
    randomState_ ^= randomState_ << 13;
    randomState_ ^= randomState_ >> 17;
    randomState_ ^= randomState_ << 5;
    return (static_cast<float>(randomState_ & 0xffffu) / 32767.5f) - 1.0f;
}

float DrumSynthVoice::renderOscillatorSample(float phase) const {
    switch (params_.oscillatorType) {
        case OscillatorType::Triangle:
            return 2.0f * std::abs((phase / kPi) - 1.0f) - 1.0f;
        case OscillatorType::Saw:
            return (phase / kPi) - 1.0f;
        case OscillatorType::Square:
            return phase < kPi ? 1.0f : -1.0f;
        case OscillatorType::Metallic: {
            static constexpr std::array<float, 6> ratios = {1.0f, 1.34f, 1.79f, 2.13f, 2.97f, 3.91f};
            float sample = 0.0f;
            for (float ratio : ratios) {
                sample += std::sin(phase * ratio);
            }
            return sample / static_cast<float>(ratios.size());
        }
        case OscillatorType::Sine:
        default:
            return std::sin(phase);
    }
}

float DrumSynthVoice::cutoffFromTone(float toneAmount) const {
    const float clampedTone = std::clamp(toneAmount, 0.0f, 1.0f);
    return 300.0f + (clampedTone * 11700.0f);
}

void DrumSynthVoice::updateNoiseFilter(float whiteNoise, float cutoffHz, float& lowpassState, float& highpassState) {
    const float alpha = std::clamp((kTwoPi * cutoffHz) / static_cast<float>(sampleRate_), 0.001f, 0.99f);
    lowpassState += alpha * (whiteNoise - lowpassState);
    highpassState = whiteNoise - lowpassState;
}

}  // namespace map2::drummachine
