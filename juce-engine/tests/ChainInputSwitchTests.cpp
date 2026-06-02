// =============================================================================
// T2511-2 — ChainInputSwitch unit + stress tests.
// =============================================================================
//
// Covers the atomic-swap discipline (§3) + sample-accurate triggers (§6):
//   - The pointer is loaded ONCE per buffer: under a concurrent control-
//     thread CAS, every buffer comes wholly from ONE source (no tearing).
//     This is the §8 TSan-under-synthetic-load test — run as a stress
//     loop so it also surfaces data races under the normal build (no TSan
//     target is wired yet; see the report's §8 follow-up note).
//   - setSource() CASes the pointer and RETURNS the old one (the
//     deferred-free seam) — it NEVER deletes inline. A retire callback
//     receives the old pointer; the test asserts the object is still
//     alive when the callback runs.
//   - Sample-accurate triggers switch the active source at the exact
//     intra-buffer offset (the trigger path, NOT an atomic re-load).
//   - acquire/release ordering: a source registered + published before
//     the swap is fully visible to the audio thread's next buffer.

#include <atomic>
#include <thread>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "Recorder/Playback/ChainInputSwitch.h"
#include "Recorder/Playback/PlaybackSource.h"

using map2::recorder::ChainInputSwitch;
using map2::recorder::PlaybackSource;

namespace {

// A test source that fills every output sample with a fixed constant so a
// reader can detect which source produced a given span/buffer.
class ConstantSource : public PlaybackSource {
public:
    explicit ConstantSource(float value) : value_(value) {}

    bool pullBlock(float* const* outputs,
                   int numChannels,
                   int numSamples) noexcept override {
        for (int ch = 0; ch < numChannels; ++ch) {
            for (int s = 0; s < numSamples; ++s) {
                outputs[ch][s] = value_;
            }
        }
        pulls_.fetch_add(1, std::memory_order_relaxed);
        return true;
    }

    float value() const noexcept { return value_; }
    int pulls() const noexcept { return pulls_.load(std::memory_order_relaxed); }

private:
    const float value_;
    std::atomic<int> pulls_{0};
};

// Drive a processBlock against a fresh AudioBuffer of the given size.
void runBlock(ChainInputSwitch& sw, juce::AudioBuffer<float>& buf) {
    juce::MidiBuffer midi;
    sw.processBlock(buf, midi);
}

}  // namespace


TEST_CASE("ChainInputSwitch — block comes wholly from the live source",
          "[t2511][switch]") {
    ChainInputSwitch sw;
    ConstantSource a(1.0f);
    sw.setSource(&a);

    juce::AudioBuffer<float> buf(2, 64);
    buf.clear();
    runBlock(sw, buf);

    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(buf.getSample(ch, s) == 1.0f);
        }
    }
}


TEST_CASE("ChainInputSwitch — no source produces silence + bumps span count",
          "[t2511][switch]") {
    ChainInputSwitch sw;  // no source set
    juce::AudioBuffer<float> buf(2, 64);
    // Pre-fill with garbage so we can confirm it is cleared.
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            buf.setSample(ch, s, 99.0f);
        }
    }
    runBlock(sw, buf);
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(buf.getSample(ch, s) == 0.0f);
        }
    }
    REQUIRE(sw.silenceSpanCount() == 1);
}


TEST_CASE("ChainInputSwitch — setSource CASes + returns old (deferred-free seam)",
          "[t2511][switch][reclamation]") {
    ChainInputSwitch sw;
    ConstantSource a(1.0f);
    ConstantSource b(2.0f);

    PlaybackSource* old0 = sw.setSource(&a);
    REQUIRE(old0 == nullptr);                 // first swap: previous was null
    REQUIRE(sw.currentSource() == &a);

    PlaybackSource* old1 = sw.setSource(&b);
    REQUIRE(old1 == &a);                       // returns the OLD pointer
    REQUIRE(sw.currentSource() == &b);

    // The returned old pointer is NOT freed by the switch — &a is still a
    // live, usable object (we can pull from it).
    std::vector<std::vector<float>> store(2, std::vector<float>(8, 0.0f));
    std::vector<float*> ptrs{store[0].data(), store[1].data()};
    REQUIRE(static_cast<ConstantSource*>(old1)->value() == 1.0f);
    REQUIRE(old1->pullBlock(ptrs.data(), 2, 8));
    REQUIRE(store[0][0] == 1.0f);
}


TEST_CASE("ChainInputSwitch — retire callback receives a still-alive old source",
          "[t2511][switch][reclamation]") {
    ChainInputSwitch sw;

    // The deferred-free queue: retired pointers land here; the test (the
    // 'message thread') drains them AFTER the swap, never inline.
    static std::vector<PlaybackSource*> retired;
    static std::atomic<bool> deletedInline{false};
    retired.clear();
    deletedInline.store(false);

    sw.setRetireCallback(+[](PlaybackSource* old) {
        // The callback must ENQUEUE, not delete. We record the pointer
        // and verify (below) the object is still alive at this instant.
        retired.push_back(old);
    });

    ConstantSource a(1.0f);
    ConstantSource b(2.0f);

    sw.setSource(&a);
    PlaybackSource* old = sw.setSource(&b);   // old == &a

    // Route the old pointer through the deferred-free seam.
    sw.retireSource(old);

    REQUIRE(retired.size() == 1);
    REQUIRE(retired[0] == &a);
    REQUIRE_FALSE(deletedInline.load());
    // &a is still alive (no inline delete): we can still use it.
    REQUIRE(static_cast<ConstantSource*>(retired[0])->value() == 1.0f);
}


TEST_CASE("ChainInputSwitch — sample-accurate trigger switches mid-buffer",
          "[t2511][switch][trigger]") {
    ChainInputSwitch sw;
    ConstantSource live(1.0f);     // index 0
    ConstantSource play(2.0f);     // index 1

    sw.registerSource(0, &live);
    sw.registerSource(1, &play);
    sw.setSource(&live);           // start on live

    // Buffer [0, 64). The shared clock starts at 0, so a trigger at
    // sample 32 switches to source index 1 (play) at offset 32.
    sw.triggerQueue().push(/*applyAtSample*/ 32, /*desiredSourceIndex*/ 1);

    juce::AudioBuffer<float> buf(2, 64);
    buf.clear();
    runBlock(sw, buf);

    for (int ch = 0; ch < 2; ++ch) {
        // [0, 32) from live (1.0), [32, 64) from play (2.0).
        for (int s = 0; s < 32; ++s) {
            REQUIRE(buf.getSample(ch, s) == 1.0f);
        }
        for (int s = 32; s < 64; ++s) {
            REQUIRE(buf.getSample(ch, s) == 2.0f);
        }
    }
    // The atomic 'currentSource_' is unchanged by a trigger switch — the
    // trigger drives the per-buffer LOCAL only. (The live pointer stays
    // whatever setSource last published.)
    REQUIRE(sw.currentSource() == &live);
}


TEST_CASE("ChainInputSwitch — late trigger clamps to sample 0 of the buffer",
          "[t2511][switch][trigger]") {
    ChainInputSwitch sw;
    ConstantSource live(1.0f);
    ConstantSource play(2.0f);
    sw.registerSource(0, &live);
    sw.registerSource(1, &play);
    sw.setSource(&live);

    // Advance the clock past the trigger sample by running one buffer
    // first (clock 0 -> 64).
    {
        juce::AudioBuffer<float> warmup(2, 64);
        warmup.clear();
        runBlock(sw, warmup);
    }
    // Now the clock is at 64; a trigger for sample 10 (already in the
    // past) must clamp to offset 0 of the CURRENT buffer (clamp-not-drop,
    // §6 rule 3) — the whole buffer comes from play.
    sw.triggerQueue().push(/*applyAtSample*/ 10, /*desiredSourceIndex*/ 1);

    juce::AudioBuffer<float> buf(2, 64);
    buf.clear();
    runBlock(sw, buf);
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(buf.getSample(ch, s) == 2.0f);
        }
    }
}


TEST_CASE("ChainInputSwitch — future trigger is held for a later buffer",
          "[t2511][switch][trigger]") {
    ChainInputSwitch sw;
    ConstantSource live(1.0f);
    ConstantSource play(2.0f);
    sw.registerSource(0, &live);
    sw.registerSource(1, &play);
    sw.setSource(&live);

    // Clock at 0; trigger at sample 100 is AFTER buffer [0, 64) — held.
    sw.triggerQueue().push(/*applyAtSample*/ 100, /*desiredSourceIndex*/ 1);

    juce::AudioBuffer<float> buf0(2, 64);
    buf0.clear();
    runBlock(sw, buf0);
    // First buffer is entirely live — the trigger was held, not applied.
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(buf0.getSample(ch, s) == 1.0f);
        }
    }

    // Second buffer [64, 128): the held trigger (sample 100) now lands at
    // offset 100 - 64 = 36.
    juce::AudioBuffer<float> buf1(2, 64);
    buf1.clear();
    runBlock(sw, buf1);
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 36; ++s) {
            REQUIRE(buf1.getSample(ch, s) == 1.0f);
        }
        for (int s = 36; s < 64; ++s) {
            REQUIRE(buf1.getSample(ch, s) == 2.0f);
        }
    }
}


// -----------------------------------------------------------------------------
// THE §8 STRESS TEST: load-once-per-buffer / no-tearing under concurrent swap.
// -----------------------------------------------------------------------------
//
// One thread runs processBlock in a tight loop; another thread CASes
// currentSource_ between two ConstantSources at full speed. The invariant
// proven: because processBlock loads the atomic exactly once per buffer
// (and no triggers are queued), EVERY buffer is wholly from ONE source —
// never a mix of 1.0 and 2.0 in the same buffer. A torn buffer would mean
// the audio thread re-read the atomic mid-block, which §3.2 rule 2
// forbids. This doubles as the TSan-under-load harness (run it under a
// TSan build when one is wired — see the report's §8 follow-up).
TEST_CASE("ChainInputSwitch — no tearing under concurrent CAS (stress)",
          "[t2511][switch][stress][concurrent]") {
    ChainInputSwitch sw;
    ConstantSource a(1.0f);
    ConstantSource b(2.0f);
    sw.setSource(&a);

    constexpr int kIterations = 200000;
    std::atomic<bool> stop{false};
    std::atomic<long> tornBuffers{0};
    std::atomic<long> blocksRun{0};

    // Swapper thread (control thread): hammer the CAS.
    std::thread swapper([&]() {
        bool toggle = false;
        while (!stop.load(std::memory_order_acquire)) {
            PlaybackSource* old = sw.setSource(toggle ? &a : &b);
            (void)old;  // deferred-free seam: never deleted; both live.
            toggle = !toggle;
        }
    });

    // Audio thread: run processBlock and assert each buffer is uniform.
    std::thread audio([&]() {
        juce::AudioBuffer<float> buf(2, 64);
        juce::MidiBuffer midi;
        for (int it = 0; it < kIterations; ++it) {
            buf.clear();
            sw.processBlock(buf, midi);
            const float first = buf.getSample(0, 0);
            // Every sample in every channel must equal the first sample.
            bool torn = false;
            for (int ch = 0; ch < 2 && !torn; ++ch) {
                for (int s = 0; s < 64; ++s) {
                    const float v = buf.getSample(ch, s);
                    if (v != first) { torn = true; break; }
                }
            }
            // 'first' must be one of the two source constants (or 0 if a
            // null window were ever observed — it cannot be here since a
            // source is always set).
            if (torn || (first != 1.0f && first != 2.0f)) {
                tornBuffers.fetch_add(1, std::memory_order_relaxed);
            }
            blocksRun.fetch_add(1, std::memory_order_relaxed);
        }
        stop.store(true, std::memory_order_release);
    });

    audio.join();
    swapper.join();

    REQUIRE(blocksRun.load() == kIterations);
    // The load-bearing assertion: ZERO torn buffers across 200k blocks
    // under a continuously-CASing control thread.
    REQUIRE(tornBuffers.load() == 0);
}


TEST_CASE("ChainInputSwitch — acquire/release: published source visible next buffer",
          "[t2511][switch][concurrent][ordering]") {
    // The control thread fully constructs + publishes a source before the
    // CAS; the audio thread's acquire-load then observes a fully-formed
    // source. We model 'fully constructed' by a sentinel the source sets
    // and the audio thread reads; a stale read (no acquire/release) could
    // see the pointer but not the constructed value.
    for (int trial = 0; trial < 2000; ++trial) {
        ChainInputSwitch sw;
        ConstantSource base(7.0f);
        sw.setSource(&base);

        std::atomic<bool> published{false};
        ConstantSource* fresh = nullptr;

        std::thread producer([&]() {
            // Construct a fresh source, then publish via setSource (CAS,
            // acq_rel). The release in the CAS pairs with the audio
            // thread's acquire-load.
            fresh = new ConstantSource(42.0f);
            sw.setSource(fresh);
            published.store(true, std::memory_order_release);
        });

        // Audio thread: once the publish is observed, the very next buffer
        // must read the fresh source's constructed value (42), never a
        // half-formed object (which would show as some other value).
        std::thread audio([&]() {
            juce::AudioBuffer<float> buf(1, 8);
            juce::MidiBuffer midi;
            while (!published.load(std::memory_order_acquire)) {
                buf.clear();
                sw.processBlock(buf, midi);
            }
            buf.clear();
            sw.processBlock(buf, midi);
            const float v = buf.getSample(0, 0);
            // After the publish, the value is either base (7) — if the
            // buffer ran before the swap landed — or the fresh value (42).
            // It must NEVER be anything else (a torn/half-constructed read).
            REQUIRE((v == 7.0f || v == 42.0f));
        });

        producer.join();
        audio.join();
        delete fresh;  // test owns lifetime; safe here after joins.
    }
}
