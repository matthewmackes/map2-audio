#pragma once

/**
 * MAP2 Audio Engine - Lexicon MPX-1 Hardware Processor
 * AudioProcessor subclass for integrating the Lexicon MPX-1 hardware
 * effects unit into the JUCE AudioProcessorGraph via S/PDIF send/return.
 *
 * Audio path: S/PDIF Coax via Edirol UA-1000
 *   Send:   playback channels 9-10 (0-indexed: 8-9)
 *   Return: capture channels 5-6  (0-indexed: 4-5)
 *
 * Parameter control: via MPX1Service (Python MIDI SysEx bridge)
 * This processor handles ONLY audio routing and latency compensation.
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include "Common.h"
#include <array>
#include <atomic>
#include <vector>

namespace map2 {

class LexiconHardwareProcessor : public juce::AudioProcessor {
public:
    // Synthetic URI for plugin identification
    static constexpr const char* PLUGIN_URI = "hardware://lexicon-mpx1-spdif";
    static constexpr const char* PLUGIN_NAME = "Lexicon MPX-1";

    // UA-1000 S/PDIF channel indices (0-based)
    static constexpr int SPDIF_SEND_LEFT   = 8;   // playback ch 9
    static constexpr int SPDIF_SEND_RIGHT  = 9;   // playback ch 10
    static constexpr int SPDIF_RETURN_LEFT  = 4;   // capture ch 5
    static constexpr int SPDIF_RETURN_RIGHT = 5;   // capture ch 6

    // Maximum expected round-trip latency (for delay buffer sizing)
    static constexpr int MAX_LATENCY_SAMPLES = 4096;

    LexiconHardwareProcessor();
    ~LexiconHardwareProcessor() override = default;

    // ========================================
    // juce::AudioProcessor interface
    // ========================================

    const juce::String getName() const override;
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& midiMessages) override;

    double getTailLengthSeconds() const override;
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    // ========================================
    // Hardware I/O buffer management
    // ========================================

    /**
     * Set raw hardware I/O buffer pointers.
     * Called by Map2AudioEngine BEFORE graph processing each callback.
     * These point to the full multi-channel hardware buffers.
     */
    void setHardwareBuffers(const float* const* inputChannels,
                            float* const* outputChannels,
                            int numInputChannels,
                            int numOutputChannels);

    // ========================================
    // Latency compensation
    // ========================================

    /**
     * Report measured S/PDIF round-trip latency for JUCE PDC.
     * JUCE's AudioProcessorGraph uses this to align the hardware
     * insert with other plugins in the chain.
     */
    void setMeasuredLatencySamples(int samples);

    // ========================================
    // Controls (RT-safe via atomics)
    // ========================================

    bool isBypassed() const { return bypassed_.load(std::memory_order_relaxed); }
    void setBypass(bool bypass) { bypassed_.store(bypass, std::memory_order_relaxed); }

    void setDryWetMix(float mix) {
        dryWetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_relaxed);
    }
    float getDryWetMix() const { return dryWetMix_.load(std::memory_order_relaxed); }

    void setSendGainDb(float db) {
        sendGainLinear_.store(dbToLinear(juce::jlimit(-60.0f, 12.0f, db)),
                             std::memory_order_relaxed);
    }
    void setReturnGainDb(float db) {
        returnGainLinear_.store(dbToLinear(juce::jlimit(-60.0f, 12.0f, db)),
                               std::memory_order_relaxed);
    }

    float getSendGainLinear() const { return sendGainLinear_.load(std::memory_order_relaxed); }
    float getReturnGainLinear() const { return returnGainLinear_.load(std::memory_order_relaxed); }

private:
    // Hardware buffer pointers (set each callback, NOT owned)
    const float* const* hwInputs_ = nullptr;
    float* const* hwOutputs_ = nullptr;
    int hwNumInputs_ = 0;
    int hwNumOutputs_ = 0;

    // Latency compensation circular delay buffers (L, R)
    std::array<std::vector<float>, 2> delayBuffers_;
    int delayWritePos_ = 0;
    int delayBufferSize_ = 0;

    // Controls
    std::atomic<bool> bypassed_{false};
    std::atomic<float> dryWetMix_{1.0f};
    std::atomic<float> sendGainLinear_{1.0f};
    std::atomic<float> returnGainLinear_{1.0f};

    // Pre-allocated dry buffer for bypass blending
    juce::AudioBuffer<float> dryBuffer_;

    // Processing state
    double currentSampleRate_ = DEFAULT_SAMPLE_RATE;
    int currentBlockSize_ = DEFAULT_BUFFER_SIZE;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LexiconHardwareProcessor)
};

} // namespace map2
