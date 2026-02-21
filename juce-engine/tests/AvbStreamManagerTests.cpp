#include <catch2/catch_test_macros.hpp>
#include "../Source/AvbStream.h"

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
