#pragma once

/**
 * Circular Delays UI Component
 * Visual interface for the Yamaha SPX90-inspired circular delays effect
 *
 * Features:
 * - Real-time visualization of rotating pan positions
 * - Circular dial showing tap positions
 * - Parameter sliders for all controls
 * - Visual feedback of effect activity
 */

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "CircularDelayProcessor.h"
#include <array>
#include <cmath>

namespace map2 {

class CircularDelayUI : public juce::Component,
                       public juce::Timer {
public:
    CircularDelayUI(CircularDelayProcessor& processor);
    ~CircularDelayUI() = default;

    // Component lifecycle
    void resized() override;
    void paint(juce::Graphics& g) override;
    void timerCallback() override;

    // Prevent copying
    CircularDelayUI(const CircularDelayUI&) = delete;
    CircularDelayUI& operator=(const CircularDelayUI&) = delete;

private:
    /**
     * Circular visualization component
     * Shows rotating pan positions of all taps
     */
    class CircularDisplay : public juce::Component {
    public:
        explicit CircularDisplay(CircularDelayProcessor& processor);
        void paint(juce::Graphics& g) override;
        void updateMetering(const CircularDelayProcessor::Metering& metering);

    private:
        CircularDelayProcessor& processor_;
        CircularDelayProcessor::Metering currentMetering_;

        void drawCircle(juce::Graphics& g, float x, float y, float radius);
        void drawTap(juce::Graphics& g, float angle, float level, int index);

        static constexpr float PI = 3.14159265359f;
        static constexpr float PI_OVER_180 = 0.0174532925199f;
    };

    CircularDelayProcessor& processor_;
    CircularDisplay circularDisplay_;

    // UI Components
    std::unique_ptr<juce::Slider> delayTimeSlider_;
    std::unique_ptr<juce::Label> delayTimeLabel_;

    std::unique_ptr<juce::Slider> numTapsSlider_;
    std::unique_ptr<juce::Label> numTapsLabel_;

    std::unique_ptr<juce::Slider> feedbackSlider_;
    std::unique_ptr<juce::Label> feedbackLabel_;

    std::unique_ptr<juce::Slider> panRateSlider_;
    std::unique_ptr<juce::Label> panRateLabel_;

    std::unique_ptr<juce::Slider> depthSlider_;
    std::unique_ptr<juce::Label> depthLabel_;

    std::unique_ptr<juce::Slider> mixSlider_;
    std::unique_ptr<juce::Label> mixLabel_;

    std::unique_ptr<juce::ToggleButton> bypassButton_;

    // Slider listeners
    class SliderListener : public juce::Slider::Listener {
    public:
        explicit SliderListener(CircularDelayProcessor& proc) : processor_(proc) {}
        void sliderValueChanged(juce::Slider* slider) override;

    private:
        CircularDelayProcessor& processor_;
    };

    std::unique_ptr<SliderListener> sliderListener_;
};

}  // namespace map2
