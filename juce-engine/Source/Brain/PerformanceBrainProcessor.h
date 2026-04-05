#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <atomic>

namespace map2::brain {

class PerformanceBrainProcessor final : public juce::AudioProcessor {
public:
    static constexpr int kSlotCount = 16;

    enum class SlotMode {
        Chromatic = 0,
        Drum,
        Hybrid,
    };

    struct SlotState {
        SlotMode mode = SlotMode::Drum;
        float level = 1.0f;
        float pan = 0.0f;
        bool mute = false;
        bool solo = false;
        int midiChannel = 0;
        int triggerNote = 36;
        int polyphony = 16;
    };

    struct TransportState {
        bool isPlaying = false;
        int bpm = 120;
        int pattern = 0;
        int variation = 0;
        int swing = 0;
    };

    PerformanceBrainProcessor();

    const juce::String getName() const override;
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    double getTailLengthSeconds() const override;
    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    std::array<SlotState, kSlotCount> getSlotStates() const;
    SlotState getSlotState(int slotIndex) const;
    bool setSlotState(int slotIndex, const SlotState& state);

    TransportState getTransportState() const;
    void setTransportState(const TransportState& state);

    int getActiveVoiceCount() const;
    int getPeakVoiceCount() const;

private:
    static bool isValidSlotIndex(int slotIndex);
    static double midiNoteToFrequency(int midiNote);
    void clearPerformanceStateLocked();

    std::array<SlotState, kSlotCount> slots_{};
    TransportState transport_{};
    std::array<bool, 128> activeNotes_{};
    juce::SpinLock stateLock_;
    std::atomic<double> sampleRate_{44100.0};
    std::atomic<int> activeVoiceCount_{0};
    std::atomic<int> peakVoiceCount_{0};
    int triggerImpulseSamplesRemaining_ = 0;
    double oscillatorPhase_ = 0.0;
    double triggerOscillatorPhase_ = 0.0;
};

}  // namespace map2::brain
