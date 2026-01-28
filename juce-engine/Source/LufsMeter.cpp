/**
 * MAP2 Audio Engine - LUFS Loudness Meter Implementation
 */

#include "LufsMeter.h"
#include <cmath>
#include <algorithm>
#include <numeric>

namespace map2 {

LufsMeter::LufsMeter()
    : oversampling_(2, 2, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR)
{
}

void LufsMeter::prepare(double sampleRate, int numChannels) {
    sampleRate_ = sampleRate;
    numChannels_ = numChannels;

    // Calculate samples per 100ms block
    samplesPerBlock_ = static_cast<int>(sampleRate * BLOCK_SIZE_MS / 1000.0);

    // Initialize K-weighting filters for each channel
    kFilters_.resize(numChannels);
    initializeFilters();

    // Initialize channel weights (ITU-R BS.1770-4)
    channelWeights_.resize(numChannels, 1.0f);
    if (numChannels >= 6) {
        // 5.1 surround: Ls and Rs get 1.41 weight
        channelWeights_[4] = 1.41f;  // Ls
        channelWeights_[5] = 1.41f;  // Rs
    }

    // Initialize accumulators
    blockAccumulator_.resize(numChannels, 0.0);
    blockSampleCount_ = 0;

    // Prepare true peak oversampling
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = 4096;
    spec.numChannels = static_cast<juce::uint32>(numChannels);
    oversampling_.initProcessing(4096);

    reset();
}

void LufsMeter::initializeFilters() {
    // ITU-R BS.1770-4 K-weighting filter coefficients
    // Pre-filter: High shelf at 1681.97 Hz with +4 dB gain
    // RLB filter: High-pass at 38.13 Hz

    for (auto& filter : kFilters_) {
        // Pre-filter coefficients (high shelf)
        // These are the standard BS.1770 coefficients for 48kHz
        // For other sample rates, we'd need to recalculate

        auto preCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighShelf(
            sampleRate_, 1681.97, 0.7071067811865476, 3.999843853973347);

        filter.preFilter.coefficients = preCoeffs;

        // RLB (Revised Low-frequency B-curve) filter
        auto rlbCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(
            sampleRate_, 38.13, 0.5);

        filter.rlbFilter.coefficients = rlbCoeffs;

        filter.preFilter.reset();
        filter.rlbFilter.reset();
    }
}

void LufsMeter::reset() {
    momentaryBlocks_.clear();
    shortTermBlocks_.clear();
    integratedBlocks_.clear();

    for (auto& acc : blockAccumulator_) {
        acc = 0.0;
    }
    blockSampleCount_ = 0;

    for (auto& filter : kFilters_) {
        filter.preFilter.reset();
        filter.rlbFilter.reset();
    }

    truePeak_ = 0.0f;
    maxTruePeak_ = 0.0f;
    relativeThreshold_ = -70.0f;

    std::lock_guard<std::mutex> lock(mutex_);
    levels_ = LufsLevels{};
}

void LufsMeter::resetIntegrated() {
    integratedBlocks_.clear();
    relativeThreshold_ = -70.0f;

    std::lock_guard<std::mutex> lock(mutex_);
    levels_.integrated = -100.0f;
    levels_.range = 0.0f;
}

void LufsMeter::process(const juce::AudioBuffer<float>& buffer) {
    process(buffer.getArrayOfReadPointers(), buffer.getNumChannels(), buffer.getNumSamples());
}

void LufsMeter::process(const float* const* channels, int numChannels, int numSamples) {
    numChannels = std::min(numChannels, numChannels_);

    // Process samples through K-weighting and accumulate
    for (int i = 0; i < numSamples; ++i) {
        for (int ch = 0; ch < numChannels; ++ch) {
            float sample = channels[ch][i];

            // Apply K-weighting filters
            sample = kFilters_[ch].preFilter.processSample(sample);
            sample = kFilters_[ch].rlbFilter.processSample(sample);

            // Accumulate weighted mean square
            blockAccumulator_[ch] += static_cast<double>(sample * sample) * channelWeights_[ch];
        }

        blockSampleCount_++;

        // Process block when full
        if (blockSampleCount_ >= samplesPerBlock_) {
            processBlock();
        }
    }

    // True peak detection
    if (truePeakEnabled_) {
        juce::AudioBuffer<float> tempBuffer(numChannels, numSamples);
        for (int ch = 0; ch < numChannels; ++ch) {
            tempBuffer.copyFrom(ch, 0, channels[ch], numSamples);
        }
        detectTruePeak(tempBuffer);
    }
}

void LufsMeter::processBlock() {
    // Calculate mean square for this block
    double sumSquare = 0.0;
    for (int ch = 0; ch < numChannels_; ++ch) {
        sumSquare += blockAccumulator_[ch];
        blockAccumulator_[ch] = 0.0;
    }

    float meanSquare = static_cast<float>(sumSquare / blockSampleCount_);
    blockSampleCount_ = 0;

    // Add to momentary window
    momentaryBlocks_.push_back(meanSquare);
    while (momentaryBlocks_.size() > MOMENTARY_BLOCKS) {
        momentaryBlocks_.pop_front();
    }

    // Add to short-term window
    shortTermBlocks_.push_back(meanSquare);
    while (shortTermBlocks_.size() > SHORT_TERM_BLOCKS) {
        shortTermBlocks_.pop_front();
    }

    // Add to integrated (ungated for now, gating applied in calculation)
    integratedBlocks_.push_back(meanSquare);

    // Calculate current levels
    float momentary = calculateLoudness(momentaryBlocks_);
    float shortTerm = calculateLoudness(shortTermBlocks_);
    float integrated = calculateIntegratedLoudness();
    float range = calculateLoudnessRange();

    // Update levels (thread-safe)
    {
        std::lock_guard<std::mutex> lock(mutex_);
        levels_.momentary = momentary;
        levels_.shortTerm = shortTerm;
        levels_.integrated = integrated;
        levels_.range = range;
        levels_.truePeak = 20.0f * std::log10(std::max(truePeak_.load(), 1e-10f));

        // Track maximums
        levels_.maxMomentary = std::max(levels_.maxMomentary, momentary);
        levels_.maxShortTerm = std::max(levels_.maxShortTerm, shortTerm);
        levels_.maxTruePeak = std::max(levels_.maxTruePeak, levels_.truePeak);
    }
}

float LufsMeter::calculateLoudness(const std::deque<float>& blocks) const {
    if (blocks.empty()) return -100.0f;

    // Average mean square values
    double sum = std::accumulate(blocks.begin(), blocks.end(), 0.0);
    double meanSquare = sum / blocks.size();

    if (meanSquare <= 0.0) return -100.0f;

    // Convert to LUFS: -0.691 + 10 * log10(meanSquare)
    return -0.691f + 10.0f * std::log10(static_cast<float>(meanSquare));
}

float LufsMeter::calculateIntegratedLoudness() const {
    if (integratedBlocks_.empty()) return -100.0f;

    // Two-pass gating per ITU-R BS.1770-4

    // Pass 1: Absolute threshold at -70 LUFS
    std::vector<float> gatedBlocks;
    for (float block : integratedBlocks_) {
        float lufs = (block > 0) ? -0.691f + 10.0f * std::log10(block) : -100.0f;
        if (lufs > -70.0f) {
            gatedBlocks.push_back(block);
        }
    }

    if (gatedBlocks.empty()) return -100.0f;

    // Calculate first pass loudness
    double sum = std::accumulate(gatedBlocks.begin(), gatedBlocks.end(), 0.0);
    double meanSquare = sum / gatedBlocks.size();
    float firstPassLufs = -0.691f + 10.0f * std::log10(static_cast<float>(meanSquare));

    // Pass 2: Relative threshold at first pass - 10 LU
    float relativeThreshold = firstPassLufs - 10.0f;
    gatedBlocks.clear();

    for (float block : integratedBlocks_) {
        float lufs = (block > 0) ? -0.691f + 10.0f * std::log10(block) : -100.0f;
        if (lufs > relativeThreshold) {
            gatedBlocks.push_back(block);
        }
    }

    if (gatedBlocks.empty()) return -100.0f;

    // Calculate final integrated loudness
    sum = std::accumulate(gatedBlocks.begin(), gatedBlocks.end(), 0.0);
    meanSquare = sum / gatedBlocks.size();

    return -0.691f + 10.0f * std::log10(static_cast<float>(meanSquare));
}

float LufsMeter::calculateLoudnessRange() const {
    if (shortTermBlocks_.size() < 2) return 0.0f;

    // LRA is calculated from short-term loudness distribution
    // Percentile method: 10th to 95th percentile

    std::vector<float> shortTermLufs;
    for (float block : shortTermBlocks_) {
        if (block > 0) {
            shortTermLufs.push_back(-0.691f + 10.0f * std::log10(block));
        }
    }

    if (shortTermLufs.size() < 2) return 0.0f;

    std::sort(shortTermLufs.begin(), shortTermLufs.end());

    size_t p10Index = static_cast<size_t>(shortTermLufs.size() * 0.10);
    size_t p95Index = static_cast<size_t>(shortTermLufs.size() * 0.95);

    p10Index = std::min(p10Index, shortTermLufs.size() - 1);
    p95Index = std::min(p95Index, shortTermLufs.size() - 1);

    return shortTermLufs[p95Index] - shortTermLufs[p10Index];
}

void LufsMeter::detectTruePeak(const juce::AudioBuffer<float>& buffer) {
    // 4x oversampling for true peak detection
    juce::dsp::AudioBlock<float> block(const_cast<juce::AudioBuffer<float>&>(buffer));
    auto oversampledBlock = oversampling_.processSamplesUp(block);

    float maxSample = 0.0f;
    for (size_t ch = 0; ch < oversampledBlock.getNumChannels(); ++ch) {
        auto* data = oversampledBlock.getChannelPointer(ch);
        for (size_t i = 0; i < oversampledBlock.getNumSamples(); ++i) {
            maxSample = std::max(maxSample, std::abs(data[i]));
        }
    }

    // Update true peak with decay
    float current = truePeak_.load();
    if (maxSample > current) {
        truePeak_.store(maxSample);
    } else {
        // Decay at ~12 dB/second (about 0.9995 per sample at 48kHz)
        truePeak_.store(current * 0.9999f);
    }

    // Update maximum
    float maxPeak = maxTruePeak_.load();
    if (maxSample > maxPeak) {
        maxTruePeak_.store(maxSample);
    }
}

LufsLevels LufsMeter::getLevels() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_;
}

float LufsMeter::getMomentary() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_.momentary;
}

float LufsMeter::getShortTerm() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_.shortTerm;
}

float LufsMeter::getIntegrated() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_.integrated;
}

float LufsMeter::getLoudnessRange() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_.range;
}

float LufsMeter::getTruePeak() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return levels_.truePeak;
}

void LufsMeter::setChannelWeights(const std::vector<float>& weights) {
    channelWeights_ = weights;
    channelWeights_.resize(numChannels_, 1.0f);
}

void LufsMeter::setTruePeakEnabled(bool enabled) {
    truePeakEnabled_ = enabled;
}

} // namespace map2
