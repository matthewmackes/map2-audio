#pragma once

/**
 * MAP2 Audio Engine - Spectrum Analyzer
 * Real-time FFT-based spectrum analysis using JUCE DSP
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <array>
#include <atomic>

namespace map2 {

/**
 * SpectrumAnalyzer - Real-time FFT spectrum analysis
 *
 * Features:
 * - 2048-point FFT (1024 bins)
 * - Configurable window function
 * - Smoothed magnitude output
 * - Lock-free thread-safe access
 * - Logarithmic frequency scaling
 */
class SpectrumAnalyzer {
public:
    static constexpr int FFT_ORDER = 11;  // 2^11 = 2048
    static constexpr int FFT_SIZE = 1 << FFT_ORDER;
    static constexpr int NUM_BINS = FFT_SIZE / 2;

    /**
     * Spectrum data structure for external consumption
     */
    struct SpectrumData {
        std::array<float, NUM_BINS> magnitudes{};    // dB values
        std::array<float, NUM_BINS> frequencies{};   // Hz values
        float peakFrequency = 0.0f;                  // Frequency of peak bin
        float peakMagnitude = -100.0f;               // Peak magnitude in dB
        float spectralCentroid = 0.0f;               // Spectral centroid in Hz
        bool ready = false;                           // Data is valid
    };

    /**
     * Window function types
     */
    enum class WindowType {
        Hann,
        Hamming,
        Blackman,
        BlackmanHarris,
        FlatTop,
        Rectangular
    };

    SpectrumAnalyzer();
    ~SpectrumAnalyzer() = default;

    // Prevent copying
    SpectrumAnalyzer(const SpectrumAnalyzer&) = delete;
    SpectrumAnalyzer& operator=(const SpectrumAnalyzer&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for analysis
     * @param sampleRate Audio sample rate
     */
    void prepare(double sampleRate);

    /**
     * Reset analyzer state
     */
    void reset();

    // ========================================
    // Sample input (call from audio thread)
    // ========================================

    /**
     * Push mono samples for analysis
     */
    void pushSamples(const float* samples, int numSamples);

    /**
     * Push stereo samples (averaged to mono for analysis)
     */
    void pushSamplesStereo(const float* left, const float* right, int numSamples);

    /**
     * Push from JUCE AudioBuffer
     */
    void pushBuffer(const juce::AudioBuffer<float>& buffer);

    // ========================================
    // Spectrum retrieval (thread-safe)
    // ========================================

    /**
     * Get current spectrum data
     * This is thread-safe and can be called from any thread
     */
    SpectrumData getSpectrum() const;

    /**
     * Get spectrum as Python-friendly vectors
     */
    std::vector<float> getMagnitudes() const;
    std::vector<float> getFrequencies() const;

    // ========================================
    // Configuration
    // ========================================

    /**
     * Set window function
     */
    void setWindowType(WindowType type);
    WindowType getWindowType() const { return windowType_; }

    /**
     * Set magnitude decay rate (dB per second)
     * Higher values = faster decay = more responsive
     * Lower values = slower decay = smoother display
     */
    void setDecayRate(float dbPerSecond);
    float getDecayRate() const { return decayRate_; }

    /**
     * Set minimum magnitude threshold (dB)
     * Values below this are clamped
     */
    void setFloorLevel(float floorDb);
    float getFloorLevel() const { return floorDb_; }

    /**
     * Enable/disable spectrum analysis
     */
    void setEnabled(bool enabled);
    bool isEnabled() const { return enabled_; }

private:
    // FFT processor
    juce::dsp::FFT fft_;
    std::unique_ptr<juce::dsp::WindowingFunction<float>> window_;

    // Configuration
    WindowType windowType_ = WindowType::Hann;
    double sampleRate_ = 48000.0;
    float decayRate_ = 24.0f;    // dB/second
    float floorDb_ = -100.0f;    // Minimum dB
    bool enabled_ = true;

    // Input FIFO (ring buffer)
    std::array<float, FFT_SIZE> inputFifo_{};
    std::atomic<int> fifoIndex_{0};

    // FFT processing buffers
    std::array<float, FFT_SIZE * 2> fftData_{};

    // Smoothed output
    std::array<float, NUM_BINS> smoothedMagnitudes_{};

    // Frequency values (precomputed)
    std::array<float, NUM_BINS> binFrequencies_{};

    // Latest spectrum (for thread-safe access)
    mutable std::mutex spectrumMutex_;
    SpectrumData latestSpectrum_;

    // Processing state
    bool fftReady_ = false;
    std::chrono::high_resolution_clock::time_point lastProcessTime_;

    // Private methods
    void processFFT();
    void updateWindowFunction();
    void computeBinFrequencies();
    static juce::dsp::WindowingFunction<float>::WindowingMethod toJuceWindowType(WindowType type);
};

} // namespace map2
