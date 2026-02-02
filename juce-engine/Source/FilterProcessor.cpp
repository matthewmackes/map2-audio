/**
 * MAP2 Audio Engine - Filter Processor Implementation
 */

#include "FilterProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

FilterProcessor::FilterProcessor() {
    // Initialize default band frequencies (classic EQ layout)
    const float defaultFreqs[MAX_BANDS] = {
        80.0f, 160.0f, 320.0f, 640.0f,
        1280.0f, 2560.0f, 5120.0f, 10240.0f
    };

    for (int i = 0; i < MAX_BANDS; ++i) {
        bands_[i].frequency.store(defaultFreqs[i]);
        bands_[i].gain.store(0.0f);
        bands_[i].q.store(1.0f);
        bands_[i].type.store(FilterType::Peak);
        bands_[i].enabled.store(true);
        bands_[i].parametersChanged.store(true);
    }
}

void FilterProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = 1;  // Each filter is mono

    // Prepare all filter bands
    for (int i = 0; i < MAX_BANDS; ++i) {
        bands_[i].filterL.prepare(spec);
        bands_[i].filterR.prepare(spec);
        bands_[i].parametersChanged.store(true);
    }

    // Prepare output gain
    spec.numChannels = static_cast<juce::uint32>(numChannels);
    outputGainProcessor_.prepare(spec);
    outputGainProcessor_.setGainDecibels(outputGain_.load());

    prepared_ = true;

    // Update all coefficients
    for (int i = 0; i < MAX_BANDS; ++i) {
        updateBandCoefficients(i);
    }
}

void FilterProcessor::reset() {
    for (int i = 0; i < MAX_BANDS; ++i) {
        bands_[i].filterL.reset();
        bands_[i].filterR.reset();
    }
    outputGainProcessor_.reset();
}

void FilterProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    // Check bypass
    if (bypass_.load()) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    const int numSamples = buffer.getNumSamples();

    // Process each enabled band
    for (int b = 0; b < MAX_BANDS; ++b) {
        if (!bands_[b].enabled.load()) continue;

        // Update coefficients if needed
        if (bands_[b].parametersChanged.exchange(false)) {
            updateBandCoefficients(b);
        }

        // Process left channel
        if (numChannels >= 1) {
            auto* dataL = buffer.getWritePointer(0);
            for (int i = 0; i < numSamples; ++i) {
                dataL[i] = bands_[b].filterL.processSample(0, dataL[i]);
            }
        }

        // Process right channel
        if (numChannels >= 2) {
            auto* dataR = buffer.getWritePointer(1);
            for (int i = 0; i < numSamples; ++i) {
                dataR[i] = bands_[b].filterR.processSample(0, dataR[i]);
            }
        }
    }

    // Apply output gain
    float gain = outputGain_.load();
    if (std::abs(gain) > 0.01f) {
        outputGainProcessor_.setGainDecibels(gain);
        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);
        outputGainProcessor_.process(context);
    }
}

void FilterProcessor::updateBandCoefficients(int bandIndex) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;

    auto& band = bands_[bandIndex];
    float freq = band.frequency.load();
    float gain = band.gain.load();
    float q = band.q.load();
    FilterType type = band.type.load();

    // Clamp frequency to valid range
    freq = std::clamp(freq, 20.0f, static_cast<float>(sampleRate_ / 2.1));

    // Set filter type
    auto juceType = getJuceFilterType(type);
    band.filterL.setType(juceType);
    band.filterR.setType(juceType);

    // Set cutoff frequency
    band.filterL.setCutoffFrequency(freq);
    band.filterR.setCutoffFrequency(freq);

    // Set resonance (Q)
    band.filterL.setResonance(std::clamp(q, 0.1f, 10.0f));
    band.filterR.setResonance(std::clamp(q, 0.1f, 10.0f));

    // Note: JUCE's StateVariableTPTFilter doesn't have built-in gain for peak/shelf
    // For a proper parametric EQ, we'd need to use IIR filters or a different approach
    // This implementation uses the basic SVF which is good for crossovers/basic EQ
}

juce::dsp::StateVariableTPTFilter<float>::Type FilterProcessor::getJuceFilterType(FilterType type) const {
    switch (type) {
        case FilterType::LowPass:
            return juce::dsp::StateVariableTPTFilter<float>::Type::lowpass;
        case FilterType::HighPass:
            return juce::dsp::StateVariableTPTFilter<float>::Type::highpass;
        case FilterType::BandPass:
        case FilterType::Peak:  // Use bandpass as approximation
            return juce::dsp::StateVariableTPTFilter<float>::Type::bandpass;
        default:
            return juce::dsp::StateVariableTPTFilter<float>::Type::lowpass;
    }
}

// ========================================
// Band Control
// ========================================

void FilterProcessor::setBand(int bandIndex, const BandParameters& params) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;

    auto& band = bands_[bandIndex];
    band.frequency.store(std::clamp(params.frequency, 20.0f, 20000.0f));
    band.gain.store(std::clamp(params.gain, -24.0f, 24.0f));
    band.q.store(std::clamp(params.q, 0.1f, 10.0f));
    band.type.store(params.type);
    band.enabled.store(params.enabled);
    band.parametersChanged.store(true);
}

void FilterProcessor::setBandFrequency(int bandIndex, float hz) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;
    bands_[bandIndex].frequency.store(std::clamp(hz, 20.0f, 20000.0f));
    bands_[bandIndex].parametersChanged.store(true);
}

void FilterProcessor::setBandGain(int bandIndex, float dB) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;
    bands_[bandIndex].gain.store(std::clamp(dB, -24.0f, 24.0f));
    bands_[bandIndex].parametersChanged.store(true);
}

void FilterProcessor::setBandQ(int bandIndex, float q) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;
    bands_[bandIndex].q.store(std::clamp(q, 0.1f, 10.0f));
    bands_[bandIndex].parametersChanged.store(true);
}

void FilterProcessor::setBandType(int bandIndex, FilterType type) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;
    bands_[bandIndex].type.store(type);
    bands_[bandIndex].parametersChanged.store(true);
}

void FilterProcessor::setBandEnabled(int bandIndex, bool enabled) {
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return;
    bands_[bandIndex].enabled.store(enabled);
}

FilterProcessor::BandParameters FilterProcessor::getBand(int bandIndex) const {
    BandParameters params;
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return params;

    const auto& band = bands_[bandIndex];
    params.frequency = band.frequency.load();
    params.gain = band.gain.load();
    params.q = band.q.load();
    params.type = band.type.load();
    params.enabled = band.enabled.load();
    return params;
}

// ========================================
// Global Control
// ========================================

void FilterProcessor::setOutputGain(float dB) {
    outputGain_.store(std::clamp(dB, -12.0f, 12.0f));
}

void FilterProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

FilterProcessor::Parameters FilterProcessor::getParameters() const {
    Parameters params;
    for (int i = 0; i < MAX_BANDS; ++i) {
        params.bands[i] = getBand(i);
    }
    params.outputGain = outputGain_.load();
    params.bypass = bypass_.load();
    return params;
}

void FilterProcessor::setParameters(const Parameters& params) {
    for (int i = 0; i < MAX_BANDS; ++i) {
        setBand(i, params.bands[i]);
    }
    setOutputGain(params.outputGain);
    setBypass(params.bypass);
}

// ========================================
// Frequency Response
// ========================================

std::vector<float> FilterProcessor::getFrequencyResponse(const std::vector<float>& frequencies) const {
    std::lock_guard<std::mutex> lock(responseMutex_);

    std::vector<float> response(frequencies.size(), 0.0f);

    // Sum contributions from all enabled bands
    for (int b = 0; b < MAX_BANDS; ++b) {
        if (!bands_[b].enabled.load()) continue;

        auto bandResponse = getBandFrequencyResponse(b, frequencies);
        for (size_t i = 0; i < frequencies.size(); ++i) {
            response[i] += bandResponse[i];
        }
    }

    // Add output gain
    float outGain = outputGain_.load();
    for (size_t i = 0; i < frequencies.size(); ++i) {
        response[i] += outGain;
    }

    return response;
}

std::vector<float> FilterProcessor::getBandFrequencyResponse(int bandIndex,
                                                               const std::vector<float>& frequencies) const {
    std::vector<float> response(frequencies.size(), 0.0f);
    if (bandIndex < 0 || bandIndex >= MAX_BANDS) return response;

    const auto& band = bands_[bandIndex];
    float fc = band.frequency.load();
    float gain = band.gain.load();
    float q = band.q.load();
    FilterType type = band.type.load();

    // Simple frequency response approximation
    // For accurate response, would need to compute actual filter coefficients
    for (size_t i = 0; i < frequencies.size(); ++i) {
        float f = frequencies[i];
        float ratio = f / fc;

        switch (type) {
            case FilterType::LowPass:
                response[i] = -20.0f * std::log10(std::sqrt(1.0f + std::pow(ratio, 4.0f)));
                break;

            case FilterType::HighPass:
                response[i] = -20.0f * std::log10(std::sqrt(1.0f + std::pow(1.0f / ratio, 4.0f)));
                break;

            case FilterType::Peak: {
                // Bell curve approximation
                float logRatio = std::log2(ratio);
                float bandwidth = 1.0f / q;
                float bellCurve = std::exp(-0.5f * std::pow(logRatio / bandwidth, 2.0f));
                response[i] = gain * bellCurve;
                break;
            }

            case FilterType::LowShelf: {
                float transition = 1.0f / (1.0f + std::pow(ratio, 2.0f));
                response[i] = gain * transition;
                break;
            }

            case FilterType::HighShelf: {
                float transition = 1.0f / (1.0f + std::pow(1.0f / ratio, 2.0f));
                response[i] = gain * transition;
                break;
            }

            case FilterType::BandPass: {
                float bw = fc / q;
                float delta = std::abs(f - fc);
                response[i] = -20.0f * std::log10(1.0f + std::pow(delta / bw, 2.0f));
                break;
            }

            case FilterType::Notch: {
                float bw = fc / q;
                float delta = std::abs(f - fc);
                if (delta < bw * 0.5f) {
                    response[i] = -60.0f * (1.0f - delta / (bw * 0.5f));
                }
                break;
            }

            default:
                break;
        }
    }

    return response;
}

// ========================================
// Utility
// ========================================

std::string FilterProcessor::filterTypeToString(FilterType type) {
    switch (type) {
        case FilterType::LowPass: return "lowpass";
        case FilterType::HighPass: return "highpass";
        case FilterType::BandPass: return "bandpass";
        case FilterType::Notch: return "notch";
        case FilterType::Peak: return "peak";
        case FilterType::LowShelf: return "lowshelf";
        case FilterType::HighShelf: return "highshelf";
        case FilterType::AllPass: return "allpass";
        default: return "peak";
    }
}

FilterProcessor::FilterType FilterProcessor::stringToFilterType(const std::string& str) {
    if (str == "lowpass") return FilterType::LowPass;
    if (str == "highpass") return FilterType::HighPass;
    if (str == "bandpass") return FilterType::BandPass;
    if (str == "notch") return FilterType::Notch;
    if (str == "peak") return FilterType::Peak;
    if (str == "lowshelf") return FilterType::LowShelf;
    if (str == "highshelf") return FilterType::HighShelf;
    if (str == "allpass") return FilterType::AllPass;
    return FilterType::Peak;
}

} // namespace map2
