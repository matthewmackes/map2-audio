/*
 * AvbAudioIODeviceType.h - JUCE AudioIODeviceType for AVB/TSN
 *
 * Registers with JUCE's AudioDeviceManager to make AVB streams appear
 * as selectable audio devices alongside JACK, ALSA, etc.
 *
 * Only compiled when USE_AVB=ON in CMake.
 */

#pragma once

#ifdef HAS_AVB

#include <juce_audio_devices/juce_audio_devices.h>
#include <memory>
#include <vector>
#include <cstdint>

namespace Map2Audio {

/**
 * AVB/TSN Audio Device Type for JUCE.
 *
 * Scans for available AVB devices (local talkers/listeners or discovered remote devices)
 * and creates AvbAudioIODevice instances.
 *
 * Thread safety:
 * - scanForDevices(): Not RT-safe, called from JUCE main thread
 * - createDevice(): Not RT-safe, called from JUCE main thread
 * - All methods safe from JUCE's perspective (no RT calls)
 */
class AvbAudioIODeviceType : public juce::AudioIODeviceType {
public:
    /**
     * Create AVB device type.
     *
     * Checks runtime availability:
     * - AVB enabled in config
     * - TSN NIC present
     * - ptp4l running (for clock sync)
     *
     * If unavailable, scanForDevices() returns empty list.
     */
    AvbAudioIODeviceType();

    ~AvbAudioIODeviceType() override;

    // ========================================================================
    // AudioIODeviceType interface
    // ========================================================================

    /**
     * Scan for AVB devices.
     *
     * Returns:
     * - Local talker devices (for sending audio to network)
     * - Local listener devices (for receiving audio from network)
     * - Discovered remote devices via mDNS/AVDECC (Phase 8)
     *
     * Empty list if AVB unavailable.
     */
    void scanForDevices() override;

    /**
     * Get list of available device names.
     */
    juce::StringArray getDeviceNames(bool wantInputNames = false) const override;

    /**
     * Get index of default device.
     * Returns -1 if no default (user must select explicitly).
     */
    int getDefaultDeviceIndex(bool forInput = false) const override;

    /**
     * Get index of device by name.
     */
    int getIndexOfDevice(juce::AudioIODevice* device, bool asInput = false) const override;

    /**
     * Check if two devices have same name.
     */
    bool hasSeparateInputsAndOutputs() const override;

    /**
     * Create AVB audio device by name.
     *
     * Returns nullptr if:
     * - Device name not found
     * - AVB initialization fails
     * - Hardware/ptp4l unavailable
     */
    juce::AudioIODevice* createDevice(const juce::String& outputDeviceName,
                                       const juce::String& inputDeviceName) override;

private:
    /**
     * Check if AVB is available at runtime.
     *
     * Checks:
     * - Config: avb.enabled = true
     * - Hardware: TSN NIC exists
     * - Service: ptp4l running
     * - Permissions: CAP_NET_RAW available
     */
    bool isAvbAvailable() const;

    /**
     * Discover AVB devices via mDNS.
     *
     * Queries _map2-avb._tcp for MAP2 nodes advertising AVB streams.
     * Returns list of discovered device names.
     */
    juce::StringArray discoverDevicesViaMdns() const;

    /**
     * Get configuration for local AVB device.
     *
     * Resolved from runtime environment/config:
     * - interface
     * - stream_id seed
     * - destination MAC
     * - presentation offset
     * - 802.1Q priority
     */
    bool getLocalDeviceConfig(juce::String& interface,
                               uint64_t& streamId,
                               juce::String& destMac,
                               uint32_t& presentationOffsetUs,
                               uint8_t& priority) const;

    /**
     * Build deterministic local device display name for a direction.
     */
    juce::String buildLocalDeviceName(bool forTalker, const juce::String& interface) const;

    // Device lists (populated by scanForDevices)
    juce::StringArray inputDeviceNames_;   // Listener devices
    juce::StringArray outputDeviceNames_;  // Talker devices

    // Runtime availability flag
    bool avbAvailable_;
};

} // namespace Map2Audio

#endif // HAS_AVB
