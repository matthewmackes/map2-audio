// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2HidController — hidapi-backed HID controller for the
// map2-controller-host process.
//
// HID lives in controller-host, NOT the audio engine: a buggy HID
// driver must not be able to crash audio (architecture doc §3).
//
// Pattern reference: Mixxx hidiothread.cpp:165 (GPLv2-or-later) —
// dedicated QThread polling at 250 µs intervals. We rewrite under
// AGPL-3.0 with a std::thread + atomic shutdown flag.
//
// Worklist: T2459-D1.

#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#if defined(__has_include)
  #if __has_include(<hidapi/hidapi.h>)
    #define MAP2_HAS_HIDAPI 1
    #include <hidapi/hidapi.h>
  #elif __has_include(<hidapi.h>)
    #define MAP2_HAS_HIDAPI 1
    #include <hidapi.h>
  #else
    #define MAP2_HAS_HIDAPI 0
  #endif
#else
  #define MAP2_HAS_HIDAPI 0
#endif

namespace map2::controller_host::hid
{

/** A single enumerated HID device descriptor. */
struct HidDeviceInfo
{
    std::string path;            // hidapi opaque device path
    std::uint16_t vendor_id = 0;
    std::uint16_t product_id = 0;
    std::string manufacturer;
    std::string product;
    std::uint16_t usage_page = 0;
    std::uint16_t usage = 0;
    int interface_number = -1;
};

/** A raw HID input report observed from a device. */
struct HidReport
{
    std::int64_t timestamp_ns = 0;
    std::vector<std::uint8_t> bytes;
};

/** Map2HidController — owns one hidapi device handle + polling thread.
 *
 *  Lifecycle:
 *    open()  → hid_open_path, spawn poller thread.
 *    close() → set shutdown flag, hid_read interrupts on next iteration,
 *              join thread, hid_close.
 *    sendOutputReport() → hid_write for LED feedback / config writes.
 *
 *  Inbound reports go to the registered EventCallback at the controller
 *  rate. Buggy hidapi reads (e.g. malformed reports, EAGAIN) are
 *  swallowed so a single bad packet doesn't crash the host.
 */
class Map2HidController
{
public:
    using EventCallback = std::function<void (const HidReport&)>;
    using StateCallback = std::function<void (bool /*open*/)>;

    explicit Map2HidController (HidDeviceInfo identity);
    ~Map2HidController();

    Map2HidController (const Map2HidController&) = delete;
    Map2HidController& operator= (const Map2HidController&) = delete;

    bool open();
    void close();
    bool sendOutputReport (const std::vector<std::uint8_t>& bytes);

    void setEventCallback (EventCallback cb) { eventCallback = std::move (cb); }
    void setStateCallback (StateCallback cb) { stateCallback = std::move (cb); }

    bool isOpen() const noexcept { return opened.load (std::memory_order_acquire); }
    const HidDeviceInfo& getIdentity() const noexcept { return identity; }

private:
    void pollerLoop();

    HidDeviceInfo identity;
    std::atomic<bool> opened { false };
    std::atomic<bool> shouldStop { false };

#if MAP2_HAS_HIDAPI
    hid_device* handle = nullptr;
#endif

    std::unique_ptr<std::thread> pollerThread;
    EventCallback eventCallback;
    StateCallback stateCallback;
};

/** Map2HidEnumerator — enumerate every reachable HID device.
 *
 *  Used by ControllerService to match connected HID devices against
 *  HID profiles in ProfileRegistry by VID/PID + usage page/usage +
 *  interface number.
 */
class Map2HidEnumerator
{
public:
    /** hidapi must be initialised once per process via hid_init().
     *  Call this on controller-host startup before enumerate(). On
     *  systems without hidapi headers, this is a no-op.
     */
    static bool init();

    /** Free hidapi resources. Call on controller-host shutdown. */
    static void exit();

    /** Walk every reachable HID device. Returns an empty vector when
     *  hidapi isn't available.
     */
    static std::vector<HidDeviceInfo> enumerate (
        std::uint16_t vendor_id_filter = 0,
        std::uint16_t product_id_filter = 0);
};

} // namespace map2::controller_host::hid
