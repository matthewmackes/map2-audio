// =============================================================================
// T2507-4 — IoUringWriter (writer thread that drains tap rings into WAVs).
// =============================================================================
//
// Operator-locked decisions (2026-05-11):
//   - Sample format: 32-bit float (matches engine internals; no
//     dither cost).
//   - Polling: writer thread sleeps 2 ms between drain passes
//     (matches the existing metering-thread pattern).
//   - io_uring SQ depth: 32 (2× the worklist minimum of 16 for
//     v1's pre+post pair).
//   - File layout: <recordings_dir>/<session_id>/{pre.wav, post.wav}.
//
// RT-safety profile
//   - This module runs on a dedicated std::thread; NEVER inside
//     the JUCE audioCallback.
//   - The audio thread only writes to the SPSC ring (T2507-1
//     pushAudioFrame). All io_uring + open + close + WAV header
//     work happens here, off the audio path.
//   - Stopping is cooperative: stop() flips an atomic running_
//     flag; the writer drains whatever remains in the ring, writes
//     the WAV trailer, and exits.

#pragma once

#include <atomic>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <thread>

#include <liburing.h>

#include "Recorder/EngineRecorder.h"

namespace map2::recorder {

constexpr unsigned int kIoUringSqDepth = 32;

/// WAV-file metadata captured at writer-startup time. Surfaces in
/// the sidecar manifest (T2507-6).
struct WavWriterStats {
    std::string  path;
    std::uint64_t framesWritten   {0};
    std::uint64_t bytesWritten    {0};
    std::uint64_t ioUringSubmits  {0};
    std::uint64_t ioUringFailures {0};
};

/// T2507-6 — automation.jsonl stats.
struct AutomationWriterStats {
    std::string   path;
    std::uint64_t entriesWritten  {0};
    std::uint64_t bytesWritten    {0};
    std::uint64_t ioUringFailures {0};
};

/**
 * IoUringWriter — drains an EngineRecorder's pre+post rings and
 * writes them to <session_dir>/pre.wav + <session_dir>/post.wav.
 *
 * Lifecycle:
 *   1. Construct with the engineRecorder pointer + a session
 *      directory path + WAV configuration (sample rate, channels).
 *   2. Call start() to spawn the writer thread and open both WAV
 *      files. The constructor is cheap; the heavy lifting
 *      (open + io_uring_queue_init + header write) happens in
 *      start() so error handling can return false to the caller.
 *   3. The audio callback can now push into the engine recorder
 *      rings; the writer thread drains them on its 2 ms poll.
 *   4. Call stop() to drain + close + finalize WAV headers. The
 *      writer thread joins on return.
 *
 * Not copyable, not movable.
 */
class IoUringWriter {
public:
    struct Config {
        std::filesystem::path sessionDir;   ///< Directory created by the caller.
        double                sampleRate {48000.0};
        int                   numChannels {2};
    };

    IoUringWriter(EngineRecorder* recorder, Config config) noexcept
        : recorder_(recorder),
          config_(std::move(config))
    {}

    ~IoUringWriter() {
        // Defensive teardown if the caller forgot to stop().
        if (running_.load(std::memory_order_acquire)) {
            stop();
        }
    }

    IoUringWriter(const IoUringWriter&)            = delete;
    IoUringWriter& operator=(const IoUringWriter&) = delete;

    /// Open both WAV files, init io_uring, spawn the writer thread.
    /// Returns false if io_uring is unavailable (kernel < 6.10) or
    /// either file failed to open. On false return, the caller MUST
    /// NOT call stop().
    bool start();

    /// Cooperative stop. Drains pending ring frames, finalizes WAV
    /// headers, releases io_uring + file descriptors, joins the
    /// writer thread. Idempotent.
    void stop();

    bool isRunning() const noexcept {
        return running_.load(std::memory_order_acquire);
    }

    const WavWriterStats& preStats()  const noexcept { return preStats_;  }
    const WavWriterStats& postStats() const noexcept { return postStats_; }
    const AutomationWriterStats& automationStats() const noexcept {
        return automationStats_;
    }

private:
    void writerThreadFunc();
    void drainTapOnce(RecordingTap& tap, int fd, WavWriterStats& stats);
    void drainAutomationOnce();
    bool writeWavHeader(int fd, std::uint64_t dataBytesPlaceholder);
    bool patchWavHeader(int fd, std::uint64_t actualDataBytes);

    EngineRecorder* recorder_  {nullptr};
    Config          config_    {};

    std::atomic<bool> running_ {false};
    std::thread       writerThread_;

    // Open file descriptors.
    int preFd_        {-1};
    int postFd_       {-1};
    int automationFd_ {-1};

    // io_uring state — owned exclusively by the writer thread once
    // start() returns true.
    struct ::io_uring uring_ {};
    bool              uringInitialized_ {false};

    WavWriterStats         preStats_;
    WavWriterStats         postStats_;
    AutomationWriterStats  automationStats_;
};

}  // namespace map2::recorder
