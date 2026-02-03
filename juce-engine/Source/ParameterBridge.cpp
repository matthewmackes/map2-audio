/**
 * MAP2 Audio Engine - Parameter Bridge Implementation
 * RT-safe parameter routing with JUCE SmoothedValue for click-free changes
 */

#include "ParameterBridge.h"
#include <chrono>
#include <algorithm>

namespace map2 {

ParameterBridge::ParameterBridge() = default;
ParameterBridge::~ParameterBridge() = default;

void ParameterBridge::prepare(double sampleRate, int blockSize) {
    sampleRate_ = sampleRate;
    blockSize_ = blockSize;

    // Update all existing smoothers with new sample rate
    std::lock_guard<std::mutex> lock(smootherMutex_);
    for (auto& [key, param] : smoothedParams_) {
        updateSmootherRampTime(param);
    }
}

void ParameterBridge::initializeSmoother(SmoothedParameter& param, float initialValue) {
    param.smoother.reset(sampleRate_, param.config.rampTimeMs / 1000.0);
    param.smoother.setCurrentAndTargetValue(initialValue);
    param.targetValue = initialValue;
}

void ParameterBridge::updateSmootherRampTime(SmoothedParameter& param) {
    float rampTime = param.config.enabled ? param.config.rampTimeMs / 1000.0 : 0.0;
    param.smoother.reset(sampleRate_, rampTime);
}

bool ParameterBridge::enqueue(const ParameterUpdate& update) {
    size_t currentWrite = writePos_.load(std::memory_order_relaxed);
    size_t nextWrite = (currentWrite + 1) % QUEUE_SIZE;

    // Check if queue is full
    if (nextWrite == readPos_.load(std::memory_order_acquire)) {
        return false;  // Queue full
    }

    ringBuffer_[currentWrite] = update;
    writePos_.store(nextWrite, std::memory_order_release);

    return true;
}

bool ParameterBridge::dequeue(ParameterUpdate& update) {
    size_t currentRead = readPos_.load(std::memory_order_relaxed);

    // Check if queue is empty
    if (currentRead == writePos_.load(std::memory_order_acquire)) {
        return false;  // Queue empty
    }

    update = ringBuffer_[currentRead];
    readPos_.store((currentRead + 1) % QUEUE_SIZE, std::memory_order_release);

    return true;
}

bool ParameterBridge::queueParameterChange(InstanceId pluginId, int paramIndex, float value) {
    auto now = std::chrono::high_resolution_clock::now();
    double timestamp = std::chrono::duration<double>(now.time_since_epoch()).count();

    ParameterUpdate update{pluginId, paramIndex, value, timestamp};

    // Record if enabled
    if (recording_) {
        std::lock_guard<std::mutex> lock(automationMutex_);
        recordedAutomation_.push_back(update);
    }

    // Add to recent updates for UI
    {
        std::lock_guard<std::mutex> lock(recentMutex_);
        recentUpdates_.push_back(update);
        if (recentUpdates_.size() > 100) {
            recentUpdates_.erase(recentUpdates_.begin());
        }
    }

    // Update smoother target (will be applied in processQueue)
    {
        std::lock_guard<std::mutex> lock(smootherMutex_);
        auto key = std::make_pair(pluginId, paramIndex);
        auto it = smoothedParams_.find(key);
        if (it != smoothedParams_.end()) {
            it->second.targetValue = value;
            it->second.needsUpdate = true;
        }
    }

    return enqueue(update);
}

bool ParameterBridge::queueParameterChange(InstanceId pluginId, const std::string& paramName, float value) {
    std::lock_guard<std::mutex> lock(valueMutex_);

    auto key = std::make_pair(pluginId, paramName);
    auto it = nameToIndex_.find(key);
    if (it == nameToIndex_.end()) {
        return false;
    }

    return queueParameterChange(pluginId, it->second, value);
}

void ParameterBridge::processQueue(std::function<void(const ParameterUpdate&)> handler) {
    ParameterUpdate update;

    // RT-SAFE: Process all queued updates without locks in audio callback
    // The ring buffer is lock-free, and we defer value caching to avoid blocking
    while (dequeue(update)) {
        // Check global smoothing (atomic read - RT-safe)
        bool globalSmoothing = globalSmoothingEnabled_.load(std::memory_order_relaxed);
        
        // Try lock for smoother access - skip if contended (RT-safe)
        // If lock not available, still apply update immediately
        std::unique_lock<std::mutex> smootherLock(smootherMutex_, std::try_to_lock);
        
        if (smootherLock.owns_lock()) {
            auto key = std::make_pair(update.pluginId, update.paramIndex);
            auto it = smoothedParams_.find(key);

            if (it != smoothedParams_.end()) {
                bool useSmoothing = globalSmoothing && it->second.config.enabled;

                if (useSmoothing) {
                    it->second.smoother.setTargetValue(update.value);
                    it->second.targetValue = update.value;
                } else {
                    it->second.smoother.setCurrentAndTargetValue(update.value);
                    it->second.targetValue = update.value;
                    handler(update);
                }
            } else {
                handler(update);
            }
        } else {
            // Lock contended - apply immediately without smoothing (RT-safe fallback)
            handler(update);
        }

        // Defer value caching - try lock, skip if contended (RT-safe)
        std::unique_lock<std::mutex> valueLock(valueMutex_, std::try_to_lock);
        if (valueLock.owns_lock()) {
            parameterValues_[std::make_pair(update.pluginId, update.paramIndex)] = update.value;
        }
        // If lock not acquired, value will be updated on next successful try
    }
}

void ParameterBridge::processSmoothingBlock(int numSamples,
                                            std::function<void(InstanceId, int, float)> handler) {
    if (!globalSmoothingEnabled_) return;

    std::lock_guard<std::mutex> lock(smootherMutex_);

    for (auto& [key, param] : smoothedParams_) {
        if (!param.config.enabled) continue;

        // Check if this parameter is still smoothing
        if (param.smoother.isSmoothing()) {
            // Get smoothed value for this block
            float smoothedValue = param.smoother.skip(numSamples);
            handler(key.first, key.second, smoothedValue);
        }
    }
}

void ParameterBridge::setParameter(InstanceId pluginId, int paramIndex, float value) {
    {
        std::lock_guard<std::mutex> lock(valueMutex_);
        parameterValues_[std::make_pair(pluginId, paramIndex)] = value;
    }

    queueParameterChange(pluginId, paramIndex, value);
}

float ParameterBridge::getParameter(InstanceId pluginId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(valueMutex_);

    auto key = std::make_pair(pluginId, paramIndex);
    auto it = parameterValues_.find(key);
    if (it == parameterValues_.end()) {
        return 0.0f;
    }

    return it->second;
}

float ParameterBridge::getSmoothedValue(InstanceId pluginId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(smootherMutex_);

    auto key = std::make_pair(pluginId, paramIndex);
    auto it = smoothedParams_.find(key);
    if (it == smoothedParams_.end()) {
        // Fall back to raw value
        std::lock_guard<std::mutex> valueLock(valueMutex_);
        auto valueIt = parameterValues_.find(key);
        return (valueIt != parameterValues_.end()) ? valueIt->second : 0.0f;
    }

    return it->second.smoother.getCurrentValue();
}

bool ParameterBridge::isSmoothing(InstanceId pluginId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(smootherMutex_);

    auto key = std::make_pair(pluginId, paramIndex);
    auto it = smoothedParams_.find(key);
    if (it == smoothedParams_.end()) {
        return false;
    }

    return it->second.smoother.isSmoothing();
}

void ParameterBridge::setGlobalSmoothingTime(float timeMs) {
    globalSmoothingTimeMs_ = std::max(0.0f, timeMs);

    // Update all smoothers that use global smoothing
    std::lock_guard<std::mutex> lock(smootherMutex_);
    for (auto& [key, param] : smoothedParams_) {
        if (param.config.rampTimeMs == globalSmoothingTimeMs_.load()) {
            updateSmootherRampTime(param);
        }
    }
}

void ParameterBridge::setGlobalSmoothingEnabled(bool enabled) {
    globalSmoothingEnabled_ = enabled;
}

void ParameterBridge::setParameterSmoothing(InstanceId pluginId, int paramIndex,
                                            const SmoothingConfig& config) {
    std::lock_guard<std::mutex> lock(smootherMutex_);

    auto key = std::make_pair(pluginId, paramIndex);
    auto it = smoothedParams_.find(key);

    if (it != smoothedParams_.end()) {
        it->second.config = config;
        updateSmootherRampTime(it->second);
    } else {
        // Create new smoother
        SmoothedParameter param;
        param.config = config;
        initializeSmoother(param, 0.0f);
        smoothedParams_[key] = std::move(param);
    }
}

SmoothingConfig ParameterBridge::getParameterSmoothing(InstanceId pluginId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(smootherMutex_);

    auto key = std::make_pair(pluginId, paramIndex);
    auto it = smoothedParams_.find(key);
    if (it == smoothedParams_.end()) {
        return SmoothingConfig{};  // Default config
    }

    return it->second.config;
}

void ParameterBridge::disableParameterSmoothing(InstanceId pluginId, int paramIndex) {
    SmoothingConfig config;
    config.enabled = false;
    config.rampTimeMs = 0.0f;
    setParameterSmoothing(pluginId, paramIndex, config);
}

void ParameterBridge::registerParameter(InstanceId pluginId, int paramIndex,
                                        const std::string& name, float defaultValue) {
    {
        std::lock_guard<std::mutex> lock(valueMutex_);
        auto nameKey = std::make_pair(pluginId, name);
        nameToIndex_[nameKey] = paramIndex;
        parameterValues_[std::make_pair(pluginId, paramIndex)] = defaultValue;
    }

    // Create smoother for this parameter
    {
        std::lock_guard<std::mutex> lock(smootherMutex_);
        auto key = std::make_pair(pluginId, paramIndex);
        if (smoothedParams_.find(key) == smoothedParams_.end()) {
            SmoothedParameter param;
            param.config.enabled = true;
            param.config.rampTimeMs = globalSmoothingTimeMs_.load();
            initializeSmoother(param, defaultValue);
            smoothedParams_[key] = std::move(param);
        }
    }
}

void ParameterBridge::unregisterPlugin(InstanceId pluginId) {
    // Remove from value cache
    {
        std::lock_guard<std::mutex> lock(valueMutex_);

        // Remove parameter values
        for (auto it = parameterValues_.begin(); it != parameterValues_.end();) {
            if (it->first.first == pluginId) {
                it = parameterValues_.erase(it);
            } else {
                ++it;
            }
        }

        // Remove name mappings
        for (auto it = nameToIndex_.begin(); it != nameToIndex_.end();) {
            if (it->first.first == pluginId) {
                it = nameToIndex_.erase(it);
            } else {
                ++it;
            }
        }
    }

    // Remove smoothers
    {
        std::lock_guard<std::mutex> lock(smootherMutex_);
        for (auto it = smoothedParams_.begin(); it != smoothedParams_.end();) {
            if (it->first.first == pluginId) {
                it = smoothedParams_.erase(it);
            } else {
                ++it;
            }
        }
    }
}

void ParameterBridge::startRecording() {
    std::lock_guard<std::mutex> lock(automationMutex_);
    recordedAutomation_.clear();
    recording_ = true;
}

void ParameterBridge::stopRecording() {
    recording_ = false;
}

std::vector<ParameterUpdate> ParameterBridge::getRecordedAutomation() const {
    std::lock_guard<std::mutex> lock(automationMutex_);
    return recordedAutomation_;
}

void ParameterBridge::clearRecordedAutomation() {
    std::lock_guard<std::mutex> lock(automationMutex_);
    recordedAutomation_.clear();
}

void ParameterBridge::startPlayback() {
    playbackIndex_ = 0;
    playing_ = true;
}

void ParameterBridge::stopPlayback() {
    playing_ = false;
}

void ParameterBridge::setAutomation(const std::vector<ParameterUpdate>& automation) {
    std::lock_guard<std::mutex> lock(automationMutex_);
    playbackAutomation_ = automation;
    playbackIndex_ = 0;
}

std::vector<ParameterUpdate> ParameterBridge::getRecentUpdates() {
    std::lock_guard<std::mutex> lock(recentMutex_);
    std::vector<ParameterUpdate> updates = std::move(recentUpdates_);
    recentUpdates_.clear();
    return updates;
}

} // namespace map2
