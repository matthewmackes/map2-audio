// =============================================================================
// T2507-5 — RecorderService (engine-side, single-session, v1).
// =============================================================================
//
// Engine-side counterpart of the Python RecorderService (cycle 5 of
// the T2504 epic, shipped in app/services/recorder_service.py). The
// Python service is the operator authority (allocates session ids,
// drives WebSocket broadcasts, enforces state-machine transitions);
// the engine-side RecorderService here is the thin executor that
// flips the EngineRecorder arm flag and starts/stops the
// IoUringWriter.
//
// v1 supports ONE active session at a time. The Python service
// already enforces that — its `arm_session` returns a single
// `session_id`. The engine simply rejects a second arm() while a
// session is still active.
//
// Lifecycle on the engine side mirrors the Python state machine:
//
//   armSession(sessionDir, sampleRate, numChannels)
//     → opens IoUringWriter (creates session dir, opens pre.wav +
//       post.wav, inits io_uring, spawns writer thread).
//     → calls engineRecorder.arm() → audio callback starts pushing
//       to the rings.
//
//   stopSession()
//     → calls engineRecorder.disarm() → audio callback stops
//       pushing.
//     → calls writer.stop() → writer drains remaining frames,
//       finalizes WAV headers, closes fds, exits io_uring.
//
//   getStatus() returns a stat snapshot for the operator.
//
// Threading model
//   - All public methods run on the Python message thread (via
//     pybind11). They acquire `mutex_` to serialize against each
//     other; they never block the audio callback because the
//     EngineRecorder + IoUringWriter both use atomic flags +
//     SPSC rings on the audio-thread boundary.
//   - The audio callback itself never enters this module.
//
// Reuses the operator decisions locked in T2507-0..4: kernel 6.10
// floor, drop-newest overflow, 16 × 1024 ring, 32-bit float WAV,
// SQ depth 32, 2 ms writer poll, <session_dir>/{pre.wav, post.wav}.

#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <string>

#include "Recorder/EngineRecorder.h"
#include "Recorder/IoUringWriter.h"

namespace map2::recorder {

/// Active-session snapshot returned by RecorderService::getStatus.
struct RecorderServiceStatus {
    bool          active           {false};
    std::string   sessionId;
    std::filesystem::path sessionDir;
    std::int64_t  totalSamplesProcessed {0};
    std::uint64_t channelOverflowCount  {0};
    std::uint64_t preRingOverflowCount  {0};
    std::uint64_t postRingOverflowCount {0};
    WavWriterStats preStats;
    WavWriterStats postStats;
    /// Wall-clock arm time (UTC, ISO-ish). Empty when inactive.
    std::string   armedAtIso;
};

/**
 * Engine-side session manager. Owns the IoUringWriter when active.
 * Non-owning pointer to EngineRecorder (Map2AudioEngine owns it).
 */
class RecorderService {
public:
    explicit RecorderService(EngineRecorder* recorder) noexcept
        : recorder_(recorder)
    {}

    ~RecorderService() {
        // Defensive — stop any in-flight session so we don't leak
        // the writer thread on engine teardown.
        if (active_.load(std::memory_order_acquire)) {
            stopSession();
        }
    }

    RecorderService(const RecorderService&)            = delete;
    RecorderService& operator=(const RecorderService&) = delete;

    /**
     * Open a session.
     *   - sessionId:  operator-supplied id (matches the Python
     *                 service's UUID — used as the directory name).
     *   - parentDir:  parent for the session directory (typically
     *                 `recordings_library_dir()` resolved by the
     *                 Python paths layer).
     *   - sampleRate: WAV sample rate to embed in the headers.
     *   - numChannels: WAV channel count to embed in the headers.
     *
     * Returns false if:
     *   - A session is already active.
     *   - recorder_ is null.
     *   - The writer's start() returned false (kernel <6.10, FS
     *     errors, etc.).
     */
    bool armSession(const std::string& sessionId,
                    const std::filesystem::path& parentDir,
                    double sampleRate,
                    int numChannels);

    /**
     * Close the active session. Drains the rings, finalizes WAV
     * headers, releases resources. Returns the final status
     * snapshot for sidecar metadata. Idempotent — if no session
     * is active, returns an `active=false` status without error.
     */
    RecorderServiceStatus stopSession();

    /// Snapshot of the current session (or `active=false`).
    RecorderServiceStatus getStatus() const;

    /// Test seam — return the writer pointer (non-owning). Returns
    /// nullptr when no session is active.
    const IoUringWriter* activeWriter() const noexcept {
        return writer_.get();
    }

private:
    EngineRecorder*              recorder_   {nullptr};
    std::unique_ptr<IoUringWriter> writer_;

    std::atomic<bool>      active_ {false};
    mutable std::mutex     mutex_;

    // Live session metadata.
    std::string            sessionId_;
    std::filesystem::path  sessionDir_;
    std::string            armedAtIso_;
};

}  // namespace map2::recorder
