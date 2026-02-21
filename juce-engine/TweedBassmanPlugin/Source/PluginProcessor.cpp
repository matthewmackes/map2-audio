#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <string>

namespace
{
constexpr auto P_CHANNEL_MODE   = "channelMode";
constexpr auto P_NORMAL_VOL     = "normalVolume";
constexpr auto P_BRIGHT_VOL     = "brightVolume";
constexpr auto P_BRIGHT_CAP     = "brightCap";

constexpr auto P_V1_TUBE        = "v1TubeType";
constexpr auto P_CATHODE_BYPASS = "cathodeBypass";
constexpr auto P_CATHODE_BIAS   = "cathodeBias";

constexpr auto P_TREBLE         = "treble";
constexpr auto P_MID            = "mid";
constexpr auto P_BASS           = "bass";
constexpr auto P_RAW_SWITCH     = "rawSwitch";

constexpr auto P_MASTER_VOL     = "masterVolume";

constexpr auto P_PRESENCE       = "presence";
constexpr auto P_NFB_MODE       = "nfbMode";
constexpr auto P_POWER_TUBE     = "powerTubeType";
constexpr auto P_BIAS_MODE      = "biasMode";
constexpr auto P_RECTIFIER      = "rectifierType";

constexpr auto P_OUTPUT_LEVEL   = "outputLevel";
constexpr auto P_CAB_ENABLED    = "cabinetEnabled";
constexpr auto P_CAB_IR         = "cabinetIR";

constexpr auto P_PRESET         = "preset";
constexpr auto P_BYPASS         = "bypass";
}

TweedBassmanAudioProcessor::TweedBassmanAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(P_CHANNEL_MODE, this);
    apvts.addParameterListener(P_NORMAL_VOL, this);
    apvts.addParameterListener(P_BRIGHT_VOL, this);
    apvts.addParameterListener(P_BRIGHT_CAP, this);
    apvts.addParameterListener(P_V1_TUBE, this);
    apvts.addParameterListener(P_CATHODE_BYPASS, this);
    apvts.addParameterListener(P_CATHODE_BIAS, this);
    apvts.addParameterListener(P_TREBLE, this);
    apvts.addParameterListener(P_MID, this);
    apvts.addParameterListener(P_BASS, this);
    apvts.addParameterListener(P_RAW_SWITCH, this);
    apvts.addParameterListener(P_MASTER_VOL, this);
    apvts.addParameterListener(P_PRESENCE, this);
    apvts.addParameterListener(P_NFB_MODE, this);
    apvts.addParameterListener(P_POWER_TUBE, this);
    apvts.addParameterListener(P_BIAS_MODE, this);
    apvts.addParameterListener(P_RECTIFIER, this);
    apvts.addParameterListener(P_OUTPUT_LEVEL, this);
    apvts.addParameterListener(P_CAB_ENABLED, this);
    apvts.addParameterListener(P_CAB_IR, this);
    apvts.addParameterListener(P_PRESET, this);
    apvts.addParameterListener(P_BYPASS, this);
    syncParameters();
}

TweedBassmanAudioProcessor::~TweedBassmanAudioProcessor()
{
    apvts.removeParameterListener(P_CHANNEL_MODE, this);
    apvts.removeParameterListener(P_NORMAL_VOL, this);
    apvts.removeParameterListener(P_BRIGHT_VOL, this);
    apvts.removeParameterListener(P_BRIGHT_CAP, this);
    apvts.removeParameterListener(P_V1_TUBE, this);
    apvts.removeParameterListener(P_CATHODE_BYPASS, this);
    apvts.removeParameterListener(P_CATHODE_BIAS, this);
    apvts.removeParameterListener(P_TREBLE, this);
    apvts.removeParameterListener(P_MID, this);
    apvts.removeParameterListener(P_BASS, this);
    apvts.removeParameterListener(P_RAW_SWITCH, this);
    apvts.removeParameterListener(P_MASTER_VOL, this);
    apvts.removeParameterListener(P_PRESENCE, this);
    apvts.removeParameterListener(P_NFB_MODE, this);
    apvts.removeParameterListener(P_POWER_TUBE, this);
    apvts.removeParameterListener(P_BIAS_MODE, this);
    apvts.removeParameterListener(P_RECTIFIER, this);
    apvts.removeParameterListener(P_OUTPUT_LEVEL, this);
    apvts.removeParameterListener(P_CAB_ENABLED, this);
    apvts.removeParameterListener(P_CAB_IR, this);
    apvts.removeParameterListener(P_PRESET, this);
    apvts.removeParameterListener(P_BYPASS, this);
}

void TweedBassmanAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
}

void TweedBassmanAudioProcessor::releaseResources()
{
    processor.reset();
}

bool TweedBassmanAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void TweedBassmanAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* TweedBassmanAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool TweedBassmanAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String TweedBassmanAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void TweedBassmanAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void TweedBassmanAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, (size_t) sizeInBytes);
    if (state.isValid())
    {
        apvts.replaceState(state);
        syncParameters();
    }
}

void TweedBassmanAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

juce::AudioProcessorValueTreeState::ParameterLayout TweedBassmanAudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_CHANNEL_MODE, "Channel Mode",
        juce::StringArray{"Normal", "Bright", "Jumped"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_NORMAL_VOL, "Normal Volume", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BRIGHT_VOL, "Bright Volume", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BRIGHT_CAP, "Bright Cap", true));

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_V1_TUBE, "V1 Tube",
        juce::StringArray{"12AY7", "12AX7", "5751", "12AT7"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_CATHODE_BYPASS, "Cathode Bypass", false));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_CATHODE_BIAS, "Cathode Bias",
        juce::StringArray{"Hot (820Ω)", "Normal (1.5kΩ)", "Cool (2.7kΩ)"}, 0));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_TREBLE, "Treble", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MID, "Mid", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_BASS, "Bass", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_RAW_SWITCH, "Raw Switch", false));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_MASTER_VOL, "Master Volume", R(0.0f, 10.0f, 0.01f), 5.0f));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_PRESENCE, "Presence", R(0.0f, 10.0f, 0.01f), 5.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_NFB_MODE, "NFB Mode",
        juce::StringArray{"Stock (27k)", "None", "High (10k)"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_POWER_TUBE, "Power Tube",
        juce::StringArray{"6L6", "6V6", "EL34", "KT66"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_BIAS_MODE, "Bias Mode",
        juce::StringArray{"Fixed", "Cathode"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_RECTIFIER, "Rectifier",
        juce::StringArray{"GZ34", "5U4G", "5Y3", "Solid State"}, 0));

    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_OUTPUT_LEVEL, "Output Level (dB)", R(-24.0f, 6.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_CAB_ENABLED, "Cabinet Enabled", true));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_CAB_IR, "Cabinet IR",
        juce::StringArray{"SM57", "Ribbon", "Room"}, 0));

    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(P_PRESET, "Preset",
        juce::StringArray{
            "Manual", "Stock 5F6A", "Cranked Tweed", "Blues Breakup", "Country Clean", "Jumped Dirty",
            "High Gain Mod", "Neil Young", "Tweed Deluxe", "JTM45 Flavor", "Sag Monster", "Pedal Platform",
            "Bright Chimey", "SRV Tone", "Recording DI"
        }, 0));

    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));

    return {params.begin(), params.end()};
}

void TweedBassmanAudioProcessor::syncParameters()
{
    auto p = processor.getParameters();

    if (auto* v = apvts.getRawParameterValue(P_CHANNEL_MODE))   p.channelMode   = (int) v->load();
    if (auto* v = apvts.getRawParameterValue(P_NORMAL_VOL))     p.normalVolume  = v->load();
    if (auto* v = apvts.getRawParameterValue(P_BRIGHT_VOL))     p.brightVolume  = v->load();
    if (auto* v = apvts.getRawParameterValue(P_BRIGHT_CAP))     p.brightCap     = v->load() > 0.5f;

    if (auto* v = apvts.getRawParameterValue(P_V1_TUBE))        p.v1TubeType    = (int) v->load();
    if (auto* v = apvts.getRawParameterValue(P_CATHODE_BYPASS)) p.cathodeBypass = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P_CATHODE_BIAS))   p.cathodeBias   = (int) v->load();

    if (auto* v = apvts.getRawParameterValue(P_TREBLE))         p.treble        = v->load();
    if (auto* v = apvts.getRawParameterValue(P_MID))            p.mid           = v->load();
    if (auto* v = apvts.getRawParameterValue(P_BASS))           p.bass          = v->load();
    if (auto* v = apvts.getRawParameterValue(P_RAW_SWITCH))     p.rawSwitch     = v->load() > 0.5f;

    if (auto* v = apvts.getRawParameterValue(P_MASTER_VOL))     p.masterVolume  = v->load();

    if (auto* v = apvts.getRawParameterValue(P_PRESENCE))       p.presence      = v->load();
    if (auto* v = apvts.getRawParameterValue(P_NFB_MODE))       p.nfbMode       = (int) v->load();
    if (auto* v = apvts.getRawParameterValue(P_POWER_TUBE))     p.powerTubeType = (int) v->load();
    if (auto* v = apvts.getRawParameterValue(P_BIAS_MODE))      p.biasMode      = (int) v->load();
    if (auto* v = apvts.getRawParameterValue(P_RECTIFIER))      p.rectifierType = (int) v->load();

    if (auto* v = apvts.getRawParameterValue(P_OUTPUT_LEVEL))   p.outputLevel   = v->load();
    if (auto* v = apvts.getRawParameterValue(P_CAB_ENABLED))    p.cabinetEnabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P_CAB_IR))         p.cabinetIR     = (int) v->load();

    if (auto* v = apvts.getRawParameterValue(P_PRESET))         p.preset        = static_cast<map2::TweedBassmanProcessor::Preset>((int) v->load());
    if (auto* v = apvts.getRawParameterValue(P_BYPASS))         p.bypass        = v->load() > 0.5f;

    processor.setParameters(p);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new TweedBassmanAudioProcessor();
}
