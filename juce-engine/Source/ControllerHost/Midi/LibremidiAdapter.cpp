// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// LibremidiAdapter implementation.
// Worklist: T2459-H1

#include "LibremidiAdapter.h"

#include <cstring>
#include <optional>

#if defined(MAP2_HAS_LIBREMIDI)
  #include <libremidi/libremidi.hpp>
  #include <libremidi/defaults.hpp>
#endif

namespace map2::controller_host {

#if defined(MAP2_HAS_LIBREMIDI)
struct LibremidiAdapter::Impl
{
    std::unique_ptr<libremidi::observer> observer;
    std::unique_ptr<libremidi::midi_in>  virtualIn;
    std::unique_ptr<libremidi::midi_out> virtualOut;

    // T2459-H3 Slice 6 — per-port hardware inputs each tag their callbacks
    // with the host-assigned controllerIndex so multi-controller routing
    // works on the consumer side without per-controller ring proliferation.
    struct HardwareInput
    {
        std::string                          port_id;
        std::uint16_t                        controllerIndex { 0 };
        std::unique_ptr<libremidi::midi_in>  midiIn;
    };
    std::vector<std::unique_ptr<HardwareInput>> hardwareIns;
};

static libremidi::API toLibremidiApi (MidiBackend backend)
{
    switch (backend)
    {
        case MidiBackend::JackMidi:        return libremidi::API::JACK_MIDI;
        case MidiBackend::PipewireNative:  return libremidi::API::PIPEWIRE;
        case MidiBackend::AlsaSeq:         return libremidi::API::ALSA_SEQ;
        case MidiBackend::AlsaRaw:         return libremidi::API::ALSA_RAW;
        case MidiBackend::None:
        default:                           return libremidi::API::UNSPECIFIED;
    }
}
#else
struct LibremidiAdapter::Impl {};
#endif

LibremidiAdapter::LibremidiAdapter (MidiBackend backend)
    : backend_ (backend), impl_ (std::make_unique<Impl>()) {}

LibremidiAdapter::~LibremidiAdapter() = default;

bool LibremidiAdapter::initialise()
{
#if defined(MAP2_HAS_LIBREMIDI)
    try
    {
        const libremidi::API api = toLibremidiApi (backend_);
        if (api == libremidi::API::UNSPECIFIED)
        {
            errorMessage_ = "Map2MidiBackend::None cannot bind libremidi";
            return false;
        }
        libremidi::observer_configuration cfg {};
        impl_->observer = std::make_unique<libremidi::observer> (
            cfg,
            libremidi::observer_configuration_for (api));
        return true;
    }
    catch (const std::exception& e)
    {
        errorMessage_ = std::string ("libremidi observer init failed: ") + e.what();
        return false;
    }
#else
    errorMessage_ = "MAP2_HAS_LIBREMIDI not defined; adapter is a no-op shim";
    return true;
#endif
}

void LibremidiAdapter::setEventRings (ShmEventRing* rtRing, ShmEventRing* controlRing) noexcept
{
    rtRing_      = rtRing;
    controlRing_ = controlRing;
}

std::vector<PortDescriptor> LibremidiAdapter::listPorts() const
{
    std::lock_guard<std::mutex> lock (portsMutex_);
#if defined(MAP2_HAS_LIBREMIDI)
    std::vector<PortDescriptor> out;
    if (impl_->observer == nullptr)
        return out;
    try
    {
        for (const auto& p : impl_->observer->get_input_ports())
        {
            PortDescriptor d;
            d.name      = p.port_name;
            d.id        = p.port_name;
            d.isInput   = true;
            d.isVirtual = false;
            out.push_back (std::move (d));
        }
        for (const auto& p : impl_->observer->get_output_ports())
        {
            PortDescriptor d;
            d.name      = p.port_name;
            d.id        = p.port_name;
            d.isInput   = false;
            d.isVirtual = false;
            out.push_back (std::move (d));
        }
    }
    catch (const std::exception&)
    {
        // libremidi enumeration exceptions are non-fatal; return what we have.
    }
    return out;
#else
    return cachedPorts_;
#endif
}

bool LibremidiAdapter::openVirtualInput (const std::string& name)
{
#if defined(MAP2_HAS_LIBREMIDI)
    try
    {
        libremidi::input_configuration cfg {};
        cfg.on_message = [this] (libremidi::message&& msg) {
            this->onIncomingMessage (msg.bytes.data(), msg.bytes.size(),
                                     monotonicNanos(), 0);
        };
        impl_->virtualIn = std::make_unique<libremidi::midi_in> (cfg);
        impl_->virtualIn->open_virtual_port (name);
        return true;
    }
    catch (const std::exception& e)
    {
        errorMessage_ = std::string ("libremidi openVirtualInput failed: ") + e.what();
        return false;
    }
#else
    (void) name;
    return true;
#endif
}

bool LibremidiAdapter::openVirtualOutput (const std::string& name)
{
#if defined(MAP2_HAS_LIBREMIDI)
    try
    {
        libremidi::output_configuration cfg {};
        impl_->virtualOut = std::make_unique<libremidi::midi_out> (cfg);
        impl_->virtualOut->open_virtual_port (name);
        return true;
    }
    catch (const std::exception& e)
    {
        errorMessage_ = std::string ("libremidi openVirtualOutput failed: ") + e.what();
        return false;
    }
#else
    (void) name;
    return true;
#endif
}

bool LibremidiAdapter::openInput (const std::string& port_id_or_name,
                                  std::uint16_t controllerIndex)
{
#if defined(MAP2_HAS_LIBREMIDI)
    if (impl_->observer == nullptr)
    {
        errorMessage_ = "openInput: observer not initialised";
        return false;
    }
    try
    {
        // Resolve the requested id/name against the live input enumeration.
        std::optional<libremidi::input_port> match;
        for (const auto& p : impl_->observer->get_input_ports())
        {
            if (p.port_name == port_id_or_name)
            {
                match = p;
                break;
            }
        }
        if (! match.has_value())
        {
            errorMessage_ = "openInput: no input port matches '" + port_id_or_name + "'";
            return false;
        }

        // Build the per-port record up-front so the on_message lambda can
        // capture a stable pointer to it (the heap-allocated HardwareInput
        // outlives any reallocation of the owning vector).
        auto record = std::make_unique<Impl::HardwareInput>();
        record->port_id         = port_id_or_name;
        record->controllerIndex = controllerIndex;
        Impl::HardwareInput* rec_ptr = record.get();

        libremidi::input_configuration cfg {};
        cfg.on_message = [this, rec_ptr] (libremidi::message&& msg) {
            this->onIncomingMessage (msg.bytes.data(), msg.bytes.size(),
                                     monotonicNanos(),
                                     rec_ptr->controllerIndex);
        };
        const libremidi::API api = toLibremidiApi (backend_);
        auto in = std::make_unique<libremidi::midi_in> (
            cfg,
            libremidi::midi_in_configuration_for (api));
        if (auto err = in->open_port (*match, "map2-controller-host input"); err != stdx::error{})
        {
            errorMessage_ = "openInput: open_port failed for '" + port_id_or_name + "'";
            return false;
        }
        record->midiIn = std::move (in);
        impl_->hardwareIns.push_back (std::move (record));
        return true;
    }
    catch (const std::exception& e)
    {
        errorMessage_ = std::string ("libremidi openInput failed: ") + e.what();
        return false;
    }
#else
    (void) port_id_or_name;
    (void) controllerIndex;
    errorMessage_ = "MAP2_HAS_LIBREMIDI not defined; openInput is a no-op";
    return false;
#endif
}

void LibremidiAdapter::pushMessage (const std::uint8_t* bytes,
                                    std::size_t length,
                                    std::uint16_t controllerIndex)
{
    onIncomingMessage (bytes, length, monotonicNanos(), controllerIndex);
}

void LibremidiAdapter::onIncomingMessage (const std::uint8_t* bytes,
                                          std::size_t length,
                                          std::uint64_t tsNanos,
                                          std::uint16_t controllerIndex)
{
    if (length == 0 || bytes == nullptr) return;
    const RingClass cls = classifyMidiStatus (bytes[0]);
    ShmEventRing* target = (cls == RingClass::Rt) ? rtRing_ : controlRing_;
    if (target == nullptr || ! target->isOpen())
        return;
    target->push (tsNanos, bytes, length, controllerIndex);
}

} // namespace map2::controller_host
