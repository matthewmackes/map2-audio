#include <catch2/catch_test_macros.hpp>
#include "AvdeccEntityModel.h"

using namespace Map2Audio::Avdecc;

TEST_CASE("EntityModel toJSON/fromJSON round-trips core descriptors") {
#ifdef HAS_AVDECC
    Entity entity{};
    entity.entity_id = 0x0011223344556677ULL;
    entity.entity_model_id = 0x8899AABBCCDDEEFFULL;
    entity.entity_name = AvdeccString("Test Entity");
    entity.firmware_version = AvdeccString("1.0.0");
    entity.group_name = AvdeccString("grp");
    entity.serial_number = AvdeccString("SN123");
    entity.entity_capabilities = 0x1234;
    entity.talker_stream_sources = 2;
    entity.listener_stream_sinks = 1;
    entity.controller_capabilities = 0x01020304;
    entity.current_configuration = 0;
    entity.configurations_count = 1;

    EntityModel model(entity);

    Configuration cfg{};
    cfg.configuration_index = 0;
    cfg.object_name = AvdeccString("Default");
    cfg.descriptor_counts.push_back({static_cast<uint16_t>(DescriptorType::STREAM_INPUT), 1});
    cfg.descriptor_counts.push_back({static_cast<uint16_t>(DescriptorType::STREAM_OUTPUT), 1});
    cfg.descriptor_counts.push_back({static_cast<uint16_t>(DescriptorType::AVB_INTERFACE), 1});
    cfg.descriptor_counts.push_back({static_cast<uint16_t>(DescriptorType::CLOCK_SOURCE), 1});
    cfg.descriptor_counts.push_back({static_cast<uint16_t>(DescriptorType::AUDIO_UNIT), 1});
    model.addConfiguration(cfg);

    StreamInput si{};
    si.stream_index = 0;
    si.object_name = AvdeccString("In0");
    si.current_format = 0x1122334455667788ULL;
    si.supported_formats = {0x1122334455667788ULL};
    si.avb_interface_index = 0;
    model.addStreamInput(0, si);

    StreamOutput so{};
    so.stream_index = 0;
    so.object_name = AvdeccString("Out0");
    so.current_format = 0x8877665544332211ULL;
    so.supported_formats = {0x8877665544332211ULL};
    so.avb_interface_index = 0;
    model.addStreamOutput(0, so);

    AvbInterface iface{};
    iface.interface_index = 0;
    iface.object_name = AvdeccString("eth0");
    iface.mac_address = {0x00, 0x11, 0x22, 0x33, 0x44, 0x55};
    iface.clock_identity = {0,1,2,3,4,5,6,7};
    iface.domain_number = 1;
    model.addAvbInterface(0, iface);

    ClockSource clk{};
    clk.clock_source_index = 0;
    clk.object_name = AvdeccString("clk");
    clk.clock_source_identifier = {0,1,2,3,4,5,6,7};
    model.addClockSource(0, clk);

    AudioUnit au{};
    au.audio_unit_index = 0;
    au.object_name = AvdeccString("unit");
    au.number_of_stream_input_ports = 1;
    au.number_of_stream_output_ports = 1;
    au.current_sampling_rate = 48000;
    au.sampling_rates.push_back(SamplingRate::from_hz(48000));
    model.addAudioUnit(0, au);

    auto json = model.toJSON();
    auto restoredOpt = EntityModel::fromJSON(json);
    REQUIRE(restoredOpt.has_value());
    const auto restored = *restoredOpt;

    REQUIRE(restored.getEntityId() == entity.entity_id);
    REQUIRE(restored.getEntityModelId() == entity.entity_model_id);
    auto stats = restored.getStats();
    REQUIRE(stats.total_configurations == 1);
    REQUIRE(stats.total_stream_inputs == 1);
    REQUIRE(stats.total_stream_outputs == 1);
    REQUIRE(stats.total_avb_interfaces == 1);
    REQUIRE(stats.total_clock_sources == 1);
    REQUIRE(stats.total_audio_units == 1);

    auto in = restored.getStreamInput(0, 0);
    REQUIRE(in.has_value());
    REQUIRE(in->current_format == si.current_format);

    auto out = restored.getStreamOutput(0, 0);
    REQUIRE(out.has_value());
    REQUIRE(out->current_format == so.current_format);

    auto ifaceRestored = restored.getAvbInterface(0, 0);
    REQUIRE(ifaceRestored.has_value());
    REQUIRE(ifaceRestored->mac_address == iface.mac_address);
#endif
}

TEST_CASE("EntityModel stream format mutators update existing descriptors") {
#ifdef HAS_AVDECC
    Entity entity{};
    entity.entity_id = 0x0011223344556677ULL;
    entity.entity_model_id = 0x8899AABBCCDDEEFFULL;
    entity.current_configuration = 0;
    entity.configurations_count = 1;

    EntityModel model(entity);

    StreamInput input{};
    input.stream_index = 1;
    input.current_format = 0x0200000218000005ULL;
    model.addStreamInput(0, input);

    StreamOutput output{};
    output.stream_index = 2;
    output.current_format = 0x0200000218000005ULL;
    model.addStreamOutput(0, output);

    REQUIRE(model.setStreamInputFormat(0, 1, 0x0200000818000005ULL));
    REQUIRE(model.setStreamOutputFormat(0, 2, 0x0200000418000007ULL));
    REQUIRE_FALSE(model.setStreamInputFormat(0, 99, 0x1ULL));
    REQUIRE_FALSE(model.setStreamOutputFormat(1, 2, 0x1ULL));

    auto updatedInput = model.getStreamInput(0, 1);
    REQUIRE(updatedInput.has_value());
    REQUIRE(updatedInput->current_format == 0x0200000818000005ULL);

    auto updatedOutput = model.getStreamOutput(0, 2);
    REQUIRE(updatedOutput.has_value());
    REQUIRE(updatedOutput->current_format == 0x0200000418000007ULL);
#endif
}
