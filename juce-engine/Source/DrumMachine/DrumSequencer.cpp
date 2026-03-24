#include "DrumMachine/DrumSequencer.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace map2::drummachine {

namespace {

constexpr double kMinBpm = 40.0;
constexpr double kMaxBpm = 300.0;

int quantizationStepsForBeats(int beats, int patternLength) {
    const int clampedPatternLength = std::max(1, patternLength);
    switch (beats) {
        case 1:
            return 4;
        case 4:
            return clampedPatternLength;
        case 8:
            return clampedPatternLength * 2;
        case 16:
            return clampedPatternLength * 4;
        default:
            return clampedPatternLength;
    }
}

}

void DrumSequencer::prepare(double sampleRate, int samplesPerBlock) {
    sampleRate_.store(std::max(1.0, sampleRate), std::memory_order_relaxed);
    samplesPerBlock_.store(std::max(1, samplesPerBlock), std::memory_order_relaxed);
    samplesUntilNextStep_ = 0.0;
    triggerStepAtBlockStart_ = true;
    triggerCountInAtBlockStart_ = false;
    countInActive_ = false;
    countInBarsRemaining_ = 0;
    countInQuarterIndex_ = 0;
    countInSamplesUntilNextClick_ = 0.0;
    manualFillBar_ = -1;
    pendingPatternIndex_.store(-1, std::memory_order_relaxed);
    pendingPatternCountdownSteps_ = 0;
    prepared_.store(true, std::memory_order_release);
}

void DrumSequencer::setDrumMachine(DrumMachineProcessor* processor) {
    drumMachine_ = processor;
}

bool DrumSequencer::setStep(
    int patternIndex,
    int instrumentIndex,
    int stepIndex,
    uint8_t velocity,
    bool accent,
    std::optional<float> lockPitch,
    std::optional<float> lockFilterCutoff,
    std::optional<float> lockDecay,
    std::optional<float> lockPan,
    std::optional<float> lockVolume) {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex) || !isValidStepIndex(stepIndex)) {
        return false;
    }

    auto& step = patterns_[static_cast<size_t>(patternIndex)]
        .variations[static_cast<size_t>(resolvedVariationIndex(patternIndex))]
        [static_cast<size_t>(instrumentIndex)][static_cast<size_t>(stepIndex)];
    step.velocity = velocity;
    step.accent = accent;
    step.lockPitch = lockPitch;
    step.lockFilterCutoff = lockFilterCutoff;
    step.lockDecay = lockDecay;
    step.lockPan = lockPan;
    step.lockVolume = lockVolume;
    return true;
}

DrumSequencer::Step DrumSequencer::getStep(int patternIndex, int instrumentIndex, int stepIndex) const {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex) || !isValidStepIndex(stepIndex)) {
        return {};
    }

    return patterns_[static_cast<size_t>(patternIndex)]
        .variations[static_cast<size_t>(resolvedVariationIndex(patternIndex))]
        [static_cast<size_t>(instrumentIndex)][static_cast<size_t>(stepIndex)];
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

bool DrumSequencer::setTrackLength(int patternIndex, int instrumentIndex, int length) {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex) || length < 0 || length > kMaxSteps) {
        return false;
    }

    patterns_[static_cast<size_t>(patternIndex)].trackLengths[static_cast<size_t>(instrumentIndex)] = length;
    return true;
}

int DrumSequencer::getTrackLength(int patternIndex, int instrumentIndex) const {
    if (!isValidPatternIndex(patternIndex) || !isValidInstrumentIndex(instrumentIndex)) {
        return 0;
    }

    return patterns_[static_cast<size_t>(patternIndex)].trackLengths[static_cast<size_t>(instrumentIndex)];
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
    activeSongEntryIndex_ = -1;
    activeSongRepeat_ = 0;
    manualFillBar_ = -1;
    pendingPatternIndex_.store(-1, std::memory_order_relaxed);
    pendingPatternCountdownSteps_ = 0;
    triggerStepAtBlockStart_ = true;
    samplesUntilNextStep_ = 0.0;
    return true;
}

int DrumSequencer::getCurrentPattern() const {
    return currentPatternIndex_.load(std::memory_order_relaxed);
}

bool DrumSequencer::queuePatternSwitch(int patternIndex) {
    if (!isValidPatternIndex(patternIndex)) {
        return false;
    }

    if (!playing_.load(std::memory_order_relaxed)) {
        return setCurrentPattern(patternIndex);
    }

    const int quantizationBeats = getPatternSwitchQuantization();
    const auto& pattern = patterns_[static_cast<size_t>(currentPatternIndex_.load(std::memory_order_relaxed))];
    const int patternLength = std::max(1, pattern.length);
    const int currentStep = std::clamp(currentStepIndex_.load(std::memory_order_relaxed), 0, patternLength - 1);
    int countdownSteps = quantizationStepsForBeats(quantizationBeats, patternLength);

    if (quantizationBeats == 1) {
        const int stepInBeat = currentStep % 4;
        countdownSteps = 4 - stepInBeat;
    } else {
        countdownSteps = (patternLength - currentStep) + std::max(0, (countdownSteps / patternLength) - 1) * patternLength;
    }

    pendingPatternIndex_.store(patternIndex, std::memory_order_relaxed);
    pendingPatternCountdownSteps_ = std::max(1, countdownSteps);
    return true;
}

int DrumSequencer::getPendingPatternSwitch() const {
    return pendingPatternIndex_.load(std::memory_order_relaxed);
}

bool DrumSequencer::setPatternSwitchQuantization(int beats) {
    switch (beats) {
        case 1:
        case 4:
        case 8:
        case 16:
            switchQuantizationBeats_.store(beats, std::memory_order_relaxed);
            return true;
        default:
            return false;
    }
}

int DrumSequencer::getPatternSwitchQuantization() const {
    return switchQuantizationBeats_.load(std::memory_order_relaxed);
}

bool DrumSequencer::setTrackSwing(int instrumentIndex, float percent) {
    if (!isValidInstrumentIndex(instrumentIndex)) {
        return false;
    }
    perTrackSwing_[static_cast<size_t>(instrumentIndex)].store(std::clamp(percent, 0.0f, 100.0f), std::memory_order_relaxed);
    return true;
}

float DrumSequencer::getTrackSwing(int instrumentIndex) const {
    if (!isValidInstrumentIndex(instrumentIndex)) {
        return 0.0f;
    }
    return perTrackSwing_[static_cast<size_t>(instrumentIndex)].load(std::memory_order_relaxed);
}

DrumSequencer::Position DrumSequencer::getPosition() const {
    return Position{
        .patternIndex = currentPatternIndex_.load(std::memory_order_relaxed),
        .stepIndex = currentStepIndex_.load(std::memory_order_relaxed),
        .barCount = barCount_.load(std::memory_order_relaxed),
        .isPlaying = playing_.load(std::memory_order_relaxed),
        .pendingPatternIndex = pendingPatternIndex_.load(std::memory_order_relaxed),
        .switchQuantizationBeats = switchQuantizationBeats_.load(std::memory_order_relaxed),
    };
}

bool DrumSequencer::addSongEntry(int patternIndex, int repeatCount, int position) {
    if (!isValidPatternIndex(patternIndex) || repeatCount < 1 || songEntries_.size() >= 256) {
        return false;
    }

    SongEntry entry{
        .patternIndex = patternIndex,
        .repeatCount = repeatCount,
    };
    if (position < 0 || position >= static_cast<int>(songEntries_.size())) {
        songEntries_.push_back(entry);
        return true;
    }

    songEntries_.insert(songEntries_.begin() + position, entry);
    return true;
}

bool DrumSequencer::removeSongEntry(int position) {
    if (!isValidSongPosition(position, songEntries_.size())) {
        return false;
    }

    songEntries_.erase(songEntries_.begin() + position);
    if (songEntries_.empty()) {
        activeSongEntryIndex_ = -1;
        activeSongRepeat_ = 0;
        return true;
    }

    if (activeSongEntryIndex_ >= static_cast<int>(songEntries_.size())) {
        activeSongEntryIndex_ = static_cast<int>(songEntries_.size()) - 1;
        activeSongRepeat_ = 0;
    }
    return true;
}

bool DrumSequencer::reorderSongEntries(const std::vector<int>& order) {
    if (order.size() != songEntries_.size()) {
        return false;
    }

    std::vector<SongEntry> reordered;
    reordered.reserve(songEntries_.size());
    std::vector<bool> used(songEntries_.size(), false);
    for (const int index : order) {
        if (!isValidSongPosition(index, songEntries_.size()) || used[static_cast<size_t>(index)]) {
            return false;
        }
        used[static_cast<size_t>(index)] = true;
        reordered.push_back(songEntries_[static_cast<size_t>(index)]);
    }

    songEntries_ = std::move(reordered);
    activeSongEntryIndex_ = -1;
    activeSongRepeat_ = 0;
    return true;
}

std::vector<DrumSequencer::SongEntry> DrumSequencer::getSong() const {
    return songEntries_;
}

void DrumSequencer::clearSong() {
    songEntries_.clear();
    activeSongEntryIndex_ = -1;
    activeSongRepeat_ = 0;
}

void DrumSequencer::setSongLoop(bool enabled) {
    songLoopEnabled_.store(enabled, std::memory_order_relaxed);
}

bool DrumSequencer::getSongLoop() const {
    return songLoopEnabled_.load(std::memory_order_relaxed);
}

bool DrumSequencer::setVariation(int patternIndex, int variationIndex) {
    if (!isValidPatternIndex(patternIndex) || !isValidVariationIndex(variationIndex)) {
        return false;
    }
    selectedVariationIndices_[static_cast<size_t>(patternIndex)] = variationIndex;
    return true;
}

int DrumSequencer::getVariation(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return 0;
    }
    return selectedVariationIndices_[static_cast<size_t>(patternIndex)];
}

bool DrumSequencer::setFillVariation(int patternIndex, int variationIndex) {
    if (!isValidPatternIndex(patternIndex) || !isValidVariationIndex(variationIndex)) {
        return false;
    }
    patterns_[static_cast<size_t>(patternIndex)].fillVariationIndex = variationIndex;
    return true;
}

int DrumSequencer::getFillVariation(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return 0;
    }
    return patterns_[static_cast<size_t>(patternIndex)].fillVariationIndex;
}

bool DrumSequencer::setFillLengthBeats(int patternIndex, int beats) {
    if (!isValidPatternIndex(patternIndex) || beats < 1 || beats > 2) {
        return false;
    }
    patterns_[static_cast<size_t>(patternIndex)].fillLengthBeats = beats;
    return true;
}

int DrumSequencer::getFillLengthBeats(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return 1;
    }
    return patterns_[static_cast<size_t>(patternIndex)].fillLengthBeats;
}

void DrumSequencer::triggerFill() {
    manualFillBar_ = barCount_.load(std::memory_order_relaxed);
}

void DrumSequencer::setAutoFillBars(int bars) {
    autoFillEveryBars_.store(std::clamp(bars, 0, 8), std::memory_order_relaxed);
}

int DrumSequencer::getAutoFillBars() const {
    return autoFillEveryBars_.load(std::memory_order_relaxed);
}

void DrumSequencer::setCountInBars(int bars) {
    countInBars_.store(std::clamp(bars, 0, 4), std::memory_order_relaxed);
}

int DrumSequencer::getCountInBars() const {
    return countInBars_.load(std::memory_order_relaxed);
}

void DrumSequencer::play() {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    if (!playing_.load(std::memory_order_relaxed)) {
        if (!songEntries_.empty() && activeSongEntryIndex_ < 0) {
            applySongEntry(0, true);
            activeSongRepeat_ = 0;
        }
        if (countInBars_.load(std::memory_order_relaxed) > 0) {
            countInActive_ = true;
            countInBarsRemaining_ = countInBars_.load(std::memory_order_relaxed);
            countInQuarterIndex_ = 0;
            countInSamplesUntilNextClick_ = 0.0;
            triggerCountInAtBlockStart_ = true;
            triggerStepAtBlockStart_ = false;
        } else {
            triggerStepAtBlockStart_ = true;
            samplesUntilNextStep_ = 0.0;
        }
        manualFillBar_ = -1;
    }
    playing_.store(true, std::memory_order_relaxed);
}

void DrumSequencer::stop() {
    playing_.store(false, std::memory_order_relaxed);
    currentStepIndex_.store(0, std::memory_order_relaxed);
    barCount_.store(1, std::memory_order_relaxed);
    if (!songEntries_.empty()) {
        applySongEntry(0, true);
        activeSongRepeat_ = 0;
    } else {
        activeSongEntryIndex_ = -1;
        activeSongRepeat_ = 0;
    }
    triggerStepAtBlockStart_ = true;
    triggerCountInAtBlockStart_ = false;
    samplesUntilNextStep_ = 0.0;
    countInActive_ = false;
    countInBarsRemaining_ = 0;
    countInQuarterIndex_ = 0;
    countInSamplesUntilNextClick_ = 0.0;
    manualFillBar_ = -1;
    pendingPatternIndex_.store(-1, std::memory_order_relaxed);
    pendingPatternCountdownSteps_ = 0;
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

    if (countInActive_ && processCountInBlock(numSamples)) {
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
        if (!playing_.load(std::memory_order_relaxed)) {
            break;
        }
        triggerCurrentStep(std::clamp(static_cast<int>(std::llround(elapsedSamples)), 0, numSamples - 1));
        samplesUntilNextStep_ = samplesForStep(currentStepIndex_.load(std::memory_order_relaxed));
    }

    if (playing_.load(std::memory_order_relaxed)) {
        samplesUntilNextStep_ -= remainingSamples;
    }
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

bool DrumSequencer::isValidVariationIndex(int variationIndex) {
    return variationIndex >= 0 && variationIndex < kVariationCount;
}

bool DrumSequencer::isValidSongPosition(int position, size_t songSize) {
    return position >= 0 && static_cast<size_t>(position) < songSize;
}

int DrumSequencer::resolvedVariationIndex(int patternIndex) const {
    if (!isValidPatternIndex(patternIndex)) {
        return 0;
    }
    return std::clamp(selectedVariationIndices_[static_cast<size_t>(patternIndex)], 0, kVariationCount - 1);
}

void DrumSequencer::triggerCurrentStep(int sampleOffset) {
    if (drumMachine_ == nullptr) {
        return;
    }

    const auto& pattern = patterns_[static_cast<size_t>(currentPatternIndex_.load(std::memory_order_relaxed))];
    const int stepIndex = currentStepIndex_.load(std::memory_order_relaxed);
    const int fillLengthSteps = std::min(pattern.length, std::max(1, pattern.fillLengthBeats) * 4);
    const bool manualFillActive = manualFillBar_ == barCount_.load(std::memory_order_relaxed);
    const int autoFillBars = autoFillEveryBars_.load(std::memory_order_relaxed);
    const bool autoFillActive = autoFillBars > 0
        && (barCount_.load(std::memory_order_relaxed) % autoFillBars == 0);
    const bool useFillVariation = (manualFillActive || autoFillActive)
        && stepIndex >= std::max(0, pattern.length - fillLengthSteps);
    const int variationIndex = useFillVariation
        ? std::clamp(pattern.fillVariationIndex, 0, kVariationCount - 1)
        : resolvedVariationIndex(currentPatternIndex_.load(std::memory_order_relaxed));
    const auto& stepGrid = pattern.variations[static_cast<size_t>(variationIndex)];
    const double straightStepSamples = quarterNoteSamples() / 4.0;
    const bool swungEighthOffbeat = ((stepIndex / 2) % 2 == 0) && (stepIndex % 2 == 1);
    for (int instrumentIndex = 0; instrumentIndex < kInstrumentCount; ++instrumentIndex) {
        const int trackLength = std::clamp(pattern.trackLengths[static_cast<size_t>(instrumentIndex)], 0, kMaxSteps);
        const int effectiveTrackLength = trackLength > 0 ? trackLength : std::max(1, pattern.length);
        const int trackStepIndex = stepIndex % effectiveTrackLength;
        const auto& step = stepGrid[static_cast<size_t>(instrumentIndex)][static_cast<size_t>(trackStepIndex)];
        if (step.velocity == 0) {
            continue;
        }

        const int velocity = step.accent
            ? static_cast<int>(accentVelocity_.load(std::memory_order_relaxed))
            : static_cast<int>(step.velocity);
        int trackSampleOffset = sampleOffset;
        const float trackSwing = getTrackSwing(instrumentIndex);
        const float effectiveSwing = trackSwing > 0.0f ? trackSwing : swingPercent_.load(std::memory_order_relaxed);
        if (swungEighthOffbeat && effectiveSwing > 0.0f) {
            const double swingRatio = std::clamp(static_cast<double>(effectiveSwing) / 100.0, 0.0, 1.0) / 3.0;
            const int swingOffset = static_cast<int>(std::llround(straightStepSamples * swingRatio));
            const int maxOffset = std::max(0, samplesPerBlock_.load(std::memory_order_relaxed) - 1);
            trackSampleOffset = std::clamp(sampleOffset + swingOffset, 0, maxOffset);
        }
        DrumMachineProcessor::StepLockOverrides overrides;
        overrides.volume = step.lockVolume;
        overrides.pan = step.lockPan;
        overrides.tuneSemitones = step.lockPitch;
        overrides.filterCutoffHz = step.lockFilterCutoff;
        overrides.decayMs = step.lockDecay;
        drumMachine_->triggerNote(instrumentIndex, velocity, trackSampleOffset, overrides);
    }
}

void DrumSequencer::triggerCountInClick(int sampleOffset) {
    if (drumMachine_ == nullptr) {
        return;
    }
    const int velocity = countInQuarterIndex_ == 0
        ? static_cast<int>(accentVelocity_.load(std::memory_order_relaxed))
        : 96;
    drumMachine_->triggerNote(0, velocity, sampleOffset);
}

void DrumSequencer::advanceStep() {
    if (pendingPatternIndex_.load(std::memory_order_relaxed) >= 0 && pendingPatternCountdownSteps_ > 0) {
        --pendingPatternCountdownSteps_;
        if (pendingPatternCountdownSteps_ == 0) {
            const int pendingPattern = pendingPatternIndex_.exchange(-1, std::memory_order_relaxed);
            currentPatternIndex_.store(pendingPattern, std::memory_order_relaxed);
            currentStepIndex_.store(0, std::memory_order_relaxed);
            barCount_.store(1, std::memory_order_relaxed);
            activeSongEntryIndex_ = -1;
            activeSongRepeat_ = 0;
            manualFillBar_ = -1;
            return;
        }
    }

    const auto& pattern = patterns_[static_cast<size_t>(currentPatternIndex_.load(std::memory_order_relaxed))];
    const int length = std::max(1, pattern.length);
    const int nextStep = currentStepIndex_.load(std::memory_order_relaxed) + 1;
    if (nextStep >= length) {
        currentStepIndex_.store(0, std::memory_order_relaxed);
        if (songEntries_.empty()) {
            barCount_.store(barCount_.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed);
            return;
        }

        const int currentSongEntry = activeSongEntryIndex_ >= 0 ? activeSongEntryIndex_ : 0;
        const auto& songEntry = songEntries_[static_cast<size_t>(currentSongEntry)];
        ++activeSongRepeat_;
        if (activeSongRepeat_ < songEntry.repeatCount) {
            barCount_.store(barCount_.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed);
            return;
        }

        const int nextSongEntry = currentSongEntry + 1;
        if (nextSongEntry < static_cast<int>(songEntries_.size())) {
            applySongEntry(nextSongEntry, false);
            activeSongRepeat_ = 0;
            return;
        }

        if (songLoopEnabled_.load(std::memory_order_relaxed) && applySongEntry(0, true)) {
            activeSongRepeat_ = 0;
            return;
        }

        stop();
        return;
    }

    currentStepIndex_.store(nextStep, std::memory_order_relaxed);
}

bool DrumSequencer::applySongEntry(int songPosition, bool resetBarCount) {
    if (!isValidSongPosition(songPosition, songEntries_.size())) {
        return false;
    }

    const auto& entry = songEntries_[static_cast<size_t>(songPosition)];
    currentPatternIndex_.store(entry.patternIndex, std::memory_order_relaxed);
    currentStepIndex_.store(0, std::memory_order_relaxed);
    if (resetBarCount) {
        barCount_.store(1, std::memory_order_relaxed);
    } else {
        barCount_.store(barCount_.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed);
    }
    activeSongEntryIndex_ = songPosition;
    triggerStepAtBlockStart_ = true;
    samplesUntilNextStep_ = 0.0;
    return true;
}

bool DrumSequencer::processCountInBlock(int numSamples) {
    if (!countInActive_) {
        return false;
    }

    if (triggerCountInAtBlockStart_) {
        triggerCountInClick(0);
        countInSamplesUntilNextClick_ = quarterNoteSamples();
        triggerCountInAtBlockStart_ = false;
    }

    double remainingSamples = static_cast<double>(numSamples);
    double elapsedSamples = 0.0;
    while (remainingSamples + 1.0e-9 >= countInSamplesUntilNextClick_) {
        elapsedSamples += countInSamplesUntilNextClick_;
        remainingSamples -= countInSamplesUntilNextClick_;

        ++countInQuarterIndex_;
        if (countInQuarterIndex_ >= 4) {
            countInQuarterIndex_ = 0;
            --countInBarsRemaining_;
            if (countInBarsRemaining_ <= 0) {
                countInActive_ = false;
                triggerStepAtBlockStart_ = true;
                samplesUntilNextStep_ = 0.0;
                if (remainingSamples > 0.0) {
                    processBlock(static_cast<int>(std::floor(remainingSamples)));
                }
                return true;
            }
        }

        triggerCountInClick(std::clamp(static_cast<int>(std::llround(elapsedSamples)), 0, numSamples - 1));
        countInSamplesUntilNextClick_ = quarterNoteSamples();
    }

    countInSamplesUntilNextClick_ -= remainingSamples;
    return true;
}

double DrumSequencer::samplesForStep(int stepIndex) const {
    const double straightStepSamples = quarterNoteSamples() / 4.0;
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

double DrumSequencer::quarterNoteSamples() const {
    return sampleRate_.load(std::memory_order_relaxed) * 60.0 / bpm_.load(std::memory_order_relaxed);
}

}  // namespace map2::drummachine
