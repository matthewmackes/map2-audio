#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto P_MODE    = "mode";
constexpr auto P_ABBLEND = "abBlend";
constexpr auto P_MASTER  = "masterLevel";
constexpr auto P_BRANCH0 = "branch0";
constexpr auto P_BRANCH1 = "branch1";
constexpr auto P_BRANCH2 = "branch2";
constexpr auto P_BRANCH3 = "branch3";
constexpr auto P_BRANCHES = "numBranches";
constexpr auto P_BYPASS  = "bypass";
}

ParallelMixerAudioProcessor::ParallelMixerAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {P_MODE, P_ABBLEND, P_MASTER, P_BRANCH0, P_BRANCH1, P_BRANCH2, P_BRANCH3, P_BRANCHES, P_BYPASS};
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

ParallelMixerAudioProcessor::~ParallelMixerAudioProcessor() = default;

void ParallelMixerAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepareToPlay(sampleRate, samplesPerBlock);
    syncParameters();
}

void ParallelMixerAudioProcessor::releaseResources()
{
    processor.releaseResources();
}

bool ParallelMixerAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void ParallelMixerAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    if (apvts.getRawParameterValue(P_BYPASS)->load() > 0.5f)
        return;

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    processor.processBlock(buffer, midiMessages);
}

juce::AudioProcessorEditor* ParallelMixerAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool ParallelMixerAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String ParallelMixerAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void ParallelMixerAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void ParallelMixerAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new ParallelMixerAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout ParallelMixerAudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(
        P_MODE, "Mode", juce::StringArray{"AB Blend", "Multi Mix", "Wet/Dry"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        P_ABBLEND, "A/B Blend", R(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        P_MASTER, "Master Level", R(0.0f, 2.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BRANCH0, "Branch 0 Level", R(0.0f, 2.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BRANCH1, "Branch 1 Level", R(0.0f, 2.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BRANCH2, "Branch 2 Level", R(0.0f, 2.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BRANCH3, "Branch 3 Level", R(0.0f, 2.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(P_BRANCHES, "Active Branches", 1, map2::ParallelMixerProcessor::MAX_BRANCHES, 2));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void ParallelMixerAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void ParallelMixerAudioProcessor::syncParameters()
{
    if (auto* v = apvts.getRawParameterValue(P_MODE))
        processor.setMode(static_cast<map2::ParallelMixerProcessor::Mode>((int)v->load()));
    if (auto* v = apvts.getRawParameterValue(P_ABBLEND))
        processor.setABBlend(v->load());
    if (auto* v = apvts.getRawParameterValue(P_MASTER))
        processor.setMasterLevel(v->load());

    if (auto* v = apvts.getRawParameterValue(P_BRANCH0)) processor.setBranchLevel(0, v->load());
    if (auto* v = apvts.getRawParameterValue(P_BRANCH1)) processor.setBranchLevel(1, v->load());
    if (auto* v = apvts.getRawParameterValue(P_BRANCH2)) processor.setBranchLevel(2, v->load());
    if (auto* v = apvts.getRawParameterValue(P_BRANCH3)) processor.setBranchLevel(3, v->load());

    if (auto* v = apvts.getRawParameterValue(P_BRANCHES))
        processor.setNumBranches((int)v->load());
    if (auto* v = apvts.getRawParameterValue(P_BYPASS))
        processor.setBypass(v->load() > 0.5f);
}
