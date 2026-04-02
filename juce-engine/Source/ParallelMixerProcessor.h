#pragma once

/**
 * MAP2 Audio Engine - Parallel Mixer Processor
 *
 * Mixes multiple parallel audio branches with crossfade control.
 * Supports A/B blending for wet/dry or parallel chain mixing.
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <array>

namespace map2 {

/**
 * ParallelMixerProcessor - Mixes multiple parallel audio paths
 *
 * Can operate in different modes:
 * - A/B Blend: Crossfade between two chains
 * - Multi-mix: Mix multiple branches with individual levels
 * - Wet/Dry: Mix processed signal with dry input
 */
class ParallelMixerProcessor : public juce::AudioProcessor {
public:
    static constexpr int MAX_BRANCHES = 4;

    enum class Mode {
        ABBlend,    // Crossfade between branch A and B
        MultiMix,   // Independent mix of all branches
        WetDry      // Branch 0 = dry, Branch 1 = wet
    };

    ParallelMixerProcessor();
    ~ParallelMixerProcessor() override = default;

    // ========================================
    // AudioProcessor Interface
    // ========================================

    const juce::String getName() const override { return "ParallelMixer"; }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
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

    // ========================================
    // Parallel Mixing Control
    // ========================================

    /**
     * Set the mixer mode
     */
    void setMode(Mode mode);
    Mode getMode() const { return mode_.load(); }

    /**
     * Set A/B blend (0.0 = all A, 1.0 = all B)
     * Only used in ABBlend mode
     */
    void setABBlend(float blend);
    float getABBlend() const { return abBlend_.load(); }

    /**
     * Set individual branch level (0.0 - 1.0)
     * @param branch Branch index (0 to MAX_BRANCHES-1)
     * @param level Mix level (0.0 - 1.0)
     */
    void setBranchLevel(int branch, float level);
    float getBranchLevel(int branch) const;

    /**
     * Set master output level
     */
    void setMasterLevel(float level);
    float getMasterLevel() const { return masterLevel_.load(); }

    /**
     * Set bypass (pass through branch 0 unchanged)
     */
    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    /**
     * Get the number of active branches
     */
    int getNumBranches() const { return numBranches_.load(); }

    /**
     * Set the number of active branches (1-4)
     */
    void setNumBranches(int num);

private:
    static juce::AudioProcessor::BusesProperties createBusesProperties();

    // Mode
    std::atomic<Mode> mode_{Mode::ABBlend};

    // A/B blend (0 = A, 1 = B)
    std::atomic<float> abBlend_{0.5f};

    // Individual branch levels
    std::array<std::atomic<float>, MAX_BRANCHES> branchLevels_;

    // Master output level
    std::atomic<float> masterLevel_{1.0f};

    // Bypass flag
    std::atomic<bool> bypass_{false};

    // Number of active branches
    std::atomic<int> numBranches_{2};

    // Branch 0 input shares channels with the output bus, so copy it once
    // before clearing the output and mix the remaining buses directly.
    juce::AudioBuffer<float> branch0Scratch_;

    // Processing state
    double sampleRate_{44100.0};
    int blockSize_{512};
    std::atomic<bool> prepared_{false};
};

} // namespace map2
