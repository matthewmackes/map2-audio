#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <chrono>
#include <functional>
#include <string>
#include <vector>

namespace map2::drummachine {

class DrumCcMapper {
public:
    static constexpr int kSlotCount = 32;

    enum class Target {
        PadVolume = 0,
        PadPan,
        PadTune,
        PadFilterCutoff,
        BusLevel,
        BusPan,
        MasterVolume,
        Tempo,
        Swing,
        SynthPitchStartHz,
        SynthPitchEndHz,
        SynthPitchDecayMs,
        SynthNoiseLevel,
        SynthNoiseDecayMs,
        SynthBodyDecayMs,
        SynthToneAmount,
    };

    struct Mapping {
        int slot = 0;
        int ccNumber = 0;
        int midiChannel = 0;  // 0 = omni, otherwise 1-16
        Target target = Target::PadVolume;
        int targetIndex = 0;
        bool active = false;
    };

    struct LearnState {
        bool active = false;
        int slot = -1;
        int lastCc = -1;
        int lastChannel = -1;
        int timeoutSeconds = 10;
    };

    using ApplyCallback = std::function<void(const Mapping&, float normalizedValue)>;

    DrumCcMapper();

    bool setMapping(int slot, const Mapping& mapping);
    Mapping getMapping(int slot) const;
    std::vector<Mapping> getMappings() const;

    bool startLearn(int slot, int timeoutSeconds = 10);
    void stopLearn();
    LearnState getLearnState() const;

    void processMidiBuffer(const juce::MidiBuffer& midiBuffer, const ApplyCallback& callback);

    static const char* targetToString(Target target);
    static bool targetFromString(const std::string& value, Target& target);

private:
    static bool isValidSlot(int slot);
    void expireLearnIfNeeded();
    bool handleLearnMessage(const juce::MidiMessage& message);

    std::array<Mapping, kSlotCount> mappings_{};
    LearnState learnState_{};
    std::chrono::steady_clock::time_point learnDeadline_{};
};

}  // namespace map2::drummachine
