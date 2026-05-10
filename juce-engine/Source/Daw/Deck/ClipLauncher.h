// =============================================================================
// T2503 Set 8 — ClipLauncher
// =============================================================================
// Tier-2 deck primitive: lights up the 16 pads of an MK1-style clip grid.
// Mixxx doesn't have a direct equivalent (it's deck-oriented; clip launch
// comes from the surrounding DAW logic). This is a MAP2 abstraction that
// composes BeatGrid + SyncEngine + the project's clip[] array.
//
// API surface matches what the MK1 DAW pack expects: pad press → trigger
// clip slot N on the active track. ClipLauncher holds the "pending" /
// "playing" / "queued" state machine that lets pads light up correctly:
//
//   stopped  ──pad press──► queued  ──beat boundary──► playing
//   playing  ──pad press──► queued (stop next beat) ──► stopped
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "ClipLauncher.h included but MAP2_DAW_MODE is not set"
#endif

#include <cstdint>
#include <unordered_map>

namespace map2::daw::deck {

enum class ClipState {
    Stopped,
    Queued,        // pending start at next beat boundary
    Playing,
    QueuedStop     // pending stop at next beat boundary
};

class ClipLauncher {
public:
    ClipLauncher() = default;

    /** Press the pad for ``clipId``. Transitions: Stopped → Queued,
        Playing → QueuedStop, Queued → Stopped (cancel), QueuedStop →
        Playing (cancel). */
    ClipState press(int clipId) noexcept;

    /** Called on every beat boundary (or sub-beat boundary depending on
        quantization setting). Promotes Queued → Playing and QueuedStop →
        Stopped for every clip in the bank. */
    void onBeatBoundary() noexcept;

    /** Force a clip to a specific state (used by undo/redo + ext sync). */
    void setState(int clipId, ClipState state) noexcept;

    /** Returns the current state of a clip. Stopped if unknown. */
    ClipState stateOf(int clipId) const noexcept;

    /** Returns the count of clips in each state. Useful for status UIs. */
    struct StateCounts {
        int stopped = 0;
        int queued = 0;
        int playing = 0;
        int queuedStop = 0;
    };
    StateCounts counts() const noexcept;

private:
    std::unordered_map<int, ClipState> states_;
};

} // namespace map2::daw::deck
