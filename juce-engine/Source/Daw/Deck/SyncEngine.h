// =============================================================================
// T2503 Set 8 — SyncEngine
// =============================================================================
// Adapts Mixxx's master-sync model: one deck is the master, others (slaves)
// follow the master's bpm + phase. Original Mixxx implementation:
//   src/engine/sync/syncworker.cpp + src/engine/sync/synccontrol.cpp
//   (GPLv2-or-later).
// Re-implementation in MAP2 source.
//
// Differences from Mixxx:
//   - No "internal master" mode — the platform clock (TransportBridge) is
//     always available; sync targets the bridge instead of an arbitrary
//     deck. This matches MAP2 locked decision A13: platform clock canonical.
//   - Single-master invariant enforced; switching master is one operation.
//   - Phase alignment uses BeatGrid::nextBeatPosition; beat-jump amount is
//     a simple ratio rather than a full pitch-shift adjustment.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "SyncEngine.h included but MAP2_DAW_MODE is not set"
#endif

#include "BeatGrid.h"

#include <cstdint>
#include <unordered_map>

namespace map2::daw::deck {

enum class SyncMode {
    None,        // deck plays at its own bpm/phase
    FollowMaster // deck chases TransportBridge bpm/phase
};

class SyncEngine {
public:
    SyncEngine() = default;

    /** Set the master bpm + first-beat anchor. The TransportBridge is the
        canonical source; this is a snapshot the SyncEngine uses to compute
        slave alignments. Call again whenever the platform clock bpm changes. */
    void setMaster(double bpm, int64_t firstBeatSamples, int sampleRate) noexcept;

    /** Register a deck with its current beatgrid + sync mode. */
    void registerDeck(int deckId, const BeatGrid& grid, SyncMode mode);

    /** Update a deck's sync mode (None ↔ FollowMaster). */
    void setDeckSyncMode(int deckId, SyncMode mode);

    /** Returns the playback-rate multiplier the deck should apply to match
        master bpm. 1.0 if no sync, otherwise (master_bpm / deck_bpm). */
    double rateForDeck(int deckId) const noexcept;

    /** Returns the next phase-aligned position the deck should jump to in
        order to align with the master's beatgrid, given its current
        position. If the deck doesn't sync, returns ``currentPosition``
        unchanged. */
    int64_t alignedPositionForDeck(int deckId, int64_t currentPosition) const noexcept;

    /** True when the deck is registered. */
    bool hasDeck(int deckId) const noexcept;

    /** Number of registered decks. */
    std::size_t deckCount() const noexcept;

private:
    struct Deck {
        BeatGrid grid;
        SyncMode mode = SyncMode::None;
    };

    BeatGrid masterGrid_;
    std::unordered_map<int, Deck> decks_;
};

} // namespace map2::daw::deck
