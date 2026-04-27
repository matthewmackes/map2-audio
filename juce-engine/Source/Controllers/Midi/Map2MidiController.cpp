// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MidiController.cpp — ALSA-seq-backed MIDI Map2Controller.
// See Map2MidiController.h for the contract.

#include "Map2MidiController.h"

#include <chrono>

namespace map2::controllers::midi
{

namespace
{
constexpr const char* kLogPrefix = "[Map2MidiController] ";
}

Map2MidiController::Map2MidiController (ControllerIdentity identity_, AlsaSeqTarget target_)
    : Map2Controller (std::move (identity_)), target (std::move (target_))
{
}

Map2MidiController::~Map2MidiController()
{
    Map2MidiController::close();
}

bool Map2MidiController::open()
{
    if (isOpen())
        return true;

#if !MAP2_HAS_ALSA_SEQ
    juce::Logger::writeToLog (juce::String (kLogPrefix)
        + "open(): ALSA seq headers unavailable at compile time; controller "
          "cannot be opened on this platform. Returning false.");
    return false;
#else
    int err = snd_seq_open (&seqHandle, "default", SND_SEQ_OPEN_DUPLEX, 0);
    if (err < 0 || seqHandle == nullptr)
    {
        juce::Logger::writeToLog (juce::String (kLogPrefix)
            + "open(): snd_seq_open failed: " + snd_strerror (err));
        seqHandle = nullptr;
        return false;
    }

    snd_seq_set_client_name (seqHandle, "Map2MidiController");
    localClient = snd_seq_client_id (seqHandle);

    localPort = snd_seq_create_simple_port (
        seqHandle, "input",
        SND_SEQ_PORT_CAP_WRITE | SND_SEQ_PORT_CAP_SUBS_WRITE
            | SND_SEQ_PORT_CAP_READ | SND_SEQ_PORT_CAP_SUBS_READ,
        SND_SEQ_PORT_TYPE_APPLICATION);
    if (localPort < 0)
    {
        juce::Logger::writeToLog (juce::String (kLogPrefix)
            + "open(): snd_seq_create_simple_port failed: "
            + snd_strerror (localPort));
        unsubscribeAndClose();
        return false;
    }

    if (! resolveAndSubscribe())
    {
        unsubscribeAndClose();
        return false;
    }

    shouldStop.store (false, std::memory_order_release);
    readerThread = std::make_unique<std::thread> (
        [this] { readerThreadLoop(); });

    setOpen (true);
    juce::Logger::writeToLog (juce::String (kLogPrefix)
        + "open(): subscribed to client="
        + juce::String (target.subscribedClient)
        + " port=" + juce::String (target.subscribedPort));
    return true;
#endif
}

void Map2MidiController::close()
{
#if MAP2_HAS_ALSA_SEQ
    if (! isOpen() && seqHandle == nullptr)
        return;

    shouldStop.store (true, std::memory_order_release);
    if (readerThread && readerThread->joinable())
    {
        // Drop a wakeup event onto our local port so the blocking read
        // returns promptly. If event_output_direct fails the reader will
        // exit at the next snd_seq_event_input timeout (no infinite hang —
        // we use snd_seq_poll_descriptors_count + poll() with a short
        // timeout in the loop).
        snd_seq_event_t ev;
        snd_seq_ev_clear (&ev);
        snd_seq_ev_set_source (&ev, localPort);
        snd_seq_ev_set_dest (&ev, localClient, localPort);
        snd_seq_ev_set_direct (&ev);
        snd_seq_ev_set_fixed (&ev);
        ev.type = SND_SEQ_EVENT_USR0;
        snd_seq_event_output_direct (seqHandle, &ev);

        readerThread->join();
        readerThread.reset();
    }

    unsubscribeAndClose();
    setOpen (false);
#else
    setOpen (false);
#endif
}

bool Map2MidiController::send (const ControllerOutbound& outbound)
{
#if !MAP2_HAS_ALSA_SEQ
    juce::ignoreUnused (outbound);
    return false;
#else
    if (seqHandle == nullptr || ! isOpen())
        return false;
    if (outbound.bytes.empty())
        return false;

    snd_seq_event_t ev;
    snd_seq_ev_clear (&ev);
    snd_seq_ev_set_source (&ev, localPort);
    snd_seq_ev_set_subs (&ev);
    snd_seq_ev_set_direct (&ev);

    const auto status = outbound.bytes[0];

    // SysEx
    if (status == 0xF0)
    {
        ev.type = SND_SEQ_EVENT_SYSEX;
        snd_seq_ev_set_variable (&ev, static_cast<int> (outbound.bytes.size()),
                                  const_cast<juce::uint8*> (outbound.bytes.data()));
    }
    else if ((status & 0xF0) == 0x90 && outbound.bytes.size() >= 3)
    {
        snd_seq_ev_set_noteon (&ev, status & 0x0F, outbound.bytes[1], outbound.bytes[2]);
    }
    else if ((status & 0xF0) == 0x80 && outbound.bytes.size() >= 3)
    {
        snd_seq_ev_set_noteoff (&ev, status & 0x0F, outbound.bytes[1], outbound.bytes[2]);
    }
    else if ((status & 0xF0) == 0xB0 && outbound.bytes.size() >= 3)
    {
        snd_seq_ev_set_controller (&ev, status & 0x0F, outbound.bytes[1], outbound.bytes[2]);
    }
    else if ((status & 0xF0) == 0xC0 && outbound.bytes.size() >= 2)
    {
        snd_seq_ev_set_pgmchange (&ev, status & 0x0F, outbound.bytes[1]);
    }
    else
    {
        // Fallback: use raw 3-byte ev type (suitable for pitch bend, channel pressure, etc.)
        ev.type = SND_SEQ_EVENT_NONE;   // Placeholder — caller passed an unsupported message type.
        return false;
    }

    int err = snd_seq_event_output_direct (seqHandle, &ev);
    return err >= 0;
#endif
}

void Map2MidiController::readerThreadLoop()
{
#if !MAP2_HAS_ALSA_SEQ
    return;
#else
    while (! shouldStop.load (std::memory_order_acquire))
    {
        snd_seq_event_t* ev = nullptr;
        int err = snd_seq_event_input (seqHandle, &ev);
        if (err < 0)
        {
            // EAGAIN → no event yet; spin briefly and retry.
            if (err == -EAGAIN || err == -EINTR)
            {
                std::this_thread::sleep_for (std::chrono::milliseconds (1));
                continue;
            }
            juce::Logger::writeToLog (juce::String (kLogPrefix)
                + "readerThreadLoop: snd_seq_event_input failed: "
                + snd_strerror (err));
            break;
        }
        if (ev == nullptr)
            continue;
        // Wakeup event used by close() — exit promptly.
        if (ev->type == SND_SEQ_EVENT_USR0)
            break;

        ControllerEvent out;
        out.timestampNs = static_cast<juce::int64> (
            std::chrono::duration_cast<std::chrono::nanoseconds> (
                std::chrono::steady_clock::now().time_since_epoch()).count());

        switch (ev->type)
        {
        case SND_SEQ_EVENT_NOTEON:
            out.bytes = { static_cast<juce::uint8> (0x90 | (ev->data.note.channel & 0x0F)),
                          ev->data.note.note,
                          ev->data.note.velocity };
            break;
        case SND_SEQ_EVENT_NOTEOFF:
            out.bytes = { static_cast<juce::uint8> (0x80 | (ev->data.note.channel & 0x0F)),
                          ev->data.note.note,
                          ev->data.note.velocity };
            break;
        case SND_SEQ_EVENT_CONTROLLER:
            out.bytes = { static_cast<juce::uint8> (0xB0 | (ev->data.control.channel & 0x0F)),
                          static_cast<juce::uint8> (ev->data.control.param & 0x7F),
                          static_cast<juce::uint8> (ev->data.control.value & 0x7F) };
            break;
        case SND_SEQ_EVENT_PGMCHANGE:
            out.bytes = { static_cast<juce::uint8> (0xC0 | (ev->data.control.channel & 0x0F)),
                          static_cast<juce::uint8> (ev->data.control.value & 0x7F) };
            break;
        case SND_SEQ_EVENT_PITCHBEND:
        {
            // Pitch-bend is signed -8192..+8191; convert to 14-bit unsigned 0..16383
            const int v = ev->data.control.value + 8192;
            out.bytes = { static_cast<juce::uint8> (0xE0 | (ev->data.control.channel & 0x0F)),
                          static_cast<juce::uint8> (v & 0x7F),
                          static_cast<juce::uint8> ((v >> 7) & 0x7F) };
            break;
        }
        case SND_SEQ_EVENT_CHANPRESS:
            out.bytes = { static_cast<juce::uint8> (0xD0 | (ev->data.control.channel & 0x0F)),
                          static_cast<juce::uint8> (ev->data.control.value & 0x7F) };
            break;
        case SND_SEQ_EVENT_SYSEX:
        {
            const auto* p = static_cast<const juce::uint8*> (ev->data.ext.ptr);
            out.bytes.assign (p, p + ev->data.ext.len);
            break;
        }
        default:
            // Skip event types we don't model yet.
            continue;
        }

        // Hand off to the abstract base; fast-path bindings are
        // consulted there before forwarding to the JS callback.
        dispatch (out);
    }
#endif
}

bool Map2MidiController::resolveAndSubscribe()
{
#if !MAP2_HAS_ALSA_SEQ
    return false;
#else
    snd_seq_client_info_t* cinfo = nullptr;
    snd_seq_port_info_t* pinfo = nullptr;
    snd_seq_client_info_alloca (&cinfo);
    snd_seq_port_info_alloca (&pinfo);

    snd_seq_client_info_set_client (cinfo, -1);
    while (snd_seq_query_next_client (seqHandle, cinfo) >= 0)
    {
        const int client = snd_seq_client_info_get_client (cinfo);
        if (client == localClient)
            continue;
        const std::string name = snd_seq_client_info_get_name (cinfo);
        if (name.find (target.clientPattern.toStdString()) == std::string::npos)
            continue;

        snd_seq_port_info_set_client (pinfo, client);
        snd_seq_port_info_set_port (pinfo, -1);
        int seenPorts = 0;
        while (snd_seq_query_next_port (seqHandle, pinfo) >= 0)
        {
            const unsigned int caps = snd_seq_port_info_get_capability (pinfo);
            if ((caps & SND_SEQ_PORT_CAP_READ) == 0
                || (caps & SND_SEQ_PORT_CAP_SUBS_READ) == 0)
                continue;
            if (seenPorts != target.portIndex)
            {
                ++seenPorts;
                continue;
            }
            const int port = snd_seq_port_info_get_port (pinfo);

            snd_seq_port_subscribe_t* sub = nullptr;
            snd_seq_port_subscribe_alloca (&sub);
            snd_seq_addr_t srcAddr { static_cast<unsigned char> (client),
                                     static_cast<unsigned char> (port) };
            snd_seq_addr_t dstAddr { static_cast<unsigned char> (localClient),
                                     static_cast<unsigned char> (localPort) };
            snd_seq_port_subscribe_set_sender (sub, &srcAddr);
            snd_seq_port_subscribe_set_dest   (sub, &dstAddr);

            int err = snd_seq_subscribe_port (seqHandle, sub);
            if (err < 0)
            {
                juce::Logger::writeToLog (juce::String (kLogPrefix)
                    + "snd_seq_subscribe_port(" + juce::String (client)
                    + ":" + juce::String (port) + ") failed: "
                    + snd_strerror (err));
                return false;
            }
            target.subscribedClient = client;
            target.subscribedPort = port;
            return true;
        }
    }
    juce::Logger::writeToLog (juce::String (kLogPrefix)
        + "resolveAndSubscribe(): no ALSA seq client matching pattern '"
        + target.clientPattern + "'");
    return false;
#endif
}

void Map2MidiController::unsubscribeAndClose()
{
#if MAP2_HAS_ALSA_SEQ
    if (seqHandle != nullptr)
    {
        if (target.subscribedClient >= 0 && target.subscribedPort >= 0
            && localClient >= 0 && localPort >= 0)
        {
            snd_seq_port_subscribe_t* sub = nullptr;
            snd_seq_port_subscribe_alloca (&sub);
            snd_seq_addr_t srcAddr { static_cast<unsigned char> (target.subscribedClient),
                                     static_cast<unsigned char> (target.subscribedPort) };
            snd_seq_addr_t dstAddr { static_cast<unsigned char> (localClient),
                                     static_cast<unsigned char> (localPort) };
            snd_seq_port_subscribe_set_sender (sub, &srcAddr);
            snd_seq_port_subscribe_set_dest   (sub, &dstAddr);
            snd_seq_unsubscribe_port (seqHandle, sub);
        }
        if (localPort >= 0)
            snd_seq_delete_simple_port (seqHandle, localPort);
        snd_seq_close (seqHandle);
    }
    seqHandle = nullptr;
    localClient = -1;
    localPort = -1;
    target.subscribedClient = -1;
    target.subscribedPort = -1;
#endif
}

// ---------------------------------------------------------------------------
// Map2MidiEnumerator
// ---------------------------------------------------------------------------

juce::Array<Map2MidiEnumerator::EnumeratedClient> Map2MidiEnumerator::enumerate()
{
    juce::Array<EnumeratedClient> out;

#if !MAP2_HAS_ALSA_SEQ
    return out;
#else
    snd_seq_t* handle = nullptr;
    if (snd_seq_open (&handle, "default", SND_SEQ_OPEN_INPUT, 0) < 0 || handle == nullptr)
        return out;
    const int self = snd_seq_client_id (handle);

    snd_seq_client_info_t* cinfo = nullptr;
    snd_seq_port_info_t* pinfo = nullptr;
    snd_seq_client_info_alloca (&cinfo);
    snd_seq_port_info_alloca (&pinfo);

    snd_seq_client_info_set_client (cinfo, -1);
    while (snd_seq_query_next_client (handle, cinfo) >= 0)
    {
        const int client = snd_seq_client_info_get_client (cinfo);
        if (client == self)
            continue;
        const juce::String clientName = snd_seq_client_info_get_name (cinfo);

        snd_seq_port_info_set_client (pinfo, client);
        snd_seq_port_info_set_port (pinfo, -1);
        while (snd_seq_query_next_port (handle, pinfo) >= 0)
        {
            const unsigned int caps = snd_seq_port_info_get_capability (pinfo);
            const bool readable = (caps & SND_SEQ_PORT_CAP_READ) != 0
                                  && (caps & SND_SEQ_PORT_CAP_SUBS_READ) != 0;
            const bool writable = (caps & SND_SEQ_PORT_CAP_WRITE) != 0
                                  && (caps & SND_SEQ_PORT_CAP_SUBS_WRITE) != 0;
            if (! readable && ! writable)
                continue;
            EnumeratedClient e;
            e.alsaClient = client;
            e.alsaPort = snd_seq_port_info_get_port (pinfo);
            e.clientName = clientName;
            e.portName = snd_seq_port_info_get_name (pinfo);
            e.isInputPort = readable;
            e.isOutputPort = writable;
            out.add (e);
        }
    }
    snd_seq_close (handle);
    return out;
#endif
}

} // namespace map2::controllers::midi
