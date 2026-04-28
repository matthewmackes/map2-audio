// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ClusterGateway scaffold. The production runtime lives in the Python
// gateway at app/services/midi_hub/cluster_gateway.py; this C++ class
// is the binary-compatible drop-in target. See header for status.
//
// Worklist: T2459-H7

#include "ClusterGateway.h"

#include <atomic>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace map2::controller_host::hub {

struct ClusterGateway::Impl
{
    std::mutex mutex;
    std::unordered_map<std::string, std::pair<std::string, std::uint16_t>> peers;
    std::unordered_map<std::string, PublishedPort> published;
    std::atomic<int>  term { 0 };
    std::atomic<bool> running { false };
    std::optional<std::string> master_node_id;
};

ClusterGateway::ClusterGateway (ClusterGatewayConfig config)
    : config_ (std::move (config)), impl_ (std::make_unique<Impl>()) {}

ClusterGateway::~ClusterGateway() = default;

bool ClusterGateway::start()
{
    // Production runtime is the Python service today. The C++ port
    // lands when the host's main loop grows TCP + UDP listeners.
    // For now, mark the gateway "running" so tests that mount this
    // class in-process don't trip the running guard.
    impl_->running.store (true, std::memory_order_release);
    return true;
}

void ClusterGateway::stop()
{
    impl_->running.store (false, std::memory_order_release);
}

void ClusterGateway::addPeer (const std::string& node_id,
                               const std::string& host,
                               std::uint16_t port)
{
    std::lock_guard<std::mutex> lock (impl_->mutex);
    impl_->peers[node_id] = { host, port };
}

PublishedPort ClusterGateway::publishPort (const std::string& name)
{
    std::lock_guard<std::mutex> lock (impl_->mutex);
    PublishedPort p;
    p.name = name;
    // Synthesise a port_id from name + size; the Python implementation
    // uses uuid4 hex but the C++ scaffold doesn't need cryptographic
    // strength here — tests inject their own ids when relevant.
    p.port_id = name + "-" + std::to_string (impl_->published.size());
    p.is_virtual = true;
    impl_->published[p.port_id] = p;
    return p;
}

std::vector<PublishedPort> ClusterGateway::listPublishedPorts() const
{
    std::lock_guard<std::mutex> lock (impl_->mutex);
    std::vector<PublishedPort> out;
    out.reserve (impl_->published.size());
    for (const auto& kv : impl_->published) out.push_back (kv.second);
    return out;
}

bool ClusterGateway::isMaster() const noexcept
{
    return impl_->master_node_id.has_value()
        && *impl_->master_node_id == config_.node_id;
}

std::optional<std::string> ClusterGateway::masterNodeId() const noexcept
{
    return impl_->master_node_id;
}

int ClusterGateway::term() const noexcept
{
    return impl_->term.load (std::memory_order_acquire);
}

} // namespace map2::controller_host::hub
