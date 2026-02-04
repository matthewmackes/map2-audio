#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
WDFAmpAudioProcessorEditor::WDFAmpAudioProcessorEditor(WDFAmpAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    // Set window size
    setSize(800, 500);
    setResizable(true, true);
    setResizeLimits(600, 400, 1200, 800);
    
    // Amp selector
    addAndMakeVisible(ampSelector);
    ampSelector.onAmpChanged = [this](Amps::AmpType type) {
        audioProcessor.getAPVTS().getParameter(WDFAmpAudioProcessor::PARAM_AMP_TYPE)
            ->setValueNotifyingHost(static_cast<float>(type) / 
                static_cast<float>(static_cast<int>(Amps::AmpType::NumAmpTypes) - 1));
        
        // Update amp name label
        switch (type) {
            case Amps::AmpType::Peavey5150:
                ampNameLabel.setText("Peavey 5150", juce::dontSendNotification);
                break;
            case Amps::AmpType::Marshall800:
                ampNameLabel.setText("Marshall JCM800", juce::dontSendNotification);
                break;
            case Amps::AmpType::MesaDualRectifier:
                ampNameLabel.setText("Mesa Dual Rectifier", juce::dontSendNotification);
                break;
            default:
                break;
        }
    };
    
    // Setup knobs
    setupKnob(gainKnob);
    setupKnob(bassKnob);
    setupKnob(midKnob);
    setupKnob(trebleKnob);
    setupKnob(presenceKnob);
    setupKnob(masterKnob);
    setupKnob(resonanceKnob);
    setupKnob(sagKnob);
    setupKnob(biasKnob);
    
    // Set knob colors
    gainKnob.setIndicatorColor(juce::Colours::red);
    masterKnob.setIndicatorColor(juce::Colours::limegreen);
    
    // Parameter attachments
    auto& apvts = audioProcessor.getAPVTS();
    
    gainAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_GAIN, gainKnob);
    bassAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_BASS, bassKnob);
    midAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_MID, midKnob);
    trebleAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_TREBLE, trebleKnob);
    presenceAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_PRESENCE, presenceKnob);
    masterAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_MASTER, masterKnob);
    resonanceAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_RESONANCE, resonanceKnob);
    sagAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_SAG, sagKnob);
    biasAttachment = std::make_unique<SliderAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_BIAS, biasKnob);
    
    // Switches
    addAndMakeVisible(brightSwitch);
    addAndMakeVisible(channelSwitch);
    
    brightSwitch.setColour(juce::ToggleButton::textColourId, juce::Colours::white);
    channelSwitch.setColour(juce::ToggleButton::textColourId, juce::Colours::white);
    
    brightAttachment = std::make_unique<ButtonAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_BRIGHT, brightSwitch);
    channelAttachment = std::make_unique<ButtonAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_CHANNEL, channelSwitch);
    
    // Oversample combo
    addAndMakeVisible(oversampleCombo);
    addAndMakeVisible(oversampleLabel);
    
    oversampleCombo.addItemList({"1x", "2x", "4x", "8x", "16x"}, 1);
    oversampleLabel.setColour(juce::Label::textColourId, juce::Colours::white);
    oversampleLabel.setJustificationType(juce::Justification::centredRight);
    
    oversampleAttachment = std::make_unique<ComboAttachment>(
        apvts, WDFAmpAudioProcessor::PARAM_OVERSAMPLE, oversampleCombo);
    
    // Labels
    addAndMakeVisible(titleLabel);
    addAndMakeVisible(ampNameLabel);
    
    titleLabel.setFont(juce::Font(24.0f, juce::Font::bold));
    titleLabel.setColour(juce::Label::textColourId, juce::Colours::white);
    titleLabel.setJustificationType(juce::Justification::centred);
    
    ampNameLabel.setFont(juce::Font(18.0f, juce::Font::italic));
    ampNameLabel.setColour(juce::Label::textColourId, juce::Colours::orange);
    ampNameLabel.setJustificationType(juce::Justification::centred);
}

WDFAmpAudioProcessorEditor::~WDFAmpAudioProcessorEditor()
{
}

//==============================================================================
void WDFAmpAudioProcessorEditor::setupKnob(UI::AmpKnob& knob)
{
    addAndMakeVisible(knob);
    knob.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 18);
    knob.setColour(juce::Slider::textBoxTextColourId, juce::Colours::white);
    knob.setColour(juce::Slider::textBoxBackgroundColourId, juce::Colour(0xff202020));
    knob.setColour(juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
}

//==============================================================================
void WDFAmpAudioProcessorEditor::paint(juce::Graphics& g)
{
    // Background gradient
    juce::ColourGradient gradient(
        juce::Colour(0xff1a1a2e), 0.0f, 0.0f,
        juce::Colour(0xff0f0f1a), 0.0f, static_cast<float>(getHeight()), false);
    g.setGradientFill(gradient);
    g.fillAll();
    
    // Top panel (amp selector area)
    auto topPanel = getLocalBounds().removeFromTop(100);
    g.setColour(juce::Colour(0xff252535));
    g.fillRect(topPanel);
    
    // Control panel background
    auto controlPanel = getLocalBounds().reduced(10).withTrimmedTop(110);
    g.setColour(juce::Colour(0xff303040));
    g.fillRoundedRectangle(controlPanel.toFloat(), 10.0f);
    
    // Control panel border
    g.setColour(juce::Colour(0xff505060));
    g.drawRoundedRectangle(controlPanel.toFloat(), 10.0f, 2.0f);
    
    // Section dividers
    g.setColour(juce::Colour(0xff404050));
    
    // Amp visualization area (simulated grill cloth)
    auto grillArea = controlPanel.removeFromTop(80).reduced(20, 10);
    g.setColour(juce::Colour(0xff1a1a1a));
    g.fillRoundedRectangle(grillArea.toFloat(), 5.0f);
    
    // Grill cloth pattern
    g.setColour(juce::Colour(0xff252525));
    for (int y = grillArea.getY(); y < grillArea.getBottom(); y += 4) {
        for (int x = grillArea.getX(); x < grillArea.getRight(); x += 4) {
            g.fillEllipse(static_cast<float>(x), static_cast<float>(y), 2.0f, 2.0f);
        }
    }
    
    // Knob section labels
    g.setColour(juce::Colours::grey);
    g.setFont(10.0f);
    
    auto knobSection = getLocalBounds().reduced(10).withTrimmedTop(200);
    auto mainKnobArea = knobSection.removeFromTop(120);
    
    // Draw section separators
    g.setColour(juce::Colour(0xff404050));
    g.drawLine(static_cast<float>(mainKnobArea.getX() + 140), 
               static_cast<float>(mainKnobArea.getY()),
               static_cast<float>(mainKnobArea.getX() + 140), 
               static_cast<float>(mainKnobArea.getBottom()), 1.0f);
    
    g.drawLine(static_cast<float>(mainKnobArea.getRight() - 140), 
               static_cast<float>(mainKnobArea.getY()),
               static_cast<float>(mainKnobArea.getRight() - 140), 
               static_cast<float>(mainKnobArea.getBottom()), 1.0f);
}

void WDFAmpAudioProcessorEditor::resized()
{
    auto bounds = getLocalBounds();
    
    // Title area
    auto titleArea = bounds.removeFromTop(35);
    titleLabel.setBounds(titleArea);
    
    // Amp name
    auto ampNameArea = bounds.removeFromTop(25);
    ampNameLabel.setBounds(ampNameArea);
    
    // Amp selector
    auto selectorArea = bounds.removeFromTop(80).reduced(50, 5);
    ampSelector.setBounds(selectorArea);
    
    // Skip grill area
    bounds.removeFromTop(90);
    
    // Main control area
    auto controlArea = bounds.reduced(20, 10);
    
    // Main knobs row (Gain, Bass, Mid, Treble, Presence, Master)
    auto mainKnobArea = controlArea.removeFromTop(120);
    int knobWidth = mainKnobArea.getWidth() / 6;
    
    gainKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    bassKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    midKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    trebleKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    presenceKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    masterKnob.setBounds(mainKnobArea.removeFromLeft(knobWidth).reduced(5));
    
    // Spacing
    controlArea.removeFromTop(10);
    
    // Secondary controls row
    auto secondaryArea = controlArea.removeFromTop(100);
    int secondaryKnobWidth = secondaryArea.getWidth() / 5;
    
    // Switches on left
    auto switchArea = secondaryArea.removeFromLeft(secondaryKnobWidth);
    brightSwitch.setBounds(switchArea.removeFromTop(40).reduced(10, 5));
    channelSwitch.setBounds(switchArea.removeFromTop(40).reduced(10, 5));
    
    // Secondary knobs
    resonanceKnob.setBounds(secondaryArea.removeFromLeft(secondaryKnobWidth).reduced(5));
    sagKnob.setBounds(secondaryArea.removeFromLeft(secondaryKnobWidth).reduced(5));
    biasKnob.setBounds(secondaryArea.removeFromLeft(secondaryKnobWidth).reduced(5));
    
    // Oversample on right
    auto oversampleArea = secondaryArea.removeFromRight(secondaryKnobWidth);
    oversampleLabel.setBounds(oversampleArea.removeFromTop(30).reduced(5));
    oversampleCombo.setBounds(oversampleArea.removeFromTop(30).reduced(10, 5));
}
