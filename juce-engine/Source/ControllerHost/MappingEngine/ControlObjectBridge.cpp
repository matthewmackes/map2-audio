// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ControlObjectBridge — C++ mirror of mixxx_control_object_bridge.py.
// Worklist: T2459-H2

#include "ControlObjectBridge.h"

#include <unordered_set>
#include <utility>

namespace map2::controller_host {

namespace {

// Hash for (group, key) pairs.
struct PairHash {
    std::size_t operator() (const std::pair<std::string, std::string>& p) const noexcept {
        return std::hash<std::string>{}(p.first) * 31 + std::hash<std::string>{}(p.second);
    }
};

using WellKnownMap = std::unordered_map<std::pair<std::string, std::string>, std::string, PairHash>;

// One-time builder. Mirrors the Python WELL_KNOWN exactly.
const WellKnownMap& wellKnown()
{
    static const WellKnownMap table = []() {
        WellKnownMap t;

        // --- Master channel ---
        t[{"[Master]", "volume"}]              = "audio.master.volume";
        t[{"[Master]", "headVolume"}]          = "audio.master.headphone_volume";
        t[{"[Master]", "headMix"}]             = "audio.master.headphone_mix";
        t[{"[Master]", "balance"}]             = "audio.master.balance";
        t[{"[Master]", "crossfader"}]          = "audio.master.crossfader";
        t[{"[Master]", "gain"}]                = "audio.master.gain";
        t[{"[Master]", "VuMeterL"}]            = "audio.master.vu_left";
        t[{"[Master]", "VuMeterR"}]            = "audio.master.vu_right";
        t[{"[Master]", "PeakIndicatorL"}]      = "audio.master.peak_left";
        t[{"[Master]", "PeakIndicatorR"}]      = "audio.master.peak_right";

        // --- Per-channel deck-equivalent controls (N=1..4 default) ---
        for (int n = 1; n <= 4; ++n)
        {
            const std::string group = "[Channel" + std::to_string (n) + "]";
            const std::string chain = "audio.chain." + std::to_string (n);

            t[{group, "play"}]              = chain + ".play";
            t[{group, "pause"}]             = chain + ".pause";
            t[{group, "cue_default"}]       = chain + ".cue";
            t[{group, "cue_set"}]           = chain + ".cue_set";
            t[{group, "volume"}]            = chain + ".volume";
            t[{group, "pregain"}]           = chain + ".gain";
            t[{group, "mute"}]              = chain + ".mute";
            t[{group, "pfl"}]               = chain + ".solo";
            t[{group, "rate"}]              = chain + ".rate";
            t[{group, "rate_perm_up"}]      = chain + ".rate_up";
            t[{group, "rate_perm_down"}]    = chain + ".rate_down";
            t[{group, "rate_temp_up"}]      = chain + ".rate_temp_up";
            t[{group, "rate_temp_down"}]    = chain + ".rate_temp_down";
            t[{group, "loop_in"}]           = chain + ".loop_in";
            t[{group, "loop_out"}]          = chain + ".loop_out";
            t[{group, "reloop_exit"}]       = chain + ".loop_toggle";
            t[{group, "beatloop_activate"}] = chain + ".beatloop";
            t[{group, "filterLow"}]         = chain + ".eq.low";
            t[{group, "filterMid"}]         = chain + ".eq.mid";
            t[{group, "filterHigh"}]        = chain + ".eq.high";
            t[{group, "filterLowKill"}]     = chain + ".eq.low_kill";
            t[{group, "filterMidKill"}]     = chain + ".eq.mid_kill";
            t[{group, "filterHighKill"}]    = chain + ".eq.high_kill";
            t[{group, "VuMeter"}]           = chain + ".vu";
            t[{group, "VuMeterL"}]          = chain + ".vu_left";
            t[{group, "VuMeterR"}]          = chain + ".vu_right";
            t[{group, "PeakIndicator"}]     = chain + ".peak";
            t[{group, "back"}]              = chain + ".transport_back";
            t[{group, "fwd"}]               = chain + ".transport_forward";
            t[{group, "track_loaded"}]      = chain + ".track_loaded";
            t[{group, "duration"}]          = chain + ".duration";
            t[{group, "playposition"}]      = chain + ".position";
            t[{group, "bpm"}]               = chain + ".bpm";
            t[{group, "sync_enabled"}]      = chain + ".sync";
            t[{group, "sync_master"}]       = chain + ".sync_master";
            t[{group, "keylock"}]           = chain + ".keylock";
            t[{group, "key"}]               = chain + ".key";

            // Hot cues 1..8
            for (int i = 1; i <= 8; ++i)
            {
                const std::string is = std::to_string (i);
                t[{group, "hotcue_" + is + "_activate"}] = chain + ".hotcue." + is + ".activate";
                t[{group, "hotcue_" + is + "_clear"}]    = chain + ".hotcue." + is + ".clear";
            }
        }

        return t;
    }();
    return table;
}

const std::unordered_set<std::string>& unsupportedKeys()
{
    static const std::unordered_set<std::string> keys = {
        "scratch_position",
        "scratch_enable",
        "scratch2",
        "scratch2_enable",
        "beatgrid_translate_curpos",
        "beats_translate_match_alignment",
        "rate_set_default",
        "AutoDJ",
        "sampler",
    };
    return keys;
}

} // namespace

ControlObjectBridge::ControlObjectBridge() = default;

bool ControlObjectBridge::isUnsupportedKey (const std::string& key)
{
    return unsupportedKeys().count (key) > 0;
}

std::optional<std::string> ControlObjectBridge::wellKnownLookup (const std::string& group,
                                                                 const std::string& key)
{
    const auto& table = wellKnown();
    const auto it = table.find ({group, key});
    if (it == table.end()) return std::nullopt;
    return it->second;
}

BridgeResult ControlObjectBridge::resolve (const std::string& group, const std::string& key) const
{
    BridgeResult result;
    // 1. Per-pack alias override.
    if (! aliasTable_.empty())
    {
        const auto it = aliasTable_.find (group);
        if (it != aliasTable_.end())
        {
            result.target = it->second + "." + key;
            return result;
        }
    }
    // 2. WELL_KNOWN.
    if (auto target = wellKnownLookup (group, key))
    {
        result.target = std::move (*target);
        return result;
    }
    // 3. Unsupported feature.
    if (isUnsupportedKey (key))
    {
        result.fail_soft_reason = "Mixxx feature `" + key + "` is not supported on MAP2";
        return result;
    }
    // 4. Unknown binding.
    result.fail_soft_reason = "Unknown Mixxx ControlObject (" + group + ", " + key + ")";
    return result;
}

} // namespace map2::controller_host
