// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2BulkController — libusb-1.0 backed bulk-transfer controller.
//
// Bulk USB controllers (some early Hercules DJ boards, etc.) don't
// expose HID descriptors and need raw libusb_bulk_transfer. Lower
// priority than MIDI/HID; included for vendor-pack coverage parity
// with Mixxx (`src/controllers/bulk/`).
//
// Lives in controller-host (NOT the audio engine) for the same crash-
// isolation reason as Map2HidController.
//
// Worklist: T2459-D3.

#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#if defined(__has_include)
  #if __has_include(<libusb-1.0/libusb.h>)
    #define MAP2_HAS_LIBUSB 1
    #include <libusb-1.0/libusb.h>
  #elif __has_include(<libusb.h>)
    #define MAP2_HAS_LIBUSB 1
    #include <libusb.h>
  #else
    #define MAP2_HAS_LIBUSB 0
  #endif
#else
  #define MAP2_HAS_LIBUSB 0
#endif

namespace map2::controller_host::bulk
{

struct BulkDeviceInfo
{
    std::uint16_t vendor_id = 0;
    std::uint16_t product_id = 0;
    std::uint8_t bus_number = 0;
    std::uint8_t device_address = 0;
    std::uint8_t in_endpoint = 0x81;   // common bulk-IN endpoint
    std::uint8_t out_endpoint = 0x01;  // common bulk-OUT endpoint
    int interface_number = 0;
    std::string description;
};

struct BulkPacket
{
    std::int64_t timestamp_ns = 0;
    std::vector<std::uint8_t> bytes;
};

class Map2BulkController
{
public:
    using EventCallback = std::function<void (const BulkPacket&)>;
    using StateCallback = std::function<void (bool /*open*/)>;

    explicit Map2BulkController (BulkDeviceInfo identity);
    ~Map2BulkController();

    Map2BulkController (const Map2BulkController&) = delete;
    Map2BulkController& operator= (const Map2BulkController&) = delete;

    bool open();
    void close();
    bool sendBulkOut (const std::vector<std::uint8_t>& bytes,
                      unsigned int timeout_ms = 100);

    void setEventCallback (EventCallback cb) { eventCallback = std::move (cb); }
    void setStateCallback (StateCallback cb) { stateCallback = std::move (cb); }

    bool isOpen() const noexcept { return opened.load (std::memory_order_acquire); }
    const BulkDeviceInfo& getIdentity() const noexcept { return identity; }

private:
    void readerLoop();

    BulkDeviceInfo identity;
    std::atomic<bool> opened { false };
    std::atomic<bool> shouldStop { false };

#if MAP2_HAS_LIBUSB
    libusb_context* ctx = nullptr;
    libusb_device_handle* handle = nullptr;
#endif

    std::unique_ptr<std::thread> readerThread;
    EventCallback eventCallback;
    StateCallback stateCallback;
};

class Map2BulkEnumerator
{
public:
    /** libusb must be initialised once per process. Call on host
     *  startup; safe to call when libusb is unavailable.
     */
    static bool init();
    static void exit();

    /** Walk the USB bus. Returns one entry per device that matches
     *  the optional VID/PID filter. Empty when libusb is unavailable.
     */
    static std::vector<BulkDeviceInfo> enumerate (
        std::uint16_t vid_filter = 0,
        std::uint16_t pid_filter = 0);
};

} // namespace map2::controller_host::bulk
