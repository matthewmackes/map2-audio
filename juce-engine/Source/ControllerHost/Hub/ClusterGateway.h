// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ClusterGateway — host-to-host MIDI cluster protocol (T2459-H7).
//
// Architecture: docs/midi/CLUSTER_MIDI_PROTOCOL.md
//
// ─── Implementation status ────────────────────────────────────────────
// The Python implementation in app/services/midi_hub/cluster_gateway.py
// is the production runtime today. This C++ scaffold defines the
// minimum public surface so the file paths the brief mandates exist;
// the C++ implementation will replace the Python service when the
// host's main loop grows TCP + UDP listeners alongside the existing
// UDS control plane (queued for a future T2459-H sub-task).
//
// The Python module is **wire-compatible** with whatever this C++
// surface ultimately implements — both speak the same envelope from
// CLUSTER_MIDI_PROTOCOL.md §3, the same message types from §4, and
// the same election state machine from §5. Tests against the Python
// implementation prove the protocol; the C++ port can be slotted in
// later as a drop-in replacement.

#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace map2::controller_host::hub {

constexpr std::uint8_t kClusterProtocolVersion = 1;
constexpr std::uint16_t kDefaultClusterPort    = 7261;

struct ClusterGatewayConfig
{
    std::string node_id;
    std::string bind_host  = "0.0.0.0";
    std::uint16_t cluster_port = kDefaultClusterPort;
    int master_priority   = 0;
    double tick_interval_s = 1.0;
    double vote_collect_s  = 0.2;
};

struct PublishedPort
{
    std::string name;
    std::string port_id;
    bool is_virtual = true;
};

struct RemoteSubscriber
{
    std::string node_id;
    std::string port_id;
    std::string udp_host;
    std::uint16_t udp_port = 0;
};

class ClusterGateway
{
public:
    explicit ClusterGateway (ClusterGatewayConfig config);
    ~ClusterGateway();

    ClusterGateway (const ClusterGateway&)            = delete;
    ClusterGateway& operator= (const ClusterGateway&) = delete;

    // Lifecycle (NOT YET IMPLEMENTED — see header status note).
    bool start();
    void stop();

    // Peer management. Production: populated by mDNS discovery.
    void addPeer (const std::string& node_id, const std::string& host, std::uint16_t port);

    // Local published ports.
    PublishedPort publishPort (const std::string& name);
    std::vector<PublishedPort> listPublishedPorts() const;

    // Election state.
    bool isMaster() const noexcept;
    std::optional<std::string> masterNodeId() const noexcept;
    int term() const noexcept;

    const ClusterGatewayConfig& config() const noexcept { return config_; }

private:
    ClusterGatewayConfig config_;
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace map2::controller_host::hub
