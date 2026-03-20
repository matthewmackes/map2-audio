#include "DrumMachine/DrumSequencer.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace map2::drummachine {

namespace {

constexpr double kMinBpm = 40.0;
constexpr double kMaxBpm = 300.0;

}

void DrumSequencer::prepare(double sampleRate, int samplesPerBlock) {
    sampleRate_.store(std::max(1.0, sampleRate), std::memory_order_relaxed);
    samplesPerBlock_.store(std::max(1, samplesPerBlock), std::memory_order_relaxed);
    samplesUntilNextStep_ = 0.0;
    triggerStepAtBlockStart_ = true;
    prepared_.store(true, std::memory_order_release);
}

void DrumSequencer::setDrumMachine(DrumMachineProcessor* processor) {
    drumMachine_ = processor;
}

bool DrumSequencer::setStep(int patternIndex, int instrumentIndex, int stepIndex, uint8_t velocity, bool accent) {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex) || !isValidStepIndex(stepIndex)) {
        return false;
    }

    auto& step = patterns_[static_cast<size_t>(patternIndex)].steps[static_cast<size_t>(instrumentIndex)][static_cast<size_t>(stepIndex)];
    step.velocity = velocity;
    step.accent = accent;
    return true;
}

DrumSequencer::Step DrumSequencer::getStep(int patternIndex, int instrumentIndex, int stepIndex) const {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex) || !isValidStepIndex(stepIndex)) {
        return {};
    }

    return patterns_[static_cast<size_t>(patternIndex)].steps[static_cast<size_t>(instrumentIndex)][static_cast<size_t>(stepIndex)];
}

bool DrumSequencer::clearPattern(int patternIndex) {
    if (!isValidPatternIndex(patternIndex)) {
        return false;
    }

    auto& pattern = patterns_[static_cast<size_t>(patternIndex)];
    pattern = Pattern{};
    return true;
}

bool DrumSequencer::copyPattern(int sourcePatternIndex, int destinationPatternIndex) {
    if (!isValidPatternIndex(sourcePatternIndex) || !isValidPatternIndex(destinationPatternIndex)) {
        return false;
    }

    patterns_[static_cast<size_t>(destinationPatternIndex)] = patterns_[static_cast<size_t>(sourcePatternIndex)];
    return true;
}

bool DrumSequencer::setPatternLength(int patternIndex, int length) {
    if (!isValidPatternIndex(patternIndex) || length < 1 || length > kMaxSteps) {
        return false;
    }

    patterns_[static_cast<size_t>(patternIndex)].length = length;
    const int activePattern = currentPatternIndex_.load(std::memory_order_relaxed);
    if (patternIndex == activePattern) {
        currentStepIndex_.store(
            std::min(currentStepIndex_.load(std::memory_order_relaxed), length - 1),
            std::memory_order_relaxed);
    }
    return true;
}

int DrumSequencer::getPatternLength(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return 0;
    }
    return patterns_[static_cast<size_t>(patternIndex)].length;
}

DrumSequencer::Pattern DrumSequencer::getPattern(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return {};
    }
    return patterns_[static_cast<size_t>(patternIndex)];
}

bool DrumSequencer::setTempo(double bpm) {
    if (bpm < kMinBpm || bpm > kMaxBpm) {
        return false;
    }
    bpm_.store(bpm, std::memory_order_relaxed);
    return true;
}

double DrumSequencer::getTempo() const {
    return bpm_.load(std::memory_order_relaxed);
}

void DrumSequencer::setSwing(float percent) {
    swingPercent_.store(std::clamp(percent, 0.0f, 100.0f), std::memory_order_relaxed);
}

float DrumSequencer::getSwing() const {
    return swingPercent_.load(std::memory_order_relaxed);
}

void DrumSequencer::setAccentVelocity(uint8_t velocity) {
    accentVelocity_.store(std::clamp<int>(velocity, 1, 127), std::memory_order_relaxed);
}

uint8_t DrumSequencer::getAccentVelocity() const {
    return accentVelocity_.load(std::memory_order_relaxed);
}

bool DrumSequencer::setCurrentPattern(int patternIndex) {
    if (!isValidPatternIndex(patternIndex)) {
        return false;
    }

    currentPatternIndex_.store(patternIndex, std::memory_order_relaxed);
    currentStepIndex_.store(0, std::memory_order_relaxed);
    barCount_.store(1, std::memory_order_relaxed);
    triggerStepAtBlockStart_ = true;
    samplesUntilNextStep_ = 0.0;
    return true;
}

int DrumSequencer::getCurrentPattern() const {
    return currentPatternIndex_.load(std::memory_order_relaxed);
}

DrumSequencer::Position DrumSequencer::getPosition() const {
    return Position{
        .patternIndex = currentPatternIndex_.load(std::memory_order_relaxed),
        .stepIndex = currentStepIndex_.load(std::memory_order_relaxed),
        .barCount = barCount_.load(std::memory_order_relaxed),
        .isPlaying = playing_.load(std::memory_order_relaxed),
    };
}

void DrumSequencer::play() {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    if (!playing_.load(std::memory_order_relaxed)) {
        triggerStepAtBlockStart_ = true;
        samplesUntilNextStep_ = 0.0;
    }
    playing_.store(true, std::memory_order_relaxed);
}

void DrumSequencer::stop() {
    playing_.store(false, std::memory_order_relaxed);
    currentStepIndex_.store(0, std::memory_order_relaxed);
    barCount_.store(1, std::memory_order_relaxed);
    triggerStepAtBlockStart_ = true;
    samplesUntilNextStep_ = 0.0;
}

void DrumSequencer::pause() {
    playing_.store(false, std::memory_order_relaxed);
}

bool DrumSequencer::isPlaying() const {
    return playing_.load(std::memory_order_relaxed);
}

void DrumSequencer::processBlock(int numSamples) {
    if (!prepared_.load(std::memory_order_acquire) || !playing_.load(std::memory_order_relaxed) || numSamples <= 0) {
        return;
    }

    if (triggerStepAtBlockStart_) {
        triggerCurrentStep(0);
        samplesUntilNextStep_ = samplesForStep(currentStepIndex_.load(std::memory_order_relaxed));
        triggerStepAtBlockStart_ = false;
    }

    double remainingSamples = static_cast<double>(numSamples);
    double elapsedSamples = 0.0;
    while (remainingSamples + 1.0e-9 >= samplesUntilNextStep_) {
        elapsedSamples += samplesUntilNextStep_;
        remainingSamples -= samplesUntilNextStep_;
        advanceStep();
        triggerCurrentStep(std::clamp(static_cast<int>(std::llround(elapsedSamples)), 0, numSamples - 1));
        samplesUntilNextStep_ = samplesForStep(currentStepIndex_.load(std::memory_order_relaxed));
    }

    samplesUntilNextStep_ -= remainingSamples;
}

double DrumSequencer::tapTempo() {
    return tapTempo(std::chrono::steady_clock::now());
}

double DrumSequencer::tapTempo(std::chrono::steady_clock::time_point timestamp) {
    if (lastTapAt_.has_value()) {
        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(timestamp - *lastTapAt_).count();
        if (elapsed > 0 && elapsed <= 2000) {
            if (recentTapCount_ < recentTapIntervals_.size()) {
                recentTapIntervals_[recentTapCount_++] = static_cast<double>(elapsed);
            } else {
                std::move(recentTapIntervals_.begin() + 1, recentTapIntervals_.end(), recentTapIntervals_.begin());
                recentTapIntervals_.back() = static_cast<double>(elapsed);
            }
        } else {
            recentTapCount_ = 0;
        }
    }

    lastTapAt_ = timestamp;
    if (recentTapCount_ == 0) {
        return getTempo();
    }

    const double total = std::accumulate(recentTapIntervals_.begin(), recentTapIntervals_.begin() + static_cast<long>(recentTapCount_), 0.0);
    const double averageMs = total / static_cast<double>(recentTapCount_);
    const double bpm = std::clamp(60000.0 / averageMs, kMinBpm, kMaxBpm);
    bpm_.store(bpm, std::memory_order_relaxed);
    return bpm;
}

bool DrumSequencer::isValidPatternIndex(int patternIndex) {
    return patternIndex >= 0 && patternIndex < kPatternCount;
}

bool DrumSequencer::isValidInstrumentIndex(int instrumentIndex) {
    return instrumentIndex >= 0 && instrumentIndex < kInstrumentCount;
}

bool DrumSequencer::isValidStepIndex(int stepIndex) {
    return stepIndex >= 0 && stepIndex < kMaxSteps;
}

void DrumSequencer::triggerCurrentStep(int sampleOffset) {
    if (drumMachine_ == nullptr) {
        return;
    }

    const auto& pattern = patterns_[static_cast<size_t>(currentPatternIndex_.load(std::memory_order_relaxed))];
    const int stepIndex = currentStepIndex_.load(std::memory_order_relaxed);
    for (int instrumentIndex = 0; instrumentIndex < kInstrumentCount; ++instrumentIndex) {
        const auto& step = pattern.steps[static_cast<size_t>(instrumentIndex)][static_cast<size_t>(stepIndex)];
        if (step.velocity == 0) {
            continue;
        }

        const int velocity = step.accent
            ? static_cast<int>(accentVelocity_.load(std::memory_order_relaxed))
            : static_cast<int>(step.velocity);
        drumMachine_->triggerNote(instrumentIndex, velocity, sampleOffset);
    }
}

void DrumSequencer::advanceStep() {
    const auto& pattern = patterns_[static_cast<size_t>(currentPatternIndex_.load(std::memory_order_relaxed))];
    const int length = std::max(1, pattern.length);
    const int nextStep = currentStepIndex_.load(std::memory_order_relaxed) + 1;
    if (nextStep >= length) {
        currentStepIndex_.store(0, std::memory_order_relaxed);
        barCount_.store(barCount_.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed);
        return;
    }

    currentStepIndex_.store(nextStep, std::memory_order_relaxed);
}

double DrumSequencer::samplesForStep(int stepIndex) const {
    const double quarterNoteSamples = sampleRate_.load(std::memory_order_relaxed) * 60.0 / bpm_.load(std::memory_order_relaxed);
    const double straightStepSamples = quarterNoteSamples / 4.0;
    const double swingRatio = std::clamp(static_cast<double>(swingPercent_.load(std::memory_order_relaxed)) / 100.0, 0.0, 1.0) / 3.0;
    const bool swungEighthOffbeat = ((stepIndex / 2) % 2 == 0) && (stepIndex % 2 == 1);
    const bool swungEighthDownbeat = ((stepIndex / 2) % 2 == 0) && (stepIndex % 2 == 0);
    if (swungEighthDownbeat) {
        return straightStepSamples * (1.0 + swingRatio);
    }
    if (swungEighthOffbeat) {
        return straightStepSamples * std::max(0.25, 1.0 - swingRatio);
    }
    return straightStepSamples;
}

}  // namespace map2::drummachine
