#pragma once

/**
 * MAP2 Audio Engine - Parameter Bridge
 * RT-safe parameter routing between UI, MIDI, and audio thread
 * With JUCE SmoothedValue for click-free parameter changes
 */

#include "Common.h"
#include <juce_audio_basics/juce_audio_basics.h>
#include <functional>
#include <queue>

namespace map2 {

// Parameter update message
struct ParameterUpdate {
    InstanceId pluginId;
    int paramIndex;
    float value;
    double timestamp;
};

// Smoothing type enum (compatible with all JUCE versions)
enum class SmoothingType { Linear, Multiplicative };

// Parameter smoothing configuration
struct SmoothingConfig {
    bool enabled = true;
    float rampTimeMs = 20.0f;  // Default 20ms smoothing
    SmoothingType type = SmoothingType::Linear;
};

class ParameterBridge {
public:
    ParameterBridge();
    ~ParameterBridge();

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing - must be called before audio starts
     * @param sampleRate Audio sample rate
     * @param blockSize Expected block size
     */
    void prepare(double sampleRate, int blockSize);

    // ========================================
    // Parameter Changes
    // ========================================

    // Queue a parameter change (thread-safe, non-blocking)
    bool queueParameterChange(InstanceId pluginId, int paramIndex, float value);
    bool queueParameterChange(InstanceId pluginId, const std::string& paramName, float value);

    // Process queued changes (call from audio thread)
    // Handler receives smoothed values
    void processQueue(std::function<void(const ParameterUpdate&)> handler);

    // Process smoothing for one block (call from audio thread after processQueue)
    // Returns parameter updates with smoothed values
    void processSmoothingBlock(int numSamples,
                               std::function<void(InstanceId, int, float)> handler);

    // Direct parameter access (for UI)
    void setParameter(InstanceId pluginId, int paramIndex, float value);
    float getParameter(InstanceId pluginId, int paramIndex) const;

    // Get current smoothed value (for audio thread)
    float getSmoothedValue(InstanceId pluginId, int paramIndex) const;

    // Check if parameter is still smoothing
    bool isSmoothing(InstanceId pluginId, int paramIndex) const;

    // ========================================
    // Smoothing Configuration
    // ========================================

    /**
     * Set global smoothing time for all parameters
     * @param timeMs Smoothing time in milliseconds (0 = instant)
     */
    void setGlobalSmoothingTime(float timeMs);
    float getGlobalSmoothingTime() const { return globalSmoothingTimeMs_; }

    /**
     * Enable/disable smoothing globally
     */
    void setGlobalSmoothingEnabled(bool enabled);
    bool isGlobalSmoothingEnabled() const { return globalSmoothingEnabled_; }

    /**
     * Configure smoothing for a specific parameter
     */
    void setParameterSmoothing(InstanceId pluginId, int paramIndex,
                               const SmoothingConfig& config);
    SmoothingConfig getParameterSmoothing(InstanceId pluginId, int paramIndex) const;

    /**
     * Disable smoothing for a specific parameter (instant changes)
     */
    void disableParameterSmoothing(InstanceId pluginId, int paramIndex);

    // ========================================
    // Automation
    // ========================================

    void startRecording();
    void stopRecording();
    bool isRecording() const { return recording_; }
    std::vector<ParameterUpdate> getRecordedAutomation() const;
    void clearRecordedAutomation();

    void startPlayback();
    void stopPlayback();
    bool isPlaying() const { return playing_; }
    void setAutomation(const std::vector<ParameterUpdate>& automation);

    // Get updates since last check (for UI sync)
    std::vector<ParameterUpdate> getRecentUpdates();

    // ========================================
    // Plugin Management
    // ========================================

    /**
     * Register a parameter for a plugin (enables name-based access)
     */
    void registerParameter(InstanceId pluginId, int paramIndex,
                          const std::string& name, float defaultValue = 0.0f);

    /**
     * Remove all parameters for a plugin
     */
    void unregisterPlugin(InstanceId pluginId);

private:
    // Lock-free queue for RT thread
    static constexpr size_t QUEUE_SIZE = 1024;
    std::array<ParameterUpdate, QUEUE_SIZE> ringBuffer_;
    std::atomic<size_t> writePos_{0};
    std::atomic<size_t> readPos_{0};

    // Current parameter values (raw target values)
    mutable std::mutex valueMutex_;
    std::map<std::pair<InstanceId, int>, float> parameterValues_;
    std::map<std::pair<InstanceId, std::string>, int> nameToIndex_;

    // Smoothed parameter values (for audio thread)
    struct SmoothedParameter {
        juce::SmoothedValue<float> smoother;
        SmoothingConfig config;
        float targetValue = 0.0f;
        bool needsUpdate = false;
    };
    mutable std::mutex smootherMutex_;
    std::map<std::pair<InstanceId, int>, SmoothedParameter> smoothedParams_;

    // Global smoothing settings
    std::atomic<float> globalSmoothingTimeMs_{20.0f};
    std::atomic<bool> globalSmoothingEnabled_{true};
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;

    // Automation
    std::atomic<bool> recording_{false};
    std::atomic<bool> playing_{false};
    mutable std::mutex automationMutex_;
    std::vector<ParameterUpdate> recordedAutomation_;
    std::vector<ParameterUpdate> playbackAutomation_;
    size_t playbackIndex_ = 0;

    // Recent updates for UI
    mutable std::mutex recentMutex_;
    std::vector<ParameterUpdate> recentUpdates_;

    // Helpers
    bool enqueue(const ParameterUpdate& update);
    bool dequeue(ParameterUpdate& update);
    void initializeSmoother(SmoothedParameter& param, float initialValue);
    void updateSmootherRampTime(SmoothedParameter& param);
};

} // namespace map2
