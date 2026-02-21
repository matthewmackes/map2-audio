/**
 * AVDECC Entity Implementation (IEEE 1722.1)
 */

#ifdef HAS_AVDECC

#include "AvdeccEntity.h"
#include "AvdeccEnumerator.h"
#ifdef HAS_AVB
#include "AvbStream.h"
#endif
#include <arpa/inet.h>
#include <linux/if_ether.h>
#include <linux/if_packet.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstring>
#include <random>

namespace Map2Audio {

// ============================================================================
// Helper Functions
// ============================================================================

namespace {

// Convert MAC address to Entity ID (EUI-64)
uint64_t macToEui64(const std::array<uint8_t, 6>& mac) {
    uint64_t eui64 = 0;
    eui64 |= static_cast<uint64_t>(mac[0]) << 56;
    eui64 |= static_cast<uint64_t>(mac[1]) << 48;
    eui64 |= static_cast<uint64_t>(mac[2]) << 40;
    eui64 |= 0xFFFE000000ULL;  // Insert FFFE per IEEE EUI-64
    eui64 |= static_cast<uint64_t>(mac[3]) << 16;
    eui64 |= static_cast<uint64_t>(mac[4]) << 8;
    eui64 |= static_cast<uint64_t>(mac[5]);
    return eui64;
}

// Get MAC address from interface name
bool fetchMacAddress(const std::string& interface, std::array<uint8_t, 6>& mac) {
    int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) {
        return false;
    }

    struct ifreq ifr;
    std::strncpy(ifr.ifr_name, interface.c_str(), IFNAMSIZ - 1);
    ifr.ifr_name[IFNAMSIZ - 1] = '\0';

    if (ioctl(fd, SIOCGIFHWADDR, &ifr) < 0) {
        close(fd);
        return false;
    }

    std::memcpy(mac.data(), ifr.ifr_hwaddr.sa_data, 6);
    close(fd);
    return true;
}

// Get interface index
int getInterfaceIndex(const std::string& interface) {
    int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) {
        return -1;
    }

    struct ifreq ifr;
    std::strncpy(ifr.ifr_name, interface.c_str(), IFNAMSIZ - 1);
    ifr.ifr_name[IFNAMSIZ - 1] = '\0';

    if (ioctl(fd, SIOCGIFINDEX, &ifr) < 0) {
        close(fd);
        return -1;
    }

    int index = ifr.ifr_ifindex;
    close(fd);
    return index;
}

// Write uint16_t in network byte order
void writeU16(uint8_t* dest, uint16_t value) {
    dest[0] = (value >> 8) & 0xFF;
    dest[1] = value & 0xFF;
}

// Write uint32_t in network byte order
void writeU32(uint8_t* dest, uint32_t value) {
    dest[0] = (value >> 24) & 0xFF;
    dest[1] = (value >> 16) & 0xFF;
    dest[2] = (value >> 8) & 0xFF;
    dest[3] = value & 0xFF;
}

// Write uint64_t in network byte order
void writeU64(uint8_t* dest, uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        dest[i] = (value >> (56 - i * 8)) & 0xFF;
    }
}

// Read uint16_t from network byte order
uint16_t readU16(const uint8_t* src) {
    return (static_cast<uint16_t>(src[0]) << 8) |
           static_cast<uint16_t>(src[1]);
}

// Read uint32_t from network byte order
uint32_t readU32(const uint8_t* src) {
    return (static_cast<uint32_t>(src[0]) << 24) |
           (static_cast<uint32_t>(src[1]) << 16) |
           (static_cast<uint32_t>(src[2]) << 8) |
           static_cast<uint32_t>(src[3]);
}

// Read uint64_t from network byte order
uint64_t readU64(const uint8_t* src) {
    uint64_t value = 0;
    for (int i = 0; i < 8; ++i) {
        value |= static_cast<uint64_t>(src[i]) << (56 - i * 8);
    }
    return value;
}

} // anonymous namespace

// Helper: juce::Thread subclass that runs a std::function
class LambdaThread : public juce::Thread {
public:
    LambdaThread(const juce::String& name, std::function<void()> fn)
        : juce::Thread(name), func_(std::move(fn)) {}
    void run() override { func_(); }
private:
    std::function<void()> func_;
};

// ============================================================================
// AvdeccEntity Implementation
// ============================================================================

AvdeccEntity::AvdeccEntity(const juce::String& interfaceName,
                           const juce::String& entityName,
                           uint16_t talkerStreams,
                           uint16_t listenerStreams)
    : interface_name_(interfaceName),
      entity_name_(entityName),
      entity_id_(0),
      entity_model_id_(0x0001020304050607ULL),  // Placeholder model ID
      talker_stream_sources_(talkerStreams),
      listener_stream_sinks_(listenerStreams),
      entity_capabilities_(0),
      talker_capabilities_(0),
      listener_capabilities_(0),
      gptp_grandmaster_id_(0),
      gptp_domain_number_(0),
      socket_fd_(-1),
      running_(false)
{
    // Get MAC address from interface
    if (!fetchMacAddress(interfaceName.toStdString(), mac_address_)) {
        jassertfalse;
        DBG("Failed to get MAC address for interface: " << interfaceName);
        return;
    }

    // Generate Entity ID from MAC
    entity_id_ = macToEui64(mac_address_);

    // Set capabilities
    entity_capabilities_ =
        static_cast<uint32_t>(Avdecc::EntityCapability::AEM_SUPPORTED) |
        static_cast<uint32_t>(Avdecc::EntityCapability::GPTP_SUPPORTED) |
        static_cast<uint32_t>(Avdecc::EntityCapability::CLASS_A_SUPPORTED);

    if (talkerStreams > 0) {
        talker_capabilities_ =
            static_cast<uint16_t>(Avdecc::TalkerCapability::IMPLEMENTED) |
            static_cast<uint16_t>(Avdecc::TalkerCapability::AUDIO_SOURCE);
    }

    if (listenerStreams > 0) {
        listener_capabilities_ =
            static_cast<uint16_t>(Avdecc::ListenerCapability::IMPLEMENTED) |
            static_cast<uint16_t>(Avdecc::ListenerCapability::AUDIO_SINK);
    }

    // Phase 10: Initialize enumerator
    enumerator_ = std::make_unique<Avdecc::AvdeccEnumerator>();

    // Set send function for AECP commands (placeholder - will be implemented when AECP TX is ready)
    enumerator_->setSendFunction([this](const void* data, size_t length) {
        // TODO: Implement AECP command sending via sendAecpCommand()
        // For now, enumeration requests will be queued but not sent
        return true;  // Placeholder
    });
}

AvdeccEntity::~AvdeccEntity() {
    stop();
}

bool AvdeccEntity::start() {
    if (running_.load(std::memory_order_acquire)) {
        return true;  // Already running
    }

    if (!createSocket()) {
        DBG("Failed to create AVDECC socket");
        return false;
    }

    running_.store(true, std::memory_order_release);

    // Start threads
    adp_thread_ = std::make_unique<LambdaThread>("AVDECC ADP", [this]() { adpThread(); });
    adp_thread_->startThread();

    acmp_thread_ = std::make_unique<LambdaThread>("AVDECC ACMP", [this]() { acmpThread(); });
    acmp_thread_->startThread();

    receive_thread_ = std::make_unique<LambdaThread>("AVDECC RX", [this]() { receiveThread(); });
    receive_thread_->startThread();

    // Send initial entity available
    sendEntityAvailable();

    DBG("AVDECC Entity started: " << juce::String::toHexString(entity_id_));
    return true;
}

void AvdeccEntity::stop() {
    if (!running_.load(std::memory_order_acquire)) {
        return;
    }

    // Send entity departing
    sendEntityDeparting();

    // Stop threads
    running_.store(false, std::memory_order_release);

    if (adp_thread_) {
        adp_thread_->stopThread(1000);
        adp_thread_.reset();
    }

    if (acmp_thread_) {
        acmp_thread_->stopThread(1000);
        acmp_thread_.reset();
    }

    if (receive_thread_) {
        receive_thread_->stopThread(1000);
        receive_thread_.reset();
    }

    closeSocket();
    DBG("AVDECC Entity stopped");
}

void AvdeccEntity::setGptpInfo(uint64_t grandmaster_id, uint8_t domain) {
    gptp_grandmaster_id_ = grandmaster_id;
    gptp_domain_number_ = domain;
}

// ============================================================================
// Socket Operations
// ============================================================================

bool AvdeccEntity::createSocket() {
    socket_fd_ = socket(AF_PACKET, SOCK_RAW, htons(Avdecc::ETHERTYPE_AVTP));
    if (socket_fd_ < 0) {
        DBG("Failed to create AF_PACKET socket: " << std::strerror(errno));
        return false;
    }

    return bindSocket();
}

bool AvdeccEntity::bindSocket() {
    int if_index = getInterfaceIndex(interface_name_.toStdString());
    if (if_index < 0) {
        DBG("Failed to get interface index for: " << interface_name_);
        return false;
    }

    struct sockaddr_ll sll;
    std::memset(&sll, 0, sizeof(sll));
    sll.sll_family = AF_PACKET;
    sll.sll_protocol = htons(Avdecc::ETHERTYPE_AVTP);
    sll.sll_ifindex = if_index;

    if (bind(socket_fd_, reinterpret_cast<struct sockaddr*>(&sll), sizeof(sll)) < 0) {
        DBG("Failed to bind socket: " << std::strerror(errno));
        return false;
    }

    return true;
}

void AvdeccEntity::closeSocket() {
    if (socket_fd_ >= 0) {
        close(socket_fd_);
        socket_fd_ = -1;
    }
}

bool AvdeccEntity::sendMessage(const void* data, size_t length,
                               const std::array<uint8_t, 6>& dest_mac) {
    if (socket_fd_ < 0) {
        return false;
    }

    // Build Ethernet frame
    std::vector<uint8_t> frame(14 + length);

    // Ethernet header
    std::memcpy(frame.data(), dest_mac.data(), 6);  // Destination MAC
    std::memcpy(frame.data() + 6, mac_address_.data(), 6);  // Source MAC
    writeU16(frame.data() + 12, Avdecc::ETHERTYPE_AVTP);  // EtherType

    // Payload
    std::memcpy(frame.data() + 14, data, length);

    ssize_t sent = send(socket_fd_, frame.data(), frame.size(), 0);
    if (sent < 0) {
        DBG("Failed to send AVDECC message: " << std::strerror(errno));
        return false;
    }

    return sent == static_cast<ssize_t>(frame.size());
}

// ============================================================================
// ADP Thread (Entity Advertisement)
// ============================================================================

void AvdeccEntity::adpThread() {
    juce::Thread::setCurrentThreadName("AVDECC ADP");

    while (running_.load(std::memory_order_acquire)) {
        sendEntityAvailable();

        // Advertise every 2 seconds (valid_time = 10 seconds)
        for (int i = 0; i < 20 && running_.load(std::memory_order_acquire); ++i) {
            juce::Thread::sleep(100);
        }
    }
}

void AvdeccEntity::sendEntityAvailable() {
    AdpPdu pdu = buildAdpEntityAvailable();

    if (sendMessage(&pdu, sizeof(pdu), Avdecc::ADP_MULTICAST_MAC)) {
        adp_tx_count_.fetch_add(1, std::memory_order_relaxed);
    }
}

void AvdeccEntity::sendEntityDeparting() {
    AdpPdu pdu = buildAdpEntityDeparting();

    sendMessage(&pdu, sizeof(pdu), Avdecc::ADP_MULTICAST_MAC);
    adp_tx_count_.fetch_add(1, std::memory_order_relaxed);
}

AdpPdu AvdeccEntity::buildAdpEntityAvailable() {
    AdpPdu pdu;
    std::memset(&pdu, 0, sizeof(pdu));

    // Header
    pdu.header.cd_subtype = 0x00 | static_cast<uint8_t>(Avdecc::MessageType::ADP);
    pdu.header.sv_version = 0x00;  // version 0
    writeU16(reinterpret_cast<uint8_t*>(&pdu.header.message_type),
             static_cast<uint16_t>(Avdecc::AdpMessageType::ENTITY_AVAILABLE));

    // valid_time = 10 (5 bits), control_data_length = 56 bytes (11 bits)
    pdu.header.valid_time_control_data_length[0] = (10 << 3) | 0;  // Upper bits
    pdu.header.valid_time_control_data_length[1] = 56;  // Lower 8 bits

    writeU64(pdu.header.entity_id, entity_id_);

    // Entity info
    writeU64(pdu.entity_model_id, entity_model_id_);
    pdu.entity_capabilities = htonl(entity_capabilities_);
    pdu.talker_stream_sources = htons(talker_stream_sources_);
    pdu.talker_capabilities = htons(talker_capabilities_);
    pdu.listener_stream_sinks = htons(listener_stream_sinks_);
    pdu.listener_capabilities = htons(listener_capabilities_);
    pdu.controller_capabilities = 0;

    pdu.available_index = htonl(available_index_.fetch_add(1, std::memory_order_relaxed));

    writeU64(pdu.gptp_grandmaster_id, gptp_grandmaster_id_);
    pdu.gptp_domain_number = gptp_domain_number_;

    pdu.identify_control_index = 0;
    pdu.interface_index = 0;
    std::memset(pdu.association_id, 0, 8);

    return pdu;
}

AdpPdu AvdeccEntity::buildAdpEntityDeparting() {
    AdpPdu pdu = buildAdpEntityAvailable();

    // Change message type to DEPARTING
    writeU16(reinterpret_cast<uint8_t*>(&pdu.header.message_type),
             static_cast<uint16_t>(Avdecc::AdpMessageType::ENTITY_DEPARTING));

    return pdu;
}

AcmpPdu AvdeccEntity::buildAcmpConnectResponse(const AcmpPdu& command, Avdecc::AcmpStatus status) {
    AcmpPdu response;
    std::memset(&response, 0, sizeof(response));

    // Preserve AVDECC subtype/version bits from command.
    response.header.cd_subtype = command.header.cd_subtype;
    response.header.sv_version = command.header.sv_version;

    // Default response type for CONNECT_TX_COMMAND handling.
    writeU16(
        reinterpret_cast<uint8_t*>(&response.header.message_type),
        static_cast<uint16_t>(Avdecc::AcmpMessageType::CONNECT_TX_RESPONSE));

    // ACMP header packs status (bits 15:11) + control data length (bits 10:0).
    constexpr uint16_t kAcmpControlDataLength = 44;
    const uint16_t statusAndLength =
        (static_cast<uint16_t>(status) << 11) | kAcmpControlDataLength;
    writeU16(response.header.valid_time_control_data_length, statusAndLength);

    // Entity ID in responses is the responder entity.
    writeU64(response.header.entity_id, entity_id_);

    // Echo command fields required by ACMP transaction matching.
    std::memcpy(response.controller_entity_id, command.controller_entity_id, sizeof(response.controller_entity_id));
    std::memcpy(response.talker_entity_id, command.talker_entity_id, sizeof(response.talker_entity_id));
    std::memcpy(response.listener_entity_id, command.listener_entity_id, sizeof(response.listener_entity_id));
    response.talker_unique_id = command.talker_unique_id;
    response.listener_unique_id = command.listener_unique_id;
    std::memcpy(response.stream_dest_mac, command.stream_dest_mac, sizeof(response.stream_dest_mac));
    response.connection_count = command.connection_count;
    response.sequence_id = command.sequence_id;
    response.flags = command.flags;
    response.stream_vlan_id = command.stream_vlan_id;
    response.reserved = 0;

    return response;
}

// ============================================================================
// ACMP Thread (Connection Management)
// ============================================================================

void AvdeccEntity::acmpThread() {
    juce::Thread::setCurrentThreadName("AVDECC ACMP");

    // ACMP is mostly reactive (responds to commands)
    // This thread could be used for periodic connection status checks
    while (running_.load(std::memory_order_acquire)) {
        // Phase 10: Update enumerator (check timeouts, process requests)
        if (enumerator_) {
            enumerator_->update();
        }

        // Phase 11: Expire stale pending ACMP commands
        expirePendingCommands();

        juce::Thread::sleep(100);  // 100ms interval for responsive timeout handling
    }
}

bool AvdeccEntity::connectStream(uint64_t talker_entity_id, uint16_t talker_unique_id,
                                 uint64_t listener_entity_id, uint16_t listener_unique_id) {
    // Build CONNECT_TX_COMMAND (IEEE 1722.1 Clause 8.2.2.5.2.2)
    AcmpPdu pdu;
    std::memset(&pdu, 0, sizeof(pdu));

    pdu.header.cd_subtype = 0x00 | static_cast<uint8_t>(Avdecc::MessageType::ACMP);
    pdu.header.sv_version = 0x00;
    writeU16(reinterpret_cast<uint8_t*>(&pdu.header.message_type),
             static_cast<uint16_t>(Avdecc::AcmpMessageType::CONNECT_TX_COMMAND));

    // control_data_length for ACMP = 44 bytes (after common header)
    pdu.header.valid_time_control_data_length[0] = 0;
    pdu.header.valid_time_control_data_length[1] = 44;

    writeU64(pdu.header.entity_id, entity_id_);  // Controller ID
    writeU64(pdu.controller_entity_id, entity_id_);
    writeU64(pdu.talker_entity_id, talker_entity_id);
    writeU64(pdu.listener_entity_id, listener_entity_id);

    pdu.talker_unique_id = htons(talker_unique_id);
    pdu.listener_unique_id = htons(listener_unique_id);

    uint16_t seq = acmp_sequence_.fetch_add(1, std::memory_order_relaxed);
    pdu.sequence_id = htons(seq);

    // Register pending command before sending
    {
        juce::ScopedLock lock(state_mutex_);
        PendingAcmpCommand pending;
        pending.sequence_id = seq;
        pending.command_type = Avdecc::AcmpMessageType::CONNECT_TX_COMMAND;
        pending.talker_entity_id = talker_entity_id;
        pending.talker_unique_id = talker_unique_id;
        pending.listener_entity_id = listener_entity_id;
        pending.listener_unique_id = listener_unique_id;
        pending.sent_time = std::chrono::steady_clock::now();
        pending.completed = false;
        pending.result_status = Avdecc::AcmpStatus::NOT_SUPPORTED;
        pending.result_dest_mac = {};
        pending.result_vlan_id = 0;
        pending.result_stream_id = 0;
        pending_acmp_commands_.push_back(pending);
    }

    // Send to ACMP multicast
    if (!sendMessage(&pdu, sizeof(pdu), Avdecc::ACMP_MULTICAST_MAC)) {
        // Remove pending on send failure
        juce::ScopedLock lock(state_mutex_);
        pending_acmp_commands_.erase(
            std::remove_if(pending_acmp_commands_.begin(), pending_acmp_commands_.end(),
                          [seq](const PendingAcmpCommand& p) { return p.sequence_id == seq; }),
            pending_acmp_commands_.end());
        return false;
    }

    acmp_tx_count_.fetch_add(1, std::memory_order_relaxed);

    // Wait for response (blocking, up to 2s)
    PendingAcmpCommand result;
    if (!waitForAcmpResponse(seq, result, 2000)) {
        DBG("ACMP CONNECT_TX_COMMAND timed out (seq=" << seq << ")");
        return false;
    }

    if (result.result_status != Avdecc::AcmpStatus::SUCCESS) {
        DBG("ACMP CONNECT_TX failed: status=" << static_cast<int>(result.result_status));
        return false;
    }

    // Add verified connection with response data
    {
        juce::ScopedLock lock(state_mutex_);
        AvdeccConnection conn;
        conn.talker_entity_id = talker_entity_id;
        conn.talker_unique_id = talker_unique_id;
        conn.listener_entity_id = listener_entity_id;
        conn.listener_unique_id = listener_unique_id;
        conn.stream_dest_mac = result.result_dest_mac;
        conn.stream_vlan_id = result.result_vlan_id;
        conn.stream_id = result.result_stream_id;
        conn.connection_count = 1;
        conn.connected = true;
        conn.established_time = std::chrono::steady_clock::now();
        active_connections_.push_back(conn);
    }

    DBG("ACMP stream connected: talker=" << juce::String::toHexString((int64_t)talker_entity_id)
        << " listener=" << juce::String::toHexString((int64_t)listener_entity_id));

    // Phase 11: Log AvbStream creation readiness for Phase 13 integration
    #ifdef HAS_AVB
    {
        // Determine our role: if listener_entity_id matches us, we are the listener
        const char* role = (listener_entity_id == entity_id_) ? "listener" : "talker";
        DBG("AvbStream ready for creation: streamId="
            << juce::String::toHexString((int64_t)result.result_stream_id)
            << " role=" << role
            << " destMac=" << juce::String::toHexString(result.result_dest_mac[0])
            << ":" << juce::String::toHexString(result.result_dest_mac[1])
            << ":" << juce::String::toHexString(result.result_dest_mac[2])
            << ":" << juce::String::toHexString(result.result_dest_mac[3])
            << ":" << juce::String::toHexString(result.result_dest_mac[4])
            << ":" << juce::String::toHexString(result.result_dest_mac[5]));
        // Note: Full AvbStream creation + AvbAudioIODevice routing is Phase 13 work.
        // The connection data (dest_mac, vlan_id, stream_id) is stored in active_connections_
        // and available via getActiveConnections() for the audio device to use.
    }
    #endif

    return true;
}

bool AvdeccEntity::disconnectStream(uint64_t talker_entity_id, uint16_t talker_unique_id,
                                    uint64_t listener_entity_id, uint16_t listener_unique_id) {
    // Build DISCONNECT_TX_COMMAND (IEEE 1722.1 Clause 8.2.2.5.2.4)
    AcmpPdu pdu;
    std::memset(&pdu, 0, sizeof(pdu));

    pdu.header.cd_subtype = 0x00 | static_cast<uint8_t>(Avdecc::MessageType::ACMP);
    pdu.header.sv_version = 0x00;
    writeU16(reinterpret_cast<uint8_t*>(&pdu.header.message_type),
             static_cast<uint16_t>(Avdecc::AcmpMessageType::DISCONNECT_TX_COMMAND));

    pdu.header.valid_time_control_data_length[0] = 0;
    pdu.header.valid_time_control_data_length[1] = 44;

    writeU64(pdu.header.entity_id, entity_id_);
    writeU64(pdu.controller_entity_id, entity_id_);
    writeU64(pdu.talker_entity_id, talker_entity_id);
    writeU64(pdu.listener_entity_id, listener_entity_id);

    pdu.talker_unique_id = htons(talker_unique_id);
    pdu.listener_unique_id = htons(listener_unique_id);

    uint16_t seq = acmp_sequence_.fetch_add(1, std::memory_order_relaxed);
    pdu.sequence_id = htons(seq);

    // Copy stream_dest_mac from existing connection if available
    {
        juce::ScopedLock lock(state_mutex_);
        for (const auto& c : active_connections_) {
            if (c.talker_entity_id == talker_entity_id &&
                c.talker_unique_id == talker_unique_id &&
                c.listener_entity_id == listener_entity_id &&
                c.listener_unique_id == listener_unique_id) {
                std::memcpy(pdu.stream_dest_mac, c.stream_dest_mac.data(), 6);
                break;
            }
        }

        // Register pending command
        PendingAcmpCommand pending;
        pending.sequence_id = seq;
        pending.command_type = Avdecc::AcmpMessageType::DISCONNECT_TX_COMMAND;
        pending.talker_entity_id = talker_entity_id;
        pending.talker_unique_id = talker_unique_id;
        pending.listener_entity_id = listener_entity_id;
        pending.listener_unique_id = listener_unique_id;
        pending.sent_time = std::chrono::steady_clock::now();
        pending.completed = false;
        pending.result_status = Avdecc::AcmpStatus::NOT_SUPPORTED;
        pending.result_dest_mac = {};
        pending.result_vlan_id = 0;
        pending.result_stream_id = 0;
        pending_acmp_commands_.push_back(pending);
    }

    if (!sendMessage(&pdu, sizeof(pdu), Avdecc::ACMP_MULTICAST_MAC)) {
        juce::ScopedLock lock(state_mutex_);
        pending_acmp_commands_.erase(
            std::remove_if(pending_acmp_commands_.begin(), pending_acmp_commands_.end(),
                          [seq](const PendingAcmpCommand& p) { return p.sequence_id == seq; }),
            pending_acmp_commands_.end());
        return false;
    }

    acmp_tx_count_.fetch_add(1, std::memory_order_relaxed);

    // Wait for response
    PendingAcmpCommand result;
    if (!waitForAcmpResponse(seq, result, 2000)) {
        DBG("ACMP DISCONNECT_TX_COMMAND timed out (seq=" << seq << ")");
        // Still remove connection on timeout (best effort)
    }

    // Remove from active connections regardless of response
    {
        juce::ScopedLock lock(state_mutex_);
        active_connections_.erase(
            std::remove_if(active_connections_.begin(), active_connections_.end(),
                          [&](const AvdeccConnection& c) {
                              return c.talker_entity_id == talker_entity_id &&
                                     c.talker_unique_id == talker_unique_id &&
                                     c.listener_entity_id == listener_entity_id &&
                                     c.listener_unique_id == listener_unique_id;
                          }),
            active_connections_.end());
    }

    DBG("ACMP stream disconnected: talker=" << juce::String::toHexString((int64_t)talker_entity_id)
        << " listener=" << juce::String::toHexString((int64_t)listener_entity_id));

    return true;
}

std::vector<AvdeccConnection> AvdeccEntity::getActiveConnections() const {
    juce::ScopedLock lock(state_mutex_);
    return active_connections_;
}

// ============================================================================
// Receive Thread
// ============================================================================

void AvdeccEntity::receiveThread() {
    juce::Thread::setCurrentThreadName("AVDECC RX");

    std::array<uint8_t, 2048> buffer;

    while (running_.load(std::memory_order_acquire)) {
        // Non-blocking receive with timeout
        fd_set read_fds;
        FD_ZERO(&read_fds);
        FD_SET(socket_fd_, &read_fds);

        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 100000;  // 100ms timeout

        int ret = select(socket_fd_ + 1, &read_fds, nullptr, nullptr, &tv);
        if (ret <= 0) {
            continue;  // Timeout or error
        }

        ssize_t len = recv(socket_fd_, buffer.data(), buffer.size(), 0);
        if (len < 14 + static_cast<ssize_t>(sizeof(AvdeccCommonHeader))) {
            continue;  // Too short
        }

        // Skip Ethernet header (14 bytes)
        const uint8_t* payload = buffer.data() + 14;
        const AvdeccCommonHeader* header = reinterpret_cast<const AvdeccCommonHeader*>(payload);

        // Extract source MAC from Ethernet header
        std::array<uint8_t, 6> src_mac;
        std::memcpy(src_mac.data(), buffer.data() + 6, 6);

        // Dispatch based on subtype
        uint8_t subtype = header->getSubtype();

        if (subtype == static_cast<uint8_t>(Avdecc::MessageType::ADP)) {
            const AdpPdu* adp = reinterpret_cast<const AdpPdu*>(payload);
            handleAdpMessage(*adp, src_mac);
            adp_rx_count_.fetch_add(1, std::memory_order_relaxed);
        } else if (subtype == static_cast<uint8_t>(Avdecc::MessageType::ACMP)) {
            const AcmpPdu* acmp = reinterpret_cast<const AcmpPdu*>(payload);
            handleAcmpMessage(*acmp);
            acmp_rx_count_.fetch_add(1, std::memory_order_relaxed);
        } else if (subtype == static_cast<uint8_t>(Avdecc::MessageType::AECP)) {
            const AecpPdu* aecp = reinterpret_cast<const AecpPdu*>(payload);
            handleAecpMessage(*aecp);
            aecp_rx_count_.fetch_add(1, std::memory_order_relaxed);
        }
    }
}

// ============================================================================
// Message Handlers
// ============================================================================

void AvdeccEntity::handleAdpMessage(const AdpPdu& pdu, const std::array<uint8_t, 6>& src_mac) {
    uint64_t entity_id = readU64(pdu.header.entity_id);

    // Ignore our own messages
    if (entity_id == entity_id_) {
        return;
    }

    uint16_t msg_type = readU16(reinterpret_cast<const uint8_t*>(&pdu.header.message_type));

    if (msg_type == static_cast<uint16_t>(Avdecc::AdpMessageType::ENTITY_AVAILABLE)) {
        juce::ScopedLock lock(state_mutex_);

        // Find or create discovered entity
        auto it = std::find_if(discovered_entities_.begin(), discovered_entities_.end(),
                              [entity_id](const DiscoveredEntity& e) {
                                  return e.entity_id == entity_id;
                              });

        if (it == discovered_entities_.end()) {
            // New entity
            DiscoveredEntity entity;
            entity.entity_id = entity_id;
            entity.entity_model_id = readU64(pdu.entity_model_id);
            entity.mac_address = src_mac;
            entity.entity_capabilities = ntohl(pdu.entity_capabilities);
            entity.talker_stream_sources = ntohs(pdu.talker_stream_sources);
            entity.talker_capabilities = ntohs(pdu.talker_capabilities);
            entity.listener_stream_sinks = ntohs(pdu.listener_stream_sinks);
            entity.listener_capabilities = ntohs(pdu.listener_capabilities);
            entity.gptp_grandmaster_id = readU64(pdu.gptp_grandmaster_id);
            entity.gptp_domain_number = pdu.gptp_domain_number;
            entity.last_seen = std::chrono::steady_clock::now();
            entity.available = true;

            discovered_entities_.push_back(entity);
            DBG("Discovered new AVDECC entity: " << juce::String::toHexString(entity_id));

            // Phase 10: Trigger enumeration for new entity
            if (enumerator_) {
                enumerator_->startEnumeration(
                    entity.entity_id,
                    entity.entity_model_id,
                    "", // firmware_version (unknown yet - will be from ENTITY descriptor)
                    [this](uint64_t eid, Avdecc::EntityModel model, bool success) {
                        onEnumerationComplete(eid, std::move(model), success);
                    }
                );
            }
        } else {
            // Update existing entity
            it->last_seen = std::chrono::steady_clock::now();
            it->available = true;
        }
    } else if (msg_type == static_cast<uint16_t>(Avdecc::AdpMessageType::ENTITY_DEPARTING)) {
        juce::ScopedLock lock(state_mutex_);

        auto it = std::find_if(discovered_entities_.begin(), discovered_entities_.end(),
                              [entity_id](const DiscoveredEntity& e) {
                                  return e.entity_id == entity_id;
                              });

        if (it != discovered_entities_.end()) {
            it->available = false;
            DBG("AVDECC entity departing: " << juce::String::toHexString(entity_id));
        }
    }
}

void AvdeccEntity::handleAcmpMessage(const AcmpPdu& pdu) {
    uint16_t msg_type = readU16(reinterpret_cast<const uint8_t*>(&pdu.header.message_type));
    uint16_t seq_id = ntohs(pdu.sequence_id);

    // Extract status from the status field in header
    // IEEE 1722.1: status is in bits 15:11 of status_control_data_length
    uint16_t status_cdl = readU16(pdu.header.valid_time_control_data_length);
    Avdecc::AcmpStatus status = static_cast<Avdecc::AcmpStatus>((status_cdl >> 11) & 0x1F);

    // Handle response types by matching with pending commands
    if (msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::CONNECT_TX_RESPONSE) ||
        msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::DISCONNECT_TX_RESPONSE) ||
        msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::CONNECT_RX_RESPONSE) ||
        msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::DISCONNECT_RX_RESPONSE) ||
        msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::GET_TX_STATE_RESPONSE) ||
        msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::GET_RX_STATE_RESPONSE)) {

        juce::ScopedLock lock(state_mutex_);

        // Find pending command by sequence_id
        for (auto& pending : pending_acmp_commands_) {
            if (pending.sequence_id == seq_id && !pending.completed) {
                pending.completed = true;
                pending.result_status = status;

                // Extract stream info from response
                std::memcpy(pending.result_dest_mac.data(), pdu.stream_dest_mac, 6);
                pending.result_vlan_id = ntohs(pdu.stream_vlan_id);

                // Stream ID is from header entity_id field in responses
                pending.result_stream_id = readU64(pdu.header.entity_id);

                DBG("ACMP response matched: seq=" << seq_id
                    << " type=" << msg_type
                    << " status=" << static_cast<int>(status));
                return;
            }
        }

        DBG("ACMP response unmatched: seq=" << seq_id << " type=" << msg_type);
    }

    // Handle incoming ACMP commands (when we are a talker or listener)
    if (msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::CONNECT_TX_COMMAND)) {
        // We are being asked to be a talker - build response
        AcmpPdu response = buildAcmpConnectResponse(pdu, Avdecc::AcmpStatus::SUCCESS);
        sendMessage(&response, sizeof(response), Avdecc::ACMP_MULTICAST_MAC);
        acmp_tx_count_.fetch_add(1, std::memory_order_relaxed);

        DBG("Responded to CONNECT_TX_COMMAND as talker");
    } else if (msg_type == static_cast<uint16_t>(Avdecc::AcmpMessageType::DISCONNECT_TX_COMMAND)) {
        AcmpPdu response = buildAcmpConnectResponse(pdu, Avdecc::AcmpStatus::SUCCESS);
        writeU16(reinterpret_cast<uint8_t*>(&response.header.message_type),
                 static_cast<uint16_t>(Avdecc::AcmpMessageType::DISCONNECT_TX_RESPONSE));
        sendMessage(&response, sizeof(response), Avdecc::ACMP_MULTICAST_MAC);
        acmp_tx_count_.fetch_add(1, std::memory_order_relaxed);

        DBG("Responded to DISCONNECT_TX_COMMAND as talker");
    }
}

bool AvdeccEntity::waitForAcmpResponse(uint16_t sequence_id, PendingAcmpCommand& result,
                                        int timeout_ms) {
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);

    while (std::chrono::steady_clock::now() < deadline) {
        {
            juce::ScopedLock lock(state_mutex_);
            for (auto it = pending_acmp_commands_.begin(); it != pending_acmp_commands_.end(); ++it) {
                if (it->sequence_id == sequence_id && it->completed) {
                    result = *it;
                    pending_acmp_commands_.erase(it);
                    return true;
                }
            }
        }
        juce::Thread::sleep(10);  // Poll every 10ms
    }

    // Timed out - remove pending command
    {
        juce::ScopedLock lock(state_mutex_);
        pending_acmp_commands_.erase(
            std::remove_if(pending_acmp_commands_.begin(), pending_acmp_commands_.end(),
                          [sequence_id](const PendingAcmpCommand& p) { return p.sequence_id == sequence_id; }),
            pending_acmp_commands_.end());
    }

    return false;
}

void AvdeccEntity::expirePendingCommands() {
    auto now = std::chrono::steady_clock::now();
    juce::ScopedLock lock(state_mutex_);

    pending_acmp_commands_.erase(
        std::remove_if(pending_acmp_commands_.begin(), pending_acmp_commands_.end(),
                      [now](const PendingAcmpCommand& p) {
                          auto age = std::chrono::duration_cast<std::chrono::seconds>(now - p.sent_time);
                          return age.count() > 5;  // Expire after 5 seconds
                      }),
        pending_acmp_commands_.end());
}

void AvdeccEntity::handleAecpMessage(const AecpPdu& pdu) {
    aecp_rx_count_.fetch_add(1, std::memory_order_relaxed);

    // Parse AECP message type
    uint16_t msg_type = juce::ByteOrder::swapIfBigEndian(pdu.command_type);
    Avdecc::AecpMessageType aecp_type = static_cast<Avdecc::AecpMessageType>(msg_type & 0x7FFF);

    switch (aecp_type) {
        case Avdecc::AecpMessageType::AEM_COMMAND:
            handleAecpAemCommand(pdu);
            break;

        case Avdecc::AecpMessageType::AEM_RESPONSE:
            handleAecpAemResponse(pdu);
            break;

        case Avdecc::AecpMessageType::ADDRESS_ACCESS_COMMAND:
        case Avdecc::AecpMessageType::ADDRESS_ACCESS_RESPONSE:
        case Avdecc::AecpMessageType::VENDOR_UNIQUE_COMMAND:
        case Avdecc::AecpMessageType::VENDOR_UNIQUE_RESPONSE:
            DBG("Received AECP message type not supported: " << static_cast<int>(aecp_type));
            break;

        default:
            DBG("Received unknown AECP message type: " << static_cast<int>(aecp_type));
            break;
    }
}

void AvdeccEntity::handleAecpAemCommand(const AecpPdu& pdu) {
    // Phase 9: AEM command infrastructure in place
    // Phase 10: Will implement READ_DESCRIPTOR handler for enumeration
    // For now, just log the command
    DBG("Received AEM command (enumeration not yet implemented - Phase 10)");

    // TODO Phase 10:
    // - Parse AEM command type (READ_DESCRIPTOR, WRITE_DESCRIPTOR, etc.)
    // - For READ_DESCRIPTOR: return requested descriptor from entity model
    // - Send AEM response with descriptor data or error status
}

void AvdeccEntity::handleAecpAemResponse(const AecpPdu& pdu) {
    // Phase 10: Forward to enumerator for descriptor parsing
    if (enumerator_) {
        // Extract payload (after AECP header)
        // Note: Actual payload extraction will depend on PDU structure
        // For now, using placeholder values
        const uint8_t* payload = reinterpret_cast<const uint8_t*>(&pdu) + sizeof(AecpPdu);
        size_t payload_size = 1500 - sizeof(AecpPdu);  // Max Ethernet payload - header

        enumerator_->handleAemResponse(pdu, payload, payload_size);
    }

    // Legacy logging for visibility
    DBG("Received AEM response (forwarded to enumerator)");
}

void AvdeccEntity::onEnumerationComplete(uint64_t entity_id,
                                         Avdecc::EntityModel model,
                                         bool success) {
    juce::ScopedLock lock(state_mutex_);

    if (!success) {
        DBG("Enumeration failed for entity " << juce::String::toHexString(entity_id));
        return;
    }

    // Find discovered entity and attach model
    auto it = std::find_if(discovered_entities_.begin(), discovered_entities_.end(),
                          [entity_id](const DiscoveredEntity& e) {
                              return e.entity_id == entity_id;
                          });

    if (it != discovered_entities_.end()) {
        it->model_ = std::make_shared<Avdecc::EntityModel>(std::move(model));

        // Update entity info from model
        const auto& entity = it->model_->getEntity();
        it->entity_name = entity.entity_name.value;
        it->firmware_version = entity.firmware_version.value;
        it->group_name = entity.group_name.value;
        it->serial_number = entity.serial_number.value;

        DBG("Enumeration completed for entity " << juce::String::toHexString(entity_id)
            << ": " << it->entity_name);

        auto stats = it->model_->getStats();
        DBG("  Configurations: " << stats.total_configurations);
        DBG("  Stream Inputs: " << stats.total_stream_inputs);
        DBG("  Stream Outputs: " << stats.total_stream_outputs);
    }
}

// ============================================================================
// Query Methods
// ============================================================================

std::vector<DiscoveredEntity> AvdeccEntity::getDiscoveredEntities() const {
    juce::ScopedLock lock(state_mutex_);
    return discovered_entities_;
}

std::optional<DiscoveredEntity> AvdeccEntity::findEntity(uint64_t entity_id) const {
    juce::ScopedLock lock(state_mutex_);

    auto it = std::find_if(discovered_entities_.begin(), discovered_entities_.end(),
                          [entity_id](const DiscoveredEntity& e) {
                              return e.entity_id == entity_id;
                          });

    if (it != discovered_entities_.end()) {
        return *it;
    }

    return std::nullopt;
}

AvdeccEntity::Stats AvdeccEntity::getStats() const {
    Stats stats;
    stats.adp_messages_sent = adp_tx_count_.load(std::memory_order_relaxed);
    stats.adp_messages_received = adp_rx_count_.load(std::memory_order_relaxed);
    stats.acmp_messages_sent = acmp_tx_count_.load(std::memory_order_relaxed);
    stats.acmp_messages_received = acmp_rx_count_.load(std::memory_order_relaxed);
    stats.aecp_messages_sent = aecp_tx_count_.load(std::memory_order_relaxed);
    stats.aecp_messages_received = aecp_rx_count_.load(std::memory_order_relaxed);

    juce::ScopedLock lock(state_mutex_);
    stats.entities_discovered = static_cast<uint32_t>(discovered_entities_.size());
    stats.connections_active = static_cast<uint32_t>(active_connections_.size());

    return stats;
}

} // namespace Map2Audio

#endif // HAS_AVDECC
