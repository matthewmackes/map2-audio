/**
 * MAP2 Audio Engine - Phase Correlation Meter Implementation
 */

#include "PhaseCorrelation.h"
#include <cmath>
#include <algorithm>

namespace map2 {

PhaseCorrelationMeter::PhaseCorrelationMeter() {
    updateSmoothingCoeff();
}

void PhaseCorrelationMeter::prepare(double sampleRate) {
    sampleRate_ = sampleRate;
    updateSmoothingCoeff();
    reset();
}

void PhaseCorrelationMeter::reset() {
    sumLL_ = 0.0f;
    sumRR_ = 0.0f;
    sumLR_ = 0.0f;
    sumL_ = 0.0f;
    sumR_ = 0.0f;

    correlation_ = 0.0f;
    balance_ = 0.0f;
}

void PhaseCorrelationMeter::process(const float* left, const float* right, int numSamples) {
    if (left == nullptr || right == nullptr || numSamples <= 0) return;

    const float coeff = smoothingCoeff_;
    const float oneMinusCoeff = 1.0f - coeff;

    for (int i = 0; i < numSamples; ++i) {
        float l = left[i];
        float r = right[i];

        // Exponential smoothing of running sums
        sumLL_ = sumLL_ * coeff + (l * l) * oneMinusCoeff;
        sumRR_ = sumRR_ * coeff + (r * r) * oneMinusCoeff;
        sumLR_ = sumLR_ * coeff + (l * r) * oneMinusCoeff;

        // For balance
        sumL_ = sumL_ * coeff + std::abs(l) * oneMinusCoeff;
        sumR_ = sumR_ * coeff + std::abs(r) * oneMinusCoeff;
    }

    // Calculate correlation
    // correlation = sumLR / sqrt(sumLL * sumRR)
    float denom = std::sqrt(sumLL_ * sumRR_);
    float corr = (denom > 1e-10f) ? sumLR_ / denom : 0.0f;

    // Clamp to valid range
    corr = std::clamp(corr, -1.0f, 1.0f);
    correlation_.store(corr);

    // Calculate balance
    float totalEnergy = sumL_ + sumR_;
    float bal = (totalEnergy > 1e-10f) ? (sumR_ - sumL_) / totalEnergy : 0.0f;
    bal = std::clamp(bal, -1.0f, 1.0f);
    balance_.store(bal);
}

float PhaseCorrelationMeter::getStereoWidth() const {
    // Width is inverse of correlation
    // +1 correlation = 0 width (mono)
    // 0 correlation = 1 width (full stereo)
    // -1 correlation = out of phase (still consider as "wide")
    float corr = correlation_.load();
    return (1.0f - std::abs(corr));
}

void PhaseCorrelationMeter::setAveragingTime(float timeMs) {
    averagingTimeMs_ = std::max(1.0f, timeMs);
    updateSmoothingCoeff();
}

void PhaseCorrelationMeter::updateSmoothingCoeff() {
    // Calculate smoothing coefficient for exponential averaging
    // time constant = averagingTimeMs_ / 1000 seconds
    // For exponential smoothing: coeff = exp(-1 / (sampleRate * timeConstant))

    float timeConstant = averagingTimeMs_ / 1000.0f;
    float samplesPerTimeConstant = static_cast<float>(sampleRate_) * timeConstant;

    if (samplesPerTimeConstant > 0.0f) {
        smoothingCoeff_ = std::exp(-1.0f / samplesPerTimeConstant);
    } else {
        smoothingCoeff_ = 0.0f;
    }
}

} // namespace map2
