#include "PluginProcessor.h"
#include "PluginEditor.h"

MesaDualRectifierAudioProcessor::MesaDualRectifierAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput ("Input",  juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    apvts.addParameterListener(PARAM_GAIN,           this);
    apvts.addParameterListener(PARAM_BASS,           this);
    apvts.addParameterListener(PARAM_MID,            this);
    apvts.addParameterListener(PARAM_TREBLE,         this);
    apvts.addParameterListener(PARAM_PRESENCE,       this);
    apvts.addParameterListener(PARAM_MASTER,         this);
    apvts.addParameterListener(PARAM_BRIGHT,         this);
    apvts.addParameterListener(PARAM_RESONANCE,      this);
    apvts.addParameterListener(PARAM_SAG,            this);
    apvts.addParameterListener(PARAM_BIAS,           this);
    apvts.addParameterListener(PARAM_CHANNEL,        this);
    apvts.addParameterListener(PARAM_RECTIFIER_MODE, this);
    apvts.addParameterListener(PARAM_VOICE_MODE,     this);
    apvts.addParameterListener(PARAM_OVERSAMPLE,     this);
}

MesaDualRectifierAudioProcessor::~MesaDualRectifierAudioProcessor()
{
    apvts.removeParameterListener(PARAM_GAIN,           this);
    apvts.removeParameterListener(PARAM_BASS,           this);
    apvts.removeParameterListener(PARAM_MID,            this);
    apvts.removeParameterListener(PARAM_TREBLE,         this);
    apvts.removeParameterListener(PARAM_PRESENCE,       this);
    apvts.removeParameterListener(PARAM_MASTER,         this);
    apvts.removeParameterListener(PARAM_BRIGHT,         this);
    apvts.removeParameterListener(PARAM_RESONANCE,      this);
    apvts.removeParameterListener(PARAM_SAG,            this);
    apvts.removeParameterListener(PARAM_BIAS,           this);
    apvts.removeParameterListener(PARAM_CHANNEL,        this);
    apvts.removeParameterListener(PARAM_RECTIFIER_MODE, this);
    apvts.removeParameterListener(PARAM_VOICE_MODE,     this);
    apvts.removeParameterListener(PARAM_OVERSAMPLE,     this);
}

juce::AudioProcessorValueTreeState::ParameterLayout
MesaDualRectifierAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_GAIN, 1}, "Gain",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_BASS, 1}, "Bass",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MID, 1}, "Mid",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_TREBLE, 1}, "Treble",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_PRESENCE, 1}, "Presence",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MASTER, 1}, "Master",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_BRIGHT, 1}, "Bright",
        juce::NormalisableRange<float>(0.0f, 1.0f, 1.0f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RESONANCE, 1}, "Resonance",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_SAG, 1}, "Sag",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.3f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_BIAS, 1}, "Bias",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_CHANNEL, 1}, "Channel", false));

    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_RECTIFIER_MODE, 1}, "Rectifier",
        juce::StringArray{"Silicon", "Tube"}, 1));

    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_VOICE_MODE, 1}, "Voice",
        juce::StringArray{"Modern", "Vintage", "Raw"}, 0));

    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_OVERSAMPLE, 1}, "Oversample",
        juce::StringArray{"1x", "2x", "4x", "8x", "16x"}, 2));

    return layout;
}

void MesaDualRectifierAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    amp.prepare(sampleRate * oversampleFactor, samplesPerBlock);
    oversampler.reset();
    dcBlockerState[0] = dcBlockerState[1] = 0.0;
    dcBlockerOutput[0] = dcBlockerOutput[1] = 0.0;
    updateAmpParameters();
}

void MesaDualRectifierAudioProcessor::releaseResources()
{
    amp.reset();
}

bool MesaDualRectifierAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void MesaDualRectifierAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                                    juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    auto totalIn  = getTotalNumInputChannels();
    auto totalOut = getTotalNumOutputChannels();
    auto numSamples = buffer.getNumSamples();

    for (auto i = totalIn; i < totalOut; ++i)
        buffer.clear(i, 0, numSamples);

    for (int ch = 0; ch < totalIn; ++ch) {
        auto* data = buffer.getWritePointer(ch);
        for (int s = 0; s < numSamples; ++s) {
            double in  = static_cast<double>(data[s]);
            double out = oversampler.processSample(in, amp);

            // DC blocker
            double dc = out - dcBlockerState[ch] + 0.9999 * dcBlockerOutput[ch];
            dcBlockerState[ch]  = out;
            dcBlockerOutput[ch] = dc;

            data[s] = static_cast<float>(dc);
        }
    }
}

void MesaDualRectifierAudioProcessor::parameterChanged(const juce::String& parameterID,
                                                        float newValue)
{
    if (parameterID == PARAM_OVERSAMPLE) {
        int factor = 1 << static_cast<int>(newValue);
        setOversampleFactor(factor);
    } else {
        updateAmpParameters();
    }
}

void MesaDualRectifierAudioProcessor::updateAmpParameters()
{
    Amps::AmpParameters params;
    params.gain      = *apvts.getRawParameterValue(PARAM_GAIN);
    params.bass      = *apvts.getRawParameterValue(PARAM_BASS);
    params.mid       = *apvts.getRawParameterValue(PARAM_MID);
    params.treble    = *apvts.getRawParameterValue(PARAM_TREBLE);
    params.presence  = *apvts.getRawParameterValue(PARAM_PRESENCE);
    params.master    = *apvts.getRawParameterValue(PARAM_MASTER);
    params.bright    = *apvts.getRawParameterValue(PARAM_BRIGHT);
    params.resonance = *apvts.getRawParameterValue(PARAM_RESONANCE);
    params.sag       = *apvts.getRawParameterValue(PARAM_SAG);
    params.bias      = *apvts.getRawParameterValue(PARAM_BIAS);
    params.channel   = *apvts.getRawParameterValue(PARAM_CHANNEL) > 0.5f;
    amp.setParameters(params);

    int rectMode = static_cast<int>(*apvts.getRawParameterValue(PARAM_RECTIFIER_MODE));
    amp.setRectifierMode(rectMode == 0 ? Amps::MesaDualRectifier::RectifierMode::Silicon
                                       : Amps::MesaDualRectifier::RectifierMode::Tube);

    int voiceMode = static_cast<int>(*apvts.getRawParameterValue(PARAM_VOICE_MODE));
    switch (voiceMode) {
        case 1:  amp.setVoiceMode(Amps::MesaDualRectifier::VoiceMode::Vintage); break;
        case 2:  amp.setVoiceMode(Amps::MesaDualRectifier::VoiceMode::Raw);     break;
        default: amp.setVoiceMode(Amps::MesaDualRectifier::VoiceMode::Modern);  break;
    }
}

void MesaDualRectifierAudioProcessor::setOversampleFactor(int factor)
{
    oversampleFactor = factor;
    oversampler.setOversampleFactor(factor);
    auto sr = getSampleRate();
    if (sr > 0)
        amp.prepare(sr * factor, getBlockSize());
}

juce::AudioProcessorEditor* MesaDualRectifierAudioProcessor::createEditor()
{
    return new MesaDualRectifierAudioProcessorEditor(*this);
}

bool MesaDualRectifierAudioProcessor::hasEditor() const { return true; }

const juce::String MesaDualRectifierAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void MesaDualRectifierAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void MesaDualRectifierAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateAmpParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MesaDualRectifierAudioProcessor();
}
