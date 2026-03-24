#pragma once

#include "DrumMachine/DrumMachineProcessor.h"

#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <optional>
#include <vector>

namespace map2::drummachine {

class DrumSequencer {
public:
    static constexpr int kPatternCount = 128;
    static constexpr int kInstrumentCount = DrumMachineProcessor::kPadCount;
    static constexpr int kMaxSteps = 64;
    static constexpr int kVariationCount = 11;

    struct Step {
        uint8_t velocity = 0;
        bool accent = false;
    };

    using StepLane = std::array<Step, kMaxSteps>;
    using StepGrid = std::array<StepLane, kInstrumentCount>;

    struct Pattern {
        int length = 16;
        std::array<int, kInstrumentCount> trackLengths{};
        std::array<StepGrid, kVariationCount> variations{};
        int fillVariationIndex = 1;
        int fillLengthBeats = 1;
    };

    struct Position {
        int patternIndex = 0;
        int stepIndex = 0;
        int barCount = 1;
        bool isPlaying = false;
        int pendingPatternIndex = -1;
        int switchQuantizationBeats = 4;
    };

    struct SongEntry {
        int patternIndex = 0;
        int repeatCount = 1;
    };

    void prepare(double sampleRate, int samplesPerBlock);
    void setDrumMachine(DrumMachineProcessor* processor);

    bool setStep(int patternIndex, int instrumentIndex, int stepIndex, uint8_t velocity, bool accent = false);
    Step getStep(int patternIndex, int instrumentIndex, int stepIndex) const;
    bool clearPattern(int patternIndex);
    bool copyPattern(int sourcePatternIndex, int destinationPatternIndex);
    bool setPatternLength(int patternIndex, int length);
    int getPatternLength(int patternIndex) const;
    bool setTrackLength(int patternIndex, int instrumentIndex, int length);
    int getTrackLength(int patternIndex, int instrumentIndex) const;
    Pattern getPattern(int patternIndex) const;

    bool setTempo(double bpm);
    double getTempo() const;
    void setSwing(float percent);
    float getSwing() const;
    void setAccentVelocity(uint8_t velocity);
    uint8_t getAccentVelocity() const;

    bool setCurrentPattern(int patternIndex);
    int getCurrentPattern() const;
    bool queuePatternSwitch(int patternIndex);
    int getPendingPatternSwitch() const;
    bool setPatternSwitchQuantization(int beats);
    int getPatternSwitchQuantization() const;
    bool setTrackSwing(int instrumentIndex, float percent);
    float getTrackSwing(int instrumentIndex) const;
    Position getPosition() const;
    bool addSongEntry(int patternIndex, int repeatCount, int position = -1);
    bool removeSongEntry(int position);
    bool reorderSongEntries(const std::vector<int>& order);
    std::vector<SongEntry> getSong() const;
    void clearSong();
    void setSongLoop(bool enabled);
    bool getSongLoop() const;
    bool setVariation(int patternIndex, int variationIndex);
    int getVariation(int patternIndex) const;
    bool setFillVariation(int patternIndex, int variationIndex);
    int getFillVariation(int patternIndex) const;
    bool setFillLengthBeats(int patternIndex, int beats);
    int getFillLengthBeats(int patternIndex) const;
    void triggerFill();
    void setAutoFillBars(int bars);
    int getAutoFillBars() const;
    void setCountInBars(int bars);
    int getCountInBars() const;

    void play();
    void stop();
    void pause();
    bool isPlaying() const;
    void processBlock(int numSamples);

    double tapTempo();
    double tapTempo(std::chrono::steady_clock::time_point timestamp);

private:
    static bool isValidPatternIndex(int patternIndex);
    static bool isValidInstrumentIndex(int instrumentIndex);
    static bool isValidStepIndex(int stepIndex);
    static bool isValidVariationIndex(int variationIndex);
    static bool isValidSongPosition(int position, size_t songSize);
    int resolvedVariationIndex(int patternIndex) const;
    void triggerCurrentStep(int sampleOffset);
    void triggerCountInClick(int sampleOffset);
    void advanceStep();
    bool processCountInBlock(int numSamples);
    double samplesForStep(int stepIndex) const;
    double quarterNoteSamples() const;
    bool applySongEntry(int songPosition, bool resetBarCount);

    std::array<Pattern, kPatternCount> patterns_{};
    std::array<int, kPatternCount> selectedVariationIndices_{};
    std::vector<SongEntry> songEntries_{};
    DrumMachineProcessor* drumMachine_ = nullptr;

    std::atomic<double> sampleRate_{44100.0};
    std::atomic<int> samplesPerBlock_{512};
    std::atomic<double> bpm_{120.0};
    std::atomic<float> swingPercent_{0.0f};
    std::atomic<int> currentPatternIndex_{0};
    std::atomic<int> currentStepIndex_{0};
    std::atomic<int> barCount_{1};
    std::atomic<bool> prepared_{false};
    std::atomic<bool> playing_{false};
    std::atomic<uint8_t> accentVelocity_{127};
    std::atomic<bool> songLoopEnabled_{false};
    std::atomic<int> autoFillEveryBars_{0};
    std::atomic<int> countInBars_{0};
    std::atomic<int> pendingPatternIndex_{-1};
    std::atomic<int> switchQuantizationBeats_{4};
    std::array<std::atomic<float>, kInstrumentCount> perTrackSwing_{};

    double samplesUntilNextStep_ = 0.0;
    bool triggerStepAtBlockStart_ = true;
    int activeSongEntryIndex_ = -1;
    int activeSongRepeat_ = 0;
    bool countInActive_ = false;
    int countInBarsRemaining_ = 0;
    int countInQuarterIndex_ = 0;
    double countInSamplesUntilNextClick_ = 0.0;
    bool triggerCountInAtBlockStart_ = false;
    int manualFillBar_ = -1;
    std::optional<std::chrono::steady_clock::time_point> lastTapAt_{};
    std::array<double, 6> recentTapIntervals_{};
    size_t recentTapCount_ = 0;
    int pendingPatternCountdownSteps_ = 0;
};

}  // namespace map2::drummachine
