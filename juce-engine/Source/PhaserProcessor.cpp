/**
 * MAP2 Audio Engine - Phaser Processor Implementation
 */

#include "PhaserProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

PhaserProcessor::PhaserProcessor() {
    // Default initialization - prepare() must be called before processing
}

void PhaserProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = std::max(1, samplesPerBlock);
    numChannels_ = std::max(1, numChannels);

    // JUCE phaser allocates internal state based on maximumBlockSize.
    // Over-provision to tolerate backend callback variance without heap corruption.
    const auto preparedBlockSize = static_cast<juce::uint32>(
        std::max(blockSize_, MAX_AUDIO_BUFFER_SIZE));

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = preparedBlockSize;
    spec.numChannels = static_cast<juce::uint32>(numChannels_);

    phaser_.prepare(spec);

    parametersChanged_.store(true);
    updatePhaserParameters();

    prepared_ = true;
}

void PhaserProcessor::reset() {
    phaser_.reset();
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
    lfoPhase_.store(0.0f);
}

void PhaserProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    // Measure input
    float inputPeak = calculatePeakLevel(buffer);
    inputLevel_.store(inputPeak);

    if (bypass_.load()) {
        outputLevel_.store(inputPeak);
        return;
    }

    if (parametersChanged_.exchange(false)) {
        updatePhaserParameters();
    }

    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);

    phaser_.process(context);

    // Measure output
    float outputPeak = calculatePeakLevel(buffer);
    outputLevel_.store(outputPeak);
}

void PhaserProcessor::updatePhaserParameters() {
    phaser_.setRate(rate_.load());
    phaser_.setDepth(depth_.load());
    phaser_.setCentreFrequency(centreFrequency_.load());
    phaser_.setFeedback(feedback_.load());
    phaser_.setMix(mix_.load());
}

// Parameter setters
void PhaserProcessor::setRate(float hz) {
    hz = std::clamp(hz, 0.05f, 5.0f);
    rate_.store(hz);
    parametersChanged_.store(true);
}

void PhaserProcessor::setDepth(float depth) {
    depth = std::clamp(depth, 0.0f, 1.0f);
    depth_.store(depth);
    parametersChanged_.store(true);
}

void PhaserProcessor::setCentreFrequency(float hz) {
    hz = std::clamp(hz, 100.0f, 10000.0f);
    centreFrequency_.store(hz);
    parametersChanged_.store(true);
}

void PhaserProcessor::setFeedback(float feedback) {
    feedback = std::clamp(feedback, -1.0f, 1.0f);
    feedback_.store(feedback);
    parametersChanged_.store(true);
}

void PhaserProcessor::setMix(float mix) {
    mix = std::clamp(mix, 0.0f, 1.0f);
    mix_.store(mix);
    parametersChanged_.store(true);
}

void PhaserProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

PhaserProcessor::Parameters PhaserProcessor::getParameters() const {
    Parameters params;
    params.rate = rate_.load();
    params.depth = depth_.load();
    params.centreFrequency = centreFrequency_.load();
    params.feedback = feedback_.load();
    params.mix = mix_.load();
    params.bypass = bypass_.load();
    return params;
}

void PhaserProcessor::setParameters(const Parameters& params) {
    setRate(params.rate);
    setDepth(params.depth);
    setCentreFrequency(params.centreFrequency);
    setFeedback(params.feedback);
    setMix(params.mix);
    setBypass(params.bypass);
}

PhaserProcessor::Metering PhaserProcessor::getMetering() const {
    Metering m;
    m.inputLevel = inputLevel_.load();
    m.outputLevel = outputLevel_.load();
    m.lfoPhase = lfoPhase_.load();
    return m;
}

void PhaserProcessor::resetPeaks() {
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
}

float PhaserProcessor::calculatePeakLevel(const juce::AudioBuffer<float>& buffer) {
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        float chPeak = buffer.getMagnitude(ch, 0, buffer.getNumSamples());
        if (chPeak > peak) peak = chPeak;
    }
    return linearToDb(peak);
}

float PhaserProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

} // namespace map2
