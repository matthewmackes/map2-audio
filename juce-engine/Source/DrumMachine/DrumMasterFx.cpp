#include "DrumMachine/DrumMasterFx.h"

#include <algorithm>
#include <cmath>

namespace map2::drummachine {

DrumMasterFx::DrumMasterFx() {
    refreshConfig();
}

void DrumMasterFx::prepare(double sampleRate, int samplesPerBlock) {
    sampleRate_ = std::max(1.0, sampleRate);
    samplesPerBlock_ = std::max(1, samplesPerBlock);
    workingBuffer_.setSize(2, samplesPerBlock_, false, false, true);
    wetBuffer_.setSize(2, samplesPerBlock_, false, false, true);
    workingBuffer_.clear();
    wetBuffer_.clear();

    const juce::dsp::ProcessSpec spec{
        sampleRate_,
        static_cast<juce::uint32>(samplesPerBlock_),
        2,
    };

    compressor_.prepare(spec);
    limiter_.prepare(spec);
    reverb_.reset();
    refreshConfig();
    prepared_ = true;
}

void DrumMasterFx::process(juce::AudioBuffer<float>& mixBuffer, const juce::AudioBuffer<float>& reverbSendBuffer) {
    if (!prepared_ || mixBuffer.getNumChannels() < 2 || mixBuffer.getNumSamples() <= 0) {
        return;
    }

    const int numSamples = mixBuffer.getNumSamples();
    if (workingBuffer_.getNumSamples() < numSamples || wetBuffer_.getNumSamples() < numSamples) {
        scratchBufferResizeCount_.fetch_add(1, std::memory_order_relaxed);
    }

    workingBuffer_.setSize(2, numSamples, false, false, true);
    wetBuffer_.setSize(2, numSamples, false, false, true);
    workingBuffer_.copyFrom(0, 0, mixBuffer, 0, 0, numSamples);
    workingBuffer_.copyFrom(1, 0, mixBuffer, 1, 0, numSamples);

    const float driveGain = juce::Decibels::decibelsToGain(std::max(0.0f, config_.driveDb));
    for (int channel = 0; channel < 2; ++channel) {
        auto* samples = workingBuffer_.getWritePointer(channel);
        for (int sample = 0; sample < numSamples; ++sample) {
            const float driven = samples[sample] * driveGain;
            samples[sample] = std::tanh(driven) / std::tanh(std::max(1.0f, driveGain));
        }
    }

    juce::dsp::AudioBlock<float> workingBlock(workingBuffer_);
    juce::dsp::ProcessContextReplacing<float> workingContext(workingBlock);
    compressor_.process(workingContext);
    workingBuffer_.applyGain(juce::Decibels::decibelsToGain(config_.compressorMakeupGainDb));

    wetBuffer_.clear();
    if (reverbSendBuffer.getNumChannels() >= 2 && reverbSendBuffer.getNumSamples() >= numSamples && config_.reverbMix > 0.0f) {
        wetBuffer_.copyFrom(0, 0, reverbSendBuffer, 0, 0, numSamples);
        wetBuffer_.copyFrom(1, 0, reverbSendBuffer, 1, 0, numSamples);
        auto* wetLeft = wetBuffer_.getWritePointer(0);
        auto* wetRight = wetBuffer_.getWritePointer(1);
        reverb_.processStereo(wetLeft, wetRight, numSamples);
        workingBuffer_.addFrom(0, 0, wetBuffer_, 0, 0, numSamples, clampUnit(config_.reverbMix));
        workingBuffer_.addFrom(1, 0, wetBuffer_, 1, 0, numSamples, clampUnit(config_.reverbMix));
    }

    juce::dsp::AudioBlock<float> limitedBlock(workingBuffer_);
    juce::dsp::ProcessContextReplacing<float> limitedContext(limitedBlock);
    limiter_.process(limitedContext);

    mixBuffer.copyFrom(0, 0, workingBuffer_, 0, 0, numSamples);
    mixBuffer.copyFrom(1, 0, workingBuffer_, 1, 0, numSamples);
}

void DrumMasterFx::setConfig(const Config& config) {
    config_.driveDb = std::clamp(config.driveDb, 0.0f, 24.0f);
    config_.compressorThresholdDb = std::clamp(config.compressorThresholdDb, -60.0f, 0.0f);
    config_.compressorRatio = std::clamp(config.compressorRatio, 1.0f, 20.0f);
    config_.compressorAttackMs = std::clamp(config.compressorAttackMs, 0.1f, 200.0f);
    config_.compressorReleaseMs = std::clamp(config.compressorReleaseMs, 5.0f, 1000.0f);
    config_.compressorMakeupGainDb = std::clamp(config.compressorMakeupGainDb, -24.0f, 24.0f);
    config_.reverbMix = clampUnit(config.reverbMix);
    config_.reverbSize = clampUnit(config.reverbSize);
    config_.reverbDamping = clampUnit(config.reverbDamping);
    config_.reverbWidth = clampUnit(config.reverbWidth);
    config_.limiterThresholdDb = std::clamp(config.limiterThresholdDb, -12.0f, 0.0f);
    config_.limiterReleaseMs = std::clamp(config.limiterReleaseMs, 5.0f, 500.0f);
    refreshConfig();
}

DrumMasterFx::Config DrumMasterFx::getConfig() const {
    return config_;
}

void DrumMasterFx::reset() {
    compressor_.reset();
    limiter_.reset();
    reverb_.reset();
    workingBuffer_.clear();
    wetBuffer_.clear();
}

void DrumMasterFx::resetProcessDiagnostics() {
    scratchBufferResizeCount_.store(0, std::memory_order_relaxed);
}

float DrumMasterFx::clampUnit(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

void DrumMasterFx::refreshConfig() {
    compressor_.setThreshold(config_.compressorThresholdDb);
    compressor_.setRatio(config_.compressorRatio);
    compressor_.setAttack(config_.compressorAttackMs);
    compressor_.setRelease(config_.compressorReleaseMs);

    juce::Reverb::Parameters reverbParams;
    reverbParams.roomSize = config_.reverbSize;
    reverbParams.damping = config_.reverbDamping;
    reverbParams.width = config_.reverbWidth;
    reverbParams.wetLevel = 1.0f;
    reverbParams.dryLevel = 0.0f;
    reverbParams.freezeMode = 0.0f;
    reverb_.setParameters(reverbParams);

    limiter_.setThreshold(config_.limiterThresholdDb);
    limiter_.setRelease(config_.limiterReleaseMs);
}

}  // namespace map2::drummachine
