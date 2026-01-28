#pragma once

/**
 * MAP2 Audio Engine - VU Meter
 * Peak and RMS level metering
 */

#include "Common.h"
#include <array>

namespace map2 {

class VuMeter {
public:
    VuMeter();
    
    // Process audio and update levels
    void process(const float* left, const float* right, int numSamples);
    void processMono(const float* buffer, int numSamples);
    
    // Get current levels (0.0 to 1.0)
    float getPeakLeft() const { return peakLeft_.load(); }
    float getPeakRight() const { return peakRight_.load(); }
    float getRmsLeft() const { return rmsLeft_.load(); }
    float getRmsRight() const { return rmsRight_.load(); }
    
    // Get dB levels (-100 to 0)
    float getPeakLeftDb() const { return linearToDb(peakLeft_.load()); }
    float getPeakRightDb() const { return linearToDb(peakRight_.load()); }
    float getRmsLeftDb() const { return linearToDb(rmsLeft_.load()); }
    float getRmsRightDb() const { return linearToDb(rmsRight_.load()); }
    
    // Get combined VU struct
    VuLevels getLevels() const;
    
    // Reset peaks
    void reset();
    
    // Configuration
    void setDecayRate(float ratePerSample) { decayRate_ = ratePerSample; }
    void setRmsWindowSize(int samples) { rmsWindowSize_ = samples; }
    
private:
    std::atomic<float> peakLeft_{0.0f};
    std::atomic<float> peakRight_{0.0f};
    std::atomic<float> rmsLeft_{0.0f};
    std::atomic<float> rmsRight_{0.0f};
    
    float decayRate_ = 0.9995f;  // Per-sample decay
    int rmsWindowSize_ = 512;
    
    // RMS accumulation
    float rmsAccumLeft_ = 0.0f;
    float rmsAccumRight_ = 0.0f;
    int rmsSampleCount_ = 0;
};

// Multi-channel VU bank for managing multiple meters
class VuMeterBank {
public:
    VuMeterBank(int numChannels = 2);
    
    void process(const float* const* channels, int numChannels, int numSamples);
    
    VuMeter& getMeter(int channel) { return meters_[channel]; }
    const VuMeter& getMeter(int channel) const { return meters_[channel]; }
    
    void reset();
    
private:
    std::vector<VuMeter> meters_;
};

} // namespace map2
