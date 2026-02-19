cmake_minimum_required(VERSION 3.22)
project(LexiLovePlugin VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION FALSE)
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(CMAKE_SHARED_MODULE_LINKER_FLAGS "${CMAKE_SHARED_MODULE_LINKER_FLAGS} -fno-lto -fuse-ld=lld")
endif()

# Reuse JUCE already fetched by the parent juce-engine build
set(JUCE_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../build/_deps/juce-src")
set(JUCE_BUILD_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/../build/_deps/juce-build")
set(JUCE_BUILD_HELPER_TOOLS OFF CACHE BOOL "Disable juceaide rebuild")

if(EXISTS "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide")
    set(JUCEAIDE_EXECUTABLE
        "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide"
        CACHE FILEPATH "Prebuilt juceaide")
    file(MAKE_DIRECTORY
        "${CMAKE_CURRENT_BINARY_DIR}/juce/tools/extras/Build/juceaide/juceaide_artefacts/Debug")
    file(COPY
        "${JUCE_BUILD_DIR}/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide"
        DESTINATION
        "${CMAKE_CURRENT_BINARY_DIR}/juce/tools/extras/Build/juceaide/juceaide_artefacts/Debug")
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

set(ENGINE_SRC "${CMAKE_CURRENT_SOURCE_DIR}/../Source")

if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(_PLUGIN_COPY FALSE)
else()
    set(_PLUGIN_COPY TRUE)
endif()

juce_add_plugin(LexiLovePlugin
    COMPANY_NAME "MAP2"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD ${_PLUGIN_COPY}
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE LEXI
    FORMATS VST3
    PRODUCT_NAME "MAP2 Lexi Love"
    VST3_AUTO_MANIFEST FALSE
)

target_sources(LexiLovePlugin
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        ${ENGINE_SRC}/LexiLoveProcessor.cpp
        ${ENGINE_SRC}/LexiLoveProcessor.h
        ${ENGINE_SRC}/Common.h
)

target_include_directories(LexiLovePlugin
    PRIVATE
        ${ENGINE_SRC}
)

target_compile_definitions(LexiLovePlugin
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_sources(LexiLovePlugin PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/../../cmake/mingw_juce_shim.cpp"
    )
endif()

target_compile_options(LexiLovePlugin PRIVATE -fno-lto)
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_link_options(LexiLovePlugin PRIVATE -fno-lto)
    target_link_options(LexiLovePlugin_VST3 PRIVATE -fno-lto)
else()
    target_link_options(LexiLovePlugin PRIVATE -fno-lto -fuse-ld=lld)
    target_link_options(LexiLovePlugin_VST3 PRIVATE -fno-lto -fuse-ld=lld)
endif()

target_link_libraries(LexiLovePlugin
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags
)

if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_link_libraries(LexiLovePlugin
        PRIVATE
            gdi32 d3d11 d2d1 dwrite dcomp dxgi ole32 oleaut32 uuid
            user32 kernel32 comctl32 winmm dwmapi shlwapi
            imm32 comdlg32 advapi32 shell32 winspool
            opengl32 wininet ws2_32 winhttp
    )
endif()
