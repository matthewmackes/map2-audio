/**
 * AVDECC Entity Model Storage
 *
 * Stores the parsed descriptor tree for a discovered AVDECC entity.
 * Structure: Entity → Configuration → Stream/AudioUnit/etc.
 *
 * Only compiled when USE_AVDECC=ON in CMake.
 */

#pragma once

#ifdef HAS_AVDECC

#include "AvdeccDescriptors.h"
#include <juce_core/juce_core.h>
#include <memory>
#include <map>
#include <optional>
#include <vector>

namespace Map2Audio {
namespace Avdecc {

/**
 * Entity Model - Complete descriptor tree for an AVDECC entity
 */
class EntityModel {
public:
    EntityModel() = default;
    explicit EntityModel(const Entity& entity);

    // Entity info
    const Entity& getEntity() const { return entity_; }
    void setEntity(const Entity& entity) { entity_ = entity; }

    uint64_t getEntityId() const { return entity_.entity_id; }
    uint64_t getEntityModelId() const { return entity_.entity_model_id; }
    juce::String getFirmwareVersion() const { return entity_.firmware_version.value; }

    // Configuration management
    void addConfiguration(const Configuration& config);
    std::optional<Configuration> getConfiguration(uint16_t index) const;
    std::vector<Configuration> getAllConfigurations() const;
    uint16_t getCurrentConfigurationIndex() const { return entity_.current_configuration; }
    std::optional<Configuration> getCurrentConfiguration() const;

    // Stream descriptors
    void addStreamInput(uint16_t config_index, const StreamInput& stream);
    void addStreamOutput(uint16_t config_index, const StreamOutput& stream);
    std::optional<StreamInput> getStreamInput(uint16_t config_index, uint16_t stream_index) const;
    std::optional<StreamOutput> getStreamOutput(uint16_t config_index, uint16_t stream_index) const;
    std::vector<StreamInput> getAllStreamInputs(uint16_t config_index) const;
    std::vector<StreamOutput> getAllStreamOutputs(uint16_t config_index) const;

    // AVB Interface descriptors
    void addAvbInterface(uint16_t config_index, const AvbInterface& iface);
    std::optional<AvbInterface> getAvbInterface(uint16_t config_index, uint16_t interface_index) const;
    std::vector<AvbInterface> getAllAvbInterfaces(uint16_t config_index) const;

    // Clock Source descriptors
    void addClockSource(uint16_t config_index, const ClockSource& clock);
    std::optional<ClockSource> getClockSource(uint16_t config_index, uint16_t clock_index) const;
    std::vector<ClockSource> getAllClockSources(uint16_t config_index) const;

    // Audio Unit descriptors
    void addAudioUnit(uint16_t config_index, const AudioUnit& audio_unit);
    std::optional<AudioUnit> getAudioUnit(uint16_t config_index, uint16_t unit_index) const;
    std::vector<AudioUnit> getAllAudioUnits(uint16_t config_index) const;

    // Validation
    bool isComplete() const;
    bool hasConfiguration(uint16_t index) const;
    std::vector<std::string> getMissingDescriptors() const;

    // Serialization
    juce::var toJSON() const;
    static std::optional<EntityModel> fromJSON(const juce::var& json);

    // Statistics
    struct Stats {
        size_t total_configurations = 0;
        size_t total_stream_inputs = 0;
        size_t total_stream_outputs = 0;
        size_t total_avb_interfaces = 0;
        size_t total_clock_sources = 0;
        size_t total_audio_units = 0;
    };
    Stats getStats() const;

    // Clear all data
    void clear();

private:
    Entity entity_;
    std::map<uint16_t, Configuration> configurations_;

    // Per-configuration descriptor storage (config_index -> descriptor_index -> descriptor)
    std::map<uint16_t, std::map<uint16_t, StreamInput>> stream_inputs_;
    std::map<uint16_t, std::map<uint16_t, StreamOutput>> stream_outputs_;
    std::map<uint16_t, std::map<uint16_t, AvbInterface>> avb_interfaces_;
    std::map<uint16_t, std::map<uint16_t, ClockSource>> clock_sources_;
    std::map<uint16_t, std::map<uint16_t, AudioUnit>> audio_units_;

    JUCE_LEAK_DETECTOR(EntityModel)
};

/**
 * Entity Model Cache - Stores models for multiple entities
 */
class EntityModelCache {
public:
    EntityModelCache() = default;

    // Add/update entity model
    void setModel(uint64_t entity_id, const EntityModel& model);
    void setModel(uint64_t entity_id, EntityModel&& model);

    // Retrieve entity model
    std::optional<EntityModel> getModel(uint64_t entity_id) const;
    EntityModel* getModelPtr(uint64_t entity_id);
    const EntityModel* getModelPtr(uint64_t entity_id) const;

    // Check existence
    bool hasModel(uint64_t entity_id) const;

    // Remove entity
    void removeModel(uint64_t entity_id);

    // Get all entity IDs
    std::vector<uint64_t> getAllEntityIds() const;

    // Statistics
    size_t getModelCount() const { return models_.size(); }
    size_t getTotalDescriptorCount() const;

    // Clear all models
    void clear();

    // Persistence (for Phase 10)
    juce::var toJSON() const;
    static std::unique_ptr<EntityModelCache> fromJSON(const juce::var& json);

private:
    std::map<uint64_t, EntityModel> models_;
    mutable juce::CriticalSection mutex_;

    JUCE_LEAK_DETECTOR(EntityModelCache)
};

} // namespace Avdecc
} // namespace Map2Audio

#endif // HAS_AVDECC
