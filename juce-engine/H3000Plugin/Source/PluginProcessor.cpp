#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto P_ALGO   = "algorithm";
constexpr auto P_PITCH_L = "pitchL";
constexpr auto P_PITCH_R = "pitchR";
constexpr auto P_PITCH_FINE = "pitchFine";
constexpr auto P_DELAY_L = "delayL";
constexpr auto P_DELAY_R = "delayR";
constexpr auto P_DELAY_LINK = "delayLink";
constexpr auto P_FEEDBACK = "feedback";
constexpr auto P_XFEEDBACK = "crossFeedback";
constexpr auto P_MOD_DEPTH = "modDepth";
constexpr auto P_MOD_RATE  = "modRate";
constexpr auto P_MOD_WAVE  = "modWaveform";
constexpr auto P_LOW_CUT   = "lowCut";
constexpr auto P_HIGH_CUT  = "highCut";
constexpr auto P_MIX       = "mix";
constexpr auto P_LEVEL_L   = "levelL";
constexpr auto P_LEVEL_R   = "levelR";
constexpr auto P_BYPASS    = "bypass";
constexpr auto P_GLIDE     = "glide";
}

H3000AudioProcessor::H3000AudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    const char* ids[] = {P_ALGO, P_PITCH_L, P_PITCH_R, P_PITCH_FINE, P_DELAY_L, P_DELAY_R, P_DELAY_LINK,
                         P_FEEDBACK, P_XFEEDBACK, P_MOD_DEPTH, P_MOD_RATE, P_MOD_WAVE,
                         P_LOW_CUT, P_HIGH_CUT, P_MIX, P_LEVEL_L, P_LEVEL_R, P_BYPASS, P_GLIDE};
    for (auto* id : ids) apvts.addParameterListener(id, this);
    syncParameters();
}

H3000AudioProcessor::~H3000AudioProcessor() = default;

void H3000AudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
}

void H3000AudioProcessor::releaseResources()
{
    processor.reset();
}

bool H3000AudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void H3000AudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* H3000AudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool H3000AudioProcessor::hasEditor() const
{
    return true;
}

const juce::String H3000AudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void H3000AudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void H3000AudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new H3000AudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout H3000AudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    juce::StringArray algos;
    for (int i = 0; i < map2::H3000Processor::getNumAlgorithms(); ++i)
        algos.add(map2::H3000Processor::getAlgorithmInfo(i).name);

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_ALGO, "Algorithm", algos, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PITCH_L, "Pitch L (cents)", R(-2400.f, 2400.f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PITCH_R, "Pitch R (cents)", R(-2400.f, 2400.f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PITCH_FINE, "Pitch Fine (cents)", R(-100.f, 100.f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DELAY_L, "Delay L (ms)", R(0.0f, 1000.0f, 0.1f), 15.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DELAY_R, "Delay R (ms)", R(0.0f, 1000.0f, 0.1f), 20.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_DELAY_LINK, "Delay Link", true));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_FEEDBACK, "Feedback (%)", R(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_XFEEDBACK, "Cross Feedback (%)", R(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MOD_DEPTH, "Mod Depth (%)", R(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MOD_RATE, "Mod Rate (Hz)", R(0.1f, 10.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_MOD_WAVE, "Mod Waveform", juce::StringArray{"Sine","Tri","Random"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LOW_CUT, "Low Cut (Hz)", R(20.0f, 500.0f, 0.1f), 80.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HIGH_CUT, "High Cut (Hz)", R(2000.0f, 20000.0f, 1.0f), 12000.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MIX, "Mix (%)", R(0.0f, 100.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LEVEL_L, "Level L (%)", R(0.0f, 100.0f, 0.1f), 100.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_LEVEL_R, "Level R (%)", R(0.0f, 100.0f, 0.1f), 100.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_GLIDE, "Glide (ms)", R(0.0f, 1000.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void H3000AudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void H3000AudioProcessor::syncParameters()
{
    auto params = processor.getParameters();
    if (auto* v = apvts.getRawParameterValue(P_ALGO)) params.algorithm = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P_PITCH_L)) params.pitchL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_PITCH_R)) params.pitchR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_PITCH_FINE)) params.pitchFine = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DELAY_L)) params.delayL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DELAY_R)) params.delayR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DELAY_LINK)) params.delayLink = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P_FEEDBACK)) params.feedback = v->load();
    if (auto* v = apvts.getRawParameterValue(P_XFEEDBACK)) params.crossFeedback = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MOD_DEPTH)) params.modDepth = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MOD_RATE)) params.modRate = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MOD_WAVE)) params.modWaveform = (int)v->load();
    if (auto* v = apvts.getRawParameterValue(P_LOW_CUT)) params.lowCut = v->load();
    if (auto* v = apvts.getRawParameterValue(P_HIGH_CUT)) params.highCut = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MIX)) params.mix = v->load();
    if (auto* v = apvts.getRawParameterValue(P_LEVEL_L)) params.levelL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_LEVEL_R)) params.levelR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_GLIDE)) params.glide = v->load();
    if (auto* v = apvts.getRawParameterValue(P_BYPASS)) params.bypass = v->load() > 0.5f;

    processor.setParameters(params);
}
