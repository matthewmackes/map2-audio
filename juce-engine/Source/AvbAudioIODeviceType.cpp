/*
 * AvbAudioIODeviceType.cpp - JUCE AudioIODeviceType for AVB/TSN Implementation
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#ifdef HAS_AVB

#include "AvbAudioIODeviceType.h"
#include "AvbAudioIODevice.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <string>

namespace Map2Audio {

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

uint64_t deriveStreamIdFromInterface(const juce::String& interface) {
    const std::string source = interface.toStdString();
    uint64_t hash = 1469598103934665603ULL;  // FNV-1a 64-bit offset basis
    for (const unsigned char ch : source) {
        hash ^= static_cast<uint64_t>(ch);
        hash *= 1099511628211ULL;
    }
    hash &= 0x00FFFFFFFFFFFFFFULL;
    hash |= 0xA500000000000000ULL;
    return hash;
}

uint64_t parseStreamIdOrDefault(const char* value, uint64_t fallback) {
    if (value == nullptr || *value == '\0') {
        return fallback;
    }

    try {
        size_t parsed = 0;
        const uint64_t parsedValue = std::stoull(value, &parsed, 0);
        if (parsed == std::string(value).size() && parsedValue != 0) {
            return parsedValue;
        }
    } catch (...) {
    }

    return fallback;
}

int parseIntOrDefault(const char* value, int fallback) {
    if (value == nullptr || *value == '\0') {
        return fallback;
    }
    try {
        size_t parsed = 0;
        const int parsedValue = std::stoi(value, &parsed, 10);
        if (parsed == std::string(value).size()) {
            return parsedValue;
        }
    } catch (...) {
    }
    return fallback;
}

}  // namespace

// ============================================================================
// Constructor / Destructor
// ============================================================================

AvbAudioIODeviceType::AvbAudioIODeviceType()
    : juce::AudioIODeviceType("AVB/TSN")
    , avbAvailable_(false)
{
    // Check if AVB is available at runtime
    avbAvailable_ = isAvbAvailable();

    if (!avbAvailable_) {
        // AVB disabled or unavailable - will return empty device lists
        juce::Logger::writeToLog("AVB/TSN: Not available (disabled in config or hardware missing)");
    }
}

AvbAudioIODeviceType::~AvbAudioIODeviceType() {
}

// ============================================================================
// AudioIODeviceType Interface
// ============================================================================

void AvbAudioIODeviceType::scanForDevices() {
    inputDeviceNames_.clear();
    outputDeviceNames_.clear();

    avbAvailable_ = isAvbAvailable();
    if (!avbAvailable_) {
        return; // Empty lists
    }

    juce::String interface;
    uint64_t streamId = 0;
    juce::String destMac;
    uint32_t presentationOffsetUs = 2000;
    uint8_t priority = 3;
    if (!getLocalDeviceConfig(interface, streamId, destMac, presentationOffsetUs, priority)) {
        juce::ignoreUnused(streamId, destMac, presentationOffsetUs, priority);
        juce::Logger::writeToLog("AVB/TSN: Failed to resolve local AVB configuration");
        return;
    }
    juce::ignoreUnused(streamId, destMac, presentationOffsetUs, priority);

    // Local talker device (sends audio to network)
    outputDeviceNames_.add(buildLocalDeviceName(true, interface));

    // Local listener device (receives audio from network)
    inputDeviceNames_.add(buildLocalDeviceName(false, interface));

    // Discover remote MAP2 nodes via mDNS
    juce::StringArray remoteDevices = discoverDevicesViaMdns();
    for (const auto& deviceName : remoteDevices) {
        // Remote devices can be both talkers and listeners
        inputDeviceNames_.add(deviceName);
        outputDeviceNames_.add(deviceName);
    }

    juce::Logger::writeToLog("AVB/TSN: Found " + juce::String(inputDeviceNames_.size()) +
                              " input devices, " + juce::String(outputDeviceNames_.size()) +
                              " output devices");
}

juce::StringArray AvbAudioIODeviceType::getDeviceNames(bool wantInputNames) const {
    return wantInputNames ? inputDeviceNames_ : outputDeviceNames_;
}

int AvbAudioIODeviceType::getDefaultDeviceIndex(bool /*forInput*/) const {
    // No default - user must explicitly select AVB device
    return -1;
}

int AvbAudioIODeviceType::getIndexOfDevice(juce::AudioIODevice* device, bool asInput) const {
    if (device == nullptr) {
        return -1;
    }

    const juce::StringArray& names = asInput ? inputDeviceNames_ : outputDeviceNames_;
    return names.indexOf(device->getName());
}

bool AvbAudioIODeviceType::hasSeparateInputsAndOutputs() const {
    // AVB talkers and listeners are separate devices
    return true;
}

juce::AudioIODevice* AvbAudioIODeviceType::createDevice(
    const juce::String& outputDeviceName,
    const juce::String& inputDeviceName)
{
    avbAvailable_ = isAvbAvailable();
    if (!avbAvailable_) {
        juce::Logger::writeToLog("AVB/TSN: Cannot create device - AVB not available");
        return nullptr;
    }

    // Determine device direction
    AvbDirection direction;
    juce::String deviceName;

    if (outputDeviceName.isNotEmpty()) {
        direction = AvbDirection::Talker;
        deviceName = outputDeviceName;
    } else if (inputDeviceName.isNotEmpty()) {
        direction = AvbDirection::Listener;
        deviceName = inputDeviceName;
    } else {
        return nullptr; // No device specified
    }

    // Get local AVB configuration
    juce::String interface;
    uint64_t streamId = 0;
    juce::String destMac;
    uint32_t presentationOffsetUs = 2000;
    uint8_t priority = 3;

    if (!getLocalDeviceConfig(interface, streamId, destMac, presentationOffsetUs, priority)) {
        juce::Logger::writeToLog("AVB/TSN: Failed to read device configuration");
        return nullptr;
    }

    const juce::String localTalkerName = buildLocalDeviceName(true, interface);
    const juce::String localListenerName = buildLocalDeviceName(false, interface);
    const bool isLocalTalkerSelection = (deviceName == localTalkerName) || (deviceName == "AVB Talker (Local)");
    const bool isLocalListenerSelection =
        (deviceName == localListenerName) || (deviceName == "AVB Listener (Local)");

    if ((direction == AvbDirection::Talker && !isLocalTalkerSelection) ||
        (direction == AvbDirection::Listener && !isLocalListenerSelection)) {
        juce::Logger::writeToLog("AVB/TSN: Unsupported device selection: " + deviceName);
        return nullptr;
    }

    const uint64_t directionSalt = (direction == AvbDirection::Talker)
        ? 0x1000000000000000ULL
        : 0x2000000000000000ULL;
    const uint64_t directionScopedStreamId = streamId ^ directionSalt;

    try {
        // Create AVB audio device
        // Will throw AvbException if initialization fails
        return new AvbAudioIODevice(
            deviceName,
            interface.toStdString(),
            directionScopedStreamId,
            destMac.toStdString(),
            direction,
            presentationOffsetUs,
            priority
        );
    } catch (const std::exception& e) {
        juce::Logger::writeToLog("AVB/TSN: Device creation failed: " + juce::String(e.what()));
        return nullptr;
    }
}

// ============================================================================
// Private Methods
// ============================================================================

bool AvbAudioIODeviceType::isAvbAvailable() const {
    // Check 1: AVB enabled by runtime config marker or environment.
    const bool enabledByEnv = isTruthy(std::getenv("MAP2_AVB_ENABLED"));
    const bool enabledByMarker = std::filesystem::exists("/etc/map2/avb-enabled");
    if (!enabledByEnv && !enabledByMarker) {
        return false;
    }

    // Check 2: Interface exists
    juce::String interface;
    uint64_t streamId;
    juce::String destMac;
    uint32_t presentationOffsetUs = 2000;
    uint8_t priority = 3;
    if (!getLocalDeviceConfig(interface, streamId, destMac, presentationOffsetUs, priority)) {
        juce::ignoreUnused(streamId, destMac, presentationOffsetUs, priority);
        return false;
    }
    juce::ignoreUnused(streamId, destMac, presentationOffsetUs, priority);

    if (!std::filesystem::exists("/sys/class/net/" + interface.toStdString())) {
        return false;
    }

    // Check 3: ptp4l running (check for PID file or systemd status)
    // Simple check: look for /run/ptp4l.pid
    if (!std::filesystem::exists("/run/ptp4l.pid")) {
        // Not running
        return false;
    }

    // All checks passed
    return true;
}

juce::StringArray AvbAudioIODeviceType::discoverDevicesViaMdns() const {
    juce::StringArray devices;

    // In real implementation, would:
    // 1. Query mDNS for _map2-avb._tcp services
    // 2. Parse TXT records for stream info
    // 3. Create device names like "MAP2-NODE-001 (192.168.1.100)"

    // For now, return empty (mDNS discovery is Phase 5+)

    return devices;
}

juce::String AvbAudioIODeviceType::buildLocalDeviceName(bool forTalker, const juce::String& interface) const {
    const juce::String role = forTalker ? "Talker" : "Listener";
    return "AVB " + role + " [" + interface + "]";
}

bool AvbAudioIODeviceType::getLocalDeviceConfig(
    juce::String& interface,
    uint64_t& streamId,
    juce::String& destMac,
    uint32_t& presentationOffsetUs,
    uint8_t& priority) const
{
    // Resolve configuration from environment and runtime defaults.

    const char* ifaceEnv = std::getenv("MAP2_AVB_INTERFACE");
    if (ifaceEnv == nullptr || *ifaceEnv == '\0') {
        return false;
    }
    interface = juce::String(ifaceEnv);

    // Stream ID defaults deterministically from interface name.
    const uint64_t derivedStreamId = deriveStreamIdFromInterface(interface);
    streamId = parseStreamIdOrDefault(std::getenv("MAP2_AVB_STREAM_ID"), derivedStreamId);

    // Destination MAC (for talkers) defaults to IEEE 1722 multicast base.
    const char* destMacEnv = std::getenv("MAP2_AVB_DEST_MAC");
    if (destMacEnv != nullptr) {
        destMac = juce::String(destMacEnv);
    } else {
        destMac = "91:e0:f0:00:0e:80";
    }

    const int parsedOffsetUs = parseIntOrDefault(std::getenv("MAP2_AVB_PRESENTATION_OFFSET_US"), 2000);
    presentationOffsetUs = static_cast<uint32_t>(std::clamp(parsedOffsetUs, 500, 10000));

    const int parsedPriority = parseIntOrDefault(std::getenv("MAP2_AVB_PRIORITY"), 3);
    priority = static_cast<uint8_t>(std::clamp(parsedPriority, 0, 7));

    return true;
}

} // namespace Map2Audio

#endif // HAS_AVB
