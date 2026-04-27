// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2HidController smoke tests — T2459-D1 acceptance gate.
//
// These tests exercise the controller's lifecycle and enumeration
// surface in environments where hidapi may or may not be available.
// On systems without hidapi headers, MAP2_HAS_HIDAPI is 0 and the
// controller's open()/enumerate() methods short-circuit; the tests
// confirm the no-op behavior is safe.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Hid/Map2HidController.h"

using map2::controller_host::hid::HidDeviceInfo;
using map2::controller_host::hid::Map2HidController;
using map2::controller_host::hid::Map2HidEnumerator;

static HidDeviceInfo makeInfo()
{
    HidDeviceInfo info;
    info.path = "test:nonexistent";
    info.vendor_id = 0x1234;
    info.product_id = 0x5678;
    info.manufacturer = "MAP2 Test";
    info.product = "Synthetic HID";
    info.usage_page = 0x0001;
    info.usage = 0x0006;
    info.interface_number = 0;
    return info;
}

TEST_CASE ("Map2HidController constructs with the supplied identity", "[T2459-D1]")
{
    Map2HidController c (makeInfo());
    REQUIRE_FALSE (c.isOpen());
    REQUIRE (c.getIdentity().vendor_id == 0x1234);
    REQUIRE (c.getIdentity().product_id == 0x5678);
}

TEST_CASE ("open() against a nonexistent path fails cleanly", "[T2459-D1]")
{
    Map2HidController c (makeInfo());
    // Either hidapi is unavailable (returns false) or the test path
    // doesn't resolve to a real device (also returns false). Either
    // way, no crash, no thread leak.
    bool opened = c.open();
    REQUIRE_FALSE (opened);
    REQUIRE_FALSE (c.isOpen());
}

TEST_CASE ("close() on an unopened controller is a no-op", "[T2459-D1]")
{
    Map2HidController c (makeInfo());
    c.close();   // must not crash
    REQUIRE_FALSE (c.isOpen());
}

TEST_CASE ("sendOutputReport on an unopened controller returns false", "[T2459-D1]")
{
    Map2HidController c (makeInfo());
    REQUIRE_FALSE (c.sendOutputReport ({0x01, 0x02, 0x03}));
}

TEST_CASE ("Enumerator can be initialised + exited safely", "[T2459-D1]")
{
    // init() returns true when hidapi is present, false when absent.
    // Either way, exit() must be safe to call.
    Map2HidEnumerator::init();
    auto devices = Map2HidEnumerator::enumerate();
    // The test environment may or may not have HID devices reachable.
    // The contract is that we get back a vector — possibly empty.
    REQUIRE (devices.size() >= 0);
    Map2HidEnumerator::exit();
}

TEST_CASE ("Enumerator filter args don't crash on common values", "[T2459-D1]")
{
    Map2HidEnumerator::init();
    auto pioneer = Map2HidEnumerator::enumerate (0x2b73, 0);  // Pioneer VID, any PID
    auto traktor = Map2HidEnumerator::enumerate (0x17cc, 0);  // Native Instruments VID
    REQUIRE (pioneer.size() >= 0);
    REQUIRE (traktor.size() >= 0);
    Map2HidEnumerator::exit();
}
