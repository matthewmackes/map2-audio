#include "DrumMachine/DrumMachineProcessor.h"

#include <algorithm>
#include <cmath>

namespace map2::drummachine {

namespace {

constexpr std::array<int, DrumMachineProcessor::kPadCount> kDefaultMidiNotes = {
    36, 38, 42, 46, 41, 43, 45, 49, 51, 57, 39, 37, 56, 47, 50, 48,
};

struct PresetZoneDefinition {
    int padIndex;
    DrumMachineProcessor::PadZoneKind kind;
    int triggerNote;
    int keySwitchNote;
    float velocityScale;
};

struct PresetDefinition {
    const char* name;
    std::vector<PresetZoneDefinition> zones;
};

DrumMachineProcessor::PadZoneConfig makeZoneConfig(DrumMachineProcessor::PadZoneKind kind) {
    DrumMachineProcessor::PadZoneConfig config;
    config.kind = kind;
    return config;
}

const std::vector<PresetDefinition>& drumMidiPresets() {
    static const std::vector<PresetDefinition> presets = {
        {"Roland PD-140DS / CY-18DR / VH-14D",
         {
             {1, DrumMachineProcessor::PadZoneKind::Head, 38, -1, 1.0f},
             {1, DrumMachineProcessor::PadZoneKind::Rim, 40, 36, 0.92f},
             {1, DrumMachineProcessor::PadZoneKind::Edge, 37, 37, 0.85f},
             {2, DrumMachineProcessor::PadZoneKind::Head, 42, -1, 1.0f},
             {2, DrumMachineProcessor::PadZoneKind::Edge, 26, 42, 0.95f},
             {3, DrumMachineProcessor::PadZoneKind::Head, 46, -1, 1.0f},
             {3, DrumMachineProcessor::PadZoneKind::Edge, 23, 46, 0.93f},
             {8, DrumMachineProcessor::PadZoneKind::Head, 51, -1, 1.0f},
             {8, DrumMachineProcessor::PadZoneKind::Edge, 59, 51, 0.97f},
         }},
        {"Yamaha DTX Multi-Zone",
         {
             {1, DrumMachineProcessor::PadZoneKind::Head, 38, -1, 1.0f},
             {1, DrumMachineProcessor::PadZoneKind::Rim, 37, 38, 0.88f},
             {2, DrumMachineProcessor::PadZoneKind::Head, 42, -1, 1.0f},
             {2, DrumMachineProcessor::PadZoneKind::Edge, 22, 42, 0.92f},
             {3, DrumMachineProcessor::PadZoneKind::Head, 46, -1, 1.0f},
             {3, DrumMachineProcessor::PadZoneKind::Edge, 26, 46, 0.95f},
         }},
        {"Alesis Surge / Strike",
         {
             {1, DrumMachineProcessor::PadZoneKind::Head, 38, -1, 1.0f},
             {1, DrumMachineProcessor::PadZoneKind::Rim, 40, 38, 0.9f},
             {2, DrumMachineProcessor::PadZoneKind::Head, 42, -1, 1.0f},
             {2, DrumMachineProcessor::PadZoneKind::Edge, 23, 42, 0.94f},
             {8, DrumMachineProcessor::PadZoneKind::Head, 51, -1, 1.0f},
             {8, DrumMachineProcessor::PadZoneKind::Edge, 59, 51, 0.96f},
         }},
        {"ATV aDrums",
         {
             {1, DrumMachineProcessor::PadZoneKind::Head, 38, -1, 1.0f},
             {1, DrumMachineProcessor::PadZoneKind::Rim, 40, 36, 0.9f},
             {2, DrumMachineProcessor::PadZoneKind::Head, 42, -1, 1.0f},
             {2, DrumMachineProcessor::PadZoneKind::Edge, 22, 42, 0.92f},
             {3, DrumMachineProcessor::PadZoneKind::Head, 46, -1, 1.0f},
             {3, DrumMachineProcessor::PadZoneKind::Edge, 26, 46, 0.95f},
             {8, DrumMachineProcessor::PadZoneKind::Head, 51, -1, 1.0f},
             {8, DrumMachineProcessor::PadZoneKind::Edge, 59, 51, 0.97f},
         }},
        {"2Box Universal",
         {
             {1, DrumMachineProcessor::PadZoneKind::Head, 38, -1, 1.0f},
             {1, DrumMachineProcessor::PadZoneKind::Rim, 40, 38, 0.91f},
             {2, DrumMachineProcessor::PadZoneKind::Head, 42, -1, 1.0f},
             {2, DrumMachineProcessor::PadZoneKind::Edge, 26, 42, 0.93f},
             {7, DrumMachineProcessor::PadZoneKind::Head, 49, -1, 1.0f},
             {7, DrumMachineProcessor::PadZoneKind::Edge, 55, 49, 0.95f},
         }},
    };
    return presets;
}

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
    const std::array<std::array<DrumMachineProcessor::PadZoneConfig, 3>, DrumMachineProcessor::kPadCount>& padZones,
    const std::array<int, 128>& noteToPad,
    const std::array<int, 128>& noteToZone,
    int globalMidiChannel,
    std::array<juce::MidiBuffer, DrumMachineProcessor::kPadCount>& padMidiBuffers,
    DrumMachineProcessor& processor) {
    for (const auto metadata : source) {
        const auto message = metadata.getMessage();
        if (!message.isNoteOnOrOff()) {
            continue;
        }

        const int incomingNote = message.getNoteNumber();
        const int incomingChannel = message.getChannel();
        if (globalMidiChannel != 0 && globalMidiChannel != incomingChannel) {
            continue;
        }

        const int padIndex = (incomingNote >= 0 && incomingNote < static_cast<int>(noteToPad.size()))
            ? noteToPad[static_cast<size_t>(incomingNote)]
            : -1;
        if (padIndex < 0 || padIndex >= DrumMachineProcessor::kPadCount) {
            continue;
        }

        const auto& config = padConfigs[static_cast<size_t>(padIndex)];
        if (config.midiChannel != 0 && config.midiChannel != incomingChannel) {
            continue;
        }

        const int zoneSlot = (incomingNote >= 0 && incomingNote < static_cast<int>(noteToZone.size()))
            ? noteToZone[static_cast<size_t>(incomingNote)]
            : -1;
        const DrumMachineProcessor::PadZoneConfig* zoneConfig = nullptr;
        if (zoneSlot >= 0 && zoneSlot < 3) {
            const auto& candidate = padZones[static_cast<size_t>(padIndex)][static_cast<size_t>(zoneSlot)];
            if (candidate.enabled && candidate.triggerNote == incomingNote) {
                zoneConfig = &candidate;
            }
        }

        auto routed = message;
        if (message.isNoteOn()) {
            const float mappedVelocity = processor.mapVelocityForPad(padIndex, message.getFloatVelocity());
            const float scaledVelocity = std::clamp(
                mappedVelocity * (zoneConfig != nullptr ? zoneConfig->velocityScale : 1.0f),
                0.0f,
                1.0f);
            processor.setLastMappedVelocityForPad(padIndex, scaledVelocity);
            if (zoneConfig != nullptr && zoneConfig->keySwitchNote >= 0) {
                padMidiBuffers[static_cast<size_t>(padIndex)].addEvent(
                    juce::MidiMessage::noteOn(
                        1,
                        zoneConfig->keySwitchNote,
                        static_cast<juce::uint8>(127)),
                    metadata.samplePosition);
            }
            routed = juce::MidiMessage::noteOn(
                1,
                config.midiNote,
                static_cast<juce::uint8>(std::clamp(
                    static_cast<int>(std::round(scaledVelocity * 127.0f)),
                    1,
                    127)));
        } else {
            routed = juce::MidiMessage::noteOff(1, config.midiNote, message.getVelocity());
        }
        padMidiBuffers[static_cast<size_t>(padIndex)].addEvent(routed, metadata.samplePosition);
        if (message.isNoteOff() && zoneConfig != nullptr && zoneConfig->keySwitchNote >= 0) {
            padMidiBuffers[static_cast<size_t>(padIndex)].addEvent(
                juce::MidiMessage::noteOff(1, zoneConfig->keySwitchNote, message.getVelocity()),
                metadata.samplePosition);
        }
    }
}

}  // namespace

DrumMachineProcessor::DrumMachineProcessor() {
    noteToPad_.fill(-1);
    noteToZone_.fill(-1);
    for (int i = 0; i < kPadCount; ++i) {
        pads_[static_cast<size_t>(i)].setPartIndex(i);
        pads_[static_cast<size_t>(i)].setMidiChannel(1);

        padConfigs_[static_cast<size_t>(i)].midiNote = defaultMidiNoteForPad(i);
        padConfigs_[static_cast<size_t>(i)].bus = defaultBusForPad(i);
        padConfigs_[static_cast<size_t>(i)].name = defaultPadName(i);
        padNoteAssignments_[static_cast<size_t>(i)].fill(false);
        padZones_[static_cast<size_t>(i)] = {
            makeZoneConfig(PadZoneKind::Head),
            makeZoneConfig(PadZoneKind::Rim),
            makeZoneConfig(PadZoneKind::Edge),
        };
        addPadMidiNote(i, padConfigs_[static_cast<size_t>(i)].midiNote);
        applyPadConfigToPart(i);
    }
    midiLearnDeadline_ = std::chrono::steady_clock::now();
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
    expireMidiLearnIfNeeded();
    for (const auto metadata : midiBuffer) {
        handleMidiLearnMessage(metadata.getMessage());
    }

    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    busBuffer_.clear();
    stereoMixBuffer_.clear();

    for (auto& padBuffer : padMidiBuffers_) {
        padBuffer.clear();
    }

    routeMidiToPads(
        midiBuffer,
        padConfigs_,
        padZones_,
        noteToPad_,
        noteToZone_,
        globalMidiChannel_.load(std::memory_order_relaxed),
        padMidiBuffers_,
        *this);
    routeMidiToPads(
        triggeredMidiBuffer_,
        padConfigs_,
        padZones_,
        noteToPad_,
        noteToZone_,
        globalMidiChannel_.load(std::memory_order_relaxed),
        padMidiBuffers_,
        *this);
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

    const auto previousConfig = padConfigs_[static_cast<size_t>(padIndex)];
    auto updated = config;
    updated.volume = std::clamp(updated.volume, 0.0f, 1.0f);
    updated.pan = std::clamp(updated.pan, -1.0f, 1.0f);
    updated.tuneSemitones = std::clamp(updated.tuneSemitones, -24.0f, 24.0f);
    updated.midiNote = std::clamp(updated.midiNote, 0, 127);
    updated.fixedVelocity = std::clamp(updated.fixedVelocity, 0.0f, 1.0f);
    updated.inputFloor = std::clamp(updated.inputFloor, 0.0f, 1.0f);
    updated.outputFloor = std::clamp(updated.outputFloor, 0.0f, 1.0f);
    updated.outputCeiling = std::clamp(updated.outputCeiling, updated.outputFloor, 1.0f);
    updated.midiChannel = std::clamp(updated.midiChannel, 0, 16);
    if (updated.name.empty()) {
        updated.name = defaultPadName(padIndex);
    }

    padConfigs_[static_cast<size_t>(padIndex)] = updated;
    if (updated.midiNote != previousConfig.midiNote) {
        setPadMidiNote(padIndex, updated.midiNote);
    }
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
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    for (int note = 0; note < 128; ++note) {
        if (padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(note)]) {
            padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(note)] = false;
            if (noteToPad_[static_cast<size_t>(note)] == padIndex) {
                noteToPad_[static_cast<size_t>(note)] = -1;
            }
        }
    }

    auto config = getPadConfig(padIndex);
    config.midiNote = std::clamp(midiNote, 0, 127);
    const bool assigned = addPadMidiNote(padIndex, config.midiNote);
    if (!assigned) {
        return false;
    }
    padConfigs_[static_cast<size_t>(padIndex)] = config;
    return true;
}

bool DrumMachineProcessor::addPadMidiNote(int padIndex, int midiNote) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    const int clampedNote = std::clamp(midiNote, 0, 127);
    unassignTriggerNote(clampedNote);
    noteToPad_[static_cast<size_t>(clampedNote)] = padIndex;
    noteToZone_[static_cast<size_t>(clampedNote)] = -1;
    padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(clampedNote)] = true;

    auto notes = getPadMidiNotes(padIndex);
    auto config = getPadConfig(padIndex);
    config.midiNote = notes.empty() ? clampedNote : notes.front();
    padConfigs_[static_cast<size_t>(padIndex)] = config;
    return true;
}

bool DrumMachineProcessor::removePadMidiNote(int padIndex, int midiNote) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (!padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(clampedNote)]) {
        return false;
    }

    unassignTriggerNote(clampedNote);

    auto notes = getPadMidiNotes(padIndex);
    auto config = getPadConfig(padIndex);
    config.midiNote = notes.empty() ? defaultMidiNoteForPad(padIndex) : notes.front();
    padConfigs_[static_cast<size_t>(padIndex)] = config;
    if (notes.empty()) {
        addPadMidiNote(padIndex, config.midiNote);
    }
    return true;
}

std::vector<int> DrumMachineProcessor::getPadMidiNotes(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        return {};
    }

    std::vector<int> notes;
    for (int note = 0; note < 128; ++note) {
        if (padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(note)]) {
            notes.push_back(note);
        }
    }
    return notes;
}

bool DrumMachineProcessor::setGlobalMidiChannel(int midiChannel) {
    if (midiChannel < 0 || midiChannel > 16) {
        return false;
    }
    globalMidiChannel_.store(midiChannel, std::memory_order_relaxed);
    return true;
}

int DrumMachineProcessor::getGlobalMidiChannel() const {
    return globalMidiChannel_.load(std::memory_order_relaxed);
}

void DrumMachineProcessor::setLastMappedVelocityForPad(int padIndex, float velocity) {
    if (!isValidPadIndex(padIndex)) {
        return;
    }
    lastMappedVelocity_[static_cast<size_t>(padIndex)] = std::clamp(velocity, 0.0f, 1.0f);
}

bool DrumMachineProcessor::setPadBus(int padIndex, BusId bus) {
    auto config = getPadConfig(padIndex);
    config.bus = bus;
    return setPadConfig(padIndex, config);
}

bool DrumMachineProcessor::setPadVelocityCurve(
    int padIndex,
    VelocityCurve curve,
    float fixedVelocity,
    float inputFloor,
    float outputFloor,
    float outputCeiling) {
    auto config = getPadConfig(padIndex);
    config.velocityCurve = curve;
    config.fixedVelocity = fixedVelocity;
    config.inputFloor = inputFloor;
    config.outputFloor = outputFloor;
    config.outputCeiling = outputCeiling;
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
    return applyVelocityCurve(
        config.velocityCurve,
        rawVelocity,
        config.fixedVelocity,
        config.inputFloor,
        config.outputFloor,
        config.outputCeiling);
}

float DrumMachineProcessor::getLastMappedVelocityForPad(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        return 0.0f;
    }
    return lastMappedVelocity_[static_cast<size_t>(padIndex)];
}

std::array<float, 128> DrumMachineProcessor::getVelocityCurvePreview(int padIndex) const {
    std::array<float, 128> preview{};
    if (!isValidPadIndex(padIndex)) {
        return preview;
    }

    for (int midiVelocity = 0; midiVelocity < 128; ++midiVelocity) {
        preview[static_cast<size_t>(midiVelocity)] = mapVelocityForPad(
            padIndex,
            static_cast<float>(midiVelocity) / 127.0f);
    }
    return preview;
}

bool DrumMachineProcessor::setPadZone(
    int padIndex,
    PadZoneKind kind,
    int triggerNote,
    int keySwitchNote,
    float velocityScale) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    const int clampedTriggerNote = std::clamp(triggerNote, 0, 127);
    const int clampedKeySwitchNote = keySwitchNote < 0 ? -1 : std::clamp(keySwitchNote, 0, 127);
    const int slot = zoneIndex(kind);
    if (slot < 0 || slot >= 3) {
        return false;
    }

    auto& zone = padZones_[static_cast<size_t>(padIndex)][static_cast<size_t>(slot)];
    if (zone.enabled && zone.triggerNote != clampedTriggerNote) {
        unassignTriggerNote(zone.triggerNote);
    }

    unassignTriggerNote(clampedTriggerNote);
    zone.kind = kind;
    zone.triggerNote = clampedTriggerNote;
    zone.keySwitchNote = clampedKeySwitchNote;
    zone.velocityScale = std::clamp(velocityScale, 0.0f, 2.0f);
    zone.enabled = true;

    noteToPad_[static_cast<size_t>(clampedTriggerNote)] = padIndex;
    noteToZone_[static_cast<size_t>(clampedTriggerNote)] = slot;
    padNoteAssignments_[static_cast<size_t>(padIndex)][static_cast<size_t>(clampedTriggerNote)] = true;
    return true;
}

bool DrumMachineProcessor::clearPadZone(int padIndex, PadZoneKind kind) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    const int slot = zoneIndex(kind);
    if (slot < 0 || slot >= 3) {
        return false;
    }

    auto& zone = padZones_[static_cast<size_t>(padIndex)][static_cast<size_t>(slot)];
    if (!zone.enabled) {
        return false;
    }

    const int triggerNote = zone.triggerNote;
    zone = makeZoneConfig(kind);
    if (triggerNote >= 0 && triggerNote < 128) {
        unassignTriggerNote(triggerNote);
    }
    return true;
}

std::vector<DrumMachineProcessor::PadZoneConfig> DrumMachineProcessor::getPadZones(int padIndex) const {
    if (!isValidPadIndex(padIndex)) {
        return {};
    }

    std::vector<PadZoneConfig> zones;
    for (const auto& zone : padZones_[static_cast<size_t>(padIndex)]) {
        if (zone.enabled) {
            zones.push_back(zone);
        }
    }
    return zones;
}

std::vector<std::string> DrumMachineProcessor::getDrumMidiPresetNames() const {
    std::vector<std::string> names;
    names.reserve(drumMidiPresets().size());
    for (const auto& preset : drumMidiPresets()) {
        names.emplace_back(preset.name);
    }
    return names;
}

bool DrumMachineProcessor::applyDrumMidiPreset(const std::string& presetName) {
    const auto presetIt = std::find_if(
        drumMidiPresets().begin(),
        drumMidiPresets().end(),
        [&presetName](const PresetDefinition& preset) { return preset.name == presetName; });
    if (presetIt == drumMidiPresets().end()) {
        return false;
    }

    for (int padIndex = 0; padIndex < kPadCount; ++padIndex) {
        setPadMidiNote(padIndex, defaultMidiNoteForPad(padIndex));
        clearPadZone(padIndex, PadZoneKind::Head);
        clearPadZone(padIndex, PadZoneKind::Rim);
        clearPadZone(padIndex, PadZoneKind::Edge);
    }

    for (const auto& zone : presetIt->zones) {
        if (!setPadZone(zone.padIndex, zone.kind, zone.triggerNote, zone.keySwitchNote, zone.velocityScale)) {
            return false;
        }
    }
    return true;
}

bool DrumMachineProcessor::startMidiLearn(int padIndex, bool learnAll, int timeoutSeconds) {
    if (!isValidPadIndex(padIndex)) {
        return false;
    }

    midiLearnState_.active = true;
    midiLearnState_.learnAll = learnAll;
    midiLearnState_.activePadIndex = padIndex;
    midiLearnState_.nextPadIndex = padIndex;
    midiLearnState_.lastReceivedNote = -1;
    midiLearnState_.lastReceivedChannel = -1;
    midiLearnState_.timeoutSeconds = std::max(1, timeoutSeconds);
    midiLearnDeadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(midiLearnState_.timeoutSeconds);
    return true;
}

void DrumMachineProcessor::stopMidiLearn() {
    midiLearnState_.active = false;
    midiLearnState_.learnAll = false;
    midiLearnState_.activePadIndex = -1;
    midiLearnState_.nextPadIndex = -1;
}

DrumMachineProcessor::MidiLearnState DrumMachineProcessor::getMidiLearnState() const {
    expireMidiLearnIfNeeded();
    return midiLearnState_;
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

DrumMachineProcessor::RtProcessDiagnostics DrumMachineProcessor::getRtProcessDiagnostics() const {
    RtProcessDiagnostics diagnostics;
    diagnostics.mixerScratchBufferResizes = mixer_.getScratchBufferResizeCount();
    for (const auto& pad : pads_) {
        diagnostics.partRenderBufferResizes += pad.getProcessBufferResizeCount();
        diagnostics.partFreezeBufferAllocations += pad.getFreezeBufferAllocationCount();
    }
    return diagnostics;
}

void DrumMachineProcessor::resetRtProcessDiagnostics() {
    mixer_.resetProcessDiagnostics();
    for (auto& pad : pads_) {
        pad.resetProcessDiagnostics();
    }
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

float DrumMachineProcessor::applyVelocityCurve(
    VelocityCurve curve,
    float rawVelocity,
    float fixedVelocity,
    float inputFloor,
    float outputFloor,
    float outputCeiling) {
    const float velocity = clampVelocity(rawVelocity);
    if (velocity <= std::clamp(inputFloor, 0.0f, 1.0f)) {
        return 0.0f;
    }

    float curvedVelocity = velocity;
    switch (curve) {
        case VelocityCurve::Logarithmic:
            curvedVelocity = std::sqrt(velocity);
            break;
        case VelocityCurve::Exponential:
            curvedVelocity = velocity * velocity;
            break;
        case VelocityCurve::SCurve:
            curvedVelocity = velocity * velocity * (3.0f - (2.0f * velocity));
            break;
        case VelocityCurve::Fixed:
            curvedVelocity = std::clamp(fixedVelocity, 0.0f, 1.0f);
            break;
        case VelocityCurve::Linear:
        default:
            curvedVelocity = velocity;
            break;
    }

    const float clampedFloor = std::clamp(outputFloor, 0.0f, 1.0f);
    const float clampedCeiling = std::clamp(outputCeiling, clampedFloor, 1.0f);
    return std::clamp(
        clampedFloor + (curvedVelocity * (clampedCeiling - clampedFloor)),
        clampedFloor,
        clampedCeiling);
}

int DrumMachineProcessor::zoneIndex(PadZoneKind kind) {
    return static_cast<int>(kind);
}

DrumMachineProcessor::PadZoneKind DrumMachineProcessor::zoneKindFromIndex(int zoneIndex) {
    switch (zoneIndex) {
        case 1:
            return PadZoneKind::Rim;
        case 2:
            return PadZoneKind::Edge;
        case 0:
        default:
            return PadZoneKind::Head;
    }
}

std::string DrumMachineProcessor::defaultPadName(int padIndex) {
    return "Pad " + std::to_string(std::clamp(padIndex, 0, kPadCount - 1) + 1);
}

void DrumMachineProcessor::expireMidiLearnIfNeeded() const {
    if (!midiLearnState_.active) {
        return;
    }
    if (std::chrono::steady_clock::now() >= midiLearnDeadline_) {
        midiLearnState_.active = false;
        midiLearnState_.learnAll = false;
        midiLearnState_.activePadIndex = -1;
        midiLearnState_.nextPadIndex = -1;
    }
}

bool DrumMachineProcessor::handleMidiLearnMessage(const juce::MidiMessage& message) {
    expireMidiLearnIfNeeded();
    if (!midiLearnState_.active || !message.isNoteOn()) {
        return false;
    }

    const int padIndex = midiLearnState_.activePadIndex;
    if (!isValidPadIndex(padIndex)) {
        stopMidiLearn();
        return false;
    }

    const int noteNumber = message.getNoteNumber();
    const int midiChannel = message.getChannel();
    midiLearnState_.lastReceivedNote = noteNumber;
    midiLearnState_.lastReceivedChannel = midiChannel;
    midiLearnDeadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(midiLearnState_.timeoutSeconds);

    setPadMidiNote(padIndex, noteNumber);
    setPadMidiChannel(padIndex, midiChannel);

    if (midiLearnState_.learnAll) {
        advanceMidiLearn();
    } else {
        stopMidiLearn();
    }
    return true;
}

void DrumMachineProcessor::advanceMidiLearn() {
    if (!midiLearnState_.learnAll) {
        stopMidiLearn();
        return;
    }

    const int currentPad = midiLearnState_.activePadIndex;
    const int nextPad = currentPad + 1;
    if (!isValidPadIndex(nextPad)) {
        stopMidiLearn();
        return;
    }

    midiLearnState_.activePadIndex = nextPad;
    midiLearnState_.nextPadIndex = nextPad;
}

void DrumMachineProcessor::unassignTriggerNote(int midiNote) {
    const int clampedNote = std::clamp(midiNote, 0, 127);
    const int previousPad = noteToPad_[static_cast<size_t>(clampedNote)];
    if (previousPad >= 0 && previousPad < kPadCount) {
        padNoteAssignments_[static_cast<size_t>(previousPad)][static_cast<size_t>(clampedNote)] = false;
    }

    const int previousZoneIndex = noteToZone_[static_cast<size_t>(clampedNote)];
    if (previousPad >= 0 && previousPad < kPadCount && previousZoneIndex >= 0 && previousZoneIndex < 3) {
        auto& zone = padZones_[static_cast<size_t>(previousPad)][static_cast<size_t>(previousZoneIndex)];
        zone = makeZoneConfig(zoneKindFromIndex(previousZoneIndex));
    }

    noteToPad_[static_cast<size_t>(clampedNote)] = -1;
    noteToZone_[static_cast<size_t>(clampedNote)] = -1;
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
