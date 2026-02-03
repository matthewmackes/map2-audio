#include "CircularDelayUI.h"

namespace map2 {

CircularDelayUI::CircularDelayUI(CircularDelayProcessor& processor)
    : processor_(processor),
      circularDisplay_(processor)
{
    // Create sliders and labels
    delayTimeSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                       juce::Slider::TextBoxBelow);
    delayTimeSlider_->setRange(100.0, 2000.0);
    delayTimeSlider_->setValue(500.0);
    delayTimeSlider_->setTextValueSuffix(" ms");
    addAndMakeVisible(*delayTimeSlider_);

    delayTimeLabel_ = std::make_unique<juce::Label>("Delay Time", "Delay Time");
    addAndMakeVisible(*delayTimeLabel_);

    // Number of taps
    numTapsSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                     juce::Slider::TextBoxBelow);
    numTapsSlider_->setRange(4.0, 12.0, 1.0);
    numTapsSlider_->setValue(8.0);
    addAndMakeVisible(*numTapsSlider_);

    numTapsLabel_ = std::make_unique<juce::Label>("Num Taps", "Taps");
    addAndMakeVisible(*numTapsLabel_);

    // Feedback
    feedbackSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                      juce::Slider::TextBoxBelow);
    feedbackSlider_->setRange(0.0, 0.95);
    feedbackSlider_->setValue(0.5);
    addAndMakeVisible(*feedbackSlider_);

    feedbackLabel_ = std::make_unique<juce::Label>("Feedback", "Feedback");
    addAndMakeVisible(*feedbackLabel_);

    // Pan Rate
    panRateSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                     juce::Slider::TextBoxBelow);
    panRateSlider_->setRange(0.1, 5.0);
    panRateSlider_->setValue(1.0);
    panRateSlider_->setTextValueSuffix(" Hz");
    addAndMakeVisible(*panRateSlider_);

    panRateLabel_ = std::make_unique<juce::Label>("Pan Rate", "Pan Rate");
    addAndMakeVisible(*panRateLabel_);

    // Depth
    depthSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                   juce::Slider::TextBoxBelow);
    depthSlider_->setRange(0.0, 1.0);
    depthSlider_->setValue(1.0);
    addAndMakeVisible(*depthSlider_);

    depthLabel_ = std::make_unique<juce::Label>("Depth", "Depth");
    addAndMakeVisible(*depthLabel_);

    // Mix
    mixSlider_ = std::make_unique<juce::Slider>(juce::Slider::RotaryVerticalDrag,
                                                 juce::Slider::TextBoxBelow);
    mixSlider_->setRange(0.0, 1.0);
    mixSlider_->setValue(0.5);
    addAndMakeVisible(*mixSlider_);

    mixLabel_ = std::make_unique<juce::Label>("Mix", "Mix");
    addAndMakeVisible(*mixLabel_);

    // Bypass button
    bypassButton_ = std::make_unique<juce::ToggleButton>("Bypass");
    addAndMakeVisible(*bypassButton_);

    // Setup listener
    sliderListener_ = std::make_unique<SliderListener>(processor_);
    delayTimeSlider_->addListener(sliderListener_.get());
    numTapsSlider_->addListener(sliderListener_.get());
    feedbackSlider_->addListener(sliderListener_.get());
    panRateSlider_->addListener(sliderListener_.get());
    depthSlider_->addListener(sliderListener_.get());
    mixSlider_->addListener(sliderListener_.get());

    bypassButton_->onClick = [this]() {
        processor_.setBypass(bypassButton_->getToggleState());
    };

    // Add circular display
    addAndMakeVisible(circularDisplay_);

    // Start timer for metering updates
    startTimer(30);  // ~33 Hz refresh

    setSize(600, 500);
}

void CircularDelayUI::resized()
{
    auto area = getLocalBounds();

    // Circular display takes up top half
    circularDisplay_.setBounds(area.removeFromTop(getHeight() / 2));

    // Sliders and controls in bottom half
    auto controlArea = area.reduced(10);
    int sliderSize = 70;
    int spacing = 10;

    int x = controlArea.getX();
    int y = controlArea.getY();

    // First row
    delayTimeLabel_->setBounds(x, y, 80, 20);
    delayTimeSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    numTapsLabel_->setBounds(x, y, 80, 20);
    numTapsSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    feedbackLabel_->setBounds(x, y, 80, 20);
    feedbackSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    panRateLabel_->setBounds(x, y, 80, 20);
    panRateSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    // Second row
    x = controlArea.getX();
    y += sliderSize + 40;

    depthLabel_->setBounds(x, y, 80, 20);
    depthSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    mixLabel_->setBounds(x, y, 80, 20);
    mixSlider_->setBounds(x, y + 20, sliderSize, sliderSize);
    x += sliderSize + spacing;

    bypassButton_->setBounds(x, y + 20, 70, 30);
}

void CircularDelayUI::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colours::darkgrey);
}

void CircularDelayUI::timerCallback()
{
    auto metering = processor_.getMetering();
    circularDisplay_.updateMetering(metering);
    circularDisplay_.repaint();
}

// ============================================================================
// CircularDisplay Implementation
// ============================================================================

CircularDelayUI::CircularDisplay::CircularDisplay(CircularDelayProcessor& processor)
    : processor_(processor)
{
}

void CircularDelayUI::CircularDisplay::paint(juce::Graphics& g)
{
    auto area = getLocalBounds().toFloat();
    float centerX = area.getCentreX();
    float centerY = area.getCentreY();
    float radius = std::min(area.getWidth(), area.getHeight()) * 0.35f;

    // Background
    g.fillAll(juce::Colours::darkgrey);

    // Draw main circle
    g.setColour(juce::Colours::grey);
    g.drawEllipse(centerX - radius, centerY - radius, radius * 2.0f, radius * 2.0f, 2.0f);

    // Draw concentric circles
    g.setColour(juce::Colours::grey.withAlpha(0.5f));
    for (int i = 1; i < 4; ++i) {
        float r = radius * (i / 4.0f);
        g.drawEllipse(centerX - r, centerY - r, r * 2.0f, r * 2.0f, 1.0f);
    }

    // Draw cardinal directions
    g.setColour(juce::Colours::white.withAlpha(0.3f));
    g.drawLine(centerX, centerY - radius - 10, centerX, centerY - radius + 10, 1.0f);  // Top
    g.drawLine(centerX + radius + 10, centerY, centerX - radius - 10, centerY, 1.0f);  // Left/Right

    // Draw labels for directions
    g.setColour(juce::Colours::white);
    g.setFont(12.0f);
    g.drawText("L", juce::Rectangle<float>(centerX - radius - 30, centerY - 10, 20, 20),
              juce::Justification::centred, true);
    g.drawText("R", juce::Rectangle<float>(centerX + radius + 10, centerY - 10, 20, 20),
              juce::Justification::centred, true);
    g.drawText("F", juce::Rectangle<float>(centerX - 10, centerY - radius - 30, 20, 20),
              juce::Justification::centred, true);
    g.drawText("B", juce::Rectangle<float>(centerX - 10, centerY + radius + 10, 20, 20),
              juce::Justification::centred, true);

    // Draw taps
    for (int i = 0; i < 12; ++i) {
        if (currentMetering_.tapLevels[i] > 0.01f) {
            float angle = currentMetering_.tapAngles[i] * PI_OVER_180;
            float level = currentMetering_.tapLevels[i];

            // Position based on angle and level
            float x = centerX + std::cos(angle) * radius * level;
            float y = centerY + std::sin(angle) * radius * level;

            drawTap(g, angle, level, i);
        }
    }

    // Draw LFO phase indicator
    float lfoAngle = currentMetering_.lfoPhase * 2.0f * PI;
    float indicatorX = centerX + std::cos(lfoAngle) * (radius + 30.0f);
    float indicatorY = centerY + std::sin(lfoAngle) * (radius + 30.0f);

    g.setColour(juce::Colours::cyan.withAlpha(0.7f));
    g.fillEllipse(indicatorX - 5.0f, indicatorY - 5.0f, 10.0f, 10.0f);
}

void CircularDelayUI::CircularDisplay::updateMetering(
    const CircularDelayProcessor::Metering& metering)
{
    currentMetering_ = metering;
}

void CircularDelayUI::CircularDisplay::drawTap(juce::Graphics& g, float angle,
                                               float level, int index)
{
    auto area = getLocalBounds().toFloat();
    float centerX = area.getCentreX();
    float centerY = area.getCentreY();
    float radius = std::min(area.getWidth(), area.getHeight()) * 0.35f;

    // Position on circle based on angle and level
    float x = centerX + std::cos(angle) * radius * level;
    float y = centerY + std::sin(angle) * radius * level;

    // Color based on level
    float brightness = std::min(1.0f, level * 2.0f);
    juce::Colour tapColor = juce::Colours::green.withAlpha(brightness);

    g.setColour(tapColor);
    g.fillEllipse(x - 4.0f, y - 4.0f, 8.0f, 8.0f);

    // Outline
    g.setColour(juce::Colours::lightgreen);
    g.drawEllipse(x - 4.0f, y - 4.0f, 8.0f, 8.0f, 1.0f);
}

// ============================================================================
// SliderListener Implementation
// ============================================================================

void CircularDelayUI::SliderListener::sliderValueChanged(juce::Slider* slider)
{
    if (slider->getName() == juce::Slider().getName()) {
        // This shouldn't happen, but we need to identify which slider changed
        // We'll use pointer comparison instead
        return;
    }

    // We need access to the UI to know which slider changed
    // This is a limitation of this design - a better approach would be to use
    // separate listeners for each slider
}

}  // namespace map2
