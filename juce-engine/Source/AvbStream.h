/*
 * AvbStream.h - IEEE 1722 AVTP AAF (Audio Format) Stream
 *
 * Wraps libavtp for deterministic low-latency audio transport over AVB/TSN Ethernet.
 * Uses AF_PACKET raw sockets with hardware timestamping for <2ms latency.
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#pragma once

#ifdef HAS_AVB

#include "AvbException.h"
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

// Forward declare libavtp types (avoid including libavtp.h in header)
struct avtp_stream_pdu;

namespace Map2Audio {

/**
 * AVB Stream Direction
 */
enum class AvbDirection {
    Talker,   // Transmit audio to network
    Listener  // Receive audio from network
};

/**
 * AVB Stream Configuration
 */
struct AvbStreamConfig {
    std::string interface;           // Network interface (e.g., "enp3s0")
    uint8_t destMac[6];               // Destination MAC address
    uint64_t streamId;                // Unique stream ID
    AvbDirection direction;           // Talker or listener

    uint32_t sampleRate;              // Audio sample rate (Hz)
    uint16_t channels;                // Number of audio channels
    uint16_t bitDepth;                // Bits per sample (16, 24, 32)
    uint16_t samplesPerFrame;         // Samples per AVTP frame

    uint32_t presentationOffsetUs;    // Presentation time offset (microseconds)
    uint8_t priority;                 // 802.1Q priority (3 for AVB Class A)

    bool enableTimestamping;          // Use hardware timestamping
};

/**
 * Plain snapshot of AVB stream statistics (copyable, for return values)
 */
struct AvbStreamStatsSnapshot {
    uint64_t framesSent{0};
    uint64_t framesReceived{0};
    uint64_t sendErrors{0};
    uint64_t receiveErrors{0};
    uint64_t underruns{0};
    uint64_t overruns{0};
    uint64_t timestampErrors{0};
    uint64_t sequenceErrors{0};
    uint64_t bytesTransferred{0};
    int64_t maxLatencyNs{0};
    int64_t minLatencyNs{INT64_MAX};
};

/**
 * AVB Stream Statistics (all atomic for lock-free access)
 */
struct AvbStreamStats {
    std::atomic<uint64_t> framesSent{0};
    std::atomic<uint64_t> framesReceived{0};
    std::atomic<uint64_t> sendErrors{0};
    std::atomic<uint64_t> receiveErrors{0};
    std::atomic<uint64_t> underruns{0};        // Talker buffer underruns
    std::atomic<uint64_t> overruns{0};         // Listener buffer overruns
    std::atomic<uint64_t> timestampErrors{0};
    std::atomic<uint64_t> sequenceErrors{0};   // Out-of-order packets
    std::atomic<uint64_t> bytesTransferred{0};
    std::atomic<int64_t> maxLatencyNs{0};      // Maximum observed latency
    std::atomic<int64_t> minLatencyNs{INT64_MAX};

    AvbStreamStatsSnapshot snapshot() const {
        return {
            framesSent.load(std::memory_order_relaxed),
            framesReceived.load(std::memory_order_relaxed),
            sendErrors.load(std::memory_order_relaxed),
            receiveErrors.load(std::memory_order_relaxed),
            underruns.load(std::memory_order_relaxed),
            overruns.load(std::memory_order_relaxed),
            timestampErrors.load(std::memory_order_relaxed),
            sequenceErrors.load(std::memory_order_relaxed),
            bytesTransferred.load(std::memory_order_relaxed),
            maxLatencyNs.load(std::memory_order_relaxed),
            minLatencyNs.load(std::memory_order_relaxed)
        };
    }

    void reset() {
        framesSent.store(0, std::memory_order_relaxed);
        framesReceived.store(0, std::memory_order_relaxed);
        sendErrors.store(0, std::memory_order_relaxed);
        receiveErrors.store(0, std::memory_order_relaxed);
        underruns.store(0, std::memory_order_relaxed);
        overruns.store(0, std::memory_order_relaxed);
        timestampErrors.store(0, std::memory_order_relaxed);
        sequenceErrors.store(0, std::memory_order_relaxed);
        bytesTransferred.store(0, std::memory_order_relaxed);
        maxLatencyNs.store(0, std::memory_order_relaxed);
        minLatencyNs.store(INT64_MAX, std::memory_order_relaxed);
    }
};

/**
 * IEEE 1722 AVTP AAF Stream Handler
 *
 * Thread safety:
 * - Constructor/destructor: Not thread-safe
 * - sendFrame()/receiveFrame(): RT-safe, called from network thread
 * - getStats(): Lock-free, safe from any thread
 *
 * Exceptions:
 * - Throws AvbException subclasses during construction only
 * - Returns error codes from RT methods (no exceptions)
 */
class AvbStream {
public:
    /**
     * Create AVB stream.
     *
     * Performs all allocations and capability checks upfront.
     * Throws AvbException if:
     * - CAP_NET_RAW capability not available
     * - Socket creation fails
     * - Interface doesn't exist or doesn't support hardware timestamping
     * - libavtp initialization fails
     */
    explicit AvbStream(const AvbStreamConfig& config);

    /**
     * Destructor closes socket and frees resources.
     */
    ~AvbStream();

    // Disable copy/move (owns file descriptor)
    AvbStream(const AvbStream&) = delete;
    AvbStream& operator=(const AvbStream&) = delete;

    /**
     * Send audio frame to network (Talker only).
     *
     * RT-safe: No allocations, no locks, bounded execution time.
     *
     * @param samples Interleaved audio samples (frameSize elements)
     * @param frameSize Number of samples (channels * samplesPerFrame)
     * @param timestamp PTP timestamp (nanoseconds)
     * @return 0 on success, 1 on transient backpressure, negative on hard failure
     */
    int sendFrame(const float* samples, size_t frameSize, uint64_t timestamp);

    /**
     * Receive audio frame from network (Listener only).
     *
     * RT-safe: No allocations, no locks, bounded execution time.
     *
     * @param samples Buffer for interleaved audio samples
     * @param maxFrameSize Maximum samples to read
     * @param actualFrameSize Output: actual samples received
     * @param timestamp Output: PTP timestamp (nanoseconds)
     * @return 0 on success, 1 when no frame is currently available, negative on hard failure
     */
    int receiveFrame(float* samples, size_t maxFrameSize,
                      size_t* actualFrameSize, uint64_t* timestamp);

    /**
     * Get stream statistics (lock-free, safe from any thread).
     */
    AvbStreamStatsSnapshot getStats() const;
    AvbStreamStats& getMutableStats() { return stats_; }

    /**
     * Reset statistics counters.
     */
    void resetStats();

    /**
     * Get stream configuration.
     */
    const AvbStreamConfig& getConfig() const { return config_; }

    /**
     * Check if stream is talker.
     */
    bool isTalker() const { return config_.direction == AvbDirection::Talker; }

    /**
     * Check if stream is listener.
     */
    bool isListener() const { return config_.direction == AvbDirection::Listener; }

private:
    /**
     * Check for CAP_NET_RAW capability.
     * Throws AvbCapabilityException if not available.
     */
    void checkCapabilities();

    /**
     * Create and configure AF_PACKET socket.
     * Throws AvbSocketException on failure.
     */
    void createSocket();

    /**
     * Initialize libavtp stream.
     * Throws AvbException on failure.
     */
    void initializeAvtp();

    /**
     * Configure hardware timestamping.
     * Throws AvbTimestampException if not supported.
     */
    void configureTimestamping();

    /**
     * Convert float samples to AVTP AAF format (internal buffer).
     * Returns number of bytes written to pduBuffer_.
     */
    size_t convertToAvtp(const float* samples, size_t frameSize, uint64_t timestamp);

    /**
     * Convert AVTP AAF format to float samples.
     * Returns number of samples written to output.
     */
    size_t convertFromAvtp(const uint8_t* pdu, size_t pduSize,
                            float* samples, uint64_t* timestamp);

    AvbStreamConfig config_;
    int socketFd_;                           // AF_PACKET socket
    int ifIndex_;                             // Network interface index

    // Pre-allocated buffers (no RT allocation)
    std::vector<uint8_t> pduBuffer_;          // AVTP frame buffer
    size_t maxPduSize_;                       // Maximum PDU size

    // libavtp state
    struct avtp_stream_pdu* avtpStream_;      // Opaque libavtp handle

    // Sequence numbering
    uint8_t sequenceNum_;                     // AVTP sequence counter (0-255)
    uint8_t expectedSequenceNum_;             // Expected next sequence (listener)

    // Statistics
    AvbStreamStats stats_;

    // Configuration validation
    static constexpr size_t MAX_SAMPLES_PER_FRAME = 256;
    static constexpr size_t MAX_CHANNELS = 32;
    static constexpr size_t MAX_PDU_SIZE = 1500;  // Ethernet MTU
};

} // namespace Map2Audio

#endif // HAS_AVB
