cmake_minimum_required(VERSION 3.22)
project(map2_audio_engine VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# SIMD optimization: Enable native CPU optimizations for DSP performance
option(ENABLE_NATIVE_OPTIMIZATIONS "Enable -march=native for SIMD" ON)
if(ENABLE_NATIVE_OPTIMIZATIONS AND CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    # Detect and use best available SIMD instructions
    include(CheckCXXCompilerFlag)
    check_cxx_compiler_flag("-march=native" COMPILER_SUPPORTS_MARCH_NATIVE)
    if(COMPILER_SUPPORTS_MARCH_NATIVE)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -march=native")
        message(STATUS "SIMD: Enabled native CPU optimizations (-march=native)")
    endif()
    # Enable fast math for DSP (use with caution)
    option(ENABLE_FAST_MATH "Enable -ffast-math for DSP" ON)
    if(ENABLE_FAST_MATH)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -ffast-math")
        message(STATUS "Fast math: Enabled")
    endif()
endif()

# Build type - FORCE Release for audio DSP performance
# Debug build (-O0) causes unacceptable CPU overhead for real-time audio
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)

# Options
option(USE_JUCE_AUDIO "Use JUCE for audio I/O (recommended)" ON)
option(USE_NAM "Enable Neural Amp Modeler support (RT-safe)" ON)
option(JUCE_PLUGINHOST_VST3 "Enable VST3 plugin hosting" OFF)
option(JUCE_PLUGINHOST_AU "Enable AudioUnit plugin hosting (macOS)" OFF)
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
# CRITICAL FIX: Disable LTO - causes 5+ minute link times on large C++ projects
# Re-enable for production builds if needed
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION OFF)

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

# JACK (optional) - now provided by PipeWire JACK compatibility layer
# PipeWire provides libjack.so.0 in /usr/lib64/pipewire-0.3/jack/
pkg_check_modules(JACK jack QUIET)
if(NOT JACK_FOUND)
    # Try PipeWire JACK libraries - look for both libjack.so and libjack.so.0
    find_library(JACK_LIBRARY NAMES jack
        PATHS /usr/lib64/pipewire-0.3/jack /usr/lib/pipewire-0.3/jack
        NO_DEFAULT_PATH
    )
    if(NOT JACK_LIBRARY)
        # Fallback: look for the versioned .so directly
        find_file(JACK_LIBRARY_FILE NAMES libjack.so.0
            PATHS /usr/lib64/pipewire-0.3/jack /usr/lib/pipewire-0.3/jack
            NO_DEFAULT_PATH
        )
        if(JACK_LIBRARY_FILE)
            set(JACK_LIBRARY ${JACK_LIBRARY_FILE})
        endif()
    endif()
    if(JACK_LIBRARY)
        set(JACK_FOUND TRUE)
        set(JACK_LIBRARIES ${JACK_LIBRARY})
        message(STATUS "JACK: Found PipeWire JACK library: ${JACK_LIBRARY}")
    endif()
endif()

# Find JACK headers
if(JACK_FOUND)
    find_path(JACK_INCLUDE_DIR jack/jack.h PATHS /usr/include)
    if(JACK_INCLUDE_DIR)
        set(JACK_INCLUDE_DIRS ${JACK_INCLUDE_DIR})
    endif()
endif()

# ========================================
# Neural Amp Modeler Core (RT-safe)
# ========================================
if(USE_NAM)
    set(NAM_CORE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/Modules/NeuralAmpModelerCore")
    if(EXISTS "${NAM_CORE_PATH}/NAM/dsp.h")
        message(STATUS "Neural Amp Modeler Core: ENABLED")

        # NAM Core source files
        set(NAM_SOURCES
            ${NAM_CORE_PATH}/NAM/activations.cpp
            ${NAM_CORE_PATH}/NAM/conv1d.cpp
            ${NAM_CORE_PATH}/NAM/convnet.cpp
            ${NAM_CORE_PATH}/NAM/dsp.cpp
            ${NAM_CORE_PATH}/NAM/get_dsp.cpp
            ${NAM_CORE_PATH}/NAM/lstm.cpp
            ${NAM_CORE_PATH}/NAM/ring_buffer.cpp
            ${NAM_CORE_PATH}/NAM/util.cpp
            ${NAM_CORE_PATH}/NAM/wavenet.cpp
        )

        # NAM dependencies paths
        set(NAM_EIGEN_PATH "${NAM_CORE_PATH}/Dependencies/eigen")
        set(NAM_JSON_PATH "${NAM_CORE_PATH}/Dependencies/nlohmann")
    else()
        message(STATUS "Neural Amp Modeler Core: DISABLED (submodule not found)")
        message(STATUS "  To enable: git submodule add https://github.com/sdatkinson/NeuralAmpModelerCore.git juce-engine/Modules/NeuralAmpModelerCore")
        set(USE_NAM OFF)
    endif()
endif()

# ========================================
# AVB/TSN Network Audio Transport (Optional)
# ========================================
option(USE_AVB "Enable AVB/TSN network audio transport" OFF)
if(USE_AVB)
    pkg_check_modules(AVTP libavtp QUIET)
    pkg_check_modules(LIBCAP libcap QUIET)

    if(AVTP_FOUND AND LIBCAP_FOUND)
        message(STATUS "AVB/TSN: ENABLED (libavtp ${AVTP_VERSION})")
        set(AVB_AVAILABLE TRUE)
    else()
        message(STATUS "AVB/TSN: DISABLED (dependencies not found)")
        if(NOT AVTP_FOUND)
            message(STATUS "  Missing: libavtp (install libavtp-dev or build from source)")
        endif()
        if(NOT LIBCAP_FOUND)
            message(STATUS "  Missing: libcap (install libcap-dev)")
        endif()
        set(AVB_AVAILABLE FALSE)
    endif()
else()
    message(STATUS "AVB/TSN: DISABLED (USE_AVB=OFF)")
    set(AVB_AVAILABLE FALSE)
endif()

# ========================================
# AVDECC (IEEE 1722.1) Third-Party Interop (Optional)
# ========================================
option(USE_AVDECC "Enable AVDECC for third-party AVB device interop" OFF)
if(USE_AVDECC)
    if(AVB_AVAILABLE)
        message(STATUS "AVDECC: ENABLED (IEEE 1722.1 interoperability)")
        set(AVDECC_AVAILABLE TRUE)
    else()
        message(STATUS "AVDECC: DISABLED (requires AVB to be enabled first)")
        message(STATUS "  Enable AVB first with: cmake -DUSE_AVB=ON -DUSE_AVDECC=ON")
        set(AVDECC_AVAILABLE FALSE)
    endif()
else()
    message(STATUS "AVDECC: DISABLED (USE_AVDECC=OFF)")
    set(AVDECC_AVAILABLE FALSE)
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
    Source/DynamicsProcessor.cpp
    Source/FilterProcessor.cpp
    Source/ParallelMixerProcessor.cpp
    Source/SpectrumAnalyzer.cpp
    Source/LufsMeter.cpp
    Source/PhaseCorrelation.cpp
    Source/CPUMonitor.cpp

    # Modulation processors
    Source/ChorusProcessor.cpp
    Source/PhaserProcessor.cpp
    Source/PitchShifterProcessor.cpp
    Source/DelayProcessor.cpp
    Source/CircularDelayProcessor.cpp
    Source/CircularDelayUI.cpp
    Source/IntelliFX8VoiceChorusProcessor.cpp
    Source/BossXS1PolyShifterProcessor.cpp
    Source/BossXS1UI.cpp
    Source/ShoeGazeProcessor.cpp
    Source/LexiLoveProcessor.cpp
    Source/H3000Processor.cpp
    
    # Multi-Effect Processor
    Source/EventideH9Processor.cpp

    # Peavey 5150 Block Letter Amp Simulator (NEW)
    Source/Peavey5150Processor.cpp

    # Tweed Bassman 5F6-A Amplifier Simulator
    Source/TweedBassmanProcessor.cpp

    # PassionFX Multi-Effect (Steve Vai Passion & Warfare)
    Source/PassionFXProcessor.cpp

    # Existing components (updated)
    Source/MidiHandler.cpp
    Source/VuMeter.cpp
    Source/ParameterBridge.cpp
    Source/SnapshotManager.cpp

    # Python bindings
    Source/PythonBindings.cpp
)

# Add NAM sources if enabled
if(USE_NAM)
    list(APPEND SOURCES
        Source/NAMProcessor.cpp
        ${NAM_SOURCES}
    )
endif()

# Add AVB sources if available
if(AVB_AVAILABLE)
    list(APPEND SOURCES
        Source/AvbStream.cpp
        Source/AvbAudioIODeviceType.cpp
        Source/AvbAudioIODevice.cpp
    )
endif()

# Add AVDECC sources if available
if(AVDECC_AVAILABLE)
    list(APPEND SOURCES
        Source/AvdeccEntity.cpp
        Source/AvdeccEntityModel.cpp
        Source/AvdeccEnumerator.cpp
    )
endif()

set(HEADERS
    Source/Common.h
    Source/Map2AudioEngine.h

    # JUCE-based components
    Source/JuceAudioIO.h
    Source/JucePluginHost.h
    Source/JuceAudioGraph.h

    # Enhanced audio processing
    Source/ConvolutionProcessor.h
    Source/DynamicsProcessor.h
    Source/FilterProcessor.h
    Source/ParallelMixerProcessor.h
    Source/SpectrumAnalyzer.h
    Source/LufsMeter.h
    Source/PhaseCorrelation.h
    Source/CPUMonitor.h

    # Modulation processors
    Source/ChorusProcessor.h
    Source/PhaserProcessor.h
    Source/PitchShifterProcessor.h
    Source/DelayProcessor.h
    Source/CircularDelayProcessor.h
    Source/CircularDelayUI.h
    Source/CircularDelayExamples.h
    Source/IntelliFX8VoiceChorusProcessor.h
    Source/BossXS1PolyShifterProcessor.h
    Source/BossXS1UI.h
    Source/ShoeGazeProcessor.h
    
    # Multi-Effect Processor
    Source/EventideH9Processor.h
    Source/EventideH9UI.h

    # Peavey 5150 Block Letter Amp Simulator (NEW)
    Source/Peavey5150Processor.h

    # Tweed Bassman 5F6-A Amplifier Simulator
    Source/TweedBassmanProcessor.h

    # PassionFX Multi-Effect (Steve Vai Passion & Warfare)
    Source/PassionFXProcessor.h

    # Existing components
    Source/MidiHandler.h
    Source/VuMeter.h
    Source/ParameterBridge.h
    Source/SnapshotManager.h
)

# Add NAM headers if enabled
if(USE_NAM)
    list(APPEND HEADERS Source/NAMProcessor.h)
endif()

# Add AVB headers if available
if(AVB_AVAILABLE)
    list(APPEND HEADERS
        Source/AvbException.h
        Source/AvbRingBuffer.h
        Source/AvbStream.h
        Source/AvbAudioIODeviceType.h
        Source/AvbAudioIODevice.h
    )
endif()

# Add AVDECC headers if available
if(AVDECC_AVAILABLE)
    list(APPEND HEADERS
        Source/AvdeccEntity.h
        Source/AvdeccDescriptors.h
        Source/AvdeccEntityModel.h
        Source/AvdeccEnumerator.h
    )
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

if(UNIX AND NOT APPLE)
    target_include_directories(map2_audio_engine PRIVATE ${ALSA_INCLUDE_DIRS})
    if(JACK_FOUND AND JACK_INCLUDE_DIRS)
        target_include_directories(map2_audio_engine PRIVATE ${JACK_INCLUDE_DIRS})
    endif()
endif()

# NAM include directories
if(USE_NAM)
    target_include_directories(map2_audio_engine PRIVATE
        ${NAM_CORE_PATH}
        ${NAM_EIGEN_PATH}
        ${NAM_JSON_PATH}
    )
endif()

# AVB include directories
if(AVB_AVAILABLE)
    target_include_directories(map2_audio_engine PRIVATE
        ${AVTP_INCLUDE_DIRS}
        ${LIBCAP_INCLUDE_DIRS}
    )
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

if(UNIX AND NOT APPLE)
    target_link_libraries(map2_audio_engine PRIVATE ${ALSA_LIBRARIES})
endif()

if(JACK_FOUND)
    # PipeWire's JACK library lives in a non-standard path
    # We need to add the link directory so the linker can find -ljack
    # Use JACK_LIBRARY_DIRS (from pkg-config) which has the correct PipeWire path
    if(JACK_LIBRARY_DIRS)
        target_link_directories(map2_audio_engine PRIVATE ${JACK_LIBRARY_DIRS})
    endif()
    # Also add fallback PipeWire JACK paths
    target_link_directories(map2_audio_engine PRIVATE
        /usr/lib64/pipewire-0.3/jack
        /usr/lib/pipewire-0.3/jack
    )
    target_link_libraries(map2_audio_engine PRIVATE ${JACK_LIBRARIES})
endif()

if(AVB_AVAILABLE)
    target_link_libraries(map2_audio_engine PRIVATE
        ${AVTP_LIBRARIES}
        ${LIBCAP_LIBRARIES}
    )
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

    # Audio backend support
    # CRITICAL: JUCE_JACK=1 enables JUCE's JACK audio device type.
    # Without this, JUCE only has ALSA and cannot connect to PipeWire via JACK.
    JUCE_JACK=$<BOOL:${JACK_FOUND}>

    # Plugin format support
    JUCE_PLUGINHOST_VST3=$<BOOL:${JUCE_PLUGINHOST_VST3}>
    JUCE_PLUGINHOST_AU=$<BOOL:${JUCE_PLUGINHOST_AU}>
    JUCE_PLUGINHOST_LV2=$<BOOL:${JUCE_PLUGINHOST_LV2}>
    JUCE_PLUGINHOST_LADSPA=$<BOOL:${JUCE_PLUGINHOST_LADSPA}>

    # Feature flags
    USE_JUCE_AUDIO=$<BOOL:${USE_JUCE_AUDIO}>
)

if(JACK_FOUND)
    target_compile_definitions(map2_audio_engine PRIVATE HAS_JACK=1)
endif()

if(USE_NAM)
    target_compile_definitions(map2_audio_engine PRIVATE
        HAS_NAM=1
        NAM_SAMPLE_FLOAT=1  # Use float instead of double for JUCE compatibility
    )
    # NAM uses std::filesystem
    if(UNIX AND NOT APPLE)
        target_link_libraries(map2_audio_engine PRIVATE stdc++fs)
    endif()
endif()

if(AVB_AVAILABLE)
    target_compile_definitions(map2_audio_engine PRIVATE
        HAS_AVB=1
    )
endif()

if(AVDECC_AVAILABLE)
    target_compile_definitions(map2_audio_engine PRIVATE
        HAS_AVDECC=1
    )
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
if(JACK_FOUND)
    message(STATUS "  JACK library: ${JACK_LIBRARIES}")
    message(STATUS "  JUCE_JACK: ENABLED (JUCE JACK audio backend)")
else()
    message(WARNING "  JACK: NOT FOUND - JUCE will fall back to ALSA only!")
    message(STATUS "  Install: sudo dnf install pipewire-jack-audio-connection-kit-devel")
endif()
message(STATUS "")
message(STATUS "Neural Processing:")
message(STATUS "  NAM (Neural Amp Modeler): ${USE_NAM}")
message(STATUS "")
message(STATUS "Network Audio:")
message(STATUS "  AVB/TSN Transport: ${AVB_AVAILABLE}")
if(AVB_AVAILABLE)
    message(STATUS "  libavtp: ${AVTP_VERSION}")
    message(STATUS "  HAS_AVB: ENABLED")
else()
    if(USE_AVB)
        message(STATUS "  Note: USE_AVB=ON but dependencies not found")
    endif()
endif()
message(STATUS "========================================")
message(STATUS "")
