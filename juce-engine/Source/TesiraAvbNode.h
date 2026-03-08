#pragma once

/**
 * TesiraAvbNode — RT-safe per-channel gain/mute bridge for Biamp Tesira Forte AVB units.
 *
 * Supports up to MAX_DEVICES (5) units, each with up to MAX_CHANNELS (128) channels.
 *
 * Design principles:
 *  - Zero heap allocation in processBlock (all buffers pre-allocated in prepareToPlay)
 *  - Per-channel state stored in std::atomic<> — lock-free reads from audio thread,
 *    lock-free writes from Python/network thread
 *  - Level meters use AbstractFifo ring for Python readback (same pattern as metering in
 *    Map2AudioEngine)
 *  - No JUCE AudioProcessorGraph integration required; used as a stateful helper object
 *    inside Map2AudioEngine
 */

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include <array>
#include <atomic>
#include <cstring>

namespace map2 {

class TesiraAvbNode {
public:
    // ── Capacity constants ────────────────────────────────────────────────────
    static constexpr int MAX_DEVICES  = 5;
    static constexpr int MAX_CHANNELS = 128;

    // ── Per-device state ──────────────────────────────────────────────────────
    struct DeviceState {
        // Written by Python thread, read by audio thread — all atomic
        std::array<std::atomic<float>, MAX_CHANNELS> levelsDb;   // dB gain per channel
        std::array<std::atomic<bool>,  MAX_CHANNELS> mutes;       // mute per channel
        std::atomic<bool>  connected { false };
        std::atomic<int>   activePreset { -1 };

        // Output peak levels pushed by processBlock, read by Python
        // (METERING_RING_SIZE frames × MAX_CHANNELS floats)
        static constexpr int METER_RING  = 8;
        struct MeterFrame {
            float peaks[MAX_CHANNELS] {};
        };
        std::array<MeterFrame, METER_RING> meterRing;
        juce::AbstractFifo meterFifo { METER_RING };

        DeviceState() {
            for (auto& a : levelsDb) a.store(0.0f, std::memory_order_relaxed);
            for (auto& a : mutes)    a.store(false, std::memory_order_relaxed);
        }

        // Non-copyable (atomics are not copyable)
        DeviceState(const DeviceState&) = delete;
        DeviceState& operator=(const DeviceState&) = delete;
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    TesiraAvbNode();
    ~TesiraAvbNode() = default;

    // Non-copyable
    TesiraAvbNode(const TesiraAvbNode&) = delete;
    TesiraAvbNode& operator=(const TesiraAvbNode&) = delete;

    /**
     * Call once before starting audio (from prepare-to-play context).
     * Pre-allocates the process buffer.
     */
    void prepare(double sampleRate, int maxBlockSize);

    /**
     * Release pre-allocated buffers (call from releaseResources).
     */
    void release();

    // ── Audio processing ──────────────────────────────────────────────────────

    /**
     * Apply per-channel gain and mute atomically.
     * The buffer is expected to hold all channels for one device (deviceIdx).
     *
     * @param deviceIdx  Index into devices_ [0, MAX_DEVICES)
     * @param buffer     AudioBuffer with channels [0, numChannels) to process in-place
     */
    void processDevice(int deviceIdx, juce::AudioBuffer<float>& buffer);

    // ── Python bridge (called from Python/network thread) ────────────────────

    /** Set per-channel dB gain for a device. Thread-safe (atomic store). */
    void setDeviceLevel(int deviceIdx, int channel, float levelDb);

    /** Set per-channel mute for a device. Thread-safe (atomic store). */
    void setDeviceMute(int deviceIdx, int channel, bool muted);

    /** Mark device as connected/disconnected. Thread-safe. */
    void setDeviceConnected(int deviceIdx, bool connected);

    /** Set active preset index (-1 = none). Thread-safe. */
    void setDevicePreset(int deviceIdx, int presetIndex);

    // ── Level readback ────────────────────────────────────────────────────────

    /**
     * Read the latest peak level for a specific channel.
     * Returns 0.0f if no metering data is available yet, or if indices are OOB.
     */
    float getOutputLevel(int deviceIdx, int channel) const;

    /** Returns true if device index is valid and connected. */
    bool isDeviceConnected(int deviceIdx) const;

    /** Returns active preset index for device (-1 if none). */
    int getDevicePreset(int deviceIdx) const;

private:
    // One DeviceState per managed unit
    std::array<DeviceState, MAX_DEVICES> devices_;

    // Pre-allocated scratch buffer for processDevice (avoids heap alloc in audio thread)
    juce::AudioBuffer<float> scratchBuf_;

    double sampleRate_ = 48000.0;
    int    maxBlockSize_ = 512;

    // Bounds-check helper
    static bool validDevice(int d)  { return d >= 0 && d < MAX_DEVICES;  }
    static bool validChannel(int c) { return c >= 0 && c < MAX_CHANNELS; }
};

} // namespace map2
