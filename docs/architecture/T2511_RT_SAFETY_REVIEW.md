# T2511 — Punch-In Playback RT-Safety Review

| Field | Value |
|---|---|
| **Task ID** | T2511 (parent epic T2504 — Multi-Track Recorder + Playback) |
| **Status** | **RT-safety review — DRAFT for bench sign-off** |
| **Date** | 2026-06-02 |
| **Author** | Claude (analysis artifact, zero code) |
| **Depends on** | T2507 (recording taps + io_uring writer — *shipped*), T2508 (routes + dispatcher), T2509 (UI transport surface) |
| **Reviewer** | _(bench RT reviewer — sign §7 + §8 below)_ |

> **GATE STATEMENT — read first.**
> **No T2511 graph-wiring code ships until this document is signed.** That means: no
> `ChainInputSwitch.{h,cpp}`, no salvaged `FileInputProcessor`, and no
> `JuceAudioGraph` rebuild that swaps a chain's input source may be committed to
> `master` until the bench reviewer has signed both the per-line audit checklist (§7)
> and the verification gates (§8). This is a pure-analysis artifact: it touches no
> code and no file under `juce-engine/Source/`. It exists so the operator's bench
> review has a concrete contract to sign *against* before the RT-critical phase of
> the epic begins.

---

## 1. Executive summary, scope, and what the reviewer signs

T2511 is the most RT-critical phase of the recorder epic. Where T2507 only **read** the
engine buffers into a write-only ring (a one-directional tap), T2511 introduces **playback** —
a WAV file becomes the *input source* for a chain — and **punch-in**, where playback and
recording run **simultaneously on the same chain**. Punch-in is the worst case: it drives the
io_uring path in *both* directions (read for playback, write for the child take) on the same
storage device at the same instant.

The worklist (T2511-1 .. T2511-9) commits the platform to three new audio-graph constructs:

- **`FileInputProcessor`** — a `juce::AudioProcessor` playback source that reads a take's WAV
  through a `juce::BufferingAudioSource` over a `juce::AudioFormatReader` (T2511-1).
- **`ChainInputSwitch`** — a `juce::AudioProcessor` holding `std::atomic<AudioSource*> currentSource`,
  read once per `processBlock` via `load(memory_order_acquire)`, swapped via compare-exchange
  from the controller-host thread (T2511-2).
- A **graph rebuild** that swaps a chain's input from `LiveInputSource` to `ChainInputSwitch`
  while the existing T2507 tap nodes stay in place (T2511-3).

Plus sample-accurate triggers (`apply_at_sample`, T2511-4) and the punch-in workflow itself
(T2511-5).

**State-of-tree note (verified 2026-06-02):** none of `FileInputProcessor`,
`ChainInputSwitch`, or `LiveInputSource` exists in `juce-engine/Source/` yet. The worklist
calls T2511-1 a "salvage" from `juce-engine/Source/_archive/Daw_2026-05-11/Deck/`, but that
directory contains only `BeatGrid`, `ClipLauncher`, `CueModel`, `SlipMode`, and `SyncEngine` —
**there is no `FileInputProcessor.{h,cpp}` to salvage**. T2511-1 is therefore a *new build*
modelled on JUCE's `BufferingAudioSource`/`AudioFormatReader`, not a verbatim revive. The
reviewer should treat every row in §7 as covering code that does not yet exist; the audit is
the design contract the implementation must satisfy.

### What the bench reviewer signs off

1. The audio-thread invariants in §2 are correctly restated and still hold for T2511's new nodes.
2. `ChainInputSwitch`'s atomic-swap discipline (§3) is RT-correct — load-once-per-buffer +
   CAS-from-control-thread, modelled on the proven `armed_` pattern shipped in T2507.
3. The **off-thread refill guarantee** (§4) is mandatory and the design honours it: the audio
   thread never blocks on a disk read.
4. The io_uring bidirectional-contention analysis (§5) is sound and the chosen mitigation
   (separate instances vs. shared-with-throttling) is acceptable.
5. The per-line alloc/lock/syscall audit (§7) has been walked and every row is signed.
6. The verification gates (§8) are all green with the reviewer's signature + date.

---

## 2. Audio-thread invariants (restated)

These are not new for T2511; they are the platform's standing RT contract, restated so the
reviewer signs against an explicit baseline.

### 2.1 The period budget

- **Buffer:** `DEFAULT_BUFFER_SIZE = 64` samples — `juce-engine/Source/Common.h:29`.
- **Sample rate:** `DEFAULT_SAMPLE_RATE = 48000.0` — `juce-engine/Source/Common.h:28`.
- **Period:** 64 / 48000 = **1.333 ms per audio callback**. Every per-buffer operation
  the new nodes add (the `ChainInputSwitch` pointer load, the `FileInputProcessor` FIFO read,
  each tap memcpy) must complete well inside this window with margin for the rest of the chain
  (plugin graph → NAM → modulation → cabinet IR → EQ → dynamics → reverb IR → output → metering).
- **Isolation:** the JUCE callback thread runs on **CPUs 4,5**, isolated via GRUB
  `isolcpus`/`nohz_full`/`rcu_nocbs` and pinned via `CPUAffinity=4 5`. (Reboot caveat: tree is
  still `isolcpus=2,3` until the next reboot — that does not relax the design contract.)

### 2.2 The three hard rules on the audio thread

Inside any `processBlock` / `audioCallback`:

1. **NO heap allocation** — no `new`/`delete`, no `malloc`, no container growth, no
   `std::string`, no `std::vector::resize`, no implicit JUCE allocations.
2. **NO locks** — no `std::mutex`, no `std::condition_variable`, no `futex`, no spinlock that
   can be held by a non-RT thread.
3. **NO syscalls** — no `open`/`read`/`write`/`close`, no `io_uring_submit`/`io_uring_wait_cqe`,
   no logging, no file I/O of any kind.

### 2.3 The proven SPSC-ring precedent (T2507 — shipped)

T2511 must reuse the exact pattern T2507 already shipped and that this review treats as the
gold reference. The audio thread is the single producer; a dedicated non-RT thread is the
single consumer; the handoff is a lock-free `juce::AbstractFifo` over a pre-allocated
`std::array`, with channel data moved by `std::memcpy`.

Real references in the shipped recorder code:

- **Ring storage is pre-allocated, never reallocated** —
  `juce-engine/Source/Recorder/RecordingTap.h:191-192`:
  `std::array<RecordingTapFrame, kTapRingStorageSlots> ring_{};` +
  `juce::AbstractFifo fifo_{kTapRingStorageSlots};`.
- **RT-safe producer write is allocation-free** — `RecordingTap::pushAudioFrame`,
  `RecordingTap.h:105-137`: `prepareToWrite(1, …)` → drop-newest on `size1 <= 0` (bump
  `overflowCount_`) → `std::memcpy` per channel into the pre-allocated frame → `finishedWrite(1)`.
- **The disarmed hot path is a single acquire-load + branch** — `TapNode::processBlock`,
  `juce-engine/Source/Recorder/TapNode.h:132-138`: `if (!armed_.load(std::memory_order_acquire)) return;`.
- **Channel pointers are stack arrays, no allocation** —
  `TapNode.h:169-174` (`const float* channelPointers[kTapMaxChannels];`) and the identical
  construction in `EngineRecorder::captureToTap`,
  `juce-engine/Source/Recorder/EngineRecorder.h:272-281`.
- **All file/io_uring/open/close work is off the audio thread** — `IoUringWriter` runs a
  dedicated `std::thread` (`IoUringWriter.cpp:122`, `writerThread_ = std::thread(...)`) draining
  the ring on a 2 ms poll (`IoUringWriter.cpp:165`, `kPollInterval = 2ms`). The header states the
  contract explicitly: "This module runs on a dedicated `std::thread`; NEVER inside the JUCE
  audioCallback" (`IoUringWriter.h:16-19`).
- **Allocations are permitted on the writer thread only** — the interleave buffer is a
  `thread_local std::vector` resized per frame on the *writer* thread, with the comment
  "Allocations on the writer thread are fine — the RT-safe contract is for the audio thread only"
  (`IoUringWriter.cpp:289`, `drainTapOnce`).
- **Buffer/rate reconfig stops audio before reallocating** — standing platform fact (CLAUDE.md
  RT Safety Status): `setBufferSize()` / `setSampleRate()` stop the stream before any
  reallocation, so the callback never races a resize.

T2511 inherits this pattern wholesale: the playback path is the *mirror image* of the tap —
the audio thread becomes the lock-free *consumer* of a ring that an off-thread reader fills.

---

## 3. `ChainInputSwitch` atomic-swap correctness

### 3.1 The design (T2511-2)

`ChainInputSwitch` is a `juce::AudioProcessor` holding `std::atomic<AudioSource*> currentSource`.
Candidate sources: a `LiveInputSource*` (the chain's normal device input), a
`FileInputProcessor*` configured for post-FX-wet playback, or a `FileInputProcessor*` configured
for pre-FX (through current or original-revision plugins). Per the worklist:

- **Audio thread:** each `processBlock` reads `currentSource.load(std::memory_order_acquire)`
  **exactly once at buffer start**, then pulls the whole buffer from that one source.
- **Control thread:** the controller-host event-handler swaps the pointer via
  **compare-exchange** (e.g. `compare_exchange_strong(expected, desired, acq_rel, acquire)`).

### 3.2 Why this is RT-safe

1. **An atomic pointer load is wait-free and allocation-free.** On x86-64 a naturally aligned
   pointer load is a single `mov`; `memory_order_acquire` adds no fence instruction on x86 (it is
   compiler-ordering only). Cost is a handful of cycles — negligible against the 1.333 ms budget.
2. **Read the pointer ONCE per buffer — never re-load mid-block.** This is the load-bearing
   discipline. If `processBlock` re-read `currentSource` between sample 0 and sample 63, a
   concurrent control-thread swap could tear the buffer across two sources, producing a glitch
   *and* — worse — leaving half the buffer sourced from an object the controller is about to free.
   The mandated pattern is: snapshot the pointer into a local at the top of `processBlock`, then
   use only the local for the rest of the block. Sample-accurate switching within a buffer (§6)
   is achieved by *queued sample-offset triggers*, **not** by re-loading the atomic.
3. **CAS from the control thread never blocks the audio thread.** `compare_exchange_strong` on a
   pointer is lock-free on this platform; the control thread spins at most over its own retry, and
   the audio thread is never made to wait. The audio thread observes either the old pointer or the
   new one — never an intermediate — exactly the single-flag-flip semantics T2507 relies on.
4. **`acquire`/`release` (or `acq_rel` on the CAS) gives the needed happens-before.** The control
   thread fully constructs and *prepares* the new `FileInputProcessor` (its ring pre-filled, see
   §4) **before** the release-store/CAS publishes the pointer. The audio thread's acquire-load then
   sees a fully initialized source. There is no window where the audio thread can dereference a
   half-constructed object.

### 3.3 The proven precedent: `armed_` in `TapNode`

`ChainInputSwitch` is the *same shape* as the already-shipped, already-soaked T2507 arm flag —
only the payload differs (a pointer instead of a bool). The reference:

- **Audio-thread acquire-load once per buffer** —
  `juce-engine/Source/Recorder/TapNode.h:136`:
  `if (!armed_.load(std::memory_order_acquire)) { return; }`.
- **Control-thread release-store** — `TapNode::setArmed`, `TapNode.h:80-86`:
  resets the sample counter + warn flag with `memory_order_release`, then
  `armed_.store(shouldArm, std::memory_order_release);` — the flag is published *after* the
  associated state is set, so the audio thread observes a consistent snapshot.
- **The member declaration** — `TapNode.h:216`:
  `std::atomic<bool> armed_ {false};`.
- **The same idiom in `EngineRecorder`** — the disarmed early-out is
  `EngineRecorder.h:157` / `:171` / `:191` (`armed_.load(std::memory_order_acquire)`), and arming
  publishes via release-store at `EngineRecorder.h:117` (`armed_.store(true, std::memory_order_release);`).
- The header comment already names the pattern's pedigree: it "Matches the industry-standard
  pattern (JUCE AudioProcessor::isSuspended, Mixxx ControlValueAtomic, JACK transport state)"
  (`TapNode.h:14-16`).

**Reviewer note.** The one delta versus `armed_` is *lifetime*: `armed_` flips a `bool`, so the
object behind it never goes away. `ChainInputSwitch` swaps a *pointer to a heap object*. The
reviewer must confirm the **reclamation discipline**: after a CAS away from a `FileInputProcessor*`,
the old source must not be freed until it is provably no longer referenced by the audio thread.
The safe rule (and the one this review requires) is: the control thread defers destruction by at
least one full audio period after the swap is observed (e.g. retire the old source to a deferred-
free queue drained on the message thread, never `delete` it inline in the CAS handler). This is
the audio-graph analogue of RCU grace-period reclamation.

---

## 4. THE KEY RISK — playback refill MUST be fully off-thread

This is the single highest-risk item in T2511 and the primary thing the bench reviewer is being
asked to protect.

### 4.1 The failure mode

`FileInputProcessor` plays a WAV. The naive implementation reads the file *in* `getNextAudioBlock`/
`processBlock`. That is a **syscall (and possibly a blocking disk read) on the audio thread** —
an instant violation of §2.2 rule 3. Two concrete ways it bites:

1. **`BufferingAudioSource` underrun.** `juce::BufferingAudioSource` runs a background reader
   thread that pre-fills a buffer ahead of playback. If that thread is starved (CPU contention,
   a slow disk, a too-small look-ahead), the audio thread calls `getNextAudioBlock` and finds the
   buffer **empty**. JUCE's documented behaviour is to return silence (an audible dropout) — but
   if the look-ahead is configured to block-until-ready, the audio thread *stalls on a
   condition variable*, blowing the 1.333 ms budget and producing an xrun.
2. **io_uring read-completion blocking the callback.** If playback reads are issued via io_uring
   and the audio thread ever calls `io_uring_submit` or `io_uring_wait_cqe` to fetch the next
   block, the callback is now performing syscalls and potentially *waiting on disk*. On the 64-
   sample period this is catastrophic — a single uncached read latency (even sub-millisecond NVMe)
   can exceed the remaining budget after the plugin chain has run.

### 4.2 The concrete guarantee (mirror of the T2507 tap)

Playback is the tap pattern run in reverse. The contract:

- A **separate reader thread** (the playback analogue of `IoUringWriter`'s `writerThread_`,
  `IoUringWriter.cpp:122`) does *all* file work: it issues the io_uring **read** submissions,
  waits on the completions, decodes WAV frames, and pushes them into an SPSC ring.
- The **audio thread only does a lock-free FIFO read + memcpy** out of that ring — the exact
  inverse of `RecordingTap::pushAudioFrame` (`RecordingTap.h:105-137`). It calls the consumer
  side (`prepareToRead`/`finishedRead` on a `juce::AbstractFifo`), memcpys the frame into the
  output buffer, and returns. No `prepareToReadFrame` style call ever touches a file descriptor.
- **io_uring read submission and completion NEVER happen on the audio thread.** Submission lives
  entirely on the reader thread, identically to how `io_uring_submit` /
  `io_uring_wait_cqe` only ever run inside `IoUringWriter::drainTapOnce` /
  `drainAutomationOnce` on the writer thread (`IoUringWriter.cpp:242,248,355,367`).
- **Underrun policy is drop-to-silence + a counter, never a stall.** When the playback ring is
  empty (reader fell behind), the audio thread outputs silence for that buffer and bumps an
  `underrunCount_` atomic — the exact mirror of the recorder's drop-newest-and-count policy
  (`RecordingTap.h:113-119`). It must **never** block waiting for the reader.

### 4.3 Ring sizing

Reuse T2507's proven cushion. The recording tap is **16 frames × 1024 samples × ≤8 channels**:

- `kTapRingFrameCount = 16` — `juce-engine/Source/Recorder/RecordingTap.h:47`.
- `kTapMaxSamplesPerFrame = 1024` — `RecordingTap.h:48`.
- `kTapMaxChannels = 8` — `RecordingTap.h:49`.
- Storage is `kTapRingFrameCount + 1` to absorb the `AbstractFifo` sentinel slot —
  `kTapRingStorageSlots`, `RecordingTap.h:55`.
- The header documents the cushion: "16 frames per ring (~340 ms cushion at 48 kHz when each
  frame is one audio-callback buffer)" (`RecordingTap.h:24-27`), at a footprint of 128 KB/tap
  (`RecordingTap.h:31-33`).

For playback, **at minimum match the 16×1024 cushion**; because the consumer (audio thread) is
hard-real-time while the producer (reader thread) is best-effort, the playback ring should if
anything be sized *deeper* than the record ring — the reader can burst-fill ahead, and a deeper
ring tolerates a longer scheduler hiccup on the non-isolated reader thread. The reviewer should
confirm the chosen depth gives ≥ the look-ahead that `BufferingAudioSource` would need at
64-sample blocks, and that the sentinel `+1` slot convention is preserved (mismatching it silently
steals one usable frame).

---

## 5. io_uring bidirectional contention under punch-in

### 5.1 The scenario (T2511-5)

A take is playing back on a chain (io_uring **reads** feeding the playback ring). The operator
triggers punch-in: at sample S the `ChainInputSwitch` flips from playback to live, the T2507 taps
for that chain arm, and a **child WAV opens** for the overdub (io_uring **writes**). For the
punch-in window, the *same chain* drives io_uring **reads (playback) + writes (record) on the same
storage device simultaneously**. Per the worklist this is "the most RT-critical piece of the
epic … Locks here would forfeit the platform's <5 ms latency budget."

### 5.2 SQ-depth analysis

The shipped writer uses **SQ depth 32 for 2 taps**:

- `kIoUringSqDepth = 32` — `juce-engine/Source/Recorder/IoUringWriter.h:39`,
  used at `io_uring_queue_init(kIoUringSqDepth, &uring_, 0)` — `IoUringWriter.cpp:106`.
- The rationale in-code: "2× the worklist minimum of 16 for v1's pre+post pair"
  (`IoUringWriter.h:11`), i.e. ~16 SQEs of headroom per tap.

The writer already self-throttles: `drainTapOnce` submits one write per frame and
**reaps each completion before recycling the interleave buffer** (`IoUringWriter.cpp:355-376`),
and on a full SQ it harvests completions before retrying (`IoUringWriter.cpp:308-340`). So today's
write side cannot overrun depth 32. The question T2511 must answer is whether **adding playback
reads to the same io_uring** changes that.

- If playback shares the **same `io_uring` instance** as the writer, the read SQEs compete with
  write SQEs for the same 32 slots. Under continuous punch-in the writer is submitting pre/post
  child-take writes *and* the reader is submitting playback reads against one queue. Depth 32
  becomes "16 reads + 16 writes" at best, and the per-frame submit-then-wait discipline means a
  read completion can sit behind a write completion (head-of-line blocking on the CQ). This raises
  worst-case completion latency on the reader thread — tolerable *only because* the audio thread
  reads from the ring, not the queue (§4), but it eats the ring's look-ahead cushion faster.
- The writer's drain loop also assumes it owns the queue — it calls `io_uring_wait_cqe`
  (`IoUringWriter.cpp:367`) and reaps **whatever** completes. If reads and writes share the queue,
  that wait could reap a *read* completion in the *write* drain path, corrupting the write
  thread's `inFlight` accounting. Sharing one queue across two threads is **not** safe with the
  current code as written.

### 5.3 Recommendation

**Use a separate `io_uring` instance for playback reads**, owned exclusively by the playback
reader thread, distinct from the writer's instance. Rationale:

1. It preserves the writer's invariant that it owns its queue and reaps only its own completions —
   the existing T2507 code does not have to change.
2. Reads and writes no longer contend for the same 32 SQ slots; each path sizes its own depth.
3. The kernel still schedules both against the same block device, but contention is now resolved
   at the I/O scheduler, not inside a shared userspace ring — which is the correct layer for it.

If a single shared instance is chosen instead for resource reasons, it **must** be guarded by:
(a) a deeper SQ (≥ 64 to keep ~32 per direction), (b) a single owning thread that services both
read and write submissions/completions (never two threads on one ring), and (c) `user_data`
tagging so completions are demultiplexed back to read vs. write paths — the writer already sets
`sqe->user_data` (`IoUringWriter.cpp:350`), so the convention exists but would need a discriminator
bit. The separate-instance path is strongly preferred; shared-with-throttling is the fallback.

### 5.4 Overflow / failure-counter monitoring

The platform already surfaces I/O health through counters the soak harness can assert on:

- **Write-side ring overflow (drop-newest):** `RecordingTap::overflowCount()`
  (`RecordingTap.h:169-172`), aggregated as `preRingOverflowCount` / `postRingOverflowCount` in
  `RecorderServiceStatus` (`RecorderService.h:68-69`, populated at `RecorderService.cpp:107-112`).
- **io_uring submit/failure tallies:** `WavWriterStats::ioUringSubmits` / `ioUringFailures`
  (`IoUringWriter.h:46-48`), incremented across `drainTapOnce` (`IoUringWriter.cpp:319,336,357,368`).

T2511 must add the **symmetric playback-read counters**: a playback-ring **underrun** count
(reader fell behind → audio thread output silence) and a playback io_uring **read-failure** count.
The acceptance gate (§8) requires **SQ overflow = 0** and underruns = 0 over the soak; without the
new counters the gate cannot be measured.

---

## 6. Sample-accurate trigger safety (`apply_at_sample`)

T2511-4 extends `engine_command` with an optional `apply_at_sample` field. The controller-host
timestamps a punch trigger against the current audio sample clock (read from a shared-memory
atomic the JUCE callback updates each buffer), and the trigger is applied at the exact sample
offset within the current/next buffer.

RT-safety requirements the reviewer signs against:

1. **The switch happens inside `processBlock` only.** The sample-accurate flip of
   `ChainInputSwitch.currentSource` (or the equivalent intra-buffer source selection) is performed
   by the audio thread *as it walks the buffer*, by comparing the per-sample index against a queued
   trigger offset. It is **not** performed by the control thread reaching into the audio thread's
   buffer.
2. **Triggers arrive via a lock-free queue, pre-allocated.** The controller-host pushes
   `{apply_at_sample, desired_source}` entries through an SPSC ring (the same `AbstractFifo`
   pattern as §2.3). The audio thread *drains* pending triggers at buffer start into stack locals;
   it never allocates to receive a trigger. This mirrors the automation-capture ring already
   shipped — `EngineRecorder::capturePluginParameter` pushes parameter events into a pre-allocated
   `kAutomationRingCapacity = 2048` ring (`EngineRecorder.h:54`, `:188-206`) with drop-newest on
   full (`EngineRecorder.h:196-199`). The trigger queue uses the identical discipline.
3. **Out-of-window triggers are clamped, not dropped silently.** A trigger whose
   `apply_at_sample` falls before the current buffer's start (clock skew / late delivery) applies
   at sample 0 of the current buffer; one that falls after the current buffer is held for a later
   buffer. The audio thread must not spin or wait for "the right buffer."
4. **The shared sample-clock atomic is published with `release`, read with `acquire`** — the same
   discipline the recorder uses for `sampleCounter_` (`EngineRecorder.h:180-181` stores with
   `memory_order_release`; readers load with `memory_order_acquire`,
   `EngineRecorder.h:135`). The controller-host reads it `acquire`.

---

## 7. Per-line alloc / lock / syscall AUDIT CHECKLIST

The reviewer walks each row against the implementation **as it lands** and signs the row. ✅ =
asserted RT-safe; ❌ = must be fixed before merge. All rows currently describe code that does not
yet exist (see §1 state-of-tree note); the verdict column is the **target** the implementation
must meet.

| File | Function | Operation | RT-Safe? | Reviewer sign-off | Notes |
|---|---|---|:---:|---|---|
| `ChainInputSwitch.cpp` | `processBlock` | `currentSource.load(acquire)` **once** at buffer start into a local | ✅ (target) | ☐ | Single acquire-load; never re-load mid-block. Mirror of `TapNode.h:136`. |
| `ChainInputSwitch.cpp` | `processBlock` | pull buffer from the *local* source pointer only | ✅ (target) | ☐ | Tearing-free: §3.2 rule 2. Confirm no second `.load()` exists in the function. |
| `ChainInputSwitch.cpp` | `setSource` (control thread) | `compare_exchange_strong(acq_rel, acquire)` | ✅ (target) | ☐ | Lock-free pointer CAS; runs on controller-host thread, not audio. §3.2 rule 3. |
| `ChainInputSwitch.cpp` | `setSource` (control thread) | reclamation of the **old** source | ⚠️ → ✅ (target) | ☐ | Must defer free ≥ 1 audio period (deferred-free queue / message thread). No inline `delete`. §3.3 reviewer note. |
| `ChainInputSwitch.cpp` | `prepareToPlay` / ctor | any allocation | ✅ (target) | ☐ | Allocation allowed here (non-RT), forbidden in `processBlock`. Confirm none leak into the hot path. |
| `FileInputProcessor.cpp` | `processBlock` | lock-free ring read + `memcpy` to output | ✅ (target) | ☐ | Mirror of `RecordingTap::pushAudioFrame` (`RecordingTap.h:105-137`) run as consumer. |
| `FileInputProcessor.cpp` | `processBlock` | **file read / `io_uring_submit` / `wait_cqe`** | ❌ MUST NOT APPEAR | ☐ | Any FD/io_uring op in this function fails the review. §4.1. |
| `FileInputProcessor.cpp` | `processBlock` | underrun handling | ✅ (target) | ☐ | Output silence + bump `underrunCount_` atomic; never block. Mirror `RecordingTap.h:113-119`. |
| `FileInputProcessor` reader thread | `readLoop` (off-thread) | `open`/`io_uring` read submit + `wait_cqe` + WAV decode | ✅ (target) | ☐ | All file work here, off the audio thread. Mirror `IoUringWriter::writerThreadFunc` (`IoUringWriter.cpp:162-180`). Allocations OK off-thread. |
| `BufferingAudioSource` read path | background reader → ring | look-ahead depth ≥ playback ring cushion | ✅ (target) | ☐ | Confirm look-ahead ≥ §4.3 sizing; confirm audio thread never calls a blocking `waitForNextAudioBlockReady`. |
| `JuceAudioGraph` (rebuild) | input-source swap (control thread) | graph mutation while audio runs | ⚠️ → ✅ (target) | ☐ | Graph rebuild must follow the existing "stop-audio-before-reconfig" discipline OR mutate only via the atomic switch; confirm taps (T2507) stay mounted. T2511-3. |
| `IoUringWriter` (playback-read addition) | new read path | separate io_uring instance vs. shared queue | ⚠️ → ✅ (target) | ☐ | §5.3: separate instance preferred. If shared, single owning thread + deeper SQ + `user_data` discriminator. |
| Trigger queue | `processBlock` drain | SPSC `AbstractFifo` read of `apply_at_sample` triggers | ✅ (target) | ☐ | Pre-allocated; drop-newest. Mirror automation ring (`EngineRecorder.h:188-206`). §6 rule 2. |
| Sample-clock shm | callback publish | `store(release)` / control-thread `load(acquire)` | ✅ (target) | ☐ | Mirror `sampleCounter_` (`EngineRecorder.h:180-181` / `:135`). §6 rule 4. |

---

## 8. Bench-reviewer verification gates

All gates must be green and the review signed before any T2511 graph-wiring code merges to
`master`. These are the measurable, falsifiable conditions behind the §1 sign-off.

- ☐ **Clean optimized build.** `cmake -B juce-engine/build && cmake --build juce-engine/build`
  exits clean with the forced Release flags (`-O3 -march=native`, `-ffast-math` OFF). No warnings
  introduced in the new Playback/ sources.
- ☐ **ThreadSanitizer clean under load.** A TSan build (e.g. `build-asan`/dedicated tsan build)
  runs continuous punch-in/punch-out for ≥ 5 min with **zero** data-race reports — specifically on
  `ChainInputSwitch::currentSource`, the playback ring, and the trigger queue.
- ☐ **Heap snapshot start == end.** Capture heap allocation totals at session arm and again after
  a full play → punch-in → punch-out → stop cycle; the steady-state delta across the audio thread
  is **zero** (all audio-thread structures pre-allocated). Use the same allocator-hook / massif-style
  snapshot the recorder soak uses.
- ☐ **`perf` shows zero blocking syscalls in the callback.** `perf record`/`perf report` over the
  JUCE callback symbol shows **no** `futex_wait`, **no** `openat`, **no** `read`, **no** `write`,
  and **no** `io_uring_enter` attributed to the audio-callback call stack. Any such symbol in the
  callback fails the gate.
- ☐ **io_uring SQ overflow count = 0.** Across the soak, the playback read-failure counter and the
  write-side `ioUringFailures` (`IoUringWriter.h:48`) both read **0**; no SQE-acquisition failure
  (`io_uring_get_sqe` returning null) is recorded on either path.
- ☐ **Playback underrun count = 0.** The new `FileInputProcessor` underrun counter reads **0** over
  the soak — the reader thread never starved the audio thread.
- ☐ **30-min punch-in soak: 0 xruns / < 0.35 ms peak jitter.** Per T2511-8: simultaneous playback
  + record on the same chain, continuous punch-in/punch-out every 5 s for 30 min. Acceptance
  thresholds: **0 xruns** and **< 0.35 ms peak jitter**. Evidence archived under
  `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2511-punch-in-rt/`. (Note the standing requirement to
  run the engine with `MAP2_AUDIO_PREFER_JACK=1` so JUCE takes the JACK-direct path; ALSA-via-
  PipeWire adds ~5 ms scheduling jitter and would invalidate the jitter gate.)
- ☐ **Ring-overflow counters clean.** `preRingOverflowCount` / `postRingOverflowCount`
  (`RecorderService.h:68-69`) and the new playback underrun counter all read 0 in the final
  `RecorderServiceStatus` snapshot.

---

### Reviewer sign-off

> By signing below, the bench reviewer attests that §2 invariants hold for T2511's new nodes, the
> §3 atomic-swap discipline is RT-correct, the §4 off-thread-refill guarantee is honoured, the §5
> io_uring contention mitigation is acceptable, every §7 row is walked and signed, and every §8
> gate is green. Only then may T2511 graph-wiring code ship.

| | |
|---|---|
| **Reviewer name** | ______________________________ |
| **Signature** | ______________________________ |
| **Date** | ______________________________ |
| **Build hash reviewed** | ______________________________ |
| **Soak evidence path** | `docs/fit-for-purpose-evidence/__________/t2511-punch-in-rt/` |

---

*This is a pure-analysis artifact. It modifies no code and no file under `juce-engine/Source/`.
It is the contract the T2511 implementation must satisfy before merge.*
