// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2Controller — abstract base class for protocol-specific controller
// implementations (MIDI, HID, bulk USB).
//
// This is the in-engine half of the controller subsystem. Protocol I/O,
// fast-path direct bindings, and IPC origination from the audio engine
// side live here. QuickJS execution and JS mapping logic live in the
// separate map2-controller-host process.
//
// Pattern reference: Mixxx src/controllers/controller.h:30 (GPLv2-or-later).
// Architectural inspiration only; the implementation is a clean rewrite.
//
// See: docs/architecture/CONTROLLER_LAYER.md
//      Worklist: T2459-A2

#pragma once

#include <juce_core/juce_core.h>

#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace map2::controllers
{

/** Identifies a connected controller device.
 *
 *  hardwareId is the canonical identifier — VID:PID for USB devices,
 *  or "alsa-seq:<client>:<port>" for ALSA-seq endpoints without USB
 *  enumeration metadata.
 */
struct ControllerIdentity
{
    juce::String hardwareId;        // "usb:0582:00ed" or "alsa-seq:UA-1000 MIDI:0"
    juce::String displayName;       // "EDIROL UA-1000 MIDI"
    juce::String manufacturer;      // "Edirol (Roland)"
    juce::String model;             // "UA-1000"
    juce::String protocol;          // "midi", "hid", "bulk"
};

/** A raw protocol event observed from a controller.
 *
 *  For MIDI: bytes is a 1-3 byte status+data MIDI message.
 *  For HID: bytes is a raw HID input report (1-64 bytes typical).
 *  For bulk: bytes is a raw libusb_bulk_transfer payload.
 */
struct ControllerEvent
{
    juce::int64 timestampNs = 0;    // monotonic ns since epoch
    std::vector<juce::uint8> bytes;
};

/** A request to send data out to a controller.
 *
 *  For MIDI: bytes is a 1-3 byte status+data MIDI message or a SysEx.
 *  For HID: bytes is a raw HID output report.
 *  For bulk: bytes is a raw libusb_bulk_transfer payload.
 */
struct ControllerOutbound
{
    std::vector<juce::uint8> bytes;
};

/** A fast-path direct binding from a control byte to an engine target.
 *
 *  When a YAML <control> row is marked fast_path: true, the corresponding
 *  binding is registered here. dispatch() in the controller's protocol
 *  subclass routes matching events directly to the engine target,
 *  bypassing the IPC round-trip and QuickJS execution.
 *
 *  This is the only path that can avoid the IPC hop. Arbitrary JS cannot
 *  be promoted to fast path.
 */
struct FastPathBinding
{
    juce::uint8 statusByte = 0;          // e.g. 0xB0 for CC channel 1
    juce::uint8 dataByte1 = 0;           // e.g. CC number
    juce::String engineTarget;            // "audio.chain.1.bypass"
    juce::String action;                  // "toggle", "set", "increment"
    bool matchExact = true;               // false ⇒ match all data1 values
};

/** Abstract base class for a connected controller.
 *
 *  Subclasses implement open()/close()/poll() for their protocol.
 *  The base class owns the device identity, the fast-path binding table,
 *  and the upstream callbacks for raw events (which the IPC layer in
 *  map2-controller-host consumes for QuickJS-driven mappings).
 */
class Map2Controller
{
public:
    using EventCallback = std::function<void (const ControllerEvent&)>;
    using StateCallback = std::function<void (bool /*open*/)>;

    explicit Map2Controller (ControllerIdentity identity);
    virtual ~Map2Controller();

    Map2Controller (const Map2Controller&) = delete;
    Map2Controller& operator= (const Map2Controller&) = delete;

    /** Open the underlying protocol connection. Idempotent.
     *  @returns true on success.
     */
    virtual bool open() = 0;

    /** Close the underlying protocol connection. Idempotent.
     */
    virtual void close() = 0;

    /** Poll the controller for incoming events.
     *
     *  For protocols that push events asynchronously (HID via dedicated
     *  thread), poll() may be a no-op and events are delivered via
     *  the eventCallback registered with setEventCallback().
     *
     *  For protocols that need to be polled (some MIDI backends), poll()
     *  drains pending events and dispatches them.
     */
    virtual void poll() {}

    /** Send data out to the controller (LED feedback, SysEx, HID output
     *  report, etc.).
     */
    virtual bool send (const ControllerOutbound& outbound) = 0;

    /** Register a callback for incoming events.
     *
     *  The callback runs on the protocol I/O thread (e.g. ALSA-seq
     *  thread for MIDI, dedicated 250 µs HID thread for HID). It must
     *  be RT-safe in the sense that it must not block the audio thread,
     *  but it does not run on the audio thread itself.
     */
    void setEventCallback (EventCallback cb) { eventCallback = std::move (cb); }

    /** Register a callback for open/close state transitions.
     */
    void setStateCallback (StateCallback cb) { stateCallback = std::move (cb); }

    /** Register a fast-path direct binding. The binding is consulted in
     *  dispatch() before the event is forwarded to the IPC layer.
     */
    void addFastPathBinding (const FastPathBinding& binding);

    /** Clear all fast-path bindings.
     */
    void clearFastPathBindings();

    /** @returns true if the controller is currently open and connected.
     */
    bool isOpen() const noexcept { return opened.load (std::memory_order_acquire); }

    /** @returns the canonical identity of this controller.
     */
    const ControllerIdentity& getIdentity() const noexcept { return identity; }

protected:
    /** Dispatch an event up the chain.
     *
     *  Subclasses call this from their protocol I/O thread when an event
     *  arrives. The base class:
     *    1. checks fast-path bindings; if a match, invokes the bound
     *       engine target directly (zero IPC round-trip);
     *    2. forwards the event to the registered eventCallback (which
     *       the IPC layer in controller-host-service.py drains and
     *       forwards to map2-controller-host for JS execution).
     */
    void dispatch (const ControllerEvent& event);

    /** Mark the controller as open or closed; fires stateCallback.
     */
    void setOpen (bool isOpenNow);

private:
    ControllerIdentity identity;
    std::atomic<bool> opened { false };
    EventCallback eventCallback;
    StateCallback stateCallback;
    juce::CriticalSection fastPathLock;
    std::vector<FastPathBinding> fastPathBindings;

    /** Apply a matching fast-path binding to the engine. Returns true if
     *  a binding matched (and the event should NOT be forwarded to JS).
     */
    bool applyFastPath (const ControllerEvent& event);
};

} // namespace map2::controllers
