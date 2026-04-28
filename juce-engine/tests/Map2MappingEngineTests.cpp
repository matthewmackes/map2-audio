// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MappingEngine tests — Mixxx-style descriptor load, dispatch, and
// midi.* binding round-trip.
// Worklist: T2459-H2

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/EventRing/ShmEventRing.h"
#include "ControllerHost/MappingEngine/Map2MappingEngine.h"
#include "ControllerHost/Midi/LibremidiAdapter.h"

#include <string>

using map2::controller_host::LibremidiAdapter;
using map2::controller_host::Map2MappingEngine;
using map2::controller_host::MappingDescriptorSpec;
using map2::controller_host::MappingControlSpec;
using map2::controller_host::MidiBackend;
using map2::controller_host::ShmEventRing;

namespace {

MappingDescriptorSpec makeSimpleDescriptor()
{
    MappingDescriptorSpec d;
    d.pack_id = "test-pack";
    d.model   = "test-model";
    d.kind    = "midi";
    // One JS function bound to a CC. The function reads its bytes
    // arg and forwards a setValue and a midi.sendShortMsg.
    d.scripts.push_back (
        R"(
        var TestPack = {};
        TestPack.onCC7 = function(bytes) {
            // bytes is a Uint8Array; cc=7, value=bytes[2]
            engine.setValue("[Channel1]", "volume", bytes[2] / 127.0);
            midi.sendShortMsg(0x90, 60, bytes[2]);
        };
        )"
    );
    MappingControlSpec ctl;
    ctl.status   = 0xB0;
    ctl.midino   = 0x07;
    ctl.channel  = 0x00;
    ctl.script   = "TestPack.onCC7";
    ctl.fast_path = false;
    ctl.description = "test cc7";
    d.controls.push_back (ctl);
    return d;
}

} // namespace

TEST_CASE ("Map2MappingEngine initialises and exposes engine + midi globals", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());

    auto exc = eng.js().evaluate (
        "if (typeof engine !== 'object') throw 'engine missing';"
        "if (typeof midi !== 'object') throw 'midi missing';"
        "if (typeof engine.setValue !== 'function') throw 'engine.setValue missing';"
        "if (typeof midi.sendShortMsg !== 'function') throw 'midi.sendShortMsg missing';"
        "if (typeof midi.sendSysexMsg !== 'function') throw 'midi.sendSysexMsg missing';");
    REQUIRE_FALSE (exc.has_value());
}

TEST_CASE ("Map2MappingEngine::loadDescriptor evaluates scripts", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    auto exc = eng.loadDescriptor ("ctrl-A", makeSimpleDescriptor());
    REQUIRE_FALSE (exc.has_value());

    // Script defined a global TestPack object; it should be visible.
    auto check = eng.js().evaluate (
        "if (typeof TestPack !== 'object') throw 'TestPack missing after load';"
        "if (typeof TestPack.onCC7 !== 'function') throw 'TestPack.onCC7 missing';");
    REQUIRE_FALSE (check.has_value());
}

TEST_CASE ("Map2MappingEngine::planDispatch matches a CC mapping", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-A", makeSimpleDescriptor()).has_value());

    auto plan = eng.planDispatch ("ctrl-A", 0xB0, 0x07, 0x00);
    REQUIRE (plan.matched);
    REQUIRE (plan.callback_name == "TestPack.onCC7");
    REQUIRE (plan.controller_key == "ctrl-A");
}

TEST_CASE ("Map2MappingEngine::planDispatch returns no-match on unknown bytes", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-A", makeSimpleDescriptor()).has_value());

    auto plan = eng.planDispatch ("ctrl-A", 0xB0, 0x42, 0x00); // wrong cc#
    REQUIRE_FALSE (plan.matched);
    REQUIRE (plan.callback_name.empty());
}

TEST_CASE ("Map2MappingEngine::dispatch invokes the callback and queues outbound MIDI", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-A", makeSimpleDescriptor()).has_value());

    // Simulate a CC 7 with value 100.
    std::vector<std::uint8_t> bytes = { 0xB0, 0x07, 100 };
    auto exc = eng.dispatch ("ctrl-A", "TestPack.onCC7", bytes);
    REQUIRE_FALSE (exc.has_value());

    // engine.setValue should have queued an EngineCommand.
    auto commands = eng.js().drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].target == "[Channel1]");      // raw target — bridge applied at the IPC writer
    REQUIRE (commands[0].action == "volume");
    REQUIRE (commands[0].value.has_value());

    // midi.sendShortMsg should have queued an OutboundShortMidi.
    auto outbound = eng.drainShortMidi();
    REQUIRE (outbound.size() == 1);
    REQUIRE (outbound[0].controller_key == "ctrl-A");
    REQUIRE (outbound[0].status == 0x90);
    REQUIRE (outbound[0].data1  == 60);
    REQUIRE (outbound[0].data2  == 100);
}

TEST_CASE ("Map2MappingEngine midi.sendSysexMsg accepts an array and queues bytes", "[H2][engine]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    eng.js().registerController ("ctrl-A");
    eng.js().setActiveControllerKey ("ctrl-A");

    auto exc = eng.js().evaluate (
        "midi.sendSysexMsg([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);");
    REQUIRE_FALSE (exc.has_value());

    auto sysex = eng.drainSysExMidi();
    REQUIRE (sysex.size() == 1);
    REQUIRE (sysex[0].controller_key == "ctrl-A");
    REQUIRE (sysex[0].bytes.size() == 6);
    REQUIRE (sysex[0].bytes.front() == 0xF0);
    REQUIRE (sysex[0].bytes.back()  == 0xF7);
}

TEST_CASE ("Slice 5: shm-ring-pushed CC event drives planDispatch + dispatch + EngineCommand emission", "[H3][slice5][live-pump]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-live", makeSimpleDescriptor()).has_value());

    // Construct an adapter (no libremidi backend bound — we use the
    // pushMessage test seam to inject bytes as if they came from a
    // hardware port) and wire its rings.
    LibremidiAdapter adapter (MidiBackend::JackMidi);
    ShmEventRing rtRing;
    const std::string shmName = std::string ("/map2-test-slice5-rt-") + std::to_string (::getpid());
    REQUIRE (rtRing.open (shmName, 64, ShmEventRing::Mode::CreateOwned));
    adapter.setEventRings (&rtRing, nullptr);

    // Inject a CC #7 value=100 on channel 0; classified as RT bucket.
    const std::uint8_t bytes[3] = { 0xB0, 0x07, 100 };
    adapter.pushMessage (bytes, 3);

    // Drain one event from the ring and dispatch it through the engine,
    // matching the production main-loop flow at the level the slice
    // wires up. The test is intentionally narrow to the contract:
    // ring → planDispatch → dispatch → EngineCommand queued.
    std::uint64_t ts = 0;
    std::uint8_t buf[map2::controller_host::kMaxPayloadBytes];
    const std::size_t n = rtRing.pop (&ts, buf, sizeof (buf));
    REQUIRE (n == 3);
    REQUIRE (buf[0] == 0xB0);

    const std::uint8_t status   = buf[0];
    const std::uint8_t data1    = buf[1];
    const std::uint8_t channel  = static_cast<std::uint8_t> (status & 0x0Fu);
    const std::uint8_t statusHi = static_cast<std::uint8_t> (status & 0xF0u);

    auto plan = eng.planDispatch ("ctrl-live", statusHi, data1, channel);
    REQUIRE (plan.matched);
    REQUIRE (plan.callback_name == "TestPack.onCC7");

    std::vector<std::uint8_t> payload (buf, buf + n);
    REQUIRE_FALSE (eng.dispatch ("ctrl-live", plan.callback_name, payload).has_value());

    auto commands = eng.js().drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].controller_key == "ctrl-live");
    REQUIRE (commands[0].target == "[Channel1]");
    REQUIRE (commands[0].action == "volume");
    REQUIRE (commands[0].value.has_value());

    auto outbound = eng.drainShortMidi();
    REQUIRE (outbound.size() == 1);
    REQUIRE (outbound[0].controller_key == "ctrl-live");
    REQUIRE (outbound[0].status == 0x90);
}

TEST_CASE ("Map2MappingEngine reload swaps the descriptor's script body", "[H2][engine][reload]")
{
    Map2MappingEngine eng;
    REQUIRE (eng.initialise());

    // Load v1 — function returns 1.
    MappingDescriptorSpec v1;
    v1.pack_id = "p"; v1.model = "m"; v1.kind = "midi";
    v1.scripts.push_back ("var ReloadPack = { which: function() { return 1; } };");
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-R", v1).has_value());

    auto check_v1 = eng.js().evaluate (
        "if (ReloadPack.which() !== 1) throw 'expected v1';");
    REQUIRE_FALSE (check_v1.has_value());

    // Reload — function should return 2 after.
    MappingDescriptorSpec v2;
    v2.pack_id = "p"; v2.model = "m"; v2.kind = "midi";
    v2.scripts.push_back ("var ReloadPack = { which: function() { return 2; } };");
    REQUIRE_FALSE (eng.loadDescriptor ("ctrl-R", v2).has_value());

    auto check_v2 = eng.js().evaluate (
        "if (ReloadPack.which() !== 2) throw 'expected v2';");
    REQUIRE_FALSE (check_v2.has_value());
}
