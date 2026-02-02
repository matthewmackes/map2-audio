/**
 * MAP2 Audio Engine - Dynamics Processor Implementation
 */

#include "DynamicsProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

DynamicsProcessor::DynamicsProcessor() {
    // Default initialization - prepare() must be called before processing
}

void DynamicsProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = static_cast<juce::uint32>(numChannels);

    // Prepare all processors
    compressor_.prepare(spec);
    limiter_.prepare(spec);
    noiseGate_.prepare(spec);
    makeupGainProcessor_.prepare(spec);

    // Set initial parameters
    parametersChanged_.store(true);
    updateProcessorParameters();

    prepared_ = true;
}

void DynamicsProcessor::reset() {
    compressor_.reset();
    limiter_.reset();
    noiseGate_.reset();
    makeupGainProcessor_.reset();

    // Reset metering
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
    gainReduction_.store(0.0f);
    inputRms_.store(-100.0f);
    outputRms_.store(-100.0f);
}

void DynamicsProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    // Check bypass
    if (bypass_.load()) {
        // Still update input metering even when bypassed
        inputLevel_.store(calculatePeakLevel(buffer));
        inputRms_.store(calculateRmsLevel(buffer));
        outputLevel_.store(inputLevel_.load());
        outputRms_.store(inputRms_.load());
        gainReduction_.store(0.0f);
        return;
    }

    // Update parameters if changed
    if (parametersChanged_.exchange(false)) {
        updateProcessorParameters();
    }

    // Measure input level
    float inputPeak = calculatePeakLevel(buffer);
    float inputRmsVal = calculateRmsLevel(buffer);
    inputLevel_.store(inputPeak);
    inputRms_.store(inputRmsVal);

    // Create processing context
    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);

    // Store pre-processing level for GR calculation
    float preLevel = inputPeak;

    // Process based on mode
    Mode currentMode = mode_.load();
    switch (currentMode) {
        case Mode::Compressor:
            compressor_.process(context);
            break;

        case Mode::Limiter:
            limiter_.process(context);
            break;

        case Mode::NoiseGate:
            noiseGate_.process(context);
            break;
    }

    // Apply makeup gain
    float makeup = makeupGain_.load();
    if (autoMakeup_.load()) {
        makeup += calculateAutoMakeupGain();
    }
    if (std::abs(makeup) > 0.01f) {
        makeupGainProcessor_.setGainDecibels(makeup);
        makeupGainProcessor_.process(context);
    }

    // Measure output level
    float outputPeak = calculatePeakLevel(buffer);
    float outputRmsVal = calculateRmsLevel(buffer);
    outputLevel_.store(outputPeak);
    outputRms_.store(outputRmsVal);

    // Calculate gain reduction (positive value = reduction)
    // For compressor/limiter: GR = input - output (approximately)
    // For gate: GR shown as reduction amount
    float gr = preLevel - outputPeak;
    if (gr < 0.0f) gr = 0.0f;  // Don't show negative GR
    gainReduction_.store(gr);
}

void DynamicsProcessor::updateProcessorParameters() {
    float thresh = threshold_.load();
    float rat = ratio_.load();
    float att = attack_.load();
    float rel = release_.load();

    Mode currentMode = mode_.load();

    switch (currentMode) {
        case Mode::Compressor:
            compressor_.setThreshold(thresh);
            compressor_.setRatio(rat);
            compressor_.setAttack(att);
            compressor_.setRelease(rel);
            break;

        case Mode::Limiter:
            limiter_.setThreshold(thresh);
            limiter_.setRelease(rel);
            break;

        case Mode::NoiseGate:
            noiseGate_.setThreshold(thresh);
            noiseGate_.setRatio(rat);
            noiseGate_.setAttack(att);
            noiseGate_.setRelease(rel);
            break;
    }
}

float DynamicsProcessor::calculateAutoMakeupGain() const {
    // Simple auto-makeup: compensate based on threshold and ratio
    // This is an approximation - real auto-makeup would need to track actual GR
    float thresh = threshold_.load();
    float rat = ratio_.load();

    if (rat <= 1.0f) return 0.0f;

    // Estimate makeup needed for -20dBFS input signal
    float inputLevel = -20.0f;
    if (inputLevel > thresh) {
        float excess = inputLevel - thresh;
        float reduction = excess - (excess / rat);
        return reduction * 0.7f;  // Apply 70% of calculated makeup
    }
    return 0.0f;
}

// Parameter setters with change flag
void DynamicsProcessor::setThreshold(float dB) {
    dB = std::clamp(dB, -60.0f, 0.0f);
    threshold_.store(dB);
    parametersChanged_.store(true);
}

void DynamicsProcessor::setRatio(float ratio) {
    ratio = std::clamp(ratio, 1.0f, 100.0f);
    ratio_.store(ratio);
    parametersChanged_.store(true);
}

void DynamicsProcessor::setAttack(float ms) {
    ms = std::clamp(ms, 0.1f, 500.0f);
    attack_.store(ms);
    parametersChanged_.store(true);
}

void DynamicsProcessor::setRelease(float ms) {
    ms = std::clamp(ms, 10.0f, 5000.0f);
    release_.store(ms);
    parametersChanged_.store(true);
}

void DynamicsProcessor::setKnee(float dB) {
    dB = std::clamp(dB, 0.0f, 24.0f);
    knee_.store(dB);
    parametersChanged_.store(true);
}

void DynamicsProcessor::setMakeupGain(float dB) {
    dB = std::clamp(dB, -12.0f, 24.0f);
    makeupGain_.store(dB);
}

void DynamicsProcessor::setAutoMakeup(bool enabled) {
    autoMakeup_.store(enabled);
}

void DynamicsProcessor::setMode(Mode mode) {
    mode_.store(mode);
    parametersChanged_.store(true);
    reset();  // Reset state when changing modes
}

void DynamicsProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

DynamicsProcessor::Parameters DynamicsProcessor::getParameters() const {
    Parameters params;
    params.threshold = threshold_.load();
    params.ratio = ratio_.load();
    params.attack = attack_.load();
    params.release = release_.load();
    params.knee = knee_.load();
    params.makeupGain = makeupGain_.load();
    params.autoMakeup = autoMakeup_.load();
    params.mode = mode_.load();
    params.bypass = bypass_.load();
    return params;
}

void DynamicsProcessor::setParameters(const Parameters& params) {
    setThreshold(params.threshold);
    setRatio(params.ratio);
    setAttack(params.attack);
    setRelease(params.release);
    setKnee(params.knee);
    setMakeupGain(params.makeupGain);
    setAutoMakeup(params.autoMakeup);
    setMode(params.mode);
    setBypass(params.bypass);
}

DynamicsProcessor::Metering DynamicsProcessor::getMetering() const {
    Metering m;
    m.inputLevel = inputLevel_.load();
    m.outputLevel = outputLevel_.load();
    m.gainReduction = gainReduction_.load();
    m.inputRms = inputRms_.load();
    m.outputRms = outputRms_.load();
    return m;
}

void DynamicsProcessor::resetPeaks() {
    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
    inputRms_.store(-100.0f);
    outputRms_.store(-100.0f);
}

// Static helper methods
float DynamicsProcessor::calculatePeakLevel(const juce::AudioBuffer<float>& buffer) {
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        float chPeak = buffer.getMagnitude(ch, 0, buffer.getNumSamples());
        if (chPeak > peak) peak = chPeak;
    }
    return linearToDb(peak);
}

float DynamicsProcessor::calculateRmsLevel(const juce::AudioBuffer<float>& buffer) {
    float sumSquares = 0.0f;
    int totalSamples = 0;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i) {
            sumSquares += data[i] * data[i];
        }
        totalSamples += buffer.getNumSamples();
    }

    if (totalSamples == 0) return -100.0f;

    float rms = std::sqrt(sumSquares / static_cast<float>(totalSamples));
    return linearToDb(rms);
}

float DynamicsProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float DynamicsProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

} // namespace map2
