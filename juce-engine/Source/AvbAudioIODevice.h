/*
 * AvbAudioIODevice.h - JUCE AudioIODevice implementation for AVB/TSN
 *
 * Makes AVB streams appear as a JUCE audio device, compatible with
 * AudioDeviceManager and the existing audio graph.
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#pragma once

#ifdef HAS_AVB

#include <juce_audio_devices/juce_audio_devices.h>
#include "AvbStream.h"
#include "AvbRingBuffer.h"

#include <memory>
#include <thread>
#include <atomic>

namespace Map2Audio {

/**
 * AVB/TSN Audio I/O Device for JUCE.
 *
 * Implements JUCE's AudioIODevice interface to integrate AVB streams
 * into the existing audio processing pipeline.
 *
 * Architecture:
 * - JUCE audio callback thread: Reads/writes from ring buffers
 * - Network thread: Sends/receives AVTP frames via AvbStream
 * - Lock-free communication via AvbRingBuffer (SPSC)
 *
 * Thread safety:
 * - open()/close()/start()/stop(): Main thread only
 * - audioDeviceIOCallbackWithContext(): JUCE RT thread
 * - networkThreadMain(): Dedicated network thread
 * - Ring buffers provide lock-free RT-safe communication
 */
class AvbAudioIODevice : public juce::AudioIODevice {
public:
    /**
     * Create AVB audio device.
     *
     * @param deviceName Display name (e.g., "AVB Talker (Local)")
     * @param interface Network interface (e.g., "enp3s0")
     * @param streamId Unique 64-bit stream identifier
     * @param destMac Destination MAC address (talker only)
     * @param direction Talker or Listener
     *
     * Throws AvbException if AVB initialization fails.
     */
    AvbAudioIODevice(const juce::String& deviceName,
                      const std::string& interface,
                      uint64_t streamId,
                      const std::string& destMac,
                      AvbDirection direction);

    ~AvbAudioIODevice() override;

    // ========================================================================
    // AudioIODevice Interface
    // ========================================================================

    /**
     * Get list of available sample rates.
     * AVB supports 44.1kHz, 48kHz, 88.2kHz, 96kHz (per IEEE 1722).
     */
    juce::Array<double> getAvailableSampleRates() override;

    /**
     * Get list of available buffer sizes.
     * AVB typically uses 128-256 samples for <2ms latency.
     */
    juce::Array<int> getAvailableBufferSizes() override;

    /**
     * Get default buffer size (256 samples).
     */
    int getDefaultBufferSize() override;

    /**
     * Open device with specified setup.
     *
     * Creates AvbStream but doesn't start network thread yet.
     * Returns empty string on success, error message on failure.
     */
    juce::String open(const juce::BigInteger& inputChannels,
                       const juce::BigInteger& outputChannels,
                       double sampleRate,
                       int bufferSize) override;

    /**
     * Close device and clean up resources.
     */
    void close() override;

    /**
     * Check if device is currently open.
     */
    bool isOpen() override;

    /**
     * Start audio streaming.
     *
     * Spawns network thread and begins AVTP frame transmission/reception.
     */
    void start(juce::AudioIODeviceCallback* callback) override;

    /**
     * Stop audio streaming.
     *
     * Stops network thread and JUCE audio callbacks.
     */
    void stop() override;

    /**
     * Check if device is currently playing.
     */
    bool isPlaying() override;

    /**
     * Get last error message.
     */
    juce::String getLastError() override;

    /**
     * Get current buffer size in samples.
     */
    int getCurrentBufferSizeSamples() override;

    /**
     * Get current sample rate.
     */
    double getCurrentSampleRate() override;

    /**
     * Get current bit depth (always 32 for float).
     */
    int getCurrentBitDepth() override;

    /**
     * Get output channel names.
     */
    juce::StringArray getOutputChannelNames() override;

    /**
     * Get input channel names.
     */
    juce::StringArray getInputChannelNames() override;

    /**
     * Get number of active output channels.
     */
    int getOutputLatencyInSamples() override;

    /**
     * Get number of active input channels.
     */
    int getInputLatencyInSamples() override;

    /**
     * Get active output channel indices.
     */
    juce::Array<double> getAvailableHardwareSampleRates() const;

    /**
     * Get active input channel indices.
     */
    juce::BigInteger getActiveOutputChannels() const override;

    /**
     * Get active input channel indices.
     */
    juce::BigInteger getActiveInputChannels() const override;

    /**
     * Check if device has separate input/output controls.
     */
    bool hasControlPanel() const override;

    /**
     * Show control panel (AVB devices don't have UI controls).
     */
    bool showControlPanel() override;

private:
    /**
     * Network thread main loop.
     *
     * Talker mode:
     * - Read from outputRingBuffer_
     * - Convert to AVTP frames
     * - Send via avbStream_->sendFrame()
     *
     * Listener mode:
     * - Receive AVTP frames via avbStream_->receiveFrame()
     * - Convert to float samples
     * - Write to inputRingBuffer_
     */
    void networkThreadMain();

    /**
     * JUCE audio callback (RT thread).
     *
     * Talker mode:
     * - Write output samples to outputRingBuffer_
     *
     * Listener mode:
     * - Read input samples from inputRingBuffer_
     */
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context);

    /**
     * Get PTP timestamp (nanoseconds since epoch).
     */
    uint64_t getPtpTimestamp() const;

    // Device configuration
    juce::String deviceName_;
    std::string interface_;
    uint64_t streamId_;
    std::string destMac_;
    AvbDirection direction_;

    // JUCE audio state
    std::atomic<bool> isOpen_{false};
    std::atomic<bool> isPlaying_{false};
    juce::AudioIODeviceCallback* callback_{nullptr};

    int bufferSize_{256};
    double sampleRate_{48000.0};
    int numInputChannels_{0};
    int numOutputChannels_{0};
    juce::BigInteger activeInputChannels_;
    juce::BigInteger activeOutputChannels_;

    juce::String lastError_;

    // AVB stream
    std::unique_ptr<AvbStream> avbStream_;

    // Ring buffers for RT-safe audio transfer
    // Power-of-2 size: 8192 samples = ~170ms @ 48kHz
    static constexpr size_t RING_BUFFER_SIZE = 8192;
    std::unique_ptr<AvbRingBuffer<float>> inputRingBuffer_;   // Network -> JUCE
    std::unique_ptr<AvbRingBuffer<float>> outputRingBuffer_;  // JUCE -> Network

    // Network thread
    std::unique_ptr<std::thread> networkThread_;
    std::atomic<bool> networkThreadShouldExit_{false};

    // Constants
    static constexpr int MAX_CHANNELS = 8;
    static constexpr int AVB_SAMPLES_PER_FRAME = 6;  // IEEE 1722 typical
};

} // namespace Map2Audio

#endif // HAS_AVB
