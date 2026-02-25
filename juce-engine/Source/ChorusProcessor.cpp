/**
 * MAP2 Audio Engine - Chorus Processor Implementation
 */

#include "ChorusProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

ChorusProcessor::ChorusProcessor() {
    // Default initialization - prepare() must be called before processing
}

void ChorusProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = std::max(1, samplesPerBlock);
    numChannels_ = std::max(1, numChannels);

    // JUCE chorus keeps internal scratch state sized by ProcessSpec::maximumBlockSize.
    // Some JACK topologies can surface larger callback chunks than nominal quantum;
    // provision generously to avoid internal overrun/corruption on backend variance.
    const auto preparedBlockSize = static_cast<juce::uint32>(
        std::max(blockSize_, MAX_AUDIO_BUFFER_SIZE));

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = preparedBlockSize;
    spec.numChannels = static_cast<juce::uint32>(numChannels_);

    chorus_.prepare(spec);

    parametersChanged_.store(true);
    updateChorusParameters();

    prepared_ = true;
}

void ChorusProcessor::reset() {
    chorus_.reset();
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
    lfoPhase_.store(0.0f);
}

void ChorusProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    // Measure input
    float inputPeak = calculatePeakLevel(buffer);
    inputLevel_.store(inputPeak);

    if (bypass_.load()) {
        outputLevel_.store(inputPeak);
        return;
    }

    if (parametersChanged_.exchange(false)) {
        updateChorusParameters();
    }

    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);

    chorus_.process(context);

    // Measure output
    float outputPeak = calculatePeakLevel(buffer);
    outputLevel_.store(outputPeak);
}

void ChorusProcessor::updateChorusParameters() {
    chorus_.setRate(rate_.load());
    chorus_.setDepth(depth_.load());
    chorus_.setCentreDelay(centreDelay_.load());
    chorus_.setFeedback(feedback_.load());
    chorus_.setMix(mix_.load());
}

// Parameter setters
void ChorusProcessor::setRate(float hz) {
    hz = std::clamp(hz, 0.1f, 10.0f);
    rate_.store(hz);
    parametersChanged_.store(true);
}

void ChorusProcessor::setDepth(float depth) {
    depth = std::clamp(depth, 0.0f, 1.0f);
    depth_.store(depth);
    parametersChanged_.store(true);
}

void ChorusProcessor::setCentreDelay(float ms) {
    ms = std::clamp(ms, 1.0f, 30.0f);
    centreDelay_.store(ms);
    parametersChanged_.store(true);
}

void ChorusProcessor::setFeedback(float feedback) {
    feedback = std::clamp(feedback, -1.0f, 1.0f);
    feedback_.store(feedback);
    parametersChanged_.store(true);
}

void ChorusProcessor::setMix(float mix) {
    mix = std::clamp(mix, 0.0f, 1.0f);
    mix_.store(mix);
    parametersChanged_.store(true);
}

void ChorusProcessor::setSpread(float spread) {
    spread = std::clamp(spread, 0.0f, 1.0f);
    spread_.store(spread);
}

void ChorusProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

ChorusProcessor::Parameters ChorusProcessor::getParameters() const {
    Parameters params;
    params.rate = rate_.load();
    params.depth = depth_.load();
    params.centreDelay = centreDelay_.load();
    params.feedback = feedback_.load();
    params.mix = mix_.load();
    params.spread = spread_.load();
    params.bypass = bypass_.load();
    return params;
}

void ChorusProcessor::setParameters(const Parameters& params) {
    setRate(params.rate);
    setDepth(params.depth);
    setCentreDelay(params.centreDelay);
    setFeedback(params.feedback);
    setMix(params.mix);
    setSpread(params.spread);
    setBypass(params.bypass);
}

ChorusProcessor::Metering ChorusProcessor::getMetering() const {
    Metering m;
    m.inputLevel = inputLevel_.load();
    m.outputLevel = outputLevel_.load();
    m.lfoPhase = lfoPhase_.load();
    return m;
}

void ChorusProcessor::resetPeaks() {
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
}

float ChorusProcessor::calculatePeakLevel(const juce::AudioBuffer<float>& buffer) {
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        float chPeak = buffer.getMagnitude(ch, 0, buffer.getNumSamples());
        if (chPeak > peak) peak = chPeak;
    }
    return linearToDb(peak);
}

float ChorusProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

} // namespace map2
