#pragma once

/**
 * MAP2 Audio Engine - Eventide H9 UI Component
 * 
 * Visual Design:
 * - Red-on-Black Multi-Segment LED display (7-segment for algorithm)
 * - Black-on-White design accents
 * - Eventide H9-inspired hardware aesthetic
 * - Real-time algorithm indicator with smooth transitions
 * - Touch-friendly parameter knobs
 * - Professional metering displays
 */

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_core/juce_core.h>
#include <array>
#include <memory>

namespace map2 {

class H9LEDDisplay : public juce::Component {
public:
    H9LEDDisplay() = default;
    ~H9LEDDisplay() = default;
    
    void setDisplayValue(int algorithmIndex) {
        algorithmIndex_ = juce::jlimit(0, 9, algorithmIndex);
        repaint();
    }
    
    void paint(juce::Graphics& g) override {
        // Black background with subtle texture
        g.fillAll(juce::Colours::black);
        
        // Draw LED display frame - matte black with beveled edge
        juce::Rectangle<float> displayArea(4, 4, getWidth() - 8, getHeight() - 8);
        g.setColour(juce::Colour(0xff1a1a1a));
        g.fillRect(displayArea);
        
        // Bevel effect
        g.setColour(juce::Colour(0xff333333));
        g.drawRect(displayArea, 1.0f);
        
        // Inner shadow
        juce::Path innerShadow;
        innerShadow.addRectangle(displayArea.reduced(2));
        g.setColour(juce::Colour(0x20000000));
        g.fillPath(innerShadow);
        
        // Draw 7-segment display for algorithm number (0-9)
        drawSevenSegmentDisplay(g, algorithmIndex_, displayArea);
        
        // LED glow effect
        drawLEDGlow(g, displayArea);
    }
    
private:
    int algorithmIndex_ = 0;
    
    void drawSevenSegmentDisplay(juce::Graphics& g, int digit, juce::Rectangle<float> area) {
        // Segment dimensions
        float x = area.getX() + 8;
        float y = area.getY() + 4;
        float w = area.getWidth() - 16;
        float h = area.getHeight() - 8;
        
        // Segment positions (7-segment layout)
        // a: top, b: top-right, c: bottom-right, d: bottom
        // e: bottom-left, f: top-left, g: middle
        
        float segW = w * 0.15f;
        float segH = h * 0.12f;
        
        // Define which segments are on for each digit
        bool segments[10][7] = {
            {1,1,1,1,1,1,0}, // 0
            {0,1,1,0,0,0,0}, // 1
            {1,1,0,1,1,0,1}, // 2
            {1,1,1,1,0,0,1}, // 3
            {0,1,1,0,0,1,1}, // 4
            {1,0,1,1,0,1,1}, // 5
            {1,0,1,1,1,1,1}, // 6
            {1,1,1,0,0,0,0}, // 7
            {1,1,1,1,1,1,1}, // 8
            {1,1,1,1,0,1,1}  // 9
        };
        
        auto* segs = segments[digit];
        
        // Draw segments
        juce::Colour ledRed(0xffff1111);
        juce::Colour ledDim(0xff330000);
        
        // Top (a)
        drawSegment(g, x + segW, y, segW * 1.2f, segH, true, segs[0], ledRed, ledDim);
        
        // Top-right (b)
        drawSegment(g, x + segW * 2.5f, y + segH * 0.5f, segH, segW * 1.2f, false, segs[1], ledRed, ledDim);
        
        // Bottom-right (c)
        drawSegment(g, x + segW * 2.5f, y + segH * 1.5f, segH, segW * 1.2f, false, segs[2], ledRed, ledDim);
        
        // Bottom (d)
        drawSegment(g, x + segW, y + segH * 2, segW * 1.2f, segH, true, segs[3], ledRed, ledDim);
        
        // Bottom-left (e)
        drawSegment(g, x, y + segH * 1.5f, segH, segW * 1.2f, false, segs[4], ledRed, ledDim);
        
        // Top-left (f)
        drawSegment(g, x, y + segH * 0.5f, segH, segW * 1.2f, false, segs[5], ledRed, ledDim);
        
        // Middle (g)
        drawSegment(g, x + segW, y + segH, segW * 1.2f, segH, true, segs[6], ledRed, ledDim);
    }
    
    void drawSegment(juce::Graphics& g, float x, float y, float w, float h, bool horizontal,
                     bool isOn, juce::Colour onColour, juce::Colour offColour) {
        juce::Path segment;
        
        if (horizontal) {
            // Horizontal segment (parallelogram)
            float sw = h * 0.4f;
            segment.addQuadrilateral(x + sw, y, x + w, y, x + w - sw, y + h, x, y + h);
        } else {
            // Vertical segment
            float sw = w * 0.4f;
            segment.addQuadrilateral(x, y + sw, x + w, y, x + w, y + h - sw, x, y + h);
        }
        
        g.setColour(isOn ? onColour : offColour);
        g.fillPath(segment);
    }
    
    void drawLEDGlow(juce::Graphics& g, juce::Rectangle<float> area) {
        // Add subtle glow effect
        juce::ColourGradient glow(juce::Colour(0x30ff1111), area.getCentreX(), area.getCentreY(),
                                  juce::Colour(0x00000000), area.getRight(), area.getBottom(), true);
        g.setGradientFill(glow);
        g.fillRect(area);
    }
};

class H9ParameterKnob : public juce::Component {
public:
    H9ParameterKnob(const juce::String& name, float minValue, float maxValue, float defaultValue)
        : name_(name), minValue_(minValue), maxValue_(maxValue), value_(defaultValue),
          defaultValue_(defaultValue) {
    }
    
    void paint(juce::Graphics& g) override {
        // Draw knob background
        float size = std::min(getWidth(), getHeight());
        float x = (getWidth() - size) * 0.5f;
        float y = (getHeight() - size) * 0.5f;
        
        // Outer ring - Black with white accent
        g.setColour(juce::Colours::black);
        g.fillEllipse(x, y, size, size);
        
        // White accent ring
        g.setColour(juce::Colours::white);
        g.drawEllipse(x + 1, y + 1, size - 2, size - 2, 2.0f);
        
        // Inner knob - Dark with metal gradient
        float innerRadius = size * 0.35f;
        float cx = x + size * 0.5f;
        float cy = y + size * 0.5f;
        
        juce::ColourGradient metalGrad(juce::Colour(0xff444444), cx, cy - innerRadius * 0.5f,
                                       juce::Colour(0xff222222), cx, cy + innerRadius * 0.5f, false);
        g.setGradientFill(metalGrad);
        g.fillEllipse(cx - innerRadius, cy - innerRadius, innerRadius * 2, innerRadius * 2);
        
        // Knob indicator line
        float angle = juce::MathConstants<float>::pi * 1.5f + 
                      (value_ - minValue_) / (maxValue_ - minValue_) * juce::MathConstants<float>::pi;
        float lineLength = innerRadius * 0.6f;
        
        g.setColour(juce::Colours::white);
        g.drawLine(cx, cy, cx + cosf(angle) * lineLength, cy + sinf(angle) * lineLength, 2.0f);
        
        // Center dot
        g.setColour(juce::Colours::white);
        g.fillEllipse(cx - 2, cy - 2, 4, 4);
        
        // Draw label
        g.setColour(juce::Colours::white);
        g.setFont(juce::Font(10.0f, juce::Font::bold));
        g.drawText(name_, juce::Rectangle<int>(getX(), getBottom() - 20, getWidth(), 18),
                  juce::Justification::centredTop, true);
        
        // Draw value
        g.setFont(juce::Font(8.0f));
        juce::String valueStr = juce::String(value_, 2);
        g.drawText(valueStr, juce::Rectangle<int>(getX(), getTop() + 2, getWidth(), 12),
                  juce::Justification::centredTop, true);
    }
    
    void mouseDrag(const juce::MouseEvent& e) override {
        float delta = -e.getDistanceFromDragStartY() * 0.01f;
        setValue(value_ + delta * (maxValue_ - minValue_));
    }
    
    void mouseDoubleClick(const juce::MouseEvent&) override {
        setValue(defaultValue_);
    }
    
    void setValue(float newValue) {
        value_ = juce::jlimit(minValue_, maxValue_, newValue);
        repaint();
        if (onValueChange_) onValueChange_(value_);
    }
    
    float getValue() const { return value_; }
    
    std::function<void(float)> onValueChange_;
    
private:
    juce::String name_;
    float minValue_, maxValue_, value_, defaultValue_;
};

class H9AlgorithmButton : public juce::Component {
public:
    H9AlgorithmButton(const juce::String& name, int index)
        : algorithmName_(name), algorithmIndex_(index) {
    }
    
    void paint(juce::Graphics& g) override {
        // Base color - white if selected, dark if not
        juce::Colour bgColor = isSelected_ ? juce::Colours::white : juce::Colour(0xff222222);
        juce::Colour textColor = isSelected_ ? juce::Colours::black : juce::Colours::white;
        
        g.setColour(bgColor);
        g.fillRoundedRectangle(juce::Rectangle<float>(0, 0, getWidth(), getHeight()), 4.0f);
        
        // Border
        g.setColour(textColor);
        g.drawRoundedRectangle(juce::Rectangle<float>(0, 0, getWidth(), getHeight()), 4.0f, 1.5f);
        
        // Text
        g.setColour(textColor);
        g.setFont(juce::Font(11.0f, juce::Font::bold));
        g.drawText(algorithmName_, getBounds(), juce::Justification::centred, true);
    }
    
    void mouseDown(const juce::MouseEvent&) override {
        isSelected_ = true;
        repaint();
        if (onClicked_) onClicked_(algorithmIndex_);
    }
    
    void setSelected(bool selected) {
        isSelected_ = selected;
        repaint();
    }
    
    std::function<void(int)> onClicked_;
    
private:
    juce::String algorithmName_;
    int algorithmIndex_;
    bool isSelected_ = false;
};

class EventideH9UI : public juce::Component {
public:
    EventideH9UI(EventideH9Processor& processor)
        : processor_(processor),
          ledDisplay_(std::make_unique<H9LEDDisplay>()),
          inputGainKnob_("Input", -12.0f, 12.0f, 0.0f),
          outputGainKnob_("Output", -12.0f, 12.0f, 0.0f),
          mixKnob_("Mix", 0.0f, 1.0f, 0.5f),
          timeKnob_("Time", 0.01f, 5.0f, 0.5f),
          depthKnob_("Depth", 0.0f, 100.0f, 50.0f) {
        
        // Add LED display
        addAndMakeVisible(*ledDisplay_);
        
        // Create algorithm buttons
        std::array<const char*, 10> algorithmNames = {
            "MicroPitch", "UltraShift", "SmartShift", "Transpose", "PitchFactor",
            "RevDelays", "ShimmerV", "MotionV", "Granular", "Crystallize"
        };
        
        for (int i = 0; i < 10; ++i) {
            auto button = std::make_unique<H9AlgorithmButton>(algorithmNames[i], i);
            button->onClicked_ = [this, i](int) {
                processor_.setAlgorithm(static_cast<H9Algorithm>(i));
                updateAlgorithmSelection(i);
            };
            algorithmButtons_.push_back(std::move(button));
            addAndMakeVisible(*algorithmButtons_.back());
        }
        
        // Add parameter knobs
        addAndMakeVisible(inputGainKnob_);
        addAndMakeVisible(outputGainKnob_);
        addAndMakeVisible(mixKnob_);
        addAndMakeVisible(timeKnob_);
        addAndMakeVisible(depthKnob_);
        
        // Setup knob callbacks
        inputGainKnob_.onValueChange_ = [this](float val) {
            processor_.setInputGain(val);
        };
        
        outputGainKnob_.onValueChange_ = [this](float val) {
            processor_.setOutputGain(val);
        };
        
        mixKnob_.onValueChange_ = [this](float val) {
            processor_.setMix(val);
        };
        
        // Set initial algorithm
        updateAlgorithmSelection(0);
        
        // Start timer for LED animation
        startTimer(100);
    }
    
    ~EventideH9UI() override {
        stopTimer();
    }
    
    void paint(juce::Graphics& g) override {
        // Eventide H9 aesthetic: Matte black background with white accents
        g.fillAll(juce::Colour(0xff1a1a1a));
        
        // Top panel - black on white
        juce::Rectangle<int> topPanel(0, 0, getWidth(), 60);
        g.setColour(juce::Colours::white);
        g.fillRect(topPanel);
        
        // Title
        g.setColour(juce::Colours::black);
        g.setFont(juce::Font(18.0f, juce::Font::bold));
        g.drawText("EVENTIDE H9", topPanel, juce::Justification::centred, true);
    }
    
    void resized() override {
        int padding = 10;
        int x = padding;
        int y = 70;
        
        // LED Display - Large and prominent
        ledDisplay_->setBounds(x, y, getWidth() - 2 * padding, 50);
        y += 60;
        
        // Algorithm buttons - Grid layout (2 rows of 5)
        int buttonWidth = (getWidth() - 4 * padding) / 5;
        int buttonHeight = 30;
        
        for (int i = 0; i < 10; ++i) {
            int row = i / 5;
            int col = i % 5;
            algorithmButtons_[i]->setBounds(
                x + col * (buttonWidth + padding),
                y + row * (buttonHeight + padding),
                buttonWidth, buttonHeight);
        }
        y += 2 * (buttonHeight + padding) + padding;
        
        // Parameter knobs - Row of 5
        int knobSize = 60;
        int knobSpacing = (getWidth() - 2 * padding - 5 * knobSize) / 4;
        
        inputGainKnob_.setBounds(x, y, knobSize, knobSize + 20);
        outputGainKnob_.setBounds(x + knobSize + knobSpacing, y, knobSize, knobSize + 20);
        mixKnob_.setBounds(x + 2 * (knobSize + knobSpacing), y, knobSize, knobSize + 20);
        timeKnob_.setBounds(x + 3 * (knobSize + knobSpacing), y, knobSize, knobSize + 20);
        depthKnob_.setBounds(x + 4 * (knobSize + knobSpacing), y, knobSize, knobSize + 20);
    }
    
    void timerCallback() override {
        // Update LED display
        ledDisplay_->setDisplayValue(static_cast<int>(processor_.getCurrentAlgorithm()));
    }
    
private:
    EventideH9Processor& processor_;
    
    std::unique_ptr<H9LEDDisplay> ledDisplay_;
    std::vector<std::unique_ptr<H9AlgorithmButton>> algorithmButtons_;
    
    H9ParameterKnob inputGainKnob_;
    H9ParameterKnob outputGainKnob_;
    H9ParameterKnob mixKnob_;
    H9ParameterKnob timeKnob_;
    H9ParameterKnob depthKnob_;
    
    void updateAlgorithmSelection(int selectedIndex) {
        for (int i = 0; i < (int)algorithmButtons_.size(); ++i) {
            algorithmButtons_[i]->setSelected(i == selectedIndex);
        }
        ledDisplay_->setDisplayValue(selectedIndex);
    }
};

} // namespace map2
