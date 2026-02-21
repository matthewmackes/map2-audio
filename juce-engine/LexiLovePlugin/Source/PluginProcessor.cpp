#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <string>

namespace
{
constexpr auto P_ALGO          = "algorithm";
constexpr auto P_PREDELAY      = "preDelay";
constexpr auto P_DECAY         = "decayTime";
constexpr auto P_DIFFUSION     = "diffusion";
constexpr auto P_LOW_DECAY     = "lowDecayMult";
constexpr auto P_HIGH_DECAY    = "highDecayMult";
constexpr auto P_LOW_XOVER     = "lowCrossover";
constexpr auto P_HIGH_XOVER    = "highCrossover";
constexpr auto P_EARLY_LEVEL   = "earlyLevel";
constexpr auto P_EARLY_PATTERN = "earlyPattern";
constexpr auto P_MOD_DEPTH     = "modDepth";
constexpr auto P_MOD_RATE      = "modRate";
constexpr auto P_MIX           = "mix";
constexpr auto P_HIGH_CUT      = "highCut";
constexpr auto P_LOW_CUT       = "lowCut";
constexpr auto P_SPILLOVER     = "spillover";
constexpr auto P_BYPASS        = "bypass";
}

LexiLoveAudioProcessor::LexiLoveAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(P_ALGO, this);
    apvts.addParameterListener(P_PREDELAY, this);
    apvts.addParameterListener(P_DECAY, this);
    apvts.addParameterListener(P_DIFFUSION, this);
    apvts.addParameterListener(P_LOW_DECAY, this);
    apvts.addParameterListener(P_HIGH_DECAY, this);
    apvts.addParameterListener(P_LOW_XOVER, this);
    apvts.addParameterListener(P_HIGH_XOVER, this);
    apvts.addParameterListener(P_EARLY_LEVEL, this);
    apvts.addParameterListener(P_EARLY_PATTERN, this);
    apvts.addParameterListener(P_MOD_DEPTH, this);
    apvts.addParameterListener(P_MOD_RATE, this);
    apvts.addParameterListener(P_MIX, this);
    apvts.addParameterListener(P_HIGH_CUT, this);
    apvts.addParameterListener(P_LOW_CUT, this);
    apvts.addParameterListener(P_SPILLOVER, this);
    apvts.addParameterListener(P_BYPASS, this);

    syncParameters();
}

LexiLoveAudioProcessor::~LexiLoveAudioProcessor()
{
    apvts.removeParameterListener(P_ALGO, this);
    apvts.removeParameterListener(P_PREDELAY, this);
    apvts.removeParameterListener(P_DECAY, this);
    apvts.removeParameterListener(P_DIFFUSION, this);
    apvts.removeParameterListener(P_LOW_DECAY, this);
    apvts.removeParameterListener(P_HIGH_DECAY, this);
    apvts.removeParameterListener(P_LOW_XOVER, this);
    apvts.removeParameterListener(P_HIGH_XOVER, this);
    apvts.removeParameterListener(P_EARLY_LEVEL, this);
    apvts.removeParameterListener(P_EARLY_PATTERN, this);
    apvts.removeParameterListener(P_MOD_DEPTH, this);
    apvts.removeParameterListener(P_MOD_RATE, this);
    apvts.removeParameterListener(P_MIX, this);
    apvts.removeParameterListener(P_HIGH_CUT, this);
    apvts.removeParameterListener(P_LOW_CUT, this);
    apvts.removeParameterListener(P_SPILLOVER, this);
    apvts.removeParameterListener(P_BYPASS, this);
}

void LexiLoveAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
}

void LexiLoveAudioProcessor::releaseResources()
{
    processor.reset();
}

bool LexiLoveAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void LexiLoveAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* LexiLoveAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool LexiLoveAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String LexiLoveAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void LexiLoveAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void LexiLoveAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, (size_t) sizeInBytes);
    if (state.isValid())
    {
        apvts.replaceState(state);
        syncParameters();
    }
}

void LexiLoveAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

juce::AudioProcessorValueTreeState::ParameterLayout LexiLoveAudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_ALGO, "Algorithm",
        juce::StringArray{"Tiled Room", "Rich Plate", "Concert Hall", "Small Room", "Rich Chamber", "Gymnasium", "Long Hall", "Gated Plate", "Infinite"},
        static_cast<int>(map2::LexiLoveProcessor::Algorithm::RichPlate)));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PREDELAY, "PreDelay (ms)", R(0.0f, 500.0f, 0.1f), 40.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DECAY, "Decay (s)", R(0.5f, 30.0f, 0.01f), 2.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DIFFUSION, "Diffusion (%)", R(0.0f, 100.0f, 0.1f), 85.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LOW_DECAY, "Low Decay Mult", R(0.25f, 2.0f, 0.01f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HIGH_DECAY, "High Decay Mult", R(0.25f, 2.0f, 0.01f), 0.8f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LOW_XOVER, "Low Crossover (Hz)", R(100.0f, 2000.0f, 1.0f), 500.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HIGH_XOVER, "High Crossover (Hz)", R(2000.0f, 15000.0f, 1.0f), 9000.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_EARLY_LEVEL, "Early Level (%)", R(0.0f, 100.0f, 0.1f), 70.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_EARLY_PATTERN, "Early Pattern (%)", R(0.0f, 100.0f, 0.1f), 50.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MOD_DEPTH, "Mod Depth (%)", R(0.0f, 100.0f, 0.1f), 15.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MOD_RATE, "Mod Rate (Hz)", R(0.1f, 10.0f, 0.01f), 0.8f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MIX, "Mix (%)", R(0.0f, 100.0f, 0.1f), 35.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HIGH_CUT, "High Cut (Hz)", R(1000.0f, 20000.0f, 1.0f), 12000.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LOW_CUT, "Low Cut (Hz)", R(20.0f, 500.0f, 0.1f), 40.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_SPILLOVER, "Spillover", true));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));

    return {params.begin(), params.end()};
}

void LexiLoveAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();

    if (auto* v = apvts.getRawParameterValue(P_ALGO)) params.algorithm = static_cast<map2::LexiLoveProcessor::Algorithm>((int) v->load());
    if (auto* v = apvts.getRawParameterValue(P_PREDELAY)) params.preDelay = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DECAY)) params.decayTime = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DIFFUSION)) params.diffusion = v->load();
    if (auto* v = apvts.getRawParameterValue(P_LOW_DECAY)) params.lowDecayMult = v->load();
    if (auto* v = apvts.getRawParameterValue(P_HIGH_DECAY)) params.highDecayMult = v->load();
    if (auto* v = apvts.getRawParameterValue(P_LOW_XOVER)) params.lowCrossover = v->load();
    if (auto* v = apvts.getRawParameterValue(P_HIGH_XOVER)) params.highCrossover = v->load();
    if (auto* v = apvts.getRawParameterValue(P_EARLY_LEVEL)) params.earlyLevel = v->load();
    if (auto* v = apvts.getRawParameterValue(P_EARLY_PATTERN)) params.earlyPattern = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MOD_DEPTH)) params.modDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MOD_RATE)) params.modRate = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MIX)) params.mix = v->load();
    if (auto* v = apvts.getRawParameterValue(P_HIGH_CUT)) params.highCut = v->load();
    if (auto* v = apvts.getRawParameterValue(P_LOW_CUT)) params.lowCut = v->load();
    if (auto* v = apvts.getRawParameterValue(P_SPILLOVER)) params.spillover = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P_BYPASS)) params.bypass = v->load() > 0.5f;

    processor.setParameters(params);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new LexiLoveAudioProcessor();
}
