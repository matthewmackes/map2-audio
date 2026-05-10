// =============================================================================
// T2503 Set 9 — AvbBusNode + PluginScanner unit tests
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/AvbBusNode.h"
#include "Daw/PluginScanner.h"

#include <juce_audio_processors/juce_audio_processors.h>

using namespace map2::daw;

TEST_CASE("AvbBusNode — input direction descriptor + name",
          "[t2503][daw][avb-bus-node]") {
    AvbStreamDescriptor desc;
    desc.streamId = "talker:00:11:22:33:44:55:00:01";
    desc.direction = AvbDirection::Input;
    desc.channelCount = 8;
    AvbBusNode node(desc);
    REQUIRE(node.descriptor().streamId == desc.streamId);
    REQUIRE(node.descriptor().direction == AvbDirection::Input);
    REQUIRE(node.getName().contains("AVB Bus"));
    REQUIRE(node.getName().contains("Input"));
}

TEST_CASE("AvbBusNode — output direction labels correctly",
          "[t2503][daw][avb-bus-node]") {
    AvbStreamDescriptor desc;
    desc.streamId = "listener:s2";
    desc.direction = AvbDirection::Output;
    AvbBusNode node(desc);
    REQUIRE(node.getName().contains("Output"));
}

TEST_CASE("AvbBusNode — getLatencyInSamples reports packet size",
          "[t2503][daw][avb-bus-node]") {
    AvbStreamDescriptor desc;
    desc.packetSizeSamples = 256;
    AvbBusNode node(desc);
    REQUIRE(node.getLatencyInSamples() == 256);
}

TEST_CASE("AvbBusNode — processBlock silences buffer at Set-9 stub",
          "[t2503][daw][avb-bus-node]") {
    AvbStreamDescriptor desc;
    desc.channelCount = 2;
    AvbBusNode node(desc);
    node.prepareToPlay(48000.0, 64);
    juce::AudioBuffer<float> buf(2, 64);
    // Fill with non-zero to detect that processBlock cleared.
    for (int ch = 0; ch < buf.getNumChannels(); ++ch)
        for (int i = 0; i < buf.getNumSamples(); ++i)
            buf.setSample(ch, i, 0.5f);
    juce::MidiBuffer midi;
    node.processBlock(buf, midi);
    REQUIRE(buf.getMagnitude(0, buf.getNumSamples()) == 0.0f);
}

// ---- PluginScanner ----

TEST_CASE("PluginScanner — empty before populate",
          "[t2503][daw][plugin-scanner]") {
    PluginScanner s;
    REQUIRE(s.size() == 0);
}

TEST_CASE("PluginScanner — populate registers native + LV2 entries",
          "[t2503][daw][plugin-scanner]") {
    PluginScanner s;
    s.populate();
    REQUIRE(s.size() >= 4);    // 3 native + 1 LV2 placeholder
    auto inv = s.inventory();
    bool sawNam = false, sawCabIr = false, sawRevIr = false, sawLv2 = false;
    for (auto& p : inv) {
        if (p.uri == "map2:fx:nam") sawNam = true;
        if (p.uri == "map2:fx:cabinet-ir") sawCabIr = true;
        if (p.uri == "map2:fx:reverb-ir") sawRevIr = true;
        if (p.format == PluginFormat::LV2) sawLv2 = true;
    }
    REQUIRE(sawNam);
    REQUIRE(sawCabIr);
    REQUIRE(sawRevIr);
    REQUIRE(sawLv2);
}

TEST_CASE("PluginScanner — re-populate replaces inventory",
          "[t2503][daw][plugin-scanner]") {
    PluginScanner s;
    s.populate();
    auto first = s.size();
    s.populate();
    REQUIRE(s.size() == first);  // same set, no duplication
}

TEST_CASE("PluginScanner — find by URI",
          "[t2503][daw][plugin-scanner]") {
    PluginScanner s;
    s.populate();
    PluginDescriptor d;
    REQUIRE(s.find("map2:fx:nam", d));
    REQUIRE(d.format == PluginFormat::Native);
    REQUIRE(d.category == "amp");

    REQUIRE_FALSE(s.find("urn:does-not-exist", d));
}
