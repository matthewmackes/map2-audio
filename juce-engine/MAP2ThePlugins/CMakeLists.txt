cmake_minimum_required(VERSION 3.22)

project(MAP2ThePlugins VERSION 1.0.0 LANGUAGES CXX)

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

juce_add_plugin(MAP2ThePlugins
    COMPANY_NAME "MAP2Audio"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Map2
    PLUGIN_CODE MTPg
    FORMATS VST3 Standalone
    PRODUCT_NAME "MAP2-THEPLUGINS"
)

target_sources(MAP2ThePlugins PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    ../../cmake/mingw_juce_shim.cpp
)

target_compile_definitions(MAP2ThePlugins PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_PLUGINHOST_VST3=1
)

target_link_libraries(MAP2ThePlugins PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_audio_basics
    juce::juce_gui_extra
    juce::juce_dsp
)

if(WIN32)
    target_link_libraries(MAP2ThePlugins PRIVATE
        d3d11 d2d1 dwrite dxgi dcomp gdi32 user32 ole32 oleaut32 uuid comdlg32 shlwapi shell32 winmm)
else()
    # Provide a no-op juce_vst3_helper so cross builds don't fail when the helper can't run
    add_executable(juce_vst3_helper IMPORTED GLOBAL)
    set_target_properties(juce_vst3_helper PROPERTIES IMPORTED_LOCATION /bin/true)
endif()
