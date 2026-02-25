#pragma once

/**
 * SynthForge - Single part state (Phase 1)
 * Holds part config, parameter map, and MIDI-driven voice usage tracking.
 */

#include "SynthForge/Common/Types.h"
#include "SynthForge/Core/VoiceAllocator.h"
#include "SynthForge/Sound/SynthVoice.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <atomic>
#include <map>
#include <mutex>
#include <string>

namespace map2::synthforge {

class Part {
public:
    static constexpr int kVoicesPerPart = 8;

    Part();
    explicit Part(int partIndex);

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    void setPartIndex(int partIndex);
    int getPartIndex() const { return partIndex_.load(std::memory_order_relaxed); }

    void setConfig(const PartConfig& config);
    PartConfig getConfig() const;

    int getMidiChannel() const { return midiChannel_.load(std::memory_order_relaxed); }
    void setMidiChannel(int midiChannel);

    void processMidi(const juce::MidiBuffer& midiBuffer);
    void processAudio(juce::AudioBuffer<float>& mixBuffer, const juce::MidiBuffer& midiBuffer, bool soloActive);

    int getActiveVoices() const { return voices_.getActiveVoices(); }
    int getPeakVoices() const { return voices_.getPeakVoices(); }
    void resetVoices();

    void setParameter(const std::string& name, float value);
    std::map<std::string, float> getParameters() const;

    bool isSolo() const { return solo_.load(std::memory_order_relaxed); }

private:
    static float mapNormalizedCutoff(float value);
    static float normalizeEnvelopeMs(float value);

    std::atomic<int> partIndex_{0};
    std::atomic<int> midiChannel_{1};
    std::atomic<OutputBus> outputBus_{OutputBus::Main};
    std::atomic<float> level_{1.0f};
    std::atomic<float> pan_{0.0f};
    std::atomic<bool> mute_{false};
    std::atomic<bool> solo_{false};

    VoiceAllocator voices_;
    SynthVoiceParameters voiceParameters_;
    juce::Synthesiser synthesiser_;
    juce::AudioBuffer<float> renderBuffer_;
    std::atomic<bool> prepared_{false};

    mutable std::mutex parameterMutex_;
    std::map<std::string, float> parameters_;
};

}  // namespace map2::synthforge
