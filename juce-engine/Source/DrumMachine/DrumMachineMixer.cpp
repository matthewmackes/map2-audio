#include "DrumMachine/DrumMachineMixer.h"

#include <algorithm>
#include <cmath>

namespace map2::drummachine {

namespace {

float computePeak(const juce::AudioBuffer<float>& buffer, int channel) {
    if (channel < 0 || channel >= buffer.getNumChannels() || buffer.getNumSamples() <= 0) {
        return 0.0f;
    }
    return buffer.getMagnitude(channel, 0, buffer.getNumSamples());
}

float computeRms(const juce::AudioBuffer<float>& buffer, int channel) {
    if (channel < 0 || channel >= buffer.getNumChannels() || buffer.getNumSamples() <= 0) {
        return 0.0f;
    }
    return buffer.getRMSLevel(channel, 0, buffer.getNumSamples());
}

}  // namespace

DrumMachineMixer::DrumMachineMixer() {
    for (int busIndex = 0; busIndex < kBusCount; ++busIndex) {
        refreshBusEq(busIndex);
        refreshBusComp(busIndex);
    }
}

void DrumMachineMixer::prepare(double sampleRate, int samplesPerBlock) {
    sampleRate_ = std::max(1.0, sampleRate);
    samplesPerBlock_ = std::max(1, samplesPerBlock);
    scratchBuffer_.setSize(2, samplesPerBlock_, false, false, true);
    masterBuffer_.setSize(2, samplesPerBlock_, false, false, true);
    reverbSendBuffer_.setSize(2, samplesPerBlock_, false, false, true);
    scratchBuffer_.clear();
    masterBuffer_.clear();
    reverbSendBuffer_.clear();

    const juce::dsp::ProcessSpec spec{
        sampleRate_,
        static_cast<juce::uint32>(samplesPerBlock_),
        2,
    };

    for (int busIndex = 0; busIndex < kBusCount; ++busIndex) {
        auto& bus = buses_[static_cast<size_t>(busIndex)];
        bus.lowShelf.prepare(spec);
        bus.midPeak.prepare(spec);
        bus.highShelf.prepare(spec);
        bus.compressor.prepare(spec);
        refreshBusEq(busIndex);
        refreshBusComp(busIndex);
    }

    masterFx_.prepare(sampleRate_, samplesPerBlock_);

    prepared_ = true;
}

void DrumMachineMixer::resetProcessDiagnostics() {
    scratchBufferResizeCount_.store(0, std::memory_order_relaxed);
    masterFx_.resetProcessDiagnostics();
}

void DrumMachineMixer::process(const juce::AudioBuffer<float>& busInput, juce::AudioBuffer<float>& outputBuffer) {
    if (!prepared_ || outputBuffer.getNumChannels() < 2 || outputBuffer.getNumSamples() <= 0) {
        return;
    }

    outputBuffer.clear();
    if (masterBuffer_.getNumSamples() < outputBuffer.getNumSamples()) {
        scratchBufferResizeCount_.fetch_add(1, std::memory_order_relaxed);
    }
    masterBuffer_.setSize(2, outputBuffer.getNumSamples(), false, false, true);
    reverbSendBuffer_.setSize(2, outputBuffer.getNumSamples(), false, false, true);
    masterBuffer_.clear();
    reverbSendBuffer_.clear();

    const bool soloActive = std::any_of(
        buses_.begin(),
        buses_.end(),
        [](const BusState& bus) { return bus.output.solo; });

    const int numSamples = std::min(busInput.getNumSamples(), outputBuffer.getNumSamples());
    const int maxOutputPair = std::max(0, (outputBuffer.getNumChannels() / 2) - 1);
    for (int busIndex = 0; busIndex < kBusCount; ++busIndex) {
        const int leftChannel = busIndex * 2;
        const int rightChannel = leftChannel + 1;
        if (rightChannel >= busInput.getNumChannels() || numSamples <= 0) {
            busPeak_[static_cast<size_t>(busIndex)] = 0.0f;
            busRms_[static_cast<size_t>(busIndex)] = 0.0f;
            continue;
        }

        if (scratchBuffer_.getNumSamples() < numSamples || scratchBuffer_.getNumChannels() < 2) {
            scratchBufferResizeCount_.fetch_add(1, std::memory_order_relaxed);
        }
        scratchBuffer_.setSize(2, numSamples, false, false, true);
        scratchBuffer_.copyFrom(0, 0, busInput, leftChannel, 0, numSamples);
        scratchBuffer_.copyFrom(1, 0, busInput, rightChannel, 0, numSamples);

        auto& bus = buses_[static_cast<size_t>(busIndex)];
        juce::dsp::AudioBlock<float> block(scratchBuffer_);
        juce::dsp::ProcessContextReplacing<float> context(block);
        bus.lowShelf.process(context);
        bus.midPeak.process(context);
        bus.highShelf.process(context);
        bus.compressor.process(context);
        scratchBuffer_.applyGain(juce::Decibels::decibelsToGain(bus.comp.makeupGainDb));

        busPeak_[static_cast<size_t>(busIndex)] = std::max(
            computePeak(scratchBuffer_, 0),
            computePeak(scratchBuffer_, 1));
        busRms_[static_cast<size_t>(busIndex)] = 0.5f * (
            computeRms(scratchBuffer_, 0) + computeRms(scratchBuffer_, 1));

        if (bus.output.mute || (soloActive && !bus.output.solo)) {
            continue;
        }

        const float panNorm = (clampPan(bus.output.pan) + 1.0f) * 0.5f;
        const float level = clampLevel(bus.output.level);
        const float leftGain = std::cos(panNorm * juce::MathConstants<float>::halfPi) * level;
        const float rightGain = std::sin(panNorm * juce::MathConstants<float>::halfPi) * level;
        const int outputPair = std::clamp(bus.output.outputPair, 0, maxOutputPair);
        const int outputLeftChannel = outputPair * 2;
        const int outputRightChannel = outputLeftChannel + 1;

        outputBuffer.addFrom(outputLeftChannel, 0, scratchBuffer_, 0, 0, numSamples, leftGain);
        if (outputRightChannel < outputBuffer.getNumChannels()) {
            outputBuffer.addFrom(outputRightChannel, 0, scratchBuffer_, 1, 0, numSamples, rightGain);
        } else {
            outputBuffer.addFrom(outputLeftChannel, 0, scratchBuffer_, 1, 0, numSamples, rightGain);
        }

        const float sendGain = clampLevel(bus.output.reverbSend);
        if (sendGain > 0.0f) {
            reverbSendBuffer_.addFrom(0, 0, scratchBuffer_, 0, 0, numSamples, sendGain);
            reverbSendBuffer_.addFrom(1, 0, scratchBuffer_, 1, 0, numSamples, sendGain);
        }
    }

    if (numSamples > 0 && outputBuffer.getNumChannels() >= 2) {
        masterBuffer_.copyFrom(0, 0, outputBuffer, 0, 0, numSamples);
        masterBuffer_.copyFrom(1, 0, outputBuffer, 1, 0, numSamples);
        masterFx_.process(masterBuffer_, reverbSendBuffer_);
        outputBuffer.copyFrom(0, 0, masterBuffer_, 0, 0, numSamples);
        outputBuffer.copyFrom(1, 0, masterBuffer_, 1, 0, numSamples);
    }

    const float masterGain = clampLevel(masterVolume_.load(std::memory_order_relaxed));
    for (int channel = 0; channel < outputBuffer.getNumChannels(); ++channel) {
        outputBuffer.applyGain(channel, 0, numSamples, masterGain);
    }

    masterPeakLeft_.store(computePeak(outputBuffer, 0), std::memory_order_relaxed);
    masterPeakRight_.store(computePeak(outputBuffer, 1), std::memory_order_relaxed);
    masterRmsLeft_.store(computeRms(outputBuffer, 0), std::memory_order_relaxed);
    masterRmsRight_.store(computeRms(outputBuffer, 1), std::memory_order_relaxed);
}

bool DrumMachineMixer::setBusEq(int busIndex, const BusEqConfig& config) {
    if (!isValidBusIndex(busIndex)) {
        return false;
    }

    auto& eq = buses_[static_cast<size_t>(busIndex)].eq;
    eq.lowGainDb = std::clamp(config.lowGainDb, -24.0f, 24.0f);
    eq.midGainDb = std::clamp(config.midGainDb, -24.0f, 24.0f);
    eq.midFrequencyHz = std::clamp(config.midFrequencyHz, 40.0f, 16000.0f);
    eq.highGainDb = std::clamp(config.highGainDb, -24.0f, 24.0f);
    refreshBusEq(busIndex);
    return true;
}

bool DrumMachineMixer::setBusComp(int busIndex, const BusCompConfig& config) {
    if (!isValidBusIndex(busIndex)) {
        return false;
    }

    auto& comp = buses_[static_cast<size_t>(busIndex)].comp;
    comp.thresholdDb = std::clamp(config.thresholdDb, -60.0f, 0.0f);
    comp.ratio = std::clamp(config.ratio, 1.0f, 20.0f);
    comp.attackMs = std::clamp(config.attackMs, 0.1f, 200.0f);
    comp.releaseMs = std::clamp(config.releaseMs, 5.0f, 1000.0f);
    comp.makeupGainDb = std::clamp(config.makeupGainDb, -24.0f, 24.0f);
    refreshBusComp(busIndex);
    return true;
}

bool DrumMachineMixer::setBusOutput(int busIndex, const BusOutputConfig& config) {
    if (!isValidBusIndex(busIndex)) {
        return false;
    }

    auto& output = buses_[static_cast<size_t>(busIndex)].output;
    output.level = clampLevel(config.level);
    output.pan = clampPan(config.pan);
    output.mute = config.mute;
    output.solo = config.solo;
    output.outputPair = std::max(0, config.outputPair);
    output.reverbSend = clampLevel(config.reverbSend);
    return true;
}

bool DrumMachineMixer::setBusLevel(int busIndex, float level) {
    auto output = getBusOutput(busIndex);
    output.level = level;
    return setBusOutput(busIndex, output);
}

bool DrumMachineMixer::setBusPan(int busIndex, float pan) {
    auto output = getBusOutput(busIndex);
    output.pan = pan;
    return setBusOutput(busIndex, output);
}

bool DrumMachineMixer::setBusMute(int busIndex, bool mute) {
    auto output = getBusOutput(busIndex);
    output.mute = mute;
    return setBusOutput(busIndex, output);
}

bool DrumMachineMixer::setBusSolo(int busIndex, bool solo) {
    auto output = getBusOutput(busIndex);
    output.solo = solo;
    return setBusOutput(busIndex, output);
}

bool DrumMachineMixer::setBusOutputPair(int busIndex, int outputPair) {
    auto output = getBusOutput(busIndex);
    output.outputPair = outputPair;
    return setBusOutput(busIndex, output);
}

bool DrumMachineMixer::setBusReverbSend(int busIndex, float reverbSend) {
    auto output = getBusOutput(busIndex);
    output.reverbSend = reverbSend;
    return setBusOutput(busIndex, output);
}

DrumMachineMixer::BusEqConfig DrumMachineMixer::getBusEq(int busIndex) const {
    if (!isValidBusIndex(busIndex)) {
        return {};
    }
    return buses_[static_cast<size_t>(busIndex)].eq;
}

DrumMachineMixer::BusCompConfig DrumMachineMixer::getBusComp(int busIndex) const {
    if (!isValidBusIndex(busIndex)) {
        return {};
    }
    return buses_[static_cast<size_t>(busIndex)].comp;
}

DrumMachineMixer::BusOutputConfig DrumMachineMixer::getBusOutput(int busIndex) const {
    if (!isValidBusIndex(busIndex)) {
        return {};
    }
    return buses_[static_cast<size_t>(busIndex)].output;
}

void DrumMachineMixer::setMasterFx(const MasterFxConfig& config) {
    masterFx_.setConfig(config);
}

DrumMachineMixer::MasterFxConfig DrumMachineMixer::getMasterFx() const {
    return masterFx_.getConfig();
}

void DrumMachineMixer::setMasterVolume(float volume) {
    masterVolume_.store(clampLevel(volume), std::memory_order_relaxed);
}

float DrumMachineMixer::getMasterVolume() const {
    return masterVolume_.load(std::memory_order_relaxed);
}

DrumMachineMixer::Metering DrumMachineMixer::getMetering() const {
    Metering metering;
    metering.busPeak = busPeak_;
    metering.busRms = busRms_;
    metering.masterPeakLeft = masterPeakLeft_.load(std::memory_order_relaxed);
    metering.masterPeakRight = masterPeakRight_.load(std::memory_order_relaxed);
    metering.masterRmsLeft = masterRmsLeft_.load(std::memory_order_relaxed);
    metering.masterRmsRight = masterRmsRight_.load(std::memory_order_relaxed);
    return metering;
}

bool DrumMachineMixer::isValidBusIndex(int busIndex) {
    return busIndex >= 0 && busIndex < kBusCount;
}

float DrumMachineMixer::clampLevel(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

float DrumMachineMixer::clampPan(float value) {
    return std::clamp(value, -1.0f, 1.0f);
}

void DrumMachineMixer::refreshBusEq(int busIndex) {
    if (!isValidBusIndex(busIndex)) {
        return;
    }

    auto& bus = buses_[static_cast<size_t>(busIndex)];
    *bus.lowShelf.state = *juce::dsp::IIR::Coefficients<float>::makeLowShelf(
        sampleRate_, 120.0, 0.7071f, juce::Decibels::decibelsToGain(bus.eq.lowGainDb));
    *bus.midPeak.state = *juce::dsp::IIR::Coefficients<float>::makePeakFilter(
        sampleRate_, bus.eq.midFrequencyHz, 0.7071f, juce::Decibels::decibelsToGain(bus.eq.midGainDb));
    *bus.highShelf.state = *juce::dsp::IIR::Coefficients<float>::makeHighShelf(
        sampleRate_, 6000.0, 0.7071f, juce::Decibels::decibelsToGain(bus.eq.highGainDb));
}

void DrumMachineMixer::refreshBusComp(int busIndex) {
    if (!isValidBusIndex(busIndex)) {
        return;
    }

    auto& bus = buses_[static_cast<size_t>(busIndex)];
    bus.compressor.setThreshold(bus.comp.thresholdDb);
    bus.compressor.setRatio(bus.comp.ratio);
    bus.compressor.setAttack(bus.comp.attackMs);
    bus.compressor.setRelease(bus.comp.releaseMs);
}

}  // namespace map2::drummachine
