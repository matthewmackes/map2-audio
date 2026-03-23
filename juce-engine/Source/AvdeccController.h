/*
 * AvdeccController.h
 * Wraps la_avdecc::controller::Controller to provide the same interface as the
 * legacy Map2Audio::AvdeccEntity, preserving all Python binding signatures.
 *
 * Migration note:
 * The retired custom AVDECC stack (`AvdeccEntity*`, `AvdeccEntityModel*`,
 * `AvdeccEnumerator*`) was removed in T376 after the engine switched to the
 * `la_avdecc` controller wrapper. New AVDECC work should extend
 * Map2AvdeccController instead of restoring the legacy model/enumerator path.
 */

#pragma once
#ifdef HAS_AVDECC

#include <la/avdecc/controller/avdeccController.hpp>

// JUCE for CriticalSection-free use: we just need juce::String for
// StreamFormatOperationResult.message compatibility with PythonBindings.cpp
#include <juce_core/juce_core.h>

#include <string>
#include <vector>
#include <map>
#include <optional>
#include <array>
#include <cstdint>
#include <mutex>
#include <future>
#include <chrono>

namespace Map2Audio {

// ── Namespace shim so PythonBindings.cpp can use Map2Audio::Avdecc::DescriptorType ──
namespace Avdecc {
    enum class DescriptorType : uint16_t {
        INVALID       = 0xFFFF,
        STREAM_INPUT  = 0x0005,
        STREAM_OUTPUT = 0x0006,
    };
} // namespace Avdecc

// ── AECP AEM status codes (compatible with old AvdeccEntity.h values) ────────
enum class AecpAemStatus : uint8_t {
    SUCCESS            = 0,
    NOT_IMPLEMENTED    = 1,
    NO_SUCH_DESCRIPTOR = 2,
    NO_SUCH_ATTRIBUTE  = 3,
    BAD_ARGUMENTS      = 4,
    NO_RESOURCES       = 5,
    IN_PROGRESS        = 6,
    ENTITY_MISBEHAVING = 7,
    NOT_SUPPORTED      = 9,
    ENTITY_LOCKED      = 11,
    STREAM_IS_RUNNING  = 12,
};

// ── Compatibility structs (same public fields as old AvdeccEntity.h) ─────────

struct DiscoveredEntity {
    uint64_t entity_id{};
    uint64_t entity_model_id{};
    std::string entity_name;
    std::string firmware_version;
    std::string group_name;
    std::string serial_number;
    std::array<uint8_t, 6> mac_address{};
    uint16_t talker_stream_sources{};
    uint16_t talker_capabilities{};
    uint16_t listener_stream_sinks{};
    uint16_t listener_capabilities{};
    uint64_t gptp_grandmaster_id{};
    uint8_t  gptp_domain_number{};
    bool available{ true };
    bool has_model{ false }; // true once la_avdecc finishes enumeration (onEntityOnline)
};

struct AvdeccConnection {
    uint64_t talker_entity_id{};
    uint16_t talker_unique_id{};
    uint64_t listener_entity_id{};
    uint16_t listener_unique_id{};
    std::array<uint8_t, 6> stream_dest_mac{};
    uint16_t stream_vlan_id{};
    uint16_t connection_count{};
    uint64_t stream_id{};
    bool connected{};
};

struct StreamFormatOperationResult {
    bool success{ false };
    AecpAemStatus status{ AecpAemStatus::NOT_SUPPORTED };
    uint64_t stream_format{};
    juce::String message;
};

// ── Map2AvdeccController ──────────────────────────────────────────────────────

class Map2AvdeccController
    : private la::avdecc::controller::Controller::DefaultedObserver
{
public:
    Map2AvdeccController(const std::string& interfaceName,
                         const std::string& entityName,
                         uint16_t talkerStreams = 8,
                         uint16_t listenerStreams = 8);
    ~Map2AvdeccController() override;

    bool start();
    void stop();
    bool isRunning() const { return running_; }

    // ── Python-facing interface (identical signatures to old AvdeccEntity) ───

    std::vector<DiscoveredEntity>  getDiscoveredEntities() const;
    std::optional<std::string>     getEntityModelJson(uint64_t entityId) const;

    bool connectStream(uint64_t talkerEntityId, uint16_t talkerStreamIndex,
                       uint64_t listenerEntityId, uint16_t listenerStreamIndex);
    bool disconnectStream(uint64_t talkerEntityId, uint16_t talkerStreamIndex,
                          uint64_t listenerEntityId, uint16_t listenerStreamIndex);

    std::vector<AvdeccConnection>  getActiveConnections() const;

    StreamFormatOperationResult getStreamFormat(
        uint64_t entityId,
        Avdecc::DescriptorType descriptorType,
        uint16_t streamIndex,
        uint16_t configurationIndex = 0,
        int timeoutMs = 2000);

    StreamFormatOperationResult setStreamFormat(
        uint64_t entityId,
        Avdecc::DescriptorType descriptorType,
        uint16_t streamIndex,
        uint64_t format,
        uint16_t configurationIndex = 0,
        int timeoutMs = 2000);

private:
    // ── la_avdecc DefaultedObserver overrides ────────────────────────────────
    void onEntityOnline(
        la::avdecc::controller::Controller const* const controller,
        la::avdecc::controller::ControlledEntity const* const entity)
        noexcept override;

    void onEntityOffline(
        la::avdecc::controller::Controller const* const controller,
        la::avdecc::controller::ControlledEntity const* const entity)
        noexcept override;

    void onStreamInputConnectionChanged(
        la::avdecc::controller::Controller const* const controller,
        la::avdecc::controller::ControlledEntity const* const entity,
        la::avdecc::entity::model::StreamIndex const streamIndex,
        la::avdecc::entity::model::StreamInputConnectionInfo const& info,
        bool const changedByOther) noexcept override;

    // ── Helpers ──────────────────────────────────────────────────────────────
    DiscoveredEntity buildDiscoveredEntity(
        la::avdecc::controller::ControlledEntity const& entity) const noexcept;

    std::string buildEntityModelJson(
        la::avdecc::UniqueIdentifier entityID) const noexcept;

    // ── Members ──────────────────────────────────────────────────────────────
    la::avdecc::controller::Controller::UniquePointer controller_{ nullptr, nullptr };

    std::string interfaceName_;
    std::string entityName_;
    uint16_t talkerStreams_;
    uint16_t listenerStreams_;

    mutable std::mutex mutex_;
    std::map<uint64_t, DiscoveredEntity> entityCache_;
    std::vector<AvdeccConnection>        connectionCache_;
    bool running_{ false };
};

} // namespace Map2Audio
#endif // HAS_AVDECC
