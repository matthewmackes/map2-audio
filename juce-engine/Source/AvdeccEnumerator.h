/**
 * AVDECC Entity Model Enumerator
 *
 * Asynchronously enumerates descriptors from discovered AVDECC entities.
 * Implements IEEE 1722.1 AECP READ_DESCRIPTOR command sequence.
 *
 * Flow:
 * 1. Entity discovered via ADP → Start enumeration
 * 2. Send READ_DESCRIPTOR for ENTITY (index 0)
 * 3. Parse response, extract configuration count
 * 4. For each configuration, send READ_DESCRIPTOR for CONFIGURATION
 * 5. Parse descriptor counts (streams, interfaces, etc.)
 * 6. Send READ_DESCRIPTOR for each descriptor type
 * 7. Build EntityModel from responses
 * 8. Signal completion, cache model
 *
 * Only compiled when USE_AVDECC=ON in CMake.
 */

#pragma once

#ifdef HAS_AVDECC

#include "AvdeccEntity.h"
#include "AvdeccEntityModel.h"
#include "AvdeccDescriptors.h"
#include <juce_core/juce_core.h>
#include <functional>
#include <map>
#include <queue>
#include <memory>
#include <chrono>

namespace Map2Audio {
namespace Avdecc {

// AecpPdu is defined in Map2Audio:: namespace (AvdeccEntity.h)
using AecpPdu = ::Map2Audio::AecpPdu;

// ============================================================================
// AECP AEM Command Types (IEEE 1722.1-2013 Section 7.4)
// ============================================================================

enum class AemCommandType : uint16_t {
    ACQUIRE_ENTITY = 0x0000,
    LOCK_ENTITY = 0x0001,
    ENTITY_AVAILABLE = 0x0002,
    CONTROLLER_AVAILABLE = 0x0003,
    READ_DESCRIPTOR = 0x0004,
    WRITE_DESCRIPTOR = 0x0005,
    SET_CONFIGURATION = 0x0006,
    GET_CONFIGURATION = 0x0007,
    SET_STREAM_FORMAT = 0x0008,
    GET_STREAM_FORMAT = 0x0009,
    SET_VIDEO_FORMAT = 0x000A,
    GET_VIDEO_FORMAT = 0x000B,
    SET_SENSOR_FORMAT = 0x000C,
    GET_SENSOR_FORMAT = 0x000D,
    SET_STREAM_INFO = 0x000E,
    GET_STREAM_INFO = 0x000F,
    SET_NAME = 0x0010,
    GET_NAME = 0x0011,
    SET_ASSOCIATION_ID = 0x0012,
    GET_ASSOCIATION_ID = 0x0013,
    SET_SAMPLING_RATE = 0x0014,
    GET_SAMPLING_RATE = 0x0015,
    SET_CLOCK_SOURCE = 0x0016,
    GET_CLOCK_SOURCE = 0x0017,
    SET_CONTROL = 0x0018,
    GET_CONTROL = 0x0019,
    INCREMENT_CONTROL = 0x001A,
    DECREMENT_CONTROL = 0x001B,
    SET_SIGNAL_SELECTOR = 0x001C,
    GET_SIGNAL_SELECTOR = 0x001D,
    SET_MIXER = 0x001E,
    GET_MIXER = 0x001F,
    SET_MATRIX = 0x0020,
    GET_MATRIX = 0x0021,
    START_STREAMING = 0x0022,
    STOP_STREAMING = 0x0023,
    REGISTER_UNSOLICITED_NOTIFICATION = 0x0024,
    DEREGISTER_UNSOLICITED_NOTIFICATION = 0x0025,
    IDENTIFY_NOTIFICATION = 0x0026,
    GET_AVB_INFO = 0x0027,
    GET_AS_PATH = 0x0028,
    GET_COUNTERS = 0x0029,
    REBOOT = 0x002A,
    GET_AUDIO_MAP = 0x002B,
    ADD_AUDIO_MAPPINGS = 0x002C,
    REMOVE_AUDIO_MAPPINGS = 0x002D,
    GET_VIDEO_MAP = 0x002E,
    ADD_VIDEO_MAPPINGS = 0x002F,
    REMOVE_VIDEO_MAPPINGS = 0x0030,
    GET_SENSOR_MAP = 0x0031,
    ADD_SENSOR_MAPPINGS = 0x0032,
    REMOVE_SENSOR_MAPPINGS = 0x0033,
    START_OPERATION = 0x0034,
    ABORT_OPERATION = 0x0035,
    OPERATION_STATUS = 0x0036,
    AUTH_ADD_KEY = 0x0037,
    AUTH_DELETE_KEY = 0x0038,
    AUTH_GET_KEY_LIST = 0x0039,
    AUTH_GET_KEY = 0x003A,
    AUTH_ADD_KEY_TO_CHAIN = 0x003B,
    AUTH_DELETE_KEY_FROM_CHAIN = 0x003C,
    AUTH_GET_KEYCHAIN_LIST = 0x003D,
    AUTH_GET_IDENTITY = 0x003E,
    AUTH_ADD_TOKEN = 0x003F,
    AUTH_DELETE_TOKEN = 0x0040,
    AUTHENTICATE = 0x0041,
    DEAUTHENTICATE = 0x0042,
    ENABLE_TRANSPORT_SECURITY = 0x0043,
    DISABLE_TRANSPORT_SECURITY = 0x0044,
    ENABLE_STREAM_ENCRYPTION = 0x0045,
    DISABLE_STREAM_ENCRYPTION = 0x0046,
    SET_MEMORY_OBJECT_LENGTH = 0x0047,
    GET_MEMORY_OBJECT_LENGTH = 0x0048,
    SET_STREAM_BACKUP = 0x0049,
    GET_STREAM_BACKUP = 0x004A
};

// AECP Status Codes
enum class AecpStatus : uint8_t {
    SUCCESS = 0,
    NOT_IMPLEMENTED = 1,
    NO_SUCH_DESCRIPTOR = 2,
    ENTITY_LOCKED = 3,
    ENTITY_ACQUIRED = 4,
    NOT_AUTHENTICATED = 5,
    AUTHENTICATION_DISABLED = 6,
    BAD_ARGUMENTS = 7,
    NO_RESOURCES = 8,
    IN_PROGRESS = 9,
    ENTITY_MISBEHAVING = 10,
    NOT_SUPPORTED = 11,
    STREAM_IS_RUNNING = 12
};

// ============================================================================
// Enumeration State Machine
// ============================================================================

enum class EnumerationState {
    IDLE,                    // Not enumerating
    READING_ENTITY,          // Reading ENTITY descriptor (index 0)
    READING_CONFIGURATIONS,  // Reading CONFIGURATION descriptors
    READING_DESCRIPTORS,     // Reading stream/interface/etc. descriptors
    COMPLETED,               // Enumeration finished successfully
    FAILED                   // Enumeration failed
};

// ============================================================================
// Pending Descriptor Request
// ============================================================================

struct PendingDescriptorRequest {
    uint16_t sequence_id;
    uint16_t configuration_index;
    DescriptorType descriptor_type;
    uint16_t descriptor_index;
    std::chrono::steady_clock::time_point sent_time;
    uint8_t retry_count;

    static constexpr uint8_t MAX_RETRIES = 3;
    static constexpr std::chrono::milliseconds TIMEOUT{2000};  // 2s per IEEE 1722.1
};

// ============================================================================
// Enumeration Session
// ============================================================================

struct EnumerationSession {
    uint64_t entity_id;
    EnumerationState state;
    EntityModel model;

    // Descriptor request queue
    std::queue<PendingDescriptorRequest> pending_requests;
    std::map<uint16_t, PendingDescriptorRequest> awaiting_response;  // sequence_id -> request

    // Progress tracking
    uint16_t current_configuration;
    size_t total_descriptors_expected;
    size_t descriptors_received;

    std::chrono::steady_clock::time_point start_time;
    std::chrono::steady_clock::time_point last_activity;

    // Statistics
    uint32_t requests_sent;
    uint32_t responses_received;
    uint32_t timeouts;
    uint32_t retries;
};

// ============================================================================
// AvdeccEnumerator Class
// ============================================================================

/**
 * Asynchronously enumerates AVDECC entity descriptors
 */
class AvdeccEnumerator {
public:
    using CompletionCallback = std::function<void(uint64_t entity_id, EntityModel model, bool success)>;

    AvdeccEnumerator();
    ~AvdeccEnumerator();

    // Start enumeration for an entity
    void startEnumeration(uint64_t entity_id,
                         uint64_t entity_model_id,
                         const juce::String& firmware_version,
                         CompletionCallback callback);

    // Cancel ongoing enumeration
    void cancelEnumeration(uint64_t entity_id);

    // Check if entity is being enumerated
    bool isEnumerating(uint64_t entity_id) const;

    // Get enumeration progress (0.0 to 1.0)
    float getProgress(uint64_t entity_id) const;

    // Process AECP AEM response
    void handleAemResponse(const AecpPdu& pdu, const uint8_t* payload, size_t payload_size);

    // Send function (must be set by AvdeccEntity)
    using SendFunction = std::function<bool(const void* data, size_t length)>;
    void setSendFunction(SendFunction send_fn) { send_fn_ = send_fn; }

    // Periodic update (call from worker thread)
    void update();

    // Statistics
    struct Stats {
        size_t active_sessions = 0;
        size_t completed_sessions = 0;
        size_t failed_sessions = 0;
        uint64_t total_descriptors_read = 0;
        uint64_t total_timeouts = 0;
        uint64_t total_retries = 0;
    };
    Stats getStats() const;

private:
    // Sequence ID generator
    uint16_t nextSequenceId();

    // Request builders
    bool sendReadDescriptor(EnumerationSession& session,
                          uint16_t configuration_index,
                          DescriptorType descriptor_type,
                          uint16_t descriptor_index);

    // Response handlers
    void handleEntityDescriptorResponse(EnumerationSession& session,
                                       const uint8_t* payload,
                                       size_t payload_size);
    void handleConfigurationDescriptorResponse(EnumerationSession& session,
                                              const uint8_t* payload,
                                              size_t payload_size);
    void handleStreamDescriptorResponse(EnumerationSession& session,
                                       DescriptorType type,
                                       const uint8_t* payload,
                                       size_t payload_size);
    void handleAvbInterfaceDescriptorResponse(EnumerationSession& session,
                                             const uint8_t* payload,
                                             size_t payload_size);
    void handleClockSourceDescriptorResponse(EnumerationSession& session,
                                            const uint8_t* payload,
                                            size_t payload_size);
    void handleAudioUnitDescriptorResponse(EnumerationSession& session,
                                          const uint8_t* payload,
                                          size_t payload_size);

    // State machine progression
    void queueConfigurationDescriptors(EnumerationSession& session);
    void queueStreamDescriptors(EnumerationSession& session);
    void processNextRequest(EnumerationSession& session);
    void checkCompletion(EnumerationSession& session);

    // Timeout handling
    void checkTimeouts();
    void retryRequest(EnumerationSession& session, const PendingDescriptorRequest& request);

    // Session management
    void completeEnumeration(uint64_t entity_id, bool success);
    void failEnumeration(uint64_t entity_id, const juce::String& reason);

    // Active enumeration sessions (entity_id -> session)
    std::map<uint64_t, EnumerationSession> active_sessions_;

    // Completion callbacks
    std::map<uint64_t, CompletionCallback> callbacks_;

    // Send function
    SendFunction send_fn_;

    // Sequence ID counter
    std::atomic<uint16_t> sequence_counter_{0};

    // Statistics
    std::atomic<size_t> completed_count_{0};
    std::atomic<size_t> failed_count_{0};
    std::atomic<uint64_t> total_descriptors_{0};
    std::atomic<uint64_t> total_timeouts_{0};
    std::atomic<uint64_t> total_retries_{0};

    // Thread safety
    mutable juce::CriticalSection mutex_;

    JUCE_LEAK_DETECTOR(AvdeccEnumerator)
};

} // namespace Avdecc
} // namespace Map2Audio

#endif // HAS_AVDECC
