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

namespace Map2Audio {

// ============================================================================
// Constructor / Destructor
// ============================================================================

AvbStream::AvbStream(const AvbStreamConfig& config)
    : config_(config)
    , socketFd_(-1)
    , ifIndex_(-1)
    , maxPduSize_(MAX_PDU_SIZE)
    , avtpStream_(nullptr)
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

AvbStream::~AvbStream() {
    if (socketFd_ >= 0) {
        close(socketFd_);
        socketFd_ = -1;
    }

    if (avtpStream_) {
        // libavtp cleanup would go here
        // avtp_stream_destroy(avtpStream_);
        avtpStream_ = nullptr;
    }
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
    // Allocate libavtp stream structure
    // In real implementation:
    // avtpStream_ = avtp_stream_new(AVTP_AAF);
    // if (!avtpStream_) {
    //     throw AvbException("Failed to create AVTP stream");
    // }

    // Configure AVTP AAF parameters
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_STREAM_ID, config_.streamId);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_FORMAT, AVTP_AAF_FORMAT_INT_32BIT);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_NSR, getSampleRateCode(config_.sampleRate));
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_CHAN_PER_FRAME, config_.channels);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_BIT_DEPTH, config_.bitDepth);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_STREAM_DATA_LEN, getFrameDataLen());

    // For now, just allocate a placeholder
    avtpStream_ = reinterpret_cast<struct avtp_stream_pdu*>(new uint8_t[1024]);
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
    // AVTP AAF header setup
    // In real implementation, use libavtp:
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_SEQ_NUM, sequenceNum_);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_TIMESTAMP, timestamp);
    // avtp_aaf_pdu_set(avtpStream_, AVTP_AAF_FIELD_TV, 1); // Timestamp valid

    // Convert float samples to integer format
    const size_t bytesPerSample = config_.bitDepth / 8;
    const size_t payloadSize = frameSize * bytesPerSample;
    const size_t avtpHeaderSize = 24; // AVTP AAF header size

    if (avtpHeaderSize + payloadSize > maxPduSize_) {
        return 0; // PDU too large
    }

    uint8_t* payload = pduBuffer_.data() + avtpHeaderSize;

    // Convert based on bit depth
    if (config_.bitDepth == 32) {
        // Float to 32-bit int (scale by 2^31)
        int32_t* dest = reinterpret_cast<int32_t*>(payload);
        for (size_t i = 0; i < frameSize; ++i) {
            float clamped = std::max(-1.0f, std::min(1.0f, samples[i]));
            dest[i] = htonl(static_cast<int32_t>(clamped * 2147483647.0f));
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

    return avtpHeaderSize + payloadSize;
}

size_t AvbStream::convertFromAvtp(const uint8_t* pdu, size_t pduSize,
                                   float* samples, uint64_t* timestamp) {
    // Parse AVTP AAF header
    // In real implementation, use libavtp:
    // uint64_t streamId, ts;
    // uint8_t seqNum;
    // avtp_aaf_pdu_get(pdu, AVTP_AAF_FIELD_STREAM_ID, &streamId);
    // avtp_aaf_pdu_get(pdu, AVTP_AAF_FIELD_TIMESTAMP, &ts);
    // avtp_aaf_pdu_get(pdu, AVTP_AAF_FIELD_SEQ_NUM, &seqNum);
    // *timestamp = ts;

    // Check sequence number (detect packet loss)
    // if (seqNum != expectedSequenceNum_) {
    //     stats_.sequenceErrors.fetch_add(1, std::memory_order_relaxed);
    // }
    // expectedSequenceNum_ = (seqNum + 1) & 0xFF;

    const size_t avtpHeaderSize = 24;
    if (pduSize < avtpHeaderSize) {
        return 0; // PDU too small
    }

    const uint8_t* payload = pdu + avtpHeaderSize;
    const size_t payloadSize = pduSize - avtpHeaderSize;
    const size_t bytesPerSample = config_.bitDepth / 8;
    const size_t numSamples = payloadSize / bytesPerSample;

    // Convert based on bit depth
    if (config_.bitDepth == 32) {
        const int32_t* src = reinterpret_cast<const int32_t*>(payload);
        for (size_t i = 0; i < numSamples; ++i) {
            samples[i] = static_cast<float>(ntohl(src[i])) / 2147483647.0f;
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
        const int16_t* src = reinterpret_cast<const int16_t*>(payload);
        for (size_t i = 0; i < numSamples; ++i) {
            samples[i] = static_cast<float>(ntohs(src[i])) / 32767.0f;
        }
    }

    return numSamples;
}

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
    stats_.bytesTransferred.store(0, std::memory_order_relaxed);
    stats_.maxLatencyNs.store(0, std::memory_order_relaxed);
    stats_.minLatencyNs.store(INT64_MAX, std::memory_order_relaxed);
}

} // namespace Map2Audio

#endif // HAS_AVB
