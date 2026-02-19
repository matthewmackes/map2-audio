# Build Environment

**Date**: 2026-02-18
**User**: mm
**Hostname**: MAP2-TESTBED

## OS
Linux MAP2-TESTBED 6.18.5-200.fc43.x86_64 #1 SMP PREEMPT_DYNAMIC Sun Jan 11 17:09:32 UTC 2026 x86_64 GNU/Linux

## Toolchain
- gcc: gcc (GCC) 15.2.1 20251211 (Red Hat 15.2.1-5)
- g++: g++ (GCC) 15.2.1 20251211
- clang: NOT INSTALLED — use gcc/g++ instead
- cmake: cmake version 3.31.10
- ninja: 1.13.1
- pkg-config: 2.3.0

## JUCE
- Version: 8.0.0 (FetchContent from juce-engine/CMakeLists.txt)
- Location: juce-engine/build/_deps/juce-src/ (after first build)
- Method: CMake FetchContent

## Build System
- CMake (no Projucer)
- FetchContent for JUCE
- pybind11 for Python bindings

## Current Plugin Projects
- WDFAmpPlugin: juce-engine/WDFAmpPlugin/ (Standalone + LV2, NO VST3)

## Current Processor Classes (in juce-engine/Source/)
- 19 native processors confirmed (see 01-processor-inventory.md)
- Used in map2_audio_engine Python module
- Need plugin wrappers to create VST3s

## Key Deviation from Guide
- Guide assumes clang/clang++; NOT INSTALLED on this system
- Using gcc/g++ (GCC 15.2.1) instead
- Build command: cmake -G Ninja -DCMAKE_CXX_COMPILER=g++ -DCMAKE_C_COMPILER=gcc
