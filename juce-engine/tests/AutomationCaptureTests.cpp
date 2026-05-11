// =============================================================================
// T2507-6 — Automation capture (EngineRecorder ring + IoUringWriter JSONL).
// =============================================================================
//
// Covers:
//   - capturePluginParameter on a disarmed recorder is a no-op.
//   - capturePluginParameter on an armed recorder pushes into the
//     automation ring; sample position threads from the engine
//     sample counter.
//   - Drain returns FIFO order with the correct payload.
//   - Ring overflow at kAutomationRingCapacity bumps the counter.
//   - arm() resets the automation overflow counter + clears stale
//     entries.
//   - IoUringWriter pumps automation entries into
//     <session>/automation.jsonl as newline-delimited JSON.

#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <string>
#include <thread>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/EngineRecorder.h"
#include "Recorder/IoUringWriter.h"

using map2::recorder::AutomationEntry;
using map2::recorder::EngineRecorder;
using map2::recorder::IoUringWriter;
using map2::recorder::kAutomationRingCapacity;

namespace fs = std::filesystem;

namespace {

fs::path makeTempSessionDir() {
    static int seq = 0;
    auto base = fs::temp_directory_path() /
        ("map2-recorder-autom-" + std::to_string(::getpid()) +
         "-" + std::to_string(++seq));
    fs::create_directories(base);
    return base;
}

void pumpAudioFrame(EngineRecorder& rec, int numSamples = 64) {
    juce::AudioBuffer<float> b(2, numSamples);
    rec.capturePreFx(b);
    rec.capturePostFx(b);
}

std::string readFileText(const fs::path& p) {
    FILE* f = std::fopen(p.c_str(), "rb");
    if (!f) return {};
    std::fseek(f, 0, SEEK_END);
    const long sz = std::ftell(f);
    std::fseek(f, 0, SEEK_SET);
    std::string out(static_cast<std::size_t>(sz > 0 ? sz : 0), '\0');
    if (sz > 0) {
        std::fread(out.data(), 1, static_cast<std::size_t>(sz), f);
    }
    std::fclose(f);
    return out;
}

}  // namespace


TEST_CASE("EngineRecorder — disarmed capturePluginParameter is a no-op",
          "[t2507][recorder][automation]") {
    EngineRecorder rec;
    REQUIRE_FALSE(rec.isArmed());
    rec.capturePluginParameter(12345, 7, 0.42f);
    REQUIRE(rec.getAutomationNumReady()    == 0);
    REQUIRE(rec.automationOverflowCount()  == 0);
}


TEST_CASE("EngineRecorder — armed capturePluginParameter pushes entries",
          "[t2507][recorder][automation]") {
    EngineRecorder rec;
    rec.arm();

    rec.capturePluginParameter(7, 1, 0.10f);
    rec.capturePluginParameter(7, 2, 0.20f);
    rec.capturePluginParameter(99, 3, 0.30f);

    REQUIRE(rec.getAutomationNumReady() == 3);

    AutomationEntry buf[8];
    const int drained = rec.drainAutomation(buf, 8);
    REQUIRE(drained == 3);
    REQUIRE(buf[0].pluginId == 7);   REQUIRE(buf[0].paramIndex == 1);
    REQUIRE(buf[0].value    == 0.10f);
    REQUIRE(buf[1].pluginId == 7);   REQUIRE(buf[1].paramIndex == 2);
    REQUIRE(buf[1].value    == 0.20f);
    REQUIRE(buf[2].pluginId == 99);  REQUIRE(buf[2].paramIndex == 3);
    REQUIRE(buf[2].value    == 0.30f);
}


TEST_CASE("EngineRecorder — automation samplePosition tracks the engine "
          "sample counter at entry-time",
          "[t2507][recorder][automation]") {
    EngineRecorder rec;
    rec.arm();

    // Sample counter starts at 0; capture an event.
    rec.capturePluginParameter(1, 0, 0.0f);

    // Pump two audio frames at 64 samples each → counter advances to 128.
    pumpAudioFrame(rec, 64);
    pumpAudioFrame(rec, 64);

    rec.capturePluginParameter(1, 0, 0.5f);

    AutomationEntry buf[4];
    const int drained = rec.drainAutomation(buf, 4);
    REQUIRE(drained == 2);
    REQUIRE(buf[0].samplePosition == 0);
    REQUIRE(buf[1].samplePosition == 128);
}


TEST_CASE("EngineRecorder — automation ring overflow at capacity bumps counter",
          "[t2507][recorder][automation]") {
    EngineRecorder rec;
    rec.arm();

    for (int i = 0; i < kAutomationRingCapacity; ++i) {
        rec.capturePluginParameter(1, 0, static_cast<float>(i));
    }
    REQUIRE(rec.automationOverflowCount() == 0);
    REQUIRE(rec.getAutomationNumReady()   == kAutomationRingCapacity);

    // One past capacity → drop-newest + bump counter.
    rec.capturePluginParameter(1, 0, -1.0f);
    REQUIRE(rec.automationOverflowCount() == 1);

    // Subsequent overflows stack.
    rec.capturePluginParameter(1, 0, -2.0f);
    rec.capturePluginParameter(1, 0, -3.0f);
    REQUIRE(rec.automationOverflowCount() == 3);
}


TEST_CASE("EngineRecorder — arm() clears stale automation entries + resets "
          "the overflow counter",
          "[t2507][recorder][automation]") {
    EngineRecorder rec;
    rec.arm();

    rec.capturePluginParameter(1, 0, 0.1f);
    rec.capturePluginParameter(1, 0, 0.2f);
    REQUIRE(rec.getAutomationNumReady() == 2);

    rec.disarm();

    // Re-arm — the new session must see an empty ring.
    rec.arm();
    REQUIRE(rec.getAutomationNumReady()   == 0);
    REQUIRE(rec.automationOverflowCount() == 0);
}


TEST_CASE("IoUringWriter — drains automation entries into JSONL on disk",
          "[t2507][recorder][automation][integration]") {
    EngineRecorder rec;
    rec.arm();

    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});
    REQUIRE(writer.start());

    // Push a few parameter events alongside a couple of audio frames
    // so samplePosition advances.
    rec.capturePluginParameter(101, 5, 0.5f);
    pumpAudioFrame(rec, 64);
    rec.capturePluginParameter(101, 5, 0.75f);
    pumpAudioFrame(rec, 64);
    rec.capturePluginParameter(202, 1, 1.0f);

    // Writer drains on 2 ms poll; 100 ms gives ample headroom.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    rec.disarm();
    writer.stop();

    const auto jsonlPath = dir / "automation.jsonl";
    REQUIRE(fs::exists(jsonlPath));

    const auto text = readFileText(jsonlPath);
    REQUIRE_FALSE(text.empty());

    // Three records, each terminated by '\n'.
    int newlines = 0;
    for (char c : text) {
        if (c == '\n') ++newlines;
    }
    REQUIRE(newlines == 3);

    // Spot-check the content. Order is FIFO.
    REQUIRE(text.find("\"plugin_id\":101") != std::string::npos);
    REQUIRE(text.find("\"param\":5")       != std::string::npos);
    REQUIRE(text.find("\"value\":0.5")     != std::string::npos);
    REQUIRE(text.find("\"plugin_id\":202") != std::string::npos);
    // sample positions: 0, 64, 128.
    REQUIRE(text.find("\"sample\":0")      != std::string::npos);
    REQUIRE(text.find("\"sample\":64")     != std::string::npos);
    REQUIRE(text.find("\"sample\":128")    != std::string::npos);

    REQUIRE(writer.automationStats().entriesWritten  == 3);
    REQUIRE(writer.automationStats().ioUringFailures == 0);
    REQUIRE(writer.automationStats().bytesWritten    > 0);

    fs::remove_all(dir);
}


TEST_CASE("IoUringWriter — automation.jsonl absent of entries when "
          "no parameter events fire",
          "[t2507][recorder][automation][integration]") {
    EngineRecorder rec;
    rec.arm();
    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});
    REQUIRE(writer.start());

    pumpAudioFrame(rec, 64);  // Audio fires; no parameter events.

    std::this_thread::sleep_for(std::chrono::milliseconds(40));
    rec.disarm();
    writer.stop();

    // File exists (created by start()), but it's empty.
    const auto jsonlPath = dir / "automation.jsonl";
    REQUIRE(fs::exists(jsonlPath));
    REQUIRE(fs::file_size(jsonlPath) == 0);
    REQUIRE(writer.automationStats().entriesWritten == 0);

    fs::remove_all(dir);
}
