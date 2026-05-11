// =============================================================================
// T2507-5 — RecorderService integration tests.
// =============================================================================
//
// Exercises arm/stop/status against a real EngineRecorder + real
// disk. The Python service's state-machine semantics are tested
// independently (cycle 5 / app/services/recorder_service.py); these
// tests cover the C++ engine-side counterpart.

#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <filesystem>
#include <thread>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/EngineRecorder.h"
#include "Recorder/RecorderService.h"

using map2::recorder::EngineRecorder;
using map2::recorder::RecorderService;

namespace fs = std::filesystem;

namespace {

fs::path makeTempParent() {
    static int seq = 0;
    auto base = fs::temp_directory_path() /
        ("map2-recorder-svc-" + std::to_string(::getpid()) +
         "-" + std::to_string(++seq));
    fs::create_directories(base);
    return base;
}

void pumpFrames(EngineRecorder& rec, int n) {
    juce::AudioBuffer<float> pre(2, 64);
    juce::AudioBuffer<float> post(2, 64);
    for (int i = 0; i < n; ++i) {
        rec.capturePreFx(pre);
        rec.capturePostFx(post);
    }
}

}  // namespace


TEST_CASE("RecorderService — inactive at construction",
          "[t2507][recorder][service]") {
    EngineRecorder rec;
    RecorderService svc(&rec);

    auto status = svc.getStatus();
    REQUIRE_FALSE(status.active);
    REQUIRE(status.sessionId.empty());
    REQUIRE(svc.activeWriter() == nullptr);
}


TEST_CASE("RecorderService — armSession opens writer + arms recorder",
          "[t2507][recorder][service][integration]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();

    REQUIRE(svc.armSession("sess-A", parent, 48000.0, 2));
    REQUIRE(rec.isArmed());
    REQUIRE(svc.activeWriter() != nullptr);
    REQUIRE(svc.activeWriter()->isRunning());

    auto status = svc.getStatus();
    REQUIRE(status.active);
    REQUIRE(status.sessionId == "sess-A");
    REQUIRE(status.sessionDir == parent / "sess-A");
    REQUIRE(fs::exists(parent / "sess-A" / "pre.wav"));
    REQUIRE(fs::exists(parent / "sess-A" / "post.wav"));
    REQUIRE_FALSE(status.armedAtIso.empty());

    svc.stopSession();
    fs::remove_all(parent);
}


TEST_CASE("RecorderService — second arm rejected while session is active",
          "[t2507][recorder][service]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();

    REQUIRE(svc.armSession("sess-A", parent, 48000.0, 2));
    // Trying to arm again returns false; the first session stays
    // intact.
    REQUIRE_FALSE(svc.armSession("sess-B", parent, 48000.0, 2));
    REQUIRE(svc.getStatus().sessionId == "sess-A");

    svc.stopSession();
    fs::remove_all(parent);
}


TEST_CASE("RecorderService — stopSession drains rings + finalizes WAVs",
          "[t2507][recorder][service][integration]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();

    REQUIRE(svc.armSession("sess-stop", parent, 48000.0, 2));

    pumpFrames(rec, 4);
    std::this_thread::sleep_for(std::chrono::milliseconds(40));

    auto final = svc.stopSession();
    REQUIRE_FALSE(final.active);
    REQUIRE(final.sessionId == "sess-stop");
    REQUIRE(final.preStats.framesWritten  == 4);
    REQUIRE(final.postStats.framesWritten == 4);
    REQUIRE(final.totalSamplesProcessed == 4 * 64);
    REQUIRE_FALSE(rec.isArmed());

    // After stop, getStatus returns inactive.
    auto status = svc.getStatus();
    REQUIRE_FALSE(status.active);
    REQUIRE(status.sessionId.empty());
    REQUIRE(svc.activeWriter() == nullptr);

    // The on-disk WAV files survive the session close.
    REQUIRE(fs::exists(parent / "sess-stop" / "pre.wav"));
    REQUIRE(fs::exists(parent / "sess-stop" / "post.wav"));

    fs::remove_all(parent);
}


TEST_CASE("RecorderService — stopSession is idempotent",
          "[t2507][recorder][service]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();

    // Calling stop without ever arming is benign.
    auto status1 = svc.stopSession();
    REQUIRE_FALSE(status1.active);

    REQUIRE(svc.armSession("sess-idem", parent, 48000.0, 2));
    svc.stopSession();
    auto status2 = svc.stopSession();  // Second call.
    REQUIRE_FALSE(status2.active);

    fs::remove_all(parent);
}


TEST_CASE("RecorderService — empty session_id rejected",
          "[t2507][recorder][service]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();
    REQUIRE_FALSE(svc.armSession("", parent, 48000.0, 2));
    REQUIRE_FALSE(svc.getStatus().active);
    fs::remove_all(parent);
}


TEST_CASE("RecorderService — re-arm after stop opens a fresh session",
          "[t2507][recorder][service][integration]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    auto parent = makeTempParent();

    REQUIRE(svc.armSession("first", parent, 48000.0, 2));
    pumpFrames(rec, 2);
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    svc.stopSession();

    REQUIRE(svc.armSession("second", parent, 48000.0, 2));
    REQUIRE(svc.getStatus().sessionId == "second");

    // Sample counter resets on the new arm.
    REQUIRE(rec.totalSamplesProcessed() == 0);

    svc.stopSession();
    REQUIRE(fs::exists(parent / "first"  / "pre.wav"));
    REQUIRE(fs::exists(parent / "second" / "pre.wav"));

    fs::remove_all(parent);
}


TEST_CASE("RecorderService — writer.start() failure leaves service inactive",
          "[t2507][recorder][service]") {
    EngineRecorder rec;
    RecorderService svc(&rec);
    // Uncreatable parent → IoUringWriter.start() fails inside
    // RecorderService.armSession; service must reject cleanly.
    REQUIRE_FALSE(svc.armSession("sess-bad", "/proc/no-create", 48000.0, 2));
    REQUIRE_FALSE(svc.getStatus().active);
    REQUIRE_FALSE(rec.isArmed());
}
