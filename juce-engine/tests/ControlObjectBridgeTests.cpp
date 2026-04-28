// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ControlObjectBridge tests.
// Worklist: T2459-H2

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/MappingEngine/ControlObjectBridge.h"

using map2::controller_host::ControlObjectBridge;

TEST_CASE ("ControlObjectBridge resolves WELL_KNOWN master volume", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    auto r = bridge.resolve ("[Master]", "volume");
    REQUIRE (r.resolved());
    REQUIRE (*r.target == "audio.master.volume");
}

TEST_CASE ("ControlObjectBridge resolves channel volume + EQ", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    REQUIRE (*bridge.resolve ("[Channel1]", "volume").target == "audio.chain.1.volume");
    REQUIRE (*bridge.resolve ("[Channel2]", "filterLow").target == "audio.chain.2.eq.low");
    REQUIRE (*bridge.resolve ("[Channel3]", "play").target == "audio.chain.3.play");
}

TEST_CASE ("ControlObjectBridge resolves all 8 hot cues across all 4 channels", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    for (int n = 1; n <= 4; ++n)
    {
        for (int i = 1; i <= 8; ++i)
        {
            const std::string g = "[Channel" + std::to_string (n) + "]";
            const std::string actKey = "hotcue_" + std::to_string (i) + "_activate";
            const std::string clrKey = "hotcue_" + std::to_string (i) + "_clear";
            const std::string actExpect = "audio.chain." + std::to_string (n)
                                        + ".hotcue." + std::to_string (i) + ".activate";
            const std::string clrExpect = "audio.chain." + std::to_string (n)
                                        + ".hotcue." + std::to_string (i) + ".clear";
            REQUIRE (*bridge.resolve (g, actKey).target == actExpect);
            REQUIRE (*bridge.resolve (g, clrKey).target == clrExpect);
        }
    }
}

TEST_CASE ("ControlObjectBridge alias_table override wins over WELL_KNOWN", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    bridge.setAliasTable ({ {"[Channel1]", "audio.chain.7"} });
    auto r = bridge.resolve ("[Channel1]", "volume");
    REQUIRE (r.resolved());
    REQUIRE (*r.target == "audio.chain.7.volume");
}

TEST_CASE ("ControlObjectBridge fail-soft on unsupported keys", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    auto r = bridge.resolve ("[Channel1]", "scratch_position");
    REQUIRE_FALSE (r.resolved());
    REQUIRE (r.fail_soft_reason.find ("not supported") != std::string::npos);
}

TEST_CASE ("ControlObjectBridge fail-soft on unknown bindings", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    auto r = bridge.resolve ("[Channel1]", "no_such_key_at_all");
    REQUIRE_FALSE (r.resolved());
    REQUIRE (r.fail_soft_reason.find ("Unknown") != std::string::npos);
}

TEST_CASE ("ControlObjectBridge::wellKnownLookup bypasses the alias table", "[H2][bridge]")
{
    ControlObjectBridge bridge;
    bridge.setAliasTable ({ {"[Channel1]", "audio.chain.99"} });
    // Bypass returns the raw WELL_KNOWN value, not the alias.
    REQUIRE (*ControlObjectBridge::wellKnownLookup ("[Channel1]", "volume")
             == "audio.chain.1.volume");
    // resolve() still uses the alias.
    REQUIRE (*bridge.resolve ("[Channel1]", "volume").target == "audio.chain.99.volume");
}

TEST_CASE ("ControlObjectBridge::isUnsupportedKey covers known set", "[H2][bridge]")
{
    REQUIRE (ControlObjectBridge::isUnsupportedKey ("scratch_position"));
    REQUIRE (ControlObjectBridge::isUnsupportedKey ("AutoDJ"));
    REQUIRE_FALSE (ControlObjectBridge::isUnsupportedKey ("volume"));
    REQUIRE_FALSE (ControlObjectBridge::isUnsupportedKey ("nonexistent_thing"));
}
