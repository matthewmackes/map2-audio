// =============================================================================
// T2507-4 — IoUringWriter implementation.
// =============================================================================

#include "Recorder/IoUringWriter.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <limits>
#include <unistd.h>
#include <vector>

namespace map2::recorder {

namespace {

// WAV format constants — float32 PCM. 44-byte canonical RIFF/WAVE
// header. We use the simplest layout (no fact chunk; FACT is optional
// for IEEE_FLOAT per the spec, and audacious/Reaper/ffmpeg all
// parse this layout cleanly).
constexpr std::size_t  kWavHeaderBytes      = 44;
constexpr std::uint16_t kWavFmtIeeeFloat    = 0x0003;
constexpr std::uint16_t kWavBitsPerSample   = 32;

void writeU32LE(unsigned char* dst, std::uint32_t v) {
    dst[0] = static_cast<unsigned char>( v        & 0xFFu);
    dst[1] = static_cast<unsigned char>((v >>  8) & 0xFFu);
    dst[2] = static_cast<unsigned char>((v >> 16) & 0xFFu);
    dst[3] = static_cast<unsigned char>((v >> 24) & 0xFFu);
}

void writeU16LE(unsigned char* dst, std::uint16_t v) {
    dst[0] = static_cast<unsigned char>( v        & 0xFFu);
    dst[1] = static_cast<unsigned char>((v >>  8) & 0xFFu);
}

}  // namespace


bool IoUringWriter::start() {
    if (recorder_ == nullptr) {
        std::cerr << "[IoUringWriter] start: null EngineRecorder pointer\n";
        return false;
    }
    if (running_.load(std::memory_order_acquire)) {
        return true;  // Idempotent.
    }

    // Create the session directory if the caller didn't already.
    std::error_code ec;
    std::filesystem::create_directories(config_.sessionDir, ec);
    if (ec) {
        std::cerr << "[IoUringWriter] cannot create session dir "
                  << config_.sessionDir << ": " << ec.message() << "\n";
        return false;
    }

    const auto prePath  = (config_.sessionDir / "pre.wav").string();
    const auto postPath = (config_.sessionDir / "post.wav").string();

    preFd_  = ::open(prePath.c_str(),  O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (preFd_ < 0) {
        std::cerr << "[IoUringWriter] open " << prePath << " failed: errno="
                  << errno << "\n";
        return false;
    }
    postFd_ = ::open(postPath.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (postFd_ < 0) {
        std::cerr << "[IoUringWriter] open " << postPath << " failed: errno="
                  << errno << "\n";
        ::close(preFd_); preFd_ = -1;
        return false;
    }
    // T2507-6 — automation.jsonl. Append-only; the writer thread
    // streams JSON-Lines records into it via io_uring (one write
    // per drainAutomationOnce batch).
    const auto autoPath = (config_.sessionDir / "automation.jsonl").string();
    automationFd_ = ::open(autoPath.c_str(),
                           O_WRONLY | O_CREAT | O_TRUNC | O_APPEND,
                           0644);
    if (automationFd_ < 0) {
        std::cerr << "[IoUringWriter] open " << autoPath << " failed: errno="
                  << errno << "\n";
        ::close(preFd_);  preFd_  = -1;
        ::close(postFd_); postFd_ = -1;
        return false;
    }
    automationStats_.path = autoPath;

    // Reserve header space; we patch the size fields in stop().
    if (!writeWavHeader(preFd_, 0) || !writeWavHeader(postFd_, 0)) {
        std::cerr << "[IoUringWriter] WAV header write failed\n";
        ::close(preFd_);  preFd_  = -1;
        ::close(postFd_); postFd_ = -1;
        return false;
    }

    // io_uring init. SQ depth 32 (2× worklist minimum for v1's 2 taps).
    if (const int rc = ::io_uring_queue_init(kIoUringSqDepth, &uring_, 0);
        rc < 0)
    {
        std::cerr << "[IoUringWriter] io_uring_queue_init failed: "
                  << std::strerror(-rc)
                  << " (kernel " << "< 6.10? expected ≥ 6.10)\n";
        ::close(preFd_);  preFd_  = -1;
        ::close(postFd_); postFd_ = -1;
        return false;
    }
    uringInitialized_ = true;

    preStats_.path  = prePath;
    postStats_.path = postPath;

    running_.store(true, std::memory_order_release);
    writerThread_ = std::thread([this] { writerThreadFunc(); });
    return true;
}


void IoUringWriter::stop() {
    if (!running_.load(std::memory_order_acquire)) {
        // Either never started or already stopped.
        if (preFd_        >= 0) { ::close(preFd_);        preFd_        = -1; }
        if (postFd_       >= 0) { ::close(postFd_);       postFd_       = -1; }
        if (automationFd_ >= 0) { ::close(automationFd_); automationFd_ = -1; }
        return;
    }

    running_.store(false, std::memory_order_release);
    if (writerThread_.joinable()) {
        writerThread_.join();
    }

    // Patch WAV headers with actual data byte counts so the files
    // are valid even if the operator opens them in another tool.
    if (preFd_ >= 0) {
        patchWavHeader(preFd_, preStats_.bytesWritten);
        ::close(preFd_); preFd_ = -1;
    }
    if (postFd_ >= 0) {
        patchWavHeader(postFd_, postStats_.bytesWritten);
        ::close(postFd_); postFd_ = -1;
    }
    if (automationFd_ >= 0) {
        ::close(automationFd_); automationFd_ = -1;
    }

    if (uringInitialized_) {
        ::io_uring_queue_exit(&uring_);
        uringInitialized_ = false;
    }
}


void IoUringWriter::writerThreadFunc() {
    // Poll cadence: 2 ms. Matches the metering-thread pattern.
    using namespace std::chrono_literals;
    constexpr auto kPollInterval = 2ms;

    while (running_.load(std::memory_order_acquire)) {
        drainTapOnce(*recorder_->tapPreFx(),  preFd_,  preStats_);
        drainTapOnce(*recorder_->tapPostFx(), postFd_, postStats_);
        drainAutomationOnce();
        std::this_thread::sleep_for(kPollInterval);
    }

    // Final drain after stop() flipped running_ to false. The audio
    // callback may have queued a few more frames before the operator
    // disarmed; the ring isn't empty by accident.
    drainTapOnce(*recorder_->tapPreFx(),  preFd_,  preStats_);
    drainTapOnce(*recorder_->tapPostFx(), postFd_, postStats_);
    drainAutomationOnce();
}


void IoUringWriter::drainAutomationOnce() {
    if (recorder_ == nullptr || automationFd_ < 0) {
        return;
    }
    // Drain up to a batch of automation entries on this poll. The
    // ring is 2048 deep (kAutomationRingCapacity); we drain in
    // chunks that fit comfortably in a single io_uring write.
    static constexpr int kDrainBatchSize = 256;
    AutomationEntry entries[kDrainBatchSize];
    while (true) {
        const int drained = recorder_->drainAutomation(entries, kDrainBatchSize);
        if (drained <= 0) {
            return;
        }

        // Build one newline-terminated JSON-Lines buffer for the
        // batch. Each line:
        // {"sample":<int>,"plugin_id":<int>,"param":<int>,"value":<float>}
        thread_local std::string scratch;
        scratch.clear();
        scratch.reserve(static_cast<std::size_t>(drained) * 96);

        char numBuf[64];
        for (int i = 0; i < drained; ++i) {
            const auto& e = entries[i];
            scratch.append("{\"sample\":");
            std::snprintf(numBuf, sizeof(numBuf), "%lld",
                          static_cast<long long>(e.samplePosition));
            scratch.append(numBuf);
            scratch.append(",\"plugin_id\":");
            std::snprintf(numBuf, sizeof(numBuf), "%lld",
                          static_cast<long long>(e.pluginId));
            scratch.append(numBuf);
            scratch.append(",\"param\":");
            std::snprintf(numBuf, sizeof(numBuf), "%d", e.paramIndex);
            scratch.append(numBuf);
            scratch.append(",\"value\":");
            // %g chosen for compact float serialization; preserves
            // enough precision for operator-readable automation
            // takes. Switch to %.9g if reproducible sample-exact
            // playback becomes a requirement.
            std::snprintf(numBuf, sizeof(numBuf), "%g",
                          static_cast<double>(e.value));
            scratch.append(numBuf);
            scratch.append("}\n");
        }

        // Submit one io_uring write for the whole batch.
        struct io_uring_sqe* sqe = io_uring_get_sqe(&uring_);
        if (sqe == nullptr) {
            ++automationStats_.ioUringFailures;
            // Without an SQE slot we drop the batch on the floor —
            // the ring is small relative to the 2 ms poll cadence
            // so this should be a rare failure mode.
            return;
        }
        io_uring_prep_write(sqe, automationFd_,
                            scratch.data(),
                            static_cast<unsigned>(scratch.size()), -1);
        const int submitted = io_uring_submit(&uring_);
        if (submitted < 0) {
            ++automationStats_.ioUringFailures;
            return;
        }
        struct io_uring_cqe* cqe = nullptr;
        if (io_uring_wait_cqe(&uring_, &cqe) == 0) {
            if (cqe->res < 0) {
                ++automationStats_.ioUringFailures;
            } else {
                automationStats_.bytesWritten +=
                    static_cast<std::uint64_t>(cqe->res);
                automationStats_.entriesWritten +=
                    static_cast<std::uint64_t>(drained);
            }
            io_uring_cqe_seen(&uring_, cqe);
        }

        // If we drained the full batch, there may be more in the
        // ring; loop to clear it before sleeping. This bounds the
        // worst-case drain latency under heavy automation traffic.
        if (drained < kDrainBatchSize) {
            return;
        }
    }
}


void IoUringWriter::drainTapOnce(RecordingTap& tap,
                                 int fd,
                                 WavWriterStats& stats)
{
    if (fd < 0) {
        return;
    }
    // Drain everything the tap has ready in one pass. Each frame
    // becomes one io_uring write submission. Powers-of-two depth
    // (32) means we may issue 32 writes per iteration before
    // we need to harvest completions; the audio callback's drop-
    // newest policy keeps us from accumulating forever.
    int inFlight = 0;
    while (const RecordingTapFrame* frame = tap.prepareToReadFrame()) {
        // Interleave channels into a contiguous float32 buffer.
        // Sample count × channel count is small (≤ 1024 × 8); use
        // a thread-local std::vector to avoid heap churn between
        // frames. (Allocations on the writer thread are fine — the
        // RT-safe contract is for the audio thread only.)
        thread_local std::vector<float> interleaveBuffer;
        const int   nChan = frame->numChannels;
        const int   nSamp = frame->numSamples;
        const std::size_t total =
            static_cast<std::size_t>(nChan) *
            static_cast<std::size_t>(nSamp);
        interleaveBuffer.resize(total);

        for (int s = 0; s < nSamp; ++s) {
            for (int ch = 0; ch < nChan; ++ch) {
                interleaveBuffer[static_cast<std::size_t>(s) *
                                 static_cast<std::size_t>(nChan) +
                                 static_cast<std::size_t>(ch)] =
                    frame->channels[ch][s];
            }
        }

        const std::size_t writeBytes = total * sizeof(float);

        struct io_uring_sqe* sqe = io_uring_get_sqe(&uring_);
        if (sqe == nullptr) {
            // SQ ring full — harvest completions so we can recycle
            // slots, then retry. The ring is drop-newest on the
            // audio side, so any backpressure here is bounded.
            io_uring_submit(&uring_);
            struct io_uring_cqe* cqe = nullptr;
            while (inFlight > 0 &&
                   io_uring_peek_cqe(&uring_, &cqe) == 0)
            {
                if (cqe->res < 0) {
                    ++stats.ioUringFailures;
                } else {
                    stats.bytesWritten += static_cast<std::uint64_t>(cqe->res);
                }
                io_uring_cqe_seen(&uring_, cqe);
                --inFlight;
            }
            // The frame we just dequeued from the ring still needs
            // to be committed; finishedReadFrame() before any
            // continue/break so the producer can reuse the slot.
            // We'll re-enter the loop in the next iteration to
            // capture this frame's write.
            sqe = io_uring_get_sqe(&uring_);
            if (sqe == nullptr) {
                // Truly cannot recover; drop this frame's write and
                // log via the failure counter. The ring slot is
                // released so the producer can keep going.
                ++stats.ioUringFailures;
                tap.finishedReadFrame();
                continue;
            }
        }

        // Note: io_uring_prep_write captures the buffer by pointer.
        // Because we use a thread-local interleave buffer that gets
        // resize()d on the very next frame, we MUST submit + reap
        // each SQE before we touch the buffer again. The simplest
        // safe pattern is "submit per frame + reap per frame";
        // batching with persistent buffers is a v2 optimization.
        io_uring_prep_write(sqe, fd, interleaveBuffer.data(),
                            static_cast<unsigned>(writeBytes), -1);
        sqe->user_data = static_cast<__u64>(writeBytes);

        tap.finishedReadFrame();
        ++stats.framesWritten;

        const int submitted = io_uring_submit(&uring_);
        if (submitted < 0) {
            ++stats.ioUringFailures;
            continue;
        }
        ++inFlight;
        ++stats.ioUringSubmits;

        // Wait for this submission to complete before we recycle
        // the interleave buffer. Single-submission-per-iteration so
        // the wait is effectively immediate on a healthy disk.
        struct io_uring_cqe* cqe = nullptr;
        if (io_uring_wait_cqe(&uring_, &cqe) == 0) {
            if (cqe->res < 0) {
                ++stats.ioUringFailures;
            } else {
                stats.bytesWritten +=
                    static_cast<std::uint64_t>(cqe->res);
            }
            io_uring_cqe_seen(&uring_, cqe);
            --inFlight;
        }
    }

    // Final completion harvest if anything is still in flight.
    while (inFlight > 0) {
        struct io_uring_cqe* cqe = nullptr;
        if (io_uring_wait_cqe(&uring_, &cqe) != 0) {
            break;
        }
        if (cqe->res < 0) {
            ++stats.ioUringFailures;
        } else {
            stats.bytesWritten +=
                static_cast<std::uint64_t>(cqe->res);
        }
        io_uring_cqe_seen(&uring_, cqe);
        --inFlight;
    }
}


bool IoUringWriter::writeWavHeader(int fd,
                                   std::uint64_t /*dataBytesPlaceholder*/)
{
    std::array<unsigned char, kWavHeaderBytes> hdr{};
    const std::uint16_t channels   = static_cast<std::uint16_t>(config_.numChannels);
    const std::uint32_t sampleRate = static_cast<std::uint32_t>(config_.sampleRate);
    const std::uint16_t bytesPerSample = kWavBitsPerSample / 8;
    const std::uint32_t byteRate   = sampleRate * channels * bytesPerSample;
    const std::uint16_t blockAlign = channels * bytesPerSample;

    // "RIFF"
    hdr[0] = 'R'; hdr[1] = 'I'; hdr[2] = 'F'; hdr[3] = 'F';
    // RIFF chunk size — placeholder; patched in stop().
    writeU32LE(&hdr[4], 0);
    // "WAVEfmt "
    hdr[8]  = 'W'; hdr[9]  = 'A'; hdr[10] = 'V'; hdr[11] = 'E';
    hdr[12] = 'f'; hdr[13] = 'm'; hdr[14] = 't'; hdr[15] = ' ';
    // fmt chunk size (16 for PCM/IEEE_FLOAT no extension)
    writeU32LE(&hdr[16], 16u);
    writeU16LE(&hdr[20], kWavFmtIeeeFloat);
    writeU16LE(&hdr[22], channels);
    writeU32LE(&hdr[24], sampleRate);
    writeU32LE(&hdr[28], byteRate);
    writeU16LE(&hdr[32], blockAlign);
    writeU16LE(&hdr[34], kWavBitsPerSample);
    // "data"
    hdr[36] = 'd'; hdr[37] = 'a'; hdr[38] = 't'; hdr[39] = 'a';
    // data chunk size — placeholder; patched in stop().
    writeU32LE(&hdr[40], 0);

    const ssize_t written = ::write(fd, hdr.data(), hdr.size());
    return written == static_cast<ssize_t>(hdr.size());
}


bool IoUringWriter::patchWavHeader(int fd, std::uint64_t actualDataBytes) {
    // RIFF chunk size = 4 ("WAVE") + 8 (fmt header) + 16 (fmt body)
    //                  + 8 (data header) + actualDataBytes = 36 + N
    // Cap at UINT32_MAX so the WAV stays parseable; the file system
    // gets the full content but the chunk-size header is truncated
    // (operators recording >4 GiB in a single take should consider
    // RF64 — out of scope for v1).
    std::uint32_t riffSize;
    std::uint32_t dataSize;
    constexpr std::uint64_t kMax32 = std::numeric_limits<std::uint32_t>::max();
    if (actualDataBytes + 36u > kMax32) {
        riffSize = kMax32;
        dataSize = static_cast<std::uint32_t>(kMax32 - 36u);
    } else {
        riffSize = static_cast<std::uint32_t>(actualDataBytes + 36u);
        dataSize = static_cast<std::uint32_t>(actualDataBytes);
    }

    unsigned char buf[4];
    writeU32LE(buf, riffSize);
    if (::lseek(fd, 4, SEEK_SET) < 0)  return false;
    if (::write(fd, buf, 4) != 4)      return false;

    writeU32LE(buf, dataSize);
    if (::lseek(fd, 40, SEEK_SET) < 0) return false;
    if (::write(fd, buf, 4) != 4)      return false;

    return true;
}

}  // namespace map2::recorder
