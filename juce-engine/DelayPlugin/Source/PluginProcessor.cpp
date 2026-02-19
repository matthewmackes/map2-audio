#include "PluginProcessor.h"
#include "PluginEditor.h"

DelayAudioProcessor::DelayAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    apvts.addParameterListener(PARAM_DELAY_L, this);
    apvts.addParameterListener(PARAM_DELAY_R, this);
    apvts.addParameterListener(PARAM_FEEDBACK, this);
    apvts.addParameterListener(PARAM_MIX, this);
    apvts.addParameterListener(PARAM_STEREO_MODE, this);
    apvts.addParameterListener(PARAM_MOD_RATE, this);
    apvts.addParameterListener(PARAM_MOD_DEPTH, this);
    apvts.addParameterListener(PARAM_LOW_CUT, this);
    apvts.addParameterListener(PARAM_HIGH_CUT, this);
    apvts.addParameterListener(PARAM_DIFFUSION, this);
    apvts.addParameterListener(PARAM_DUCK_AMOUNT, this);
    apvts.addParameterListener(PARAM_OUTPUT_LEVEL, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
}

DelayAudioProcessor::~DelayAudioProcessor()
{
    apvts.removeParameterListener(PARAM_DELAY_L, this);
    apvts.removeParameterListener(PARAM_DELAY_R, this);
    apvts.removeParameterListener(PARAM_FEEDBACK, this);
    apvts.removeParameterListener(PARAM_MIX, this);
    apvts.removeParameterListener(PARAM_STEREO_MODE, this);
    apvts.removeParameterListener(PARAM_MOD_RATE, this);
    apvts.removeParameterListener(PARAM_MOD_DEPTH, this);
    apvts.removeParameterListener(PARAM_LOW_CUT, this);
    apvts.removeParameterListener(PARAM_HIGH_CUT, this);
    apvts.removeParameterListener(PARAM_DIFFUSION, this);
    apvts.removeParameterListener(PARAM_DUCK_AMOUNT, this);
    apvts.removeParameterListener(PARAM_OUTPUT_LEVEL, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout DelayAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DELAY_L, 1}, "Delay Left",
        juce::NormalisableRange<float>(1.0f, 2000.0f, 1.0f), 500.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DELAY_R, 1}, "Delay Right",
        juce::NormalisableRange<float>(1.0f, 2000.0f, 1.0f), 500.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_FEEDBACK, 1}, "Feedback",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 30.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MIX, 1}, "Mix",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 50.0f));

    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_STEREO_MODE, 1}, "Stereo Mode",
        juce::StringArray{"Mono", "Stereo", "Ping-Pong", "Dual Mono"}, 1));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MOD_RATE, 1}, "Mod Rate",
        juce::NormalisableRange<float>(0.01f, 10.0f, 0.01f, 0.4f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MOD_DEPTH, 1}, "Mod Depth",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_LOW_CUT, 1}, "Low Cut",
        juce::NormalisableRange<float>(20.0f, 2000.0f, 1.0f, 0.35f), 20.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_HIGH_CUT, 1}, "High Cut",
        juce::NormalisableRange<float>(1000.0f, 20000.0f, 1.0f, 0.35f), 12000.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DIFFUSION, 1}, "Diffusion",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DUCK_AMOUNT, 1}, "Duck Amount",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_OUTPUT_LEVEL, 1}, "Output Level",
        juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_BYPASS, 1}, "Bypass", false));

    return layout;
}

void DelayAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    delay.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    delay.reset();
    updateProcessorParameters();
}

void DelayAudioProcessor::releaseResources()
{
    delay.reset();
}

bool DelayAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void DelayAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    delay.process(buffer);
}

void DelayAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    updateProcessorParameters();
}

void DelayAudioProcessor::updateProcessorParameters()
{
    delay.setDelayTimeL(*apvts.getRawParameterValue(PARAM_DELAY_L));
    delay.setDelayTimeR(*apvts.getRawParameterValue(PARAM_DELAY_R));
    delay.setFeedback(*apvts.getRawParameterValue(PARAM_FEEDBACK));
    delay.setMix(*apvts.getRawParameterValue(PARAM_MIX));
    delay.setStereoMode(static_cast<map2::DelayProcessor::StereoMode>(
        juce::roundToInt(apvts.getRawParameterValue(PARAM_STEREO_MODE)->load())));
    delay.setModRate(*apvts.getRawParameterValue(PARAM_MOD_RATE));
    delay.setModDepth(*apvts.getRawParameterValue(PARAM_MOD_DEPTH));
    delay.setLowCut(*apvts.getRawParameterValue(PARAM_LOW_CUT));
    delay.setHighCut(*apvts.getRawParameterValue(PARAM_HIGH_CUT));
    delay.setDiffusion(*apvts.getRawParameterValue(PARAM_DIFFUSION));
    delay.setDuckAmount(*apvts.getRawParameterValue(PARAM_DUCK_AMOUNT));
    delay.setOutputLevel(*apvts.getRawParameterValue(PARAM_OUTPUT_LEVEL));
    delay.setBypass(*apvts.getRawParameterValue(PARAM_BYPASS) > 0.5f);
}

juce::AudioProcessorEditor* DelayAudioProcessor::createEditor()
{
    return new DelayAudioProcessorEditor(*this);
}

bool DelayAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String DelayAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void DelayAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void DelayAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateProcessorParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new DelayAudioProcessor();
}
