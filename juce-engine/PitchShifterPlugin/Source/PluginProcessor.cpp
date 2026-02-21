#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto P_PITCH_L = "pitchL";
constexpr auto P_PITCH_R = "pitchR";
constexpr auto P_DELAY_L = "delayL";
constexpr auto P_DELAY_R = "delayR";
constexpr auto P_FEEDBACK = "feedback";
constexpr auto P_MIX = "mix";
constexpr auto P_SPREAD = "spread";
constexpr auto P_PRESET = "preset";
constexpr auto P_BYPASS = "bypass";
}

PitchShifterAudioProcessor::PitchShifterAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {P_PITCH_L, P_PITCH_R, P_DELAY_L, P_DELAY_R, P_FEEDBACK,
                         P_MIX, P_SPREAD, P_PRESET, P_BYPASS};
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

PitchShifterAudioProcessor::~PitchShifterAudioProcessor() = default;

void PitchShifterAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
}

void PitchShifterAudioProcessor::releaseResources()
{
    processor.reset();
}

bool PitchShifterAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void PitchShifterAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* PitchShifterAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool PitchShifterAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String PitchShifterAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void PitchShifterAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void PitchShifterAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new PitchShifterAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout PitchShifterAudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PITCH_L, "Pitch L (cents)", R(-100.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PITCH_R, "Pitch R (cents)", R(-100.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DELAY_L, "Delay L (ms)", R(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DELAY_R, "Delay R (ms)", R(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_FEEDBACK, "Feedback", R(0.0f, 0.9f, 0.001f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MIX, "Mix (%)", R(0.0f, 100.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_SPREAD, "Spread (%)", R(0.0f, 200.0f, 0.1f), 100.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_PRESET, "Preset", []{
        juce::StringArray arr;
        for (int i = 0; i < static_cast<int>(map2::PitchShifterProcessor::Preset::NumPresets); ++i)
            arr.add(map2::PitchShifterProcessor::getPresetInfo(static_cast<map2::PitchShifterProcessor::Preset>(i)).name);
        return arr;
    }(), 0));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void PitchShifterAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void PitchShifterAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();
    if (auto* v = apvts.getRawParameterValue(P_PITCH_L)) params.pitchL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_PITCH_R)) params.pitchR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DELAY_L)) params.delayL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DELAY_R)) params.delayR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_FEEDBACK)) params.feedback = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MIX)) params.mix = v->load();
    if (auto* v = apvts.getRawParameterValue(P_SPREAD)) params.spread = v->load();
    if (auto* v = apvts.getRawParameterValue(P_PRESET))
        params.preset = static_cast<map2::PitchShifterProcessor::Preset>((int)v->load());
    if (auto* v = apvts.getRawParameterValue(P_BYPASS)) params.bypass = v->load() > 0.5f;
    processor.setParameters(params);
}
