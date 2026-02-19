cmake_minimum_required(VERSION 3.22)
project(WDFAmpPlugin VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Avoid LTO/IPO to prevent memory-heavy link crashes on this target
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION FALSE)

# Disable C++20 module scanning - prevents GCC 15 moduleinfo.json segfault during shared lib link
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)

# Use lld for shared module links on Linux; MinGW uses its own linker on Windows
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(CMAKE_SHARED_MODULE_LINKER_FLAGS "${CMAKE_SHARED_MODULE_LINKER_FLAGS} -fno-lto -fuse-ld=lld")
endif()

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
# Cross-compiling to Windows: only VST3, no post-build copy (can't copy into Windows paths from Linux)
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(_WDFAMP_FORMATS VST3)
    set(_WDFAMP_COPY FALSE)
else()
    set(_WDFAMP_FORMATS Standalone LV2 VST3)
    set(_WDFAMP_COPY TRUE)
endif()

juce_add_plugin(WDFAmpPlugin
    COMPANY_NAME "MAP2"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD ${_WDFAMP_COPY}
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE Wdfa
    FORMATS ${_WDFAMP_FORMATS}
    PRODUCT_NAME "WDF Amp Simulator"
    LV2URI "https://map2audio.com/wdf-amp"
    VST3_AUTO_MANIFEST FALSE
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

# MinGW cross-compile: add shim that provides two symbols missing from
# Fedora's mingw64 libdcomp.a and the MinGW __uuidof template:
#   - DCompositionCreateDevice (forwarded to DCompositionCreateDevice2)
#   - __mingw_uuidof<juce::ComSmartPtr<IDXGISurface>>
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_sources(WDFAmpPlugin PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/../../cmake/mingw_juce_shim.cpp"
    )
endif()

# Force-disable LTO; use lld on Linux only (MinGW has its own linker)
target_compile_options(WDFAmpPlugin PRIVATE -fno-lto)
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_link_options(WDFAmpPlugin PRIVATE -fno-lto)
    target_link_options(WDFAmpPlugin_VST3 PRIVATE -fno-lto)
else()
    target_link_options(WDFAmpPlugin PRIVATE -fno-lto -fuse-ld=lld)
    target_link_options(WDFAmpPlugin_VST3 PRIVATE -fno-lto -fuse-ld=lld)
endif()

target_link_libraries(WDFAmpPlugin
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags
)

# MinGW cross-compile: explicitly pull in Windows system import libraries.
# JUCE's generator expressions should do this, but they may not fire under
# CMake cross-compilation because PLATFORM_ID reflects the host, not the target.
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_link_libraries(WDFAmpPlugin
        PRIVATE
            gdi32 d3d11 d2d1 dwrite dcomp dxgi ole32 oleaut32 uuid
            user32 kernel32 comctl32 winmm dwmapi shlwapi
            imm32 comdlg32 advapi32 shell32 winspool
            opengl32 wininet ws2_32 winhttp
    )
endif()
