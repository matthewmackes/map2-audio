/**
 * MAP2 Audio Engine - Boss XS-1 Poly Shifter UI Implementation
 * Professional single-card interface with Boss-style aesthetics
 */

#include "BossXS1UI.h"
#include <cmath>
#include <iomanip>
#include <sstream>

namespace map2 {

BossXS1UI::BossXS1UI(BossXS1PolyShifterProcessor& processor)
    : processor_(processor) {
    setSize(PREFERRED_WIDTH, PREFERRED_HEIGHT);
    startTimer(50);  // Update UI at 20 Hz
}

BossXS1UI::~BossXS1UI() {
    stopTimer();
}

void BossXS1UI::paint(juce::Graphics& g) {
    // Update display state from processor
    auto params = processor_.getParameters();
    displayState_.shiftAmount = params.shiftAmount;
    displayState_.balance = params.balance;
    displayState_.pedalPosition = params.pedalPosition;
    displayState_.glide = params.glide;
    displayState_.feedback = params.feedback;
    displayState_.inputLevel = processor_.getInputLevel();
    displayState_.outputLevel = processor_.getOutputLevel();
    displayState_.detuneMode = params.detuneMode;
    displayState_.bypass = params.bypass;
    displayState_.currentPreset = static_cast<int>(params.preset);

    // Draw background
    drawCardBackground(g);

    // Draw main sections
    drawModeSection(g);
    drawParameterControls(g);
    drawMeters(g);
    drawMidiInfo(g);
}

void BossXS1UI::resized() {
    // Layout handled in paint for this simple card design
}

void BossXS1UI::timerCallback() {
    repaint();
}

void BossXS1UI::drawCardBackground(juce::Graphics& g) {
    // Main card background
    g.fillAll(BOSS_BLACK);

    // Outer border with gradient
    juce::Rectangle<int> card(0, 0, getWidth(), getHeight());
    g.setColour(BOSS_ORANGE.withAlpha(0.8f));
    g.drawRect(card.reduced(8), 2);  // Orange border

    // Subtle inner shadows
    g.setGradientFill(juce::ColourGradient(
        juce::Colour(0x00000000), 0, 0,
        juce::Colour(0x20000000), 0, static_cast<float>(getHeight()),
        false));
    g.fillRect(card);

    // Boss logo area (top left)
    g.setColour(BOSS_ORANGE);
    g.setFont(juce::Font(18.0f, juce::Font::bold));
    g.drawText("BOSS", 20, 15, 80, 25, juce::Justification::left);

    g.setColour(TEXT_PRIMARY);
    g.setFont(juce::Font(12.0f));
    g.drawText("XS-1 Poly Shifter", 20, 38, 150, 18, juce::Justification::left);
}

void BossXS1UI::drawModeSection(juce::Graphics& g) {
    // Mode indicator area (right side, compact)
    int rightX = getWidth() - 200;
    int topY = 15;

    g.setColour(BOSS_GRAY);
    g.drawRect(juce::Rectangle<int>(rightX, topY, 180, 90), 1);

    // Mode status
    g.setColour(TEXT_PRIMARY);
    g.setFont(juce::Font(11.0f, juce::Font::bold));
    g.drawText("MODE", rightX + 10, topY + 8, 60, 16, juce::Justification::left);

    // Current mode display
    juce::String modeText = displayState_.detuneMode ? "DETUNE" : "SHIFT";
    g.setColour(displayState_.detuneMode ? BOSS_ORANGE : juce::Colour(0xFF00FF00));
    g.setFont(juce::Font(13.0f, juce::Font::bold));
    g.drawText(modeText, rightX + 10, topY + 26, 160, 20, juce::Justification::left);

    // Bypass status
    g.setColour(TEXT_SECONDARY);
    g.setFont(juce::Font(10.0f));
    juce::String bypassText = displayState_.bypass ? "BYPASSED" : "ACTIVE";
    juce::Colour statusCol = displayState_.bypass ? juce::Colour(0xFFFF0000) : juce::Colour(0xFF00FF00);
    g.setColour(statusCol);
    g.drawText(bypassText, rightX + 10, topY + 48, 160, 16, juce::Justification::left);

    // Preset number
    g.setColour(TEXT_SECONDARY);
    g.setFont(juce::Font(9.0f));
    std::ostringstream oss;
    oss << "Preset: " << displayState_.currentPreset;
    g.drawText(juce::String(oss.str()), rightX + 10, topY + 68, 160, 14, juce::Justification::left);
}

void BossXS1UI::drawParameterControls(juce::Graphics& g) {
    int startY = 120;
    int startX = 20;

    // === LEFT COLUMN: Main Controls ===
    drawKnob(g, startX, startY, "SHIFT", displayState_.shiftAmount, -7.0f, 7.0f, !displayState_.bypass);
    drawKnob(g, startX + 100, startY, "BALANCE", displayState_.balance, 0.0f, 100.0f, !displayState_.bypass);
    drawKnob(g, startX + 200, startY, "PEDAL", displayState_.pedalPosition, 0.0f, 100.0f, 
             !displayState_.bypass);

    // === CENTER COLUMN: Fine Controls ===
    drawKnob(g, startX + 300, startY, "GLIDE", displayState_.glide, 0.0f, 100.0f, !displayState_.bypass);
    drawKnob(g, startX + 400, startY, "FEEDBACK", displayState_.feedback, 0.0f, 0.7f, !displayState_.bypass);

    // === Parameter Values Display ===
    int valueY = startY + KNOB_SIZE + 20;
    g.setColour(TEXT_SECONDARY);
    g.setFont(juce::Font(10.0f));

    // Format and display values
    std::ostringstream oss1;
    oss1 << std::fixed << std::setprecision(1) << displayState_.shiftAmount << " st";
    g.drawText(juce::String(oss1.str()), startX, valueY, 80, 16, juce::Justification::centred);

    std::ostringstream oss2;
    oss2 << std::fixed << std::setprecision(0) << displayState_.balance << "%";
    g.drawText(juce::String(oss2.str()), startX + 100, valueY, 80, 16, juce::Justification::centred);

    std::ostringstream oss3;
    oss3 << std::fixed << std::setprecision(0) << displayState_.pedalPosition << "%";
    g.drawText(juce::String(oss3.str()), startX + 200, valueY, 80, 16, juce::Justification::centred);

    std::ostringstream oss4;
    oss4 << std::fixed << std::setprecision(0) << displayState_.glide << "ms";
    g.drawText(juce::String(oss4.str()), startX + 300, valueY, 80, 16, juce::Justification::centred);

    std::ostringstream oss5;
    oss5 << std::fixed << std::setprecision(2) << displayState_.feedback;
    g.drawText(juce::String(oss5.str()), startX + 400, valueY, 80, 16, juce::Justification::centred);
}

void BossXS1UI::drawKnob(juce::Graphics& g, int x, int y, const juce::String& label,
                         float value, float minVal, float maxVal, bool isActive) {
    // Knob background circle
    juce::Colour knobColour = isActive ? BOSS_GRAY : BOSS_GRAY.withAlpha(0.5f);
    g.setColour(knobColour);
    g.fillEllipse(juce::Rectangle<float>(x, y, KNOB_SIZE, KNOB_SIZE));

    // Knob border
    g.setColour(BOSS_ORANGE);
    g.drawEllipse(juce::Rectangle<float>(x, y, KNOB_SIZE, KNOB_SIZE), 2.0f);

    // Indicator line (rotation indicator)
    float normalized = (value - minVal) / (maxVal - minVal);
    normalized = std::clamp(normalized, 0.0f, 1.0f);
    float angle = (normalized - 0.5f) * juce::MathConstants<float>::pi * 1.5f;  // -135 to +135 degrees

    float centerX = x + KNOB_SIZE / 2.0f;
    float centerY = y + KNOB_SIZE / 2.0f;
    float radius = KNOB_SIZE / 2.0f - 8.0f;

    float endX = centerX + radius * std::sin(angle);
    float endY = centerY - radius * std::cos(angle);

    g.setColour(TEXT_PRIMARY);
    g.drawLine(centerX, centerY, endX, endY, 2.0f);

    // Label below knob
    g.setColour(TEXT_PRIMARY);
    g.setFont(juce::Font(9.0f));
    g.drawText(label, x - 10, y + KNOB_SIZE + 5, KNOB_SIZE + 20, 14, juce::Justification::centred);
}

void BossXS1UI::drawMeters(juce::Graphics& g) {
    int meterY = 320;
    int meterX = 20;

    // Input meter
    drawMeter(g, meterX, meterY, 180, 20, displayState_.inputLevel, "INPUT");

    // Output meter
    drawMeter(g, meterX + 200, meterY, 180, 20, displayState_.outputLevel, "OUTPUT");
}

void BossXS1UI::drawMeter(juce::Graphics& g, int x, int y, int width, int height,
                          float level, const juce::String& label) {
    // Label
    g.setColour(TEXT_SECONDARY);
    g.setFont(juce::Font(9.0f));
    g.drawText(label, x, y - 16, width, 14, juce::Justification::left);

    // Meter background
    g.setColour(BOSS_GRAY);
    g.fillRect(x, y, width, height);
    g.setColour(juce::Colour(0xFF444444));
    g.drawRect(x, y, width, height, 1);

    // Meter bar (convert dB to visual scale)
    // -100 dB = empty, -12 dB = full
    float normalized = (level + 12.0f) / 112.0f;
    normalized = std::clamp(normalized, 0.0f, 1.0f);

    juce::Colour barColour = juce::Colour(0xFF00FF00);  // Green
    if (level > -6.0f) barColour = juce::Colour(0xFFFFFF00);  // Yellow
    if (level > 0.0f) barColour = juce::Colour(0xFFFF0000);  // Red

    int barWidth = static_cast<int>(width * normalized);
    g.setColour(barColour);
    g.fillRect(x + 1, y + 1, barWidth - 2, height - 2);

    // Level text
    g.setColour(TEXT_PRIMARY);
    g.setFont(juce::Font(8.0f));
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(1) << level << "dB";
    g.drawText(juce::String(oss.str()), x + 4, y + 3, width - 8, height - 6, juce::Justification::centredLeft);
}

void BossXS1UI::drawMidiInfo(juce::Graphics& g) {
    // MIDI mapping information (bottom)
    int infoY = getHeight() - 40;

    g.setColour(BOSS_GRAY);
    g.drawRect(juce::Rectangle<int>(20, infoY - 5, getWidth() - 40, 35), 1);

    g.setColour(TEXT_SECONDARY);
    g.setFont(juce::Font(9.0f));
    g.drawText("MIDI CCs: #20=Shift | #21=Balance | #22=Pedal | #23=Glide | #24=Feedback | #25=Mode",
               25, infoY, getWidth() - 50, 14, juce::Justification::left);

    g.drawText("Program Change: Selects Preset | Notes C3-B3: Direct Preset Mapping",
               25, infoY + 16, getWidth() - 50, 14, juce::Justification::left);
}

void BossXS1UI::drawShadowedText(juce::Graphics& g, const juce::String& text,
                                 int x, int y, int width, int height,
                                 juce::Justification justification,
                                 const juce::Colour& colour, int shadowOffset) {
    // Draw shadow
    g.setColour(juce::Colour(0x00000000).withAlpha(0.5f));
    g.drawText(text, x + shadowOffset, y + shadowOffset, width, height, justification);

    // Draw text
    g.setColour(colour);
    g.drawText(text, x, y, width, height, justification);
}

}  // namespace map2
