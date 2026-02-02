#pragma once

/**
 * MAP2 Audio Engine - Filter Processor
 * Multi-band parametric EQ using JUCE StateVariableTPTFilter
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <array>
#include <atomic>
#include <mutex>

namespace map2 {

/**
 * FilterProcessor - 8-band parametric EQ
 *
 * Features:
 * - 8 independent filter bands
 * - Multiple filter types per band (LP, HP, BP, Peak, Shelf)
 * - Real-time frequency response calculation
 * - RT-safe parameter updates via atomics
 */
class FilterProcessor {
public:
    static constexpr int MAX_BANDS = 8;

    /**
     * Filter type for each band
     */
    enum class FilterType {
        LowPass,
        HighPass,
        BandPass,
        Notch,
        Peak,
        LowShelf,
        HighShelf,
        AllPass
    };

    /**
     * Parameters for a single filter band
     */
    struct BandParameters {
        FilterType type = FilterType::Peak;
        float frequency = 1000.0f;  // Hz (20 - 20000)
        float gain = 0.0f;          // dB (-24 to +24)
        float q = 1.0f;             // Q factor (0.1 to 10)
        bool enabled = true;
    };

    /**
     * Complete EQ parameters
     */
    struct Parameters {
        std::array<BandParameters, MAX_BANDS> bands;
        float outputGain = 0.0f;    // dB (-12 to +12)
        bool bypass = false;
    };

    FilterProcessor();
    ~FilterProcessor() = default;

    // Prevent copying
    FilterProcessor(const FilterProcessor&) = delete;
    FilterProcessor& operator=(const FilterProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     * @param sampleRate Audio sample rate
     * @param samplesPerBlock Maximum block size
     * @param numChannels Number of channels (1 or 2)
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset internal state
     */
    void reset();

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio block in-place
     * @param buffer Audio buffer (modified in place)
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Band Control (RT-safe)
    // ========================================

    /**
     * Set band parameters
     * @param bandIndex Band index (0 to MAX_BANDS-1)
     * @param params Band parameters
     */
    void setBand(int bandIndex, const BandParameters& params);

    /**
     * Set band frequency
     */
    void setBandFrequency(int bandIndex, float hz);

    /**
     * Set band gain
     */
    void setBandGain(int bandIndex, float dB);

    /**
     * Set band Q
     */
    void setBandQ(int bandIndex, float q);

    /**
     * Set band type
     */
    void setBandType(int bandIndex, FilterType type);

    /**
     * Set band enabled state
     */
    void setBandEnabled(int bandIndex, bool enabled);

    /**
     * Get band parameters
     */
    BandParameters getBand(int bandIndex) const;

    // ========================================
    // Global Control
    // ========================================

    /**
     * Set output gain
     */
    void setOutputGain(float dB);
    float getOutputGain() const { return outputGain_.load(); }

    /**
     * Set bypass state
     */
    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    /**
     * Get all parameters
     */
    Parameters getParameters() const;

    /**
     * Set all parameters
     */
    void setParameters(const Parameters& params);

    // ========================================
    // Frequency Response
    // ========================================

    /**
     * Get frequency response at given frequencies
     * @param frequencies Array of frequencies to evaluate (Hz)
     * @return Array of magnitude responses (dB)
     */
    std::vector<float> getFrequencyResponse(const std::vector<float>& frequencies) const;

    /**
     * Get frequency response for a single band
     */
    std::vector<float> getBandFrequencyResponse(int bandIndex,
                                                  const std::vector<float>& frequencies) const;

    // ========================================
    // Utility
    // ========================================

    /**
     * Get filter type as string
     */
    static std::string filterTypeToString(FilterType type);

    /**
     * Parse filter type from string
     */
    static FilterType stringToFilterType(const std::string& str);

private:
    // Filter processors (one per band, stereo)
    struct FilterBand {
        juce::dsp::StateVariableTPTFilter<float> filterL;
        juce::dsp::StateVariableTPTFilter<float> filterR;
        std::atomic<float> frequency{1000.0f};
        std::atomic<float> gain{0.0f};
        std::atomic<float> q{1.0f};
        std::atomic<FilterType> type{FilterType::Peak};
        std::atomic<bool> enabled{true};
        std::atomic<bool> parametersChanged{true};
    };

    std::array<FilterBand, MAX_BANDS> bands_;

    // Output gain
    juce::dsp::Gain<float> outputGainProcessor_;
    std::atomic<float> outputGain_{0.0f};

    // Global state
    std::atomic<bool> bypass_{false};

    // Processing config
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;

    // Helper methods
    void updateBandCoefficients(int bandIndex);
    juce::dsp::StateVariableTPTFilter<float>::Type getJuceFilterType(FilterType type) const;

    // For frequency response calculation
    mutable std::mutex responseMutex_;
};

} // namespace map2
