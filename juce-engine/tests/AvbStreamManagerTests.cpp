#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "../Source/AvbStream.h"
#include <array>
#include <vector>

using namespace Map2Audio;

namespace {

constexpr size_t kAvtpHeaderSizeForTest = 24;
constexpr size_t kAvtpTimestampOffsetForTest = 16;
constexpr size_t kAvtpSequenceOffsetForTest = 15;
constexpr size_t kAvtpTimestampValidOffsetForTest = 14;
constexpr uint8_t kAvtpTimestampValidBitForTest = 0x80;

AvbStreamConfig makeTestConfig(AvbDirection direction,
                               uint16_t bitDepth,
                               uint16_t channels,
                               uint16_t samplesPerFrame,
                               uint64_t streamId,
                               uint8_t macTail) {
    AvbStreamConfig config{};
    config.interface = "lo";
    config.destMac[0] = 0x90;
    config.destMac[1] = 0xE2;
    config.destMac[2] = 0xBA;
    config.destMac[3] = 0x10;
    config.destMac[4] = 0x00;
    config.destMac[5] = macTail;
    config.streamId = streamId;
    config.direction = direction;
    config.sampleRate = 48000;
    config.channels = channels;
    config.bitDepth = bitDepth;
    config.samplesPerFrame = samplesPerFrame;
    config.presentationOffsetUs = 2000;
    config.priority = 3;
    config.enableTimestamping = true;
    return config;
}

} // namespace

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

TEST_CASE("AVTP initialization maps stream configuration to descriptor fields", "[avb][init]") {
    AvbStream stream(makeTestConfig(AvbDirection::Talker, 24, 2, 4, 0x0102030405060708ULL, 0x55), 1);

    REQUIRE(stream.isAvtpInitializedForTest());
    REQUIRE(stream.getConfiguredStreamIdForTest() == 0x0102030405060708ULL);
    REQUIRE(stream.getNsrCodeForTest() == 5);       // 48kHz
    REQUIRE(stream.getFormatCodeForTest() == 0x18); // 24-bit PCM
    REQUIRE(stream.getStreamDataLengthForTest() == 24);
    REQUIRE(stream.getAvtpStorageSizeForTest() == 48);
}

TEST_CASE("AVTP initialization rejects unsupported sample rates", "[avb][init]") {
    auto config = makeTestConfig(AvbDirection::Talker, 16, 2, 4, 0x1000000000000001ULL, 0x56);
    config.sampleRate = 12345;

    REQUIRE_THROWS_AS(AvbStream(config, 1), AvbConfigException);
}

TEST_CASE("AVTP initialization rejects payload sizes beyond MTU budget", "[avb][init]") {
    auto config = makeTestConfig(AvbDirection::Talker, 32, 32, 256, 0x1000000000000002ULL, 0x57);
    REQUIRE_THROWS_AS(AvbStream(config, 1), AvbConfigException);
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

TEST_CASE("AVTP 16-bit encode writes big-endian payload and header fields", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Talker, 16, 2, 2, 0x0102030405060708ULL, 0x11), 1);

    const std::array<float, 2> inputSamples = {1.0f, -1.0f};
    std::array<uint8_t, 128> packet{};
    const uint64_t timestamp = 0x0102030405060708ULL;

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        timestamp,
        0x2A,
        packet.data(),
        packet.size());

    REQUIRE(packedSize == kAvtpHeaderSizeForTest + inputSamples.size() * sizeof(int16_t));
    REQUIRE(packet[kAvtpTimestampValidOffsetForTest] == kAvtpTimestampValidBitForTest);
    REQUIRE(packet[kAvtpSequenceOffsetForTest] == 0x2A);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 0] == 0x01);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 1] == 0x02);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 2] == 0x03);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 3] == 0x04);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 4] == 0x05);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 5] == 0x06);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 6] == 0x07);
    REQUIRE(packet[kAvtpTimestampOffsetForTest + 7] == 0x08);

    REQUIRE(packet[kAvtpHeaderSizeForTest + 0] == 0x7F);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 1] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 2] == 0x80);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 3] == 0x01);

    std::array<float, 2> decoded{};
    uint64_t decodedTimestamp = 0;
    const size_t decodedCount = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        decoded.data(),
        decoded.size(),
        &decodedTimestamp);

    REQUIRE(decodedCount == inputSamples.size());
    REQUIRE(decodedTimestamp == timestamp);
    REQUIRE(decoded[0] == Catch::Approx(1.0f).epsilon(0.0002f));
    REQUIRE(decoded[1] == Catch::Approx(-1.0f).epsilon(0.0002f));
}

TEST_CASE("AVTP 24-bit encode/decode preserves big-endian sign extension", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Talker, 24, 1, 3, 0x1111222233334444ULL, 0x12), 1);

    const std::array<float, 3> inputSamples = {1.0f, -1.0f, 0.5f};
    std::array<uint8_t, 128> packet{};
    const uint64_t timestamp = 0xA0B0C0D0E0F00102ULL;

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        timestamp,
        0x03,
        packet.data(),
        packet.size());

    REQUIRE(packedSize == kAvtpHeaderSizeForTest + inputSamples.size() * 3);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 0] == 0x7F);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 1] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 2] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 3] == 0x80);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 4] == 0x00);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 5] == 0x01);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 6] == 0x3F);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 7] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 8] == 0xFF);

    std::array<float, 3> decoded{};
    uint64_t decodedTimestamp = 0;
    const size_t decodedCount = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        decoded.data(),
        decoded.size(),
        &decodedTimestamp);

    REQUIRE(decodedCount == inputSamples.size());
    REQUIRE(decodedTimestamp == timestamp);
    REQUIRE(decoded[0] == Catch::Approx(1.0f).epsilon(0.00001f));
    REQUIRE(decoded[1] == Catch::Approx(-1.0f).epsilon(0.00001f));
    REQUIRE(decoded[2] == Catch::Approx(0.5f).epsilon(0.00001f));
}

TEST_CASE("AVTP 32-bit encode writes network-order payload values", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Talker, 32, 1, 2, 0x5566778899AABBCCULL, 0x13), 1);

    const std::array<float, 2> inputSamples = {1.0f, -1.0f};
    std::array<uint8_t, 128> packet{};

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        0x1234ULL,
        0x44,
        packet.data(),
        packet.size());

    REQUIRE(packedSize == kAvtpHeaderSizeForTest + inputSamples.size() * sizeof(int32_t));
    REQUIRE(packet[kAvtpHeaderSizeForTest + 0] == 0x7F);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 1] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 2] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 3] == 0xFF);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 4] == 0x80);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 5] == 0x00);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 6] == 0x00);
    REQUIRE(packet[kAvtpHeaderSizeForTest + 7] == 0x01);

    std::array<float, 2> decoded{};
    uint64_t decodedTimestamp = 0;
    const size_t decodedCount = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        decoded.data(),
        decoded.size(),
        &decodedTimestamp);

    REQUIRE(decodedCount == inputSamples.size());
    REQUIRE(decodedTimestamp == 0x1234ULL);
    REQUIRE(decoded[0] == Catch::Approx(1.0f).epsilon(0.000001f));
    REQUIRE(decoded[1] == Catch::Approx(-1.0f).epsilon(0.000001f));
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
    REQUIRE(stream.getMutableStats().sequenceGapEvents.load() == 1);
}

TEST_CASE("AVTP decode rejects packets with mismatched stream descriptor", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Listener, 16, 1, 4, 0x9988776655443322ULL, 0x33), 1);

    const std::array<float, 4> inputSamples = {0.1f, -0.1f, 0.2f, -0.2f};
    std::array<uint8_t, 256> packet{};
    std::array<float, 4> outputSamples{};

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        100,
        0x11,
        packet.data(),
        packet.size());
    REQUIRE(packedSize > 0);

    // Corrupt stream_id bytes to force descriptor mismatch.
    packet[4] ^= 0xFF;

    const size_t decodedSamples = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        outputSamples.data(),
        outputSamples.size(),
        nullptr);

    REQUIRE(decodedSamples == 0);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == 1);
}

TEST_CASE("AVTP decode rejects packets with mismatched format metadata", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Listener, 24, 1, 4, 0x8877665544332211ULL, 0x34), 1);

    const std::array<float, 4> inputSamples = {0.3f, -0.3f, 0.4f, -0.4f};
    std::array<uint8_t, 256> packet{};
    std::array<float, 4> outputSamples{};

    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        200,
        0x22,
        packet.data(),
        packet.size());
    REQUIRE(packedSize > 0);

    // Corrupt format code byte.
    packet[12] ^= 0x01;

    const size_t decodedSamples = stream.decodeAvtpPacketForTest(
        packet.data(),
        packedSize,
        outputSamples.data(),
        outputSamples.size(),
        nullptr);

    REQUIRE(decodedSamples == 0);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == 1);
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
    REQUIRE(stream.getMutableStats().timestampSkewEvents.load() == 0);
}

TEST_CASE("AVTP decode errors increment decodeErrors on malformed PDU", "[avb][avtp]") {
    AvbStreamConfig config{};
    config.interface = "lo";
    config.destMac[0] = 0;
    config.destMac[1] = 0;
    config.destMac[2] = 0;
    config.destMac[3] = 0;
    config.destMac[4] = 0;
    config.destMac[5] = 0;
    config.streamId = 0xDEADBEEF;
    config.direction = AvbDirection::Listener;
    config.sampleRate = 48000;
    config.channels = 2;
    config.bitDepth = 16;
    config.samplesPerFrame = 2;
    config.presentationOffsetUs = 1000;
    config.priority = 3;
    config.enableTimestamping = true;

    AvbStream stream(config, 1);

    uint8_t malformed[4] = {0x00, 0x01, 0x02, 0x03}; // shorter than header
    float samples[8]{};
    const size_t read = stream.decodeAvtpPacketForTest(malformed, sizeof(malformed), samples, 8, nullptr);
    REQUIRE(read == 0);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == 1);
}

TEST_CASE("AVTP decode rejects malformed non-aligned payload length", "[avb][avtp]") {
    AvbStream stream(makeTestConfig(AvbDirection::Listener, 24, 1, 2, 0xDEADBEEF11223344ULL, 0x14), 1);

    const std::array<float, 2> inputSamples = {0.25f, -0.25f};
    std::array<uint8_t, 128> packet{};
    std::array<float, 2> decoded{};
    const size_t packedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        333,
        0,
        packet.data(),
        packet.size());

    REQUIRE(packedSize == kAvtpHeaderSizeForTest + 6);

    // Drop one payload byte so payload length is not a multiple of 24-bit sample size.
    const size_t malformedSize = packedSize - 1;
    const size_t decodedCount = stream.decodeAvtpPacketForTest(
        packet.data(),
        malformedSize,
        decoded.data(),
        decoded.size(),
        nullptr);

    REQUIRE(decodedCount == 0);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == 1);
}

TEST_CASE("AVTP stress run across sequence wrap remains deterministic", "[avb][avtp][stress]") {
    AvbStream stream(makeTestConfig(AvbDirection::Listener, 16, 2, 4, 0xABCDEF1234567890ULL, 0x21), 1);

    const std::array<float, 8> inputSamples = {0.125f, -0.125f, 0.25f, -0.25f, 0.5f, -0.5f, 1.0f, -1.0f};
    std::array<float, 8> decoded{};
    std::array<uint8_t, 256> packet{};

    constexpr size_t iterations = 300; // deterministic wrap-around coverage (0..255 then 0..43)
    size_t successfulPackets = 0;

    for (size_t i = 0; i < iterations; ++i) {
        const uint8_t sequence = static_cast<uint8_t>(i & 0xFF);
        const size_t packedSize = stream.buildAvtpPacketForTest(
            inputSamples.data(),
            inputSamples.size(),
            0, // force deterministic timestamp-errors path
            sequence,
            packet.data(),
            packet.size());
        REQUIRE(packedSize == kAvtpHeaderSizeForTest + inputSamples.size() * sizeof(int16_t));

        const size_t decodedCount = stream.decodeAvtpPacketForTest(
            packet.data(),
            packedSize,
            decoded.data(),
            decoded.size(),
            nullptr);
        REQUIRE(decodedCount == inputSamples.size());
        successfulPackets += 1;
    }

    REQUIRE(successfulPackets == iterations);
    REQUIRE(stream.getExpectedSequenceForTest() == static_cast<uint8_t>(iterations & 0xFF));
    REQUIRE(stream.getMutableStats().sequenceErrors.load() == 0);
    REQUIRE(stream.getMutableStats().sequenceGapEvents.load() == 0);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == 0);
    REQUIRE(stream.getMutableStats().timestampErrors.load() == iterations);
}

TEST_CASE("AVTP fault-injection stress updates counters and recovers deterministically", "[avb][avtp][stress]") {
    enum class FaultType {
        None,
        TruncatedPayload,
        ShortHeader,
    };

    struct FramePlan {
        uint8_t sequence;
        FaultType fault;
    };

    AvbStream stream(makeTestConfig(AvbDirection::Listener, 16, 1, 4, 0x1020304050607080ULL, 0x22), 1);

    std::vector<FramePlan> plan;
    plan.reserve(64);
    for (size_t i = 0; i < 64; ++i) {
        plan.push_back(FramePlan{static_cast<uint8_t>(i & 0xFF), FaultType::None});
    }

    // Deterministic fault schedule.
    plan[10].sequence = static_cast<uint8_t>(plan[10].sequence + 5);  // sequence jump
    plan[25].sequence = static_cast<uint8_t>(plan[25].sequence + 3);  // second sequence jump
    plan[40].fault = FaultType::TruncatedPayload;                     // malformed payload length
    plan[50].fault = FaultType::ShortHeader;                          // hard malformed packet
    plan[51].sequence = static_cast<uint8_t>(plan[51].sequence + 4);  // recovery after short header

    const std::array<float, 4> inputSamples = {0.2f, -0.2f, 0.6f, -0.6f};
    std::array<float, 4> decoded{};
    std::array<uint8_t, 128> packet{};
    uint8_t shortPacket[8] = {0};

    uint8_t modeledExpectedSequence = 0;
    uint64_t modeledSequenceErrors = 0;
    uint64_t modeledSequenceGapEvents = 0;
    uint64_t modeledTimestampErrors = 0;
    uint64_t modeledDecodeErrors = 0;
    size_t modeledSuccessPackets = 0;

    for (const auto& frame : plan) {
        if (frame.fault == FaultType::ShortHeader) {
            modeledDecodeErrors += 1;
            const size_t decodedCount = stream.decodeAvtpPacketForTest(
                shortPacket,
                sizeof(shortPacket),
                decoded.data(),
                decoded.size(),
                nullptr);
            REQUIRE(decodedCount == 0);
            continue;
        }

        if (frame.sequence != modeledExpectedSequence) {
            modeledSequenceErrors += 1;
            modeledSequenceGapEvents += 1;
        }
        modeledExpectedSequence = static_cast<uint8_t>(frame.sequence + 1);
        modeledTimestampErrors += 1; // timestamp is always 0 in this test

        const size_t packedSize = stream.buildAvtpPacketForTest(
            inputSamples.data(),
            inputSamples.size(),
            0,
            frame.sequence,
            packet.data(),
            packet.size());
        REQUIRE(packedSize == kAvtpHeaderSizeForTest + inputSamples.size() * sizeof(int16_t));

        size_t packetSize = packedSize;
        if (frame.fault == FaultType::TruncatedPayload) {
            packetSize -= 1;
        }

        const size_t decodedCount = stream.decodeAvtpPacketForTest(
            packet.data(),
            packetSize,
            decoded.data(),
            decoded.size(),
            nullptr);

        if (frame.fault == FaultType::TruncatedPayload) {
            modeledDecodeErrors += 1;
            REQUIRE(decodedCount == 0);
        } else {
            modeledSuccessPackets += 1;
            REQUIRE(decodedCount == inputSamples.size());
        }
    }

    // One explicit recovery packet: sequence resumes exactly at the modeled expectation.
    const size_t recoveryPackedSize = stream.buildAvtpPacketForTest(
        inputSamples.data(),
        inputSamples.size(),
        0,
        modeledExpectedSequence,
        packet.data(),
        packet.size());
    REQUIRE(recoveryPackedSize == kAvtpHeaderSizeForTest + inputSamples.size() * sizeof(int16_t));

    const size_t recoveryDecoded = stream.decodeAvtpPacketForTest(
        packet.data(),
        recoveryPackedSize,
        decoded.data(),
        decoded.size(),
        nullptr);
    REQUIRE(recoveryDecoded == inputSamples.size());
    modeledExpectedSequence = static_cast<uint8_t>(modeledExpectedSequence + 1);
    modeledTimestampErrors += 1;
    modeledSuccessPackets += 1;

    REQUIRE(stream.getExpectedSequenceForTest() == modeledExpectedSequence);
    REQUIRE(stream.getMutableStats().sequenceErrors.load() == modeledSequenceErrors);
    REQUIRE(stream.getMutableStats().sequenceGapEvents.load() == modeledSequenceGapEvents);
    REQUIRE(stream.getMutableStats().timestampErrors.load() == modeledTimestampErrors);
    REQUIRE(stream.getMutableStats().decodeErrors.load() == modeledDecodeErrors);
    REQUIRE(modeledSuccessPackets == 63);
}
