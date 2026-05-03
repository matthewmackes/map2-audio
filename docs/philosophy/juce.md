# Philosophy — JUCE

> **Audience:** Engineers working in `juce-engine/` or extending the C++↔Python boundary.
> **Scope:** Why MAP2 is built on JUCE 8, the engine's lifecycle and signal chain, the Python bridge, and the RT patterns that make the framework safe to use in production audio.

## 1. The thesis

JUCE is the right framework because it solves the four problems that any cross-platform audio engine has to solve, and it solves them with code that other commercial audio products use. Building any of these from scratch is a multi-quarter project that does not differentiate MAP2:

1. **Cross-platform device I/O.** ALSA / JACK / CoreAudio / WASAPI behind one `AudioDeviceManager`.
2. **Plugin hosting.** LV2, LADSPA, VST3 (host-side), AU — all behind `AudioPluginInstance`.
3. **Graph orchestration.** `AudioProcessorGraph` with built-in plugin delay compensation, sidechains, and topology mutations safe at audio-thread boundaries.
4. **RT-safe building blocks.** `SmoothedValue`, lock-free FIFOs, pre-allocated `AudioBuffer`, JUCE's standard `prepareToPlay`/`processBlock`/`releaseResources` lifecycle.

What MAP2 adds on top is the snapshot model, the device-pack catalogue, AVB transport, the RT monitor, and the controller-host process. The plumbing under those layers is JUCE.

## 2. The shape of `juce-engine/Source/`

About fifty files, organised around four responsibilities:

| Area | Files | Role |
|---|---|---|
| **Core engine** | `Map2AudioEngine.{h,cpp}`, `Common.h` | Top-level orchestrator. Lifecycle, signal-chain order, AVB integration, snapshot bridge. |
| **I/O** | `JuceAudioIO.{h,cpp}`, `AvbAudioIODevice.{h,cpp}`, `AvbAudioIODeviceType.{h,cpp}` | Device opening, callback contract, AVB device type registration. |
| **Graph & hosting** | `JuceAudioGraph.{h,cpp}`, `JucePluginHost.{h,cpp}` | The mutable plugin graph, LV2/LADSPA discovery, plugin instantiation, parameter management. |
| **DSP processors** | 30+ files: `NAMProcessor`, `ConvolutionProcessor`, `DynamicsProcessor`, `ChorusProcessor`, …, `LufsMeter`, `SpectrumAnalyzer`, `CPUMonitor` | Native real-time-safe DSP and metering. |
| **Bindings** | `PythonBindings.cpp` | The pybind11 surface exposed to Python. |
| **Controller host** | `Controllers/`, `ControllerHost/QuickJSEngine.{h,cpp}`, `ControllerHost/EngineApiBindings.{h,cpp}` | The separate-process controller runtime. |

`Common.h` carries the constants that bind the engine to the rest of the platform: `DEFAULT_BUFFER_SIZE = 64`, `MAX_AUDIO_BUFFER_SIZE = 8192`, the sidechain connection struct, and the RT priority targets.

## 3. The audio thread

`JuceAudioIO::audioDeviceIOCallbackWithContext()` is the single audio callback. It is created by JUCE's `AudioDeviceManager` when `startAudio()` succeeds. The thread:

- Runs at SCHED_FIFO 80 (cooperates with PipeWire at 83–88).
- Is pinned to isolated cores 4–5 by `pthread_setaffinity_np` once the thread is spawned.
- Has a 1.33 ms budget per callback (64 samples @ 48 kHz).

Inside the callback:

1. Measure inter-callback interval; flag an xrun if it exceeds 2× expected (`XRUN_JITTER_THRESHOLD`).
2. Load the active `ProcessCallback` with `memory_order_acquire`.
3. Run the plugin chain through `JuceAudioGraph::process()`.
4. Smooth the duration with an exponential moving average (`DURATION_SMOOTHING = 0.1`).
5. Flag a budget overrun if processing time exceeded the period.
6. Update stats with `try_lock`. Drop the update if contended.

The signal chain inside the graph is:

```
Audio Input
  → CPU monitor start
  → Linear plugin chain (PDC handled by AudioProcessorGraph)
  → Optional parallel mixer groups
  → Sidechain feeds
  → NAM
  → Modulation (chorus, flanger, phaser, tremolo, vibrato, ...)
  → Cabinet IR
  → EQ
  → Gate → Compressor → Limiter
  → Reverb IR
  → Output
  → Metering push (lock-free SPSC ring)
  → CPU monitor end
```

Order matters. The limiter sits at the master output as a hardware-equivalent safety net (see *Audio Artifact Management*); reverb is post-limiter only because the reverb's own ceiling is sub-unity.

## 4. The graph and PDC

`JuceAudioGraph` wraps `juce::AudioProcessorGraph`. JUCE handles plugin delay compensation natively — every node's `getTailLengthSeconds()` is queried and the graph compensates so summed branches stay phase-aligned. Custom processors (the convolution engines especially) override the tail estimate so the graph compensates for their internal latency rather than dropping samples.

Topology mutation — adding a plugin, replacing a chain — is gated by `chainMutex_`. The pattern:

1. Build the new node *off-graph*. Call `prepareToPlay()` so it is warm.
2. Acquire the mutex.
3. Connect / disconnect at a block boundary using JUCE's API.
4. Release the mutex.
5. Old nodes are released on the next collection.

The audio thread sees one block on the old topology, one block on the new — never half of each.

## 5. The Python bridge: pybind11, not IPC

This is the design choice that makes Python feel like a thin orchestrator rather than a separate service. `juce-engine/CMakeLists.txt` pulls pybind11 v2.11.1 and produces a single shared object: `map2_audio_engine.cpython-314-x86_64-linux-gnu.so`. Python imports it directly:

```python
# app/services/juce_engine_service.py
import map2_audio_engine
```

There is **no** RPC, no socket, no JSON-over-pipe. Python calls C++ in-process. The `JuceEngineService` class composes mixins (`JucePluginHostMixin`, `JuceAudioIOMixin`, `JuceProcessMixin`, `JuceSnapshotBridgeMixin`) over a singleton.

`PythonBindings.cpp` exposes the C++ types as Python dictionaries and lists: `PluginInfo`, `AudioStats`, `LufsLevels`, `CPUMetrics`, `SpectrumData`. The boundary is type-converting at call time — no serialisation, no schema, no protocol.

The exception is the controller host. *That* runs in a separate process (`map2-controller-host`) over a Unix-domain socket, because controller scripts can be untrusted (Mixxx imports, vendor JS) and must not be able to take down the audio engine. See *Philosophy — MIDI Design*.

## 6. CMake and build flags

`juce-engine/CMakeLists.txt` is opinionated:

- JUCE 8.0.0 via `FetchContent`, shallow clone, pinned tag.
- `CMAKE_BUILD_TYPE = Release` is forced. There is no Debug build of the audio engine — `-O0` would mean RT failure.
- `-O3 -march=native`. `-ffast-math` is **off** by default; the trade-off (denormals, NaN handling) is too risky for a production audio engine.
- LTO is **off**. Link times above five minutes hurt iteration more than LTO helps.
- LV2 host on, LADSPA host on, VST3 host off, AU host off. The platform does not host VST3 binary plugins on the user's machine; LV2 is the production surface for third-party DSP.

Optional flags: `USE_AVB=ON` (default), `USE_AVDECC=ON` (requires libpcap), each guarded by feature detection so a build without the AVB stack still produces a working engine.

## 7. RT patterns specific to this codebase

JUCE provides the framework; MAP2 picks specific patterns and forbids others:

| Pattern | Use |
|---|---|
| `prepareToPlay()` | Allocate buffers, warm up filters, resize internal state. |
| `releaseResources()` | Free buffers when the engine stops. |
| `SmoothedValue` | Every parameter that affects DSP. |
| Atomic flags for bypass | Per-processor `std::atomic<bool> bypass_`. |
| `try_lock` for stats | Audio thread never blocks waiting for observability. |
| Lock-free FIFOs | Metering and parameter updates between threads. |

Forbidden on the audio thread:

- `new`, `malloc`, anything that hits the system allocator.
- `std::mutex::lock` (only `try_lock` allowed).
- Logging (`logger.info` and friends).
- Any STL container that allocates on insert (`std::vector::push_back` past capacity, `std::map`).
- Plugin scanning, file I/O, network calls.

## 8. Plugin formats

LV2 is the production surface. Search paths: `/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2`. Plugin metadata is cached at `/tmp/map2_plugin_cache.xml` to avoid re-scanning on every restart.

Native processors live alongside hosted plugins under engine-internal URIs: `map2://juce/nam`, `map2://juce/convolution/cabinet`, `map2://juce/convolution/reverb`, `map2://juce/sequencer`, `map2://juce/drums`, `map2://juce/synthforge`. From the graph's perspective they are just `AudioProcessor` subclasses; from the snapshot's perspective they are nodes with plugin URIs. The dual identity keeps native and third-party plugins interchangeable in the graph. (Per T_RENAME 2026-05-02 the URI formerly known as `map2://juce/brain` was hard-cut to `map2://juce/sequencer`; existing snapshots referencing the legacy URI lose their plugin slot and the operator re-adds.)

## 9. Why JUCE was chosen over alternatives

- **Raw ALSA**: Linux-only. Future-portability matters; JUCE supports CoreAudio and WASAPI without code changes.
- **Custom DSP framework**: Reimplementing `AudioProcessorGraph`, PDC, `SmoothedValue`, plugin discovery, and parameter management is a year of work that does not differentiate the platform.
- **Tracktion Engine / DAW-style framework**: Too opinionated about timeline/transport. MAP2 is a live processor, not a DAW.
- **Open-source live audio frameworks**: None match JUCE's maturity for plugin hosting and graph mutation safety.

The cost is binding to a specific framework and version. The mitigation is keeping JUCE-specific code inside `juce-engine/Source/` and presenting Python a stable API surface that does not leak JUCE types.

## 10. Where to read next

- `juce-engine/CMakeLists.txt` — build configuration.
- `juce-engine/Source/JuceAudioIO.cpp` — the callback contract.
- `juce-engine/Source/JuceAudioGraph.cpp` — graph mutation and PDC.
- `juce-engine/Source/PythonBindings.cpp` — the pybind11 surface.
- `app/services/juce_engine_service.py` — the Python facade.
- `docs/design/CARBON_CONFORMANCE_STANDARD.md` §10 — operator-state discipline (T2474). The JUCE engine surfaces in the React UI (`AudioEnginePage`, `JuceSourceTruthGraph`, `AudioEngineWorkspaceGraph`, `ClusterEngineGrid`, the per-plugin cards under `web/src/app/components/PluginCards/`) consume the canonical `--map2-latency-*` (good / caution / critical), `--map2-health-*`, and `--map2-state-*` semantic tokens. Per-plugin cards that *deliberately reproduce physical hardware* (MPX1Panel, IntelFXPanel, signal-path canvases) are preserved as device-graphics under §10.5's hardware-skin exception.
