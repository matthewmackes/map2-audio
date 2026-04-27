// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2ControllerTests — smoke tests for the abstract base class and factory.
// Worklist: T2459-A2 acceptance gate.

#include <catch2/catch_test_macros.hpp>

#include "Controllers/Map2Controller.h"
#include "Controllers/Map2ControllerFactory.h"

#include <atomic>

using map2::controllers::ControllerEvent;
using map2::controllers::ControllerIdentity;
using map2::controllers::ControllerOutbound;
using map2::controllers::FastPathBinding;
using map2::controllers::Map2Controller;
using map2::controllers::Map2ControllerFactory;

namespace
{

class FakeController : public Map2Controller
{
public:
    explicit FakeController (ControllerIdentity identity)
        : Map2Controller (std::move (identity))
    {}

    ~FakeController() override
    {
        FakeController::close();
    }

    bool open() override
    {
        if (isOpen())
            return true;
        setOpen (true);
        return true;
    }

    void close() override
    {
        if (! isOpen())
            return;
        setOpen (false);
    }

    bool send (const ControllerOutbound& outbound) override
    {
        lastOutbound = outbound;
        sendCount.fetch_add (1, std::memory_order_acq_rel);
        return true;
    }

    void inject (const ControllerEvent& event)
    {
        dispatch (event);
    }

    ControllerOutbound lastOutbound;
    std::atomic<int> sendCount { 0 };
};

ControllerIdentity makeIdentity (const juce::String& protocol = "midi")
{
    ControllerIdentity id;
    id.hardwareId = "test:0000:0000";
    id.displayName = "Fake Controller";
    id.manufacturer = "MAP2";
    id.model = "Fake";
    id.protocol = protocol;
    return id;
}

ControllerEvent makeMidiCC (juce::uint8 channel, juce::uint8 cc, juce::uint8 value)
{
    ControllerEvent ev;
    ev.timestampNs = 1234567890;
    ev.bytes = { static_cast<juce::uint8> (0xB0 | (channel & 0x0F)), cc, value };
    return ev;
}

} // anonymous namespace

TEST_CASE ("Map2Controller starts closed and can be opened/closed", "[T2459-A2]")
{
    FakeController c (makeIdentity());
    REQUIRE_FALSE (c.isOpen());

    REQUIRE (c.open());
    REQUIRE (c.isOpen());

    c.close();
    REQUIRE_FALSE (c.isOpen());
}

TEST_CASE ("State callback fires on open and close transitions", "[T2459-A2]")
{
    FakeController c (makeIdentity());

    int openCount = 0;
    int closeCount = 0;
    c.setStateCallback ([&] (bool isOpen) {
        if (isOpen) ++openCount;
        else        ++closeCount;
    });

    c.open();
    c.open();   // idempotent — should not double-fire
    c.close();
    c.close();  // idempotent — should not double-fire

    REQUIRE (openCount == 1);
    REQUIRE (closeCount == 1);
}

TEST_CASE ("Events dispatch to the registered callback when no fast-path matches", "[T2459-A2]")
{
    FakeController c (makeIdentity());

    int eventCount = 0;
    ControllerEvent received {};
    c.setEventCallback ([&] (const ControllerEvent& ev) {
        ++eventCount;
        received = ev;
    });

    c.open();
    const auto event = makeMidiCC (0, 64, 100);
    c.inject (event);

    REQUIRE (eventCount == 1);
    REQUIRE (received.bytes == event.bytes);
}

TEST_CASE ("Fast-path bindings consume matching events before the JS callback", "[T2459-A2]")
{
    FakeController c (makeIdentity());

    int eventCount = 0;
    c.setEventCallback ([&] (const ControllerEvent&) { ++eventCount; });

    FastPathBinding fp;
    fp.statusByte = 0xB0;       // CC channel 1
    fp.dataByte1 = 64;          // CC 64
    fp.engineTarget = "audio.chain.1.bypass";
    fp.action = "toggle";
    fp.matchExact = true;
    c.addFastPathBinding (fp);

    c.open();
    c.inject (makeMidiCC (0, 64, 127));   // matches fast-path; should NOT reach JS
    c.inject (makeMidiCC (0, 65, 127));   // does not match; should reach JS

    REQUIRE (eventCount == 1);
}

TEST_CASE ("clearFastPathBindings removes all bindings", "[T2459-A2]")
{
    FakeController c (makeIdentity());

    int eventCount = 0;
    c.setEventCallback ([&] (const ControllerEvent&) { ++eventCount; });

    FastPathBinding fp;
    fp.statusByte = 0xB0;
    fp.dataByte1 = 64;
    fp.engineTarget = "audio.chain.1.bypass";
    fp.action = "toggle";
    fp.matchExact = true;
    c.addFastPathBinding (fp);
    c.clearFastPathBindings();

    c.open();
    c.inject (makeMidiCC (0, 64, 127));   // no fast-path binding any more

    REQUIRE (eventCount == 1);
}

TEST_CASE ("send() forwards outbound bytes to the protocol", "[T2459-A2]")
{
    FakeController c (makeIdentity());
    c.open();

    ControllerOutbound out;
    out.bytes = { 0x90, 60, 100 };
    REQUIRE (c.send (out));
    REQUIRE (c.sendCount.load() == 1);
    REQUIRE (c.lastOutbound.bytes == out.bytes);
}

TEST_CASE ("Factory returns nullptr for unsupported protocols (HID, bulk, unknown)", "[T2459-A2]")
{
    REQUIRE (Map2ControllerFactory::create (makeIdentity ("hid")) == nullptr);
    REQUIRE (Map2ControllerFactory::create (makeIdentity ("bulk")) == nullptr);
    REQUIRE (Map2ControllerFactory::create (makeIdentity ("unknown")) == nullptr);
}

TEST_CASE ("Factory returns nullptr for MIDI until T2459-B1 lands", "[T2459-A2]")
{
    // The factory will return a Map2MidiController instance once T2459-B1
    // ships. Until then, MIDI returns nullptr by design — recorded here as
    // a regression guard so the test fails noisily when B1 lands and is
    // updated to expect a non-null result.
    REQUIRE (Map2ControllerFactory::create (makeIdentity ("midi")) == nullptr);
}
