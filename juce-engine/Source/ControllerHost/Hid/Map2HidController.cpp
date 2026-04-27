// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2HidController.cpp — see header for the contract.

#include "Map2HidController.h"

#include <chrono>
#include <iostream>
#include <thread>

namespace map2::controller_host::hid
{

namespace
{
// Poll cadence — 250 µs matches Mixxx's HidIoThread default and is
// fast enough for any DJ/HID controller we'll see (1 kHz is the
// typical USB HID limit; 8 kHz is the upper end of high-speed mode).
constexpr int kPollIntervalMicros = 250;
constexpr int kHidReadBufferBytes = 256;
constexpr int kHidReadTimeoutMillis = 5;
}

Map2HidController::Map2HidController (HidDeviceInfo id)
    : identity (std::move (id))
{
}

Map2HidController::~Map2HidController()
{
    Map2HidController::close();
}

bool Map2HidController::open()
{
    if (isOpen())
        return true;

#if !MAP2_HAS_HIDAPI
    std::cerr << "[Map2HidController] hidapi unavailable at compile time.\n";
    return false;
#else
    handle = hid_open_path (identity.path.c_str());
    if (handle == nullptr)
    {
        std::cerr << "[Map2HidController] hid_open_path(" << identity.path
                  << ") failed.\n";
        return false;
    }
    hid_set_nonblocking (handle, 0);  // blocking read with timeout — we use
                                       // hid_read_timeout in the poller.

    shouldStop.store (false, std::memory_order_release);
    opened.store (true, std::memory_order_release);
    if (stateCallback) stateCallback (true);

    pollerThread = std::make_unique<std::thread> (
        [this] { pollerLoop(); });
    return true;
#endif
}

void Map2HidController::close()
{
    if (! isOpen())
    {
#if MAP2_HAS_HIDAPI
        if (handle != nullptr)
        {
            hid_close (handle);
            handle = nullptr;
        }
#endif
        return;
    }

    shouldStop.store (true, std::memory_order_release);
    if (pollerThread && pollerThread->joinable())
    {
        pollerThread->join();
        pollerThread.reset();
    }

#if MAP2_HAS_HIDAPI
    if (handle != nullptr)
    {
        hid_close (handle);
        handle = nullptr;
    }
#endif

    opened.store (false, std::memory_order_release);
    if (stateCallback) stateCallback (false);
}

bool Map2HidController::sendOutputReport (const std::vector<std::uint8_t>& bytes)
{
#if !MAP2_HAS_HIDAPI
    (void) bytes;
    return false;
#else
    if (handle == nullptr || ! isOpen()) return false;
    if (bytes.empty()) return false;
    int written = hid_write (handle, bytes.data(), bytes.size());
    return written == static_cast<int> (bytes.size());
#endif
}

void Map2HidController::pollerLoop()
{
#if !MAP2_HAS_HIDAPI
    return;
#else
    std::vector<std::uint8_t> buffer (kHidReadBufferBytes);
    while (! shouldStop.load (std::memory_order_acquire))
    {
        int n = hid_read_timeout (handle, buffer.data(), buffer.size(),
                                  kHidReadTimeoutMillis);
        if (n < 0)
        {
            // hidapi returns -1 on disconnect / fatal error.
            std::cerr << "[Map2HidController] hid_read_timeout: device gone.\n";
            break;
        }
        if (n == 0)
        {
            // Timeout — yield briefly. 250 µs from kPollIntervalMicros.
            std::this_thread::sleep_for (std::chrono::microseconds (kPollIntervalMicros));
            continue;
        }
        if (eventCallback)
        {
            HidReport report;
            report.timestamp_ns = static_cast<std::int64_t> (
                std::chrono::duration_cast<std::chrono::nanoseconds> (
                    std::chrono::steady_clock::now().time_since_epoch()).count());
            report.bytes.assign (buffer.begin(), buffer.begin() + n);
            try
            {
                eventCallback (report);
            }
            catch (...)
            {
                std::cerr << "[Map2HidController] event callback threw — swallowed.\n";
            }
        }
    }
#endif
}

// ---------------------------------------------------------------------------
// Map2HidEnumerator
// ---------------------------------------------------------------------------

bool Map2HidEnumerator::init()
{
#if !MAP2_HAS_HIDAPI
    return false;
#else
    return hid_init() == 0;
#endif
}

void Map2HidEnumerator::exit()
{
#if MAP2_HAS_HIDAPI
    hid_exit();
#endif
}

std::vector<HidDeviceInfo> Map2HidEnumerator::enumerate (
    std::uint16_t vid_filter, std::uint16_t pid_filter)
{
    std::vector<HidDeviceInfo> out;

#if !MAP2_HAS_HIDAPI
    (void) vid_filter; (void) pid_filter;
    return out;
#else
    hid_device_info* head = hid_enumerate (vid_filter, pid_filter);
    for (hid_device_info* dev = head; dev != nullptr; dev = dev->next)
    {
        HidDeviceInfo info;
        info.path = dev->path != nullptr ? dev->path : "";
        info.vendor_id = dev->vendor_id;
        info.product_id = dev->product_id;
        if (dev->manufacturer_string)
        {
            for (auto* p = dev->manufacturer_string; *p != 0; ++p)
                info.manufacturer.push_back (static_cast<char> (*p));
        }
        if (dev->product_string)
        {
            for (auto* p = dev->product_string; *p != 0; ++p)
                info.product.push_back (static_cast<char> (*p));
        }
        info.usage_page = dev->usage_page;
        info.usage = dev->usage;
        info.interface_number = dev->interface_number;
        out.push_back (std::move (info));
    }
    if (head != nullptr) hid_free_enumeration (head);
    return out;
#endif
}

} // namespace map2::controller_host::hid
