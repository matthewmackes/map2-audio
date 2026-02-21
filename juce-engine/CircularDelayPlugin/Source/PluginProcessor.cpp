#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_DELAY   = "delayTime";
constexpr auto PARAM_TAPS    = "numTaps";
constexpr auto PARAM_FEEDBACK = "feedback";
constexpr auto PARAM_PANRATE = "panRate";
constexpr auto PARAM_DEPTH   = "depth";
constexpr auto PARAM_MIX     = "mix";
constexpr auto PARAM_ANGLE   = "initialPanAngle";
constexpr auto PARAM_BYPASS  = "bypass";
}

CircularDelayAudioProcessor::CircularDelayAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {PARAM_DELAY, PARAM_TAPS, PARAM_FEEDBACK, PARAM_PANRATE,
                         PARAM_DEPTH, PARAM_MIX, PARAM_ANGLE, PARAM_BYPASS};
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

CircularDelayAudioProcessor::~CircularDelayAudioProcessor() = default;

void CircularDelayAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
}

void CircularDelayAudioProcessor::releaseResources()
{
    processor.reset();
}

bool CircularDelayAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void CircularDelayAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* CircularDelayAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool CircularDelayAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String CircularDelayAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void CircularDelayAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void CircularDelayAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new CircularDelayAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout CircularDelayAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DELAY, "Delay Time (ms)", juce::NormalisableRange<float>(100.0f, 2000.0f, 0.1f), 500.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterInt>(
        PARAM_TAPS, "Taps", 4, 12, 8));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_FEEDBACK, "Feedback", juce::NormalisableRange<float>(0.0f, 0.95f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PANRATE, "Pan Rate (Hz)", juce::NormalisableRange<float>(0.1f, 5.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DEPTH, "Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 1.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX, "Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_ANGLE, "Initial Pan (deg)", juce::NormalisableRange<float>(0.0f, 360.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void CircularDelayAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void CircularDelayAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();
    if (auto* v = apvts.getRawParameterValue(PARAM_DELAY)) params.delayTime = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_TAPS)) params.numTaps = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_FEEDBACK)) params.feedback = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_PANRATE)) params.panRate = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_DEPTH)) params.depth = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_MIX)) params.mix = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_ANGLE)) params.initialPanAngle = v->load();
    if (auto* v = apvts.getRawParameterValue(PARAM_BYPASS)) params.bypass = v->load() > 0.5f;
    processor.setParameters(params);
}
