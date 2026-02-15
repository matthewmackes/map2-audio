/*
Important Disclaimer
This educational platform and its associated code, documentation, or examples may inadvertently reference or mention trademarks, product names, brand names, manufacturers, or commercial software/hardware. (various manufacturers)
Any such references are purely incidental — they are artifacts of the "Vibe Coding" explanatory process used to illustrate general concepts, techniques, or comparisons. This project has no affiliation with, is not endorsed by, and is not connected in any way to those companies, products, or brands.
This is a free, non-commercial, educational resource only — not for sale, not for resale, and not intended as a product, replacement, substitute, alternative, or competitor to any commercial offering.
The referenced commercial products are superior in quality, support, features, reliability, and every other respect. We strongly encourage users to purchase legitimate commercial products from their official sources and to support the developers and companies behind them — their work sustains jobs, innovation, and the broader community that benefits everyone, including educational efforts like this one.
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
WDFAmpAudioProcessor::WDFAmpAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    // Register as parameter listener
    apvts.addParameterListener(PARAM_GAIN, this);
    apvts.addParameterListener(PARAM_BASS, this);
    apvts.addParameterListener(PARAM_MID, this);
    apvts.addParameterListener(PARAM_TREBLE, this);
    apvts.addParameterListener(PARAM_PRESENCE, this);
    apvts.addParameterListener(PARAM_MASTER, this);
    apvts.addParameterListener(PARAM_BRIGHT, this);
    apvts.addParameterListener(PARAM_RESONANCE, this);
    apvts.addParameterListener(PARAM_SAG, this);
    apvts.addParameterListener(PARAM_BIAS, this);
    apvts.addParameterListener(PARAM_AMP_TYPE, this);
    apvts.addParameterListener(PARAM_CHANNEL, this);
    apvts.addParameterListener(PARAM_OVERSAMPLE, this);
    
    // Set default amp
    activeAmp = &peavey5150;
    currentAmpType = Amps::AmpType::Peavey5150;
}

WDFAmpAudioProcessor::~WDFAmpAudioProcessor()
{
    // Remove parameter listeners
    apvts.removeParameterListener(PARAM_GAIN, this);
    apvts.removeParameterListener(PARAM_BASS, this);
    apvts.removeParameterListener(PARAM_MID, this);
    apvts.removeParameterListener(PARAM_TREBLE, this);
    apvts.removeParameterListener(PARAM_PRESENCE, this);
    apvts.removeParameterListener(PARAM_MASTER, this);
    apvts.removeParameterListener(PARAM_BRIGHT, this);
    apvts.removeParameterListener(PARAM_RESONANCE, this);
    apvts.removeParameterListener(PARAM_SAG, this);
    apvts.removeParameterListener(PARAM_BIAS, this);
    apvts.removeParameterListener(PARAM_AMP_TYPE, this);
    apvts.removeParameterListener(PARAM_CHANNEL, this);
    apvts.removeParameterListener(PARAM_OVERSAMPLE, this);
}

//==============================================================================
juce::AudioProcessorValueTreeState::ParameterLayout 
WDFAmpAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    
    // Main amp controls
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
    
    // Additional controls
    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_BRIGHT, 1}, "Bright",
        juce::NormalisableRange<float>(0.0f, 1.0f, 1.0f), 0.0f));  // Switch
    
    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RESONANCE, 1}, "Resonance",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));
    
    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_SAG, 1}, "Sag",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.3f));
    
    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_BIAS, 1}, "Bias",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 0.5f));
    
    // Amp selection
    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_AMP_TYPE, 1}, "Amp Type",
        juce::StringArray{"Peavey 5150", "Marshall 800", "Mesa Dual Rectifier"}, 0));
    
    // Channel selection
    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_CHANNEL, 1}, "Channel", false));
    
    // Oversampling
    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_OVERSAMPLE, 1}, "Oversample",
        juce::StringArray{"1x", "2x", "4x", "8x", "16x"}, 2));  // Default 4x
    
    return layout;
}

//==============================================================================
void WDFAmpAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    // Prepare all amp models
    peavey5150.prepare(sampleRate * oversampleFactor, samplesPerBlock);
    marshall800.prepare(sampleRate * oversampleFactor, samplesPerBlock);
    mesaDualRectifier.prepare(sampleRate * oversampleFactor, samplesPerBlock);
    
    // Reset oversampler
    oversampler.reset();
    
    // Reset DC blocker
    dcBlockerState[0] = dcBlockerState[1] = 0.0;
    dcBlockerOutput[0] = dcBlockerOutput[1] = 0.0;
    
    // Update parameters
    updateAmpParameters();
}

void WDFAmpAudioProcessor::releaseResources()
{
    peavey5150.reset();
    marshall800.reset();
    mesaDualRectifier.reset();
}

bool WDFAmpAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    // Support mono and stereo
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    
    // Input must match output
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
    
    return true;
}

void WDFAmpAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                         juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);
    
    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();
    auto numSamples = buffer.getNumSamples();
    
    // Clear unused output channels
    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, numSamples);
    
    if (activeAmp == nullptr)
        return;
    
    // Process each channel
    for (int channel = 0; channel < totalNumInputChannels; ++channel) {
        auto* channelData = buffer.getWritePointer(channel);
        
        for (int sample = 0; sample < numSamples; ++sample) {
            // Get input sample
            double input = static_cast<double>(channelData[sample]) * inputGain;
            
            // Process with oversampling
            double output = oversampler.processSample(input, *activeAmp);
            
            // DC blocking filter
            double dcBlocked = output - dcBlockerState[channel] + 0.9999 * dcBlockerOutput[channel];
            dcBlockerState[channel] = output;
            dcBlockerOutput[channel] = dcBlocked;
            
            // Output with gain
            channelData[sample] = static_cast<float>(dcBlocked * outputGain);
        }
    }
}

//==============================================================================
void WDFAmpAudioProcessor::parameterChanged(const juce::String& parameterID, 
                                             float newValue)
{
    if (parameterID == PARAM_AMP_TYPE) {
        setAmpType(static_cast<Amps::AmpType>(static_cast<int>(newValue)));
    }
    else if (parameterID == PARAM_OVERSAMPLE) {
        int factor = 1 << static_cast<int>(newValue);  // 1, 2, 4, 8, 16
        setOversampleFactor(factor);
    }
    else {
        updateAmpParameters();
    }
}

void WDFAmpAudioProcessor::updateAmpParameters()
{
    if (activeAmp == nullptr) return;
    
    Amps::AmpParameters params;
    params.gain = *apvts.getRawParameterValue(PARAM_GAIN);
    params.bass = *apvts.getRawParameterValue(PARAM_BASS);
    params.mid = *apvts.getRawParameterValue(PARAM_MID);
    params.treble = *apvts.getRawParameterValue(PARAM_TREBLE);
    params.presence = *apvts.getRawParameterValue(PARAM_PRESENCE);
    params.master = *apvts.getRawParameterValue(PARAM_MASTER);
    params.bright = *apvts.getRawParameterValue(PARAM_BRIGHT);
    params.resonance = *apvts.getRawParameterValue(PARAM_RESONANCE);
    params.sag = *apvts.getRawParameterValue(PARAM_SAG);
    params.bias = *apvts.getRawParameterValue(PARAM_BIAS);
    params.channel = *apvts.getRawParameterValue(PARAM_CHANNEL) > 0.5f;
    
    activeAmp->setParameters(params);
}

void WDFAmpAudioProcessor::setAmpType(Amps::AmpType type)
{
    currentAmpType = type;
    
    switch (type) {
        case Amps::AmpType::Peavey5150:
            activeAmp = &peavey5150;
            break;
        case Amps::AmpType::Marshall800:
            activeAmp = &marshall800;
            break;
        case Amps::AmpType::MesaDualRectifier:
            activeAmp = &mesaDualRectifier;
            break;
        default:
            activeAmp = &peavey5150;
    }
    
    if (activeAmp) {
        activeAmp->reset();
        updateAmpParameters();
    }
}

void WDFAmpAudioProcessor::setOversampleFactor(int factor)
{
    oversampleFactor = factor;
    oversampler.setOversampleFactor(factor);
    
    // Re-prepare amps with new sample rate
    auto sr = getSampleRate();
    if (sr > 0) {
        peavey5150.prepare(sr * factor, getBlockSize());
        marshall800.prepare(sr * factor, getBlockSize());
        mesaDualRectifier.prepare(sr * factor, getBlockSize());
    }
}

//==============================================================================
juce::AudioProcessorEditor* WDFAmpAudioProcessor::createEditor()
{
    return new WDFAmpAudioProcessorEditor(*this);
}

bool WDFAmpAudioProcessor::hasEditor() const
{
    return true;
}

//==============================================================================
const juce::String WDFAmpAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool WDFAmpAudioProcessor::acceptsMidi() const { return false; }
bool WDFAmpAudioProcessor::producesMidi() const { return false; }
bool WDFAmpAudioProcessor::isMidiEffect() const { return false; }
double WDFAmpAudioProcessor::getTailLengthSeconds() const { return 0.0; }

//==============================================================================
int WDFAmpAudioProcessor::getNumPrograms() { return 1; }
int WDFAmpAudioProcessor::getCurrentProgram() { return 0; }
void WDFAmpAudioProcessor::setCurrentProgram(int) {}
const juce::String WDFAmpAudioProcessor::getProgramName(int) { return {}; }
void WDFAmpAudioProcessor::changeProgramName(int, const juce::String&) {}

//==============================================================================
void WDFAmpAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void WDFAmpAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr) {
        if (xmlState->hasTagName(apvts.state.getType())) {
            apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
            updateAmpParameters();
        }
    }
}

//==============================================================================
// Plugin instantiation
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new WDFAmpAudioProcessor();
}
