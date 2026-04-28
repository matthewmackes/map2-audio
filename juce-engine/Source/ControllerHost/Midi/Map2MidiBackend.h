// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MidiBackend — backend selection layer over libremidi.
// Worklist: T2459-H1
//
// Locked decision Q2 = A: hardcoded probe order
//   1. JACK MIDI            — preferred (cycle-aligned with audio engine)
//   2. PipeWire native MIDI — long-term direction; secondary preference
//   3. ALSA sequencer       — degraded fallback (kernel hop, non-RT timer)
//   4. ALSA raw             — degraded fallback (no virtual ports)
//
// On any non-JACK-MIDI selection, the backend emits a `degraded` diagnostic
// so the bench operator sees that the system is below professional spec.

#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace map2::controller_host {

// Identifies the resolved libremidi API, mirroring `libremidi::API`. We
// declare our own enum here so the header doesn't pull libremidi types
// transitively into every consumer of Map2MidiBackend.
enum class MidiBackend : std::uint8_t {
    JackMidi      = 0,
    PipewireNative = 1,
    AlsaSeq       = 2,
    AlsaRaw       = 3,
    None          = 0xFFu,
};

// Diagnostic levels surfaced through the IPC control channel + the
// Hardware Store /devices/diagnostics surface.
enum class BackendDiagnosticLevel : std::uint8_t {
    Info    = 0,
    Warning = 1,
    Error   = 2,
};

struct BackendDiagnostic
{
    BackendDiagnosticLevel level;
    std::string code;     // e.g. "midi_backend_degraded"
    std::string message;  // human-readable text
};

// Port identity exposed to the host for enumeration parity with
// python-rtmidi (`get_port_count()` / `get_port_name(i)`).
struct PortDescriptor
{
    std::string name;     // e.g. "EDIROL UA-1000:0"
    std::string id;       // libremidi-stable identifier (used to reopen)
    bool        isInput;
    bool        isVirtual; // true for ports the host itself published
};

// Status-byte classification result type used by the I/O thread to decide
// which ring an incoming message lands in. See ShmEventRing::classifyMidiStatus().

class LibremidiAdapter;

// Map2MidiBackend — owns the libremidi observer + chosen backend.
//
// Construction probes JACK_MIDI → PIPEWIRE → ALSA_SEQ → ALSA_RAW in order
// and binds to the first one that opens. On non-JACK selection, a
// BackendDiagnostic is appended to diagnostics() with level=Warning.
//
// The class is movable but not copyable (it owns OS resources via libremidi).
class Map2MidiBackend
{
public:
    Map2MidiBackend();
    ~Map2MidiBackend();

    Map2MidiBackend (const Map2MidiBackend&)            = delete;
    Map2MidiBackend& operator= (const Map2MidiBackend&) = delete;
    Map2MidiBackend (Map2MidiBackend&&) noexcept;
    Map2MidiBackend& operator= (Map2MidiBackend&&) noexcept;

    // Run the locked probe order. Returns true if any backend bound; false
    // if every backend failed (extremely unusual — at minimum ALSA seq
    // should always be present on a Linux host).
    bool probe();

    // Force-select a backend (for tests). Bypasses the probe order; uses
    // the supplied backend or fails. Tests use this to assert behaviour
    // under each backend without tripping host hardware.
    bool forceSelect (MidiBackend backend);

    // The resolved backend, or None if probe() hasn't run / has failed.
    MidiBackend selectedBackend() const noexcept { return selected_; }

    // Stable string for logs and diagnostics: "jack_midi" / "pipewire" /
    // "alsa_seq" / "alsa_raw" / "none".
    static const char* backendName (MidiBackend b) noexcept;

    // Enumerate input + output ports through the resolved backend. Empty
    // list when no backend is bound. Names are libremidi's port_name; ids
    // are libremidi's stable identifier (port_handle on the underlying
    // backend). The wrapper sorts inputs first, then outputs.
    std::vector<PortDescriptor> listPorts() const;

    // Diagnostics emitted during probe / runtime. Cleared by clearDiagnostics().
    const std::vector<BackendDiagnostic>& diagnostics() const noexcept { return diagnostics_; }
    void clearDiagnostics() noexcept { diagnostics_.clear(); }

    // Adapter accessor — exposed for the host main loop to drive I/O. Null
    // when no backend is bound.
    LibremidiAdapter* adapter() const noexcept { return adapter_.get(); }

private:
    bool tryBindBackend (MidiBackend backend);
    void appendDegradedDiagnostic (MidiBackend selected);

    MidiBackend                        selected_ = MidiBackend::None;
    std::unique_ptr<LibremidiAdapter>  adapter_;
    std::vector<BackendDiagnostic>     diagnostics_;
};

} // namespace map2::controller_host
