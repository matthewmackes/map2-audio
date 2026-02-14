/*
 * AvbAudioIODeviceType.cpp - JUCE AudioIODeviceType for AVB/TSN Implementation
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#ifdef HAS_AVB

#include "AvbAudioIODeviceType.h"
#include "AvbAudioIODevice.h"

#include <fstream>
#include <cstdlib>

namespace Map2Audio {

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

    if (!avbAvailable_) {
        return; // Empty lists
    }

    // Local talker device (sends audio to network)
    outputDeviceNames_.add("AVB Talker (Local)");

    // Local listener device (receives audio from network)
    inputDeviceNames_.add("AVB Listener (Local)");

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

    if (!getLocalDeviceConfig(interface, streamId, destMac)) {
        juce::Logger::writeToLog("AVB/TSN: Failed to read device configuration");
        return nullptr;
    }

    try {
        // Create AVB audio device
        // Will throw AvbException if initialization fails
        return new AvbAudioIODevice(
            deviceName,
            interface.toStdString(),
            streamId,
            destMac.toStdString(),
            direction
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
    // Check 1: AVB enabled in config
    // (In real implementation, would read ~/.map2/config.json)
    const char* avbEnabled = std::getenv("MAP2_AVB_ENABLED");
    if (avbEnabled == nullptr || std::string(avbEnabled) != "true") {
        return false;
    }

    // Check 2: Interface exists
    juce::String interface;
    uint64_t streamId;
    juce::String destMac;
    if (!getLocalDeviceConfig(interface, streamId, destMac)) {
        return false;
    }

    juce::File sysInterface("/sys/class/net/" + interface);
    if (!sysInterface.exists()) {
        return false;
    }

    // Check 3: ptp4l running (check for PID file or systemd status)
    // Simple check: look for /run/ptp4l.pid
    if (!juce::File("/run/ptp4l.pid").existsAsFile()) {
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

bool AvbAudioIODeviceType::getLocalDeviceConfig(
    juce::String& interface,
    uint64_t& streamId,
    juce::String& destMac) const
{
    // Read configuration from environment variables
    // (In real implementation, would use Python config service)

    const char* ifaceEnv = std::getenv("MAP2_AVB_INTERFACE");
    if (ifaceEnv == nullptr) {
        return false;
    }
    interface = juce::String(ifaceEnv);

    // Stream ID (default: MAC-based unique ID)
    const char* streamIdEnv = std::getenv("MAP2_AVB_STREAM_ID");
    if (streamIdEnv != nullptr) {
        streamId = std::stoull(streamIdEnv, nullptr, 16);
    } else {
        streamId = 0x001122334455667788ULL; // Default placeholder
    }

    // Destination MAC (for talker)
    const char* destMacEnv = std::getenv("MAP2_AVB_DEST_MAC");
    if (destMacEnv != nullptr) {
        destMac = juce::String(destMacEnv);
    } else {
        destMac = "01:AA:BB:CC:DD:EE"; // Default AVB multicast
    }

    return true;
}

} // namespace Map2Audio

#endif // HAS_AVB
