#pragma once

/**
 * MAP2 Audio Engine - LUFS Loudness Meter
 * ITU-R BS.1770-4 compliant loudness measurement
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <deque>

namespace map2 {

/**
 * LUFS measurement data
 */
struct LufsLevels {
    float momentary = -100.0f;    // 400ms window (LUFS)
    float shortTerm = -100.0f;    // 3s window (LUFS)
    float integrated = -100.0f;   // Full program (LUFS)
    float range = 0.0f;           // Loudness Range (LU)
    float truePeak = -100.0f;     // True Peak (dBTP)

    // Additional metrics
    float maxMomentary = -100.0f;
    float maxShortTerm = -100.0f;
    float maxTruePeak = -100.0f;
};

/**
 * LufsMeter - ITU-R BS.1770-4 Loudness Measurement
 *
 * Features:
 * - K-weighting filter (two-stage shelving + high-pass)
 * - Momentary loudness (400ms sliding window)
 * - Short-term loudness (3s sliding window)
 * - Integrated loudness with gating
 * - Loudness Range (LRA) calculation
 * - True Peak detection with 4x oversampling
 */
class LufsMeter {
public:
    LufsMeter();
    ~LufsMeter() = default;

    // Prevent copying
    LufsMeter(const LufsMeter&) = delete;
    LufsMeter& operator=(const LufsMeter&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for measurement
     * @param sampleRate Audio sample rate
     * @param numChannels Number of channels (1-8)
     */
    void prepare(double sampleRate, int numChannels = 2);

    /**
     * Reset all measurements
     */
    void reset();

    // ========================================
    // Processing (call from audio thread)
    // ========================================

    /**
     * Process audio buffer
     */
    void process(const juce::AudioBuffer<float>& buffer);

    /**
     * Process with raw pointers
     */
    void process(const float* const* channels, int numChannels, int numSamples);

    // ========================================
    // Measurement retrieval (thread-safe)
    // ========================================

    /**
     * Get current loudness levels
     */
    LufsLevels getLevels() const;

    /**
     * Get momentary loudness (400ms)
     */
    float getMomentary() const;

    /**
     * Get short-term loudness (3s)
     */
    float getShortTerm() const;

    /**
     * Get integrated loudness
     */
    float getIntegrated() const;

    /**
     * Get loudness range (LRA)
     */
    float getLoudnessRange() const;

    /**
     * Get true peak
     */
    float getTruePeak() const;

    // ========================================
    // Control
    // ========================================

    /**
     * Reset integrated measurement
     * Call this when starting a new program/song
     */
    void resetIntegrated();

    /**
     * Set channel weights for surround configurations
     * Default weights: L=R=C=1.0, Ls=Rs=1.41 (back channels)
     */
    void setChannelWeights(const std::vector<float>& weights);

    /**
     * Enable/disable true peak detection (saves CPU if disabled)
     */
    void setTruePeakEnabled(bool enabled);
    bool isTruePeakEnabled() const { return truePeakEnabled_; }

private:
    // Sample rate
    double sampleRate_ = 48000.0;
    int numChannels_ = 2;

    // K-weighting filters (per channel)
    // Stage 1: Pre-filter (high shelf at 1681.97 Hz)
    // Stage 2: RLB filter (high-pass at 38.13 Hz)
    struct KWeightingFilter {
        juce::dsp::IIR::Filter<float> preFilter;
        juce::dsp::IIR::Filter<float> rlbFilter;
    };
    std::vector<KWeightingFilter> kFilters_;

    // Channel weights (for surround)
    std::vector<float> channelWeights_;

    // Measurement windows
    // 400ms momentary (100ms blocks, overlapping)
    static constexpr int BLOCK_SIZE_MS = 100;
    static constexpr int MOMENTARY_BLOCKS = 4;   // 400ms
    static constexpr int SHORT_TERM_BLOCKS = 30; // 3000ms

    std::deque<float> momentaryBlocks_;   // Mean square values
    std::deque<float> shortTermBlocks_;

    // Integrated loudness (gated)
    std::vector<float> integratedBlocks_;  // All blocks for integration
    float relativeThreshold_ = -70.0f;     // Current relative threshold

    // Current block accumulator
    std::vector<double> blockAccumulator_;  // Per-channel sum of squares
    int blockSampleCount_ = 0;
    int samplesPerBlock_ = 0;

    // True peak detection
    bool truePeakEnabled_ = true;
    juce::dsp::Oversampling<float> oversampling_;
    std::atomic<float> truePeak_{0.0f};
    std::atomic<float> maxTruePeak_{0.0f};

    // Output levels
    mutable std::mutex mutex_;
    LufsLevels levels_;

    // Private methods
    void initializeFilters();
    void processBlock();
    float calculateLoudness(const std::deque<float>& blocks) const;
    float calculateIntegratedLoudness() const;
    float calculateLoudnessRange() const;
    void detectTruePeak(const juce::AudioBuffer<float>& buffer);
};

} // namespace map2
