/*
 * AvbRingBuffer.h - Lock-free SPSC ring buffer for AVB audio transport
 *
 * Single Producer Single Consumer ring buffer designed for real-time audio.
 * No locks, no allocations in push/pop, wait-free for single reader/writer.
 */

#pragma once

#include <atomic>
#include <cstring>
#include <memory>

namespace Map2Audio {

/**
 * Lock-free SPSC (Single Producer Single Consumer) ring buffer.
 *
 * Safe for one writer thread and one reader thread without locks.
 * Power-of-2 size for efficient modulo via bitwise AND.
 *
 * Thread safety:
 * - push() called only by producer thread (e.g., JUCE audio callback)
 * - pop() called only by consumer thread (e.g., AVB network thread)
 * - size() and available() safe from any thread (atomic operations)
 */
template <typename T>
class AvbRingBuffer {
public:
    /**
     * Create ring buffer with given capacity (must be power of 2).
     * Allocates memory upfront - no RT allocations during push/pop.
     */
    explicit AvbRingBuffer(size_t capacity)
        : capacity_(roundUpToPowerOf2(capacity))
        , mask_(capacity_ - 1)
        , buffer_(new T[capacity_])
        , writeIndex_(0)
        , readIndex_(0)
    {
    }

    ~AvbRingBuffer() = default;

    // Disable copy/move (contains atomic members)
    AvbRingBuffer(const AvbRingBuffer&) = delete;
    AvbRingBuffer& operator=(const AvbRingBuffer&) = delete;

    /**
     * Push single element (producer thread only).
     * Returns false if buffer is full (element not written).
     */
    bool push(const T& item) {
        const size_t writeIdx = writeIndex_.load(std::memory_order_relaxed);
        const size_t nextWriteIdx = (writeIdx + 1) & mask_;

        // Check if buffer is full
        if (nextWriteIdx == readIndex_.load(std::memory_order_acquire)) {
            return false; // Full
        }

        buffer_[writeIdx] = item;
        writeIndex_.store(nextWriteIdx, std::memory_order_release);
        return true;
    }

    /**
     * Pop single element (consumer thread only).
     * Returns false if buffer is empty.
     */
    bool pop(T& item) {
        const size_t readIdx = readIndex_.load(std::memory_order_relaxed);

        // Check if buffer is empty
        if (readIdx == writeIndex_.load(std::memory_order_acquire)) {
            return false; // Empty
        }

        item = buffer_[readIdx];
        const size_t nextReadIdx = (readIdx + 1) & mask_;
        readIndex_.store(nextReadIdx, std::memory_order_release);
        return true;
    }

    /**
     * Write multiple elements (producer thread only).
     * Returns number of elements actually written (may be less than count if full).
     */
    size_t write(const T* items, size_t count) {
        const size_t writeIdx = writeIndex_.load(std::memory_order_relaxed);
        const size_t readIdx = readIndex_.load(std::memory_order_acquire);

        const size_t available = availableToWrite(writeIdx, readIdx);
        const size_t toWrite = std::min(count, available);

        if (toWrite == 0) {
            return 0;
        }

        // Write in up to two chunks (handle wraparound)
        const size_t chunk1Size = std::min(toWrite, capacity_ - writeIdx);
        std::memcpy(&buffer_[writeIdx], items, chunk1Size * sizeof(T));

        if (toWrite > chunk1Size) {
            const size_t chunk2Size = toWrite - chunk1Size;
            std::memcpy(&buffer_[0], items + chunk1Size, chunk2Size * sizeof(T));
        }

        const size_t nextWriteIdx = (writeIdx + toWrite) & mask_;
        writeIndex_.store(nextWriteIdx, std::memory_order_release);
        return toWrite;
    }

    /**
     * Read multiple elements (consumer thread only).
     * Returns number of elements actually read (may be less than count if empty).
     */
    size_t read(T* items, size_t count) {
        const size_t readIdx = readIndex_.load(std::memory_order_relaxed);
        const size_t writeIdx = writeIndex_.load(std::memory_order_acquire);

        const size_t available = availableToRead(readIdx, writeIdx);
        const size_t toRead = std::min(count, available);

        if (toRead == 0) {
            return 0;
        }

        // Read in up to two chunks (handle wraparound)
        const size_t chunk1Size = std::min(toRead, capacity_ - readIdx);
        std::memcpy(items, &buffer_[readIdx], chunk1Size * sizeof(T));

        if (toRead > chunk1Size) {
            const size_t chunk2Size = toRead - chunk1Size;
            std::memcpy(items + chunk1Size, &buffer_[0], chunk2Size * sizeof(T));
        }

        const size_t nextReadIdx = (readIdx + toRead) & mask_;
        readIndex_.store(nextReadIdx, std::memory_order_release);
        return toRead;
    }

    /**
     * Get number of elements currently in buffer (any thread).
     */
    size_t size() const {
        const size_t writeIdx = writeIndex_.load(std::memory_order_acquire);
        const size_t readIdx = readIndex_.load(std::memory_order_acquire);
        return (writeIdx - readIdx) & mask_;
    }

    /**
     * Get number of free slots (any thread).
     */
    size_t available() const {
        return capacity_ - 1 - size(); // -1 because we can't fill completely
    }

    /**
     * Check if buffer is empty (any thread).
     */
    bool empty() const {
        return readIndex_.load(std::memory_order_acquire) ==
               writeIndex_.load(std::memory_order_acquire);
    }

    /**
     * Get buffer capacity.
     */
    size_t capacity() const {
        return capacity_ - 1; // Actual usable capacity (one slot reserved)
    }

    /**
     * Reset buffer to empty state (NOT thread-safe - call only when no concurrent access).
     */
    void reset() {
        writeIndex_.store(0, std::memory_order_relaxed);
        readIndex_.store(0, std::memory_order_relaxed);
    }

private:
    /**
     * Round up to next power of 2.
     */
    static size_t roundUpToPowerOf2(size_t n) {
        if (n == 0) return 1;
        n--;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        n |= n >> 32;
        return n + 1;
    }

    /**
     * Calculate available space for writing.
     */
    size_t availableToWrite(size_t writeIdx, size_t readIdx) const {
        // Can't fill completely (one slot reserved to distinguish full/empty)
        return ((readIdx - writeIdx - 1) & mask_);
    }

    /**
     * Calculate available elements for reading.
     */
    size_t availableToRead(size_t readIdx, size_t writeIdx) const {
        return ((writeIdx - readIdx) & mask_);
    }

    const size_t capacity_;           // Power-of-2 capacity
    const size_t mask_;                // capacity - 1, for fast modulo
    std::unique_ptr<T[]> buffer_;      // Pre-allocated buffer

    alignas(64) std::atomic<size_t> writeIndex_;  // Cache line aligned
    alignas(64) std::atomic<size_t> readIndex_;   // Prevent false sharing
};

} // namespace Map2Audio
