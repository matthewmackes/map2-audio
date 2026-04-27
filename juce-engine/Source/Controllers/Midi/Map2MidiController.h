// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MidiController — ALSA-seq-backed MIDI Map2Controller subclass.
//
// Lifecycle:
//   open()  → allocates an ALSA seq client, subscribes to the configured
//             alsa-seq client/port, spawns an event-reader thread that
//             dispatches MIDI events upstream via Map2Controller::dispatch().
//   close() → stops the reader thread, unsubscribes, frees the client.
//   send()  → encodes and forwards an outbound MIDI message via
//             snd_seq_event_output (used for LED feedback, SysEx, etc.).
//
// Fast-path bindings registered on the base class are honoured by the
// dispatch() machinery — they short-circuit to the engine target without
// crossing the IPC boundary to map2-controller-host.
//
// Pattern reference: Mixxx src/controllers/midi/portmidicontroller.cpp
// (GPLv2-or-later) is the architectural inspiration for the shape; the
// ALSA-seq specific code mirrors patterns already in use in
// juce-engine/Source/MidiHandler.cpp (also AGPL-3.0-only). No Mixxx
// source is copied.
//
// Worklist: T2459-B1
// Architecture: docs/architecture/CONTROLLER_LAYER.md §2-§3

#pragma once

#include "../Map2Controller.h"

#include <atomic>
#include <memory>
#include <string>
#include <thread>

#if defined(__has_include)
  #if __has_include(<alsa/asoundlib.h>)
    #define MAP2_HAS_ALSA_SEQ 1
    #include <alsa/asoundlib.h>
  #else
    #define MAP2_HAS_ALSA_SEQ 0
  #endif
#else
  #define MAP2_HAS_ALSA_SEQ 0
#endif

namespace map2::controllers::midi
{

/** Concrete subscription target.
 *
 *  Constructed from a YAML midi-profile's
 *  identity.alsa_client_pattern + (optional) port index. The pattern
 *  is matched against connected clients by Map2MidiEnumerator at
 *  open() time; `subscribedClient` / `subscribedPort` carry the
 *  resolved values for the active subscription.
 */
struct AlsaSeqTarget
{
    juce::String clientPattern;     // substring match against snd_seq_client_info_get_name
    int portIndex = 0;              // which port on the matched client to subscribe to
    int subscribedClient = -1;      // populated at open()
    int subscribedPort = -1;        // populated at open()
};

class Map2MidiController : public Map2Controller
{
public:
    Map2MidiController (ControllerIdentity identity, AlsaSeqTarget target);
    ~Map2MidiController() override;

    bool open() override;
    void close() override;
    bool send (const ControllerOutbound& outbound) override;

    /** Returns the resolved ALSA seq client + port after a successful
     *  open(). Useful for the GUI to display "Subscribed to client 28
     *  port 0" on the device panel.
     */
    const AlsaSeqTarget& getTarget() const noexcept { return target; }

private:
    void readerThreadLoop();
    bool resolveAndSubscribe();
    void unsubscribeAndClose();

    AlsaSeqTarget target;

#if MAP2_HAS_ALSA_SEQ
    snd_seq_t* seqHandle = nullptr;
    int localClient = -1;
    int localPort = -1;
    int subscribedQueue = -1;
#endif

    std::atomic<bool> shouldStop { false };
    std::unique_ptr<std::thread> readerThread;
};

/** Map2MidiEnumerator — scans connected ALSA-seq clients and reports
 *  candidate MIDI controllers.
 *
 *  Used by ControllerService at backend startup (and on udev/seq-add
 *  events later, T-future) to enumerate connected MIDI gear and match
 *  it against the registered MIDI profiles in ProfileRegistry.
 */
class Map2MidiEnumerator
{
public:
    struct EnumeratedClient
    {
        int alsaClient = -1;
        int alsaPort = -1;
        juce::String clientName;
        juce::String portName;
        bool isInputPort = false;
        bool isOutputPort = false;
    };

    /** Walk all reachable ALSA seq clients. Returns one entry per
     *  client/port pair that exposes either MIDI generic in or out
     *  capability. Excludes our own client.
     */
    static juce::Array<EnumeratedClient> enumerate();
};

} // namespace map2::controllers::midi
