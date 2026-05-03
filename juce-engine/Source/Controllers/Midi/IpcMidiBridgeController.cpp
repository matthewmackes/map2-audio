// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// IpcMidiBridgeController — implementation. See header for design notes.
// Worklist: T2459-H6 Slice 2.

#include "IpcMidiBridgeController.h"

namespace map2::controllers::midi
{

IpcMidiBridgeController::IpcMidiBridgeController (ControllerIdentity identity)
    : Map2Controller (std::move (identity))
    , bridge_ (std::make_unique<map2::midi_bridge::IpcMidiBridge>())
{
}

IpcMidiBridgeController::~IpcMidiBridgeController()
{
    close();
}

bool IpcMidiBridgeController::open()
{
    if (isOpen())
    {
        return true;
    }
    if (bridge_ == nullptr)
    {
        return false;
    }
    const bool ok = bridge_->openConsumer();
    if (ok)
    {
        setOpen (true);
    }
    return ok;
}

void IpcMidiBridgeController::close()
{
    if (! isOpen())
    {
        return;
    }
    // IpcMidiBridge has no explicit close — the rings unmap on destruction.
    // Callers that reopen after close() get a fresh bridge.
    bridge_ = std::make_unique<map2::midi_bridge::IpcMidiBridge>();
    setOpen (false);
}

void IpcMidiBridgeController::poll()
{
    if (! isOpen() || bridge_ == nullptr)
    {
        return;
    }

    // Drain up to 64 events per poll() to bound the worst-case time
    // we hold the audio thread (or whatever thread polls us).
    constexpr std::size_t kMaxEventsPerPoll = 64;

    const auto& identity = getIdentity();

    bridge_->pollRt (kMaxEventsPerPoll,
        [this, &identity] (std::uint64_t tsNanos,
                           const std::uint8_t* bytes,
                           std::size_t length)
        {
            const ControllerEvent ev = translateRingEvent (tsNanos, bytes, length, identity);
            dispatch (ev);
        });
}

bool IpcMidiBridgeController::send (const ControllerOutbound& outbound)
{
    // Outbound MIDI in the H6 architecture rides the controller-host's
    // UDS control plane (engine -> host -> libremidi); the engine side
    // does not own an outbound surface here yet. Returning true keeps
    // the legacy callers' logic flowing — the actual outbound write
    // happens via the IPC commands the engine emits separately (engine
    // command queue, drainShortMidi/drainSysExMidi on the host side).
    juce::ignoreUnused (outbound);
    return true;
}

std::uint64_t IpcMidiBridgeController::rtDroppedCount() const noexcept
{
    if (bridge_ == nullptr)
    {
        return 0;
    }
    return bridge_->rtDroppedCount();
}

ControllerEvent IpcMidiBridgeController::translateRingEvent (
    std::uint64_t tsNanos,
    const std::uint8_t* bytes,
    std::size_t length,
    const ControllerIdentity& /*identity*/)
{
    ControllerEvent ev;
    ev.timestampNs = static_cast<juce::int64> (tsNanos);
    if (bytes != nullptr && length > 0)
    {
        ev.bytes.assign (bytes, bytes + length);
    }
    return ev;
}

} // namespace map2::controllers::midi
