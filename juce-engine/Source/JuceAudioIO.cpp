/**
 * MAP2 Audio Engine - JUCE Audio I/O Implementation
 */

#include "JuceAudioIO.h"
#include <juce_audio_devices/juce_audio_devices.h>
#include <thread>
#include <iostream>
#include <chrono>

// Fix #10: CPU Core Affinity for audio thread
#if defined(__linux__)
#include <pthread.h>
#include <sched.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
#include <cctype>
#include <cstring>
#endif

namespace map2 {

namespace {
    // Set CPU affinity for audio thread (Linux only)
    // Detect and use isolated CPUs if available, fall back to core 1
    void setAudioThreadAffinity() {
#if defined(__linux__)
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        
        // Try to detect isolated CPUs from kernel parameter
        // On systems with isolcpus=2,3, we should pin to those cores
        bool isolatedCoresFound = false;
        
        // Read /proc/cmdline to find isolcpus parameter
        FILE* f = fopen("/proc/cmdline", "r");
        if (f) {
            char line[1024];
            if (fgets(line, sizeof(line), f)) {
                // Look for isolcpus=...
                const char* isolpos = strstr(line, "isolcpus=");
                if (isolpos) {
                    // Simple parser: isolcpus=2,3 or isolcpus=2-3
                    isolpos += strlen("isolcpus=");
                    char* endptr;
                    
                    // Try to parse comma-separated list: "2,3"
                    while (*isolpos && !isspace(*isolpos)) {
                        if (isdigit(*isolpos)) {
                            int core = strtol(isolpos, &endptr, 10);
                            // Verify core is valid
                            if (core >= 0 && core < CPU_SETSIZE) {
                                CPU_SET(core, &cpuset);
                                isolatedCoresFound = true;
                            }
                            isolpos = endptr;
                        } else if (*isolpos == ',' || *isolpos == '-') {
                            isolpos++;
                        } else {
                            break;
                        }
                    }
                }
            }
            fclose(f);
        }
        
        // If no isolated cores found, pin to core 1 (avoid core 0 for kernel/interrupts)
        if (!isolatedCoresFound) {
            int numCores = static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN));
            if (numCores > 1) {
                CPU_SET(1, &cpuset);  // Core 1 (avoid core 0)
            } else {
                CPU_SET(0, &cpuset);  // Fallback to core 0 on single-core
            }
        }
        
        pthread_t currentThread = pthread_self();
        int affinity_result = pthread_setaffinity_np(currentThread, sizeof(cpu_set_t), &cpuset);
        (void)affinity_result;  // Ignore errors - best effort
        
        // Set RT priority only if PipeWire hasn't already boosted us via RTKit
        // Use SCHED_FIFO priority = 60 (lower than default 80 to avoid starving PipeWire)
        // Note: This may fail without CAP_SYS_NICE; RTKit will handle it instead
        struct sched_param param;
        param.sched_priority = 80;  // Optimized: cooperates with PipeWire (83-88)
        int sched_result = pthread_setschedparam(currentThread, SCHED_FIFO, &param);
        // If this fails, RTKit should have already boosted us via the service manager
        (void)sched_result;
#endif
    }
}

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

    // CRITICAL FIX: Force JACK device type to prevent ALSA fallback
    // Without this, JUCE may enumerate ALSA devices and bypass PipeWire entirely
    // This ensures all audio routes through PipeWire's graph, preserving:
    // - PipeWire MIDI bridging
    // - PipeWire plugin routing
    // - PulseAudio compatibility via pipewire-pulse
    bool jackTypeSet = false;
    
    // Log available device types for diagnostics
    std::cout << "  Available audio device types:" << std::endl;
    for (auto& deviceType : deviceManager_.getAvailableDeviceTypes()) {
        std::cout << "    - " << deviceType->getTypeName() << std::endl;
        if (deviceType->getTypeName().containsIgnoreCase("JACK")) {
            deviceManager_.setCurrentAudioDeviceType(deviceType->getTypeName(), true);
            jackTypeSet = true;
            std::cout << "  >> Selected JACK audio device type (PipeWire JACK)" << std::endl;
        }
    }
    if (!jackTypeSet) {
        std::cerr << "  WARNING: JACK device type NOT found! Falling back to ALSA." << std::endl;
        std::cerr << "  Audio will route through PipeWire ALSA emulation (suboptimal)." << std::endl;
        std::cerr << "  Ensure JUCE was built with JUCE_JACK=1 and libjack is available." << std::endl;
    }

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

        // Cache last known good setup for recovery
        lastSetup_ = setup;
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

std::vector<AudioDeviceInfo> JuceAudioIO::getAvailableDevices() {
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

std::vector<AudioDeviceInfo> JuceAudioIO::getInputDevices() {
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

std::vector<AudioDeviceInfo> JuceAudioIO::getOutputDevices() {
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

    lastSetup_ = setup;
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
    lastSetup_ = setup;
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
    lastSetup_ = setup;
    return true;
}

void JuceAudioIO::setProcessCallback(ProcessCallback callback) {
    // RT-SAFE: Store callback via atomic shared_ptr swap
    // This must be set ONLY before startAudio() - changing during playback is unsafe
    auto cb = std::make_shared<ProcessCallback>(std::move(callback));
    std::atomic_store_explicit(&processCallback_, cb, std::memory_order_release);
}

JuceAudioIO::AudioStats JuceAudioIO::getStats() const {
    std::lock_guard<std::mutex> lock(statsMutex_);
    AudioStats s = stats_;
    // Fill in live atomic values
    s.callbackJitterMs = callbackJitterSmoothed_.load(std::memory_order_relaxed);
    s.peakCallbackJitterMs = peakJitter_.load(std::memory_order_relaxed);
    s.avgCallbackDurationMs = callbackDurationSmoothed_.load(std::memory_order_relaxed);
    s.peakCallbackDurationMs = peakCallbackDuration_.load(std::memory_order_relaxed);
    s.callbackBudgetMs = (currentBufferSize_ / currentSampleRate_) * 1000.0;
    s.budgetUtilization = s.callbackBudgetMs > 0 ? (s.avgCallbackDurationMs / s.callbackBudgetMs) * 100.0 : 0.0;
    s.deviceConnected = connectionState_.deviceConnected.load();
    s.recoveryCount = connectionState_.successfulRecoveries.load();
    s.measuredRoundTripMs = measuredRoundTripMs_.load();
    // Compute uptime
    if (audioRunning_.load()) {
        auto now = std::chrono::steady_clock::now();
        s.uptimeSeconds = std::chrono::duration<double>(now - connectionState_.audioStartTime).count();
    }
    // Device-reported latency
    auto* device = deviceManager_.getCurrentAudioDevice();
    if (device) {
        double inputLatSamples = device->getInputLatencyInSamples();
        double outputLatSamples = device->getOutputLatencyInSamples();
        s.measuredInputLatencyMs = (inputLatSamples / currentSampleRate_) * 1000.0;
        s.measuredOutputLatencyMs = (outputLatSamples / currentSampleRate_) * 1000.0;
    }
    return s;
}

void JuceAudioIO::resetStats() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    stats_ = AudioStats{};
    stats_.latencyMs = (currentBufferSize_ / currentSampleRate_) * 1000.0;
    firstCallback_ = true;
    callbackJitterSmoothed_ = 0.0;
    peakJitter_ = 0.0;
    peakCallbackDuration_ = 0.0;
    callbackDurationSmoothed_ = 0.0;
}

void JuceAudioIO::resetXrunCounter() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    stats_.xrunsSinceReset = 0;
}

std::vector<int64_t> JuceAudioIO::getXrunHistory() const {
    std::vector<int64_t> history;
    int head = xrunHistoryHead_.load(std::memory_order_relaxed);
    for (int i = 0; i < XRUN_HISTORY_SIZE; ++i) {
        int idx = (head - 1 - i + XRUN_HISTORY_SIZE) % XRUN_HISTORY_SIZE;
        int64_t ts = xrunHistory_[idx];
        if (ts > 0) history.push_back(ts);
    }
    return history;
}

void JuceAudioIO::recordXrun() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
    int idx = xrunHistoryHead_.fetch_add(1, std::memory_order_relaxed) % XRUN_HISTORY_SIZE;
    xrunHistory_[idx] = ms;
    {
        std::unique_lock<std::mutex> lock(statsMutex_, std::try_to_lock);
        if (lock.owns_lock()) {
            stats_.xrunCount++;
            stats_.xrunsSinceReset++;
            stats_.lastXrunTimestamp = ms;
        }
    }
}

JuceAudioIO::ConnectionHealth JuceAudioIO::getConnectionHealth() const {
    ConnectionHealth h;
    h.deviceConnected = connectionState_.deviceConnected.load();
    h.recoveryAttempts = connectionState_.recoveryAttempts.load();
    h.successfulRecoveries = connectionState_.successfulRecoveries.load();
    h.lastError = lastError_;
    h.currentBackend = connectionState_.currentBackend;
    // Check if JACK server is running
    h.jackServerRunning = false;
    auto* device = deviceManager_.getCurrentAudioDevice();
    if (device != nullptr) {
        h.jackServerRunning = device->getTypeName().containsIgnoreCase("JACK");
    }
    if (connectionState_.lastRecoveryTime != std::chrono::steady_clock::time_point{}) {
        auto now = std::chrono::steady_clock::now();
        h.lastRecoveryTimeSec = std::chrono::duration<double>(now - connectionState_.lastRecoveryTime).count();
    }
    return h;
}

void JuceAudioIO::setMeasuredRoundTripLatency(double ms) {
    measuredRoundTripMs_.store(ms);
}

double JuceAudioIO::getDeviceReportedLatencyMs() const {
    auto* device = deviceManager_.getCurrentAudioDevice();
    if (!device) return 0.0;
    double totalSamples = device->getInputLatencyInSamples() +
                         device->getOutputLatencyInSamples() +
                         currentBufferSize_;
    return (totalSamples / currentSampleRate_) * 1000.0;
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

    // === Callback timing jitter analysis (xrun detection) ===
    if (!firstCallback_) {
        double intervalMs = std::chrono::duration<double, std::milli>(
            startTime - lastCallbackTime_).count();
        double expectedIntervalMs = (numSamples / currentSampleRate_) * 1000.0;

        // Update smoothed interval and jitter
        double jitter = std::abs(intervalMs - expectedIntervalMs);
        double prevJitter = callbackJitterSmoothed_.load(std::memory_order_relaxed);
        callbackJitterSmoothed_.store(
            prevJitter * (1.0 - JITTER_SMOOTHING) + jitter * JITTER_SMOOTHING,
            std::memory_order_relaxed);

        // Track peak jitter
        double currentPeak = peakJitter_.load(std::memory_order_relaxed);
        if (jitter > currentPeak) {
            peakJitter_.store(jitter, std::memory_order_relaxed);
        }

        // Detect xrun by timing: interval > 2x expected means we missed a callback
        if (intervalMs > expectedIntervalMs * XRUN_JITTER_THRESHOLD) {
            recordXrun();
        }
    } else {
        firstCallback_ = false;
    }
    lastCallbackTime_ = startTime;

    // Clear output buffers first
    for (int ch = 0; ch < numOutputChannels; ++ch) {
        if (outputChannelData[ch] != nullptr) {
            std::fill_n(outputChannelData[ch], numSamples, 0.0f);
        }
    }

    // RT-SAFE: Load callback pointer atomically, avoiding race condition
    auto callback = std::atomic_load_explicit(&processCallback_, std::memory_order_acquire);
    if (callback && *callback) {
        (*callback)(inputChannelData, numInputChannels,
                    outputChannelData, numOutputChannels,
                    numSamples);
    }

    // === Processing time measurement ===
    auto endTime = std::chrono::high_resolution_clock::now();
    double processingTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();

    // Update smoothed duration (lock-free)
    double prevDur = callbackDurationSmoothed_.load(std::memory_order_relaxed);
    callbackDurationSmoothed_.store(
        prevDur * (1.0 - DURATION_SMOOTHING) + processingTimeMs * DURATION_SMOOTHING,
        std::memory_order_relaxed);

    // Track peak callback duration
    double currentPeakDur = peakCallbackDuration_.load(std::memory_order_relaxed);
    if (processingTimeMs > currentPeakDur) {
        peakCallbackDuration_.store(processingTimeMs, std::memory_order_relaxed);
    }

    // Detect budget overrun (processing took longer than available time)
    double budgetMs = (numSamples / currentSampleRate_) * 1000.0;
    if (processingTimeMs > budgetMs) {
        recordXrun();  // Processing overrun = xrun
    }

    // Update CPU stats (try_lock to avoid blocking RT thread)
    {
        double cpuUsage = budgetMs > 0 ? (processingTimeMs / budgetMs) * 100.0 : 0.0;
        std::unique_lock<std::mutex> lock(statsMutex_, std::try_to_lock);
        if (lock.owns_lock()) {
            const double smoothing = 0.1;
            stats_.cpuUsage = stats_.cpuUsage * (1.0 - smoothing) + cpuUsage * smoothing;
            stats_.samplesProcessed += numSamples;
        }
    }
}

void JuceAudioIO::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    if (device == nullptr) return;

    currentSampleRate_ = device->getCurrentSampleRate();
    currentBufferSize_ = device->getCurrentBufferSizeSamples();

    // Fix #10: Set CPU affinity for the audio callback thread
    setAudioThreadAffinity();

    {
        std::lock_guard<std::mutex> lock(statsMutex_);
        stats_.latencyMs = (currentBufferSize_ / currentSampleRate_) * 1000.0;
        stats_.deviceConnected = true;
        // Compute device-reported latency
        stats_.measuredInputLatencyMs = (device->getInputLatencyInSamples() / currentSampleRate_) * 1000.0;
        stats_.measuredOutputLatencyMs = (device->getOutputLatencyInSamples() / currentSampleRate_) * 1000.0;
    }

    // Update connection state
    connectionState_.deviceConnected.store(true);
    connectionState_.audioStartTime = std::chrono::steady_clock::now();
    connectionState_.currentBackend = device->getTypeName().toStdString();

    lastCallbackTime_ = std::chrono::high_resolution_clock::now();
    firstCallback_ = true;
}

void JuceAudioIO::audioDeviceStopped() {
    audioRunning_ = false;
    connectionState_.deviceConnected.store(false);
}

void JuceAudioIO::audioDeviceError(const juce::String& errorMessage) {
    lastError_ = errorMessage.toStdString();
    connectionState_.lastError = lastError_;
    connectionState_.deviceConnected.store(false);

    // Record xrun for device error
    recordXrun();

    // Attempt auto-recovery with exponential backoff
    if (recoveryEnabled_ && !recoveryInProgress_.exchange(true)) {
        connectionState_.recoveryAttempts.fetch_add(1);
        std::thread([this]() {
            attemptRecovery(0);
            recoveryInProgress_.store(false);
        }).detach();
    }
}

bool JuceAudioIO::attemptRecovery(int attempt) {
    if (attempt >= MAX_RECOVERY_ATTEMPTS) {
        std::cerr << "[MAP2-AUDIO] Recovery failed after " << MAX_RECOVERY_ATTEMPTS
                  << " attempts. Audio device unrecoverable." << std::endl;
        return false;
    }

    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s
    int delayMs = RECOVERY_BACKOFF_MS * (1 << attempt);
    std::cerr << "[MAP2-AUDIO] Recovery attempt " << (attempt + 1)
              << "/" << MAX_RECOVERY_ATTEMPTS
              << " (backoff: " << delayMs << "ms)" << std::endl;

    bool wasRunning = audioRunning_.load();
    stopAudio();
    deviceManager_.closeAudioDevice();

    std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));

    // Try to restore with last known good setup
    juce::String error = deviceManager_.setAudioDeviceSetup(lastSetup_, true);
    if (error.isNotEmpty()) {
        // Try full re-initialization
        error = deviceManager_.initialise(
            numInputChannels_,
            numOutputChannels_,
            nullptr,
            true,
            lastSetup_.outputDeviceName,
            nullptr
        );

        if (error.isNotEmpty()) {
            std::cerr << "[MAP2-AUDIO] Recovery attempt " << (attempt + 1)
                      << " failed: " << error.toStdString() << std::endl;
            return attemptRecovery(attempt + 1);
        }
    }

    if (wasRunning) {
        startAudio();
    }

    connectionState_.successfulRecoveries.fetch_add(1);
    connectionState_.lastRecoveryTime = std::chrono::steady_clock::now();
    connectionState_.deviceConnected.store(true);

    std::cerr << "[MAP2-AUDIO] Recovery successful on attempt " << (attempt + 1) << std::endl;
    return true;
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
