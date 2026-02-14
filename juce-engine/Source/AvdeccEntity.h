/**
 * AVDECC Entity Implementation (IEEE 1722.1)
 *
 * Provides AVDECC discovery and connection management for interoperability
 * with third-party AVB devices (MOTU, PreSonus, AVNU hardware, etc.).
 *
 * Implements:
 * - ADP (AVDECC Discovery Protocol): Entity advertisement and discovery
 * - ACMP (AVDECC Connection Management Protocol): Stream connection setup
 * - AECP (AVDECC Enumeration and Control Protocol): Minimal entity info
 *
 * Only compiled when USE_AVDECC=ON in CMake.
 */

#pragma once

#ifdef HAS_AVDECC

#include <JuceHeader.h>
#include <atomic>
#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace Map2Audio {

// Forward declarations
namespace Avdecc {
    class EntityModel;
}

// ============================================================================
// IEEE 1722.1 Protocol Constants
// ============================================================================

namespace Avdecc {

// AVDECC Ethernet Type
constexpr uint16_t ETHERTYPE_AVTP = 0x22F0;

// AVDECC Multicast MAC addresses
constexpr std::array<uint8_t, 6> ADP_MULTICAST_MAC = {0x91, 0xE0, 0xF0, 0x01, 0x00, 0x00};
constexpr std::array<uint8_t, 6> ACMP_MULTICAST_MAC = {0x91, 0xE0, 0xF0, 0x01, 0x00, 0x01};

// AVDECC message types
enum class MessageType : uint8_t {
    ADP = 0xFA,   // AVDECC Discovery Protocol
    AECP = 0xFB,  // AVDECC Enumeration and Control Protocol
    ACMP = 0xFC   // AVDECC Connection Management Protocol
};

// ADP Message Types
enum class AdpMessageType : uint8_t {
    ENTITY_AVAILABLE = 0,
    ENTITY_DEPARTING = 1,
    ENTITY_DISCOVER = 2
};

// ACMP Message Types
enum class AcmpMessageType : uint16_t {
    CONNECT_TX_COMMAND = 0,
    CONNECT_TX_RESPONSE = 1,
    DISCONNECT_TX_COMMAND = 2,
    DISCONNECT_TX_RESPONSE = 3,
    GET_TX_STATE_COMMAND = 4,
    GET_TX_STATE_RESPONSE = 5,
    CONNECT_RX_COMMAND = 6,
    CONNECT_RX_RESPONSE = 7,
    DISCONNECT_RX_COMMAND = 8,
    DISCONNECT_RX_RESPONSE = 9,
    GET_RX_STATE_COMMAND = 10,
    GET_RX_STATE_RESPONSE = 11,
    GET_TX_CONNECTION_COMMAND = 12,
    GET_TX_CONNECTION_RESPONSE = 13
};

// ACMP Status Codes
enum class AcmpStatus : uint8_t {
    SUCCESS = 0,
    LISTENER_UNKNOWN_ID = 1,
    TALKER_UNKNOWN_ID = 2,
    TALKER_DEST_MAC_FAIL = 3,
    TALKER_NO_STREAM_INDEX = 4,
    TALKER_NO_BANDWIDTH = 5,
    TALKER_EXCLUSIVE = 6,
    LISTENER_TALKER_TIMEOUT = 7,
    LISTENER_EXCLUSIVE = 8,
    STATE_UNAVAILABLE = 9,
    NOT_CONNECTED = 10,
    NO_SUCH_CONNECTION = 11,
    COULD_NOT_SEND_MESSAGE = 12,
    TALKER_MISBEHAVING = 13,
    LISTENER_MISBEHAVING = 14,
    CONTROLLER_NOT_AUTHORIZED = 16,
    INCOMPATIBLE_REQUEST = 17,
    NOT_SUPPORTED = 31
};

// AECP Message Types
enum class AecpMessageType : uint16_t {
    AEM_COMMAND = 0,
    AEM_RESPONSE = 1,
    ADDRESS_ACCESS_COMMAND = 2,
    ADDRESS_ACCESS_RESPONSE = 3,
    VENDOR_UNIQUE_COMMAND = 0xFFFE,
    VENDOR_UNIQUE_RESPONSE = 0xFFFF
};

// Entity Capabilities
enum class EntityCapability : uint32_t {
    EFU_MODE = (1 << 0),
    ADDRESS_ACCESS_SUPPORTED = (1 << 1),
    GATEWAY_ENTITY = (1 << 2),
    AEM_SUPPORTED = (1 << 3),
    LEGACY_AVC = (1 << 4),
    ASSOCIATION_ID_SUPPORTED = (1 << 5),
    ASSOCIATION_ID_VALID = (1 << 6),
    VENDOR_UNIQUE_SUPPORTED = (1 << 7),
    CLASS_A_SUPPORTED = (1 << 8),
    CLASS_B_SUPPORTED = (1 << 9),
    GPTP_SUPPORTED = (1 << 10)
};

// Talker Capabilities
enum class TalkerCapability : uint16_t {
    IMPLEMENTED = (1 << 0),
    OTHER_SOURCE = (1 << 9),
    CONTROL_SOURCE = (1 << 10),
    MEDIA_CLOCK_SOURCE = (1 << 11),
    SMPTE_SOURCE = (1 << 12),
    MIDI_SOURCE = (1 << 13),
    AUDIO_SOURCE = (1 << 14),
    VIDEO_SOURCE = (1 << 15)
};

// Listener Capabilities
enum class ListenerCapability : uint16_t {
    IMPLEMENTED = (1 << 0),
    OTHER_SINK = (1 << 9),
    CONTROL_SINK = (1 << 10),
    MEDIA_CLOCK_SINK = (1 << 11),
    SMPTE_SINK = (1 << 12),
    MIDI_SINK = (1 << 13),
    AUDIO_SINK = (1 << 14),
    VIDEO_SINK = (1 << 15)
};

} // namespace Avdecc

// ============================================================================
// AVDECC Protocol Data Units (PDUs)
// ============================================================================

#pragma pack(push, 1)

struct AvdeccCommonHeader {
    uint8_t cd_subtype;           // control_data (1 bit) + subtype (7 bits)
    uint8_t sv_version;           // status_valid (1 bit) + version (3 bits) + reserved
    uint16_t message_type;        // Actually varies by protocol
    uint8_t valid_time_control_data_length[2];  // valid_time (5 bits) + control_data_length (11 bits)
    uint8_t entity_id[8];         // Entity GUID

    bool isControlData() const { return (cd_subtype & 0x80) != 0; }
    uint8_t getSubtype() const { return cd_subtype & 0x7F; }
    void setSubtype(Avdecc::MessageType type) {
        cd_subtype = (cd_subtype & 0x80) | static_cast<uint8_t>(type);
    }
};

struct AdpPdu {
    AvdeccCommonHeader header;
    uint8_t entity_model_id[8];
    uint32_t entity_capabilities;
    uint16_t talker_stream_sources;
    uint16_t talker_capabilities;
    uint16_t listener_stream_sinks;
    uint16_t listener_capabilities;
    uint32_t controller_capabilities;
    uint32_t available_index;
    uint8_t gptp_grandmaster_id[8];
    uint8_t gptp_domain_number;
    uint8_t reserved0[3];
    uint16_t identify_control_index;
    uint16_t interface_index;
    uint8_t association_id[8];
    uint32_t reserved1;
};

struct AcmpPdu {
    AvdeccCommonHeader header;
    uint8_t controller_entity_id[8];
    uint8_t talker_entity_id[8];
    uint8_t listener_entity_id[8];
    uint16_t talker_unique_id;
    uint16_t listener_unique_id;
    uint8_t stream_dest_mac[6];
    uint16_t connection_count;
    uint16_t sequence_id;
    uint16_t flags;
    uint16_t stream_vlan_id;
    uint16_t reserved;
};

struct AecpPdu {
    AvdeccCommonHeader header;
    uint8_t controller_entity_id[8];
    uint16_t sequence_id;
    uint16_t command_type;
    // Payload follows (variable length)
};

#pragma pack(pop)

// ============================================================================
// Discovered Entity Info
// ============================================================================

struct DiscoveredEntity {
    uint64_t entity_id;
    uint64_t entity_model_id;
    std::string entity_name;
    std::string firmware_version;
    std::string group_name;
    std::string serial_number;

    std::array<uint8_t, 6> mac_address;
    uint32_t entity_capabilities;

    uint16_t talker_stream_sources;
    uint16_t talker_capabilities;
    uint16_t listener_stream_sinks;
    uint16_t listener_capabilities;

    uint64_t gptp_grandmaster_id;
    uint8_t gptp_domain_number;

    std::chrono::steady_clock::time_point last_seen;
    bool available;

    // Entity Model (populated during enumeration in Phase 10)
    std::shared_ptr<Avdecc::EntityModel> model_;

    // Helper methods
    bool hasCapability(Avdecc::EntityCapability cap) const {
        return (entity_capabilities & static_cast<uint32_t>(cap)) != 0;
    }

    bool hasTalkerCapability(Avdecc::TalkerCapability cap) const {
        return (talker_capabilities & static_cast<uint16_t>(cap)) != 0;
    }

    bool hasListenerCapability(Avdecc::ListenerCapability cap) const {
        return (listener_capabilities & static_cast<uint16_t>(cap)) != 0;
    }

    bool isAudioTalker() const {
        return hasTalkerCapability(Avdecc::TalkerCapability::AUDIO_SOURCE);
    }

    bool isAudioListener() const {
        return hasListenerCapability(Avdecc::ListenerCapability::AUDIO_SINK);
    }
};

// ============================================================================
// AVDECC Connection Info
// ============================================================================

struct AvdeccConnection {
    uint64_t talker_entity_id;
    uint16_t talker_unique_id;
    uint64_t listener_entity_id;
    uint16_t listener_unique_id;
    std::array<uint8_t, 6> stream_dest_mac;
    uint16_t stream_vlan_id;
    uint16_t connection_count;
    bool connected;
    std::chrono::steady_clock::time_point established_time;
};

// ============================================================================
// AVDECC Entity Class
// ============================================================================

class AvdeccEntity {
public:
    AvdeccEntity(const juce::String& interfaceName,
                 const juce::String& entityName,
                 uint16_t talkerStreams = 0,
                 uint16_t listenerStreams = 0);

    ~AvdeccEntity();

    // Lifecycle
    bool start();
    void stop();
    bool isRunning() const { return running_.load(std::memory_order_acquire); }

    // Entity Info
    uint64_t getEntityId() const { return entity_id_; }
    juce::String getEntityName() const { return entity_name_; }
    std::array<uint8_t, 6> getMacAddress() const { return mac_address_; }

    // Discovery
    void sendEntityAvailable();
    void sendEntityDeparting();
    std::vector<DiscoveredEntity> getDiscoveredEntities() const;
    std::optional<DiscoveredEntity> findEntity(uint64_t entity_id) const;

    // Connection Management
    bool connectStream(uint64_t talker_entity_id, uint16_t talker_unique_id,
                      uint64_t listener_entity_id, uint16_t listener_unique_id);
    bool disconnectStream(uint64_t talker_entity_id, uint16_t talker_unique_id,
                         uint64_t listener_entity_id, uint16_t listener_unique_id);
    std::vector<AvdeccConnection> getActiveConnections() const;

    // Configuration
    void setTalkerStreamCount(uint16_t count) { talker_stream_sources_ = count; }
    void setListenerStreamCount(uint16_t count) { listener_stream_sinks_ = count; }
    void setGptpInfo(uint64_t grandmaster_id, uint8_t domain);

    // Statistics
    struct Stats {
        uint64_t adp_messages_sent;
        uint64_t adp_messages_received;
        uint64_t acmp_messages_sent;
        uint64_t acmp_messages_received;
        uint64_t aecp_messages_sent;
        uint64_t aecp_messages_received;
        uint32_t entities_discovered;
        uint32_t connections_active;
    };
    Stats getStats() const;

private:
    // Socket operations
    bool createSocket();
    void closeSocket();
    bool bindSocket();

    // Protocol threads
    void adpThread();
    void acmpThread();
    void receiveThread();

    // Message handlers
    void handleAdpMessage(const AdpPdu& pdu, const std::array<uint8_t, 6>& src_mac);
    void handleAcmpMessage(const AcmpPdu& pdu);
    void handleAecpMessage(const AecpPdu& pdu);
    void handleAecpAemCommand(const AecpPdu& pdu);
    void handleAecpAemResponse(const AecpPdu& pdu);

    // Message builders
    AdpPdu buildAdpEntityAvailable() const;
    AdpPdu buildAdpEntityDeparting() const;
    AcmpPdu buildAcmpConnectResponse(const AcmpPdu& command, Avdecc::AcmpStatus status);

    // Utilities
    uint64_t macToEntityId(const std::array<uint8_t, 6>& mac) const;
    bool sendMessage(const void* data, size_t length,
                    const std::array<uint8_t, 6>& dest_mac);

    // Entity configuration
    juce::String interface_name_;
    juce::String entity_name_;
    uint64_t entity_id_;
    uint64_t entity_model_id_;
    std::array<uint8_t, 6> mac_address_;

    uint16_t talker_stream_sources_;
    uint16_t listener_stream_sinks_;
    uint32_t entity_capabilities_;
    uint16_t talker_capabilities_;
    uint16_t listener_capabilities_;

    uint64_t gptp_grandmaster_id_;
    uint8_t gptp_domain_number_;

    // Socket
    int socket_fd_;

    // Threading
    std::atomic<bool> running_;
    std::unique_ptr<juce::Thread> adp_thread_;
    std::unique_ptr<juce::Thread> acmp_thread_;
    std::unique_ptr<juce::Thread> receive_thread_;

    // State (protected by mutex)
    mutable juce::CriticalSection state_mutex_;
    std::vector<DiscoveredEntity> discovered_entities_;
    std::vector<AvdeccConnection> active_connections_;

    // Statistics (atomic)
    std::atomic<uint64_t> adp_tx_count_{0};
    std::atomic<uint64_t> adp_rx_count_{0};
    std::atomic<uint64_t> acmp_tx_count_{0};
    std::atomic<uint64_t> acmp_rx_count_{0};
    std::atomic<uint64_t> aecp_tx_count_{0};
    std::atomic<uint64_t> aecp_rx_count_{0};

    // Sequence counters
    std::atomic<uint16_t> acmp_sequence_{0};
    std::atomic<uint32_t> available_index_{0};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AvdeccEntity)
};

} // namespace Map2Audio

#endif // HAS_AVDECC
