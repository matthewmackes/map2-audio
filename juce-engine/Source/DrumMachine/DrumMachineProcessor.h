#pragma once

#include "SynthForge/Core/Part.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <atomic>
#include <string>

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
        int midiChannel = 0;  // 0 = OMNI
        BusId bus = BusId::Kick;
        std::string name;
    };

    DrumMachineProcessor();

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void processBlock(juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midiBuffer);

    PadConfig getPadConfig(int padIndex) const;
    bool setPadConfig(int padIndex, const PadConfig& config);

    bool setPadVolume(int padIndex, float volume);
    bool setPadPan(int padIndex, float pan);
    bool setPadTune(int padIndex, float semitones);
    bool setPadMute(int padIndex, bool mute);
    bool setPadSolo(int padIndex, bool solo);
    bool setPadMidiNote(int padIndex, int midiNote);
    bool setPadVelocityCurve(int padIndex, VelocityCurve curve, float fixedVelocity = 1.0f);
    bool setPadMidiChannel(int padIndex, int midiChannel);

    bool loadPadSfz(int padIndex, const std::string& sfzPath);
    synthforge::SampleLoadStatus getPadSampleStatus(int padIndex) const;
    int getPadActiveVoices(int padIndex) const;
    float mapVelocityForPad(int padIndex, float rawVelocity) const;

    static BusId defaultBusForPad(int padIndex);
    static int defaultMidiNoteForPad(int padIndex);

private:
    static bool isValidPadIndex(int padIndex);
    static float clampVelocity(float rawVelocity);
    static float applyVelocityCurve(VelocityCurve curve, float rawVelocity, float fixedVelocity);
    static std::string defaultPadName(int padIndex);
    void applyPadConfigToPart(int padIndex);

    std::array<synthforge::Part, kPadCount> pads_;
    std::array<PadConfig, kPadCount> padConfigs_{};
    std::array<juce::MidiBuffer, kPadCount> padMidiBuffers_{};

    std::atomic<double> sampleRate_{44100.0};
    std::atomic<int> samplesPerBlock_{512};
    std::atomic<int> numChannels_{2};
    std::atomic<bool> prepared_{false};
};

}  // namespace map2::drummachine
