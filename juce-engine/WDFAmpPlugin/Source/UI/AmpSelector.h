#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Amps/AmpModel.h"

namespace UI {

//==============================================================================
// Amp Selector Component - Visual amp selection with thumbnails
//==============================================================================
class AmpSelector : public juce::Component {
public:
    AmpSelector() {
        // Add amp buttons
        for (int i = 0; i < static_cast<int>(Amps::AmpType::NumAmpTypes); ++i) {
            auto* button = ampButtons.add(new AmpButton(static_cast<Amps::AmpType>(i)));
            addAndMakeVisible(button);
            button->onClick = [this, i]() { selectAmp(i); };
        }
        
        selectAmp(0);  // Default to first amp
    }
    
    void resized() override {
        auto bounds = getLocalBounds();
        auto buttonWidth = bounds.getWidth() / static_cast<int>(Amps::AmpType::NumAmpTypes);
        
        for (int i = 0; i < ampButtons.size(); ++i) {
            ampButtons[i]->setBounds(i * buttonWidth, 0, buttonWidth, bounds.getHeight());
        }
    }
    
    void selectAmp(int index) {
        selectedAmp = index;
        
        for (int i = 0; i < ampButtons.size(); ++i) {
            ampButtons[i]->setSelected(i == index);
        }
        
        if (onAmpChanged) {
            onAmpChanged(static_cast<Amps::AmpType>(index));
        }
    }
    
    int getSelectedAmp() const { return selectedAmp; }
    
    std::function<void(Amps::AmpType)> onAmpChanged;
    
private:
    //--------------------------------------------------------------------------
    // Individual amp button with visual representation
    class AmpButton : public juce::Component {
    public:
        AmpButton(Amps::AmpType type) : ampType(type) {
            setName(getAmpName(type));
        }
        
        void paint(juce::Graphics& g) override {
            auto bounds = getLocalBounds().toFloat().reduced(4);
            
            // Background
            if (selected) {
                g.setColour(juce::Colour(0xff3a506b));
            } else if (hovering) {
                g.setColour(juce::Colour(0xff2a3a4b));
            } else {
                g.setColour(juce::Colour(0xff1a2a3b));
            }
            g.fillRoundedRectangle(bounds, 8.0f);
            
            // Border
            g.setColour(selected ? juce::Colours::orange : juce::Colour(0xff404040));
            g.drawRoundedRectangle(bounds, 8.0f, selected ? 2.0f : 1.0f);
            
            // Amp icon/representation
            auto iconBounds = bounds.reduced(10).removeFromTop(bounds.getHeight() * 0.6f);
            paintAmpIcon(g, iconBounds);
            
            // Amp name
            g.setColour(juce::Colours::white);
            g.setFont(12.0f);
            g.drawText(getName(), bounds.removeFromBottom(25), 
                      juce::Justification::centred);
        }
        
        void paintAmpIcon(juce::Graphics& g, juce::Rectangle<float> bounds) {
            // Draw a simplified amp front panel representation
            g.setColour(juce::Colour(0xff202020));
            g.fillRoundedRectangle(bounds, 4.0f);
            
            // Grill cloth
            auto grillBounds = bounds.reduced(4).removeFromTop(bounds.getHeight() * 0.5f);
            g.setColour(getGrillColor());
            g.fillRect(grillBounds);
            
            // Control panel area
            auto controlBounds = bounds.reduced(4).removeFromBottom(bounds.getHeight() * 0.4f);
            g.setColour(juce::Colour(0xff303030));
            g.fillRect(controlBounds);
            
            // Draw some knobs
            g.setColour(juce::Colours::silver);
            float knobSpacing = controlBounds.getWidth() / 5.0f;
            for (int i = 0; i < 4; ++i) {
                float x = controlBounds.getX() + knobSpacing * (i + 0.5f);
                float y = controlBounds.getCentreY();
                g.fillEllipse(x - 4, y - 4, 8, 8);
            }
        }
        
        juce::Colour getGrillColor() const {
            switch (ampType) {
                case Amps::AmpType::Peavey5150:
                    return juce::Colour(0xff1a1a1a);  // Black
                case Amps::AmpType::Marshall800:
                    return juce::Colour(0xff8b7355);  // Gold/tan
                case Amps::AmpType::MesaDualRectifier:
                    return juce::Colour(0xff2a2a2a);  // Dark grey
                default:
                    return juce::Colour(0xff404040);
            }
        }
        
        static juce::String getAmpName(Amps::AmpType type) {
            switch (type) {
                case Amps::AmpType::Peavey5150: return "Peavey 5150";
                case Amps::AmpType::Marshall800: return "Marshall 800";
                case Amps::AmpType::MesaDualRectifier: return "Mesa Dual Rec";
                default: return "Unknown";
            }
        }
        
        void setSelected(bool sel) { 
            selected = sel; 
            repaint(); 
        }
        
        void mouseEnter(const juce::MouseEvent&) override {
            hovering = true;
            repaint();
        }
        
        void mouseExit(const juce::MouseEvent&) override {
            hovering = false;
            repaint();
        }
        
        void mouseUp(const juce::MouseEvent&) override {
            if (onClick) onClick();
        }
        
        std::function<void()> onClick;
        
    private:
        Amps::AmpType ampType;
        bool selected = false;
        bool hovering = false;
    };
    
    juce::OwnedArray<AmpButton> ampButtons;
    int selectedAmp = 0;
};

} // namespace UI
