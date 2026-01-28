/**
 * MAP2 Audio Engine - Python Bindings
 * pybind11 module exposing the audio engine to Python
 * Version 2.0 - Full JUCE Integration with advanced metering
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>

#include "Map2AudioEngine.h"
#include "SpectrumAnalyzer.h"
#include "LufsMeter.h"
#include "PhaseCorrelation.h"
#include "CPUMonitor.h"
#include "ConvolutionProcessor.h"

namespace py = pybind11;
using namespace map2;

// ========================================
// Type Converters
// ========================================

// Convert PluginInfo to Python dict
py::dict pluginInfoToDict(const PluginInfo& info) {
    py::dict d;
    d["uri"] = info.uri;
    d["name"] = info.name;
    d["author"] = info.author;
    d["brand"] = info.brand;
    d["category"] = info.category;
    d["license"] = info.license;
    d["version"] = info.version;
    d["audio_inputs"] = info.audioInputs;
    d["audio_outputs"] = info.audioOutputs;
    d["has_midi_input"] = info.hasMidiInput;
    d["has_midi_output"] = info.hasMidiOutput;
    d["format"] = pluginFormatToString(info.format);
    d["format_name"] = info.formatName;
    d["file_path"] = info.filePath;
    d["latency_samples"] = info.latencySamples;

    py::list params;
    for (const auto& param : info.parameters) {
        py::dict p;
        p["index"] = param.index;
        p["symbol"] = param.symbol;
        p["name"] = param.name;
        p["min_value"] = param.minValue;
        p["max_value"] = param.maxValue;
        p["default_value"] = param.defaultValue;
        p["is_toggle"] = param.isToggle;
        p["is_integer"] = param.isInteger;
        p["is_logarithmic"] = param.isLogarithmic;
        params.append(p);
    }
    d["parameters"] = params;

    py::list ports;
    for (const auto& port : info.ports) {
        py::dict p;
        p["index"] = port.index;
        p["symbol"] = port.symbol;
        p["name"] = port.name;
        p["is_input"] = (port.direction == PortDirection::Input);
        p["is_audio"] = (port.type == PortType::Audio);
        p["is_control"] = (port.type == PortType::Control);
        ports.append(p);
    }
    d["ports"] = ports;

    return d;
}

// Convert VuLevels to Python dict
py::dict vuLevelsToDict(const VuLevels& vu) {
    py::dict d;
    d["input_left"] = vu.inputLeft;
    d["input_right"] = vu.inputRight;
    d["output_left"] = vu.outputLeft;
    d["output_right"] = vu.outputRight;
    return d;
}

// Convert Snapshot to Python dict
py::dict snapshotToDict(const Snapshot& snap) {
    py::dict d;
    d["id"] = snap.id;
    d["name"] = snap.name;
    return d;
}

// Convert LufsLevels to Python dict
py::dict lufsLevelsToDict(const LufsLevels& lufs) {
    py::dict d;
    d["momentary"] = lufs.momentary;
    d["short_term"] = lufs.shortTerm;
    d["integrated"] = lufs.integrated;
    d["range"] = lufs.range;
    d["true_peak"] = lufs.truePeak;
    d["true_peak_left"] = lufs.truePeakLeft;
    d["true_peak_right"] = lufs.truePeakRight;
    return d;
}

// Convert CPUMetrics to Python dict
py::dict cpuMetricsToDict(const CPUMetrics& metrics) {
    py::dict d;
    d["total_cpu_percent"] = metrics.totalCpuPercent;
    d["audio_callback_percent"] = metrics.audioCallbackPercent;
    d["peak_cpu_percent"] = metrics.peakCpuPercent;
    d["average_cpu_percent"] = metrics.averageCpuPercent;
    d["xrun_count"] = metrics.xrunCount;
    d["budget_ms"] = metrics.budgetMs;
    d["current_callback_ms"] = metrics.currentCallbackMs;
    d["headroom_percent"] = metrics.headroomPercent;

    py::dict perPlugin;
    for (const auto& [id, percent] : metrics.perPluginPercent) {
        perPlugin[py::cast(id)] = percent;
    }
    d["per_plugin_percent"] = perPlugin;

    return d;
}

// Convert SpectrumData to Python dict
py::dict spectrumDataToDict(const SpectrumAnalyzer::SpectrumData& spectrum) {
    py::dict d;

    py::list magnitudes;
    for (float m : spectrum.magnitudes) {
        magnitudes.append(m);
    }
    d["magnitudes"] = magnitudes;

    py::list frequencies;
    for (float f : spectrum.frequencies) {
        frequencies.append(f);
    }
    d["frequencies"] = frequencies;

    d["peak_frequency"] = spectrum.peakFrequency;
    d["peak_magnitude"] = spectrum.peakMagnitude;
    d["spectral_centroid"] = spectrum.spectralCentroid;

    return d;
}

// Convert SidechainConnection to Python dict
py::dict sidechainConnectionToDict(const SidechainConnection& conn) {
    py::dict d;
    d["source_plugin"] = conn.sourcePlugin;
    d["dest_plugin"] = conn.destPlugin;
    d["dest_bus"] = conn.destBus;
    d["active"] = conn.active;
    return d;
}

// Convert IRInfo to Python dict
py::dict irInfoToDict(const ConvolutionProcessor::IRInfo& info) {
    py::dict d;
    d["name"] = info.name;
    d["path"] = info.path;
    d["channels"] = info.channels;
    d["length_samples"] = info.lengthSamples;
    d["length_ms"] = info.lengthMs;
    d["sample_rate"] = info.sampleRate;
    d["loaded"] = info.loaded;
    return d;
}

// ========================================
// Python Module Definition
// ========================================

PYBIND11_MODULE(map2_audio_engine, m) {
    m.doc() = "MAP2 Audio Engine - Professional Multi-Format Plugin Host with JUCE";

    // ========================================
    // Enums
    // ========================================

    py::enum_<PluginFormat>(m, "PluginFormat")
        .value("All", PluginFormat::All)
        .value("VST3", PluginFormat::VST3)
        .value("AudioUnit", PluginFormat::AudioUnit)
        .value("LV2", PluginFormat::LV2)
        .value("LADSPA", PluginFormat::LADSPA)
        .value("Unknown", PluginFormat::Unknown);

    // ========================================
    // Main Engine Class
    // ========================================

    py::class_<Map2AudioEngine, std::shared_ptr<Map2AudioEngine>>(m, "AudioEngine")
        .def(py::init<>())

        // ========================================
        // Lifecycle
        // ========================================

        .def("initialize", &Map2AudioEngine::initialize,
             py::arg("config_file") = "",
             "Initialize the audio engine")
        .def("shutdown", &Map2AudioEngine::shutdown,
             "Shutdown the audio engine")
        .def("is_running", &Map2AudioEngine::isRunning,
             "Check if engine is initialized")
        .def("get_version", &Map2AudioEngine::getVersion,
             "Get engine version string")

        // ========================================
        // System Info
        // ========================================

        .def("get_system_info", [](const Map2AudioEngine& self) {
            auto info = self.getSystemInfo();
            py::dict d;
            d["version"] = info.version;
            d["sample_rate"] = info.sampleRate;
            d["buffer_size"] = info.bufferSize;
            d["audio_device"] = info.audioDevice;
            d["lv2_path"] = info.lv2Path;
            d["running"] = info.running;
            d["audio_running"] = info.audioRunning;
            d["plugin_count"] = info.pluginCount;
            d["midi_enabled"] = info.midiEnabled;
            d["total_latency_samples"] = info.totalLatencySamples;
            d["total_latency_ms"] = info.totalLatencyMs;
            d["available"] = true;
            d["initialized"] = info.running;
            return d;
        }, "Get comprehensive system information")

        // ========================================
        // Audio Control
        // ========================================

        .def("start_audio", &Map2AudioEngine::startAudio,
             "Start audio processing")
        .def("stop_audio", &Map2AudioEngine::stopAudio,
             "Stop audio processing")
        .def("is_audio_running", &Map2AudioEngine::isAudioRunning,
             "Check if audio is running")

        // ========================================
        // Configuration
        // ========================================

        .def("set_sample_rate", &Map2AudioEngine::setSampleRate,
             py::arg("rate"),
             "Set sample rate")
        .def("get_sample_rate", &Map2AudioEngine::getSampleRate,
             "Get sample rate")
        .def("set_buffer_size", &Map2AudioEngine::setBufferSize,
             py::arg("size"),
             "Set buffer size")
        .def("get_buffer_size", &Map2AudioEngine::getBufferSize,
             "Get buffer size")
        .def("set_audio_device", &Map2AudioEngine::setAudioDevice,
             py::arg("device"),
             "Set audio device")
        .def("get_audio_device", &Map2AudioEngine::getAudioDevice,
             "Get audio device name")
        .def("set_lv2_path", &Map2AudioEngine::setLv2Path,
             py::arg("path"),
             "Set LV2 plugin search path")
        .def("get_lv2_path", &Map2AudioEngine::getLv2Path,
             "Get LV2 plugin path")

        // ========================================
        // Plugin Management (Multi-Format)
        // ========================================

        .def("list_plugins", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& info : self.listPlugins()) {
                result.append(pluginInfoToDict(info));
            }
            return result;
        }, "List all available plugins (all formats)")

        .def("list_plugins_by_format", [](const Map2AudioEngine& self, PluginFormat format) {
            py::list result;
            for (const auto& info : self.listPlugins(format)) {
                result.append(pluginInfoToDict(info));
            }
            return result;
        }, py::arg("format"), "List plugins by format (VST3, AU, LV2, LADSPA)")

        .def("list_vst3_plugins", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& info : self.listPlugins(PluginFormat::VST3)) {
                result.append(pluginInfoToDict(info));
            }
            return result;
        }, "List all available VST3 plugins")

        .def("list_au_plugins", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& info : self.listPlugins(PluginFormat::AudioUnit)) {
                result.append(pluginInfoToDict(info));
            }
            return result;
        }, "List all available AudioUnit plugins")

        .def("list_lv2_plugins", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& info : self.listPlugins(PluginFormat::LV2)) {
                result.append(pluginInfoToDict(info));
            }
            return result;
        }, "List all available LV2 plugins")

        .def("get_plugin_info", [](const Map2AudioEngine& self, const std::string& uri) {
            auto info = self.getPluginInfo(uri);
            if (info) {
                return pluginInfoToDict(*info);
            }
            return py::dict();
        }, py::arg("uri"), "Get plugin info by URI/ID")

        .def("load_plugin", &Map2AudioEngine::loadPlugin,
             py::arg("uri"),
             "Load a plugin and return instance ID")
        .def("unload_plugin", &Map2AudioEngine::unloadPlugin,
             py::arg("instance_id"),
             "Unload a plugin by instance ID")
        .def("scan_for_plugins", &Map2AudioEngine::scanForPlugins,
             py::arg("rescan_all") = false,
             "Scan for available plugins")

        // ========================================
        // Chain Management
        // ========================================

        .def("get_chain_order", &Map2AudioEngine::getChainOrder,
             "Get current plugin chain order")
        .def("add_to_chain", &Map2AudioEngine::addToChain,
             py::arg("instance_id"), py::arg("position") = -1,
             "Add plugin to chain at position")
        .def("remove_from_chain", &Map2AudioEngine::removeFromChain,
             py::arg("instance_id"),
             "Remove plugin from chain")
        .def("reorder_chain", &Map2AudioEngine::reorderChain,
             py::arg("order"),
             "Reorder plugin chain")

        // ========================================
        // Sidechain Routing (NEW)
        // ========================================

        .def("connect_sidechain", &Map2AudioEngine::connectSidechain,
             py::arg("source"), py::arg("dest"), py::arg("dest_bus") = 1,
             "Connect sidechain from source to dest plugin")
        .def("disconnect_sidechain", &Map2AudioEngine::disconnectSidechain,
             py::arg("dest"), py::arg("dest_bus") = 1,
             "Disconnect sidechain from dest plugin")
        .def("get_sidechain_connections", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& conn : self.getSidechainConnections()) {
                result.append(sidechainConnectionToDict(conn));
            }
            return result;
        }, "Get all sidechain connections")

        // ========================================
        // Parameters
        // ========================================

        .def("set_parameter", &Map2AudioEngine::setParameter,
             py::arg("instance_id"), py::arg("param_index"), py::arg("value"),
             "Set plugin parameter by index")
        .def("set_parameter_by_name", &Map2AudioEngine::setParameterByName,
             py::arg("instance_id"), py::arg("name"), py::arg("value"),
             "Set plugin parameter by name")
        .def("get_parameter", &Map2AudioEngine::getParameter,
             py::arg("instance_id"), py::arg("param_index"),
             "Get plugin parameter by index")
        .def("get_parameter_by_name", &Map2AudioEngine::getParameterByName,
             py::arg("instance_id"), py::arg("name"),
             "Get plugin parameter by name")
        .def("set_bypass", &Map2AudioEngine::setBypass,
             py::arg("instance_id"), py::arg("bypass"),
             "Set plugin bypass state")

        // ========================================
        // Snapshots
        // ========================================

        .def("get_current_snapshot", &Map2AudioEngine::getCurrentSnapshot,
             "Get current snapshot ID (0-5)")
        .def("load_snapshot", &Map2AudioEngine::loadSnapshot,
             py::arg("snapshot_id"),
             "Load a snapshot")
        .def("save_snapshot", &Map2AudioEngine::saveSnapshot,
             py::arg("snapshot_id"), py::arg("name") = "",
             "Save current state to snapshot")
        .def("list_snapshots", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& snap : self.listSnapshots()) {
                result.append(snapshotToDict(snap));
            }
            return result;
        }, "List all snapshots")

        // ========================================
        // MIDI
        // ========================================

        .def("enable_midi", &Map2AudioEngine::enableMidi,
             py::arg("enable"),
             "Enable or disable MIDI")
        .def("is_midi_enabled", &Map2AudioEngine::isMidiEnabled,
             "Check if MIDI is enabled")
        .def("get_midi_devices", &Map2AudioEngine::getMidiDevices,
             "List available MIDI devices")
        .def("set_midi_device", &Map2AudioEngine::setMidiDevice,
             py::arg("device"),
             "Set MIDI input device")

        // ========================================
        // VU Meters (Legacy)
        // ========================================

        .def("get_vu_levels", [](const Map2AudioEngine& self) {
            return vuLevelsToDict(self.getVuLevels());
        }, "Get master VU levels")

        .def("get_plugin_vu_levels", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& [id, vu] : self.getPluginVuLevels()) {
                py::dict d = vuLevelsToDict(vu);
                d["instance_id"] = id;
                result.append(d);
            }
            return result;
        }, "Get per-plugin VU levels")

        // ========================================
        // Spectrum Analysis (NEW)
        // ========================================

        .def("get_spectrum", [](const Map2AudioEngine& self) {
            return spectrumDataToDict(self.getSpectrum());
        }, "Get FFT spectrum data")

        .def("get_spectrum_magnitudes", &Map2AudioEngine::getSpectrumMagnitudes,
             "Get spectrum magnitude array")

        .def("get_spectrum_frequencies", &Map2AudioEngine::getSpectrumFrequencies,
             "Get spectrum frequency array")

        // ========================================
        // LUFS Loudness Metering (NEW)
        // ========================================

        .def("get_lufs_levels", [](const Map2AudioEngine& self) {
            return lufsLevelsToDict(self.getLufsLevels());
        }, "Get LUFS loudness levels (momentary, short-term, integrated)")

        .def("reset_integrated_loudness", &Map2AudioEngine::resetIntegratedLoudness,
             "Reset integrated loudness measurement")

        // ========================================
        // Phase Correlation (NEW)
        // ========================================

        .def("get_phase_correlation", &Map2AudioEngine::getPhaseCorrelation,
             "Get stereo phase correlation (-1 to +1)")

        .def("get_stereo_balance", &Map2AudioEngine::getStereoBalance,
             "Get stereo balance (-1=left, 0=center, +1=right)")

        .def("get_stereo_width", &Map2AudioEngine::getStereoWidth,
             "Get stereo width (0=mono, 1=full stereo)")

        // ========================================
        // CPU Monitoring (NEW)
        // ========================================

        .def("get_cpu_metrics", [](const Map2AudioEngine& self) {
            return cpuMetricsToDict(self.getCpuMetrics());
        }, "Get detailed CPU metrics")

        .def("get_total_cpu", &Map2AudioEngine::getTotalCpu,
             "Get total CPU usage percentage")

        .def("get_plugin_cpu", &Map2AudioEngine::getPluginCpu,
             py::arg("instance_id"),
             "Get CPU usage for specific plugin")

        .def("get_xrun_count", &Map2AudioEngine::getXRunCount,
             "Get number of audio dropouts (xruns)")

        // ========================================
        // Latency (NEW)
        // ========================================

        .def("get_total_latency_samples", &Map2AudioEngine::getTotalLatencySamples,
             "Get total chain latency in samples")

        .def("get_total_latency_ms", &Map2AudioEngine::getTotalLatencyMs,
             "Get total chain latency in milliseconds")

        .def("get_latency_breakdown", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& [id, samples] : self.getPerPluginLatency()) {
                py::dict d;
                d["plugin_id"] = id;
                d["latency_samples"] = samples;
                d["latency_ms"] = samplesToMs(samples, self.getSampleRate());
                result.append(d);
            }
            return result;
        }, "Get per-plugin latency breakdown")

        // ========================================
        // Convolution / Cabinet IR (NEW)
        // ========================================

        .def("load_cabinet_ir", &Map2AudioEngine::loadCabinetIR,
             py::arg("path"),
             "Load cabinet impulse response file")

        .def("load_reverb_ir", &Map2AudioEngine::loadReverbIR,
             py::arg("path"),
             "Load reverb impulse response file")

        .def("unload_cabinet_ir", &Map2AudioEngine::unloadCabinetIR,
             "Unload cabinet IR")

        .def("unload_reverb_ir", &Map2AudioEngine::unloadReverbIR,
             "Unload reverb IR")

        .def("set_cabinet_mix", &Map2AudioEngine::setCabinetMix,
             py::arg("mix"),
             "Set cabinet dry/wet mix (0.0-1.0)")

        .def("set_reverb_mix", &Map2AudioEngine::setReverbMix,
             py::arg("mix"),
             "Set reverb dry/wet mix (0.0-1.0)")

        .def("set_cabinet_bypass", &Map2AudioEngine::setCabinetBypass,
             py::arg("bypass"),
             "Bypass cabinet IR")

        .def("set_reverb_bypass", &Map2AudioEngine::setReverbBypass,
             py::arg("bypass"),
             "Bypass reverb IR")

        .def("get_cabinet_ir_info", [](const Map2AudioEngine& self) {
            return irInfoToDict(self.getCabinetIRInfo());
        }, "Get cabinet IR info")

        .def("get_reverb_ir_info", [](const Map2AudioEngine& self) {
            return irInfoToDict(self.getReverbIRInfo());
        }, "Get reverb IR info")

        // ========================================
        // Pedalboard State (Legacy Compatibility)
        // ========================================

        .def("get_current_pedalboard", [](const Map2AudioEngine& self) {
            py::dict d;
            d["name"] = "Current Chain";
            d["input_volume_db"] = 0.0;
            d["output_volume_db"] = 0.0;

            py::list items;
            auto chain = self.getChainOrder();
            for (size_t i = 0; i < chain.size(); i++) {
                py::dict item;
                item["instance_id"] = chain[i];
                item["is_enabled"] = true;
                item["controls"] = py::list();
                items.append(item);
            }
            d["items"] = items;
            return d;
        }, "Get current pedalboard configuration");

    // ========================================
    // Factory Functions
    // ========================================

    m.def("create_engine", []() {
        return std::make_shared<Map2AudioEngine>();
    }, "Create a new audio engine instance");

    // ========================================
    // Module-level Functions
    // ========================================

    m.def("get_version", []() {
        return std::string(ENGINE_VERSION);
    }, "Get module version");

    m.def("is_available", []() {
        return true;
    }, "Check if module is available");

    m.def("db_to_linear", &dbToLinear,
          py::arg("db"),
          "Convert dB to linear amplitude");

    m.def("linear_to_db", &linearToDb,
          py::arg("linear"),
          "Convert linear amplitude to dB");

    m.def("samples_to_ms", &samplesToMs,
          py::arg("samples"), py::arg("sample_rate"),
          "Convert samples to milliseconds");

    m.def("ms_to_samples", &msToSamples,
          py::arg("ms"), py::arg("sample_rate"),
          "Convert milliseconds to samples");
}
