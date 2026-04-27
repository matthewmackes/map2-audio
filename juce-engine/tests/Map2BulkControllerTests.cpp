// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2BulkController smoke tests — T2459-D3 acceptance gate.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Bulk/Map2BulkController.h"

using map2::controller_host::bulk::BulkDeviceInfo;
using map2::controller_host::bulk::Map2BulkController;
using map2::controller_host::bulk::Map2BulkEnumerator;

static BulkDeviceInfo makeInfo()
{
    BulkDeviceInfo info;
    info.vendor_id = 0x1234;
    info.product_id = 0x5678;
    info.in_endpoint = 0x81;
    info.out_endpoint = 0x01;
    info.interface_number = 0;
    info.description = "test bulk device";
    return info;
}

TEST_CASE ("Map2BulkController constructs with the supplied identity", "[T2459-D3]")
{
    Map2BulkController c (makeInfo());
    REQUIRE_FALSE (c.isOpen());
    REQUIRE (c.getIdentity().vendor_id == 0x1234);
    REQUIRE (c.getIdentity().product_id == 0x5678);
    REQUIRE (c.getIdentity().in_endpoint == 0x81);
}

TEST_CASE ("open() against a nonexistent device fails cleanly", "[T2459-D3]")
{
    Map2BulkController c (makeInfo());
    bool opened = c.open();
    REQUIRE_FALSE (opened);
    REQUIRE_FALSE (c.isOpen());
}

TEST_CASE ("close() on an unopened controller is a no-op", "[T2459-D3]")
{
    Map2BulkController c (makeInfo());
    c.close();
    REQUIRE_FALSE (c.isOpen());
}

TEST_CASE ("sendBulkOut on an unopened controller returns false", "[T2459-D3]")
{
    Map2BulkController c (makeInfo());
    REQUIRE_FALSE (c.sendBulkOut ({0x01, 0x02, 0x03}));
}

TEST_CASE ("Bulk enumerator init/exit are safe", "[T2459-D3]")
{
    Map2BulkEnumerator::init();
    auto devices = Map2BulkEnumerator::enumerate();
    REQUIRE (devices.size() >= 0);
    Map2BulkEnumerator::exit();
}

TEST_CASE ("Bulk enumerator filter args don't crash", "[T2459-D3]")
{
    Map2BulkEnumerator::init();
    auto hercules = Map2BulkEnumerator::enumerate (0x06f8, 0);  // Hercules VID
    REQUIRE (hercules.size() >= 0);
    Map2BulkEnumerator::exit();
}
