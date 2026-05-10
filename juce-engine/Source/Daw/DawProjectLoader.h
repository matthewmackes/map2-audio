// =============================================================================
// T2503 Set 5 — DawProjectLoader
// =============================================================================
// Engine-side reader for ~/.map2/daw/<project>/project.json. Parses the JSON,
// validates against the v1 schema, and produces a flat ProjectDocument the
// engine consumes. Set 5 ships parsing + validation + the document struct;
// Sets 7+ wire the parsed document into juce::AudioProcessorGraph.
//
// The loader uses juce::JSON (ships with juce_core, no extra dep) and a
// hand-rolled validator that mirrors schemas/daw-project-v1.schema.json. The
// hand-roll avoids dragging a JSON-Schema library into the engine.
//
// License: this header is part of the MAP2 Audio Platform (AGPLv3-only).
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "DawProjectLoader.h included but MAP2_DAW_MODE is not set"
#endif

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace map2::daw {

struct ProjectTrack {
    int id = 0;
    std::string type;          // "audio" | "midi"
    std::string name;
    bool armed = false;
    bool muted = false;
    bool soloed = false;
    float gainLinear = 1.0f;
    float pan = 0.0f;
};

struct ProjectClip {
    int id = 0;
    int trackId = 0;
    int64_t startSamples = 0;
    int64_t lengthSamples = 0;
    std::string source;
    int64_t fadeInSamples = 0;
    int64_t fadeOutSamples = 0;
};

struct ProjectPluginInstance {
    int trackId = 0;
    int slotIndex = 0;
    std::string pluginUri;
    bool enabled = true;
    // params are name->float; deliberately a flat list of (key, value) pairs
    // rather than a map so the engine can iterate without needing a hash
    // table from juce_core's StringPairArray (smaller surface).
    std::vector<std::pair<std::string, float>> params;
};

struct ProjectAutomationLane {
    int id = 0;
    std::string targetKind;    // "track_gain" | "track_pan" | "plugin_param" | "transport_tempo"
    std::string targetRef;
    struct Point { double position = 0.0; double value = 0.0; };
    std::vector<Point> points;
};

struct ProjectAvbBus {
    int id = 0;
    std::string streamDescriptor;
    std::string direction;     // "input" | "output"
};

struct ProjectDocument {
    std::string schemaVersion;       // expected: "v1"
    std::string name;
    int sampleRate = 48000;
    double tempoBpm = 120.0;
    int timeSigNumerator = 4;
    int timeSigDenominator = 4;
    std::vector<ProjectTrack> tracks;
    std::vector<ProjectClip> clips;
    std::vector<ProjectPluginInstance> pluginInstances;
    std::vector<ProjectAutomationLane> automationLanes;
    std::vector<ProjectAvbBus> avbBuses;
};

struct LoadResult {
    bool ok = false;
    std::string errorMessage;            // populated when ok == false
    std::optional<ProjectDocument> doc;  // populated when ok == true
};

class DawProjectLoader {
public:
    /** Load + validate a project.json. ``projectFilePath`` is the absolute
        path to the file (typically ~/.map2/daw/<name>/project.json). */
    static LoadResult loadFromFile(const std::string& projectFilePath);

    /** Same as above, but takes JSON source directly. Useful for tests. */
    static LoadResult loadFromJsonText(const std::string& jsonText);
};

} // namespace map2::daw
