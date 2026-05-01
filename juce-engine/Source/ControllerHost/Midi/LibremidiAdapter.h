// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// LibremidiAdapter — wraps libremidi v5 observer + midi_in for the host.
// Worklist: T2459-H1
//
// libremidi is BSL-1.0 licensed; vendored via CMake FetchContent (locked
// decision Q1 = A) under juce-engine/build/_deps/libremidi-src.
//
// Responsibilities:
//   - Bind to a specific libremidi backend (chosen by Map2MidiBackend).
//   - Enumerate input/output ports through libremidi::observer.
//   - Open input ports and route their callbacks to the two-ring producer.
//   - Open virtual ports the host publishes to upstream consumers.
//
// Producer model (locked decision Q3 = C):
//   The libremidi I/O callback runs on libremidi's reader thread. It calls
//   classifyMidiStatus() on the message's status byte and pushes directly
//   to the matching shm ring (RT or control). No mapping/scripting runs
//   on this thread — that's a hard contract.

#pragma once

#include "../EventRing/ShmEventRing.h"
#include "Map2MidiBackend.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace map2::controller_host {

class LibremidiAdapter
{
public:
    explicit LibremidiAdapter (MidiBackend backend);
    ~LibremidiAdapter();

    LibremidiAdapter (const LibremidiAdapter&)            = delete;
    LibremidiAdapter& operator= (const LibremidiAdapter&) = delete;

    // Open the underlying libremidi observer. Returns true on success.
    // Failure surfaces in errorMessage().
    bool initialise();

    // Wire the adapter to the two shm rings. The adapter pushes incoming
    // MIDI messages to whichever ring the status-byte classifier picks.
    // Both rings must outlive the adapter.
    void setEventRings (ShmEventRing* rtRing, ShmEventRing* controlRing) noexcept;

    // Enumerate currently-visible ports. Inputs first, then outputs.
    std::vector<PortDescriptor> listPorts() const;

    // Open a virtual input + output pair the host publishes. Useful for
    // tests + for the round-trip parity check (a UMP packet pushed to the
    // virtual output by tests must round-trip through the rings).
    bool openVirtualInput (const std::string& name);
    bool openVirtualOutput (const std::string& name);

    // T2459-H3 Slice 5/6 — open a hardware input port discovered via
    // listPorts(). The match is by port id first, then by display name
    // (libremidi's `port_name`). On success, incoming messages route
    // through onIncomingMessage() into the configured shm rings exactly
    // like a virtual input. Slice 6: each port carries an optional
    // `controllerIndex` (host-assigned, default 0 = unknown/legacy) that
    // the libremidi callback writes into the slot's controllerIndex field
    // so the consumer can dispatch through the matching descriptor. The
    // adapter keeps a per-port midi_in alive so concurrent inputs can
    // each tag their events with their own index.
    bool openInput (const std::string& port_id_or_name,
                    std::uint16_t controllerIndex = 0);

    // Push a raw MIDI message into the producer pipeline as if it had
    // arrived via libremidi. Used by tests and by virtual-output loopback.
    // Slice 6: optional controllerIndex tags the synthetic event identically
    // to a real port-callback push.
    void pushMessage (const std::uint8_t* bytes,
                      std::size_t length,
                      std::uint16_t controllerIndex = 0);

    // T2459-H5 Slice 13 — push a raw MIDI 2.0 UMP packet (4..16 bytes,
    // i.e. 1..4 32-bit words) into the producer pipeline. Routes via
    // classifyUmpMessageType() and tags the slot with kSlotFlagIsUmp so
    // the consumer can dispatch on the correct format.
    //
    // libremidi v5.1.0 (vendored via FetchContent) does not expose a
    // production UMP input/output surface that we have validated against
    // hardware on this platform; once a MIDI-2.0-capable device is on
    // the bench, the real `openUmpInput()` lives next to this seam.
    // Until then, this method is the integration entry point.
    void pushUmpMessage (const std::uint8_t* bytes, std::size_t length);

    // T2482-P1.2 Gap C (iter 72) — send raw MIDI 1.0 bytes out the
    // host's virtual output port (created via openVirtualOutput).
    // Returns true on success, false when no virtual output is open
    // or libremidi rejects the send (errorMessage() carries the
    // diagnostic). Called from drain_ring_and_dispatch's outbound
    // loop to land JS-emitted bytes back on the controller without
    // round-tripping through Python (which was the Gap C remainder).
    bool sendToVirtualOutput (const std::uint8_t* bytes, std::size_t length);

    // libremidi backend in use.
    MidiBackend backend() const noexcept { return backend_; }

    const std::string& errorMessage() const noexcept { return errorMessage_; }

private:
    static int toLibremidiApiInt (MidiBackend backend);

    void onIncomingMessage (const std::uint8_t* bytes,
                            std::size_t length,
                            std::uint64_t tsNanos,
                            std::uint16_t controllerIndex);

    struct Impl;
    MidiBackend                  backend_     = MidiBackend::None;
    std::unique_ptr<Impl>        impl_;

    ShmEventRing* rtRing_      = nullptr;
    ShmEventRing* controlRing_ = nullptr;

    std::string  errorMessage_;
    mutable std::mutex portsMutex_;
    std::vector<PortDescriptor> cachedPorts_;
};

} // namespace map2::controller_host
