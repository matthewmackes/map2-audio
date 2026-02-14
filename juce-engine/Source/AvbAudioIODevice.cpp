/*
 * AvbAudioIODevice.cpp - JUCE AudioIODevice for AVB/TSN Implementation
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#ifdef HAS_AVB

#include "AvbAudioIODevice.h"
#include <cstring>
#include <chrono>

namespace Map2Audio {

// ============================================================================
// Constructor / Destructor
// ============================================================================

AvbAudioIODevice::AvbAudioIODevice(
    const juce::String& deviceName,
    const std::string& interface,
    uint64_t streamId,
    const std::string& destMac,
    AvbDirection direction)
    : juce::AudioIODevice(deviceName, "AVB/TSN")
    , deviceName_(deviceName)
    , interface_(interface)
    , streamId_(streamId)
    , destMac_(destMac)
    , direction_(direction)
{
    // Ring buffers created on-demand in open()
}

AvbAudioIODevice::~AvbAudioIODevice() {
    close();
}

// ============================================================================
// AudioIODevice Interface - Configuration
// ============================================================================

juce::Array<double> AvbAudioIODevice::getAvailableSampleRates() {
    // IEEE 1722 AVB audio format supports these rates
    return {44100.0, 48000.0, 88200.0, 96000.0};
}

juce::Array<int> AvbAudioIODevice::getAvailableBufferSizes() {
    // AVB typically uses 128-512 samples for low latency
    // Larger buffers reduce network overhead but increase latency
    return {128, 256, 512, 1024};
}

int AvbAudioIODevice::getDefaultBufferSize() {
    return 256; // Good balance of latency vs overhead
}

// ============================================================================
// AudioIODevice Interface - Open/Close
// ============================================================================

juce::String AvbAudioIODevice::open(
    const juce::BigInteger& inputChannels,
    const juce::BigInteger& outputChannels,
    double sampleRate,
    int bufferSize)
{
    close(); // Close if already open

    // Validate parameters
    if (sampleRate <= 0 || bufferSize <= 0) {
        lastError_ = "Invalid sample rate or buffer size";
        return lastError_;
    }

    // Count active channels
    numInputChannels_ = inputChannels.countNumberOfSetBits();
    numOutputChannels_ = outputChannels.countNumberOfSetBits();

    if (direction_ == AvbDirection::Talker && numOutputChannels_ == 0) {
        lastError_ = "Talker device requires output channels";
        return lastError_;
    }

    if (direction_ == AvbDirection::Listener && numInputChannels_ == 0) {
        lastError_ = "Listener device requires input channels";
        return lastError_;
    }

    // Limit to MAX_CHANNELS
    if (numInputChannels_ > MAX_CHANNELS) {
        numInputChannels_ = MAX_CHANNELS;
    }
    if (numOutputChannels_ > MAX_CHANNELS) {
        numOutputChannels_ = MAX_CHANNELS;
    }

    // Store configuration
    sampleRate_ = sampleRate;
    bufferSize_ = bufferSize;
    activeInputChannels_ = inputChannels;
    activeOutputChannels_ = outputChannels;

    // Create ring buffers
    try {
        if (direction_ == AvbDirection::Listener) {
            inputRingBuffer_ = std::make_unique<AvbRingBuffer<float>>(RING_BUFFER_SIZE);
        }
        if (direction_ == AvbDirection::Talker) {
            outputRingBuffer_ = std::make_unique<AvbRingBuffer<float>>(RING_BUFFER_SIZE);
        }
    } catch (const std::exception& e) {
        lastError_ = "Failed to create ring buffers: " + juce::String(e.what());
        return lastError_;
    }

    // Create AVB stream
    try {
        // Parse destination MAC
        uint8_t destMacBytes[6] = {0};
        if (direction_ == AvbDirection::Talker) {
            // Simple MAC parsing (real impl would use proper parser)
            std::sscanf(destMac_.c_str(), "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
                        &destMacBytes[0], &destMacBytes[1], &destMacBytes[2],
                        &destMacBytes[3], &destMacBytes[4], &destMacBytes[5]);
        }

        AvbStreamConfig config;
        config.interface = interface_;
        std::memcpy(config.destMac, destMacBytes, 6);
        config.streamId = streamId_;
        config.direction = direction_;
        config.sampleRate = static_cast<uint32_t>(sampleRate_);
        config.channels = static_cast<uint16_t>(
            direction_ == AvbDirection::Talker ? numOutputChannels_ : numInputChannels_
        );
        config.bitDepth = 32; // Float is 32-bit
        config.samplesPerFrame = AVB_SAMPLES_PER_FRAME;
        config.presentationOffsetUs = 2000; // 2ms presentation offset
        config.priority = 3; // 802.1Q SR Class A
        config.enableTimestamping = true;

        avbStream_ = std::make_unique<AvbStream>(config);

    } catch (const std::exception& e) {
        lastError_ = "Failed to create AVB stream: " + juce::String(e.what());
        inputRingBuffer_.reset();
        outputRingBuffer_.reset();
        return lastError_;
    }

    isOpen_.store(true, std::memory_order_release);
    lastError_ = juce::String();
    return juce::String(); // Success
}

void AvbAudioIODevice::close() {
    if (!isOpen_.load(std::memory_order_acquire)) {
        return;
    }

    stop(); // Stop if playing

    // Clean up
    avbStream_.reset();
    inputRingBuffer_.reset();
    outputRingBuffer_.reset();

    isOpen_.store(false, std::memory_order_release);
}

bool AvbAudioIODevice::isOpen() {
    return isOpen_.load(std::memory_order_acquire);
}

// ============================================================================
// AudioIODevice Interface - Start/Stop
// ============================================================================

void AvbAudioIODevice::start(juce::AudioIODeviceCallback* callback) {
    if (!isOpen()) {
        return;
    }

    if (isPlaying()) {
        stop();
    }

    callback_ = callback;

    // Clear ring buffers
    if (inputRingBuffer_) {
        inputRingBuffer_->reset();
    }
    if (outputRingBuffer_) {
        outputRingBuffer_->reset();
    }

    // Start network thread
    networkThreadShouldExit_.store(false, std::memory_order_release);
    networkThread_ = std::make_unique<std::thread>(&AvbAudioIODevice::networkThreadMain, this);

    // Notify callback
    if (callback_) {
        callback_->audioDeviceAboutToStart(this);
    }

    isPlaying_.store(true, std::memory_order_release);
}

void AvbAudioIODevice::stop() {
    if (!isPlaying()) {
        return;
    }

    isPlaying_.store(false, std::memory_order_release);

    // Stop network thread
    networkThreadShouldExit_.store(true, std::memory_order_release);
    if (networkThread_ && networkThread_->joinable()) {
        networkThread_->join();
    }
    networkThread_.reset();

    // Notify callback
    if (callback_) {
        callback_->audioDeviceStopped();
        callback_ = nullptr;
    }
}

bool AvbAudioIODevice::isPlaying() {
    return isPlaying_.load(std::memory_order_acquire);
}

// ============================================================================
// AudioIODevice Interface - Status
// ============================================================================

juce::String AvbAudioIODevice::getLastError() {
    return lastError_;
}

int AvbAudioIODevice::getCurrentBufferSizeSamples() {
    return bufferSize_;
}

double AvbAudioIODevice::getCurrentSampleRate() {
    return sampleRate_;
}

int AvbAudioIODevice::getCurrentBitDepth() {
    return 32; // Float samples
}

juce::StringArray AvbAudioIODevice::getOutputChannelNames() {
    juce::StringArray names;
    for (int i = 0; i < numOutputChannels_; ++i) {
        names.add("AVB Out " + juce::String(i + 1));
    }
    return names;
}

juce::StringArray AvbAudioIODevice::getInputChannelNames() {
    juce::StringArray names;
    for (int i = 0; i < numInputChannels_; ++i) {
        names.add("AVB In " + juce::String(i + 1));
    }
    return names;
}

int AvbAudioIODevice::getOutputLatencyInSamples() {
    // AVB presentation offset + buffer depth
    return static_cast<int>((2000.0 / 1000000.0) * sampleRate_) + bufferSize_;
}

int AvbAudioIODevice::getInputLatencyInSamples() {
    // Network jitter buffer + processing delay
    return bufferSize_ * 2;
}

juce::BigInteger AvbAudioIODevice::getActiveOutputChannels() const {
    return activeOutputChannels_;
}

juce::BigInteger AvbAudioIODevice::getActiveInputChannels() const {
    return activeInputChannels_;
}

bool AvbAudioIODevice::hasControlPanel() const {
    return false; // No UI controls for AVB devices
}

bool AvbAudioIODevice::showControlPanel() {
    return false;
}

// ============================================================================
// Audio Callback (RT Thread)
// ============================================================================

void AvbAudioIODevice::audioDeviceIOCallbackWithContext(
    const float* const* inputChannelData,
    int numInputChannels,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& /*context*/)
{
    // Talker mode: Write output to ring buffer for network thread
    if (direction_ == AvbDirection::Talker && outputRingBuffer_) {
        // Interleave output channels
        for (int sample = 0; sample < numSamples; ++sample) {
            for (int ch = 0; ch < numOutputChannels; ++ch) {
                if (outputChannelData[ch] != nullptr) {
                    float value = outputChannelData[ch][sample];
                    if (!outputRingBuffer_->push(value)) {
                        // Ring buffer full - underrun
                        avbStream_->getStats().underruns.fetch_add(1, std::memory_order_relaxed);
                    }
                }
            }
        }
    }

    // Listener mode: Read input from ring buffer (filled by network thread)
    if (direction_ == AvbDirection::Listener && inputRingBuffer_) {
        // De-interleave input channels
        for (int sample = 0; sample < numSamples; ++sample) {
            for (int ch = 0; ch < numInputChannels; ++ch) {
                if (inputChannelData[ch] != nullptr) {
                    float value = 0.0f;
                    if (!inputRingBuffer_->pop(value)) {
                        // Ring buffer empty - overrun
                        avbStream_->getStats().overruns.fetch_add(1, std::memory_order_relaxed);
                    }
                    const_cast<float*>(inputChannelData[ch])[sample] = value;
                }
            }
        }
    }
}

// ============================================================================
// Network Thread
// ============================================================================

void AvbAudioIODevice::networkThreadMain() {
    // Set thread name for debugging
    pthread_setname_np(pthread_self(), "AVB Network");

    // Allocate frame buffer
    std::vector<float> frameBuffer(AVB_SAMPLES_PER_FRAME * MAX_CHANNELS);

    while (!networkThreadShouldExit_.load(std::memory_order_acquire)) {
        if (direction_ == AvbDirection::Talker) {
            // Talker: Read from ring buffer, send to network
            size_t samplesRead = outputRingBuffer_->read(
                frameBuffer.data(),
                AVB_SAMPLES_PER_FRAME * numOutputChannels_
            );

            if (samplesRead > 0) {
                uint64_t timestamp = getPtpTimestamp();
                int result = avbStream_->sendFrame(
                    frameBuffer.data(),
                    samplesRead,
                    timestamp
                );

                if (result != 0) {
                    // Send failed (non-critical - stats tracked in AvbStream)
                }
            }

            // Rate limiting: sleep briefly to avoid spinning
            std::this_thread::sleep_for(std::chrono::microseconds(100));

        } else {
            // Listener: Receive from network, write to ring buffer
            size_t samplesReceived = 0;
            uint64_t timestamp = 0;

            int result = avbStream_->receiveFrame(
                frameBuffer.data(),
                frameBuffer.size(),
                &samplesReceived,
                &timestamp
            );

            if (result == 0 && samplesReceived > 0) {
                size_t samplesWritten = inputRingBuffer_->write(
                    frameBuffer.data(),
                    samplesReceived
                );

                if (samplesWritten < samplesReceived) {
                    // Ring buffer full - overrun
                    avbStream_->getStats().overruns.fetch_add(1, std::memory_order_relaxed);
                }
            }

            // No sleep needed - receiveFrame() blocks with timeout
        }
    }
}

// ============================================================================
// Utilities
// ============================================================================

uint64_t AvbAudioIODevice::getPtpTimestamp() const {
    // Get PTP time (nanoseconds since epoch)
    // In real implementation, would read from PTP clock via clock_gettime(CLOCK_TAI)
    auto now = std::chrono::system_clock::now();
    auto duration = now.time_since_epoch();
    return std::chrono::duration_cast<std::chrono::nanoseconds>(duration).count();
}

} // namespace Map2Audio

#endif // HAS_AVB
