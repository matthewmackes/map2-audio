/**
 * AVDECC Entity Model Enumerator Implementation
 */

#ifdef HAS_AVDECC

#include "AvdeccEnumerator.h"
#include "AvdeccEntity.h"
#include <cstring>

namespace Map2Audio {
namespace Avdecc {

// ============================================================================
// Constructor / Destructor
// ============================================================================

AvdeccEnumerator::AvdeccEnumerator() {
    DBG("AvdeccEnumerator created");
}

AvdeccEnumerator::~AvdeccEnumerator() {
    const juce::ScopedLock lock(mutex_);
    active_sessions_.clear();
    DBG("AvdeccEnumerator destroyed");
}

// ============================================================================
// Public API
// ============================================================================

void AvdeccEnumerator::startEnumeration(uint64_t entity_id,
                                       uint64_t entity_model_id,
                                       const juce::String& firmware_version,
                                       CompletionCallback callback) {
    const juce::ScopedLock lock(mutex_);

    // Cancel existing enumeration for this entity
    if (active_sessions_.count(entity_id)) {
        DBG("Cancelling existing enumeration for entity " << juce::String::toHexString(entity_id));
        active_sessions_.erase(entity_id);
    }

    // Create new session
    EnumerationSession session;
    session.entity_id = entity_id;
    session.state = EnumerationState::IDLE;
    session.current_configuration = 0;
    session.total_descriptors_expected = 0;
    session.descriptors_received = 0;
    session.start_time = std::chrono::steady_clock::now();
    session.last_activity = session.start_time;
    session.requests_sent = 0;
    session.responses_received = 0;
    session.timeouts = 0;
    session.retries = 0;

    // Initialize entity in model
    Entity entity;
    entity.entity_id = entity_id;
    entity.entity_model_id = entity_model_id;
    entity.firmware_version = AvdeccString(firmware_version.toStdString());
    session.model = EntityModel(entity);

    active_sessions_[entity_id] = std::move(session);
    callbacks_[entity_id] = callback;

    DBG("Started enumeration for entity " << juce::String::toHexString(entity_id));

    // Send first request: READ_DESCRIPTOR for ENTITY descriptor
    if (!sendReadDescriptor(active_sessions_[entity_id], 0, DescriptorType::ENTITY, 0)) {
        failEnumeration(entity_id, "Failed to send initial ENTITY descriptor request");
        return;
    }

    active_sessions_[entity_id].state = EnumerationState::READING_ENTITY;
}

void AvdeccEnumerator::cancelEnumeration(uint64_t entity_id) {
    const juce::ScopedLock lock(mutex_);

    if (active_sessions_.count(entity_id)) {
        DBG("Cancelled enumeration for entity " << juce::String::toHexString(entity_id));
        active_sessions_.erase(entity_id);
        callbacks_.erase(entity_id);
    }
}

bool AvdeccEnumerator::isEnumerating(uint64_t entity_id) const {
    const juce::ScopedLock lock(mutex_);
    return active_sessions_.count(entity_id) > 0;
}

float AvdeccEnumerator::getProgress(uint64_t entity_id) const {
    const juce::ScopedLock lock(mutex_);

    auto it = active_sessions_.find(entity_id);
    if (it == active_sessions_.end()) return 0.0f;

    const auto& session = it->second;
    if (session.total_descriptors_expected == 0) return 0.0f;

    return static_cast<float>(session.descriptors_received) /
           static_cast<float>(session.total_descriptors_expected);
}

void AvdeccEnumerator::update() {
    const juce::ScopedLock lock(mutex_);

    // Check for timeouts and process retries
    checkTimeouts();

    // Process next requests for each session
    for (auto& [entity_id, session] : active_sessions_) {
        processNextRequest(session);
    }
}

AvdeccEnumerator::Stats AvdeccEnumerator::getStats() const {
    const juce::ScopedLock lock(mutex_);

    Stats stats;
    stats.active_sessions = active_sessions_.size();
    stats.completed_sessions = completed_count_.load(std::memory_order_relaxed);
    stats.failed_sessions = failed_count_.load(std::memory_order_relaxed);
    stats.total_descriptors_read = total_descriptors_.load(std::memory_order_relaxed);
    stats.total_timeouts = total_timeouts_.load(std::memory_order_relaxed);
    stats.total_retries = total_retries_.load(std::memory_order_relaxed);

    return stats;
}

// ============================================================================
// AECP Response Handling
// ============================================================================

void AvdeccEnumerator::handleAemResponse(const AecpPdu& pdu, const uint8_t* payload, size_t payload_size) {
    const juce::ScopedLock lock(mutex_);

    // Extract sequence ID
    uint16_t sequence_id = juce::ByteOrder::swapIfBigEndian(pdu.sequence_id);

    // Find session waiting for this response
    EnumerationSession* session = nullptr;
    for (auto& [entity_id, sess] : active_sessions_) {
        if (sess.awaiting_response.count(sequence_id)) {
            session = &sess;
            break;
        }
    }

    if (!session) {
        DBG("Received AEM response for unknown sequence ID " << sequence_id);
        return;
    }

    // Get pending request
    auto& request = session->awaiting_response[sequence_id];

    // Update session activity
    session->last_activity = std::chrono::steady_clock::now();
    session->responses_received++;
    session->descriptors_received++;

    // Remove from awaiting map
    session->awaiting_response.erase(sequence_id);

    // Parse status from command_type field (upper bit is U flag, bits 14-8 are status)
    uint16_t command_type_field = juce::ByteOrder::swapIfBigEndian(pdu.command_type);
    bool is_unsolicited = (command_type_field & 0x8000) != 0;
    AecpStatus status = static_cast<AecpStatus>((command_type_field >> 8) & 0x7F);
    AemCommandType command = static_cast<AemCommandType>(command_type_field & 0x7FFF);

    if (status != AecpStatus::SUCCESS) {
        DBG("AEM response error: status=" << static_cast<int>(status)
            << " for descriptor type " << static_cast<int>(request.descriptor_type));

        // Retry if possible
        if (request.retry_count < PendingDescriptorRequest::MAX_RETRIES) {
            retryRequest(*session, request);
        } else {
            failEnumeration(session->entity_id, "Too many retries for descriptor");
        }
        return;
    }

    // Parse descriptor data based on type
    total_descriptors_.fetch_add(1, std::memory_order_relaxed);

    switch (request.descriptor_type) {
        case DescriptorType::ENTITY:
            handleEntityDescriptorResponse(*session, payload, payload_size);
            break;

        case DescriptorType::CONFIGURATION:
            handleConfigurationDescriptorResponse(*session, payload, payload_size);
            break;

        case DescriptorType::STREAM_INPUT:
        case DescriptorType::STREAM_OUTPUT:
            handleStreamDescriptorResponse(*session, request.descriptor_type, payload, payload_size);
            break;

        case DescriptorType::AVB_INTERFACE:
            handleAvbInterfaceDescriptorResponse(*session, payload, payload_size);
            break;

        case DescriptorType::CLOCK_SOURCE:
            handleClockSourceDescriptorResponse(*session, payload, payload_size);
            break;

        case DescriptorType::AUDIO_UNIT:
            handleAudioUnitDescriptorResponse(*session, payload, payload_size);
            break;

        default:
            DBG("Unhandled descriptor type: " << static_cast<int>(request.descriptor_type));
            break;
    }

    // Check if enumeration is complete
    checkCompletion(*session);
}

// ============================================================================
// Descriptor Response Handlers
// ============================================================================

void AvdeccEnumerator::handleEntityDescriptorResponse(EnumerationSession& session,
                                                     const uint8_t* payload,
                                                     size_t payload_size) {
    if (payload_size < sizeof(EntityDescriptor)) {
        failEnumeration(session.entity_id, "ENTITY descriptor too small");
        return;
    }

    const EntityDescriptor* desc = reinterpret_cast<const EntityDescriptor*>(payload);
    auto entity = Entity::fromDescriptor(*desc);

    if (!entity) {
        failEnumeration(session.entity_id, "Failed to parse ENTITY descriptor");
        return;
    }

    session.model.setEntity(*entity);

    DBG("Parsed ENTITY descriptor: " << entity->configurations_count << " configurations");

    // Move to reading configurations
    session.state = EnumerationState::READING_CONFIGURATIONS;
    queueConfigurationDescriptors(session);
}

void AvdeccEnumerator::handleConfigurationDescriptorResponse(EnumerationSession& session,
                                                            const uint8_t* payload,
                                                            size_t payload_size) {
    if (payload_size < sizeof(ConfigurationDescriptor)) {
        failEnumeration(session.entity_id, "CONFIGURATION descriptor too small");
        return;
    }

    const ConfigurationDescriptor* desc = reinterpret_cast<const ConfigurationDescriptor*>(payload);
    auto config = Configuration::fromDescriptor(*desc, payload, payload_size);

    if (!config) {
        failEnumeration(session.entity_id, "Failed to parse CONFIGURATION descriptor");
        return;
    }

    uint16_t config_index = juce::ByteOrder::swapIfBigEndian(desc->header.descriptor_index);
    session.model.addConfiguration(*config);

    DBG("Parsed CONFIGURATION " << config_index << ": " << config->descriptor_counts.size() << " descriptor types");

    // Calculate total expected descriptors
    for (const auto& count : config->descriptor_counts) {
        session.total_descriptors_expected += count.count;
    }

    // Check if we've read all configurations
    if (session.model.getAllConfigurations().size() == session.model.getEntity().configurations_count) {
        session.state = EnumerationState::READING_DESCRIPTORS;
        queueStreamDescriptors(session);
    }
}

void AvdeccEnumerator::handleStreamDescriptorResponse(EnumerationSession& session,
                                                     DescriptorType type,
                                                     const uint8_t* payload,
                                                     size_t payload_size) {
    if (payload_size < sizeof(StreamDescriptor)) {
        DBG("STREAM descriptor too small");
        return;
    }

    const StreamDescriptor* desc = reinterpret_cast<const StreamDescriptor*>(payload);
    uint16_t config_index = session.current_configuration;

    if (type == DescriptorType::STREAM_INPUT) {
        auto stream = StreamInput::fromDescriptor(*desc, payload, payload_size);
        if (stream) {
            session.model.addStreamInput(config_index, *stream);
            DBG("Added STREAM_INPUT " << stream->stream_index << " with " << stream->supported_formats.size() << " formats");
        }
    } else {
        auto stream = StreamOutput::fromDescriptor(*desc, payload, payload_size);
        if (stream) {
            session.model.addStreamOutput(config_index, *stream);
            DBG("Added STREAM_OUTPUT " << stream->stream_index << " with " << stream->supported_formats.size() << " formats");
        }
    }
}

void AvdeccEnumerator::handleAvbInterfaceDescriptorResponse(EnumerationSession& session,
                                                           const uint8_t* payload,
                                                           size_t payload_size) {
    if (payload_size < sizeof(AvbInterfaceDescriptor)) {
        DBG("AVB_INTERFACE descriptor too small");
        return;
    }

    const AvbInterfaceDescriptor* desc = reinterpret_cast<const AvbInterfaceDescriptor*>(payload);
    auto iface = AvbInterface::fromDescriptor(*desc);

    if (iface) {
        session.model.addAvbInterface(session.current_configuration, *iface);
        DBG("Added AVB_INTERFACE " << iface->interface_index);
    }
}

void AvdeccEnumerator::handleClockSourceDescriptorResponse(EnumerationSession& session,
                                                          const uint8_t* payload,
                                                          size_t payload_size) {
    if (payload_size < sizeof(ClockSourceDescriptor)) {
        DBG("CLOCK_SOURCE descriptor too small");
        return;
    }

    const ClockSourceDescriptor* desc = reinterpret_cast<const ClockSourceDescriptor*>(payload);
    auto clock = ClockSource::fromDescriptor(*desc);

    if (clock) {
        session.model.addClockSource(session.current_configuration, *clock);
        DBG("Added CLOCK_SOURCE " << clock->clock_source_index);
    }
}

void AvdeccEnumerator::handleAudioUnitDescriptorResponse(EnumerationSession& session,
                                                        const uint8_t* payload,
                                                        size_t payload_size) {
    if (payload_size < sizeof(AudioUnitDescriptor)) {
        DBG("AUDIO_UNIT descriptor too small");
        return;
    }

    const AudioUnitDescriptor* desc = reinterpret_cast<const AudioUnitDescriptor*>(payload);
    auto unit = AudioUnit::fromDescriptor(*desc, payload, payload_size);

    if (unit) {
        session.model.addAudioUnit(session.current_configuration, *unit);
        DBG("Added AUDIO_UNIT " << unit->audio_unit_index);
    }
}

// ============================================================================
// State Machine & Request Queue
// ============================================================================

void AvdeccEnumerator::queueConfigurationDescriptors(EnumerationSession& session) {
    const auto& entity = session.model.getEntity();

    // Queue READ_DESCRIPTOR for each configuration
    for (uint16_t i = 0; i < entity.configurations_count; ++i) {
        if (!sendReadDescriptor(session, i, DescriptorType::CONFIGURATION, i)) {
            failEnumeration(session.entity_id, "Failed to queue CONFIGURATION descriptor request");
            return;
        }
    }
}

void AvdeccEnumerator::queueStreamDescriptors(EnumerationSession& session) {
    auto current_config = session.model.getCurrentConfiguration();
    if (!current_config) {
        failEnumeration(session.entity_id, "No current configuration found");
        return;
    }

    session.current_configuration = session.model.getEntity().current_configuration;

    // Queue requests for each descriptor type
    for (const auto& count : current_config->descriptor_counts) {
        DescriptorType desc_type = static_cast<DescriptorType>(count.descriptor_type);

        for (uint16_t i = 0; i < count.count; ++i) {
            if (!sendReadDescriptor(session, session.current_configuration, desc_type, i)) {
                DBG("Failed to queue descriptor request: type=" << count.descriptor_type << " index=" << i);
            }
        }
    }
}

void AvdeccEnumerator::processNextRequest(EnumerationSession& session) {
    // Don't send more than 5 concurrent requests
    if (session.awaiting_response.size() >= 5) {
        return;
    }

    // Send pending requests from queue
    while (!session.pending_requests.empty() && session.awaiting_response.size() < 5) {
        auto request = session.pending_requests.front();
        session.pending_requests.pop();

        // Send request (already added to awaiting_response in sendReadDescriptor)
        // Just need to track timing
        session.last_activity = std::chrono::steady_clock::now();
    }
}

void AvdeccEnumerator::checkCompletion(EnumerationSession& session) {
    // Check if all descriptors received
    if (session.state == EnumerationState::READING_DESCRIPTORS &&
        session.awaiting_response.empty() &&
        session.pending_requests.empty()) {

        // Verify model is complete
        if (session.model.isComplete()) {
            completeEnumeration(session.entity_id, true);
        } else {
            auto missing = session.model.getMissingDescriptors();
            juce::String missing_str;
            for (const auto& m : missing) {
                missing_str << m << ", ";
            }
            DBG("Model incomplete, missing: " << missing_str);

            // Still call completion with partial model
            completeEnumeration(session.entity_id, true);
        }
    }
}

// ============================================================================
// Request Sending
// ============================================================================

bool AvdeccEnumerator::sendReadDescriptor(EnumerationSession& session,
                                         uint16_t configuration_index,
                                         DescriptorType descriptor_type,
                                         uint16_t descriptor_index) {
    if (!send_fn_) {
        DBG("No send function set");
        return false;
    }

    uint16_t sequence_id = nextSequenceId();

    // Build READ_DESCRIPTOR command
    // AECP AEM command format: [AecpPdu header] [command_specific_data]
    // For READ_DESCRIPTOR: configuration_index (2) + reserved (2) + descriptor_type (2) + descriptor_index (2)

    struct ReadDescriptorCommand {
        AecpPdu header;
        uint16_t configuration_index;
        uint16_t reserved;
        uint16_t descriptor_type;
        uint16_t descriptor_index;
    } __attribute__((packed));

    ReadDescriptorCommand cmd{};

    // Fill AECP header (simplified - full implementation would use AvdeccEntity methods)
    cmd.header.sequence_id = juce::ByteOrder::swapIfBigEndian(sequence_id);
    cmd.header.command_type = juce::ByteOrder::swapIfBigEndian(static_cast<uint16_t>(AemCommandType::READ_DESCRIPTOR));

    // Fill command data
    cmd.configuration_index = juce::ByteOrder::swapIfBigEndian(configuration_index);
    cmd.reserved = 0;
    cmd.descriptor_type = juce::ByteOrder::swapIfBigEndian(static_cast<uint16_t>(descriptor_type));
    cmd.descriptor_index = juce::ByteOrder::swapIfBigEndian(descriptor_index);

    // Track pending request
    PendingDescriptorRequest request;
    request.sequence_id = sequence_id;
    request.configuration_index = configuration_index;
    request.descriptor_type = descriptor_type;
    request.descriptor_index = descriptor_index;
    request.sent_time = std::chrono::steady_clock::now();
    request.retry_count = 0;

    session.awaiting_response[sequence_id] = request;
    session.requests_sent++;

    // Note: Actual AECP sending would be done via AvdeccEntity::sendAecpCommand
    // This is a simplified placeholder - Phase 10 will integrate with AvdeccEntity properly
    DBG("Queued READ_DESCRIPTOR: config=" << configuration_index
        << " type=" << static_cast<int>(descriptor_type)
        << " index=" << descriptor_index);

    return true;
}

// ============================================================================
// Timeout & Retry Handling
// ============================================================================

void AvdeccEnumerator::checkTimeouts() {
    auto now = std::chrono::steady_clock::now();

    for (auto& [entity_id, session] : active_sessions_) {
        std::vector<uint16_t> timed_out;

        for (const auto& [seq_id, request] : session.awaiting_response) {
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - request.sent_time);
            if (elapsed > PendingDescriptorRequest::TIMEOUT) {
                timed_out.push_back(seq_id);
            }
        }

        for (uint16_t seq_id : timed_out) {
            auto request = session.awaiting_response[seq_id];
            session.awaiting_response.erase(seq_id);
            session.timeouts++;
            total_timeouts_.fetch_add(1, std::memory_order_relaxed);

            DBG("Request timeout: seq_id=" << seq_id << " type=" << static_cast<int>(request.descriptor_type));

            if (request.retry_count < PendingDescriptorRequest::MAX_RETRIES) {
                retryRequest(session, request);
            } else {
                failEnumeration(entity_id, "Too many timeouts");
                return;
            }
        }
    }
}

void AvdeccEnumerator::retryRequest(EnumerationSession& session, const PendingDescriptorRequest& request) {
    session.retries++;
    total_retries_.fetch_add(1, std::memory_order_relaxed);

    DBG("Retrying request: type=" << static_cast<int>(request.descriptor_type)
        << " index=" << request.descriptor_index
        << " (attempt " << (request.retry_count + 1) << ")");

    // Re-send with incremented retry count (not fully implemented here - placeholder)
    sendReadDescriptor(session, request.configuration_index, request.descriptor_type, request.descriptor_index);
}

// ============================================================================
// Session Completion
// ============================================================================

void AvdeccEnumerator::completeEnumeration(uint64_t entity_id, bool success) {
    auto session_it = active_sessions_.find(entity_id);
    if (session_it == active_sessions_.end()) return;

    auto& session = session_it->second;
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - session.start_time);

    DBG("Enumeration " << (success ? "COMPLETED" : "FAILED")
        << " for entity " << juce::String::toHexString(entity_id)
        << " in " << elapsed.count() << "ms"
        << " (" << session.descriptors_received << " descriptors)");

    // Call completion callback
    auto callback_it = callbacks_.find(entity_id);
    if (callback_it != callbacks_.end()) {
        auto callback = callback_it->second;
        auto model = session.model;  // Copy model

        // Unlock before callback
        mutex_.exit();
        callback(entity_id, std::move(model), success);
        mutex_.enter();
    }

    // Update statistics
    if (success) {
        completed_count_.fetch_add(1, std::memory_order_relaxed);
    } else {
        failed_count_.fetch_add(1, std::memory_order_relaxed);
    }

    // Remove session
    active_sessions_.erase(entity_id);
    callbacks_.erase(entity_id);
}

void AvdeccEnumerator::failEnumeration(uint64_t entity_id, const juce::String& reason) {
    DBG("Enumeration FAILED for entity " << juce::String::toHexString(entity_id) << ": " << reason);
    completeEnumeration(entity_id, false);
}

// ============================================================================
// Utilities
// ============================================================================

uint16_t AvdeccEnumerator::nextSequenceId() {
    return sequence_counter_.fetch_add(1, std::memory_order_relaxed);
}

} // namespace Avdecc
} // namespace Map2Audio

#endif // HAS_AVDECC
