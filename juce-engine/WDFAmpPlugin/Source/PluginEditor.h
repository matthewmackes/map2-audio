#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include "PluginProcessor.h"
#include "UI/AmpKnob.h"
#include "UI/AmpSelector.h"

//==============================================================================
// WDF Amp Plugin Editor - Main UI
//==============================================================================
class WDFAmpAudioProcessorEditor : public juce::AudioProcessorEditor {
public:
    explicit WDFAmpAudioProcessorEditor(WDFAmpAudioProcessor&);
    ~WDFAmpAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    // Processor reference
    WDFAmpAudioProcessor& audioProcessor;
    
    // Amp selector
    UI::AmpSelector ampSelector;
    
    // Main amp controls
    UI::AmpKnob gainKnob{"Gain", UI::AmpKnob::KnobStyle::LED};
    UI::AmpKnob bassKnob{"Bass", UI::AmpKnob::KnobStyle::Modern};
    UI::AmpKnob midKnob{"Mid", UI::AmpKnob::KnobStyle::Modern};
    UI::AmpKnob trebleKnob{"Treble", UI::AmpKnob::KnobStyle::Modern};
    UI::AmpKnob presenceKnob{"Presence", UI::AmpKnob::KnobStyle::Modern};
    UI::AmpKnob masterKnob{"Master", UI::AmpKnob::KnobStyle::LED};
    
    // Additional controls
    UI::AmpKnob resonanceKnob{"Resonance", UI::AmpKnob::KnobStyle::Vintage};
    UI::AmpKnob sagKnob{"Sag", UI::AmpKnob::KnobStyle::Vintage};
    UI::AmpKnob biasKnob{"Bias", UI::AmpKnob::KnobStyle::Vintage};
    
    // Switches
    juce::ToggleButton brightSwitch{"Bright"};
    juce::ToggleButton channelSwitch{"Lead"};
    
    // Oversampling selector
    juce::ComboBox oversampleCombo;
    juce::Label oversampleLabel{"", "Oversample:"};
    
    // Labels
    juce::Label titleLabel{"", "WDF Amp Simulator"};
    juce::Label ampNameLabel{"", "Peavey 5150"};
    
    // Parameter attachments
    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    using ComboAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;
    
    std::unique_ptr<SliderAttachment> gainAttachment;
    std::unique_ptr<SliderAttachment> bassAttachment;
    std::unique_ptr<SliderAttachment> midAttachment;
    std::unique_ptr<SliderAttachment> trebleAttachment;
    std::unique_ptr<SliderAttachment> presenceAttachment;
    std::unique_ptr<SliderAttachment> masterAttachment;
    std::unique_ptr<SliderAttachment> resonanceAttachment;
    std::unique_ptr<SliderAttachment> sagAttachment;
    std::unique_ptr<SliderAttachment> biasAttachment;
    std::unique_ptr<ButtonAttachment> brightAttachment;
    std::unique_ptr<ButtonAttachment> channelAttachment;
    std::unique_ptr<ComboAttachment> oversampleAttachment;
    
    // Background image (optional)
    juce::Image backgroundImage;
    
    // Helper to setup knobs
    void setupKnob(UI::AmpKnob& knob);
    
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WDFAmpAudioProcessorEditor)
};
