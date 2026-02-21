#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_IN_GAIN   = "inputGainDb";
constexpr auto PARAM_OUT_GAIN  = "outputGainDb";
constexpr auto PARAM_BYPASS    = "bypass";
constexpr auto PARAM_NORMALIZE = "normalize";
}

NAMAudioProcessor::NAMAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(PARAM_IN_GAIN, this);
    apvts.addParameterListener(PARAM_OUT_GAIN, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
    apvts.addParameterListener(PARAM_NORMALIZE, this);
    syncParameters();
}

NAMAudioProcessor::~NAMAudioProcessor()
{
    apvts.removeParameterListener(PARAM_IN_GAIN, this);
    apvts.removeParameterListener(PARAM_OUT_GAIN, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
    apvts.removeParameterListener(PARAM_NORMALIZE, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout NAMAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_IN_GAIN, "Input Gain (dB)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_OUT_GAIN, "Output Gain (dB)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_BYPASS, "Bypass", false));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_NORMALIZE, "Normalize", true));
    return {params.begin(), params.end()};
}

void NAMAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock);
    syncParameters();
}

void NAMAudioProcessor::releaseResources()
{
    processor.releaseResources();
}

bool NAMAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void NAMAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch)
        buffer.clear(ch, 0, numSamples);

    if (apvts.getRawParameterValue(PARAM_BYPASS)->load() > 0.5f)
        return;

    processor.process(buffer);
}

juce::AudioProcessorEditor* NAMAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool NAMAudioProcessor::hasEditor() const { return true; }

const juce::String NAMAudioProcessor::getName() const { return JucePlugin_Name; }

void NAMAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void NAMAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, (size_t) sizeInBytes);
    if (state.isValid())
    {
        apvts.replaceState(state);
        syncParameters();
    }
}

void NAMAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void NAMAudioProcessor::syncParameters()
{
    if (auto* in = apvts.getRawParameterValue(PARAM_IN_GAIN))
        processor.setInputGain(in->load());
    if (auto* out = apvts.getRawParameterValue(PARAM_OUT_GAIN))
        processor.setOutputGain(out->load());
    if (auto* norm = apvts.getRawParameterValue(PARAM_NORMALIZE))
        processor.setNormalize(norm->load() > 0.5f);
    if (auto* bypass = apvts.getRawParameterValue(PARAM_BYPASS))
        processor.setBypass(bypass->load() > 0.5f);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new NAMAudioProcessor();
}
