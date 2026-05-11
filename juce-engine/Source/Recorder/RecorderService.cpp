// =============================================================================
// T2507-5 — RecorderService implementation.
// =============================================================================

#include "Recorder/RecorderService.h"

#include <chrono>
#include <ctime>
#include <iostream>
#include <iomanip>
#include <sstream>

namespace map2::recorder {

namespace {

std::string isoNowUtc() {
    using clock = std::chrono::system_clock;
    const auto now = clock::now();
    const auto t   = clock::to_time_t(now);
    std::tm     gm{};
    if (gmtime_r(&t, &gm) == nullptr) {
        return {};
    }
    std::ostringstream oss;
    oss << std::put_time(&gm, "%FT%TZ");
    return oss.str();
}

}  // namespace


bool RecorderService::armSession(const std::string& sessionId,
                                 const std::filesystem::path& parentDir,
                                 double sampleRate,
                                 int numChannels)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (recorder_ == nullptr) {
        std::cerr << "[RecorderService] armSession: null EngineRecorder\n";
        return false;
    }
    if (active_.load(std::memory_order_acquire)) {
        std::cerr << "[RecorderService] armSession: session already active ("
                  << sessionId_ << ")\n";
        return false;
    }
    if (sessionId.empty()) {
        std::cerr << "[RecorderService] armSession: empty session_id\n";
        return false;
    }

    const std::filesystem::path sessionDir = parentDir / sessionId;

    auto writer = std::make_unique<IoUringWriter>(
        recorder_,
        IoUringWriter::Config{sessionDir, sampleRate, numChannels});

    if (!writer->start()) {
        std::cerr << "[RecorderService] armSession: writer.start() failed\n";
        return false;
    }

    // Audio thread starts pushing into the rings once arm() returns.
    recorder_->arm();

    writer_      = std::move(writer);
    sessionId_   = sessionId;
    sessionDir_  = sessionDir;
    armedAtIso_  = isoNowUtc();
    active_.store(true, std::memory_order_release);
    return true;
}


RecorderServiceStatus RecorderService::stopSession() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!active_.load(std::memory_order_acquire)) {
        // No session — return a benign inactive snapshot.
        return {};
    }

    // 1. Audio callback stops pushing.
    if (recorder_ != nullptr) {
        recorder_->disarm();
    }

    // 2. Writer drains remaining frames, finalizes WAV headers,
    //    joins. The 2 ms poll cadence means worst case we wait
    //    ~2 ms for the writer to drain the last ring frame.
    if (writer_) {
        writer_->stop();
    }

    // 3. Capture final stats into the status snapshot before we
    //    release the writer.
    RecorderServiceStatus status;
    status.active               = false;
    status.sessionId            = sessionId_;
    status.sessionDir           = sessionDir_;
    status.armedAtIso           = armedAtIso_;
    if (recorder_ != nullptr) {
        status.totalSamplesProcessed   = recorder_->totalSamplesProcessed();
        status.channelOverflowCount    = recorder_->channelOverflowCount();
        status.preRingOverflowCount    =
            recorder_->tapPreFx()
                ? recorder_->tapPreFx()->overflowCount() : 0;
        status.postRingOverflowCount   =
            recorder_->tapPostFx()
                ? recorder_->tapPostFx()->overflowCount() : 0;
        status.automationOverflowCount = recorder_->automationOverflowCount();
    }
    if (writer_) {
        status.preStats        = writer_->preStats();
        status.postStats       = writer_->postStats();
        status.automationStats = writer_->automationStats();
    }

    writer_.reset();
    sessionId_.clear();
    sessionDir_.clear();
    armedAtIso_.clear();
    active_.store(false, std::memory_order_release);
    return status;
}


RecorderServiceStatus RecorderService::getStatus() const {
    std::lock_guard<std::mutex> lock(mutex_);

    RecorderServiceStatus status;
    status.active     = active_.load(std::memory_order_acquire);
    status.sessionId  = sessionId_;
    status.sessionDir = sessionDir_;
    status.armedAtIso = armedAtIso_;
    if (recorder_ != nullptr) {
        status.totalSamplesProcessed   = recorder_->totalSamplesProcessed();
        status.channelOverflowCount    = recorder_->channelOverflowCount();
        status.preRingOverflowCount    =
            recorder_->tapPreFx()
                ? recorder_->tapPreFx()->overflowCount() : 0;
        status.postRingOverflowCount   =
            recorder_->tapPostFx()
                ? recorder_->tapPostFx()->overflowCount() : 0;
        status.automationOverflowCount = recorder_->automationOverflowCount();
    }
    if (writer_) {
        status.preStats        = writer_->preStats();
        status.postStats       = writer_->postStats();
        status.automationStats = writer_->automationStats();
    }
    return status;
}

}  // namespace map2::recorder
