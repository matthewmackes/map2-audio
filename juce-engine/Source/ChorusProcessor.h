#pragma once

/**
 * MAP2 Audio Engine - Chorus Processor
 * Classic stereo chorus with modulation depth, rate, and multiple voices
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>

namespace map2 {

/**
 * ChorusProcessor - Stereo chorus effect
 *
 * Features:
 * - Adjustable rate (LFO speed)
 * - Adjustable depth (modulation amount)
 * - Centre delay time control
 * - Feedback for flanging effects
 * - Wet/dry mix control
 * - Stereo spread
 *
 * All parameters are RT-safe via atomics.
 */
class ChorusProcessor {
public:
    /**
     * Parameters structure for bulk get/set
     */
    struct Parameters {
        float rate = 1.0f;           // Hz (0.1 to 10)
        float depth = 0.5f;          // 0 to 1 (modulation amount)
        float centreDelay = 7.0f;    // ms (1 to 30)
        float feedback = 0.0f;       // -1 to 1
        float mix = 0.5f;            // 0 to 1 (wet/dry)
        float spread = 1.0f;         // 0 to 1 (stereo width)
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

    ChorusProcessor();
    ~ChorusProcessor() = default;

    // Prevent copying
    ChorusProcessor(const ChorusProcessor&) = delete;
    ChorusProcessor& operator=(const ChorusProcessor&) = delete;

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

    void setCentreDelay(float ms);
    float getCentreDelay() const { return centreDelay_.load(); }

    void setFeedback(float feedback);
    float getFeedback() const { return feedback_.load(); }

    void setMix(float mix);
    float getMix() const { return mix_.load(); }

    void setSpread(float spread);
    float getSpread() const { return spread_.load(); }

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
    // JUCE DSP chorus processor
    juce::dsp::Chorus<float> chorus_;

    // Atomic parameters
    std::atomic<float> rate_{1.0f};
    std::atomic<float> depth_{0.5f};
    std::atomic<float> centreDelay_{7.0f};
    std::atomic<float> feedback_{0.0f};
    std::atomic<float> mix_{0.5f};
    std::atomic<float> spread_{1.0f};
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
    void updateChorusParameters();
    static float calculatePeakLevel(const juce::AudioBuffer<float>& buffer);
    static float linearToDb(float linear);
};

} // namespace map2
