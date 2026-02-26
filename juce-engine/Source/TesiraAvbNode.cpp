/**
 * TesiraAvbNode — RT-safe per-channel gain/mute bridge for Biamp Tesira Forte AVB.
 *
 * processDevice() is safe to call from the audio callback thread:
 *   - All per-channel state is read via std::atomic::load(relaxed)
 *   - No heap allocation (scratchBuf_ is pre-allocated in prepare())
 *   - Peak meter writes go into an AbstractFifo ring — non-blocking
 *
 * setDevice*() methods are safe to call from Python/network threads:
 *   - All stores are std::atomic::store(relaxed) — no locks, no waits
 */

#include "TesiraAvbNode.h"

#include <cmath>

namespace map2 {

// ── Helpers ──────────────────────────────────────────────────────────────────

static inline float dbToLinear(float db) noexcept {
    // Standard dB → linear: 10^(dB/20)
    // Using std::pow avoids fast-math precision issues at extreme values.
    return std::pow(10.0f, db * 0.05f);
}

static inline float linearToDb(float linear) noexcept {
    if (linear <= 0.0f) return -120.0f;
    return 20.0f * std::log10(linear);
}

// ── Constructor ───────────────────────────────────────────────────────────────

TesiraAvbNode::TesiraAvbNode() {
    // DeviceState default-constructs all atomics to 0 dB / unmuted / disconnected
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

void TesiraAvbNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_   = sampleRate;
    maxBlockSize_ = maxBlockSize;

    // Pre-allocate scratch buffer: MAX_CHANNELS × maxBlockSize
    // This is the only allocation in the prepare path; processDevice is alloc-free.
    scratchBuf_.setSize(MAX_CHANNELS, maxBlockSize, /*keepExisting=*/false,
                        /*clearExtraSpace=*/true, /*avoidReallocating=*/false);
}

void TesiraAvbNode::release() {
    scratchBuf_.setSize(0, 0);
}

// ── Audio processing ──────────────────────────────────────────────────────────

void TesiraAvbNode::processDevice(int deviceIdx, juce::AudioBuffer<float>& buffer) {
    if (!validDevice(deviceIdx)) return;

    auto& dev = devices_[deviceIdx];

    // If device is not connected, silence the buffer and return.
    if (!dev.connected.load(std::memory_order_relaxed)) {
        buffer.clear();
        return;
    }

    const int numCh      = std::min(buffer.getNumChannels(), MAX_CHANNELS);
    const int numSamples = buffer.getNumSamples();

    // Peak tracker for metering
    float peaks[MAX_CHANNELS] {};

    for (int ch = 0; ch < numCh; ++ch) {
        const bool muted  = dev.mutes[ch].load(std::memory_order_relaxed);
        const float gainDb = dev.levelsDb[ch].load(std::memory_order_relaxed);

        if (muted) {
            buffer.clear(ch, 0, numSamples);
            peaks[ch] = 0.0f;
            continue;
        }

        const float gain = dbToLinear(gainDb);

        if (std::abs(gain - 1.0f) > 1e-6f) {
            // Apply gain in-place
            buffer.applyGain(ch, 0, numSamples, gain);
        }

        // Compute peak (dBFS) for metering
        const float peak = buffer.getMagnitude(ch, 0, numSamples);
        peaks[ch] = linearToDb(peak);
    }

    // Push peak frame to metering ring (non-blocking: if full, drop silently)
    {
        int start1 = 0, size1 = 0, start2 = 0, size2 = 0;
        dev.meterFifo.prepareToWrite(1, start1, size1, start2, size2);
        if (size1 > 0) {
            std::memcpy(dev.meterRing[start1].peaks, peaks,
                        sizeof(float) * static_cast<size_t>(numCh));
            dev.meterFifo.finishedWrite(size1);
        }
    }
}

// ── Python bridge ─────────────────────────────────────────────────────────────

void TesiraAvbNode::setDeviceLevel(int deviceIdx, int channel, float levelDb) {
    if (!validDevice(deviceIdx) || !validChannel(channel)) return;
    devices_[deviceIdx].levelsDb[channel].store(levelDb, std::memory_order_relaxed);
}

void TesiraAvbNode::setDeviceMute(int deviceIdx, int channel, bool muted) {
    if (!validDevice(deviceIdx) || !validChannel(channel)) return;
    devices_[deviceIdx].mutes[channel].store(muted, std::memory_order_relaxed);
}

void TesiraAvbNode::setDeviceConnected(int deviceIdx, bool connected) {
    if (!validDevice(deviceIdx)) return;
    devices_[deviceIdx].connected.store(connected, std::memory_order_relaxed);
}

void TesiraAvbNode::setDevicePreset(int deviceIdx, int presetIndex) {
    if (!validDevice(deviceIdx)) return;
    devices_[deviceIdx].activePreset.store(presetIndex, std::memory_order_relaxed);
}

// ── Level readback ────────────────────────────────────────────────────────────

float TesiraAvbNode::getOutputLevel(int deviceIdx, int channel) const {
    if (!validDevice(deviceIdx) || !validChannel(channel)) return -120.0f;

    const auto& dev = devices_[deviceIdx];

    // Drain all available meter frames and return the most recent peak for `channel`
    int available = dev.meterFifo.getNumReady();
    if (available <= 0) return -120.0f;

    float latestPeak = -120.0f;

    // Read all pending frames to avoid ring filling up
    auto& fifo = const_cast<juce::AbstractFifo&>(dev.meterFifo);
    while (available-- > 0) {
        int start1 = 0, size1 = 0, start2 = 0, size2 = 0;
        fifo.prepareToRead(1, start1, size1, start2, size2);
        if (size1 > 0) {
            latestPeak = dev.meterRing[start1].peaks[channel];
            fifo.finishedRead(size1);
        }
    }

    return latestPeak;
}

bool TesiraAvbNode::isDeviceConnected(int deviceIdx) const {
    if (!validDevice(deviceIdx)) return false;
    return devices_[deviceIdx].connected.load(std::memory_order_relaxed);
}

int TesiraAvbNode::getDevicePreset(int deviceIdx) const {
    if (!validDevice(deviceIdx)) return -1;
    return devices_[deviceIdx].activePreset.load(std::memory_order_relaxed);
}

} // namespace map2
