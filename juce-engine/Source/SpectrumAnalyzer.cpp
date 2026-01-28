/**
 * MAP2 Audio Engine - Spectrum Analyzer Implementation
 */

#include "SpectrumAnalyzer.h"
#include <cmath>

namespace map2 {

SpectrumAnalyzer::SpectrumAnalyzer()
    : fft_(FFT_ORDER)
    , window_(FFT_SIZE, juce::dsp::WindowingFunction<float>::hann)
{
    // Initialize smoothed magnitudes to floor
    smoothedMagnitudes_.fill(floorDb_);

    // Initialize spectrum data
    latestSpectrum_.magnitudes.fill(floorDb_);
    latestSpectrum_.frequencies.fill(0.0f);

    lastProcessTime_ = std::chrono::high_resolution_clock::now();
}

void SpectrumAnalyzer::prepare(double sampleRate) {
    sampleRate_ = sampleRate;
    computeBinFrequencies();
    reset();
}

void SpectrumAnalyzer::reset() {
    fifoIndex_ = 0;
    inputFifo_.fill(0.0f);
    fftData_.fill(0.0f);
    smoothedMagnitudes_.fill(floorDb_);
    fftReady_ = false;

    std::lock_guard<std::mutex> lock(spectrumMutex_);
    latestSpectrum_.magnitudes.fill(floorDb_);
    latestSpectrum_.ready = false;
}

void SpectrumAnalyzer::pushSamples(const float* samples, int numSamples) {
    if (!enabled_ || samples == nullptr) return;

    for (int i = 0; i < numSamples; ++i) {
        int idx = fifoIndex_.load();
        inputFifo_[idx] = samples[i];

        if (++idx >= FFT_SIZE) {
            idx = 0;
            fftReady_ = true;
        }

        fifoIndex_.store(idx);
    }

    // Process FFT when buffer is full
    if (fftReady_) {
        processFFT();
        fftReady_ = false;
    }
}

void SpectrumAnalyzer::pushSamplesStereo(const float* left, const float* right, int numSamples) {
    if (!enabled_) return;

    for (int i = 0; i < numSamples; ++i) {
        float mono = 0.0f;
        if (left != nullptr) mono += left[i];
        if (right != nullptr) mono += right[i];
        if (left != nullptr && right != nullptr) mono *= 0.5f;

        int idx = fifoIndex_.load();
        inputFifo_[idx] = mono;

        if (++idx >= FFT_SIZE) {
            idx = 0;
            fftReady_ = true;
        }

        fifoIndex_.store(idx);
    }

    if (fftReady_) {
        processFFT();
        fftReady_ = false;
    }
}

void SpectrumAnalyzer::pushBuffer(const juce::AudioBuffer<float>& buffer) {
    int numChannels = buffer.getNumChannels();
    int numSamples = buffer.getNumSamples();

    if (numChannels >= 2) {
        pushSamplesStereo(buffer.getReadPointer(0), buffer.getReadPointer(1), numSamples);
    } else if (numChannels == 1) {
        pushSamples(buffer.getReadPointer(0), numSamples);
    }
}

void SpectrumAnalyzer::processFFT() {
    auto now = std::chrono::high_resolution_clock::now();
    float elapsedSeconds = std::chrono::duration<float>(now - lastProcessTime_).count();
    lastProcessTime_ = now;

    // Copy FIFO to FFT buffer (with proper ordering for ring buffer)
    int fifoIdx = fifoIndex_.load();
    for (int i = 0; i < FFT_SIZE; ++i) {
        int srcIdx = (fifoIdx + i) % FFT_SIZE;
        fftData_[i] = inputFifo_[srcIdx];
    }

    // Apply window function
    window_.multiplyWithWindowingTable(fftData_.data(), FFT_SIZE);

    // Perform FFT (in-place, interleaved real/imag output)
    fft_.performFrequencyOnlyForwardTransform(fftData_.data());

    // Calculate decay factor
    float decayFactor = std::exp(-decayRate_ * elapsedSeconds / 20.0f);  // dB decay

    // Find peak
    float peakMag = floorDb_;
    int peakBin = 0;

    // Process magnitudes
    for (int i = 0; i < NUM_BINS; ++i) {
        // FFT output is magnitude values directly after performFrequencyOnlyForwardTransform
        float magnitude = fftData_[i];

        // Convert to dB
        float magnitudeDb = magnitude > 0.0f
            ? 20.0f * std::log10(magnitude / static_cast<float>(FFT_SIZE))
            : floorDb_;

        // Clamp to floor
        magnitudeDb = std::max(magnitudeDb, floorDb_);

        // Apply smoothing with decay
        if (magnitudeDb > smoothedMagnitudes_[i]) {
            // Attack: instant
            smoothedMagnitudes_[i] = magnitudeDb;
        } else {
            // Release: decay
            smoothedMagnitudes_[i] = smoothedMagnitudes_[i] * decayFactor +
                                     magnitudeDb * (1.0f - decayFactor);
        }

        // Track peak
        if (smoothedMagnitudes_[i] > peakMag) {
            peakMag = smoothedMagnitudes_[i];
            peakBin = i;
        }
    }

    // Update spectrum data (thread-safe)
    {
        std::lock_guard<std::mutex> lock(spectrumMutex_);
        std::copy(smoothedMagnitudes_.begin(), smoothedMagnitudes_.end(),
                 latestSpectrum_.magnitudes.begin());
        std::copy(binFrequencies_.begin(), binFrequencies_.end(),
                 latestSpectrum_.frequencies.begin());
        latestSpectrum_.peakFrequency = binFrequencies_[peakBin];
        latestSpectrum_.peakMagnitude = peakMag;
        latestSpectrum_.ready = true;
    }
}

SpectrumAnalyzer::SpectrumData SpectrumAnalyzer::getSpectrum() const {
    std::lock_guard<std::mutex> lock(spectrumMutex_);
    return latestSpectrum_;
}

std::vector<float> SpectrumAnalyzer::getMagnitudes() const {
    std::lock_guard<std::mutex> lock(spectrumMutex_);
    return std::vector<float>(latestSpectrum_.magnitudes.begin(),
                              latestSpectrum_.magnitudes.end());
}

std::vector<float> SpectrumAnalyzer::getFrequencies() const {
    std::lock_guard<std::mutex> lock(spectrumMutex_);
    return std::vector<float>(latestSpectrum_.frequencies.begin(),
                              latestSpectrum_.frequencies.end());
}

void SpectrumAnalyzer::setWindowType(WindowType type) {
    if (windowType_ == type) return;
    windowType_ = type;
    updateWindowFunction();
}

void SpectrumAnalyzer::setDecayRate(float dbPerSecond) {
    decayRate_ = std::max(0.0f, dbPerSecond);
}

void SpectrumAnalyzer::setFloorLevel(float floorDb) {
    floorDb_ = floorDb;
}

void SpectrumAnalyzer::setEnabled(bool enabled) {
    enabled_ = enabled;
    if (!enabled) {
        reset();
    }
}

void SpectrumAnalyzer::updateWindowFunction() {
    window_ = juce::dsp::WindowingFunction<float>(
        FFT_SIZE, toJuceWindowType(windowType_));
}

void SpectrumAnalyzer::computeBinFrequencies() {
    float binWidth = static_cast<float>(sampleRate_) / FFT_SIZE;
    for (int i = 0; i < NUM_BINS; ++i) {
        binFrequencies_[i] = i * binWidth;
    }
}

juce::dsp::WindowingFunction<float>::WindowingMethod
SpectrumAnalyzer::toJuceWindowType(WindowType type) {
    switch (type) {
        case WindowType::Hann:
            return juce::dsp::WindowingFunction<float>::hann;
        case WindowType::Hamming:
            return juce::dsp::WindowingFunction<float>::hamming;
        case WindowType::Blackman:
            return juce::dsp::WindowingFunction<float>::blackman;
        case WindowType::BlackmanHarris:
            return juce::dsp::WindowingFunction<float>::blackmanHarris;
        case WindowType::FlatTop:
            return juce::dsp::WindowingFunction<float>::flatTop;
        case WindowType::Rectangular:
            return juce::dsp::WindowingFunction<float>::rectangular;
    }
    return juce::dsp::WindowingFunction<float>::hann;
}

} // namespace map2
