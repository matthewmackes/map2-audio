/*
 * AvbStream.cpp - IEEE 1722 AVTP AAF Stream Implementation
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#ifdef HAS_AVB

#include "AvbStream.h"

#include <avtp.h>
#include <avtp_aaf.h>
#include <arpa/inet.h>
#include <linux/if_ether.h>
#include <linux/if_packet.h>
#include <linux/net_tstamp.h>
#include <linux/sockios.h>
#include <net/if.h>
#include <sys/capability.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstring>
#include <algorithm>
#include <chrono>
#include <ctime>
#include <limits>
#include <optional>

namespace Map2Audio {

namespace {

constexpr size_t kAvtpHeaderSize = 24;
constexpr size_t kStreamIdOffset = 4;
constexpr size_t kFormatCodeOffset = 12;
constexpr size_t kNsrCodeOffset = 13;
constexpr size_t kAvtpTimestampOffset = 16;
constexpr size_t kAvtpSequenceOffset = 15;
constexpr size_t kAvtpTimestampValidOffset = 14;
constexpr uint8_t kAvtpTimestampValidBit = 0x80;
constexpr uint8_t kTestModeEnabled = 1;

void writeU64BE(uint8_t* destination, uint64_t value) {
    for (size_t index = 0; index < 8; ++index) {
        destination[index] = static_cast<uint8_t>(value >> (56 - (index * 8)));
    }
}

uint64_t readU64BE(const uint8_t* source) {
    uint64_t value = 0;
    for (size_t index = 0; index < 8; ++index) {
        value = (value << 8) | static_cast<uint64_t>(source[index]);
    }
    return value;
}

std::optional<uint8_t> mapSampleRateToNsrCode(uint32_t sampleRate) {
    switch (sampleRate) {
        case 8000: return 1;
        case 16000: return 2;
        case 32000: return 3;
        case 44100: return 4;
        case 48000: return 5;
        case 88200: return 6;
        case 96000: return 7;
        case 176400: return 8;
        case 192000: return 9;
        default: return std::nullopt;
    }
}

std::optional<uint8_t> mapBitDepthToFormatCode(uint16_t bitDepth) {
    switch (bitDepth) {
        case 16: return 0x10;
        case 24: return 0x18;
        case 32: return 0x20;
        default: return std::nullopt;
    }
}

uint64_t getCurrentPtpTimestampNs() {
#ifdef CLOCK_TAI
    struct timespec ts {};
    if (clock_gettime(CLOCK_TAI, &ts) == 0) {
        return (static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL) +
               static_cast<uint64_t>(ts.tv_nsec);
    }
#endif

    const auto now = std::chrono::system_clock::now().time_since_epoch();
    return std::chrono::duration_cast<std::chrono::nanoseconds>(now).count();
}

void updateLatencyCounters(std::atomic<int64_t>& maxLatencyNs,
                          std::atomic<int64_t>& minLatencyNs,
                          int64_t latencyNs) {
    if (latencyNs < 0) {
        return;
    }

    int64_t currentMax = maxLatencyNs.load(std::memory_order_relaxed);
    while (latencyNs > currentMax &&
           !maxLatencyNs.compare_exchange_weak(currentMax, latencyNs, std::memory_order_release, std::memory_order_relaxed)) {
        // keep retrying
    }

    int64_t currentMin = minLatencyNs.load(std::memory_order_relaxed);
    while (latencyNs < currentMin &&
           !minLatencyNs.compare_exchange_weak(currentMin, latencyNs, std::memory_order_release, std::memory_order_relaxed)) {
        // keep retrying
    }
}

} // namespace

// ============================================================================
// Constructor / Destructor
// ============================================================================

AvbStream::AvbStream(const AvbStreamConfig& config)
    : config_(config)
    , socketFd_(-1)
    , ifIndex_(-1)
    , maxPduSize_(MAX_PDU_SIZE)
    , avtpStream_(nullptr)
    , avtpStorage_(nullptr)
    , sequenceNum_(0)
    , expectedSequenceNum_(0)
{
    // Validate configuration
    if (config_.interface.empty()) {
        throw AvbConfigException("Interface not specified");
    }
    if (config_.channels == 0 || config_.channels > MAX_CHANNELS) {
        throw AvbConfigException("Invalid channel count: " + std::to_string(config_.channels));
    }
    if (config_.samplesPerFrame == 0 || config_.samplesPerFrame > MAX_SAMPLES_PER_FRAME) {
        throw AvbConfigException("Invalid samples per frame: " + std::to_string(config_.samplesPerFrame));
    }
    if (config_.bitDepth != 16 && config_.bitDepth != 24 && config_.bitDepth != 32) {
        throw AvbConfigException("Invalid bit depth (must be 16, 24, or 32): " + std::to_string(config_.bitDepth));
    }

    // Pre-allocate PDU buffer
    pduBuffer_.resize(maxPduSize_);

    // Perform initialization steps (all can throw)
    checkCapabilities();
    createSocket();
    initializeAvtp();

    if (config_.enableTimestamping) {
        try {
            configureTimestamping();
        } catch (const AvbTimestampException& e) {
            // Hardware timestamping not critical - log but continue
            // (In real impl, would use logger)
        }
    }
}

#ifdef BUILD_AVB_TESTS
AvbStream::AvbStream(const AvbStreamConfig& config, int testModeMarker)
    : config_(config)
    , socketFd_(-1)
    , ifIndex_(-1)
    , maxPduSize_(MAX_PDU_SIZE)
    , avtpStream_(nullptr)
    , avtpStorage_(nullptr)
    , sequenceNum_(0)
    , expectedSequenceNum_(0)
{
    if (testModeMarker != kTestModeEnabled) {
        throw AvbConfigException("Invalid test mode marker");
    }

    if (config_.interface.empty()) {
        throw AvbConfigException("Interface not specified");
    }
    if (config_.channels == 0 || config_.channels > MAX_CHANNELS) {
        throw AvbConfigException("Invalid channel count: " + std::to_string(config_.channels));
    }
    if (config_.samplesPerFrame == 0 || config_.samplesPerFrame > MAX_SAMPLES_PER_FRAME) {
        throw AvbConfigException("Invalid samples per frame: " + std::to_string(config_.samplesPerFrame));
    }
    if (config_.bitDepth != 16 && config_.bitDepth != 24 && config_.bitDepth != 32) {
        throw AvbConfigException("Invalid bit depth (must be 16, 24, or 32): " + std::to_string(config_.bitDepth));
    }

    pduBuffer_.resize(maxPduSize_);
    initializeAvtp();
}
#endif

AvbStream::~AvbStream() {
    if (socketFd_ >= 0) {
        close(socketFd_);
        socketFd_ = -1;
    }

    avtpStream_ = nullptr;
    avtpStorage_.reset();
    avtpStorageSize_ = 0;
}

// ============================================================================
// Initialization Methods
// ============================================================================

void AvbStream::checkCapabilities() {
    cap_t caps = cap_get_proc();
    if (!caps) {
        throw AvbCapabilityException("Failed to get process capabilities");
    }

    cap_flag_value_t value;
    if (cap_get_flag(caps, CAP_NET_RAW, CAP_EFFECTIVE, &value) < 0) {
        cap_free(caps);
        throw AvbCapabilityException("Failed to check CAP_NET_RAW");
    }

    cap_free(caps);

    if (value != CAP_SET) {
        throw AvbCapabilityException(
            "CAP_NET_RAW not available. Run with:\n"
            "  sudo setcap cap_net_raw+ep <binary>\n"
            "or add AmbientCapabilities=CAP_NET_RAW to systemd service"
        );
    }
}

void AvbStream::createSocket() {
    // Create AF_PACKET raw socket
    socketFd_ = socket(AF_PACKET, SOCK_DGRAM, htons(ETH_P_TSN));
    if (socketFd_ < 0) {
        throw AvbSocketException("Failed to create AF_PACKET socket: " + std::string(strerror(errno)));
    }

    // Get interface index
    struct ifreq ifr;
    std::memset(&ifr, 0, sizeof(ifr));
    std::strncpy(ifr.ifr_name, config_.interface.c_str(), IFNAMSIZ - 1);

    if (ioctl(socketFd_, SIOCGIFINDEX, &ifr) < 0) {
        close(socketFd_);
        socketFd_ = -1;
        throw AvbSocketException("Failed to get interface index for " + config_.interface + ": " + std::string(strerror(errno)));
    }
    ifIndex_ = ifr.ifr_ifindex;

    // Bind socket to interface
    struct sockaddr_ll addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sll_family = AF_PACKET;
    addr.sll_protocol = htons(ETH_P_TSN);
    addr.sll_ifindex = ifIndex_;
    addr.sll_halen = ETH_ALEN;
    std::memcpy(addr.sll_addr, config_.destMac, ETH_ALEN);

    if (bind(socketFd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        close(socketFd_);
        socketFd_ = -1;
        throw AvbSocketException("Failed to bind socket: " + std::string(strerror(errno)));
    }

    // Set socket priority for 802.1Q traffic class
    int priority = config_.priority;
    if (setsockopt(socketFd_, SOL_SOCKET, SO_PRIORITY, &priority, sizeof(priority)) < 0) {
        // Not critical - continue without priority
    }
}

void AvbStream::initializeAvtp() {
    const auto nsrCode = mapSampleRateToNsrCode(config_.sampleRate);
    if (!nsrCode.has_value()) {
        throw AvbConfigException(
            "Unsupported sample rate for AVTP AAF stream: " + std::to_string(config_.sampleRate));
    }

    const auto formatCode = mapBitDepthToFormatCode(config_.bitDepth);
    if (!formatCode.has_value()) {
        throw AvbConfigException(
            "Unsupported bit depth for AVTP AAF stream: " + std::to_string(config_.bitDepth));
    }

    const size_t bytesPerSample = static_cast<size_t>(config_.bitDepth / 8U);
    const size_t frameDataLen = static_cast<size_t>(config_.samplesPerFrame) *
                                static_cast<size_t>(config_.channels) *
                                bytesPerSample;
    if (frameDataLen == 0) {
        throw AvbConfigException("AVTP frame payload cannot be empty");
    }
    if (kAvtpHeaderSize + frameDataLen > maxPduSize_) {
        throw AvbConfigException(
            "AVTP frame payload exceeds MTU budget (payload=" + std::to_string(frameDataLen) +
            ", max=" + std::to_string(maxPduSize_ - kAvtpHeaderSize) + ")");
    }
    if (frameDataLen > static_cast<size_t>(std::numeric_limits<uint16_t>::max())) {
        throw AvbConfigException(
            "AVTP frame payload exceeds 16-bit stream_data_length field");
    }

    avtpStorageSize_ = kAvtpHeaderSize + frameDataLen;
    avtpStorage_ = std::make_unique<uint8_t[]>(avtpStorageSize_);
    std::memset(avtpStorage_.get(), 0, avtpStorageSize_);
    avtpStream_ = reinterpret_cast<struct avtp_stream_pdu*>(avtpStorage_.get());

    avtpNsrCode_ = nsrCode.value();
    avtpFormatCode_ = formatCode.value();
    avtpStreamDataLen_ = static_cast<uint16_t>(frameDataLen);
    avtpConfiguredStreamId_ = config_.streamId;

    avtpHeaderTemplate_.fill(0);
    avtpHeaderTemplate_[0] = 0x02; // AVTP AAF subtype
    avtpHeaderTemplate_[1] = 0x00;
    avtpHeaderTemplate_[2] = static_cast<uint8_t>(config_.channels & 0xFFU);
    avtpHeaderTemplate_[3] = static_cast<uint8_t>(config_.bitDepth & 0xFFU);
    writeU64BE(avtpHeaderTemplate_.data() + kStreamIdOffset, avtpConfiguredStreamId_);
    avtpHeaderTemplate_[kFormatCodeOffset] = avtpFormatCode_;
    avtpHeaderTemplate_[kNsrCodeOffset] = avtpNsrCode_;
    avtpHeaderTemplate_[kAvtpTimestampValidOffset] = kAvtpTimestampValidBit;
    avtpHeaderTemplate_[kAvtpSequenceOffset] = 0;

    std::memcpy(pduBuffer_.data(), avtpHeaderTemplate_.data(), kAvtpHeaderSize);
}

void AvbStream::configureTimestamping() {
    struct hwtstamp_config hwconfig;
    std::memset(&hwconfig, 0, sizeof(hwconfig));

    if (config_.direction == AvbDirection::Talker) {
        hwconfig.tx_type = HWTSTAMP_TX_ON;
        hwconfig.rx_filter = HWTSTAMP_FILTER_NONE;
    } else {
        hwconfig.tx_type = HWTSTAMP_TX_OFF;
        hwconfig.rx_filter = HWTSTAMP_FILTER_ALL;
    }

    struct ifreq ifr;
    std::memset(&ifr, 0, sizeof(ifr));
    std::strncpy(ifr.ifr_name, config_.interface.c_str(), IFNAMSIZ - 1);
    ifr.ifr_data = reinterpret_cast<char*>(&hwconfig);

    if (ioctl(socketFd_, SIOCSHWTSTAMP, &ifr) < 0) {
        throw AvbTimestampException("Hardware timestamping not supported on " + config_.interface);
    }

    // Enable SO_TIMESTAMPING on socket
    int flags = SOF_TIMESTAMPING_TX_HARDWARE |
                SOF_TIMESTAMPING_RX_HARDWARE |
                SOF_TIMESTAMPING_RAW_HARDWARE;

    if (setsockopt(socketFd_, SOL_SOCKET, SO_TIMESTAMPING, &flags, sizeof(flags)) < 0) {
        throw AvbTimestampException("Failed to enable SO_TIMESTAMPING");
    }
}

// ============================================================================
// Real-Time Send/Receive Methods
// ============================================================================

int AvbStream::sendFrame(const float* samples, size_t frameSize, uint64_t timestamp) {
    if (!isTalker()) {
        stats_.sendErrors.fetch_add(1, std::memory_order_relaxed);
        return -1; // Not a talker stream
    }

    if (timestamp == 0) {
        stats_.timestampErrors.fetch_add(1, std::memory_order_relaxed);
    }

    // Convert samples to AVTP AAF PDU
    size_t pduSize = convertToAvtp(samples, frameSize, timestamp);
    if (pduSize == 0) {
        stats_.sendErrors.fetch_add(1, std::memory_order_relaxed);
        return -2; // Conversion failed
    }

    // Send PDU via raw socket
    ssize_t sent = send(socketFd_, pduBuffer_.data(), pduSize, MSG_DONTWAIT);
    if (sent < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            return 1; // Transient backpressure (not a hard error)
        }
        stats_.sendErrors.fetch_add(1, std::memory_order_relaxed);
        return -3; // Send failed
    }

    // Update stats
    stats_.framesSent.fetch_add(1, std::memory_order_relaxed);
    stats_.bytesTransferred.fetch_add(sent, std::memory_order_relaxed);

    // Increment sequence number (wraps at 256)
    sequenceNum_ = (sequenceNum_ + 1) & 0xFF;

    return 0; // Success
}

int AvbStream::receiveFrame(float* samples, size_t maxFrameSize,
                             size_t* actualFrameSize, uint64_t* timestamp) {
    if (!isListener()) {
        stats_.receiveErrors.fetch_add(1, std::memory_order_relaxed);
        return -1; // Not a listener stream
    }

    // Receive PDU from raw socket
    ssize_t received = recv(socketFd_, pduBuffer_.data(), maxPduSize_, MSG_DONTWAIT);
    if (received < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            return 1; // No packet available yet
        }
        stats_.receiveErrors.fetch_add(1, std::memory_order_relaxed);
        return -2; // Receive failed
    }

    // Convert AVTP AAF PDU to samples
    size_t samplesRead = convertFromAvtp(pduBuffer_.data(), received, samples, timestamp);
    if (samplesRead == 0) {
        stats_.receiveErrors.fetch_add(1, std::memory_order_relaxed);
        return -3; // Conversion failed
    }

    *actualFrameSize = samplesRead;

    // Update stats
    stats_.framesReceived.fetch_add(1, std::memory_order_relaxed);
    stats_.bytesTransferred.fetch_add(received, std::memory_order_relaxed);

    return 0; // Success
}

// ============================================================================
// Sample Conversion Methods
// ============================================================================

size_t AvbStream::convertToAvtp(const float* samples, size_t frameSize, uint64_t timestamp) {
    if (avtpStream_ == nullptr || !avtpStorage_) {
        return 0;
    }

    // Convert float samples to integer format
    const size_t bytesPerSample = config_.bitDepth / 8;
    const size_t payloadSize = frameSize * bytesPerSample;
    const size_t avtpHeaderSize = kAvtpHeaderSize; // AVTP AAF header size

    if (avtpHeaderSize + payloadSize > maxPduSize_) {
        return 0; // PDU too large
    }

    uint8_t* header = pduBuffer_.data();
    uint8_t* payload = pduBuffer_.data() + avtpHeaderSize;

    std::memcpy(header, avtpHeaderTemplate_.data(), avtpHeaderSize);

    // Convert based on bit depth
    if (config_.bitDepth == 32) {
        // Float to signed 32-bit sample in network byte order.
        uint32_t* dest = reinterpret_cast<uint32_t*>(payload);
        for (size_t i = 0; i < frameSize; ++i) {
            const double clamped = std::max(-1.0, std::min(1.0, static_cast<double>(samples[i])));
            const int32_t sample32 = static_cast<int32_t>(clamped * 2147483647.0);
            dest[i] = htonl(static_cast<uint32_t>(sample32));
        }
    } else if (config_.bitDepth == 24) {
        // Float to 24-bit int (scale by 2^23)
        for (size_t i = 0; i < frameSize; ++i) {
            float clamped = std::max(-1.0f, std::min(1.0f, samples[i]));
            int32_t sample24 = static_cast<int32_t>(clamped * 8388607.0f);
            // Store as big-endian 24-bit (3 bytes)
            payload[i * 3 + 0] = (sample24 >> 16) & 0xFF;
            payload[i * 3 + 1] = (sample24 >> 8) & 0xFF;
            payload[i * 3 + 2] = sample24 & 0xFF;
        }
    } else { // 16-bit
        // Float to 16-bit int (scale by 2^15)
        int16_t* dest = reinterpret_cast<int16_t*>(payload);
        for (size_t i = 0; i < frameSize; ++i) {
            float clamped = std::max(-1.0f, std::min(1.0f, samples[i]));
            dest[i] = htons(static_cast<int16_t>(clamped * 32767.0f));
        }
    }

    header[kAvtpTimestampValidOffset] = kAvtpTimestampValidBit;
    writeU64BE(header + kAvtpTimestampOffset, timestamp);
    header[kAvtpSequenceOffset] = sequenceNum_;

    return avtpHeaderSize + payloadSize;
}

size_t AvbStream::convertFromAvtp(const uint8_t* pdu, size_t pduSize,
                                   float* samples, uint64_t* timestamp) {
    if (avtpStream_ == nullptr || !avtpStorage_) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0;
    }

    const size_t avtpHeaderSize = kAvtpHeaderSize;
    if (pduSize < avtpHeaderSize) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0; // PDU too small
    }

    const uint64_t packetStreamId = readU64BE(pdu + kStreamIdOffset);
    if (packetStreamId != avtpConfiguredStreamId_) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0;
    }

    if (pdu[kFormatCodeOffset] != avtpFormatCode_ || pdu[kNsrCodeOffset] != avtpNsrCode_) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0;
    }

    const uint8_t packetFlags = pdu[kAvtpTimestampValidOffset];
    const uint8_t packetSequence = pdu[kAvtpSequenceOffset];
    const uint64_t packetTimestamp = readU64BE(pdu + kAvtpTimestampOffset);
    if (timestamp != nullptr) {
        *timestamp = packetTimestamp;
    }

    if ((packetFlags & kAvtpTimestampValidBit) == 0 || packetTimestamp == 0) {
        stats_.timestampErrors.fetch_add(1, std::memory_order_relaxed);
    }

    if (packetSequence != expectedSequenceNum_) {
        stats_.sequenceErrors.fetch_add(1, std::memory_order_relaxed);
        stats_.sequenceGapEvents.fetch_add(1, std::memory_order_relaxed);
    }
    expectedSequenceNum_ = static_cast<uint8_t>(packetSequence + 1);

    if (packetTimestamp != 0) {
        const uint64_t nowNs = getCurrentPtpTimestampNs();
        const int64_t packetLatencyNs = static_cast<int64_t>(nowNs - packetTimestamp);
        updateLatencyCounters(stats_.maxLatencyNs, stats_.minLatencyNs, packetLatencyNs);

        // Flag skew when latency deviates significantly from configured offset (2x guard)
        const int64_t skewThresholdNs = static_cast<int64_t>(config_.presentationOffsetUs) * 1000LL * 2;
        if (std::llabs(packetLatencyNs) > skewThresholdNs) {
            stats_.timestampSkewEvents.fetch_add(1, std::memory_order_relaxed);
            auto prev = stats_.maxTimestampSkewNs.load(std::memory_order_relaxed);
            if (std::llabs(packetLatencyNs) > prev) {
                stats_.maxTimestampSkewNs.store(std::llabs(packetLatencyNs), std::memory_order_relaxed);
            }
        }
    }

    const uint8_t* payload = pdu + avtpHeaderSize;
    const size_t payloadSize = pduSize - avtpHeaderSize;
    const size_t bytesPerSample = config_.bitDepth / 8;

    // Fail closed when payload is not sample-aligned to configured bit depth.
    if ((payloadSize % bytesPerSample) != 0) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0;
    }

    const size_t numSamples = payloadSize / bytesPerSample;

    if (numSamples == 0) {
        stats_.decodeErrors.fetch_add(1, std::memory_order_relaxed);
        return 0;
    }

    // Convert based on bit depth
    if (config_.bitDepth == 32) {
        const uint32_t* src = reinterpret_cast<const uint32_t*>(payload);
        for (size_t i = 0; i < numSamples; ++i) {
            const int32_t sample32 = static_cast<int32_t>(ntohl(src[i]));
            samples[i] = static_cast<float>(sample32) / 2147483647.0f;
        }
    } else if (config_.bitDepth == 24) {
        for (size_t i = 0; i < numSamples; ++i) {
            // Read big-endian 24-bit
            int32_t sample24 = (static_cast<int32_t>(payload[i * 3 + 0]) << 16) |
                               (static_cast<int32_t>(payload[i * 3 + 1]) << 8) |
                               static_cast<int32_t>(payload[i * 3 + 2]);
            // Sign-extend from 24-bit to 32-bit
            if (sample24 & 0x800000) {
                sample24 |= 0xFF000000;
            }
            samples[i] = static_cast<float>(sample24) / 8388607.0f;
        }
    } else { // 16-bit
        const uint16_t* src = reinterpret_cast<const uint16_t*>(payload);
        for (size_t i = 0; i < numSamples; ++i) {
            const int16_t sample16 = static_cast<int16_t>(ntohs(src[i]));
            samples[i] = static_cast<float>(sample16) / 32767.0f;
        }
    }

    return numSamples;
}

// ============================================================================
// Test Helpers
// ============================================================================

#ifdef BUILD_AVB_TESTS
size_t AvbStream::buildAvtpPacketForTest(const float* samples, size_t frameSize, uint64_t timestamp,
                                        uint8_t sequenceOverride, uint8_t* buffer, size_t bufferSize) {
    const uint8_t previousSequence = sequenceNum_;
    sequenceNum_ = sequenceOverride;

    const size_t packedSize = convertToAvtp(samples, frameSize, timestamp);
    sequenceNum_ = previousSequence;

    if (packedSize == 0 || packedSize > bufferSize || buffer == nullptr) {
        return 0;
    }

    std::memcpy(buffer, pduBuffer_.data(), packedSize);
    return packedSize;
}

size_t AvbStream::decodeAvtpPacketForTest(const uint8_t* packet, size_t packetSize,
                                         float* samples, size_t maxSamples, uint64_t* timestamp) {
    if (packet == nullptr || samples == nullptr || maxSamples == 0) {
        return 0;
    }

    const size_t samplesRead = convertFromAvtp(packet, packetSize, samples, timestamp);
    return std::min(samplesRead, maxSamples);
}
#endif

// ============================================================================
// Statistics Methods
// ============================================================================

AvbStreamStatsSnapshot AvbStream::getStats() const {
    return stats_.snapshot();
}

void AvbStream::resetStats() {
    stats_.framesSent.store(0, std::memory_order_relaxed);
    stats_.framesReceived.store(0, std::memory_order_relaxed);
    stats_.sendErrors.store(0, std::memory_order_relaxed);
    stats_.receiveErrors.store(0, std::memory_order_relaxed);
    stats_.underruns.store(0, std::memory_order_relaxed);
    stats_.overruns.store(0, std::memory_order_relaxed);
    stats_.timestampErrors.store(0, std::memory_order_relaxed);
    stats_.sequenceErrors.store(0, std::memory_order_relaxed);
    stats_.sequenceGapEvents.store(0, std::memory_order_relaxed);
    stats_.timestampSkewEvents.store(0, std::memory_order_relaxed);
    stats_.decodeErrors.store(0, std::memory_order_relaxed);
    stats_.maxTimestampSkewNs.store(0, std::memory_order_relaxed);
    stats_.bytesTransferred.store(0, std::memory_order_relaxed);
    stats_.maxLatencyNs.store(0, std::memory_order_relaxed);
    stats_.minLatencyNs.store(INT64_MAX, std::memory_order_relaxed);
}

} // namespace Map2Audio

#endif // HAS_AVB
