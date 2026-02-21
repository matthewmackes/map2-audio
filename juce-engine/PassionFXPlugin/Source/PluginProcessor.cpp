#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace { inline const char* P(const char* id) { return id; } }

PassionFXAudioProcessor::PassionFXAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {
        P("preset"), P("globalMix"), P("outputLevel"), P("bypass"),
        P("noiseGateEnabled"), P("noiseGateThreshold"), P("noiseGateRelease"),
        P("compressorEnabled"), P("compressorThreshold"), P("compressorRatio"),
        P("compressorAttack"), P("compressorRelease"), P("compressorGlassy"),
        P("wahEnabled"), P("wahMode"), P("wahPosition"), P("wahQ"),
        P("phaserEnabled"), P("phaserRate"), P("phaserDepth"), P("phaserStages"), P("phaserFeedback"),
        P("chorusEnabled"), P("chorusRate"), P("chorusDepth"), P("chorusVoices"), P("chorusMix"),
        P("pitchShifterEnabled"), P("pitchShifterSemitones"), P("pitchShifterMix"),
        P("harmonizerEnabled"), P("harmonizerVoice1"), P("harmonizerVoice2"), P("harmonizerDetune"), P("harmonizerMix"),
        P("delayEnabled"), P("delayTimeL"), P("delayTimeR"), P("delayFeedback"), P("delayMix"),
        P("delayFreeze"), P("delayPitchShiftL"), P("delayPitchShiftR"),
        P("reverbEnabled"), P("reverbType"), P("reverbDecay"), P("reverbShimmerAmount"),
        P("reverbShimmerInterval"), P("reverbMix"), P("reverbFreeze"),
        P("eqEnabled"), P("eqLowGain"), P("eqMidGain"), P("eqHighGain"), P("eqTilt"),
        P("exciterEnabled"), P("exciterWarmth"), P("exciterPresence"), P("exciterAir"),
        P("tremoloEnabled"), P("tremoloRate"), P("tremoloDepth"), P("tremoloWaveform")
    };
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

PassionFXAudioProcessor::~PassionFXAudioProcessor() = default;

void PassionFXAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
}

void PassionFXAudioProcessor::releaseResources()
{
    processor.reset();
}

bool PassionFXAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void PassionFXAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    processor.process(buffer);
}

void PassionFXAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(newValue);
    syncParameters();
}

juce::AudioProcessorEditor* PassionFXAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool PassionFXAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String PassionFXAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void PassionFXAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void PassionFXAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, (size_t) sizeInBytes);
    if (state.isValid())
    {
        apvts.replaceState(state);
        syncParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PassionFXAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout PassionFXAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    // Preset/global
    juce::StringArray presetNames;
    for (int i = 0; i < map2::PassionFXProcessor::getNumPresets(); ++i)
        presetNames.add(map2::PassionFXProcessor::getPresetInfo(static_cast<map2::PassionFXProcessor::Preset>(i)).name);
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P("preset"), "Preset", presetNames, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("globalMix"), "Global Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("outputLevel"), "Output Level (dB)", juce::NormalisableRange<float>(-24.0f, 12.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("bypass"), "Bypass", false));

    // Noise gate
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("noiseGateEnabled"), "Gate Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("noiseGateThreshold"), "Gate Threshold", juce::NormalisableRange<float>(-80.0f, 0.0f, 0.1f), -40.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("noiseGateRelease"), "Gate Release (ms)", juce::NormalisableRange<float>(5.0f, 2000.0f, 0.1f), 100.0f));

    // Compressor
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("compressorEnabled"), "Comp Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("compressorThreshold"), "Comp Threshold", juce::NormalisableRange<float>(-60.0f, 0.0f, 0.1f), -20.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("compressorRatio"), "Comp Ratio", juce::NormalisableRange<float>(1.0f, 20.0f, 0.01f), 4.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("compressorAttack"), "Comp Attack (ms)", juce::NormalisableRange<float>(0.01f, 300.0f, 0.01f), 10.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("compressorRelease"), "Comp Release (ms)", juce::NormalisableRange<float>(10.0f, 3000.0f, 0.1f), 100.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("compressorGlassy"), "Comp Glassy", false));

    // Wah
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("wahEnabled"), "Wah Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P("wahMode"), "Wah Mode", juce::StringArray{"Manual", "Auto", "Env"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("wahPosition"), "Wah Position", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("wahQ"), "Wah Q", juce::NormalisableRange<float>(1.0f, 15.0f, 0.01f), 5.0f));

    // Phaser
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("phaserEnabled"), "Phaser Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("phaserRate"), "Phaser Rate (Hz)", juce::NormalisableRange<float>(0.05f, 10.0f, 0.01f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("phaserDepth"), "Phaser Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(P("phaserStages"), "Phaser Stages", 2, map2::PassionFXProcessor::NUM_PHASER_STAGES_MAX, 4));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("phaserFeedback"), "Phaser Feedback", juce::NormalisableRange<float>(-0.95f, 0.95f, 0.001f), 0.3f));

    // Chorus
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("chorusEnabled"), "Chorus Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("chorusRate"), "Chorus Rate (Hz)", juce::NormalisableRange<float>(0.1f, 5.0f, 0.01f), 0.8f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("chorusDepth"), "Chorus Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(P("chorusVoices"), "Chorus Voices", 1, map2::PassionFXProcessor::MAX_CHORUS_VOICES, 3));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("chorusMix"), "Chorus Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    // Pitch shifter
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("pitchShifterEnabled"), "PitchShifter Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("pitchShifterSemitones"), "PitchShifter Semitones", juce::NormalisableRange<float>(-36.0f, 36.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("pitchShifterMix"), "PitchShifter Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    // Harmonizer
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("harmonizerEnabled"), "Harmonizer Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("harmonizerVoice1"), "Harmonizer Voice1", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 4.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("harmonizerVoice2"), "Harmonizer Voice2", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 7.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("harmonizerDetune"), "Harmonizer Detune (cents)", juce::NormalisableRange<float>(0.0f, 25.0f, 0.1f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("harmonizerMix"), "Harmonizer Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    // Delay
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("delayEnabled"), "Delay Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayTimeL"), "Delay Time L (ms)", juce::NormalisableRange<float>(1.0f, 8000.0f, 0.1f), 375.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayTimeR"), "Delay Time R (ms)", juce::NormalisableRange<float>(1.0f, 8000.0f, 0.1f), 500.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayFeedback"), "Delay Feedback", juce::NormalisableRange<float>(0.0f, 0.95f, 0.001f), 0.35f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayMix"), "Delay Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.4f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("delayFreeze"), "Delay Freeze", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayPitchShiftL"), "Delay Pitch L", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("delayPitchShiftR"), "Delay Pitch R", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));

    // Reverb
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("reverbEnabled"), "Reverb Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(P("reverbType"), "Reverb Type", 0, 4, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("reverbDecay"), "Reverb Decay (s)", juce::NormalisableRange<float>(0.1f, 30.0f, 0.01f), 2.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("reverbShimmerAmount"), "Reverb Shimmer Amt", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("reverbShimmerInterval"), "Reverb Shimmer Interval", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 12.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("reverbMix"), "Reverb Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.3f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("reverbFreeze"), "Reverb Freeze", false));

    // EQ
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("eqEnabled"), "EQ Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("eqLowGain"), "EQ Low Gain", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("eqMidGain"), "EQ Mid Gain", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("eqHighGain"), "EQ High Gain", juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("eqTilt"), "EQ Tilt", juce::NormalisableRange<float>(-1.0f, 1.0f, 0.001f), 0.0f));

    // Exciter
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("exciterEnabled"), "Exciter Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("exciterWarmth"), "Exciter Warmth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("exciterPresence"), "Exciter Presence", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("exciterAir"), "Exciter Air", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.0f));

    // Tremolo
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P("tremoloEnabled"), "Tremolo Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("tremoloRate"), "Tremolo Rate (Hz)", juce::NormalisableRange<float>(0.5f, 20.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P("tremoloDepth"), "Tremolo Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(P("tremoloWaveform"), "Tremolo Waveform", 0, 5, 0));

    return {params.begin(), params.end()};
}

void PassionFXAudioProcessor::syncParameters()
{
    using map2::PassionFXProcessor;
    auto params = processor.getParameters();

    if (auto* preset = apvts.getRawParameterValue(P("preset")))
        processor.setPreset(static_cast<PassionFXProcessor::Preset>(juce::jlimit(0, PassionFXProcessor::getNumPresets()-1, (int)preset->load())));
    if (auto* mix = apvts.getRawParameterValue(P("globalMix"))) params.globalMix = mix->load();
    if (auto* out = apvts.getRawParameterValue(P("outputLevel"))) params.outputLevel = out->load();
    if (auto* bypass = apvts.getRawParameterValue(P("bypass"))) params.bypass = bypass->load() > 0.5f;

    if (auto* v = apvts.getRawParameterValue(P("noiseGateEnabled"))) params.noiseGateEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("noiseGateThreshold"))) params.noiseGateThreshold = v->load();
    if (auto* v = apvts.getRawParameterValue(P("noiseGateRelease"))) params.noiseGateRelease = v->load();

    if (auto* v = apvts.getRawParameterValue(P("compressorEnabled"))) params.compressorEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("compressorThreshold"))) params.compressorThreshold = v->load();
    if (auto* v = apvts.getRawParameterValue(P("compressorRatio"))) params.compressorRatio = v->load();
    if (auto* v = apvts.getRawParameterValue(P("compressorAttack"))) params.compressorAttack = v->load();
    if (auto* v = apvts.getRawParameterValue(P("compressorRelease"))) params.compressorRelease = v->load();
    if (auto* v = apvts.getRawParameterValue(P("compressorGlassy"))) params.compressorGlassy = v->load() > 0.5f;

    if (auto* v = apvts.getRawParameterValue(P("wahEnabled"))) params.wahEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("wahMode"))) params.wahMode = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P("wahPosition"))) params.wahPosition = v->load();
    if (auto* v = apvts.getRawParameterValue(P("wahQ"))) params.wahQ = v->load();

    if (auto* v = apvts.getRawParameterValue(P("phaserEnabled"))) params.phaserEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("phaserRate"))) params.phaserRate = v->load();
    if (auto* v = apvts.getRawParameterValue(P("phaserDepth"))) params.phaserDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(P("phaserStages"))) params.phaserStages = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P("phaserFeedback"))) params.phaserFeedback = v->load();

    if (auto* v = apvts.getRawParameterValue(P("chorusEnabled"))) params.chorusEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("chorusRate"))) params.chorusRate = v->load();
    if (auto* v = apvts.getRawParameterValue(P("chorusDepth"))) params.chorusDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(P("chorusVoices"))) params.chorusVoices = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P("chorusMix"))) params.chorusMix = v->load();

    if (auto* v = apvts.getRawParameterValue(P("pitchShifterEnabled"))) params.pitchShifterEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("pitchShifterSemitones"))) params.pitchShifterSemitones = v->load();
    if (auto* v = apvts.getRawParameterValue(P("pitchShifterMix"))) params.pitchShifterMix = v->load();

    if (auto* v = apvts.getRawParameterValue(P("harmonizerEnabled"))) params.harmonizerEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("harmonizerVoice1"))) params.harmonizerVoice1 = v->load();
    if (auto* v = apvts.getRawParameterValue(P("harmonizerVoice2"))) params.harmonizerVoice2 = v->load();
    if (auto* v = apvts.getRawParameterValue(P("harmonizerDetune"))) params.harmonizerDetune = v->load();
    if (auto* v = apvts.getRawParameterValue(P("harmonizerMix"))) params.harmonizerMix = v->load();

    if (auto* v = apvts.getRawParameterValue(P("delayEnabled"))) params.delayEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("delayTimeL"))) params.delayTimeL = v->load();
    if (auto* v = apvts.getRawParameterValue(P("delayTimeR"))) params.delayTimeR = v->load();
    if (auto* v = apvts.getRawParameterValue(P("delayFeedback"))) params.delayFeedback = v->load();
    if (auto* v = apvts.getRawParameterValue(P("delayMix"))) params.delayMix = v->load();
    if (auto* v = apvts.getRawParameterValue(P("delayFreeze"))) params.delayFreeze = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("delayPitchShiftL"))) params.delayPitchShiftL = v->load();
    if (auto* v = apvts.getRawParameterValue(P("delayPitchShiftR"))) params.delayPitchShiftR = v->load();

    if (auto* v = apvts.getRawParameterValue(P("reverbEnabled"))) params.reverbEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("reverbType"))) params.reverbType = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P("reverbDecay"))) params.reverbDecay = v->load();
    if (auto* v = apvts.getRawParameterValue(P("reverbShimmerAmount"))) params.reverbShimmerAmount = v->load();
    if (auto* v = apvts.getRawParameterValue(P("reverbShimmerInterval"))) params.reverbShimmerInterval = v->load();
    if (auto* v = apvts.getRawParameterValue(P("reverbMix"))) params.reverbMix = v->load();
    if (auto* v = apvts.getRawParameterValue(P("reverbFreeze"))) params.reverbFreeze = v->load() > 0.5f;

    if (auto* v = apvts.getRawParameterValue(P("eqEnabled"))) params.eqEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("eqLowGain"))) params.eqLowGain = v->load();
    if (auto* v = apvts.getRawParameterValue(P("eqMidGain"))) params.eqMidGain = v->load();
    if (auto* v = apvts.getRawParameterValue(P("eqHighGain"))) params.eqHighGain = v->load();
    if (auto* v = apvts.getRawParameterValue(P("eqTilt"))) params.eqTilt = v->load();

    if (auto* v = apvts.getRawParameterValue(P("exciterEnabled"))) params.exciterEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("exciterWarmth"))) params.exciterWarmth = v->load();
    if (auto* v = apvts.getRawParameterValue(P("exciterPresence"))) params.exciterPresence = v->load();
    if (auto* v = apvts.getRawParameterValue(P("exciterAir"))) params.exciterAir = v->load();

    if (auto* v = apvts.getRawParameterValue(P("tremoloEnabled"))) params.tremoloEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P("tremoloRate"))) params.tremoloRate = v->load();
    if (auto* v = apvts.getRawParameterValue(P("tremoloDepth"))) params.tremoloDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(P("tremoloWaveform"))) params.tremoloWaveform = (int)v->load();

    processor.setParameters(params);
}
