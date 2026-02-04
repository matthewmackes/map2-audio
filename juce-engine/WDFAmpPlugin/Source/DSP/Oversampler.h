#pragma once

#include <vector>
#include <cmath>
#include <array>
#include <algorithm>

namespace DSP {

//==============================================================================
// Polyphase FIR Filter for oversampling
//==============================================================================
class PolyphaseFilter {
public:
    static constexpr int FILTER_ORDER = 32;
    
    PolyphaseFilter() {
        initCoefficients();
    }
    
    void initCoefficients() {
        // Windowed sinc lowpass filter coefficients
        // Cutoff at Nyquist/oversampleFactor with Kaiser window
        const double beta = 7.0;  // Kaiser window parameter
        const int N = FILTER_ORDER;
        
        for (int n = 0; n < N; ++n) {
            double x = n - (N - 1) / 2.0;
            
            // Sinc function
            double sinc;
            if (std::abs(x) < 1e-10) {
                sinc = 1.0;
            } else {
                sinc = std::sin(M_PI * x * 0.5) / (M_PI * x * 0.5);
            }
            
            // Kaiser window
            double alpha = (N - 1) / 2.0;
            double arg = beta * std::sqrt(1.0 - std::pow((n - alpha) / alpha, 2.0));
            double bessel = besselI0(arg) / besselI0(beta);
            
            coefficients[n] = sinc * bessel;
        }
        
        // Normalize
        double sum = 0.0;
        for (int n = 0; n < N; ++n) sum += coefficients[n];
        for (int n = 0; n < N; ++n) coefficients[n] /= sum;
    }
    
    // Modified Bessel function I0
    double besselI0(double x) {
        double sum = 1.0;
        double term = 1.0;
        for (int k = 1; k <= 20; ++k) {
            term *= (x * x) / (4.0 * k * k);
            sum += term;
            if (term < 1e-12) break;
        }
        return sum;
    }
    
    std::array<double, FILTER_ORDER> coefficients{};
};

//==============================================================================
// High-Quality Oversampler with polyphase filters
//==============================================================================
class Oversampler {
public:
    static constexpr int MAX_FACTOR = 16;
    static constexpr int FILTER_ORDER = 32;
    
    Oversampler(int factor = 4) : oversampleFactor(factor) {
        setOversampleFactor(factor);
    }
    
    //--------------------------------------------------------------------------
    void setOversampleFactor(int factor) {
        oversampleFactor = std::clamp(factor, 1, MAX_FACTOR);
        upsampleBuffer.resize(oversampleFactor);
        history.fill(0.0);
        historyIndex = 0;
    }
    
    int getOversampleFactor() const { return oversampleFactor; }
    
    //--------------------------------------------------------------------------
    // Upsample a single input sample to oversampleFactor samples
    void upsample(double input) {
        // Zero-stuffing upsampling
        upsampleBuffer[0] = input * oversampleFactor;  // Compensate for energy loss
        for (int i = 1; i < oversampleFactor; ++i) {
            upsampleBuffer[i] = 0.0;
        }
        
        // Apply interpolation filter to each upsampled sample
        for (int i = 0; i < oversampleFactor; ++i) {
            // Shift history
            history[historyIndex] = upsampleBuffer[i];
            
            // Apply polyphase filter
            double filtered = 0.0;
            for (int j = 0; j < FILTER_ORDER; ++j) {
                int idx = (historyIndex - j + FILTER_ORDER) % FILTER_ORDER;
                filtered += history[idx] * filter.coefficients[j];
            }
            
            upsampleBuffer[i] = filtered;
            historyIndex = (historyIndex + 1) % FILTER_ORDER;
        }
    }
    
    //--------------------------------------------------------------------------
    // Get upsampled buffer for processing
    double* getUpsampledBuffer() { return upsampleBuffer.data(); }
    
    //--------------------------------------------------------------------------
    // Downsample from processed buffer back to original rate
    double downsample() {
        // Anti-aliasing filter and decimation
        // For simplicity, use FIR filtering on the processed buffer
        
        double output = 0.0;
        for (int i = 0; i < oversampleFactor; ++i) {
            // Simple averaging for decimation (could use polyphase)
            output += upsampleBuffer[i];
        }
        output /= oversampleFactor;
        
        // Apply DC blocking
        double dcBlocked = output - dcState + 0.9999 * dcOutput;
        dcState = output;
        dcOutput = dcBlocked;
        
        return dcBlocked;
    }
    
    //--------------------------------------------------------------------------
    // Process a single sample through an amp model with oversampling
    template<typename AmpProcessor>
    double processSample(double input, AmpProcessor& processor) {
        // Upsample
        upsample(input);
        
        // Process each oversampled sample
        for (int i = 0; i < oversampleFactor; ++i) {
            upsampleBuffer[i] = processor.processSample(upsampleBuffer[i]);
        }
        
        // Downsample
        return downsample();
    }
    
    //--------------------------------------------------------------------------
    void reset() {
        history.fill(0.0);
        historyIndex = 0;
        dcState = 0.0;
        dcOutput = 0.0;
        std::fill(upsampleBuffer.begin(), upsampleBuffer.end(), 0.0);
    }
    
private:
    int oversampleFactor = 4;
    PolyphaseFilter filter;
    std::vector<double> upsampleBuffer;
    std::array<double, FILTER_ORDER> history{};
    int historyIndex = 0;
    
    // DC blocking state
    double dcState = 0.0;
    double dcOutput = 0.0;
};

//==============================================================================
// JUCE-style Oversampler wrapper (optional, for integration with juce::dsp)
//==============================================================================
template<int Factor>
class FixedOversampler {
public:
    static constexpr int OVERSAMPLE_FACTOR = Factor;
    
    FixedOversampler() {
        oversampler.setOversampleFactor(Factor);
    }
    
    template<typename Processor>
    double process(double input, Processor& proc) {
        return oversampler.processSample(input, proc);
    }
    
    void reset() {
        oversampler.reset();
    }
    
private:
    Oversampler oversampler;
};

} // namespace DSP
