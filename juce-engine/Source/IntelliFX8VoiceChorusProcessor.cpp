/**
 * MAP2 Audio Engine - IntelliFX 8-Voice Chorus Processor Implementation
 * Rocktron IntelliFX-style multi-voice chorus with HUSH noise reduction
 */

#include "IntelliFX8VoiceChorusProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

// ========================================
// Factory Presets (Based on IntelliFX Manual)
// ========================================

// Preset info table
static const IntelliFX8VoiceChorusProcessor::PresetInfo PRESET_INFO[] = {
    {0,  "SWEEP CHORUS",   "Classic8Voice", "Classic swept 8-voice chorus"},
    {1,  "CIRCLES",        "Special",       "Circular panning effect"},
    {2,  "SHIMMER CRS",    "Shimmer",       "Ethereal shimmering chorus"},
    {3,  "FLANGE",         "Flange",        "Classic flanging effect"},
    {4,  "DELAY FLANGE",   "Flange",        "Flanging with added delay"},
    {5,  "TAP DANCIN",     "Echo",          "Rhythmic tap delay chorus"},
    {6,  "CRS 2 VOICE",    "Chorus",        "Simple 2-voice chorus"},
    {7,  "CHORUS PONG",    "Echo",          "Ping-pong stereo chorus"},
    {8,  "CHORUS ECHO4",   "Echo",          "4-tap echo with chorus"},
    {9,  "OCTOPUS",        "Special",       "8-tentacle modulation"},
    {10, "LIQUIDCHORUS",   "Shimmer",       "Liquid flowing chorus"},
    {11, "SCATTERBRAIN",   "Special",       "Random scatter effect"},
    {12, "HAWAIIN CRS",    "Chorus",        "Hawaiian guitar shimmer"},
    {13, "SLOW CRS+REV",   "Shimmer",       "Slow wash chorus"},
    {14, "FLANGE VERB",    "Flange",        "Flanging with reverb feel"},
    {15, "CLASSIC STEREO", "Chorus",        "Classic stereo chorus"},
    {16, "THICK CHORUS",   "Chorus",        "Thick detuned chorus"},
    {17, "ANALOG WARM",    "Classic8Voice", "Warm analog-style chorus"},
    {18, "DIMENSION",      "Shimmer",       "Dimensional space chorus"},
    {19, "JET FLANGE",     "Flange",        "Jet plane flanging"},
    {20, "TAPE CHORUS",    "Classic8Voice", "Tape machine chorus"},
    {21, "ROTARY SIM",     "Special",       "Leslie rotary simulation"},
    {22, "MICRO SHIFT",    "Chorus",        "Micropitch detune effect"},
    {23, "WIDE STEREO",    "Shimmer",       "Ultra-wide stereo spread"},
    {24, "ENSEMBLE",       "Classic8Voice", "String ensemble effect"},
    {25, "VINTAGE MOD",    "Classic8Voice", "Vintage modulation"},
    {26, "CHORUS HALL",    "Shimmer",       "Chorus with hall ambience"},
    {27, "PHASE CHORUS",   "Special",       "Phaser-like chorus"},
    {28, "CRYSTAL",        "Shimmer",       "Crystal clear shimmer"},
    {29, "BYPASS",         "Special",       "Effect bypassed"},
};

// Factory preset parameters
static const IntelliFX8VoiceChorusProcessor::Parameters PRESET_PARAMS[] = {
    // 0: SWEEP CHORUS - Classic swept 8-voice chorus
    {
        .voices = {{
            {-6.0f, -80.0f, 15.0f, 60.0f, 40.0f},   // V1: Far left, short delay
            {-6.0f,  80.0f, 18.0f, 60.0f, 42.0f},   // V2: Far right, slightly longer
            {-9.0f, -40.0f, 22.0f, 50.0f, 38.0f},   // V3: Left-center
            {-9.0f,  40.0f, 25.0f, 50.0f, 44.0f},   // V4: Right-center
            {-12.0f, -60.0f, 30.0f, 45.0f, 36.0f},  // V5
            {-12.0f,  60.0f, 35.0f, 45.0f, 46.0f},  // V6
            {-15.0f, -20.0f, 40.0f, 35.0f, 34.0f},  // V7
            {-15.0f,  20.0f, 45.0f, 35.0f, 48.0f},  // V8
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -20.0f,
        .regenR = -20.0f,
        .hush = {true, -50.0f, 200.0f},
        .bypass = false
    },
    // 1: CIRCLES - Circular panning effect
    {
        .voices = {{
            {-6.0f, -100.0f, 20.0f, 70.0f, 30.0f},
            {-6.0f, -71.0f, 25.0f, 70.0f, 30.0f},
            {-6.0f, -29.0f, 30.0f, 70.0f, 30.0f},
            {-6.0f,  0.0f, 35.0f, 70.0f, 30.0f},
            {-6.0f,  29.0f, 40.0f, 70.0f, 30.0f},
            {-6.0f,  71.0f, 45.0f, 70.0f, 30.0f},
            {-6.0f,  100.0f, 50.0f, 70.0f, 30.0f},
            {-6.0f,  71.0f, 55.0f, 70.0f, 30.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 2: SHIMMER CRS - Ethereal shimmering chorus
    {
        .voices = {{
            {-3.0f, -70.0f, 8.0f, 80.0f, 60.0f},
            {-3.0f,  70.0f, 10.0f, 85.0f, 65.0f},
            {-6.0f, -50.0f, 12.0f, 75.0f, 55.0f},
            {-6.0f,  50.0f, 14.0f, 78.0f, 58.0f},
            {-9.0f, -30.0f, 16.0f, 70.0f, 50.0f},
            {-9.0f,  30.0f, 18.0f, 72.0f, 52.0f},
            {-12.0f, -10.0f, 20.0f, 65.0f, 45.0f},
            {-12.0f,  10.0f, 22.0f, 68.0f, 48.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -12.0f,
        .regenR = -12.0f,
        .hush = {true, -45.0f, 150.0f},
        .bypass = false
    },
    // 3: FLANGE - Classic flanging effect
    {
        .voices = {{
            {0.0f, -50.0f, 2.0f, 90.0f, 25.0f},
            {0.0f,  50.0f, 2.5f, 90.0f, 27.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},  // Off
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = 0.0f,
        .directLevelR = 0.0f,
        .regenL = -3.0f,
        .regenR = -3.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 4: DELAY FLANGE - Flanging with added delay
    {
        .voices = {{
            {-3.0f, -60.0f, 3.0f, 85.0f, 30.0f},
            {-3.0f,  60.0f, 3.5f, 85.0f, 32.0f},
            {-6.0f, -30.0f, 150.0f, 20.0f, 10.0f},
            {-6.0f,  30.0f, 200.0f, 20.0f, 10.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -6.0f,
        .regenR = -6.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 5: TAP DANCIN - Rhythmic tap delay chorus
    {
        .voices = {{
            {-6.0f, -80.0f, 50.0f, 30.0f, 35.0f},
            {-6.0f,  80.0f, 100.0f, 30.0f, 37.0f},
            {-9.0f, -60.0f, 150.0f, 25.0f, 33.0f},
            {-9.0f,  60.0f, 200.0f, 25.0f, 39.0f},
            {-12.0f, -40.0f, 250.0f, 20.0f, 31.0f},
            {-12.0f,  40.0f, 300.0f, 20.0f, 41.0f},
            {-15.0f, -20.0f, 350.0f, 15.0f, 29.0f},
            {-15.0f,  20.0f, 400.0f, 15.0f, 43.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -9.0f,
        .regenR = -9.0f,
        .hush = {true, -50.0f, 250.0f},
        .bypass = false
    },
    // 6: CRS 2 VOICE - Simple 2-voice chorus
    {
        .voices = {{
            {-3.0f, -60.0f, 12.0f, 55.0f, 45.0f},
            {-3.0f,  60.0f, 15.0f, 55.0f, 47.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -100.0f,
        .regenR = -100.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 7: CHORUS PONG - Ping-pong stereo chorus
    {
        .voices = {{
            {-3.0f, -100.0f, 80.0f, 40.0f, 40.0f},
            {-3.0f,  100.0f, 160.0f, 40.0f, 42.0f},
            {-6.0f, -100.0f, 240.0f, 35.0f, 38.0f},
            {-6.0f,  100.0f, 320.0f, 35.0f, 44.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -12.0f,
        .regenR = -12.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 8: CHORUS ECHO4 - 4-tap echo with chorus
    {
        .voices = {{
            {-3.0f, -70.0f, 100.0f, 45.0f, 42.0f},
            {-3.0f,  70.0f, 120.0f, 45.0f, 44.0f},
            {-6.0f, -40.0f, 200.0f, 40.0f, 40.0f},
            {-6.0f,  40.0f, 220.0f, 40.0f, 46.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -9.0f,
        .regenR = -9.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 9: OCTOPUS - 8-tentacle modulation
    {
        .voices = {{
            {-6.0f, -100.0f, 10.0f, 80.0f, 20.0f},
            {-6.0f, -71.0f, 25.0f, 75.0f, 35.0f},
            {-6.0f, -29.0f, 40.0f, 70.0f, 50.0f},
            {-6.0f,  0.0f, 55.0f, 65.0f, 65.0f},
            {-6.0f,  29.0f, 70.0f, 60.0f, 80.0f},
            {-6.0f,  71.0f, 85.0f, 55.0f, 95.0f},
            {-6.0f,  100.0f, 100.0f, 50.0f, 110.0f},
            {-9.0f,  71.0f, 115.0f, 45.0f, 125.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = -9.0f,
        .directLevelR = -9.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 10: LIQUIDCHORUS - Liquid flowing chorus
    {
        .voices = {{
            {-3.0f, -60.0f, 8.0f, 70.0f, 25.0f},
            {-3.0f,  60.0f, 11.0f, 72.0f, 27.0f},
            {-6.0f, -40.0f, 14.0f, 68.0f, 23.0f},
            {-6.0f,  40.0f, 17.0f, 70.0f, 29.0f},
            {-9.0f, -20.0f, 20.0f, 65.0f, 21.0f},
            {-9.0f,  20.0f, 23.0f, 67.0f, 31.0f},
            {-12.0f,  0.0f, 26.0f, 62.0f, 19.0f},
            {-12.0f,  0.0f, 29.0f, 64.0f, 33.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -18.0f,
        .regenR = -18.0f,
        .hush = {true, -45.0f, 180.0f},
        .bypass = false
    },
    // 11: SCATTERBRAIN - Random scatter effect
    {
        .voices = {{
            {-6.0f, -90.0f, 7.0f, 85.0f, 55.0f},
            {-6.0f,  45.0f, 23.0f, 60.0f, 78.0f},
            {-6.0f, -30.0f, 67.0f, 45.0f, 102.0f},
            {-6.0f,  75.0f, 112.0f, 70.0f, 33.0f},
            {-9.0f, -60.0f, 189.0f, 55.0f, 145.0f},
            {-9.0f,  15.0f, 234.0f, 80.0f, 67.0f},
            {-9.0f, -15.0f, 298.0f, 40.0f, 189.0f},
            {-12.0f,  90.0f, 378.0f, 65.0f, 22.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -12.0f,
        .regenR = -12.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 12: HAWAIIN CRS - Hawaiian guitar shimmer
    {
        .voices = {{
            {-3.0f, -50.0f, 10.0f, 65.0f, 50.0f},
            {-3.0f,  50.0f, 13.0f, 68.0f, 55.0f},
            {-6.0f, -30.0f, 16.0f, 60.0f, 45.0f},
            {-6.0f,  30.0f, 19.0f, 63.0f, 60.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 13: SLOW CRS+REV - Slow wash chorus
    {
        .voices = {{
            {-3.0f, -70.0f, 25.0f, 80.0f, 15.0f},
            {-3.0f,  70.0f, 30.0f, 82.0f, 17.0f},
            {-6.0f, -50.0f, 35.0f, 75.0f, 13.0f},
            {-6.0f,  50.0f, 40.0f, 77.0f, 19.0f},
            {-9.0f, -30.0f, 45.0f, 70.0f, 11.0f},
            {-9.0f,  30.0f, 50.0f, 72.0f, 21.0f},
            {-12.0f, -10.0f, 55.0f, 65.0f, 9.0f},
            {-12.0f,  10.0f, 60.0f, 67.0f, 23.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -9.0f,
        .regenR = -9.0f,
        .hush = {true, -50.0f, 300.0f},
        .bypass = false
    },
    // 14: FLANGE VERB - Flanging with reverb feel
    {
        .voices = {{
            {0.0f, -40.0f, 2.0f, 85.0f, 20.0f},
            {0.0f,  40.0f, 2.5f, 87.0f, 22.0f},
            {-6.0f, -60.0f, 50.0f, 30.0f, 15.0f},
            {-6.0f,  60.0f, 70.0f, 32.0f, 17.0f},
            {-9.0f, -80.0f, 90.0f, 25.0f, 13.0f},
            {-9.0f,  80.0f, 110.0f, 27.0f, 19.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -6.0f,
        .regenR = -6.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 15: CLASSIC STEREO - Classic stereo chorus
    {
        .voices = {{
            {-3.0f, -80.0f, 10.0f, 50.0f, 40.0f},
            {-3.0f,  80.0f, 12.0f, 52.0f, 42.0f},
            {-6.0f, -50.0f, 14.0f, 48.0f, 38.0f},
            {-6.0f,  50.0f, 16.0f, 50.0f, 44.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -100.0f,
        .regenR = -100.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 16: THICK CHORUS - Thick detuned chorus
    {
        .voices = {{
            {-3.0f, -90.0f, 8.0f, 75.0f, 35.0f},
            {-3.0f,  90.0f, 9.0f, 77.0f, 37.0f},
            {-3.0f, -60.0f, 10.0f, 73.0f, 33.0f},
            {-3.0f,  60.0f, 11.0f, 75.0f, 39.0f},
            {-6.0f, -30.0f, 12.0f, 70.0f, 31.0f},
            {-6.0f,  30.0f, 13.0f, 72.0f, 41.0f},
            {-6.0f,   0.0f, 14.0f, 68.0f, 29.0f},
            {-9.0f,   0.0f, 15.0f, 70.0f, 43.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {true, -45.0f, 200.0f},
        .bypass = false
    },
    // 17: ANALOG WARM - Warm analog-style chorus
    {
        .voices = {{
            {-3.0f, -70.0f, 15.0f, 45.0f, 30.0f},
            {-3.0f,  70.0f, 18.0f, 47.0f, 32.0f},
            {-6.0f, -40.0f, 21.0f, 43.0f, 28.0f},
            {-6.0f,  40.0f, 24.0f, 45.0f, 34.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -20.0f,
        .regenR = -20.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 18: DIMENSION - Dimensional space chorus
    {
        .voices = {{
            {-6.0f, -100.0f, 5.0f, 60.0f, 45.0f},
            {-6.0f,  100.0f, 7.0f, 62.0f, 47.0f},
            {-6.0f, -70.0f, 20.0f, 55.0f, 43.0f},
            {-6.0f,  70.0f, 25.0f, 57.0f, 49.0f},
            {-9.0f, -40.0f, 40.0f, 50.0f, 41.0f},
            {-9.0f,  40.0f, 50.0f, 52.0f, 51.0f},
            {-12.0f, -10.0f, 70.0f, 45.0f, 39.0f},
            {-12.0f,  10.0f, 85.0f, 47.0f, 53.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -12.0f,
        .regenR = -12.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 19: JET FLANGE - Jet plane flanging
    {
        .voices = {{
            {0.0f, -60.0f, 1.0f, 95.0f, 15.0f},
            {0.0f,  60.0f, 1.2f, 95.0f, 17.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = 0.0f,
        .directLevelR = 0.0f,
        .regenL = -1.0f,
        .regenR = -1.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 20: TAPE CHORUS - Tape machine chorus
    {
        .voices = {{
            {-3.0f, -65.0f, 20.0f, 40.0f, 25.0f},
            {-3.0f,  65.0f, 23.0f, 42.0f, 27.0f},
            {-6.0f, -35.0f, 26.0f, 38.0f, 23.0f},
            {-6.0f,  35.0f, 29.0f, 40.0f, 29.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -25.0f,
        .regenR = -25.0f,
        .hush = {true, -50.0f, 250.0f},
        .bypass = false
    },
    // 21: ROTARY SIM - Leslie rotary simulation
    {
        .voices = {{
            {-3.0f, -80.0f, 5.0f, 70.0f, 100.0f},
            {-3.0f,  80.0f, 7.0f, 72.0f, 102.0f},
            {-6.0f, -50.0f, 10.0f, 65.0f, 98.0f},
            {-6.0f,  50.0f, 13.0f, 67.0f, 104.0f},
            {-9.0f, -20.0f, 16.0f, 60.0f, 96.0f},
            {-9.0f,  20.0f, 19.0f, 62.0f, 106.0f},
            {-12.0f,  0.0f, 22.0f, 55.0f, 94.0f},
            {-12.0f,  0.0f, 25.0f, 57.0f, 108.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -18.0f,
        .regenR = -18.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 22: MICRO SHIFT - Micropitch detune effect
    {
        .voices = {{
            {-3.0f, -80.0f, 3.0f, 15.0f, 60.0f},
            {-3.0f,  80.0f, 4.0f, 17.0f, 62.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = 0.0f,
        .directLevelR = 0.0f,
        .regenL = -100.0f,
        .regenR = -100.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 23: WIDE STEREO - Ultra-wide stereo spread
    {
        .voices = {{
            {-3.0f, -100.0f, 8.0f, 60.0f, 40.0f},
            {-3.0f,  100.0f, 10.0f, 62.0f, 42.0f},
            {-6.0f, -100.0f, 15.0f, 55.0f, 38.0f},
            {-6.0f,  100.0f, 18.0f, 57.0f, 44.0f},
            {-9.0f, -100.0f, 25.0f, 50.0f, 36.0f},
            {-9.0f,  100.0f, 30.0f, 52.0f, 46.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 24: ENSEMBLE - String ensemble effect
    {
        .voices = {{
            {-6.0f, -90.0f, 6.0f, 55.0f, 50.0f},
            {-6.0f,  90.0f, 7.0f, 57.0f, 52.0f},
            {-6.0f, -60.0f, 9.0f, 53.0f, 48.0f},
            {-6.0f,  60.0f, 10.0f, 55.0f, 54.0f},
            {-6.0f, -30.0f, 12.0f, 51.0f, 46.0f},
            {-6.0f,  30.0f, 13.0f, 53.0f, 56.0f},
            {-9.0f,   0.0f, 15.0f, 49.0f, 44.0f},
            {-9.0f,   0.0f, 16.0f, 51.0f, 58.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -100.0f,
        .regenR = -100.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 25: VINTAGE MOD - Vintage modulation
    {
        .voices = {{
            {-3.0f, -70.0f, 12.0f, 50.0f, 35.0f},
            {-3.0f,  70.0f, 15.0f, 52.0f, 37.0f},
            {-6.0f, -40.0f, 18.0f, 48.0f, 33.0f},
            {-6.0f,  40.0f, 21.0f, 50.0f, 39.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -3.0f,
        .directLevelR = -3.0f,
        .regenL = -20.0f,
        .regenR = -20.0f,
        .hush = {true, -48.0f, 180.0f},
        .bypass = false
    },
    // 26: CHORUS HALL - Chorus with hall ambience
    {
        .voices = {{
            {-6.0f, -80.0f, 30.0f, 50.0f, 25.0f},
            {-6.0f,  80.0f, 40.0f, 52.0f, 27.0f},
            {-9.0f, -60.0f, 80.0f, 40.0f, 23.0f},
            {-9.0f,  60.0f, 100.0f, 42.0f, 29.0f},
            {-12.0f, -40.0f, 150.0f, 30.0f, 21.0f},
            {-12.0f,  40.0f, 180.0f, 32.0f, 31.0f},
            {-15.0f, -20.0f, 220.0f, 20.0f, 19.0f},
            {-15.0f,  20.0f, 260.0f, 22.0f, 33.0f},
        }},
        .chorusLevel = 0.0f,
        .directLevelL = -6.0f,
        .directLevelR = -6.0f,
        .regenL = -9.0f,
        .regenR = -9.0f,
        .hush = {true, -50.0f, 350.0f},
        .bypass = false
    },
    // 27: PHASE CHORUS - Phaser-like chorus
    {
        .voices = {{
            {-3.0f, -50.0f, 1.5f, 80.0f, 60.0f},
            {-3.0f,  50.0f, 2.0f, 82.0f, 62.0f},
            {-6.0f, -30.0f, 2.5f, 78.0f, 58.0f},
            {-6.0f,  30.0f, 3.0f, 80.0f, 64.0f},
            {-9.0f, -10.0f, 3.5f, 76.0f, 56.0f},
            {-9.0f,  10.0f, 4.0f, 78.0f, 66.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = 0.0f,
        .directLevelR = 0.0f,
        .regenL = -6.0f,
        .regenR = -6.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 28: CRYSTAL - Crystal clear shimmer
    {
        .voices = {{
            {-3.0f, -85.0f, 5.0f, 90.0f, 70.0f},
            {-3.0f,  85.0f, 6.0f, 92.0f, 72.0f},
            {-6.0f, -55.0f, 8.0f, 85.0f, 68.0f},
            {-6.0f,  55.0f, 9.0f, 87.0f, 74.0f},
            {-9.0f, -25.0f, 11.0f, 80.0f, 66.0f},
            {-9.0f,  25.0f, 12.0f, 82.0f, 76.0f},
            {-12.0f,  0.0f, 14.0f, 75.0f, 64.0f},
            {-12.0f,  0.0f, 15.0f, 77.0f, 78.0f},
        }},
        .chorusLevel = 3.0f,
        .directLevelL = -9.0f,
        .directLevelR = -9.0f,
        .regenL = -15.0f,
        .regenR = -15.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = false
    },
    // 29: BYPASS - Effect bypassed
    {
        .voices = {{
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
            {-100.0f, 0.0f, 0.0f, 0.0f, 0.0f},
        }},
        .chorusLevel = -100.0f,
        .directLevelL = 0.0f,
        .directLevelR = 0.0f,
        .regenL = -100.0f,
        .regenR = -100.0f,
        .hush = {false, -40.0f, 200.0f},
        .bypass = true
    },
};

// ========================================
// Constructor
// ========================================

IntelliFX8VoiceChorusProcessor::IntelliFX8VoiceChorusProcessor() {
    // Initialize LFO phase meters
    for (int i = 0; i < NUM_VOICES; ++i) {
        meterVoiceLfoPhases_[i].store(0.0f);
    }
}

// ========================================
// Initialization
// ========================================

void IntelliFX8VoiceChorusProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;

    // Calculate buffer size for max delay (418ms + some headroom)
    int bufferSize = static_cast<int>(std::ceil(MAX_DELAY_MS * 0.001 * sampleRate)) + 1024;
    bufferSize = std::min(bufferSize, MAX_DELAY_SAMPLES);

    // Initialize voice states
    for (int v = 0; v < NUM_VOICES; ++v) {
        auto& state = voiceStates_[v];

        state.delayBufferL.resize(bufferSize, 0.0f);
        state.delayBufferR.resize(bufferSize, 0.0f);
        state.writePos = 0;
        state.lfoPhase = static_cast<double>(v) / NUM_VOICES;  // Stagger LFO phases

        // Initialize smoothed values
        state.smoothedDelay.reset(sampleRate, 0.01);  // 10ms smoothing
        state.smoothedLevel.reset(sampleRate, 0.01);
        state.smoothedPanL.reset(sampleRate, 0.01);
        state.smoothedPanR.reset(sampleRate, 0.01);

        // Set initial values from atomics
        float delay = voiceParams_[v].delay.load();
        float level = voiceParams_[v].level.load();
        float pan = voiceParams_[v].pan.load();

        state.smoothedDelay.setCurrentAndTargetValue(delay);
        state.smoothedLevel.setCurrentAndTargetValue(dbToLinear(level));
        state.smoothedPanL.setCurrentAndTargetValue(panToGainL(pan));
        state.smoothedPanR.setCurrentAndTargetValue(panToGainR(pan));
    }

    // Initialize global smoothed values
    smoothedChorusLevel_.reset(sampleRate, 0.01);
    smoothedDirectL_.reset(sampleRate, 0.01);
    smoothedDirectR_.reset(sampleRate, 0.01);
    smoothedRegenL_.reset(sampleRate, 0.01);
    smoothedRegenR_.reset(sampleRate, 0.01);

    smoothedChorusLevel_.setCurrentAndTargetValue(dbToLinear(chorusLevel_.load()));
    smoothedDirectL_.setCurrentAndTargetValue(dbToLinear(directLevelL_.load()));
    smoothedDirectR_.setCurrentAndTargetValue(dbToLinear(directLevelR_.load()));
    smoothedRegenL_.setCurrentAndTargetValue(dbToLinear(regenL_.load()));
    smoothedRegenR_.setCurrentAndTargetValue(dbToLinear(regenR_.load()));

    prepared_ = true;
}

void IntelliFX8VoiceChorusProcessor::reset() {
    for (auto& state : voiceStates_) {
        std::fill(state.delayBufferL.begin(), state.delayBufferL.end(), 0.0f);
        std::fill(state.delayBufferR.begin(), state.delayBufferR.end(), 0.0f);
        state.writePos = 0;
    }

    lastRegenSampleL_ = 0.0f;
    lastRegenSampleR_ = 0.0f;
    hushEnvelope_ = 0.0f;

    resetPeaks();
}

// ========================================
// Processing
// ========================================

void IntelliFX8VoiceChorusProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (numChannels < 2) return;  // Stereo only

    float* dataL = buffer.getWritePointer(0);
    float* dataR = buffer.getWritePointer(1);

    // Measure input levels
    float inputPeakL = calculatePeakLevel(dataL, numSamples);
    float inputPeakR = calculatePeakLevel(dataR, numSamples);
    meterInputL_.store(linearToDb(inputPeakL));
    meterInputR_.store(linearToDb(inputPeakR));

    // Check bypass
    if (bypass_.load()) {
        meterOutputL_.store(linearToDb(inputPeakL));
        meterOutputR_.store(linearToDb(inputPeakR));
        meterChorusL_.store(-100.0f);
        meterChorusR_.store(-100.0f);
        return;
    }

    // Update smoothed target values from atomics
    smoothedChorusLevel_.setTargetValue(dbToLinear(chorusLevel_.load()));
    smoothedDirectL_.setTargetValue(dbToLinear(directLevelL_.load()));
    smoothedDirectR_.setTargetValue(dbToLinear(directLevelR_.load()));
    smoothedRegenL_.setTargetValue(dbToLinear(regenL_.load()));
    smoothedRegenR_.setTargetValue(dbToLinear(regenR_.load()));

    // Update per-voice smoothed values
    for (int v = 0; v < NUM_VOICES; ++v) {
        auto& state = voiceStates_[v];
        state.smoothedDelay.setTargetValue(voiceParams_[v].delay.load());
        state.smoothedLevel.setTargetValue(dbToLinear(voiceParams_[v].level.load()));
        float pan = voiceParams_[v].pan.load();
        state.smoothedPanL.setTargetValue(panToGainL(pan));
        state.smoothedPanR.setTargetValue(panToGainR(pan));
    }

    // HUSH parameters
    const bool hushEnabled = hushEnabled_.load();
    const float hushThreshold = hushThreshold_.load();
    const float hushRelease = hushReleaseRate_.load();
    const float hushReleaseCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * hushRelease * 0.001f));
    const float hushThresholdLinear = dbToLinear(hushThreshold);

    // Process sample by sample
    float chorusPeakL = 0.0f, chorusPeakR = 0.0f;
    float outputPeakL = 0.0f, outputPeakR = 0.0f;

    for (int i = 0; i < numSamples; ++i) {
        float inputL = dataL[i];
        float inputR = dataR[i];

        // Add regeneration feedback
        inputL += lastRegenSampleL_ * smoothedRegenL_.getNextValue();
        inputR += lastRegenSampleR_ * smoothedRegenR_.getNextValue();

        // HUSH processing
        float hushGain = 1.0f;
        if (hushEnabled) {
            float inputLevel = std::max(std::abs(inputL), std::abs(inputR));

            if (inputLevel > hushEnvelope_) {
                hushEnvelope_ = inputLevel;
            } else {
                hushEnvelope_ = hushEnvelope_ * hushReleaseCoeff;
            }

            // Expander - reduce gain when below threshold
            if (hushEnvelope_ < hushThresholdLinear) {
                float ratio = hushEnvelope_ / hushThresholdLinear;
                hushGain = std::pow(ratio, 2.0f);  // 2:1 expansion
                hushGain = std::max(hushGain, 0.001f);  // Floor at -60dB
            }

            inputL *= hushGain;
            inputR *= hushGain;
        }

        // Accumulate chorus from all voices
        float chorusL = 0.0f, chorusR = 0.0f;

        for (int v = 0; v < NUM_VOICES; ++v) {
            auto& state = voiceStates_[v];
            auto& params = voiceParams_[v];

            // Get smoothed parameters
            float delay = state.smoothedDelay.getNextValue();
            float level = state.smoothedLevel.getNextValue();
            float panL = state.smoothedPanL.getNextValue();
            float panR = state.smoothedPanR.getNextValue();

            // Skip if voice is effectively off
            if (level < 0.001f) {
                continue;
            }

            // Get LFO modulation
            float depth = params.depth.load();
            float rate = params.rate.load();
            float lfoHz = rateToHz(rate);

            // Update LFO phase
            state.lfoPhase += lfoHz / sampleRate_;
            if (state.lfoPhase >= 1.0) state.lfoPhase -= 1.0;

            // Calculate modulated delay
            float lfoValue = static_cast<float>(std::sin(state.lfoPhase * 2.0 * M_PI));
            float modulatedDelay = delay + (lfoValue * depth * 0.01f * delay);
            modulatedDelay = std::clamp(modulatedDelay, 0.1f, MAX_DELAY_MS);

            // Convert to samples
            float delaySamples = modulatedDelay * 0.001f * static_cast<float>(sampleRate_);

            // Write to delay line
            int bufferSize = static_cast<int>(state.delayBufferL.size());
            if (bufferSize < 2) {
                continue;
            }
            if (state.writePos < 0 || state.writePos >= bufferSize) {
                state.writePos = 0;
            }
            state.delayBufferL[state.writePos] = inputL;
            state.delayBufferR[state.writePos] = inputR;

            // Read from delay line with interpolation
            float delayedL = readDelayLine(state.delayBufferL, state.writePos, delaySamples);
            float delayedR = readDelayLine(state.delayBufferR, state.writePos, delaySamples);

            // Apply level and pan
            chorusL += delayedL * level * panL;
            chorusR += delayedR * level * panR;

            // Advance write position
            state.writePos = (state.writePos + 1) % bufferSize;

            // Store LFO phase for metering
            meterVoiceLfoPhases_[v].store(static_cast<float>(state.lfoPhase));
        }

        // Apply chorus level
        float chorusGain = smoothedChorusLevel_.getNextValue();
        chorusL *= chorusGain;
        chorusR *= chorusGain;

        // Store for regeneration
        lastRegenSampleL_ = chorusL;
        lastRegenSampleR_ = chorusR;

        // Mix with direct signal
        float directL = inputL * smoothedDirectL_.getNextValue();
        float directR = inputR * smoothedDirectR_.getNextValue();

        float outL = directL + chorusL;
        float outR = directR + chorusR;

        // Track peaks
        chorusPeakL = std::max(chorusPeakL, std::abs(chorusL));
        chorusPeakR = std::max(chorusPeakR, std::abs(chorusR));
        outputPeakL = std::max(outputPeakL, std::abs(outL));
        outputPeakR = std::max(outputPeakR, std::abs(outR));

        // Write output
        dataL[i] = outL;
        dataR[i] = outR;
    }

    // Store metering
    meterChorusL_.store(linearToDb(chorusPeakL));
    meterChorusR_.store(linearToDb(chorusPeakR));
    meterOutputL_.store(linearToDb(outputPeakL));
    meterOutputR_.store(linearToDb(outputPeakR));
    meterHushGR_.store(hushEnabled ? linearToDb(hushEnvelope_ / dbToLinear(hushThreshold_.load())) : 0.0f);
}

// ========================================
// Voice Parameter Control
// ========================================

void IntelliFX8VoiceChorusProcessor::setVoiceLevel(int voice, float dB) {
    if (voice < 0 || voice >= NUM_VOICES) return;
    dB = std::clamp(dB, -100.0f, 0.0f);
    voiceParams_[voice].level.store(dB);
}

float IntelliFX8VoiceChorusProcessor::getVoiceLevel(int voice) const {
    if (voice < 0 || voice >= NUM_VOICES) return -100.0f;
    return voiceParams_[voice].level.load();
}

void IntelliFX8VoiceChorusProcessor::setVoicePan(int voice, float pan) {
    if (voice < 0 || voice >= NUM_VOICES) return;
    pan = std::clamp(pan, -100.0f, 100.0f);
    voiceParams_[voice].pan.store(pan);
}

float IntelliFX8VoiceChorusProcessor::getVoicePan(int voice) const {
    if (voice < 0 || voice >= NUM_VOICES) return 0.0f;
    return voiceParams_[voice].pan.load();
}

void IntelliFX8VoiceChorusProcessor::setVoiceDelay(int voice, float ms) {
    if (voice < 0 || voice >= NUM_VOICES) return;
    ms = std::clamp(ms, 0.0f, MAX_DELAY_MS);
    voiceParams_[voice].delay.store(ms);
}

float IntelliFX8VoiceChorusProcessor::getVoiceDelay(int voice) const {
    if (voice < 0 || voice >= NUM_VOICES) return 0.0f;
    return voiceParams_[voice].delay.load();
}

void IntelliFX8VoiceChorusProcessor::setVoiceDepth(int voice, float depth) {
    if (voice < 0 || voice >= NUM_VOICES) return;
    depth = std::clamp(depth, 0.0f, 100.0f);
    voiceParams_[voice].depth.store(depth);
}

float IntelliFX8VoiceChorusProcessor::getVoiceDepth(int voice) const {
    if (voice < 0 || voice >= NUM_VOICES) return 0.0f;
    return voiceParams_[voice].depth.load();
}

void IntelliFX8VoiceChorusProcessor::setVoiceRate(int voice, float rate) {
    if (voice < 0 || voice >= NUM_VOICES) return;
    rate = std::clamp(rate, 0.0f, MAX_RATE);
    voiceParams_[voice].rate.store(rate);
}

float IntelliFX8VoiceChorusProcessor::getVoiceRate(int voice) const {
    if (voice < 0 || voice >= NUM_VOICES) return 0.0f;
    return voiceParams_[voice].rate.load();
}

IntelliFX8VoiceChorusProcessor::VoiceParameters
IntelliFX8VoiceChorusProcessor::getVoiceParameters(int voice) const {
    VoiceParameters params;
    if (voice < 0 || voice >= NUM_VOICES) return params;

    params.level = voiceParams_[voice].level.load();
    params.pan = voiceParams_[voice].pan.load();
    params.delay = voiceParams_[voice].delay.load();
    params.depth = voiceParams_[voice].depth.load();
    params.rate = voiceParams_[voice].rate.load();

    return params;
}

void IntelliFX8VoiceChorusProcessor::setVoiceParameters(int voice, const VoiceParameters& params) {
    if (voice < 0 || voice >= NUM_VOICES) return;

    setVoiceLevel(voice, params.level);
    setVoicePan(voice, params.pan);
    setVoiceDelay(voice, params.delay);
    setVoiceDepth(voice, params.depth);
    setVoiceRate(voice, params.rate);
}

// ========================================
// Global Mixer Control
// ========================================

void IntelliFX8VoiceChorusProcessor::setChorusLevel(float dB) {
    dB = std::clamp(dB, -100.0f, 6.0f);
    chorusLevel_.store(dB);
}

void IntelliFX8VoiceChorusProcessor::setDirectLevelL(float dB) {
    dB = std::clamp(dB, -100.0f, 6.0f);
    directLevelL_.store(dB);
}

void IntelliFX8VoiceChorusProcessor::setDirectLevelR(float dB) {
    dB = std::clamp(dB, -100.0f, 6.0f);
    directLevelR_.store(dB);
}

void IntelliFX8VoiceChorusProcessor::setRegenL(float dB) {
    dB = std::clamp(dB, -100.0f, 0.0f);
    regenL_.store(dB);
}

void IntelliFX8VoiceChorusProcessor::setRegenR(float dB) {
    dB = std::clamp(dB, -100.0f, 0.0f);
    regenR_.store(dB);
}

// ========================================
// HUSH Control
// ========================================

void IntelliFX8VoiceChorusProcessor::setHushEnabled(bool enabled) {
    hushEnabled_.store(enabled);
}

void IntelliFX8VoiceChorusProcessor::setHushThreshold(float dB) {
    dB = std::clamp(dB, -92.0f, -20.0f);
    hushThreshold_.store(dB);
}

void IntelliFX8VoiceChorusProcessor::setHushReleaseRate(float ms) {
    ms = std::clamp(ms, 25.0f, 800.0f);
    hushReleaseRate_.store(ms);
}

IntelliFX8VoiceChorusProcessor::HushParameters
IntelliFX8VoiceChorusProcessor::getHushParameters() const {
    HushParameters params;
    params.enabled = hushEnabled_.load();
    params.threshold = hushThreshold_.load();
    params.releaseRate = hushReleaseRate_.load();
    return params;
}

void IntelliFX8VoiceChorusProcessor::setHushParameters(const HushParameters& params) {
    setHushEnabled(params.enabled);
    setHushThreshold(params.threshold);
    setHushReleaseRate(params.releaseRate);
}

// ========================================
// Master Control
// ========================================

void IntelliFX8VoiceChorusProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Bulk Parameter Access
// ========================================

IntelliFX8VoiceChorusProcessor::Parameters
IntelliFX8VoiceChorusProcessor::getParameters() const {
    Parameters params;

    for (int v = 0; v < NUM_VOICES; ++v) {
        params.voices[v] = getVoiceParameters(v);
    }

    params.chorusLevel = chorusLevel_.load();
    params.directLevelL = directLevelL_.load();
    params.directLevelR = directLevelR_.load();
    params.regenL = regenL_.load();
    params.regenR = regenR_.load();
    params.hush = getHushParameters();
    params.bypass = bypass_.load();

    return params;
}

void IntelliFX8VoiceChorusProcessor::setParameters(const Parameters& params) {
    for (int v = 0; v < NUM_VOICES; ++v) {
        setVoiceParameters(v, params.voices[v]);
    }

    setChorusLevel(params.chorusLevel);
    setDirectLevelL(params.directLevelL);
    setDirectLevelR(params.directLevelR);
    setRegenL(params.regenL);
    setRegenR(params.regenR);
    setHushParameters(params.hush);
    setBypass(params.bypass);
}

// ========================================
// Presets
// ========================================

IntelliFX8VoiceChorusProcessor::PresetInfo
IntelliFX8VoiceChorusProcessor::getPresetInfo(int index) {
    if (index < 0 || index >= NUM_PRESETS) {
        return {0, "Unknown", "Unknown", "Unknown preset"};
    }
    return PRESET_INFO[index];
}

void IntelliFX8VoiceChorusProcessor::loadPreset(int index) {
    if (index < 0 || index >= NUM_PRESETS) return;

    setParameters(PRESET_PARAMS[index]);
    currentPreset_.store(index);
}

const IntelliFX8VoiceChorusProcessor::Parameters&
IntelliFX8VoiceChorusProcessor::getPresetParameters(int index) {
    if (index < 0 || index >= NUM_PRESETS) {
        return PRESET_PARAMS[0];
    }
    return PRESET_PARAMS[index];
}

// ========================================
// Metering
// ========================================

IntelliFX8VoiceChorusProcessor::Metering
IntelliFX8VoiceChorusProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = meterInputL_.load();
    m.inputLevelR = meterInputR_.load();
    m.outputLevelL = meterOutputL_.load();
    m.outputLevelR = meterOutputR_.load();
    m.chorusLevelL = meterChorusL_.load();
    m.chorusLevelR = meterChorusR_.load();
    m.hushGainReduction = meterHushGR_.load();

    for (int v = 0; v < NUM_VOICES; ++v) {
        m.voiceLfoPhases[v] = meterVoiceLfoPhases_[v].load();
    }

    return m;
}

void IntelliFX8VoiceChorusProcessor::resetPeaks() {
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterChorusL_.store(-100.0f);
    meterChorusR_.store(-100.0f);
    meterHushGR_.store(0.0f);
}

// ========================================
// Helper Methods
// ========================================

float IntelliFX8VoiceChorusProcessor::rateToHz(float rate) const {
    // IntelliFX rate 0-254 maps to approximately 0.05Hz to 10Hz
    // Using exponential mapping for musical feel
    rate = std::clamp(rate, 0.0f, MAX_RATE);
    float normalized = rate / MAX_RATE;
    return 0.05f * std::pow(200.0f, normalized);
}

float IntelliFX8VoiceChorusProcessor::readDelayLine(const std::vector<float>& buffer,
                                                     int writePos, float delaySamples) const {
    int bufferSize = static_cast<int>(buffer.size());
    if (bufferSize <= 0) {
        return 0.0f;
    }
    if (bufferSize == 1) {
        return buffer[0];
    }
    if (writePos < 0 || writePos >= bufferSize) {
        writePos = 0;
    }
    if (!std::isfinite(delaySamples)) {
        delaySamples = 0.0f;
    }
    delaySamples = std::clamp(delaySamples, 0.0f, static_cast<float>(bufferSize - 1));

    // Calculate read position with fractional part
    float readPos = static_cast<float>(writePos) - delaySamples;
    float wrappedReadPos = std::fmod(readPos, static_cast<float>(bufferSize));
    if (wrappedReadPos < 0.0f) {
        wrappedReadPos += static_cast<float>(bufferSize);
    }
    wrappedReadPos = std::min(wrappedReadPos, static_cast<float>(bufferSize - 1));

    int readIndex = static_cast<int>(wrappedReadPos);
    readIndex = std::clamp(readIndex, 0, bufferSize - 1);
    float frac = wrappedReadPos - static_cast<float>(readIndex);

    // Linear interpolation
    int nextIndex = (readIndex + 1) % bufferSize;
    return buffer[readIndex] * (1.0f - frac) + buffer[nextIndex] * frac;
}

float IntelliFX8VoiceChorusProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float IntelliFX8VoiceChorusProcessor::dbToLinear(float db) {
    if (db <= -100.0f) return 0.0f;
    return std::pow(10.0f, db / 20.0f);
}

float IntelliFX8VoiceChorusProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return peak;
}

float IntelliFX8VoiceChorusProcessor::panToGainL(float pan) {
    // Pan: -100 (full left) to +100 (full right)
    // Uses constant power panning
    float normalized = (pan + 100.0f) / 200.0f;  // 0 to 1
    return std::cos(normalized * M_PI * 0.5f);
}

float IntelliFX8VoiceChorusProcessor::panToGainR(float pan) {
    float normalized = (pan + 100.0f) / 200.0f;  // 0 to 1
    return std::sin(normalized * M_PI * 0.5f);
}

} // namespace map2
