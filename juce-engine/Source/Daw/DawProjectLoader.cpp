// =============================================================================
// T2503 Set 5 — DawProjectLoader implementation
// =============================================================================
// Uses juce::JSON for parsing (ships with juce_core, already linked). The
// validator mirrors schemas/daw-project-v1.schema.json — kept in sync by
// hand. Mismatches are detected by tests/DawProjectLoaderTests.cpp.
// =============================================================================

#include "DawProjectLoader.h"

#include <juce_core/juce_core.h>

#include <fstream>
#include <sstream>

namespace map2::daw {

namespace {

LoadResult fail(const std::string& msg) {
    LoadResult r;
    r.ok = false;
    r.errorMessage = msg;
    return r;
}

std::string readFileToString(const std::string& path) {
    std::ifstream in(path);
    if (!in.is_open()) return "";
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// --- Property helpers ---

bool getString(const juce::var& obj, const char* key, std::string& out) {
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isString()) return false;
    out = v.toString().toStdString();
    return true;
}

bool getInt(const juce::var& obj, const char* key, int& out) {
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isInt() && !v.isInt64() && !v.isDouble()) return false;
    out = static_cast<int>(v);
    return true;
}

bool getInt64(const juce::var& obj, const char* key, int64_t& out) {
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isInt() && !v.isInt64() && !v.isDouble()) return false;
    out = static_cast<int64_t>(static_cast<juce::int64>(v));
    return true;
}

bool getDouble(const juce::var& obj, const char* key, double& out) {
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isInt() && !v.isInt64() && !v.isDouble()) return false;
    out = static_cast<double>(v);
    return true;
}

bool getBool(const juce::var& obj, const char* key, bool& out, bool def = false) {
    out = def;
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isBool() && !v.isInt()) return true;  // missing → default
    out = static_cast<bool>(v);
    return true;
}

bool getArray(const juce::var& obj, const char* key, juce::Array<juce::var>*& outPtr) {
    outPtr = nullptr;
    if (!obj.isObject()) return false;
    auto v = obj.getProperty(key, juce::var());
    if (!v.isArray()) return false;
    outPtr = v.getArray();
    return true;
}

// --- Per-section parsers ---

bool parseTrack(const juce::var& obj, ProjectTrack& out, std::string& err) {
    if (!getInt(obj, "id", out.id)) { err = "track.id"; return false; }
    if (!getString(obj, "type", out.type)) { err = "track.type"; return false; }
    if (out.type != "audio" && out.type != "midi") { err = "track.type must be audio|midi"; return false; }
    if (!getString(obj, "name", out.name)) { err = "track.name"; return false; }
    getBool(obj, "armed", out.armed, false);
    getBool(obj, "muted", out.muted, false);
    getBool(obj, "soloed", out.soloed, false);
    double gain = 1.0;
    getDouble(obj, "gain_linear", gain);
    out.gainLinear = static_cast<float>(gain);
    double pan = 0.0;
    getDouble(obj, "pan", pan);
    out.pan = static_cast<float>(pan);
    return true;
}

bool parseClip(const juce::var& obj, ProjectClip& out, std::string& err) {
    if (!getInt(obj, "id", out.id)) { err = "clip.id"; return false; }
    if (!getInt(obj, "track_id", out.trackId)) { err = "clip.track_id"; return false; }
    if (!getInt64(obj, "start_samples", out.startSamples)) { err = "clip.start_samples"; return false; }
    if (!getInt64(obj, "length_samples", out.lengthSamples)) { err = "clip.length_samples"; return false; }
    if (!getString(obj, "source", out.source)) { err = "clip.source"; return false; }
    int64_t fi = 0, fo = 0;
    getInt64(obj, "fade_in_samples", fi);
    getInt64(obj, "fade_out_samples", fo);
    out.fadeInSamples = fi;
    out.fadeOutSamples = fo;
    return true;
}

bool parsePluginInstance(const juce::var& obj, ProjectPluginInstance& out, std::string& err) {
    if (!getInt(obj, "track_id", out.trackId)) { err = "plugin_instance.track_id"; return false; }
    if (!getInt(obj, "slot_index", out.slotIndex)) { err = "plugin_instance.slot_index"; return false; }
    if (!getString(obj, "plugin_uri", out.pluginUri)) { err = "plugin_instance.plugin_uri"; return false; }
    getBool(obj, "enabled", out.enabled, true);
    if (obj.isObject()) {
        auto paramsVar = obj.getProperty("params", juce::var());
        if (paramsVar.isObject()) {
            auto* dyn = paramsVar.getDynamicObject();
            if (dyn != nullptr) {
                for (const auto& prop : dyn->getProperties()) {
                    out.params.emplace_back(
                        prop.name.toString().toStdString(),
                        static_cast<float>(static_cast<double>(prop.value)));
                }
            }
        }
    }
    return true;
}

bool parseAutomationLane(const juce::var& obj, ProjectAutomationLane& out, std::string& err) {
    if (!getInt(obj, "id", out.id)) { err = "automation_lane.id"; return false; }
    if (!getString(obj, "target_kind", out.targetKind)) { err = "automation_lane.target_kind"; return false; }
    if (!getString(obj, "target_ref", out.targetRef)) { err = "automation_lane.target_ref"; return false; }
    juce::Array<juce::var>* points = nullptr;
    if (getArray(obj, "points", points) && points != nullptr) {
        for (const auto& point : *points) {
            ProjectAutomationLane::Point p{};
            if (!getDouble(point, "position", p.position)) { err = "lane.point.position"; return false; }
            if (!getDouble(point, "value", p.value)) { err = "lane.point.value"; return false; }
            out.points.push_back(p);
        }
    }
    return true;
}

bool parseAvbBus(const juce::var& obj, ProjectAvbBus& out, std::string& err) {
    if (!getInt(obj, "id", out.id)) { err = "avb_bus.id"; return false; }
    if (!getString(obj, "stream_descriptor", out.streamDescriptor)) {
        err = "avb_bus.stream_descriptor";
        return false;
    }
    getString(obj, "direction", out.direction);
    return true;
}

} // namespace

LoadResult DawProjectLoader::loadFromJsonText(const std::string& jsonText) {
    if (jsonText.empty()) return fail("empty JSON");

    juce::var parsed = juce::JSON::parse(jsonText);
    if (parsed.isVoid() || !parsed.isObject()) return fail("not a JSON object");

    ProjectDocument doc;

    // Required: schema_version (must equal "v1").
    if (!getString(parsed, "schema_version", doc.schemaVersion)) return fail("missing schema_version");
    if (doc.schemaVersion != "v1") {
        return fail("schema_version must be 'v1', got '" + doc.schemaVersion + "'");
    }

    // Required: name, sample_rate.
    if (!getString(parsed, "name", doc.name)) return fail("missing name");
    if (!getInt(parsed, "sample_rate", doc.sampleRate)) return fail("missing sample_rate");

    // Optional w/ defaults.
    getDouble(parsed, "tempo_bpm", doc.tempoBpm);
    getInt(parsed, "time_signature_numerator", doc.timeSigNumerator);
    getInt(parsed, "time_signature_denominator", doc.timeSigDenominator);

    // Tracks.
    juce::Array<juce::var>* arr = nullptr;
    if (getArray(parsed, "tracks", arr) && arr != nullptr) {
        for (const auto& tv : *arr) {
            ProjectTrack t;
            std::string err;
            if (!parseTrack(tv, t, err)) return fail("invalid " + err);
            doc.tracks.push_back(std::move(t));
        }
    }

    // Clips.
    if (getArray(parsed, "clips", arr) && arr != nullptr) {
        for (const auto& cv : *arr) {
            ProjectClip c;
            std::string err;
            if (!parseClip(cv, c, err)) return fail("invalid " + err);
            doc.clips.push_back(std::move(c));
        }
    }

    // Plugin instances.
    if (getArray(parsed, "plugin_instances", arr) && arr != nullptr) {
        for (const auto& pv : *arr) {
            ProjectPluginInstance p;
            std::string err;
            if (!parsePluginInstance(pv, p, err)) return fail("invalid " + err);
            doc.pluginInstances.push_back(std::move(p));
        }
    }

    // Automation lanes.
    if (getArray(parsed, "automation_lanes", arr) && arr != nullptr) {
        for (const auto& lv : *arr) {
            ProjectAutomationLane l;
            std::string err;
            if (!parseAutomationLane(lv, l, err)) return fail("invalid " + err);
            doc.automationLanes.push_back(std::move(l));
        }
    }

    // AVB buses (optional).
    if (getArray(parsed, "avb_buses", arr) && arr != nullptr) {
        for (const auto& bv : *arr) {
            ProjectAvbBus b;
            std::string err;
            if (!parseAvbBus(bv, b, err)) return fail("invalid " + err);
            doc.avbBuses.push_back(std::move(b));
        }
    }

    LoadResult r;
    r.ok = true;
    r.doc = std::move(doc);
    return r;
}

LoadResult DawProjectLoader::loadFromFile(const std::string& projectFilePath) {
    auto contents = readFileToString(projectFilePath);
    if (contents.empty()) {
        return fail("could not read file: " + projectFilePath);
    }
    return loadFromJsonText(contents);
}

} // namespace map2::daw
