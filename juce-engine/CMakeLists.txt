cmake_minimum_required(VERSION 3.22)
project(map2_audio_engine VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Options
option(USE_JUCE_AUDIO "Use JUCE for audio I/O (recommended)" ON)
option(USE_LEGACY_LV2 "Keep legacy LV2 support via lilv" ON)
option(JUCE_PLUGINHOST_VST3 "Enable VST3 plugin hosting" ON)
option(JUCE_PLUGINHOST_AU "Enable AudioUnit plugin hosting (macOS)" ON)
option(JUCE_PLUGINHOST_LV2 "Enable LV2 plugin hosting via JUCE" ON)
option(JUCE_PLUGINHOST_LADSPA "Enable LADSPA plugin hosting" ON)

# ========================================
# JUCE Framework Integration
# ========================================
include(FetchContent)

message(STATUS "Fetching JUCE framework...")
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.0
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(JUCE)

# ========================================
# Python/pybind11
# ========================================
find_package(Python3 REQUIRED COMPONENTS Interpreter Development)
find_package(pybind11 CONFIG QUIET)

if(NOT pybind11_FOUND)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
        pkg_check_modules(PYBIND11 pybind11)
    endif()

    if(NOT PYBIND11_FOUND)
        message(STATUS "Fetching pybind11...")
        FetchContent_Declare(
            pybind11
            GIT_REPOSITORY https://github.com/pybind/pybind11.git
            GIT_TAG v2.11.1
            GIT_SHALLOW TRUE
        )
        FetchContent_MakeAvailable(pybind11)
    endif()
endif()

# ========================================
# Platform-specific dependencies
# ========================================
find_package(PkgConfig REQUIRED)

# ALSA (Linux) - still needed for MIDI on Linux
if(UNIX AND NOT APPLE)
    pkg_check_modules(ALSA REQUIRED alsa)
endif()

# JACK (optional)
pkg_check_modules(JACK jack)

# Legacy LV2 support via lilv (optional fallback)
if(USE_LEGACY_LV2)
    pkg_check_modules(LILV lilv-0)
    if(LILV_FOUND)
        message(STATUS "Legacy LV2 support via lilv: ENABLED")
    else()
        message(STATUS "Legacy LV2 support via lilv: DISABLED (lilv not found)")
        set(USE_LEGACY_LV2 OFF)
    endif()
endif()

# ========================================
# Source files - JUCE-based engine
# ========================================
set(SOURCES
    # Core engine
    Source/Map2AudioEngine.cpp

    # JUCE-based components (new)
    Source/JuceAudioIO.cpp
    Source/JucePluginHost.cpp
    Source/JuceAudioGraph.cpp

    # Enhanced audio processing (new)
    Source/ConvolutionProcessor.cpp
    Source/SpectrumAnalyzer.cpp
    Source/LufsMeter.cpp
    Source/PhaseCorrelation.cpp
    Source/CPUMonitor.cpp

    # Existing components (updated)
    Source/MidiHandler.cpp
    Source/VuMeter.cpp
    Source/ParameterBridge.cpp
    Source/SnapshotManager.cpp

    # Python bindings
    Source/PythonBindings.cpp
)

set(HEADERS
    Source/Common.h
    Source/Map2AudioEngine.h

    # JUCE-based components
    Source/JuceAudioIO.h
    Source/JucePluginHost.h
    Source/JuceAudioGraph.h

    # Enhanced audio processing
    Source/ConvolutionProcessor.h
    Source/SpectrumAnalyzer.h
    Source/LufsMeter.h
    Source/PhaseCorrelation.h
    Source/CPUMonitor.h

    # Existing components
    Source/MidiHandler.h
    Source/VuMeter.h
    Source/ParameterBridge.h
    Source/SnapshotManager.h
)

# Legacy LV2 support files
if(USE_LEGACY_LV2)
    list(APPEND SOURCES Source/LegacyPluginHost.cpp)
    list(APPEND HEADERS Source/LegacyPluginHost.h)
endif()

# ========================================
# Create Python module
# ========================================
pybind11_add_module(map2_audio_engine ${SOURCES} ${HEADERS})

# ========================================
# Include directories
# ========================================
target_include_directories(map2_audio_engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Source
    ${Python3_INCLUDE_DIRS}
)

if(USE_LEGACY_LV2 AND LILV_FOUND)
    target_include_directories(map2_audio_engine PRIVATE ${LILV_INCLUDE_DIRS})
endif()

if(UNIX AND NOT APPLE)
    target_include_directories(map2_audio_engine PRIVATE ${ALSA_INCLUDE_DIRS})
endif()

# ========================================
# Link libraries
# ========================================
target_link_libraries(map2_audio_engine PRIVATE
    # JUCE modules
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_data_structures
    juce::juce_dsp
    juce::juce_events

    # System libraries
    pthread
    dl
    m
)

if(USE_LEGACY_LV2 AND LILV_FOUND)
    target_link_libraries(map2_audio_engine PRIVATE ${LILV_LIBRARIES})
endif()

if(UNIX AND NOT APPLE)
    target_link_libraries(map2_audio_engine PRIVATE ${ALSA_LIBRARIES})
endif()

if(JACK_FOUND)
    target_link_libraries(map2_audio_engine PRIVATE ${JACK_LIBRARIES})
endif()

# ========================================
# Compile definitions
# ========================================
target_compile_definitions(map2_audio_engine PRIVATE
    # Version
    MAP2_VERSION="${PROJECT_VERSION}"

    # JUCE configuration
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_USE_DARK_SPLASH_SCREEN=0

    # Plugin format support
    JUCE_PLUGINHOST_VST3=$<BOOL:${JUCE_PLUGINHOST_VST3}>
    JUCE_PLUGINHOST_AU=$<BOOL:${JUCE_PLUGINHOST_AU}>
    JUCE_PLUGINHOST_LV2=$<BOOL:${JUCE_PLUGINHOST_LV2}>
    JUCE_PLUGINHOST_LADSPA=$<BOOL:${JUCE_PLUGINHOST_LADSPA}>

    # Feature flags
    USE_JUCE_AUDIO=$<BOOL:${USE_JUCE_AUDIO}>
    USE_LEGACY_LV2=$<BOOL:${USE_LEGACY_LV2}>
)

if(JACK_FOUND)
    target_compile_definitions(map2_audio_engine PRIVATE HAS_JACK=1)
endif()

# ========================================
# Compiler flags
# ========================================
target_compile_options(map2_audio_engine PRIVATE
    -Wall -Wextra
    $<$<CONFIG:Release>:-O3 -DNDEBUG>
    $<$<CONFIG:Debug>:-g -O0>
)

# Suppress some JUCE-related warnings
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(map2_audio_engine PRIVATE
        -Wno-unused-parameter
        -Wno-sign-compare
    )
endif()

# ========================================
# Install
# ========================================
install(TARGETS map2_audio_engine
    LIBRARY DESTINATION ${Python3_SITELIB}
    COMPONENT python
)

# ========================================
# Print configuration summary
# ========================================
message(STATUS "")
message(STATUS "========================================")
message(STATUS "MAP2 Audio Engine Configuration:")
message(STATUS "========================================")
message(STATUS "  Version: ${PROJECT_VERSION}")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  Python: ${Python3_VERSION}")
message(STATUS "")
message(STATUS "JUCE Integration:")
message(STATUS "  JUCE Audio I/O: ${USE_JUCE_AUDIO}")
message(STATUS "  VST3 support: ${JUCE_PLUGINHOST_VST3}")
message(STATUS "  AudioUnit support: ${JUCE_PLUGINHOST_AU}")
message(STATUS "  LV2 support (JUCE): ${JUCE_PLUGINHOST_LV2}")
message(STATUS "  LADSPA support: ${JUCE_PLUGINHOST_LADSPA}")
message(STATUS "")
message(STATUS "Platform:")
if(UNIX AND NOT APPLE)
    message(STATUS "  ALSA: ${ALSA_VERSION}")
endif()
message(STATUS "  JACK: ${JACK_FOUND}")
message(STATUS "  Legacy LV2 (lilv): ${USE_LEGACY_LV2}")
message(STATUS "========================================")
message(STATUS "")
