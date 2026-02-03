#pragma once

/**
 * MAP2 Audio Engine - Boss XS-1 Poly Shifter UI Component
 * Professional single-card user interface matching the Boss XS-1 design
 *
 * Features:
 * - Clean, compact layout inspired by Boss pedal design
 * - Real-time parameter visualization
 * - Preset selection and management
 * - MIDI CC mapping display
 * - Input/Output level meters
 * - Expression pedal visualization
 * - Professional color scheme matching Boss branding
 */

#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "BossXS1PolyShifterProcessor.h"

namespace map2 {

class BossXS1UI : public juce::Component,
                  public juce::Timer {
public:
    BossXS1UI(BossXS1PolyShifterProcessor& processor);
    ~BossXS1UI() override;

    void paint(juce::Graphics& g) override;
    void resized() override;
    void timerCallback() override;

    // Preferred size
    static constexpr int PREFERRED_WIDTH = 800;
    static constexpr int PREFERRED_HEIGHT = 380;

private:
    BossXS1PolyShifterProcessor& processor_;

    // UI Colors (Boss branding)
    inline static const juce::Colour BOSS_BLACK{0xFF1a1a1a};
    inline static const juce::Colour BOSS_ORANGE{0xFFFF6600};
    inline static const juce::Colour BOSS_GRAY{0xFF333333};
    inline static const juce::Colour BOSS_LIGHT_GRAY{0xFFCCCCCC};
    inline static const juce::Colour TEXT_PRIMARY{0xFFFFFFFF};
    inline static const juce::Colour TEXT_SECONDARY{0xFF999999};

    // Component dimensions
    static constexpr int KNOB_SIZE = 60;
    static constexpr int PADDING = 16;
    static constexpr int COLUMN_SPACING = 20;

    // UI States
    struct DisplayState {
        float shiftAmount = 0.0f;
        float balance = 50.0f;
        float pedalPosition = 0.0f;
        float glide = 0.0f;
        float feedback = 0.0f;
        float inputLevel = -100.0f;
        float outputLevel = -100.0f;
        bool detuneMode = false;
        bool bypass = false;
        int currentPreset = 0;
    } displayState_;

    /**
     * Draw card background with Boss branding
     */
    void drawCardBackground(juce::Graphics& g);

    /**
     * Draw all parameter knobs and sliders
     */
    void drawParameterControls(juce::Graphics& g);

    /**
     * Draw preset/mode information
     */
    void drawModeSection(juce::Graphics& g);

    /**
     * Draw level meters
     */
    void drawMeters(juce::Graphics& g);

    /**
     * Draw preset selector
     */
    void drawPresetSelector(juce::Graphics& g);

    /**
     * Draw MIDI CC mapping information
     */
    void drawMidiInfo(juce::Graphics& g);

    /**
     * Helper: Draw a labeled knob/slider
     */
    void drawKnob(juce::Graphics& g, int x, int y, const juce::String& label,
                  float value, float minVal, float maxVal, bool isActive = true);

    /**
     * Helper: Draw a meter bar
     */
    void drawMeter(juce::Graphics& g, int x, int y, int width, int height,
                   float level, const juce::String& label);

    /**
     * Helper: Draw text with drop shadow
     */
    void drawShadowedText(juce::Graphics& g, const juce::String& text,
                         int x, int y, int width, int height,
                         juce::Justification justification,
                         const juce::Colour& colour, int shadowOffset = 1);
};

}  // namespace map2
