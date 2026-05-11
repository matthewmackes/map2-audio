// =============================================================================
// T2503 Set 9 — PluginScanner
// =============================================================================
// Unified plugin inventory across the live engine and the DAW service.
// Locked decision A9: single shared scanner; one inventory consumed by both.
//
// Day-one plugin formats (locked decision A10):
//   - LV2 (native Linux ecosystem)
//   - Native MAP2 plugins (NAM, Cabinet IR, Reverb IR, internal)
// VST3 / CLAP / VST2 deferred to a future epic.
//
// Set 9 ships the in-memory inventory + format-agnostic descriptor model.
// JUCE LV2 enumeration uses juce::AudioPluginFormatManager + LV2 helper
// (already enabled via JUCE_PLUGINHOST_LV2=1 in the parent CMake).
//
// The scanner runs on a non-RT thread; populate() blocks on filesystem
// + lilv. The audio thread reads via inventory() — return is by value
// (copies a small vector of structs), no shared mutation.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "PluginScanner.h included but MAP2_DAW_MODE is not set"
#endif

#include <mutex>
#include <string>
#include <vector>

namespace map2::daw {

enum class PluginFormat {
    LV2,
    Native      // map2:fx:nam, map2:fx:cabinet-ir, map2:fx:reverb-ir, internal
};

struct PluginDescriptor {
    std::string uri;             // LV2 URI or map2:fx:* for native
    std::string name;            // display name
    std::string vendor;          // "MAP2", or LV2 manifest manufacturer
    std::string category;        // "amp", "ir", "delay", "reverb", "synth", ...
    PluginFormat format = PluginFormat::Native;
    int audioInputs = 1;
    int audioOutputs = 1;
    bool isInstrument = false;
};

class PluginScanner {
public:
    PluginScanner();

    /** Run a full filesystem + LV2 scan. Synchronous; blocks until the
        inventory is populated. Safe to re-run; replaces the prior inventory.
        Set 9 includes a minimal native-plugin discovery + an LV2 enumeration
        skeleton that will be wired to the JUCE LV2 path at the bench slice. */
    void populate();

    /** Returns a snapshot of the inventory. Threadsafe. */
    std::vector<PluginDescriptor> inventory() const;

    /** Number of plugins in the current inventory. */
    std::size_t size() const noexcept;

    /** Lookup by URI. Returns true + fills ``out`` if found. */
    bool find(const std::string& uri, PluginDescriptor& out) const;

private:
    void registerNativePlugins();
    void enumerateLv2Plugins();

    mutable std::mutex mutex_;
    std::vector<PluginDescriptor> inventory_;
};

} // namespace map2::daw
