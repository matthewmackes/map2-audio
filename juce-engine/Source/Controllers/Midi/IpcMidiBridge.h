// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// IpcMidiBridge — JUCE-engine-side consumer of the host's shm event rings.
// Worklist: T2459-H1
//
// This is the minimum viable consumer that the audio engine drains at the
// start of every block. The legacy Map2MidiController.cpp (raw snd_seq_*)
// stays live in parallel until T2459-H6 retires it; the bridge ships
// alongside as a no-op-by-default consumer until the host is producing
// real events on the bench.
//
// RT contract:
//   - poll() is called from the audio thread. No allocations, no syscalls,
//     no logging.
//   - The drain loop reads up to `maxEvents` from the RT ring and forwards
//     each event to the supplied callback. The control ring is drained on
//     a separate non-RT thread.

#pragma once

#include "../../ControllerHost/EventRing/ShmEventRing.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace map2::midi_bridge {

using map2::controller_host::ShmEventRing;
using map2::controller_host::kMaxPayloadBytes;

// Callback fired for every event drained from the RT ring. tsNanos is the
// host-side monotonic clock at producer push time, useful for sample-
// accurate alignment math against the audio callback's own clock.
using RtEventCallback = std::function<void (
    std::uint64_t tsNanos,
    const std::uint8_t* bytes,
    std::size_t length)>;

class IpcMidiBridge
{
public:
    IpcMidiBridge();
    ~IpcMidiBridge();

    IpcMidiBridge (const IpcMidiBridge&)            = delete;
    IpcMidiBridge& operator= (const IpcMidiBridge&) = delete;

    // Open both rings as a consumer. Returns true on success; on failure,
    // errorMessage() carries the reason. The shm names default to the
    // canonical paths declared on ShmEventRing.
    bool openConsumer();

    // RT-safe drain. Reads up to `maxEvents` from the RT ring, fires the
    // callback for each. Returns the number of events drained. Calling
    // before openConsumer() returns 0 and is harmless.
    std::size_t pollRt (std::size_t maxEvents, const RtEventCallback& cb);

    // Non-RT drain for the control ring. Same semantics as pollRt() but
    // not bound to the audio callback's allocation rules.
    std::size_t pollControl (std::size_t maxEvents, const RtEventCallback& cb);

    // Number of events the host had to drop because the rings were full.
    std::uint64_t rtDroppedCount() const noexcept;
    std::uint64_t controlDroppedCount() const noexcept;

    bool isOpen() const noexcept;

    const std::string& errorMessage() const noexcept { return errorMessage_; }

private:
    std::unique_ptr<ShmEventRing> rtRing_;
    std::unique_ptr<ShmEventRing> controlRing_;
    std::string errorMessage_;
};

} // namespace map2::midi_bridge
