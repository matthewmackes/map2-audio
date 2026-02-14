/**
 * AVDECC Entity Model (AEM) Descriptor Definitions
 *
 * Implements IEEE 1722.1-2013 Section 7.2 descriptor structures.
 * These descriptors form a tree: Entity → Configuration → Stream/Port/etc.
 *
 * Only compiled when USE_AVDECC=ON in CMake.
 */

#pragma once

#ifdef HAS_AVDECC

#include <JuceHeader.h>
#include <array>
#include <cstdint>
#include <string>
#include <vector>
#include <optional>

namespace Map2Audio {
namespace Avdecc {

// ============================================================================
// IEEE 1722.1 Descriptor Types (Section 7.2)
// ============================================================================

enum class DescriptorType : uint16_t {
    ENTITY = 0x0000,
    CONFIGURATION = 0x0001,
    AUDIO_UNIT = 0x0002,
    VIDEO_UNIT = 0x0003,
    SENSOR_UNIT = 0x0004,
    STREAM_INPUT = 0x0005,
    STREAM_OUTPUT = 0x0006,
    JACK_INPUT = 0x0007,
    JACK_OUTPUT = 0x0008,
    AVB_INTERFACE = 0x0009,
    CLOCK_SOURCE = 0x000A,
    MEMORY_OBJECT = 0x000B,
    LOCALE = 0x000C,
    STRINGS = 0x000D,
    STREAM_PORT_INPUT = 0x000E,
    STREAM_PORT_OUTPUT = 0x000F,
    EXTERNAL_PORT_INPUT = 0x0010,
    EXTERNAL_PORT_OUTPUT = 0x0011,
    INTERNAL_PORT_INPUT = 0x0012,
    INTERNAL_PORT_OUTPUT = 0x0013,
    AUDIO_CLUSTER = 0x0014,
    VIDEO_CLUSTER = 0x0015,
    SENSOR_CLUSTER = 0x0016,
    AUDIO_MAP = 0x0017,
    VIDEO_MAP = 0x0018,
    SENSOR_MAP = 0x0019,
    CONTROL = 0x001A,
    SIGNAL_SELECTOR = 0x001B,
    MIXER = 0x001C,
    MATRIX = 0x001D,
    MATRIX_SIGNAL = 0x001E,
    SIGNAL_SPLITTER = 0x001F,
    SIGNAL_COMBINER = 0x0020,
    SIGNAL_DEMULTIPLEXER = 0x0021,
    SIGNAL_MULTIPLEXER = 0x0022,
    SIGNAL_TRANSCODER = 0x0023,
    CLOCK_DOMAIN = 0x0024,
    CONTROL_BLOCK = 0x0025,
    INVALID = 0xFFFF
};

// AVDTP string (64 bytes max, UTF-8)
struct AvdeccString {
    std::string value;

    AvdeccString() = default;
    explicit AvdeccString(const std::string& str) : value(str.substr(0, 64)) {}

    operator std::string() const { return value; }
};

// Stream format (IEEE 1722 format codes)
using StreamFormat = uint64_t;

// Sampling rates
struct SamplingRate {
    uint8_t pull_field;  // 0 = 1:1, 1 = 1/1.001, 2 = 1.001:1, 3 = 24/25, 4 = 25/24
    uint32_t base_frequency;  // Hz

    static SamplingRate from_hz(uint32_t hz) {
        return {0, hz};  // No pull, direct frequency
    }
};

// ============================================================================
// Descriptor Structures (Binary PDU format)
// ============================================================================

#pragma pack(push, 1)

struct DescriptorHeader {
    uint16_t descriptor_type;
    uint16_t descriptor_index;
};

// ENTITY descriptor (IEEE 1722.1-2013 Section 7.2.1)
struct EntityDescriptor {
    DescriptorHeader header;
    uint8_t entity_id[8];
    uint8_t entity_model_id[8];
    uint32_t entity_capabilities;
    uint16_t talker_stream_sources;
    uint16_t talker_capabilities;
    uint16_t listener_stream_sinks;
    uint16_t listener_capabilities;
    uint32_t controller_capabilities;
    uint32_t available_index;
    uint8_t association_id[8];
    char entity_name[64];
    uint16_t vendor_name_string;
    uint16_t model_name_string;
    char firmware_version[64];
    char group_name[64];
    char serial_number[64];
    uint16_t configurations_count;
    uint16_t current_configuration;
};

// CONFIGURATION descriptor (Section 7.2.2)
struct ConfigurationDescriptor {
    DescriptorHeader header;
    char object_name[64];
    uint16_t localized_description;
    uint16_t descriptor_counts_count;
    uint16_t descriptor_counts_offset;
    // Followed by descriptor_counts array (type, count pairs)
};

struct DescriptorCount {
    uint16_t descriptor_type;
    uint16_t count;
};

// STREAM_INPUT/OUTPUT descriptor (Section 7.2.6, 7.2.7)
struct StreamDescriptor {
    DescriptorHeader header;
    char object_name[64];
    uint16_t localized_description;
    uint16_t clock_domain_index;
    uint16_t stream_flags;
    uint8_t current_format[8];  // StreamFormat
    uint16_t formats_offset;
    uint16_t number_of_formats;
    uint8_t backup_talker_entity_id_0[8];
    uint16_t backup_talker_unique_id_0;
    uint8_t backup_talker_entity_id_1[8];
    uint16_t backup_talker_unique_id_1;
    uint8_t backup_talker_entity_id_2[8];
    uint16_t backup_talker_unique_id_2;
    uint8_t backedup_talker_entity_id[8];
    uint16_t backedup_talker_unique;
    uint16_t avb_interface_index;
    uint32_t buffer_length;
    // Followed by formats array
};

// AVB_INTERFACE descriptor (Section 7.2.9)
struct AvbInterfaceDescriptor {
    DescriptorHeader header;
    char object_name[64];
    uint16_t localized_description;
    uint8_t mac_address[6];
    uint16_t interface_flags;
    uint8_t clock_identity[8];
    uint8_t priority1;
    uint8_t clock_class;
    uint16_t offset_scaled_log_variance;
    uint8_t clock_accuracy;
    uint8_t priority2;
    uint8_t domain_number;
    uint8_t log_sync_interval;
    uint8_t log_announce_interval;
    uint8_t log_pdelay_interval;
    uint16_t port_number;
};

// CLOCK_SOURCE descriptor (Section 7.2.10)
struct ClockSourceDescriptor {
    DescriptorHeader header;
    char object_name[64];
    uint16_t localized_description;
    uint16_t clock_source_flags;
    uint16_t clock_source_type;
    uint8_t clock_source_identifier[8];
    uint16_t clock_source_location_type;
    uint16_t clock_source_location_index;
};

// AUDIO_UNIT descriptor (Section 7.2.3)
struct AudioUnitDescriptor {
    DescriptorHeader header;
    char object_name[64];
    uint16_t localized_description;
    uint16_t clock_domain_index;
    uint16_t number_of_stream_input_ports;
    uint16_t base_stream_input_port;
    uint16_t number_of_stream_output_ports;
    uint16_t base_stream_output_port;
    uint16_t number_of_external_input_ports;
    uint16_t base_external_input_port;
    uint16_t number_of_external_output_ports;
    uint16_t base_external_output_port;
    uint16_t number_of_internal_input_ports;
    uint16_t base_internal_input_port;
    uint16_t number_of_internal_output_ports;
    uint16_t base_internal_output_port;
    uint16_t number_of_controls;
    uint16_t base_control;
    uint16_t number_of_signal_selectors;
    uint16_t base_signal_selector;
    uint16_t number_of_mixers;
    uint16_t base_mixer;
    uint16_t number_of_matrices;
    uint16_t base_matrix;
    uint16_t number_of_splitters;
    uint16_t base_splitter;
    uint16_t number_of_combiners;
    uint16_t base_combiner;
    uint16_t number_of_demultiplexers;
    uint16_t base_demultiplexer;
    uint16_t number_of_multiplexers;
    uint16_t base_multiplexer;
    uint16_t number_of_transcoders;
    uint16_t base_transcoder;
    uint16_t number_of_control_blocks;
    uint16_t base_control_block;
    uint32_t current_sampling_rate;
    uint16_t sampling_rates_offset;
    uint16_t sampling_rates_count;
    // Followed by sampling_rates array
};

#pragma pack(pop)

// ============================================================================
// C++ Descriptor Objects (parsed from PDUs)
// ============================================================================

struct Entity {
    uint64_t entity_id;
    uint64_t entity_model_id;
    uint32_t entity_capabilities;
    uint16_t talker_stream_sources;
    uint16_t talker_capabilities;
    uint16_t listener_stream_sinks;
    uint16_t listener_capabilities;
    uint32_t controller_capabilities;
    uint32_t available_index;
    uint64_t association_id;
    AvdeccString entity_name;
    uint16_t vendor_name_string_index;
    uint16_t model_name_string_index;
    AvdeccString firmware_version;
    AvdeccString group_name;
    AvdeccString serial_number;
    uint16_t configurations_count;
    uint16_t current_configuration;

    static std::optional<Entity> fromDescriptor(const EntityDescriptor& desc);
    EntityDescriptor toDescriptor() const;
};

struct Configuration {
    uint16_t configuration_index;
    AvdeccString object_name;
    uint16_t localized_description;
    std::vector<DescriptorCount> descriptor_counts;

    static std::optional<Configuration> fromDescriptor(const ConfigurationDescriptor& desc, const uint8_t* payload, size_t payload_size);
    std::vector<uint8_t> toDescriptor() const;
};

struct StreamInput {
    uint16_t stream_index;
    AvdeccString object_name;
    uint16_t localized_description;
    uint16_t clock_domain_index;
    uint16_t stream_flags;
    StreamFormat current_format;
    std::vector<StreamFormat> supported_formats;
    uint16_t avb_interface_index;
    uint32_t buffer_length;

    static std::optional<StreamInput> fromDescriptor(const StreamDescriptor& desc, const uint8_t* payload, size_t payload_size);
    std::vector<uint8_t> toDescriptor() const;
};

struct StreamOutput {
    uint16_t stream_index;
    AvdeccString object_name;
    uint16_t localized_description;
    uint16_t clock_domain_index;
    uint16_t stream_flags;
    StreamFormat current_format;
    std::vector<StreamFormat> supported_formats;
    uint16_t avb_interface_index;
    uint32_t buffer_length;

    static std::optional<StreamOutput> fromDescriptor(const StreamDescriptor& desc, const uint8_t* payload, size_t payload_size);
    std::vector<uint8_t> toDescriptor() const;
};

struct AvbInterface {
    uint16_t interface_index;
    AvdeccString object_name;
    uint16_t localized_description;
    std::array<uint8_t, 6> mac_address;
    uint16_t interface_flags;
    std::array<uint8_t, 8> clock_identity;
    uint8_t priority1;
    uint8_t clock_class;
    uint16_t offset_scaled_log_variance;
    uint8_t clock_accuracy;
    uint8_t priority2;
    uint8_t domain_number;
    int8_t log_sync_interval;
    int8_t log_announce_interval;
    int8_t log_pdelay_interval;
    uint16_t port_number;

    static std::optional<AvbInterface> fromDescriptor(const AvbInterfaceDescriptor& desc);
    AvbInterfaceDescriptor toDescriptor() const;
};

struct ClockSource {
    uint16_t clock_source_index;
    AvdeccString object_name;
    uint16_t localized_description;
    uint16_t clock_source_flags;
    uint16_t clock_source_type;
    std::array<uint8_t, 8> clock_source_identifier;
    uint16_t clock_source_location_type;
    uint16_t clock_source_location_index;

    static std::optional<ClockSource> fromDescriptor(const ClockSourceDescriptor& desc);
    ClockSourceDescriptor toDescriptor() const;
};

struct AudioUnit {
    uint16_t audio_unit_index;
    AvdeccString object_name;
    uint16_t localized_description;
    uint16_t clock_domain_index;
    uint16_t number_of_stream_input_ports;
    uint16_t base_stream_input_port;
    uint16_t number_of_stream_output_ports;
    uint16_t base_stream_output_port;
    uint32_t current_sampling_rate;
    std::vector<SamplingRate> sampling_rates;

    static std::optional<AudioUnit> fromDescriptor(const AudioUnitDescriptor& desc, const uint8_t* payload, size_t payload_size);
    std::vector<uint8_t> toDescriptor() const;
};

} // namespace Avdecc
} // namespace Map2Audio

#endif // HAS_AVDECC
