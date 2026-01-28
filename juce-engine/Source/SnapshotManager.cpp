/**
 * MAP2 Audio Engine - Snapshot Manager Implementation
 * Preset and snapshot save/load functionality
 */

#include "SnapshotManager.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <filesystem>
#include <fstream>

namespace fs = std::filesystem;

namespace map2 {

SnapshotManager::SnapshotManager(PluginHost& host)
    : host_(host) {
    // Initialize snapshot slots
    for (int i = 0; i < MAX_SNAPSHOTS; i++) {
        snapshots_[i].id = i;
        snapshots_[i].name = "Snapshot " + std::to_string(i + 1);
    }
}

SnapshotManager::~SnapshotManager() = default;

bool SnapshotManager::saveSnapshot(int slotId, const std::string& name) {
    if (slotId < 0 || slotId >= MAX_SNAPSHOTS) return false;
    
    Snapshot& snapshot = snapshots_[slotId];
    snapshot.name = name.empty() ? ("Snapshot " + std::to_string(slotId + 1)) : name;
    
    // Capture current plugin states
    snapshot.pluginStates.clear();
    auto plugins = host_.getLoadedPlugins();
    
    for (const auto& plugin : plugins) {
        auto info = host_.getPluginInfo(plugin.uri);
        if (!info) continue;
        
        std::map<std::string, float> params;
        for (const auto& param : info->parameters) {
            float value = host_.getParameterByName(plugin.id, param.symbol);
            params[param.symbol] = value;
        }
        
        snapshot.pluginStates.push_back({plugin.id, params});
    }
    
    currentSnapshot_ = slotId;
    std::cout << "Saved snapshot " << slotId << ": " << snapshot.name << std::endl;
    
    return true;
}

bool SnapshotManager::loadSnapshot(int slotId) {
    if (slotId < 0 || slotId >= MAX_SNAPSHOTS) return false;
    
    const Snapshot& snapshot = snapshots_[slotId];
    
    // Restore plugin parameters
    for (const auto& [instanceId, params] : snapshot.pluginStates) {
        for (const auto& [paramName, value] : params) {
            host_.setParameterByName(instanceId, paramName, value);
        }
    }
    
    currentSnapshot_ = slotId;
    std::cout << "Loaded snapshot " << slotId << ": " << snapshot.name << std::endl;
    
    return true;
}

bool SnapshotManager::deleteSnapshot(int slotId) {
    if (slotId < 0 || slotId >= MAX_SNAPSHOTS) return false;
    
    snapshots_[slotId].pluginStates.clear();
    snapshots_[slotId].name = "Snapshot " + std::to_string(slotId + 1);
    
    return true;
}

std::vector<Snapshot> SnapshotManager::listSnapshots() const {
    return std::vector<Snapshot>(snapshots_.begin(), snapshots_.end());
}

ChainState SnapshotManager::captureChainState(const std::vector<InstanceId>& chain) const {
    ChainState state;
    state.name = "Current Chain";
    state.inputVolume = 1.0f;
    state.outputVolume = 1.0f;
    
    for (InstanceId id : chain) {
        auto plugins = host_.getLoadedPlugins();
        
        for (const auto& plugin : plugins) {
            if (plugin.id == id) {
                ChainItem item;
                item.instanceId = id;
                item.uri = plugin.uri;
                item.name = plugin.name;
                item.bypassed = plugin.bypassed;
                
                auto info = host_.getPluginInfo(plugin.uri);
                if (info) {
                    for (const auto& param : info->parameters) {
                        item.parameters[param.symbol] = host_.getParameterByName(id, param.symbol);
                    }
                }
                
                state.plugins.push_back(item);
                break;
            }
        }
    }
    
    return state;
}

bool SnapshotManager::restoreChainState(const ChainState& state, std::vector<InstanceId>& chain) {
    // This would need to reload plugins if not already loaded
    // For now, just restore parameters for existing plugins
    
    for (const auto& item : state.plugins) {
        // Find matching plugin in current chain
        for (InstanceId id : chain) {
            auto plugins = host_.getLoadedPlugins();
            for (const auto& plugin : plugins) {
                if (plugin.id == id && plugin.uri == item.uri) {
                    // Restore parameters
                    for (const auto& [name, value] : item.parameters) {
                        host_.setParameterByName(id, name, value);
                    }
                    host_.setBypass(id, item.bypassed);
                    break;
                }
            }
        }
    }
    
    return true;
}

std::string SnapshotManager::snapshotFilePath(int slotId) const {
    return storagePath_ + "/snapshot_" + std::to_string(slotId) + ".json";
}

std::string SnapshotManager::presetFilePath(const std::string& name) const {
    return storagePath_ + "/presets/" + name + ".json";
}

bool SnapshotManager::saveToFile(const std::string& filepath) {
    try {
        fs::create_directories(fs::path(filepath).parent_path());
        
        std::ofstream file(filepath);
        if (!file.is_open()) return false;
        
        file << toJson();
        return true;
    } catch (const std::exception& e) {
        std::cerr << "Failed to save to file: " << e.what() << std::endl;
        return false;
    }
}

bool SnapshotManager::loadFromFile(const std::string& filepath) {
    try {
        std::ifstream file(filepath);
        if (!file.is_open()) return false;
        
        std::stringstream buffer;
        buffer << file.rdbuf();
        
        return fromJson(buffer.str());
    } catch (const std::exception& e) {
        std::cerr << "Failed to load from file: " << e.what() << std::endl;
        return false;
    }
}

std::string SnapshotManager::toJson() const {
    // Simple JSON serialization without external library
    std::stringstream ss;
    ss << "{\n";
    ss << "  \"version\": \"1.0\",\n";
    ss << "  \"currentSnapshot\": " << currentSnapshot_ << ",\n";
    ss << "  \"snapshots\": [\n";
    
    for (int i = 0; i < MAX_SNAPSHOTS; i++) {
        const auto& snap = snapshots_[i];
        ss << "    {\n";
        ss << "      \"id\": " << snap.id << ",\n";
        ss << "      \"name\": \"" << snap.name << "\",\n";
        ss << "      \"plugins\": [\n";
        
        for (size_t j = 0; j < snap.pluginStates.size(); j++) {
            const auto& [instanceId, params] = snap.pluginStates[j];
            ss << "        {\n";
            ss << "          \"instanceId\": " << instanceId << ",\n";
            ss << "          \"parameters\": {\n";
            
            size_t paramIdx = 0;
            for (const auto& [name, value] : params) {
                ss << "            \"" << name << "\": " << std::fixed << std::setprecision(6) << value;
                if (++paramIdx < params.size()) ss << ",";
                ss << "\n";
            }
            
            ss << "          }\n";
            ss << "        }";
            if (j < snap.pluginStates.size() - 1) ss << ",";
            ss << "\n";
        }
        
        ss << "      ]\n";
        ss << "    }";
        if (i < MAX_SNAPSHOTS - 1) ss << ",";
        ss << "\n";
    }
    
    ss << "  ]\n";
    ss << "}\n";
    
    return ss.str();
}

bool SnapshotManager::fromJson(const std::string& /*json*/) {
    // Would need a proper JSON parser for full implementation
    // For now, return false
    return false;
}

bool SnapshotManager::savePreset(const std::string& name, const std::string& /*category*/) {
    std::string filepath = presetFilePath(name);
    return saveToFile(filepath);
}

bool SnapshotManager::loadPreset(const std::string& name) {
    std::string filepath = presetFilePath(name);
    return loadFromFile(filepath);
}

std::vector<std::string> SnapshotManager::listPresets(const std::string& /*category*/) const {
    std::vector<std::string> presets;
    
    std::string presetsDir = storagePath_ + "/presets";
    
    try {
        if (fs::exists(presetsDir)) {
            for (const auto& entry : fs::directory_iterator(presetsDir)) {
                if (entry.path().extension() == ".json") {
                    presets.push_back(entry.path().stem().string());
                }
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Error listing presets: " << e.what() << std::endl;
    }
    
    return presets;
}

bool SnapshotManager::deletePreset(const std::string& name) {
    std::string filepath = presetFilePath(name);
    
    try {
        return fs::remove(filepath);
    } catch (const std::exception& e) {
        std::cerr << "Error deleting preset: " << e.what() << std::endl;
        return false;
    }
}

} // namespace map2
