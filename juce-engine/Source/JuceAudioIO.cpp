/**
 * MAP2 Audio Engine - JUCE Audio I/O Implementation
 */

#include "JuceAudioIO.h"
#include <juce_audio_devices/juce_audio_devices.h>

namespace map2 {

JuceAudioIO::JuceAudioIO() {
    // Initialize JUCE message manager if not already done
    // This is required for JUCE's event loop
    if (juce::MessageManager::getInstanceWithoutCreating() == nullptr) {
        juce::MessageManager::getInstance();
    }
}

JuceAudioIO::~JuceAudioIO() {
    shutdown();
}

bool JuceAudioIO::initialize(const std::string& preferredDeviceName,
                             double sampleRate,
                             int bufferSize,
                             int numInputChannels,
                             int numOutputChannels) {
    if (initialized_) {
        shutdown();
    }

    currentSampleRate_ = sampleRate;
    currentBufferSize_ = bufferSize;
    numInputChannels_ = numInputChannels;
    numOutputChannels_ = numOutputChannels;

    // Initialize the device manager with the requested channel configuration
    juce::String error = deviceManager_.initialise(
        numInputChannels,   // Number of input channels
        numOutputChannels,  // Number of output channels
        nullptr,            // No saved state
        true,               // Select default device
        preferredDeviceName.empty() ? juce::String() : juce::String(preferredDeviceName),
        nullptr             // No preferred setup
    );

    if (error.isNotEmpty()) {
        lastError_ = error.toStdString();
        return false;
    }

    // Try to set the requested sample rate and buffer size
    auto* currentDevice = deviceManager_.getCurrentAudioDevice();
    if (currentDevice != nullptr) {
        auto setup = deviceManager_.getAudioDeviceSetup();
        setup.sampleRate = sampleRate;
        setup.bufferSize = bufferSize;

        error = deviceManager_.setAudioDeviceSetup(setup, true);
        if (error.isNotEmpty()) {
            // Not fatal - device may not support the exact settings
            // Use whatever the device gave us
            currentSampleRate_ = currentDevice->getCurrentSampleRate();
            currentBufferSize_ = currentDevice->getCurrentBufferSizeSamples();
        } else {
            currentSampleRate_ = setup.sampleRate;
            currentBufferSize_ = setup.bufferSize;
        }
    }

    initialized_ = true;
    resetStats();
    return true;
}

void JuceAudioIO::shutdown() {
    if (!initialized_) return;

    stopAudio();
    deviceManager_.closeAudioDevice();
    initialized_ = false;
}

std::vector<AudioDeviceInfo> JuceAudioIO::getAvailableDevices() const {
    std::vector<AudioDeviceInfo> devices;

    for (auto& deviceType : deviceManager_.getAvailableDeviceTypes()) {
        deviceType->scanForDevices();

        auto deviceNames = deviceType->getDeviceNames();
        for (int i = 0; i < deviceNames.size(); ++i) {
            AudioDeviceInfo info;
            info.name = deviceNames[i].toStdString();
            info.id = deviceType->getTypeName().toStdString() + ":" + info.name;

            // Get channel counts (approximate - actual depends on device open)
            info.inputChannels = 2;  // Default assumption
            info.outputChannels = 2;

            // Sample rates - common defaults
            info.sampleRates = {44100.0, 48000.0, 88200.0, 96000.0};
            info.bufferSizes = {64, 128, 256, 512, 1024, 2048};
            info.isDefault = (i == deviceType->getDefaultDeviceIndex(false));

            devices.push_back(info);
        }
    }

    return devices;
}

std::vector<AudioDeviceInfo> JuceAudioIO::getInputDevices() const {
    std::vector<AudioDeviceInfo> devices;

    for (auto& deviceType : deviceManager_.getAvailableDeviceTypes()) {
        deviceType->scanForDevices();
        auto deviceNames = deviceType->getDeviceNames(true);  // Input devices

        for (int i = 0; i < deviceNames.size(); ++i) {
            AudioDeviceInfo info;
            info.name = deviceNames[i].toStdString();
            info.id = deviceType->getTypeName().toStdString() + ":" + info.name;
            info.inputChannels = 2;
            info.outputChannels = 0;
            info.sampleRates = {44100.0, 48000.0, 88200.0, 96000.0};
            info.bufferSizes = {64, 128, 256, 512, 1024, 2048};
            info.isDefault = (i == deviceType->getDefaultDeviceIndex(true));
            devices.push_back(info);
        }
    }

    return devices;
}

std::vector<AudioDeviceInfo> JuceAudioIO::getOutputDevices() const {
    std::vector<AudioDeviceInfo> devices;

    for (auto& deviceType : deviceManager_.getAvailableDeviceTypes()) {
        deviceType->scanForDevices();
        auto deviceNames = deviceType->getDeviceNames(false);  // Output devices

        for (int i = 0; i < deviceNames.size(); ++i) {
            AudioDeviceInfo info;
            info.name = deviceNames[i].toStdString();
            info.id = deviceType->getTypeName().toStdString() + ":" + info.name;
            info.inputChannels = 0;
            info.outputChannels = 2;
            info.sampleRates = {44100.0, 48000.0, 88200.0, 96000.0};
            info.bufferSizes = {64, 128, 256, 512, 1024, 2048};
            info.isDefault = (i == deviceType->getDefaultDeviceIndex(false));
            devices.push_back(info);
        }
    }

    return devices;
}

AudioDeviceInfo JuceAudioIO::getCurrentDevice() const {
    auto* device = deviceManager_.getCurrentAudioDevice();
    if (device == nullptr) {
        return AudioDeviceInfo{};
    }
    return deviceToInfo(device);
}

std::string JuceAudioIO::getCurrentDeviceName() const {
    auto* device = deviceManager_.getCurrentAudioDevice();
    if (device == nullptr) {
        return "";
    }
    return device->getName().toStdString();
}

bool JuceAudioIO::startAudio() {
    if (!initialized_) return false;
    if (audioRunning_.load()) return true;

    deviceManager_.addAudioCallback(this);
    audioRunning_ = true;
    return true;
}

bool JuceAudioIO::stopAudio() {
    if (!audioRunning_.load()) return true;

    deviceManager_.removeAudioCallback(this);
    audioRunning_ = false;
    return true;
}

bool JuceAudioIO::setDevice(const std::string& deviceName) {
    if (!initialized_) return false;

    bool wasRunning = audioRunning_.load();
    if (wasRunning) {
        stopAudio();
    }

    auto setup = deviceManager_.getAudioDeviceSetup();
    setup.outputDeviceName = juce::String(deviceName);
    setup.inputDeviceName = juce::String(deviceName);

    juce::String error = deviceManager_.setAudioDeviceSetup(setup, true);

    if (wasRunning) {
        startAudio();
    }

    if (error.isNotEmpty()) {
        lastError_ = error.toStdString();
        return false;
    }

    return true;
}

bool JuceAudioIO::setSampleRate(double sampleRate) {
    if (!initialized_) return false;

    auto setup = deviceManager_.getAudioDeviceSetup();
    setup.sampleRate = sampleRate;

    juce::String error = deviceManager_.setAudioDeviceSetup(setup, true);

    if (error.isNotEmpty()) {
        lastError_ = error.toStdString();
        return false;
    }

    currentSampleRate_ = sampleRate;
    return true;
}

bool JuceAudioIO::setBufferSize(int bufferSize) {
    if (!initialized_) return false;

    auto setup = deviceManager_.getAudioDeviceSetup();
    setup.bufferSize = bufferSize;

    juce::String error = deviceManager_.setAudioDeviceSetup(setup, true);

    if (error.isNotEmpty()) {
        lastError_ = error.toStdString();
        return false;
    }

    currentBufferSize_ = bufferSize;
    return true;
}

void JuceAudioIO::setProcessCallback(ProcessCallback callback) {
    processCallback_ = std::move(callback);
}

JuceAudioIO::AudioStats JuceAudioIO::getStats() const {
    std::lock_guard<std::mutex> lock(statsMutex_);
    return stats_;
}

void JuceAudioIO::resetStats() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    stats_ = AudioStats{};
    stats_.latencyMs = (currentBufferSize_ / currentSampleRate_) * 1000.0;
}

// ========================================
// JUCE AudioIODeviceCallback implementation
// ========================================

void JuceAudioIO::audioDeviceIOCallbackWithContext(
    const float* const* inputChannelData,
    int numInputChannels,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& /*context*/) {

    auto startTime = std::chrono::high_resolution_clock::now();

    // Clear output buffers first
    for (int ch = 0; ch < numOutputChannels; ++ch) {
        if (outputChannelData[ch] != nullptr) {
            std::fill_n(outputChannelData[ch], numSamples, 0.0f);
        }
    }

    // Call the user's processing callback
    if (processCallback_) {
        processCallback_(inputChannelData, numInputChannels,
                        outputChannelData, numOutputChannels,
                        numSamples);
    }

    // Update statistics
    auto endTime = std::chrono::high_resolution_clock::now();
    double processingTime = std::chrono::duration<double>(endTime - startTime).count();
    updateStats(numSamples, processingTime);
}

void JuceAudioIO::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    if (device == nullptr) return;

    currentSampleRate_ = device->getCurrentSampleRate();
    currentBufferSize_ = device->getCurrentBufferSizeSamples();

    {
        std::lock_guard<std::mutex> lock(statsMutex_);
        stats_.latencyMs = (currentBufferSize_ / currentSampleRate_) * 1000.0;
    }

    lastCallbackTime_ = std::chrono::high_resolution_clock::now();
}

void JuceAudioIO::audioDeviceStopped() {
    audioRunning_ = false;
}

void JuceAudioIO::audioDeviceError(const juce::String& errorMessage) {
    lastError_ = errorMessage.toStdString();

    // Increment xrun counter for underruns/overruns
    std::lock_guard<std::mutex> lock(statsMutex_);
    stats_.xrunCount++;
}

// ========================================
// Private helpers
// ========================================

AudioDeviceInfo JuceAudioIO::deviceToInfo(juce::AudioIODevice* device) const {
    AudioDeviceInfo info;

    if (device == nullptr) return info;

    info.name = device->getName().toStdString();
    info.id = device->getTypeName().toStdString() + ":" + info.name;

    auto activeInputChannels = device->getActiveInputChannels();
    auto activeOutputChannels = device->getActiveOutputChannels();

    info.inputChannels = activeInputChannels.countNumberOfSetBits();
    info.outputChannels = activeOutputChannels.countNumberOfSetBits();

    // Get available sample rates
    auto sampleRates = device->getAvailableSampleRates();
    for (int i = 0; i < sampleRates.size(); ++i) {
        info.sampleRates.push_back(sampleRates[i]);
    }

    // Get available buffer sizes
    auto bufferSizes = device->getAvailableBufferSizes();
    for (int i = 0; i < bufferSizes.size(); ++i) {
        info.bufferSizes.push_back(bufferSizes[i]);
    }

    info.isDefault = false;  // Can't easily determine this

    return info;
}

void JuceAudioIO::updateStats(int numSamples, double processingTime) {
    std::lock_guard<std::mutex> lock(statsMutex_);

    // Calculate CPU usage as percentage of available time
    double availableTime = numSamples / currentSampleRate_;
    double cpuUsage = (processingTime / availableTime) * 100.0;

    // Smooth the CPU reading
    const double smoothing = 0.1;
    stats_.cpuUsage = stats_.cpuUsage * (1.0 - smoothing) + cpuUsage * smoothing;

    stats_.samplesProcessed += numSamples;
}

} // namespace map2
