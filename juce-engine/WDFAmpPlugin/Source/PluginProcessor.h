#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "Amps/AmpModel.h"
#include "Amps/Peavey5150.h"
#include "Amps/Marshall800.h"
#include "Amps/MesaDualRectifier.h"
#include "DSP/Oversampler.h"

//==============================================================================
// WDF Amp Audio Processor - Main plugin processor
//==============================================================================
class WDFAmpAudioProcessor : public juce::AudioProcessor,
                              public juce::AudioProcessorValueTreeState::Listener {
public:
    //--------------------------------------------------------------------------
    WDFAmpAudioProcessor();
    ~WDFAmpAudioProcessor() override;

    //--------------------------------------------------------------------------
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //--------------------------------------------------------------------------
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    //--------------------------------------------------------------------------
    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    //--------------------------------------------------------------------------
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    //--------------------------------------------------------------------------
    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    //--------------------------------------------------------------------------
    // Parameter listener callback
    void parameterChanged(const juce::String& parameterID, float newValue) override;
    
    //--------------------------------------------------------------------------
    // Amp control
    void setAmpType(Amps::AmpType type);
    Amps::AmpType getAmpType() const { return currentAmpType; }
    Amps::AmpModel* getCurrentAmp() { return activeAmp; }
    
    //--------------------------------------------------------------------------
    // Oversampling control
    void setOversampleFactor(int factor);
    int getOversampleFactor() const { return oversampleFactor; }
    
    //--------------------------------------------------------------------------
    // Parameter tree state for automation and presets
    juce::AudioProcessorValueTreeState& getAPVTS() { return apvts; }
    
    //--------------------------------------------------------------------------
    // Parameter IDs
    static constexpr const char* PARAM_GAIN = "gain";
    static constexpr const char* PARAM_BASS = "bass";
    static constexpr const char* PARAM_MID = "mid";
    static constexpr const char* PARAM_TREBLE = "treble";
    static constexpr const char* PARAM_PRESENCE = "presence";
    static constexpr const char* PARAM_MASTER = "master";
    static constexpr const char* PARAM_BRIGHT = "bright";
    static constexpr const char* PARAM_RESONANCE = "resonance";
    static constexpr const char* PARAM_SAG = "sag";
    static constexpr const char* PARAM_BIAS = "bias";
    static constexpr const char* PARAM_AMP_TYPE = "ampType";
    static constexpr const char* PARAM_CHANNEL = "channel";
    static constexpr const char* PARAM_OVERSAMPLE = "oversample";
    
private:
    //--------------------------------------------------------------------------
    // Create parameter layout
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    
    // Update amp parameters from APVTS
    void updateAmpParameters();
    
    //--------------------------------------------------------------------------
    // Amp models
    Amps::Peavey5150 peavey5150;
    Amps::Marshall800 marshall800;
    Amps::MesaDualRectifier mesaDualRectifier;
    
    Amps::AmpModel* activeAmp = nullptr;
    Amps::AmpType currentAmpType = Amps::AmpType::Peavey5150;
    
    //--------------------------------------------------------------------------
    // DSP components
    DSP::Oversampler oversampler{4};
    int oversampleFactor = 4;
    
    // Input/output gain
    float inputGain = 1.0f;
    float outputGain = 1.0f;
    
    // DC blocker
    double dcBlockerState[2] = {0.0, 0.0};
    double dcBlockerOutput[2] = {0.0, 0.0};
    
    //--------------------------------------------------------------------------
    // Parameter value tree state
    juce::AudioProcessorValueTreeState apvts;
    
    //--------------------------------------------------------------------------
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WDFAmpAudioProcessor)
};
