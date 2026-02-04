/*******************************************************************************
 * JucePluginDefines.h - Plugin configuration defines
 ******************************************************************************/

#pragma once

// Plugin identity
#define JucePlugin_Name                   "WDF Amp Simulator"
#define JucePlugin_Desc                   "Wave Digital Filter Tube Amplifier Simulator"
#define JucePlugin_Manufacturer           "MAP2Audio"
#define JucePlugin_ManufacturerWebsite    "https://map2audio.com"
#define JucePlugin_ManufacturerEmail      "info@map2audio.com"
#define JucePlugin_ManufacturerCode       0x4d617032  // 'Map2'
#define JucePlugin_PluginCode             0x57646661  // 'Wdfa'

// Plugin format flags
#define JucePlugin_IsSynth                0
#define JucePlugin_WantsMidiInput         0
#define JucePlugin_ProducesMidiOutput     0
#define JucePlugin_IsMidiEffect           0
#define JucePlugin_EditorRequiresKeyboardFocus  0

// Version
#define JucePlugin_Version                "1.0.0"
#define JucePlugin_VersionCode            0x10000
#define JucePlugin_VersionString          "1.0.0"

// VST
#define JucePlugin_VSTUniqueID            JucePlugin_PluginCode
#define JucePlugin_VSTCategory            kPlugCategEffect

// VST3
#define JucePlugin_Vst3Category           "Fx|Distortion"

// AU
#define JucePlugin_AUMainType             'aufx'
#define JucePlugin_AUSubType              JucePlugin_PluginCode
#define JucePlugin_AUExportPrefix         WDFAmpAU
#define JucePlugin_AUExportPrefixQuoted   "WDFAmpAU"
#define JucePlugin_AUManufacturerCode     JucePlugin_ManufacturerCode

// AAX
#define JucePlugin_AAXIdentifier          com.map2audio.wdfamp
#define JucePlugin_AAXManufacturerCode    JucePlugin_ManufacturerCode
#define JucePlugin_AAXProductId           JucePlugin_PluginCode
#define JucePlugin_AAXCategory            0x00000001
#define JucePlugin_AAXDisableMultiMono    0

// LV2
#define JucePlugin_LV2URI                 "https://map2audio.com/plugins/wdf-amp"
