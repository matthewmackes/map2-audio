#pragma once

/**
 * SynthForge Graph Adapter
 * Wraps the existing SynthForgeProcessor as a juce::AudioProcessor so it can
 * be hosted inside JuceAudioGraph via registerHardwarePlugin().
 *
 * The adapter does NOT own the SynthForgeProcessor — it holds a reference to
 * the engine's existing member so that Python-side accessors (getSynthForge())
 * continue to work unchanged.
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include "SynthForge/SynthForgeProcessor.h"
#include "Common.h"

namespace map2::synthforge {

class SynthForgeGraphAdapter : public juce::AudioProcessor {
public:
    static constexpr const char* PLUGIN_URI  = "map2://juce/synthforge";
    static constexpr const char* PLUGIN_NAME = "SynthForge";

    explicit SynthForgeGraphAdapter(SynthForgeProcessor& inner)
        : juce::AudioProcessor(BusesProperties()
              .withOutput("Output", juce::AudioChannelSet::stereo(), true))
        , inner_(inner) {}

    ~SynthForgeGraphAdapter() override = default;

    // ── juce::AudioProcessor interface ──────────────────────────────────

    const juce::String getName() const override { return PLUGIN_NAME; }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override {
        inner_.prepare(sampleRate, samplesPerBlock, 2);
    }

    void releaseResources() override {}

    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& midiMessages) override {
        inner_.processBlock(buffer, midiMessages);
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

    // ── Access to inner processor ───────────────────────────────────────

    SynthForgeProcessor&       getInner()       { return inner_; }
    const SynthForgeProcessor& getInner() const { return inner_; }

private:
    SynthForgeProcessor& inner_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynthForgeGraphAdapter)
};

}  // namespace map2::synthforge
