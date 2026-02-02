#pragma once

/**
 * MAP2 Audio Engine - Dynamics Processor
 * Compressor, Limiter, and Noise Gate using JUCE DSP
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <mutex>

namespace map2 {

/**
 * DynamicsProcessor - Multi-mode dynamics processing
 *
 * Supports three modes:
 * - Compressor: Reduces dynamic range above threshold
 * - Limiter: Hard ceiling with fast attack
 * - NoiseGate: Attenuates signal below threshold
 *
 * All parameters are RT-safe via atomics.
 * Metering data updated every process block.
 */
class DynamicsProcessor {
public:
    /**
     * Processing mode
     */
    enum class Mode {
        Compressor,
        Limiter,
        NoiseGate
    };

    /**
     * Parameters structure for bulk get/set
     */
    struct Parameters {
        float threshold = -12.0f;    // dB (-60 to 0)
        float ratio = 4.0f;          // x:1 (1 to 20, inf for limiter)
        float attack = 10.0f;        // ms (0.1 to 500)
        float release = 100.0f;      // ms (10 to 5000)
        float knee = 6.0f;           // dB (0 to 24)
        float makeupGain = 0.0f;     // dB (-12 to 24)
        bool autoMakeup = false;
        Mode mode = Mode::Compressor;
        bool bypass = false;
    };

    /**
     * Metering data - updated every process block
     */
    struct Metering {
        float inputLevel = -100.0f;      // dB peak
        float outputLevel = -100.0f;     // dB peak
        float gainReduction = 0.0f;      // dB (positive value = reduction)
        float inputRms = -100.0f;        // dB RMS
        float outputRms = -100.0f;       // dB RMS
    };

    DynamicsProcessor();
    ~DynamicsProcessor() = default;

    // Prevent copying
    DynamicsProcessor(const DynamicsProcessor&) = delete;
    DynamicsProcessor& operator=(const DynamicsProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     * @param sampleRate Audio sample rate
     * @param samplesPerBlock Maximum block size
     * @param numChannels Number of channels (1 or 2)
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
     * @param buffer Audio buffer (modified in place)
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Parameter Control (RT-safe)
    // ========================================

    /**
     * Set threshold in dB
     * @param dB Threshold level (-60 to 0)
     */
    void setThreshold(float dB);
    float getThreshold() const { return threshold_.load(); }

    /**
     * Set compression ratio
     * @param ratio Ratio (1:1 to 20:1, use 100+ for limiting)
     */
    void setRatio(float ratio);
    float getRatio() const { return ratio_.load(); }

    /**
     * Set attack time
     * @param ms Attack time in milliseconds (0.1 to 500)
     */
    void setAttack(float ms);
    float getAttack() const { return attack_.load(); }

    /**
     * Set release time
     * @param ms Release time in milliseconds (10 to 5000)
     */
    void setRelease(float ms);
    float getRelease() const { return release_.load(); }

    /**
     * Set knee width
     * @param dB Knee width in dB (0 = hard knee, up to 24 = soft)
     */
    void setKnee(float dB);
    float getKnee() const { return knee_.load(); }

    /**
     * Set makeup gain
     * @param dB Makeup gain in dB (-12 to 24)
     */
    void setMakeupGain(float dB);
    float getMakeupGain() const { return makeupGain_.load(); }

    /**
     * Enable/disable auto makeup gain
     */
    void setAutoMakeup(bool enabled);
    bool getAutoMakeup() const { return autoMakeup_.load(); }

    /**
     * Set processing mode
     */
    void setMode(Mode mode);
    Mode getMode() const { return mode_.load(); }

    /**
     * Set bypass state
     */
    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    /**
     * Get all parameters
     */
    Parameters getParameters() const;

    /**
     * Set all parameters at once
     */
    void setParameters(const Parameters& params);

    // ========================================
    // Metering (Thread-safe reads)
    // ========================================

    /**
     * Get current metering data
     * Thread-safe, can be called from any thread
     */
    Metering getMetering() const;

    /**
     * Reset peak hold values
     */
    void resetPeaks();

private:
    // JUCE DSP processors
    juce::dsp::Compressor<float> compressor_;
    juce::dsp::Limiter<float> limiter_;
    juce::dsp::NoiseGate<float> noiseGate_;
    juce::dsp::Gain<float> makeupGainProcessor_;

    // Atomic parameters for RT-safety
    std::atomic<float> threshold_{-12.0f};
    std::atomic<float> ratio_{4.0f};
    std::atomic<float> attack_{10.0f};
    std::atomic<float> release_{100.0f};
    std::atomic<float> knee_{6.0f};
    std::atomic<float> makeupGain_{0.0f};
    std::atomic<bool> autoMakeup_{false};
    std::atomic<Mode> mode_{Mode::Compressor};
    std::atomic<bool> bypass_{false};

    // Metering (atomic for RT-safe reads)
    std::atomic<float> inputLevel_{-100.0f};
    std::atomic<float> outputLevel_{-100.0f};
    std::atomic<float> gainReduction_{0.0f};
    std::atomic<float> inputRms_{-100.0f};
    std::atomic<float> outputRms_{-100.0f};

    // State
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;

    // Parameter update flag
    std::atomic<bool> parametersChanged_{true};

    // Helper methods
    void updateProcessorParameters();
    float calculateAutoMakeupGain() const;

    // Level measurement helpers
    static float calculatePeakLevel(const juce::AudioBuffer<float>& buffer);
    static float calculateRmsLevel(const juce::AudioBuffer<float>& buffer);
    static float linearToDb(float linear);
    static float dbToLinear(float db);
};

} // namespace map2
