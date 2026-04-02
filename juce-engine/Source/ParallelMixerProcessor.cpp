/**
 * MAP2 Audio Engine - Parallel Mixer Processor Implementation
 */

#include "ParallelMixerProcessor.h"
#include <algorithm>
#include <cmath>

namespace map2 {

juce::AudioProcessor::BusesProperties ParallelMixerProcessor::createBusesProperties() {
    return juce::AudioProcessor::BusesProperties()
        .withInput("Branch 1", juce::AudioChannelSet::stereo(), true)
        .withInput("Branch 2", juce::AudioChannelSet::stereo(), true)
        .withInput("Branch 3", juce::AudioChannelSet::stereo(), true)
        .withInput("Branch 4", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true);
}

ParallelMixerProcessor::ParallelMixerProcessor()
    : AudioProcessor(createBusesProperties()) {

    // Initialize branch levels to unity
    for (auto& level : branchLevels_) {
        level.store(1.0f);
    }
}

void ParallelMixerProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    branch0Scratch_.setSize(2, samplesPerBlock, false, false, true);
    branch0Scratch_.clear();

    prepared_.store(true);
}

void ParallelMixerProcessor::releaseResources() {
    prepared_.store(false);
}

void ParallelMixerProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                          juce::MidiBuffer& /*midiMessages*/) {
    if (!prepared_.load()) return;

    auto output = getBusBuffer(buffer, false, 0);
    const auto branch0Input = getBusBuffer(buffer, true, 0);
    const int numSamples = output.getNumSamples();
    const int outputChannels = output.getNumChannels();
    const int scratchChannels = std::min(outputChannels, branch0Scratch_.getNumChannels());
    const int scratchSamples = std::min(numSamples, branch0Scratch_.getNumSamples());

    branch0Scratch_.clear();
    for (int ch = 0; ch < scratchChannels && ch < branch0Input.getNumChannels(); ++ch) {
        branch0Scratch_.copyFrom(ch, 0, branch0Input, ch, 0, scratchSamples);
    }

    // Bypass mode - pass through branch 0 unchanged
    if (bypass_.load()) {
        output.clear();
        for (int ch = 0; ch < scratchChannels; ++ch) {
            output.copyFrom(ch, 0, branch0Scratch_, ch, 0, scratchSamples);
        }
        return;
    }

    Mode mode = mode_.load();
    float masterLevel = masterLevel_.load();
    const int activeBranches = std::clamp(numBranches_.load(), 1, MAX_BRANCHES);

    output.clear();

    auto addBranchToOutput = [&](const juce::AudioBuffer<float>& source, float gain) {
        if (std::abs(gain) < 0.001f) {
            return;
        }
        const int channels = std::min(outputChannels, source.getNumChannels());
        const int samples = std::min(numSamples, source.getNumSamples());
        for (int ch = 0; ch < channels; ++ch) {
            output.addFrom(ch, 0, source, ch, 0, samples, gain);
        }
    };

    switch (mode) {
        case Mode::ABBlend: {
            // Crossfade between branch A (0) and branch B (1)
            float blend = abBlend_.load();
            float gainA = std::cos(blend * juce::MathConstants<float>::halfPi);
            float gainB = std::sin(blend * juce::MathConstants<float>::halfPi);

            addBranchToOutput(branch0Scratch_, gainA);

            if (activeBranches > 1) {
                const auto branch1Input = getBusBuffer(buffer, true, 1);
                addBranchToOutput(branch1Input, gainB);
            }
            break;
        }

        case Mode::MultiMix: {
            // Mix all branches with individual levels
            for (int branch = 0; branch < activeBranches; ++branch) {
                float branchLevel = branchLevels_[branch].load();
                if (branch == 0) {
                    addBranchToOutput(branch0Scratch_, branchLevel);
                    continue;
                }
                const auto branchInput = getBusBuffer(buffer, true, branch);
                addBranchToOutput(branchInput, branchLevel);
            }
            break;
        }

        case Mode::WetDry: {
            // Branch 0 = dry, Branch 1 = wet
            float wetLevel = abBlend_.load();
            float dryLevel = 1.0f - wetLevel;

            addBranchToOutput(branch0Scratch_, dryLevel);
            if (activeBranches > 1) {
                const auto wetInput = getBusBuffer(buffer, true, 1);
                addBranchToOutput(wetInput, wetLevel);
            }
            break;
        }
    }

    // Apply master level
    if (std::abs(masterLevel - 1.0f) > 0.001f) {
        output.applyGain(masterLevel);
    }
}

// ========================================
// Control Methods
// ========================================

void ParallelMixerProcessor::setMode(Mode mode) {
    mode_.store(mode);
}

void ParallelMixerProcessor::setABBlend(float blend) {
    abBlend_.store(std::clamp(blend, 0.0f, 1.0f));
}

void ParallelMixerProcessor::setBranchLevel(int branch, float level) {
    if (branch >= 0 && branch < MAX_BRANCHES) {
        branchLevels_[branch].store(std::clamp(level, 0.0f, 2.0f));
    }
}

float ParallelMixerProcessor::getBranchLevel(int branch) const {
    if (branch >= 0 && branch < MAX_BRANCHES) {
        return branchLevels_[branch].load();
    }
    return 0.0f;
}

void ParallelMixerProcessor::setMasterLevel(float level) {
    masterLevel_.store(std::clamp(level, 0.0f, 2.0f));
}

void ParallelMixerProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

void ParallelMixerProcessor::setNumBranches(int num) {
    numBranches_.store(std::clamp(num, 1, MAX_BRANCHES));
}

} // namespace map2
