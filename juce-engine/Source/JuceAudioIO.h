#pragma once

/**
 * MAP2 Audio Engine - JUCE Audio I/O
 * Cross-platform audio device management using JUCE AudioDeviceManager
 * Replaces direct ALSA implementation for portability
 */

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"

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

    std::vector<AudioDeviceInfo> getAvailableDevices() const;
    std::vector<AudioDeviceInfo> getInputDevices() const;
    std::vector<AudioDeviceInfo> getOutputDevices() const;

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
    using ProcessCallback = std::function<void(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples
    )>;

    void setProcessCallback(ProcessCallback callback);

    // ========================================
    // Statistics
    // ========================================

    struct AudioStats {
        double cpuUsage = 0.0;
        int xrunCount = 0;
        double latencyMs = 0.0;
        int64_t samplesProcessed = 0;
    };

    AudioStats getStats() const;
    void resetStats();

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
    ProcessCallback processCallback_;

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

    // Error handling
    std::string lastError_;

    // Helper methods
    AudioDeviceInfo deviceToInfo(juce::AudioIODevice* device) const;
    void updateStats(int numSamples, double processingTime);
};

} // namespace map2
