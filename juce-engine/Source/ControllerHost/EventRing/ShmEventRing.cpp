// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ShmEventRing implementation.
// Worklist: T2459-H1

#include "ShmEventRing.h"

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <ctime>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

namespace map2::controller_host {

namespace {

constexpr bool isPowerOfTwo (std::size_t n) noexcept
{
    return n > 0 && (n & (n - 1)) == 0;
}

} // namespace

std::uint64_t monotonicNanos() noexcept
{
    timespec ts {};
    clock_gettime (CLOCK_MONOTONIC, &ts);
    return static_cast<std::uint64_t> (ts.tv_sec) * 1'000'000'000ull
         + static_cast<std::uint64_t> (ts.tv_nsec);
}

ShmEventRing::ShmEventRing() = default;

ShmEventRing::~ShmEventRing()
{
    close();
}

std::size_t ShmEventRing::slotIndex (std::uint64_t cursor) const noexcept
{
    // Capacity is power of two, so this masks instead of dividing.
    return static_cast<std::size_t> (cursor & (header_->capacity - 1));
}

bool ShmEventRing::open (const std::string& shmName, std::size_t capacity, Mode mode)
{
    if (mapped_ != nullptr)
    {
        errorMessage_ = "ring already open";
        return false;
    }
    if (mode == Mode::CreateOwned && ! isPowerOfTwo (capacity))
    {
        errorMessage_ = "capacity must be power of two when creating";
        return false;
    }

    shmName_ = shmName;
    mode_    = mode;

    int oflag = (mode == Mode::CreateOwned) ? (O_CREAT | O_RDWR) : O_RDWR;
    // O_EXCL is too strict — a stale shm from a crashed prior host would
    // make startup fail. Instead, in CreateOwned mode we unlink first
    // (best-effort) and then create.
    if (mode == Mode::CreateOwned)
        ::shm_unlink (shmName.c_str());

    fd_ = ::shm_open (shmName.c_str(), oflag, 0660);
    if (fd_ < 0)
    {
        errorMessage_ = std::string("shm_open failed: ") + std::strerror (errno);
        return false;
    }

    if (mode == Mode::CreateOwned)
    {
        totalSize_ = sizeof (Header) + capacity * sizeof (Slot);
        if (::ftruncate (fd_, static_cast<off_t> (totalSize_)) != 0)
        {
            errorMessage_ = std::string("ftruncate failed: ") + std::strerror (errno);
            ::close (fd_);
            fd_ = -1;
            return false;
        }
    }
    else
    {
        struct stat st {};
        if (::fstat (fd_, &st) != 0 || st.st_size < static_cast<off_t> (sizeof (Header)))
        {
            errorMessage_ = "shm region too small or fstat failed";
            ::close (fd_);
            fd_ = -1;
            return false;
        }
        totalSize_ = static_cast<std::size_t> (st.st_size);
    }

    mapped_ = ::mmap (nullptr, totalSize_, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
    if (mapped_ == MAP_FAILED)
    {
        errorMessage_ = std::string("mmap failed: ") + std::strerror (errno);
        mapped_ = nullptr;
        ::close (fd_);
        fd_ = -1;
        return false;
    }

    header_ = static_cast<Header*> (mapped_);
    slots_  = reinterpret_cast<Slot*> (static_cast<std::uint8_t*> (mapped_) + sizeof (Header));

    if (mode == Mode::CreateOwned)
    {
        // Zero the header explicitly. mmap on a freshly-truncated shm fd
        // does give zero pages on Linux, but we don't depend on that.
        std::memset (mapped_, 0, totalSize_);
        header_->writeIndex.store (0, std::memory_order_release);
        header_->readIndex.store (0, std::memory_order_release);
        header_->capacity     = capacity;
        header_->droppedCount.store (0, std::memory_order_release);
    }
    else
    {
        // Validate the header looks plausible — capacity must be power of
        // two and the file must be sized to header + capacity*slot.
        const std::size_t cap = static_cast<std::size_t> (header_->capacity);
        if (cap == 0 || ! isPowerOfTwo (cap))
        {
            errorMessage_ = "ring header capacity invalid (not power of two)";
            ::munmap (mapped_, totalSize_);
            mapped_ = nullptr;
            ::close (fd_);
            fd_ = -1;
            return false;
        }
        const std::size_t expectedSize = sizeof (Header) + cap * sizeof (Slot);
        if (totalSize_ < expectedSize)
        {
            errorMessage_ = "ring shm size smaller than capacity*slot would require";
            ::munmap (mapped_, totalSize_);
            mapped_ = nullptr;
            ::close (fd_);
            fd_ = -1;
            return false;
        }
    }

    errorMessage_.clear();
    return true;
}

void ShmEventRing::close()
{
    if (mapped_ != nullptr)
    {
        ::munmap (mapped_, totalSize_);
        mapped_ = nullptr;
    }
    if (fd_ >= 0)
    {
        ::close (fd_);
        fd_ = -1;
    }
    if (mode_ == Mode::CreateOwned && ! shmName_.empty())
    {
        ::shm_unlink (shmName_.c_str());
    }
    header_ = nullptr;
    slots_  = nullptr;
    totalSize_ = 0;
}

bool ShmEventRing::push (std::uint64_t tsNanos,
                         const std::uint8_t* payload,
                         std::size_t length,
                         std::uint16_t controllerIndex) noexcept
{
    if (mapped_ == nullptr || length == 0 || length > kMaxPayloadBytes || payload == nullptr)
        return false;

    const std::uint64_t write = header_->writeIndex.load (std::memory_order_relaxed);
    const std::uint64_t read  = header_->readIndex.load (std::memory_order_acquire);
    if (write - read >= header_->capacity)
    {
        // Ring full; drop and bump the diagnostic counter.
        header_->droppedCount.fetch_add (1, std::memory_order_relaxed);
        return false;
    }

    Slot& slot = slots_[slotIndex (write)];
    // Mark the slot in-progress with length=0 so a partial write isn't
    // racy if the consumer starts reading before we publish writeIndex.
    slot.length.store (0, std::memory_order_relaxed);
    slot.tsNanos.store (tsNanos, std::memory_order_relaxed);
    slot.controllerIndex = controllerIndex;
    std::memcpy (slot.payload, payload, length);
    // Publish length last; consumer reads length acquire and sees the
    // payload bytes (and controllerIndex) that were stored before it.
    slot.length.store (static_cast<std::uint16_t> (length), std::memory_order_release);

    header_->writeIndex.store (write + 1, std::memory_order_release);
    return true;
}

std::size_t ShmEventRing::pop (std::uint64_t* outTsNanos,
                               std::uint8_t*  outPayload,
                               std::size_t    outPayloadCapacity,
                               std::uint16_t* outControllerIndex) noexcept
{
    if (mapped_ == nullptr || outPayload == nullptr || outPayloadCapacity == 0)
        return 0;

    const std::uint64_t read  = header_->readIndex.load (std::memory_order_relaxed);
    const std::uint64_t write = header_->writeIndex.load (std::memory_order_acquire);
    if (read == write)
        return 0;

    Slot& slot = slots_[slotIndex (read)];
    const std::size_t len = slot.length.load (std::memory_order_acquire);
    if (len == 0 || len > kMaxPayloadBytes)
    {
        // Producer hasn't finished publishing; treat as empty for now.
        return 0;
    }
    const std::size_t copyLen = std::min (len, outPayloadCapacity);
    if (outTsNanos != nullptr)
        *outTsNanos = slot.tsNanos.load (std::memory_order_relaxed);
    if (outControllerIndex != nullptr)
        *outControllerIndex = slot.controllerIndex;
    std::memcpy (outPayload, slot.payload, copyLen);

    header_->readIndex.store (read + 1, std::memory_order_release);
    return copyLen;
}

std::uint64_t ShmEventRing::droppedCount() const noexcept
{
    if (header_ == nullptr) return 0;
    return header_->droppedCount.load (std::memory_order_relaxed);
}

std::size_t ShmEventRing::capacity() const noexcept
{
    if (header_ == nullptr) return 0;
    return header_->capacity;
}

} // namespace map2::controller_host
