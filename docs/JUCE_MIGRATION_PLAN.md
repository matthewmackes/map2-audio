# JUCE Migration Plan: Replacing PiPedal

## Executive Summary

This document outlines the complete plan to migrate MAP2 Audio Platform from PiPedal to JUCE as the audio engine. The migration will provide cross-platform compatibility, professional-grade audio processing, and direct LV2/VST3 plugin hosting.

**Estimated Timeline:** 8-12 weeks  
**Risk Level:** Medium-High (core audio engine replacement)  
**Benefits:** Cross-platform, commercial-grade, better tooling, unified codebase

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [JUCE Component Design](#3-juce-component-design)
4. [Migration Phases](#4-migration-phases)
5. [File-by-File Changes](#5-file-by-file-changes)
6. [API Compatibility Layer](#6-api-compatibility-layer)
7. [Testing Strategy](#7-testing-strategy)
8. [Rollback Plan](#8-rollback-plan)

---

## 1. Current Architecture Analysis

### PiPedal Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                     Current PiPedal Integration                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Python Services                    C++ Engine (pybind11)        │
│  ┌─────────────────────┐           ┌─────────────────────────┐  │
│  │ pipedal_engine_     │           │ pipedal_full_embedded   │  │
│  │ service.py          │◄─────────►│ .cpp (702 lines)        │  │
│  │ - get_pipedal_      │           │ - PiPedalFullEngine     │  │
│  │   service()         │           │ - AudioHost             │  │
│  │ - PiPedalEngineServ │           │ - PluginHost            │  │
│  └──────────┬──────────┘           │ - Lv2Pedalboard         │  │
│             │                       └─────────────────────────┘  │
│             ▼                                                    │
│  ┌─────────────────────┐                                        │
│  │ Routes that use     │                                        │
│  │ PiPedal:            │                                        │
│  │ - pipedal.py        │                                        │
│  │ - pipedal_plugins.py│                                        │
│  │ - pipedal_websocket │                                        │
│  │ - plugins.py        │                                        │
│  │ - latency.py        │                                        │
│  │ - audio.py          │                                        │
│  └─────────────────────┘                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Files to Modify/Remove

| File | Action | Reason |
|------|--------|--------|
| `pipedal-integration/` | **DELETE** | Entire directory |
| `app/services/pipedal_engine_service.py` | **REPLACE** | New JUCE engine service |
| `app/services/pipedal_integration.py` | **DELETE** | No longer needed |
| `app/routes/pipedal.py` | **REPLACE** | Rename to `engine.py` |
| `app/routes/pipedal_plugins.py` | **MODIFY** | Use JUCE plugin discovery |
| `app/routes/pipedal_websocket.py` | **MODIFY** | Use JUCE VU/state callbacks |
| `tests/test_pipedal_engine.py` | **REPLACE** | New JUCE engine tests |
| `install-pipedal.sh` | **DELETE** | No longer needed |

### Current PiPedal API Surface

The Python code calls these PiPedal C++ methods:

```python
# Engine lifecycle
create_engine() -> PiPedalFullEngine
initialize(config_file, lv2_path) -> bool
shutdown() -> void
is_running() -> bool
get_version() -> str
get_system_info() -> dict

# Audio control
start_audio() -> bool
stop_audio() -> bool
is_audio_running() -> bool

# Configuration
set_sample_rate(rate) -> void
set_buffer_size(size) -> void
set_alsa_device(device) -> void
set_lv2_path(path) -> void

# Plugin management
list_plugins() -> list[dict]
get_plugin_info(uri) -> dict
load_plugin(uri) -> bool
unload_plugin(instance_id) -> bool

# Pedalboard/chain
get_current_pedalboard() -> dict
reload_pedalboard() -> bool

# Parameters
set_parameter(instance_id, param_name, value) -> bool
get_parameter(instance_id, param_name) -> float
set_bypass(instance_id, bypass) -> bool

# Snapshots
get_current_snapshot() -> int
load_snapshot(snapshot_id) -> bool
list_snapshots() -> list[dict]

# MIDI
enable_midi(enable) -> bool
get_midi_devices() -> list[str]

# VU Meters
get_vu_levels() -> dict
get_plugin_vu_levels() -> list[dict]
```

---

## 2. Target Architecture

### JUCE-Based Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    New JUCE Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Python Services                    C++ JUCE Engine (pybind11)   │
│  ┌─────────────────────┐           ┌─────────────────────────┐  │
│  │ juce_engine_        │           │ map2_audio_engine.cpp   │  │
│  │ service.py          │◄─────────►│                         │  │
│  │ - get_audio_engine()│  IPC/     │ Components:             │  │
│  │ - JuceEngineService │  pybind11 │ - AudioEngine           │  │
│  └──────────┬──────────┘           │ - PluginHost            │  │
│             │                       │ - PluginGraph           │  │
│             ▼                       │ - MidiHandler           │  │
│  ┌─────────────────────┐           │ - ParameterBridge       │  │
│  │ Routes (unified):   │           │ - VuMeterSource         │  │
│  │ - engine.py         │           └─────────────────────────┘  │
│  │ - plugins.py        │                      │                 │
│  │ - audio.py          │                      ▼                 │
│  │ - websocket_rt.py   │           ┌─────────────────────────┐  │
│  └─────────────────────┘           │ JUCE AudioDeviceManager │  │
│                                     │ - ALSA backend          │  │
│                                     │ - JACK backend          │  │
│                                     └─────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key JUCE Classes to Use

| JUCE Class | Purpose |
|------------|---------|
| `AudioDeviceManager` | Audio hardware I/O (ALSA, JACK) |
| `AudioProcessorGraph` | Plugin chain routing |
| `AudioPluginHost` | LV2/VST3 plugin loading |
| `AudioPluginFormatManager` | Plugin format handling |
| `LV2PluginFormat` | LV2 plugin support (via juce_lv2) |
| `MidiBuffer` / `MidiMessageCollector` | MIDI handling |
| `AudioProcessorValueTreeState` | Parameter management |

---

## 3. JUCE Component Design

### 3.1 Core Engine Class

```cpp
// juce-engine/Source/Map2AudioEngine.h

#pragma once
#include <JuceHeader.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

namespace py = pybind11;

class Map2AudioEngine : public juce::AudioIODeviceCallback,
                        public juce::ChangeListener
{
public:
    Map2AudioEngine();
    ~Map2AudioEngine() override;

    // Lifecycle
    bool initialize(const std::string& config);
    void shutdown();
    bool isRunning() const;
    std::string getVersion() const;
    py::dict getSystemInfo() const;

    // Audio Control
    bool startAudio();
    bool stopAudio();
    bool isAudioRunning() const;

    // Configuration
    void setSampleRate(double rate);
    void setBufferSize(int size);
    void setAudioDevice(const std::string& deviceName);
    void setLV2Path(const std::string& path);

    // Plugin Management
    py::list listPlugins() const;
    py::dict getPluginInfo(const std::string& uri) const;
    int64_t loadPlugin(const std::string& uri);  // Returns instance ID
    bool unloadPlugin(int64_t instanceId);

    // Plugin Graph (Chain)
    py::dict getCurrentChain() const;
    bool connectPlugins(int64_t sourceId, int sourceChannel,
                        int64_t destId, int destChannel);
    bool disconnectPlugins(int64_t sourceId, int64_t destId);
    bool reorderPlugins(const std::vector<int64_t>& order);

    // Parameters
    bool setParameter(int64_t instanceId, int paramIndex, float value);
    bool setParameterByName(int64_t instanceId, const std::string& name, float value);
    float getParameter(int64_t instanceId, int paramIndex) const;
    bool setBypass(int64_t instanceId, bool bypass);

    // Presets/Snapshots
    int getCurrentSnapshot() const;
    bool loadSnapshot(int snapshotId);
    py::list listSnapshots() const;
    bool saveSnapshot(int snapshotId, const std::string& name);

    // MIDI
    bool enableMidi(bool enable);
    py::list getMidiDevices() const;
    bool setMidiDevice(const std::string& deviceName);

    // VU Meters
    py::dict getVuLevels() const;
    py::list getPluginVuLevels() const;

    // Callbacks for Python
    void setVuCallback(py::function callback);
    void setStateCallback(py::function callback);

private:
    // AudioIODeviceCallback
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;
    
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

    // ChangeListener
    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    // Members
    std::unique_ptr<juce::AudioDeviceManager> deviceManager;
    std::unique_ptr<juce::AudioProcessorGraph> processorGraph;
    std::unique_ptr<juce::AudioPluginFormatManager> formatManager;
    juce::KnownPluginList knownPlugins;
    
    std::map<int64_t, juce::AudioProcessorGraph::NodeID> pluginNodes;
    std::atomic<int64_t> nextInstanceId{1};
    
    // VU Metering
    std::array<std::atomic<float>, 4> vuLevels;  // L/R in, L/R out
    std::map<int64_t, std::array<std::atomic<float>, 4>> pluginVuLevels;
    
    // Thread safety
    juce::CriticalSection processLock;
    
    // Configuration
    double sampleRate = 48000.0;
    int bufferSize = 256;
    std::string lv2Path;
    bool midiEnabled = true;
};
```

### 3.2 Python Bindings

```cpp
// juce-engine/Source/PythonBindings.cpp

#include "Map2AudioEngine.h"
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>

namespace py = pybind11;

PYBIND11_MODULE(map2_audio_engine, m) {
    m.doc() = "MAP2 JUCE Audio Engine";

    py::class_<Map2AudioEngine, std::shared_ptr<Map2AudioEngine>>(m, "AudioEngine")
        .def(py::init<>())
        
        // Lifecycle
        .def("initialize", &Map2AudioEngine::initialize, py::arg("config") = "")
        .def("shutdown", &Map2AudioEngine::shutdown)
        .def("is_running", &Map2AudioEngine::isRunning)
        .def("get_version", &Map2AudioEngine::getVersion)
        .def("get_system_info", &Map2AudioEngine::getSystemInfo)
        
        // Audio
        .def("start_audio", &Map2AudioEngine::startAudio)
        .def("stop_audio", &Map2AudioEngine::stopAudio)
        .def("is_audio_running", &Map2AudioEngine::isAudioRunning)
        
        // Config
        .def("set_sample_rate", &Map2AudioEngine::setSampleRate)
        .def("set_buffer_size", &Map2AudioEngine::setBufferSize)
        .def("set_audio_device", &Map2AudioEngine::setAudioDevice)
        .def("set_lv2_path", &Map2AudioEngine::setLV2Path)
        
        // Plugins
        .def("list_plugins", &Map2AudioEngine::listPlugins)
        .def("get_plugin_info", &Map2AudioEngine::getPluginInfo)
        .def("load_plugin", &Map2AudioEngine::loadPlugin)
        .def("unload_plugin", &Map2AudioEngine::unloadPlugin)
        
        // Chain
        .def("get_current_chain", &Map2AudioEngine::getCurrentChain)
        .def("connect_plugins", &Map2AudioEngine::connectPlugins)
        .def("reorder_plugins", &Map2AudioEngine::reorderPlugins)
        
        // Parameters
        .def("set_parameter", &Map2AudioEngine::setParameter)
        .def("set_parameter_by_name", &Map2AudioEngine::setParameterByName)
        .def("get_parameter", &Map2AudioEngine::getParameter)
        .def("set_bypass", &Map2AudioEngine::setBypass)
        
        // Snapshots
        .def("get_current_snapshot", &Map2AudioEngine::getCurrentSnapshot)
        .def("load_snapshot", &Map2AudioEngine::loadSnapshot)
        .def("list_snapshots", &Map2AudioEngine::listSnapshots)
        .def("save_snapshot", &Map2AudioEngine::saveSnapshot)
        
        // MIDI
        .def("enable_midi", &Map2AudioEngine::enableMidi)
        .def("get_midi_devices", &Map2AudioEngine::getMidiDevices)
        .def("set_midi_device", &Map2AudioEngine::setMidiDevice)
        
        // VU
        .def("get_vu_levels", &Map2AudioEngine::getVuLevels)
        .def("get_plugin_vu_levels", &Map2AudioEngine::getPluginVuLevels)
        
        // Callbacks
        .def("set_vu_callback", &Map2AudioEngine::setVuCallback)
        .def("set_state_callback", &Map2AudioEngine::setStateCallback);

    // Factory function
    m.def("create_engine", []() {
        return std::make_shared<Map2AudioEngine>();
    });

    m.def("get_version", []() { return "1.0.0-juce"; });
    m.def("is_available", []() { return true; });
}
```

### 3.3 Project Structure

```
juce-engine/
├── CMakeLists.txt
├── JuceLibraryCode/
│   └── (JUCE modules)
├── Source/
│   ├── Map2AudioEngine.h
│   ├── Map2AudioEngine.cpp
│   ├── PluginHost.h
│   ├── PluginHost.cpp
│   ├── PluginGraph.h
│   ├── PluginGraph.cpp
│   ├── MidiHandler.h
│   ├── MidiHandler.cpp
│   ├── VuMeter.h
│   ├── VuMeter.cpp
│   ├── ParameterBridge.h
│   ├── ParameterBridge.cpp
│   ├── SnapshotManager.h
│   ├── SnapshotManager.cpp
│   └── PythonBindings.cpp
├── Builds/
│   └── LinuxMakefile/
└── JUCE/  (submodule)
```

### 3.4 CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.22)
project(map2_audio_engine VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Find packages
find_package(Python3 REQUIRED COMPONENTS Interpreter Development)
find_package(pybind11 REQUIRED)

# Add JUCE
add_subdirectory(JUCE)

# JUCE modules needed
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_basics)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_devices)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_formats)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_processors)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_audio_utils)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_core)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_data_structures)
juce_add_module(${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules/juce_events)

# LV2 support (via external module)
# add_subdirectory(juce_lv2)

# Create Python module
pybind11_add_module(map2_audio_engine
    Source/Map2AudioEngine.cpp
    Source/PluginHost.cpp
    Source/PluginGraph.cpp
    Source/MidiHandler.cpp
    Source/VuMeter.cpp
    Source/ParameterBridge.cpp
    Source/SnapshotManager.cpp
    Source/PythonBindings.cpp
)

target_include_directories(map2_audio_engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/JUCE/modules
)

target_link_libraries(map2_audio_engine PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_data_structures
    juce::juce_events
    pybind11::module
)

target_compile_definitions(map2_audio_engine PRIVATE
    JUCE_STANDALONE_APPLICATION=0
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_PLUGINHOST_LV2=1
    JUCE_PLUGINHOST_VST3=1
)

# Linux-specific
if(UNIX AND NOT APPLE)
    find_package(ALSA REQUIRED)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(JACK jack)
    
    target_link_libraries(map2_audio_engine PRIVATE
        ${ALSA_LIBRARIES}
        ${JACK_LIBRARIES}
        pthread
        dl
    )
endif()

# Install
install(TARGETS map2_audio_engine
    LIBRARY DESTINATION ${Python3_SITELIB}
)
```

---

## 4. Migration Phases

### Phase 1: Setup & Parallel Development (Week 1-2)

**Goals:**
- Set up JUCE project structure
- Create minimal working engine
- Establish pybind11 bindings

**Tasks:**
1. [ ] Clone JUCE and set up submodule
2. [ ] Create `juce-engine/` directory structure
3. [ ] Implement basic `Map2AudioEngine` class
4. [ ] Set up CMake build system
5. [ ] Create minimal Python bindings
6. [ ] Verify audio output works (sine wave test)

**Deliverable:** `map2_audio_engine.so` that can play a test tone

### Phase 2: Plugin Hosting (Week 3-4)

**Goals:**
- Implement LV2 plugin discovery
- Plugin loading/unloading
- Basic parameter control

**Tasks:**
1. [ ] Integrate juce_lv2 module for LV2 support
2. [ ] Implement `listPlugins()` matching PiPedal format
3. [ ] Implement `loadPlugin()` with instance ID tracking
4. [ ] Implement `unloadPlugin()`
5. [ ] Implement `setParameter()` / `getParameter()`
6. [ ] Test with Guitarix plugins

**Deliverable:** Can load and control LV2 plugins

### Phase 3: Plugin Graph (Week 5-6)

**Goals:**
- Implement AudioProcessorGraph for plugin chaining
- VU metering per plugin
- Bypass functionality

**Tasks:**
1. [ ] Set up `AudioProcessorGraph` with input/output nodes
2. [ ] Implement `connectPlugins()` for serial chain
3. [ ] Implement `reorderPlugins()` for drag-drop reorder
4. [ ] Add VU metering nodes after each plugin
5. [ ] Implement `setBypass()` (disconnect but keep loaded)
6. [ ] Implement `getPluginVuLevels()`

**Deliverable:** Working plugin chain with metering

### Phase 4: MIDI Integration (Week 7)

**Goals:**
- MIDI input/output handling
- MIDI learn support
- MIDI CC mapping

**Tasks:**
1. [ ] Implement `MidiHandler` class
2. [ ] Connect ALSA MIDI devices
3. [ ] Route MIDI to plugins that accept it
4. [ ] Implement MIDI CC → parameter mapping
5. [ ] Expose MIDI events to Python for MIDI learn

**Deliverable:** MIDI control of plugin parameters

### Phase 5: Python Service Layer (Week 8-9)

**Goals:**
- Create new `juce_engine_service.py`
- Update routes to use new service
- Maintain API compatibility

**Tasks:**
1. [ ] Create `app/services/juce_engine_service.py`
2. [ ] Implement all PiPedal-compatible methods
3. [ ] Create `app/routes/engine.py` (replaces pipedal.py)
4. [ ] Update `plugins.py` to use JUCE discovery
5. [ ] Update `audio.py` for JUCE audio control
6. [ ] Update `websocket_rt.py` for VU callbacks

**Deliverable:** All routes working with JUCE backend

### Phase 6: Snapshots & Presets (Week 10)

**Goals:**
- Implement snapshot system (6 snapshots like PiPedal)
- Preset save/load
- State persistence

**Tasks:**
1. [ ] Implement `SnapshotManager` in C++
2. [ ] Store snapshots in JSON format
3. [ ] Implement `saveSnapshot()` / `loadSnapshot()`
4. [ ] Wire up to existing preset system
5. [ ] Test preset migration from old format

**Deliverable:** Full preset/snapshot parity with PiPedal

### Phase 7: Cleanup & Removal (Week 11)

**Goals:**
- Remove all PiPedal code
- Clean up references
- Update documentation

**Tasks:**
1. [ ] Delete `pipedal-integration/` directory
2. [ ] Delete `app/services/pipedal_*.py` files
3. [ ] Delete `app/routes/pipedal*.py` files
4. [ ] Delete `install-pipedal.sh`
5. [ ] Update `pyproject.toml` dependencies
6. [ ] Update all import statements
7. [ ] Update tests

**Deliverable:** Clean codebase with no PiPedal references

### Phase 8: Testing & Stabilization (Week 12)

**Goals:**
- Comprehensive testing
- Performance optimization
- Documentation

**Tasks:**
1. [ ] Run full test suite
2. [ ] Latency testing (target: <10ms roundtrip)
3. [ ] CPU usage profiling
4. [ ] Stress testing (many plugins)
5. [ ] Update user documentation
6. [ ] Create migration guide for users

**Deliverable:** Production-ready JUCE-based MAP2

---

## 5. File-by-File Changes

### Files to DELETE

```bash
# PiPedal integration (entire directory)
rm -rf pipedal-integration/

# PiPedal services
rm app/services/pipedal_engine_service.py
rm app/services/pipedal_integration.py

# PiPedal routes
rm app/routes/pipedal.py
rm app/routes/pipedal_plugins.py
rm app/routes/pipedal_websocket.py

# PiPedal tests
rm tests/test_pipedal_engine.py

# Installation script
rm install-pipedal.sh
```

### Files to CREATE

```bash
# JUCE engine directory
juce-engine/
├── CMakeLists.txt
├── Source/
│   ├── Map2AudioEngine.h
│   ├── Map2AudioEngine.cpp
│   ├── PluginHost.h
│   ├── PluginHost.cpp
│   ├── PluginGraph.h
│   ├── PluginGraph.cpp
│   ├── MidiHandler.h
│   ├── MidiHandler.cpp
│   ├── VuMeter.h
│   ├── VuMeter.cpp
│   ├── ParameterBridge.h
│   ├── ParameterBridge.cpp
│   ├── SnapshotManager.h
│   ├── SnapshotManager.cpp
│   └── PythonBindings.cpp
└── JUCE/  (git submodule)

# Python service
app/services/juce_engine_service.py  # New unified engine service

# Routes
app/routes/engine.py  # Replaces pipedal.py

# Installation
install-juce.sh  # New build script

# Tests
tests/test_juce_engine.py
```

### Files to MODIFY

| File | Changes |
|------|---------|
| `app/main.py` | Remove pipedal imports, add juce imports |
| `app/routes/plugins.py` | Use `juce_engine_service` instead of `pipedal_engine_service` |
| `app/routes/audio.py` | Use JUCE audio device manager |
| `app/routes/latency.py` | Remove PiPedal references |
| `app/services/service_orchestrator.py` | Replace `pipedal_engine` with `juce_engine` |
| `app/services/parameter_routing.py` | Use JUCE parameter bridge |
| `pyproject.toml` | Update dependencies |

---

## 6. API Compatibility Layer

### Maintaining API Parity

The new `juce_engine_service.py` will expose the same interface:

```python
# app/services/juce_engine_service.py

"""
JUCE Audio Engine Service
Drop-in replacement for pipedal_engine_service.py
"""

import logging
import sys
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Try to import JUCE C++ module
JUCE_AVAILABLE = False
juce_engine = None

try:
    sys.path.insert(0, '/home/mm/map2-audio/juce-engine/build')
    import map2_audio_engine as je
    JUCE_AVAILABLE = True
    juce_engine = je
    logger.info(f"JUCE engine loaded: {je.get_version()}")
except ImportError as e:
    logger.warning(f"JUCE engine not available: {e}")


@dataclass
class AudioEngineConfig:
    """Audio engine configuration"""
    sample_rate: int = 48000
    buffer_size: int = 256
    audio_device: str = "default"
    enable_midi: bool = True
    lv2_path: str = "/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2"


class JuceEngineService:
    """JUCE Audio Engine Service - API compatible with PiPedalEngineService"""

    def __init__(self, config: Optional[AudioEngineConfig] = None):
        self.config = config or AudioEngineConfig()
        self._engine = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize engine - same interface as PiPedal"""
        if not JUCE_AVAILABLE:
            logger.error("JUCE engine not available")
            return False

        try:
            self._engine = juce_engine.create_engine()
            self._engine.set_sample_rate(self.config.sample_rate)
            self._engine.set_buffer_size(self.config.buffer_size)
            self._engine.set_audio_device(self.config.audio_device)
            self._engine.set_lv2_path(self.config.lv2_path)

            result = self._engine.initialize("")
            
            if result:
                if self.config.enable_midi:
                    self._engine.enable_midi(True)
                self._initialized = True
                logger.info(f"JUCE engine initialized: {self._engine.get_version()}")
            
            return result
        except Exception as e:
            logger.error(f"Failed to initialize JUCE: {e}")
            return False

    # ... (all other methods with same signatures as PiPedalEngineService)
    
    # Compatibility aliases
    async def get_current_pedalboard(self) -> Dict[str, Any]:
        """Alias for get_current_chain for PiPedal compatibility"""
        return await self.get_current_chain()


# Singleton
_juce_service: Optional[JuceEngineService] = None


def get_audio_engine() -> JuceEngineService:
    """Get singleton instance - replaces get_pipedal_service()"""
    global _juce_service
    if _juce_service is None:
        _juce_service = JuceEngineService()
    return _juce_service


# Compatibility alias
def get_pipedal_service() -> JuceEngineService:
    """Deprecated: Use get_audio_engine() instead"""
    logger.warning("get_pipedal_service() is deprecated, use get_audio_engine()")
    return get_audio_engine()


# Compatibility exports
PIPEDAL_AVAILABLE = JUCE_AVAILABLE  # For code that checks this
```

---

## 7. Testing Strategy

### Unit Tests

```python
# tests/test_juce_engine.py

import pytest
import asyncio

class TestJuceEngine:
    """JUCE Engine test suite"""
    
    @pytest.fixture
    async def engine(self):
        from app.services.juce_engine_service import get_audio_engine
        engine = get_audio_engine()
        await engine.initialize()
        yield engine
        await engine.shutdown()
    
    async def test_engine_initializes(self, engine):
        assert engine.is_running
        
    async def test_list_plugins(self, engine):
        plugins = await engine.list_plugins()
        assert len(plugins) > 0
        assert all('uri' in p for p in plugins)
        
    async def test_load_unload_plugin(self, engine):
        plugins = await engine.list_plugins()
        test_plugin = plugins[0]['uri']
        
        instance_id = await engine.load_plugin(test_plugin)
        assert instance_id > 0
        
        result = await engine.unload_plugin(instance_id)
        assert result is True
        
    async def test_parameter_control(self, engine):
        plugins = await engine.list_plugins()
        instance_id = await engine.load_plugin(plugins[0]['uri'])
        
        result = await engine.set_parameter(instance_id, 0, 0.5)
        assert result is True
        
        value = await engine.get_parameter(instance_id, 0)
        assert abs(value - 0.5) < 0.01
        
    async def test_vu_levels(self, engine):
        await engine.start_audio()
        await asyncio.sleep(0.1)
        
        levels = await engine.get_vu_levels()
        assert 'input_left' in levels
        assert 'output_left' in levels
```

### Integration Tests

```python
# tests/test_juce_integration.py

import pytest
import httpx

class TestJuceAPIIntegration:
    """Test API endpoints work with JUCE backend"""
    
    BASE_URL = "http://localhost:5000"
    
    async def test_engine_status(self):
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.BASE_URL}/api/engine/status")
            assert resp.status_code == 200
            data = resp.json()
            assert 'running' in data
            
    async def test_plugin_discovery(self):
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.BASE_URL}/api/plugins/discover")
            assert resp.status_code == 200
            data = resp.json()
            assert 'plugins' in data
            assert len(data['plugins']) > 0
```

### Performance Tests

```python
# tests/test_juce_performance.py

import pytest
import time
import asyncio

class TestJucePerformance:
    """Performance benchmarks for JUCE engine"""
    
    async def test_parameter_latency(self, engine):
        """Parameter updates should be < 1ms"""
        instance_id = await engine.load_plugin("http://lv2plug.in/plugins/eg-amp")
        
        times = []
        for _ in range(100):
            start = time.perf_counter()
            await engine.set_parameter(instance_id, 0, 0.5)
            times.append(time.perf_counter() - start)
        
        avg_ms = (sum(times) / len(times)) * 1000
        assert avg_ms < 1.0, f"Parameter update too slow: {avg_ms}ms"
        
    async def test_plugin_load_time(self, engine):
        """Plugin loading should be < 100ms"""
        plugins = await engine.list_plugins()
        
        times = []
        for plugin in plugins[:10]:
            start = time.perf_counter()
            instance_id = await engine.load_plugin(plugin['uri'])
            times.append(time.perf_counter() - start)
            await engine.unload_plugin(instance_id)
        
        avg_ms = (sum(times) / len(times)) * 1000
        assert avg_ms < 100, f"Plugin load too slow: {avg_ms}ms"
```

---

## 8. Rollback Plan

### If Migration Fails

1. **Keep PiPedal code in a branch**
   ```bash
   git checkout -b backup/pipedal-integration
   git push origin backup/pipedal-integration
   ```

2. **Feature flag approach**
   ```python
   # app/config.py
   AUDIO_ENGINE = os.getenv("AUDIO_ENGINE", "juce")  # or "pipedal"
   
   # app/services/__init__.py
   if config.AUDIO_ENGINE == "juce":
       from .juce_engine_service import get_audio_engine
   else:
       from .pipedal_engine_service import get_pipedal_service as get_audio_engine
   ```

3. **Parallel running during transition**
   - Keep both engines available for 2 weeks after migration
   - Allow switching via environment variable
   - Monitor error rates

---

## Appendix: LV2 Support in JUCE

JUCE doesn't have native LV2 support. Options:

### Option A: juce_lv2 Module (Recommended)

Use the community `juce_lv2` module:
- https://github.com/lv2-porting-project/JUCE

```cmake
# Add LV2 support
add_subdirectory(juce_lv2)
target_link_libraries(map2_audio_engine PRIVATE juce_lv2)
target_compile_definitions(map2_audio_engine PRIVATE JUCE_PLUGINHOST_LV2=1)
```

### Option B: lilv Integration

Wrap lilv inside JUCE AudioProcessor:

```cpp
class LV2PluginWrapper : public juce::AudioProcessor {
    lilv::Instance* instance;
    // ...
};
```

### Option C: Carla as Bridge

Use Carla's LV2 hosting, expose as internal plugin.

---

## Quick Start Commands

```bash
# 1. Set up JUCE
cd /home/mm/map2-audio
mkdir juce-engine && cd juce-engine
git submodule add https://github.com/juce-framework/JUCE.git

# 2. Build
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# 3. Test
python -c "import map2_audio_engine; print(map2_audio_engine.get_version())"

# 4. Run with new engine
export AUDIO_ENGINE=juce
cd /home/mm/map2-audio
./start_web.sh
```

---

## Summary

| Aspect | PiPedal (Current) | JUCE (Target) |
|--------|-------------------|---------------|
| **LV2 Support** | Native | Via juce_lv2 module |
| **VST3 Support** | No | Native |
| **MIDI** | Basic | Full |
| **Cross-platform** | Linux only | Linux, macOS, Windows |
| **License** | MIT | Dual (GPL/Commercial) |
| **Maintenance** | External project | Self-maintained |
| **Community** | Small | Large |
| **Documentation** | Limited | Excellent |
| **Tooling** | Manual | Projucer, CMake |

**Recommendation:** Proceed with JUCE migration for long-term maintainability and cross-platform potential. The 8-12 week timeline is conservative; experienced JUCE developers could complete in 6 weeks.
