#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace {
juce::String bandParamId(int bandIndex, const char* suffix)
{
    return "band" + juce::String(bandIndex + 1) + suffix;
}
} // namespace

FilterAudioProcessor::FilterAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    for (int i = 0; i < map2::FilterProcessor::MAX_BANDS; ++i) {
        apvts.addParameterListener(bandParamId(i, "_freq"), this);
        apvts.addParameterListener(bandParamId(i, "_gain"), this);
        apvts.addParameterListener(bandParamId(i, "_q"), this);
        apvts.addParameterListener(bandParamId(i, "_type"), this);
        apvts.addParameterListener(bandParamId(i, "_enabled"), this);
    }

    apvts.addParameterListener(PARAM_OUTPUT_GAIN, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
}

FilterAudioProcessor::~FilterAudioProcessor()
{
    for (int i = 0; i < map2::FilterProcessor::MAX_BANDS; ++i) {
        apvts.removeParameterListener(bandParamId(i, "_freq"), this);
        apvts.removeParameterListener(bandParamId(i, "_gain"), this);
        apvts.removeParameterListener(bandParamId(i, "_q"), this);
        apvts.removeParameterListener(bandParamId(i, "_type"), this);
        apvts.removeParameterListener(bandParamId(i, "_enabled"), this);
    }

    apvts.removeParameterListener(PARAM_OUTPUT_GAIN, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout FilterAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    static constexpr float defaultFrequencies[map2::FilterProcessor::MAX_BANDS] = {
        80.0f, 160.0f, 320.0f, 640.0f, 1280.0f, 2560.0f, 5120.0f, 10240.0f
    };

    const juce::StringArray typeChoices{
        "Low Pass", "High Pass", "Band Pass", "Notch",
        "Peak", "Low Shelf", "High Shelf", "All Pass"
    };

    for (int i = 0; i < map2::FilterProcessor::MAX_BANDS; ++i) {
        layout.add(std::make_unique<juce::AudioParameterFloat>(
            juce::ParameterID{bandParamId(i, "_freq"), 1},
            "Band " + juce::String(i + 1) + " Frequency",
            juce::NormalisableRange<float>(20.0f, 20000.0f, 1.0f, 0.35f),
            defaultFrequencies[i]));

        layout.add(std::make_unique<juce::AudioParameterFloat>(
            juce::ParameterID{bandParamId(i, "_gain"), 1},
            "Band " + juce::String(i + 1) + " Gain",
            juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f),
            0.0f));

        layout.add(std::make_unique<juce::AudioParameterFloat>(
            juce::ParameterID{bandParamId(i, "_q"), 1},
            "Band " + juce::String(i + 1) + " Q",
            juce::NormalisableRange<float>(0.1f, 10.0f, 0.01f, 0.4f),
            1.0f));

        layout.add(std::make_unique<juce::AudioParameterChoice>(
            juce::ParameterID{bandParamId(i, "_type"), 1},
            "Band " + juce::String(i + 1) + " Type",
            typeChoices,
            static_cast<int>(map2::FilterProcessor::FilterType::Peak)));

        layout.add(std::make_unique<juce::AudioParameterBool>(
            juce::ParameterID{bandParamId(i, "_enabled"), 1},
            "Band " + juce::String(i + 1) + " Enabled",
            true));
    }

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_OUTPUT_GAIN, 1}, "Output Gain",
        juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_BYPASS, 1}, "Bypass", false));

    return layout;
}

void FilterAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    filter.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    filter.reset();
    updateProcessorParameters();
}

void FilterAudioProcessor::releaseResources()
{
    filter.reset();
}

bool FilterAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void FilterAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    filter.process(buffer);
}

void FilterAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    updateProcessorParameters();
}

void FilterAudioProcessor::updateProcessorParameters()
{
    for (int i = 0; i < map2::FilterProcessor::MAX_BANDS; ++i) {
        map2::FilterProcessor::BandParameters band;
        band.frequency = *apvts.getRawParameterValue(bandParamId(i, "_freq"));
        band.gain = *apvts.getRawParameterValue(bandParamId(i, "_gain"));
        band.q = *apvts.getRawParameterValue(bandParamId(i, "_q"));

        auto typeValue = juce::roundToInt(apvts.getRawParameterValue(bandParamId(i, "_type"))->load());
        typeValue = juce::jlimit(0, 7, typeValue);
        band.type = static_cast<map2::FilterProcessor::FilterType>(typeValue);

        band.enabled = *apvts.getRawParameterValue(bandParamId(i, "_enabled")) > 0.5f;
        filter.setBand(i, band);
    }

    filter.setOutputGain(*apvts.getRawParameterValue(PARAM_OUTPUT_GAIN));
    filter.setBypass(*apvts.getRawParameterValue(PARAM_BYPASS) > 0.5f);
}

juce::AudioProcessorEditor* FilterAudioProcessor::createEditor()
{
    return new FilterAudioProcessorEditor(*this);
}

bool FilterAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String FilterAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void FilterAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void FilterAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateProcessorParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new FilterAudioProcessor();
}
