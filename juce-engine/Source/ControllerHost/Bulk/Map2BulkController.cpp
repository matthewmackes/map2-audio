// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "Map2BulkController.h"

#include <chrono>
#include <iostream>

namespace map2::controller_host::bulk
{

namespace
{
constexpr int kBulkInTimeoutMs = 50;
constexpr int kBulkBufferBytes = 512;
}

Map2BulkController::Map2BulkController (BulkDeviceInfo id)
    : identity (std::move (id))
{
}

Map2BulkController::~Map2BulkController()
{
    Map2BulkController::close();
}

bool Map2BulkController::open()
{
    if (isOpen()) return true;

#if !MAP2_HAS_LIBUSB
    std::cerr << "[Map2BulkController] libusb-1.0 unavailable at compile time.\n";
    return false;
#else
    if (libusb_init (&ctx) != 0)
    {
        std::cerr << "[Map2BulkController] libusb_init failed.\n";
        return false;
    }
    handle = libusb_open_device_with_vid_pid (
        ctx, identity.vendor_id, identity.product_id);
    if (handle == nullptr)
    {
        std::cerr << "[Map2BulkController] libusb_open_device_with_vid_pid("
                  << std::hex << identity.vendor_id << ":"
                  << identity.product_id << std::dec << ") failed.\n";
        libusb_exit (ctx);
        ctx = nullptr;
        return false;
    }
    if (libusb_kernel_driver_active (handle, identity.interface_number) == 1)
    {
        libusb_detach_kernel_driver (handle, identity.interface_number);
    }
    int err = libusb_claim_interface (handle, identity.interface_number);
    if (err != 0)
    {
        std::cerr << "[Map2BulkController] libusb_claim_interface failed: "
                  << libusb_error_name (err) << "\n";
        libusb_close (handle);
        libusb_exit (ctx);
        handle = nullptr;
        ctx = nullptr;
        return false;
    }

    shouldStop.store (false, std::memory_order_release);
    opened.store (true, std::memory_order_release);
    if (stateCallback) stateCallback (true);

    readerThread = std::make_unique<std::thread> (
        [this] { readerLoop(); });
    return true;
#endif
}

void Map2BulkController::close()
{
    if (! isOpen())
    {
#if MAP2_HAS_LIBUSB
        if (handle != nullptr)
        {
            libusb_close (handle);
            handle = nullptr;
        }
        if (ctx != nullptr)
        {
            libusb_exit (ctx);
            ctx = nullptr;
        }
#endif
        return;
    }

    shouldStop.store (true, std::memory_order_release);
    if (readerThread && readerThread->joinable())
    {
        readerThread->join();
        readerThread.reset();
    }

#if MAP2_HAS_LIBUSB
    if (handle != nullptr)
    {
        libusb_release_interface (handle, identity.interface_number);
        libusb_close (handle);
        handle = nullptr;
    }
    if (ctx != nullptr)
    {
        libusb_exit (ctx);
        ctx = nullptr;
    }
#endif

    opened.store (false, std::memory_order_release);
    if (stateCallback) stateCallback (false);
}

bool Map2BulkController::sendBulkOut (const std::vector<std::uint8_t>& bytes,
                                       unsigned int timeout_ms)
{
#if !MAP2_HAS_LIBUSB
    (void) bytes; (void) timeout_ms;
    return false;
#else
    if (handle == nullptr || ! isOpen() || bytes.empty()) return false;
    int transferred = 0;
    int err = libusb_bulk_transfer (handle, identity.out_endpoint,
                                     const_cast<unsigned char*> (bytes.data()),
                                     static_cast<int> (bytes.size()),
                                     &transferred, timeout_ms);
    return err == 0 && transferred == static_cast<int> (bytes.size());
#endif
}

void Map2BulkController::readerLoop()
{
#if !MAP2_HAS_LIBUSB
    return;
#else
    std::vector<std::uint8_t> buffer (kBulkBufferBytes);
    while (! shouldStop.load (std::memory_order_acquire))
    {
        int transferred = 0;
        int err = libusb_bulk_transfer (handle, identity.in_endpoint,
                                         buffer.data(), buffer.size(),
                                         &transferred, kBulkInTimeoutMs);
        if (err == LIBUSB_ERROR_TIMEOUT)
            continue;
        if (err == LIBUSB_ERROR_NO_DEVICE)
        {
            std::cerr << "[Map2BulkController] device disconnected.\n";
            break;
        }
        if (err != 0)
        {
            std::cerr << "[Map2BulkController] libusb_bulk_transfer in: "
                      << libusb_error_name (err) << "\n";
            continue;
        }
        if (transferred > 0 && eventCallback)
        {
            BulkPacket pkt;
            pkt.timestamp_ns = static_cast<std::int64_t> (
                std::chrono::duration_cast<std::chrono::nanoseconds> (
                    std::chrono::steady_clock::now().time_since_epoch()).count());
            pkt.bytes.assign (buffer.begin(), buffer.begin() + transferred);
            try { eventCallback (pkt); } catch (...) {}
        }
    }
#endif
}

// ---------------------------------------------------------------------------
// Map2BulkEnumerator
// ---------------------------------------------------------------------------

bool Map2BulkEnumerator::init()
{
#if !MAP2_HAS_LIBUSB
    return false;
#else
    return libusb_init (nullptr) == 0;
#endif
}

void Map2BulkEnumerator::exit()
{
#if MAP2_HAS_LIBUSB
    libusb_exit (nullptr);
#endif
}

std::vector<BulkDeviceInfo> Map2BulkEnumerator::enumerate (
    std::uint16_t vid_filter, std::uint16_t pid_filter)
{
    std::vector<BulkDeviceInfo> out;

#if !MAP2_HAS_LIBUSB
    (void) vid_filter; (void) pid_filter;
    return out;
#else
    libusb_device** list = nullptr;
    ssize_t count = libusb_get_device_list (nullptr, &list);
    if (count < 0) return out;

    for (ssize_t i = 0; i < count; ++i)
    {
        libusb_device* dev = list[i];
        libusb_device_descriptor desc;
        if (libusb_get_device_descriptor (dev, &desc) != 0) continue;
        if (vid_filter != 0 && desc.idVendor != vid_filter) continue;
        if (pid_filter != 0 && desc.idProduct != pid_filter) continue;

        BulkDeviceInfo info;
        info.vendor_id = desc.idVendor;
        info.product_id = desc.idProduct;
        info.bus_number = libusb_get_bus_number (dev);
        info.device_address = libusb_get_device_address (dev);
        out.push_back (std::move (info));
    }
    libusb_free_device_list (list, 1);
    return out;
#endif
}

} // namespace map2::controller_host::bulk
