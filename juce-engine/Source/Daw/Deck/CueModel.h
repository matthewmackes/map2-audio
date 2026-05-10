// =============================================================================
// T2503 Set 8 — CueModel
// =============================================================================
// Adapts Mixxx's per-deck cue / hot-cue model. Re-implementation in MAP2
// source — not copy-paste from Mixxx. Original Mixxx implementation:
//   src/engine/controls/cuecontrol.cpp (GPLv2-or-later).
// Attribution per the standing rule in .gemini/instructions.md.
//
// Cue states (Mixxx CueMode enum):
//   Mixxx     — press-and-hold preview from cue; release returns to cue
//   PioneerCdj — cue locks to current position on press; play continues
//   Denon      — cue is a play marker; press resets to cue position
//
// MAP2 Set 8 ships only the Mixxx mode; PioneerCdj and Denon left for the
// bench-side polish slice.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "CueModel.h included but MAP2_DAW_MODE is not set"
#endif

#include <array>
#include <cstdint>
#include <optional>

namespace map2::daw::deck {

constexpr int kHotCueCount = 8;  // Mixxx default; matches MK1 pad row

enum class CueMode {
    Mixxx,
    PioneerCdj,  // not implemented in Set 8
    Denon,       // not implemented in Set 8
};

struct HotCue {
    bool set = false;
    int64_t positionSamples = 0;
    // RGB color packed as 0xRRGGBB; matches Mixxx's color-coding convention.
    uint32_t color = 0xFFFFFF;
};

class CueModel {
public:
    CueModel();

    void setMode(CueMode mode) noexcept;
    CueMode mode() const noexcept { return mode_; }

    /** Set the main cue point at the given position. */
    void setMainCue(int64_t positionSamples) noexcept;

    /** Returns the main cue position, or nullopt if unset. */
    std::optional<int64_t> mainCue() const noexcept;

    /** Press the main cue button at ``currentPosition``. Returns the new
        position (or unchanged if the press is preview-style). */
    int64_t pressMainCue(int64_t currentPosition) noexcept;

    /** Release the main cue button. Returns the playhead position to apply
        (Mixxx mode rolls back to the cue). */
    int64_t releaseMainCue(int64_t fallback) noexcept;

    /** Set hot-cue ``index`` at ``positionSamples`` with optional color. */
    void setHotCue(int index, int64_t positionSamples, uint32_t color = 0xFFFFFF) noexcept;

    /** Clear hot-cue ``index``. */
    void clearHotCue(int index) noexcept;

    /** Trigger hot-cue ``index``. Returns the position to seek to, or
        nullopt if the slot is empty. */
    std::optional<int64_t> triggerHotCue(int index) const noexcept;

    /** Read-only access to the hot-cue list. */
    const std::array<HotCue, kHotCueCount>& hotCues() const noexcept {
        return hotCues_;
    }

private:
    CueMode mode_ = CueMode::Mixxx;
    std::optional<int64_t> mainCue_;
    std::array<HotCue, kHotCueCount> hotCues_{};
    bool mainCuePressed_ = false;
    int64_t mainCuePressPosition_ = 0;
};

} // namespace map2::daw::deck
