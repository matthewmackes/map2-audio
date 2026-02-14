#pragma once

/**
 * MAP2 Audio Engine - JUCE Audio I/O
 * Cross-platform audio device management using JUCE AudioDeviceManager
 * Replaces direct ALSA implementation for portability
 */

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"

#ifdef HAS_AVB
#include "AvbAudioIODeviceType.h"
#endif

namespace map2 {

/**
 * JuceAudioIO - Cross-platform audio I/O using JUCE
 *
 * Provides:
 * - Device enumeration (ALSA, JACK, CoreAudio, WASAPI)
 * - Sample rate and buffer size configuration
 * - Callback-based audio processing
 * - Automatic device recovery
 */
class JuceAudioIO : public juce::AudioIODeviceCallback {
public:
    JuceAudioIO();
    ~JuceAudioIO() override;

    // Prevent copying
    JuceAudioIO(const JuceAudioIO&) = delete;
    JuceAudioIO& operator=(const JuceAudioIO&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize the audio system
     * @param preferredDeviceName Device name (empty for default)
     * @param sampleRate Preferred sample rate
     * @param bufferSize Preferred buffer size
     * @param numInputChannels Number of input channels (0 for output-only)
     * @param numOutputChannels Number of output channels
     * @return true if successful
     */
    bool initialize(const std::string& preferredDeviceName = "",
                   double sampleRate = DEFAULT_SAMPLE_RATE,
                   int bufferSize = DEFAULT_BUFFER_SIZE,
                   int numInputChannels = 2,
                   int numOutputChannels = 2);

    void shutdown();
    bool isInitialized() const { return initialized_; }

    // ========================================
    // Device enumeration
    // ========================================

    std::vector<AudioDeviceInfo> getAvailableDevices();
    std::vector<AudioDeviceInfo> getInputDevices();
    std::vector<AudioDeviceInfo> getOutputDevices();

    AudioDeviceInfo getCurrentDevice() const;
    std::string getCurrentDeviceName() const;

    // ========================================
    // Audio control
    // ========================================

    bool startAudio();
    bool stopAudio();
    bool isAudioRunning() const { return audioRunning_.load(); }

    /**
     * Change audio device at runtime
     * @param deviceName Name of device to switch to
     * @return true if successful
     */
    bool setDevice(const std::string& deviceName);

    /**
     * Change sample rate (may require device restart)
     */
    bool setSampleRate(double sampleRate);
    double getSampleRate() const { return currentSampleRate_; }

    /**
     * Change buffer size (may require device restart)
     */
    bool setBufferSize(int bufferSize);
    int getBufferSize() const { return currentBufferSize_; }

    // ========================================
    // Audio callback
    // ========================================

    /**
     * Audio processing callback type
     * @param inputChannelData Array of input channel pointers (may be nullptr)
     * @param numInputChannels Number of input channels
     * @param outputChannelData Array of output channel pointers
     * @param numOutputChannels Number of output channels
     * @param numSamples Number of samples in this buffer
     */
    // RT-SAFE: Use atomic shared_ptr to allow lock-free callback swapping
    // std::function itself isn't atomic; we use atomic_load/store on shared_ptr
    using ProcessCallback = std::function<void(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples
    )>;

    void setProcessCallback(ProcessCallback callback);

    // ========================================
    // Statistics & Diagnostics
    // ========================================

    struct AudioStats {
        double cpuUsage = 0.0;
        int xrunCount = 0;              // Total xruns detected
        int xrunsSinceReset = 0;        // Xruns since last reset
        double latencyMs = 0.0;         // Buffer latency
        int64_t samplesProcessed = 0;
        // Callback timing analysis
        double callbackJitterMs = 0.0;       // Smoothed jitter (std dev of callback interval)
        double peakCallbackJitterMs = 0.0;   // Peak jitter observed
        double avgCallbackDurationMs = 0.0;  // Average processing time per callback
        double peakCallbackDurationMs = 0.0; // Peak processing time
        double callbackBudgetMs = 0.0;       // Available time per callback
        double budgetUtilization = 0.0;      // % of budget used (>100 = overrun)
        // Connection health
        bool deviceConnected = false;
        int recoveryCount = 0;               // Number of auto-recoveries
        double uptimeSeconds = 0.0;          // Time since last successful start
        int64_t lastXrunTimestamp = 0;       // Unix timestamp of last xrun
        // Latency measurement
        double measuredRoundTripMs = -1.0;   // -1 = not measured yet
        double measuredInputLatencyMs = 0.0;
        double measuredOutputLatencyMs = 0.0;
    };

    AudioStats getStats() const;
    void resetStats();
    void resetXrunCounter();

    /**
     * Get xrun history (timestamps of recent xruns)
     * @return Vector of unix timestamps (ms) for last N xruns
     */
    std::vector<int64_t> getXrunHistory() const;

    /**
     * Get connection health summary
     */
    struct ConnectionHealth {
        bool deviceConnected = false;
        bool jackServerRunning = false;
        std::string currentBackend;        // "JACK", "ALSA", etc.
        int recoveryAttempts = 0;
        int successfulRecoveries = 0;
        double lastRecoveryTimeSec = 0.0;
        std::string lastError;
    };
    ConnectionHealth getConnectionHealth() const;

    /**
     * Report measured round-trip latency (from external loopback test)
     */
    void setMeasuredRoundTripLatency(double ms);

    /**
     * Get the device-reported input + output latency in ms
     */
    double getDeviceReportedLatencyMs() const;

    // ========================================
    // JUCE AudioIODeviceCallback interface
    // ========================================

    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;

    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;
    void audioDeviceError(const juce::String& errorMessage) override;

    // ========================================
    // Direct JUCE access (for advanced use)
    // ========================================

    juce::AudioDeviceManager& getDeviceManager() { return deviceManager_; }
    const juce::AudioDeviceManager& getDeviceManager() const { return deviceManager_; }

private:
    juce::AudioDeviceManager deviceManager_;
    std::shared_ptr<ProcessCallback> processCallback_{nullptr};

    bool initialized_ = false;
    std::atomic<bool> audioRunning_{false};

    double currentSampleRate_ = DEFAULT_SAMPLE_RATE;
    int currentBufferSize_ = DEFAULT_BUFFER_SIZE;
    int numInputChannels_ = 2;
    int numOutputChannels_ = 2;

    // Statistics
    mutable std::mutex statsMutex_;
    AudioStats stats_;
    std::chrono::high_resolution_clock::time_point lastCallbackTime_;
    bool firstCallback_ = true;  // Skip jitter calc on first callback

    // Callback timing analysis (lock-free atomics for RT safety)
    std::atomic<double> callbackIntervalSmoothed_{0.0};
    std::atomic<double> callbackJitterSmoothed_{0.0};
    std::atomic<double> peakJitter_{0.0};
    std::atomic<double> peakCallbackDuration_{0.0};
    std::atomic<double> callbackDurationSmoothed_{0.0};
    static constexpr double JITTER_SMOOTHING = 0.05;  // EMA alpha
    static constexpr double DURATION_SMOOTHING = 0.1;
    static constexpr double XRUN_JITTER_THRESHOLD = 2.0; // 2x expected interval = xrun

    // Xrun history ring buffer (last 64 xrun timestamps)
    static constexpr int XRUN_HISTORY_SIZE = 64;
    std::array<int64_t, XRUN_HISTORY_SIZE> xrunHistory_{};
    std::atomic<int> xrunHistoryHead_{0};
    void recordXrun();  // Thread-safe xrun recording

    // Error handling
    std::string lastError_;

    // Connection health
    struct ConnectionState {
        std::atomic<bool> deviceConnected{false};
        std::atomic<int> recoveryAttempts{0};
        std::atomic<int> successfulRecoveries{0};
        std::chrono::steady_clock::time_point lastRecoveryTime{};
        std::chrono::steady_clock::time_point audioStartTime{};
        std::string lastError;
        std::string currentBackend;
    } connectionState_;

    // Device recovery
    std::atomic<bool> recoveryInProgress_{false};
    juce::AudioDeviceManager::AudioDeviceSetup lastSetup_{};
    bool recoveryEnabled_ = true;
    static constexpr int MAX_RECOVERY_ATTEMPTS = 5;
    static constexpr int RECOVERY_BACKOFF_MS = 500;  // Doubles each attempt

    // Measured latency (from external loopback test)
    std::atomic<double> measuredRoundTripMs_{-1.0};

    // Helper methods
    AudioDeviceInfo deviceToInfo(juce::AudioIODevice* device) const;
    void updateStats(int numSamples, double processingTime);
    bool attemptRecovery(int attempt = 0);
};

} // namespace map2
