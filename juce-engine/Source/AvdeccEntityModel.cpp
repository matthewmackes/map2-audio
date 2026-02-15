/**
 * AVDECC Entity Model Storage Implementation
 */

#ifdef HAS_AVDECC

#include "AvdeccEntityModel.h"
#include <algorithm>

namespace Map2Audio {
namespace Avdecc {

// ============================================================================
// Descriptor Parsing (Binary PDU → C++ Objects)
// ============================================================================

std::optional<Entity> Entity::fromDescriptor(const EntityDescriptor& desc) {
    Entity entity;

    // Copy entity IDs
    entity.entity_id = 0;
    for (int i = 0; i < 8; ++i) {
        entity.entity_id = (entity.entity_id << 8) | desc.entity_id[i];
    }

    entity.entity_model_id = 0;
    for (int i = 0; i < 8; ++i) {
        entity.entity_model_id = (entity.entity_model_id << 8) | desc.entity_model_id[i];
    }

    // Copy capabilities
    entity.entity_capabilities = juce::ByteOrder::swapIfLittleEndian(desc.entity_capabilities);
    entity.talker_stream_sources = juce::ByteOrder::swapIfLittleEndian(desc.talker_stream_sources);
    entity.talker_capabilities = juce::ByteOrder::swapIfLittleEndian(desc.talker_capabilities);
    entity.listener_stream_sinks = juce::ByteOrder::swapIfLittleEndian(desc.listener_stream_sinks);
    entity.listener_capabilities = juce::ByteOrder::swapIfLittleEndian(desc.listener_capabilities);
    entity.controller_capabilities = juce::ByteOrder::swapIfLittleEndian(desc.controller_capabilities);
    entity.available_index = juce::ByteOrder::swapIfLittleEndian(desc.available_index);

    // Copy association ID
    entity.association_id = 0;
    for (int i = 0; i < 8; ++i) {
        entity.association_id = (entity.association_id << 8) | desc.association_id[i];
    }

    // Copy strings (null-terminated, max 64 bytes)
    entity.entity_name = AvdeccString(std::string(desc.entity_name, strnlen(desc.entity_name, 64)));
    entity.firmware_version = AvdeccString(std::string(desc.firmware_version, strnlen(desc.firmware_version, 64)));
    entity.group_name = AvdeccString(std::string(desc.group_name, strnlen(desc.group_name, 64)));
    entity.serial_number = AvdeccString(std::string(desc.serial_number, strnlen(desc.serial_number, 64)));

    entity.vendor_name_string_index = juce::ByteOrder::swapIfLittleEndian(desc.vendor_name_string);
    entity.model_name_string_index = juce::ByteOrder::swapIfLittleEndian(desc.model_name_string);

    entity.configurations_count = juce::ByteOrder::swapIfLittleEndian(desc.configurations_count);
    entity.current_configuration = juce::ByteOrder::swapIfLittleEndian(desc.current_configuration);

    return entity;
}

EntityDescriptor Entity::toDescriptor() const {
    EntityDescriptor desc{};

    // Pack entity IDs
    for (int i = 0; i < 8; ++i) {
        desc.entity_id[i] = static_cast<uint8_t>((entity_id >> (56 - i * 8)) & 0xFF);
        desc.entity_model_id[i] = static_cast<uint8_t>((entity_model_id >> (56 - i * 8)) & 0xFF);
        desc.association_id[i] = static_cast<uint8_t>((association_id >> (56 - i * 8)) & 0xFF);
    }

    // Pack capabilities (network byte order)
    desc.entity_capabilities = juce::ByteOrder::swapIfLittleEndian(entity_capabilities);
    desc.talker_stream_sources = juce::ByteOrder::swapIfLittleEndian(talker_stream_sources);
    desc.talker_capabilities = juce::ByteOrder::swapIfLittleEndian(talker_capabilities);
    desc.listener_stream_sinks = juce::ByteOrder::swapIfLittleEndian(listener_stream_sinks);
    desc.listener_capabilities = juce::ByteOrder::swapIfLittleEndian(listener_capabilities);
    desc.controller_capabilities = juce::ByteOrder::swapIfLittleEndian(controller_capabilities);
    desc.available_index = juce::ByteOrder::swapIfLittleEndian(available_index);

    // Copy strings
    strncpy(desc.entity_name, entity_name.value.c_str(), 64);
    strncpy(desc.firmware_version, firmware_version.value.c_str(), 64);
    strncpy(desc.group_name, group_name.value.c_str(), 64);
    strncpy(desc.serial_number, serial_number.value.c_str(), 64);

    desc.vendor_name_string = juce::ByteOrder::swapIfLittleEndian(vendor_name_string_index);
    desc.model_name_string = juce::ByteOrder::swapIfLittleEndian(model_name_string_index);

    desc.configurations_count = juce::ByteOrder::swapIfLittleEndian(configurations_count);
    desc.current_configuration = juce::ByteOrder::swapIfLittleEndian(current_configuration);

    return desc;
}

std::optional<Configuration> Configuration::fromDescriptor(const ConfigurationDescriptor& desc, const uint8_t* payload, size_t payload_size) {
    Configuration config;

    config.configuration_index = juce::ByteOrder::swapIfLittleEndian(desc.header.descriptor_index);
    config.object_name = AvdeccString(std::string(desc.object_name, strnlen(desc.object_name, 64)));
    config.localized_description = juce::ByteOrder::swapIfLittleEndian(desc.localized_description);

    uint16_t counts_count = juce::ByteOrder::swapIfLittleEndian(desc.descriptor_counts_count);
    uint16_t counts_offset = juce::ByteOrder::swapIfLittleEndian(desc.descriptor_counts_offset);

    // Parse descriptor counts array
    if (counts_offset + counts_count * sizeof(DescriptorCount) <= payload_size) {
        const DescriptorCount* counts = reinterpret_cast<const DescriptorCount*>(payload + counts_offset);
        for (uint16_t i = 0; i < counts_count; ++i) {
            DescriptorCount count;
            count.descriptor_type = juce::ByteOrder::swapIfLittleEndian(counts[i].descriptor_type);
            count.count = juce::ByteOrder::swapIfLittleEndian(counts[i].count);
            config.descriptor_counts.push_back(count);
        }
    }

    return config;
}

std::optional<StreamInput> StreamInput::fromDescriptor(const StreamDescriptor& desc, const uint8_t* payload, size_t payload_size) {
    StreamInput stream;

    stream.stream_index = juce::ByteOrder::swapIfLittleEndian(desc.header.descriptor_index);
    stream.object_name = AvdeccString(std::string(desc.object_name, strnlen(desc.object_name, 64)));
    stream.localized_description = juce::ByteOrder::swapIfLittleEndian(desc.localized_description);
    stream.clock_domain_index = juce::ByteOrder::swapIfLittleEndian(desc.clock_domain_index);
    stream.stream_flags = juce::ByteOrder::swapIfLittleEndian(desc.stream_flags);
    stream.avb_interface_index = juce::ByteOrder::swapIfLittleEndian(desc.avb_interface_index);
    stream.buffer_length = juce::ByteOrder::swapIfLittleEndian(desc.buffer_length);

    // Parse current format (64-bit)
    stream.current_format = 0;
    for (int i = 0; i < 8; ++i) {
        stream.current_format = (stream.current_format << 8) | desc.current_format[i];
    }

    // Parse supported formats array
    uint16_t formats_offset = juce::ByteOrder::swapIfLittleEndian(desc.formats_offset);
    uint16_t num_formats = juce::ByteOrder::swapIfLittleEndian(desc.number_of_formats);

    if (formats_offset + num_formats * 8 <= payload_size) {
        const uint8_t* formats_ptr = payload + formats_offset;
        for (uint16_t i = 0; i < num_formats; ++i) {
            StreamFormat format = 0;
            for (int j = 0; j < 8; ++j) {
                format = (format << 8) | formats_ptr[i * 8 + j];
            }
            stream.supported_formats.push_back(format);
        }
    }

    return stream;
}

std::optional<StreamOutput> StreamOutput::fromDescriptor(const StreamDescriptor& desc, const uint8_t* payload, size_t payload_size) {
    // StreamInput and StreamOutput share same descriptor structure
    auto stream_input = StreamInput::fromDescriptor(desc, payload, payload_size);
    if (!stream_input) return std::nullopt;

    StreamOutput stream;
    stream.stream_index = stream_input->stream_index;
    stream.object_name = stream_input->object_name;
    stream.localized_description = stream_input->localized_description;
    stream.clock_domain_index = stream_input->clock_domain_index;
    stream.stream_flags = stream_input->stream_flags;
    stream.current_format = stream_input->current_format;
    stream.supported_formats = stream_input->supported_formats;
    stream.avb_interface_index = stream_input->avb_interface_index;
    stream.buffer_length = stream_input->buffer_length;

    return stream;
}

std::optional<AvbInterface> AvbInterface::fromDescriptor(const AvbInterfaceDescriptor& desc) {
    AvbInterface iface;

    iface.interface_index = juce::ByteOrder::swapIfLittleEndian(desc.header.descriptor_index);
    iface.object_name = AvdeccString(std::string(desc.object_name, strnlen(desc.object_name, 64)));
    iface.localized_description = juce::ByteOrder::swapIfLittleEndian(desc.localized_description);
    iface.interface_flags = juce::ByteOrder::swapIfLittleEndian(desc.interface_flags);

    std::copy(std::begin(desc.mac_address), std::end(desc.mac_address), iface.mac_address.begin());
    std::copy(std::begin(desc.clock_identity), std::end(desc.clock_identity), iface.clock_identity.begin());

    iface.priority1 = desc.priority1;
    iface.clock_class = desc.clock_class;
    iface.offset_scaled_log_variance = juce::ByteOrder::swapIfLittleEndian(desc.offset_scaled_log_variance);
    iface.clock_accuracy = desc.clock_accuracy;
    iface.priority2 = desc.priority2;
    iface.domain_number = desc.domain_number;
    iface.log_sync_interval = static_cast<int8_t>(desc.log_sync_interval);
    iface.log_announce_interval = static_cast<int8_t>(desc.log_announce_interval);
    iface.log_pdelay_interval = static_cast<int8_t>(desc.log_pdelay_interval);
    iface.port_number = juce::ByteOrder::swapIfLittleEndian(desc.port_number);

    return iface;
}

std::optional<ClockSource> ClockSource::fromDescriptor(const ClockSourceDescriptor& desc) {
    ClockSource clock;

    clock.clock_source_index = juce::ByteOrder::swapIfLittleEndian(desc.header.descriptor_index);
    clock.object_name = AvdeccString(std::string(desc.object_name, strnlen(desc.object_name, 64)));
    clock.localized_description = juce::ByteOrder::swapIfLittleEndian(desc.localized_description);
    clock.clock_source_flags = juce::ByteOrder::swapIfLittleEndian(desc.clock_source_flags);
    clock.clock_source_type = juce::ByteOrder::swapIfLittleEndian(desc.clock_source_type);
    clock.clock_source_location_type = juce::ByteOrder::swapIfLittleEndian(desc.clock_source_location_type);
    clock.clock_source_location_index = juce::ByteOrder::swapIfLittleEndian(desc.clock_source_location_index);

    std::copy(std::begin(desc.clock_source_identifier), std::end(desc.clock_source_identifier), clock.clock_source_identifier.begin());

    return clock;
}

std::optional<AudioUnit> AudioUnit::fromDescriptor(const AudioUnitDescriptor& desc, const uint8_t* payload, size_t payload_size) {
    AudioUnit unit;

    unit.audio_unit_index = juce::ByteOrder::swapIfLittleEndian(desc.header.descriptor_index);
    unit.object_name = AvdeccString(std::string(desc.object_name, strnlen(desc.object_name, 64)));
    unit.localized_description = juce::ByteOrder::swapIfLittleEndian(desc.localized_description);
    unit.clock_domain_index = juce::ByteOrder::swapIfLittleEndian(desc.clock_domain_index);
    unit.number_of_stream_input_ports = juce::ByteOrder::swapIfLittleEndian(desc.number_of_stream_input_ports);
    unit.base_stream_input_port = juce::ByteOrder::swapIfLittleEndian(desc.base_stream_input_port);
    unit.number_of_stream_output_ports = juce::ByteOrder::swapIfLittleEndian(desc.number_of_stream_output_ports);
    unit.base_stream_output_port = juce::ByteOrder::swapIfLittleEndian(desc.base_stream_output_port);
    unit.current_sampling_rate = juce::ByteOrder::swapIfLittleEndian(desc.current_sampling_rate);

    // Parse sampling rates array
    uint16_t rates_offset = juce::ByteOrder::swapIfLittleEndian(desc.sampling_rates_offset);
    uint16_t rates_count = juce::ByteOrder::swapIfLittleEndian(desc.sampling_rates_count);

    if (rates_offset + rates_count * sizeof(uint64_t) <= payload_size) {
        const uint8_t* rates_ptr = payload + rates_offset;
        for (uint16_t i = 0; i < rates_count; ++i) {
            // Parse pull_field (8 bits) + base_frequency (24 bits, network order)
            uint8_t pull_field = rates_ptr[i * 4];
            uint32_t base_freq = (rates_ptr[i * 4 + 1] << 16) | (rates_ptr[i * 4 + 2] << 8) | rates_ptr[i * 4 + 3];
            unit.sampling_rates.push_back({pull_field, base_freq});
        }
    }

    return unit;
}

// ============================================================================
// EntityModel Implementation
// ============================================================================

EntityModel::EntityModel(const Entity& entity) : entity_(entity) {}

void EntityModel::addConfiguration(const Configuration& config) {
    configurations_[config.configuration_index] = config;
}

std::optional<Configuration> EntityModel::getConfiguration(uint16_t index) const {
    auto it = configurations_.find(index);
    if (it != configurations_.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::vector<Configuration> EntityModel::getAllConfigurations() const {
    std::vector<Configuration> configs;
    for (const auto& [index, config] : configurations_) {
        configs.push_back(config);
    }
    return configs;
}

std::optional<Configuration> EntityModel::getCurrentConfiguration() const {
    return getConfiguration(entity_.current_configuration);
}

void EntityModel::addStreamInput(uint16_t config_index, const StreamInput& stream) {
    stream_inputs_[config_index][stream.stream_index] = stream;
}

void EntityModel::addStreamOutput(uint16_t config_index, const StreamOutput& stream) {
    stream_outputs_[config_index][stream.stream_index] = stream;
}

std::optional<StreamInput> EntityModel::getStreamInput(uint16_t config_index, uint16_t stream_index) const {
    auto config_it = stream_inputs_.find(config_index);
    if (config_it != stream_inputs_.end()) {
        auto stream_it = config_it->second.find(stream_index);
        if (stream_it != config_it->second.end()) {
            return stream_it->second;
        }
    }
    return std::nullopt;
}

std::optional<StreamOutput> EntityModel::getStreamOutput(uint16_t config_index, uint16_t stream_index) const {
    auto config_it = stream_outputs_.find(config_index);
    if (config_it != stream_outputs_.end()) {
        auto stream_it = config_it->second.find(stream_index);
        if (stream_it != config_it->second.end()) {
            return stream_it->second;
        }
    }
    return std::nullopt;
}

std::vector<StreamInput> EntityModel::getAllStreamInputs(uint16_t config_index) const {
    std::vector<StreamInput> streams;
    auto config_it = stream_inputs_.find(config_index);
    if (config_it != stream_inputs_.end()) {
        for (const auto& [index, stream] : config_it->second) {
            streams.push_back(stream);
        }
    }
    return streams;
}

std::vector<StreamOutput> EntityModel::getAllStreamOutputs(uint16_t config_index) const {
    std::vector<StreamOutput> streams;
    auto config_it = stream_outputs_.find(config_index);
    if (config_it != stream_outputs_.end()) {
        for (const auto& [index, stream] : config_it->second) {
            streams.push_back(stream);
        }
    }
    return streams;
}

void EntityModel::addAvbInterface(uint16_t config_index, const AvbInterface& iface) {
    avb_interfaces_[config_index][iface.interface_index] = iface;
}

std::optional<AvbInterface> EntityModel::getAvbInterface(uint16_t config_index, uint16_t interface_index) const {
    auto config_it = avb_interfaces_.find(config_index);
    if (config_it != avb_interfaces_.end()) {
        auto iface_it = config_it->second.find(interface_index);
        if (iface_it != config_it->second.end()) {
            return iface_it->second;
        }
    }
    return std::nullopt;
}

std::vector<AvbInterface> EntityModel::getAllAvbInterfaces(uint16_t config_index) const {
    std::vector<AvbInterface> interfaces;
    auto config_it = avb_interfaces_.find(config_index);
    if (config_it != avb_interfaces_.end()) {
        for (const auto& [index, iface] : config_it->second) {
            interfaces.push_back(iface);
        }
    }
    return interfaces;
}

void EntityModel::addClockSource(uint16_t config_index, const ClockSource& clock) {
    clock_sources_[config_index][clock.clock_source_index] = clock;
}

std::optional<ClockSource> EntityModel::getClockSource(uint16_t config_index, uint16_t clock_index) const {
    auto config_it = clock_sources_.find(config_index);
    if (config_it != clock_sources_.end()) {
        auto clock_it = config_it->second.find(clock_index);
        if (clock_it != config_it->second.end()) {
            return clock_it->second;
        }
    }
    return std::nullopt;
}

std::vector<ClockSource> EntityModel::getAllClockSources(uint16_t config_index) const {
    std::vector<ClockSource> clocks;
    auto config_it = clock_sources_.find(config_index);
    if (config_it != clock_sources_.end()) {
        for (const auto& [index, clock] : config_it->second) {
            clocks.push_back(clock);
        }
    }
    return clocks;
}

void EntityModel::addAudioUnit(uint16_t config_index, const AudioUnit& audio_unit) {
    audio_units_[config_index][audio_unit.audio_unit_index] = audio_unit;
}

std::optional<AudioUnit> EntityModel::getAudioUnit(uint16_t config_index, uint16_t unit_index) const {
    auto config_it = audio_units_.find(config_index);
    if (config_it != audio_units_.end()) {
        auto unit_it = config_it->second.find(unit_index);
        if (unit_it != config_it->second.end()) {
            return unit_it->second;
        }
    }
    return std::nullopt;
}

std::vector<AudioUnit> EntityModel::getAllAudioUnits(uint16_t config_index) const {
    std::vector<AudioUnit> units;
    auto config_it = audio_units_.find(config_index);
    if (config_it != audio_units_.end()) {
        for (const auto& [index, unit] : config_it->second) {
            units.push_back(unit);
        }
    }
    return units;
}

bool EntityModel::isComplete() const {
    // Check if we have at least configuration 0
    if (configurations_.empty()) return false;

    auto current_config = getCurrentConfiguration();
    if (!current_config) return false;

    // Check descriptor counts match actual stored descriptors
    for (const auto& count : current_config->descriptor_counts) {
        uint16_t config_idx = entity_.current_configuration;

        switch (static_cast<DescriptorType>(count.descriptor_type)) {
            case DescriptorType::STREAM_INPUT: {
                auto it = stream_inputs_.find(config_idx);
                size_t actual = (it != stream_inputs_.end()) ? it->second.size() : 0;
                if (actual != count.count) return false;
                break;
            }
            case DescriptorType::STREAM_OUTPUT: {
                auto it = stream_outputs_.find(config_idx);
                size_t actual = (it != stream_outputs_.end()) ? it->second.size() : 0;
                if (actual != count.count) return false;
                break;
            }
            case DescriptorType::AVB_INTERFACE: {
                auto it = avb_interfaces_.find(config_idx);
                size_t actual = (it != avb_interfaces_.end()) ? it->second.size() : 0;
                if (actual != count.count) return false;
                break;
            }
            case DescriptorType::CLOCK_SOURCE: {
                auto it = clock_sources_.find(config_idx);
                size_t actual = (it != clock_sources_.end()) ? it->second.size() : 0;
                if (actual != count.count) return false;
                break;
            }
            case DescriptorType::AUDIO_UNIT: {
                auto it = audio_units_.find(config_idx);
                size_t actual = (it != audio_units_.end()) ? it->second.size() : 0;
                if (actual != count.count) return false;
                break;
            }
            default:
                // Ignore other descriptor types for now
                break;
        }
    }

    return true;
}

bool EntityModel::hasConfiguration(uint16_t index) const {
    return configurations_.find(index) != configurations_.end();
}

std::vector<std::string> EntityModel::getMissingDescriptors() const {
    std::vector<std::string> missing;

    if (configurations_.empty()) {
        missing.push_back("CONFIGURATION");
        return missing;
    }

    auto current_config = getCurrentConfiguration();
    if (!current_config) {
        missing.push_back("CONFIGURATION_" + std::to_string(entity_.current_configuration));
        return missing;
    }

    uint16_t config_idx = entity_.current_configuration;
    for (const auto& count : current_config->descriptor_counts) {
        size_t actual_count = 0;

        switch (static_cast<DescriptorType>(count.descriptor_type)) {
            case DescriptorType::STREAM_INPUT: {
                auto it = stream_inputs_.find(config_idx);
                actual_count = (it != stream_inputs_.end()) ? it->second.size() : 0;
                if (actual_count < count.count) {
                    missing.push_back("STREAM_INPUT (expected " + std::to_string(count.count) + ", got " + std::to_string(actual_count) + ")");
                }
                break;
            }
            case DescriptorType::STREAM_OUTPUT: {
                auto it = stream_outputs_.find(config_idx);
                actual_count = (it != stream_outputs_.end()) ? it->second.size() : 0;
                if (actual_count < count.count) {
                    missing.push_back("STREAM_OUTPUT (expected " + std::to_string(count.count) + ", got " + std::to_string(actual_count) + ")");
                }
                break;
            }
            case DescriptorType::AVB_INTERFACE: {
                auto it = avb_interfaces_.find(config_idx);
                actual_count = (it != avb_interfaces_.end()) ? it->second.size() : 0;
                if (actual_count < count.count) {
                    missing.push_back("AVB_INTERFACE (expected " + std::to_string(count.count) + ", got " + std::to_string(actual_count) + ")");
                }
                break;
            }
            case DescriptorType::CLOCK_SOURCE: {
                auto it = clock_sources_.find(config_idx);
                actual_count = (it != clock_sources_.end()) ? it->second.size() : 0;
                if (actual_count < count.count) {
                    missing.push_back("CLOCK_SOURCE (expected " + std::to_string(count.count) + ", got " + std::to_string(actual_count) + ")");
                }
                break;
            }
            case DescriptorType::AUDIO_UNIT: {
                auto it = audio_units_.find(config_idx);
                actual_count = (it != audio_units_.end()) ? it->second.size() : 0;
                if (actual_count < count.count) {
                    missing.push_back("AUDIO_UNIT (expected " + std::to_string(count.count) + ", got " + std::to_string(actual_count) + ")");
                }
                break;
            }
            default:
                break;
        }
    }

    return missing;
}

EntityModel::Stats EntityModel::getStats() const {
    Stats stats;
    stats.total_configurations = configurations_.size();

    for (const auto& [config_idx, streams] : stream_inputs_) {
        stats.total_stream_inputs += streams.size();
    }
    for (const auto& [config_idx, streams] : stream_outputs_) {
        stats.total_stream_outputs += streams.size();
    }
    for (const auto& [config_idx, ifaces] : avb_interfaces_) {
        stats.total_avb_interfaces += ifaces.size();
    }
    for (const auto& [config_idx, clocks] : clock_sources_) {
        stats.total_clock_sources += clocks.size();
    }
    for (const auto& [config_idx, units] : audio_units_) {
        stats.total_audio_units += units.size();
    }

    return stats;
}

void EntityModel::clear() {
    configurations_.clear();
    stream_inputs_.clear();
    stream_outputs_.clear();
    avb_interfaces_.clear();
    clock_sources_.clear();
    audio_units_.clear();
}

juce::var EntityModel::toJSON() const {
    juce::var json(new juce::DynamicObject());
    auto* obj = json.getDynamicObject();

    // Entity info
    obj->setProperty("entity_id", juce::String::toHexString(static_cast<int64_t>(entity_.entity_id)));
    obj->setProperty("entity_model_id", juce::String::toHexString(static_cast<int64_t>(entity_.entity_model_id)));
    obj->setProperty("entity_name", juce::String(entity_.entity_name.value));
    obj->setProperty("firmware_version", juce::String(entity_.firmware_version.value));

    // Stats
    auto stats = getStats();
    juce::var stats_obj(new juce::DynamicObject());
    stats_obj.getDynamicObject()->setProperty("configurations", static_cast<int>(stats.total_configurations));
    stats_obj.getDynamicObject()->setProperty("stream_inputs", static_cast<int>(stats.total_stream_inputs));
    stats_obj.getDynamicObject()->setProperty("stream_outputs", static_cast<int>(stats.total_stream_outputs));
    stats_obj.getDynamicObject()->setProperty("avb_interfaces", static_cast<int>(stats.total_avb_interfaces));
    stats_obj.getDynamicObject()->setProperty("clock_sources", static_cast<int>(stats.total_clock_sources));
    stats_obj.getDynamicObject()->setProperty("audio_units", static_cast<int>(stats.total_audio_units));
    obj->setProperty("stats", stats_obj);

    obj->setProperty("complete", isComplete());

    return json;
}

// ============================================================================
// EntityModelCache Implementation
// ============================================================================

void EntityModelCache::setModel(uint64_t entity_id, const EntityModel& model) {
    const juce::ScopedLock lock(mutex_);
    models_[entity_id] = model;
}

void EntityModelCache::setModel(uint64_t entity_id, EntityModel&& model) {
    const juce::ScopedLock lock(mutex_);
    models_[entity_id] = std::move(model);
}

std::optional<EntityModel> EntityModelCache::getModel(uint64_t entity_id) const {
    const juce::ScopedLock lock(mutex_);
    auto it = models_.find(entity_id);
    if (it != models_.end()) {
        return it->second;
    }
    return std::nullopt;
}

EntityModel* EntityModelCache::getModelPtr(uint64_t entity_id) {
    const juce::ScopedLock lock(mutex_);
    auto it = models_.find(entity_id);
    if (it != models_.end()) {
        return &it->second;
    }
    return nullptr;
}

const EntityModel* EntityModelCache::getModelPtr(uint64_t entity_id) const {
    const juce::ScopedLock lock(mutex_);
    auto it = models_.find(entity_id);
    if (it != models_.end()) {
        return &it->second;
    }
    return nullptr;
}

bool EntityModelCache::hasModel(uint64_t entity_id) const {
    const juce::ScopedLock lock(mutex_);
    return models_.find(entity_id) != models_.end();
}

void EntityModelCache::removeModel(uint64_t entity_id) {
    const juce::ScopedLock lock(mutex_);
    models_.erase(entity_id);
}

std::vector<uint64_t> EntityModelCache::getAllEntityIds() const {
    const juce::ScopedLock lock(mutex_);
    std::vector<uint64_t> ids;
    for (const auto& [id, model] : models_) {
        ids.push_back(id);
    }
    return ids;
}

size_t EntityModelCache::getTotalDescriptorCount() const {
    const juce::ScopedLock lock(mutex_);
    size_t total = 0;
    for (const auto& [id, model] : models_) {
        auto stats = model.getStats();
        total += stats.total_configurations;
        total += stats.total_stream_inputs;
        total += stats.total_stream_outputs;
        total += stats.total_avb_interfaces;
        total += stats.total_clock_sources;
        total += stats.total_audio_units;
    }
    return total;
}

void EntityModelCache::clear() {
    const juce::ScopedLock lock(mutex_);
    models_.clear();
}

juce::var EntityModelCache::toJSON() const {
    const juce::ScopedLock lock(mutex_);
    juce::var json(new juce::DynamicObject());
    auto* obj = json.getDynamicObject();

    juce::Array<juce::var> models_array;
    for (const auto& [id, model] : models_) {
        models_array.add(model.toJSON());
    }

    obj->setProperty("models", models_array);
    obj->setProperty("total_count", static_cast<int>(models_.size()));

    return json;
}

std::unique_ptr<EntityModelCache> EntityModelCache::fromJSON(const juce::var& json) {
    auto cache = std::make_unique<EntityModelCache>();
    // TODO: Implement deserialization in Phase 10
    return cache;
}

} // namespace Avdecc
} // namespace Map2Audio

#endif // HAS_AVDECC
