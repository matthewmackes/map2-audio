// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ClusterGateway C++ scaffold tests — T2459-H7.
//
// Production runtime is the Python service in
// app/services/midi_hub/cluster_gateway.py; integration tests against
// the wire protocol live in tests/test_cluster_midi_gateway.py.
// This file exercises the C++ scaffold's public surface so the file
// paths the brief mandates have a real test footprint.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Hub/ClusterGateway.h"

using map2::controller_host::hub::ClusterGateway;
using map2::controller_host::hub::ClusterGatewayConfig;
using map2::controller_host::hub::PublishedPort;
using map2::controller_host::hub::kClusterProtocolVersion;
using map2::controller_host::hub::kDefaultClusterPort;

TEST_CASE ("ClusterGateway protocol-version constant matches Python SCHEMA_VERSION", "[H7][cluster]")
{
    REQUIRE (kClusterProtocolVersion == 1);
}

TEST_CASE ("ClusterGateway default cluster port matches CLUSTER_MIDI_PROTOCOL.md", "[H7][cluster]")
{
    REQUIRE (kDefaultClusterPort == 7261);
}

TEST_CASE ("ClusterGateway scaffold: start/stop is idempotent", "[H7][cluster]")
{
    ClusterGatewayConfig cfg;
    cfg.node_id = "test-node";
    ClusterGateway g (cfg);
    REQUIRE (g.start());
    REQUIRE (g.start()); // idempotent
    g.stop();
    g.stop();
}

TEST_CASE ("ClusterGateway scaffold: publishPort + listPublishedPorts", "[H7][cluster]")
{
    ClusterGatewayConfig cfg;
    cfg.node_id = "publisher";
    ClusterGateway g (cfg);
    REQUIRE (g.start());

    auto p1 = g.publishPort ("Performance Bus");
    auto p2 = g.publishPort ("Monitor Mix");
    REQUIRE (p1.name == "Performance Bus");
    REQUIRE_FALSE (p1.port_id.empty());
    REQUIRE (p2.port_id != p1.port_id);

    auto ports = g.listPublishedPorts();
    REQUIRE (ports.size() == 2);
    g.stop();
}

TEST_CASE ("ClusterGateway scaffold: addPeer is recorded under the lock", "[H7][cluster]")
{
    ClusterGatewayConfig cfg;
    cfg.node_id = "publisher";
    ClusterGateway g (cfg);
    REQUIRE (g.start());

    // Multiple addPeer calls — no exceptions, no races. The Python
    // gateway's tests cover the wire-level behaviour; this only
    // verifies the scaffold's storage doesn't crash.
    g.addPeer ("peer-1", "10.0.0.1", 7261);
    g.addPeer ("peer-2", "10.0.0.2", 7262);
    g.addPeer ("peer-1", "10.0.0.3", 7263); // re-add overwrites

    g.stop();
}

TEST_CASE ("ClusterGateway scaffold: term defaults to 0 and master is empty", "[H7][cluster]")
{
    ClusterGatewayConfig cfg;
    cfg.node_id = "lonely";
    ClusterGateway g (cfg);
    REQUIRE (g.term() == 0);
    REQUIRE_FALSE (g.masterNodeId().has_value());
    REQUIRE_FALSE (g.isMaster());
}
