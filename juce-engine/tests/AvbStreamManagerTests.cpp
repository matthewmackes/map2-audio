#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "../Source/AvbStream.h"
#include <array>

using namespace Map2Audio;

TEST_CASE("AvbStreamStats snapshot and reset", "[avb][stats]") {
    AvbStreamStats stats;
    stats.framesSent.store(10);
    stats.framesReceived.store(5);
    stats.timestampErrors.store(2);
    stats.sequenceErrors.store(1);
    stats.bytesTransferred.store(4096);

    auto snap = stats.snapshot();
    REQUIRE(snap.framesSent == 10);
    REQUIRE(snap.framesReceived == 5);
    REQUIRE(snap.timestampErrors == 2);
    REQUIRE(snap.sequenceErrors == 1);
    REQUIRE(snap.bytesTransferred == 4096);

    stats.reset();
    auto snap2 = stats.snapshot();
    REQUIRE(snap2.framesSent == 0);
    REQUIRE(snap2.framesReceived == 0);
    REQUIRE(snap2.timestampErrors == 0);
    REQUIRE(snap2.sequenceErrors == 0);
}

TEST_CASE("AvbStreamStats min/max latency reset", "[avb][stats]") {
    AvbStreamStats stats;
    stats.maxLatencyNs.store(42);
    stats.minLatencyNs.store(84);

    auto snap = stats.snapshot();
    REQUIRE(snap.maxLatencyNs == 42);
    REQUIRE(snap.minLatencyNs == 84);

    stats.reset();
    auto snap2 = stats.snapshot();
    REQUIRE(snap2.maxLatencyNs == 0);
    REQUIRE(snap2.minLatencyNs == INT64_MAX);
}

TEST_CASE("AvbStreamStats default min latency is INT64_MAX", "[avb][stats]") {
    AvbStreamStats stats;
    auto snap = stats.snapshot();
    REQUIRE(snap.minLatencyNs == INT64_MAX);
    REQUIRE(snap.maxLatencyNs == 0);
}

TEST_CASE("AvbStreamStats accumulates counters", "[avb][stats]") {
    AvbStreamStats stats;
    stats.framesSent.fetch_add(5);
    stats.framesReceived.fetch_add(3);
    stats.sequenceErrors.fetch_add(2);
    stats.bytesTransferred.fetch_add(2048);

    auto snap = stats.snapshot();
    REQUIRE(snap.framesSent == 5);
    REQUIRE(snap.framesReceived == 3);
    REQUIRE(snap.sequenceErrors == 2);
    REQUIRE(snap.bytesTransferred == 2048);
}

TEST_CASE("AVTP packet encode/decode preserves metadata", "[avb][avtp]") {
    const uint8_t mac[] = {0x90, 0xE2, 0xBA, 0x10, 0x00, 0x01};
    AvbStreamConfig config{};
    config.interface = "lo";
    config.destMac[0] = mac[0];
    config.destMac[1] = mac[1];
    config.destMac[2] = mac[2];
    config.destMac[3] = mac[3];
    config.destMac[4] = mac[4];
    config.destMac[5] = mac[5];
    config.streamId = 0xAABBCCDDEEFF0011ULL;
    config.direction = AvbDirection::Talker;
    config.sampleRate = 48000;
    config.channels = 2;
    config.bitDepth = 16;
    config.samplesPerFrame = 6;
    config.presentationOffsetUs = 2000;
    config.priority = 3;
    config.enableTimestamping = true;

    AvbStream stream(config, 1);

    const std::array<float, 6> inputSamples = {0.10f, -0.20f, 0.30f, -0.40f, 0.50f, -0.60f};
    std::array<uint8_t, 256> packet{};
    std::array<float, 6> outputSamples{};
    uint64_t packetTimestamp = 1'230'456'789ULL;

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        packetTimestamp,
        7,
        packet.data(),
        packet.size());

    REQUIRE(packedSize == 24 + inputSamples.size() * sizeof(int16_t));
    REQUIRE(stream.getNextSequenceForTest() == 0);

    uint64_t decodeTimestamp = 0;
    const size_t decodedSamples = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        outputSamples.data(),
        outputSamples.size(),
        &decodeTimestamp);

    REQUIRE(decodedSamples == inputSamples.size());
    REQUIRE(decodeTimestamp == packetTimestamp);
    REQUIRE(stream.getExpectedSequenceForTest() == 8);
} 

TEST_CASE("AVTP sequence mismatch increments sequence error counter", "[avb][avtp]") {
    const uint8_t mac[] = {0x90, 0xE2, 0xBA, 0x10, 0x00, 0x02};
    AvbStreamConfig config{};
    config.interface = "lo";
    config.destMac[0] = mac[0];
    config.destMac[1] = mac[1];
    config.destMac[2] = mac[2];
    config.destMac[3] = mac[3];
    config.destMac[4] = mac[4];
    config.destMac[5] = mac[5];
    config.streamId = 0x1122334455667788ULL;
    config.direction = AvbDirection::Listener;
    config.sampleRate = 48000;
    config.channels = 1;
    config.bitDepth = 16;
    config.samplesPerFrame = 4;
    config.presentationOffsetUs = 1000;
    config.priority = 3;
    config.enableTimestamping = true;

    AvbStream stream(config, 1);
    const std::array<float, 4> inputSamples = {0.0f, 0.25f, -0.25f, 0.5f};
    std::array<uint8_t, 256> packet{};
    std::array<float, 4> outputSamples{};

    const size_t packedSize1 = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        100,
        0,
        packet.data(),
        packet.size());
    REQUIRE(packedSize1 > 0);
    REQUIRE(stream.getExpectedSequenceForTest() == 0);

    REQUIRE(
        stream.decodeAvtpPacketForTest(packet.data(), packedSize1, outputSamples.data(), outputSamples.size(), nullptr)
            == inputSamples.size());
    REQUIRE(stream.getExpectedSequenceForTest() == 1);
    REQUIRE(stream.getMutableStats().sequenceErrors.load() == 0);

    const size_t packedSize2 = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        200,
        5,
        packet.data(),
        packet.size());
    REQUIRE(packedSize2 > 0);

    REQUIRE(
        stream.decodeAvtpPacketForTest(packet.data(), packedSize2, outputSamples.data(), outputSamples.size(), nullptr)
            == inputSamples.size());
    REQUIRE(stream.getExpectedSequenceForTest() == 6);
    REQUIRE(stream.getMutableStats().sequenceErrors.load() == 1);
}

TEST_CASE("AVTP timestamp validation is counted on zero timestamp", "[avb][avtp]") {
    const uint8_t mac[] = {0x90, 0xE2, 0xBA, 0x10, 0x00, 0x03};
    AvbStreamConfig config{};
    config.interface = "lo";
    config.destMac[0] = mac[0];
    config.destMac[1] = mac[1];
    config.destMac[2] = mac[2];
    config.destMac[3] = mac[3];
    config.destMac[4] = mac[4];
    config.destMac[5] = mac[5];
    config.streamId = 0x9988776655443322ULL;
    config.direction = AvbDirection::Listener;
    config.sampleRate = 48000;
    config.channels = 2;
    config.bitDepth = 16;
    config.samplesPerFrame = 2;
    config.presentationOffsetUs = 1000;
    config.priority = 3;
    config.enableTimestamping = true;

    AvbStream stream(config, 1);
    const std::array<float, 2> inputSamples = {0.1f, -0.1f};
    std::array<uint8_t, 256> packet{};
    std::array<float, 2> outputSamples{};

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        0,
        0,
        packet.data(),
        packet.size());
    REQUIRE(packedSize > 0);

    uint64_t decodeTimestamp = 0;
    const size_t decoded = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        outputSamples.data(),
        outputSamples.size(),
        &decodeTimestamp);

    REQUIRE(decoded == inputSamples.size());
    REQUIRE(decodeTimestamp == 0);
    REQUIRE(stream.getMutableStats().timestampErrors.load() == 1);
}
