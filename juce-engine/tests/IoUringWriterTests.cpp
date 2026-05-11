// =============================================================================
// T2507-4 — IoUringWriter integration tests.
// =============================================================================
//
// Exercises the writer against a real EngineRecorder + a real tmp
// directory. Verifies:
//   - start() opens both WAV files + initializes io_uring.
//   - The writer thread drains the rings while audio frames are
//     pushed.
//   - stop() finalizes the WAV headers correctly.
//   - The resulting pre.wav / post.wav files exist with sane
//     headers and the expected frame count's worth of bytes.

#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <thread>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/EngineRecorder.h"
#include "Recorder/IoUringWriter.h"

using map2::recorder::EngineRecorder;
using map2::recorder::IoUringWriter;

namespace fs = std::filesystem;

namespace {

/// Per-test tmpdir under /tmp/map2-recorder-tests-<pid>-<seq>/.
fs::path makeTempSessionDir() {
    static int seq = 0;
    auto base = fs::temp_directory_path() /
        ("map2-recorder-tests-" + std::to_string(::getpid()) +
         "-" + std::to_string(++seq));
    fs::create_directories(base);
    return base;
}

std::uint32_t readU32LE(const unsigned char* src) {
    return static_cast<std::uint32_t>(src[0])
         | (static_cast<std::uint32_t>(src[1]) << 8)
         | (static_cast<std::uint32_t>(src[2]) << 16)
         | (static_cast<std::uint32_t>(src[3]) << 24);
}

std::uint16_t readU16LE(const unsigned char* src) {
    return static_cast<std::uint16_t>(src[0])
         | (static_cast<std::uint16_t>(src[1]) << 8);
}

/// Read the entire file into a buffer.
std::vector<unsigned char> readFile(const fs::path& p) {
    FILE* f = std::fopen(p.c_str(), "rb");
    if (f == nullptr) {
        return {};
    }
    std::fseek(f, 0, SEEK_END);
    const long size = std::ftell(f);
    std::fseek(f, 0, SEEK_SET);
    std::vector<unsigned char> out(static_cast<std::size_t>(size));
    if (size > 0) {
        std::fread(out.data(), 1, static_cast<std::size_t>(size), f);
    }
    std::fclose(f);
    return out;
}

/// Push N pre+post buffer pairs into the recorder, each a stereo
/// 64-sample frame.
void pumpFrames(EngineRecorder& rec, int n) {
    juce::AudioBuffer<float> pre(2, 64);
    juce::AudioBuffer<float> post(2, 64);
    for (int i = 0; i < n; ++i) {
        for (int ch = 0; ch < 2; ++ch) {
            auto* pw = pre.getWritePointer(ch);
            auto* qw = post.getWritePointer(ch);
            for (int s = 0; s < 64; ++s) {
                pw[s] = static_cast<float>(i * 100 + s);
                qw[s] = static_cast<float>(i * 100 + s) + 0.5f;
            }
        }
        rec.capturePreFx(pre);
        rec.capturePostFx(post);
    }
}

}  // namespace


TEST_CASE("IoUringWriter — start() opens both WAV files",
          "[t2507][recorder][iouring][integration]") {
    EngineRecorder rec;
    rec.arm();

    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});

    REQUIRE(writer.start());
    REQUIRE(writer.isRunning());
    REQUIRE(fs::exists(dir / "pre.wav"));
    REQUIRE(fs::exists(dir / "post.wav"));

    writer.stop();
    rec.disarm();
    fs::remove_all(dir);
}


TEST_CASE("IoUringWriter — drains frames into WAV files with valid headers",
          "[t2507][recorder][iouring][integration]") {
    EngineRecorder rec;
    rec.arm();

    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});
    REQUIRE(writer.start());

    constexpr int kFrameCount = 8;  // 8 × 64-sample frames = 512 samples per ring.
    pumpFrames(rec, kFrameCount);

    // Give the writer thread a moment to drain. The poll interval
    // is 2 ms; 100 ms is plenty of headroom.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    rec.disarm();
    writer.stop();

    // Validate the on-disk WAV files. Both should be the same size
    // (pre + post pumped in lockstep).
    auto preBytes  = readFile(dir / "pre.wav");
    auto postBytes = readFile(dir / "post.wav");
    REQUIRE(preBytes.size()  > 44);  // header + at least one frame
    REQUIRE(postBytes.size() > 44);
    REQUIRE(preBytes.size() == postBytes.size());

    // Expected data bytes: 8 frames × 64 samples × 2 channels × 4 bytes/sample
    // = 4096 bytes.
    const std::uint32_t expectedDataBytes = 8u * 64u * 2u * 4u;

    // RIFF size header at offset 4 should be 36 + dataBytes.
    REQUIRE(readU32LE(preBytes.data() + 4)  == 36u + expectedDataBytes);
    // data chunk size at offset 40.
    REQUIRE(readU32LE(preBytes.data() + 40) == expectedDataBytes);
    // Format = IEEE_FLOAT (0x0003).
    REQUIRE(readU16LE(preBytes.data() + 20) == 0x0003);
    // Channels.
    REQUIRE(readU16LE(preBytes.data() + 22) == 2);
    // Sample rate.
    REQUIRE(readU32LE(preBytes.data() + 24) == 48000u);
    // Bits per sample.
    REQUIRE(readU16LE(preBytes.data() + 34) == 32);

    // Stats line up.
    REQUIRE(writer.preStats().framesWritten  == kFrameCount);
    REQUIRE(writer.postStats().framesWritten == kFrameCount);
    REQUIRE(writer.preStats().bytesWritten   == expectedDataBytes);
    REQUIRE(writer.postStats().bytesWritten  == expectedDataBytes);
    REQUIRE(writer.preStats().ioUringFailures  == 0);
    REQUIRE(writer.postStats().ioUringFailures == 0);

    fs::remove_all(dir);
}


TEST_CASE("IoUringWriter — recorded float32 samples round-trip",
          "[t2507][recorder][iouring][integration]") {
    EngineRecorder rec;
    rec.arm();

    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});
    REQUIRE(writer.start());

    // Push a single 4-sample frame with known values across 2 channels.
    juce::AudioBuffer<float> pre(2, 4);
    juce::AudioBuffer<float> post(2, 4);
    pre.setSample(0, 0, 0.1f);  pre.setSample(0, 1, 0.2f);
    pre.setSample(0, 2, 0.3f);  pre.setSample(0, 3, 0.4f);
    pre.setSample(1, 0, 1.1f);  pre.setSample(1, 1, 1.2f);
    pre.setSample(1, 2, 1.3f);  pre.setSample(1, 3, 1.4f);

    post.setSample(0, 0, 2.1f); post.setSample(0, 1, 2.2f);
    post.setSample(0, 2, 2.3f); post.setSample(0, 3, 2.4f);
    post.setSample(1, 0, 3.1f); post.setSample(1, 1, 3.2f);
    post.setSample(1, 2, 3.3f); post.setSample(1, 3, 3.4f);

    rec.capturePreFx(pre);
    rec.capturePostFx(post);

    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    rec.disarm();
    writer.stop();

    // Read interleaved float32 from the WAV file at offset 44.
    auto preBytes = readFile(dir / "pre.wav");
    REQUIRE(preBytes.size() == 44u + 4u * 2u * 4u);

    auto sampleAt = [&](std::size_t sample, std::size_t ch) -> float {
        const std::size_t offset = 44 + (sample * 2 + ch) * sizeof(float);
        float v;
        std::memcpy(&v, preBytes.data() + offset, sizeof(float));
        return v;
    };
    REQUIRE(sampleAt(0, 0) == 0.1f);
    REQUIRE(sampleAt(0, 1) == 1.1f);
    REQUIRE(sampleAt(1, 0) == 0.2f);
    REQUIRE(sampleAt(2, 1) == 1.3f);
    REQUIRE(sampleAt(3, 0) == 0.4f);
    REQUIRE(sampleAt(3, 1) == 1.4f);

    fs::remove_all(dir);
}


TEST_CASE("IoUringWriter — stop is idempotent",
          "[t2507][recorder][iouring][integration]") {
    EngineRecorder rec;
    auto dir = makeTempSessionDir();
    IoUringWriter writer(&rec, {dir, 48000.0, 2});
    REQUIRE(writer.start());
    writer.stop();
    REQUIRE_FALSE(writer.isRunning());
    writer.stop();  // Must not crash, must not double-free.
    REQUIRE_FALSE(writer.isRunning());
    fs::remove_all(dir);
}


TEST_CASE("IoUringWriter — fails cleanly when session dir is uncreatable",
          "[t2507][recorder][iouring][integration]") {
    EngineRecorder rec;
    // /proc is read-only on Linux; creating a subdir under it
    // returns EACCES from mkdir.
    IoUringWriter writer(&rec, {"/proc/recorder-cannot-create", 48000.0, 2});
    REQUIRE_FALSE(writer.start());
    REQUIRE_FALSE(writer.isRunning());
    // stop() on a failed-start writer is a no-op.
    writer.stop();
}
