#include <catch2/catch_test_macros.hpp>

#include "AvdeccEnumerator.h"
#include "AvdeccDescriptors.h"
#include "AvdeccEntity.h"

#include <array>
#include <cstring>
#include <optional>
#include <vector>

using namespace Map2Audio;
using namespace Map2Audio::Avdecc;

namespace {

struct SentReadDescriptorRequest {
    uint16_t sequence_id = 0;
    uint16_t configuration_index = 0;
    DescriptorType descriptor_type = DescriptorType::ENTITY;
    uint16_t descriptor_index = 0;
};

struct ReadDescriptorCommand {
    AecpPdu header;
    uint16_t configuration_index;
    uint16_t reserved;
    uint16_t descriptor_type;
    uint16_t descriptor_index;
} __attribute__((packed));

void writeU16Be(uint8_t* dest, uint16_t value) {
    dest[0] = static_cast<uint8_t>((value >> 8) & 0xFF);
    dest[1] = static_cast<uint8_t>(value & 0xFF);
}

void writeU64Be(uint8_t* dest, uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        dest[i] = static_cast<uint8_t>((value >> (56 - i * 8)) & 0xFF);
    }
}

std::vector<uint8_t> buildEntityDescriptorPayload(uint64_t entity_id, uint64_t entity_model_id) {
    EntityDescriptor descriptor{};
    descriptor.header.descriptor_type =
        juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(DescriptorType::ENTITY));
    descriptor.header.descriptor_index = juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(0));
    writeU64Be(descriptor.entity_id, entity_id);
    writeU64Be(descriptor.entity_model_id, entity_model_id);
    descriptor.configurations_count = juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(1));
    descriptor.current_configuration = juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(0));
    std::strncpy(descriptor.entity_name, "EnumTestEntity", sizeof(descriptor.entity_name) - 1);
    std::strncpy(descriptor.firmware_version, "1.2.3", sizeof(descriptor.firmware_version) - 1);

    std::vector<uint8_t> bytes(sizeof(descriptor));
    std::memcpy(bytes.data(), &descriptor, sizeof(descriptor));
    return bytes;
}

std::vector<uint8_t> buildConfigurationDescriptorPayload() {
    ConfigurationDescriptor descriptor{};
    descriptor.header.descriptor_type =
        juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(DescriptorType::CONFIGURATION));
    descriptor.header.descriptor_index = juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(0));
    std::strncpy(descriptor.object_name, "Default", sizeof(descriptor.object_name) - 1);
    descriptor.descriptor_counts_count = juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(0));
    descriptor.descriptor_counts_offset =
        juce::ByteOrder::swapIfLittleEndian(static_cast<uint16_t>(sizeof(ConfigurationDescriptor)));

    std::vector<uint8_t> bytes(sizeof(descriptor));
    std::memcpy(bytes.data(), &descriptor, sizeof(descriptor));
    return bytes;
}

std::vector<uint8_t> wrapReadDescriptorResponse(DescriptorType descriptor_type,
                                                uint16_t descriptor_index,
                                                const std::vector<uint8_t>& descriptor_payload) {
    std::vector<uint8_t> payload(8 + descriptor_payload.size(), 0);
    writeU16Be(payload.data() + 4, static_cast<uint16_t>(descriptor_type));
    writeU16Be(payload.data() + 6, descriptor_index);
    std::memcpy(payload.data() + 8, descriptor_payload.data(), descriptor_payload.size());
    return payload;
}

AecpPdu makeAemResponsePdu(uint16_t sequence_id, AecpStatus status) {
    AecpPdu pdu{};
    pdu.sequence_id = juce::ByteOrder::swapIfLittleEndian(sequence_id);
    const uint16_t command_type_field =
        static_cast<uint16_t>((static_cast<uint16_t>(status) << 8) |
                              static_cast<uint16_t>(AemCommandType::READ_DESCRIPTOR));
    pdu.command_type = juce::ByteOrder::swapIfLittleEndian(command_type_field);
    return pdu;
}

}  // namespace

TEST_CASE("AvdeccEnumerator completes minimal ENTITY->CONFIGURATION lifecycle", "[avdecc][enumerator]") {
#ifdef HAS_AVDECC
    AvdeccEnumerator enumerator;
    const uint64_t entity_id = 0x0011223344556677ULL;
    const uint64_t entity_model_id = 0x8899AABBCCDDEEFFULL;
    const uint64_t controller_id = 0xA0A1A2A3A4A5A6A7ULL;

    std::vector<SentReadDescriptorRequest> sent_requests;
    bool callback_called = false;
    bool callback_success = false;
    uint64_t callback_entity_id = 0;
    std::optional<EntityModel> callback_model;

    enumerator.setControllerEntityId(controller_id);
    enumerator.setSendFunction([&](const void* data, size_t length) {
        REQUIRE(length == sizeof(ReadDescriptorCommand));
        ReadDescriptorCommand cmd{};
        std::memcpy(&cmd, data, sizeof(cmd));

        SentReadDescriptorRequest request;
        request.sequence_id = juce::ByteOrder::swapIfLittleEndian(cmd.header.sequence_id);
        request.configuration_index = juce::ByteOrder::swapIfLittleEndian(cmd.configuration_index);
        request.descriptor_type =
            static_cast<DescriptorType>(juce::ByteOrder::swapIfLittleEndian(cmd.descriptor_type));
        request.descriptor_index = juce::ByteOrder::swapIfLittleEndian(cmd.descriptor_index);
        sent_requests.push_back(request);
        return true;
    });

    enumerator.startEnumeration(entity_id, entity_model_id, "1.2.3",
                                [&](uint64_t eid, EntityModel model, bool success) {
                                    callback_called = true;
                                    callback_success = success;
                                    callback_entity_id = eid;
                                    callback_model = std::move(model);
                                });

    REQUIRE(enumerator.isEnumerating(entity_id));
    REQUIRE(sent_requests.size() == 1);
    REQUIRE(sent_requests[0].descriptor_type == DescriptorType::ENTITY);
    REQUIRE(sent_requests[0].descriptor_index == 0);

    const auto entity_payload = wrapReadDescriptorResponse(
        DescriptorType::ENTITY, 0, buildEntityDescriptorPayload(entity_id, entity_model_id));
    const auto entity_response =
        makeAemResponsePdu(sent_requests[0].sequence_id, AecpStatus::SUCCESS);
    enumerator.handleAemResponse(entity_response, entity_payload.data(), entity_payload.size());

    REQUIRE(sent_requests.size() == 2);
    REQUIRE(sent_requests[1].descriptor_type == DescriptorType::CONFIGURATION);
    REQUIRE(sent_requests[1].descriptor_index == 0);

    const auto config_payload =
        wrapReadDescriptorResponse(DescriptorType::CONFIGURATION, 0, buildConfigurationDescriptorPayload());
    const auto config_response =
        makeAemResponsePdu(sent_requests[1].sequence_id, AecpStatus::SUCCESS);
    enumerator.handleAemResponse(config_response, config_payload.data(), config_payload.size());

    REQUIRE(callback_called);
    REQUIRE(callback_success);
    REQUIRE(callback_entity_id == entity_id);
    REQUIRE(callback_model.has_value());
    REQUIRE(callback_model->getEntityId() == entity_id);
    REQUIRE(callback_model->getEntityModelId() == entity_model_id);
    REQUIRE(callback_model->getConfiguration(0).has_value());
    REQUIRE_FALSE(enumerator.isEnumerating(entity_id));
#endif
}

TEST_CASE("AvdeccEnumerator retries failed READ_DESCRIPTOR responses and fails deterministically", "[avdecc][enumerator][retry]") {
#ifdef HAS_AVDECC
    AvdeccEnumerator enumerator;
    const uint64_t entity_id = 0x0123456789ABCDEFULL;
    const uint64_t entity_model_id = 0x0F0E0D0C0B0A0908ULL;

    std::vector<SentReadDescriptorRequest> sent_requests;
    bool callback_called = false;
    bool callback_success = true;

    enumerator.setControllerEntityId(0x1111111111111111ULL);
    enumerator.setSendFunction([&](const void* data, size_t length) {
        REQUIRE(length == sizeof(ReadDescriptorCommand));
        ReadDescriptorCommand cmd{};
        std::memcpy(&cmd, data, sizeof(cmd));

        SentReadDescriptorRequest request;
        request.sequence_id = juce::ByteOrder::swapIfLittleEndian(cmd.header.sequence_id);
        request.configuration_index = juce::ByteOrder::swapIfLittleEndian(cmd.configuration_index);
        request.descriptor_type =
            static_cast<DescriptorType>(juce::ByteOrder::swapIfLittleEndian(cmd.descriptor_type));
        request.descriptor_index = juce::ByteOrder::swapIfLittleEndian(cmd.descriptor_index);
        sent_requests.push_back(request);
        return true;
    });

    enumerator.startEnumeration(entity_id, entity_model_id, "retry-case",
                                [&](uint64_t, EntityModel, bool success) {
                                    callback_called = true;
                                    callback_success = success;
                                });

    REQUIRE(sent_requests.size() == 1);
    REQUIRE(enumerator.isEnumerating(entity_id));

    for (uint8_t attempt = 0; attempt <= PendingDescriptorRequest::MAX_RETRIES; ++attempt) {
        const auto latest_request = sent_requests.back();
        const auto response = makeAemResponsePdu(latest_request.sequence_id, AecpStatus::NOT_IMPLEMENTED);
        const uint8_t empty_payload[8] = {0};
        enumerator.handleAemResponse(response, empty_payload, sizeof(empty_payload));

        if (attempt < PendingDescriptorRequest::MAX_RETRIES) {
            REQUIRE(enumerator.isEnumerating(entity_id));
            REQUIRE(sent_requests.size() == static_cast<size_t>(attempt) + 2);
        }
    }

    REQUIRE(callback_called);
    REQUIRE_FALSE(callback_success);
    REQUIRE_FALSE(enumerator.isEnumerating(entity_id));
#endif
}
