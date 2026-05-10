// =============================================================================
// T2503 Set 5 — DawProjectLoader unit tests
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/DawProjectLoader.h"

#include <string>

using namespace map2::daw;

namespace {

const std::string kMinimalProject = R"({
    "schema_version": "v1",
    "name": "test-song",
    "sample_rate": 48000,
    "tracks": [],
    "clips": [],
    "plugin_instances": [],
    "automation_lanes": []
})";

const std::string kRichProject = R"({
    "schema_version": "v1",
    "name": "rich-song",
    "sample_rate": 48000,
    "tempo_bpm": 140.5,
    "time_signature_numerator": 6,
    "time_signature_denominator": 8,
    "tracks": [
        { "id": 0, "type": "audio", "name": "Drums", "armed": false, "gain_linear": 0.85, "pan": -0.2 },
        { "id": 1, "type": "midi", "name": "Synth Bass", "muted": true }
    ],
    "clips": [
        { "id": 0, "track_id": 0, "start_samples": 0, "length_samples": 96000, "source": "audio/drums.wav" },
        { "id": 1, "track_id": 0, "start_samples": 96000, "length_samples": 48000, "source": "audio/fill.wav", "fade_in_samples": 1024 }
    ],
    "plugin_instances": [
        { "track_id": 0, "slot_index": 0, "plugin_uri": "map2:fx:cabinet-ir", "enabled": true,
          "params": { "gain": 0.75, "mix": 1.0 } }
    ],
    "automation_lanes": [
        { "id": 0, "target_kind": "track_gain", "target_ref": "0",
          "points": [
              { "position": 0.0, "value": 0.5 },
              { "position": 8.0, "value": 1.0 }
          ] }
    ],
    "avb_buses": [
        { "id": 0, "stream_descriptor": "talker:00:11:22:33:44:55:00:01", "direction": "input" }
    ]
})";

} // namespace

TEST_CASE("DawProjectLoader — minimal project parses cleanly",
          "[t2503][daw][project-loader]") {
    auto result = DawProjectLoader::loadFromJsonText(kMinimalProject);
    REQUIRE(result.ok);
    REQUIRE(result.doc.has_value());
    REQUIRE(result.doc->name == "test-song");
    REQUIRE(result.doc->sampleRate == 48000);
    REQUIRE(result.doc->tempoBpm == 120.0);  // default
    REQUIRE(result.doc->tracks.empty());
    REQUIRE(result.doc->clips.empty());
}

TEST_CASE("DawProjectLoader — rich project parses every section",
          "[t2503][daw][project-loader]") {
    auto result = DawProjectLoader::loadFromJsonText(kRichProject);
    INFO("error: " << result.errorMessage);
    REQUIRE(result.ok);
    REQUIRE(result.doc.has_value());

    auto& doc = *result.doc;
    REQUIRE(doc.tempoBpm == 140.5);
    REQUIRE(doc.timeSigNumerator == 6);
    REQUIRE(doc.timeSigDenominator == 8);

    REQUIRE(doc.tracks.size() == 2);
    REQUIRE(doc.tracks[0].id == 0);
    REQUIRE(doc.tracks[0].type == "audio");
    REQUIRE(doc.tracks[0].name == "Drums");
    REQUIRE(doc.tracks[0].gainLinear == 0.85f);
    REQUIRE(doc.tracks[0].pan == -0.2f);
    REQUIRE_FALSE(doc.tracks[0].armed);
    REQUIRE(doc.tracks[1].type == "midi");
    REQUIRE(doc.tracks[1].muted);

    REQUIRE(doc.clips.size() == 2);
    REQUIRE(doc.clips[0].source == "audio/drums.wav");
    REQUIRE(doc.clips[1].fadeInSamples == 1024);

    REQUIRE(doc.pluginInstances.size() == 1);
    REQUIRE(doc.pluginInstances[0].pluginUri == "map2:fx:cabinet-ir");
    REQUIRE(doc.pluginInstances[0].params.size() == 2);

    REQUIRE(doc.automationLanes.size() == 1);
    REQUIRE(doc.automationLanes[0].targetKind == "track_gain");
    REQUIRE(doc.automationLanes[0].points.size() == 2);
    REQUIRE(doc.automationLanes[0].points[1].value == 1.0);

    REQUIRE(doc.avbBuses.size() == 1);
    REQUIRE(doc.avbBuses[0].direction == "input");
}

TEST_CASE("DawProjectLoader — missing schema_version is rejected",
          "[t2503][daw][project-loader]") {
    const std::string bad = R"({"name": "x", "sample_rate": 48000})";
    auto result = DawProjectLoader::loadFromJsonText(bad);
    REQUIRE_FALSE(result.ok);
    REQUIRE(result.errorMessage.find("schema_version") != std::string::npos);
}

TEST_CASE("DawProjectLoader — wrong schema_version is rejected",
          "[t2503][daw][project-loader]") {
    const std::string bad = R"({
        "schema_version": "v2", "name": "x", "sample_rate": 48000,
        "tracks": [], "clips": [], "plugin_instances": [], "automation_lanes": []
    })";
    auto result = DawProjectLoader::loadFromJsonText(bad);
    REQUIRE_FALSE(result.ok);
    REQUIRE(result.errorMessage.find("v1") != std::string::npos);
}

TEST_CASE("DawProjectLoader — invalid track type rejected",
          "[t2503][daw][project-loader]") {
    const std::string bad = R"({
        "schema_version": "v1", "name": "x", "sample_rate": 48000,
        "tracks": [{ "id": 0, "type": "video", "name": "X" }],
        "clips": [], "plugin_instances": [], "automation_lanes": []
    })";
    auto result = DawProjectLoader::loadFromJsonText(bad);
    REQUIRE_FALSE(result.ok);
    REQUIRE(result.errorMessage.find("audio|midi") != std::string::npos);
}

TEST_CASE("DawProjectLoader — empty input rejected",
          "[t2503][daw][project-loader]") {
    REQUIRE_FALSE(DawProjectLoader::loadFromJsonText("").ok);
    REQUIRE_FALSE(DawProjectLoader::loadFromJsonText("not json").ok);
    REQUIRE_FALSE(DawProjectLoader::loadFromJsonText("[1,2,3]").ok);
}
