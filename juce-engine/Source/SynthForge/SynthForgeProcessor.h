#pragma once

/**
 * SynthForge Processor (Phase 1 scaffold)
 * Provides a 16-part MIDI/voice management surface for backend integration.
 */

#include "SynthForge/Common/Types.h"
#include "SynthForge/Core/MidiRouter.h"
#include "SynthForge/Core/Part.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace map2::synthforge {

class SynthForgeProcessor {
public:
    SynthForgeProcessor();

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiBuffer);

    std::vector<PartConfig> getPartsConfig() const;
    bool setPartConfig(int partIndex, const PartConfig& config);
    bool setPartChannel(int partIndex, int midiChannel);
    int getPartChannel(int partIndex) const;

    std::map<std::string, float> getPartParameters(int partIndex) const;
    bool setPartParameter(int partIndex, const std::string& parameter, float value);
    bool loadPartSfz(int partIndex, const std::string& sfzPath);
    SampleLoadStatus getPartSampleStatus(int partIndex) const;

    std::vector<PatchInfo> getPatches(const std::string& categoryFilter = "") const;
    bool loadPatch(int partIndex, int bank, int program);
    bool savePatch(int partIndex, int bank, int program, const std::string& name);

    VoiceMetrics getVoiceMetrics() const;
    Metering getMetering() const;

private:
    struct PatchState {
        PatchInfo info;
        PartConfig config;
        std::map<std::string, float> parameters;
    };

    static bool isValidPartIndex(int partIndex);
    void initializeFactoryPatches();

    std::array<Part, kNumParts> parts_;
    MidiRouter midiRouter_;
    std::array<juce::MidiBuffer, kNumParts> partMidiBuffers_;

    mutable std::mutex patchMutex_;
    std::map<std::pair<int, int>, PatchState> patchBank_;

    std::atomic<double> sampleRate_{DEFAULT_SAMPLE_RATE};
    std::atomic<int> samplesPerBlock_{DEFAULT_BUFFER_SIZE};
    std::atomic<int> numChannels_{2};
    std::atomic<bool> prepared_{false};
};

}  // namespace map2::synthforge
