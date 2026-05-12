// =============================================================================
// LooperTrack — processBlock implementation.
// =============================================================================
//
// All audio-callback work lives here. The class header has only
// inline operator-side helpers + storage; this .cpp keeps the
// arithmetic out of every translation unit that includes the
// header.

#include "Looper/LooperTrack.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace map2::looper {

namespace {

inline float dbToLinear(float db) noexcept {
    return std::pow(10.0f, db / 20.0f);
}

}  // namespace


void LooperTrack::processBlock(juce::AudioBuffer<float>& buffer) noexcept {
    const TrackState st = state_.load(std::memory_order_acquire);
    if (st == TrackState::Empty || st == TrackState::Stopped) {
        return;
    }
    const int numSamples = buffer.getNumSamples();
    const int numChans   = std::min(buffer.getNumChannels(), kLooperChannels);
    if (numSamples <= 0 || numChans <= 0) {
        return;
    }

    const bool muted     = muted_.load(std::memory_order_acquire);
    const bool reverse   = reverse_.load(std::memory_order_acquire);
    const bool halfSpeed = halfSpeed_.load(std::memory_order_acquire);
    const float gain     = dbToLinear(levelDb_.load(std::memory_order_acquire));

    const int loopLen   = loopLengthFrames_.load(std::memory_order_acquire);
    const int undoIdx   = std::max(0, undoCursor_.load(std::memory_order_acquire));
    const int activeIdx = std::min(undoIdx, kLooperUndoDepth - 1);
    float* layer = layers_[static_cast<size_t>(activeIdx)].get();

    if (st == TrackState::Recording) {
        // Layer 0 is the first capture. Write input → layer.
        int head = playheadFrames_.load(std::memory_order_acquire);
        for (int i = 0; i < numSamples && head < kLooperMaxFramesPerTrack; ++i) {
            for (int ch = 0; ch < numChans; ++ch) {
                layer[head * kLooperChannels + ch] = buffer.getReadPointer(ch)[i];
            }
            ++head;
        }
        playheadFrames_.store(head, std::memory_order_release);
        return;  // Recording is destructive write; don't sum playback.
    }

    if (loopLen <= 0) {
        return;  // No content to play (defensive — Playing with loopLen=0 shouldn't happen).
    }

    // Playing or Overdubbing: stream from the active layer with
    // the playhead wrapping at loopLen. Reverse + half-speed flags
    // adjust the playhead step.
    int head = playheadFrames_.load(std::memory_order_acquire);
    const int step = halfSpeed ? 1 : 2;  // step==2 means "advance 1 frame per sample"
    // For half-speed we advance the playhead half as fast: 1 frame per 2 samples.
    // Implement by skipping the advance on even/odd samples; here we use
    // an integer accumulator.
    int halfAccum = 0;

    for (int i = 0; i < numSamples; ++i) {
        // Per-sample read position (with reverse).
        int readPos = reverse ? (loopLen - 1 - head) : head;
        if (readPos < 0)         readPos += loopLen;
        if (readPos >= loopLen)  readPos %= loopLen;

        for (int ch = 0; ch < numChans; ++ch) {
            const float sample = muted
                ? 0.0f
                : layer[readPos * kLooperChannels + ch] * gain;
            if (st == TrackState::Overdubbing) {
                // Sum incoming buffer onto the layer (the "stacking"
                // behavior) and ALSO into the output buffer for the
                // operator monitor.
                const float input = buffer.getReadPointer(ch)[i];
                layer[readPos * kLooperChannels + ch] = sample + input;
                buffer.getWritePointer(ch)[i] += sample;
            } else {
                buffer.getWritePointer(ch)[i] += sample;
            }
        }

        // Advance playhead. Half-speed: advance only on odd samples.
        if (halfSpeed) {
            ++halfAccum;
            if (halfAccum >= 2) {
                halfAccum = 0;
                ++head;
            }
        } else {
            ++head;
        }
        if (head >= loopLen) {
            head -= loopLen;
        }
        if (head < 0) {
            head += loopLen;
        }
    }

    (void)step;  // 'step' kept for clarity; not currently used independently.
    playheadFrames_.store(head, std::memory_order_release);
}

}  // namespace map2::looper
