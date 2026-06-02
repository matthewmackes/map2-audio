// =============================================================================
// T2511-2 — PlaybackSource (the abstract input-source seam ChainInputSwitch
//           swaps atomically).
// =============================================================================
//
// ChainInputSwitch holds a std::atomic<PlaybackSource*> and flips it from
// the control thread (CAS) while the audio thread reads it once per buffer
// (acquire-load). This abstract base is the common type behind that
// pointer so the switch can swap between, e.g., a FileInputProcessor
// (post-FX-wet or pre-FX playback) and — in a later slice — a
// LiveInputSource (the chain's normal device input). It is intentionally
// minimal: a single RT-safe pullBlock() the audio thread calls.
//
// RT-safety contract (docs/architecture/T2511_RT_SAFETY_REVIEW.md §2, §3):
//   - pullBlock() is invoked on the audio thread. Implementations MUST
//     be RT-safe: zero heap alloc, zero locks, zero syscalls. A
//     FileInputProcessor satisfies this by popping a pre-filled ring
//     (PlaybackRing); a LiveInputSource by copying the already-present
//     device buffer.
//   - The base imposes no virtual state beyond the vtable pointer; the
//     single virtual call cost is negligible against the 1.333 ms
//     period budget (§2.1).

#pragma once

namespace map2::recorder {

/**
 * Abstract input source the audio thread pulls a block from each buffer.
 *
 * The contract is deliberately tiny: fill `outputs[0..numChannels)` with
 * `numSamples` samples for this block, RT-safely. The return value
 * reports whether real audio was produced (true) or the source had to
 * fall back to silence (false) — the switch / caller can surface this as
 * an underrun without changing the audio output (already silence-filled
 * by the implementation on the false path).
 */
class PlaybackSource {
public:
    virtual ~PlaybackSource() = default;

    /**
     * RT-safe: produce one block of audio into `outputs`.
     *
     * Implementations MUST guarantee:
     *   - On true:  outputs[ch][0..numSamples) hold valid audio for
     *               ch in [0, numChannels).
     *   - On false: outputs are fully silence-filled (the implementation
     *               zeroes them) — the caller never sees stale samples.
     *   - Zero heap allocation, zero locks, zero syscalls.
     *
     * @param outputs      Array of numChannels writable channel pointers.
     * @param numChannels  Number of output channels (> 0).
     * @param numSamples   Samples to produce per channel (> 0).
     * @return true if real audio was produced; false on underrun/silence.
     */
    virtual bool pullBlock(float* const* outputs,
                           int numChannels,
                           int numSamples) noexcept = 0;
};

}  // namespace map2::recorder
