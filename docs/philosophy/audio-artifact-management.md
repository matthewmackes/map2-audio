# Philosophy — Audio Artifact Management

> **Audience:** Engineers writing or reviewing any code that touches the audio thread.
> **Scope:** Clicks, pops, xruns, glitches — the things that turn a guitar rig into a science project. How MAP2 prevents them, detects the ones that escape, and proves the result over hours of soak.

## 1. The thesis

A musician should never hear the platform. Every audio operation — parameter change, plugin bypass, snapshot recall, IR swap, NAM model load, sample rate change — must either be inaudible or be explicitly muted. The codebase enforces this through five disciplines:

1. **Pre-allocation.** Nothing on the audio thread allocates.
2. **Smoothing.** Discrete parameter changes become continuous ramps before they reach DSP.
3. **Atomic bypass.** Graph-level changes flip an `std::atomic<bool>`, not a graph topology mid-block.
4. **Stop-then-reconfigure.** Buffer/sample-rate changes stop audio first, reconfigure, then restart.
5. **Last-line limiter.** A `juce::dsp::Limiter` sits at the master output as a hardware-equivalent safety net.

If any of these slip, the soak harness catches it before a release ships.

## 2. Pre-allocation: nothing allocates in `audioCallback`

`JuceAudioIO::audioDeviceIOCallbackWithContext()` is the engine's single audio callback. It runs at SCHED_FIFO 80 on isolated cores 4–5 with a 1.33 ms budget (64 samples @ 48 kHz). The contract:

- Output buffers are zeroed via `clear()`, not reallocated.
- `tempBuffer_` in `JuceAudioGraph` is sized in `prepareToPlay()` and never touched again.
- The `ProcessCallback` is loaded with `memory_order_acquire` from an `std::atomic`; swapping the chain is a pointer flip, not a copy.
- Stats updates use `std::try_to_lock`. If contended, the audio thread *skips the update* rather than blocking — observability is allowed to drop a sample, audio is not.

Plugins are held to the same contract. The internal NAM, convolution, EQ, gate, compressor, modulation, and limiter processors all carry the comment "all buffers pre-allocated in `prepareToPlay()`. Zero heap allocations in audio callback." Buffer sizes are recalculated only when `prepareToPlay()` is called, which only happens with the audio engine stopped.

Python-side, the GC threshold is tuned (`gc.set_threshold(3500, 10, 10)`) to reduce gen-0 churn on the shared event loop, because a backend pause caused by GC propagates into WebSocket back-pressure, which propagates into UI hitches that *look* like audio glitches even when they aren't.

## 3. Smoothing: discrete becomes continuous

Every parameter that affects DSP goes through `ParameterBridge` (`juce-engine/Source/ParameterBridge.cpp`). The bridge:

- Holds a JUCE `SmoothedValue<float>` per parameter with a configurable ramp time (10 ms default for MIDI CC, longer for snapshot recall).
- Receives discrete value changes via a lock-free SPSC ring (parameter writes never block the audio thread).
- Applies smoothing per audio block. A jump from 0.0 to 1.0 becomes a 480-sample ramp at 48 kHz with a 10 ms ramp — well below the click threshold.

When lock contention happens during RT processing, the bridge falls back to immediate application (`std::try_to_lock` then bypass smoothing). The reasoning: a single un-ramped sample is less audible than a missed callback. This is the only case where the bridge is allowed to be discontinuous, and it is rare in practice.

## 4. Atomic bypass: don't mutate the graph

Plugin enable/disable is **never** a graph topology change. Each processor (`DynamicsProcessor`, `ConvolutionProcessor`, `NAMProcessor`, etc.) carries its own `std::atomic<bool> bypass_`. The audio callback reads it once per block; if `true`, it copies input to output and skips the DSP. The graph stays connected, the buffer flow stays consistent, and the bypass is sample-accurate.

Graph reshape — adding a plugin, replacing a chain — is gated by `chainMutex_` in `JuceAudioGraph` and uses JUCE's `AudioProcessorGraph` whose connection API is designed for safe mid-runtime mutation. `prepareToPlay()` is called on new nodes before they are wired in, so they are warm by the time audio reaches them. The graph rewire happens at a block boundary, never inside one.

The recent fix in commit `2c8db49d` ("render every plugin instead of dropping unmatched ones") is part of the same discipline: a plugin that the chyron card couldn't match was previously *dropped* from the rendered graph. That is a topology change disguised as a UI bug. The fix preserves the plugin in the chain and renders it with a fallback descriptor.

## 5. Stop-then-reconfigure: buffer and sample rate

`setBufferSize()` and `setSampleRate()` (`juce-engine/Source/JuceAudioIO.h`) used to reallocate while the audio thread was live. That was the single largest source of glitches in 2026-02. The fix (2026-02-17):

```
stopAudio()           // wait for callback to drain
reconfigureDevice()   // resize internal buffers
restartAudio()        // reopen, prepareToPlay, go
```

This is mandatory for any operation that changes the size of pre-allocated state. The `Tier A` lock in CLAUDE.md (buffer=64, rate=48 kHz, backend=PipeWire) means these methods are rarely called in production — a runtime change is a controlled event, not a casual one.

## 6. Hot-swap of heavy assets: NAM and IR

Two asset types deserve special treatment because they are large and their processors are stateful: NAM models (often 2–8 MB, with internal RNN state) and convolution IRs (multi-second files, partitioned FFT state).

Both follow the same pattern:

1. New asset is loaded on a **background thread**.
2. Loader resamples to current sample rate, builds the FFT/network state.
3. Atomic pointer swap installs the new asset.
4. Old asset is released on the next collection.

`ConvolutionProcessor` adds `isModelLoading()` so downstream processors can defer until the swap completes. `NAMProcessor` does the same. The audio thread sees one block of the old model, then one block of the new — never half of each.

## 7. Snapshot recall is a smoothed apply

Snapshot activation is all-or-nothing at the *intent* level (see *Snapshot Single Source of Truth*), but parameter delivery to the engine routes through the parameter bridge. So even a complete state change — every plugin parameter at once — comes out as ramps, not steps. There is no separate "snapshot fader" because there does not need to be one. The same smoothing path that handles a CC handles snapshot recall.

The exception is graph topology: if a snapshot adds or removes a plugin, that is a graph mutation and uses the atomic-bypass and stop-then-reconfigure rules above, not the smoother.

## 8. Output limiter: the safety net

A `DynamicsProcessor` configured as `Mode::Limiter` (-0.5 dB threshold, 60 ms release) is unconditionally inserted at the master output. It is RT-safe, atomic-bypass-able, and built on `juce::dsp::Limiter<float>`. Its purpose is not loudness — it is to catch the unexpected. If a plugin overshoots, an IR introduces gain, or a NAM model peaks higher than expected, the limiter eats the transient instead of pushing speakers or ears past their limits. This is the digital equivalent of a hardware brick-wall and is treated as non-negotiable.

## 9. Detection: the RT monitor

Pre-allocation, smoothing, and atomic bypass are *prevention*. The platform also assumes prevention will fail and instruments the engine to catch it.

`app/services/rt_monitor.py` and `juce-engine/Source/JuceAudioIO.cpp` together track:

- Per-callback duration.
- Inter-callback interval jitter.
- A 2× expected-period threshold (`XRUN_JITTER_THRESHOLD`).
- A budget overrun threshold (callback time exceeds `numSamples / sampleRate`).

Counters are atomic; history is a fixed-size deque that never reallocates. Statistics include min/max callback time, jitter estimate, p95/p99 — exposed via `/api/system/audio-status` for operators and Grafana.

## 10. Proof: the soak harness

Prevention plus detection plus *demonstration* is what gets a release shipped. The `juce-random-effects-soak` skill (`.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`) randomises plugin chains and topology rotation while the engine runs for hours, with thresholds:

- `--threshold-max-xruns 0` — zero xruns allowed in the steady state.
- `--threshold-max-peak-jitter-ms 0.35` — 350 µs peak jitter ceiling.
- 8-hour duration target for release-grade evidence.

Output lands in `docs/fit-for-purpose-evidence/<YYYYMMDD>/` as JSON metrics plus a Markdown summary, ready to attach to an audit. The soak is the *only* artefact that can mark a release "ship-ready" on the audio side.

## 11. Vocabulary discipline

The codebase uses precise terms — "xrun", "jitter", "budget overrun", "click" — and avoids "glitch", which is too imprecise to act on. A bug report that says "I hear a click on snapshot recall" points at the smoother. "I see periodic xruns at 60 s intervals" points at scheduling. "Jitter rises after 4 hours" points at memory pressure or thermal. The vocabulary is the first step in the fix.

## 12. Where to read next

- `juce-engine/Source/ParameterBridge.cpp` — the smoothing layer.
- `juce-engine/Source/JuceAudioIO.cpp` — the callback contract.
- `app/services/rt_monitor.py` — the detection layer.
- `.codex/skills/juce-random-effects-soak/` — the soak harness.
- `docs/fit-for-purpose-evidence/` — historical evidence.
