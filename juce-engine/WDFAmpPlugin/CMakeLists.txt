cmake_minimum_required(VERSION 3.22)
project(WDFAmpPlugin VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Avoid LTO/IPO to prevent memory-heavy link crashes on this target
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION FALSE)

# Use the JUCE from parent juce-engine build (already fetched)
set(JUCE_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../build/_deps/juce-src")

# Point to pre-built juceaide to avoid rebuilding
set(JUCE_BUILD_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../build/_deps/juce-build")
set(JUCE_BUILD_HELPER_TOOLS OFF CACHE BOOL "Disable juceaide rebuild")
if(EXISTS "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide")
    set(JUCEAIDE_EXECUTABLE "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide" CACHE FILEPATH "Prebuilt juceaide")
endif()
if(EXISTS "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide")
    # Copy the entire JUCE build tree structure needed
    file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/juce/tools/extras/Build/juceaide/juceaide_artefacts/Debug")
    file(COPY "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide"
         DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/juce/tools/extras/Build/juceaide/juceaide_artefacts/Debug")
    message(STATUS "Copied pre-built juceaide to build directory")
endif()

if(EXISTS "${JUCE_SOURCE_DIR}/CMakeLists.txt")
    message(STATUS "Using existing JUCE from: ${JUCE_SOURCE_DIR}")
    add_subdirectory("${JUCE_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/juce" EXCLUDE_FROM_ALL)
else()
    message(STATUS "Fetching JUCE...")
    include(FetchContent)
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.4
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(JUCE)
endif()

# Plugin target
juce_add_plugin(WDFAmpPlugin
    COMPANY_NAME "MAP2Audio"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE Wdfa
    FORMATS Standalone LV2
    PRODUCT_NAME "WDFAmpSimulator"
    LV2URI "https://map2audio.com/wdf-amp"
)

# Source files
target_sources(WDFAmpPlugin
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        Source/WDF/WDFElements.cpp
        Source/WDF/WDFElements.h
        Source/WDF/WDFTriode.cpp
        Source/WDF/WDFTriode.h
        Source/WDF/WDFToneStack.cpp
        Source/WDF/WDFToneStack.h
        Source/Amps/AmpModel.h
        Source/Amps/Peavey5150.cpp
        Source/Amps/Peavey5150.h
        Source/Amps/Marshall800.cpp
        Source/Amps/Marshall800.h
        Source/Amps/MesaDualRectifier.cpp
        Source/Amps/MesaDualRectifier.h
        Source/DSP/Oversampler.cpp
        Source/DSP/Oversampler.h
        Source/UI/AmpKnob.cpp
        Source/UI/AmpKnob.h
        Source/UI/AmpSelector.cpp
        Source/UI/AmpSelector.h
)

target_compile_definitions(WDFAmpPlugin
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

# Force-disable LTO in case toolchain injects it
target_compile_options(WDFAmpPlugin PRIVATE -fno-lto)
target_link_options(WDFAmpPlugin PRIVATE -fno-lto)

target_link_libraries(WDFAmpPlugin
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags
)
