/**
 * MAP2 Audio Engine - CPU Monitor Implementation
 */

#include "CPUMonitor.h"
#include <algorithm>

namespace map2 {

CPUMonitor::CPUMonitor() {
    peakTime_ = Clock::now();
}

void CPUMonitor::prepare(double sampleRate, int bufferSize) {
    sampleRate_ = sampleRate;
    bufferSize_ = bufferSize;

    // Calculate time budget per callback
    budgetSeconds_ = bufferSize / sampleRate;

    reset();
}

void CPUMonitor::reset() {
    currentCpu_ = 0.0;
    smoothedCpu_ = 0.0;
    peakCpu_ = 0.0;
    avgAccumulator_ = 0.0;
    avgCount_ = 0;
    xrunCount_ = 0;

    std::lock_guard<std::mutex> lock(pluginMutex_);
    for (auto& [id, timing] : pluginTimings_) {
        timing.currentCpu = 0.0;
        timing.smoothedCpu = 0.0;
    }
}

void CPUMonitor::beginCallback() {
    callbackStart_ = Clock::now();
}

void CPUMonitor::endCallback() {
    double elapsed = measureDuration(callbackStart_);
    double cpuPercent = (budgetSeconds_ > 0.0) ? (elapsed / budgetSeconds_) * 100.0 : 0.0;

    currentCpu_ = cpuPercent;

    // Apply exponential smoothing
    double smoothed = smoothedCpu_.load();
    smoothed = smoothed * (1.0 - smoothingFactor_) + cpuPercent * smoothingFactor_;
    smoothedCpu_ = smoothed;

    // Update peak
    updatePeak(cpuPercent);

    // Update average
    avgAccumulator_ = avgAccumulator_.load() + cpuPercent;
    avgCount_++;
}

void CPUMonitor::beginPlugin(InstanceId pluginId) {
    std::lock_guard<std::mutex> lock(pluginMutex_);
    pluginTimings_[pluginId].startTime = Clock::now();
}

void CPUMonitor::endPlugin(InstanceId pluginId) {
    std::lock_guard<std::mutex> lock(pluginMutex_);

    auto it = pluginTimings_.find(pluginId);
    if (it == pluginTimings_.end()) return;

    double elapsed = measureDuration(it->second.startTime);
    double cpuPercent = (budgetSeconds_ > 0.0) ? (elapsed / budgetSeconds_) * 100.0 : 0.0;

    it->second.currentCpu = cpuPercent;

    // Apply smoothing
    double smoothed = it->second.smoothedCpu.load();
    smoothed = smoothed * (1.0 - smoothingFactor_) + cpuPercent * smoothingFactor_;
    it->second.smoothedCpu = smoothed;
}

void CPUMonitor::removePlugin(InstanceId pluginId) {
    std::lock_guard<std::mutex> lock(pluginMutex_);
    pluginTimings_.erase(pluginId);
}

void CPUMonitor::reportXRun() {
    xrunCount_++;
}

CPUMetrics CPUMonitor::getMetrics() const {
    CPUMetrics metrics;

    metrics.totalCpuPercent = smoothedCpu_.load();
    metrics.audioCallbackPercent = metrics.totalCpuPercent;
    metrics.xrunCount = xrunCount_.load();
    metrics.peakCpuPercent = peakCpu_.load();

    // Calculate average
    int count = avgCount_.load();
    if (count > 0) {
        metrics.averageCpuPercent = avgAccumulator_.load() / count;
    }

    // Per-plugin metrics
    {
        std::lock_guard<std::mutex> lock(pluginMutex_);
        for (const auto& [id, timing] : pluginTimings_) {
            metrics.perPluginPercent[id] = timing.smoothedCpu.load();
        }
    }

    // Additional metrics
    metrics.budgetMs = budgetSeconds_ * 1000.0;
    metrics.currentCallbackMs = (currentCpu_.load() / 100.0) * budgetSeconds_ * 1000.0;
    metrics.headroomPercent = std::max(0.0, 100.0 - metrics.totalCpuPercent);

    return metrics;
}

double CPUMonitor::getTotalCpu() const {
    return smoothedCpu_.load();
}

double CPUMonitor::getPluginCpu(InstanceId pluginId) const {
    std::lock_guard<std::mutex> lock(pluginMutex_);

    auto it = pluginTimings_.find(pluginId);
    if (it == pluginTimings_.end()) return 0.0;

    return it->second.smoothedCpu.load();
}

void CPUMonitor::setSmoothingFactor(float factor) {
    smoothingFactor_ = std::clamp(factor, 0.001f, 1.0f);
}

void CPUMonitor::setPeakHoldTime(float seconds) {
    peakHoldSeconds_ = std::max(0.0f, seconds);
}

double CPUMonitor::measureDuration(TimePoint start) const {
    auto end = Clock::now();
    return std::chrono::duration<double>(end - start).count();
}

void CPUMonitor::updatePeak(double cpu) {
    auto now = Clock::now();

    // Check if peak hold time has expired
    float elapsed = std::chrono::duration<float>(now - peakTime_).count();

    double currentPeak = peakCpu_.load();

    if (cpu > currentPeak) {
        peakCpu_ = cpu;
        peakTime_ = now;
    } else if (elapsed > peakHoldSeconds_) {
        // Decay peak towards current value
        peakCpu_ = currentPeak * 0.99 + cpu * 0.01;
        if (peakCpu_.load() < cpu) {
            peakCpu_ = cpu;
        }
    }
}

} // namespace map2
