#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_MIX      = "mix";
constexpr auto PARAM_DECAY    = "decay";
constexpr auto PARAM_MOD_RATE = "modRate";
constexpr auto PARAM_BYPASS   = "bypass";
constexpr auto PARAM_ATMOS    = "atmosphere";
constexpr auto PARAM_SHIMMER  = "shimmer";
constexpr auto PARAM_SHIMMER_PITCH = "shimmerPitch";
constexpr auto PARAM_MOD      = "modulation";
constexpr auto PARAM_DRIVE    = "drive";
constexpr auto PARAM_DELAY_TIME = "delayTime";
constexpr auto PARAM_DELAY_FB   = "delayFeedback";
constexpr auto PARAM_DELAY_MOD  = "delayMod";
constexpr auto PARAM_LOW_CUT = "lowCut";
constexpr auto PARAM_HIGH_CUT = "highCut";
constexpr auto PARAM_STEREO = "stereoWidth";
constexpr auto PARAM_REVERB_DIFF = "reverbDiffusion";
constexpr auto PARAM_REVERB_DAMP = "reverbDamping";
constexpr auto PARAM_REVERB_SIZE = "reverbSize";
constexpr auto PARAM_REVERB_MOD = "reverbModDepth";
constexpr auto PARAM_SHIMMER_FB = "shimmerFeedback";
constexpr auto PARAM_SHIMMER_DELAY = "shimmerDelay";
constexpr auto PARAM_CHORUS_VOICES = "chorusVoices";
constexpr auto PARAM_CHORUS_SPREAD = "chorusSpread";
constexpr auto PARAM_SAT_TONE = "saturationTone";
constexpr auto PARAM_DUCKING = "ducking";
constexpr auto PARAM_PRESET = "preset";
constexpr auto PARAM_SPILLOVER = "spillover";
}

ShoeGazeAudioProcessor::ShoeGazeAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {
        PARAM_MIX, PARAM_DECAY, PARAM_MOD_RATE, PARAM_BYPASS,
        PARAM_ATMOS, PARAM_SHIMMER, PARAM_SHIMMER_PITCH, PARAM_MOD, PARAM_DRIVE,
        PARAM_DELAY_TIME, PARAM_DELAY_FB, PARAM_DELAY_MOD, PARAM_LOW_CUT, PARAM_HIGH_CUT, PARAM_STEREO,
        PARAM_REVERB_DIFF, PARAM_REVERB_DAMP, PARAM_REVERB_SIZE, PARAM_REVERB_MOD,
        PARAM_SHIMMER_FB, PARAM_SHIMMER_DELAY, PARAM_CHORUS_VOICES, PARAM_CHORUS_SPREAD,
        PARAM_SAT_TONE, PARAM_DUCKING, PARAM_PRESET, PARAM_SPILLOVER
    };
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

ShoeGazeAudioProcessor::~ShoeGazeAudioProcessor() = default;

void ShoeGazeAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
}

void ShoeGazeAudioProcessor::releaseResources()
{
    processor.reset();
}

bool ShoeGazeAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void ShoeGazeAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

void ShoeGazeAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(newValue);
    syncParameters();
}

juce::AudioProcessorEditor* ShoeGazeAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool ShoeGazeAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String ShoeGazeAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void ShoeGazeAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void ShoeGazeAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new ShoeGazeAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout ShoeGazeAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX, "Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.7f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DECAY, "Decay (s)", juce::NormalisableRange<float>(0.1f, 30.0f, 0.01f), 4.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MOD_RATE, "Mod Rate (Hz)", juce::NormalisableRange<float>(0.05f, 10.0f, 0.01f), 0.6f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_ATMOS, "Atmosphere", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_SHIMMER, "Shimmer", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 25.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_SHIMMER_PITCH, "Shimmer Pitch", juce::NormalisableRange<float>(-12.0f, 24.0f, 0.1f), 12.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MOD, "Modulation", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 35.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DRIVE, "Drive", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 15.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DELAY_TIME, "Delay Time (ms)", juce::NormalisableRange<float>(0.0f, 1000.0f, 0.1f), 200.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DELAY_FB, "Delay Feedback", juce::NormalisableRange<float>(0.0f, 90.0f, 0.1f), 30.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DELAY_MOD, "Delay Mod", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 20.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_LOW_CUT, "Low Cut (Hz)", juce::NormalisableRange<float>(20.0f, 2000.0f, 0.1f), 80.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_HIGH_CUT, "High Cut (Hz)", juce::NormalisableRange<float>(1000.0f, 20000.0f, 1.0f), 8000.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_STEREO, "Stereo Width", juce::NormalisableRange<float>(0.0f, 200.0f, 0.1f), 150.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_REVERB_DIFF, "Reverb Diffusion", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 85.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_REVERB_DAMP, "Reverb Damping", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 40.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_REVERB_SIZE, "Reverb Size", juce::NormalisableRange<float>(10.0f, 100.0f, 0.1f), 75.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_REVERB_MOD, "Reverb Mod Depth", juce::NormalisableRange<float>(0.0f, 50.0f, 0.1f), 15.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_SHIMMER_FB, "Shimmer Feedback", juce::NormalisableRange<float>(0.0f, 80.0f, 0.1f), 35.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_SHIMMER_DELAY, "Shimmer Delay (ms)", juce::NormalisableRange<float>(0.0f, 200.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(
        PARAM_CHORUS_VOICES, "Chorus Voices", 1, map2::ShoeGazeProcessor::MAX_CHORUS_VOICES, 4));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_CHORUS_SPREAD, "Chorus Spread", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 80.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_SAT_TONE, "Saturation Tone", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DUCKING, "Ducking", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(
        PARAM_PRESET, "Preset", []{
            juce::StringArray arr;
            for (int i = 0; i < map2::ShoeGazeProcessor::getNumPresets(); ++i)
                arr.add(map2::ShoeGazeProcessor::getPresetInfo(static_cast<map2::ShoeGazeProcessor::Preset>(i)).name);
            return arr;
        }(), 0));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_SPILLOVER, "Spillover", true));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void ShoeGazeAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();

    if (auto* v = apvts.getRawParameterValue(PARAM_ATMOS)) params.atmosphere = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DECAY)) params.decay = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_SHIMMER)) params.shimmer = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_SHIMMER_PITCH)) params.shimmerPitch = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_MOD)) params.modulation = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_MOD_RATE)) params.modRate = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DRIVE)) params.drive = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DELAY_TIME)) params.delayTime = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DELAY_FB)) params.delayFeedback = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DELAY_MOD)) params.delayMod = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_LOW_CUT)) params.lowCut = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_HIGH_CUT)) params.highCut = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_MIX)) params.mix = v->load() * 100.0f;
    if (auto* v = apvts.getRawParameterValue(PARAM_STEREO)) params.stereoWidth = v->load();

    if (auto* v = apvts.getRawParameterValue(PARAM_REVERB_DIFF)) params.reverbDiffusion = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_REVERB_DAMP)) params.reverbDamping = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_REVERB_SIZE)) params.reverbSize = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_REVERB_MOD)) params.reverbModDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_SHIMMER_FB)) params.shimmerFeedback = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_SHIMMER_DELAY)) params.shimmerDelay = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_CHORUS_VOICES)) params.chorusVoices = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_CHORUS_SPREAD)) params.chorusSpread = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_SAT_TONE)) params.saturationTone = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DUCKING)) params.ducking = v->load();

    if (auto* v = apvts.getRawParameterValue(PARAM_PRESET))
        params.preset = static_cast<map2::ShoeGazeProcessor::Preset>((int)v->load());
    if (auto* v = apvts.getRawParameterValue(PARAM_SPILLOVER)) params.spillover = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(PARAM_BYPASS)) params.bypass = v->load() > 0.5f;

    processor.setParameters(params);
}
