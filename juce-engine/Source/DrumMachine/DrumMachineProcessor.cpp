#include "DrumMachine/DrumMachineProcessor.h"

#include <algorithm>
#include <cmath>

namespace map2::drummachine {

namespace {

constexpr std::array<int, DrumMachineProcessor::kPadCount> kDefaultMidiNotes = {
    36, 38, 42, 46, 41, 43, 45, 49, 51, 57, 39, 37, 56, 47, 50, 48,
};

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

void routeMidiToPads(
    const juce::MidiBuffer& source,
    const std::array<DrumMachineProcessor::PadConfig, DrumMachineProcessor::kPadCount>& padConfigs,
    std::array<juce::MidiBuffer, DrumMachineProcessor::kPadCount>& padMidiBuffers,
    const DrumMachineProcessor& processor) {
    for (const auto metadata : source) {
        const auto message = metadata.getMessage();
        if (!message.isNoteOnOrOff()) {
            continue;
        }

        const int incomingNote = message.getNoteNumber();
        const int incomingChannel = message.getChannel();

        for (int padIndex = 0; padIndex < DrumMachineProcessor::kPadCount; ++padIndex) {
            const auto& config = padConfigs[static_cast<size_t>(padIndex)];
            if (config.midiNote != incomingNote) {
                continue;
            }
            if (config.midiChannel != 0 && config.midiChannel != incomingChannel) {
                continue;
            }

            auto routed = message;
            if (message.isNoteOn()) {
                routed = juce::MidiMessage::noteOn(
                    1,
                    config.midiNote,
                    static_cast<juce::uint8>(std::clamp(
                        static_cast<int>(std::round(processor.mapVelocityForPad(padIndex, message.getFloatVelocity()) * 127.0f)),
                        1,
                        127)));
            } else {
                routed = juce::MidiMessage::noteOff(1, config.midiNote, message.getVelocity());
            }
            padMidiBuffers[static_cast<size_t>(padIndex)].addEvent(routed, metadata.samplePosition);
        }
    }
}

}  // namespace

DrumMachineProcessor::DrumMachineProcessor() {
    for (int i = 0; i < kPadCount; ++i) {
        pads_[static_cast<size_t>(i)].setPartIndex(i);
        pads_[static_cast<size_t>(i)].setMidiChannel(1);

        padConfigs_[static_cast<size_t>(i)].midiNote = defaultMidiNoteForPad(i);
        padConfigs_[static_cast<size_t>(i)].bus = defaultBusForPad(i);
        padConfigs_[static_cast<size_t>(i)].name = defaultPadName(i);
        applyPadConfigToPart(i);
    }
}

void DrumMachineProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);
    samplesPerBlock_.store(std::max(1, samplesPerBlock), std::memory_order_relaxed);
    numChannels_.store(std::max(1, numChannels), std::memory_order_relaxed);
    busBuffer_.setSize(DrumMachineMixer::kBusChannels, std::max(1, samplesPerBlock), false, false, true);
    busBuffer_.clear();
    stereoMixBuffer_.setSize(std::max(2, numChannels), std::max(1, samplesPerBlock), false, false, true);
    stereoMixBuffer_.clear();
    mixer_.prepare(sampleRate, samplesPerBlock);

    const int reserveBytes = std::max(1024, samplesPerBlock * 12);
    for (auto& buffer : padMidiBuffers_) {
        buffer.clear();
        buffer.ensureSize(reserveBytes);
    }
    triggeredMidiBuffer_.clear();
    triggeredMidiBuffer_.ensureSize(reserveBytes);

    for (int i = 0; i < kPadCount; ++i) {
        pads_[static_cast<size_t>(i)].resetVoices();
        pads_[static_cast<size_t>(i)].prepare(sampleRate, samplesPerBlock, numChannels);
        applyPadConfigToPart(i);
    }

    prepared_.store(true, std::memory_order_release);
}

void DrumMachineProcessor::processBlock(juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midiBuffer) {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    busBuffer_.clear();
    stereoMixBuffer_.clear();

    for (auto& padBuffer : padMidiBuffers_) {
        padBuffer.clear();
    }

    routeMidiToPads(midiBuffer, padConfigs_, padMidiBuffers_, *this);
    routeMidiToPads(triggeredMidiBuffer_, padConfigs_, padMidiBuffers_, *this);
    triggeredMidiBuffer_.clear();

    bool soloActive = false;
    for (const auto& config : padConfigs_) {
        if (config.solo) {
            soloActive = true;
            break;
        }
    }

    for (int padIndex = 0; padIndex < kPadCount; ++padIndex) {
        auto& part = pads_[static_cast<size_t>(padIndex)];
        auto& padMidi = padMidiBuffers_[static_cast<size_t>(padIndex)];
        part.processMidi(padMidi);
        part.processAudio(busBuffer_, padMidi, soloActive);

        const int busBaseChannel = static_cast<int>(padConfigs_[static_cast<size_t>(padIndex)].bus) * 2;
        padPeakMeters_[static_cast<size_t>(padIndex)] = std::max(
            computePeak(busBuffer_, busBaseChannel),
            computePeak(busBuffer_, busBaseChannel + 1));
        padRmsMeters_[static_cast<size_t>(padIndex)] = 0.5f * (
            computeRms(busBuffer_, busBaseChannel) +
            computeRms(busBuffer_, busBaseChannel + 1));
    }

    mixer_.process(busBuffer_, stereoMixBuffer_);
    const int outputChannels = std::min(buffer.getNumChannels(), stereoMixBuffer_.getNumChannels());
    const int outputSamples = std::min(buffer.getNumSamples(), stereoMixBuffer_.getNumSamples());
    for (int channel = 0; channel < outputChannels; ++channel) {
        buffer.addFrom(channel, 0, stereoMixBuffer_, channel, 0, outputSamples);
    }
}

bool DrumMachineProcessor::triggerNote(int padIndex, int velocity, int sampleOffset) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    const auto& config = padConfigs_[static_cast<size_t>(padIndex)];
    const int clampedVelocity = std::clamp(velocity, 1, 127);
    const int clampedSampleOffset = std::max(0, sampleOffset);
    triggeredMidiBuffer_.addEvent(
        juce::MidiMessage::noteOn(1, config.midiNote, static_cast<juce::uint8>(clampedVelocity)),
        clampedSampleOffset);
    return true;
}

DrumMachineProcessor::PadConfig DrumMachineProcessor::getPadConfig(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        return {};
    }
    return padConfigs_[static_cast<size_t>(padIndex)];
}

bool DrumMachineProcessor::setPadConfig(int padIndex, const PadConfig& config) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    auto updated = config;
    updated.volume = std::clamp(updated.volume, 0.0f, 1.0f);
    updated.pan = std::clamp(updated.pan, -1.0f, 1.0f);
    updated.tuneSemitones = std::clamp(updated.tuneSemitones, -24.0f, 24.0f);
    updated.midiNote = std::clamp(updated.midiNote, 0, 127);
    updated.fixedVelocity = std::clamp(updated.fixedVelocity, 0.0f, 1.0f);
    updated.midiChannel = std::clamp(updated.midiChannel, 0, 16);
    if (updated.name.empty()) {
        updated.name = defaultPadName(padIndex);
    }

    padConfigs_[static_cast<size_t>(padIndex)] = updated;
    applyPadConfigToPart(padIndex);
    return true;
}

bool DrumMachineProcessor::setPadVolume(int padIndex, float volume) {
    auto config = getPadConfig(padIndex);
    config.volume = volume;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadPan(int padIndex, float pan) {
    auto config = getPadConfig(padIndex);
    config.pan = pan;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadTune(int padIndex, float semitones) {
    auto config = getPadConfig(padIndex);
    config.tuneSemitones = semitones;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadMute(int padIndex, bool mute) {
    auto config = getPadConfig(padIndex);
    config.mute = mute;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadSolo(int padIndex, bool solo) {
    auto config = getPadConfig(padIndex);
    config.solo = solo;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadMidiNote(int padIndex, int midiNote) {
    auto config = getPadConfig(padIndex);
    config.midiNote = midiNote;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadVelocityCurve(int padIndex, VelocityCurve curve, float fixedVelocity) {
    auto config = getPadConfig(padIndex);
    config.velocityCurve = curve;
    config.fixedVelocity = fixedVelocity;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadMidiChannel(int padIndex, int midiChannel) {
    auto config = getPadConfig(padIndex);
    config.midiChannel = midiChannel;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::loadPadSfz(int padIndex, const std::string& sfzPath) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }
    return pads_[static_cast<size_t>(padIndex)].loadSfz(sfzPath);
}

bool DrumMachineProcessor::loadKitSfz(const std::string& sfzPath) {
    bool loadedAny = false;
    for (int padIndex = 0; padIndex < kPadCount; ++padIndex) {
        loadedAny = loadPadSfz(padIndex, sfzPath) || loadedAny;
    }
    return loadedAny;
}

synthforge::SampleLoadStatus DrumMachineProcessor::getPadSampleStatus(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        synthforge::SampleLoadStatus status;
        status.partIndex = padIndex;
        status.lastError = "pad_index must be in range 0..15";
        return status;
    }
    return pads_[static_cast<size_t>(padIndex)].getSampleStatus();
}

std::array<synthforge::SampleLoadStatus, DrumMachineProcessor::kPadCount> DrumMachineProcessor::getKitSampleStatus() const {
    std::array<synthforge::SampleLoadStatus, kPadCount> statuses{};
    for (int padIndex = 0; padIndex < kPadCount; ++padIndex) {
        statuses[static_cast<size_t>(padIndex)] = getPadSampleStatus(padIndex);
    }
    return statuses;
}

int DrumMachineProcessor::getPadActiveVoices(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        return 0;
    }
    return pads_[static_cast<size_t>(padIndex)].getActiveVoices();
}

float DrumMachineProcessor::mapVelocityForPad(int padIndex, float rawVelocity) const {
    if (!isValidPadIndex(padIndex)) {
        return clampVelocity(rawVelocity);
    }

    const auto& config = padConfigs_[static_cast<size_t>(padIndex)];
    return applyVelocityCurve(config.velocityCurve, rawVelocity, config.fixedVelocity);
}

bool DrumMachineProcessor::setBusEq(int busIndex, const DrumMachineMixer::BusEqConfig& config) {
    return mixer_.setBusEq(busIndex, config);
}

bool DrumMachineProcessor::setBusComp(int busIndex, const DrumMachineMixer::BusCompConfig& config) {
    return mixer_.setBusComp(busIndex, config);
}

bool DrumMachineProcessor::setBusLevel(int busIndex, float level) {
    return mixer_.setBusLevel(busIndex, level);
}

bool DrumMachineProcessor::setBusMute(int busIndex, bool mute) {
    return mixer_.setBusMute(busIndex, mute);
}

bool DrumMachineProcessor::setBusSolo(int busIndex, bool solo) {
    return mixer_.setBusSolo(busIndex, solo);
}

void DrumMachineProcessor::setMasterVolume(float volume) {
    mixer_.setMasterVolume(volume);
}

float DrumMachineProcessor::getMasterVolume() const {
    return mixer_.getMasterVolume();
}

DrumMachineProcessor::Metering DrumMachineProcessor::getMetering() const {
    Metering metering;
    metering.perPadPeak = padPeakMeters_;
    metering.perPadRms = padRmsMeters_;
    const auto mixerMetering = mixer_.getMetering();
    metering.perBusPeak = mixerMetering.busPeak;
    metering.perBusRms = mixerMetering.busRms;
    metering.masterPeakLeft = mixerMetering.masterPeakLeft;
    metering.masterPeakRight = mixerMetering.masterPeakRight;
    metering.masterRmsLeft = mixerMetering.masterRmsLeft;
    metering.masterRmsRight = mixerMetering.masterRmsRight;
    return metering;
}

DrumMachineProcessor::BusId DrumMachineProcessor::defaultBusForPad(int padIndex) {
    if (padIndex <= 0) return BusId::Kick;
    if (padIndex == 1) return BusId::Snare;
    if (padIndex <= 3) return BusId::HiHat;
    if (padIndex <= 6) return BusId::Toms;
    if (padIndex <= 9) return BusId::Cymbals;
    if (padIndex <= 12) return BusId::Percussion;
    if (padIndex == 13) return BusId::Overhead;
    return BusId::Room;
}

int DrumMachineProcessor::defaultMidiNoteForPad(int padIndex) {
    if (!isValidPadIndex(padIndex)) {
        return kDefaultMidiNotes.front();
    }
    return kDefaultMidiNotes[static_cast<size_t>(padIndex)];
}

bool DrumMachineProcessor::isValidPadIndex(int padIndex) {
    return padIndex >= 0 && padIndex < kPadCount;
}

float DrumMachineProcessor::clampVelocity(float rawVelocity) {
    return std::clamp(rawVelocity, 0.0f, 1.0f);
}

float DrumMachineProcessor::applyVelocityCurve(VelocityCurve curve, float rawVelocity, float fixedVelocity) {
    const float velocity = clampVelocity(rawVelocity);
    switch (curve) {
        case VelocityCurve::Logarithmic:
            return std::sqrt(velocity);
        case VelocityCurve::Exponential:
            return velocity * velocity;
        case VelocityCurve::SCurve:
            return velocity * velocity * (3.0f - (2.0f * velocity));
        case VelocityCurve::Fixed:
            return std::clamp(fixedVelocity, 0.0f, 1.0f);
        case VelocityCurve::Linear:
        default:
            return velocity;
    }
}

std::string DrumMachineProcessor::defaultPadName(int padIndex) {
    return "Pad " + std::to_string(std::clamp(padIndex, 0, kPadCount - 1) + 1);
}

void DrumMachineProcessor::applyPadConfigToPart(int padIndex) {
    auto& part = pads_[static_cast<size_t>(padIndex)];
    const auto& config = padConfigs_[static_cast<size_t>(padIndex)];

    auto partConfig = part.getConfig();
    partConfig.partIndex = padIndex;
    partConfig.midiChannel = 1;
    partConfig.outputBus = static_cast<synthforge::OutputBus>(static_cast<int>(config.bus));
    partConfig.level = std::clamp(config.volume, 0.0f, 1.0f);
    partConfig.pan = std::clamp(config.pan, -1.0f, 1.0f);
    partConfig.mute = config.mute;
    partConfig.solo = config.solo;
    part.setConfig(partConfig);
    part.setParameter("global.transpose", std::clamp(config.tuneSemitones, -24.0f, 24.0f));
}

}  // namespace map2::drummachine
