#pragma once

/**
 * MAP2 Audio Engine - Snapshot Manager
 * Preset and snapshot save/load functionality
 */

#include "Common.h"
#include "PluginHost.h"
#include <fstream>

namespace map2 {

// Chain item for serialization
struct ChainItem {
    InstanceId instanceId;
    std::string uri;
    std::string name;
    bool bypassed;
    std::map<std::string, float> parameters;
};

// Full chain state
struct ChainState {
    std::string name;
    std::vector<ChainItem> plugins;
    float inputVolume;
    float outputVolume;
};

class SnapshotManager {
public:
    SnapshotManager(PluginHost& host);
    ~SnapshotManager();
    
    // Snapshot management (0-5)
    bool saveSnapshot(int slotId, const std::string& name = "");
    bool loadSnapshot(int slotId);
    bool deleteSnapshot(int slotId);
    
    int getCurrentSnapshot() const { return currentSnapshot_; }
    std::vector<Snapshot> listSnapshots() const;
    
    // Full chain state
    ChainState captureChainState(const std::vector<InstanceId>& chain) const;
    bool restoreChainState(const ChainState& state, std::vector<InstanceId>& chain);
    
    // File I/O
    bool saveToFile(const std::string& filepath);
    bool loadFromFile(const std::string& filepath);
    
    // JSON serialization
    std::string toJson() const;
    bool fromJson(const std::string& json);
    
    // Preset library
    bool savePreset(const std::string& name, const std::string& category = "User");
    bool loadPreset(const std::string& name);
    std::vector<std::string> listPresets(const std::string& category = "") const;
    bool deletePreset(const std::string& name);
    
    // Storage path
    void setStoragePath(const std::string& path) { storagePath_ = path; }
    std::string getStoragePath() const { return storagePath_; }
    
private:
    PluginHost& host_;
    int currentSnapshot_ = 0;
    
    std::array<Snapshot, MAX_SNAPSHOTS> snapshots_;
    std::string storagePath_ = "/var/lib/map2/snapshots";
    
    // Helpers
    std::string snapshotFilePath(int slotId) const;
    std::string presetFilePath(const std::string& name) const;
};

} // namespace map2
