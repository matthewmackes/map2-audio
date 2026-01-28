#pragma once

/**
 * MAP2 Audio Engine - Phase Correlation Meter
 * Stereo phase correlation and balance measurement
 */

#include "Common.h"
#include <atomic>

namespace map2 {

/**
 * PhaseCorrelationMeter - Stereo field analysis
 *
 * Provides:
 * - Phase correlation (-1 to +1)
 *   -1 = Out of phase (mono cancellation)
 *    0 = Uncorrelated (stereo)
 *   +1 = In phase (mono compatible)
 *
 * - Stereo balance (-1 to +1)
 *   -1 = Full left
 *    0 = Center
 *   +1 = Full right
 */
class PhaseCorrelationMeter {
public:
    PhaseCorrelationMeter();
    ~PhaseCorrelationMeter() = default;

    // Prevent copying
    PhaseCorrelationMeter(const PhaseCorrelationMeter&) = delete;
    PhaseCorrelationMeter& operator=(const PhaseCorrelationMeter&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for measurement
     * @param sampleRate Audio sample rate
     */
    void prepare(double sampleRate);

    /**
     * Reset measurements
     */
    void reset();

    // ========================================
    // Processing (call from audio thread)
    // ========================================

    /**
     * Process stereo audio
     * @param left Left channel samples
     * @param right Right channel samples
     * @param numSamples Number of samples
     */
    void process(const float* left, const float* right, int numSamples);

    // ========================================
    // Measurement retrieval (thread-safe)
    // ========================================

    /**
     * Get phase correlation (-1 to +1)
     */
    float getCorrelation() const { return correlation_.load(); }

    /**
     * Get stereo balance (-1 to +1)
     */
    float getBalance() const { return balance_.load(); }

    /**
     * Get stereo width (0 to 1)
     * 0 = Mono, 1 = Full stereo
     */
    float getStereoWidth() const;

    // ========================================
    // Configuration
    // ========================================

    /**
     * Set measurement time constant
     * @param timeMs Averaging time in milliseconds
     */
    void setAveragingTime(float timeMs);
    float getAveragingTime() const { return averagingTimeMs_; }

private:
    double sampleRate_ = 48000.0;
    float averagingTimeMs_ = 300.0f;  // 300ms default
    float smoothingCoeff_ = 0.0f;

    // Running sums for correlation calculation
    // correlation = sumLR / sqrt(sumLL * sumRR)
    float sumLL_ = 0.0f;  // Sum of left * left
    float sumRR_ = 0.0f;  // Sum of right * right
    float sumLR_ = 0.0f;  // Sum of left * right

    // Balance calculation
    float sumL_ = 0.0f;   // Sum of |left|
    float sumR_ = 0.0f;   // Sum of |right|

    // Output values (atomic for thread safety)
    std::atomic<float> correlation_{0.0f};
    std::atomic<float> balance_{0.0f};

    // Helper
    void updateSmoothingCoeff();
};

} // namespace map2
