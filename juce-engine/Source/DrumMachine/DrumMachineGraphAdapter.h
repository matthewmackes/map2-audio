#pragma once

/**
 * Drum Machine Graph Adapter
 * Wraps the existing DrumMachineProcessor + DrumSequencer as a
 * juce::AudioProcessor so they can be hosted inside JuceAudioGraph
 * via registerHardwarePlugin().
 *
 * The adapter does NOT own the processors — it holds references to
 * the engine's existing members so that Python-side accessors
 * (getDrumMachine(), getDrumSequencer()) continue to work unchanged.
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include "DrumMachine/DrumMachineProcessor.h"
#include "DrumMachine/DrumSequencer.h"
#include "Common.h"

#include <atomic>

namespace map2::drummachine {

class DrumMachineGraphAdapter : public juce::AudioProcessor {
public:
    static constexpr const char* PLUGIN_URI  = "map2://juce/drums";
    static constexpr const char* PLUGIN_NAME = "Drum Machine";

    DrumMachineGraphAdapter(DrumMachineProcessor& drumProc,
                            DrumSequencer& sequencer)
        : juce::AudioProcessor(BusesProperties()
              .withOutput("Output", juce::AudioChannelSet::stereo(), true))
        , drumProc_(drumProc)
        , sequencer_(sequencer) {}

    ~DrumMachineGraphAdapter() override = default;

    // ── juce::AudioProcessor interface ──────────────────────────────────

    const juce::String getName() const override { return PLUGIN_NAME; }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override {
        drumProc_.prepare(sampleRate, samplesPerBlock,
                          std::max(2, getTotalNumOutputChannels()));
        sequencer_.prepare(sampleRate, samplesPerBlock);
    }

    void releaseResources() override {}

    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& midiMessages) override {
        if (!enabled_.load(std::memory_order_relaxed))
            return;

        sequencer_.processBlock(buffer.getNumSamples());
        drumProc_.processBlock(buffer, midiMessages);
    }

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi()  const override { return true; }
    bool producesMidi() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }

    // ── Enable/disable (replaces drumMachineEnabled_ atomic) ────────────

    void setEnabled(bool enabled) { enabled_.store(enabled, std::memory_order_relaxed); }
    bool isEnabled() const { return enabled_.load(std::memory_order_relaxed); }

    // ── Access to inner processors ──────────────────────────────────────

    DrumMachineProcessor&       getDrumMachine()       { return drumProc_; }
    const DrumMachineProcessor& getDrumMachine() const { return drumProc_; }
    DrumSequencer&              getSequencer()          { return sequencer_; }
    const DrumSequencer&        getSequencer()   const { return sequencer_; }

private:
    DrumMachineProcessor& drumProc_;
    DrumSequencer& sequencer_;
    std::atomic<bool> enabled_{true};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DrumMachineGraphAdapter)
};

}  // namespace map2::drummachine
