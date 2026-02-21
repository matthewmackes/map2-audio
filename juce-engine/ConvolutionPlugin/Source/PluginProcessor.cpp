#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_MIX     = "mix";
constexpr auto PARAM_PREDELAY = "predelay";
constexpr auto PARAM_BYPASS  = "bypass";
constexpr auto PARAM_MODE    = "mode";
}

ConvolutionAudioProcessor::ConvolutionAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    updateParametersFromState();

    apvts.addParameterListener(PARAM_MIX,     this);
    apvts.addParameterListener(PARAM_PREDELAY, this);
    apvts.addParameterListener(PARAM_BYPASS,  this);
    apvts.addParameterListener(PARAM_MODE,    this);
}

ConvolutionAudioProcessor::~ConvolutionAudioProcessor()
{
    apvts.removeParameterListener(PARAM_MIX, this);
    apvts.removeParameterListener(PARAM_PREDELAY, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
    apvts.removeParameterListener(PARAM_MODE, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout ConvolutionAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX, "Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 1.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PREDELAY, "Pre-Delay (ms)", juce::NormalisableRange<float>(0.0f, 500.0f, 0.1f), 0.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_BYPASS, "Bypass", false));

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(
        PARAM_MODE, "Mode", juce::StringArray{"Zero Latency", "Low Latency", "High Quality"}, 0));

    return {params.begin(), params.end()};
}

void ConvolutionAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    updateParametersFromState();
}

void ConvolutionAudioProcessor::releaseResources()
{
    processor.releaseResources();
}

void ConvolutionAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(newValue);
    if (parameterID == PARAM_MIX
        || parameterID == PARAM_PREDELAY
        || parameterID == PARAM_BYPASS
        || parameterID == PARAM_MODE)
    {
        updateParametersFromState();
    }
}

bool ConvolutionAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void ConvolutionAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* ConvolutionAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool ConvolutionAudioProcessor::hasEditor() const { return true; }

const juce::String ConvolutionAudioProcessor::getName() const { return JucePlugin_Name; }

void ConvolutionAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void ConvolutionAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, size_t(sizeInBytes));
    if (state.isValid())
    {
        apvts.replaceState(state);
        updateParametersFromState();
    }
}

void ConvolutionAudioProcessor::updateParametersFromState()
{
    if (auto* mix = apvts.getRawParameterValue(PARAM_MIX))
        processor.setDryWetMix(mix->load());
    if (auto* pd = apvts.getRawParameterValue(PARAM_PREDELAY))
        processor.setPreDelay(pd->load());
    if (auto* bypass = apvts.getRawParameterValue(PARAM_BYPASS))
        processor.setBypass(bypass->load() > 0.5f);
    if (auto* mode = apvts.getRawParameterValue(PARAM_MODE))
    {
        using map2::ConvolutionProcessor;
        auto m = static_cast<int>(mode->load());
        processor.setMode(static_cast<ConvolutionProcessor::Mode>(juce::jlimit(0, 2, m)));
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ConvolutionAudioProcessor();
}
