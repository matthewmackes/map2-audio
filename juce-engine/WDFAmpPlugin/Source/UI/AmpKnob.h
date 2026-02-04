#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace UI {

//==============================================================================
// Custom Knob Component - Styled amp-style rotary knob
//==============================================================================
class AmpKnob : public juce::Slider {
public:
    enum class KnobStyle {
        Vintage,    // Classic chicken-head style
        Modern,     // Sleek metal knob
        LED         // Knob with LED indicator ring
    };
    
    AmpKnob(const juce::String& name = "Knob", KnobStyle style = KnobStyle::Modern)
        : knobStyle(style) {
        setName(name);
        setSliderStyle(juce::Slider::RotaryVerticalDrag);
        setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 15);
        setRange(0.0, 1.0, 0.01);
        setValue(0.5);
        setDoubleClickReturnValue(true, 0.5);
    }
    
    void paint(juce::Graphics& g) override {
        auto bounds = getLocalBounds().toFloat();
        auto radius = juce::jmin(bounds.getWidth(), bounds.getHeight()) / 2.0f - 4.0f;
        auto centreX = bounds.getCentreX();
        auto centreY = bounds.getCentreY() - 10.0f;  // Offset for text box
        
        // Background
        g.setColour(juce::Colours::black);
        g.fillEllipse(centreX - radius, centreY - radius, radius * 2, radius * 2);
        
        // Knob face gradient
        juce::ColourGradient gradient;
        if (knobStyle == KnobStyle::Modern) {
            gradient = juce::ColourGradient(
                juce::Colour(0xff404040), centreX, centreY - radius * 0.5f,
                juce::Colour(0xff202020), centreX, centreY + radius * 0.5f, false);
        } else if (knobStyle == KnobStyle::Vintage) {
            gradient = juce::ColourGradient(
                juce::Colour(0xffd4c4a8), centreX, centreY - radius * 0.5f,
                juce::Colour(0xff8b7355), centreX, centreY + radius * 0.5f, false);
        } else {
            gradient = juce::ColourGradient(
                juce::Colour(0xff505050), centreX, centreY - radius * 0.5f,
                juce::Colour(0xff303030), centreX, centreY + radius * 0.5f, false);
        }
        
        g.setGradientFill(gradient);
        g.fillEllipse(centreX - radius * 0.9f, centreY - radius * 0.9f, 
                      radius * 1.8f, radius * 1.8f);
        
        // Position indicator
        auto angle = juce::jmap(static_cast<float>(getValue()), 
                                static_cast<float>(getMinimum()), 
                                static_cast<float>(getMaximum()), 
                                -2.356f, 2.356f);  // -135 to 135 degrees
        
        auto indicatorLength = radius * 0.6f;
        auto indicatorWidth = 3.0f;
        
        juce::Path indicator;
        indicator.addRoundedRectangle(-indicatorWidth * 0.5f, -indicatorLength,
                                       indicatorWidth, indicatorLength * 0.4f, 1.0f);
        
        g.setColour(indicatorColor);
        g.fillPath(indicator, juce::AffineTransform::rotation(angle)
                                  .translated(centreX, centreY));
        
        // LED ring (for LED style)
        if (knobStyle == KnobStyle::LED) {
            auto ledRadius = radius * 1.1f;
            auto numLeds = 11;
            auto ledAngle = juce::jmap(static_cast<float>(getValue()),
                                       static_cast<float>(getMinimum()),
                                       static_cast<float>(getMaximum()),
                                       0.0f, static_cast<float>(numLeds));
            
            for (int i = 0; i < numLeds; ++i) {
                auto ledA = juce::jmap(static_cast<float>(i), 0.0f, 
                                       static_cast<float>(numLeds - 1), -2.356f, 2.356f);
                auto ledX = centreX + std::sin(ledA) * ledRadius;
                auto ledY = centreY - std::cos(ledA) * ledRadius;
                
                if (i <= static_cast<int>(ledAngle)) {
                    // Lit LED
                    g.setColour(i < 7 ? juce::Colours::limegreen : 
                               (i < 9 ? juce::Colours::yellow : juce::Colours::red));
                } else {
                    // Unlit LED
                    g.setColour(juce::Colour(0xff303030));
                }
                g.fillEllipse(ledX - 3, ledY - 3, 6, 6);
            }
        }
    }
    
    void setIndicatorColor(juce::Colour color) { 
        indicatorColor = color; 
        repaint();
    }
    
    void setKnobStyle(KnobStyle style) {
        knobStyle = style;
        repaint();
    }
    
private:
    KnobStyle knobStyle = KnobStyle::Modern;
    juce::Colour indicatorColor = juce::Colours::white;
};

} // namespace UI
