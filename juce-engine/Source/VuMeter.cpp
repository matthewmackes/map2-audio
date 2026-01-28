/**
 * MAP2 Audio Engine - VU Meter Implementation
 * Peak and RMS level metering
 */

#include "VuMeter.h"
#include <cmath>
#include <algorithm>

namespace map2 {

VuMeter::VuMeter() = default;

void VuMeter::process(const float* left, const float* right, int numSamples) {
    float peakL = peakLeft_.load() * std::pow(decayRate_, numSamples);
    float peakR = peakRight_.load() * std::pow(decayRate_, numSamples);
    
    float rmsAccL = rmsAccumLeft_;
    float rmsAccR = rmsAccumRight_;
    
    for (int i = 0; i < numSamples; i++) {
        float l = std::fabs(left[i]);
        float r = right ? std::fabs(right[i]) : l;
        
        if (l > peakL) peakL = l;
        if (r > peakR) peakR = r;
        
        rmsAccL += l * l;
        rmsAccR += r * r;
    }
    
    peakLeft_.store(peakL);
    peakRight_.store(peakR);
    
    rmsSampleCount_ += numSamples;
    rmsAccumLeft_ = rmsAccL;
    rmsAccumRight_ = rmsAccR;
    
    if (rmsSampleCount_ >= rmsWindowSize_) {
        rmsLeft_.store(std::sqrt(rmsAccumLeft_ / rmsSampleCount_));
        rmsRight_.store(std::sqrt(rmsAccumRight_ / rmsSampleCount_));
        rmsAccumLeft_ = 0.0f;
        rmsAccumRight_ = 0.0f;
        rmsSampleCount_ = 0;
    }
}

void VuMeter::processMono(const float* buffer, int numSamples) {
    process(buffer, nullptr, numSamples);
}

VuLevels VuMeter::getLevels() const {
    VuLevels levels;
    levels.inputLeft = peakLeft_.load();
    levels.inputRight = peakRight_.load();
    levels.outputLeft = peakLeft_.load();
    levels.outputRight = peakRight_.load();
    return levels;
}

void VuMeter::reset() {
    peakLeft_.store(0.0f);
    peakRight_.store(0.0f);
    rmsLeft_.store(0.0f);
    rmsRight_.store(0.0f);
    rmsAccumLeft_ = 0.0f;
    rmsAccumRight_ = 0.0f;
    rmsSampleCount_ = 0;
}

// VuMeterBank

VuMeterBank::VuMeterBank(int numChannels)
    : meters_(numChannels) {
}

void VuMeterBank::process(const float* const* channels, int numChannels, int numSamples) {
    int metersToProcess = std::min(numChannels, static_cast<int>(meters_.size()));
    
    for (int i = 0; i < metersToProcess; i += 2) {
        const float* left = channels[i];
        const float* right = (i + 1 < numChannels) ? channels[i + 1] : nullptr;
        
        if (i / 2 < static_cast<int>(meters_.size())) {
            meters_[i / 2].process(left, right, numSamples);
        }
    }
}

void VuMeterBank::reset() {
    for (auto& meter : meters_) {
        meter.reset();
    }
}

} // namespace map2
