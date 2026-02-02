/**
 * MAP2 Audio Engine - Parallel Mixer Processor Implementation
 */

#include "ParallelMixerProcessor.h"
#include <algorithm>
#include <cmath>

namespace map2 {

ParallelMixerProcessor::ParallelMixerProcessor()
    : AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {

    // Initialize branch levels to unity
    for (auto& level : branchLevels_) {
        level.store(1.0f);
    }

    // Clear buffer flags
    for (auto& flag : branchBufferSet_) {
        flag = false;
    }
}

void ParallelMixerProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;

    // Pre-allocate branch buffers
    for (auto& buffer : branchBuffers_) {
        buffer.setSize(2, samplesPerBlock);
        buffer.clear();
    }

    prepared_ = true;
}

void ParallelMixerProcessor::releaseResources() {
    prepared_ = false;
}

void ParallelMixerProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                          juce::MidiBuffer& /*midiMessages*/) {
    if (!prepared_) return;

    // Bypass mode - pass through unchanged
    if (bypass_.load()) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    const int numSamples = buffer.getNumSamples();

    Mode mode = mode_.load();
    float masterLevel = masterLevel_.load();

    // Lock for buffer access
    std::lock_guard<std::mutex> lock(bufferMutex_);

    // Clear output buffer
    buffer.clear();

    switch (mode) {
        case Mode::ABBlend: {
            // Crossfade between branch A (0) and branch B (1)
            float blend = abBlend_.load();
            float gainA = std::cos(blend * juce::MathConstants<float>::halfPi);
            float gainB = std::sin(blend * juce::MathConstants<float>::halfPi);

            for (int ch = 0; ch < numChannels; ++ch) {
                auto* out = buffer.getWritePointer(ch);

                if (branchBufferSet_[0] && ch < branchBuffers_[0].getNumChannels()) {
                    const auto* dataA = branchBuffers_[0].getReadPointer(ch);
                    for (int i = 0; i < numSamples; ++i) {
                        out[i] += dataA[i] * gainA;
                    }
                }

                if (branchBufferSet_[1] && ch < branchBuffers_[1].getNumChannels()) {
                    const auto* dataB = branchBuffers_[1].getReadPointer(ch);
                    for (int i = 0; i < numSamples; ++i) {
                        out[i] += dataB[i] * gainB;
                    }
                }
            }
            break;
        }

        case Mode::MultiMix: {
            // Mix all branches with individual levels
            for (int branch = 0; branch < numBranches_; ++branch) {
                if (!branchBufferSet_[branch]) continue;

                float branchLevel = branchLevels_[branch].load();
                if (branchLevel < 0.001f) continue;

                for (int ch = 0; ch < numChannels; ++ch) {
                    if (ch >= branchBuffers_[branch].getNumChannels()) continue;

                    auto* out = buffer.getWritePointer(ch);
                    const auto* data = branchBuffers_[branch].getReadPointer(ch);

                    for (int i = 0; i < numSamples; ++i) {
                        out[i] += data[i] * branchLevel;
                    }
                }
            }
            break;
        }

        case Mode::WetDry: {
            // Branch 0 = dry, Branch 1 = wet
            float wetLevel = abBlend_.load();
            float dryLevel = 1.0f - wetLevel;

            for (int ch = 0; ch < numChannels; ++ch) {
                auto* out = buffer.getWritePointer(ch);

                // Dry signal (branch 0)
                if (branchBufferSet_[0] && ch < branchBuffers_[0].getNumChannels()) {
                    const auto* dry = branchBuffers_[0].getReadPointer(ch);
                    for (int i = 0; i < numSamples; ++i) {
                        out[i] += dry[i] * dryLevel;
                    }
                }

                // Wet signal (branch 1)
                if (branchBufferSet_[1] && ch < branchBuffers_[1].getNumChannels()) {
                    const auto* wet = branchBuffers_[1].getReadPointer(ch);
                    for (int i = 0; i < numSamples; ++i) {
                        out[i] += wet[i] * wetLevel;
                    }
                }
            }
            break;
        }
    }

    // Apply master level
    if (std::abs(masterLevel - 1.0f) > 0.001f) {
        buffer.applyGain(masterLevel);
    }

    // Clear branch buffer flags for next cycle
    for (auto& flag : branchBufferSet_) {
        flag = false;
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
    numBranches_ = std::clamp(num, 1, MAX_BRANCHES);
}

// ========================================
// Branch Buffer Management
// ========================================

void ParallelMixerProcessor::setBranchBuffer(int branch, const juce::AudioBuffer<float>& buffer) {
    if (branch < 0 || branch >= MAX_BRANCHES) return;

    std::lock_guard<std::mutex> lock(bufferMutex_);

    // Copy the buffer
    const int numChannels = std::min(buffer.getNumChannels(), branchBuffers_[branch].getNumChannels());
    const int numSamples = std::min(buffer.getNumSamples(), branchBuffers_[branch].getNumSamples());

    for (int ch = 0; ch < numChannels; ++ch) {
        branchBuffers_[branch].copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    branchBufferSet_[branch] = true;
}

void ParallelMixerProcessor::clearBranchBuffers() {
    std::lock_guard<std::mutex> lock(bufferMutex_);

    for (int i = 0; i < MAX_BRANCHES; ++i) {
        branchBuffers_[i].clear();
        branchBufferSet_[i] = false;
    }
}

bool ParallelMixerProcessor::hasBranchBuffer(int branch) const {
    if (branch < 0 || branch >= MAX_BRANCHES) return false;
    return branchBufferSet_[branch];
}

} // namespace map2
