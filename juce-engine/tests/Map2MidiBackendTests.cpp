// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MidiBackend backend probe + diagnostic emission tests.
// Worklist: T2459-H1
//
// These tests don't require a working libremidi backend on the host.
// They exercise the probe ordering and diagnostic shape via the
// `forceSelect()` test seam, plus the `backendName()` table.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Midi/Map2MidiBackend.h"

using map2::controller_host::Map2MidiBackend;
using map2::controller_host::MidiBackend;
using map2::controller_host::BackendDiagnosticLevel;

TEST_CASE ("Map2MidiBackend backendName table is stable", "[H1][backend]")
{
    REQUIRE (std::string (Map2MidiBackend::backendName (MidiBackend::JackMidi))       == "jack_midi");
    REQUIRE (std::string (Map2MidiBackend::backendName (MidiBackend::PipewireNative)) == "pipewire");
    REQUIRE (std::string (Map2MidiBackend::backendName (MidiBackend::AlsaSeq))        == "alsa_seq");
    REQUIRE (std::string (Map2MidiBackend::backendName (MidiBackend::AlsaRaw))        == "alsa_raw");
    REQUIRE (std::string (Map2MidiBackend::backendName (MidiBackend::None))           == "none");
}

TEST_CASE ("Map2MidiBackend selecting JACK_MIDI emits no degraded diagnostic", "[H1][backend]")
{
    Map2MidiBackend backend;
    REQUIRE (backend.forceSelect (MidiBackend::JackMidi));
    REQUIRE (backend.selectedBackend() == MidiBackend::JackMidi);
    // No degraded diagnostic should have been appended for the preferred
    // backend.
    bool degradedSeen = false;
    for (const auto& d : backend.diagnostics())
        if (d.code == "midi_backend_degraded") degradedSeen = true;
    REQUIRE_FALSE (degradedSeen);
}

TEST_CASE ("Map2MidiBackend selecting ALSA_SEQ emits a Warning-level degraded diagnostic", "[H1][backend]")
{
    Map2MidiBackend backend;
    REQUIRE (backend.forceSelect (MidiBackend::AlsaSeq));
    REQUIRE (backend.selectedBackend() == MidiBackend::AlsaSeq);

    bool degradedSeen = false;
    for (const auto& d : backend.diagnostics())
    {
        if (d.code == "midi_backend_degraded")
        {
            degradedSeen = true;
            REQUIRE (d.level == BackendDiagnosticLevel::Warning);
            REQUIRE (d.message.find ("alsa_seq") != std::string::npos);
            REQUIRE (d.message.find ("JACK MIDI") != std::string::npos);
        }
    }
    REQUIRE (degradedSeen);
}

TEST_CASE ("Map2MidiBackend ALSA_RAW + PIPEWIRE also emit degraded diagnostics", "[H1][backend]")
{
    {
        Map2MidiBackend backend;
        REQUIRE (backend.forceSelect (MidiBackend::AlsaRaw));
        bool seen = false;
        for (const auto& d : backend.diagnostics())
            if (d.code == "midi_backend_degraded") seen = true;
        REQUIRE (seen);
    }
    {
        Map2MidiBackend backend;
        REQUIRE (backend.forceSelect (MidiBackend::PipewireNative));
        // PipeWire native is second-preferred but still degraded vs.
        // JACK MIDI for cycle-aligned audio-rate MIDI on this platform.
        bool seen = false;
        for (const auto& d : backend.diagnostics())
            if (d.code == "midi_backend_degraded") seen = true;
        REQUIRE (seen);
    }
}

TEST_CASE ("Map2MidiBackend forceSelect(None) clears the adapter", "[H1][backend]")
{
    Map2MidiBackend backend;
    REQUIRE (backend.forceSelect (MidiBackend::JackMidi));
    REQUIRE (backend.selectedBackend() == MidiBackend::JackMidi);
    REQUIRE (backend.forceSelect (MidiBackend::None));
    REQUIRE (backend.selectedBackend() == MidiBackend::None);
    REQUIRE (backend.adapter() == nullptr);
}
