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
#include "DynamicsProcessor.h"
#include "FilterProcessor.h"
#include "MidiHandler.h"

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
    d["path"] = info.path;
    d["channels"] = info.numChannels;
    d["length_samples"] = info.lengthSamples;
    d["length_seconds"] = info.lengthSeconds;
    d["sample_rate"] = info.originalSampleRate;
    d["stereo"] = info.stereo;
    return d;
}

// Convert DynamicsProcessor::Mode to string
std::string dynamicsModeToString(DynamicsProcessor::Mode mode) {
    switch (mode) {
        case DynamicsProcessor::Mode::Compressor: return "compressor";
        case DynamicsProcessor::Mode::Limiter: return "limiter";
        case DynamicsProcessor::Mode::NoiseGate: return "noise_gate";
        default: return "compressor";
    }
}

// Convert string to DynamicsProcessor::Mode
DynamicsProcessor::Mode stringToDynamicsMode(const std::string& str) {
    if (str == "limiter") return DynamicsProcessor::Mode::Limiter;
    if (str == "noise_gate") return DynamicsProcessor::Mode::NoiseGate;
    return DynamicsProcessor::Mode::Compressor;
}

// Convert DynamicsProcessor::Parameters to Python dict
py::dict dynamicsParamsToDict(const DynamicsProcessor::Parameters& params) {
    py::dict d;
    d["threshold"] = params.threshold;
    d["ratio"] = params.ratio;
    d["attack"] = params.attack;
    d["release"] = params.release;
    d["knee"] = params.knee;
    d["makeup_gain"] = params.makeupGain;
    d["auto_makeup"] = params.autoMakeup;
    d["mode"] = dynamicsModeToString(params.mode);
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to DynamicsProcessor::Parameters
DynamicsProcessor::Parameters dictToDynamicsParams(const py::dict& d) {
    DynamicsProcessor::Parameters params;
    if (d.contains("threshold")) params.threshold = d["threshold"].cast<float>();
    if (d.contains("ratio")) params.ratio = d["ratio"].cast<float>();
    if (d.contains("attack")) params.attack = d["attack"].cast<float>();
    if (d.contains("release")) params.release = d["release"].cast<float>();
    if (d.contains("knee")) params.knee = d["knee"].cast<float>();
    if (d.contains("makeup_gain")) params.makeupGain = d["makeup_gain"].cast<float>();
    if (d.contains("auto_makeup")) params.autoMakeup = d["auto_makeup"].cast<bool>();
    if (d.contains("mode")) params.mode = stringToDynamicsMode(d["mode"].cast<std::string>());
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// Convert DynamicsProcessor::Metering to Python dict
py::dict dynamicsMeteringToDict(const DynamicsProcessor::Metering& m) {
    py::dict d;
    d["input_level"] = m.inputLevel;
    d["output_level"] = m.outputLevel;
    d["gain_reduction"] = m.gainReduction;
    d["input_rms"] = m.inputRms;
    d["output_rms"] = m.outputRms;
    return d;
}

// ========================================
// Filter/EQ Type Converters
// ========================================

// Convert FilterProcessor::BandParameters to Python dict
py::dict filterBandToDict(const FilterProcessor::BandParameters& band) {
    py::dict d;
    d["type"] = FilterProcessor::filterTypeToString(band.type);
    d["frequency"] = band.frequency;
    d["gain"] = band.gain;
    d["q"] = band.q;
    d["enabled"] = band.enabled;
    return d;
}

// Convert Python dict to FilterProcessor::BandParameters
FilterProcessor::BandParameters dictToFilterBand(const py::dict& d) {
    FilterProcessor::BandParameters band;
    if (d.contains("type")) band.type = FilterProcessor::stringToFilterType(d["type"].cast<std::string>());
    if (d.contains("frequency")) band.frequency = d["frequency"].cast<float>();
    if (d.contains("gain")) band.gain = d["gain"].cast<float>();
    if (d.contains("q")) band.q = d["q"].cast<float>();
    if (d.contains("enabled")) band.enabled = d["enabled"].cast<bool>();
    return band;
}

// Convert FilterProcessor::Parameters to Python dict
py::dict filterParamsToDict(const FilterProcessor::Parameters& params) {
    py::dict d;
    py::list bands;
    for (int i = 0; i < FilterProcessor::MAX_BANDS; ++i) {
        bands.append(filterBandToDict(params.bands[i]));
    }
    d["bands"] = bands;
    d["output_gain"] = params.outputGain;
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to FilterProcessor::Parameters
FilterProcessor::Parameters dictToFilterParams(const py::dict& d) {
    FilterProcessor::Parameters params;
    if (d.contains("bands")) {
        auto bands = d["bands"].cast<py::list>();
        for (size_t i = 0; i < std::min(static_cast<size_t>(FilterProcessor::MAX_BANDS), bands.size()); ++i) {
            params.bands[i] = dictToFilterBand(bands[i].cast<py::dict>());
        }
    }
    if (d.contains("output_gain")) params.outputGain = d["output_gain"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// ========================================
// MIDI Type Converters
// ========================================

// Convert CurveType to string
std::string curveTypeToString(CurveType curve) {
    switch (curve) {
        case CurveType::Logarithmic: return "logarithmic";
        case CurveType::Exponential: return "exponential";
        case CurveType::SCurve: return "s_curve";
        default: return "linear";
    }
}

// Convert string to CurveType
CurveType stringToCurveType(const std::string& str) {
    if (str == "logarithmic") return CurveType::Logarithmic;
    if (str == "exponential") return CurveType::Exponential;
    if (str == "s_curve") return CurveType::SCurve;
    return CurveType::Linear;
}

// Convert CommandActionType to string
std::string actionTypeToString(CommandActionType action) {
    switch (action) {
        case CommandActionType::ActivateChain: return "activate_chain";
        case CommandActionType::ToggleChain: return "toggle_chain";
        case CommandActionType::TogglePlugin: return "toggle_plugin";
        case CommandActionType::SetRouting: return "set_routing";
        case CommandActionType::NextPreset: return "next_preset";
        case CommandActionType::PreviousPreset: return "previous_preset";
        default: return "activate_chain";
    }
}

// Convert string to CommandActionType
CommandActionType stringToActionType(const std::string& str) {
    if (str == "activate_chain") return CommandActionType::ActivateChain;
    if (str == "toggle_chain") return CommandActionType::ToggleChain;
    if (str == "toggle_plugin") return CommandActionType::TogglePlugin;
    if (str == "set_routing") return CommandActionType::SetRouting;
    if (str == "next_preset") return CommandActionType::NextPreset;
    if (str == "previous_preset") return CommandActionType::PreviousPreset;
    return CommandActionType::ActivateChain;
}

// Convert MidiMessageType to string
std::string midiMessageTypeToString(MidiMessageType type) {
    switch (type) {
        case MidiMessageType::NoteOn: return "note_on";
        case MidiMessageType::NoteOff: return "note_off";
        case MidiMessageType::ControlChange: return "control_change";
        case MidiMessageType::ProgramChange: return "program_change";
        case MidiMessageType::PitchBend: return "pitch_bend";
        case MidiMessageType::ChannelPressure: return "channel_pressure";
        case MidiMessageType::Clock: return "clock";
        case MidiMessageType::Start: return "start";
        case MidiMessageType::Stop: return "stop";
        case MidiMessageType::Continue: return "continue";
        default: return "other";
    }
}

// Convert string to MidiMessageType
MidiMessageType stringToMidiMessageType(const std::string& str) {
    if (str == "note_on") return MidiMessageType::NoteOn;
    if (str == "note_off") return MidiMessageType::NoteOff;
    if (str == "control_change") return MidiMessageType::ControlChange;
    if (str == "program_change") return MidiMessageType::ProgramChange;
    if (str == "pitch_bend") return MidiMessageType::PitchBend;
    if (str == "channel_pressure") return MidiMessageType::ChannelPressure;
    if (str == "clock") return MidiMessageType::Clock;
    if (str == "start") return MidiMessageType::Start;
    if (str == "stop") return MidiMessageType::Stop;
    if (str == "continue") return MidiMessageType::Continue;
    return MidiMessageType::Other;
}

// Convert MidiCCMapping to Python dict
py::dict midiCCMappingToDict(const MidiCCMapping& mapping) {
    py::dict d;
    d["id"] = mapping.id;
    d["channel"] = mapping.channel;
    d["cc_number"] = mapping.ccNumber;
    d["target_plugin"] = mapping.targetPlugin;
    d["parameter_symbol"] = mapping.parameterSymbol;
    d["parameter_index"] = mapping.parameterIndex;
    d["min_value"] = mapping.minValue;
    d["max_value"] = mapping.maxValue;
    d["curve"] = curveTypeToString(mapping.curve);
    d["invert"] = mapping.invert;
    d["active"] = mapping.active;
    d["feedback_enabled"] = mapping.feedbackEnabled;
    d["feedback_cc"] = mapping.feedbackCC;
    return d;
}

// Create MidiCCMapping from Python dict
MidiCCMapping dictToMidiCCMapping(const py::dict& d) {
    MidiCCMapping mapping;
    if (d.contains("id")) mapping.id = d["id"].cast<int>();
    if (d.contains("channel")) mapping.channel = d["channel"].cast<int>();
    if (d.contains("cc_number")) mapping.ccNumber = d["cc_number"].cast<int>();
    if (d.contains("target_plugin")) mapping.targetPlugin = d["target_plugin"].cast<InstanceId>();
    if (d.contains("parameter_symbol")) mapping.parameterSymbol = d["parameter_symbol"].cast<std::string>();
    if (d.contains("parameter_index")) mapping.parameterIndex = d["parameter_index"].cast<int>();
    if (d.contains("min_value")) mapping.minValue = d["min_value"].cast<float>();
    if (d.contains("max_value")) mapping.maxValue = d["max_value"].cast<float>();
    if (d.contains("curve")) mapping.curve = stringToCurveType(d["curve"].cast<std::string>());
    if (d.contains("invert")) mapping.invert = d["invert"].cast<bool>();
    if (d.contains("active")) mapping.active = d["active"].cast<bool>();
    if (d.contains("feedback_enabled")) mapping.feedbackEnabled = d["feedback_enabled"].cast<bool>();
    if (d.contains("feedback_cc")) mapping.feedbackCC = d["feedback_cc"].cast<int>();
    return mapping;
}

// Convert MidiCommandTrigger to Python dict
py::dict midiCommandTriggerToDict(const MidiCommandTrigger& trigger) {
    py::dict d;
    d["id"] = trigger.id;
    d["trigger_type"] = midiMessageTypeToString(trigger.triggerType);
    d["channel"] = trigger.channel;
    d["data1"] = trigger.data1;
    d["data2_threshold"] = trigger.data2Threshold;
    d["action"] = actionTypeToString(trigger.action);
    d["target_chain_id"] = trigger.targetChainId;
    d["target_plugin_uri"] = trigger.targetPluginUri;
    d["active"] = trigger.active;
    return d;
}

// Create MidiCommandTrigger from Python dict
MidiCommandTrigger dictToMidiCommandTrigger(const py::dict& d) {
    MidiCommandTrigger trigger;
    if (d.contains("id")) trigger.id = d["id"].cast<int>();
    if (d.contains("trigger_type")) trigger.triggerType = stringToMidiMessageType(d["trigger_type"].cast<std::string>());
    if (d.contains("channel")) trigger.channel = d["channel"].cast<int>();
    if (d.contains("data1")) trigger.data1 = d["data1"].cast<int>();
    if (d.contains("data2_threshold")) trigger.data2Threshold = d["data2_threshold"].cast<int>();
    if (d.contains("action")) trigger.action = stringToActionType(d["action"].cast<std::string>());
    if (d.contains("target_chain_id")) trigger.targetChainId = d["target_chain_id"].cast<int>();
    if (d.contains("target_plugin_uri")) trigger.targetPluginUri = d["target_plugin_uri"].cast<std::string>();
    if (d.contains("active")) trigger.active = d["active"].cast<bool>();
    return trigger;
}

// Convert MidiLearnTarget to Python dict
py::dict midiLearnTargetToDict(const MidiLearnTarget& target) {
    py::dict d;
    d["chain_id"] = target.chainId;
    d["plugin_id"] = target.pluginId;
    d["parameter_symbol"] = target.parameterSymbol;
    d["parameter_index"] = target.parameterIndex;
    d["min_value"] = target.minValue;
    d["max_value"] = target.maxValue;
    d["curve"] = curveTypeToString(target.curve);
    d["is_active"] = target.isActive;
    return d;
}

// Convert MidiStatus to Python dict
py::dict midiStatusToDict(const MidiStatus& status) {
    py::dict d;
    d["enabled"] = status.enabled;
    d["input_open"] = status.inputOpen;
    d["output_open"] = status.outputOpen;
    d["input_device"] = status.inputDevice;
    d["output_device"] = status.outputDevice;
    d["mappings_count"] = status.mappingsCount;
    d["commands_count"] = status.commandsCount;
    d["learning"] = status.learning;
    d["last_channel"] = status.lastChannel;
    d["last_cc"] = status.lastCC;
    d["last_value"] = status.lastValue;
    return d;
}

// Convert MidiMessage to Python dict
py::dict midiMessageToDict(const MidiMessage& msg) {
    py::dict d;
    d["type"] = midiMessageTypeToString(msg.type);
    d["channel"] = msg.channel;
    d["data1"] = msg.data1;
    d["data2"] = msg.data2;
    d["timestamp"] = msg.timestamp;
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
            d["input_channels"] = self.getNumInputChannels();
            d["output_channels"] = self.getNumOutputChannels();
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

        .def("set_num_input_channels", &Map2AudioEngine::setNumInputChannels,
             py::arg("channels"),
             "Set number of input channels (1-32)")
        .def("get_num_input_channels", &Map2AudioEngine::getNumInputChannels,
             "Get number of input channels")
        .def("set_num_output_channels", &Map2AudioEngine::setNumOutputChannels,
             py::arg("channels"),
             "Set number of output channels (1-32)")
        .def("get_num_output_channels", &Map2AudioEngine::getNumOutputChannels,
             "Get number of output channels")

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
        // MIDI (Basic)
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
        // MIDI CC Mappings (Enhanced)
        // ========================================

        .def("midi_add_cc_mapping", [](Map2AudioEngine& self, py::dict mapping) {
            return self.getMidiHandler().addCCMapping(dictToMidiCCMapping(mapping));
        }, py::arg("mapping"), "Add a CC mapping, returns mapping ID")

        .def("midi_update_cc_mapping", [](Map2AudioEngine& self, int id, py::dict mapping) {
            return self.getMidiHandler().updateCCMapping(id, dictToMidiCCMapping(mapping));
        }, py::arg("id"), py::arg("mapping"), "Update an existing CC mapping")

        .def("midi_remove_cc_mapping", [](Map2AudioEngine& self, int id) {
            return self.getMidiHandler().removeCCMapping(id);
        }, py::arg("id"), "Remove a CC mapping by ID")

        .def("midi_remove_cc_mapping_by_cc", [](Map2AudioEngine& self, int channel, int cc) {
            return self.getMidiHandler().removeCCMappingByCC(channel, cc);
        }, py::arg("channel"), py::arg("cc"), "Remove CC mapping by channel and CC number")

        .def("midi_get_all_cc_mappings", [](Map2AudioEngine& self) {
            py::list result;
            for (const auto& mapping : self.getMidiHandler().getAllCCMappings()) {
                result.append(midiCCMappingToDict(mapping));
            }
            return result;
        }, "Get all CC mappings")

        .def("midi_get_mappings_for_chain", [](Map2AudioEngine& self, int chainId) {
            py::list result;
            for (const auto& mapping : self.getMidiHandler().getMappingsForChain(chainId)) {
                result.append(midiCCMappingToDict(mapping));
            }
            return result;
        }, py::arg("chain_id"), "Get CC mappings for a specific chain")

        .def("midi_clear_cc_mappings", [](Map2AudioEngine& self) {
            self.getMidiHandler().clearCCMappings();
        }, "Clear all CC mappings")

        .def("midi_set_all_cc_mappings", [](Map2AudioEngine& self, py::list mappings) {
            std::vector<MidiCCMapping> midiMappings;
            for (auto item : mappings) {
                midiMappings.push_back(dictToMidiCCMapping(item.cast<py::dict>()));
            }
            self.getMidiHandler().setAllCCMappings(midiMappings);
        }, py::arg("mappings"), "Replace all CC mappings")

        .def("midi_set_active_chain", [](Map2AudioEngine& self, int chainId) {
            self.getMidiHandler().setActiveChain(chainId);
        }, py::arg("chain_id"), "Set the active chain for MIDI mappings")

        .def("midi_get_active_chain_id", [](const Map2AudioEngine& self) {
            return const_cast<Map2AudioEngine&>(self).getMidiHandler().getActiveChainId();
        }, "Get the active chain ID")

        // ========================================
        // MIDI Command Triggers
        // ========================================

        .def("midi_add_command_trigger", [](Map2AudioEngine& self, py::dict trigger) {
            return self.getMidiHandler().addCommandTrigger(dictToMidiCommandTrigger(trigger));
        }, py::arg("trigger"), "Add a command trigger, returns trigger ID")

        .def("midi_update_command_trigger", [](Map2AudioEngine& self, int id, py::dict trigger) {
            return self.getMidiHandler().updateCommandTrigger(id, dictToMidiCommandTrigger(trigger));
        }, py::arg("id"), py::arg("trigger"), "Update an existing command trigger")

        .def("midi_remove_command_trigger", [](Map2AudioEngine& self, int id) {
            return self.getMidiHandler().removeCommandTrigger(id);
        }, py::arg("id"), "Remove a command trigger by ID")

        .def("midi_get_all_command_triggers", [](Map2AudioEngine& self) {
            py::list result;
            for (const auto& trigger : self.getMidiHandler().getAllCommandTriggers()) {
                result.append(midiCommandTriggerToDict(trigger));
            }
            return result;
        }, "Get all command triggers")

        .def("midi_clear_command_triggers", [](Map2AudioEngine& self) {
            self.getMidiHandler().clearCommandTriggers();
        }, "Clear all command triggers")

        .def("midi_set_all_command_triggers", [](Map2AudioEngine& self, py::list triggers) {
            std::vector<MidiCommandTrigger> midiTriggers;
            for (auto item : triggers) {
                midiTriggers.push_back(dictToMidiCommandTrigger(item.cast<py::dict>()));
            }
            self.getMidiHandler().setAllCommandTriggers(midiTriggers);
        }, py::arg("triggers"), "Replace all command triggers")

        // ========================================
        // MIDI Learn
        // ========================================

        .def("midi_start_learn", [](Map2AudioEngine& self, int chainId, InstanceId pluginId,
                                     const std::string& paramSymbol, int paramIndex,
                                     float minVal, float maxVal, const std::string& curve) {
            self.getMidiHandler().startMidiLearn(chainId, pluginId, paramSymbol, paramIndex,
                                                  minVal, maxVal, stringToCurveType(curve));
        }, py::arg("chain_id"), py::arg("plugin_id"), py::arg("param_symbol"),
           py::arg("param_index"), py::arg("min_val") = 0.0f, py::arg("max_val") = 1.0f,
           py::arg("curve") = "linear", "Start MIDI learn mode for a parameter")

        .def("midi_stop_learn", [](Map2AudioEngine& self) {
            self.getMidiHandler().stopMidiLearn();
        }, "Stop MIDI learn mode")

        .def("midi_is_learning", [](const Map2AudioEngine& self) {
            return const_cast<Map2AudioEngine&>(self).getMidiHandler().isLearning();
        }, "Check if MIDI learn mode is active")

        .def("midi_get_learn_target", [](Map2AudioEngine& self) {
            return midiLearnTargetToDict(self.getMidiHandler().getLearnTarget());
        }, "Get the current learn target info")

        // ========================================
        // MIDI Output (Controller Feedback)
        // ========================================

        .def("midi_send_cc", [](Map2AudioEngine& self, int channel, int cc, int value) {
            return self.getMidiHandler().sendCC(channel, cc, value);
        }, py::arg("channel"), py::arg("cc"), py::arg("value"),
           "Send a CC message to MIDI output")

        .def("midi_send_program_change", [](Map2AudioEngine& self, int channel, int program) {
            return self.getMidiHandler().sendProgramChange(channel, program);
        }, py::arg("channel"), py::arg("program"),
           "Send a Program Change message")

        .def("midi_send_note_on", [](Map2AudioEngine& self, int channel, int note, int velocity) {
            return self.getMidiHandler().sendNoteOn(channel, note, velocity);
        }, py::arg("channel"), py::arg("note"), py::arg("velocity"),
           "Send a Note On message")

        .def("midi_send_note_off", [](Map2AudioEngine& self, int channel, int note, int velocity) {
            return self.getMidiHandler().sendNoteOff(channel, note, velocity);
        }, py::arg("channel"), py::arg("note"), py::arg("velocity") = 0,
           "Send a Note Off message")

        .def("midi_send_parameter_feedback", [](Map2AudioEngine& self, int channel, int cc, float value) {
            self.getMidiHandler().sendParameterFeedback(channel, cc, value);
        }, py::arg("channel"), py::arg("cc"), py::arg("value"),
           "Send parameter value feedback to controller (0.0-1.0)")

        .def("midi_sync_all_mappings_to_controller", [](Map2AudioEngine& self) {
            self.getMidiHandler().syncAllMappingsToController();
        }, "Sync all active mapping values to controller (for chain switch)")

        // ========================================
        // Chain-to-Program Mapping
        // ========================================

        .def("midi_set_chain_program_mapping", [](Map2AudioEngine& self, int chainId, int programNumber) {
            self.getMidiHandler().setChainProgramMapping(chainId, programNumber);
        }, py::arg("chain_id"), py::arg("program_number"),
           "Map a chain ID to a MIDI program number")

        .def("midi_get_chain_for_program", [](const Map2AudioEngine& self, int programNumber) {
            return const_cast<Map2AudioEngine&>(self).getMidiHandler().getChainForProgram(programNumber);
        }, py::arg("program_number"), "Get chain ID for a program number (-1 if not mapped)")

        .def("midi_get_program_for_chain", [](const Map2AudioEngine& self, int chainId) {
            return const_cast<Map2AudioEngine&>(self).getMidiHandler().getProgramForChain(chainId);
        }, py::arg("chain_id"), "Get program number for a chain ID (-1 if not mapped)")

        .def("midi_clear_chain_program_mappings", [](Map2AudioEngine& self) {
            self.getMidiHandler().clearChainProgramMappings();
        }, "Clear all chain-to-program mappings")

        // ========================================
        // MIDI Status
        // ========================================

        .def("midi_get_status", [](Map2AudioEngine& self) {
            return midiStatusToDict(self.getMidiHandler().getStatus());
        }, "Get comprehensive MIDI status")

        // ========================================
        // MIDI Device Management (Enhanced)
        // ========================================

        .def("midi_get_input_devices", [](Map2AudioEngine& self) {
            return self.getMidiHandler().getInputDevices();
        }, "Get list of available MIDI input devices")

        .def("midi_get_output_devices", [](Map2AudioEngine& self) {
            return self.getMidiHandler().getOutputDevices();
        }, "Get list of available MIDI output devices")

        .def("midi_open_input_device", [](Map2AudioEngine& self, const std::string& device) {
            return self.getMidiHandler().openInputDevice(device);
        }, py::arg("device"), "Open a MIDI input device by name")

        .def("midi_open_output_device", [](Map2AudioEngine& self, const std::string& device) {
            return self.getMidiHandler().openOutputDevice(device);
        }, py::arg("device"), "Open a MIDI output device by name")

        .def("midi_close_input_device", [](Map2AudioEngine& self) {
            self.getMidiHandler().closeInputDevice();
        }, "Close the current MIDI input device")

        .def("midi_close_output_device", [](Map2AudioEngine& self) {
            self.getMidiHandler().closeOutputDevice();
        }, "Close the current MIDI output device")

        .def("midi_close_all_devices", [](Map2AudioEngine& self) {
            self.getMidiHandler().closeAllDevices();
        }, "Close all MIDI devices")

        .def("midi_get_current_input_device", [](Map2AudioEngine& self) {
            return self.getMidiHandler().getCurrentInputDevice();
        }, "Get the current MIDI input device name")

        .def("midi_get_current_output_device", [](Map2AudioEngine& self) {
            return self.getMidiHandler().getCurrentOutputDevice();
        }, "Get the current MIDI output device name")

        // ========================================
        // MIDI Callbacks (for Python-side event handling)
        // ========================================

        .def("midi_set_parameter_callback", [](Map2AudioEngine& self, py::function callback) {
            self.getMidiHandler().setParameterCallback(
                [callback](InstanceId plugin, const std::string& param, int index, float value) {
                    py::gil_scoped_acquire acquire;
                    try {
                        callback(plugin, param, index, value);
                    } catch (const py::error_already_set& e) {
                        // Log error but don't crash
                    }
                });
        }, py::arg("callback"), "Set callback for parameter changes from MIDI (plugin_id, param_symbol, index, value)")

        .def("midi_set_command_callback", [](Map2AudioEngine& self, py::function callback) {
            self.getMidiHandler().setCommandCallback(
                [callback](const MidiCommandTrigger& trigger) {
                    py::gil_scoped_acquire acquire;
                    try {
                        callback(midiCommandTriggerToDict(trigger));
                    } catch (const py::error_already_set& e) {
                        // Log error but don't crash
                    }
                });
        }, py::arg("callback"), "Set callback for command triggers (trigger dict)")

        .def("midi_set_monitor_callback", [](Map2AudioEngine& self, py::function callback) {
            self.getMidiHandler().setMonitorCallback(
                [callback](const MidiMessage& msg) {
                    py::gil_scoped_acquire acquire;
                    try {
                        callback(midiMessageToDict(msg));
                    } catch (const py::error_already_set& e) {
                        // Log error but don't crash
                    }
                });
        }, py::arg("callback"), "Set callback for all MIDI messages (for monitoring)")

        .def("midi_set_learn_complete_callback", [](Map2AudioEngine& self, py::function callback) {
            self.getMidiHandler().setLearnCompleteCallback(
                [callback](int channel, int cc) {
                    py::gil_scoped_acquire acquire;
                    try {
                        callback(channel, cc);
                    } catch (const py::error_already_set& e) {
                        // Log error but don't crash
                    }
                });
        }, py::arg("callback"), "Set callback for when MIDI learn completes (channel, cc)")

        .def("midi_set_chain_switch_callback", [](Map2AudioEngine& self, py::function callback) {
            self.getMidiHandler().setChainSwitchCallback(
                [callback](int programNumber, int chainId) {
                    py::gil_scoped_acquire acquire;
                    try {
                        callback(programNumber, chainId);
                    } catch (const py::error_already_set& e) {
                        // Log error but don't crash
                    }
                });
        }, py::arg("callback"), "Set callback for chain switch via Program Change (program, chain_id)")

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

        .def("get_phase_correlation", [](const Map2AudioEngine& self) {
            return self.getPhaseCorrelation();
        }, "Get stereo phase correlation (-1 to +1)")

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
        // Dynamics - Compressor (NEW)
        // ========================================

        .def("set_compressor_threshold", &Map2AudioEngine::setCompressorThreshold,
             py::arg("db"),
             "Set compressor threshold in dB (-60 to 0)")

        .def("set_compressor_ratio", &Map2AudioEngine::setCompressorRatio,
             py::arg("ratio"),
             "Set compressor ratio (1 to 20)")

        .def("set_compressor_attack", &Map2AudioEngine::setCompressorAttack,
             py::arg("ms"),
             "Set compressor attack time in ms (0.1 to 500)")

        .def("set_compressor_release", &Map2AudioEngine::setCompressorRelease,
             py::arg("ms"),
             "Set compressor release time in ms (10 to 5000)")

        .def("set_compressor_knee", &Map2AudioEngine::setCompressorKnee,
             py::arg("db"),
             "Set compressor knee width in dB (0 to 24)")

        .def("set_compressor_makeup_gain", &Map2AudioEngine::setCompressorMakeupGain,
             py::arg("db"),
             "Set compressor makeup gain in dB (-12 to 24)")

        .def("set_compressor_auto_makeup", &Map2AudioEngine::setCompressorAutoMakeup,
             py::arg("enabled"),
             "Enable/disable auto makeup gain")

        .def("set_compressor_bypass", &Map2AudioEngine::setCompressorBypass,
             py::arg("bypass"),
             "Bypass compressor")

        .def("get_compressor_parameters", [](const Map2AudioEngine& self) {
            return dynamicsParamsToDict(self.getCompressorParameters());
        }, "Get all compressor parameters")

        .def("set_compressor_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setCompressorParameters(dictToDynamicsParams(params));
        }, py::arg("params"), "Set all compressor parameters at once")

        .def("get_compressor_metering", [](const Map2AudioEngine& self) {
            return dynamicsMeteringToDict(self.getCompressorMetering());
        }, "Get compressor metering (input, output, gain reduction)")

        // ========================================
        // Dynamics - Limiter (NEW)
        // ========================================

        .def("set_limiter_threshold", &Map2AudioEngine::setLimiterThreshold,
             py::arg("db"),
             "Set limiter ceiling/threshold in dB")

        .def("set_limiter_release", &Map2AudioEngine::setLimiterRelease,
             py::arg("ms"),
             "Set limiter release time in ms")

        .def("set_limiter_bypass", &Map2AudioEngine::setLimiterBypass,
             py::arg("bypass"),
             "Bypass limiter")

        .def("get_limiter_parameters", [](const Map2AudioEngine& self) {
            return dynamicsParamsToDict(self.getLimiterParameters());
        }, "Get all limiter parameters")

        .def("get_limiter_metering", [](const Map2AudioEngine& self) {
            return dynamicsMeteringToDict(self.getLimiterMetering());
        }, "Get limiter metering (input, output, gain reduction)")

        // ========================================
        // Dynamics - Noise Gate (NEW)
        // ========================================

        .def("set_gate_threshold", &Map2AudioEngine::setGateThreshold,
             py::arg("db"),
             "Set noise gate threshold in dB")

        .def("set_gate_ratio", &Map2AudioEngine::setGateRatio,
             py::arg("ratio"),
             "Set noise gate ratio (attenuation below threshold)")

        .def("set_gate_attack", &Map2AudioEngine::setGateAttack,
             py::arg("ms"),
             "Set noise gate attack time in ms")

        .def("set_gate_release", &Map2AudioEngine::setGateRelease,
             py::arg("ms"),
             "Set noise gate release time in ms")

        .def("set_gate_bypass", &Map2AudioEngine::setGateBypass,
             py::arg("bypass"),
             "Bypass noise gate")

        .def("get_gate_parameters", [](const Map2AudioEngine& self) {
            return dynamicsParamsToDict(self.getGateParameters());
        }, "Get all noise gate parameters")

        .def("get_gate_metering", [](const Map2AudioEngine& self) {
            return dynamicsMeteringToDict(self.getGateMetering());
        }, "Get noise gate metering (input, output, gain reduction)")

        // ========================================
        // Dynamics - Combined Access (NEW)
        // ========================================

        .def("get_dynamics_metering", [](const Map2AudioEngine& self) {
            py::dict d;
            d["compressor"] = dynamicsMeteringToDict(self.getCompressorMetering());
            d["limiter"] = dynamicsMeteringToDict(self.getLimiterMetering());
            d["gate"] = dynamicsMeteringToDict(self.getGateMetering());
            return d;
        }, "Get all dynamics processor metering")

        // ========================================
        // EQ / Filter Processing (NEW)
        // ========================================

        .def("set_eq_band", [](Map2AudioEngine& self, int index, py::dict params) {
            self.setEQBand(index, dictToFilterBand(params));
        }, py::arg("index"), py::arg("params"), "Set EQ band parameters")

        .def("set_eq_band_frequency", &Map2AudioEngine::setEQBandFrequency,
             py::arg("index"), py::arg("hz"),
             "Set EQ band frequency in Hz")

        .def("set_eq_band_gain", &Map2AudioEngine::setEQBandGain,
             py::arg("index"), py::arg("db"),
             "Set EQ band gain in dB")

        .def("set_eq_band_q", &Map2AudioEngine::setEQBandQ,
             py::arg("index"), py::arg("q"),
             "Set EQ band Q factor")

        .def("set_eq_band_type", [](Map2AudioEngine& self, int index, const std::string& type) {
            self.setEQBandType(index, FilterProcessor::stringToFilterType(type));
        }, py::arg("index"), py::arg("type"), "Set EQ band filter type")

        .def("set_eq_band_enabled", &Map2AudioEngine::setEQBandEnabled,
             py::arg("index"), py::arg("enabled"),
             "Enable/disable EQ band")

        .def("get_eq_band", [](const Map2AudioEngine& self, int index) {
            return filterBandToDict(self.getEQBand(index));
        }, py::arg("index"), "Get EQ band parameters")

        .def("set_eq_output_gain", &Map2AudioEngine::setEQOutputGain,
             py::arg("db"),
             "Set EQ output gain in dB")

        .def("get_eq_output_gain", &Map2AudioEngine::getEQOutputGain,
             "Get EQ output gain in dB")

        .def("set_eq_bypass", &Map2AudioEngine::setEQBypass,
             py::arg("bypass"),
             "Bypass EQ")

        .def("is_eq_bypassed", &Map2AudioEngine::isEQBypassed,
             "Check if EQ is bypassed")

        .def("get_eq_parameters", [](const Map2AudioEngine& self) {
            return filterParamsToDict(self.getEQParameters());
        }, "Get all EQ parameters")

        .def("set_eq_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setEQParameters(dictToFilterParams(params));
        }, py::arg("params"), "Set all EQ parameters")

        .def("get_eq_frequency_response", [](const Map2AudioEngine& self, py::list frequencies) {
            std::vector<float> freqs;
            for (auto f : frequencies) {
                freqs.push_back(f.cast<float>());
            }
            auto response = self.getEQFrequencyResponse(freqs);
            py::list result;
            for (float r : response) {
                result.append(r);
            }
            return result;
        }, py::arg("frequencies"), "Get EQ frequency response at given frequencies")

        // ========================================
        // Parallel Chains (NEW)
        // ========================================

        .def("create_parallel_group", [](Map2AudioEngine& self, int position, int numBranches) {
            return self.getAudioGraph().createParallelGroup(position, numBranches);
        }, py::arg("position") = -1, py::arg("num_branches") = 2,
           "Create a parallel processing group, returns group ID")

        .def("remove_parallel_group", [](Map2AudioEngine& self, int groupId) {
            return self.getAudioGraph().removeParallelGroup(groupId);
        }, py::arg("group_id"), "Remove a parallel group")

        .def("add_to_parallel_branch", [](Map2AudioEngine& self, int groupId, int branchIndex,
                                           InstanceId pluginId, int position) {
            return self.getAudioGraph().addToParallelBranch(groupId, branchIndex, pluginId, position);
        }, py::arg("group_id"), py::arg("branch_index"), py::arg("plugin_id"), py::arg("position") = -1,
           "Add a plugin to a parallel branch")

        .def("remove_from_parallel_branch", [](Map2AudioEngine& self, int groupId, int branchIndex,
                                                InstanceId pluginId) {
            return self.getAudioGraph().removeFromParallelBranch(groupId, branchIndex, pluginId);
        }, py::arg("group_id"), py::arg("branch_index"), py::arg("plugin_id"),
           "Remove a plugin from a parallel branch")

        .def("set_parallel_ab_blend", [](Map2AudioEngine& self, int groupId, float blend) {
            self.getAudioGraph().setParallelABBlend(groupId, blend);
        }, py::arg("group_id"), py::arg("blend"),
           "Set A/B blend for parallel group (0.0 = all A, 1.0 = all B)")

        .def("get_parallel_ab_blend", [](const Map2AudioEngine& self, int groupId) {
            return const_cast<Map2AudioEngine&>(self).getAudioGraph().getParallelABBlend(groupId);
        }, py::arg("group_id"), "Get A/B blend for parallel group")

        .def("set_parallel_branch_level", [](Map2AudioEngine& self, int groupId, int branchIndex, float level) {
            self.getAudioGraph().setParallelBranchLevel(groupId, branchIndex, level);
        }, py::arg("group_id"), py::arg("branch_index"), py::arg("level"),
           "Set individual branch level (0.0 - 2.0)")

        .def("set_parallel_bypass", [](Map2AudioEngine& self, int groupId, bool bypass) {
            self.getAudioGraph().setParallelBypass(groupId, bypass);
        }, py::arg("group_id"), py::arg("bypass"),
           "Bypass a parallel group")

        .def("get_parallel_groups", [](const Map2AudioEngine& self) {
            py::list result;
            auto groups = const_cast<Map2AudioEngine&>(self).getAudioGraph().getParallelGroups();
            for (const auto& group : groups) {
                py::dict d;
                d["id"] = group.id;
                d["ab_blend"] = group.abBlend;
                d["master_level"] = group.masterLevel;
                d["bypass"] = group.bypass;

                py::list branches;
                for (const auto& branch : group.branches) {
                    py::list branchPlugins;
                    for (auto pluginId : branch) {
                        branchPlugins.append(pluginId);
                    }
                    branches.append(branchPlugins);
                }
                d["branches"] = branches;

                py::list levels;
                for (float level : group.branchLevels) {
                    levels.append(level);
                }
                d["branch_levels"] = levels;

                result.append(d);
            }
            return result;
        }, "Get all parallel groups")

        // ========================================
        // Neural Amp Modeler (NEW - RT-safe)
        // ========================================

        .def("is_nam_available", &Map2AudioEngine::isNAMAvailable,
             "Check if NAM support is compiled in")

        .def("load_nam_model", &Map2AudioEngine::loadNAMModel,
             py::arg("path"),
             "Load a NAM model (.nam file)")

        .def("unload_nam_model", &Map2AudioEngine::unloadNAMModel,
             "Unload current NAM model")

        .def("is_nam_model_loaded", &Map2AudioEngine::isNAMModelLoaded,
             "Check if NAM model is loaded")

        .def("is_nam_loading", &Map2AudioEngine::isNAMLoading,
             "Check if NAM model is currently loading")

        .def("get_nam_model_info", [](const Map2AudioEngine& self) {
            auto info = self.getNAMModelInfo();
            py::dict d;
            d["path"] = info.path;
            d["name"] = info.name;
            d["expected_sample_rate"] = info.expectedSampleRate;
            d["input_channels"] = info.inputChannels;
            d["output_channels"] = info.outputChannels;
            d["has_input_level"] = info.hasInputLevel;
            d["has_output_level"] = info.hasOutputLevel;
            d["input_level"] = info.inputLevel;
            d["output_level"] = info.outputLevel;
            d["loaded"] = info.loaded;
            return d;
        }, "Get NAM model information")

        .def("set_nam_input_gain", &Map2AudioEngine::setNAMInputGain,
             py::arg("db"),
             "Set NAM input gain in dB")

        .def("get_nam_input_gain", &Map2AudioEngine::getNAMInputGain,
             "Get NAM input gain in dB")

        .def("set_nam_output_gain", &Map2AudioEngine::setNAMOutputGain,
             py::arg("db"),
             "Set NAM output gain in dB")

        .def("get_nam_output_gain", &Map2AudioEngine::getNAMOutputGain,
             "Get NAM output gain in dB")

        .def("set_nam_bypass", &Map2AudioEngine::setNAMBypass,
             py::arg("bypass"),
             "Bypass NAM processor")

        .def("is_nam_bypassed", &Map2AudioEngine::isNAMBypassed,
             "Check if NAM is bypassed")

        .def("set_nam_normalize", &Map2AudioEngine::setNAMNormalize,
             py::arg("normalize"),
             "Enable/disable NAM output normalization")

        .def("is_nam_normalized", &Map2AudioEngine::isNAMNormalized,
             "Check if NAM normalization is enabled")

        .def("get_nam_input_level", &Map2AudioEngine::getNAMInputLevel,
             "Get NAM input metering level in dB")

        .def("get_nam_output_level", &Map2AudioEngine::getNAMOutputLevel,
             "Get NAM output metering level in dB")

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
