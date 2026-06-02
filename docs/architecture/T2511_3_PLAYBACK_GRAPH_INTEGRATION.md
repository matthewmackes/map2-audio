# T2511-3 — Playback Graph Integration (atomic-switch-only)

| Field | Value |
|---|---|
| **Task** | T2511-3 (parent T2511 — punch-in playback, RT-CRITICAL) |
| **Status** | Design note — locks the integration point before engine surgery |
| **Date** | 2026-06-02 |
| **Author** | Claude (analysis artifact, zero code) |
| **Decision** | **ATOMIC-SWITCH-ONLY** (operator-locked 2026-06-02) — no live graph rebuild, no stop-audio gap |
| **Depends on** | T2511 RT-safe nodes (shipped: `Source/Recorder/Playback/{PlaybackRing,FileInputProcessor,ChainInputSwitch,PlaybackSource,TriggerQueue}.h`), the approved RT-safety review (`T2511_RT_SAFETY_REVIEW.md`) |

> **Why this note exists.** The shipped T2511 nodes are correct and tested in isolation but are **not referenced anywhere in the engine**. Wiring them in is not a drop-in: the engine's input path is not a per-chain graph node today. This note locks *where* the switch sits — on the RT hot path — so the integration commit is mechanical and low-risk instead of exploratory surgery on the audio callback. Zero code; zero `juce-engine/Source/` touch.

---

## 1. The state of the engine input path (verified 2026-06-02)

The engine does **not** route input through per-chain `LiveInputSource` graph nodes. Verified:

- `Map2AudioEngine::audioCallback` (`Map2AudioEngine.cpp:2250`) copies the device input directly into one engine buffer: `buffer.copyFrom(ch, 0, inputs[ch], processSamples)` for each channel (`:2285-2311`), applies input gain (`:2313-2316`), snapshots a dry copy for the graph crossfade (`:2318-2323`), runs `engineRecorder_->capturePreFx(buffer)` (`:2358-2360`), then `audioGraph_->process(buffer, midiBuffer)` (`:2363`).
- `JuceAudioGraph` has a **single** `audioInputNode_` (`JuceAudioGraph.h:378`), not one per chain. The per-chain structure lives *downstream* of the single input buffer.
- `EngineRecorder` (owned by the engine, `Map2AudioEngine.cpp:742`) already maintains the monotonic sample clock: `sampleCounter_` (`EngineRecorder.h:290`), published with `memory_order_release` each buffer (`:180`), readable with `memory_order_acquire` (`:135`). **This is the clock T2511-4's `apply_at_sample` resolves against — no new clock needed.**

**Consequence:** v1 punch-in operates on the **whole-engine input buffer**, not per-chain. A per-chain switch matrix is a later enhancement that would require the input to be split into per-chain buses inside the graph (a separate, larger epic). The locked atomic-switch-only decision is fully compatible with the whole-engine v1 — and is the *right* first step.

---

## 2. The integration point (locked)

Insert the `ChainInputSwitch` decision **at the input-copy boundary** — `Map2AudioEngine.cpp:2283-2311`, immediately before input gain. Pseudocode (the actual commit writes this in place):

```cpp
// BEFORE (today): device input → buffer
for (int ch = 0; ch < copyInputChannels; ++ch)
    buffer.copyFrom(ch, 0, inputs[ch], processSamples);   // :2287

// AFTER (T2511-3): the switch decides what fills `buffer` this block.
//   - active source == LiveInputSource  → copy inputs[ch] (today's path)
//   - active source == FileInputProcessor → pop a frame from its PlaybackRing
inputSwitch_->processInto(buffer, inputs, copyInputChannels, processSamples);
```

Where `inputSwitch_` is one engine-owned `ChainInputSwitch` (v1: whole-engine; the member lives next to `engineRecorder_`). `processInto` is a thin RT-safe adapter over the shipped node:

1. `auto* active = currentSource_.load(acquire);` — **the one load per block** (already the node's contract).
2. If `active` is the live sentinel (or null) → today's `buffer.copyFrom(inputs[ch])` path verbatim (zero behavior change when no take is loaded — the disarmed hot path stays a single load + branch).
3. Else → `active->pullBlock(buffer, processSamples)` (the `PlaybackSource` seam); on ring underrun the node already outputs silence + bumps `underrunCount_` (§4.2), never blocks.
4. Drain the `TriggerQueue` at block start so a sample-accurate `apply_at_sample` switch flips `currentSource_` at the exact intra-block offset (§6). The trigger queue + sub-span walk are already implemented in `ChainInputSwitch`. **Clock correction (verified during the 2026-06-02 integration):** the trigger clock is `ChainInputSwitch`'s OWN free-running `sampleClock_` (starts at 0, advances `+numSamples`/block), NOT `EngineRecorder` — `EngineRecorder` exposes `totalSamplesProcessed()` (there is no `sampleCount()`) and it RESETS to 0 on every arm + only advances while armed, so it is unsuitable for punch triggers that must fire whether or not recording is armed. The controller-host should timestamp `apply_at_sample` against the switch clock (exposable via a getter).

**Everything downstream is unchanged.** `capturePreFx`, `audioGraph_->process`, the T2507 taps, the crossfade-dry capture all run exactly as today — they just see a `buffer` that is sometimes playback instead of live. That is the whole point of putting the switch at the input boundary: it is the *minimal* hot-path change, and it composes with punch-in (live + record-tap simultaneously) for free, because the taps already sit after this point.

---

## 3. Why this honours the approved RT contract

- **§2.2 (no alloc/lock/syscall):** `processInto` is `copyFrom`/`memcpy` + one atomic load + a branch. `FileInputProcessor` reads its pre-allocated ring (no file I/O on the callback — the io_uring reader thread fills it, post-release). Identical cost class to today's input copy.
- **§3.2 (load once per buffer):** the single `currentSource_.load(acquire)` in `processInto` is the only live-atomic read; intra-block sample-accurate switches resolve via the `sources_` index table (the shipped node's design), never a second live load.
- **§3.3 (reclamation):** loading a take installs a `FileInputProcessor*` via the node's `setSource` (CAS, control thread); unloading retires the old pointer through the deferred-free seam (message-thread free ≥1 audio period later). No inline `delete` on the control thread.
- **§4 (off-thread refill):** unchanged — the playback ring is filled by the (post-release) io_uring reader thread; the callback only consumes.
- **Disarmed cost:** when no take is loaded, `currentSource_` is the live sentinel and `processInto` is byte-for-byte today's input copy plus one predicted-taken branch. Zero measurable RT cost — the same discipline as the T2507 `armed_` disarmed path.

---

## 4. What the integration commit will touch (scoped, for the eventual ship)

- `Map2AudioEngine.h` — add `std::unique_ptr<map2::recorder::ChainInputSwitch> inputSwitch_;` + a live sentinel source.
- `Map2AudioEngine.cpp` ctor — construct `inputSwitch_` (allocation here is fine, non-RT); register the live sentinel + per-take `FileInputProcessor`s.
- `Map2AudioEngine.cpp:2283-2311` — replace the input-copy block with `inputSwitch_->processInto(...)` (the live path stays the fallback branch).
- Engine API — `loadTakeForPlayback(takeId, routing)` / `unloadTake()` / `armPunchIn(applyAtSample)` (control-thread; CAS + deferred-free); these are the surfaces the T2508 RecorderService Python facade + the T2511-4 `apply_at_sample` dispatcher path already call toward.
- **Gate (software):** new Catch2 cases driving `processInto` through live↔file↔underrun + a punch-in trigger at a mid-block sample offset, asserting the downstream buffer content. No engine restart, no device. The on-hardware soak stays **post-release debt** (T2511-8).

**Explicitly out of scope (deferred):** per-chain input switching (needs per-chain buses), historical re-amp / plugin-topology rebuild (R2.A1 option c — needs the stop-audio path that was NOT chosen).

---

## 5. Open items the integration commit must still decide (small)

1. **Live sentinel representation** — a dedicated `LiveInputSource` that copies `inputs[ch]`, or a null-pointer fast path in `processInto`. Recommend the explicit sentinel for symmetry with the `PlaybackSource` seam (one code path).
2. **Channel-count reconciliation** — `FileInputProcessor` output channels vs the engine's `processChannels`; reuse the existing clamp/clear logic at `:2293-2295`.
3. **Where `loadTakeForPlayback` is invoked from** — the T2508 RecorderService transport (`recorder_engine_transport.py`) is the natural caller, mirroring how arm/stop already bind to engine methods.

These are mechanical and do not change the locked atomic-switch-only design; they're noted so the integration commit closes them explicitly rather than discovering them mid-surgery.

---

*Pure-analysis artifact. Modifies no code and no file under `juce-engine/Source/`. It locks the T2511-3 integration point so the eventual engine commit is mechanical and stays on the RT contract.*
