/**
 * MAP2 Audio Engine - Parallel Mixer Processor Implementation
 */

#include "ParallelMixerProcessor.h"
#include <algorithm>
#include <cmath>

namespace map2 {

namespace {

constexpr float kZeroCrossThreshold = 1.0e-4f;

float computeABBlendSample(
    const juce::AudioBuffer<float>& branchA,
    const juce::AudioBuffer<float>& branchB,
    int sampleIndex,
    float blend
) {
    const float gainA = std::cos(blend * juce::MathConstants<float>::halfPi);
    const float gainB = std::sin(blend * juce::MathConstants<float>::halfPi);
    const int channelCount = std::min(branchA.getNumChannels(), branchB.getNumChannels());
    if (channelCount <= 0) {
        return 0.0f;
    }

    float summed = 0.0f;
    for (int ch = 0; ch < channelCount; ++ch) {
        summed += (branchA.getSample(ch, sampleIndex) * gainA) + (branchB.getSample(ch, sampleIndex) * gainB);
    }
    return summed / static_cast<float>(channelCount);
}

int findZeroCrossingSample(
    const juce::AudioBuffer<float>& branchA,
    const juce::AudioBuffer<float>& branchB,
    int numSamples,
    float blend
) {
    if (numSamples <= 0) {
        return -1;
    }

    float previous = computeABBlendSample(branchA, branchB, 0, blend);
    if (std::abs(previous) <= kZeroCrossThreshold) {
        return 0;
    }

    for (int sample = 1; sample < numSamples; ++sample) {
        const float current = computeABBlendSample(branchA, branchB, sample, blend);
        if (std::abs(current) <= kZeroCrossThreshold) {
            return sample;
        }
        const bool signChanged = (previous < 0.0f && current > 0.0f) || (previous > 0.0f && current < 0.0f);
        if (signChanged) {
            return sample;
        }
        previous = current;
    }

    return -1;
}

} // namespace

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
    for (auto& tapBuffer : branchTapBuffers_) {
        tapBuffer.setSize(2, samplesPerBlock, false, false, true);
        tapBuffer.clear();
    }
    currentABBlend_.store(abBlend_.load());
    hardSwitchPending_.store(false);
    hardSwitchSamplesRemaining_.store(0);
    hardSwitchCrossfadeSamples_.store(std::max(8, static_cast<int>(std::round(sampleRate * 0.0015))));
    branchTapNumSamples_.store(0);

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
    const int activeBranches = std::clamp(numBranches_.load(), 1, MAX_BRANCHES);

    branch0Scratch_.clear();
    for (int ch = 0; ch < scratchChannels && ch < branch0Input.getNumChannels(); ++ch) {
        branch0Scratch_.copyFrom(ch, 0, branch0Input, ch, 0, scratchSamples);
    }

    auto captureBranchTap = [&](int branchIndex, const juce::AudioBuffer<float>& source) {
        if (branchIndex < 0 || branchIndex >= MAX_BRANCHES) {
            return;
        }
        auto& tapBuffer = branchTapBuffers_[static_cast<size_t>(branchIndex)];
        const int tapChannels = std::min(outputChannels, tapBuffer.getNumChannels());
        const int tapSamples = std::min(numSamples, tapBuffer.getNumSamples());
        tapBuffer.clear();
        for (int ch = 0; ch < tapChannels && ch < source.getNumChannels(); ++ch) {
            tapBuffer.copyFrom(ch, 0, source, ch, 0, tapSamples);
        }
    };
    captureBranchTap(0, branch0Scratch_);
    for (int branch = 1; branch < activeBranches; ++branch) {
        const auto branchInput = getBusBuffer(buffer, true, branch);
        captureBranchTap(branch, branchInput);
    }
    for (int branch = activeBranches; branch < MAX_BRANCHES; ++branch) {
        branchTapBuffers_[static_cast<size_t>(branch)].clear();
    }
    branchTapNumSamples_.store(numSamples, std::memory_order_release);

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
    bool masterLevelAlreadyApplied = false;

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
            const auto branch1Input = activeBranches > 1 ? getBusBuffer(buffer, true, 1) : branch0Scratch_;
            const float targetBlend = abBlend_.load();

            if (hardSwitchPending_.load() && activeBranches > 1) {
                const float startBlend = currentABBlend_.load();
                int remainingSamples = hardSwitchSamplesRemaining_.load();
                const int fadeTotal = std::max(1, hardSwitchCrossfadeSamples_.load());
                int transitionStart = 0;

                if (remainingSamples <= 0) {
                    remainingSamples = fadeTotal;
                    transitionStart = findZeroCrossingSample(branch0Scratch_, branch1Input, numSamples, startBlend);
                    if (transitionStart < 0) {
                        transitionStart = 0;
                    }
                }

                int samplesIntoFade = std::max(0, fadeTotal - remainingSamples);
                float lastBlend = startBlend;

                for (int sample = 0; sample < numSamples; ++sample) {
                    float blend = startBlend;
                    if (sample >= transitionStart) {
                        const int fadeSampleIndex = samplesIntoFade + (sample - transitionStart);
                        const float t = std::clamp(
                            static_cast<float>(fadeSampleIndex + 1) / static_cast<float>(fadeTotal),
                            0.0f,
                            1.0f);
                        blend = startBlend + ((targetBlend - startBlend) * t);
                    }

                    const float gainA = std::cos(blend * juce::MathConstants<float>::halfPi) * masterLevel;
                    const float gainB = std::sin(blend * juce::MathConstants<float>::halfPi) * masterLevel;
                    for (int ch = 0; ch < outputChannels; ++ch) {
                        const float sampleA = ch < branch0Scratch_.getNumChannels() ? branch0Scratch_.getSample(ch, sample) : 0.0f;
                        const float sampleB = ch < branch1Input.getNumChannels() ? branch1Input.getSample(ch, sample) : 0.0f;
                        output.setSample(ch, sample, (sampleA * gainA) + (sampleB * gainB));
                    }
                    lastBlend = blend;
                }

                const int consumedFadeSamples = std::max(0, numSamples - transitionStart);
                remainingSamples = std::max(0, remainingSamples - consumedFadeSamples);
                hardSwitchSamplesRemaining_.store(remainingSamples);
                currentABBlend_.store(remainingSamples == 0 ? targetBlend : lastBlend);
                if (remainingSamples == 0) {
                    hardSwitchPending_.store(false);
                }
                masterLevelAlreadyApplied = true;
                break;
            }

            currentABBlend_.store(targetBlend);
            const float gainA = std::cos(targetBlend * juce::MathConstants<float>::halfPi);
            const float gainB = std::sin(targetBlend * juce::MathConstants<float>::halfPi);

            addBranchToOutput(branch0Scratch_, gainA);
            if (activeBranches > 1) {
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
    if (!masterLevelAlreadyApplied && std::abs(masterLevel - 1.0f) > 0.001f) {
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
    const float normalized = std::clamp(blend, 0.0f, 1.0f);
    abBlend_.store(normalized);
    currentABBlend_.store(normalized);
    hardSwitchPending_.store(false);
    hardSwitchSamplesRemaining_.store(0);
}

void ParallelMixerProcessor::triggerABSwitchToBranch(int branchIndex) {
    const float targetBlend = branchIndex <= 0 ? 0.0f : 1.0f;
    abBlend_.store(targetBlend);
    hardSwitchSamplesRemaining_.store(0);
    hardSwitchPending_.store(true);
}

bool ParallelMixerProcessor::copyBranchTapToBuffer(int branchIndex, juce::AudioBuffer<float>& dest, int numSamples) const {
    if (branchIndex < 0 || branchIndex >= MAX_BRANCHES) {
        return false;
    }

    const int availableSamples = branchTapNumSamples_.load(std::memory_order_acquire);
    if (availableSamples <= 0) {
        return false;
    }

    const auto& tapBuffer = branchTapBuffers_[static_cast<size_t>(branchIndex)];
    const int copySamples = std::min({numSamples, availableSamples, tapBuffer.getNumSamples(), dest.getNumSamples()});
    const int copyChannels = std::min(tapBuffer.getNumChannels(), dest.getNumChannels());
    if (copySamples <= 0 || copyChannels <= 0) {
        return false;
    }

    dest.clear();
    for (int ch = 0; ch < copyChannels; ++ch) {
        dest.copyFrom(ch, 0, tapBuffer, ch, 0, copySamples);
    }
    return true;
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
