#include "PluginProcessor.h"
#include "PluginEditor.h"

ChorusAudioProcessor::ChorusAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    apvts.addParameterListener(PARAM_RATE, this);
    apvts.addParameterListener(PARAM_DEPTH, this);
    apvts.addParameterListener(PARAM_CENTRE_DELAY, this);
    apvts.addParameterListener(PARAM_FEEDBACK, this);
    apvts.addParameterListener(PARAM_MIX, this);
    apvts.addParameterListener(PARAM_SPREAD, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
}

ChorusAudioProcessor::~ChorusAudioProcessor()
{
    apvts.removeParameterListener(PARAM_RATE, this);
    apvts.removeParameterListener(PARAM_DEPTH, this);
    apvts.removeParameterListener(PARAM_CENTRE_DELAY, this);
    apvts.removeParameterListener(PARAM_FEEDBACK, this);
    apvts.removeParameterListener(PARAM_MIX, this);
    apvts.removeParameterListener(PARAM_SPREAD, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout ChorusAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RATE, 1}, "Rate",
        juce::NormalisableRange<float>(0.1f, 10.0f, 0.01f), 1.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DEPTH, 1}, "Depth",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_CENTRE_DELAY, 1}, "Centre Delay",
        juce::NormalisableRange<float>(1.0f, 30.0f, 0.1f), 7.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_FEEDBACK, 1}, "Feedback",
        juce::NormalisableRange<float>(-1.0f, 1.0f, 0.001f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MIX, 1}, "Mix",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_SPREAD, 1}, "Spread",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 1.0f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_BYPASS, 1}, "Bypass", false));

    return layout;
}

void ChorusAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    chorus.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    chorus.reset();
    updateProcessorParameters();
}

void ChorusAudioProcessor::releaseResources()
{
    chorus.reset();
}

bool ChorusAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void ChorusAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    chorus.process(buffer);
}

void ChorusAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    updateProcessorParameters();
}

void ChorusAudioProcessor::updateProcessorParameters()
{
    chorus.setRate(*apvts.getRawParameterValue(PARAM_RATE));
    chorus.setDepth(*apvts.getRawParameterValue(PARAM_DEPTH));
    chorus.setCentreDelay(*apvts.getRawParameterValue(PARAM_CENTRE_DELAY));
    chorus.setFeedback(*apvts.getRawParameterValue(PARAM_FEEDBACK));
    chorus.setMix(*apvts.getRawParameterValue(PARAM_MIX));
    chorus.setSpread(*apvts.getRawParameterValue(PARAM_SPREAD));
    chorus.setBypass(*apvts.getRawParameterValue(PARAM_BYPASS) > 0.5f);
}

juce::AudioProcessorEditor* ChorusAudioProcessor::createEditor()
{
    return new ChorusAudioProcessorEditor(*this);
}

bool ChorusAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String ChorusAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void ChorusAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void ChorusAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateProcessorParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ChorusAudioProcessor();
}
