#pragma once

/**
 * MAP2 Audio Engine - CPU Monitor
 * Real-time CPU usage monitoring for audio processing
 */

#include "Common.h"
#include <chrono>
#include <map>
#include <atomic>
#include <mutex>

namespace map2 {

// CPUMetrics is defined in Common.h

/**
 * CPUMonitor - Audio thread CPU monitoring
 *
 * Features:
 * - Total audio callback CPU measurement
 * - Per-plugin CPU breakdown
 * - XRun (underrun/overrun) counting
 * - Peak and average tracking
 * - Thread-safe access
 */
class CPUMonitor {
public:
    CPUMonitor();
    ~CPUMonitor() = default;

    // Prevent copying
    CPUMonitor(const CPUMonitor&) = delete;
    CPUMonitor& operator=(const CPUMonitor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare monitor with audio settings
     * @param sampleRate Audio sample rate
     * @param bufferSize Buffer size in samples
     */
    void prepare(double sampleRate, int bufferSize);

    /**
     * Reset all measurements
     */
    void reset();

    // ========================================
    // Callback measurement (audio thread)
    // ========================================

    /**
     * Mark start of audio callback
     * Call at the very beginning of your audio callback
     */
    void beginCallback();

    /**
     * Mark end of audio callback
     * Call at the very end of your audio callback
     */
    void endCallback();

    // ========================================
    // Per-plugin measurement (audio thread)
    // ========================================

    /**
     * Mark start of plugin processing
     */
    void beginPlugin(InstanceId pluginId);

    /**
     * Mark end of plugin processing
     */
    void endPlugin(InstanceId pluginId);

    /**
     * Remove plugin from tracking
     */
    void removePlugin(InstanceId pluginId);

    // ========================================
    // XRun reporting
    // ========================================

    /**
     * Report an xrun (underrun/overrun)
     */
    void reportXRun();

    /**
     * Get xrun count
     */
    int getXRunCount() const { return xrunCount_.load(); }

    /**
     * Reset xrun counter
     */
    void resetXRunCount() { xrunCount_ = 0; }

    // ========================================
    // Metrics retrieval (thread-safe)
    // ========================================

    /**
     * Get current CPU metrics
     */
    CPUMetrics getMetrics() const;

    /**
     * Get total CPU usage
     */
    double getTotalCpu() const;

    /**
     * Get CPU usage for a specific plugin
     */
    double getPluginCpu(InstanceId pluginId) const;

    /**
     * Get peak CPU usage
     */
    double getPeakCpu() const { return peakCpu_.load(); }

    // ========================================
    // Configuration
    // ========================================

    /**
     * Set smoothing factor (0.0 = no smoothing, 1.0 = max smoothing)
     */
    void setSmoothingFactor(float factor);
    float getSmoothingFactor() const { return smoothingFactor_; }

    /**
     * Set peak hold time in seconds
     */
    void setPeakHoldTime(float seconds);

private:
    using Clock = std::chrono::high_resolution_clock;
    using TimePoint = Clock::time_point;

    // Audio settings
    double sampleRate_ = 48000.0;
    int bufferSize_ = 256;
    double budgetSeconds_ = 0.0;  // Time available per callback

    // Callback timing
    TimePoint callbackStart_;
    std::atomic<double> currentCpu_{0.0};
    std::atomic<double> smoothedCpu_{0.0};

    // Per-plugin timing
    struct PluginTiming {
        TimePoint startTime;
        std::atomic<double> currentCpu{0.0};
        std::atomic<double> smoothedCpu{0.0};
    };
    // RT-SAFE: Use try_to_lock only, never block on audio thread
    mutable std::mutex pluginMutex_;  // Only locked with try_to_lock
    std::map<InstanceId, PluginTiming> pluginTimings_;

    // XRun tracking
    std::atomic<int> xrunCount_{0};

    // Peak tracking
    std::atomic<double> peakCpu_{0.0};
    TimePoint peakTime_;
    float peakHoldSeconds_ = 2.0f;

    // Average tracking
    std::atomic<double> avgAccumulator_{0.0};
    std::atomic<int> avgCount_{0};

    // Smoothing
    float smoothingFactor_ = 0.1f;  // Lower = more responsive

    // Helper methods
    double measureDuration(TimePoint start) const;
    void updatePeak(double cpu);
};

} // namespace map2
