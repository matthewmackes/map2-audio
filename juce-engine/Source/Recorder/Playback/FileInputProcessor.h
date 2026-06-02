// =============================================================================
// T2511-1 — FileInputProcessor (juce::AudioProcessor playback source that is
//           a PURE CONSUMER of a pre-filled PlaybackRing).
// =============================================================================
//
// Plays a take's WAV into a chain as the chain's input source. This is
// the audio-graph node end of the playback path; it is the MIRROR of
// T2507's TapNode (TapNode.h) — where TapNode pushes the live buffer into
// a RecordingTap when armed, FileInputProcessor pops a pre-filled frame
// out of a PlaybackRing and writes it to the output buffer.
//
// THE WHOLE POINT (docs/architecture/T2511_RT_SAFETY_REVIEW.md §4, §7):
//   processBlock() does ZERO file/io_uring/open/read work. It is the
//   §7 "❌ MUST NOT APPEAR" row: any file descriptor or io_uring
//   operation in processBlock fails the review. All file work lives on a
//   SEPARATE reader thread (readLoop, the playback analogue of
//   IoUringWriter's writerThreadFunc) which fills the ring via io_uring
//   reads + WAV decode. The audio thread ONLY does a lock-free ring read
//   + memcpy + (on underrun) silence.
//
// RT-safety contract (operator-approved):
//   - processBlock when NOT playing: one atomic acquire-load + branch,
//     then leave the buffer untouched (passthrough of whatever upstream
//     wrote). Mirror of TapNode's disarmed hot path (TapNode.h:136).
//   - processBlock when playing: pop one frame from the PlaybackRing
//     (PlaybackRing::popAudioFrame) into the output buffer. On underrun
//     (ring empty — reader fell behind) output silence + the ring bumps
//     its underrunCount_. NEVER block. (§4.2)
//   - Zero heap alloc, zero locks, zero syscalls in processBlock.
//     Channel-pointer arrays are stack (float* ch[kPlaybackMaxChannels]).
//
// SCOPE OF THIS SLICE (T2511-1, RT-safe consumer side only):
//   The off-thread io_uring reader (readLoop) is intentionally a
//   DOCUMENTED STUB here — its full io_uring + WAV-decode body is
//   post-release bench work (the §5 separate-io_uring-instance + §8 soak
//   gate). What ships and is tested NOW is the complete, correct
//   audio-thread CONSUMER path + the ring. Tests drive the ring directly
//   (the reader's job) so the consumer path is fully exercised without a
//   half-built reader on the audio thread. We do NOT put any partial
//   reader work on the audio thread.

#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <thread>

#include <juce_audio_processors/juce_audio_processors.h>

#include "Recorder/Playback/PlaybackRing.h"
#include "Recorder/Playback/PlaybackSource.h"

namespace map2::recorder {

/**
 * Audio-graph node that produces audio by consuming a PlaybackRing.
 *
 * Owns its own PlaybackRing (one ring per source). The off-thread reader
 * (the playback analogue of T2507-4 IoUringWriter) holds a non-owning
 * pointer to the ring and FILLS it; the audio thread DRAINS it.
 *
 * Also implements PlaybackSource so a ChainInputSwitch can hold and swap
 * it as one of its candidate sources (§3.1).
 */
class FileInputProcessor : public juce::AudioProcessor,
                           public PlaybackSource {
public:
    explicit FileInputProcessor(std::string takePath,
                                int numChannels = 2)
        : takePath_(std::move(takePath)),
          declaredChannels_(numChannels),
          ring_(std::make_unique<PlaybackRing>())
    {}

    ~FileInputProcessor() override {
        // Defensive: ensure the reader thread (when wired post-release)
        // is stopped before the ring it points at is destroyed.
        stopReader();
    }

    FileInputProcessor(const FileInputProcessor&)            = delete;
    FileInputProcessor& operator=(const FileInputProcessor&) = delete;

    // ------------------------------------------------------------------
    // Operator-side API (non-RT). All flips use the atomic seam.
    // ------------------------------------------------------------------

    /// Start / stop producing audio. The audio thread observes the flag
    /// on its next callback via an acquire-load — same release-store
    /// publish discipline as TapNode::setArmed (TapNode.h:80-86).
    void setPlaying(bool shouldPlay) noexcept {
        playing_.store(shouldPlay, std::memory_order_release);
    }

    bool isPlaying() const noexcept {
        return playing_.load(std::memory_order_acquire);
    }

    /// Non-owning ring access for the reader thread (the producer).
    /// Lifetime: the reader must drop this before FileInputProcessor is
    /// destroyed (handled by stopReader()).
    PlaybackRing* ring() noexcept { return ring_.get(); }
    const PlaybackRing* ring() const noexcept { return ring_.get(); }

    const std::string& takePath() const noexcept { return takePath_; }
    int declaredChannels() const noexcept { return declaredChannels_; }

    /// Snapshot of the ring's drop-to-silence underrun count (§5.4 / §8
    /// gate — must read 0 over the soak).
    std::uint64_t underrunCount() const noexcept {
        return ring_->underrunCount();
    }

    // ------------------------------------------------------------------
    // PlaybackSource interface (RT-CRITICAL) — pure consumer.
    // ------------------------------------------------------------------

    /// RT-safe block production: pop one frame from the ring into
    /// `outputs`. On underrun the ring silence-fills and we return false.
    /// Zero alloc / lock / syscall. This is the seam ChainInputSwitch
    /// pulls through.
    bool pullBlock(float* const* outputs,
                   int numChannels,
                   int numSamples) noexcept override {
        return ring_->popAudioFrame(outputs, numChannels, numSamples);
    }

    // ------------------------------------------------------------------
    // juce::AudioProcessor interface
    // ------------------------------------------------------------------

    const juce::String getName() const override {
        return juce::String("FileInput[") + takePath_ + "]";
    }

    void prepareToPlay(double /*sampleRate*/, int /*bufferSize*/) override {
        // No allocations needed in the hot path — the ring is
        // pre-allocated. (Reader-thread setup, when wired, happens here
        // off the RT path.)
    }

    void releaseResources() override {}

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        // Mono or stereo on the main bus; wider configs are accepted but
        // clamped by the ring to kPlaybackMaxChannels.
        return layouts.getMainOutputChannelSet()
            == layouts.getMainInputChannelSet();
    }

    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& /*midi*/) override {
        // RT-CRITICAL PATH. ZERO file/io_uring/open/read here (§7).
        // Hot path when not playing: one atomic load + branch, return
        // (passthrough). Mirror of TapNode.h:136.
        if (!playing_.load(std::memory_order_acquire)) {
            return;
        }

        const int numChannels = buffer.getNumChannels();
        const int numSamples  = buffer.getNumSamples();
        if (numChannels <= 0 || numSamples <= 0) {
            return;
        }

        // Build a stack array of writable channel pointers — no
        // allocation. The ring's popAudioFrame memcpys its pre-allocated
        // frame storage straight into these.
        float* channelPointers[kPlaybackMaxChannels];
        const int writableChannels =
            std::min(numChannels, kPlaybackMaxChannels);
        for (int ch = 0; ch < writableChannels; ++ch) {
            channelPointers[ch] = buffer.getWritePointer(ch);
        }

        const bool produced =
            ring_->popAudioFrame(channelPointers, writableChannels, numSamples);

        if (!produced) {
            // Underrun — the reader fell behind. Output silence for this
            // buffer (the ring already bumped its underrunCount_). NEVER
            // block. (§4.2)
            buffer.clear();
            return;
        }

        // If the chain declared more channels than the ring covers, clear
        // the surplus channels so they don't carry stale upstream data.
        for (int ch = writableChannels; ch < numChannels; ++ch) {
            buffer.clear(ch, 0, numSamples);
        }
    }

    // ------------------------------------------------------------------
    // Off-thread reader (NON-RT) — POST-RELEASE STUB.
    // ------------------------------------------------------------------
    //
    // readLoop is the playback analogue of IoUringWriter::writerThreadFunc
    // (IoUringWriter.cpp). It will, on a dedicated std::thread, OFF the
    // audio thread:
    //   1. open() the take WAV,
    //   2. submit io_uring READ requests on its OWN io_uring instance
    //      (§5.3 — a SEPARATE instance from the writer's, so the writer's
    //      "owns its queue / reaps only its own completions" invariant is
    //      preserved),
    //   3. wait on the completions, decode WAV frames,
    //   4. push each decoded frame into ring_->pushFrame() (drop-newest
    //      on full; the reader retries),
    //   5. stamp playback-read-failure counters (§5.4) for the §8 gate.
    // Allocations / blocking / syscalls are all fine HERE — the RT
    // contract is for the audio thread only (IoUringWriter.cpp:289).
    //
    // It is a STUB in this slice by deliberate scope: the RT-safe consumer
    // path above is complete + tested now; the io_uring reader body is
    // post-release bench work behind the §8 soak gate. startReader() /
    // stopReader() are the lifecycle seam the bench work completes.

    /// Spawn the reader thread. POST-RELEASE STUB: not yet implemented;
    /// returns false so callers know no reader is running. The consumer
    /// path is driven directly by tests / (future) the real reader.
    bool startReader() noexcept {
        // Intentionally unimplemented in T2511-1. See readLoop note above.
        // Not marked running so stopReader() is a safe no-op.
        return false;
    }

    /// Cooperatively stop the reader thread + join. Safe no-op while the
    /// reader is a stub (no thread spawned).
    void stopReader() noexcept {
        readerRunning_.store(false, std::memory_order_release);
        if (readerThread_.joinable()) {
            readerThread_.join();
        }
    }

    // ------------------------------------------------------------------
    // juce::AudioProcessor — required boilerplate (non-RT).
    // ------------------------------------------------------------------

    double getTailLengthSeconds() const override { return 0.0; }
    bool   acceptsMidi()  const override { return false; }
    bool   producesMidi() const override { return false; }
    bool   hasEditor()    const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    int    getNumPrograms() override { return 1; }
    int    getCurrentProgram() override { return 0; }
    void   setCurrentProgram(int /*index*/) override {}
    const juce::String getProgramName(int /*index*/) override { return {}; }
    void   changeProgramName(int /*index*/, const juce::String& /*newName*/) override {}
    void   getStateInformation(juce::MemoryBlock& /*destData*/) override {}
    void   setStateInformation(const void* /*data*/, int /*sizeInBytes*/) override {}

private:
    // POST-RELEASE STUB body. The full io_uring + WAV-decode loop lands
    // with the §8 bench work; for now it must never run on the audio
    // thread, so it stays unwired.
    void readLoop() noexcept {
        // Intentionally empty: see the "Off-thread reader" note above.
    }

    const std::string             takePath_;
    const int                     declaredChannels_;
    std::unique_ptr<PlaybackRing> ring_;

    std::atomic<bool> playing_       {false};
    std::atomic<bool> readerRunning_ {false};
    std::thread       readerThread_;
};

}  // namespace map2::recorder
