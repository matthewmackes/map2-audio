#pragma once

#include "DrumMachine/DrumMachineMixer.h"
#include "SynthForge/Core/Part.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <atomic>
#include <string>
#include <vector>

namespace map2::drummachine {

class DrumMachineProcessor {
public:
    static constexpr int kPadCount = 16;
    static constexpr int kBusCount = 8;

    enum class BusId {
        Kick = 0,
        Snare,
        HiHat,
        Toms,
        Cymbals,
        Percussion,
        Overhead,
        Room,
    };

    enum class VelocityCurve {
        Linear = 0,
        Logarithmic,
        Exponential,
        SCurve,
        Fixed,
    };

    struct PadConfig {
        float volume = 1.0f;
        float pan = 0.0f;
        float tuneSemitones = 0.0f;
        bool mute = false;
        bool solo = false;
        int midiNote = 36;
        VelocityCurve velocityCurve = VelocityCurve::Linear;
        float fixedVelocity = 1.0f;
        float inputFloor = 0.0f;
        float outputFloor = 0.0f;
        float outputCeiling = 1.0f;
        int midiChannel = 0;  // 0 = OMNI
        BusId bus = BusId::Kick;
        std::string name;
    };

    struct Metering {
        std::array<float, kPadCount> perPadPeak{};
        std::array<float, kPadCount> perPadRms{};
        std::array<float, kBusCount> perBusPeak{};
        std::array<float, kBusCount> perBusRms{};
        float masterPeakLeft = 0.0f;
        float masterPeakRight = 0.0f;
        float masterRmsLeft = 0.0f;
        float masterRmsRight = 0.0f;
    };

    DrumMachineProcessor();

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void processBlock(juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midiBuffer);
    bool triggerNote(int padIndex, int velocity, int sampleOffset = 0);

    PadConfig getPadConfig(int padIndex) const;
    bool setPadConfig(int padIndex, const PadConfig& config);

    bool setPadVolume(int padIndex, float volume);
    bool setPadPan(int padIndex, float pan);
    bool setPadTune(int padIndex, float semitones);
    bool setPadMute(int padIndex, bool mute);
    bool setPadSolo(int padIndex, bool solo);
    bool setPadMidiNote(int padIndex, int midiNote);
    bool addPadMidiNote(int padIndex, int midiNote);
    bool removePadMidiNote(int padIndex, int midiNote);
    std::vector<int> getPadMidiNotes(int padIndex) const;
    bool setGlobalMidiChannel(int midiChannel);
    int getGlobalMidiChannel() const;
    void setLastMappedVelocityForPad(int padIndex, float velocity);
    bool setPadBus(int padIndex, BusId bus);
    bool setPadVelocityCurve(
        int padIndex,
        VelocityCurve curve,
        float fixedVelocity = 1.0f,
        float inputFloor = 0.0f,
        float outputFloor = 0.0f,
        float outputCeiling = 1.0f);
    bool setPadMidiChannel(int padIndex, int midiChannel);

    bool loadPadSfz(int padIndex, const std::string& sfzPath);
    bool loadKitSfz(const std::string& sfzPath);
    synthforge::SampleLoadStatus getPadSampleStatus(int padIndex) const;
    std::array<synthforge::SampleLoadStatus, kPadCount> getKitSampleStatus() const;
    int getPadActiveVoices(int padIndex) const;
    float mapVelocityForPad(int padIndex, float rawVelocity) const;
    float getLastMappedVelocityForPad(int padIndex) const;
    std::array<float, 128> getVelocityCurvePreview(int padIndex) const;
    bool setBusEq(int busIndex, const DrumMachineMixer::BusEqConfig& config);
    bool setBusComp(int busIndex, const DrumMachineMixer::BusCompConfig& config);
    bool setBusLevel(int busIndex, float level);
    bool setBusMute(int busIndex, bool mute);
    bool setBusSolo(int busIndex, bool solo);
    void setMasterVolume(float volume);
    float getMasterVolume() const;
    Metering getMetering() const;

    static BusId defaultBusForPad(int padIndex);
    static int defaultMidiNoteForPad(int padIndex);

private:
    static bool isValidPadIndex(int padIndex);
    static float clampVelocity(float rawVelocity);
    static float applyVelocityCurve(
        VelocityCurve curve,
        float rawVelocity,
        float fixedVelocity,
        float inputFloor,
        float outputFloor,
        float outputCeiling);
    static std::string defaultPadName(int padIndex);
    void applyPadConfigToPart(int padIndex);

    std::array<synthforge::Part, kPadCount> pads_;
    std::array<PadConfig, kPadCount> padConfigs_{};
    std::array<std::array<bool, 128>, kPadCount> padNoteAssignments_{};
    std::array<int, 128> noteToPad_{};
    std::array<juce::MidiBuffer, kPadCount> padMidiBuffers_{};
    juce::MidiBuffer triggeredMidiBuffer_;
    DrumMachineMixer mixer_;
    juce::AudioBuffer<float> busBuffer_;
    juce::AudioBuffer<float> stereoMixBuffer_;
    std::array<float, kPadCount> padPeakMeters_{};
    std::array<float, kPadCount> padRmsMeters_{};
    std::array<float, kPadCount> lastMappedVelocity_{};

    std::atomic<double> sampleRate_{44100.0};
    std::atomic<int> samplesPerBlock_{512};
    std::atomic<int> numChannels_{2};
    std::atomic<int> globalMidiChannel_{0};
    std::atomic<bool> prepared_{false};
};

}  // namespace map2::drummachine
