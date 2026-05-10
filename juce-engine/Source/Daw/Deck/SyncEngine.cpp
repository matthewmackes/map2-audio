// =============================================================================
// T2503 Set 8 — SyncEngine implementation
// =============================================================================

#include "SyncEngine.h"

namespace map2::daw::deck {

void SyncEngine::setMaster(double bpm, int64_t firstBeatSamples, int sampleRate) noexcept {
    masterGrid_.set(firstBeatSamples, bpm, sampleRate);
}

void SyncEngine::registerDeck(int deckId, const BeatGrid& grid, SyncMode mode) {
    Deck deck;
    deck.grid = grid;
    deck.mode = mode;
    decks_[deckId] = deck;
}

void SyncEngine::setDeckSyncMode(int deckId, SyncMode mode) {
    auto it = decks_.find(deckId);
    if (it != decks_.end()) it->second.mode = mode;
}

double SyncEngine::rateForDeck(int deckId) const noexcept {
    auto it = decks_.find(deckId);
    if (it == decks_.end()) return 1.0;
    if (it->second.mode != SyncMode::FollowMaster) return 1.0;
    if (!masterGrid_.isValid() || !it->second.grid.isValid()) return 1.0;
    const double deckBpm = it->second.grid.bpm();
    if (deckBpm <= 0.0) return 1.0;
    return masterGrid_.bpm() / deckBpm;
}

int64_t SyncEngine::alignedPositionForDeck(int deckId, int64_t currentPosition) const noexcept {
    auto it = decks_.find(deckId);
    if (it == decks_.end()) return currentPosition;
    if (it->second.mode != SyncMode::FollowMaster) return currentPosition;
    if (!masterGrid_.isValid()) return currentPosition;
    // Snap to the next beat boundary on the deck's own grid; bpm match
    // already comes from rateForDeck. The bench-grade implementation will
    // tighten this with a phase-aligned offset against masterGrid_.
    return it->second.grid.nextBeatPosition(currentPosition);
}

bool SyncEngine::hasDeck(int deckId) const noexcept {
    return decks_.find(deckId) != decks_.end();
}

std::size_t SyncEngine::deckCount() const noexcept {
    return decks_.size();
}

} // namespace map2::daw::deck
