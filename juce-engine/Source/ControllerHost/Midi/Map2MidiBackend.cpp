// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MidiBackend implementation.
// Worklist: T2459-H1

#include "Map2MidiBackend.h"

#include "LibremidiAdapter.h"

#include <utility>

namespace map2::controller_host {

Map2MidiBackend::Map2MidiBackend() = default;
Map2MidiBackend::~Map2MidiBackend() = default;

Map2MidiBackend::Map2MidiBackend (Map2MidiBackend&&) noexcept = default;
Map2MidiBackend& Map2MidiBackend::operator= (Map2MidiBackend&&) noexcept = default;

const char* Map2MidiBackend::backendName (MidiBackend b) noexcept
{
    switch (b)
    {
        case MidiBackend::JackMidi:       return "jack_midi";
        case MidiBackend::PipewireNative: return "pipewire";
        case MidiBackend::AlsaSeq:        return "alsa_seq";
        case MidiBackend::AlsaRaw:        return "alsa_raw";
        case MidiBackend::None:           return "none";
    }
    return "unknown";
}

bool Map2MidiBackend::probe()
{
    // Locked decision Q2 = A: hardcoded probe order.
    static constexpr MidiBackend kOrder[] = {
        MidiBackend::JackMidi,
        MidiBackend::PipewireNative,
        MidiBackend::AlsaSeq,
        MidiBackend::AlsaRaw,
    };
    for (MidiBackend b : kOrder)
    {
        if (tryBindBackend (b))
        {
            selected_ = b;
            if (b != MidiBackend::JackMidi)
                appendDegradedDiagnostic (b);
            return true;
        }
    }
    selected_ = MidiBackend::None;
    diagnostics_.push_back ({
        BackendDiagnosticLevel::Error,
        "midi_backend_unavailable",
        "No libremidi MIDI backend could be opened. The bench has no functional MIDI I/O.",
    });
    return false;
}

bool Map2MidiBackend::forceSelect (MidiBackend backend)
{
    if (backend == MidiBackend::None)
    {
        adapter_.reset();
        selected_ = MidiBackend::None;
        return true;
    }
    if (tryBindBackend (backend))
    {
        selected_ = backend;
        if (backend != MidiBackend::JackMidi)
            appendDegradedDiagnostic (backend);
        return true;
    }
    return false;
}

bool Map2MidiBackend::tryBindBackend (MidiBackend backend)
{
    auto adapter = std::make_unique<LibremidiAdapter> (backend);
    if (! adapter->initialise())
        return false;
    adapter_ = std::move (adapter);
    return true;
}

void Map2MidiBackend::appendDegradedDiagnostic (MidiBackend selected)
{
    BackendDiagnostic diag;
    diag.level = BackendDiagnosticLevel::Warning;
    diag.code  = "midi_backend_degraded";
    diag.message = std::string ("MIDI backend bound to ")
                 + backendName (selected)
                 + " — this is a degraded fallback. JACK MIDI is the preferred"
                   " backend for cycle-aligned audio-rate MIDI on this platform."
                   " See docs/architecture/CONTROLLER_LAYER.md.";
    diagnostics_.push_back (std::move (diag));
}

std::vector<PortDescriptor> Map2MidiBackend::listPorts() const
{
    if (adapter_ == nullptr) return {};
    return adapter_->listPorts();
}

} // namespace map2::controller_host
