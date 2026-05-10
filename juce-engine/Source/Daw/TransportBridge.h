// =============================================================================
// T2503 Set 7 — TransportBridge + MIDI clock encoders
// =============================================================================
// MAP2 platform clock is canonical (locked decision A13). Tracktion-style
// "DAW transport master" is explicitly inverted — the DAW core's transport
// position chases the platform clock. This file ships the C++ side of:
//
//   TransportBridge       — holds the canonical (sample-accurate) position
//                            and bpm; emits MIDI Clock + MTC quarter-frame
//                            ticks at the right cadence.
//   MidiClockOut          — emits 0xF8 MIDI Clock messages at 24 PPQ.
//   MidiClockIn           — accepts external 0xF8 messages, derives bpm.
//   MtcLtcBridge          — encodes / decodes MTC quarter-frame + LTC.
//
// Each class is a pure DSP/state piece: no audio device, no JUCE callbacks,
// no IPC. Sets 7+ wire them into the actual audio path.
//
// License: AGPLv3-only.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "TransportBridge.h included but MAP2_DAW_MODE is not set"
#endif

#include <atomic>
#include <cstdint>
#include <functional>
#include <vector>

namespace map2::daw {

// MIDI Clock constants.
constexpr uint8_t kMidiClockTick = 0xF8;
constexpr int kMidiClockPpq = 24;

// MTC quarter-frame status.
constexpr uint8_t kMtcQuarterFrameStatus = 0xF1;

enum class SyncSource {
    Internal,
    MidiClockIn,
    Mtc,
    Ltc
};

class TransportBridge {
public:
    TransportBridge();

    void setBpm(double bpm) noexcept;
    double bpm() const noexcept { return bpm_.load(std::memory_order_relaxed); }

    void setSampleRate(int sampleRate) noexcept;
    int sampleRate() const noexcept { return sampleRate_.load(std::memory_order_relaxed); }

    void setPositionSamples(int64_t samples) noexcept;
    int64_t positionSamples() const noexcept {
        return position_.load(std::memory_order_relaxed);
    }

    void setSyncSource(SyncSource src) noexcept;
    SyncSource syncSource() const noexcept {
        return source_.load(std::memory_order_relaxed);
    }

    /** Advance position by ``samples``. Called from the audio callback (or
        a non-RT cadence runner) every block. */
    void advancePosition(int64_t samples) noexcept;

    /** Returns the position in beats given current bpm + sample rate. */
    double positionBeats() const noexcept;

    /** Position in seconds. */
    double positionSeconds() const noexcept;

private:
    std::atomic<double> bpm_;
    std::atomic<int> sampleRate_;
    std::atomic<int64_t> position_;
    std::atomic<SyncSource> source_;
};

// ---- MIDI Clock outbound ----

class MidiClockOut {
public:
    explicit MidiClockOut(TransportBridge* bridge);

    /** Run for the next ``samples`` of audio time and call ``emit`` once for
        every MIDI Clock tick that falls within that window. The callback
        runs on the audio thread; it must be RT-safe (no allocation, no
        locks). */
    void run(int samples, const std::function<void()>& emit);

    /** Reset the internal phase accumulator (call on transport stop or
        rewind to avoid emitting a stale tick). */
    void reset() noexcept;

private:
    TransportBridge* bridge_;
    double phaseAccumulator_;  // accumulated samples since last emitted tick
};

// ---- MIDI Clock inbound ----

class MidiClockIn {
public:
    explicit MidiClockIn(TransportBridge* bridge);

    /** Called by the MIDI router on each 0xF8 byte. Derives bpm + updates
        the bridge if sync source is midi_clock_in. */
    void onTick(uint64_t hostTimeNs);

    /** Reset drift / averaging state. */
    void reset() noexcept;

private:
    TransportBridge* bridge_;
    uint64_t lastTickNs_ = 0;
    double smoothedBpm_;
};

// ---- MTC + LTC ----

struct MtcQuarterFrameByte {
    uint8_t messageType;       // 0..7
    uint8_t data;              // 0..15
    uint8_t encoded() const noexcept {
        return static_cast<uint8_t>((messageType << 4) | (data & 0x0F));
    }
};

class MtcLtcBridge {
public:
    explicit MtcLtcBridge(TransportBridge* bridge);

    /** Encode the current transport position into a stream of 8 MTC
        quarter-frame bytes. The 8 bytes are emitted at 1/4 frame each;
        this method returns all 8 at once for testing. */
    std::vector<MtcQuarterFrameByte> encodeMtcSequence(int frameRate = 30) const;

    /** Encode the current position into an LTC frame (80 bits). Returns
        the raw 80-bit pattern as 10 bytes (LSB-first). */
    std::vector<uint8_t> encodeLtcFrame(int frameRate = 30) const;

    /** Decode a single MTC quarter-frame byte. Eight successful decodes
        assemble a full timecode + apply it to the bridge (when sync_source
        == mtc). */
    void decodeMtcQuarterFrame(uint8_t qfByte);

    /** Decode an LTC frame (10 bytes). Updates the bridge when
        sync_source == ltc. */
    void decodeLtcFrame(const uint8_t* bytes, int length);

private:
    TransportBridge* bridge_;
    // Quarter-frame assembly state.
    uint8_t pendingHours_ = 0;
    uint8_t pendingMinutes_ = 0;
    uint8_t pendingSeconds_ = 0;
    uint8_t pendingFrames_ = 0;
    uint8_t pendingFrameRate_ = 0;
};

} // namespace map2::daw
