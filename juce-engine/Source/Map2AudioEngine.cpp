/**
 * MAP2 Audio Engine - Main Engine Implementation
 * Version 2.0 - Full JUCE Integration
 * 
 * REALTIME AUDIO OPTIMIZATION:
 * - Low-latency audio processing (target <3ms)
 * - Memory locking to prevent page faults
 * - Realtime thread priorities
 */

#include "Map2AudioEngine.h"
#include "NativeConvolutionPluginProcessor.h"
#ifdef HAS_AVB
#include "AvbAudioIODevice.h"
#endif
#include <sys/mman.h>
#include <errno.h>
#include <cstdlib>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <filesystem>
#include <limits>
#include <cmath>
#include <set>
#include <unordered_set>

// RT-SAFE: Disable logging in release builds and production
// Logging to console acquires mutex and can block the audio thread
#ifndef NDEBUG
#include <iostream>
#define MAP2_LOG(msg) std::cout << msg << std::endl
#define MAP2_ERR(msg) std::cerr << msg << std::endl
#else
#define MAP2_LOG(msg) ((void)0)
#define MAP2_ERR(msg) ((void)0)
#endif

namespace map2 {

namespace {

bool isTruthy(const char* value) {
    if (value == nullptr) {
        return false;
    }

    std::string normalized(value);
    std::transform(
        normalized.begin(),
        normalized.end(),
        normalized.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on";
}

double getProcessorTailSeconds(const juce::AudioProcessor* processor) {
    if (processor == nullptr) {
        return 0.0;
    }

    if (auto* convolution = dynamic_cast<const NativeConvolutionPluginProcessor*>(processor)) {
        return std::max(0.0, convolution->getIRInfo().lengthSeconds);
    }

    return std::max(0.0, processor->getTailLengthSeconds());
}

bool processorSupportsSnapshotSpillover(const juce::AudioProcessor* processor) {
    return getProcessorTailSeconds(processor) > 0.0;
}

bool processorIsLocallyBypassed(const juce::AudioProcessor* processor) {
    if (processor == nullptr) {
        return false;
    }

    if (auto* convolution = dynamic_cast<const NativeConvolutionPluginProcessor*>(processor)) {
        return convolution->isBypassedLocally();
    }

    return false;
}

double estimateFeedbackTailSeconds(double baseDelaySeconds, double feedbackFraction) {
    if (baseDelaySeconds <= 0.0) {
        return 0.0;
    }
    if (feedbackFraction <= 0.0) {
        return baseDelaySeconds;
    }

    const double clampedFeedback = std::clamp(feedbackFraction, 0.001, 0.9995);
    const double repeatsUntilMinus60Db = std::log(0.001) / std::log(clampedFeedback);
    return std::max(baseDelaySeconds, baseDelaySeconds * repeatsUntilMinus60Db);
}

double estimateDelayTailSeconds(const DelayProcessor::Parameters& params) {
    const double delayLeftMs =
        params.tempoSyncL == DelayProcessor::TempoDivision::Off
            ? static_cast<double>(params.delayTimeL)
            : static_cast<double>(DelayProcessor::divisionToMs(params.tempoSyncL, params.tempo));
    const double delayRightMs =
        params.tempoSyncR == DelayProcessor::TempoDivision::Off
            ? static_cast<double>(params.delayTimeR)
            : static_cast<double>(DelayProcessor::divisionToMs(params.tempoSyncR, params.tempo));
    const double baseDelaySeconds = std::max(delayLeftMs, delayRightMs) / 1000.0;
    return estimateFeedbackTailSeconds(baseDelaySeconds, static_cast<double>(params.feedback) / 100.0);
}

double estimateShoeGazeTailSeconds(const ShoeGazeProcessor::Parameters& params) {
    const double delayTailSeconds = estimateFeedbackTailSeconds(
        static_cast<double>(params.delayTime) / 1000.0,
        static_cast<double>(params.delayFeedback) / 100.0);
    return std::max({
        0.0,
        static_cast<double>(params.decay),
        delayTailSeconds,
        static_cast<double>(params.shimmerDelay) / 1000.0,
    });
}

double estimateLexiLoveTailSeconds(const LexiLoveProcessor::Parameters& params) {
    return std::max(0.0, static_cast<double>(params.preDelay) / 1000.0 + static_cast<double>(params.decayTime));
}

std::string readAvbMarkerValue(const std::string& key) {
    constexpr const char* markerPath = "/etc/map2/avb-enabled";
    if (!std::filesystem::exists(markerPath)) {
        return {};
    }

    std::ifstream markerFile(markerPath);
    if (!markerFile.good()) {
        return {};
    }

    std::string line;
    while (std::getline(markerFile, line)) {
        if (line.empty() || line[0] == '#') {
            continue;
        }

        const auto separator = line.find('=');
        if (separator == std::string::npos) {
            continue;
        }

        std::string parsedKey = line.substr(0, separator);
        std::string parsedValue = line.substr(separator + 1);

        auto trim = [](std::string& text) {
            auto isSpace = [](unsigned char c) { return std::isspace(c) != 0; };
            text.erase(text.begin(), std::find_if(text.begin(), text.end(), [&](unsigned char c) { return !isSpace(c); }));
            text.erase(
                std::find_if(text.rbegin(), text.rend(), [&](unsigned char c) { return !isSpace(c); }).base(),
                text.end()
            );
        };

        trim(parsedKey);
        trim(parsedValue);
        if (parsedKey == key) {
            return parsedValue;
        }
    }

    return {};
}

bool isPtpPidHealthy() {
    constexpr const char* pidPath = "/run/ptp4l.pid";
    if (!std::filesystem::exists(pidPath)) {
        // Fallback for systemd-managed ptp4l setups that do not write a PID file.
        if (std::system("pidof ptp4l >/dev/null 2>&1") == 0) {
            return true;
        }
        if (std::system("systemctl is-active --quiet map2-ptp4l.service >/dev/null 2>&1") == 0) {
            return true;
        }
        return false;
    }

    std::ifstream pidFile(pidPath);
    if (!pidFile.good()) {
        return false;
    }

    std::string pidText;
    std::getline(pidFile, pidText);
    if (pidText.empty()) {
        return false;
    }

    try {
        const int pid = std::stoi(pidText);
        if (pid <= 0) {
            return false;
        }
        return std::filesystem::exists("/proc/" + std::to_string(pid));
    } catch (...) {
        return false;
    }
}

std::string normalizeDirection(const std::string& direction) {
    std::string normalized(direction);
    std::transform(
        normalized.begin(),
        normalized.end(),
        normalized.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return normalized;
}

bool containsInsensitive(const std::string& text, const std::string& token) {
    std::string lhs(text);
    std::string rhs(token);
    std::transform(lhs.begin(), lhs.end(), lhs.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    std::transform(rhs.begin(), rhs.end(), rhs.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return lhs.find(rhs) != std::string::npos;
}

std::string normalizeDeviceType(const std::string& deviceType) {
    std::string normalized(deviceType);
    std::transform(
        normalized.begin(),
        normalized.end(),
        normalized.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (normalized.empty()) {
        return "unknown";
    }
    return normalized;
}

const juce::var* findSnapshotExpressionValue(
    const std::map<std::string, juce::var>& mapping,
    const char* key) {
    const auto it = mapping.find(key);
    if (it == mapping.end()) {
        return nullptr;
    }
    return &it->second;
}

int snapshotExpressionInt(
    const std::map<std::string, juce::var>& mapping,
    const char* key,
    int fallback) {
    if (const auto* value = findSnapshotExpressionValue(mapping, key)) {
        if (value->isInt() || value->isInt64()) {
            return static_cast<int>(*value);
        }
        if (value->isDouble()) {
            return static_cast<int>(static_cast<double>(*value));
        }
        if (value->isString()) {
            return value->toString().getIntValue();
        }
        if (value->isBool()) {
            return static_cast<bool>(*value) ? 1 : 0;
        }
    }
    return fallback;
}

float snapshotExpressionFloat(
    const std::map<std::string, juce::var>& mapping,
    const char* key,
    float fallback) {
    if (const auto* value = findSnapshotExpressionValue(mapping, key)) {
        if (value->isDouble()) {
            return static_cast<float>(static_cast<double>(*value));
        }
        if (value->isInt() || value->isInt64()) {
            return static_cast<float>(static_cast<int>(*value));
        }
        if (value->isString()) {
            return value->toString().getFloatValue();
        }
        if (value->isBool()) {
            return static_cast<bool>(*value) ? 1.0f : 0.0f;
        }
    }
    return fallback;
}

bool snapshotExpressionBool(
    const std::map<std::string, juce::var>& mapping,
    const char* key,
    bool fallback) {
    if (const auto* value = findSnapshotExpressionValue(mapping, key)) {
        if (value->isBool()) {
            return static_cast<bool>(*value);
        }
        if (value->isInt() || value->isInt64()) {
            return static_cast<int>(*value) != 0;
        }
        if (value->isString()) {
            const auto normalized = value->toString().trim().toLowerCase();
            return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on";
        }
    }
    return fallback;
}

std::string snapshotExpressionString(
    const std::map<std::string, juce::var>& mapping,
    const char* key,
    const std::string& fallback = {}) {
    if (const auto* value = findSnapshotExpressionValue(mapping, key)) {
        return value->toString().toStdString();
    }
    return fallback;
}

float clamp01(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

float sampleCustomExpressionCurve(float normalized, const juce::var& customCurve) {
    const auto* curvePoints = customCurve.getArray();
    if (curvePoints == nullptr || curvePoints->size() < 2) {
        return clamp01(normalized);
    }

    auto pointYAt = [&](int index, float fallback) {
        if (index < 0 || index >= curvePoints->size()) {
            return fallback;
        }
        const auto& point = curvePoints->getReference(index);
        if (auto* object = point.getDynamicObject()) {
            const auto y = object->getProperty("y");
            if (y.isDouble()) {
                return clamp01(static_cast<float>(static_cast<double>(y)));
            }
            if (y.isInt() || y.isInt64()) {
                return clamp01(static_cast<float>(static_cast<int>(y)));
            }
            if (y.isString()) {
                return clamp01(y.toString().getFloatValue());
            }
        }
        return fallback;
    };

    const float t = clamp01(normalized);
    const float p1y = pointYAt(0, 0.3f);
    const float p2y = pointYAt(1, 0.7f);
    const float u = 1.0f - t;
    return clamp01((3.0f * u * u * t * p1y) + (3.0f * u * t * t * p2y) + (t * t * t));
}

std::string normalizeExpressionCurveName(const std::string& curveName) {
    std::string normalized(curveName);
    std::transform(
        normalized.begin(),
        normalized.end(),
        normalized.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (normalized == "log" || normalized == "logarithmic") {
        return "log";
    }
    if (normalized == "exp" || normalized == "exponential") {
        return "exp";
    }
    if (normalized == "scurve" || normalized == "s_curve") {
        return "scurve";
    }
    if (normalized == "custom") {
        return "custom";
    }
    return "linear";
}

constexpr const char* kJsonTreeKeyProperty = "__json_key";
constexpr const char* kJsonScalarProperty = "__json_scalar";
constexpr const char* kJsonKindProperty = "__json_kind";
constexpr const char* kGraphDocumentVersion = "2026.04";

juce::Identifier sanitizeValueTreeType(const juce::String& raw) {
    juce::String sanitized;
    for (const auto character : raw) {
        if (juce::CharacterFunctions::isLetterOrDigit(character) || character == '_' || character == '-') {
            sanitized << character;
        } else {
            sanitized << '_';
        }
    }
    if (sanitized.isEmpty()) {
        sanitized = "object";
    }
    return juce::Identifier(sanitized);
}

bool isJsonScalar(const juce::var& value) {
    return value.isVoid()
        || value.isBool()
        || value.isInt()
        || value.isInt64()
        || value.isDouble()
        || value.isString();
}

juce::ValueTree jsonVarToValueTree(
    const juce::var& value,
    const juce::String& typeName,
    const juce::String& key = {}) {
    if (value.isArray()) {
        juce::ValueTree tree(sanitizeValueTreeType(typeName));
        if (key.isNotEmpty()) {
            tree.setProperty(kJsonTreeKeyProperty, key, nullptr);
        }
        if (const auto* array = value.getArray()) {
            for (const auto& item : *array) {
                if (isJsonScalar(item)) {
                    juce::ValueTree scalarNode("item");
                    scalarNode.setProperty(kJsonKindProperty, "scalar", nullptr);
                    scalarNode.setProperty(kJsonScalarProperty, item, nullptr);
                    tree.addChild(scalarNode, -1, nullptr);
                } else if (item.isArray()) {
                    tree.addChild(jsonVarToValueTree(item, "array"), -1, nullptr);
                } else {
                    tree.addChild(jsonVarToValueTree(item, "object"), -1, nullptr);
                }
            }
        }
        return tree;
    }

    juce::ValueTree tree(sanitizeValueTreeType(typeName));
    if (key.isNotEmpty()) {
        tree.setProperty(kJsonTreeKeyProperty, key, nullptr);
    }

    if (!value.isObject()) {
        tree.setProperty(kJsonKindProperty, "scalar", nullptr);
        tree.setProperty(kJsonScalarProperty, value, nullptr);
        return tree;
    }

    if (auto* object = value.getDynamicObject()) {
        for (const auto& property : object->getProperties()) {
            const auto propertyName = property.name.toString();
            const auto propertyValue = property.value;
            if (isJsonScalar(propertyValue)) {
                tree.setProperty(propertyName, propertyValue, nullptr);
                continue;
            }
            if (propertyValue.isArray()) {
                tree.addChild(jsonVarToValueTree(propertyValue, "array", propertyName), -1, nullptr);
                continue;
            }
            tree.addChild(jsonVarToValueTree(propertyValue, "object", propertyName), -1, nullptr);
        }
    }

    return tree;
}

juce::var valueTreeToJsonVar(const juce::ValueTree& tree) {
    if (!tree.isValid()) {
        return {};
    }

    if (tree.hasProperty(kJsonKindProperty)
        && tree.getProperty(kJsonKindProperty).toString() == "scalar") {
        return tree.getProperty(kJsonScalarProperty);
    }

    if (tree.getType().toString() == "array") {
        juce::Array<juce::var> array;
        for (int index = 0; index < tree.getNumChildren(); ++index) {
            array.add(valueTreeToJsonVar(tree.getChild(index)));
        }
        return juce::var(array);
    }

    auto object = juce::DynamicObject::Ptr(new juce::DynamicObject());
    for (int index = 0; index < tree.getNumProperties(); ++index) {
        const auto name = tree.getPropertyName(index).toString();
        if (name == kJsonTreeKeyProperty || name == kJsonScalarProperty || name == kJsonKindProperty) {
            continue;
        }
        object->setProperty(name, tree.getProperty(tree.getPropertyName(index)));
    }

    for (int index = 0; index < tree.getNumChildren(); ++index) {
        const auto child = tree.getChild(index);
        const auto key = child.getProperty(kJsonTreeKeyProperty).toString();
        if (key.isEmpty()) {
            continue;
        }
        object->setProperty(key, valueTreeToJsonVar(child));
    }
    return juce::var(object.get());
}

juce::ValueTree findJsonChildByKey(const juce::ValueTree& parent, const juce::String& key) {
    for (int index = 0; index < parent.getNumChildren(); ++index) {
        const auto child = parent.getChild(index);
        if (child.getProperty(kJsonTreeKeyProperty).toString() == key) {
            return child;
        }
    }
    return {};
}

void replaceJsonChildByKey(juce::ValueTree& parent, const juce::String& key, juce::ValueTree child) {
    for (int index = parent.getNumChildren() - 1; index >= 0; --index) {
        if (parent.getChild(index).getProperty(kJsonTreeKeyProperty).toString() == key) {
            parent.removeChild(index, nullptr);
        }
    }
    if (child.isValid()) {
        child.setProperty(kJsonTreeKeyProperty, key, nullptr);
        parent.addChild(child, -1, nullptr);
    }
}

juce::ValueTree ensureObjectChild(juce::ValueTree& parent, const juce::String& key) {
    auto child = findJsonChildByKey(parent, key);
    if (child.isValid() && child.getType().toString() != "array") {
        return child;
    }
    juce::ValueTree next("object");
    next.setProperty(kJsonTreeKeyProperty, key, nullptr);
    replaceJsonChildByKey(parent, key, next);
    return findJsonChildByKey(parent, key);
}

juce::ValueTree makeArrayTree(const juce::String& key) {
    juce::ValueTree arrayTree("array");
    arrayTree.setProperty(kJsonTreeKeyProperty, key, nullptr);
    return arrayTree;
}

std::string canonicalGraphNodeUri(const std::string& engineUri) {
    if (engineUri == "map2://juce/nam") {
        return "map2:fx:nam";
    }
    if (engineUri == "map2://juce/convolution/cabinet") {
        return "map2:fx:cabinet-ir";
    }
    if (engineUri == "map2://juce/convolution/reverb") {
        return "map2:fx:reverb-ir";
    }
    if (engineUri.rfind("map2://juce/", 0) == 0) {
        auto suffix = engineUri.substr(std::string("map2://juce/").size());
        std::replace(suffix.begin(), suffix.end(), '/', '-');
        return "map2:fx:" + suffix;
    }
    if (engineUri.rfind("map2:", 0) == 0 || engineUri.rfind("urn:", 0) == 0) {
        return engineUri;
    }

    std::string slug;
    slug.reserve(engineUri.size());
    for (const unsigned char ch : engineUri) {
        if (std::isalnum(ch) != 0) {
            slug.push_back(static_cast<char>(std::tolower(ch)));
        } else if (slug.empty() || slug.back() != '-') {
            slug.push_back('-');
        }
    }
    while (!slug.empty() && slug.back() == '-') {
        slug.pop_back();
    }
    if (slug.empty()) {
        slug = "unknown";
    }
    return "urn:plugin:" + slug;
}

std::string loadableEngineUri(const juce::var& pluginVar) {
    if (!pluginVar.isObject()) {
        return {};
    }
    auto* object = pluginVar.getDynamicObject();
    if (object == nullptr) {
        return {};
    }
    const auto engineUri = object->getProperty("engine_uri").toString().toStdString();
    if (!engineUri.empty()) {
        return engineUri;
    }
    const auto uri = object->getProperty("uri").toString().toStdString();
    if (uri == "map2:fx:nam") {
        return "map2://juce/nam";
    }
    if (uri == "map2:fx:cabinet-ir") {
        return "map2://juce/convolution/cabinet";
    }
    if (uri == "map2:fx:reverb-ir") {
        return "map2://juce/convolution/reverb";
    }
    if (uri == "map2:fx:drums") {
        return "map2://juce/drums";
    }
    if (uri == "map2:fx:synthforge") {
        return "map2://juce/synthforge";
    }
    if (uri == "map2:fx:brain") {
        return "map2://juce/brain";
    }
    return uri;
}

std::vector<uint8_t> decodeBase64State(const juce::String& encoded) {
    juce::MemoryOutputStream output;
    if (!juce::Base64::convertFromBase64(output, encoded)) {
        return {};
    }
    const auto* bytes = static_cast<const uint8_t*>(output.getData());
    return std::vector<uint8_t>(bytes, bytes + output.getDataSize());
}

juce::String encodeBase64State(const std::vector<uint8_t>& state) {
    if (state.empty()) {
        return {};
    }
    return juce::Base64::toBase64(state.data(), static_cast<int>(state.size()));
}

std::optional<float> coerceFloatVar(const juce::var& value) {
    if (value.isDouble() || value.isInt() || value.isInt64() || value.isBool()) {
        return static_cast<float>(static_cast<double>(value));
    }
    return std::nullopt;
}

float clampUnitFloat(float value) {
    return juce::jlimit(0.0f, 1.0f, value);
}

float bilinearMorphValue(float a, float b, float c, float d, float x, float y) {
    const auto top = a + ((b - a) * x);
    const auto bottom = c + ((d - c) * x);
    return top + ((bottom - top) * y);
}

uint64_t deriveNumericStreamId(const std::string& streamId) {
    if (!streamId.empty()) {
        try {
            size_t parsed = 0;
            const uint64_t value = std::stoull(streamId, &parsed, 0);
            if (parsed == streamId.size() && value != 0) {
                return value;
            }
        } catch (...) {
        }
    }

    uint64_t hash = 1469598103934665603ULL;  // FNV-1a 64-bit offset basis
    for (const unsigned char ch : streamId) {
        hash ^= static_cast<uint64_t>(ch);
        hash *= 1099511628211ULL;
    }

    // Keep deterministic but avoid trivial all-zero IDs.
    hash &= 0x00FFFFFFFFFFFFFFULL;
    hash |= 0xA500000000000000ULL;
    return hash;
}

juce::BigInteger buildChannelMask(int channels) {
    juce::BigInteger mask;
    if (channels > 0) {
        mask.setRange(0, channels, true);
    }
    return mask;
}

std::string defaultTalkerDestMac() {
    // IEEE 1722 multicast range base address.
    return "91:e0:f0:00:0e:80";
}

bool isValidMacAddress(const std::string& value) {
    if (value.empty()) {
        return false;
    }

    unsigned int bytes[6] = {};
    char extra = '\0';
    const int parsed = std::sscanf(
        value.c_str(),
        "%2x:%2x:%2x:%2x:%2x:%2x%c",
        &bytes[0],
        &bytes[1],
        &bytes[2],
        &bytes[3],
        &bytes[4],
        &bytes[5],
        &extra);
    return parsed == 6;
}

bool insertionUsesParallelBlend(const std::string& mode) {
    return mode == "parallel_send_return"
        || mode == "dual_parallel"
        || mode == "multiband_split";
}

template <size_t N>
void copyEventText(std::array<char, N>& dest, const char* value) noexcept {
    dest.fill('\0');
    if (value == nullptr || N == 0) {
        return;
    }
    std::strncpy(dest.data(), value, N - 1);
    dest[N - 1] = '\0';
}

int64_t currentUnixMillis() noexcept {
    const auto now = std::chrono::system_clock::now();
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
}

}  // namespace

Map2AudioEngine::Map2AudioEngine() {
    audioIO_.setRuntimeEventSink({this, &Map2AudioEngine::handleAudioIoXrunEvent});
    audioGraph_ = std::make_unique<JuceAudioGraph>(pluginHost_);
    snapshotManager_ = std::make_unique<SnapshotManager>(
        pluginHost_,
        [this](InstanceId instanceId, const std::string& name, float value) {
            return setParameterByName(instanceId, name, value);
        }
    );
}

Map2AudioEngine::~Map2AudioEngine() {
    shutdown();
}

void Map2AudioEngine::enqueuePlatformEvent(
    const char* kind,
    const char* severity,
    const char* title,
    const char* message) noexcept {
    uint64_t writeSeq = platformEventWriteSeq_.load(std::memory_order_relaxed);
    for (;;) {
        const uint64_t readSeq = platformEventReadSeq_.load(std::memory_order_acquire);
        if (writeSeq - readSeq >= PLATFORM_EVENT_FIFO_SIZE) {
            droppedPlatformEventCount_.fetch_add(1, std::memory_order_relaxed);
            return;
        }
        if (platformEventWriteSeq_.compare_exchange_weak(
                writeSeq,
                writeSeq + 1,
                std::memory_order_acq_rel,
                std::memory_order_relaxed)) {
            break;
        }
    }

    auto& slot = platformEventFifo_[writeSeq % PLATFORM_EVENT_FIFO_SIZE];
    slot.ready.store(false, std::memory_order_release);
    copyEventText(slot.kind, kind);
    copyEventText(slot.severity, severity);
    copyEventText(slot.title, title);
    copyEventText(slot.message, message);
    slot.sequence = writeSeq;
    slot.timestampMs = currentUnixMillis();
    slot.ready.store(true, std::memory_order_release);
}

void Map2AudioEngine::handleAudioIoXrunEvent(void* context) noexcept {
    auto* engine = static_cast<Map2AudioEngine*>(context);
    if (engine == nullptr) {
        return;
    }
    engine->enqueuePlatformEvent(
        "audio.xrun",
        "warning",
        "Audio xrun",
        "Audio callback xrun detected");
}

std::vector<Map2AudioEngine::PlatformEventRecord> Map2AudioEngine::drainPlatformEvents(int maxEvents) {
    const int limit = std::max(0, std::min(maxEvents, static_cast<int>(PLATFORM_EVENT_FIFO_SIZE)));
    std::vector<PlatformEventRecord> events;
    events.reserve(static_cast<size_t>(limit));

    for (int index = 0; index < limit; ++index) {
        const uint64_t readSeq = platformEventReadSeq_.load(std::memory_order_relaxed);
        if (readSeq >= platformEventWriteSeq_.load(std::memory_order_acquire)) {
            break;
        }

        auto& slot = platformEventFifo_[readSeq % PLATFORM_EVENT_FIFO_SIZE];
        if (!slot.ready.load(std::memory_order_acquire)) {
            break;
        }

        PlatformEventRecord record;
        record.kind = slot.kind.data();
        record.severity = slot.severity.data();
        record.title = slot.title.data();
        record.message = slot.message.data();
        record.sequence = slot.sequence;
        record.timestampMs = slot.timestampMs;
        record.droppedCount = droppedPlatformEventCount_.load(std::memory_order_relaxed);
        events.push_back(std::move(record));

        slot.ready.store(false, std::memory_order_release);
        platformEventReadSeq_.store(readSeq + 1, std::memory_order_release);
    }

    return events;
}

uint64_t Map2AudioEngine::getDroppedPlatformEventCount() const {
    return droppedPlatformEventCount_.load(std::memory_order_relaxed);
}

bool Map2AudioEngine::initialize(const std::string& /*configFile*/) {
    if (initialized_) return true;

    std::cout << "Initializing MAP2 Audio Engine v" << ENGINE_VERSION << " (JUCE)" << std::endl;

    // Initialize JUCE plugin host
    if (!pluginHost_.initialize(lv2Path_)) {
        std::cerr << "Failed to initialize plugin host" << std::endl;
        return false;
    }

    // Scan for plugins
    std::cout << "Scanning for plugins..." << std::endl;
    pluginHost_.scanForPlugins(false, [](float progress, const std::string& name) {
        if (!name.empty()) {
            std::cout << "  [" << static_cast<int>(progress * 100) << "%] " << name << std::endl;
        }
    });

    // Initialize JUCE audio I/O with configured channel counts
    std::cout << "  Configuring audio: " << numInputChannels_ << " inputs, "
              << numOutputChannels_ << " outputs" << std::endl;
    if (!audioIO_.initialize(audioDevice_, sampleRate_, bufferSize_,
                              numInputChannels_, numOutputChannels_)) {
        std::cerr << "Failed to initialize audio I/O" << std::endl;
        return false;
    }

    // Get actual sample rate and buffer size from device
    sampleRate_ = audioIO_.getSampleRate();
    bufferSize_ = audioIO_.getBufferSize();

    // Initialize audio graph with max of input/output channels
    int graphChannels = std::max(numInputChannels_, numOutputChannels_);
    audioGraph_->initialize(sampleRate_, bufferSize_, graphChannels);

    // Pre-allocate callback buffer to avoid heap allocation in RT thread
    callbackBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                            false, false, true);
    spilloverBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                             false, false, true);
    monitorBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                           false, false, true);
    graphCrossfadeInputBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                                       false, false, true);
    graphCrossfadeOldBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                                     false, false, true);
    graphCrossfadeNewBuffer_.setSize(numOutputChannels_, std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
                                     false, false, true);
    topologyTransitionReferenceBuffer_.setSize(
        numOutputChannels_,
        std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE),
        false,
        false,
        true);
    topologyTransitionReferenceBuffer_.clear();

    // ============================================================================
    // REALTIME OPTIMIZATION: Lock ALL memory to RAM to prevent page faults
    // Page faults cause 1–10 ms latency spikes; mlockall() pins ALL pages —
    // code, stack, heap, shared libraries, NAM model weights, IR data.
    // Requires CAP_IPC_LOCK or LimitMEMLOCK=infinity (set in systemd service).
    // ============================================================================
    if (mlockall(MCL_CURRENT | MCL_FUTURE) == 0) {
        std::cout << "  All memory locked to RAM (mlockall)" << std::endl;
    } else {
        int err = errno;
        std::cerr << "  WARNING: mlockall failed (errno=" << err << "). "
                  << "Falling back to per-buffer mlock. May experience latency spikes." << std::endl;
        // Fallback: lock just the audio buffer
        float* bufferData = callbackBuffer_.getWritePointer(0);
        if (bufferData) {
            size_t bufferBytes = static_cast<size_t>(callbackBuffer_.getNumSamples())
                                * callbackBuffer_.getNumChannels()
                                * sizeof(float);
            if (mlock(bufferData, bufferBytes) == 0) {
                std::cout << "  Audio buffer locked to RAM (" << (bufferBytes / 1024) << " KB)" << std::endl;
            }
        }
    }

    // Initialize MIDI
    if (!midiHandler_.initialize()) {
        std::cerr << "MIDI initialization failed (continuing without MIDI)" << std::endl;
    }

    // Set up MIDI CC callback
    midiHandler_.setCCMappingCallback([this](InstanceId pluginId, const std::string& param, float value) {
        setParameterByName(pluginId, param, value);
    });

    // Forward MIDI note/control/program events into the audio callback via lock-free queue.
    midiHandler_.setMidiCallback([this](const MidiMessage& msg) {
        if (msg.type == MidiMessageType::ProgramChange) {
            drumSequencer_.handleIncomingProgramChange(msg.data1);
        }
        enqueueMidiEvent(msg);
    });

    // Initialize metering components
    spectrumAnalyzer_.prepare(sampleRate_);
    lufsMeter_.prepare(sampleRate_, 2);
    phaseCorrelation_.prepare(sampleRate_);
    cpuMonitor_.prepare(sampleRate_, bufferSize_);

    // Initialize convolution processors
    // Set mode BEFORE prepare — prepare() uses the mode to construct the convolution engine
    cabinetProcessor_.setMode(ConvolutionProcessor::Mode::ZeroLatency);
    cabinetProcessor_.prepare(sampleRate_, bufferSize_, 2);
    reverbProcessor_.setMode(ConvolutionProcessor::Mode::ZeroLatency);
    reverbProcessor_.prepare(sampleRate_, bufferSize_, 2);

    // Initialize dynamics processors
    compressor_.prepare(sampleRate_, bufferSize_, 2);
    compressor_.setMode(DynamicsProcessor::Mode::Compressor);

    limiter_.prepare(sampleRate_, bufferSize_, 2);
    limiter_.setMode(DynamicsProcessor::Mode::Limiter);
    limiter_.setThreshold(-1.0f);  // Default limiter ceiling

    gate_.prepare(sampleRate_, bufferSize_, 2);
    gate_.setMode(DynamicsProcessor::Mode::NoiseGate);

    // Initialize EQ processor
    eq_.prepare(sampleRate_, bufferSize_, 2);

#ifdef HAS_NAM
    // Initialize Neural Amp Modeler processor
    namProcessor_.prepare(sampleRate_, bufferSize_);
    std::cout << "  NAM (Neural Amp Modeler): Available" << std::endl;
#endif

    // Initialize modulation processors
    chorus_.prepare(sampleRate_, bufferSize_, 2);
    phaser_.prepare(sampleRate_, bufferSize_, 2);
    pitchShifter_.prepare(sampleRate_, bufferSize_, 2);
    delay_.prepare(sampleRate_, bufferSize_, 2);
    intellifx_.prepare(sampleRate_, bufferSize_, 2);
    shoegaze_.prepare(sampleRate_, bufferSize_, 2);
    lexiLove_.prepare(sampleRate_, bufferSize_, 2);
    h3000_.prepare(sampleRate_, bufferSize_, 2);
    peavey5150_.prepare(sampleRate_, bufferSize_, 2);
    tweedBassman_.prepare(sampleRate_, bufferSize_, 2);
    passionFX_.prepare(sampleRate_, bufferSize_, 2);
    // Wire up drum machine callbacks before adapter registration
    drumMachine_.setTempoCcCallback([this](float bpm) {
        drumSequencer_.setTempo(bpm);
    });
    drumMachine_.setSwingCcCallback([this](float swing) {
        drumSequencer_.setSwing(swing);
    });
    drumSequencer_.setDrumMachine(&drumMachine_);
    drumSequencer_.setMidiOutputCallback([this](const drummachine::DrumSequencer::MidiOutputEvent& event) {
        sendDrumSequencerMidiEvent(event);
    });

    // Register SynthForge as a graph-manageable instrument plugin
    {
        auto adapter = std::make_unique<synthforge::SynthForgeGraphAdapter>(synthForge_);
        adapter->prepareToPlay(sampleRate_, bufferSize_);

        PluginInfo info;
        info.uri = synthforge::SynthForgeGraphAdapter::PLUGIN_URI;
        info.name = synthforge::SynthForgeGraphAdapter::PLUGIN_NAME;
        info.author = "MAP2 Audio";
        info.brand = "MAP2";
        info.category = "Instrument";
        info.format = PluginFormat::Hardware;
        info.formatName = "Native";
        info.audioInputs = 0;
        info.audioOutputs = 2;
        info.hasMidiInput = true;
        info.hasMidiOutput = false;
        info.latencySamples = 0;

        synthForgeAdapter_ = adapter.get();
        synthForgeInstanceId_ = pluginHost_.registerHardwarePlugin(
            std::move(adapter), info);

        if (synthForgeInstanceId_ == INVALID_INSTANCE_ID) {
            synthForgeAdapter_ = nullptr;
            std::cerr << "Warning: Failed to register SynthForge graph adapter" << std::endl;
        }
    }

    // Register Drum Machine as a graph-manageable instrument plugin
    {
        auto adapter = std::make_unique<drummachine::DrumMachineGraphAdapter>(
            drumMachine_, drumSequencer_);
        adapter->prepareToPlay(sampleRate_, bufferSize_);

        PluginInfo info;
        info.uri = drummachine::DrumMachineGraphAdapter::PLUGIN_URI;
        info.name = drummachine::DrumMachineGraphAdapter::PLUGIN_NAME;
        info.author = "MAP2 Audio";
        info.brand = "MAP2";
        info.category = "Drums";
        info.format = PluginFormat::Hardware;
        info.formatName = "Native";
        info.audioInputs = 0;
        info.audioOutputs = 2;
        info.hasMidiInput = true;
        info.hasMidiOutput = false;
        info.latencySamples = 0;

        drumMachineAdapter_ = adapter.get();
        drumMachineInstanceId_ = pluginHost_.registerHardwarePlugin(
            std::move(adapter), info);

        if (drumMachineInstanceId_ == INVALID_INSTANCE_ID) {
            drumMachineAdapter_ = nullptr;
            std::cerr << "Warning: Failed to register DrumMachine graph adapter" << std::endl;
        }
    }

    std::cout << "  Modulation processors: Chorus, Phaser, Pitch Shifter, IntelliFX 8-Voice, ShoeGaze, LexiLove, H3000, Peavey5150, TweedBassman, PassionFX" << std::endl;
    std::cout << "  SynthForge: Graph-registered instrument (16-part MIDI/voice core)" << std::endl;
    std::cout << "  Drum Machine: Graph-registered instrument (16-pad sequencer)" << std::endl;

    // Set up audio callback
    audioIO_.setProcessCallback([this](const float* const* inputs, int numInputs,
                                       float* const* outputs, int numOutputs,
                                       int numSamples) {
        audioCallback(inputs, numInputs, outputs, numOutputs, numSamples);
    });

    // Start metering thread (Option 3 - off-thread metering)
    meteringRunning_.store(true);
    meteringThread_ = std::thread([this]() { meteringThreadFunc(); });

#ifdef HAS_AVDECC
    // Initialize AVDECC controller (la_avdecc-backed)
    const char* avdecc_iface_env = std::getenv("MAP2_AVB_INTERFACE");
    std::string avdecc_interface = avdecc_iface_env ? avdecc_iface_env : "";
    if (avdecc_interface.empty()) {
        avdecc_interface = readAvbMarkerValue("interface");
    }
    if (avdecc_interface.empty()) {
        avdecc_interface = "eth0";
    }

    try {
        avdeccController_ = std::make_unique<Map2Audio::Map2AvdeccController>(
            avdecc_interface,
            "MAP2-AudioEngine",
            8,  // Max talker streams
            8   // Max listener streams
        );

        if (!avdeccController_->start()) {
            std::cerr << "Warning: Failed to start AVDECC controller (non-fatal)" << std::endl;
            avdeccController_.reset();
        } else {
            std::cout << "  AVDECC Controller: Started on " << avdecc_interface << std::endl;
        }
    } catch (const std::exception& e) {
        std::cerr << "Warning: AVDECC initialization failed: " << e.what() << " (non-fatal)" << std::endl;
        avdeccController_.reset();
    }
#endif

    initialized_ = true;

    std::cout << "MAP2 Audio Engine initialized successfully" << std::endl;
    std::cout << "  Sample Rate: " << sampleRate_ << " Hz" << std::endl;
    std::cout << "  Buffer Size: " << bufferSize_ << " samples" << std::endl;
    std::cout << "  Audio Device: " << audioIO_.getCurrentDeviceName() << std::endl;
    std::cout << "  Plugins Found: " << pluginHost_.discoverPlugins().size() << std::endl;

    return true;
}

void Map2AudioEngine::shutdown() {
    if (!initialized_) return;

    std::cout << "Shutting down MAP2 Audio Engine" << std::endl;

    stopAudio();

    {
        std::lock_guard<std::mutex> guard(avbStreamsMutex_);
        for (auto& [streamId, stream] : avbStreams_) {
            (void)streamId;
#ifdef HAS_AVB
            if (stream.device != nullptr) {
                if (stream.device->isPlaying()) {
                    stream.device->stop();
                }
                stream.device->close();
            }
#endif
            stream.running = false;
        }
        avbStreams_.clear();
    }
    {
        std::lock_guard<std::mutex> guard(avbDiscoveredDevicesMutex_);
        avbDiscoveredDevices_.clear();
    }
    
    // Stop metering thread (Option 3 - lock-free ring buffer)
    meteringRunning_.store(false);
    // No condition variable to notify — metering thread polls with sleep
    if (meteringThread_.joinable()) {
        meteringThread_.join();
    }

    midiHandler_.shutdown();
    clearAllSpilloverChains();
    clearIndependentGraphCrossfades();
    clearAllNativeSpillovers();
    audioGraph_->shutdown();

    // Reset non-owning hardware processor pointers before host teardown.
    lexiconProcessor_ = nullptr;
    lexiconInstanceId_ = INVALID_INSTANCE_ID;
    synthForgeAdapter_ = nullptr;
    synthForgeInstanceId_ = INVALID_INSTANCE_ID;
    drumMachineAdapter_ = nullptr;
    drumMachineInstanceId_ = INVALID_INSTANCE_ID;

    pluginHost_.shutdown();
    audioIO_.shutdown();

#ifdef HAS_AVDECC
    // Shutdown AVDECC controller
    if (avdeccController_) {
        avdeccController_->stop();
        avdeccController_.reset();
        std::cout << "  AVDECC Controller: Stopped" << std::endl;
    }
#endif

    initialized_ = false;
}

Map2AudioEngine::SystemInfo Map2AudioEngine::getSystemInfo() const {
    SystemInfo info;
    info.version = ENGINE_VERSION;
    info.sampleRate = sampleRate_;
    info.bufferSize = bufferSize_;
    info.audioDevice = audioIO_.getCurrentDeviceName();
    info.inputGainDb = inputGainDb_.load(std::memory_order_acquire);
    info.outputGainDb = outputGainDb_.load(std::memory_order_acquire);
    info.lv2Path = lv2Path_;
    info.running = initialized_;
    info.audioRunning = audioRunning_;
    info.pluginCount = static_cast<int>(pluginHost_.discoverPlugins().size());
    info.midiEnabled = midiHandler_.isEnabled();
    info.totalLatencySamples = getTotalLatencySamples();
    info.totalLatencyMs = getTotalLatencyMs();
    return info;
}

bool Map2AudioEngine::startAudio() {
    if (!initialized_ || audioRunning_) return false;

    if (!audioIO_.startAudio()) {
        std::cerr << "Failed to start audio" << std::endl;
        return false;
    }

    audioRunning_ = true;
    enqueuePlatformEvent(
        "audio.engine.status",
        "info",
        "Audio started",
        "JUCE audio processing started");
    std::cout << "Audio processing started" << std::endl;
    return true;
}

bool Map2AudioEngine::stopAudio() {
    if (!audioRunning_) return false;

    audioIO_.stopAudio();
    audioRunning_ = false;
    enqueuePlatformEvent(
        "audio.engine.status",
        "info",
        "Audio stopped",
        "JUCE audio processing stopped");

    std::cout << "Audio processing stopped" << std::endl;
    return true;
}

bool Map2AudioEngine::isAvbAvailable() const {
#ifdef HAS_AVB
    const bool enabledByEnv = isTruthy(std::getenv("MAP2_AVB_ENABLED"));
    const bool enabledByMarker = std::filesystem::exists("/etc/map2/avb-enabled");
    if (!enabledByEnv && !enabledByMarker) {
        return false;
    }

    const char* ifaceEnv = std::getenv("MAP2_AVB_INTERFACE");
    std::string interfaceName = ifaceEnv ? ifaceEnv : "";
    if (interfaceName.empty()) {
        interfaceName = readAvbMarkerValue("interface");
    }
    if (interfaceName.empty()) {
        return false;
    }

    if (!std::filesystem::exists("/sys/class/net/" + interfaceName)) {
        return false;
    }

    if (!isPtpPidHealthy()) {
        return false;
    }

    return true;
#else
    return false;
#endif
}

bool Map2AudioEngine::createAvbStream(const AvbStreamRuntimeConfig& config, std::string* error) {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return false;
#else
    AvbStreamRuntimeConfig normalized = config;
    normalized.direction = normalizeDirection(config.direction);
    normalized.channels = std::clamp(config.channels, 1, MAX_CHANNELS);
    normalized.sampleRate = std::max(1, config.sampleRate);
    normalized.bufferSize = std::max(1, config.bufferSize);
    normalized.presentationOffsetUs = std::max(0, config.presentationOffsetUs);
    normalized.priority = std::clamp(config.priority, 0, 7);

    if (normalized.streamId.empty()) {
        if (error != nullptr) {
            *error = "stream_id is required";
        }
        return false;
    }

    if (normalized.direction != "talker" && normalized.direction != "listener") {
        if (error != nullptr) {
            *error = "direction must be 'talker' or 'listener'";
        }
        return false;
    }

    if (normalized.interfaceName.empty()) {
        if (const char* ifaceEnv = std::getenv("MAP2_AVB_INTERFACE")) {
            normalized.interfaceName = ifaceEnv;
        }
    }

    if (normalized.interfaceName.empty()) {
        if (error != nullptr) {
            *error = "AVB interface is required";
        }
        return false;
    }

    if (!std::filesystem::exists("/sys/class/net/" + normalized.interfaceName)) {
        if (error != nullptr) {
            *error = "Configured AVB interface not found: " + normalized.interfaceName;
        }
        return false;
    }

    const auto ifaceInfo = getAvbInterfaceInfo(normalized.interfaceName);
    if (!ifaceInfo.available) {
        if (error != nullptr) {
            *error = ifaceInfo.error.empty() ? "AVB interface unavailable" : ifaceInfo.error;
        }
        return false;
    }

    {
        std::lock_guard<std::mutex> guard(avbStreamsMutex_);
        if (avbStreams_.find(normalized.streamId) != avbStreams_.end()) {
            if (error != nullptr) {
                *error = "Stream already exists";
            }
            return false;
        }
    }

    const bool talker = normalized.direction == "talker";
    std::string effectiveDestMac = normalized.destMac;
    if (talker && effectiveDestMac.empty()) {
        if (const char* envMac = std::getenv("MAP2_AVB_DEST_MAC")) {
            effectiveDestMac = envMac;
        }
        if (effectiveDestMac.empty()) {
            effectiveDestMac = defaultTalkerDestMac();
        }
    }

    if (talker && !isValidMacAddress(effectiveDestMac)) {
        if (error != nullptr) {
            *error = "Invalid destination MAC address";
        }
        return false;
    }

    std::unique_ptr<Map2Audio::AvbAudioIODevice> device;
    try {
        const auto direction = talker ? Map2Audio::AvbDirection::Talker : Map2Audio::AvbDirection::Listener;
        const juce::String deviceName = talker
            ? "AVB Talker (" + juce::String(normalized.streamId) + ")"
            : "AVB Listener (" + juce::String(normalized.streamId) + ")";

        device = std::make_unique<Map2Audio::AvbAudioIODevice>(
            deviceName,
            normalized.interfaceName,
            deriveNumericStreamId(normalized.streamId),
            effectiveDestMac,
            direction,
            static_cast<uint32_t>(normalized.presentationOffsetUs),
            static_cast<uint8_t>(normalized.priority));
    } catch (const std::exception& e) {
        if (error != nullptr) {
            *error = "Failed to allocate AVB device: " + std::string(e.what());
        }
        return false;
    }

    const juce::BigInteger inputMask = talker ? juce::BigInteger() : buildChannelMask(normalized.channels);
    const juce::BigInteger outputMask = talker ? buildChannelMask(normalized.channels) : juce::BigInteger();
    const juce::String openError = device->open(inputMask, outputMask, normalized.sampleRate, normalized.bufferSize);
    if (openError.isNotEmpty()) {
        if (error != nullptr) {
            *error = openError.toStdString();
        }
        return false;
    }

    normalized.destMac = effectiveDestMac;

    AvbManagedStream stream;
    stream.config = normalized;
    stream.running = false;
#ifdef BUILD_AVB_TESTS
    stream.lifecycleState = AvbStreamLifecycleState::Created;
#endif
    stream.lastError.clear();
    stream.device = std::move(device);

    {
        std::lock_guard<std::mutex> guard(avbStreamsMutex_);
        if (avbStreams_.find(normalized.streamId) != avbStreams_.end()) {
            if (error != nullptr) {
                *error = "Stream already exists";
            }
            return false;
        }
        avbStreams_.emplace(normalized.streamId, std::move(stream));
    }

    if (error != nullptr) {
        error->clear();
    }
    return true;
#endif
}

#ifdef BUILD_AVB_TESTS
bool Map2AudioEngine::createAvbStreamForTest(const std::string& streamId) {
#ifndef HAS_AVB
    return false;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    if (avbStreams_.count(streamId) > 0) {
        return false;
    }

    AvbManagedStream stream;
    stream.config.streamId = streamId;
    stream.config.direction = "talker";
    stream.config.channels = 2;
    stream.config.sampleRate = 48000;
    stream.config.bufferSize = 256;
    stream.config.interfaceName = "lo";
    stream.config.destMac = "91:e0:f0:00:0e:80";
    stream.config.presentationOffsetUs = 2000;
    stream.config.priority = 3;
    stream.running = false;
    stream.lifecycleState = AvbStreamLifecycleState::Created;
    stream.isTestStream = true;
    avbStreams_.emplace(streamId, std::move(stream));
    return true;
#endif
}
#endif

bool Map2AudioEngine::startAvbStream(const std::string& streamId, std::string* error) {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return false;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        if (error != nullptr) {
            *error = "Stream not found";
        }
        return false;
    }

    if (it->second.running) {
#ifdef BUILD_AVB_TESTS
        it->second.lifecycleState = AvbStreamLifecycleState::Running;
#endif
        if (error != nullptr) {
            error->clear();
        }
        return true;
    }

    if (it->second.device == nullptr || !it->second.device->isOpen()) {
        it->second.lastError = "Stream device is not initialized";
#ifdef BUILD_AVB_TESTS
        if (it->second.isTestStream) {
            it->second.running = true;
            it->second.lifecycleState = AvbStreamLifecycleState::Running;
            it->second.lastError.clear();
            if (error != nullptr) {
                error->clear();
            }
            return true;
        }
#endif
        if (error != nullptr) {
            *error = it->second.lastError;
        }
        return false;
    }

    it->second.device->start(nullptr);
    if (!it->second.device->isPlaying()) {
        const std::string deviceError = it->second.device->getLastError().toStdString();
        it->second.lastError = deviceError.empty() ? "Failed to start AVB stream device" : deviceError;
#ifdef BUILD_AVB_TESTS
        it->second.lifecycleState = AvbStreamLifecycleState::Error;
#endif
        if (error != nullptr) {
            *error = it->second.lastError;
        }
        return false;
    }

    it->second.running = true;
#ifdef BUILD_AVB_TESTS
    it->second.lifecycleState = AvbStreamLifecycleState::Running;
#endif
    it->second.stats = AvbStreamRuntimeStats{};
    it->second.startedAt = std::chrono::steady_clock::now();
    it->second.lastError.clear();
    if (error != nullptr) {
        error->clear();
    }
    return true;
#endif
}

bool Map2AudioEngine::stopAvbStream(const std::string& streamId, std::string* error) {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return false;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        if (error != nullptr) {
            *error = "Stream not found";
        }
        return false;
    }

    if (it->second.device != nullptr && it->second.device->isPlaying()) {
        it->second.device->stop();
        if (it->second.device->isPlaying()) {
            it->second.lastError = "Failed to stop AVB stream device";
#ifdef BUILD_AVB_TESTS
            it->second.lifecycleState = AvbStreamLifecycleState::Error;
#endif
            if (error != nullptr) {
                *error = it->second.lastError;
            }
            return false;
        }
    }

    if (it->second.device != nullptr) {
        const auto snapshot = it->second.device->getAvbStreamStatsSnapshot();
        it->second.stats.framesSent = snapshot.framesSent;
        it->second.stats.framesReceived = snapshot.framesReceived;
        it->second.stats.sendErrors = snapshot.sendErrors;
        it->second.stats.receiveErrors = snapshot.receiveErrors;
        it->second.stats.underruns = snapshot.underruns;
        it->second.stats.overruns = snapshot.overruns;
        it->second.stats.timestampErrors = snapshot.timestampErrors;
        it->second.stats.sequenceErrors = snapshot.sequenceErrors;
        it->second.stats.bytesTransferred = snapshot.bytesTransferred;
        it->second.stats.maxLatencyNs = snapshot.maxLatencyNs;
        it->second.stats.minLatencyNs =
            (snapshot.minLatencyNs == std::numeric_limits<int64_t>::max()) ? 0 : snapshot.minLatencyNs;
    }

    it->second.running = false;
#ifdef BUILD_AVB_TESTS
    it->second.lifecycleState = AvbStreamLifecycleState::Stopped;
#endif
    it->second.lastError.clear();
    if (error != nullptr) {
        error->clear();
    }
    return true;
#endif
}

bool Map2AudioEngine::deleteAvbStream(const std::string& streamId, std::string* error) {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return false;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        if (error != nullptr) {
            *error = "Stream not found";
        }
        return false;
    }

    if (it->second.device != nullptr) {
        if (it->second.device->isPlaying()) {
            it->second.device->stop();
            if (it->second.device->isPlaying()) {
                if (error != nullptr) {
                    *error = "Failed to stop AVB stream before delete";
                }
                return false;
            }
        }
        it->second.device->close();
    }

    avbStreams_.erase(it);
    if (error != nullptr) {
        error->clear();
    }
    return true;
#endif
}

std::optional<Map2AudioEngine::AvbStreamRuntimeStats> Map2AudioEngine::getAvbStreamStats(
    const std::string& streamId,
    std::string* error) const {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return std::nullopt;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        if (error != nullptr) {
            *error = "Stream not found";
        }
        return std::nullopt;
    }

    AvbStreamRuntimeStats stats = it->second.stats;
    if (it->second.device != nullptr) {
        const auto snapshot = it->second.device->getAvbStreamStatsSnapshot();
        stats.framesSent = snapshot.framesSent;
        stats.framesReceived = snapshot.framesReceived;
        stats.sendErrors = snapshot.sendErrors;
        stats.receiveErrors = snapshot.receiveErrors;
        stats.underruns = snapshot.underruns;
        stats.overruns = snapshot.overruns;
        stats.timestampErrors = snapshot.timestampErrors;
        stats.sequenceErrors = snapshot.sequenceErrors;
        stats.sequenceGapEvents = snapshot.sequenceGapEvents;
        stats.timestampSkewEvents = snapshot.timestampSkewEvents;
        stats.decodeErrors = snapshot.decodeErrors;
        stats.maxTimestampSkewNs = snapshot.maxTimestampSkewNs;
        stats.bytesTransferred = snapshot.bytesTransferred;
        stats.maxLatencyNs = snapshot.maxLatencyNs;
        stats.minLatencyNs =
            (snapshot.minLatencyNs == std::numeric_limits<int64_t>::max()) ? 0 : snapshot.minLatencyNs;
    }

    if (error != nullptr) {
        error->clear();
    }
    return stats;
#endif
}

bool Map2AudioEngine::resetAvbStreamStats(const std::string& streamId, std::string* error) {
#ifndef HAS_AVB
    if (error != nullptr) {
        *error = "AVB not compiled (USE_AVB=OFF)";
    }
    return false;
#else
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        if (error != nullptr) {
            *error = "Stream not found";
        }
        return false;
    }

    if (it->second.device != nullptr) {
        it->second.device->resetAvbStreamStats();
    }

    it->second.stats = AvbStreamRuntimeStats{};
    if (error != nullptr) {
        error->clear();
    }
    return true;
#endif
}

std::vector<std::string> Map2AudioEngine::listAvbStreams() const {
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    std::vector<std::string> streamIds;
    streamIds.reserve(avbStreams_.size());
    for (const auto& [streamId, _stream] : avbStreams_) {
        (void)_stream;
        streamIds.push_back(streamId);
    }
    return streamIds;
}

#ifdef BUILD_AVB_TESTS
std::optional<Map2AudioEngine::AvbStreamLifecycleState> Map2AudioEngine::getAvbStreamStateForTest(
    const std::string& streamId) const {
    std::lock_guard<std::mutex> guard(avbStreamsMutex_);
    auto it = avbStreams_.find(streamId);
    if (it == avbStreams_.end()) {
        return std::nullopt;
    }
    return it->second.lifecycleState;
}
#endif

std::vector<std::string> Map2AudioEngine::getAvbDeviceNames() {
    std::vector<std::string> names;
#ifdef HAS_AVB
    for (const auto& device : audioIO_.getAvailableDevices()) {
        if (containsInsensitive(device.name, "avb")) {
            names.push_back(device.name);
        }
    }

    if (names.empty() && isAvbAvailable()) {
        names.push_back("AVB Talker (Local)");
        names.push_back("AVB Listener (Local)");
    }
#endif

    {
        std::lock_guard<std::mutex> guard(avbDiscoveredDevicesMutex_);
        for (const auto& device : avbDiscoveredDevices_) {
            if (!device.available || device.deviceName.empty()) {
                continue;
            }
            if (device.host.empty()) {
                names.push_back(device.deviceName);
                continue;
            }

            const std::string host = device.host;
            const std::string displayName = device.deviceName.find(host) == std::string::npos
                ? device.deviceName + " [" + host + "]"
                : device.deviceName;
            names.push_back(displayName);
        }
    }

    std::sort(names.begin(), names.end());
    names.erase(std::unique(names.begin(), names.end()), names.end());
    return names;
}

int Map2AudioEngine::getAvbDeviceCount() {
    return static_cast<int>(getAvbDeviceNames().size());
}

Map2AudioEngine::AvbInterfaceInfo Map2AudioEngine::getAvbInterfaceInfo(const std::string& interfaceName) {
    AvbInterfaceInfo info;
    info.interfaceName = interfaceName;
#ifdef HAS_AVB
    info.avbEnabled = isTruthy(std::getenv("MAP2_AVB_ENABLED"))
        || std::filesystem::exists("/etc/map2/avb-enabled");

    if (info.interfaceName.empty()) {
        if (const char* ifaceEnv = std::getenv("MAP2_AVB_INTERFACE")) {
            info.interfaceName = ifaceEnv;
        } else {
            info.interfaceName = readAvbMarkerValue("interface");
        }
    }

    if (info.interfaceName.empty()) {
        info.error = "No AVB interface configured";
        info.available = false;
        return info;
    }

    info.interfaceExists = std::filesystem::exists("/sys/class/net/" + info.interfaceName);
    info.ptpReady = isPtpPidHealthy();
    info.available = info.avbEnabled && info.interfaceExists && info.ptpReady;
    if (!info.available) {
        if (!info.avbEnabled) {
            info.error = "AVB disabled";
        } else if (!info.interfaceExists) {
            info.error = "Interface not found";
        } else if (!info.ptpReady) {
            info.error = "ptp4l not running";
        } else {
            info.error = "AVB unavailable";
        }
    }
#else
    info.error = "AVB not compiled (USE_AVB=OFF)";
#endif
    return info;
}

bool Map2AudioEngine::setAvbDiscoveredDevices(
    const std::vector<AvbDiscoveredDeviceInfo>& devices,
    std::string* error) {
    std::vector<AvbDiscoveredDeviceInfo> normalized;
    normalized.reserve(devices.size());
    std::unordered_set<std::string> endpointIds;

    for (const auto& device : devices) {
        if (device.endpointId.empty()) {
            if (error != nullptr) {
                *error = "endpoint_id is required";
            }
            return false;
        }
        if (device.deviceName.empty()) {
            if (error != nullptr) {
                *error = "device_name is required";
            }
            return false;
        }
        if (!endpointIds.insert(device.endpointId).second) {
            if (error != nullptr) {
                *error = "duplicate endpoint_id: " + device.endpointId;
            }
            return false;
        }

        AvbDiscoveredDeviceInfo entry = device;
        entry.direction = normalizeDirection(entry.direction);
        if (entry.direction != "talker" && entry.direction != "listener") {
            entry.direction = "listener";
        }
        entry.deviceType = normalizeDeviceType(entry.deviceType);
        entry.channels = std::clamp(entry.channels, 1, MAX_CHANNELS);
        entry.sampleRate = std::max(1, entry.sampleRate);
        if (entry.audioFormat.empty()) {
            entry.audioFormat = "24-bit PCM";
        }
        normalized.push_back(std::move(entry));
    }

    {
        std::lock_guard<std::mutex> guard(avbDiscoveredDevicesMutex_);
        avbDiscoveredDevices_ = std::move(normalized);
    }

    if (error != nullptr) {
        error->clear();
    }
    return true;
}

std::vector<Map2AudioEngine::AvbDiscoveredDeviceInfo> Map2AudioEngine::getAvbDiscoveredDevices() const {
    std::lock_guard<std::mutex> guard(avbDiscoveredDevicesMutex_);
    return avbDiscoveredDevices_;
}

void Map2AudioEngine::clearAvbDiscoveredDevices() {
    std::lock_guard<std::mutex> guard(avbDiscoveredDevicesMutex_);
    avbDiscoveredDevices_.clear();
}

bool Map2AudioEngine::setExternalLoopDefinitions(const std::vector<ExternalLoopDefinition>& loops) {
    std::lock_guard<std::mutex> guard(effectsLoopsMutex_);

    std::map<std::string, ExternalLoopDefinition> nextDefinitions;
    std::map<std::string, ExternalLoopMetrics> nextMetrics;
    for (const auto& loop : loops) {
        if (loop.loopId.empty()) {
            return false;
        }
        if (loop.channels < 1 || loop.channels > 8) {
            return false;
        }

        ExternalLoopDefinition definition = loop;
        definition.channels = std::clamp(definition.channels, 1, 8);
        if (definition.targetAddedLatencyMs <= 0.0) {
            definition.targetAddedLatencyMs = 0.5;
        }

        nextDefinitions[definition.loopId] = definition;

        ExternalLoopMetrics metrics;
        metrics.loopId = definition.loopId;
        metrics.active = true;
        metrics.bypass = definition.bypass;
        metrics.channels = definition.channels;
        metrics.targetAddedLatencyMs = definition.targetAddedLatencyMs;
        metrics.measuredAddedLatencyMs = std::max(0.0, definition.measuredAddedLatencyMs);
        metrics.compensationSamples = std::max(0, definition.compensationSamples);
        nextMetrics[metrics.loopId] = metrics;
    }

    externalLoops_ = std::move(nextDefinitions);
    externalLoopMetrics_ = std::move(nextMetrics);
    rebuildExternalLoopProcessingStateLocked();
    return true;
}

bool Map2AudioEngine::setChainLoopInsertions(
    int chainId,
    const std::vector<ExternalLoopInsertion>& insertions) {
    if (chainId < 0) {
        return false;
    }

    std::lock_guard<std::mutex> guard(effectsLoopsMutex_);

    std::vector<ExternalLoopInsertion> normalized;
    normalized.reserve(insertions.size());
    for (const auto& insertion : insertions) {
        if (insertion.loopId.empty()) {
            return false;
        }
        if (externalLoops_.find(insertion.loopId) == externalLoops_.end()) {
            return false;
        }

        ExternalLoopInsertion entry = insertion;
        entry.slotIndex = std::max(0, entry.slotIndex);
        entry.crossfadeMs = std::max(0, entry.crossfadeMs);
        normalized.push_back(std::move(entry));
    }

    std::sort(
        normalized.begin(),
        normalized.end(),
        [](const ExternalLoopInsertion& lhs, const ExternalLoopInsertion& rhs) {
            if (lhs.slotIndex == rhs.slotIndex) {
                return lhs.insertionId < rhs.insertionId;
            }
            return lhs.slotIndex < rhs.slotIndex;
        });

    chainLoopInsertions_[chainId] = std::move(normalized);
    rebuildExternalLoopProcessingStateLocked();
    return true;
}

bool Map2AudioEngine::setChainDryWetMix(int chainId, float dryWetMix) {
    if (chainId < 0) {
        return false;
    }

    const float normalizedMix = juce::jlimit(0.0f, 100.0f, dryWetMix);
    std::lock_guard<std::mutex> guard(chainStateMutex_);
    chainDryWetMix_[chainId] = normalizedMix;
    chainGainLinear_[chainId] = juce::jlimit(0.0f, 1.0f, normalizedMix / 100.0f);
    return true;
}

bool Map2AudioEngine::setChainGain(int chainId, float gainLinear) {
    if (chainId < 0) {
        return false;
    }

    std::lock_guard<std::mutex> guard(chainStateMutex_);
    chainGainLinear_[chainId] = juce::jlimit(0.0f, 1.0f, gainLinear);
    return true;
}

bool Map2AudioEngine::setChainMute(int chainId, bool muted) {
    if (chainId < 0) {
        return false;
    }

    std::lock_guard<std::mutex> guard(chainStateMutex_);
    chainMuteState_[chainId] = muted;
    return true;
}

bool Map2AudioEngine::setChainSolo(int chainId, bool solo) {
    if (chainId < 0) {
        return false;
    }

    std::lock_guard<std::mutex> guard(chainStateMutex_);
    chainSoloState_[chainId] = solo;
    return true;
}

bool Map2AudioEngine::setLoopBypass(const std::string& loopId, bool bypass) {
    std::lock_guard<std::mutex> guard(effectsLoopsMutex_);
    auto defIt = externalLoops_.find(loopId);
    if (defIt == externalLoops_.end()) {
        return false;
    }
    defIt->second.bypass = bypass;

    auto metricIt = externalLoopMetrics_.find(loopId);
    if (metricIt != externalLoopMetrics_.end()) {
        metricIt->second.bypass = bypass;
    } else {
        ExternalLoopMetrics metrics;
        metrics.loopId = loopId;
        metrics.active = true;
        metrics.bypass = bypass;
        metrics.channels = defIt->second.channels;
        metrics.targetAddedLatencyMs = defIt->second.targetAddedLatencyMs;
        metrics.measuredAddedLatencyMs = defIt->second.measuredAddedLatencyMs;
        metrics.compensationSamples = defIt->second.compensationSamples;
        externalLoopMetrics_[loopId] = metrics;
    }
    rebuildExternalLoopProcessingStateLocked();
    return true;
}

bool Map2AudioEngine::calibrateLoop(const std::string& loopId, int calibrationFrames) {
    std::lock_guard<std::mutex> guard(effectsLoopsMutex_);
    auto defIt = externalLoops_.find(loopId);
    if (defIt == externalLoops_.end()) {
        return false;
    }

    double measuredMs = defIt->second.targetAddedLatencyMs;
    if (measuredMs <= 0.0) {
        measuredMs = 0.5;
    }

    const double sampleRate = (sampleRate_ > 0.0) ? sampleRate_ : 48000.0;
    int compensationSamples = static_cast<int>(std::llround((measuredMs / 1000.0) * sampleRate));
    if (calibrationFrames > 0) {
        compensationSamples = std::min(compensationSamples, calibrationFrames);
    }
    compensationSamples = std::max(0, compensationSamples);

    defIt->second.measuredAddedLatencyMs = measuredMs;
    defIt->second.compensationSamples = compensationSamples;

    auto metricIt = externalLoopMetrics_.find(loopId);
    if (metricIt == externalLoopMetrics_.end()) {
        ExternalLoopMetrics metrics;
        metrics.loopId = loopId;
        metrics.active = true;
        metrics.bypass = defIt->second.bypass;
        metrics.channels = defIt->second.channels;
        metrics.targetAddedLatencyMs = defIt->second.targetAddedLatencyMs;
        metrics.measuredAddedLatencyMs = measuredMs;
        metrics.compensationSamples = compensationSamples;
        externalLoopMetrics_[loopId] = metrics;
    } else {
        metricIt->second.active = true;
        metricIt->second.bypass = defIt->second.bypass;
        metricIt->second.channels = defIt->second.channels;
        metricIt->second.targetAddedLatencyMs = defIt->second.targetAddedLatencyMs;
        metricIt->second.measuredAddedLatencyMs = measuredMs;
        metricIt->second.compensationSamples = compensationSamples;
    }

    rebuildExternalLoopProcessingStateLocked();
    return true;
}

std::vector<Map2AudioEngine::ExternalLoopMetrics> Map2AudioEngine::getLoopMetrics(
    const std::string& loopId) const {
    std::lock_guard<std::mutex> guard(effectsLoopsMutex_);

    std::vector<ExternalLoopMetrics> payload;
    if (!loopId.empty()) {
        const auto it = externalLoopMetrics_.find(loopId);
        if (it != externalLoopMetrics_.end()) {
            payload.push_back(it->second);
            return payload;
        }
        const auto defIt = externalLoops_.find(loopId);
        if (defIt != externalLoops_.end()) {
            ExternalLoopMetrics fallback;
            fallback.loopId = defIt->second.loopId;
            fallback.active = true;
            fallback.bypass = defIt->second.bypass;
            fallback.channels = defIt->second.channels;
            fallback.targetAddedLatencyMs = defIt->second.targetAddedLatencyMs;
            fallback.measuredAddedLatencyMs = defIt->second.measuredAddedLatencyMs;
            fallback.compensationSamples = defIt->second.compensationSamples;
            payload.push_back(std::move(fallback));
        }
        return payload;
    }

    payload.reserve(externalLoopMetrics_.size());
    for (const auto& [_, metrics] : externalLoopMetrics_) {
        payload.push_back(metrics);
    }
    return payload;
}

void Map2AudioEngine::rebuildExternalLoopProcessingStateLocked() {
    auto nextState = std::make_shared<ExternalLoopProcessingState>();

    const int blockSamples = std::max(bufferSize_, MAX_AUDIO_BUFFER_SIZE);
    const double sampleRate = sampleRate_ > 0.0 ? sampleRate_ : 48000.0;

    for (const auto& [loopId, definition] : externalLoops_) {
        ExternalLoopRuntimeLoop runtimeLoop;
        runtimeLoop.loopId = loopId;
        runtimeLoop.active = true;
        runtimeLoop.bypass = definition.bypass;
        runtimeLoop.channels = std::clamp(definition.channels, 1, 8);
        runtimeLoop.compensationSamples = std::max(0, definition.compensationSamples);

        const int delayLength = std::max(1, runtimeLoop.compensationSamples + blockSamples + 1);
        runtimeLoop.delayLines.resize(static_cast<size_t>(runtimeLoop.channels));
        for (auto& line : runtimeLoop.delayLines) {
            line.assign(static_cast<size_t>(delayLength), 0.0f);
        }

        nextState->loops.emplace(loopId, std::move(runtimeLoop));
    }

    for (const auto& [chainId, insertions] : chainLoopInsertions_) {
        for (const auto& insertion : insertions) {
            const auto loopIt = nextState->loops.find(insertion.loopId);
            if (loopIt == nextState->loops.end()) {
                continue;
            }

            ExternalLoopRuntimeInsertion runtimeInsertion;
            runtimeInsertion.insertionId = insertion.insertionId;
            runtimeInsertion.loopId = insertion.loopId;
            runtimeInsertion.chainId = chainId;
            runtimeInsertion.slotIndex = std::max(0, insertion.slotIndex);
            runtimeInsertion.enabled = insertion.enabled;
            runtimeInsertion.mode = insertion.mode;

            const float targetBlend = juce::jlimit(0.0f, 1.0f, insertion.blendPct / 100.0f);
            runtimeInsertion.targetBlend = insertionUsesParallelBlend(runtimeInsertion.mode) ? targetBlend : 1.0f;
            runtimeInsertion.targetSendGainLinear = map2::dbToLinear(insertion.sendGainDb);
            runtimeInsertion.targetReturnGainLinear = map2::dbToLinear(insertion.returnGainDb);

            const int crossfadeSamples = std::max(
                1,
                static_cast<int>(std::llround(
                    std::max(0, insertion.crossfadeMs) * 0.001 * sampleRate)));
            runtimeInsertion.smoothingAlpha = juce::jlimit(
                0.0f,
                1.0f,
                1.0f / static_cast<float>(crossfadeSamples));
            runtimeInsertion.currentBlend = runtimeInsertion.targetBlend;
            runtimeInsertion.currentSendGainLinear = runtimeInsertion.targetSendGainLinear;
            runtimeInsertion.currentReturnGainLinear = runtimeInsertion.targetReturnGainLinear;

            nextState->orderedInsertions.push_back(std::move(runtimeInsertion));
        }
    }

    std::sort(
        nextState->orderedInsertions.begin(),
        nextState->orderedInsertions.end(),
        [](const ExternalLoopRuntimeInsertion& lhs, const ExternalLoopRuntimeInsertion& rhs) {
            if (lhs.chainId != rhs.chainId) {
                return lhs.chainId < rhs.chainId;
            }
            if (lhs.slotIndex != rhs.slotIndex) {
                return lhs.slotIndex < rhs.slotIndex;
            }
            return lhs.insertionId < rhs.insertionId;
        });

    std::atomic_store_explicit(
        &externalLoopProcessingState_,
        std::move(nextState),
        std::memory_order_release);
}

void Map2AudioEngine::processExternalLoopInsertions(juce::AudioBuffer<float>& buffer, int numSamples) {
    auto state = std::atomic_load_explicit(&externalLoopProcessingState_, std::memory_order_acquire);
    if (state == nullptr || state->orderedInsertions.empty() || numSamples <= 0) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    if (numChannels <= 0) {
        return;
    }

    if (externalLoopDryBuffer_.getNumChannels() < numChannels
        || externalLoopDryBuffer_.getNumSamples() < numSamples) {
        externalLoopDryBuffer_.setSize(numChannels, numSamples, false, false, true);
        externalLoopWetBuffer_.setSize(numChannels, numSamples, false, false, true);
    }

    for (auto& insertion : state->orderedInsertions) {
        const auto loopIt = state->loops.find(insertion.loopId);
        if (loopIt == state->loops.end()) {
            continue;
        }

        auto& loop = loopIt->second;
        if (!insertion.enabled || loop.bypass || !loop.active) {
            continue;
        }

        const int processChannels = std::min(
            numChannels,
            std::min(loop.channels, static_cast<int>(loop.delayLines.size())));
        if (processChannels <= 0) {
            continue;
        }

        for (int ch = 0; ch < processChannels; ++ch) {
            externalLoopDryBuffer_.copyFrom(ch, 0, buffer, ch, 0, numSamples);
            externalLoopWetBuffer_.copyFrom(ch, 0, buffer, ch, 0, numSamples);
        }

        const float alpha = juce::jlimit(0.0f, 1.0f, insertion.smoothingAlpha);
        const bool parallelMode = insertionUsesParallelBlend(insertion.mode);

        int writeIndex = loop.delayWriteIndex;
        int delayLineLength = 0;
        if (!loop.delayLines.empty()) {
            delayLineLength = static_cast<int>(loop.delayLines.front().size());
        }

        for (int sample = 0; sample < numSamples; ++sample) {
            insertion.currentBlend += (insertion.targetBlend - insertion.currentBlend) * alpha;
            insertion.currentSendGainLinear += (
                insertion.targetSendGainLinear - insertion.currentSendGainLinear) * alpha;
            insertion.currentReturnGainLinear += (
                insertion.targetReturnGainLinear - insertion.currentReturnGainLinear) * alpha;

            const float wetMix = juce::jlimit(0.0f, 1.0f, insertion.currentBlend);
            const float sendGain = std::max(0.0f, insertion.currentSendGainLinear);
            const float returnGain = std::max(0.0f, insertion.currentReturnGainLinear);

            for (int ch = 0; ch < processChannels; ++ch) {
                const float dry = externalLoopDryBuffer_.getSample(ch, sample);
                const float source = externalLoopWetBuffer_.getSample(ch, sample);
                float wet = source * sendGain;

                if (loop.compensationSamples > 0 && delayLineLength > 1) {
                    auto& delayLine = loop.delayLines[static_cast<size_t>(ch)];
                    const int delaySamples = std::min(loop.compensationSamples, delayLineLength - 1);
                    int readIndex = writeIndex - delaySamples;
                    if (readIndex < 0) {
                        readIndex += delayLineLength;
                    }
                    const float delayed = delayLine[static_cast<size_t>(readIndex)];
                    delayLine[static_cast<size_t>(writeIndex)] = wet;
                    wet = delayed;
                }

                wet *= returnGain;

                float output = wet;
                if (parallelMode) {
                    output = (dry * (1.0f - wetMix)) + (wet * wetMix);
                } else {
                    output = dry + ((wet - dry) * wetMix);
                }

                buffer.setSample(ch, sample, output);
            }

            if (loop.compensationSamples > 0 && delayLineLength > 1) {
                ++writeIndex;
                if (writeIndex >= delayLineLength) {
                    writeIndex = 0;
                }
            }
        }

        loop.delayWriteIndex = writeIndex;
    }
}

void Map2AudioEngine::audioCallback(const float* const* inputs, int numInputs,
                                    float* const* outputs, int numOutputs,
                                    int numSamples) {
    // Start CPU measurement
    cpuMonitor_.beginCallback();

    const int safeOutputChannels = std::max(0, numOutputs);
    const int safeInputChannels = std::max(0, numInputs);
    const int safeNumSamples = std::max(0, numSamples);
    const int callbackChannels = callbackBuffer_.getNumChannels();
    const int callbackCapacitySamples = callbackBuffer_.getNumSamples();

    if (callbackChannels <= 0 || callbackCapacitySamples <= 0 || safeNumSamples <= 0) {
        for (int ch = 0; ch < safeOutputChannels; ++ch) {
            if (outputs[ch] != nullptr) {
                std::fill_n(outputs[ch], safeNumSamples, 0.0f);
            }
        }
        cpuMonitor_.endCallback();
        return;
    }

    const int processSamples = std::min(safeNumSamples, callbackCapacitySamples);
    const int configuredChannels = std::max(1, numOutputChannels_);
    const int processChannels = std::max(1, std::min(callbackChannels, configuredChannels));
    const int copyInputChannels = std::min(safeInputChannels, processChannels);

    // Create a non-owning view sized to the current callback frame.
    juce::AudioBuffer<float> buffer(callbackBuffer_.getArrayOfWritePointers(),
                                    processChannels,
                                    processSamples);
    juce::MidiBuffer midiBuffer;

    if (inputChannelMode_ == InputChannelMode::Stereo) {
        // Copy input to buffer (overwrites all channels — no need to clear first)
        for (int ch = 0; ch < copyInputChannels; ++ch) {
            if (inputs[ch] != nullptr) {
                buffer.copyFrom(ch, 0, inputs[ch], processSamples);
            } else {
                buffer.clear(ch, 0, processSamples);  // Only clear if input is null
            }
        }
        // Clear any extra channels beyond input count
        for (int ch = copyInputChannels; ch < processChannels; ++ch) {
            buffer.clear(ch, 0, processSamples);
        }
    } else {
        const int sourceChannel = inputChannelMode_ == InputChannelMode::MonoRight ? 1 : 0;
        const int monoCopyChannels = std::min(processChannels, 2);
        const bool sourceAvailable = sourceChannel < safeInputChannels && inputs[sourceChannel] != nullptr;

        for (int ch = 0; ch < monoCopyChannels; ++ch) {
            if (sourceAvailable) {
                buffer.copyFrom(ch, 0, inputs[sourceChannel], processSamples);
            } else {
                buffer.clear(ch, 0, processSamples);
            }
        }
        for (int ch = monoCopyChannels; ch < processChannels; ++ch) {
            buffer.clear(ch, 0, processSamples);
        }
    }

    const float inputGainLinear = inputGainLinear_.load(std::memory_order_acquire);
    if (std::abs(inputGainLinear - 1.0f) > 0.0001f) {
        buffer.applyGain(inputGainLinear);
    }

    if (graphCrossfadeInputBuffer_.getNumChannels() >= processChannels
        && graphCrossfadeInputBuffer_.getNumSamples() >= processSamples) {
        for (int ch = 0; ch < processChannels; ++ch) {
            graphCrossfadeInputBuffer_.copyFrom(ch, 0, buffer, ch, 0, processSamples);
        }
    }

    // Pull pending MIDI events captured by MidiHandler thread.
    drainMidiEvents(midiBuffer, processSamples);

    // Process parameter updates from queue
    parameterBridge_.processQueue([this](const ParameterUpdate& update) {
        pluginHost_.setParameter(update.pluginId, update.paramIndex, update.value);
    });
    parameterBridge_.processSmoothingBlock(processSamples, [this](InstanceId pluginId, int paramIndex, float value) {
        pluginHost_.setParameter(pluginId, paramIndex, value);
    });

    // Instruments (SynthForge, DrumMachine) are now graph-managed via their
    // GraphAdapter wrappers — processed inside audioGraph_->process() below.

    // Pass raw hardware I/O pointers to Lexicon processor so it can
    // access S/PDIF channels during graph processing
    if (lexiconProcessor_) {
        lexiconProcessor_->setHardwareBuffers(inputs, outputs,
                                              numInputs, numOutputs);
    }

    // Process through plugin graph (includes automatic PDC)
    audioGraph_->process(buffer, midiBuffer);
    if (graphCrossfadeInputBuffer_.getNumChannels() >= processChannels
        && graphCrossfadeInputBuffer_.getNumSamples() >= processSamples) {
        juce::AudioBuffer<float> dryInputBuffer(
            graphCrossfadeInputBuffer_.getArrayOfWritePointers(),
            processChannels,
            processSamples);
        processIndependentGraphCrossfades(buffer, dryInputBuffer, processSamples);
    }
    processSpilloverChains(buffer, processSamples);
    processNativeSpillovers(buffer, processSamples);

    // Apply external loop insertions directly in callback path so
    // loop blend/crossfade/compensation is sample-accurate.
    processExternalLoopInsertions(buffer, processSamples);

#ifdef HAS_NAM
    // Process Neural Amp Modeler (before cabinet IR)
    namProcessor_.process(buffer);
#endif

    // Process modulation effects
    if (!pitchShifter_.isBypassed()) {
        pitchShifter_.process(buffer);   // Pitch shift first
    }
    if (!chorus_.isBypassed()) {
        chorus_.process(buffer);          // Then chorus
    }
    if (!phaser_.isBypassed()) {
        phaser_.process(buffer);          // Then phaser
    }
    if (!delay_.isBypassed() || delay_.getSpillover()) {
        delay_.process(buffer);           // Stereo delay with audible spillover tails
    }
    if (!intellifx_.isBypassed()) {
        intellifx_.process(buffer);       // IntelliFX 8-voice chorus
    }

    // FIX #2: Add the 7 missing processors that were never called
    // These are now wired into the signal chain
    if (!shoegaze_.isBypassed() || shoegaze_.hasSpillover()) {
        shoegaze_.process(buffer);        // ShoeGaze reverb/fuzz
    }
    if (!passionFX_.isBypassed()) {
        passionFX_.process(buffer);       // PassionFX multi-effect
    }
    if (!peavey5150_.isBypassed()) {
        peavey5150_.process(buffer);      // Peavey 5150 amp sim
    }
    if (!tweedBassman_.isBypassed()) {
        tweedBassman_.process(buffer);    // Tweed Bassman amp sim
    }
    if (!h3000_.isBypassed()) {
        h3000_.process(buffer);           // Ultra-Harmonizer reverb
    }
    if (bossXS1_.isActive()) {
        bossXS1_.process(buffer);         // Boss XS-1 multi-effect
    }
    if (!lexiLove_.isBypassed() || lexiLove_.hasSpillover()) {
        lexiLove_.process(buffer);        // Algorithmic reverb
    }

    // Process cabinet IR (if loaded)
    if (cabinetProcessor_.isIRLoaded()) {
        cabinetProcessor_.process(buffer);
    }

    // Process EQ
    eq_.process(buffer);

    // Process dynamics chain: Gate -> Compressor -> Limiter
    if (!gate_.isBypassed()) {
        gate_.process(buffer);
    }
    if (!compressor_.isBypassed()) {
        compressor_.process(buffer);
    }
    if (!limiter_.isBypassed()) {
        limiter_.process(buffer);
    }

    // Process reverb IR (if loaded) - at end of chain
    if (reverbProcessor_.isIRLoaded()) {
        reverbProcessor_.process(buffer);
    }

    applyTopologyTransitionFade(buffer, processSamples);

    const float outputGainLinear = outputGainLinear_.load(std::memory_order_acquire);
    if (std::abs(outputGainLinear - 1.0f) > 0.0001f) {
        buffer.applyGain(outputGainLinear);
    }

    // Keep the house mix on outputs 1/2 and mirror an isolated solo source
    // to the configured monitoring pair when one branch is soloed.
    int monitoringOutputStart = monitoringOutputIndex_.load(std::memory_order_acquire);
    if (monitoringOutputStart < 0 || monitoringOutputStart >= safeOutputChannels) {
        monitoringOutputStart = 0;
    }
    if (safeOutputChannels > 1) {
        monitoringOutputStart -= monitoringOutputStart % 2;
    } else {
        monitoringOutputStart = 0;
    }

    const int primaryOutputChannels = std::min(processChannels, std::min(safeOutputChannels, 2));
    for (int ch = 0; ch < safeOutputChannels; ++ch) {
        if (outputs[ch] != nullptr) {
            std::fill_n(outputs[ch], safeNumSamples, 0.0f);
        }
    }
    for (int ch = 0; ch < primaryOutputChannels; ++ch) {
        if (outputs[ch] != nullptr) {
            std::copy_n(buffer.getReadPointer(ch), processSamples, outputs[ch]);
            if (processSamples < safeNumSamples) {
                std::fill_n(outputs[ch] + processSamples, safeNumSamples - processSamples, 0.0f);
            }
        }
    }

    const bool monitoringPairOverlapsPrimary =
        monitoringOutputStart < primaryOutputChannels
        && (monitoringOutputStart + std::min(processChannels, 2)) > 0;
    if (!monitoringPairOverlapsPrimary
        && monitorBuffer_.getNumChannels() >= processChannels
        && monitorBuffer_.getNumSamples() >= processSamples) {
        juce::AudioBuffer<float> monitorBuffer(
            monitorBuffer_.getArrayOfWritePointers(),
            processChannels,
            processSamples);
        if (buildSoloMonitorMix(monitorBuffer, processSamples)) {
            if (std::abs(outputGainLinear - 1.0f) > 0.0001f) {
                monitorBuffer.applyGain(outputGainLinear);
            }
            const int availableMonitoringChannels = std::max(0, safeOutputChannels - monitoringOutputStart);
            const int monitorCopyChannels = std::min(processChannels, availableMonitoringChannels);
            for (int ch = 0; ch < monitorCopyChannels; ++ch) {
                const int outputIndex = monitoringOutputStart + ch;
                if (outputs[outputIndex] != nullptr) {
                    std::copy_n(monitorBuffer.getReadPointer(ch), processSamples, outputs[outputIndex]);
                    if (processSamples < safeNumSamples) {
                        std::fill_n(outputs[outputIndex] + processSamples, safeNumSamples - processSamples, 0.0f);
                    }
                }
            }
        }
    }

    // Push to metering thread (Option 3 - OFF audio thread)
    // This is minimal CPU in the audio callback
    pushMeteringData(buffer);

    // End CPU measurement
    cpuMonitor_.endCallback();
}

void Map2AudioEngine::enqueueMidiEvent(const MidiMessage& msg) {
    uint8_t status = 0;
    const int channel = std::clamp(msg.channel, 1, 16) - 1;
    uint8_t data1 = static_cast<uint8_t>(std::clamp(msg.data1, 0, 127));
    uint8_t data2 = static_cast<uint8_t>(std::clamp(msg.data2, 0, 127));

    switch (msg.type) {
        case MidiMessageType::NoteOn:
            status = static_cast<uint8_t>(0x90 | channel);
            break;
        case MidiMessageType::NoteOff:
            status = static_cast<uint8_t>(0x80 | channel);
            break;
        case MidiMessageType::ControlChange:
            status = static_cast<uint8_t>(0xB0 | channel);
            break;
        case MidiMessageType::ProgramChange:
            status = static_cast<uint8_t>(0xC0 | channel);
            data2 = 0;
            break;
        case MidiMessageType::ChannelPressure:
            status = static_cast<uint8_t>(0xD0 | channel);
            data2 = 0;
            break;
        default:
            return;
    }

    int start1, size1, start2, size2;
    midiFifo_.prepareToWrite(1, start1, size1, start2, size2);
    if (size1 <= 0) {
        return;
    }

    auto& slot = midiRing_[static_cast<size_t>(start1)];
    slot.status = status;
    slot.data1 = data1;
    slot.data2 = data2;
    slot.sampleOffset = 0;
    midiFifo_.finishedWrite(1);
    midiDataReady_.store(true, std::memory_order_release);
}

void Map2AudioEngine::drainMidiEvents(juce::MidiBuffer& midiBuffer, int numSamples) {
    if (!midiDataReady_.load(std::memory_order_acquire) && midiFifo_.getNumReady() <= 0) {
        return;
    }

    const int ready = midiFifo_.getNumReady();
    if (ready <= 0) {
        midiDataReady_.store(false, std::memory_order_release);
        return;
    }

    int start1, size1, start2, size2;
    midiFifo_.prepareToRead(ready, start1, size1, start2, size2);

    auto appendEvent = [&](const QueuedMidiEvent& event) {
        const uint8_t op = static_cast<uint8_t>(event.status & 0xF0);
        const int channel = static_cast<int>(event.status & 0x0F) + 1;
        const int offset = std::clamp(event.sampleOffset, 0, std::max(0, numSamples - 1));
        if (op == 0xB0) {
            applySnapshotExpressionControlChange(channel, static_cast<int>(event.data1), static_cast<int>(event.data2));
        }
        if (op == 0xC0 || op == 0xD0) {
            midiBuffer.addEvent(juce::MidiMessage(event.status, event.data1), offset);
        } else {
            midiBuffer.addEvent(juce::MidiMessage(event.status, event.data1, event.data2), offset);
        }
    };

    for (int i = 0; i < size1; ++i) {
        appendEvent(midiRing_[static_cast<size_t>(start1 + i)]);
    }
    for (int i = 0; i < size2; ++i) {
        appendEvent(midiRing_[static_cast<size_t>(start2 + i)]);
    }

    midiFifo_.finishedRead(size1 + size2);
    if (midiFifo_.getNumReady() <= 0) {
        midiDataReady_.store(false, std::memory_order_release);
    }
}

void Map2AudioEngine::sendDrumSequencerMidiEvent(const drummachine::DrumSequencer::MidiOutputEvent& event) {
    MidiMessage msg;
    msg.channel = std::clamp(event.channel, 0, 15);
    msg.data1 = std::clamp(event.data1, 0, 127);
    msg.data2 = std::clamp(event.data2, 0, 127);
    msg.timestamp = 0.0;

    switch (event.type) {
        case drummachine::DrumSequencer::MidiOutputEventType::NoteOn:
            msg.type = MidiMessageType::NoteOn;
            break;
        case drummachine::DrumSequencer::MidiOutputEventType::NoteOff:
            msg.type = MidiMessageType::NoteOff;
            break;
        case drummachine::DrumSequencer::MidiOutputEventType::Clock:
            msg.type = MidiMessageType::Clock;
            msg.data1 = 0;
            msg.data2 = 0;
            break;
        case drummachine::DrumSequencer::MidiOutputEventType::Start:
            msg.type = MidiMessageType::Start;
            msg.data1 = 0;
            msg.data2 = 0;
            break;
        case drummachine::DrumSequencer::MidiOutputEventType::Stop:
            msg.type = MidiMessageType::Stop;
            msg.data1 = 0;
            msg.data2 = 0;
            break;
        case drummachine::DrumSequencer::MidiOutputEventType::Continue:
            msg.type = MidiMessageType::Continue;
            msg.data1 = 0;
            msg.data2 = 0;
            break;
    }

    midiHandler_.sendMessage(msg);
}

void Map2AudioEngine::applySnapshotExpressionControlChange(int midiChannel, int cc, int value) {
    const auto mappings = std::atomic_load(&snapshotExpressionMappings_);
    if (mappings == nullptr || mappings->empty()) {
        return;
    }

    for (const auto& mapping : *mappings) {
        if (!snapshotExpressionBool(mapping, "active", true)) {
            continue;
        }
        if (snapshotExpressionInt(mapping, "cc", -1) != cc) {
            continue;
        }

        const int configuredChannel = snapshotExpressionInt(mapping, "channel", 0);
        if (configuredChannel > 0 && configuredChannel != midiChannel) {
            continue;
        }

        const int ccMin = std::clamp(snapshotExpressionInt(mapping, "cc_min", 0), 0, 127);
        const int ccMax = std::clamp(snapshotExpressionInt(mapping, "cc_max", 127), 0, 127);
        const int lo = std::min(ccMin, ccMax);
        const int hi = std::max(ccMin, ccMax);
        if (hi <= lo) {
            continue;
        }

        const float normalized = clamp01(
            (static_cast<float>(value) - static_cast<float>(lo))
            / static_cast<float>(hi - lo));
        const auto* customCurve = findSnapshotExpressionValue(mapping, "custom_curve");
        const float curved = applySnapshotExpressionCurve(
            normalized,
            snapshotExpressionString(mapping, "curve", "linear"),
            customCurve != nullptr ? *customCurve : juce::var());
        const float outMin = snapshotExpressionFloat(mapping, "out_min", 0.0f);
        const float outMax = snapshotExpressionFloat(mapping, "out_max", 1.0f);
        const float mappedValue = outMin + ((outMax - outMin) * curved);
        (void)applySnapshotExpressionMappedValue(mapping, mappedValue);
    }
}

bool Map2AudioEngine::applySnapshotExpressionMappedValue(
    const std::map<std::string, juce::var>& mapping,
    float value) {
    const InstanceId targetPlugin = static_cast<InstanceId>(
        snapshotExpressionInt(mapping, "target_plugin", INVALID_INSTANCE_ID));
    const int paramIndex = snapshotExpressionInt(mapping, "param_index", -1);
    const std::string parameterSymbol = snapshotExpressionString(mapping, "parameter_symbol");

    if (targetPlugin != INVALID_INSTANCE_ID && targetPlugin > 0) {
        if (paramIndex >= 0) {
            return pluginHost_.setParameter(targetPlugin, paramIndex, value);
        }
        if (!parameterSymbol.empty()) {
            return pluginHost_.setParameterByName(targetPlugin, parameterSymbol, value);
        }
    }

    const std::string paramId = snapshotExpressionString(mapping, "param_id");
    if (paramId == "engine.reverb_mix") {
        setReverbMix(clamp01(value));
        return true;
    }
    if (paramId == "engine.delay_mix") {
        setDelayMix(clamp01(value));
        setPassionFXDelayMix(clamp01(value));
        return true;
    }
    if (paramId == "engine.chorus_mix") {
        setChorusMix(clamp01(value));
        setPassionFXChorusMix(clamp01(value));
        return true;
    }
    if (paramId == "engine.wah_freq") {
        setPassionFXWahEnabled(true);
        setPassionFXWahPosition(clamp01((value - 200.0f) / 3800.0f));
        return true;
    }
    if (paramId == "engine.gate_thresh") {
        setGateThreshold(value);
        setPassionFXGateThreshold(value);
        return true;
    }
    if (paramId == "engine.comp_thresh") {
        setCompressorThreshold(value);
        setPassionFXCompThreshold(value);
        return true;
    }
    if (paramId == "engine.pitch_shift") {
        setPitchShifterPitchL(value * 100.0f);
        setPitchShifterPitchR(value * 100.0f);
        return true;
    }
    if (paramId == "engine.nam_level") {
        setNAMOutputGain(value);
        return true;
    }
    if (paramId == "engine.cab_mix") {
        setCabinetMix(clamp01(value));
        return true;
    }

    return false;
}

float Map2AudioEngine::applySnapshotExpressionCurve(
    float normalized,
    const std::string& curveName,
    const juce::var& customCurve) {
    const float t = clamp01(normalized);
    const std::string normalizedCurve = normalizeExpressionCurveName(curveName);
    if (normalizedCurve == "custom") {
        return sampleCustomExpressionCurve(t, customCurve);
    }
    if (normalizedCurve == "log") {
        return t * t;
    }
    if (normalizedCurve == "exp") {
        return std::sqrt(t);
    }
    if (normalizedCurve == "scurve") {
        return t * t * (3.0f - (2.0f * t));
    }
    return t;
}

// ========================================
// Configuration
// ========================================

void Map2AudioEngine::setSampleRate(double rate) {
    sampleRate_ = rate;
    if (initialized_) {
        // RT-SAFE FIX: Stop audio before changing sample rate
        // Sample rate changes can trigger buffer reallocations in processors
        bool wasRunning = audioRunning_.load(std::memory_order_acquire);

        if (wasRunning) {
            std::cout << "Stopping audio for safe sample rate change..." << std::endl;
            stopAudio();
        }

        // Now safe to reconfigure (no RT thread active)
        audioIO_.setSampleRate(rate);
        audioGraph_->setSampleRate(rate);

        // Re-prepare all processors with new sample rate
        prepareAllProcessors(rate, bufferSize_, 2);

        // Restart audio if it was running
        if (wasRunning) {
            std::cout << "Restarting audio with new sample rate: " << rate << " Hz" << std::endl;
            startAudio();
        }
    }
}

void Map2AudioEngine::setBufferSize(int size) {
    bufferSize_ = size;
    if (initialized_) {
        // RT-SAFE FIX: Stop audio before reallocating buffers to prevent RT thread allocation
        // Buffer reallocation can trigger heap allocation → xruns/page faults
        bool wasRunning = audioRunning_.load(std::memory_order_acquire);

        if (wasRunning) {
            std::cout << "Stopping audio for safe buffer resize..." << std::endl;
            stopAudio();
        }

        // Now safe to reallocate (no RT thread active)
        audioIO_.setBufferSize(size);
        audioGraph_->setBufferSize(size);
        callbackBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                false, false, true);
        spilloverBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                 false, false, true);
        monitorBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                               false, false, true);
        graphCrossfadeInputBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                           false, false, true);
        graphCrossfadeOldBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                         false, false, true);
        graphCrossfadeNewBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                         false, false, true);
        topologyTransitionReferenceBuffer_.setSize(numOutputChannels_, std::max(size, MAX_AUDIO_BUFFER_SIZE),
                                                   false, false, true);
        topologyTransitionReferenceBuffer_.clear();

        // Re-prepare all processors with new buffer size
        prepareAllProcessors(sampleRate_, size, 2);

        // Restart audio if it was running
        if (wasRunning) {
            std::cout << "Restarting audio with new buffer size: " << size << std::endl;
            startAudio();
        }
    }
}

// Fix #4: Unified processor preparation to avoid redundant calls
void Map2AudioEngine::prepareAllProcessors(double sampleRate, int bufferSize, int numChannels) {
    // Prepare all processors in optimal order
    // This reduces redundant initialization overhead
    spectrumAnalyzer_.prepare(sampleRate);
    lufsMeter_.prepare(sampleRate, numChannels);
    phaseCorrelation_.prepare(sampleRate);
    cpuMonitor_.prepare(sampleRate, bufferSize);
    
    // Convolution processors
    cabinetProcessor_.prepare(sampleRate, bufferSize, numChannels);
    reverbProcessor_.prepare(sampleRate, bufferSize, numChannels);
    
    // Dynamics chain
    compressor_.prepare(sampleRate, bufferSize, numChannels);
    limiter_.prepare(sampleRate, bufferSize, numChannels);
    gate_.prepare(sampleRate, bufferSize, numChannels);
    
    // EQ
    eq_.prepare(sampleRate, bufferSize, numChannels);
    
#ifdef HAS_NAM
    namProcessor_.prepare(sampleRate, bufferSize);
#endif
    
    // Modulation effects
    chorus_.prepare(sampleRate, bufferSize, numChannels);
    phaser_.prepare(sampleRate, bufferSize, numChannels);
    pitchShifter_.prepare(sampleRate, bufferSize, numChannels);
    delay_.prepare(sampleRate, bufferSize, numChannels);
    intellifx_.prepare(sampleRate, bufferSize, numChannels);
    
    // FIX #4: Prepare the 7 missing processors (were never re-prepared on config change)
    shoegaze_.prepare(sampleRate, bufferSize, numChannels);
    passionFX_.prepare(sampleRate, bufferSize, numChannels);
    peavey5150_.prepare(sampleRate, bufferSize, numChannels);
    tweedBassman_.prepare(sampleRate, bufferSize, numChannels);
    h3000_.prepare(sampleRate, bufferSize, numChannels);
    bossXS1_.prepare(sampleRate, bufferSize, numChannels);
    lexiLove_.prepare(sampleRate, bufferSize, numChannels);
    // Re-prepare instrument graph adapters (they delegate to inner processors)
    if (synthForgeAdapter_)
        synthForgeAdapter_->prepareToPlay(sampleRate, bufferSize);
    if (drumMachineAdapter_)
        drumMachineAdapter_->prepareToPlay(sampleRate, bufferSize);
}

void Map2AudioEngine::setAudioDevice(const std::string& device) {
    audioDevice_ = device;
    if (initialized_) {
        audioIO_.setDevice(device);
    }
}

void Map2AudioEngine::setLv2Path(const std::string& path) {
    lv2Path_ = path;
}

void Map2AudioEngine::setNumInputChannels(int channels) {
    numInputChannels_ = std::max(1, std::min(channels, 32));  // Clamp to 1-32
}

void Map2AudioEngine::setNumOutputChannels(int channels) {
    numOutputChannels_ = std::max(1, std::min(channels, 32));  // Clamp to 1-32
}

void Map2AudioEngine::setInputChannelMode(int mode) {
    switch (mode) {
        case 0:
            inputChannelMode_ = InputChannelMode::MonoLeft;
            break;
        case 1:
            inputChannelMode_ = InputChannelMode::MonoRight;
            break;
        default:
            inputChannelMode_ = InputChannelMode::Stereo;
            break;
    }
}

bool Map2AudioEngine::setInputGainDb(float db) {
    const float normalizedDb = std::clamp(db, -24.0f, 24.0f);
    inputGainDb_.store(normalizedDb, std::memory_order_release);
    inputGainLinear_.store(juce::Decibels::decibelsToGain(normalizedDb), std::memory_order_release);
    return true;
}

bool Map2AudioEngine::setOutputGainDb(float db) {
    const float normalizedDb = std::clamp(db, -24.0f, 24.0f);
    outputGainDb_.store(normalizedDb, std::memory_order_release);
    outputGainLinear_.store(juce::Decibels::decibelsToGain(normalizedDb), std::memory_order_release);
    return true;
}

bool Map2AudioEngine::setMonitoringOutputIndex(int index) {
    int maxStartIndex = std::max(0, numOutputChannels_ - 1);
    if (auto currentDevice = audioIO_.getCurrentDevice(); currentDevice.outputChannels > 0) {
        maxStartIndex = std::max(0, currentDevice.outputChannels - 1);
    }

    int normalizedIndex = std::clamp(index, 0, maxStartIndex);
    if (maxStartIndex > 0) {
        normalizedIndex -= normalizedIndex % 2;
    } else {
        normalizedIndex = 0;
    }

    monitoringOutputIndex_.store(normalizedIndex, std::memory_order_release);
    return true;
}

int Map2AudioEngine::getMonitoringOutputIndex() const {
    return monitoringOutputIndex_.load(std::memory_order_acquire);
}

// ========================================
// Plugin Management
// ========================================

std::vector<PluginInfo> Map2AudioEngine::listPlugins() const {
    return pluginHost_.discoverPlugins(PluginFormat::All);
}

std::vector<PluginInfo> Map2AudioEngine::listPlugins(PluginFormat format) const {
    return pluginHost_.discoverPlugins(format);
}

std::optional<PluginInfo> Map2AudioEngine::getPluginInfo(const std::string& uri) const {
    return pluginHost_.getPluginInfo(uri);
}

InstanceId Map2AudioEngine::loadPlugin(const std::string& uri) {
    // Loading and placement are intentionally separate operations.
    // Callers must explicitly place loaded plugins via addToChain/addToParallelBranch.
    const InstanceId instanceId = pluginHost_.loadPlugin(uri, sampleRate_, bufferSize_);
    if (instanceId == INVALID_INSTANCE_ID) {
        return INVALID_INSTANCE_ID;
    }

    if (auto* processor = pluginHost_.getProcessor(instanceId)) {
        auto& params = processor->getParameters();
        for (int i = 0; i < params.size(); ++i) {
            const std::string name = params[i]->getName(256).toStdString();
            parameterBridge_.registerParameter(instanceId, i, name, params[i]->getValue());
            if (auto* paramWithID = dynamic_cast<juce::AudioProcessorParameterWithID*>(params[i])) {
                const std::string paramId = paramWithID->paramID.toStdString();
                if (!paramId.empty() && paramId != name) {
                    parameterBridge_.registerParameter(instanceId, i, paramId, params[i]->getValue());
                }
            }
        }
    }

    return instanceId;
}

bool Map2AudioEngine::unloadPlugin(InstanceId instanceId) {
    audioGraph_->removePlugin(instanceId);
    audioGraph_->removeDetachedPluginNode(instanceId);
    cpuMonitor_.removePlugin(instanceId);
    parameterBridge_.unregisterPlugin(instanceId);

    const bool unloaded = pluginHost_.unloadPlugin(instanceId);
    if (unloaded) {
        if (instanceId == lexiconInstanceId_) {
            lexiconProcessor_ = nullptr;
            lexiconInstanceId_ = INVALID_INSTANCE_ID;
        } else if (instanceId == synthForgeInstanceId_) {
            synthForgeAdapter_ = nullptr;
            synthForgeInstanceId_ = INVALID_INSTANCE_ID;
        } else if (instanceId == drumMachineInstanceId_) {
            drumMachineAdapter_ = nullptr;
            drumMachineInstanceId_ = INVALID_INSTANCE_ID;
        }
    }

    return unloaded;
}

void Map2AudioEngine::scanForPlugins(bool rescanAll) {
    pluginHost_.scanForPlugins(rescanAll);
}

// ========================================
// Chain Management
// ========================================

std::vector<InstanceId> Map2AudioEngine::getChainOrder() const {
    return audioGraph_->getChainOrder();
}

void Map2AudioEngine::clearChain() {
    clearAllSpilloverChains();
    clearIndependentGraphCrossfades();
    audioGraph_->clearChain();
}

bool Map2AudioEngine::replaceChain(const std::vector<InstanceId>& order) {
    cleanupExpiredSpilloverChains();
    return audioGraph_->replaceChain(order);
}

bool Map2AudioEngine::replaceChainWithSpillover(const std::vector<InstanceId>& order) {
    cleanupExpiredSpilloverChains();

    auto spillover = buildSpilloverChainFromCurrentOrder(order);
    const bool replaced = audioGraph_->replaceChain(order);
    if (!replaced) {
        if (spillover) {
            for (const auto instanceId : spillover->instanceIds) {
                pluginHost_.unloadPlugin(instanceId);
            }
        }
        return false;
    }

    if (spillover) {
        std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
        spilloverChains_.push_back(std::move(spillover));
    }

    return true;
}

bool Map2AudioEngine::addToChain(InstanceId instanceId, int position) {
    return audioGraph_->addPlugin(instanceId, position);
}

bool Map2AudioEngine::removeFromChain(InstanceId instanceId) {
    return audioGraph_->removePlugin(instanceId);
}

bool Map2AudioEngine::reorderChain(const std::vector<InstanceId>& order) {
    return audioGraph_->reorderPlugins(order);
}

bool Map2AudioEngine::prewarmPluginNode(InstanceId instanceId) {
    return audioGraph_->prewarmPluginNode(instanceId);
}

bool Map2AudioEngine::applyRoutingTopology(const JuceAudioGraph::RoutingTopologySpec& spec) {
    cleanupExpiredIndependentGraphCrossfades();
    cleanupExpiredSpilloverChains();
    const bool applied = audioGraph_->applyRoutingTopology(spec);
    if (!applied) {
        return false;
    }

    const int transitionSamples = std::max(
        1,
        std::min(
            std::max(bufferSize_, 1),
            static_cast<int>(std::ceil(sampleRate_ * 0.010))));
    topologyTransitionTotalSamples_.store(transitionSamples, std::memory_order_release);
    topologyTransitionSamplesRemaining_.store(transitionSamples, std::memory_order_release);
    return true;
}

bool Map2AudioEngine::replaceSnapshotExpressionMappings(
    const std::vector<std::map<std::string, juce::var>>& entries) {
    std::shared_ptr<const std::vector<std::map<std::string, juce::var>>> normalizedEntries =
        std::make_shared<std::vector<std::map<std::string, juce::var>>>(entries);
    std::atomic_store(&snapshotExpressionMappings_, std::move(normalizedEntries));
    return true;
}

bool Map2AudioEngine::triggerParallelABSwitch(int groupId, int branchIndex) {
    return audioGraph_->triggerParallelABSwitch(groupId, branchIndex);
}

bool Map2AudioEngine::copyParallelBranchTap(
    int groupId,
    int branchIndex,
    juce::AudioBuffer<float>& dest,
    int numSamples
) const {
    return audioGraph_->copyParallelBranchTap(groupId, branchIndex, dest, numSamples);
}

std::vector<Map2AudioEngine::SpilloverChainState> Map2AudioEngine::getSpilloverChainStates() const {
    std::vector<SpilloverChainState> result;
    std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
    result.reserve(spilloverChains_.size());
    for (const auto& chain : spilloverChains_) {
        if (!chain) {
            continue;
        }
        SpilloverChainState state;
        state.id = chain->id;
        state.instanceIds = chain->instanceIds;
        state.remainingSamples = chain->remainingSamples.load(std::memory_order_relaxed);
        state.expired = chain->expired.load(std::memory_order_relaxed);
        state.estimatedTailSeconds = chain->estimatedTailSeconds;
        result.push_back(std::move(state));
    }
    return result;
}

int Map2AudioEngine::getIndependentGraphCrossfadeCount() const {
    std::lock_guard<std::mutex> lock(graphCrossfadeMutex_);
    return static_cast<int>(independentGraphCrossfades_.size());
}

void Map2AudioEngine::cleanupExpiredSpilloverChains() {
    std::vector<std::shared_ptr<SpilloverChain>> expiredChains;
    {
        std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
        auto it = std::remove_if(
            spilloverChains_.begin(),
            spilloverChains_.end(),
            [&expiredChains](const std::shared_ptr<SpilloverChain>& chain) {
                if (!chain) {
                    return true;
                }
                const bool expired = chain->expired.load(std::memory_order_relaxed)
                    || chain->remainingSamples.load(std::memory_order_relaxed) <= 0;
                if (expired) {
                    expiredChains.push_back(chain);
                }
                return expired;
            });
        spilloverChains_.erase(it, spilloverChains_.end());
    }

    for (const auto& chain : expiredChains) {
        for (const auto instanceId : chain->instanceIds) {
            pluginHost_.unloadPlugin(instanceId);
        }
    }
}

void Map2AudioEngine::clearAllSpilloverChains() {
    std::vector<std::shared_ptr<SpilloverChain>> chains;
    {
        std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
        chains.swap(spilloverChains_);
    }

    for (const auto& chain : chains) {
        if (!chain) {
            continue;
        }
        chain->expired.store(true, std::memory_order_relaxed);
        for (const auto instanceId : chain->instanceIds) {
            pluginHost_.unloadPlugin(instanceId);
        }
    }
}

void Map2AudioEngine::processSpilloverChains(juce::AudioBuffer<float>& buffer, int numSamples) {
    std::vector<std::shared_ptr<SpilloverChain>> chains;
    {
        std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
        chains = spilloverChains_;
    }

    if (chains.empty()) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    if (spilloverBuffer_.getNumChannels() < numChannels || spilloverBuffer_.getNumSamples() < numSamples) {
        return;
    }

    juce::MidiBuffer spilloverMidi;
    for (const auto& chain : chains) {
        if (!chain) {
            continue;
        }
        if (chain->expired.load(std::memory_order_relaxed) || chain->remainingSamples.load(std::memory_order_relaxed) <= 0) {
            chain->expired.store(true, std::memory_order_relaxed);
            continue;
        }

        juce::AudioBuffer<float> spilloverBuffer(
            spilloverBuffer_.getArrayOfWritePointers(),
            numChannels,
            numSamples);
        spilloverBuffer.clear();
        spilloverMidi.clear();

        for (const auto instanceId : chain->instanceIds) {
            pluginHost_.process(instanceId, spilloverBuffer, spilloverMidi);
        }

        for (int ch = 0; ch < numChannels; ++ch) {
            buffer.addFrom(ch, 0, spilloverBuffer, ch, 0, numSamples);
        }

        const auto remaining = chain->remainingSamples.fetch_sub(numSamples, std::memory_order_relaxed) - numSamples;
        if (remaining <= 0) {
            chain->expired.store(true, std::memory_order_relaxed);
        }
    }
}

void Map2AudioEngine::cleanupExpiredIndependentGraphCrossfades() {
    std::vector<std::shared_ptr<IndependentGraphCrossfade>> expiredCrossfades;
    {
        std::lock_guard<std::mutex> lock(graphCrossfadeMutex_);
        auto it = std::remove_if(
            independentGraphCrossfades_.begin(),
            independentGraphCrossfades_.end(),
            [&expiredCrossfades](const std::shared_ptr<IndependentGraphCrossfade>& crossfade) {
                if (!crossfade) {
                    return true;
                }
                const bool expired = crossfade->expired.load(std::memory_order_relaxed)
                    || crossfade->remainingSamples.load(std::memory_order_relaxed) <= 0;
                if (expired) {
                    expiredCrossfades.push_back(crossfade);
                }
                return expired;
            });
        independentGraphCrossfades_.erase(it, independentGraphCrossfades_.end());
    }

    for (const auto& crossfade : expiredCrossfades) {
        for (const auto instanceId : crossfade->instanceIds) {
            pluginHost_.unloadPlugin(instanceId);
        }
    }
}

void Map2AudioEngine::clearIndependentGraphCrossfades() {
    std::vector<std::shared_ptr<IndependentGraphCrossfade>> crossfades;
    {
        std::lock_guard<std::mutex> lock(graphCrossfadeMutex_);
        crossfades.swap(independentGraphCrossfades_);
    }

    for (const auto& crossfade : crossfades) {
        if (!crossfade) {
            continue;
        }
        crossfade->expired.store(true, std::memory_order_relaxed);
        for (const auto instanceId : crossfade->instanceIds) {
            pluginHost_.unloadPlugin(instanceId);
        }
    }
}

void Map2AudioEngine::processIndependentGraphCrossfades(
    juce::AudioBuffer<float>& buffer,
    const juce::AudioBuffer<float>& dryInputBuffer,
    int numSamples) {
    std::vector<std::shared_ptr<IndependentGraphCrossfade>> crossfades;
    {
        std::lock_guard<std::mutex> lock(graphCrossfadeMutex_);
        crossfades = independentGraphCrossfades_;
    }

    if (crossfades.empty()) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    if (graphCrossfadeOldBuffer_.getNumChannels() < numChannels
        || graphCrossfadeOldBuffer_.getNumSamples() < numSamples
        || graphCrossfadeNewBuffer_.getNumChannels() < numChannels
        || graphCrossfadeNewBuffer_.getNumSamples() < numSamples) {
        return;
    }

    juce::MidiBuffer crossfadeMidi;
    for (const auto& crossfade : crossfades) {
        if (!crossfade) {
            continue;
        }
        if (crossfade->expired.load(std::memory_order_relaxed)
            || crossfade->remainingSamples.load(std::memory_order_relaxed) <= 0
            || crossfade->totalSamples <= 0) {
            crossfade->expired.store(true, std::memory_order_relaxed);
            continue;
        }

        juce::AudioBuffer<float> oldBuffer(
            graphCrossfadeOldBuffer_.getArrayOfWritePointers(),
            numChannels,
            numSamples);
        juce::AudioBuffer<float> newBuffer(
            graphCrossfadeNewBuffer_.getArrayOfWritePointers(),
            numChannels,
            numSamples);
        oldBuffer.clear();
        newBuffer.clear();
        crossfadeMidi.clear();

        for (int ch = 0; ch < numChannels; ++ch) {
            oldBuffer.copyFrom(ch, 0, dryInputBuffer, ch, 0, numSamples);
            newBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
        }

        for (const auto instanceId : crossfade->instanceIds) {
            pluginHost_.process(instanceId, oldBuffer, crossfadeMidi);
        }

        const auto processedStart = crossfade->processedSamples.load(std::memory_order_relaxed);
        for (int sample = 0; sample < numSamples; ++sample) {
            const auto processed = static_cast<double>(processedStart + sample);
            const auto progress = juce::jlimit(0.0, 1.0, processed / static_cast<double>(crossfade->totalSamples));
            const auto oldGain = std::cos(progress * juce::MathConstants<double>::halfPi);
            const auto newGain = std::sin(progress * juce::MathConstants<double>::halfPi);
            for (int ch = 0; ch < numChannels; ++ch) {
                buffer.setSample(
                    ch,
                    sample,
                    static_cast<float>(
                        (oldBuffer.getSample(ch, sample) * oldGain)
                        + (newBuffer.getSample(ch, sample) * newGain)));
            }
        }

        const auto remaining =
            crossfade->remainingSamples.fetch_sub(numSamples, std::memory_order_relaxed) - numSamples;
        crossfade->processedSamples.fetch_add(numSamples, std::memory_order_relaxed);
        if (remaining <= 0) {
            crossfade->expired.store(true, std::memory_order_relaxed);
        }
    }

    cleanupExpiredIndependentGraphCrossfades();
}

void Map2AudioEngine::applyTopologyTransitionFade(juce::AudioBuffer<float>& buffer, int numSamples) {
    const int transitionTotal = topologyTransitionTotalSamples_.load(std::memory_order_acquire);
    int remaining = topologyTransitionSamplesRemaining_.load(std::memory_order_acquire);
    if (transitionTotal <= 0 || remaining <= 0) {
        const int captureChannels =
            std::min(buffer.getNumChannels(), topologyTransitionReferenceBuffer_.getNumChannels());
        const int captureSamples =
            std::min(numSamples, topologyTransitionReferenceBuffer_.getNumSamples());
        for (int ch = 0; ch < captureChannels; ++ch) {
            topologyTransitionReferenceBuffer_.copyFrom(ch, 0, buffer, ch, 0, captureSamples);
        }
        return;
    }

    const int captureChannels =
        std::min(buffer.getNumChannels(), topologyTransitionReferenceBuffer_.getNumChannels());
    const int captureSamples =
        std::min(numSamples, topologyTransitionReferenceBuffer_.getNumSamples());
    const int processedStart = std::max(0, transitionTotal - remaining);
    for (int sample = 0; sample < captureSamples; ++sample) {
        const double progress = juce::jlimit(
            0.0,
            1.0,
            static_cast<double>(processedStart + sample) / static_cast<double>(transitionTotal));
        const float oldGain =
            static_cast<float>(std::cos(progress * juce::MathConstants<double>::halfPi));
        const float newGain =
            static_cast<float>(std::sin(progress * juce::MathConstants<double>::halfPi));
        for (int ch = 0; ch < captureChannels; ++ch) {
            const float previous = topologyTransitionReferenceBuffer_.getSample(ch, sample);
            const float current = buffer.getSample(ch, sample);
            buffer.setSample(ch, sample, (previous * oldGain) + (current * newGain));
        }
    }

    for (int ch = 0; ch < captureChannels; ++ch) {
        topologyTransitionReferenceBuffer_.copyFrom(ch, 0, buffer, ch, 0, captureSamples);
    }

    remaining = std::max(0, remaining - numSamples);
    topologyTransitionSamplesRemaining_.store(remaining, std::memory_order_release);
    if (remaining == 0) {
        topologyTransitionTotalSamples_.store(0, std::memory_order_release);
    }
}

bool Map2AudioEngine::buildSoloMonitorMix(juce::AudioBuffer<float>& dest, int numSamples) {
    if (dest.getNumChannels() <= 0 || dest.getNumSamples() < numSamples || numSamples <= 0) {
        return false;
    }

    std::map<int, bool> soloStates;
    {
        std::lock_guard<std::mutex> guard(chainStateMutex_);
        soloStates = chainSoloState_;
    }

    const bool hasSolo = std::any_of(
        soloStates.begin(),
        soloStates.end(),
        [](const auto& entry) { return entry.second; });
    if (!hasSolo) {
        dest.clear();
        return false;
    }

    const auto groups = audioGraph_->getParallelGroups();
    for (const auto& group : groups) {
        for (size_t branchIndex = 0; branchIndex < group.branchChainIds.size(); ++branchIndex) {
            const int chainId = group.branchChainIds[branchIndex];
            auto soloIt = soloStates.find(chainId);
            if (soloIt == soloStates.end() || !soloIt->second) {
                continue;
            }
            if (audioGraph_->copyParallelBranchTap(group.id, static_cast<int>(branchIndex), dest, numSamples)) {
                return true;
            }
        }
    }

    dest.clear();
    return false;
}

bool Map2AudioEngine::replaceChainWithIndependentGraphCrossfade(
    const std::vector<InstanceId>& order,
    int maxCrossfadeMs) {
    cleanupExpiredIndependentGraphCrossfades();

    auto crossfade = buildIndependentGraphCrossfadeFromCurrentOrder(maxCrossfadeMs);
    const bool replaced = audioGraph_->replaceChain(order);
    if (!replaced) {
        if (crossfade) {
            for (const auto instanceId : crossfade->instanceIds) {
                pluginHost_.unloadPlugin(instanceId);
            }
        }
        return false;
    }

    if (crossfade) {
        std::lock_guard<std::mutex> lock(graphCrossfadeMutex_);
        independentGraphCrossfades_.push_back(std::move(crossfade));
    }

    return true;
}

std::shared_ptr<Map2AudioEngine::IndependentGraphCrossfade>
Map2AudioEngine::buildIndependentGraphCrossfadeFromCurrentOrder(int maxCrossfadeMs) {
    const auto currentOrder = audioGraph_->getChainOrder();
    if (currentOrder.empty()) {
        return {};
    }

    const auto clampedCrossfadeMs = std::clamp(maxCrossfadeMs, 1, 500);
    const auto totalSamples = static_cast<int64_t>(std::ceil((clampedCrossfadeMs * 0.001) * sampleRate_));
    if (totalSamples <= 0) {
        return {};
    }

    auto crossfade = std::make_shared<IndependentGraphCrossfade>();
    crossfade->id = nextIndependentGraphCrossfadeId_++;
    crossfade->totalSamples = totalSamples;
    crossfade->remainingSamples.store(totalSamples, std::memory_order_relaxed);
    crossfade->processedSamples.store(0, std::memory_order_relaxed);
    crossfade->expired.store(false, std::memory_order_relaxed);

    for (const auto instanceId : currentOrder) {
        const auto cloneId = clonePluginInstanceForSpillover(instanceId);
        if (!cloneId.has_value()) {
            for (const auto loadedId : crossfade->instanceIds) {
                pluginHost_.unloadPlugin(loadedId);
            }
            return {};
        }
        crossfade->instanceIds.push_back(*cloneId);
    }

    if (crossfade->instanceIds.empty()) {
        return {};
    }

    return crossfade;
}

void Map2AudioEngine::cleanupExpiredNativeSpillovers() {
    std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
    auto eraseExpired = [](auto& spillovers) {
        spillovers.erase(
            std::remove_if(
                spillovers.begin(),
                spillovers.end(),
                [](const auto& spillover) {
                    return !spillover
                        || spillover->expired.load(std::memory_order_relaxed)
                        || spillover->remainingSamples.load(std::memory_order_relaxed) <= 0
                        || spillover->processor == nullptr;
                }),
            spillovers.end());
    };
    eraseExpired(delaySpillovers_);
    eraseExpired(shoegazeSpillovers_);
    eraseExpired(lexiLoveSpillovers_);
}

void Map2AudioEngine::clearAllNativeSpillovers() {
    std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
    auto clearList = [](auto& spillovers) {
        for (const auto& spillover : spillovers) {
            if (spillover) {
                spillover->expired.store(true, std::memory_order_relaxed);
            }
        }
        spillovers.clear();
    };
    clearList(delaySpillovers_);
    clearList(shoegazeSpillovers_);
    clearList(lexiLoveSpillovers_);
}

void Map2AudioEngine::processNativeSpillovers(juce::AudioBuffer<float>& buffer, int numSamples) {
    std::vector<std::shared_ptr<DelaySpilloverState>> delaySpillovers;
    std::vector<std::shared_ptr<ShoeGazeSpilloverState>> shoegazeSpillovers;
    std::vector<std::shared_ptr<LexiLoveSpilloverState>> lexiLoveSpillovers;
    {
        std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
        delaySpillovers = delaySpillovers_;
        shoegazeSpillovers = shoegazeSpillovers_;
        lexiLoveSpillovers = lexiLoveSpillovers_;
    }

    if (delaySpillovers.empty() && shoegazeSpillovers.empty() && lexiLoveSpillovers.empty()) {
        return;
    }

    const int numChannels = buffer.getNumChannels();
    if (spilloverBuffer_.getNumChannels() < numChannels || spilloverBuffer_.getNumSamples() < numSamples) {
        return;
    }

    auto processList = [&](const auto& spillovers) {
        for (const auto& spillover : spillovers) {
            if (!spillover || !spillover->processor) {
                continue;
            }
            if (spillover->expired.load(std::memory_order_relaxed)
                || spillover->remainingSamples.load(std::memory_order_relaxed) <= 0) {
                spillover->expired.store(true, std::memory_order_relaxed);
                continue;
            }

            juce::AudioBuffer<float> spilloverBuffer(
                spilloverBuffer_.getArrayOfWritePointers(),
                numChannels,
                numSamples);
            spilloverBuffer.clear();
            spillover->processor->process(spilloverBuffer);
            for (int ch = 0; ch < numChannels; ++ch) {
                buffer.addFrom(ch, 0, spilloverBuffer, ch, 0, numSamples);
            }

            const auto remaining =
                spillover->remainingSamples.fetch_sub(numSamples, std::memory_order_relaxed) - numSamples;
            if (remaining <= 0) {
                spillover->expired.store(true, std::memory_order_relaxed);
            }
        }
    };

    processList(delaySpillovers);
    processList(shoegazeSpillovers);
    processList(lexiLoveSpillovers);
}

bool Map2AudioEngine::stageSpilloverFromCurrentChain(const std::vector<InstanceId>& nextOrder) {
    cleanupExpiredSpilloverChains();

    auto spillover = buildSpilloverChainFromCurrentOrder(nextOrder);
    if (!spillover) {
        return false;
    }

    std::lock_guard<std::mutex> lock(spilloverChainsMutex_);
    spilloverChains_.push_back(std::move(spillover));
    return true;
}

std::shared_ptr<Map2AudioEngine::SpilloverChain> Map2AudioEngine::buildSpilloverChainFromCurrentOrder(
    const std::vector<InstanceId>& nextOrder
) {
    const auto currentOrder = audioGraph_->getChainOrder();
    if (currentOrder.empty() || currentOrder == nextOrder) {
        return {};
    }

    const std::unordered_set<InstanceId> nextInstances(nextOrder.begin(), nextOrder.end());
    int spilloverStart = -1;
    for (size_t index = 0; index < currentOrder.size(); ++index) {
        const auto instanceId = currentOrder[index];
        if (nextInstances.find(instanceId) != nextInstances.end()) {
            continue;
        }

        const auto* processor = pluginHost_.getProcessor(instanceId);
        if (!processorSupportsSnapshotSpillover(processor)
            || pluginHost_.isBypassed(instanceId)
            || processorIsLocallyBypassed(processor)) {
            continue;
        }

        spilloverStart = static_cast<int>(index);
        break;
    }

    if (spilloverStart < 0) {
        return {};
    }

    auto spillover = std::make_shared<SpilloverChain>();
    spillover->id = nextSpilloverChainId_++;

    double estimatedTailSeconds = 0.0;
    for (size_t index = static_cast<size_t>(spilloverStart); index < currentOrder.size(); ++index) {
        auto cloneId = clonePluginInstanceForSpillover(currentOrder[index]);
        if (!cloneId.has_value()) {
            for (const auto instanceId : spillover->instanceIds) {
                pluginHost_.unloadPlugin(instanceId);
            }
            return {};
        }

        spillover->instanceIds.push_back(*cloneId);
        estimatedTailSeconds = std::max(
            estimatedTailSeconds,
            getProcessorTailSeconds(pluginHost_.getProcessor(*cloneId)));
    }

    if (spillover->instanceIds.empty() || estimatedTailSeconds <= 0.0) {
        for (const auto instanceId : spillover->instanceIds) {
            pluginHost_.unloadPlugin(instanceId);
        }
        return {};
    }

    spillover->estimatedTailSeconds = estimatedTailSeconds;
    spillover->remainingSamples.store(
        static_cast<int64_t>(std::ceil(estimatedTailSeconds * sampleRate_)),
        std::memory_order_relaxed);
    spillover->expired.store(false, std::memory_order_relaxed);
    return spillover;
}

std::optional<InstanceId> Map2AudioEngine::clonePluginInstanceForSpillover(InstanceId sourceInstanceId) {
    std::string uri;
    for (const auto& plugin : pluginHost_.getLoadedPlugins()) {
        if (plugin.id == sourceInstanceId) {
            uri = plugin.uri;
            break;
        }
    }

    if (uri.empty()) {
        return std::nullopt;
    }

    const auto cloneId = pluginHost_.loadPlugin(uri, sampleRate_, bufferSize_);
    if (cloneId == INVALID_INSTANCE_ID) {
        return std::nullopt;
    }

    auto* cloneProcessor = pluginHost_.getProcessor(cloneId);
    if (cloneProcessor == nullptr) {
        pluginHost_.unloadPlugin(cloneId);
        return std::nullopt;
    }

    cloneProcessor->setRateAndBufferSizeDetails(sampleRate_, bufferSize_);
    cloneProcessor->setNonRealtime(false);
    cloneProcessor->prepareToPlay(sampleRate_, bufferSize_);

    const auto state = pluginHost_.getPluginState(sourceInstanceId);
    if (!state.empty()) {
        pluginHost_.setPluginState(cloneId, state);
    }
    pluginHost_.setBypass(cloneId, pluginHost_.isBypassed(sourceInstanceId));
    return cloneId;
}

// ========================================
// Lexicon MPX-1 Hardware Plugin
// ========================================

InstanceId Map2AudioEngine::loadLexiconPlugin() {
    // Singleton guard — only one MPX-1 can exist
    if (lexiconProcessor_ != nullptr) {
        return lexiconInstanceId_;
    }

    // Create the hardware processor
    auto processor = std::make_unique<LexiconHardwareProcessor>();
    processor->prepareToPlay(sampleRate_, bufferSize_);

    // Build PluginInfo metadata
    PluginInfo info;
    info.uri = LexiconHardwareProcessor::PLUGIN_URI;
    info.name = LexiconHardwareProcessor::PLUGIN_NAME;
    info.author = "Lexicon / Harman";
    info.brand = "Lexicon";
    info.category = "lexicon";
    info.format = PluginFormat::Hardware;
    info.formatName = "Hardware";
    info.audioInputs = 2;
    info.audioOutputs = 2;
    info.hasMidiInput = true;
    info.hasMidiOutput = true;
    info.latencySamples = 0;  // Updated after calibration

    // Store raw pointer before moving ownership to host
    lexiconProcessor_ = processor.get();

    // Register with plugin host (transfers ownership)
    lexiconInstanceId_ = pluginHost_.registerHardwarePlugin(
        std::move(processor), info);

    if (lexiconInstanceId_ == INVALID_INSTANCE_ID) {
        lexiconProcessor_ = nullptr;
        return INVALID_INSTANCE_ID;
    }

    return lexiconInstanceId_;
}

bool Map2AudioEngine::unloadLexiconPlugin() {
    if (lexiconProcessor_ == nullptr) {
        return false;
    }

    // Remove from chain if present
    audioGraph_->removePlugin(lexiconInstanceId_);
    audioGraph_->removeDetachedPluginNode(lexiconInstanceId_);
    cpuMonitor_.removePlugin(lexiconInstanceId_);

    const InstanceId instanceId = lexiconInstanceId_;
    const bool unloaded = pluginHost_.unloadPlugin(instanceId);
    if (!unloaded) {
        return false;
    }

    lexiconProcessor_ = nullptr;
    lexiconInstanceId_ = INVALID_INSTANCE_ID;
    return true;
}

bool Map2AudioEngine::isLexiconLoaded() const {
    return lexiconProcessor_ != nullptr;
}

InstanceId Map2AudioEngine::getLexiconInstanceId() const {
    return lexiconInstanceId_;
}

bool Map2AudioEngine::calibrateLexiconLatency() {
    if (lexiconProcessor_ == nullptr) return false;

    // Keep a conservative fixed fallback until a real loopback calibration path
    // is added for the external Lexicon hardware round-trip.
    // (~3ms at 48kHz = 144 samples for DA + processing + AD)
    constexpr int DEFAULT_SPDIF_LATENCY_SAMPLES = 144;
    lexiconProcessor_->setMeasuredLatencySamples(DEFAULT_SPDIF_LATENCY_SAMPLES);
    return true;
}

// ========================================
// Sidechain Routing
// ========================================

bool Map2AudioEngine::connectSidechain(InstanceId source, InstanceId dest, int destBus) {
    return audioGraph_->connectSidechain(source, dest, destBus);
}

bool Map2AudioEngine::disconnectSidechain(InstanceId dest, int destBus) {
    return audioGraph_->disconnectSidechain(dest, destBus);
}

std::vector<SidechainConnection> Map2AudioEngine::getSidechainConnections() const {
    return audioGraph_->getSidechainConnections();
}

// ========================================
// Parameters
// ========================================

bool Map2AudioEngine::setParameter(InstanceId instanceId, int paramIndex, float value) {
    if (audioRunning_.load(std::memory_order_acquire)) {
        if (parameterBridge_.queueParameterChange(instanceId, paramIndex, value)) {
            return true;
        }
    }
    return pluginHost_.setParameter(instanceId, paramIndex, value);
}

bool Map2AudioEngine::setParameterByName(InstanceId instanceId, const std::string& name, float value) {
    if (audioRunning_.load(std::memory_order_acquire)) {
        if (parameterBridge_.queueParameterChange(instanceId, name, value)) {
            return true;
        }
    }
    return pluginHost_.setParameterByName(instanceId, name, value);
}

float Map2AudioEngine::getParameter(InstanceId instanceId, int paramIndex) const {
    return pluginHost_.getParameter(instanceId, paramIndex);
}

float Map2AudioEngine::getParameterByName(InstanceId instanceId, const std::string& name) const {
    return pluginHost_.getParameterByName(instanceId, name);
}

bool Map2AudioEngine::setBypass(InstanceId instanceId, bool bypass) {
    if (instanceId == lexiconInstanceId_ && lexiconProcessor_ != nullptr) {
        lexiconProcessor_->setBypass(bypass);
    }
    return pluginHost_.setBypass(instanceId, bypass);
}

// ========================================
// Snapshots
// ========================================

int Map2AudioEngine::getCurrentSnapshot() const {
    return snapshotManager_->getCurrentSnapshot();
}

bool Map2AudioEngine::loadSnapshot(int snapshotId) {
    return snapshotManager_->loadSnapshot(snapshotId);
}

bool Map2AudioEngine::saveSnapshot(int snapshotId, const std::string& name) {
    return snapshotManager_->saveSnapshot(snapshotId, name);
}

std::vector<Snapshot> Map2AudioEngine::listSnapshots() const {
    return snapshotManager_->listSnapshots();
}

std::string Map2AudioEngine::saveGraphDocument(const std::string& seedGraphDocumentJson) const {
    juce::var documentVar;
    if (!seedGraphDocumentJson.empty()) {
        const auto parsed = juce::JSON::parse(seedGraphDocumentJson);
        if (!parsed.isVoid()) {
            documentVar = parsed;
        }
    }

    if (!documentVar.isObject()) {
        auto defaultDocument = juce::DynamicObject::Ptr(new juce::DynamicObject());
        auto defaultMeta = juce::DynamicObject::Ptr(new juce::DynamicObject());
        defaultMeta->setProperty("name", "Live Graph");
        defaultMeta->setProperty("type", "snapshot");
        defaultDocument->setProperty("version", kGraphDocumentVersion);
        defaultDocument->setProperty("meta", juce::var(defaultMeta.get()));
        defaultDocument->setProperty("graph", juce::var(juce::DynamicObject::Ptr(new juce::DynamicObject()).get()));
        documentVar = juce::var(defaultDocument.get());
    }

    auto documentTree = jsonVarToValueTree(documentVar, "document");
    auto metaTree = ensureObjectChild(documentTree, "meta");
    if (!metaTree.hasProperty("name") || metaTree.getProperty("name").toString().trim().isEmpty()) {
        metaTree.setProperty("name", "Live Graph", nullptr);
    }
    if (!metaTree.hasProperty("type") || metaTree.getProperty("type").toString().trim().isEmpty()) {
        metaTree.setProperty("type", "snapshot", nullptr);
    }
    documentTree.setProperty("version", kGraphDocumentVersion, nullptr);

    auto graphTree = ensureObjectChild(documentTree, "graph");
    auto nodesTree = makeArrayTree("nodes");
    auto edgesTree = makeArrayTree("edges");
    auto chainsTree = makeArrayTree("chains");

    const auto order = audioGraph_->getChainOrder();
    const auto loadedPlugins = pluginHost_.getLoadedPlugins();
    std::map<InstanceId, PluginInstance> loadedById;
    for (const auto& plugin : loadedPlugins) {
        loadedById[plugin.id] = plugin;
    }

    auto chainObject = juce::DynamicObject::Ptr(new juce::DynamicObject());
    chainObject->setProperty("id", 1);
    chainObject->setProperty("source_key", "main-chain");
    chainObject->setProperty("name", "Main Chain");
    juce::Array<juce::var> chainPlugins;

    for (size_t index = 0; index < order.size(); ++index) {
        const auto instanceId = order[index];
        const auto loadedIt = loadedById.find(instanceId);
        if (loadedIt == loadedById.end()) {
            continue;
        }

        const auto& plugin = loadedIt->second;
        auto parameters = juce::DynamicObject::Ptr(new juce::DynamicObject());
        for (const auto& [name, value] : plugin.parameterValues) {
            parameters->setProperty(juce::Identifier(name), value);
        }

        auto state = juce::DynamicObject::Ptr(new juce::DynamicObject());
        const auto encodedState = encodeBase64State(pluginHost_.getPluginState(instanceId));
        if (encodedState.isNotEmpty()) {
            state->setProperty("state_chunk_base64", encodedState);
        }

        auto chainPlugin = juce::DynamicObject::Ptr(new juce::DynamicObject());
        chainPlugin->setProperty("instance_id", static_cast<int>(instanceId));
        chainPlugin->setProperty("position", static_cast<int>(index));
        chainPlugin->setProperty("uri", juce::String(plugin.uri));
        chainPlugin->setProperty("canonical_uri", juce::String(canonicalGraphNodeUri(plugin.uri)));
        chainPlugin->setProperty("name", juce::String(plugin.name));
        chainPlugin->setProperty("bypass", plugin.bypassed);
        chainPlugin->setProperty("parameters", juce::var(parameters.get()));
        chainPlugin->setProperty("loader_state", juce::var(state.get()));
        chainPlugins.add(juce::var(chainPlugin.get()));

        auto node = juce::DynamicObject::Ptr(new juce::DynamicObject());
        node->setProperty("id", "main-chain:" + juce::String(static_cast<int>(index)));
        node->setProperty("uri", juce::String(canonicalGraphNodeUri(plugin.uri)));
        node->setProperty("engine_uri", juce::String(plugin.uri));
        node->setProperty("name", juce::String(plugin.name));
        node->setProperty("bypass", plugin.bypassed);
        node->setProperty("parameters", juce::var(parameters.get()));
        node->setProperty("state", juce::var(state.get()));
        nodesTree.addChild(jsonVarToValueTree(juce::var(node.get()), "object"), -1, nullptr);

        if (index > 0) {
            auto edge = juce::DynamicObject::Ptr(new juce::DynamicObject());
            edge->setProperty("from", "main-chain:" + juce::String(static_cast<int>(index - 1)));
            edge->setProperty("to", "main-chain:" + juce::String(static_cast<int>(index)));
            edgesTree.addChild(jsonVarToValueTree(juce::var(edge.get()), "object"), -1, nullptr);
        }
    }

    chainObject->setProperty("plugins", juce::var(chainPlugins));
    chainsTree.addChild(jsonVarToValueTree(juce::var(chainObject.get()), "object"), -1, nullptr);

    replaceJsonChildByKey(graphTree, "nodes", nodesTree);
    replaceJsonChildByKey(graphTree, "edges", edgesTree);
    replaceJsonChildByKey(graphTree, "chains", chainsTree);

    return juce::JSON::toString(valueTreeToJsonVar(documentTree), true).toStdString();
}

bool Map2AudioEngine::loadGraphDocument(
    const std::string& graphDocumentJson,
    bool useIndependentCrossfade,
    int maxCrossfadeMs) {
    const auto parsed = juce::JSON::parse(graphDocumentJson);
    if (!parsed.isObject()) {
        return false;
    }

    const auto documentTree = jsonVarToValueTree(parsed, "document");
    const auto graphTree = findJsonChildByKey(documentTree, "graph");
    if (!graphTree.isValid()) {
        return false;
    }

    std::vector<juce::var> pluginSpecs;
    const auto chainsTree = findJsonChildByKey(graphTree, "chains");
    if (chainsTree.isValid()) {
        for (int chainIndex = 0; chainIndex < chainsTree.getNumChildren(); ++chainIndex) {
            const auto chainVar = valueTreeToJsonVar(chainsTree.getChild(chainIndex));
            if (!chainVar.isObject()) {
                continue;
            }
            auto* chainObject = chainVar.getDynamicObject();
            if (chainObject == nullptr) {
                continue;
            }
            const auto pluginsVar = chainObject->getProperty("plugins");
            if (const auto* pluginArray = pluginsVar.getArray()) {
                for (const auto& pluginVar : *pluginArray) {
                    pluginSpecs.push_back(pluginVar);
                }
            }
        }
    }

    if (pluginSpecs.empty()) {
        const auto nodesTree = findJsonChildByKey(graphTree, "nodes");
        if (!nodesTree.isValid()) {
            return false;
        }
        for (int index = 0; index < nodesTree.getNumChildren(); ++index) {
            pluginSpecs.push_back(valueTreeToJsonVar(nodesTree.getChild(index)));
        }
    }

    const auto previousOrder = audioGraph_->getChainOrder();
    const auto loadedPlugins = pluginHost_.getLoadedPlugins();
    std::map<std::string, std::vector<InstanceId>> loadedByUri;
    for (const auto& plugin : loadedPlugins) {
        loadedByUri[plugin.uri].push_back(plugin.id);
    }

    std::vector<InstanceId> nextOrder;
    std::vector<InstanceId> newlyLoaded;
    std::set<InstanceId> reused;

    for (const auto& pluginVar : pluginSpecs) {
        const auto uri = loadableEngineUri(pluginVar);
        if (uri.empty()) {
            for (const auto instanceId : newlyLoaded) {
                unloadPlugin(instanceId);
            }
            return false;
        }

        InstanceId instanceId = INVALID_INSTANCE_ID;
        auto loadedIt = loadedByUri.find(uri);
        if (loadedIt != loadedByUri.end()) {
            for (const auto candidate : loadedIt->second) {
                if (reused.find(candidate) == reused.end()) {
                    instanceId = candidate;
                    reused.insert(candidate);
                    break;
                }
            }
        }

        if (instanceId == INVALID_INSTANCE_ID) {
            if (uri == LexiconHardwareProcessor::PLUGIN_URI) {
                instanceId = loadLexiconPlugin();
            } else {
                instanceId = loadPlugin(uri);
            }
            if (instanceId == INVALID_INSTANCE_ID) {
                for (const auto loadedId : newlyLoaded) {
                    unloadPlugin(loadedId);
                }
                return false;
            }
            newlyLoaded.push_back(instanceId);
        }

        if (pluginVar.isObject()) {
            if (auto* pluginObject = pluginVar.getDynamicObject()) {
                juce::String encodedState;
                const auto loaderState = pluginObject->getProperty("loader_state");
                if (loaderState.isObject()) {
                    if (auto* stateObject = loaderState.getDynamicObject()) {
                        encodedState = stateObject->getProperty("state_chunk_base64").toString();
                    }
                }
                if (encodedState.isEmpty()) {
                    const auto state = pluginObject->getProperty("state");
                    if (state.isObject()) {
                        if (auto* stateObject = state.getDynamicObject()) {
                            encodedState = stateObject->getProperty("state_chunk_base64").toString();
                        }
                    }
                }
                if (encodedState.isNotEmpty()) {
                    pluginHost_.setPluginState(instanceId, decodeBase64State(encodedState));
                }

                const auto parametersVar = pluginObject->getProperty("parameters");
                if (parametersVar.isObject()) {
                    if (auto* parameters = parametersVar.getDynamicObject()) {
                        for (const auto& property : parameters->getProperties()) {
                            if (const auto value = coerceFloatVar(property.value)) {
                                setParameterByName(instanceId, property.name.toString().toStdString(), *value);
                            }
                        }
                    }
                }

                if (pluginObject->hasProperty("bypass")) {
                    setBypass(instanceId, static_cast<bool>(pluginObject->getProperty("bypass")));
                }
            }
        }

        nextOrder.push_back(instanceId);
    }

    const bool replaced = useIndependentCrossfade
        ? replaceChainWithIndependentGraphCrossfade(nextOrder, maxCrossfadeMs)
        : replaceChain(nextOrder);
    if (!replaced) {
        for (const auto loadedId : newlyLoaded) {
            unloadPlugin(loadedId);
        }
        return false;
    }

    for (const auto instanceId : previousOrder) {
        if (std::find(nextOrder.begin(), nextOrder.end(), instanceId) == nextOrder.end()) {
            unloadPlugin(instanceId);
        }
    }

    return true;
}

bool Map2AudioEngine::clearMorphEndpoints() {
    const std::lock_guard<std::mutex> lock(morphStateMutex_);
    quadMorphState_ = {};
    return true;
}

bool Map2AudioEngine::setMorphEndpoint(const std::string& cornerId, const std::string& graphDocumentJson) {
    const auto cornerIndex = morphCornerIndexForId(cornerId);
    if (cornerIndex < 0) {
        return false;
    }

    const auto parsed = juce::JSON::parse(graphDocumentJson);
    if (!parsed.isObject()) {
        return false;
    }

    auto endpoint = buildMorphEndpointState(parsed);
    if (!endpoint.configured) {
        return false;
    }

    const std::lock_guard<std::mutex> lock(morphStateMutex_);
    quadMorphState_.endpoints[static_cast<size_t>(cornerIndex)] = std::move(endpoint);
    return true;
}

bool Map2AudioEngine::setMorphPosition(float x, float y) {
    x = clampUnitFloat(x);
    y = clampUnitFloat(y);
    {
        const std::lock_guard<std::mutex> lock(morphStateMutex_);
        quadMorphState_.x = x;
        quadMorphState_.y = y;
    }
    return applyMorphPosition(x, y);
}

std::string Map2AudioEngine::getMorphStateJson() const {
    auto stateObject = juce::DynamicObject::Ptr(new juce::DynamicObject());
    juce::Array<juce::var> configuredCorners;

    {
        const std::lock_guard<std::mutex> lock(morphStateMutex_);
        stateObject->setProperty("x", quadMorphState_.x);
        stateObject->setProperty("y", quadMorphState_.y);
        for (size_t index = 0; index < quadMorphState_.endpoints.size(); ++index) {
            if (quadMorphState_.endpoints[index].configured) {
                configuredCorners.add(juce::String(morphCornerKey(static_cast<int>(index))));
            }
        }
    }

    stateObject->setProperty("configured_corners", juce::var(configuredCorners));
    return juce::JSON::toString(juce::var(stateObject.get()), true).toStdString();
}

int Map2AudioEngine::morphCornerIndexForId(const std::string& cornerId) {
    std::string normalized;
    normalized.reserve(cornerId.size());
    for (const unsigned char ch : cornerId) {
        normalized.push_back(static_cast<char>(std::tolower(ch)));
    }
    if (normalized == "a") {
        return 0;
    }
    if (normalized == "b") {
        return 1;
    }
    if (normalized == "c") {
        return 2;
    }
    if (normalized == "d") {
        return 3;
    }
    return -1;
}

std::string Map2AudioEngine::morphCornerKey(int index) {
    switch (index) {
        case 0: return "a";
        case 1: return "b";
        case 2: return "c";
        case 3: return "d";
        default: return "unknown";
    }
}

std::string Map2AudioEngine::makeMorphPluginKey(const std::string& uri, int position) {
    return uri + "#" + std::to_string(position);
}

Map2AudioEngine::MorphEndpointState Map2AudioEngine::buildMorphEndpointState(const juce::var& graphDocumentVar) {
    MorphEndpointState endpoint;
    if (!graphDocumentVar.isObject()) {
        return endpoint;
    }

    const auto documentTree = jsonVarToValueTree(graphDocumentVar, "document");
    const auto graphTree = findJsonChildByKey(documentTree, "graph");
    if (!graphTree.isValid()) {
        return endpoint;
    }

    std::vector<juce::var> pluginSpecs;
    const auto chainsTree = findJsonChildByKey(graphTree, "chains");
    if (chainsTree.isValid()) {
        for (int chainIndex = 0; chainIndex < chainsTree.getNumChildren(); ++chainIndex) {
            const auto chainVar = valueTreeToJsonVar(chainsTree.getChild(chainIndex));
            if (!chainVar.isObject()) {
                continue;
            }
            auto* chainObject = chainVar.getDynamicObject();
            if (chainObject == nullptr) {
                continue;
            }
            const auto pluginsVar = chainObject->getProperty("plugins");
            if (const auto* pluginArray = pluginsVar.getArray()) {
                for (const auto& pluginVar : *pluginArray) {
                    pluginSpecs.push_back(pluginVar);
                }
            }
        }
    }

    if (pluginSpecs.empty()) {
        const auto nodesTree = findJsonChildByKey(graphTree, "nodes");
        if (!nodesTree.isValid()) {
            return endpoint;
        }
        for (int index = 0; index < nodesTree.getNumChildren(); ++index) {
            pluginSpecs.push_back(valueTreeToJsonVar(nodesTree.getChild(index)));
        }
    }

    for (const auto& pluginVar : pluginSpecs) {
        const auto uri = loadableEngineUri(pluginVar);
        if (uri.empty() || !pluginVar.isObject()) {
            continue;
        }
        auto* pluginObject = pluginVar.getDynamicObject();
        if (pluginObject == nullptr) {
            continue;
        }

        MorphEndpointPluginState pluginState;
        pluginState.uri = uri;
        pluginState.position = static_cast<int>(pluginObject->getProperty("position"));
        pluginState.bypass = static_cast<bool>(pluginObject->getProperty("bypass"));

        const auto parametersVar = pluginObject->getProperty("parameters");
        if (parametersVar.isObject()) {
            if (auto* parametersObject = parametersVar.getDynamicObject()) {
                for (const auto& property : parametersObject->getProperties()) {
                    if (const auto value = coerceFloatVar(property.value)) {
                        pluginState.parameters[property.name.toString().toStdString()] = *value;
                    }
                }
            }
        }

        endpoint.plugins[makeMorphPluginKey(pluginState.uri, pluginState.position)] = std::move(pluginState);
    }

    endpoint.configured = !endpoint.plugins.empty();
    return endpoint;
}

bool Map2AudioEngine::applyMorphPosition(float x, float y) {
    QuadMorphState stateCopy;
    {
        const std::lock_guard<std::mutex> lock(morphStateMutex_);
        stateCopy = quadMorphState_;
    }

    for (const auto& endpoint : stateCopy.endpoints) {
        if (!endpoint.configured) {
            return false;
        }
    }

    const auto order = audioGraph_->getChainOrder();
    const auto loadedPlugins = pluginHost_.getLoadedPlugins();
    std::map<InstanceId, PluginInstance> loadedById;
    for (const auto& plugin : loadedPlugins) {
        loadedById[plugin.id] = plugin;
    }

    bool applied = false;
    const int selectedCornerIndex = (y >= 0.5f ? 2 : 0) + (x >= 0.5f ? 1 : 0);

    for (size_t index = 0; index < order.size(); ++index) {
        const auto instanceId = order[index];
        const auto loadedIt = loadedById.find(instanceId);
        if (loadedIt == loadedById.end()) {
            continue;
        }

        const auto pluginKey = makeMorphPluginKey(loadedIt->second.uri, static_cast<int>(index));
        const auto endpointA = stateCopy.endpoints[0].plugins.find(pluginKey);
        const auto endpointB = stateCopy.endpoints[1].plugins.find(pluginKey);
        const auto endpointC = stateCopy.endpoints[2].plugins.find(pluginKey);
        const auto endpointD = stateCopy.endpoints[3].plugins.find(pluginKey);
        if (endpointA == stateCopy.endpoints[0].plugins.end()
            || endpointB == stateCopy.endpoints[1].plugins.end()
            || endpointC == stateCopy.endpoints[2].plugins.end()
            || endpointD == stateCopy.endpoints[3].plugins.end()) {
            continue;
        }

        std::set<std::string> parameterNames;
        for (const auto& [name, _] : endpointA->second.parameters) {
            parameterNames.insert(name);
        }
        for (const auto& [name, _] : endpointB->second.parameters) {
            parameterNames.insert(name);
        }
        for (const auto& [name, _] : endpointC->second.parameters) {
            parameterNames.insert(name);
        }
        for (const auto& [name, _] : endpointD->second.parameters) {
            parameterNames.insert(name);
        }

        for (const auto& name : parameterNames) {
            const auto a = endpointA->second.parameters.find(name);
            const auto b = endpointB->second.parameters.find(name);
            const auto c = endpointC->second.parameters.find(name);
            const auto d = endpointD->second.parameters.find(name);
            if (a == endpointA->second.parameters.end()
                || b == endpointB->second.parameters.end()
                || c == endpointC->second.parameters.end()
                || d == endpointD->second.parameters.end()) {
                continue;
            }
            if (setParameterByName(instanceId, name, bilinearMorphValue(a->second, b->second, c->second, d->second, x, y))) {
                applied = true;
            }
        }

        const auto& selectedPlugin = stateCopy.endpoints[static_cast<size_t>(selectedCornerIndex)].plugins.at(pluginKey);
        if (setBypass(instanceId, selectedPlugin.bypass)) {
            applied = true;
        }
    }

    return applied;
}

// ========================================
// MIDI
// ========================================

bool Map2AudioEngine::enableMidi(bool enable) {
    midiHandler_.setEnabled(enable);
    return true;
}

bool Map2AudioEngine::isMidiEnabled() const {
    return midiHandler_.isEnabled();
}

std::vector<std::string> Map2AudioEngine::getMidiDevices() const {
    return midiHandler_.getInputDevices();
}

bool Map2AudioEngine::setMidiDevice(const std::string& device) {
    return midiHandler_.openInputDevice(device);
}

bool Map2AudioEngine::injectMidiNoteOn(int channel, int note, int velocity) {
    if (!midiHandler_.isEnabled()) {
        return false;
    }
    if (channel < 1 || channel > 16) {
        return false;
    }
    if (note < 0 || note > 127) {
        return false;
    }
    if (velocity < 0 || velocity > 127) {
        return false;
    }

    const uint8_t message[3] = {
        static_cast<uint8_t>(0x90 | ((channel - 1) & 0x0F)),
        static_cast<uint8_t>(note & 0x7F),
        static_cast<uint8_t>(velocity & 0x7F),
    };
    midiHandler_.processMidiBuffer(message, sizeof(message));
    return true;
}

bool Map2AudioEngine::injectMidiNoteOff(int channel, int note, int velocity) {
    if (!midiHandler_.isEnabled()) {
        return false;
    }
    if (channel < 1 || channel > 16) {
        return false;
    }
    if (note < 0 || note > 127) {
        return false;
    }
    if (velocity < 0 || velocity > 127) {
        return false;
    }

    const uint8_t message[3] = {
        static_cast<uint8_t>(0x80 | ((channel - 1) & 0x0F)),
        static_cast<uint8_t>(note & 0x7F),
        static_cast<uint8_t>(velocity & 0x7F),
    };
    midiHandler_.processMidiBuffer(message, sizeof(message));
    return true;
}

// ========================================
// VU Meters (Legacy)
// ========================================

VuLevels Map2AudioEngine::getVuLevels() const {
    return audioGraph_->getOutputVu();
}

std::map<InstanceId, VuLevels> Map2AudioEngine::getPluginVuLevels() const {
    return audioGraph_->getPluginVuLevels();
}

// ========================================
// Advanced Metering
// ========================================

SpectrumAnalyzer::SpectrumData Map2AudioEngine::getSpectrum() const {
    return spectrumAnalyzer_.getSpectrum();
}

std::vector<float> Map2AudioEngine::getSpectrumMagnitudes() const {
    return spectrumAnalyzer_.getMagnitudes();
}

std::vector<float> Map2AudioEngine::getSpectrumFrequencies() const {
    return spectrumAnalyzer_.getFrequencies();
}

LufsLevels Map2AudioEngine::getLufsLevels() const {
    return lufsMeter_.getLevels();
}

void Map2AudioEngine::resetIntegratedLoudness() {
    lufsMeter_.resetIntegrated();
}

float Map2AudioEngine::getPhaseCorrelation() const {
    return phaseCorrelation_.getCorrelation();
}

float Map2AudioEngine::getStereoBalance() const {
    return phaseCorrelation_.getBalance();
}

float Map2AudioEngine::getStereoWidth() const {
    return phaseCorrelation_.getStereoWidth();
}

// ========================================
// CPU Monitoring
// ========================================

CPUMetrics Map2AudioEngine::getCpuMetrics() const {
    return cpuMonitor_.getMetrics();
}

double Map2AudioEngine::getTotalCpu() const {
    return cpuMonitor_.getTotalCpu();
}

double Map2AudioEngine::getPluginCpu(InstanceId instanceId) const {
    return cpuMonitor_.getPluginCpu(instanceId);
}

int Map2AudioEngine::getXRunCount() const {
    return cpuMonitor_.getXRunCount();
}

// ========================================
// Latency
// ========================================

int Map2AudioEngine::getTotalLatencySamples() const {
    return audioGraph_->getTotalLatency();
}

double Map2AudioEngine::getTotalLatencyMs() const {
    return audioGraph_->getTotalLatencyMs();
}

std::map<InstanceId, int> Map2AudioEngine::getPerPluginLatency() const {
    return audioGraph_->getPerPluginLatency();
}

// ========================================
// Audio I/O Diagnostics
// ========================================

JuceAudioIO::AudioStats Map2AudioEngine::getAudioIOStats() const {
    return audioIO_.getStats();
}

JuceAudioIO::ConnectionHealth Map2AudioEngine::getConnectionHealth() const {
    return audioIO_.getConnectionHealth();
}

std::vector<int64_t> Map2AudioEngine::getXrunHistory() const {
    return audioIO_.getXrunHistory();
}

void Map2AudioEngine::resetXrunCounter() {
    audioIO_.resetXrunCounter();
}

void Map2AudioEngine::resetAudioIOStats() {
    audioIO_.resetStats();
}

void Map2AudioEngine::setMeasuredRoundTripLatency(double ms) {
    audioIO_.setMeasuredRoundTripLatency(ms);
}

double Map2AudioEngine::getDeviceReportedLatencyMs() const {
    return audioIO_.getDeviceReportedLatencyMs();
}

// ========================================
// Convolution
// ========================================

bool Map2AudioEngine::loadCabinetIR(const std::string& path) {
    return cabinetProcessor_.loadImpulseResponse(path);
}

bool Map2AudioEngine::loadReverbIR(const std::string& path) {
    return reverbProcessor_.loadImpulseResponse(path);
}

void Map2AudioEngine::unloadCabinetIR() {
    cabinetProcessor_.unloadImpulseResponse();
}

void Map2AudioEngine::unloadReverbIR() {
    reverbProcessor_.unloadImpulseResponse();
}

void Map2AudioEngine::setCabinetMix(float mix) {
    cabinetProcessor_.setDryWetMix(mix);
}

void Map2AudioEngine::setReverbMix(float mix) {
    reverbProcessor_.setDryWetMix(mix);
}

void Map2AudioEngine::setCabinetBypass(bool bypass) {
    cabinetProcessor_.setBypass(bypass);
}

void Map2AudioEngine::setReverbBypass(bool bypass) {
    reverbProcessor_.setBypass(bypass);
}

ConvolutionProcessor::IRInfo Map2AudioEngine::getCabinetIRInfo() const {
    return cabinetProcessor_.getIRInfo();
}

ConvolutionProcessor::IRInfo Map2AudioEngine::getReverbIRInfo() const {
    return reverbProcessor_.getIRInfo();
}

// ========================================
// Dynamics - Compressor
// ========================================

void Map2AudioEngine::setCompressorThreshold(float dB) {
    compressor_.setThreshold(dB);
}

void Map2AudioEngine::setCompressorRatio(float ratio) {
    compressor_.setRatio(ratio);
}

void Map2AudioEngine::setCompressorAttack(float ms) {
    compressor_.setAttack(ms);
}

void Map2AudioEngine::setCompressorRelease(float ms) {
    compressor_.setRelease(ms);
}

void Map2AudioEngine::setCompressorKnee(float dB) {
    compressor_.setKnee(dB);
}

void Map2AudioEngine::setCompressorMakeupGain(float dB) {
    compressor_.setMakeupGain(dB);
}

void Map2AudioEngine::setCompressorAutoMakeup(bool enabled) {
    compressor_.setAutoMakeup(enabled);
}

void Map2AudioEngine::setCompressorBypass(bool bypass) {
    compressor_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getCompressorParameters() const {
    return compressor_.getParameters();
}

void Map2AudioEngine::setCompressorParameters(const DynamicsProcessor::Parameters& params) {
    compressor_.setParameters(params);
}

DynamicsProcessor::Metering Map2AudioEngine::getCompressorMetering() const {
    return compressor_.getMetering();
}

// ========================================
// Dynamics - Limiter
// ========================================

void Map2AudioEngine::setLimiterThreshold(float dB) {
    limiter_.setThreshold(dB);
}

void Map2AudioEngine::setLimiterRelease(float ms) {
    limiter_.setRelease(ms);
}

void Map2AudioEngine::setLimiterBypass(bool bypass) {
    limiter_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getLimiterParameters() const {
    return limiter_.getParameters();
}

DynamicsProcessor::Metering Map2AudioEngine::getLimiterMetering() const {
    return limiter_.getMetering();
}

// ========================================
// Dynamics - Noise Gate
// ========================================

void Map2AudioEngine::setGateThreshold(float dB) {
    gate_.setThreshold(dB);
}

void Map2AudioEngine::setGateRatio(float ratio) {
    gate_.setRatio(ratio);
}

void Map2AudioEngine::setGateAttack(float ms) {
    gate_.setAttack(ms);
}

void Map2AudioEngine::setGateRelease(float ms) {
    gate_.setRelease(ms);
}

void Map2AudioEngine::setGateBypass(bool bypass) {
    gate_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getGateParameters() const {
    return gate_.getParameters();
}

DynamicsProcessor::Metering Map2AudioEngine::getGateMetering() const {
    return gate_.getMetering();
}

// ========================================
// EQ / Filter Processing
// ========================================

void Map2AudioEngine::setEQBand(int bandIndex, const FilterProcessor::BandParameters& params) {
    eq_.setBand(bandIndex, params);
}

void Map2AudioEngine::setEQBandFrequency(int bandIndex, float hz) {
    eq_.setBandFrequency(bandIndex, hz);
}

void Map2AudioEngine::setEQBandGain(int bandIndex, float dB) {
    eq_.setBandGain(bandIndex, dB);
}

void Map2AudioEngine::setEQBandQ(int bandIndex, float q) {
    eq_.setBandQ(bandIndex, q);
}

void Map2AudioEngine::setEQBandType(int bandIndex, FilterProcessor::FilterType type) {
    eq_.setBandType(bandIndex, type);
}

void Map2AudioEngine::setEQBandEnabled(int bandIndex, bool enabled) {
    eq_.setBandEnabled(bandIndex, enabled);
}

FilterProcessor::BandParameters Map2AudioEngine::getEQBand(int bandIndex) const {
    return eq_.getBand(bandIndex);
}

void Map2AudioEngine::setEQOutputGain(float dB) {
    eq_.setOutputGain(dB);
}

float Map2AudioEngine::getEQOutputGain() const {
    return eq_.getOutputGain();
}

void Map2AudioEngine::setEQBypass(bool bypass) {
    eq_.setBypass(bypass);
}

bool Map2AudioEngine::isEQBypassed() const {
    return eq_.isBypassed();
}

FilterProcessor::Parameters Map2AudioEngine::getEQParameters() const {
    return eq_.getParameters();
}

void Map2AudioEngine::setEQParameters(const FilterProcessor::Parameters& params) {
    eq_.setParameters(params);
}

std::vector<float> Map2AudioEngine::getEQFrequencyResponse(const std::vector<float>& frequencies) const {
    return eq_.getFrequencyResponse(frequencies);
}

// ========================================
// Neural Amp Modeler
// ========================================

bool Map2AudioEngine::isNAMAvailable() const {
#ifdef HAS_NAM
    return true;
#else
    return false;
#endif
}

bool Map2AudioEngine::loadNAMModel(const std::string& path) {
#ifdef HAS_NAM
    return namProcessor_.loadModel(path);
#else
    (void)path;
    return false;
#endif
}

void Map2AudioEngine::unloadNAMModel() {
#ifdef HAS_NAM
    namProcessor_.unloadModel();
#endif
}

bool Map2AudioEngine::isNAMModelLoaded() const {
#ifdef HAS_NAM
    return namProcessor_.isModelLoaded();
#else
    return false;
#endif
}

bool Map2AudioEngine::isNAMLoading() const {
#ifdef HAS_NAM
    return namProcessor_.isLoading();
#else
    return false;
#endif
}

NAMModelInfo Map2AudioEngine::getNAMModelInfo() const {
#ifdef HAS_NAM
    return namProcessor_.getModelInfo();
#else
    return NAMModelInfo();
#endif
}

void Map2AudioEngine::setNAMInputGain(float dB) {
#ifdef HAS_NAM
    namProcessor_.setInputGain(dB);
#else
    (void)dB;
#endif
}

float Map2AudioEngine::getNAMInputGain() const {
#ifdef HAS_NAM
    return namProcessor_.getInputGain();
#else
    return 0.0f;
#endif
}

void Map2AudioEngine::setNAMOutputGain(float dB) {
#ifdef HAS_NAM
    namProcessor_.setOutputGain(dB);
#else
    (void)dB;
#endif
}

float Map2AudioEngine::getNAMOutputGain() const {
#ifdef HAS_NAM
    return namProcessor_.getOutputGain();
#else
    return 0.0f;
#endif
}

void Map2AudioEngine::setNAMBypass(bool bypass) {
#ifdef HAS_NAM
    namProcessor_.setBypass(bypass);
#else
    (void)bypass;
#endif
}

bool Map2AudioEngine::isNAMBypassed() const {
#ifdef HAS_NAM
    return namProcessor_.isBypassed();
#else
    return true;
#endif
}

void Map2AudioEngine::setNAMNormalize(bool normalize) {
#ifdef HAS_NAM
    namProcessor_.setNormalize(normalize);
#else
    (void)normalize;
#endif
}

bool Map2AudioEngine::isNAMNormalized() const {
#ifdef HAS_NAM
    return namProcessor_.isNormalized();
#else
    return false;
#endif
}

float Map2AudioEngine::getNAMInputLevel() const {
#ifdef HAS_NAM
    return namProcessor_.getInputLevel();
#else
    return -100.0f;
#endif
}

float Map2AudioEngine::getNAMOutputLevel() const {
#ifdef HAS_NAM
    return namProcessor_.getOutputLevel();
#else
    return -100.0f;
#endif
}

// ========================================
// Chorus Processing
// ========================================

void Map2AudioEngine::setChorusRate(float hz) {
    chorus_.setRate(hz);
}

float Map2AudioEngine::getChorusRate() const {
    return chorus_.getRate();
}

void Map2AudioEngine::setChorusDepth(float depth) {
    chorus_.setDepth(depth);
}

float Map2AudioEngine::getChorusDepth() const {
    return chorus_.getDepth();
}

void Map2AudioEngine::setChorusCentreDelay(float ms) {
    chorus_.setCentreDelay(ms);
}

float Map2AudioEngine::getChorusCentreDelay() const {
    return chorus_.getCentreDelay();
}

void Map2AudioEngine::setChorusFeedback(float feedback) {
    chorus_.setFeedback(feedback);
}

float Map2AudioEngine::getChorusFeedback() const {
    return chorus_.getFeedback();
}

void Map2AudioEngine::setChorusMix(float mix) {
    chorus_.setMix(mix);
}

float Map2AudioEngine::getChorusMix() const {
    return chorus_.getMix();
}

void Map2AudioEngine::setChorusSpread(float spread) {
    chorus_.setSpread(spread);
}

float Map2AudioEngine::getChorusSpread() const {
    return chorus_.getSpread();
}

void Map2AudioEngine::setChorusBypass(bool bypass) {
    chorus_.setBypass(bypass);
}

bool Map2AudioEngine::isChorusBypassed() const {
    return chorus_.isBypassed();
}

ChorusProcessor::Parameters Map2AudioEngine::getChorusParameters() const {
    return chorus_.getParameters();
}

void Map2AudioEngine::setChorusParameters(const ChorusProcessor::Parameters& params) {
    chorus_.setParameters(params);
}

ChorusProcessor::Metering Map2AudioEngine::getChorusMetering() const {
    return chorus_.getMetering();
}

// ========================================
// Phaser Processing
// ========================================

void Map2AudioEngine::setPhaserRate(float hz) {
    phaser_.setRate(hz);
}

float Map2AudioEngine::getPhaserRate() const {
    return phaser_.getRate();
}

void Map2AudioEngine::setPhaserDepth(float depth) {
    phaser_.setDepth(depth);
}

float Map2AudioEngine::getPhaserDepth() const {
    return phaser_.getDepth();
}

void Map2AudioEngine::setPhaserCentreFrequency(float hz) {
    phaser_.setCentreFrequency(hz);
}

float Map2AudioEngine::getPhaserCentreFrequency() const {
    return phaser_.getCentreFrequency();
}

void Map2AudioEngine::setPhaserFeedback(float feedback) {
    phaser_.setFeedback(feedback);
}

float Map2AudioEngine::getPhaserFeedback() const {
    return phaser_.getFeedback();
}

void Map2AudioEngine::setPhaserMix(float mix) {
    phaser_.setMix(mix);
}

float Map2AudioEngine::getPhaserMix() const {
    return phaser_.getMix();
}

void Map2AudioEngine::setPhaserBypass(bool bypass) {
    phaser_.setBypass(bypass);
}

bool Map2AudioEngine::isPhaserBypassed() const {
    return phaser_.isBypassed();
}

PhaserProcessor::Parameters Map2AudioEngine::getPhaserParameters() const {
    return phaser_.getParameters();
}

void Map2AudioEngine::setPhaserParameters(const PhaserProcessor::Parameters& params) {
    phaser_.setParameters(params);
}

PhaserProcessor::Metering Map2AudioEngine::getPhaserMetering() const {
    return phaser_.getMetering();
}

// ========================================
// Pitch Shifter / EVH--IN-STYLE Harmonizer
// ========================================

void Map2AudioEngine::setPitchShifterPitchL(float cents) {
    pitchShifter_.setPitchL(cents);
}

float Map2AudioEngine::getPitchShifterPitchL() const {
    return pitchShifter_.getPitchL();
}

void Map2AudioEngine::setPitchShifterPitchR(float cents) {
    pitchShifter_.setPitchR(cents);
}

float Map2AudioEngine::getPitchShifterPitchR() const {
    return pitchShifter_.getPitchR();
}

void Map2AudioEngine::setPitchShifterDelayL(float ms) {
    pitchShifter_.setDelayL(ms);
}

float Map2AudioEngine::getPitchShifterDelayL() const {
    return pitchShifter_.getDelayL();
}

void Map2AudioEngine::setPitchShifterDelayR(float ms) {
    pitchShifter_.setDelayR(ms);
}

float Map2AudioEngine::getPitchShifterDelayR() const {
    return pitchShifter_.getDelayR();
}

void Map2AudioEngine::setPitchShifterFeedback(float feedback) {
    pitchShifter_.setFeedback(feedback);
}

float Map2AudioEngine::getPitchShifterFeedback() const {
    return pitchShifter_.getFeedback();
}

void Map2AudioEngine::setPitchShifterMix(float percent) {
    pitchShifter_.setMix(percent);
}

float Map2AudioEngine::getPitchShifterMix() const {
    return pitchShifter_.getMix();
}

void Map2AudioEngine::setPitchShifterSpread(float percent) {
    pitchShifter_.setSpread(percent);
}

float Map2AudioEngine::getPitchShifterSpread() const {
    return pitchShifter_.getSpread();
}

void Map2AudioEngine::setPitchShifterPreset(PitchShifterProcessor::Preset preset) {
    pitchShifter_.setPreset(preset);
}

PitchShifterProcessor::Preset Map2AudioEngine::getPitchShifterPreset() const {
    return pitchShifter_.getPreset();
}

void Map2AudioEngine::setPitchShifterBypass(bool bypass) {
    pitchShifter_.setBypass(bypass);
}

bool Map2AudioEngine::isPitchShifterBypassed() const {
    return pitchShifter_.isBypassed();
}

PitchShifterProcessor::Parameters Map2AudioEngine::getPitchShifterParameters() const {
    return pitchShifter_.getParameters();
}

void Map2AudioEngine::setPitchShifterParameters(const PitchShifterProcessor::Parameters& params) {
    pitchShifter_.setParameters(params);
}

PitchShifterProcessor::Metering Map2AudioEngine::getPitchShifterMetering() const {
    return pitchShifter_.getMetering();
}

// ========================================
// IntelliFX 8-Voice Chorus
// ========================================

// Voice parameters
void Map2AudioEngine::setIntelliFXVoiceLevel(int voice, float dB) {
    intellifx_.setVoiceLevel(voice, dB);
}

float Map2AudioEngine::getIntelliFXVoiceLevel(int voice) const {
    return intellifx_.getVoiceLevel(voice);
}

void Map2AudioEngine::setIntelliFXVoicePan(int voice, float pan) {
    intellifx_.setVoicePan(voice, pan);
}

float Map2AudioEngine::getIntelliFXVoicePan(int voice) const {
    return intellifx_.getVoicePan(voice);
}

void Map2AudioEngine::setIntelliFXVoiceDelay(int voice, float ms) {
    intellifx_.setVoiceDelay(voice, ms);
}

float Map2AudioEngine::getIntelliFXVoiceDelay(int voice) const {
    return intellifx_.getVoiceDelay(voice);
}

void Map2AudioEngine::setIntelliFXVoiceDepth(int voice, float depth) {
    intellifx_.setVoiceDepth(voice, depth);
}

float Map2AudioEngine::getIntelliFXVoiceDepth(int voice) const {
    return intellifx_.getVoiceDepth(voice);
}

void Map2AudioEngine::setIntelliFXVoiceRate(int voice, float rate) {
    intellifx_.setVoiceRate(voice, rate);
}

float Map2AudioEngine::getIntelliFXVoiceRate(int voice) const {
    return intellifx_.getVoiceRate(voice);
}

IntelliFX8VoiceChorusProcessor::VoiceParameters
Map2AudioEngine::getIntelliFXVoiceParameters(int voice) const {
    return intellifx_.getVoiceParameters(voice);
}

void Map2AudioEngine::setIntelliFXVoiceParameters(
    int voice, const IntelliFX8VoiceChorusProcessor::VoiceParameters& params) {
    intellifx_.setVoiceParameters(voice, params);
}

// Global mixer
void Map2AudioEngine::setIntelliFXChorusLevel(float dB) {
    intellifx_.setChorusLevel(dB);
}

float Map2AudioEngine::getIntelliFXChorusLevel() const {
    return intellifx_.getChorusLevel();
}

void Map2AudioEngine::setIntelliFXDirectLevelL(float dB) {
    intellifx_.setDirectLevelL(dB);
}

float Map2AudioEngine::getIntelliFXDirectLevelL() const {
    return intellifx_.getDirectLevelL();
}

void Map2AudioEngine::setIntelliFXDirectLevelR(float dB) {
    intellifx_.setDirectLevelR(dB);
}

float Map2AudioEngine::getIntelliFXDirectLevelR() const {
    return intellifx_.getDirectLevelR();
}

void Map2AudioEngine::setIntelliFXRegenL(float dB) {
    intellifx_.setRegenL(dB);
}

float Map2AudioEngine::getIntelliFXRegenL() const {
    return intellifx_.getRegenL();
}

void Map2AudioEngine::setIntelliFXRegenR(float dB) {
    intellifx_.setRegenR(dB);
}

float Map2AudioEngine::getIntelliFXRegenR() const {
    return intellifx_.getRegenR();
}

// HUSH
void Map2AudioEngine::setIntelliFXHushEnabled(bool enabled) {
    intellifx_.setHushEnabled(enabled);
}

bool Map2AudioEngine::isIntelliFXHushEnabled() const {
    return intellifx_.isHushEnabled();
}

void Map2AudioEngine::setIntelliFXHushThreshold(float dB) {
    intellifx_.setHushThreshold(dB);
}

float Map2AudioEngine::getIntelliFXHushThreshold() const {
    return intellifx_.getHushThreshold();
}

void Map2AudioEngine::setIntelliFXHushReleaseRate(float ms) {
    intellifx_.setHushReleaseRate(ms);
}

float Map2AudioEngine::getIntelliFXHushReleaseRate() const {
    return intellifx_.getHushReleaseRate();
}

IntelliFX8VoiceChorusProcessor::HushParameters
Map2AudioEngine::getIntelliFXHushParameters() const {
    return intellifx_.getHushParameters();
}

void Map2AudioEngine::setIntelliFXHushParameters(
    const IntelliFX8VoiceChorusProcessor::HushParameters& params) {
    intellifx_.setHushParameters(params);
}

// Master control
void Map2AudioEngine::setIntelliFXBypass(bool bypass) {
    intellifx_.setBypass(bypass);
}

bool Map2AudioEngine::isIntelliFXBypassed() const {
    return intellifx_.isBypassed();
}

// Bulk parameters
IntelliFX8VoiceChorusProcessor::Parameters
Map2AudioEngine::getIntelliFXParameters() const {
    return intellifx_.getParameters();
}

void Map2AudioEngine::setIntelliFXParameters(
    const IntelliFX8VoiceChorusProcessor::Parameters& params) {
    intellifx_.setParameters(params);
}

// Presets
int Map2AudioEngine::getIntelliFXNumPresets() {
    return IntelliFX8VoiceChorusProcessor::getNumPresets();
}

IntelliFX8VoiceChorusProcessor::PresetInfo
Map2AudioEngine::getIntelliFXPresetInfo(int index) {
    return IntelliFX8VoiceChorusProcessor::getPresetInfo(index);
}

void Map2AudioEngine::loadIntelliFXPreset(int index) {
    intellifx_.loadPreset(index);
}

int Map2AudioEngine::getIntelliFXCurrentPreset() const {
    return intellifx_.getCurrentPreset();
}

// Metering
IntelliFX8VoiceChorusProcessor::Metering
Map2AudioEngine::getIntelliFXMetering() const {
    return intellifx_.getMetering();
}

// ========================================
// Stereo Delay
// ========================================

void Map2AudioEngine::setDelayTimeL(float ms) { delay_.setDelayTimeL(ms); }
float Map2AudioEngine::getDelayTimeL() const { return delay_.getDelayTimeL(); }
void Map2AudioEngine::setDelayTimeR(float ms) { delay_.setDelayTimeR(ms); }
float Map2AudioEngine::getDelayTimeR() const { return delay_.getDelayTimeR(); }
void Map2AudioEngine::setDelayFeedback(float percent) { delay_.setFeedback(percent); }
float Map2AudioEngine::getDelayFeedback() const { return delay_.getFeedback(); }
void Map2AudioEngine::setDelayMix(float percent) { delay_.setMix(percent); }
float Map2AudioEngine::getDelayMix() const { return delay_.getMix(); }
void Map2AudioEngine::setDelayTempo(float bpm) { delay_.setTempo(bpm); }
float Map2AudioEngine::getDelayTempo() const { return delay_.getTempo(); }
void Map2AudioEngine::setDelayTempoSyncL(int division) {
    delay_.setTempoSyncL(static_cast<DelayProcessor::TempoDivision>(std::clamp(division, 0, 16)));
}
int Map2AudioEngine::getDelayTempoSyncL() const {
    return static_cast<int>(delay_.getTempoSyncL());
}
void Map2AudioEngine::setDelayTempoSyncR(int division) {
    delay_.setTempoSyncR(static_cast<DelayProcessor::TempoDivision>(std::clamp(division, 0, 16)));
}
int Map2AudioEngine::getDelayTempoSyncR() const {
    return static_cast<int>(delay_.getTempoSyncR());
}
void Map2AudioEngine::setDelayTap1Level(float percent) { delay_.setTap1Level(percent); }
void Map2AudioEngine::setDelayTap2Level(float percent) { delay_.setTap2Level(percent); }
void Map2AudioEngine::setDelayTap2Ratio(float ratio) { delay_.setTap2Ratio(ratio); }
void Map2AudioEngine::setDelayTap3Level(float percent) { delay_.setTap3Level(percent); }
void Map2AudioEngine::setDelayTap3Ratio(float ratio) { delay_.setTap3Ratio(ratio); }
void Map2AudioEngine::setDelayTap4Level(float percent) { delay_.setTap4Level(percent); }
void Map2AudioEngine::setDelayTap4Ratio(float ratio) { delay_.setTap4Ratio(ratio); }
void Map2AudioEngine::setDelayStereoMode(int mode) {
    delay_.setStereoMode(static_cast<DelayProcessor::StereoMode>(std::clamp(mode, 0, 3)));
}
int Map2AudioEngine::getDelayStereoMode() const {
    return static_cast<int>(delay_.getStereoMode());
}
void Map2AudioEngine::setDelayStereoSpread(float percent) { delay_.setStereoSpread(percent); }
float Map2AudioEngine::getDelayStereoSpread() const { return delay_.getStereoSpread(); }
void Map2AudioEngine::setDelayPan(float pan) { delay_.setPan(pan); }
float Map2AudioEngine::getDelayPan() const { return delay_.getPan(); }
void Map2AudioEngine::setDelayModRate(float hz) { delay_.setModRate(hz); }
float Map2AudioEngine::getDelayModRate() const { return delay_.getModRate(); }
void Map2AudioEngine::setDelayModDepth(float percent) { delay_.setModDepth(percent); }
float Map2AudioEngine::getDelayModDepth() const { return delay_.getModDepth(); }
void Map2AudioEngine::setDelayModWaveform(int waveform) {
    delay_.setModWaveform(static_cast<DelayProcessor::ModWaveform>(std::clamp(waveform, 0, 2)));
}
int Map2AudioEngine::getDelayModWaveform() const {
    return static_cast<int>(delay_.getModWaveform());
}
void Map2AudioEngine::setDelayLowCut(float hz) { delay_.setLowCut(hz); }
float Map2AudioEngine::getDelayLowCut() const { return delay_.getLowCut(); }
void Map2AudioEngine::setDelayHighCut(float hz) { delay_.setHighCut(hz); }
float Map2AudioEngine::getDelayHighCut() const { return delay_.getHighCut(); }
void Map2AudioEngine::setDelayFilterInLoop(bool enabled) { delay_.setFilterInLoop(enabled); }
bool Map2AudioEngine::getDelayFilterInLoop() const { return delay_.getFilterInLoop(); }
void Map2AudioEngine::setDelayDiffusion(float percent) { delay_.setDiffusion(percent); }
float Map2AudioEngine::getDelayDiffusion() const { return delay_.getDiffusion(); }
void Map2AudioEngine::setDelayDuckThreshold(float db) { delay_.setDuckThreshold(db); }
float Map2AudioEngine::getDelayDuckThreshold() const { return delay_.getDuckThreshold(); }
void Map2AudioEngine::setDelayDuckAmount(float percent) { delay_.setDuckAmount(percent); }
float Map2AudioEngine::getDelayDuckAmount() const { return delay_.getDuckAmount(); }
void Map2AudioEngine::setDelayDuckRelease(float ms) { delay_.setDuckRelease(ms); }
float Map2AudioEngine::getDelayDuckRelease() const { return delay_.getDuckRelease(); }
void Map2AudioEngine::setDelayOutputLevel(float db) { delay_.setOutputLevel(db); }
float Map2AudioEngine::getDelayOutputLevel() const { return delay_.getOutputLevel(); }
void Map2AudioEngine::setDelaySpillover(bool enabled) { delay_.setSpillover(enabled); }
bool Map2AudioEngine::hasDelaySpillover() const { return delay_.getSpillover(); }
void Map2AudioEngine::setDelayBypass(bool bypass) { delay_.setBypass(bypass); }
bool Map2AudioEngine::isDelayBypassed() const { return delay_.isBypassed(); }
DelayProcessor::Parameters Map2AudioEngine::getDelayParameters() const { return delay_.getParameters(); }
void Map2AudioEngine::setDelayParameters(const DelayProcessor::Parameters& params) { delay_.setParameters(params); }
bool Map2AudioEngine::stageDelaySpillover() {
    cleanupExpiredNativeSpillovers();

    const auto params = delay_.getParameters();
    if (params.bypass || !params.spillover || params.mix <= 0.0f) {
        return false;
    }

    auto processor = delay_.cloneForSpillover();
    if (!processor) {
        return false;
    }

    const double estimatedTailSeconds = estimateDelayTailSeconds(params);
    if (estimatedTailSeconds <= 0.0) {
        return false;
    }

    processor->setSpillover(true);
    processor->setBypass(true);

    auto spillover = std::make_shared<DelaySpilloverState>();
    spillover->id = nextNativeSpilloverId_++;
    spillover->processor = std::move(processor);
    spillover->estimatedTailSeconds = estimatedTailSeconds;
    spillover->remainingSamples.store(
        static_cast<int64_t>(std::ceil(estimatedTailSeconds * sampleRate_)),
        std::memory_order_relaxed);
    spillover->expired.store(false, std::memory_order_relaxed);

    std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
    delaySpillovers_.push_back(std::move(spillover));
    return true;
}
DelayProcessor::Metering Map2AudioEngine::getDelayMetering() const { return delay_.getMetering(); }

// ========================================
// Boss XS-1 Polyphonic Pitch Shifter
// ========================================

void Map2AudioEngine::setBossXS1ShiftAmount(float semitones) {
    auto params = bossXS1_.getParameters();
    params.shiftAmount = semitones;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1ShiftAmount() const {
    return bossXS1_.getParameters().shiftAmount;
}

void Map2AudioEngine::setBossXS1Balance(float percent) {
    auto params = bossXS1_.getParameters();
    params.balance = percent;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Balance() const {
    return bossXS1_.getParameters().balance;
}

void Map2AudioEngine::setBossXS1DetuneMode(bool enabled) {
    auto params = bossXS1_.getParameters();
    params.detuneMode = enabled;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1DetuneMode() const {
    return bossXS1_.getParameters().detuneMode;
}

void Map2AudioEngine::setBossXS1DetuneAmount(float cents) {
    auto params = bossXS1_.getParameters();
    params.detuneAmount = cents;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1DetuneAmount() const {
    return bossXS1_.getParameters().detuneAmount;
}

void Map2AudioEngine::setBossXS1Glide(float ms) {
    auto params = bossXS1_.getParameters();
    params.glide = ms;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Glide() const {
    return bossXS1_.getParameters().glide;
}

void Map2AudioEngine::setBossXS1Feedback(float feedback) {
    auto params = bossXS1_.getParameters();
    params.feedback = feedback;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Feedback() const {
    return bossXS1_.getParameters().feedback;
}

void Map2AudioEngine::setBossXS1PedalEnabled(bool enabled) {
    auto params = bossXS1_.getParameters();
    params.pedalEnabled = enabled;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1PedalEnabled() const {
    return bossXS1_.getParameters().pedalEnabled;
}

void Map2AudioEngine::setBossXS1PedalPosition(float position) {
    auto params = bossXS1_.getParameters();
    params.pedalPosition = position;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1PedalPosition() const {
    return bossXS1_.getParameters().pedalPosition;
}

void Map2AudioEngine::setBossXS1PedalRange(float minSemitones, float maxSemitones) {
    auto params = bossXS1_.getParameters();
    params.pedalMin = minSemitones;
    params.pedalMax = maxSemitones;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1PedalMin() const {
    return bossXS1_.getParameters().pedalMin;
}

float Map2AudioEngine::getBossXS1PedalMax() const {
    return bossXS1_.getParameters().pedalMax;
}

void Map2AudioEngine::setBossXS1Preset(BossXS1PolyShifterProcessor::Preset preset) {
    bossXS1_.loadPreset(preset);
}

BossXS1PolyShifterProcessor::Preset Map2AudioEngine::getBossXS1Preset() const {
    return bossXS1_.getParameters().preset;
}

void Map2AudioEngine::setBossXS1Bypass(bool bypass) {
    auto params = bossXS1_.getParameters();
    params.bypass = bypass;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1Bypassed() const {
    return bossXS1_.getParameters().bypass;
}

BossXS1PolyShifterProcessor::Parameters Map2AudioEngine::getBossXS1Parameters() const {
    return bossXS1_.getParameters();
}

void Map2AudioEngine::setBossXS1Parameters(const BossXS1PolyShifterProcessor::Parameters& params) {
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1InputLevel() const {
    return bossXS1_.getInputLevel();
}

float Map2AudioEngine::getBossXS1OutputLevel() const {
    return bossXS1_.getOutputLevel();
}

const char* Map2AudioEngine::getBossXS1PresetName(BossXS1PolyShifterProcessor::Preset preset) {
    return BossXS1PolyShifterProcessor::getPresetName(preset);
}

int Map2AudioEngine::getBossXS1NumPresets() {
    return static_cast<int>(BossXS1PolyShifterProcessor::Preset::NumPresets);
}

// ========================================
// ShoeGaze Multi-Effect Processor
// ========================================

// Primary controls
void Map2AudioEngine::setShoeGazeAtmosphere(float percent) {
    shoegaze_.setAtmosphere(percent);
}

float Map2AudioEngine::getShoeGazeAtmosphere() const {
    return shoegaze_.getAtmosphere();
}

void Map2AudioEngine::setShoeGazeDecay(float seconds) {
    shoegaze_.setDecay(seconds);
}

float Map2AudioEngine::getShoeGazeDecay() const {
    return shoegaze_.getDecay();
}

void Map2AudioEngine::setShoeGazeShimmer(float percent) {
    shoegaze_.setShimmer(percent);
}

float Map2AudioEngine::getShoeGazeShimmer() const {
    return shoegaze_.getShimmer();
}

void Map2AudioEngine::setShoeGazeShimmerPitch(float semitones) {
    shoegaze_.setShimmerPitch(semitones);
}

float Map2AudioEngine::getShoeGazeShimmerPitch() const {
    return shoegaze_.getShimmerPitch();
}

void Map2AudioEngine::setShoeGazeModulation(float percent) {
    shoegaze_.setModulation(percent);
}

float Map2AudioEngine::getShoeGazeModulation() const {
    return shoegaze_.getModulation();
}

void Map2AudioEngine::setShoeGazeModRate(float hz) {
    shoegaze_.setModRate(hz);
}

float Map2AudioEngine::getShoeGazeModRate() const {
    return shoegaze_.getModRate();
}

void Map2AudioEngine::setShoeGazeDrive(float percent) {
    shoegaze_.setDrive(percent);
}

float Map2AudioEngine::getShoeGazeDrive() const {
    return shoegaze_.getDrive();
}

void Map2AudioEngine::setShoeGazeDelayTime(float ms) {
    shoegaze_.setDelayTime(ms);
}

float Map2AudioEngine::getShoeGazeDelayTime() const {
    return shoegaze_.getDelayTime();
}

void Map2AudioEngine::setShoeGazeDelayFeedback(float percent) {
    shoegaze_.setDelayFeedback(percent);
}

float Map2AudioEngine::getShoeGazeDelayFeedback() const {
    return shoegaze_.getDelayFeedback();
}

void Map2AudioEngine::setShoeGazeDelayMod(float percent) {
    shoegaze_.setDelayMod(percent);
}

float Map2AudioEngine::getShoeGazeDelayMod() const {
    return shoegaze_.getDelayMod();
}

void Map2AudioEngine::setShoeGazeLowCut(float hz) {
    shoegaze_.setLowCut(hz);
}

float Map2AudioEngine::getShoeGazeLowCut() const {
    return shoegaze_.getLowCut();
}

void Map2AudioEngine::setShoeGazeHighCut(float hz) {
    shoegaze_.setHighCut(hz);
}

float Map2AudioEngine::getShoeGazeHighCut() const {
    return shoegaze_.getHighCut();
}

void Map2AudioEngine::setShoeGazeMix(float percent) {
    shoegaze_.setMix(percent);
}

float Map2AudioEngine::getShoeGazeMix() const {
    return shoegaze_.getMix();
}

void Map2AudioEngine::setShoeGazeStereoWidth(float percent) {
    shoegaze_.setStereoWidth(percent);
}

float Map2AudioEngine::getShoeGazeStereoWidth() const {
    return shoegaze_.getStereoWidth();
}

// Advanced controls
void Map2AudioEngine::setShoeGazeReverbDiffusion(float percent) {
    shoegaze_.setReverbDiffusion(percent);
}

float Map2AudioEngine::getShoeGazeReverbDiffusion() const {
    return shoegaze_.getReverbDiffusion();
}

void Map2AudioEngine::setShoeGazeReverbDamping(float percent) {
    shoegaze_.setReverbDamping(percent);
}

float Map2AudioEngine::getShoeGazeReverbDamping() const {
    return shoegaze_.getReverbDamping();
}

void Map2AudioEngine::setShoeGazeShimmerFeedback(float percent) {
    shoegaze_.setShimmerFeedback(percent);
}

float Map2AudioEngine::getShoeGazeShimmerFeedback() const {
    return shoegaze_.getShimmerFeedback();
}

void Map2AudioEngine::setShoeGazeChorusVoices(int voices) {
    shoegaze_.setChorusVoices(voices);
}

int Map2AudioEngine::getShoeGazeChorusVoices() const {
    return shoegaze_.getChorusVoices();
}

void Map2AudioEngine::setShoeGazeDucking(float percent) {
    shoegaze_.setDucking(percent);
}

float Map2AudioEngine::getShoeGazeDucking() const {
    return shoegaze_.getDucking();
}

// State control
void Map2AudioEngine::setShoeGazePreset(ShoeGazeProcessor::Preset preset) {
    shoegaze_.setPreset(preset);
}

ShoeGazeProcessor::Preset Map2AudioEngine::getShoeGazePreset() const {
    return shoegaze_.getPreset();
}

void Map2AudioEngine::setShoeGazeBypass(bool bypass) {
    shoegaze_.setBypass(bypass);
}

bool Map2AudioEngine::isShoeGazeBypassed() const {
    return shoegaze_.isBypassed();
}

void Map2AudioEngine::setShoeGazeSpillover(bool enabled) {
    shoegaze_.setSpillover(enabled);
}

bool Map2AudioEngine::hasShoeGazeSpillover() const {
    return shoegaze_.hasSpillover();
}

bool Map2AudioEngine::stageShoeGazeSpillover() {
    cleanupExpiredNativeSpillovers();

    const auto params = shoegaze_.getParameters();
    if (params.bypass || !params.spillover || params.mix <= 0.0f) {
        return false;
    }

    auto processor = shoegaze_.cloneForSpillover();
    if (!processor) {
        return false;
    }

    const double estimatedTailSeconds = estimateShoeGazeTailSeconds(params);
    if (estimatedTailSeconds <= 0.0) {
        return false;
    }

    processor->setSpillover(true);
    processor->setBypass(true);

    auto spillover = std::make_shared<ShoeGazeSpilloverState>();
    spillover->id = nextNativeSpilloverId_++;
    spillover->processor = std::move(processor);
    spillover->estimatedTailSeconds = estimatedTailSeconds;
    spillover->remainingSamples.store(
        static_cast<int64_t>(std::ceil(estimatedTailSeconds * sampleRate_)),
        std::memory_order_relaxed);
    spillover->expired.store(false, std::memory_order_relaxed);

    std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
    shoegazeSpillovers_.push_back(std::move(spillover));
    return true;
}

// Bulk parameters
ShoeGazeProcessor::Parameters Map2AudioEngine::getShoeGazeParameters() const {
    return shoegaze_.getParameters();
}

void Map2AudioEngine::setShoeGazeParameters(const ShoeGazeProcessor::Parameters& params) {
    shoegaze_.setParameters(params);
}

// Metering
ShoeGazeProcessor::Metering Map2AudioEngine::getShoeGazeMetering() const {
    return shoegaze_.getMetering();
}

// Preset info
ShoeGazeProcessor::PresetInfo Map2AudioEngine::getShoeGazePresetInfo(ShoeGazeProcessor::Preset preset) {
    return ShoeGazeProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getShoeGazeNumPresets() {
    return ShoeGazeProcessor::getNumPresets();
}

// ========================================
// Lexi Love PCM 70 Reverb
// ========================================

// Algorithm control
void Map2AudioEngine::setLexiLoveAlgorithm(int algorithmIndex) {
    lexiLove_.setAlgorithm(algorithmIndex);
}

void Map2AudioEngine::setLexiLoveAlgorithm(LexiLoveProcessor::Algorithm algorithm) {
    lexiLove_.setAlgorithm(algorithm);
}

int Map2AudioEngine::getLexiLoveAlgorithm() const {
    return static_cast<int>(lexiLove_.getAlgorithm());
}

// Core parameters
void Map2AudioEngine::setLexiLovePreDelay(float ms) {
    lexiLove_.setPreDelay(ms);
}

float Map2AudioEngine::getLexiLovePreDelay() const {
    return lexiLove_.getPreDelay();
}

void Map2AudioEngine::setLexiLoveDecayTime(float seconds) {
    lexiLove_.setDecayTime(seconds);
}

float Map2AudioEngine::getLexiLoveDecayTime() const {
    return lexiLove_.getDecayTime();
}

void Map2AudioEngine::setLexiLoveDiffusion(float percent) {
    lexiLove_.setDiffusion(percent);
}

float Map2AudioEngine::getLexiLoveDiffusion() const {
    return lexiLove_.getDiffusion();
}

void Map2AudioEngine::setLexiLoveMix(float percent) {
    lexiLove_.setMix(percent);
}

float Map2AudioEngine::getLexiLoveMix() const {
    return lexiLove_.getMix();
}

void Map2AudioEngine::setLexiLoveHighCut(float hz) {
    lexiLove_.setHighCut(hz);
}

float Map2AudioEngine::getLexiLoveHighCut() const {
    return lexiLove_.getHighCut();
}

void Map2AudioEngine::setLexiLoveLowCut(float hz) {
    lexiLove_.setLowCut(hz);
}

float Map2AudioEngine::getLexiLoveLowCut() const {
    return lexiLove_.getLowCut();
}

// Multi-band decay
void Map2AudioEngine::setLexiLoveLowDecayMult(float mult) {
    lexiLove_.setLowDecayMult(mult);
}

float Map2AudioEngine::getLexiLoveLowDecayMult() const {
    return lexiLove_.getLowDecayMult();
}

void Map2AudioEngine::setLexiLoveHighDecayMult(float mult) {
    lexiLove_.setHighDecayMult(mult);
}

float Map2AudioEngine::getLexiLoveHighDecayMult() const {
    return lexiLove_.getHighDecayMult();
}

void Map2AudioEngine::setLexiLoveLowCrossover(float hz) {
    lexiLove_.setLowCrossover(hz);
}

float Map2AudioEngine::getLexiLoveLowCrossover() const {
    return lexiLove_.getLowCrossover();
}

void Map2AudioEngine::setLexiLoveHighCrossover(float hz) {
    lexiLove_.setHighCrossover(hz);
}

float Map2AudioEngine::getLexiLoveHighCrossover() const {
    return lexiLove_.getHighCrossover();
}

// Early reflections
void Map2AudioEngine::setLexiLoveEarlyLevel(float percent) {
    lexiLove_.setEarlyLevel(percent);
}

float Map2AudioEngine::getLexiLoveEarlyLevel() const {
    return lexiLove_.getEarlyLevel();
}

void Map2AudioEngine::setLexiLoveEarlyPattern(float percent) {
    lexiLove_.setEarlyPattern(percent);
}

float Map2AudioEngine::getLexiLoveEarlyPattern() const {
    return lexiLove_.getEarlyPattern();
}

// Modulation
void Map2AudioEngine::setLexiLoveModDepth(float percent) {
    lexiLove_.setModDepth(percent);
}

float Map2AudioEngine::getLexiLoveModDepth() const {
    return lexiLove_.getModDepth();
}

void Map2AudioEngine::setLexiLoveModRate(float hz) {
    lexiLove_.setModRate(hz);
}

float Map2AudioEngine::getLexiLoveModRate() const {
    return lexiLove_.getModRate();
}

// State control
void Map2AudioEngine::setLexiLoveBypass(bool bypass) {
    lexiLove_.setBypass(bypass);
}

bool Map2AudioEngine::isLexiLoveBypassed() const {
    return lexiLove_.isBypassed();
}

void Map2AudioEngine::setLexiLoveSpillover(bool enabled) {
    lexiLove_.setSpillover(enabled);
}

bool Map2AudioEngine::hasLexiLoveSpillover() const {
    return lexiLove_.hasSpillover();
}

bool Map2AudioEngine::stageLexiLoveSpillover() {
    cleanupExpiredNativeSpillovers();

    const auto params = lexiLove_.getParameters();
    if (params.bypass || !params.spillover || params.mix <= 0.0f) {
        return false;
    }

    auto processor = lexiLove_.cloneForSpillover();
    if (!processor) {
        return false;
    }

    const double estimatedTailSeconds = estimateLexiLoveTailSeconds(params);
    if (estimatedTailSeconds <= 0.0) {
        return false;
    }

    processor->setSpillover(true);
    processor->setBypass(true);

    auto spillover = std::make_shared<LexiLoveSpilloverState>();
    spillover->id = nextNativeSpilloverId_++;
    spillover->processor = std::move(processor);
    spillover->estimatedTailSeconds = estimatedTailSeconds;
    spillover->remainingSamples.store(
        static_cast<int64_t>(std::ceil(estimatedTailSeconds * sampleRate_)),
        std::memory_order_relaxed);
    spillover->expired.store(false, std::memory_order_relaxed);

    std::lock_guard<std::mutex> lock(nativeSpilloverMutex_);
    lexiLoveSpillovers_.push_back(std::move(spillover));
    return true;
}

// Bulk parameters
LexiLoveProcessor::Parameters Map2AudioEngine::getLexiLoveParameters() const {
    return lexiLove_.getParameters();
}

void Map2AudioEngine::setLexiLoveParameters(const LexiLoveProcessor::Parameters& params) {
    lexiLove_.setParameters(params);
}

// Metering
LexiLoveProcessor::Metering Map2AudioEngine::getLexiLoveMetering() const {
    return lexiLove_.getMetering();
}

// Algorithm info
LexiLoveProcessor::AlgorithmInfo Map2AudioEngine::getLexiLoveAlgorithmInfo(int algorithmIndex) {
    return LexiLoveProcessor::getAlgorithmInfo(algorithmIndex);
}

int Map2AudioEngine::getLexiLoveNumAlgorithms() {
    return LexiLoveProcessor::getNumAlgorithms();
}

// ========================================
// Ultra-Harmonizer Implementation
// ========================================

// Algorithm
void Map2AudioEngine::setH3000Algorithm(int algorithmIndex) {
    h3000_.setAlgorithm(algorithmIndex);
}

void Map2AudioEngine::setH3000Algorithm(H3000Processor::Algorithm algorithm) {
    h3000_.setAlgorithm(algorithm);
}

int Map2AudioEngine::getH3000Algorithm() const {
    return h3000_.getAlgorithmIndex();
}

// Pitch
void Map2AudioEngine::setH3000PitchL(float cents) {
    h3000_.setPitchL(cents);
}

float Map2AudioEngine::getH3000PitchL() const {
    return h3000_.getPitchL();
}

void Map2AudioEngine::setH3000PitchR(float cents) {
    h3000_.setPitchR(cents);
}

float Map2AudioEngine::getH3000PitchR() const {
    return h3000_.getPitchR();
}

// Delay
void Map2AudioEngine::setH3000DelayL(float ms) {
    h3000_.setDelayL(ms);
}

float Map2AudioEngine::getH3000DelayL() const {
    return h3000_.getDelayL();
}

void Map2AudioEngine::setH3000DelayR(float ms) {
    h3000_.setDelayR(ms);
}

float Map2AudioEngine::getH3000DelayR() const {
    return h3000_.getDelayR();
}

// Feedback
void Map2AudioEngine::setH3000Feedback(float percent) {
    h3000_.setFeedback(percent);
}

float Map2AudioEngine::getH3000Feedback() const {
    return h3000_.getFeedback();
}

void Map2AudioEngine::setH3000CrossFeedback(float percent) {
    h3000_.setCrossFeedback(percent);
}

float Map2AudioEngine::getH3000CrossFeedback() const {
    return h3000_.getCrossFeedback();
}

// Modulation
void Map2AudioEngine::setH3000ModDepth(float percent) {
    h3000_.setModDepth(percent);
}

float Map2AudioEngine::getH3000ModDepth() const {
    return h3000_.getModDepth();
}

void Map2AudioEngine::setH3000ModRate(float hz) {
    h3000_.setModRate(hz);
}

float Map2AudioEngine::getH3000ModRate() const {
    return h3000_.getModRate();
}

// Filters
void Map2AudioEngine::setH3000LowCut(float hz) {
    h3000_.setLowCut(hz);
}

float Map2AudioEngine::getH3000LowCut() const {
    return h3000_.getLowCut();
}

void Map2AudioEngine::setH3000HighCut(float hz) {
    h3000_.setHighCut(hz);
}

float Map2AudioEngine::getH3000HighCut() const {
    return h3000_.getHighCut();
}

// Levels
void Map2AudioEngine::setH3000Mix(float percent) {
    h3000_.setMix(percent);
}

float Map2AudioEngine::getH3000Mix() const {
    return h3000_.getMix();
}

void Map2AudioEngine::setH3000LevelL(float percent) {
    h3000_.setLevelL(percent);
}

float Map2AudioEngine::getH3000LevelL() const {
    return h3000_.getLevelL();
}

void Map2AudioEngine::setH3000LevelR(float percent) {
    h3000_.setLevelR(percent);
}

float Map2AudioEngine::getH3000LevelR() const {
    return h3000_.getLevelR();
}

// State
void Map2AudioEngine::setH3000Bypass(bool bypass) {
    h3000_.setBypass(bypass);
}

bool Map2AudioEngine::isH3000Bypassed() const {
    return h3000_.isBypassed();
}

void Map2AudioEngine::setH3000Glide(float ms) {
    h3000_.setGlide(ms);
}

float Map2AudioEngine::getH3000Glide() const {
    return h3000_.getGlide();
}

// Bulk parameters
H3000Processor::Parameters Map2AudioEngine::getH3000Parameters() const {
    return h3000_.getParameters();
}

void Map2AudioEngine::setH3000Parameters(const H3000Processor::Parameters& params) {
    h3000_.setParameters(params);
}

// Metering
H3000Processor::Metering Map2AudioEngine::getH3000Metering() const {
    return h3000_.getMetering();
}

// Algorithm info
H3000Processor::AlgorithmInfo Map2AudioEngine::getH3000AlgorithmInfo(int algorithmIndex) {
    return H3000Processor::getAlgorithmInfo(algorithmIndex);
}

int Map2AudioEngine::getH3000NumAlgorithms() {
    return H3000Processor::getNumAlgorithms();
}

// ========================================
// Peavey 5150 Block Letter Amp Simulator
// ========================================

// Preamp controls
void Map2AudioEngine::setPeavey5150PreGain(float value) {
    peavey5150_.setPreGain(value);
}

float Map2AudioEngine::getPeavey5150PreGain() const {
    return peavey5150_.getPreGain();
}

void Map2AudioEngine::setPeavey5150PostGain(float value) {
    peavey5150_.setPostGain(value);
}

float Map2AudioEngine::getPeavey5150PostGain() const {
    return peavey5150_.getPostGain();
}

// Tone stack
void Map2AudioEngine::setPeavey5150Low(float value) {
    peavey5150_.setLow(value);
}

float Map2AudioEngine::getPeavey5150Low() const {
    return peavey5150_.getLow();
}

void Map2AudioEngine::setPeavey5150Mid(float value) {
    peavey5150_.setMid(value);
}

float Map2AudioEngine::getPeavey5150Mid() const {
    return peavey5150_.getMid();
}

void Map2AudioEngine::setPeavey5150High(float value) {
    peavey5150_.setHigh(value);
}

float Map2AudioEngine::getPeavey5150High() const {
    return peavey5150_.getHigh();
}

// Power amp
void Map2AudioEngine::setPeavey5150Presence(float value) {
    peavey5150_.setPresence(value);
}

float Map2AudioEngine::getPeavey5150Presence() const {
    return peavey5150_.getPresence();
}

void Map2AudioEngine::setPeavey5150Resonance(float value) {
    peavey5150_.setResonance(value);
}

float Map2AudioEngine::getPeavey5150Resonance() const {
    return peavey5150_.getResonance();
}

void Map2AudioEngine::setPeavey5150Bias(float value) {
    peavey5150_.setBias(value);
}

float Map2AudioEngine::getPeavey5150Bias() const {
    return peavey5150_.getBias();
}

// Switches
void Map2AudioEngine::setPeavey5150Bright(bool on) {
    peavey5150_.setBright(on);
}

bool Map2AudioEngine::getPeavey5150Bright() const {
    return peavey5150_.getBright();
}

// State
void Map2AudioEngine::setPeavey5150Preset(Peavey5150Processor::Preset preset) {
    peavey5150_.setPreset(preset);
}

Peavey5150Processor::Preset Map2AudioEngine::getPeavey5150Preset() const {
    return peavey5150_.getPreset();
}

void Map2AudioEngine::setPeavey5150Bypass(bool bypass) {
    peavey5150_.setBypass(bypass);
}

bool Map2AudioEngine::isPeavey5150Bypassed() const {
    return peavey5150_.isBypassed();
}

// Bulk parameters
Peavey5150Processor::Parameters Map2AudioEngine::getPeavey5150Parameters() const {
    return peavey5150_.getParameters();
}

void Map2AudioEngine::setPeavey5150Parameters(const Peavey5150Processor::Parameters& params) {
    peavey5150_.setParameters(params);
}

// Metering
Peavey5150Processor::Metering Map2AudioEngine::getPeavey5150Metering() const {
    return peavey5150_.getMetering();
}

// Preset info
Peavey5150Processor::PresetInfo Map2AudioEngine::getPeavey5150PresetInfo(Peavey5150Processor::Preset preset) {
    return Peavey5150Processor::getPresetInfo(preset);
}

int Map2AudioEngine::getPeavey5150NumPresets() {
    return Peavey5150Processor::getNumPresets();
}

// ========================================
// Tweed Bassman 5F6-A Amplifier Simulator
// ========================================

// Channel
void Map2AudioEngine::setTweedBassmanChannelMode(int mode) { tweedBassman_.setChannelMode(mode); }
int Map2AudioEngine::getTweedBassmanChannelMode() const { return tweedBassman_.getChannelMode(); }
void Map2AudioEngine::setTweedBassmanNormalVolume(float v) { tweedBassman_.setNormalVolume(v); }
float Map2AudioEngine::getTweedBassmanNormalVolume() const { return tweedBassman_.getNormalVolume(); }
void Map2AudioEngine::setTweedBassmanBrightVolume(float v) { tweedBassman_.setBrightVolume(v); }
float Map2AudioEngine::getTweedBassmanBrightVolume() const { return tweedBassman_.getBrightVolume(); }
void Map2AudioEngine::setTweedBassmanBrightCap(bool on) { tweedBassman_.setBrightCap(on); }
bool Map2AudioEngine::getTweedBassmanBrightCap() const { return tweedBassman_.getBrightCap(); }

// Preamp
void Map2AudioEngine::setTweedBassmanV1TubeType(int type) { tweedBassman_.setV1TubeType(type); }
int Map2AudioEngine::getTweedBassmanV1TubeType() const { return tweedBassman_.getV1TubeType(); }
void Map2AudioEngine::setTweedBassmanCathodeBypass(bool on) { tweedBassman_.setCathodeBypass(on); }
bool Map2AudioEngine::getTweedBassmanCathodeBypass() const { return tweedBassman_.getCathodeBypass(); }
void Map2AudioEngine::setTweedBassmanCathodeBias(int mode) { tweedBassman_.setCathodeBias(mode); }
int Map2AudioEngine::getTweedBassmanCathodeBias() const { return tweedBassman_.getCathodeBias(); }

// Tone
void Map2AudioEngine::setTweedBassmanTreble(float v) { tweedBassman_.setTreble(v); }
float Map2AudioEngine::getTweedBassmanTreble() const { return tweedBassman_.getTreble(); }
void Map2AudioEngine::setTweedBassmanMid(float v) { tweedBassman_.setMid(v); }
float Map2AudioEngine::getTweedBassmanMid() const { return tweedBassman_.getMid(); }
void Map2AudioEngine::setTweedBassmanBass(float v) { tweedBassman_.setBass(v); }
float Map2AudioEngine::getTweedBassmanBass() const { return tweedBassman_.getBass(); }
void Map2AudioEngine::setTweedBassmanRawSwitch(bool on) { tweedBassman_.setRawSwitch(on); }
bool Map2AudioEngine::getTweedBassmanRawSwitch() const { return tweedBassman_.getRawSwitch(); }

// Master
void Map2AudioEngine::setTweedBassmanMasterVolume(float v) { tweedBassman_.setMasterVolume(v); }
float Map2AudioEngine::getTweedBassmanMasterVolume() const { return tweedBassman_.getMasterVolume(); }

// Power amp
void Map2AudioEngine::setTweedBassmanPresence(float v) { tweedBassman_.setPresence(v); }
float Map2AudioEngine::getTweedBassmanPresence() const { return tweedBassman_.getPresence(); }
void Map2AudioEngine::setTweedBassmanNFBMode(int mode) { tweedBassman_.setNFBMode(mode); }
int Map2AudioEngine::getTweedBassmanNFBMode() const { return tweedBassman_.getNFBMode(); }
void Map2AudioEngine::setTweedBassmanPowerTubeType(int type) { tweedBassman_.setPowerTubeType(type); }
int Map2AudioEngine::getTweedBassmanPowerTubeType() const { return tweedBassman_.getPowerTubeType(); }
void Map2AudioEngine::setTweedBassmanBiasMode(int mode) { tweedBassman_.setBiasMode(mode); }
int Map2AudioEngine::getTweedBassmanBiasMode() const { return tweedBassman_.getBiasMode(); }
void Map2AudioEngine::setTweedBassmanRectifierType(int type) { tweedBassman_.setRectifierType(type); }
int Map2AudioEngine::getTweedBassmanRectifierType() const { return tweedBassman_.getRectifierType(); }

// Output
void Map2AudioEngine::setTweedBassmanOutputLevel(float dB) { tweedBassman_.setOutputLevel(dB); }
float Map2AudioEngine::getTweedBassmanOutputLevel() const { return tweedBassman_.getOutputLevel(); }
void Map2AudioEngine::setTweedBassmanCabinetEnabled(bool on) { tweedBassman_.setCabinetEnabled(on); }
bool Map2AudioEngine::getTweedBassmanCabinetEnabled() const { return tweedBassman_.getCabinetEnabled(); }
void Map2AudioEngine::setTweedBassmanCabinetIR(int index) { tweedBassman_.setCabinetIR(index); }
int Map2AudioEngine::getTweedBassmanCabinetIR() const { return tweedBassman_.getCabinetIR(); }

// State
void Map2AudioEngine::setTweedBassmanPreset(TweedBassmanProcessor::Preset preset) { tweedBassman_.setPreset(preset); }
TweedBassmanProcessor::Preset Map2AudioEngine::getTweedBassmanPreset() const { return tweedBassman_.getPreset(); }
void Map2AudioEngine::setTweedBassmanBypass(bool bypass) { tweedBassman_.setBypass(bypass); }
bool Map2AudioEngine::isTweedBassmanBypassed() const { return tweedBassman_.isBypassed(); }

// Bulk
TweedBassmanProcessor::Parameters Map2AudioEngine::getTweedBassmanParameters() const { return tweedBassman_.getParameters(); }
void Map2AudioEngine::setTweedBassmanParameters(const TweedBassmanProcessor::Parameters& params) { tweedBassman_.setParameters(params); }

// Metering
TweedBassmanProcessor::Metering Map2AudioEngine::getTweedBassmanMetering() const { return tweedBassman_.getMetering(); }

// Preset info
TweedBassmanProcessor::PresetInfo Map2AudioEngine::getTweedBassmanPresetInfo(TweedBassmanProcessor::Preset preset) {
    return TweedBassmanProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getTweedBassmanNumPresets() {
    return TweedBassmanProcessor::getNumPresets();
}

// ========================================
// PassionFX Multi-Effect Processor
// ========================================

// NoiseGate
void Map2AudioEngine::setPassionFXGateEnabled(bool enabled) { passionFX_.setNoiseGateEnabled(enabled); }
void Map2AudioEngine::setPassionFXGateThreshold(float dB) { passionFX_.setNoiseGateThreshold(dB); }
void Map2AudioEngine::setPassionFXGateRelease(float ms) { passionFX_.setNoiseGateRelease(ms); }

// Compressor
void Map2AudioEngine::setPassionFXCompEnabled(bool enabled) { passionFX_.setCompressorEnabled(enabled); }
void Map2AudioEngine::setPassionFXCompThreshold(float dB) { passionFX_.setCompressorThreshold(dB); }
void Map2AudioEngine::setPassionFXCompRatio(float ratio) { passionFX_.setCompressorRatio(ratio); }
void Map2AudioEngine::setPassionFXCompAttack(float ms) { passionFX_.setCompressorAttack(ms); }
void Map2AudioEngine::setPassionFXCompRelease(float ms) { passionFX_.setCompressorRelease(ms); }
void Map2AudioEngine::setPassionFXCompGlassy(bool glassy) { passionFX_.setCompressorGlassy(glassy); }

// Wah
void Map2AudioEngine::setPassionFXWahEnabled(bool enabled) { passionFX_.setWahEnabled(enabled); }
void Map2AudioEngine::setPassionFXWahMode(int mode) { passionFX_.setWahMode(mode); }
void Map2AudioEngine::setPassionFXWahPosition(float position) { passionFX_.setWahPosition(position); }
void Map2AudioEngine::setPassionFXWahQ(float q) { passionFX_.setWahQ(q); }

// Phaser
void Map2AudioEngine::setPassionFXPhaserEnabled(bool enabled) { passionFX_.setPhaserEnabled(enabled); }
void Map2AudioEngine::setPassionFXPhaserRate(float hz) { passionFX_.setPhaserRate(hz); }
void Map2AudioEngine::setPassionFXPhaserDepth(float depth) { passionFX_.setPhaserDepth(depth); }
void Map2AudioEngine::setPassionFXPhaserStages(int stages) { passionFX_.setPhaserStages(stages); }
void Map2AudioEngine::setPassionFXPhaserFeedback(float feedback) { passionFX_.setPhaserFeedback(feedback); }

// Chorus
void Map2AudioEngine::setPassionFXChorusEnabled(bool enabled) { passionFX_.setChorusEnabled(enabled); }
void Map2AudioEngine::setPassionFXChorusRate(float hz) { passionFX_.setChorusRate(hz); }
void Map2AudioEngine::setPassionFXChorusDepth(float depth) { passionFX_.setChorusDepth(depth); }
void Map2AudioEngine::setPassionFXChorusVoices(int voices) { passionFX_.setChorusVoices(voices); }
void Map2AudioEngine::setPassionFXChorusMix(float mix) { passionFX_.setChorusMix(mix); }

// PitchShifter
void Map2AudioEngine::setPassionFXPitchEnabled(bool enabled) { passionFX_.setPitchShifterEnabled(enabled); }
void Map2AudioEngine::setPassionFXPitchSemitones(float semitones) { passionFX_.setPitchShifterSemitones(semitones); }
void Map2AudioEngine::setPassionFXPitchMix(float mix) { passionFX_.setPitchShifterMix(mix); }

// Harmonizer
void Map2AudioEngine::setPassionFXHarmEnabled(bool enabled) { passionFX_.setHarmonizerEnabled(enabled); }
void Map2AudioEngine::setPassionFXHarmVoice1(float semitones) { passionFX_.setHarmonizerVoice1(semitones); }
void Map2AudioEngine::setPassionFXHarmVoice2(float semitones) { passionFX_.setHarmonizerVoice2(semitones); }
void Map2AudioEngine::setPassionFXHarmDetune(float cents) { passionFX_.setHarmonizerDetune(cents); }
void Map2AudioEngine::setPassionFXHarmMix(float mix) { passionFX_.setHarmonizerMix(mix); }

// Delay
void Map2AudioEngine::setPassionFXDelayEnabled(bool enabled) { passionFX_.setDelayEnabled(enabled); }
void Map2AudioEngine::setPassionFXDelayTimeL(float ms) { passionFX_.setDelayTimeL(ms); }
void Map2AudioEngine::setPassionFXDelayTimeR(float ms) { passionFX_.setDelayTimeR(ms); }
void Map2AudioEngine::setPassionFXDelayFeedback(float feedback) { passionFX_.setDelayFeedback(feedback); }
void Map2AudioEngine::setPassionFXDelayMix(float mix) { passionFX_.setDelayMix(mix); }
void Map2AudioEngine::setPassionFXDelayFreeze(bool freeze) { passionFX_.setDelayFreeze(freeze); }
void Map2AudioEngine::setPassionFXDelayPitchShiftL(float semitones) { passionFX_.setDelayPitchShiftL(semitones); }
void Map2AudioEngine::setPassionFXDelayPitchShiftR(float semitones) { passionFX_.setDelayPitchShiftR(semitones); }

// Reverb
void Map2AudioEngine::setPassionFXReverbEnabled(bool enabled) { passionFX_.setReverbEnabled(enabled); }
void Map2AudioEngine::setPassionFXReverbType(int type) { passionFX_.setReverbType(type); }
void Map2AudioEngine::setPassionFXReverbDecay(float seconds) { passionFX_.setReverbDecay(seconds); }
void Map2AudioEngine::setPassionFXReverbShimmerAmount(float amount) { passionFX_.setReverbShimmerAmount(amount); }
void Map2AudioEngine::setPassionFXReverbShimmerInterval(float semitones) { passionFX_.setReverbShimmerInterval(semitones); }
void Map2AudioEngine::setPassionFXReverbMix(float mix) { passionFX_.setReverbMix(mix); }
void Map2AudioEngine::setPassionFXReverbFreeze(bool freeze) { passionFX_.setReverbFreeze(freeze); }

// EQ
void Map2AudioEngine::setPassionFXEqEnabled(bool enabled) { passionFX_.setEqEnabled(enabled); }
void Map2AudioEngine::setPassionFXEqLowGain(float dB) { passionFX_.setEqLowGain(dB); }
void Map2AudioEngine::setPassionFXEqMidGain(float dB) { passionFX_.setEqMidGain(dB); }
void Map2AudioEngine::setPassionFXEqHighGain(float dB) { passionFX_.setEqHighGain(dB); }
void Map2AudioEngine::setPassionFXEqTilt(float tilt) { passionFX_.setEqTilt(tilt); }

// Exciter
void Map2AudioEngine::setPassionFXExciterEnabled(bool enabled) { passionFX_.setExciterEnabled(enabled); }
void Map2AudioEngine::setPassionFXExciterWarmth(float warmth) { passionFX_.setExciterWarmth(warmth); }
void Map2AudioEngine::setPassionFXExciterPresence(float presence) { passionFX_.setExciterPresence(presence); }
void Map2AudioEngine::setPassionFXExciterAir(float air) { passionFX_.setExciterAir(air); }

// Tremolo
void Map2AudioEngine::setPassionFXTremEnabled(bool enabled) { passionFX_.setTremoloEnabled(enabled); }
void Map2AudioEngine::setPassionFXTremRate(float hz) { passionFX_.setTremoloRate(hz); }
void Map2AudioEngine::setPassionFXTremDepth(float depth) { passionFX_.setTremoloDepth(depth); }
void Map2AudioEngine::setPassionFXTremWaveform(int waveform) { passionFX_.setTremoloWaveform(waveform); }

// Global
void Map2AudioEngine::setPassionFXMix(float mix) { passionFX_.setGlobalMix(mix); }
void Map2AudioEngine::setPassionFXOutputLevel(float dB) { passionFX_.setOutputLevel(dB); }

// State
void Map2AudioEngine::setPassionFXPreset(PassionFXProcessor::Preset preset) { passionFX_.setPreset(preset); }
PassionFXProcessor::Preset Map2AudioEngine::getPassionFXPreset() const { return passionFX_.getPreset(); }
void Map2AudioEngine::setPassionFXBypass(bool bypass) { passionFX_.setBypass(bypass); }
bool Map2AudioEngine::isPassionFXBypassed() const { return passionFX_.isBypassed(); }

// Bulk parameters
PassionFXProcessor::Parameters Map2AudioEngine::getPassionFXParameters() const { return passionFX_.getParameters(); }
void Map2AudioEngine::setPassionFXParameters(const PassionFXProcessor::Parameters& params) { passionFX_.setParameters(params); }

// Metering
PassionFXProcessor::Metering Map2AudioEngine::getPassionFXMetering() const { return passionFX_.getMetering(); }

// Preset info
PassionFXProcessor::PresetInfo Map2AudioEngine::getPassionFXPresetInfo(PassionFXProcessor::Preset preset) {
    return PassionFXProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getPassionFXNumPresets() {
    return PassionFXProcessor::getNumPresets();
}

// ========================================
// SynthForge (Phase 1 scaffold)
// ========================================

std::vector<synthforge::PartConfig> Map2AudioEngine::getSynthForgePartsConfig() const {
    return synthForge_.getPartsConfig();
}

bool Map2AudioEngine::setSynthForgePartConfig(int partIndex, const synthforge::PartConfig& config) {
    return synthForge_.setPartConfig(partIndex, config);
}

bool Map2AudioEngine::setSynthForgePartChannel(int partIndex, int midiChannel) {
    return synthForge_.setPartChannel(partIndex, midiChannel);
}

int Map2AudioEngine::getSynthForgePartChannel(int partIndex) const {
    return synthForge_.getPartChannel(partIndex);
}

std::map<std::string, float> Map2AudioEngine::getSynthForgePartParameters(int partIndex) const {
    return synthForge_.getPartParameters(partIndex);
}

bool Map2AudioEngine::setSynthForgeParameter(int partIndex, const std::string& param, float value) {
    return synthForge_.setPartParameter(partIndex, param, value);
}

bool Map2AudioEngine::loadSynthForgeSfz(int partIndex, const std::string& sfzPath) {
    return synthForge_.loadPartSfz(partIndex, sfzPath);
}

bool Map2AudioEngine::loadSynthForgeSoundFont(
    int partIndex,
    const std::string& soundfontPath,
    int bank,
    int program,
    const std::string& presetName) {
    return synthForge_.loadPartSoundFont(partIndex, soundfontPath, bank, program, presetName);
}

synthforge::SampleLoadStatus Map2AudioEngine::getSynthForgePartSampleStatus(int partIndex) const {
    return synthForge_.getPartSampleStatus(partIndex);
}

bool Map2AudioEngine::reloadSynthForgePartSfzIfChanged(int partIndex) {
    return synthForge_.reloadPartSfzIfChanged(partIndex);
}

bool Map2AudioEngine::setSynthForgePartSamplerBackend(int partIndex, const std::string& backend) {
    return synthForge_.setPartSamplerBackend(partIndex, backend);
}

std::string Map2AudioEngine::getSynthForgePartSamplerBackend(int partIndex) const {
    return synthForge_.getPartSamplerBackend(partIndex);
}

bool Map2AudioEngine::setSynthForgePartStreamingConfig(
    int partIndex,
    const synthforge::StreamingConfig& config) {
    return synthForge_.setPartStreamingConfig(partIndex, config);
}

synthforge::StreamingConfig Map2AudioEngine::getSynthForgePartStreamingConfig(int partIndex) const {
    return synthForge_.getPartStreamingConfig(partIndex);
}

bool Map2AudioEngine::setSynthForgePartHotReload(int partIndex, bool enabled, int intervalMs) {
    return synthForge_.setPartHotReload(partIndex, enabled, intervalMs);
}

synthforge::HotReloadStatus Map2AudioEngine::getSynthForgePartHotReloadStatus(int partIndex) const {
    return synthForge_.getPartHotReloadStatus(partIndex);
}

bool Map2AudioEngine::loadSynthForgePartScalaTuning(
    int partIndex,
    const std::string& scalaPath,
    int rootKey,
    float referenceHz) {
    return synthForge_.loadPartScalaTuning(partIndex, scalaPath, rootKey, referenceHz);
}

synthforge::ScalaTuningConfig Map2AudioEngine::getSynthForgePartScalaTuning(int partIndex) const {
    return synthForge_.getPartScalaTuning(partIndex);
}

bool Map2AudioEngine::setSynthForgePartMpeConfig(int partIndex, const synthforge::MpeConfig& config) {
    return synthForge_.setPartMpeConfig(partIndex, config);
}

synthforge::MpeConfig Map2AudioEngine::getSynthForgePartMpeConfig(int partIndex) const {
    return synthForge_.getPartMpeConfig(partIndex);
}

bool Map2AudioEngine::setSynthForgePartModMatrixRoutes(
    int partIndex,
    const std::vector<synthforge::ModMatrixRoute>& routes) {
    return synthForge_.setPartModMatrixRoutes(partIndex, routes);
}

std::vector<synthforge::ModMatrixRoute> Map2AudioEngine::getSynthForgePartModMatrixRoutes(int partIndex) const {
    return synthForge_.getPartModMatrixRoutes(partIndex);
}

bool Map2AudioEngine::setSynthForgePartFreeze(int partIndex, bool enabled) {
    return synthForge_.setPartFreezeEnabled(partIndex, enabled);
}

synthforge::FreezeRenderStatus Map2AudioEngine::getSynthForgePartFreezeStatus(int partIndex) const {
    return synthForge_.getPartFreezeStatus(partIndex);
}

bool Map2AudioEngine::renderSynthForgePartToFile(
    int partIndex,
    const std::string& outputPath,
    int durationMs) {
    return synthForge_.renderPartToFile(partIndex, outputPath, durationMs);
}

synthforge::SamplerAnalyzerFrame Map2AudioEngine::getSynthForgePartAnalyzerFrame(int partIndex) const {
    return synthForge_.getPartAnalyzerFrame(partIndex);
}

std::vector<synthforge::SamplerAnalyzerFrame> Map2AudioEngine::getSynthForgeAnalyzerFrames() const {
    return synthForge_.getAnalyzerFrames();
}

synthforge::SfzBackendStatus Map2AudioEngine::getSynthForgePartBackendStatus(int partIndex) const {
    return synthForge_.getPartSfzBackendStatus(partIndex);
}

std::vector<synthforge::SfzBackendStatus> Map2AudioEngine::getSynthForgeBackendStatus() const {
    return synthForge_.getSfzBackendStatus();
}

std::vector<synthforge::PatchInfo> Map2AudioEngine::getSynthForgePatches(
    const std::string& category) const {
    return synthForge_.getPatches(category);
}

bool Map2AudioEngine::loadSynthForgePatch(int partIndex, int bank, int program) {
    return synthForge_.loadPatch(partIndex, bank, program);
}

bool Map2AudioEngine::saveSynthForgePatch(
    int partIndex,
    int bank,
    int program,
    const std::string& name) {
    return synthForge_.savePatch(partIndex, bank, program, name);
}

synthforge::VoiceMetrics Map2AudioEngine::getSynthForgeVoiceMetrics() const {
    return synthForge_.getVoiceMetrics();
}

synthforge::Metering Map2AudioEngine::getSynthForgeMetering() const {
    return synthForge_.getMetering();
}

// ========================================
// Option 3: Off-thread Metering (Lock-Free)
// ========================================

void Map2AudioEngine::pushMeteringData(const juce::AudioBuffer<float>& buffer) {
    // RT-SAFE: Lock-free write to pre-allocated ring buffer
    // Zero heap allocations, zero mutex locks, zero syscalls
    int start1, size1, start2, size2;
    meteringFifo_.prepareToWrite(1, start1, size1, start2, size2);

    if (size1 > 0) {
        auto& frame = meteringRing_[static_cast<size_t>(start1)];
        frame.numSamples = std::min(buffer.getNumSamples(), METERING_MAX_SAMPLES);
        int numChannels = std::min(buffer.getNumChannels(), 2);
        for (int ch = 0; ch < numChannels; ++ch) {
            std::memcpy(frame.channels[ch], buffer.getReadPointer(ch),
                       static_cast<size_t>(frame.numSamples) * sizeof(float));
        }
        // Zero-fill unused channel if mono input
        for (int ch = numChannels; ch < 2; ++ch) {
            std::memset(frame.channels[ch], 0,
                       static_cast<size_t>(frame.numSamples) * sizeof(float));
        }
        meteringFifo_.finishedWrite(1);
        meteringDataReady_.store(true, std::memory_order_release);
    }
    // If ring is full, silently drop (acceptable — metering is non-critical)
}

void Map2AudioEngine::meteringThreadFunc() {
    // Low-priority metering thread
    // Polls lock-free ring buffer instead of blocking on condition variable
    while (meteringRunning_.load(std::memory_order_acquire)) {
        if (!meteringDataReady_.load(std::memory_order_acquire)) {
            // No data ready — sleep briefly to avoid busy-waiting
            std::this_thread::sleep_for(std::chrono::microseconds(500));
            continue;
        }

        int numReady = meteringFifo_.getNumReady();
        if (numReady <= 0) {
            meteringDataReady_.store(false, std::memory_order_release);
            continue;
        }

        // Read all available frames, but only process the LATEST one
        // (skip stale frames — metering only needs the most recent data)
        int start1, size1, start2, size2;
        meteringFifo_.prepareToRead(numReady, start1, size1, start2, size2);

        // Find the last (most recent) frame index
        int lastIdx;
        if (size2 > 0) {
            lastIdx = start2 + size2 - 1;
        } else {
            lastIdx = start1 + size1 - 1;
        }

        auto& frame = meteringRing_[static_cast<size_t>(lastIdx)];

        // Process metering off the audio thread (no RT constraints)
        juce::AudioBuffer<float> tempBuffer(2, frame.numSamples);
        std::memcpy(tempBuffer.getWritePointer(0), frame.channels[0],
                   static_cast<size_t>(frame.numSamples) * sizeof(float));
        std::memcpy(tempBuffer.getWritePointer(1), frame.channels[1],
                   static_cast<size_t>(frame.numSamples) * sizeof(float));

        // Mark all frames as consumed (including skipped stale ones)
        meteringFifo_.finishedRead(numReady);
        meteringDataReady_.store(false, std::memory_order_release);

        // Update metering components (all off-thread, no RT pressure)
        spectrumAnalyzer_.pushBuffer(tempBuffer);
        lufsMeter_.process(tempBuffer);
        phaseCorrelation_.process(tempBuffer.getReadPointer(0),
                                  tempBuffer.getReadPointer(1),
                                  frame.numSamples);
        masterVuMeter_.process(tempBuffer.getReadPointer(0),
                              tempBuffer.getReadPointer(1),
                              frame.numSamples);
    }
}

// ============================================================================
// Tesira AVB Node — Python bridge methods
// All five methods delegate to the lock-free TesiraAvbNode helper.
// Safe to call from any Python/network thread; processDevice() is RT-only.
// ============================================================================

#ifdef HAS_AVB

bool Map2AudioEngine::setTesiraDeviceLevel(int deviceIdx, int channel, float levelDb) {
    tesiraNode_.setDeviceLevel(deviceIdx, channel, levelDb);
    return true;
}

bool Map2AudioEngine::setTesiraDeviceMute(int deviceIdx, int channel, bool muted) {
    tesiraNode_.setDeviceMute(deviceIdx, channel, muted);
    return true;
}

bool Map2AudioEngine::setTesiraDeviceConnected(int deviceIdx, bool connected) {
    tesiraNode_.setDeviceConnected(deviceIdx, connected);
    return true;
}

bool Map2AudioEngine::setTesiraDevicePreset(int deviceIdx, int presetIndex) {
    tesiraNode_.setDevicePreset(deviceIdx, presetIndex);
    return true;
}

float Map2AudioEngine::getTesiraOutputLevel(int deviceIdx, int channel) const {
    return tesiraNode_.getOutputLevel(deviceIdx, channel);
}

#endif // HAS_AVB

} // namespace map2
