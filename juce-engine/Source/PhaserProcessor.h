#pragma once

/**
 * MAP2 Audio Engine - Phaser Processor
 * 6-stage phaser with modulated all-pass filters
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>

namespace map2 {

/**
 * PhaserProcessor - Classic phaser effect
 *
 * Features:
 * - 6-stage all-pass filter design
 * - Adjustable LFO rate and depth
 * - Centre frequency control
 * - Feedback for more intense effect
 * - Wet/dry mix
 *
 * All parameters are RT-safe via atomics.
 */
class PhaserProcessor {
public:
    /**
     * Parameters structure for bulk get/set
     */
    struct Parameters {
        float rate = 0.5f;            // Hz (0.05 to 5)
        float depth = 0.5f;           // 0 to 1 (modulation amount)
        float centreFrequency = 1000.0f; // Hz (100 to 10000)
        float feedback = 0.5f;        // -1 to 1
        float mix = 0.5f;             // 0 to 1 (wet/dry)
        bool bypass = false;
    };

    /**
     * Metering data
     */
    struct Metering {
        float inputLevel = -100.0f;   // dB peak
        float outputLevel = -100.0f;  // dB peak
        float lfoPhase = 0.0f;        // 0-1 for visualization
    };

    PhaserProcessor();
    ~PhaserProcessor() = default;

    // Prevent copying
    PhaserProcessor(const PhaserProcessor&) = delete;
    PhaserProcessor& operator=(const PhaserProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset internal state
     */
    void reset();

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio block in-place
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Parameter Control (RT-safe)
    // ========================================

    void setRate(float hz);
    float getRate() const { return rate_.load(); }

    void setDepth(float depth);
    float getDepth() const { return depth_.load(); }

    void setCentreFrequency(float hz);
    float getCentreFrequency() const { return centreFrequency_.load(); }

    void setFeedback(float feedback);
    float getFeedback() const { return feedback_.load(); }

    void setMix(float mix);
    float getMix() const { return mix_.load(); }

    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    Parameters getParameters() const;
    void setParameters(const Parameters& params);

    // ========================================
    // Metering
    // ========================================

    Metering getMetering() const;
    void resetPeaks();

private:
    // JUCE DSP phaser processor
    juce::dsp::Phaser<float> phaser_;

    // Atomic parameters
    std::atomic<float> rate_{0.5f};
    std::atomic<float> depth_{0.5f};
    std::atomic<float> centreFrequency_{1000.0f};
    std::atomic<float> feedback_{0.5f};
    std::atomic<float> mix_{0.5f};
    std::atomic<bool> bypass_{false};

    // Metering
    std::atomic<float> inputLevel_{-100.0f};
    std::atomic<float> outputLevel_{-100.0f};
    std::atomic<float> lfoPhase_{0.0f};

    // State
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;

    std::atomic<bool> parametersChanged_{true};

    // Helpers
    void updatePhaserParameters();
    static float calculatePeakLevel(const juce::AudioBuffer<float>& buffer);
    static float linearToDb(float linear);
};

} // namespace map2
