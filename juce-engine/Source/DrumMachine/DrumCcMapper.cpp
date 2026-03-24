#include "DrumMachine/DrumCcMapper.h"

#include <algorithm>

namespace map2::drummachine {

DrumCcMapper::DrumCcMapper() {
    for (int slot = 0; slot < kSlotCount; ++slot) {
        mappings_[static_cast<size_t>(slot)].slot = slot;
    }
    learnDeadline_ = std::chrono::steady_clock::now();
}

bool DrumCcMapper::setMapping(int slot, const Mapping& mapping) {
    if (!isValidSlot(slot)) {
        return false;
    }

    auto normalized = mapping;
    normalized.slot = slot;
    normalized.ccNumber = std::clamp(normalized.ccNumber, 0, 127);
    normalized.midiChannel = std::clamp(normalized.midiChannel, 0, 16);
    normalized.targetIndex = std::max(0, normalized.targetIndex);
    mappings_[static_cast<size_t>(slot)] = normalized;
    return true;
}

DrumCcMapper::Mapping DrumCcMapper::getMapping(int slot) const {
    if (!isValidSlot(slot)) {
        return {};
    }
    return mappings_[static_cast<size_t>(slot)];
}

std::vector<DrumCcMapper::Mapping> DrumCcMapper::getMappings() const {
    return std::vector<Mapping>(mappings_.begin(), mappings_.end());
}

bool DrumCcMapper::startLearn(int slot, int timeoutSeconds) {
    if (!isValidSlot(slot)) {
        return false;
    }

    learnState_ = LearnState{
        .active = true,
        .slot = slot,
        .lastCc = -1,
        .lastChannel = -1,
        .timeoutSeconds = std::clamp(timeoutSeconds, 1, 60),
    };
    learnDeadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(learnState_.timeoutSeconds);
    return true;
}

void DrumCcMapper::stopLearn() {
    learnState_.active = false;
    learnState_.slot = -1;
}

DrumCcMapper::LearnState DrumCcMapper::getLearnState() const {
    return learnState_;
}

void DrumCcMapper::processMidiBuffer(const juce::MidiBuffer& midiBuffer, const ApplyCallback& callback) {
    expireLearnIfNeeded();

    for (const auto metadata : midiBuffer) {
        const auto message = metadata.getMessage();
        if (!message.isController()) {
            continue;
        }

        handleLearnMessage(message);

        const int controller = message.getControllerNumber();
        const int channel = message.getChannel();
        const float normalized = static_cast<float>(message.getControllerValue()) / 127.0f;
        for (const auto& mapping : mappings_) {
            if (!mapping.active) {
                continue;
            }
            if (mapping.ccNumber != controller) {
                continue;
            }
            if (mapping.midiChannel != 0 && mapping.midiChannel != channel) {
                continue;
            }
            callback(mapping, normalized);
        }
    }
}

const char* DrumCcMapper::targetToString(Target target) {
    switch (target) {
        case Target::PadVolume: return "pad_volume";
        case Target::PadPan: return "pad_pan";
        case Target::PadTune: return "pad_tune";
        case Target::PadFilterCutoff: return "pad_filter_cutoff";
        case Target::BusLevel: return "bus_level";
        case Target::BusPan: return "bus_pan";
        case Target::MasterVolume: return "master_volume";
        case Target::Tempo: return "tempo";
        case Target::Swing: return "swing";
        case Target::SynthPitchStartHz: return "synth_pitch_start_hz";
        case Target::SynthPitchEndHz: return "synth_pitch_end_hz";
        case Target::SynthPitchDecayMs: return "synth_pitch_decay_ms";
        case Target::SynthNoiseLevel: return "synth_noise_level";
        case Target::SynthNoiseDecayMs: return "synth_noise_decay_ms";
        case Target::SynthBodyDecayMs: return "synth_body_decay_ms";
        case Target::SynthToneAmount: return "synth_tone_amount";
    }
    return "pad_volume";
}

bool DrumCcMapper::targetFromString(const std::string& value, Target& target) {
    static const std::array<std::pair<const char*, Target>, 16> mappings = {{
        {"pad_volume", Target::PadVolume},
        {"pad_pan", Target::PadPan},
        {"pad_tune", Target::PadTune},
        {"pad_filter_cutoff", Target::PadFilterCutoff},
        {"bus_level", Target::BusLevel},
        {"bus_pan", Target::BusPan},
        {"master_volume", Target::MasterVolume},
        {"tempo", Target::Tempo},
        {"swing", Target::Swing},
        {"synth_pitch_start_hz", Target::SynthPitchStartHz},
        {"synth_pitch_end_hz", Target::SynthPitchEndHz},
        {"synth_pitch_decay_ms", Target::SynthPitchDecayMs},
        {"synth_noise_level", Target::SynthNoiseLevel},
        {"synth_noise_decay_ms", Target::SynthNoiseDecayMs},
        {"synth_body_decay_ms", Target::SynthBodyDecayMs},
        {"synth_tone_amount", Target::SynthToneAmount},
    }};

    for (const auto& mapping : mappings) {
        if (value == mapping.first) {
            target = mapping.second;
            return true;
        }
    }
    return false;
}

bool DrumCcMapper::isValidSlot(int slot) {
    return slot >= 0 && slot < kSlotCount;
}

void DrumCcMapper::expireLearnIfNeeded() {
    if (learnState_.active && std::chrono::steady_clock::now() >= learnDeadline_) {
        stopLearn();
    }
}

bool DrumCcMapper::handleLearnMessage(const juce::MidiMessage& message) {
    if (!learnState_.active || !message.isController() || !isValidSlot(learnState_.slot)) {
        return false;
    }

    learnState_.lastCc = message.getControllerNumber();
    learnState_.lastChannel = message.getChannel();

    auto mapping = getMapping(learnState_.slot);
    mapping.ccNumber = message.getControllerNumber();
    mapping.midiChannel = message.getChannel();
    mapping.active = true;
    setMapping(learnState_.slot, mapping);
    stopLearn();
    return true;
}

}  // namespace map2::drummachine
