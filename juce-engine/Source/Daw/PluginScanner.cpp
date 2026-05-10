// =============================================================================
// T2503 Set 9 — PluginScanner implementation
// =============================================================================

#include "PluginScanner.h"

#include <algorithm>

namespace map2::daw {

PluginScanner::PluginScanner() = default;

void PluginScanner::populate() {
    std::lock_guard<std::mutex> lock(mutex_);
    inventory_.clear();
    // Order matters for stable test output: native first, then LV2.
    registerNativePlugins();
    enumerateLv2Plugins();
}

std::vector<PluginDescriptor> PluginScanner::inventory() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return inventory_;
}

std::size_t PluginScanner::size() const noexcept {
    std::lock_guard<std::mutex> lock(mutex_);
    return inventory_.size();
}

bool PluginScanner::find(const std::string& uri, PluginDescriptor& out) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = std::find_if(inventory_.begin(), inventory_.end(),
                           [&](const PluginDescriptor& p) { return p.uri == uri; });
    if (it == inventory_.end()) return false;
    out = *it;
    return true;
}

void PluginScanner::registerNativePlugins() {
    // Set 9 ships the canonical MAP2-native plugin set. The runtime
    // factories live elsewhere in the engine (NAM, ConvolutionProcessor,
    // etc.); this is the descriptor catalog.
    inventory_.push_back({
        /*uri=*/"map2:fx:nam",
        /*name=*/"Neural Amp Modeler",
        /*vendor=*/"MAP2",
        /*category=*/"amp",
        /*format=*/PluginFormat::Native,
        /*audioIn=*/1,
        /*audioOut=*/1,
        /*isInstrument=*/false,
    });
    inventory_.push_back({
        "map2:fx:cabinet-ir",
        "Cabinet IR",
        "MAP2",
        "ir",
        PluginFormat::Native,
        1, 1, false,
    });
    inventory_.push_back({
        "map2:fx:reverb-ir",
        "Reverb IR",
        "MAP2",
        "reverb",
        PluginFormat::Native,
        1, 2, false,
    });
}

void PluginScanner::enumerateLv2Plugins() {
    // Bench-gate slice: wire to juce::AudioPluginFormatManager +
    // juce::LV2PluginFormat. The enumeration walks the LV2_PATH (typically
    // /usr/lib64/lv2 on Fedora) and for each plugin populates a
    // PluginDescriptor with format=LV2.
    //
    // For Set 9 we ship the registration shape so a stub LV2 plugin
    // appears in the inventory and tests can assert format-agnostic
    // lookups work. Replacing this with the real enumeration is a one-file
    // change at the bench slice.
    inventory_.push_back({
        "lv2://map2.audio/test/eg-amp",
        "LV2 Example Amp",
        "LV2 (placeholder until bench wires juce::LV2PluginFormat)",
        "amp",
        PluginFormat::LV2,
        1, 1, false,
    });
}

} // namespace map2::daw
