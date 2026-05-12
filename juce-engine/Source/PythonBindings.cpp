/**
 * MAP2 Audio Engine - Python Bindings
 * pybind11 module exposing the audio engine to Python
 * Version 2.0 - Full JUCE Integration with advanced metering
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>

#include <filesystem>  // T2507-5b — std::filesystem::path for recorder bindings.

#include "Map2AudioEngine.h"
#include "SpectrumAnalyzer.h"
#include "LufsMeter.h"
#include "PhaseCorrelation.h"
#include "CPUMonitor.h"
#include "ConvolutionProcessor.h"
#include "NativeConvolutionPluginProcessor.h"
#include "DynamicsProcessor.h"
#include "FilterProcessor.h"
#include "MidiHandler.h"
#include "ChorusProcessor.h"
#include "PhaserProcessor.h"
#include "PitchShifterProcessor.h"
#include "NativeNAMPluginProcessor.h"
#include "DelayProcessor.h"
#include "IntelliFX8VoiceChorusProcessor.h"
#include "BossXS1PolyShifterProcessor.h"
#include "ShoeGazeProcessor.h"
#include "LexiLoveProcessor.h"
#include "H3000Processor.h"
#include "SynthForge/Common/Types.h"
#include "LexiconHardwareProcessor.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <unordered_map>

#ifdef HAS_AVDECC
#include "AvdeccController.h"
#endif

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

py::dict pluginInstanceToDict(const PluginInstance& plugin) {
    py::dict d;
    d["instance_id"] = plugin.id;
    d["uri"] = plugin.uri;
    d["name"] = plugin.name;
    d["bypassed"] = plugin.bypassed;

    py::dict parameterValues;
    for (const auto& [name, value] : plugin.parameterValues) {
        parameterValues[py::str(name)] = value;
    }
    d["parameter_values"] = parameterValues;
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

ParallelMixerProcessor::Mode parallelMixerModeFromString(const std::string& value) {
    if (value == "multi_mix") {
        return ParallelMixerProcessor::Mode::MultiMix;
    }
    if (value == "wet_dry") {
        return ParallelMixerProcessor::Mode::WetDry;
    }
    return ParallelMixerProcessor::Mode::ABBlend;
}

JuceAudioGraph::RoutingTopologySpec dictToRoutingTopologySpec(const py::dict& raw) {
    JuceAudioGraph::RoutingTopologySpec spec;

    if (raw.contains("chain_order")) {
        for (auto item : raw["chain_order"].cast<py::list>()) {
            spec.chainOrder.push_back(item.cast<InstanceId>());
        }
    }

    if (raw.contains("parallel_groups")) {
        for (auto groupItem : raw["parallel_groups"].cast<py::list>()) {
            const auto groupDict = groupItem.cast<py::dict>();
            JuceAudioGraph::RoutingParallelGroupSpec groupSpec;
            if (groupDict.contains("ab_blend")) {
                groupSpec.abBlend = groupDict["ab_blend"].cast<float>();
            }
            if (groupDict.contains("master_level")) {
                groupSpec.masterLevel = groupDict["master_level"].cast<float>();
            }
            if (groupDict.contains("bypass")) {
                groupSpec.bypass = groupDict["bypass"].cast<bool>();
            }
            if (groupDict.contains("mode")) {
                groupSpec.mode = parallelMixerModeFromString(groupDict["mode"].cast<std::string>());
            }
            if (groupDict.contains("branches")) {
                for (auto branchItem : groupDict["branches"].cast<py::list>()) {
                    const auto branchDict = branchItem.cast<py::dict>();
                    JuceAudioGraph::RoutingBranchSpec branchSpec;
                    if (branchDict.contains("plugin_ids")) {
                        for (auto pluginItem : branchDict["plugin_ids"].cast<py::list>()) {
                            branchSpec.pluginIds.push_back(pluginItem.cast<InstanceId>());
                        }
                    }
                    if (branchDict.contains("level")) {
                        branchSpec.level = branchDict["level"].cast<float>();
                    }
                    if (branchDict.contains("chain_id")) {
                        branchSpec.chainId = branchDict["chain_id"].cast<int>();
                    }
                    groupSpec.branches.push_back(std::move(branchSpec));
                }
            }
            spec.parallelGroups.push_back(std::move(groupSpec));
        }
    }

    if (raw.contains("sidechain_connections")) {
        for (auto connItem : raw["sidechain_connections"].cast<py::list>()) {
            const auto connDict = connItem.cast<py::dict>();
            SidechainConnection connection;
            if (connDict.contains("source_plugin")) {
                connection.sourcePlugin = connDict["source_plugin"].cast<InstanceId>();
            }
            if (connDict.contains("dest_plugin")) {
                connection.destPlugin = connDict["dest_plugin"].cast<InstanceId>();
            }
            if (connDict.contains("dest_bus")) {
                connection.destBus = connDict["dest_bus"].cast<int>();
            }
            if (connDict.contains("active")) {
                connection.active = connDict["active"].cast<bool>();
            }
            spec.sidechainConnections.push_back(connection);
        }
    }

    return spec;
}

juce::var pyObjectToJuceVar(const py::handle& value);

std::map<std::string, juce::var> pyDictToJuceVarMap(const py::dict& raw) {
    std::map<std::string, juce::var> result;
    for (auto item : raw) {
        result[item.first.cast<std::string>()] = pyObjectToJuceVar(item.second);
    }
    return result;
}

juce::var pyObjectToJuceVar(const py::handle& value) {
    if (value.is_none()) {
        return {};
    }
    if (py::isinstance<py::bool_>(value)) {
        return juce::var(py::cast<bool>(value));
    }
    if (py::isinstance<py::int_>(value)) {
        return juce::var(static_cast<juce::int64>(py::cast<int64_t>(value)));
    }
    if (py::isinstance<py::float_>(value)) {
        return juce::var(py::cast<double>(value));
    }
    if (py::isinstance<py::str>(value)) {
        return juce::var(juce::String(py::cast<std::string>(value)));
    }
    if (py::isinstance<py::dict>(value)) {
        auto dynamicObject = std::make_unique<juce::DynamicObject>();
        for (auto item : value.cast<py::dict>()) {
            dynamicObject->setProperty(
                juce::Identifier(item.first.cast<std::string>()),
                pyObjectToJuceVar(item.second));
        }
        return juce::var(dynamicObject.release());
    }
    if (py::isinstance<py::list>(value) || py::isinstance<py::tuple>(value)) {
        juce::Array<juce::var> items;
        for (auto item : value.cast<py::sequence>()) {
            items.add(pyObjectToJuceVar(item));
        }
        return juce::var(items);
    }
    return juce::var(juce::String(py::str(value).cast<std::string>()));
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

// Convert SynthForge PartConfig to Python dict
py::dict synthForgePartConfigToDict(const synthforge::PartConfig& config) {
    py::dict d;
    d["part_index"] = config.partIndex;
    d["midi_channel"] = config.midiChannel;
    d["output_bus"] = synthforge::outputBusToString(config.outputBus);
    d["level"] = config.level;
    d["pan"] = config.pan;
    d["mute"] = config.mute;
    d["solo"] = config.solo;
    return d;
}

// Convert Python dict to SynthForge PartConfig
synthforge::PartConfig dictToSynthForgePartConfig(const py::dict& d) {
    synthforge::PartConfig config;
    if (d.contains("part_index")) config.partIndex = d["part_index"].cast<int>();
    if (d.contains("midi_channel")) config.midiChannel = d["midi_channel"].cast<int>();
    if (d.contains("output_bus")) {
        config.outputBus = synthforge::outputBusFromString(d["output_bus"].cast<std::string>());
    }
    if (d.contains("level")) config.level = d["level"].cast<float>();
    if (d.contains("pan")) config.pan = d["pan"].cast<float>();
    if (d.contains("mute")) config.mute = d["mute"].cast<bool>();
    if (d.contains("solo")) config.solo = d["solo"].cast<bool>();
    return config;
}

py::dict synthForgePatchInfoToDict(const synthforge::PatchInfo& patch) {
    py::dict d;
    d["bank"] = patch.bank;
    d["program"] = patch.program;
    d["name"] = patch.name;
    d["category"] = patch.category;
    d["author"] = patch.author;
    d["description"] = patch.description;
    return d;
}

py::dict synthForgeVoiceMetricsToDict(const synthforge::VoiceMetrics& metrics) {
    py::dict d;
    d["active_voices"] = metrics.activeVoices;
    d["peak_voices"] = metrics.peakVoices;
    d["cpu_percent"] = metrics.cpuPercent;

    py::list voicesPerPart;
    for (int count : metrics.voicesPerPart) {
        voicesPerPart.append(count);
    }
    d["voices_per_part"] = voicesPerPart;
    return d;
}

py::dict synthForgeMeteringToDict(const synthforge::Metering& metering) {
    py::dict d;
    d["voice_metrics"] = synthForgeVoiceMetricsToDict(metering.voiceMetrics);

    py::list partLevels;
    for (float level : metering.partLevels) {
        partLevels.append(level);
    }
    d["part_levels"] = partLevels;
    return d;
}

py::dict synthForgeSampleLoadStatusToDict(const synthforge::SampleLoadStatus& status) {
    py::dict d;
    d["loaded"] = status.loaded;
    d["sampler_mode"] = status.samplerMode;
    d["part_index"] = status.partIndex;
    d["region_count"] = status.regionCount;
    d["loaded_sample_count"] = status.loadedSampleCount;
    d["sfz_path"] = status.sfzPath;
    d["soundfont_path"] = status.soundfontPath;
    d["soundfont_format"] = status.soundfontFormat;
    d["active_bank"] = status.activeBank;
    d["active_program"] = status.activeProgram;
    d["active_preset_name"] = status.activePresetName;
    d["engine"] = status.engine;
    d["engine_available"] = status.engineAvailable;
    d["last_error"] = status.lastError;

    py::list warnings;
    for (const auto& warning : status.warnings) {
        warnings.append(warning);
    }
    d["warnings"] = warnings;
    return d;
}

py::dict synthForgeStreamingConfigToDict(const synthforge::StreamingConfig& config) {
    py::dict d;
    d["enabled"] = config.enabled;
    d["preload_size"] = config.preloadSize;
    d["max_voices"] = config.maxVoices;
    d["interpolation"] = synthforge::interpolationModeToString(config.interpolation);
    d["quality_live"] = config.qualityLive;
    d["quality_freewheeling"] = config.qualityFreewheeling;
    d["memory_limit_mb"] = config.memoryLimitMb;
    return d;
}

synthforge::StreamingConfig dictToSynthForgeStreamingConfig(const py::dict& d) {
    synthforge::StreamingConfig config;
    if (d.contains("enabled")) config.enabled = d["enabled"].cast<bool>();
    if (d.contains("preload_size")) config.preloadSize = d["preload_size"].cast<uint32_t>();
    if (d.contains("max_voices")) config.maxVoices = d["max_voices"].cast<int>();
    if (d.contains("interpolation")) {
        config.interpolation = synthforge::interpolationModeFromString(d["interpolation"].cast<std::string>());
    }
    if (d.contains("quality_live")) config.qualityLive = d["quality_live"].cast<int>();
    if (d.contains("quality_freewheeling")) config.qualityFreewheeling = d["quality_freewheeling"].cast<int>();
    if (d.contains("memory_limit_mb")) config.memoryLimitMb = d["memory_limit_mb"].cast<int>();
    return config;
}

py::dict synthForgeHotReloadStatusToDict(const synthforge::HotReloadStatus& status) {
    py::dict d;
    d["enabled"] = status.enabled;
    d["interval_ms"] = status.intervalMs;
    d["pending_reload"] = status.pendingReload;
    d["reloaded"] = status.reloaded;
    d["generation"] = status.generation;
    d["last_reload_iso"] = status.lastReloadIso;
    d["last_error"] = status.lastError;
    return d;
}

py::dict synthForgeScalaTuningToDict(const synthforge::ScalaTuningConfig& config) {
    py::dict d;
    d["enabled"] = config.enabled;
    d["scala_path"] = config.scalaPath;
    d["root_key"] = config.rootKey;
    d["reference_hz"] = config.referenceFrequencyHz;
    return d;
}

synthforge::MpeConfig dictToSynthForgeMpeConfig(const py::dict& d) {
    synthforge::MpeConfig config;
    if (d.contains("enabled")) config.enabled = d["enabled"].cast<bool>();
    if (d.contains("lower_zone_channels")) config.lowerZoneChannels = d["lower_zone_channels"].cast<int>();
    if (d.contains("upper_zone_channels")) config.upperZoneChannels = d["upper_zone_channels"].cast<int>();
    if (d.contains("pitch_bend_range_semitones")) {
        config.pitchBendRangeSemitones = d["pitch_bend_range_semitones"].cast<int>();
    }
    return config;
}

py::dict synthForgeMpeConfigToDict(const synthforge::MpeConfig& config) {
    py::dict d;
    d["enabled"] = config.enabled;
    d["lower_zone_channels"] = config.lowerZoneChannels;
    d["upper_zone_channels"] = config.upperZoneChannels;
    d["pitch_bend_range_semitones"] = config.pitchBendRangeSemitones;
    return d;
}

std::string drumSoundSourceToString(map2::drummachine::DrumMachineProcessor::SoundSource source) {
    switch (source) {
        case map2::drummachine::DrumMachineProcessor::SoundSource::Synth:
            return "synth";
        case map2::drummachine::DrumMachineProcessor::SoundSource::Hybrid:
            return "hybrid";
        case map2::drummachine::DrumMachineProcessor::SoundSource::Sample:
        default:
            return "sample";
    }
}

map2::drummachine::DrumMachineProcessor::SoundSource drumSoundSourceFromString(const std::string& source) {
    if (source == "synth") {
        return map2::drummachine::DrumMachineProcessor::SoundSource::Synth;
    }
    if (source == "hybrid") {
        return map2::drummachine::DrumMachineProcessor::SoundSource::Hybrid;
    }
    return map2::drummachine::DrumMachineProcessor::SoundSource::Sample;
}

std::string drumSynthOscillatorToString(map2::drummachine::DrumSynthVoice::OscillatorType type) {
    switch (type) {
        case map2::drummachine::DrumSynthVoice::OscillatorType::Triangle:
            return "triangle";
        case map2::drummachine::DrumSynthVoice::OscillatorType::Saw:
            return "saw";
        case map2::drummachine::DrumSynthVoice::OscillatorType::Square:
            return "square";
        case map2::drummachine::DrumSynthVoice::OscillatorType::Metallic:
            return "metallic";
        case map2::drummachine::DrumSynthVoice::OscillatorType::Sine:
        default:
            return "sine";
    }
}

map2::drummachine::DrumSynthVoice::OscillatorType drumSynthOscillatorFromString(const std::string& type) {
    if (type == "triangle") {
        return map2::drummachine::DrumSynthVoice::OscillatorType::Triangle;
    }
    if (type == "saw") {
        return map2::drummachine::DrumSynthVoice::OscillatorType::Saw;
    }
    if (type == "square") {
        return map2::drummachine::DrumSynthVoice::OscillatorType::Square;
    }
    if (type == "metallic") {
        return map2::drummachine::DrumSynthVoice::OscillatorType::Metallic;
    }
    return map2::drummachine::DrumSynthVoice::OscillatorType::Sine;
}

py::dict drumSynthParamsToDict(const map2::drummachine::DrumMachineProcessor::DrumSynthParams& params) {
    py::dict d;
    d["oscillator_type"] = drumSynthOscillatorToString(params.oscillatorType);
    d["pitch_envelope_start_hz"] = params.pitchEnvelopeStartHz;
    d["pitch_envelope_end_hz"] = params.pitchEnvelopeEndHz;
    d["pitch_envelope_decay_ms"] = params.pitchEnvelopeDecayMs;
    d["noise_level"] = params.noiseLevel;
    d["noise_decay_ms"] = params.noiseDecayMs;
    d["body_decay_ms"] = params.bodyDecayMs;
    d["tone_amount"] = params.toneAmount;
    return d;
}

std::string drumPadFilterTypeToString(map2::drummachine::DrumMachineProcessor::PadFilterType type) {
    switch (type) {
        case map2::drummachine::DrumMachineProcessor::PadFilterType::HighPass:
            return "highpass";
        case map2::drummachine::DrumMachineProcessor::PadFilterType::BandPass:
            return "bandpass";
        case map2::drummachine::DrumMachineProcessor::PadFilterType::Notch:
            return "notch";
        case map2::drummachine::DrumMachineProcessor::PadFilterType::LowPass:
        default:
            return "lowpass";
    }
}

map2::drummachine::DrumMachineProcessor::PadFilterType drumPadFilterTypeFromString(const std::string& type) {
    if (type == "highpass") {
        return map2::drummachine::DrumMachineProcessor::PadFilterType::HighPass;
    }
    if (type == "bandpass") {
        return map2::drummachine::DrumMachineProcessor::PadFilterType::BandPass;
    }
    if (type == "notch") {
        return map2::drummachine::DrumMachineProcessor::PadFilterType::Notch;
    }
    return map2::drummachine::DrumMachineProcessor::PadFilterType::LowPass;
}

py::dict drumPadFilterConfigToDict(const map2::drummachine::DrumMachineProcessor::PadFilterConfig& config) {
    py::dict d;
    d["type"] = drumPadFilterTypeToString(config.type);
    d["cutoff_hz"] = config.cutoffHz;
    d["resonance"] = config.resonance;
    d["env_amount"] = config.envAmount;
    d["env_decay_ms"] = config.envDecayMs;
    return d;
}

py::dict synthForgeModMatrixRouteToDict(const synthforge::ModMatrixRoute& route) {
    py::dict d;
    d["source"] = route.source;
    d["destination"] = route.destination;
    d["amount"] = route.amount;
    d["bipolar"] = route.bipolar;
    d["enabled"] = route.enabled;
    return d;
}

synthforge::ModMatrixRoute dictToSynthForgeModMatrixRoute(const py::dict& d) {
    synthforge::ModMatrixRoute route;
    if (d.contains("source")) route.source = d["source"].cast<std::string>();
    if (d.contains("destination")) route.destination = d["destination"].cast<std::string>();
    if (d.contains("amount")) route.amount = d["amount"].cast<float>();
    if (d.contains("bipolar")) route.bipolar = d["bipolar"].cast<bool>();
    if (d.contains("enabled")) route.enabled = d["enabled"].cast<bool>();
    return route;
}

py::dict synthForgeFreezeStatusToDict(const synthforge::FreezeRenderStatus& status) {
    py::dict d;
    d["freeze_enabled"] = status.freezeEnabled;
    d["frozen_signal_ready"] = status.frozenSignalReady;
    d["freeze_samples"] = status.freezeSamples;
    d["render_path"] = status.renderPath;
    d["last_error"] = status.lastError;
    return d;
}

py::dict synthForgeAnalyzerFrameToDict(const synthforge::SamplerAnalyzerFrame& frame) {
    py::dict d;
    d["peak_left"] = frame.peakLeft;
    d["peak_right"] = frame.peakRight;
    d["rms_left"] = frame.rmsLeft;
    d["rms_right"] = frame.rmsRight;
    d["midi_events"] = frame.midiEvents;
    d["active_voices"] = frame.activeVoices;
    return d;
}

py::dict synthForgeBackendStatusToDict(const synthforge::SfzBackendStatus& status) {
    py::dict d;
    d["backend"] = status.backend;
    d["sfizz_available"] = status.sfizzAvailable;
    d["sfizz_loaded"] = status.sfizzLoaded;
    d["region_count"] = status.regionCount;
    d["group_count"] = status.groupCount;
    d["preloaded_samples"] = status.preloadedSamples;

    py::list unknown;
    for (const auto& opcode : status.unknownOpcodes) {
        unknown.append(opcode);
    }
    d["unknown_opcodes"] = unknown;

    py::list unsupported;
    for (const auto& opcode : status.unsupportedOpcodes) {
        unsupported.append(opcode);
    }
    d["unsupported_opcodes"] = unsupported;
    return d;
}

Map2AudioEngine& getModuleEngine() {
    static std::shared_ptr<Map2AudioEngine> engine = std::make_shared<Map2AudioEngine>();
    return *engine;
}

py::dict avbStreamStatsToDict(
    const std::string& streamId,
    const Map2AudioEngine::AvbStreamRuntimeStats& stats) {
    py::dict result;
    result["stream_id"] = streamId;
    result["available"] = true;
    result["frames_sent"] = stats.framesSent;
    result["frames_received"] = stats.framesReceived;
    result["send_errors"] = stats.sendErrors;
    result["receive_errors"] = stats.receiveErrors;
    result["underruns"] = stats.underruns;
    result["overruns"] = stats.overruns;
    result["timestamp_errors"] = stats.timestampErrors;
    result["sequence_errors"] = stats.sequenceErrors;
    result["bytes_transferred"] = stats.bytesTransferred;
    result["max_latency_ns"] = stats.maxLatencyNs;
    result["min_latency_ns"] = stats.minLatencyNs;

    // Backward-compatible camelCase aliases.
    result["framesSent"] = stats.framesSent;
    result["framesReceived"] = stats.framesReceived;
    result["sendErrors"] = stats.sendErrors;
    result["receiveErrors"] = stats.receiveErrors;
    result["timestampErrors"] = stats.timestampErrors;
    result["sequenceErrors"] = stats.sequenceErrors;
    result["bytesTransferred"] = stats.bytesTransferred;
    result["maxLatencyNs"] = stats.maxLatencyNs;
    result["minLatencyNs"] = stats.minLatencyNs;
    return result;
}

Map2AudioEngine::ExternalLoopDefinition dictToExternalLoopDefinition(const py::dict& raw) {
    Map2AudioEngine::ExternalLoopDefinition loop;
    if (raw.contains("loop_id")) loop.loopId = raw["loop_id"].cast<std::string>();
    if (raw.contains("name")) loop.name = raw["name"].cast<std::string>();
    if (raw.contains("channels")) loop.channels = raw["channels"].cast<int>();
    if (raw.contains("topology")) loop.topology = raw["topology"].cast<std::string>();
    if (raw.contains("send_endpoint_id")) loop.sendEndpointId = raw["send_endpoint_id"].cast<std::string>();
    if (raw.contains("return_endpoint_id")) loop.returnEndpointId = raw["return_endpoint_id"].cast<std::string>();
    if (raw.contains("target_added_latency_ms")) loop.targetAddedLatencyMs = raw["target_added_latency_ms"].cast<double>();
    if (raw.contains("measured_added_latency_ms")) loop.measuredAddedLatencyMs = raw["measured_added_latency_ms"].cast<double>();
    if (raw.contains("compensation_samples")) loop.compensationSamples = raw["compensation_samples"].cast<int>();
    if (raw.contains("bypass")) loop.bypass = raw["bypass"].cast<bool>();
    return loop;
}

Map2AudioEngine::ExternalLoopInsertion dictToExternalLoopInsertion(const py::dict& raw) {
    Map2AudioEngine::ExternalLoopInsertion insertion;
    if (raw.contains("insertion_id")) insertion.insertionId = raw["insertion_id"].cast<std::string>();
    if (raw.contains("loop_id")) insertion.loopId = raw["loop_id"].cast<std::string>();
    if (raw.contains("slot_index")) insertion.slotIndex = raw["slot_index"].cast<int>();
    if (raw.contains("enabled")) insertion.enabled = raw["enabled"].cast<bool>();
    if (raw.contains("mode")) insertion.mode = raw["mode"].cast<std::string>();
    if (raw.contains("blend_pct")) insertion.blendPct = raw["blend_pct"].cast<float>();
    if (raw.contains("send_gain_db")) insertion.sendGainDb = raw["send_gain_db"].cast<float>();
    if (raw.contains("return_gain_db")) insertion.returnGainDb = raw["return_gain_db"].cast<float>();
    if (raw.contains("crossfade_ms")) insertion.crossfadeMs = raw["crossfade_ms"].cast<int>();
    if (raw.contains("band_split_hz")) insertion.bandSplitHz = raw["band_split_hz"].cast<std::vector<float>>();
    return insertion;
}

py::dict externalLoopMetricsToDict(const Map2AudioEngine::ExternalLoopMetrics& metrics) {
    py::dict payload;
    payload["loop_id"] = metrics.loopId;
    payload["active"] = metrics.active;
    payload["bypass"] = metrics.bypass;
    payload["channels"] = metrics.channels;
    payload["target_added_latency_ms"] = metrics.targetAddedLatencyMs;
    payload["measured_added_latency_ms"] = metrics.measuredAddedLatencyMs;
    payload["compensation_samples"] = metrics.compensationSamples;
    return payload;
}

#ifdef HAS_AVDECC
py::dict avdeccEntityToDict(const Map2Audio::DiscoveredEntity& entity) {
    py::dict d;
    d["entity_id"] = py::str(juce::String::toHexString((int64_t)entity.entity_id).toStdString());
    d["entity_model_id"] = py::str(juce::String::toHexString((int64_t)entity.entity_model_id).toStdString());
    d["entity_name"] = entity.entity_name;
    d["firmware_version"] = entity.firmware_version;
    d["group_name"] = entity.group_name;
    d["serial_number"] = entity.serial_number;
    d["mac_address"] = py::str(
        juce::String::formatted(
            "%02x:%02x:%02x:%02x:%02x:%02x",
            entity.mac_address[0],
            entity.mac_address[1],
            entity.mac_address[2],
            entity.mac_address[3],
            entity.mac_address[4],
            entity.mac_address[5]
        ).toStdString()
    );
    d["talker_stream_sources"] = entity.talker_stream_sources;
    d["listener_stream_sinks"] = entity.listener_stream_sinks;
    d["talker_capabilities"] = entity.talker_capabilities;
    d["listener_capabilities"] = entity.listener_capabilities;
    d["gptp_grandmaster_id"] = py::str(juce::String::toHexString((int64_t)entity.gptp_grandmaster_id).toStdString());
    d["gptp_domain_number"] = entity.gptp_domain_number;
    d["vendor_id"] = (uint32_t)(entity.entity_model_id >> 40);
    d["model_id"] = (uint64_t)(entity.entity_model_id & 0xFFFFFFFFFF);
    d["available"] = entity.available;
    d["has_model"] = entity.has_model;
    return d;
}

std::optional<Map2Audio::Avdecc::DescriptorType> parseStreamDescriptorDirection(const std::string& directionRaw) {
    auto normalized = juce::String(directionRaw).trim().toLowerCase();
    if (normalized == "talker" || normalized == "output" || normalized == "stream_output") {
        return Map2Audio::Avdecc::DescriptorType::STREAM_OUTPUT;
    }
    if (normalized == "listener" || normalized == "input" || normalized == "stream_input") {
        return Map2Audio::Avdecc::DescriptorType::STREAM_INPUT;
    }
    return std::nullopt;
}

py::dict streamFormatResultToDict(const Map2Audio::StreamFormatOperationResult& result) {
    py::dict payload;
    payload["success"] = result.success;
    payload["status_code"] = static_cast<int>(result.status);
    payload["status"] = result.message.toStdString();
    payload["stream_format"] = py::int_(result.stream_format);
    return payload;
}
#endif

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
// Chorus Type Converters
// ========================================

// Convert ChorusProcessor::Parameters to Python dict
py::dict chorusParamsToDict(const ChorusProcessor::Parameters& params) {
    py::dict d;
    d["rate"] = params.rate;
    d["depth"] = params.depth;
    d["centre_delay"] = params.centreDelay;
    d["feedback"] = params.feedback;
    d["mix"] = params.mix;
    d["spread"] = params.spread;
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to ChorusProcessor::Parameters
ChorusProcessor::Parameters dictToChorusParams(const py::dict& d) {
    ChorusProcessor::Parameters params;
    if (d.contains("rate")) params.rate = d["rate"].cast<float>();
    if (d.contains("depth")) params.depth = d["depth"].cast<float>();
    if (d.contains("centre_delay")) params.centreDelay = d["centre_delay"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("spread")) params.spread = d["spread"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// Convert ChorusProcessor::Metering to Python dict
py::dict chorusMeteringToDict(const ChorusProcessor::Metering& m) {
    py::dict d;
    d["input_level"] = m.inputLevel;
    d["output_level"] = m.outputLevel;
    d["lfo_phase"] = m.lfoPhase;
    return d;
}

// ========================================
// Phaser Type Converters
// ========================================

// Convert PhaserProcessor::Parameters to Python dict
py::dict phaserParamsToDict(const PhaserProcessor::Parameters& params) {
    py::dict d;
    d["rate"] = params.rate;
    d["depth"] = params.depth;
    d["centre_frequency"] = params.centreFrequency;
    d["feedback"] = params.feedback;
    d["mix"] = params.mix;
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to PhaserProcessor::Parameters
PhaserProcessor::Parameters dictToPhaserParams(const py::dict& d) {
    PhaserProcessor::Parameters params;
    if (d.contains("rate")) params.rate = d["rate"].cast<float>();
    if (d.contains("depth")) params.depth = d["depth"].cast<float>();
    if (d.contains("centre_frequency")) params.centreFrequency = d["centre_frequency"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// Convert PhaserProcessor::Metering to Python dict
py::dict phaserMeteringToDict(const PhaserProcessor::Metering& m) {
    py::dict d;
    d["input_level"] = m.inputLevel;
    d["output_level"] = m.outputLevel;
    d["lfo_phase"] = m.lfoPhase;
    return d;
}

// ========================================
// Pitch Shifter Type Converters
// ========================================

// Convert PitchShifterProcessor::Preset to string
std::string pitchPresetToString(PitchShifterProcessor::Preset preset) {
    switch (preset) {
        case PitchShifterProcessor::Preset::Manual: return "manual";
        case PitchShifterProcessor::Preset::Eruption: return "eruption";
        case PitchShifterProcessor::Preset::Unchained: return "unchained";
        case PitchShifterProcessor::Preset::LittleGuitars: return "little_guitars";
        case PitchShifterProcessor::Preset::MeanStreet: return "mean_street";
        case PitchShifterProcessor::Preset::DropDeadLegs: return "drop_dead_legs";
        case PitchShifterProcessor::Preset::Panama: return "panama";
        case PitchShifterProcessor::Preset::Cathedral: return "cathedral";
        case PitchShifterProcessor::Preset::HotForTeacher: return "hot_for_teacher";
        case PitchShifterProcessor::Preset::WhyCantThisBeLove: return "why_cant_this_be_love";
        case PitchShifterProcessor::Preset::Dreams: return "dreams";
        case PitchShifterProcessor::Preset::FinishWhatYaStarted: return "finish_what_ya_started";
        case PitchShifterProcessor::Preset::RightNow: return "right_now";
        case PitchShifterProcessor::Preset::CantStopLovinYou: return "cant_stop_lovin_you";
        case PitchShifterProcessor::Preset::HumansBeingOuttro: return "humans_being_outtro";
        default: return "manual";
    }
}

// Convert string to PitchShifterProcessor::Preset
PitchShifterProcessor::Preset stringToPitchPreset(const std::string& str) {
    if (str == "eruption") return PitchShifterProcessor::Preset::Eruption;
    if (str == "unchained") return PitchShifterProcessor::Preset::Unchained;
    if (str == "little_guitars") return PitchShifterProcessor::Preset::LittleGuitars;
    if (str == "mean_street") return PitchShifterProcessor::Preset::MeanStreet;
    if (str == "drop_dead_legs") return PitchShifterProcessor::Preset::DropDeadLegs;
    if (str == "panama") return PitchShifterProcessor::Preset::Panama;
    if (str == "cathedral") return PitchShifterProcessor::Preset::Cathedral;
    if (str == "hot_for_teacher") return PitchShifterProcessor::Preset::HotForTeacher;
    if (str == "why_cant_this_be_love") return PitchShifterProcessor::Preset::WhyCantThisBeLove;
    if (str == "dreams") return PitchShifterProcessor::Preset::Dreams;
    if (str == "finish_what_ya_started") return PitchShifterProcessor::Preset::FinishWhatYaStarted;
    if (str == "right_now") return PitchShifterProcessor::Preset::RightNow;
    if (str == "cant_stop_lovin_you") return PitchShifterProcessor::Preset::CantStopLovinYou;
    if (str == "humans_being_outtro") return PitchShifterProcessor::Preset::HumansBeingOuttro;
    return PitchShifterProcessor::Preset::Manual;
}

// Convert PitchShifterProcessor::Parameters to Python dict
py::dict pitchShifterParamsToDict(const PitchShifterProcessor::Parameters& params) {
    py::dict d;
    d["pitch_l"] = params.pitchL;
    d["pitch_r"] = params.pitchR;
    d["delay_l"] = params.delayL;
    d["delay_r"] = params.delayR;
    d["feedback"] = params.feedback;
    d["mix"] = params.mix;
    d["spread"] = params.spread;
    d["preset"] = pitchPresetToString(params.preset);
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to PitchShifterProcessor::Parameters
PitchShifterProcessor::Parameters dictToPitchShifterParams(const py::dict& d) {
    PitchShifterProcessor::Parameters params;
    if (d.contains("pitch_l")) params.pitchL = d["pitch_l"].cast<float>();
    if (d.contains("pitch_r")) params.pitchR = d["pitch_r"].cast<float>();
    if (d.contains("delay_l")) params.delayL = d["delay_l"].cast<float>();
    if (d.contains("delay_r")) params.delayR = d["delay_r"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("spread")) params.spread = d["spread"].cast<float>();
    if (d.contains("preset")) params.preset = stringToPitchPreset(d["preset"].cast<std::string>());
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// Convert PitchShifterProcessor::Metering to Python dict
py::dict pitchShifterMeteringToDict(const PitchShifterProcessor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["grain_phase"] = m.grainPhase;
    return d;
}

// Convert PitchShifterProcessor::PresetInfo to Python dict
py::dict pitchPresetInfoToDict(const PitchShifterProcessor::PresetInfo& info) {
    py::dict d;
    d["name"] = info.name ? std::string(info.name) : "";
    d["song"] = info.song ? std::string(info.song) : "";
    d["album"] = info.album ? std::string(info.album) : "";
    d["year"] = info.year ? std::string(info.year) : "";
    d["description"] = info.description ? std::string(info.description) : "";
    return d;
}

// ========================================
// Delay Type Converters
// ========================================

py::dict delayParamsToDict(const DelayProcessor::Parameters& params) {
    py::dict d;
    d["delay_time_l"] = params.delayTimeL;
    d["delay_time_r"] = params.delayTimeR;
    d["feedback"] = params.feedback;
    d["mix"] = params.mix;
    d["tempo"] = params.tempo;
    d["tempo_sync_l"] = static_cast<int>(params.tempoSyncL);
    d["tempo_sync_r"] = static_cast<int>(params.tempoSyncR);
    d["tap1_level"] = params.tap1Level;
    d["tap2_level"] = params.tap2Level;
    d["tap2_ratio"] = params.tap2Ratio;
    d["tap3_level"] = params.tap3Level;
    d["tap3_ratio"] = params.tap3Ratio;
    d["tap4_level"] = params.tap4Level;
    d["tap4_ratio"] = params.tap4Ratio;
    d["stereo_mode"] = static_cast<int>(params.stereoMode);
    d["stereo_spread"] = params.stereoSpread;
    d["pan"] = params.pan;
    d["mod_rate"] = params.modRate;
    d["mod_depth"] = params.modDepth;
    d["mod_waveform"] = static_cast<int>(params.modWaveform);
    d["low_cut"] = params.lowCut;
    d["high_cut"] = params.highCut;
    d["filter_in_loop"] = params.filterInLoop;
    d["diffusion"] = params.diffusion;
    d["duck_threshold"] = params.duckThreshold;
    d["duck_amount"] = params.duckAmount;
    d["duck_release"] = params.duckRelease;
    d["output_level"] = params.outputLevel;
    d["spillover"] = params.spillover;
    d["bypass"] = params.bypass;
    return d;
}

DelayProcessor::Parameters dictToDelayParams(const py::dict& d) {
    DelayProcessor::Parameters params;
    if (d.contains("delay_time_l")) params.delayTimeL = d["delay_time_l"].cast<float>();
    if (d.contains("delay_time_r")) params.delayTimeR = d["delay_time_r"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("tempo")) params.tempo = d["tempo"].cast<float>();
    if (d.contains("tempo_sync_l")) {
        params.tempoSyncL = static_cast<DelayProcessor::TempoDivision>(d["tempo_sync_l"].cast<int>());
    }
    if (d.contains("tempo_sync_r")) {
        params.tempoSyncR = static_cast<DelayProcessor::TempoDivision>(d["tempo_sync_r"].cast<int>());
    }
    if (d.contains("tap1_level")) params.tap1Level = d["tap1_level"].cast<float>();
    if (d.contains("tap2_level")) params.tap2Level = d["tap2_level"].cast<float>();
    if (d.contains("tap2_ratio")) params.tap2Ratio = d["tap2_ratio"].cast<float>();
    if (d.contains("tap3_level")) params.tap3Level = d["tap3_level"].cast<float>();
    if (d.contains("tap3_ratio")) params.tap3Ratio = d["tap3_ratio"].cast<float>();
    if (d.contains("tap4_level")) params.tap4Level = d["tap4_level"].cast<float>();
    if (d.contains("tap4_ratio")) params.tap4Ratio = d["tap4_ratio"].cast<float>();
    if (d.contains("stereo_mode")) {
        params.stereoMode = static_cast<DelayProcessor::StereoMode>(d["stereo_mode"].cast<int>());
    }
    if (d.contains("stereo_spread")) params.stereoSpread = d["stereo_spread"].cast<float>();
    if (d.contains("pan")) params.pan = d["pan"].cast<float>();
    if (d.contains("mod_rate")) params.modRate = d["mod_rate"].cast<float>();
    if (d.contains("mod_depth")) params.modDepth = d["mod_depth"].cast<float>();
    if (d.contains("mod_waveform")) {
        params.modWaveform = static_cast<DelayProcessor::ModWaveform>(d["mod_waveform"].cast<int>());
    }
    if (d.contains("low_cut")) params.lowCut = d["low_cut"].cast<float>();
    if (d.contains("high_cut")) params.highCut = d["high_cut"].cast<float>();
    if (d.contains("filter_in_loop")) params.filterInLoop = d["filter_in_loop"].cast<bool>();
    if (d.contains("diffusion")) params.diffusion = d["diffusion"].cast<float>();
    if (d.contains("duck_threshold")) params.duckThreshold = d["duck_threshold"].cast<float>();
    if (d.contains("duck_amount")) params.duckAmount = d["duck_amount"].cast<float>();
    if (d.contains("duck_release")) params.duckRelease = d["duck_release"].cast<float>();
    if (d.contains("output_level")) params.outputLevel = d["output_level"].cast<float>();
    if (d.contains("spillover")) params.spillover = d["spillover"].cast<bool>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

py::dict delayMeteringToDict(const DelayProcessor::Metering& metering) {
    py::dict d;
    d["input_level_l"] = metering.inputLevelL;
    d["input_level_r"] = metering.inputLevelR;
    d["output_level_l"] = metering.outputLevelL;
    d["output_level_r"] = metering.outputLevelR;
    d["delay_level_l"] = metering.delayLevelL;
    d["delay_level_r"] = metering.delayLevelR;
    d["ducking_gain"] = metering.duckingGain;
    d["mod_phase"] = metering.modPhase;
    return d;
}

// ========================================
// IntelliFX 8-Voice Chorus Type Converters
// ========================================

// Convert IntelliFX8VoiceChorusProcessor::VoiceParameters to Python dict
py::dict intellifxVoiceParamsToDict(const IntelliFX8VoiceChorusProcessor::VoiceParameters& params) {
    py::dict d;
    d["level"] = params.level;
    d["pan"] = params.pan;
    d["delay"] = params.delay;
    d["depth"] = params.depth;
    d["rate"] = params.rate;
    return d;
}

// Convert Python dict to IntelliFX8VoiceChorusProcessor::VoiceParameters
IntelliFX8VoiceChorusProcessor::VoiceParameters dictToIntelliFXVoiceParams(const py::dict& d) {
    IntelliFX8VoiceChorusProcessor::VoiceParameters params;
    if (d.contains("level")) params.level = d["level"].cast<float>();
    if (d.contains("pan")) params.pan = d["pan"].cast<float>();
    if (d.contains("delay")) params.delay = d["delay"].cast<float>();
    if (d.contains("depth")) params.depth = d["depth"].cast<float>();
    if (d.contains("rate")) params.rate = d["rate"].cast<float>();
    return params;
}

// Convert IntelliFX8VoiceChorusProcessor::HushParameters to Python dict
py::dict intellifxHushParamsToDict(const IntelliFX8VoiceChorusProcessor::HushParameters& params) {
    py::dict d;
    d["enabled"] = params.enabled;
    d["threshold"] = params.threshold;
    d["release_rate"] = params.releaseRate;
    return d;
}

// Convert Python dict to IntelliFX8VoiceChorusProcessor::HushParameters
IntelliFX8VoiceChorusProcessor::HushParameters dictToIntelliFXHushParams(const py::dict& d) {
    IntelliFX8VoiceChorusProcessor::HushParameters params;
    if (d.contains("enabled")) params.enabled = d["enabled"].cast<bool>();
    if (d.contains("threshold")) params.threshold = d["threshold"].cast<float>();
    if (d.contains("release_rate")) params.releaseRate = d["release_rate"].cast<float>();
    return params;
}

// Convert IntelliFX8VoiceChorusProcessor::Parameters to Python dict
py::dict intellifxParamsToDict(const IntelliFX8VoiceChorusProcessor::Parameters& params) {
    py::dict d;

    // Voice parameters array
    py::list voices;
    for (int i = 0; i < IntelliFX8VoiceChorusProcessor::NUM_VOICES; ++i) {
        voices.append(intellifxVoiceParamsToDict(params.voices[i]));
    }
    d["voices"] = voices;

    // Global mixer
    d["chorus_level"] = params.chorusLevel;
    d["direct_level_l"] = params.directLevelL;
    d["direct_level_r"] = params.directLevelR;
    d["regen_l"] = params.regenL;
    d["regen_r"] = params.regenR;

    // HUSH
    d["hush"] = intellifxHushParamsToDict(params.hush);

    // Master
    d["bypass"] = params.bypass;

    return d;
}

// Convert Python dict to IntelliFX8VoiceChorusProcessor::Parameters
IntelliFX8VoiceChorusProcessor::Parameters dictToIntelliFXParams(const py::dict& d) {
    IntelliFX8VoiceChorusProcessor::Parameters params;

    if (d.contains("voices")) {
        auto voicesList = d["voices"].cast<py::list>();
        for (size_t i = 0; i < std::min(static_cast<size_t>(IntelliFX8VoiceChorusProcessor::NUM_VOICES),
                                        voicesList.size()); ++i) {
            params.voices[i] = dictToIntelliFXVoiceParams(voicesList[i].cast<py::dict>());
        }
    }

    if (d.contains("chorus_level")) params.chorusLevel = d["chorus_level"].cast<float>();
    if (d.contains("direct_level_l")) params.directLevelL = d["direct_level_l"].cast<float>();
    if (d.contains("direct_level_r")) params.directLevelR = d["direct_level_r"].cast<float>();
    if (d.contains("regen_l")) params.regenL = d["regen_l"].cast<float>();
    if (d.contains("regen_r")) params.regenR = d["regen_r"].cast<float>();
    if (d.contains("hush")) params.hush = dictToIntelliFXHushParams(d["hush"].cast<py::dict>());
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();

    return params;
}

// Convert IntelliFX8VoiceChorusProcessor::Metering to Python dict
py::dict intellifxMeteringToDict(const IntelliFX8VoiceChorusProcessor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["chorus_level_l"] = m.chorusLevelL;
    d["chorus_level_r"] = m.chorusLevelR;
    d["hush_gain_reduction"] = m.hushGainReduction;

    py::list lfoPhases;
    for (int i = 0; i < IntelliFX8VoiceChorusProcessor::NUM_VOICES; ++i) {
        lfoPhases.append(m.voiceLfoPhases[i]);
    }
    d["voice_lfo_phases"] = lfoPhases;

    return d;
}

// Convert IntelliFX8VoiceChorusProcessor::PresetInfo to Python dict
py::dict intellifxPresetInfoToDict(const IntelliFX8VoiceChorusProcessor::PresetInfo& info) {
    py::dict d;
    d["index"] = info.index;
    d["name"] = info.name ? std::string(info.name) : "";
    d["category"] = info.category ? std::string(info.category) : "";
    d["description"] = info.description ? std::string(info.description) : "";
    return d;
}

// ========================================
// Boss XS-1 Poly Shifter Type Converters
// ========================================

// Convert BossXS1PolyShifterProcessor::Preset to string
std::string bossXS1PresetToString(BossXS1PolyShifterProcessor::Preset preset) {
    switch (preset) {
        case BossXS1PolyShifterProcessor::Preset::Manual: return "manual";
        case BossXS1PolyShifterProcessor::Preset::DropD: return "drop_d";
        case BossXS1PolyShifterProcessor::Preset::DropDSharp: return "drop_d_sharp";
        case BossXS1PolyShifterProcessor::Preset::HalfStepDown: return "half_step_down";
        case BossXS1PolyShifterProcessor::Preset::Capo2ndFret: return "capo_2nd_fret";
        case BossXS1PolyShifterProcessor::Preset::Capo3rdFret: return "capo_3rd_fret";
        case BossXS1PolyShifterProcessor::Preset::Capo5thFret: return "capo_5th_fret";
        case BossXS1PolyShifterProcessor::Preset::OctaveUp: return "octave_up";
        case BossXS1PolyShifterProcessor::Preset::OctaveDown: return "octave_down";
        case BossXS1PolyShifterProcessor::Preset::OctaveUpDown: return "octave_up_down";
        case BossXS1PolyShifterProcessor::Preset::MicroPitchWide: return "micro_pitch_wide";
        case BossXS1PolyShifterProcessor::Preset::MicroPitchNarrow: return "micro_pitch_narrow";
        case BossXS1PolyShifterProcessor::Preset::VoiceDoubling: return "voice_doubling";
        case BossXS1PolyShifterProcessor::Preset::StringDoubling: return "string_doubling";
        case BossXS1PolyShifterProcessor::Preset::PianistOctaves: return "pianist_octaves";
        case BossXS1PolyShifterProcessor::Preset::SubBass: return "sub_bass";
        case BossXS1PolyShifterProcessor::Preset::SonicScreamer: return "sonic_screamer";
        case BossXS1PolyShifterProcessor::Preset::UniqueIntervals: return "unique_intervals";
        case BossXS1PolyShifterProcessor::Preset::MinorThird: return "minor_third";
        case BossXS1PolyShifterProcessor::Preset::ChordShift: return "chord_shift";
        case BossXS1PolyShifterProcessor::Preset::DetuneChorus: return "detune_chorus";
        case BossXS1PolyShifterProcessor::Preset::SpaceyVibrato: return "spacey_vibrato";
        case BossXS1PolyShifterProcessor::Preset::RoboticMod: return "robotic_mod";
        default: return "manual";
    }
}

// Convert string to BossXS1PolyShifterProcessor::Preset
BossXS1PolyShifterProcessor::Preset stringToBossXS1Preset(const std::string& str) {
    if (str == "drop_d") return BossXS1PolyShifterProcessor::Preset::DropD;
    if (str == "drop_d_sharp") return BossXS1PolyShifterProcessor::Preset::DropDSharp;
    if (str == "half_step_down") return BossXS1PolyShifterProcessor::Preset::HalfStepDown;
    if (str == "capo_2nd_fret") return BossXS1PolyShifterProcessor::Preset::Capo2ndFret;
    if (str == "capo_3rd_fret") return BossXS1PolyShifterProcessor::Preset::Capo3rdFret;
    if (str == "capo_5th_fret") return BossXS1PolyShifterProcessor::Preset::Capo5thFret;
    if (str == "octave_up") return BossXS1PolyShifterProcessor::Preset::OctaveUp;
    if (str == "octave_down") return BossXS1PolyShifterProcessor::Preset::OctaveDown;
    if (str == "octave_up_down") return BossXS1PolyShifterProcessor::Preset::OctaveUpDown;
    if (str == "micro_pitch_wide") return BossXS1PolyShifterProcessor::Preset::MicroPitchWide;
    if (str == "micro_pitch_narrow") return BossXS1PolyShifterProcessor::Preset::MicroPitchNarrow;
    if (str == "voice_doubling") return BossXS1PolyShifterProcessor::Preset::VoiceDoubling;
    if (str == "string_doubling") return BossXS1PolyShifterProcessor::Preset::StringDoubling;
    if (str == "pianist_octaves") return BossXS1PolyShifterProcessor::Preset::PianistOctaves;
    if (str == "sub_bass") return BossXS1PolyShifterProcessor::Preset::SubBass;
    if (str == "sonic_screamer") return BossXS1PolyShifterProcessor::Preset::SonicScreamer;
    if (str == "unique_intervals") return BossXS1PolyShifterProcessor::Preset::UniqueIntervals;
    if (str == "minor_third") return BossXS1PolyShifterProcessor::Preset::MinorThird;
    if (str == "chord_shift") return BossXS1PolyShifterProcessor::Preset::ChordShift;
    if (str == "detune_chorus") return BossXS1PolyShifterProcessor::Preset::DetuneChorus;
    if (str == "spacey_vibrato") return BossXS1PolyShifterProcessor::Preset::SpaceyVibrato;
    if (str == "robotic_mod") return BossXS1PolyShifterProcessor::Preset::RoboticMod;
    return BossXS1PolyShifterProcessor::Preset::Manual;
}

// Convert BossXS1PolyShifterProcessor::Parameters to Python dict
py::dict bossXS1ParamsToDict(const BossXS1PolyShifterProcessor::Parameters& params) {
    py::dict d;
    d["shift_amount"] = params.shiftAmount;
    d["balance"] = params.balance;
    d["shift_direction"] = params.shiftDirection;
    d["detune_mode"] = params.detuneMode;
    d["pedal_momentary"] = params.pedalMomentary;
    d["pedal_position"] = params.pedalPosition;
    d["pedal_min"] = params.pedalMin;
    d["pedal_max"] = params.pedalMax;
    d["pedal_enabled"] = params.pedalEnabled;
    d["detune_amount"] = params.detuneAmount;
    d["glide"] = params.glide;
    d["feedback"] = params.feedback;
    d["preset"] = bossXS1PresetToString(params.preset);
    d["bypass"] = params.bypass;
    d["active"] = params.active;
    return d;
}

// Convert Python dict to BossXS1PolyShifterProcessor::Parameters
BossXS1PolyShifterProcessor::Parameters dictToBossXS1Params(const py::dict& d) {
    BossXS1PolyShifterProcessor::Parameters params;
    if (d.contains("shift_amount")) params.shiftAmount = d["shift_amount"].cast<float>();
    if (d.contains("balance")) params.balance = d["balance"].cast<float>();
    if (d.contains("shift_direction")) params.shiftDirection = d["shift_direction"].cast<int>();
    if (d.contains("detune_mode")) params.detuneMode = d["detune_mode"].cast<bool>();
    if (d.contains("pedal_momentary")) params.pedalMomentary = d["pedal_momentary"].cast<bool>();
    if (d.contains("pedal_position")) params.pedalPosition = d["pedal_position"].cast<float>();
    if (d.contains("pedal_min")) params.pedalMin = d["pedal_min"].cast<float>();
    if (d.contains("pedal_max")) params.pedalMax = d["pedal_max"].cast<float>();
    if (d.contains("pedal_enabled")) params.pedalEnabled = d["pedal_enabled"].cast<bool>();
    if (d.contains("detune_amount")) params.detuneAmount = d["detune_amount"].cast<float>();
    if (d.contains("glide")) params.glide = d["glide"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("preset")) params.preset = stringToBossXS1Preset(d["preset"].cast<std::string>());
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    if (d.contains("active")) params.active = d["active"].cast<bool>();
    return params;
}

// ========================================
// ShoeGaze Type Converters
// ========================================

// Convert ShoeGazeProcessor::Preset to string
std::string shoegazePresetToString(ShoeGazeProcessor::Preset preset) {
    switch (preset) {
        case ShoeGazeProcessor::Preset::Manual: return "manual";
        case ShoeGazeProcessor::Preset::Loveless: return "loveless";
        case ShoeGazeProcessor::Preset::Souvlaki: return "souvlaki";
        case ShoeGazeProcessor::Preset::Treasure: return "treasure";
        case ShoeGazeProcessor::Preset::SpaceAge: return "space_age";
        case ShoeGazeProcessor::Preset::Psychocandy: return "psychocandy";
        case ShoeGazeProcessor::Preset::Nowhere: return "nowhere";
        default: return "manual";
    }
}

// Convert string to ShoeGazeProcessor::Preset
ShoeGazeProcessor::Preset stringToShoegazePreset(const std::string& str) {
    if (str == "loveless") return ShoeGazeProcessor::Preset::Loveless;
    if (str == "souvlaki") return ShoeGazeProcessor::Preset::Souvlaki;
    if (str == "treasure") return ShoeGazeProcessor::Preset::Treasure;
    if (str == "space_age") return ShoeGazeProcessor::Preset::SpaceAge;
    if (str == "psychocandy") return ShoeGazeProcessor::Preset::Psychocandy;
    if (str == "nowhere") return ShoeGazeProcessor::Preset::Nowhere;
    return ShoeGazeProcessor::Preset::Manual;
}

// Convert ShoeGazeProcessor::Parameters to Python dict
py::dict shoegazeParamsToDict(const ShoeGazeProcessor::Parameters& params) {
    py::dict d;
    // Primary controls
    d["atmosphere"] = params.atmosphere;
    d["decay"] = params.decay;
    d["shimmer"] = params.shimmer;
    d["shimmer_pitch"] = params.shimmerPitch;
    d["modulation"] = params.modulation;
    d["mod_rate"] = params.modRate;
    d["drive"] = params.drive;
    d["delay_time"] = params.delayTime;
    d["delay_feedback"] = params.delayFeedback;
    d["delay_mod"] = params.delayMod;
    d["low_cut"] = params.lowCut;
    d["high_cut"] = params.highCut;
    d["mix"] = params.mix;
    d["stereo_width"] = params.stereoWidth;
    // Advanced controls
    d["reverb_diffusion"] = params.reverbDiffusion;
    d["reverb_damping"] = params.reverbDamping;
    d["reverb_size"] = params.reverbSize;
    d["reverb_mod_depth"] = params.reverbModDepth;
    d["shimmer_feedback"] = params.shimmerFeedback;
    d["shimmer_delay"] = params.shimmerDelay;
    d["chorus_voices"] = params.chorusVoices;
    d["chorus_spread"] = params.chorusSpread;
    d["saturation_tone"] = params.saturationTone;
    d["ducking"] = params.ducking;
    // State
    d["preset"] = shoegazePresetToString(params.preset);
    d["spillover"] = params.spillover;
    d["bypass"] = params.bypass;
    return d;
}

// Convert Python dict to ShoeGazeProcessor::Parameters
ShoeGazeProcessor::Parameters dictToShoegazeParams(const py::dict& d) {
    ShoeGazeProcessor::Parameters params;
    // Primary controls
    if (d.contains("atmosphere")) params.atmosphere = d["atmosphere"].cast<float>();
    if (d.contains("decay")) params.decay = d["decay"].cast<float>();
    if (d.contains("shimmer")) params.shimmer = d["shimmer"].cast<float>();
    if (d.contains("shimmer_pitch")) params.shimmerPitch = d["shimmer_pitch"].cast<float>();
    if (d.contains("modulation")) params.modulation = d["modulation"].cast<float>();
    if (d.contains("mod_rate")) params.modRate = d["mod_rate"].cast<float>();
    if (d.contains("drive")) params.drive = d["drive"].cast<float>();
    if (d.contains("delay_time")) params.delayTime = d["delay_time"].cast<float>();
    if (d.contains("delay_feedback")) params.delayFeedback = d["delay_feedback"].cast<float>();
    if (d.contains("delay_mod")) params.delayMod = d["delay_mod"].cast<float>();
    if (d.contains("low_cut")) params.lowCut = d["low_cut"].cast<float>();
    if (d.contains("high_cut")) params.highCut = d["high_cut"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("stereo_width")) params.stereoWidth = d["stereo_width"].cast<float>();
    // Advanced controls
    if (d.contains("reverb_diffusion")) params.reverbDiffusion = d["reverb_diffusion"].cast<float>();
    if (d.contains("reverb_damping")) params.reverbDamping = d["reverb_damping"].cast<float>();
    if (d.contains("reverb_size")) params.reverbSize = d["reverb_size"].cast<float>();
    if (d.contains("reverb_mod_depth")) params.reverbModDepth = d["reverb_mod_depth"].cast<float>();
    if (d.contains("shimmer_feedback")) params.shimmerFeedback = d["shimmer_feedback"].cast<float>();
    if (d.contains("shimmer_delay")) params.shimmerDelay = d["shimmer_delay"].cast<float>();
    if (d.contains("chorus_voices")) params.chorusVoices = d["chorus_voices"].cast<int>();
    if (d.contains("chorus_spread")) params.chorusSpread = d["chorus_spread"].cast<float>();
    if (d.contains("saturation_tone")) params.saturationTone = d["saturation_tone"].cast<float>();
    if (d.contains("ducking")) params.ducking = d["ducking"].cast<float>();
    // State
    if (d.contains("preset")) params.preset = stringToShoegazePreset(d["preset"].cast<std::string>());
    if (d.contains("spillover")) params.spillover = d["spillover"].cast<bool>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

// Convert ShoeGazeProcessor::Metering to Python dict
py::dict shoegazeMeteringToDict(const ShoeGazeProcessor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["reverb_level_l"] = m.reverbLevelL;
    d["reverb_level_r"] = m.reverbLevelR;
    d["shimmer_level"] = m.shimmerLevel;
    d["saturation_amount"] = m.saturationAmount;
    d["chorus_lfo_phase"] = m.chorusLfoPhase;
    d["delay_mod_phase"] = m.delayModPhase;
    d["ducking_gain"] = m.duckingGain;
    return d;
}

// Convert ShoeGazeProcessor::PresetInfo to Python dict
py::dict shoegazePresetInfoToDict(const ShoeGazeProcessor::PresetInfo& info) {
    py::dict d;
    d["name"] = info.name ? std::string(info.name) : "";
    d["artist"] = info.artist ? std::string(info.artist) : "";
    d["description"] = info.description ? std::string(info.description) : "";
    return d;
}

// ========================================
// LexiLove Type Converters
// ========================================

// Convert LexiLoveProcessor::Algorithm to string
std::string lexiAlgorithmToString(LexiLoveProcessor::Algorithm algorithm) {
    switch (algorithm) {
        case LexiLoveProcessor::Algorithm::TiledRoom: return "tiled_room";
        case LexiLoveProcessor::Algorithm::RichPlate: return "rich_plate";
        case LexiLoveProcessor::Algorithm::ConcertHall: return "concert_hall";
        case LexiLoveProcessor::Algorithm::SmallRoom: return "small_room";
        case LexiLoveProcessor::Algorithm::RichChamber: return "rich_chamber";
        case LexiLoveProcessor::Algorithm::Gymnasium: return "gymnasium";
        case LexiLoveProcessor::Algorithm::LongHall: return "long_hall";
        case LexiLoveProcessor::Algorithm::GatedPlate: return "gated_plate";
        case LexiLoveProcessor::Algorithm::Infinite: return "infinite";
        default: return "rich_plate";
    }
}

// Convert string to LexiLoveProcessor::Algorithm
LexiLoveProcessor::Algorithm stringToLexiAlgorithm(const std::string& str) {
    if (str == "tiled_room") return LexiLoveProcessor::Algorithm::TiledRoom;
    if (str == "rich_plate") return LexiLoveProcessor::Algorithm::RichPlate;
    if (str == "concert_hall") return LexiLoveProcessor::Algorithm::ConcertHall;
    if (str == "small_room") return LexiLoveProcessor::Algorithm::SmallRoom;
    if (str == "rich_chamber") return LexiLoveProcessor::Algorithm::RichChamber;
    if (str == "gymnasium") return LexiLoveProcessor::Algorithm::Gymnasium;
    if (str == "long_hall") return LexiLoveProcessor::Algorithm::LongHall;
    if (str == "gated_plate") return LexiLoveProcessor::Algorithm::GatedPlate;
    if (str == "infinite") return LexiLoveProcessor::Algorithm::Infinite;
    return LexiLoveProcessor::Algorithm::RichPlate;
}

// Convert LexiLoveProcessor::Parameters to Python dict
py::dict lexiParamsToDict(const LexiLoveProcessor::Parameters& params) {
    py::dict d;
    d["algorithm"] = lexiAlgorithmToString(params.algorithm);
    d["algorithm_index"] = static_cast<int>(params.algorithm);
    d["pre_delay"] = params.preDelay;
    d["decay_time"] = params.decayTime;
    d["diffusion"] = params.diffusion;
    d["low_decay_mult"] = params.lowDecayMult;
    d["high_decay_mult"] = params.highDecayMult;
    d["low_crossover"] = params.lowCrossover;
    d["high_crossover"] = params.highCrossover;
    d["early_level"] = params.earlyLevel;
    d["early_pattern"] = params.earlyPattern;
    d["mod_depth"] = params.modDepth;
    d["mod_rate"] = params.modRate;
    d["mix"] = params.mix;
    d["high_cut"] = params.highCut;
    d["low_cut"] = params.lowCut;
    d["bypass"] = params.bypass;
    d["spillover"] = params.spillover;
    return d;
}

// Convert Python dict to LexiLoveProcessor::Parameters
LexiLoveProcessor::Parameters dictToLexiParams(const py::dict& d) {
    LexiLoveProcessor::Parameters params;
    if (d.contains("algorithm")) params.algorithm = stringToLexiAlgorithm(d["algorithm"].cast<std::string>());
    if (d.contains("algorithm_index")) params.algorithm = static_cast<LexiLoveProcessor::Algorithm>(d["algorithm_index"].cast<int>());
    if (d.contains("pre_delay")) params.preDelay = d["pre_delay"].cast<float>();
    if (d.contains("decay_time")) params.decayTime = d["decay_time"].cast<float>();
    if (d.contains("diffusion")) params.diffusion = d["diffusion"].cast<float>();
    if (d.contains("low_decay_mult")) params.lowDecayMult = d["low_decay_mult"].cast<float>();
    if (d.contains("high_decay_mult")) params.highDecayMult = d["high_decay_mult"].cast<float>();
    if (d.contains("low_crossover")) params.lowCrossover = d["low_crossover"].cast<float>();
    if (d.contains("high_crossover")) params.highCrossover = d["high_crossover"].cast<float>();
    if (d.contains("early_level")) params.earlyLevel = d["early_level"].cast<float>();
    if (d.contains("early_pattern")) params.earlyPattern = d["early_pattern"].cast<float>();
    if (d.contains("mod_depth")) params.modDepth = d["mod_depth"].cast<float>();
    if (d.contains("mod_rate")) params.modRate = d["mod_rate"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("high_cut")) params.highCut = d["high_cut"].cast<float>();
    if (d.contains("low_cut")) params.lowCut = d["low_cut"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    if (d.contains("spillover")) params.spillover = d["spillover"].cast<bool>();
    return params;
}

// Convert LexiLoveProcessor::Metering to Python dict
py::dict lexiMeteringToDict(const LexiLoveProcessor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["reverb_level_l"] = m.reverbLevelL;
    d["reverb_level_r"] = m.reverbLevelR;
    d["early_level"] = m.earlyLevel;
    d["late_level"] = m.lateLevel;
    d["mod_lfo_phase"] = m.modLfoPhase;
    d["current_decay"] = m.currentDecay;
    return d;
}

// Convert LexiLoveProcessor::AlgorithmInfo to Python dict
py::dict lexiAlgorithmInfoToDict(const LexiLoveProcessor::AlgorithmInfo& info) {
    py::dict d;
    d["name"] = info.name ? std::string(info.name) : "";
    d["short_name"] = info.shortName ? std::string(info.shortName) : "";
    d["description"] = info.description ? std::string(info.description) : "";
    return d;
}

// ========================================
// Ultra-Harmonizer Type Converters
// ========================================

// Convert H3000Processor::Algorithm to string
std::string h3000AlgorithmToString(H3000Processor::Algorithm algorithm) {
    switch (algorithm) {
        case H3000Processor::Algorithm::Micropitch: return "micropitch";
        case H3000Processor::Algorithm::DualShift: return "dual_shift";
        case H3000Processor::Algorithm::CrystalEchoes: return "crystal_echoes";
        case H3000Processor::Algorithm::StereoShift: return "stereo_shift";
        case H3000Processor::Algorithm::LayeredShift: return "layered_shift";
        case H3000Processor::Algorithm::SweptCombs: return "swept_combs";
        case H3000Processor::Algorithm::StutterShift: return "stutter_shift";
        case H3000Processor::Algorithm::ReversePitch: return "reverse_pitch";
        case H3000Processor::Algorithm::BandDelays: return "band_delays";
        case H3000Processor::Algorithm::PatchFactory: return "patch_factory";
        default: return "micropitch";
    }
}

// Convert string to H3000Processor::Algorithm
H3000Processor::Algorithm stringToH3000Algorithm(const std::string& str) {
    if (str == "micropitch") return H3000Processor::Algorithm::Micropitch;
    if (str == "dual_shift") return H3000Processor::Algorithm::DualShift;
    if (str == "crystal_echoes") return H3000Processor::Algorithm::CrystalEchoes;
    if (str == "stereo_shift") return H3000Processor::Algorithm::StereoShift;
    if (str == "layered_shift") return H3000Processor::Algorithm::LayeredShift;
    if (str == "swept_combs") return H3000Processor::Algorithm::SweptCombs;
    if (str == "stutter_shift") return H3000Processor::Algorithm::StutterShift;
    if (str == "reverse_pitch") return H3000Processor::Algorithm::ReversePitch;
    if (str == "band_delays") return H3000Processor::Algorithm::BandDelays;
    if (str == "patch_factory") return H3000Processor::Algorithm::PatchFactory;
    return H3000Processor::Algorithm::Micropitch;
}

// Convert H3000Processor::Parameters to Python dict
py::dict h3000ParamsToDict(const H3000Processor::Parameters& params) {
    py::dict d;
    d["algorithm"] = h3000AlgorithmToString(static_cast<H3000Processor::Algorithm>(params.algorithm));
    d["algorithm_index"] = params.algorithm;
    d["pitch_l"] = params.pitchL;
    d["pitch_r"] = params.pitchR;
    d["delay_l"] = params.delayL;
    d["delay_r"] = params.delayR;
    d["feedback"] = params.feedback;
    d["cross_feedback"] = params.crossFeedback;
    d["mod_depth"] = params.modDepth;
    d["mod_rate"] = params.modRate;
    d["low_cut"] = params.lowCut;
    d["high_cut"] = params.highCut;
    d["mix"] = params.mix;
    d["level_l"] = params.levelL;
    d["level_r"] = params.levelR;
    d["bypass"] = params.bypass;
    d["glide"] = params.glide;
    return d;
}

// Convert Python dict to H3000Processor::Parameters
H3000Processor::Parameters dictToH3000Params(const py::dict& d) {
    H3000Processor::Parameters params;
    if (d.contains("algorithm")) params.algorithm = static_cast<int>(stringToH3000Algorithm(d["algorithm"].cast<std::string>()));
    if (d.contains("algorithm_index")) params.algorithm = d["algorithm_index"].cast<int>();
    if (d.contains("pitch_l")) params.pitchL = d["pitch_l"].cast<float>();
    if (d.contains("pitch_r")) params.pitchR = d["pitch_r"].cast<float>();
    if (d.contains("delay_l")) params.delayL = d["delay_l"].cast<float>();
    if (d.contains("delay_r")) params.delayR = d["delay_r"].cast<float>();
    if (d.contains("feedback")) params.feedback = d["feedback"].cast<float>();
    if (d.contains("cross_feedback")) params.crossFeedback = d["cross_feedback"].cast<float>();
    if (d.contains("mod_depth")) params.modDepth = d["mod_depth"].cast<float>();
    if (d.contains("mod_rate")) params.modRate = d["mod_rate"].cast<float>();
    if (d.contains("low_cut")) params.lowCut = d["low_cut"].cast<float>();
    if (d.contains("high_cut")) params.highCut = d["high_cut"].cast<float>();
    if (d.contains("mix")) params.mix = d["mix"].cast<float>();
    if (d.contains("level_l")) params.levelL = d["level_l"].cast<float>();
    if (d.contains("level_r")) params.levelR = d["level_r"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    if (d.contains("glide")) params.glide = d["glide"].cast<float>();
    return params;
}

// Convert H3000Processor::Metering to Python dict
py::dict h3000MeteringToDict(const H3000Processor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["pitch_l_actual"] = m.pitchLActual;
    d["pitch_r_actual"] = m.pitchRActual;
    d["delay_l_actual"] = m.delayLActual;
    d["delay_r_actual"] = m.delayRActual;
    d["mod_phase"] = m.modPhase;
    return d;
}

// Convert H3000Processor::AlgorithmInfo to Python dict
py::dict h3000AlgorithmInfoToDict(const H3000Processor::AlgorithmInfo& info) {
    py::dict d;
    d["name"] = info.name ? std::string(info.name) : "";
    d["short_name"] = info.shortName ? std::string(info.shortName) : "";
    d["description"] = info.description ? std::string(info.description) : "";
    return d;
}

// ========================================
// Peavey 5150 Converters
// ========================================

std::string peavey5150PresetToString(Peavey5150Processor::Preset preset) {
    switch (preset) {
        case Peavey5150Processor::Preset::Manual: return "manual";
        case Peavey5150Processor::Preset::BrownSound: return "brown_sound";
        case Peavey5150Processor::Preset::PanteraScoop: return "pantera_scoop";
        case Peavey5150Processor::Preset::ModernMetal: return "modern_metal";
        case Peavey5150Processor::Preset::HardRock: return "hard_rock";
        case Peavey5150Processor::Preset::Crunch: return "crunch";
        default: return "manual";
    }
}

Peavey5150Processor::Preset stringToPeavey5150Preset(const std::string& str) {
    if (str == "brown_sound") return Peavey5150Processor::Preset::BrownSound;
    if (str == "pantera_scoop") return Peavey5150Processor::Preset::PanteraScoop;
    if (str == "modern_metal") return Peavey5150Processor::Preset::ModernMetal;
    if (str == "hard_rock") return Peavey5150Processor::Preset::HardRock;
    if (str == "crunch") return Peavey5150Processor::Preset::Crunch;
    return Peavey5150Processor::Preset::Manual;
}

py::dict peavey5150ParamsToDict(const Peavey5150Processor::Parameters& params) {
    py::dict d;
    d["pre_gain"] = params.preGain;
    d["post_gain"] = params.postGain;
    d["low"] = params.low;
    d["mid"] = params.mid;
    d["high"] = params.high;
    d["presence"] = params.presence;
    d["resonance"] = params.resonance;
    d["bright"] = params.bright;
    d["bias"] = params.bias;
    d["preset"] = static_cast<int>(params.preset);
    d["preset_name"] = peavey5150PresetToString(params.preset);
    d["bypass"] = params.bypass;
    return d;
}

Peavey5150Processor::Parameters dictToPeavey5150Params(const py::dict& d) {
    Peavey5150Processor::Parameters params;
    if (d.contains("pre_gain")) params.preGain = d["pre_gain"].cast<float>();
    if (d.contains("post_gain")) params.postGain = d["post_gain"].cast<float>();
    if (d.contains("low")) params.low = d["low"].cast<float>();
    if (d.contains("mid")) params.mid = d["mid"].cast<float>();
    if (d.contains("high")) params.high = d["high"].cast<float>();
    if (d.contains("presence")) params.presence = d["presence"].cast<float>();
    if (d.contains("resonance")) params.resonance = d["resonance"].cast<float>();
    if (d.contains("bright")) params.bright = d["bright"].cast<bool>();
    if (d.contains("bias")) params.bias = d["bias"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

py::dict peavey5150MeteringToDict(const Peavey5150Processor::Metering& m) {
    py::dict d;
    d["input_level"] = m.inputLevel;
    d["output_level"] = m.outputLevel;
    d["preamp_level"] = m.preampLevel;
    d["power_level"] = m.powerLevel;
    d["supply_sag"] = m.supplySag;
    d["cpu_load"] = m.cpuLoad;
    return d;
}

// ========================================
// Tweed Bassman 5F6-A Converters
// ========================================

std::string tweedBassmanPresetToString(TweedBassmanProcessor::Preset preset) {
    switch (preset) {
        case TweedBassmanProcessor::Preset::Manual: return "manual";
        case TweedBassmanProcessor::Preset::Stock5F6A: return "stock_5f6a";
        case TweedBassmanProcessor::Preset::CrankedTweed: return "cranked_tweed";
        case TweedBassmanProcessor::Preset::BluesBreakup: return "blues_breakup";
        case TweedBassmanProcessor::Preset::CountryClean: return "country_clean";
        case TweedBassmanProcessor::Preset::JumpedDirty: return "jumped_dirty";
        case TweedBassmanProcessor::Preset::HighGainMod: return "high_gain_mod";
        case TweedBassmanProcessor::Preset::NeilYoung: return "neil_young";
        case TweedBassmanProcessor::Preset::TweedDeluxe: return "tweed_deluxe";
        case TweedBassmanProcessor::Preset::JTM45Flavor: return "jtm45_flavor";
        case TweedBassmanProcessor::Preset::SagMonster: return "sag_monster";
        case TweedBassmanProcessor::Preset::PedalPlatform: return "pedal_platform";
        case TweedBassmanProcessor::Preset::BrightChimey: return "bright_chimey";
        case TweedBassmanProcessor::Preset::SRVTone: return "srv_tone";
        case TweedBassmanProcessor::Preset::RecordingDI: return "recording_di";
        default: return "manual";
    }
}

TweedBassmanProcessor::Preset stringToTweedBassmanPreset(const std::string& str) {
    if (str == "stock_5f6a") return TweedBassmanProcessor::Preset::Stock5F6A;
    if (str == "cranked_tweed") return TweedBassmanProcessor::Preset::CrankedTweed;
    if (str == "blues_breakup") return TweedBassmanProcessor::Preset::BluesBreakup;
    if (str == "country_clean") return TweedBassmanProcessor::Preset::CountryClean;
    if (str == "jumped_dirty") return TweedBassmanProcessor::Preset::JumpedDirty;
    if (str == "high_gain_mod") return TweedBassmanProcessor::Preset::HighGainMod;
    if (str == "neil_young") return TweedBassmanProcessor::Preset::NeilYoung;
    if (str == "tweed_deluxe") return TweedBassmanProcessor::Preset::TweedDeluxe;
    if (str == "jtm45_flavor") return TweedBassmanProcessor::Preset::JTM45Flavor;
    if (str == "sag_monster") return TweedBassmanProcessor::Preset::SagMonster;
    if (str == "pedal_platform") return TweedBassmanProcessor::Preset::PedalPlatform;
    if (str == "bright_chimey") return TweedBassmanProcessor::Preset::BrightChimey;
    if (str == "srv_tone") return TweedBassmanProcessor::Preset::SRVTone;
    if (str == "recording_di") return TweedBassmanProcessor::Preset::RecordingDI;
    return TweedBassmanProcessor::Preset::Manual;
}

py::dict tweedBassmanParamsToDict(const TweedBassmanProcessor::Parameters& params) {
    py::dict d;
    d["channel_mode"] = params.channelMode;
    d["normal_volume"] = params.normalVolume;
    d["bright_volume"] = params.brightVolume;
    d["bright_cap"] = params.brightCap;
    d["v1_tube_type"] = params.v1TubeType;
    d["cathode_bypass"] = params.cathodeBypass;
    d["cathode_bias"] = params.cathodeBias;
    d["treble"] = params.treble;
    d["mid"] = params.mid;
    d["bass"] = params.bass;
    d["raw_switch"] = params.rawSwitch;
    d["master_volume"] = params.masterVolume;
    d["presence"] = params.presence;
    d["nfb_mode"] = params.nfbMode;
    d["power_tube_type"] = params.powerTubeType;
    d["bias_mode"] = params.biasMode;
    d["rectifier_type"] = params.rectifierType;
    d["output_level"] = params.outputLevel;
    d["cabinet_enabled"] = params.cabinetEnabled;
    d["cabinet_ir"] = params.cabinetIR;
    d["preset"] = static_cast<int>(params.preset);
    d["preset_name"] = tweedBassmanPresetToString(params.preset);
    d["bypass"] = params.bypass;
    return d;
}

TweedBassmanProcessor::Parameters dictToTweedBassmanParams(const py::dict& d) {
    TweedBassmanProcessor::Parameters params;
    if (d.contains("channel_mode")) params.channelMode = d["channel_mode"].cast<int>();
    if (d.contains("normal_volume")) params.normalVolume = d["normal_volume"].cast<float>();
    if (d.contains("bright_volume")) params.brightVolume = d["bright_volume"].cast<float>();
    if (d.contains("bright_cap")) params.brightCap = d["bright_cap"].cast<bool>();
    if (d.contains("v1_tube_type")) params.v1TubeType = d["v1_tube_type"].cast<int>();
    if (d.contains("cathode_bypass")) params.cathodeBypass = d["cathode_bypass"].cast<bool>();
    if (d.contains("cathode_bias")) params.cathodeBias = d["cathode_bias"].cast<int>();
    if (d.contains("treble")) params.treble = d["treble"].cast<float>();
    if (d.contains("mid")) params.mid = d["mid"].cast<float>();
    if (d.contains("bass")) params.bass = d["bass"].cast<float>();
    if (d.contains("raw_switch")) params.rawSwitch = d["raw_switch"].cast<bool>();
    if (d.contains("master_volume")) params.masterVolume = d["master_volume"].cast<float>();
    if (d.contains("presence")) params.presence = d["presence"].cast<float>();
    if (d.contains("nfb_mode")) params.nfbMode = d["nfb_mode"].cast<int>();
    if (d.contains("power_tube_type")) params.powerTubeType = d["power_tube_type"].cast<int>();
    if (d.contains("bias_mode")) params.biasMode = d["bias_mode"].cast<int>();
    if (d.contains("rectifier_type")) params.rectifierType = d["rectifier_type"].cast<int>();
    if (d.contains("output_level")) params.outputLevel = d["output_level"].cast<float>();
    if (d.contains("cabinet_enabled")) params.cabinetEnabled = d["cabinet_enabled"].cast<bool>();
    if (d.contains("cabinet_ir")) params.cabinetIR = d["cabinet_ir"].cast<int>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

py::dict tweedBassmanMeteringToDict(const TweedBassmanProcessor::Metering& m) {
    py::dict d;
    d["input_level"] = m.inputLevel;
    d["output_level"] = m.outputLevel;
    d["preamp_level"] = m.preampLevel;
    d["power_level"] = m.powerLevel;
    d["supply_sag"] = m.supplySag;
    d["cpu_load"] = m.cpuLoad;
    return d;
}

// ========================================
// PassionFX Multi-Effect Converters
// ========================================

std::string passionfxPresetToString(PassionFXProcessor::Preset preset) {
    switch (preset) {
        case PassionFXProcessor::Preset::Manual: return "manual";
        case PassionFXProcessor::Preset::Liberty: return "liberty";
        case PassionFXProcessor::Preset::EroticNightmares: return "erotic_nightmares";
        case PassionFXProcessor::Preset::TheAnimal: return "the_animal";
        case PassionFXProcessor::Preset::Answers: return "answers";
        case PassionFXProcessor::Preset::TheRiddle: return "the_riddle";
        case PassionFXProcessor::Preset::Ballerina1224: return "ballerina_12_24";
        case PassionFXProcessor::Preset::ForTheLoveOfGod: return "for_the_love_of_god";
        case PassionFXProcessor::Preset::TheAudienceIsListening: return "the_audience_is_listening";
        case PassionFXProcessor::Preset::IWouldLoveTo: return "i_would_love_to";
        case PassionFXProcessor::Preset::BluePowder: return "blue_powder";
        case PassionFXProcessor::Preset::GreasyKidsStuff: return "greasy_kids_stuff";
        case PassionFXProcessor::Preset::AlienWaterKiss: return "alien_water_kiss";
        case PassionFXProcessor::Preset::Sisters: return "sisters";
        case PassionFXProcessor::Preset::LoveSecrets: return "love_secrets";
        default: return "manual";
    }
}

PassionFXProcessor::Preset stringToPassionfxPreset(const std::string& str) {
    if (str == "liberty") return PassionFXProcessor::Preset::Liberty;
    if (str == "erotic_nightmares") return PassionFXProcessor::Preset::EroticNightmares;
    if (str == "the_animal") return PassionFXProcessor::Preset::TheAnimal;
    if (str == "answers") return PassionFXProcessor::Preset::Answers;
    if (str == "the_riddle") return PassionFXProcessor::Preset::TheRiddle;
    if (str == "ballerina_12_24") return PassionFXProcessor::Preset::Ballerina1224;
    if (str == "for_the_love_of_god") return PassionFXProcessor::Preset::ForTheLoveOfGod;
    if (str == "the_audience_is_listening") return PassionFXProcessor::Preset::TheAudienceIsListening;
    if (str == "i_would_love_to") return PassionFXProcessor::Preset::IWouldLoveTo;
    if (str == "blue_powder") return PassionFXProcessor::Preset::BluePowder;
    if (str == "greasy_kids_stuff") return PassionFXProcessor::Preset::GreasyKidsStuff;
    if (str == "alien_water_kiss") return PassionFXProcessor::Preset::AlienWaterKiss;
    if (str == "sisters") return PassionFXProcessor::Preset::Sisters;
    if (str == "love_secrets") return PassionFXProcessor::Preset::LoveSecrets;
    return PassionFXProcessor::Preset::Manual;
}

py::dict passionfxParamsToDict(const PassionFXProcessor::Parameters& params) {
    py::dict d;
    // Gate
    d["gate_enabled"] = params.noiseGateEnabled;
    d["gate_threshold"] = params.noiseGateThreshold;
    d["gate_release"] = params.noiseGateRelease;
    // Comp
    d["comp_enabled"] = params.compressorEnabled;
    d["comp_threshold"] = params.compressorThreshold;
    d["comp_ratio"] = params.compressorRatio;
    d["comp_attack"] = params.compressorAttack;
    d["comp_release"] = params.compressorRelease;
    d["comp_glassy"] = params.compressorGlassy;
    // Wah
    d["wah_enabled"] = params.wahEnabled;
    d["wah_mode"] = params.wahMode;
    d["wah_position"] = params.wahPosition;
    d["wah_q"] = params.wahQ;
    // Phaser
    d["phaser_enabled"] = params.phaserEnabled;
    d["phaser_rate"] = params.phaserRate;
    d["phaser_depth"] = params.phaserDepth;
    d["phaser_stages"] = params.phaserStages;
    d["phaser_feedback"] = params.phaserFeedback;
    // Chorus
    d["chorus_enabled"] = params.chorusEnabled;
    d["chorus_rate"] = params.chorusRate;
    d["chorus_depth"] = params.chorusDepth;
    d["chorus_voices"] = params.chorusVoices;
    d["chorus_mix"] = params.chorusMix;
    // PitchShifter
    d["pitch_enabled"] = params.pitchShifterEnabled;
    d["pitch_semitones"] = params.pitchShifterSemitones;
    d["pitch_mix"] = params.pitchShifterMix;
    // Harmonizer
    d["harm_enabled"] = params.harmonizerEnabled;
    d["harm_voice1_interval"] = params.harmonizerVoice1;
    d["harm_voice2_interval"] = params.harmonizerVoice2;
    d["harm_detune_cents"] = params.harmonizerDetune;
    d["harm_mix"] = params.harmonizerMix;
    // Delay
    d["delay_enabled"] = params.delayEnabled;
    d["delay_time_l"] = params.delayTimeL;
    d["delay_time_r"] = params.delayTimeR;
    d["delay_feedback"] = params.delayFeedback;
    d["delay_mix"] = params.delayMix;
    d["delay_freeze"] = params.delayFreeze;
    d["delay_pitch_shift_l"] = params.delayPitchShiftL;
    d["delay_pitch_shift_r"] = params.delayPitchShiftR;
    // Reverb
    d["reverb_enabled"] = params.reverbEnabled;
    d["reverb_type"] = params.reverbType;
    d["reverb_decay"] = params.reverbDecay;
    d["reverb_shimmer_amount"] = params.reverbShimmerAmount;
    d["reverb_shimmer_interval"] = params.reverbShimmerInterval;
    d["reverb_mix"] = params.reverbMix;
    d["reverb_freeze"] = params.reverbFreeze;
    // EQ
    d["eq_enabled"] = params.eqEnabled;
    d["eq_low_gain"] = params.eqLowGain;
    d["eq_mid_gain"] = params.eqMidGain;
    d["eq_high_gain"] = params.eqHighGain;
    d["eq_tilt"] = params.eqTilt;
    // Exciter
    d["exciter_enabled"] = params.exciterEnabled;
    d["exciter_warmth"] = params.exciterWarmth;
    d["exciter_presence"] = params.exciterPresence;
    d["exciter_air"] = params.exciterAir;
    // Tremolo
    d["trem_enabled"] = params.tremoloEnabled;
    d["trem_rate"] = params.tremoloRate;
    d["trem_depth"] = params.tremoloDepth;
    d["trem_waveform"] = params.tremoloWaveform;
    // Global
    d["mix"] = params.globalMix;
    d["output_level"] = params.outputLevel;
    d["preset"] = static_cast<int>(params.preset);
    d["preset_name"] = passionfxPresetToString(params.preset);
    d["bypass"] = params.bypass;
    return d;
}

PassionFXProcessor::Parameters dictToPassionfxParams(const py::dict& d) {
    PassionFXProcessor::Parameters params;
    // Gate
    if (d.contains("gate_enabled")) params.noiseGateEnabled = d["gate_enabled"].cast<bool>();
    if (d.contains("gate_threshold")) params.noiseGateThreshold = d["gate_threshold"].cast<float>();
    if (d.contains("gate_release")) params.noiseGateRelease = d["gate_release"].cast<float>();
    // Comp
    if (d.contains("comp_enabled")) params.compressorEnabled = d["comp_enabled"].cast<bool>();
    if (d.contains("comp_threshold")) params.compressorThreshold = d["comp_threshold"].cast<float>();
    if (d.contains("comp_ratio")) params.compressorRatio = d["comp_ratio"].cast<float>();
    if (d.contains("comp_attack")) params.compressorAttack = d["comp_attack"].cast<float>();
    if (d.contains("comp_release")) params.compressorRelease = d["comp_release"].cast<float>();
    if (d.contains("comp_glassy")) params.compressorGlassy = d["comp_glassy"].cast<bool>();
    // Wah
    if (d.contains("wah_enabled")) params.wahEnabled = d["wah_enabled"].cast<bool>();
    if (d.contains("wah_mode")) params.wahMode = d["wah_mode"].cast<int>();
    if (d.contains("wah_position")) params.wahPosition = d["wah_position"].cast<float>();
    if (d.contains("wah_q")) params.wahQ = d["wah_q"].cast<float>();
    // Phaser
    if (d.contains("phaser_enabled")) params.phaserEnabled = d["phaser_enabled"].cast<bool>();
    if (d.contains("phaser_rate")) params.phaserRate = d["phaser_rate"].cast<float>();
    if (d.contains("phaser_depth")) params.phaserDepth = d["phaser_depth"].cast<float>();
    if (d.contains("phaser_stages")) params.phaserStages = d["phaser_stages"].cast<int>();
    if (d.contains("phaser_feedback")) params.phaserFeedback = d["phaser_feedback"].cast<float>();
    // Chorus
    if (d.contains("chorus_enabled")) params.chorusEnabled = d["chorus_enabled"].cast<bool>();
    if (d.contains("chorus_rate")) params.chorusRate = d["chorus_rate"].cast<float>();
    if (d.contains("chorus_depth")) params.chorusDepth = d["chorus_depth"].cast<float>();
    if (d.contains("chorus_voices")) params.chorusVoices = d["chorus_voices"].cast<int>();
    if (d.contains("chorus_mix")) params.chorusMix = d["chorus_mix"].cast<float>();
    // PitchShifter
    if (d.contains("pitch_enabled")) params.pitchShifterEnabled = d["pitch_enabled"].cast<bool>();
    if (d.contains("pitch_semitones")) params.pitchShifterSemitones = d["pitch_semitones"].cast<float>();
    if (d.contains("pitch_mix")) params.pitchShifterMix = d["pitch_mix"].cast<float>();
    // Harmonizer
    if (d.contains("harm_enabled")) params.harmonizerEnabled = d["harm_enabled"].cast<bool>();
    if (d.contains("harm_voice1_interval")) params.harmonizerVoice1 = d["harm_voice1_interval"].cast<float>();
    if (d.contains("harm_voice2_interval")) params.harmonizerVoice2 = d["harm_voice2_interval"].cast<float>();
    if (d.contains("harm_detune_cents")) params.harmonizerDetune = d["harm_detune_cents"].cast<float>();
    if (d.contains("harm_mix")) params.harmonizerMix = d["harm_mix"].cast<float>();
    // Delay
    if (d.contains("delay_enabled")) params.delayEnabled = d["delay_enabled"].cast<bool>();
    if (d.contains("delay_time_l")) params.delayTimeL = d["delay_time_l"].cast<float>();
    if (d.contains("delay_time_r")) params.delayTimeR = d["delay_time_r"].cast<float>();
    if (d.contains("delay_feedback")) params.delayFeedback = d["delay_feedback"].cast<float>();
    if (d.contains("delay_mix")) params.delayMix = d["delay_mix"].cast<float>();
    if (d.contains("delay_freeze")) params.delayFreeze = d["delay_freeze"].cast<bool>();
    if (d.contains("delay_pitch_shift_l")) params.delayPitchShiftL = d["delay_pitch_shift_l"].cast<float>();
    if (d.contains("delay_pitch_shift_r")) params.delayPitchShiftR = d["delay_pitch_shift_r"].cast<float>();
    // Reverb
    if (d.contains("reverb_enabled")) params.reverbEnabled = d["reverb_enabled"].cast<bool>();
    if (d.contains("reverb_type")) params.reverbType = d["reverb_type"].cast<int>();
    if (d.contains("reverb_decay")) params.reverbDecay = d["reverb_decay"].cast<float>();
    if (d.contains("reverb_shimmer_amount")) params.reverbShimmerAmount = d["reverb_shimmer_amount"].cast<float>();
    if (d.contains("reverb_shimmer_interval")) params.reverbShimmerInterval = d["reverb_shimmer_interval"].cast<float>();
    if (d.contains("reverb_mix")) params.reverbMix = d["reverb_mix"].cast<float>();
    if (d.contains("reverb_freeze")) params.reverbFreeze = d["reverb_freeze"].cast<bool>();
    // EQ
    if (d.contains("eq_enabled")) params.eqEnabled = d["eq_enabled"].cast<bool>();
    if (d.contains("eq_low_gain")) params.eqLowGain = d["eq_low_gain"].cast<float>();
    if (d.contains("eq_mid_gain")) params.eqMidGain = d["eq_mid_gain"].cast<float>();
    if (d.contains("eq_high_gain")) params.eqHighGain = d["eq_high_gain"].cast<float>();
    if (d.contains("eq_tilt")) params.eqTilt = d["eq_tilt"].cast<float>();
    // Exciter
    if (d.contains("exciter_enabled")) params.exciterEnabled = d["exciter_enabled"].cast<bool>();
    if (d.contains("exciter_warmth")) params.exciterWarmth = d["exciter_warmth"].cast<float>();
    if (d.contains("exciter_presence")) params.exciterPresence = d["exciter_presence"].cast<float>();
    if (d.contains("exciter_air")) params.exciterAir = d["exciter_air"].cast<float>();
    // Tremolo
    if (d.contains("trem_enabled")) params.tremoloEnabled = d["trem_enabled"].cast<bool>();
    if (d.contains("trem_rate")) params.tremoloRate = d["trem_rate"].cast<float>();
    if (d.contains("trem_depth")) params.tremoloDepth = d["trem_depth"].cast<float>();
    if (d.contains("trem_waveform")) params.tremoloWaveform = d["trem_waveform"].cast<int>();
    // Global
    if (d.contains("mix")) params.globalMix = d["mix"].cast<float>();
    if (d.contains("output_level")) params.outputLevel = d["output_level"].cast<float>();
    if (d.contains("bypass")) params.bypass = d["bypass"].cast<bool>();
    return params;
}

py::dict passionfxMeteringToDict(const PassionFXProcessor::Metering& m) {
    py::dict d;
    d["input_level_l"] = m.inputLevelL;
    d["input_level_r"] = m.inputLevelR;
    d["output_level_l"] = m.outputLevelL;
    d["output_level_r"] = m.outputLevelR;
    d["gate_gain"] = m.gateGain;
    d["comp_gain_reduction"] = m.compressorGainReduction;
    d["reverb_level_l"] = m.reverbLevelL;
    d["reverb_level_r"] = m.reverbLevelR;
    d["delay_level_l"] = m.delayLevelL;
    d["delay_level_r"] = m.delayLevelR;
    d["phaser_lfo_phase"] = m.phaserLfoPhase;
    d["tremolo_lfo_phase"] = m.tremoloLfoPhase;
    d["wah_position"] = m.wahPosition;
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
    d["target_plugin_position"] = trigger.targetPluginPosition >= 0 ? py::cast(trigger.targetPluginPosition) : py::none();
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
    if (d.contains("target_plugin_position") && !d["target_plugin_position"].is_none()) {
        trigger.targetPluginPosition = d["target_plugin_position"].cast<int>();
    }
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
            d["input_gain_db"] = info.inputGainDb;
            d["output_gain_db"] = info.outputGainDb;
            d["lv2_path"] = info.lv2Path;
            d["running"] = info.running;
            d["audio_running"] = info.audioRunning;
            d["plugin_count"] = info.pluginCount;
            d["midi_enabled"] = info.midiEnabled;
            d["total_latency_samples"] = info.totalLatencySamples;
            d["total_latency_ms"] = info.totalLatencyMs;
            d["input_channels"] = self.getNumInputChannels();
            d["output_channels"] = self.getNumOutputChannels();
            switch (self.getInputChannelMode()) {
                case 0:
                    d["input_channel_mode"] = "mono_left";
                    break;
                case 1:
                    d["input_channel_mode"] = "mono_right";
                    break;
                default:
                    d["input_channel_mode"] = "stereo";
                    break;
            }
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
        .def("set_monitoring_output_index", &Map2AudioEngine::setMonitoringOutputIndex,
             py::arg("index"),
             "Route the live monitoring mix to the selected hardware output pair")
        .def("get_monitoring_output_index", &Map2AudioEngine::getMonitoringOutputIndex,
             "Get the selected monitoring output pair start index")
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
        .def("set_input_channel_mode", &Map2AudioEngine::setInputChannelMode,
             py::arg("mode"),
             "Set input channel mode (0=Mono Left, 1=Mono Right, 2=Stereo)")
        .def("get_input_channel_mode", &Map2AudioEngine::getInputChannelMode,
             "Get input channel mode (0=Mono Left, 1=Mono Right, 2=Stereo)")
        .def("set_input_gain_db", &Map2AudioEngine::setInputGainDb,
             py::arg("db"),
             "Set input gain in dB (-24 to 24)")
        .def("get_input_gain_db", &Map2AudioEngine::getInputGainDb,
             "Get input gain in dB")
        .def("set_output_gain_db", &Map2AudioEngine::setOutputGainDb,
             py::arg("db"),
             "Set output gain in dB (-24 to 24)")
        .def("get_output_gain_db", &Map2AudioEngine::getOutputGainDb,
             "Get output gain in dB")

        // ========================================
        // AVB Stream Lifecycle (Phase 0 Contract)
        // ========================================

        .def("is_avb_available", &Map2AudioEngine::isAvbAvailable,
             "Check AVB runtime availability")
        .def("isAvbAvailable", &Map2AudioEngine::isAvbAvailable,
             "Check AVB runtime availability (camelCase alias)")

        .def("create_avb_stream", [](Map2AudioEngine& self, const py::dict& config) {
            Map2AudioEngine::AvbStreamRuntimeConfig runtime;

            auto getStr = [&](const char* key, const std::string& fallback = std::string()) -> std::string {
                try {
                    if (config.contains(py::str(key))) {
                        return py::str(config[py::str(key)]).cast<std::string>();
                    }
                } catch (...) {
                }
                return fallback;
            };

            auto getInt = [&](const char* key, int fallback) -> int {
                try {
                    if (config.contains(py::str(key))) {
                        return py::int_(config[py::str(key)]).cast<int>();
                    }
                } catch (...) {
                }
                return fallback;
            };

            runtime.streamId = getStr("stream_id");
            runtime.direction = getStr("direction");
            runtime.channels = getInt("channels", 2);
            runtime.sampleRate = getInt("sample_rate", 48000);
            runtime.bufferSize = getInt("buffer_size", 256);
            runtime.interfaceName = getStr("interface");
            runtime.destMac = getStr("dest_mac");
            runtime.presentationOffsetUs = getInt("presentation_offset_us", 2000);
            runtime.priority = getInt("priority", 3);

            std::string error;
            const bool ok = self.createAvbStream(runtime, &error);
            py::dict result;
            result["success"] = ok;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("config"), "Create AVB stream from dict config")

        .def("start_avb_stream", [](Map2AudioEngine& self, const std::string& streamId) {
            std::string error;
            const bool ok = self.startAvbStream(streamId, &error);
            py::dict result;
            result["success"] = ok;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("stream_id"), "Start AVB stream by ID")

        .def("stop_avb_stream", [](Map2AudioEngine& self, const std::string& streamId) {
            std::string error;
            const bool ok = self.stopAvbStream(streamId, &error);
            py::dict result;
            result["success"] = ok;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("stream_id"), "Stop AVB stream by ID")

        .def("delete_avb_stream", [](Map2AudioEngine& self, const std::string& streamId) {
            std::string error;
            const bool ok = self.deleteAvbStream(streamId, &error);
            py::dict result;
            result["success"] = ok;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("stream_id"), "Delete AVB stream by ID")

        .def("get_avb_stream_stats", [](Map2AudioEngine& self, const std::string& streamId) {
            std::string error;
            auto stats = self.getAvbStreamStats(streamId, &error);
            if (!stats) {
                throw std::runtime_error(error.empty() ? "Stream not found" : error);
            }

            py::dict result;
            result["frames_sent"] = stats->framesSent;
            result["frames_received"] = stats->framesReceived;
            result["send_errors"] = stats->sendErrors;
            result["receive_errors"] = stats->receiveErrors;
            result["underruns"] = stats->underruns;
            result["overruns"] = stats->overruns;
            result["timestamp_errors"] = stats->timestampErrors;
            result["sequence_errors"] = stats->sequenceErrors;
            result["sequence_gap_events"] = stats->sequenceGapEvents;
            result["timestamp_skew_events"] = stats->timestampSkewEvents;
            result["decode_errors"] = stats->decodeErrors;
            result["max_timestamp_skew_ns"] = stats->maxTimestampSkewNs;
            result["bytes_transferred"] = stats->bytesTransferred;
            result["max_latency_ns"] = stats->maxLatencyNs;
            result["min_latency_ns"] = stats->minLatencyNs;

            // Backward-compatible camelCase aliases.
            result["framesSent"] = stats->framesSent;
            result["framesReceived"] = stats->framesReceived;
            result["sendErrors"] = stats->sendErrors;
            result["receiveErrors"] = stats->receiveErrors;
            result["timestampErrors"] = stats->timestampErrors;
            result["sequenceErrors"] = stats->sequenceErrors;
            result["sequenceGapEvents"] = stats->sequenceGapEvents;
            result["timestampSkewEvents"] = stats->timestampSkewEvents;
            result["decodeErrors"] = stats->decodeErrors;
            result["maxTimestampSkewNs"] = stats->maxTimestampSkewNs;
            result["bytesTransferred"] = stats->bytesTransferred;
            result["maxLatencyNs"] = stats->maxLatencyNs;
            result["minLatencyNs"] = stats->minLatencyNs;
            return result;
        }, py::arg("stream_id"), "Get AVB stream statistics by ID")

        .def("reset_avb_stream_stats", [](Map2AudioEngine& self, const std::string& streamId) {
            std::string error;
            const bool ok = self.resetAvbStreamStats(streamId, &error);
            if (!ok && !error.empty()) {
                throw std::runtime_error(error);
            }
            return ok;
        }, py::arg("stream_id"), "Reset AVB stream statistics by ID")

        .def("list_avb_streams", &Map2AudioEngine::listAvbStreams,
             "List managed AVB stream IDs")
        .def("listAvbStreams", &Map2AudioEngine::listAvbStreams,
             "List managed AVB stream IDs (camelCase alias)")

        .def("get_avb_device_names", &Map2AudioEngine::getAvbDeviceNames,
             "Get available AVB device names")
        .def("getAvbDeviceNames", &Map2AudioEngine::getAvbDeviceNames,
             "Get available AVB device names (camelCase alias)")
        .def("get_avb_device_count", &Map2AudioEngine::getAvbDeviceCount,
             "Get available AVB device count")
        .def("getAvbDeviceCount", &Map2AudioEngine::getAvbDeviceCount,
             "Get available AVB device count (camelCase alias)")

        .def("set_avb_discovered_devices", [](Map2AudioEngine& self, const py::list& devices) {
            std::vector<Map2AudioEngine::AvbDiscoveredDeviceInfo> parsedDevices;
            parsedDevices.reserve(devices.size());

            auto readStr = [](const py::dict& source, const char* snake, const char* camel = nullptr) -> std::string {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::str(source[snakeKey]).cast<std::string>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::str(source[camelKey]).cast<std::string>();
                        }
                    }
                } catch (...) {
                }
                return {};
            };

            auto readInt = [](const py::dict& source, const char* snake, int fallback, const char* camel = nullptr) -> int {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::int_(source[snakeKey]).cast<int>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::int_(source[camelKey]).cast<int>();
                        }
                    }
                } catch (...) {
                }
                return fallback;
            };

            auto readBool = [](const py::dict& source, const char* snake, bool fallback, const char* camel = nullptr) -> bool {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::bool_(source[snakeKey]).cast<bool>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::bool_(source[camelKey]).cast<bool>();
                        }
                    }
                } catch (...) {
                }
                return fallback;
            };

            for (const auto& item : devices) {
                const py::dict entry = py::reinterpret_borrow<py::dict>(item);

                Map2AudioEngine::AvbDiscoveredDeviceInfo device;
                device.endpointId = readStr(entry, "endpoint_id", "endpointId");
                device.deviceName = readStr(entry, "device_name", "deviceName");
                device.direction = readStr(entry, "direction");
                device.deviceType = readStr(entry, "device_type", "deviceType");
                device.nodeAddress = readStr(entry, "node_address", "nodeAddress");
                device.host = readStr(entry, "host");
                device.audioFormat = readStr(entry, "audio_format", "audioFormat");
                device.channels = readInt(entry, "channels", 2);
                device.sampleRate = readInt(entry, "sample_rate", 48000, "sampleRate");
                device.available = readBool(entry, "available", true);
                parsedDevices.push_back(std::move(device));
            }

            std::string error;
            const bool ok = self.setAvbDiscoveredDevices(parsedDevices, &error);
            py::dict result;
            result["success"] = ok;
            result["count"] = ok ? static_cast<int>(parsedDevices.size()) : 0;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("devices"), "Set discovered AVB endpoints for device enumeration")
        .def("setAvbDiscoveredDevices", [](Map2AudioEngine& self, const py::list& devices) {
            std::vector<Map2AudioEngine::AvbDiscoveredDeviceInfo> parsedDevices;
            parsedDevices.reserve(devices.size());

            auto readStr = [](const py::dict& source, const char* snake, const char* camel = nullptr) -> std::string {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::str(source[snakeKey]).cast<std::string>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::str(source[camelKey]).cast<std::string>();
                        }
                    }
                } catch (...) {
                }
                return {};
            };

            auto readInt = [](const py::dict& source, const char* snake, int fallback, const char* camel = nullptr) -> int {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::int_(source[snakeKey]).cast<int>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::int_(source[camelKey]).cast<int>();
                        }
                    }
                } catch (...) {
                }
                return fallback;
            };

            auto readBool = [](const py::dict& source, const char* snake, bool fallback, const char* camel = nullptr) -> bool {
                try {
                    const py::str snakeKey(snake);
                    if (source.contains(snakeKey)) {
                        return py::bool_(source[snakeKey]).cast<bool>();
                    }
                    if (camel != nullptr) {
                        const py::str camelKey(camel);
                        if (source.contains(camelKey)) {
                            return py::bool_(source[camelKey]).cast<bool>();
                        }
                    }
                } catch (...) {
                }
                return fallback;
            };

            for (const auto& item : devices) {
                const py::dict entry = py::reinterpret_borrow<py::dict>(item);

                Map2AudioEngine::AvbDiscoveredDeviceInfo device;
                device.endpointId = readStr(entry, "endpoint_id", "endpointId");
                device.deviceName = readStr(entry, "device_name", "deviceName");
                device.direction = readStr(entry, "direction");
                device.deviceType = readStr(entry, "device_type", "deviceType");
                device.nodeAddress = readStr(entry, "node_address", "nodeAddress");
                device.host = readStr(entry, "host");
                device.audioFormat = readStr(entry, "audio_format", "audioFormat");
                device.channels = readInt(entry, "channels", 2);
                device.sampleRate = readInt(entry, "sample_rate", 48000, "sampleRate");
                device.available = readBool(entry, "available", true);
                parsedDevices.push_back(std::move(device));
            }

            std::string error;
            const bool ok = self.setAvbDiscoveredDevices(parsedDevices, &error);
            py::dict result;
            result["success"] = ok;
            result["count"] = ok ? static_cast<int>(parsedDevices.size()) : 0;
            if (!ok) {
                result["error"] = error;
            }
            return result;
        }, py::arg("devices"), "Set discovered AVB endpoints (camelCase alias)")

        .def("get_avb_discovered_devices", [](Map2AudioEngine& self) {
            const auto devices = self.getAvbDiscoveredDevices();
            py::list result;
            for (const auto& device : devices) {
                py::dict row;
                row["endpoint_id"] = device.endpointId;
                row["device_name"] = device.deviceName;
                row["direction"] = device.direction;
                row["device_type"] = device.deviceType;
                row["node_address"] = device.nodeAddress;
                row["host"] = device.host;
                row["audio_format"] = device.audioFormat;
                row["channels"] = device.channels;
                row["sample_rate"] = device.sampleRate;
                row["available"] = device.available;

                // Backward-compatible camelCase aliases.
                row["endpointId"] = device.endpointId;
                row["deviceName"] = device.deviceName;
                row["deviceType"] = device.deviceType;
                row["nodeAddress"] = device.nodeAddress;
                row["host"] = device.host;
                row["audioFormat"] = device.audioFormat;
                row["sampleRate"] = device.sampleRate;

                result.append(std::move(row));
            }
            return result;
        }, "Get discovered AVB endpoints used for device enumeration")
        .def("getAvbDiscoveredDevices", [](Map2AudioEngine& self) {
            const auto devices = self.getAvbDiscoveredDevices();
            py::list result;
            for (const auto& device : devices) {
                py::dict row;
                row["endpoint_id"] = device.endpointId;
                row["device_name"] = device.deviceName;
                row["direction"] = device.direction;
                row["device_type"] = device.deviceType;
                row["node_address"] = device.nodeAddress;
                row["host"] = device.host;
                row["audio_format"] = device.audioFormat;
                row["channels"] = device.channels;
                row["sample_rate"] = device.sampleRate;
                row["available"] = device.available;
                row["endpointId"] = device.endpointId;
                row["deviceName"] = device.deviceName;
                row["deviceType"] = device.deviceType;
                row["nodeAddress"] = device.nodeAddress;
                row["host"] = device.host;
                row["audioFormat"] = device.audioFormat;
                row["sampleRate"] = device.sampleRate;
                result.append(std::move(row));
            }
            return result;
        }, "Get discovered AVB endpoints (camelCase alias)")

        .def("clear_avb_discovered_devices", &Map2AudioEngine::clearAvbDiscoveredDevices,
             "Clear discovered AVB endpoints")
        .def("clearAvbDiscoveredDevices", &Map2AudioEngine::clearAvbDiscoveredDevices,
             "Clear discovered AVB endpoints (camelCase alias)")

        .def("get_avb_interface_info", [](Map2AudioEngine& self, const std::string& interfaceName) {
            auto info = self.getAvbInterfaceInfo(interfaceName);
            py::dict result;
            result["interface"] = info.interfaceName;
            result["available"] = info.available;
            result["avb_enabled"] = info.avbEnabled;
            result["interface_exists"] = info.interfaceExists;
            result["ptp_ready"] = info.ptpReady;
            if (!info.error.empty()) {
                result["error"] = info.error;
            }
            return result;
        }, py::arg("interface_name"), "Get AVB interface capability info")

        // ========================================
        // External Effects Loops (Tesira AVB)
        // ========================================

        .def("set_external_loop_definitions", [](Map2AudioEngine& self, const py::list& loops) {
            std::vector<Map2AudioEngine::ExternalLoopDefinition> payload;
            payload.reserve(loops.size());
            for (const auto& item : loops) {
                payload.push_back(dictToExternalLoopDefinition(item.cast<py::dict>()));
            }
            return self.setExternalLoopDefinitions(payload);
        }, py::arg("loops"), "Set external effects loop definitions")

        .def("set_chain_loop_insertions", [](Map2AudioEngine& self, int chainId, const py::list& insertions) {
            std::vector<Map2AudioEngine::ExternalLoopInsertion> payload;
            payload.reserve(insertions.size());
            for (const auto& item : insertions) {
                payload.push_back(dictToExternalLoopInsertion(item.cast<py::dict>()));
            }
            return self.setChainLoopInsertions(chainId, payload);
        }, py::arg("chain_id"), py::arg("insertions"), "Set external loop insertions for a chain")

        .def("set_chain_dry_wet_mix", &Map2AudioEngine::setChainDryWetMix,
             py::arg("chain_id"), py::arg("dry_wet_mix"),
             "Set per-chain dry/wet mix percentage")

        .def("set_chain_gain", &Map2AudioEngine::setChainGain,
             py::arg("chain_id"), py::arg("gain_linear"),
             "Set per-chain gain multiplier")

        .def("set_chain_mute", &Map2AudioEngine::setChainMute,
             py::arg("chain_id"), py::arg("muted"),
             "Set per-chain mute state")

        .def("set_chain_solo", &Map2AudioEngine::setChainSolo,
             py::arg("chain_id"), py::arg("solo"),
             "Set per-chain solo state")

        .def("set_loop_bypass", &Map2AudioEngine::setLoopBypass,
             py::arg("loop_id"), py::arg("bypass"),
             "Set external loop bypass state")

        .def("calibrate_loop", [](Map2AudioEngine& self, const std::string& loopId, const py::dict& options) {
            int frames = 0;
            if (options.contains("calibration_frames")) {
                frames = options["calibration_frames"].cast<int>();
            } else if (options.contains("frames")) {
                frames = options["frames"].cast<int>();
            }
            return self.calibrateLoop(loopId, frames);
        }, py::arg("loop_id"), py::arg("options") = py::dict(),
           "Calibrate external loop and update compensation metrics")

        .def("get_loop_metrics", [](const Map2AudioEngine& self, const std::string& loopId) {
            py::list result;
            for (const auto& metrics : self.getLoopMetrics(loopId)) {
                result.append(externalLoopMetricsToDict(metrics));
            }
            return result;
        }, py::arg("loop_id") = "", "Get external loop metrics (single loop or all)")

        // ========================================
        // Lexicon MPX-1 Hardware Plugin
        // ========================================

        .def("load_lexicon_plugin", &Map2AudioEngine::loadLexiconPlugin,
             "Load Lexicon MPX-1 hardware plugin, returns instance_id (-1 on failure)")

        .def("unload_lexicon_plugin", &Map2AudioEngine::unloadLexiconPlugin,
             "Unload Lexicon MPX-1 hardware plugin")

        .def("is_lexicon_loaded", &Map2AudioEngine::isLexiconLoaded,
             "Check if Lexicon MPX-1 is loaded")

        .def("get_lexicon_instance_id", &Map2AudioEngine::getLexiconInstanceId,
             "Get Lexicon MPX-1 instance ID (-1 if not loaded)")

        .def("calibrate_lexicon_latency", &Map2AudioEngine::calibrateLexiconLatency,
             "Measure S/PDIF round-trip latency via impulse response")

        .def("set_lexicon_bypass", [](Map2AudioEngine& self, bool bypass) {
            if (!self.isLexiconLoaded()) return false;
            auto* p = self.getPluginHost().getProcessor(self.getLexiconInstanceId());
            if (auto* lex = dynamic_cast<LexiconHardwareProcessor*>(p)) {
                lex->setBypass(bypass);
                return true;
            }
            return false;
        }, py::arg("bypass"), "Set Lexicon MPX-1 bypass state")

        .def("set_lexicon_mix", [](Map2AudioEngine& self, float mix) {
            if (!self.isLexiconLoaded()) return false;
            auto* p = self.getPluginHost().getProcessor(self.getLexiconInstanceId());
            if (auto* lex = dynamic_cast<LexiconHardwareProcessor*>(p)) {
                lex->setDryWetMix(mix);
                return true;
            }
            return false;
        }, py::arg("mix"), "Set Lexicon MPX-1 wet/dry mix (0.0=dry, 1.0=wet)")

        .def("set_lexicon_send_gain", [](Map2AudioEngine& self, float db) {
            if (!self.isLexiconLoaded()) return false;
            auto* p = self.getPluginHost().getProcessor(self.getLexiconInstanceId());
            if (auto* lex = dynamic_cast<LexiconHardwareProcessor*>(p)) {
                lex->setSendGainDb(db);
                return true;
            }
            return false;
        }, py::arg("gain_db"), "Set Lexicon MPX-1 send gain in dB")

        .def("set_lexicon_return_gain", [](Map2AudioEngine& self, float db) {
            if (!self.isLexiconLoaded()) return false;
            auto* p = self.getPluginHost().getProcessor(self.getLexiconInstanceId());
            if (auto* lex = dynamic_cast<LexiconHardwareProcessor*>(p)) {
                lex->setReturnGainDb(db);
                return true;
            }
            return false;
        }, py::arg("gain_db"), "Set Lexicon MPX-1 return gain in dB")

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
        .def("clear_chain", &Map2AudioEngine::clearChain,
             "Clear chain topology without unloading plugin instances")
        .def("replace_chain", &Map2AudioEngine::replaceChain,
             py::arg("order"),
             "Replace the active chain order in one topology update")
        .def("replace_chain_with_spillover", &Map2AudioEngine::replaceChainWithSpillover,
             py::arg("order"),
             "Replace the active chain order while preserving outgoing wet tails when possible")
        .def("apply_routing_topology", [](Map2AudioEngine& self, py::dict spec) {
            return self.applyRoutingTopology(dictToRoutingTopologySpec(spec));
        }, py::arg("spec"),
             "Replace chain, parallel-group, and sidechain topology in one graph mutation")
        .def("replace_snapshot_expression_mappings", [](Map2AudioEngine& self, py::list entries) {
            std::vector<std::map<std::string, juce::var>> nativeEntries;
            nativeEntries.reserve(py::len(entries));
            for (auto item : entries) {
                nativeEntries.push_back(pyDictToJuceVarMap(item.cast<py::dict>()));
            }
            return self.replaceSnapshotExpressionMappings(nativeEntries);
        }, py::arg("entries"),
             "Replace callback-time snapshot expression CC mappings")
        .def("add_to_chain", &Map2AudioEngine::addToChain,
             py::arg("instance_id"), py::arg("position") = -1,
             "Add plugin to chain at position")
        .def("remove_from_chain", &Map2AudioEngine::removeFromChain,
             py::arg("instance_id"),
             "Remove plugin from chain")
        .def("reorder_chain", &Map2AudioEngine::reorderChain,
             py::arg("order"),
             "Reorder plugin chain")
        .def("prewarm_plugin_node", &Map2AudioEngine::prewarmPluginNode,
             py::arg("instance_id"),
             "Create a detached graph node for a loaded plugin before live placement")
        .def("save_graph_document", [](const Map2AudioEngine& self, py::object seedDocument) {
            std::string seedJson;
            if (!seedDocument.is_none()) {
                if (py::isinstance<py::str>(seedDocument)) {
                    seedJson = seedDocument.cast<std::string>();
                } else {
                    seedJson = py::module_::import("json").attr("dumps")(seedDocument).cast<std::string>();
                }
            }
            const auto json = self.saveGraphDocument(seedJson);
            return py::module_::import("json").attr("loads")(json);
        }, py::arg("seed_document") = py::none(),
             "Serialize the active runtime graph into a State Authority graph document")
        .def("load_graph_document", [](Map2AudioEngine& self, py::object graphDocument, bool useIndependentCrossfade, int maxCrossfadeMs) {
            std::string json;
            if (py::isinstance<py::str>(graphDocument)) {
                json = graphDocument.cast<std::string>();
            } else {
                json = py::module_::import("json").attr("dumps")(graphDocument).cast<std::string>();
            }
            return self.loadGraphDocument(json, useIndependentCrossfade, maxCrossfadeMs);
        }, py::arg("graph_document"), py::arg("use_independent_crossfade") = false, py::arg("max_crossfade_ms") = 500,
             "Load a State Authority graph document into the active runtime chain")
        // T2454-B2: per-call adoption stats from the most-recent
        // load_graph_document. The FSM consults this immediately after
        // load_graph_document to attribute warm-vs-cold instance reuse.
        .def("get_last_graph_load_stats", [](Map2AudioEngine& self) {
            const auto stats = self.getLastGraphLoadStats();
            py::dict result;
            result["plugins_total"] = stats.pluginsTotal;
            result["plugins_adopted"] = stats.pluginsAdopted;
            result["plugins_freshly_loaded"] = stats.pluginsFreshlyLoaded;
            return result;
        }, "Return the per-call adoption stats from the most-recent "
           "load_graph_document: {plugins_total, plugins_adopted, plugins_freshly_loaded}")
        .def("clear_morph_endpoints", &Map2AudioEngine::clearMorphEndpoints,
             "Clear all configured quad morph endpoints")
        .def("set_morph_endpoint", [](Map2AudioEngine& self, const std::string& cornerId, py::object graphDocument) {
            std::string json;
            if (py::isinstance<py::str>(graphDocument)) {
                json = graphDocument.cast<std::string>();
            } else {
                json = py::module_::import("json").attr("dumps")(graphDocument).cast<std::string>();
            }
            return self.setMorphEndpoint(cornerId, json);
        }, py::arg("corner_id"), py::arg("graph_document"),
             "Configure one quad morph endpoint from a graph document")
        .def("set_morph_position_2d", &Map2AudioEngine::setMorphPosition,
             py::arg("x"), py::arg("y"),
             "Apply the configured quad morph position across the active runtime chain")
        .def("get_morph_state", [](const Map2AudioEngine& self) {
            const auto json = self.getMorphStateJson();
            return py::module_::import("json").attr("loads")(json);
        }, "Inspect configured quad morph state")
        .def("begin_topology_update", [](Map2AudioEngine& self) {
            self.getAudioGraph().beginTopologyUpdate();
        }, "Begin a batched topology update")
        .def("end_topology_update", [](Map2AudioEngine& self) {
            self.getAudioGraph().endTopologyUpdate();
        }, "Finish a batched topology update and rebuild connections once if needed")
        .def("get_topology_mutation_stats", [](const Map2AudioEngine& self) {
            const auto stats = self.getAudioGraph().getTopologyMutationStats();
            py::dict d;
            d["mutation_count"] = stats.mutationCount;
            d["no_op_skip_count"] = stats.noOpSkipCount;
            d["last_mutation_duration_ms"] = stats.lastMutationDurationMs;
            d["peak_mutation_duration_ms"] = stats.peakMutationDurationMs;
            d["avg_mutation_duration_ms"] = stats.avgMutationDurationMs;
            d["last_removed_connection_count"] = stats.lastRemovedConnectionCount;
            d["last_added_connection_count"] = stats.lastAddedConnectionCount;
            d["last_chain_size"] = stats.lastChainSize;
            d["last_parallel_group_count"] = stats.lastParallelGroupCount;
            return d;
        }, "Get JUCE graph topology-mutation timing and connection-count diagnostics")
        .def("reset_topology_mutation_stats", [](Map2AudioEngine& self) {
            self.getAudioGraph().resetTopologyMutationStats();
        }, "Reset JUCE graph topology-mutation diagnostics")
        .def("get_spillover_chain_states", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& chain : self.getSpilloverChainStates()) {
                py::dict item;
                item["id"] = chain.id;
                item["remaining_samples"] = chain.remainingSamples;
                item["expired"] = chain.expired;
                item["estimated_tail_seconds"] = chain.estimatedTailSeconds;
                py::list instanceIds;
                for (const auto instanceId : chain.instanceIds) {
                    instanceIds.append(instanceId);
                }
                item["instance_ids"] = std::move(instanceIds);
                result.append(std::move(item));
            }
            return result;
        }, "Get active spillover chain diagnostics")
        .def("get_independent_graph_crossfade_count", &Map2AudioEngine::getIndependentGraphCrossfadeCount,
             "Get the number of active independent graph crossfade transitions")

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
        // SynthForge (Phase 1 scaffold)
        // ========================================

        .def("get_synthforge_parts_config", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& config : self.getSynthForgePartsConfig()) {
                result.append(synthForgePartConfigToDict(config));
            }
            return result;
        }, "Get SynthForge configuration for all 16 parts")

        .def("set_synthforge_part_config", [](Map2AudioEngine& self, int partIndex, const py::dict& configDict) {
            auto config = dictToSynthForgePartConfig(configDict);
            config.partIndex = partIndex;
            return self.setSynthForgePartConfig(partIndex, config);
        }, py::arg("part_index"), py::arg("config"), "Set SynthForge part configuration")

        .def("set_synthforge_part_channel", &Map2AudioEngine::setSynthForgePartChannel,
             py::arg("part_index"), py::arg("midi_channel"), "Set SynthForge part MIDI channel")
        .def("get_synthforge_part_channel", &Map2AudioEngine::getSynthForgePartChannel,
             py::arg("part_index"), "Get SynthForge part MIDI channel")

        .def("get_synthforge_part_parameters", &Map2AudioEngine::getSynthForgePartParameters,
             py::arg("part_index"), "Get SynthForge parameters for a part")
        .def("set_synthforge_parameter", &Map2AudioEngine::setSynthForgeParameter,
             py::arg("part_index"), py::arg("param"), py::arg("value"),
             "Set a single SynthForge parameter")
        .def("load_synthforge_sfz", &Map2AudioEngine::loadSynthForgeSfz,
             py::arg("part_index"), py::arg("sfz_path"),
             "Load SFZ into a SynthForge part sampler")
        .def("load_synthforge_soundfont", &Map2AudioEngine::loadSynthForgeSoundFont,
             py::arg("part_index"), py::arg("soundfont_path"), py::arg("bank") = 0, py::arg("program") = 0, py::arg("preset_name") = "",
             "Load SoundFont 2/3 metadata and select a preset for a SynthForge part")
        .def("get_synthforge_part_sample_status", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeSampleLoadStatusToDict(self.getSynthForgePartSampleStatus(partIndex));
        }, py::arg("part_index"), "Get SynthForge sampler load status for a part")
        .def("reload_synthforge_part_sfz_if_changed", &Map2AudioEngine::reloadSynthForgePartSfzIfChanged,
             py::arg("part_index"), "Hot reload SFZ file if source file changed")

        .def("set_synthforge_part_sampler_backend", &Map2AudioEngine::setSynthForgePartSamplerBackend,
             py::arg("part_index"), py::arg("backend"), "Set sampler backend for a part (native|sfizz)")
        .def("get_synthforge_part_sampler_backend", &Map2AudioEngine::getSynthForgePartSamplerBackend,
             py::arg("part_index"), "Get sampler backend for a part")

        .def("set_synthforge_part_streaming_config", [](Map2AudioEngine& self, int partIndex, const py::dict& config) {
            return self.setSynthForgePartStreamingConfig(partIndex, dictToSynthForgeStreamingConfig(config));
        }, py::arg("part_index"), py::arg("config"), "Set streaming/interpolation config for a part")
        .def("get_synthforge_part_streaming_config", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeStreamingConfigToDict(self.getSynthForgePartStreamingConfig(partIndex));
        }, py::arg("part_index"), "Get streaming/interpolation config for a part")

        .def("set_synthforge_part_hot_reload", &Map2AudioEngine::setSynthForgePartHotReload,
             py::arg("part_index"), py::arg("enabled"), py::arg("interval_ms") = 1000,
             "Enable/disable SFZ hot reload checks for a part")
        .def("get_synthforge_part_hot_reload_status", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeHotReloadStatusToDict(self.getSynthForgePartHotReloadStatus(partIndex));
        }, py::arg("part_index"), "Get hot reload state for a part")

        .def("load_synthforge_part_scala_tuning", &Map2AudioEngine::loadSynthForgePartScalaTuning,
             py::arg("part_index"), py::arg("scala_path"), py::arg("root_key") = 60, py::arg("reference_hz") = 440.0f,
             "Load Scala tuning into part sampler backend")
        .def("get_synthforge_part_scala_tuning", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeScalaTuningToDict(self.getSynthForgePartScalaTuning(partIndex));
        }, py::arg("part_index"), "Get Scala tuning config for a part")

        .def("set_synthforge_part_mpe_config", [](Map2AudioEngine& self, int partIndex, const py::dict& config) {
            return self.setSynthForgePartMpeConfig(partIndex, dictToSynthForgeMpeConfig(config));
        }, py::arg("part_index"), py::arg("config"), "Set MPE/channel-expression config for a part")
        .def("get_synthforge_part_mpe_config", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeMpeConfigToDict(self.getSynthForgePartMpeConfig(partIndex));
        }, py::arg("part_index"), "Get MPE config for a part")

        .def("set_synthforge_part_mod_matrix_routes", [](Map2AudioEngine& self, int partIndex, const py::list& routes) {
            std::vector<synthforge::ModMatrixRoute> parsed;
            parsed.reserve(routes.size());
            for (const auto& item : routes) {
                parsed.push_back(dictToSynthForgeModMatrixRoute(item.cast<py::dict>()));
            }
            return self.setSynthForgePartModMatrixRoutes(partIndex, parsed);
        }, py::arg("part_index"), py::arg("routes"), "Set modulation matrix routes for a part")
        .def("get_synthforge_part_mod_matrix_routes", [](const Map2AudioEngine& self, int partIndex) {
            py::list result;
            for (const auto& route : self.getSynthForgePartModMatrixRoutes(partIndex)) {
                result.append(synthForgeModMatrixRouteToDict(route));
            }
            return result;
        }, py::arg("part_index"), "Get modulation matrix routes for a part")

        .def("set_synthforge_part_freeze", &Map2AudioEngine::setSynthForgePartFreeze,
             py::arg("part_index"), py::arg("enabled"), "Enable/disable freeze mode for a part")
        .def("get_synthforge_part_freeze_status", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeFreezeStatusToDict(self.getSynthForgePartFreezeStatus(partIndex));
        }, py::arg("part_index"), "Get freeze/render status for a part")
        .def("render_synthforge_part_to_file", &Map2AudioEngine::renderSynthForgePartToFile,
             py::arg("part_index"), py::arg("output_path"), py::arg("duration_ms") = 2000,
             "Render a part to WAV for freeze/render workflows")

        .def("get_synthforge_part_analyzer_frame", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeAnalyzerFrameToDict(self.getSynthForgePartAnalyzerFrame(partIndex));
        }, py::arg("part_index"), "Get analyzer frame for one part")
        .def("get_synthforge_analyzer_frames", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& frame : self.getSynthForgeAnalyzerFrames()) {
                result.append(synthForgeAnalyzerFrameToDict(frame));
            }
            return result;
        }, "Get analyzer frames for all parts")
        .def("get_synthforge_part_backend_status", [](const Map2AudioEngine& self, int partIndex) {
            return synthForgeBackendStatusToDict(self.getSynthForgePartBackendStatus(partIndex));
        }, py::arg("part_index"), "Get backend/opcode status for one part")
        .def("get_synthforge_backend_status", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& status : self.getSynthForgeBackendStatus()) {
                result.append(synthForgeBackendStatusToDict(status));
            }
            return result;
        }, "Get backend/opcode status for all parts")

        .def("get_synthforge_patches", [](const Map2AudioEngine& self, const std::string& category) {
            py::list result;
            for (const auto& patch : self.getSynthForgePatches(category)) {
                result.append(synthForgePatchInfoToDict(patch));
            }
            return result;
        }, py::arg("category") = "", "List SynthForge patches")

        .def("load_synthforge_patch", &Map2AudioEngine::loadSynthForgePatch,
             py::arg("part_index"), py::arg("bank"), py::arg("program"),
             "Load SynthForge patch into target part")
        .def("save_synthforge_patch", &Map2AudioEngine::saveSynthForgePatch,
             py::arg("part_index"), py::arg("bank"), py::arg("program"), py::arg("name"),
             "Save current SynthForge part state as patch")

        .def("get_synthforge_voice_metrics", [](const Map2AudioEngine& self) {
            return synthForgeVoiceMetricsToDict(self.getSynthForgeVoiceMetrics());
        }, "Get SynthForge voice usage metrics")

        .def("get_synthforge_metering", [](const Map2AudioEngine& self) {
            return synthForgeMeteringToDict(self.getSynthForgeMetering());
        }, "Get SynthForge metering payload")

        // ========================================
        // Drum Machine
        // ========================================

        .def("load_drum_kit", [](Map2AudioEngine& self, const std::string& sfzPath) {
            return self.getDrumMachine().loadKitSfz(sfzPath);
        }, py::arg("sfz_path"), "Load the same SFZ kit into all drum pads")
        .def("load_drum_pad_sfz", [](Map2AudioEngine& self, int padIndex, const std::string& sfzPath) {
            return self.getDrumMachine().loadPadSfz(padIndex, sfzPath);
        }, py::arg("pad"), py::arg("sfz_path"), "Load an SFZ into a specific drum pad")

        .def("get_drum_kit_status", [](const Map2AudioEngine& self) {
            py::dict result;
            const auto statuses = self.getDrumMachine().getKitSampleStatus();
            for (size_t index = 0; index < statuses.size(); ++index) {
                result[py::str("pad_" + std::to_string(index))] = synthForgeSampleLoadStatusToDict(statuses[index]);
            }
            return result;
        }, "Get per-pad drum kit sample load status")

        .def("set_drum_pad_volume", [](Map2AudioEngine& self, int padIndex, float volume) {
            return self.getDrumMachine().setPadVolume(padIndex, volume);
        }, py::arg("pad"), py::arg("volume"), "Set drum pad volume")
        .def("set_drum_pad_pan", [](Map2AudioEngine& self, int padIndex, float pan) {
            return self.getDrumMachine().setPadPan(padIndex, pan);
        }, py::arg("pad"), py::arg("pan"), "Set drum pad pan")
        .def("set_drum_pad_tune", [](Map2AudioEngine& self, int padIndex, float semitones) {
            return self.getDrumMachine().setPadTune(padIndex, semitones);
        }, py::arg("pad"), py::arg("semitones"), "Set drum pad tuning in semitones")
        .def("set_drum_pad_mute", [](Map2AudioEngine& self, int padIndex, bool mute) {
            return self.getDrumMachine().setPadMute(padIndex, mute);
        }, py::arg("pad"), py::arg("mute"), "Mute or unmute a drum pad")
        .def("set_drum_pad_solo", [](Map2AudioEngine& self, int padIndex, bool solo) {
            return self.getDrumMachine().setPadSolo(padIndex, solo);
        }, py::arg("pad"), py::arg("solo"), "Solo or unsolo a drum pad")
        .def("set_drum_pad_note", [](Map2AudioEngine& self, int padIndex, int midiNote) {
            return self.getDrumMachine().setPadMidiNote(padIndex, midiNote);
        }, py::arg("pad"), py::arg("midi_note"), "Set drum pad MIDI note")
        .def("add_drum_pad_note", [](Map2AudioEngine& self, int padIndex, int midiNote) {
            return self.getDrumMachine().addPadMidiNote(padIndex, midiNote);
        }, py::arg("pad"), py::arg("midi_note"), "Add an additional MIDI note mapping to a drum pad")
        .def("remove_drum_pad_note", [](Map2AudioEngine& self, int padIndex, int midiNote) {
            return self.getDrumMachine().removePadMidiNote(padIndex, midiNote);
        }, py::arg("pad"), py::arg("midi_note"), "Remove a MIDI note mapping from a drum pad")
        .def("get_drum_pad_notes", [](const Map2AudioEngine& self, int padIndex) {
            return self.getDrumMachine().getPadMidiNotes(padIndex);
        }, py::arg("pad"), "Get all MIDI note mappings for a drum pad")
        .def("set_drum_global_midi_channel", [](Map2AudioEngine& self, int midiChannel) {
            return self.getDrumMachine().setGlobalMidiChannel(midiChannel);
        }, py::arg("channel"), "Set the global MIDI channel filter for the drum machine")
        .def("get_drum_global_midi_channel", [](const Map2AudioEngine& self) {
            return self.getDrumMachine().getGlobalMidiChannel();
        }, "Get the global MIDI channel filter for the drum machine")
        .def("set_drum_pad_bus", [](Map2AudioEngine& self, int padIndex, int busIndex) {
            const auto clampedBus = std::clamp(busIndex, 0, map2::drummachine::DrumMachineProcessor::kBusCount - 1);
            return self.getDrumMachine().setPadBus(
                padIndex,
                static_cast<map2::drummachine::DrumMachineProcessor::BusId>(clampedBus));
        }, py::arg("pad"), py::arg("bus"), "Set drum pad output bus")
        .def("set_drum_pad_velocity_curve", [](Map2AudioEngine& self, int padIndex, int curveType, float fixedVelocity, float inputFloor, float outputFloor, float outputCeiling) {
            return self.getDrumMachine().setPadVelocityCurve(
                padIndex,
                static_cast<drummachine::DrumMachineProcessor::VelocityCurve>(std::clamp(curveType, 0, 4)),
                fixedVelocity,
                inputFloor,
                outputFloor,
                outputCeiling);
        }, py::arg("pad"), py::arg("curve_type"), py::arg("fixed_velocity") = 1.0f, py::arg("input_floor") = 0.0f, py::arg("output_floor") = 0.0f, py::arg("output_ceiling") = 1.0f, "Set drum pad velocity curve and scaling bounds")
        .def("get_drum_pad_velocity_curve_preview", [](const Map2AudioEngine& self, int padIndex) {
            py::list preview;
            for (const auto value : self.getDrumMachine().getVelocityCurvePreview(padIndex)) {
                preview.append(value);
            }
            return preview;
        }, py::arg("pad"), "Get a 128-point velocity curve preview for a drum pad")
        .def("get_drum_pad_last_velocity", [](const Map2AudioEngine& self, int padIndex) {
            return self.getDrumMachine().getLastMappedVelocityForPad(padIndex);
        }, py::arg("pad"), "Get the last mapped hit velocity for a drum pad")
        .def("set_drum_pad_zone", [](Map2AudioEngine& self, int padIndex, int zoneKind, int triggerNote, int keySwitchNote, float velocityScale) {
            return self.getDrumMachine().setPadZone(
                padIndex,
                static_cast<map2::drummachine::DrumMachineProcessor::PadZoneKind>(std::clamp(zoneKind, 0, 2)),
                triggerNote,
                keySwitchNote,
                velocityScale);
        }, py::arg("pad"), py::arg("zone_kind"), py::arg("trigger_note"), py::arg("key_switch_note") = -1, py::arg("velocity_scale") = 1.0f, "Assign a drum pad zone trigger note and optional articulation keyswitch")
        .def("clear_drum_pad_zone", [](Map2AudioEngine& self, int padIndex, int zoneKind) {
            return self.getDrumMachine().clearPadZone(
                padIndex,
                static_cast<map2::drummachine::DrumMachineProcessor::PadZoneKind>(std::clamp(zoneKind, 0, 2)));
        }, py::arg("pad"), py::arg("zone_kind"), "Clear a drum pad zone mapping")
        .def("get_drum_pad_zones", [](const Map2AudioEngine& self, int padIndex) {
            py::list zones;
            for (const auto& zone : self.getDrumMachine().getPadZones(padIndex)) {
                py::dict item;
                item["kind"] = static_cast<int>(zone.kind);
                item["trigger_note"] = zone.triggerNote;
                item["key_switch_note"] = zone.keySwitchNote;
                item["velocity_scale"] = zone.velocityScale;
                item["enabled"] = zone.enabled;
                zones.append(item);
            }
            return zones;
        }, py::arg("pad"), "Get configured drum pad zones")
        .def("get_drum_midi_presets", [](const Map2AudioEngine& self) {
            return self.getDrumMachine().getDrumMidiPresetNames();
        }, "List built-in drum MIDI hardware presets")
        .def("apply_drum_midi_preset", [](Map2AudioEngine& self, const std::string& presetName) {
            return self.getDrumMachine().applyDrumMidiPreset(presetName);
        }, py::arg("preset_name"), "Apply a built-in drum MIDI hardware preset")
        .def("start_drum_midi_learn", [](Map2AudioEngine& self, int padIndex, bool learnAll, int timeoutSeconds) {
            return self.getDrumMachine().startMidiLearn(padIndex, learnAll, timeoutSeconds);
        }, py::arg("pad"), py::arg("learn_all") = false, py::arg("timeout_seconds") = 10, "Start drum MIDI learn mode")
        .def("stop_drum_midi_learn", [](Map2AudioEngine& self) {
            self.getDrumMachine().stopMidiLearn();
            return true;
        }, "Stop drum MIDI learn mode")
        .def("get_drum_midi_learn_state", [](const Map2AudioEngine& self) {
            const auto state = self.getDrumMachine().getMidiLearnState();
            py::dict result;
            result["active"] = state.active;
            result["learn_all"] = state.learnAll;
            result["active_pad_index"] = state.activePadIndex;
            result["next_pad_index"] = state.nextPadIndex;
            result["last_received_note"] = state.lastReceivedNote;
            result["last_received_channel"] = state.lastReceivedChannel;
            result["timeout_seconds"] = state.timeoutSeconds;
            return result;
        }, "Get current drum MIDI learn status")
        .def("set_drum_cc_mapping", [](Map2AudioEngine& self, int slot, int ccNumber, int midiChannel, const std::string& target, int targetIndex, bool active) {
            drummachine::DrumCcMapper::Target resolvedTarget;
            if (!drummachine::DrumCcMapper::targetFromString(target, resolvedTarget)) {
                return false;
            }
            return self.getDrumMachine().setCcMapping(slot, {
                .slot = slot,
                .ccNumber = ccNumber,
                .midiChannel = midiChannel,
                .target = resolvedTarget,
                .targetIndex = targetIndex,
                .active = active,
            });
        }, py::arg("slot"), py::arg("cc_number"), py::arg("midi_channel"), py::arg("target"), py::arg("target_index"), py::arg("active") = true,
           "Set a drum CC mapping slot")
        .def("get_drum_cc_mappings", [](const Map2AudioEngine& self) {
            py::list mappings;
            for (const auto& mapping : self.getDrumMachine().getCcMappings()) {
                py::dict item;
                item["slot"] = mapping.slot;
                item["cc_number"] = mapping.ccNumber;
                item["midi_channel"] = mapping.midiChannel;
                item["target"] = drummachine::DrumCcMapper::targetToString(mapping.target);
                item["target_index"] = mapping.targetIndex;
                item["active"] = mapping.active;
                mappings.append(item);
            }
            return mappings;
        }, "Get all drum CC mappings")
        .def("start_drum_cc_learn", [](Map2AudioEngine& self, int slot, int timeoutSeconds) {
            return self.getDrumMachine().startCcLearn(slot, timeoutSeconds);
        }, py::arg("slot"), py::arg("timeout_seconds") = 10, "Start drum CC learn mode")
        .def("stop_drum_cc_learn", [](Map2AudioEngine& self) {
            self.getDrumMachine().stopCcLearn();
            return true;
        }, "Stop drum CC learn mode")
        .def("get_drum_cc_learn_state", [](const Map2AudioEngine& self) {
            const auto state = self.getDrumMachine().getCcLearnState();
            py::dict result;
            result["active"] = state.active;
            result["slot"] = state.slot;
            result["last_cc"] = state.lastCc;
            result["last_channel"] = state.lastChannel;
            result["timeout_seconds"] = state.timeoutSeconds;
            return result;
        }, "Get current drum CC learn state")
        .def("set_drum_pad_midi_channel", [](Map2AudioEngine& self, int padIndex, int midiChannel) {
            return self.getDrumMachine().setPadMidiChannel(padIndex, midiChannel);
        }, py::arg("pad"), py::arg("channel"), "Set drum pad MIDI channel")
        .def("set_drum_pad_sound_source", [](Map2AudioEngine& self, int padIndex, const std::string& source) {
            return self.getDrumMachine().setPadSoundSource(padIndex, drumSoundSourceFromString(source));
        }, py::arg("pad"), py::arg("source"), "Set drum pad sound source: sample, synth, or hybrid")
        .def("get_drum_pad_sound_source", [](const Map2AudioEngine& self, int padIndex) {
            return drumSoundSourceToString(self.getDrumMachine().getPadSoundSource(padIndex));
        }, py::arg("pad"), "Get drum pad sound source")
        .def("start_drum_pad_recording", [](Map2AudioEngine& self, int padIndex) {
            return self.getDrumMachine().startPadInputRecording(padIndex);
        }, py::arg("pad"), "Start recording hardware input into a drum pad capture buffer")
        .def("stop_drum_pad_recording", [](Map2AudioEngine& self) {
            const auto recorded = self.getDrumMachine().stopPadInputRecording();
            py::dict result;
            result["pad"] = recorded.padIndex;
            result["sample_rate"] = recorded.sampleRate;
            result["channel_count"] = recorded.channelCount;
            result["truncated"] = recorded.truncated;
            py::list samples;
            for (const auto value : recorded.samples) {
                samples.append(value);
            }
            result["samples"] = samples;
            return result;
        }, "Stop drum pad recording and return the captured mono sample buffer")
        .def("get_drum_pad_recording_active", [](const Map2AudioEngine& self) {
            return self.getDrumMachine().isPadInputRecording();
        }, "Report whether drum pad input recording is currently active")
        .def("set_drum_synth_param", [](Map2AudioEngine& self, int padIndex, const std::string& paramName, py::object value) {
            auto params = self.getDrumMachine().getPadSynthParams(padIndex);
            if (paramName == "oscillator_type") {
                params.oscillatorType = drumSynthOscillatorFromString(value.cast<std::string>());
            } else if (paramName == "pitch_envelope_start_hz") {
                params.pitchEnvelopeStartHz = value.cast<float>();
            } else if (paramName == "pitch_envelope_end_hz") {
                params.pitchEnvelopeEndHz = value.cast<float>();
            } else if (paramName == "pitch_envelope_decay_ms") {
                params.pitchEnvelopeDecayMs = value.cast<float>();
            } else if (paramName == "noise_level") {
                params.noiseLevel = value.cast<float>();
            } else if (paramName == "noise_decay_ms") {
                params.noiseDecayMs = value.cast<float>();
            } else if (paramName == "body_decay_ms") {
                params.bodyDecayMs = value.cast<float>();
            } else if (paramName == "tone_amount") {
                params.toneAmount = value.cast<float>();
            } else {
                return false;
            }
            return self.getDrumMachine().setPadSynthParams(padIndex, params);
        }, py::arg("pad"), py::arg("param_name"), py::arg("value"), "Set one drum synth parameter by name")
        .def("get_drum_synth_params", [](const Map2AudioEngine& self, int padIndex) {
            return drumSynthParamsToDict(self.getDrumMachine().getPadSynthParams(padIndex));
        }, py::arg("pad"), "Get drum synth parameters for one pad")
        .def("set_drum_pad_filter", [](Map2AudioEngine& self, int padIndex, const std::string& type, float cutoffHz, float resonance, float envAmount, float envDecayMs) {
            return self.getDrumMachine().setPadFilter(padIndex, {
                drumPadFilterTypeFromString(type),
                cutoffHz,
                resonance,
                envAmount,
                envDecayMs,
            });
        }, py::arg("pad"), py::arg("type"), py::arg("cutoff_hz"), py::arg("resonance"), py::arg("env_amount"), py::arg("env_decay_ms"), "Set per-pad filter parameters")
        .def("get_drum_pad_filter", [](const Map2AudioEngine& self, int padIndex) {
            return drumPadFilterConfigToDict(self.getDrumMachine().getPadFilter(padIndex));
        }, py::arg("pad"), "Get per-pad filter parameters")
        .def("set_drum_cv_gate_config", [](Map2AudioEngine& self, int padIndex, bool enabled, int outputPair, float gateLengthMs, int noteMin, int noteMax, float pitchMinVolts, float pitchMaxVolts) {
            return self.getDrumMachine().setPadCvGateConfig(padIndex, {
                enabled,
                outputPair,
                gateLengthMs,
                noteMin,
                noteMax,
                pitchMinVolts,
                pitchMaxVolts,
            });
        }, py::arg("pad"), py::arg("enabled"), py::arg("output_pair"), py::arg("gate_length_ms"), py::arg("note_min") = 36, py::arg("note_max") = 84, py::arg("pitch_min_volts") = 0.0f, py::arg("pitch_max_volts") = 5.0f, "Set per-pad CV/Gate output configuration")
        .def("get_drum_cv_gate_config", [](const Map2AudioEngine& self, int padIndex) {
            const auto config = self.getDrumMachine().getPadCvGateConfig(padIndex);
            py::dict result;
            result["enabled"] = config.enabled;
            result["output_pair"] = config.outputPair;
            result["gate_length_ms"] = config.gateLengthMs;
            result["note_min"] = config.noteMin;
            result["note_max"] = config.noteMax;
            result["pitch_min_volts"] = config.pitchMinVolts;
            result["pitch_max_volts"] = config.pitchMaxVolts;
            return result;
        }, py::arg("pad"), "Get per-pad CV/Gate output configuration")

        .def("set_drum_bus_eq", [](Map2AudioEngine& self, int busIndex, float lowGain, float midGain, float midFreq, float highGain) {
            return self.getDrumMachine().setBusEq(busIndex, {lowGain, midGain, midFreq, highGain});
        }, py::arg("bus"), py::arg("low_gain"), py::arg("mid_gain"), py::arg("mid_freq"), py::arg("high_gain"),
           "Set drum bus EQ")
        .def("set_drum_bus_comp", [](Map2AudioEngine& self, int busIndex, float threshold, float ratio, float attack, float release, float makeup) {
            return self.getDrumMachine().setBusComp(busIndex, {threshold, ratio, attack, release, makeup});
        }, py::arg("bus"), py::arg("threshold"), py::arg("ratio"), py::arg("attack"), py::arg("release"), py::arg("makeup"),
           "Set drum bus compressor")
        .def("set_drum_bus_level", [](Map2AudioEngine& self, int busIndex, float level) {
            return self.getDrumMachine().setBusLevel(busIndex, level);
        }, py::arg("bus"), py::arg("level"), "Set drum bus output level")
        .def("set_drum_bus_mute", [](Map2AudioEngine& self, int busIndex, bool mute) {
            return self.getDrumMachine().setBusMute(busIndex, mute);
        }, py::arg("bus"), py::arg("mute"), "Mute or unmute a drum bus")
        .def("set_drum_bus_solo", [](Map2AudioEngine& self, int busIndex, bool solo) {
            return self.getDrumMachine().setBusSolo(busIndex, solo);
        }, py::arg("bus"), py::arg("solo"), "Solo or unsolo a drum bus")
        .def("set_drum_bus_output_pair", [](Map2AudioEngine& self, int busIndex, int outputPair) {
            return self.getDrumMachine().setBusOutputPair(busIndex, outputPair);
        }, py::arg("bus"), py::arg("output_pair"), "Route a drum bus to a physical output pair")
        .def("set_drum_bus_reverb_send", [](Map2AudioEngine& self, int busIndex, float reverbSend) {
            return self.getDrumMachine().setBusReverbSend(busIndex, reverbSend);
        }, py::arg("bus"), py::arg("reverb_send"), "Set per-bus reverb send level")
        .def("get_drum_bus_mixer_state", [](const Map2AudioEngine& self, int busIndex) {
            py::dict result;
            const auto eq = self.getDrumMachine().getBusEq(busIndex);
            const auto comp = self.getDrumMachine().getBusComp(busIndex);
            const auto output = self.getDrumMachine().getBusOutput(busIndex);
            py::dict eqDict;
            eqDict["low_gain"] = eq.lowGainDb;
            eqDict["mid_gain"] = eq.midGainDb;
            eqDict["mid_freq"] = eq.midFrequencyHz;
            eqDict["high_gain"] = eq.highGainDb;
            py::dict compDict;
            compDict["threshold"] = comp.thresholdDb;
            compDict["ratio"] = comp.ratio;
            compDict["attack"] = comp.attackMs;
            compDict["release"] = comp.releaseMs;
            compDict["makeup"] = comp.makeupGainDb;
            result["bus"] = busIndex;
            result["eq"] = eqDict;
            result["comp"] = compDict;
            result["level"] = output.level;
            result["pan"] = output.pan;
            result["mute"] = output.mute;
            result["solo"] = output.solo;
            result["output_pair"] = output.outputPair;
            result["reverb_send"] = output.reverbSend;
            return result;
        }, py::arg("bus"), "Get drum bus mixer/routing state")
        .def("set_drum_master_fx", [](Map2AudioEngine& self, const std::string& parameter, float value) {
            auto config = self.getDrumMachine().getMasterFx();
            if (parameter == "drive_db") config.driveDb = value;
            else if (parameter == "compressor_threshold") config.compressorThresholdDb = value;
            else if (parameter == "compressor_ratio") config.compressorRatio = value;
            else if (parameter == "compressor_attack") config.compressorAttackMs = value;
            else if (parameter == "compressor_release") config.compressorReleaseMs = value;
            else if (parameter == "compressor_makeup") config.compressorMakeupGainDb = value;
            else if (parameter == "reverb_mix") config.reverbMix = value;
            else if (parameter == "reverb_size") config.reverbSize = value;
            else if (parameter == "reverb_damping") config.reverbDamping = value;
            else if (parameter == "reverb_width") config.reverbWidth = value;
            else if (parameter == "limiter_threshold") config.limiterThresholdDb = value;
            else if (parameter == "limiter_release") config.limiterReleaseMs = value;
            else return false;
            self.getDrumMachine().setMasterFx(config);
            return true;
        }, py::arg("parameter"), py::arg("value"), "Set a drum master FX parameter")
        .def("get_drum_master_fx", [](const Map2AudioEngine& self) {
            const auto config = self.getDrumMachine().getMasterFx();
            py::dict result;
            result["drive_db"] = config.driveDb;
            result["compressor_threshold"] = config.compressorThresholdDb;
            result["compressor_ratio"] = config.compressorRatio;
            result["compressor_attack"] = config.compressorAttackMs;
            result["compressor_release"] = config.compressorReleaseMs;
            result["compressor_makeup"] = config.compressorMakeupGainDb;
            result["reverb_mix"] = config.reverbMix;
            result["reverb_size"] = config.reverbSize;
            result["reverb_damping"] = config.reverbDamping;
            result["reverb_width"] = config.reverbWidth;
            result["limiter_threshold"] = config.limiterThresholdDb;
            result["limiter_release"] = config.limiterReleaseMs;
            return result;
        }, "Get drum master FX state")
        .def("set_drum_master_volume", [](Map2AudioEngine& self, float volume) {
            self.getDrumMachine().setMasterVolume(volume);
            return true;
        }, py::arg("volume"), "Set drum machine master volume")
        .def("get_drum_master_volume", [](const Map2AudioEngine& self) {
            return self.getDrumMachine().getMasterVolume();
        }, "Get drum machine master volume")
        .def("get_drum_metering", [](const Map2AudioEngine& self) {
            const auto metering = self.getDrumMachine().getMetering();
            py::dict result;
            result["per_pad_peak"] = py::cast(metering.perPadPeak);
            result["per_pad_rms"] = py::cast(metering.perPadRms);
            result["per_bus_peak"] = py::cast(metering.perBusPeak);
            result["per_bus_rms"] = py::cast(metering.perBusRms);
            result["master_peak_left"] = metering.masterPeakLeft;
            result["master_peak_right"] = metering.masterPeakRight;
            result["master_rms_left"] = metering.masterRmsLeft;
            result["master_rms_right"] = metering.masterRmsRight;
            return result;
        }, "Get drum machine per-pad, per-bus, and master metering")
        .def("drum_trigger_note", [](Map2AudioEngine& self, int padIndex, float velocity) {
            const auto config = self.getDrumMachine().getPadConfig(padIndex);
            return self.injectMidiNoteOn(1, config.midiNote, std::clamp(static_cast<int>(std::round(velocity * 127.0f)), 1, 127));
        }, py::arg("pad"), py::arg("velocity"), "Trigger a software drum hit via the MIDI injection path")
        .def("set_drum_step", [](Map2AudioEngine& self,
                                 int patternIndex,
                                 int instrumentIndex,
                                 int stepIndex,
                                 int velocity,
                                 bool accent,
                                 int microTiming,
                                 float probability,
                                 int ratchetCount,
                                 int ratchetDecay,
                                 std::optional<float> lockPitch,
                                 std::optional<float> lockFilterCutoff,
                                 std::optional<float> lockDecay,
                                 std::optional<float> lockPan,
                                 std::optional<float> lockVolume) {
            return self.getDrumSequencer().setStep(
                patternIndex,
                instrumentIndex,
                stepIndex,
                static_cast<uint8_t>(std::clamp(velocity, 0, 127)),
                accent,
                static_cast<int8_t>(std::clamp(microTiming, -48, 48)),
                std::clamp(probability, 0.0f, 1.0f),
                static_cast<uint8_t>(std::clamp(ratchetCount, 1, 8)),
                static_cast<uint8_t>(std::clamp(ratchetDecay, 0, 100)),
                lockPitch,
                lockFilterCutoff,
                lockDecay,
                lockPan,
                lockVolume);
        }, py::arg("pattern"), py::arg("instrument"), py::arg("step"), py::arg("velocity"), py::arg("accent") = false,
           py::arg("micro_timing") = 0,
           py::arg("probability") = 1.0f,
           py::arg("ratchet_count") = 1,
           py::arg("ratchet_decay") = 0,
           py::arg("lock_pitch") = py::none(),
           py::arg("lock_filter_cutoff") = py::none(),
           py::arg("lock_decay") = py::none(),
           py::arg("lock_pan") = py::none(),
           py::arg("lock_volume") = py::none(),
           "Set a sequencer step velocity, accent state, and optional parameter locks")
        .def("get_drum_step", [](const Map2AudioEngine& self, int patternIndex, int instrumentIndex, int stepIndex) {
            const auto step = self.getDrumSequencer().getStep(patternIndex, instrumentIndex, stepIndex);
            py::dict result;
            result["velocity"] = step.velocity;
            result["accent"] = step.accent;
            result["micro_timing"] = step.microTimingTicks;
            result["probability"] = step.probability;
            result["ratchet_count"] = step.ratchetCount;
            result["ratchet_decay"] = step.ratchetDecay;
            return result;
        }, py::arg("pattern"), py::arg("instrument"), py::arg("step"), "Get a sequencer step payload")
        .def("get_drum_step_extended", [](const Map2AudioEngine& self, int patternIndex, int instrumentIndex, int stepIndex) {
            const auto step = self.getDrumSequencer().getStep(patternIndex, instrumentIndex, stepIndex);
            py::dict result;
            result["velocity"] = step.velocity;
            result["accent"] = step.accent;
            result["micro_timing"] = step.microTimingTicks;
            result["probability"] = step.probability;
            result["ratchet_count"] = step.ratchetCount;
            result["ratchet_decay"] = step.ratchetDecay;
            result["lock_pitch"] = step.lockPitch ? py::cast(*step.lockPitch) : py::none();
            result["lock_filter_cutoff"] = step.lockFilterCutoff ? py::cast(*step.lockFilterCutoff) : py::none();
            result["lock_decay"] = step.lockDecay ? py::cast(*step.lockDecay) : py::none();
            result["lock_pan"] = step.lockPan ? py::cast(*step.lockPan) : py::none();
            result["lock_volume"] = step.lockVolume ? py::cast(*step.lockVolume) : py::none();
            return result;
        }, py::arg("pattern"), py::arg("instrument"), py::arg("step"), "Get a sequencer step payload with parameter locks")
        .def("clear_drum_pattern", [](Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().clearPattern(patternIndex);
        }, py::arg("pattern"), "Clear all steps in a drum pattern")
        .def("copy_drum_pattern", [](Map2AudioEngine& self, int sourcePatternIndex, int destinationPatternIndex) {
            return self.getDrumSequencer().copyPattern(sourcePatternIndex, destinationPatternIndex);
        }, py::arg("source"), py::arg("destination"), "Copy one drum pattern into another")
        .def("get_drum_pattern_data", [](const Map2AudioEngine& self, int patternIndex) {
            const auto pattern = self.getDrumSequencer().getPattern(patternIndex);
            const int activeVariation = self.getDrumSequencer().getVariation(patternIndex);
            const auto& stepGrid = pattern.variations[static_cast<size_t>(std::clamp(activeVariation, 0, drummachine::DrumSequencer::kVariationCount - 1))];
            py::dict result;
            result["length"] = pattern.length;
            result["variation"] = activeVariation;
            py::list trackLengths;
            for (const auto trackLength : pattern.trackLengths) {
                trackLengths.append(trackLength);
            }
            result["track_lengths"] = trackLengths;

            py::list instruments;
            for (const auto& instrumentSteps : stepGrid) {
                py::list steps;
                for (const auto& step : instrumentSteps) {
                    py::dict payload;
                    payload["velocity"] = step.velocity;
                    payload["accent"] = step.accent;
                    payload["micro_timing"] = step.microTimingTicks;
                    payload["probability"] = step.probability;
                    payload["ratchet_count"] = step.ratchetCount;
                    payload["ratchet_decay"] = step.ratchetDecay;
                    payload["lock_pitch"] = step.lockPitch ? py::cast(*step.lockPitch) : py::none();
                    payload["lock_filter_cutoff"] = step.lockFilterCutoff ? py::cast(*step.lockFilterCutoff) : py::none();
                    payload["lock_decay"] = step.lockDecay ? py::cast(*step.lockDecay) : py::none();
                    payload["lock_pan"] = step.lockPan ? py::cast(*step.lockPan) : py::none();
                    payload["lock_volume"] = step.lockVolume ? py::cast(*step.lockVolume) : py::none();
                    steps.append(payload);
                }
                instruments.append(steps);
            }
            result["steps"] = instruments;
            return result;
        }, py::arg("pattern"), "Get full drum pattern grid data")
        .def("set_drum_pattern_length", [](Map2AudioEngine& self, int patternIndex, int steps) {
            return self.getDrumSequencer().setPatternLength(patternIndex, steps);
        }, py::arg("pattern"), py::arg("steps"), "Set drum pattern length")
        .def("get_drum_pattern_length", [](const Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().getPatternLength(patternIndex);
        }, py::arg("pattern"), "Get drum pattern length")
        .def("set_drum_track_length", [](Map2AudioEngine& self, int patternIndex, int instrumentIndex, int steps) {
            return self.getDrumSequencer().setTrackLength(patternIndex, instrumentIndex, steps);
        }, py::arg("pattern"), py::arg("instrument"), py::arg("steps"), "Set per-track drum loop length")
        .def("get_drum_track_length", [](const Map2AudioEngine& self, int patternIndex, int instrumentIndex) {
            return self.getDrumSequencer().getTrackLength(patternIndex, instrumentIndex);
        }, py::arg("pattern"), py::arg("instrument"), "Get per-track drum loop length")
        .def("set_drum_swing", [](Map2AudioEngine& self, float percent) {
            self.getDrumSequencer().setSwing(percent);
            return true;
        }, py::arg("percent"), "Set drum sequencer swing percentage")
        .def("get_drum_swing", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getSwing();
        }, "Get drum sequencer swing percentage")
        .def("set_drum_accent_velocity", [](Map2AudioEngine& self, int velocity) {
            self.getDrumSequencer().setAccentVelocity(static_cast<uint8_t>(std::clamp(velocity, 1, 127)));
            return true;
        }, py::arg("velocity"), "Set global drum sequencer accent velocity")
        .def("get_drum_accent_velocity", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getAccentVelocity();
        }, "Get global drum sequencer accent velocity")
        .def("add_drum_song_entry", [](Map2AudioEngine& self, int patternIndex, int repeatCount, int position) {
            return self.getDrumSequencer().addSongEntry(patternIndex, repeatCount, position);
        }, py::arg("pattern"), py::arg("repeat_count"), py::arg("position") = -1,
           "Insert a drum song entry")
        .def("remove_drum_song_entry", [](Map2AudioEngine& self, int position) {
            return self.getDrumSequencer().removeSongEntry(position);
        }, py::arg("position"), "Remove a drum song entry")
        .def("reorder_drum_song_entries", [](Map2AudioEngine& self, const std::vector<int>& order) {
            return self.getDrumSequencer().reorderSongEntries(order);
        }, py::arg("order"), "Reorder drum song entries by index")
        .def("get_drum_song", [](const Map2AudioEngine& self) {
            py::list result;
            for (const auto& entry : self.getDrumSequencer().getSong()) {
                py::dict payload;
                payload["pattern"] = entry.patternIndex;
                payload["repeat_count"] = entry.repeatCount;
                result.append(payload);
            }
            return result;
        }, "Get the drum song arrangement")
        .def("clear_drum_song", [](Map2AudioEngine& self) {
            self.getDrumSequencer().clearSong();
            return true;
        }, "Clear the drum song arrangement")
        .def("set_drum_song_loop", [](Map2AudioEngine& self, bool enabled) {
            self.getDrumSequencer().setSongLoop(enabled);
            return true;
        }, py::arg("enabled"), "Enable or disable drum song looping")
        .def("get_drum_song_loop", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getSongLoop();
        }, "Get the drum song loop state")
        .def("set_drum_variation", [](Map2AudioEngine& self, int patternIndex, int variationIndex) {
            return self.getDrumSequencer().setVariation(patternIndex, variationIndex);
        }, py::arg("pattern"), py::arg("variation"), "Select the active variation for a drum pattern")
        .def("get_drum_variation", [](const Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().getVariation(patternIndex);
        }, py::arg("pattern"), "Get the active variation for a drum pattern")
        .def("set_drum_fill_variation", [](Map2AudioEngine& self, int patternIndex, int variationIndex) {
            return self.getDrumSequencer().setFillVariation(patternIndex, variationIndex);
        }, py::arg("pattern"), py::arg("variation"), "Set the fill variation for a drum pattern")
        .def("get_drum_fill_variation", [](const Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().getFillVariation(patternIndex);
        }, py::arg("pattern"), "Get the fill variation for a drum pattern")
        .def("set_drum_fill_length_beats", [](Map2AudioEngine& self, int patternIndex, int beats) {
            return self.getDrumSequencer().setFillLengthBeats(patternIndex, beats);
        }, py::arg("pattern"), py::arg("beats"), "Set the fill length in beats for a drum pattern")
        .def("get_drum_fill_length_beats", [](const Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().getFillLengthBeats(patternIndex);
        }, py::arg("pattern"), "Get the fill length in beats for a drum pattern")
        .def("trigger_drum_fill", [](Map2AudioEngine& self) {
            self.getDrumSequencer().triggerFill();
            return true;
        }, "Trigger a drum fill on the current bar")
        .def("set_drum_auto_fill_bars", [](Map2AudioEngine& self, int bars) {
            self.getDrumSequencer().setAutoFillBars(bars);
            return true;
        }, py::arg("bars"), "Set the auto-fill cadence in bars")
        .def("get_drum_auto_fill_bars", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getAutoFillBars();
        }, "Get the auto-fill cadence in bars")
        .def("set_drum_count_in_bars", [](Map2AudioEngine& self, int bars) {
            self.getDrumSequencer().setCountInBars(bars);
            return true;
        }, py::arg("bars"), "Set the number of count-in bars before playback starts")
        .def("get_drum_count_in_bars", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getCountInBars();
        }, "Get the number of count-in bars before playback starts")
        .def("set_drum_bpm", [](Map2AudioEngine& self, double bpm) {
            return self.getDrumSequencer().setTempo(bpm);
        }, py::arg("bpm"), "Set drum sequencer tempo in BPM")
        .def("set_drum_current_pattern", [](Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().setCurrentPattern(patternIndex);
        }, py::arg("pattern"), "Set the active drum sequencer pattern")
        .def("queue_drum_pattern_switch", [](Map2AudioEngine& self, int patternIndex) {
            return self.getDrumSequencer().queuePatternSwitch(patternIndex);
        }, py::arg("pattern"), "Queue a quantized drum pattern switch")
        .def("get_drum_pending_pattern_switch", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getPendingPatternSwitch();
        }, "Get the queued drum pattern switch target")
        .def("set_drum_pattern_switch_quantization", [](Map2AudioEngine& self, int beats) {
            return self.getDrumSequencer().setPatternSwitchQuantization(beats);
        }, py::arg("beats"), "Set drum pattern switch quantization in beats")
        .def("get_drum_pattern_switch_quantization", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getPatternSwitchQuantization();
        }, "Get drum pattern switch quantization in beats")
        .def("set_drum_track_swing", [](Map2AudioEngine& self, int instrumentIndex, float percent) {
            return self.getDrumSequencer().setTrackSwing(instrumentIndex, percent);
        }, py::arg("instrument"), py::arg("percent"), "Set per-track drum swing percentage")
        .def("get_drum_track_swing", [](const Map2AudioEngine& self, int instrumentIndex) {
            return self.getDrumSequencer().getTrackSwing(instrumentIndex);
        }, py::arg("instrument"), "Get per-track drum swing percentage")
        .def("set_drum_midi_output_enabled", [](Map2AudioEngine& self, bool enabled) {
            self.getDrumSequencer().setMidiOutputEnabled(enabled);
            return true;
        }, py::arg("enabled"), "Enable or disable drum sequencer MIDI note output")
        .def("get_drum_midi_output_enabled", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().isMidiOutputEnabled();
        }, "Get drum sequencer MIDI note output state")
        .def("set_drum_midi_clock_output_enabled", [](Map2AudioEngine& self, bool enabled) {
            self.getDrumSequencer().setMidiClockOutputEnabled(enabled);
            return true;
        }, py::arg("enabled"), "Enable or disable drum sequencer MIDI clock output")
        .def("get_drum_midi_clock_output_enabled", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().isMidiClockOutputEnabled();
        }, "Get drum sequencer MIDI clock output state")
        .def("set_drum_midi_output_channel", [](Map2AudioEngine& self, int channel) {
            return self.getDrumSequencer().setMidiOutputChannel(channel);
        }, py::arg("channel"), "Set drum sequencer MIDI output channel (0-15)")
        .def("get_drum_midi_output_channel", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().getMidiOutputChannel();
        }, "Get drum sequencer MIDI output channel (0-15)")
        .def("set_drum_program_change_enabled", [](Map2AudioEngine& self, bool enabled) {
            self.getDrumSequencer().setProgramChangeEnabled(enabled);
            return true;
        }, py::arg("enabled"), "Enable or disable incoming Program Change pattern switching")
        .def("get_drum_program_change_enabled", [](const Map2AudioEngine& self) {
            return self.getDrumSequencer().isProgramChangeEnabled();
        }, "Get incoming Program Change pattern switching state")
        .def("set_drum_transport_playing", [](Map2AudioEngine& self, bool isPlaying) {
            if (isPlaying) {
                self.getDrumSequencer().play();
            } else {
                self.getDrumSequencer().stop();
            }
            return true;
        }, py::arg("is_playing"), "Start or stop the drum sequencer transport")
        .def("pause_drum_transport", [](Map2AudioEngine& self) {
            self.getDrumSequencer().pause();
            return true;
        }, "Pause the drum sequencer transport")
        .def("get_drum_sequencer_position", [](const Map2AudioEngine& self) {
            const auto position = self.getDrumSequencer().getPosition();
            py::dict result;
            result["step"] = position.stepIndex;
            result["bar"] = position.barCount;
            result["beat"] = (position.stepIndex / 4) + 1;
            result["pattern"] = position.patternIndex;
            result["pattern_id"] = position.patternIndex;
            result["is_playing"] = position.isPlaying;
            result["pending_pattern"] = position.pendingPatternIndex;
            result["switch_quantization_beats"] = position.switchQuantizationBeats;
            return result;
        }, "Get the current drum sequencer playback position")

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

        .def("midi_inject_note_on", &Map2AudioEngine::injectMidiNoteOn,
             py::arg("channel"), py::arg("note"), py::arg("velocity"),
             "Inject a Note On event into the internal MIDI input path")

        .def("midi_inject_note_off", &Map2AudioEngine::injectMidiNoteOff,
             py::arg("channel"), py::arg("note"), py::arg("velocity") = 0,
             "Inject a Note Off event into the internal MIDI input path")

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
        // Audio I/O Diagnostics (NEW - xrun/jitter/health)
        // ========================================

        .def("get_audio_io_stats", [](const Map2AudioEngine& self) {
            auto stats = self.getAudioIOStats();
            const auto topologyStats = self.getAudioGraph().getTopologyMutationStats();
            py::dict d;
            d["cpu_usage"] = stats.cpuUsage;
            d["xrun_count"] = stats.xrunCount;
            d["xruns_since_reset"] = stats.xrunsSinceReset;
            d["latency_ms"] = stats.latencyMs;
            d["samples_processed"] = stats.samplesProcessed;
            // Callback timing analysis
            d["callback_jitter_ms"] = stats.callbackJitterMs;
            d["peak_callback_jitter_ms"] = stats.peakCallbackJitterMs;
            d["avg_callback_duration_ms"] = stats.avgCallbackDurationMs;
            d["peak_callback_duration_ms"] = stats.peakCallbackDurationMs;
            d["callback_budget_ms"] = stats.callbackBudgetMs;
            d["budget_utilization"] = stats.budgetUtilization;
            // Connection health
            d["device_connected"] = stats.deviceConnected;
            d["recovery_count"] = stats.recoveryCount;
            d["uptime_seconds"] = stats.uptimeSeconds;
            d["last_xrun_timestamp"] = stats.lastXrunTimestamp;
            // Latency measurement
            d["measured_round_trip_ms"] = stats.measuredRoundTripMs;
            d["measured_input_latency_ms"] = stats.measuredInputLatencyMs;
            d["measured_output_latency_ms"] = stats.measuredOutputLatencyMs;
            d["topology_mutation_count"] = topologyStats.mutationCount;
            d["topology_no_op_skip_count"] = topologyStats.noOpSkipCount;
            d["topology_last_mutation_duration_ms"] = topologyStats.lastMutationDurationMs;
            d["topology_peak_mutation_duration_ms"] = topologyStats.peakMutationDurationMs;
            d["topology_avg_mutation_duration_ms"] = topologyStats.avgMutationDurationMs;
            d["topology_last_removed_connection_count"] = topologyStats.lastRemovedConnectionCount;
            d["topology_last_added_connection_count"] = topologyStats.lastAddedConnectionCount;
            d["topology_last_chain_size"] = topologyStats.lastChainSize;
            d["topology_last_parallel_group_count"] = topologyStats.lastParallelGroupCount;
            return d;
        }, "Get comprehensive audio I/O statistics with xrun/jitter analysis")

        .def("get_connection_health", [](const Map2AudioEngine& self) {
            auto health = self.getConnectionHealth();
            py::dict d;
            d["device_connected"] = health.deviceConnected;
            d["jack_server_running"] = health.jackServerRunning;
            d["current_backend"] = health.currentBackend;
            d["recovery_attempts"] = health.recoveryAttempts;
            d["successful_recoveries"] = health.successfulRecoveries;
            d["last_recovery_time_sec"] = health.lastRecoveryTimeSec;
            d["last_error"] = health.lastError;
            return d;
        }, "Get audio device connection health")

        .def("drain_platform_events", [](Map2AudioEngine& self, int maxEvents) {
            auto events = self.drainPlatformEvents(maxEvents);
            py::list result;
            for (const auto& event : events) {
                py::dict d;
                d["kind"] = event.kind;
                d["severity"] = event.severity;
                d["title"] = event.title;
                d["message"] = event.message;
                d["sequence"] = event.sequence;
                d["timestamp_ms"] = event.timestampMs;
                d["dropped_count"] = event.droppedCount;
                result.append(d);
            }
            return result;
        }, py::arg("max_events") = 128,
           "Drain engine-originated PlatformEvent records from the native FIFO")

        .def("get_dropped_platform_event_count", &Map2AudioEngine::getDroppedPlatformEventCount,
             "Return the number of engine PlatformEvent records dropped due to FIFO pressure")

        .def("get_xrun_history", [](const Map2AudioEngine& self) {
            auto history = self.getXrunHistory();
            py::list result;
            for (auto ts : history) {
                result.append(ts);
            }
            return result;
        }, "Get timestamps of recent xruns (last 64)")

        .def("reset_xrun_counter", &Map2AudioEngine::resetXrunCounter,
             "Reset the xrun counter without resetting other stats")

        .def("reset_audio_io_stats", &Map2AudioEngine::resetAudioIOStats,
             "Reset full audio I/O runtime stats (xrun/jitter/duration counters)")

        .def("set_measured_round_trip_latency", &Map2AudioEngine::setMeasuredRoundTripLatency,
             py::arg("ms"),
             "Report measured round-trip latency from external loopback test")

        .def("get_device_reported_latency_ms", &Map2AudioEngine::getDeviceReportedLatencyMs,
             "Get device-reported total I/O latency in milliseconds")

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

        .def("load_cabinet_ir_instance", [](Map2AudioEngine& self, InstanceId instanceId, const std::string& path) {
            auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId));
            return processor != nullptr ? processor->loadImpulseResponse(path) : false;
        }, py::arg("instance_id"), py::arg("path"), "Load cabinet IR into a specific native processor instance")

        .def("load_reverb_ir_instance", [](Map2AudioEngine& self, InstanceId instanceId, const std::string& path) {
            auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId));
            return processor != nullptr ? processor->loadImpulseResponse(path) : false;
        }, py::arg("instance_id"), py::arg("path"), "Load reverb IR into a specific native processor instance")

        .def("unload_ir_instance", [](Map2AudioEngine& self, InstanceId instanceId) {
            if (auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->unloadImpulseResponse();
                return true;
            }
            return false;
        }, py::arg("instance_id"), "Unload IR from a specific native processor instance")

        .def("set_ir_mix_instance", [](Map2AudioEngine& self, InstanceId instanceId, float mixPercent) {
            if (auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setMixPercent(mixPercent);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("mix_percent"), "Set IR mix on a specific native processor instance")

        .def("set_ir_bypass_instance", [](Map2AudioEngine& self, InstanceId instanceId, bool bypass) {
            if (auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setBypassEnabled(bypass);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("bypass"), "Set IR bypass on a specific native processor instance")

        .def("get_ir_info_instance", [](Map2AudioEngine& self, InstanceId instanceId) {
            py::dict d;
            if (auto* processor = dynamic_cast<NativeConvolutionPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                auto info = processor->getIRInfo();
                d = irInfoToDict(info);
                d["mix"] = processor->getMixPercent();
                d["bypass"] = processor->isBypassedLocally();
                d["loaded"] = !info.path.empty();
                return d;
            }
            d["path"] = "";
            d["name"] = "";
            d["length_samples"] = 0;
            d["length_ms"] = 0.0;
            d["sample_rate"] = 0.0;
            d["channels"] = 0;
            d["loaded"] = false;
            d["mix"] = 0.0;
            d["bypass"] = false;
            return d;
        }, py::arg("instance_id"), "Get IR information for a specific native processor instance")

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

        .def("trigger_parallel_ab_switch", &Map2AudioEngine::triggerParallelABSwitch,
             py::arg("group_id"), py::arg("branch_index"),
             "Hard-switch an A/B parallel group to branch 0 or 1 at the next zero crossing")

        .def("get_parallel_ab_blend", [](const Map2AudioEngine& self, int groupId) {
            return const_cast<Map2AudioEngine&>(self).getAudioGraph().getParallelABBlend(groupId);
        }, py::arg("group_id"), "Get A/B blend for parallel group")

        .def("set_parallel_branch_level", [](Map2AudioEngine& self, int groupId, int branchIndex, float level) {
            self.getAudioGraph().setParallelBranchLevel(groupId, branchIndex, level);
        }, py::arg("group_id"), py::arg("branch_index"), py::arg("level"),
           "Set individual branch level (0.0 - 2.0)")

        .def("set_parallel_branch_chain_id", [](Map2AudioEngine& self, int groupId, int branchIndex, int chainId) {
            return self.getAudioGraph().setParallelBranchChainId(groupId, branchIndex, chainId);
        }, py::arg("group_id"), py::arg("branch_index"), py::arg("chain_id"),
           "Associate a runtime chain ID with one branch of a parallel group")

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

                py::list branchChainIds;
                for (int chainId : group.branchChainIds) {
                    branchChainIds.append(chainId);
                }
                d["branch_chain_ids"] = branchChainIds;

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

        .def("load_nam_model_instance", [](Map2AudioEngine& self, InstanceId instanceId, const std::string& path) {
            auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId));
            return processor != nullptr ? processor->loadModel(path) : false;
        }, py::arg("instance_id"), py::arg("path"), "Load a NAM model into a specific native processor instance")

        .def("unload_nam_model_instance", [](Map2AudioEngine& self, InstanceId instanceId) {
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->unloadModel();
                return true;
            }
            return false;
        }, py::arg("instance_id"), "Unload a NAM model from a specific native processor instance")

        .def("get_nam_model_info_instance", [](Map2AudioEngine& self, InstanceId instanceId) {
            py::dict d;
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                auto info = processor->getModelInfo();
                d["path"] = info.path;
                d["name"] = info.name;
                d["expected_sample_rate"] = info.expectedSampleRate;
                d["input_channels"] = info.inputChannels;
                d["output_channels"] = info.outputChannels;
                d["has_input_level"] = info.hasInputLevel;
                d["has_output_level"] = info.hasOutputLevel;
                d["input_level"] = processor->getInputLevel();
                d["output_level"] = processor->getOutputLevel();
                d["loaded"] = info.loaded;
                d["input_gain"] = processor->getInputGainDb();
                d["output_gain"] = processor->getOutputGainDb();
                d["normalize"] = processor->isNormalized();
                d["bypass"] = processor->isBypassedLocally();
                return d;
            }
            d["path"] = "";
            d["name"] = "";
            d["expected_sample_rate"] = 48000.0;
            d["input_channels"] = 1;
            d["output_channels"] = 1;
            d["has_input_level"] = false;
            d["has_output_level"] = false;
            d["input_level"] = -100.0f;
            d["output_level"] = -100.0f;
            d["loaded"] = false;
            d["input_gain"] = 0.0f;
            d["output_gain"] = 0.0f;
            d["normalize"] = true;
            d["bypass"] = false;
            return d;
        }, py::arg("instance_id"), "Get NAM model information for a specific native processor instance")

        .def("set_nam_input_gain_instance", [](Map2AudioEngine& self, InstanceId instanceId, float db) {
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setInputGainDb(db);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("db"), "Set NAM input gain on a specific native processor instance")

        .def("set_nam_output_gain_instance", [](Map2AudioEngine& self, InstanceId instanceId, float db) {
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setOutputGainDb(db);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("db"), "Set NAM output gain on a specific native processor instance")

        .def("set_nam_bypass_instance", [](Map2AudioEngine& self, InstanceId instanceId, bool bypass) {
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setBypassEnabled(bypass);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("bypass"), "Set NAM bypass on a specific native processor instance")

        .def("set_nam_normalize_instance", [](Map2AudioEngine& self, InstanceId instanceId, bool normalize) {
            if (auto* processor = dynamic_cast<NativeNAMPluginProcessor*>(self.getPluginHost().getProcessor(instanceId))) {
                processor->setNormalizeEnabled(normalize);
                return true;
            }
            return false;
        }, py::arg("instance_id"), py::arg("normalize"), "Set NAM normalization on a specific native processor instance")

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
        // Chorus Processor (NEW)
        // ========================================

        .def("set_chorus_rate", &Map2AudioEngine::setChorusRate,
             py::arg("hz"),
             "Set chorus LFO rate in Hz (0.1 to 10)")

        .def("get_chorus_rate", &Map2AudioEngine::getChorusRate,
             "Get chorus LFO rate in Hz")

        .def("set_chorus_depth", &Map2AudioEngine::setChorusDepth,
             py::arg("depth"),
             "Set chorus depth (0 to 1)")

        .def("get_chorus_depth", &Map2AudioEngine::getChorusDepth,
             "Get chorus depth")

        .def("set_chorus_centre_delay", &Map2AudioEngine::setChorusCentreDelay,
             py::arg("ms"),
             "Set chorus centre delay in ms (1 to 30)")

        .def("get_chorus_centre_delay", &Map2AudioEngine::getChorusCentreDelay,
             "Get chorus centre delay in ms")

        .def("set_chorus_feedback", &Map2AudioEngine::setChorusFeedback,
             py::arg("feedback"),
             "Set chorus feedback (-1 to 1)")

        .def("get_chorus_feedback", &Map2AudioEngine::getChorusFeedback,
             "Get chorus feedback")

        .def("set_chorus_mix", &Map2AudioEngine::setChorusMix,
             py::arg("mix"),
             "Set chorus wet/dry mix (0 to 1)")

        .def("get_chorus_mix", &Map2AudioEngine::getChorusMix,
             "Get chorus mix")

        .def("set_chorus_spread", &Map2AudioEngine::setChorusSpread,
             py::arg("spread"),
             "Set chorus stereo spread (0 to 1)")

        .def("get_chorus_spread", &Map2AudioEngine::getChorusSpread,
             "Get chorus stereo spread")

        .def("set_chorus_bypass", &Map2AudioEngine::setChorusBypass,
             py::arg("bypass"),
             "Bypass chorus processor")

        .def("is_chorus_bypassed", &Map2AudioEngine::isChorusBypassed,
             "Check if chorus is bypassed")

        .def("get_chorus_parameters", [](const Map2AudioEngine& self) {
            return chorusParamsToDict(self.getChorusParameters());
        }, "Get all chorus parameters")

        .def("set_chorus_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setChorusParameters(dictToChorusParams(params));
        }, py::arg("params"), "Set all chorus parameters at once")

        .def("get_chorus_metering", [](const Map2AudioEngine& self) {
            return chorusMeteringToDict(self.getChorusMetering());
        }, "Get chorus metering (input, output, LFO phase)")

        // ========================================
        // Phaser Processor (NEW)
        // ========================================

        .def("set_phaser_rate", &Map2AudioEngine::setPhaserRate,
             py::arg("hz"),
             "Set phaser LFO rate in Hz (0.05 to 5)")

        .def("get_phaser_rate", &Map2AudioEngine::getPhaserRate,
             "Get phaser LFO rate in Hz")

        .def("set_phaser_depth", &Map2AudioEngine::setPhaserDepth,
             py::arg("depth"),
             "Set phaser depth (0 to 1)")

        .def("get_phaser_depth", &Map2AudioEngine::getPhaserDepth,
             "Get phaser depth")

        .def("set_phaser_centre_frequency", &Map2AudioEngine::setPhaserCentreFrequency,
             py::arg("hz"),
             "Set phaser centre frequency in Hz (100 to 10000)")

        .def("get_phaser_centre_frequency", &Map2AudioEngine::getPhaserCentreFrequency,
             "Get phaser centre frequency in Hz")

        .def("set_phaser_feedback", &Map2AudioEngine::setPhaserFeedback,
             py::arg("feedback"),
             "Set phaser feedback (-1 to 1)")

        .def("get_phaser_feedback", &Map2AudioEngine::getPhaserFeedback,
             "Get phaser feedback")

        .def("set_phaser_mix", &Map2AudioEngine::setPhaserMix,
             py::arg("mix"),
             "Set phaser wet/dry mix (0 to 1)")

        .def("get_phaser_mix", &Map2AudioEngine::getPhaserMix,
             "Get phaser mix")

        .def("set_phaser_bypass", &Map2AudioEngine::setPhaserBypass,
             py::arg("bypass"),
             "Bypass phaser processor")

        .def("is_phaser_bypassed", &Map2AudioEngine::isPhaserBypassed,
             "Check if phaser is bypassed")

        .def("get_phaser_parameters", [](const Map2AudioEngine& self) {
            return phaserParamsToDict(self.getPhaserParameters());
        }, "Get all phaser parameters")

        .def("set_phaser_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setPhaserParameters(dictToPhaserParams(params));
        }, py::arg("params"), "Set all phaser parameters at once")

        .def("get_phaser_metering", [](const Map2AudioEngine& self) {
            return phaserMeteringToDict(self.getPhaserMetering());
        }, "Get phaser metering (input, output, LFO phase)")

        // ========================================
        // Pitch Shifter / EVH--IN-STYLE Harmonizer (NEW)
        // ========================================

        .def("set_pitch_shifter_pitch_l", &Map2AudioEngine::setPitchShifterPitchL,
             py::arg("cents"),
             "Set left channel pitch shift in cents (-100 to +100)")

        .def("get_pitch_shifter_pitch_l", &Map2AudioEngine::getPitchShifterPitchL,
             "Get left channel pitch shift in cents")

        .def("set_pitch_shifter_pitch_r", &Map2AudioEngine::setPitchShifterPitchR,
             py::arg("cents"),
             "Set right channel pitch shift in cents (-100 to +100)")

        .def("get_pitch_shifter_pitch_r", &Map2AudioEngine::getPitchShifterPitchR,
             "Get right channel pitch shift in cents")

        .def("set_pitch_shifter_delay_l", &Map2AudioEngine::setPitchShifterDelayL,
             py::arg("ms"),
             "Set left channel delay in ms (0 to 100)")

        .def("get_pitch_shifter_delay_l", &Map2AudioEngine::getPitchShifterDelayL,
             "Get left channel delay in ms")

        .def("set_pitch_shifter_delay_r", &Map2AudioEngine::setPitchShifterDelayR,
             py::arg("ms"),
             "Set right channel delay in ms (0 to 100)")

        .def("get_pitch_shifter_delay_r", &Map2AudioEngine::getPitchShifterDelayR,
             "Get right channel delay in ms")

        .def("set_pitch_shifter_feedback", &Map2AudioEngine::setPitchShifterFeedback,
             py::arg("feedback"),
             "Set pitch shifter feedback (0 to 0.9)")

        .def("get_pitch_shifter_feedback", &Map2AudioEngine::getPitchShifterFeedback,
             "Get pitch shifter feedback")

        .def("set_pitch_shifter_mix", &Map2AudioEngine::setPitchShifterMix,
             py::arg("percent"),
             "Set pitch shifter wet mix (0 to 100%)")

        .def("get_pitch_shifter_mix", &Map2AudioEngine::getPitchShifterMix,
             "Get pitch shifter mix")

        .def("set_pitch_shifter_spread", &Map2AudioEngine::setPitchShifterSpread,
             py::arg("percent"),
             "Set pitch shifter stereo spread (0 to 200%)")

        .def("get_pitch_shifter_spread", &Map2AudioEngine::getPitchShifterSpread,
             "Get pitch shifter stereo spread")

        .def("set_pitch_shifter_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setPitchShifterPreset(stringToPitchPreset(preset));
        }, py::arg("preset"), "Set pitch shifter preset by name")

        .def("get_pitch_shifter_preset", [](const Map2AudioEngine& self) {
            return pitchPresetToString(self.getPitchShifterPreset());
        }, "Get current pitch shifter preset name")

        .def("set_pitch_shifter_bypass", &Map2AudioEngine::setPitchShifterBypass,
             py::arg("bypass"),
             "Bypass pitch shifter processor")

        .def("is_pitch_shifter_bypassed", &Map2AudioEngine::isPitchShifterBypassed,
             "Check if pitch shifter is bypassed")

        .def("get_pitch_shifter_parameters", [](const Map2AudioEngine& self) {
            return pitchShifterParamsToDict(self.getPitchShifterParameters());
        }, "Get all pitch shifter parameters")

        .def("set_pitch_shifter_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setPitchShifterParameters(dictToPitchShifterParams(params));
        }, py::arg("params"), "Set all pitch shifter parameters at once")

        .def("get_pitch_shifter_metering", [](const Map2AudioEngine& self) {
            return pitchShifterMeteringToDict(self.getPitchShifterMetering());
        }, "Get pitch shifter metering (input, output, grain phase)")

        .def("get_pitch_shifter_preset_info", [](const Map2AudioEngine& /*self*/, const std::string& preset) {
            return pitchPresetInfoToDict(
                PitchShifterProcessor::getPresetInfo(stringToPitchPreset(preset))
            );
        }, py::arg("preset"), "Get preset info (song, album, year, description)")

        .def("get_pitch_shifter_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = PitchShifterProcessor::getNumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<PitchShifterProcessor::Preset>(i);
                py::dict d;
                d["id"] = pitchPresetToString(preset);
                auto info = PitchShifterProcessor::getPresetInfo(preset);
                d["name"] = info.name ? std::string(info.name) : "";
                d["song"] = info.song ? std::string(info.song) : "";
                d["album"] = info.album ? std::string(info.album) : "";
                d["year"] = info.year ? std::string(info.year) : "";
                d["description"] = info.description ? std::string(info.description) : "";
                result.append(d);
            }
            return result;
        }, "Get all available pitch shifter presets (Van Halen songs)")

        // ========================================
        // Stereo Delay
        // ========================================

        .def("set_delay_time_l", &Map2AudioEngine::setDelayTimeL, py::arg("ms"))
        .def("get_delay_time_l", &Map2AudioEngine::getDelayTimeL)
        .def("set_delay_time_r", &Map2AudioEngine::setDelayTimeR, py::arg("ms"))
        .def("get_delay_time_r", &Map2AudioEngine::getDelayTimeR)
        .def("set_delay_feedback", &Map2AudioEngine::setDelayFeedback, py::arg("percent"))
        .def("get_delay_feedback", &Map2AudioEngine::getDelayFeedback)
        .def("set_delay_mix", &Map2AudioEngine::setDelayMix, py::arg("percent"))
        .def("get_delay_mix", &Map2AudioEngine::getDelayMix)
        .def("set_delay_tempo", &Map2AudioEngine::setDelayTempo, py::arg("bpm"))
        .def("get_delay_tempo", &Map2AudioEngine::getDelayTempo)
        .def("set_delay_tempo_sync_l", &Map2AudioEngine::setDelayTempoSyncL, py::arg("division"))
        .def("get_delay_tempo_sync_l", &Map2AudioEngine::getDelayTempoSyncL)
        .def("set_delay_tempo_sync_r", &Map2AudioEngine::setDelayTempoSyncR, py::arg("division"))
        .def("get_delay_tempo_sync_r", &Map2AudioEngine::getDelayTempoSyncR)
        .def("set_delay_tap1_level", &Map2AudioEngine::setDelayTap1Level, py::arg("percent"))
        .def("set_delay_tap2_level", &Map2AudioEngine::setDelayTap2Level, py::arg("percent"))
        .def("set_delay_tap2_ratio", &Map2AudioEngine::setDelayTap2Ratio, py::arg("ratio"))
        .def("set_delay_tap3_level", &Map2AudioEngine::setDelayTap3Level, py::arg("percent"))
        .def("set_delay_tap3_ratio", &Map2AudioEngine::setDelayTap3Ratio, py::arg("ratio"))
        .def("set_delay_tap4_level", &Map2AudioEngine::setDelayTap4Level, py::arg("percent"))
        .def("set_delay_tap4_ratio", &Map2AudioEngine::setDelayTap4Ratio, py::arg("ratio"))
        .def("set_delay_stereo_mode", &Map2AudioEngine::setDelayStereoMode, py::arg("mode"))
        .def("get_delay_stereo_mode", &Map2AudioEngine::getDelayStereoMode)
        .def("set_delay_stereo_spread", &Map2AudioEngine::setDelayStereoSpread, py::arg("percent"))
        .def("get_delay_stereo_spread", &Map2AudioEngine::getDelayStereoSpread)
        .def("set_delay_pan", &Map2AudioEngine::setDelayPan, py::arg("pan"))
        .def("get_delay_pan", &Map2AudioEngine::getDelayPan)
        .def("set_delay_mod_rate", &Map2AudioEngine::setDelayModRate, py::arg("hz"))
        .def("get_delay_mod_rate", &Map2AudioEngine::getDelayModRate)
        .def("set_delay_mod_depth", &Map2AudioEngine::setDelayModDepth, py::arg("percent"))
        .def("get_delay_mod_depth", &Map2AudioEngine::getDelayModDepth)
        .def("set_delay_mod_waveform", &Map2AudioEngine::setDelayModWaveform, py::arg("waveform"))
        .def("get_delay_mod_waveform", &Map2AudioEngine::getDelayModWaveform)
        .def("set_delay_low_cut", &Map2AudioEngine::setDelayLowCut, py::arg("hz"))
        .def("get_delay_low_cut", &Map2AudioEngine::getDelayLowCut)
        .def("set_delay_high_cut", &Map2AudioEngine::setDelayHighCut, py::arg("hz"))
        .def("get_delay_high_cut", &Map2AudioEngine::getDelayHighCut)
        .def("set_delay_filter_in_loop", &Map2AudioEngine::setDelayFilterInLoop, py::arg("enabled"))
        .def("get_delay_filter_in_loop", &Map2AudioEngine::getDelayFilterInLoop)
        .def("set_delay_diffusion", &Map2AudioEngine::setDelayDiffusion, py::arg("percent"))
        .def("get_delay_diffusion", &Map2AudioEngine::getDelayDiffusion)
        .def("set_delay_duck_threshold", &Map2AudioEngine::setDelayDuckThreshold, py::arg("db"))
        .def("get_delay_duck_threshold", &Map2AudioEngine::getDelayDuckThreshold)
        .def("set_delay_duck_amount", &Map2AudioEngine::setDelayDuckAmount, py::arg("percent"))
        .def("get_delay_duck_amount", &Map2AudioEngine::getDelayDuckAmount)
        .def("set_delay_duck_release", &Map2AudioEngine::setDelayDuckRelease, py::arg("ms"))
        .def("get_delay_duck_release", &Map2AudioEngine::getDelayDuckRelease)
        .def("set_delay_output_level", &Map2AudioEngine::setDelayOutputLevel, py::arg("db"))
        .def("get_delay_output_level", &Map2AudioEngine::getDelayOutputLevel)
        .def("set_delay_spillover", &Map2AudioEngine::setDelaySpillover, py::arg("enabled"))
        .def("has_delay_spillover", &Map2AudioEngine::hasDelaySpillover)
        .def("stage_delay_spillover", &Map2AudioEngine::stageDelaySpillover)
        .def("set_delay_bypass", &Map2AudioEngine::setDelayBypass, py::arg("bypass"))
        .def("is_delay_bypassed", &Map2AudioEngine::isDelayBypassed)
        .def("get_delay_parameters", [](const Map2AudioEngine& self) {
            return delayParamsToDict(self.getDelayParameters());
        })
        .def("set_delay_parameters", [](Map2AudioEngine& self, const py::dict& params) {
            self.setDelayParameters(dictToDelayParams(params));
        }, py::arg("params"))
        .def("get_delay_metering", [](const Map2AudioEngine& self) {
            return delayMeteringToDict(self.getDelayMetering());
        })

        // ========================================
        // Boss XS-1 Polyphonic Pitch Shifter
        // ========================================

        .def("set_boss_xs1_shift_amount", &Map2AudioEngine::setBossXS1ShiftAmount,
             py::arg("semitones"),
             "Set Boss XS-1 pitch shift amount (-7 to +7 semitones)")

        .def("get_boss_xs1_shift_amount", &Map2AudioEngine::getBossXS1ShiftAmount,
             "Get Boss XS-1 pitch shift amount")

        .def("set_boss_xs1_balance", &Map2AudioEngine::setBossXS1Balance,
             py::arg("percent"),
             "Set Boss XS-1 wet/dry balance (0-100%)")

        .def("get_boss_xs1_balance", &Map2AudioEngine::getBossXS1Balance,
             "Get Boss XS-1 balance")

        .def("set_boss_xs1_detune_mode", &Map2AudioEngine::setBossXS1DetuneMode,
             py::arg("enabled"),
             "Enable Boss XS-1 detune mode (±20 cents instead of semitones)")

        .def("is_boss_xs1_detune_mode", &Map2AudioEngine::isBossXS1DetuneMode,
             "Check if Boss XS-1 is in detune mode")

        .def("set_boss_xs1_detune_amount", &Map2AudioEngine::setBossXS1DetuneAmount,
             py::arg("cents"),
             "Set Boss XS-1 detune amount (±20 cents)")

        .def("get_boss_xs1_detune_amount", &Map2AudioEngine::getBossXS1DetuneAmount,
             "Get Boss XS-1 detune amount")

        .def("set_boss_xs1_glide", &Map2AudioEngine::setBossXS1Glide,
             py::arg("ms"),
             "Set Boss XS-1 glide time (0-100 ms)")

        .def("get_boss_xs1_glide", &Map2AudioEngine::getBossXS1Glide,
             "Get Boss XS-1 glide time")

        .def("set_boss_xs1_feedback", &Map2AudioEngine::setBossXS1Feedback,
             py::arg("feedback"),
             "Set Boss XS-1 feedback (0 to 0.7)")

        .def("get_boss_xs1_feedback", &Map2AudioEngine::getBossXS1Feedback,
             "Get Boss XS-1 feedback")

        .def("set_boss_xs1_pedal_enabled", &Map2AudioEngine::setBossXS1PedalEnabled,
             py::arg("enabled"),
             "Enable Boss XS-1 expression pedal control")

        .def("is_boss_xs1_pedal_enabled", &Map2AudioEngine::isBossXS1PedalEnabled,
             "Check if Boss XS-1 expression pedal is enabled")

        .def("set_boss_xs1_pedal_position", &Map2AudioEngine::setBossXS1PedalPosition,
             py::arg("position"),
             "Set Boss XS-1 expression pedal position (0-100%)")

        .def("get_boss_xs1_pedal_position", &Map2AudioEngine::getBossXS1PedalPosition,
             "Get Boss XS-1 expression pedal position")

        .def("set_boss_xs1_pedal_range", &Map2AudioEngine::setBossXS1PedalRange,
             py::arg("min_semitones"), py::arg("max_semitones"),
             "Set Boss XS-1 expression pedal range")

        .def("get_boss_xs1_pedal_min", &Map2AudioEngine::getBossXS1PedalMin,
             "Get Boss XS-1 expression pedal min")

        .def("get_boss_xs1_pedal_max", &Map2AudioEngine::getBossXS1PedalMax,
             "Get Boss XS-1 expression pedal max")

        .def("set_boss_xs1_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setBossXS1Preset(stringToBossXS1Preset(preset));
        }, py::arg("preset"), "Set Boss XS-1 preset by name")

        .def("get_boss_xs1_preset", [](const Map2AudioEngine& self) {
            return bossXS1PresetToString(self.getBossXS1Preset());
        }, "Get current Boss XS-1 preset name")

        .def("set_boss_xs1_bypass", &Map2AudioEngine::setBossXS1Bypass,
             py::arg("bypass"),
             "Bypass Boss XS-1 processor")

        .def("is_boss_xs1_bypassed", &Map2AudioEngine::isBossXS1Bypassed,
             "Check if Boss XS-1 is bypassed")

        .def("get_boss_xs1_parameters", [](const Map2AudioEngine& self) {
            return bossXS1ParamsToDict(self.getBossXS1Parameters());
        }, "Get all Boss XS-1 parameters")

        .def("set_boss_xs1_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setBossXS1Parameters(dictToBossXS1Params(params));
        }, py::arg("params"), "Set all Boss XS-1 parameters at once")

        .def("get_boss_xs1_input_level", &Map2AudioEngine::getBossXS1InputLevel,
             "Get Boss XS-1 input level (dB)")

        .def("get_boss_xs1_output_level", &Map2AudioEngine::getBossXS1OutputLevel,
             "Get Boss XS-1 output level (dB)")

        .def("get_boss_xs1_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = Map2AudioEngine::getBossXS1NumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<BossXS1PolyShifterProcessor::Preset>(i);
                py::dict d;
                d["id"] = bossXS1PresetToString(preset);
                d["name"] = Map2AudioEngine::getBossXS1PresetName(preset);
                result.append(d);
            }
            return result;
        }, "Get all available Boss XS-1 presets")

        // ========================================
        // ShoeGaze Multi-Effect Processor
        // ========================================

        // Primary controls
        .def("set_shoegaze_atmosphere", &Map2AudioEngine::setShoeGazeAtmosphere,
             py::arg("percent"),
             "Set ShoeGaze atmosphere amount (0-100%)")
        .def("get_shoegaze_atmosphere", &Map2AudioEngine::getShoeGazeAtmosphere,
             "Get ShoeGaze atmosphere amount")

        .def("set_shoegaze_decay", &Map2AudioEngine::setShoeGazeDecay,
             py::arg("seconds"),
             "Set ShoeGaze reverb decay time (0.5-30s)")
        .def("get_shoegaze_decay", &Map2AudioEngine::getShoeGazeDecay,
             "Get ShoeGaze reverb decay time")

        .def("set_shoegaze_shimmer", &Map2AudioEngine::setShoeGazeShimmer,
             py::arg("percent"),
             "Set ShoeGaze shimmer amount (0-100%)")
        .def("get_shoegaze_shimmer", &Map2AudioEngine::getShoeGazeShimmer,
             "Get ShoeGaze shimmer amount")

        .def("set_shoegaze_shimmer_pitch", &Map2AudioEngine::setShoeGazeShimmerPitch,
             py::arg("semitones"),
             "Set ShoeGaze shimmer pitch shift (-12 to +24 semitones)")
        .def("get_shoegaze_shimmer_pitch", &Map2AudioEngine::getShoeGazeShimmerPitch,
             "Get ShoeGaze shimmer pitch shift")

        .def("set_shoegaze_modulation", &Map2AudioEngine::setShoeGazeModulation,
             py::arg("percent"),
             "Set ShoeGaze modulation depth (0-100%)")
        .def("get_shoegaze_modulation", &Map2AudioEngine::getShoeGazeModulation,
             "Get ShoeGaze modulation depth")

        .def("set_shoegaze_mod_rate", &Map2AudioEngine::setShoeGazeModRate,
             py::arg("hz"),
             "Set ShoeGaze modulation rate (0.1-5 Hz)")
        .def("get_shoegaze_mod_rate", &Map2AudioEngine::getShoeGazeModRate,
             "Get ShoeGaze modulation rate")

        .def("set_shoegaze_drive", &Map2AudioEngine::setShoeGazeDrive,
             py::arg("percent"),
             "Set ShoeGaze saturation drive (0-100%)")
        .def("get_shoegaze_drive", &Map2AudioEngine::getShoeGazeDrive,
             "Get ShoeGaze saturation drive")

        .def("set_shoegaze_delay_time", &Map2AudioEngine::setShoeGazeDelayTime,
             py::arg("ms"),
             "Set ShoeGaze delay time (0-1000ms)")
        .def("get_shoegaze_delay_time", &Map2AudioEngine::getShoeGazeDelayTime,
             "Get ShoeGaze delay time")

        .def("set_shoegaze_delay_feedback", &Map2AudioEngine::setShoeGazeDelayFeedback,
             py::arg("percent"),
             "Set ShoeGaze delay feedback (0-90%)")
        .def("get_shoegaze_delay_feedback", &Map2AudioEngine::getShoeGazeDelayFeedback,
             "Get ShoeGaze delay feedback")

        .def("set_shoegaze_delay_mod", &Map2AudioEngine::setShoeGazeDelayMod,
             py::arg("percent"),
             "Set ShoeGaze delay modulation/BBD wobble (0-100%)")
        .def("get_shoegaze_delay_mod", &Map2AudioEngine::getShoeGazeDelayMod,
             "Get ShoeGaze delay modulation")

        .def("set_shoegaze_low_cut", &Map2AudioEngine::setShoeGazeLowCut,
             py::arg("hz"),
             "Set ShoeGaze low cut frequency (20-2000 Hz)")
        .def("get_shoegaze_low_cut", &Map2AudioEngine::getShoeGazeLowCut,
             "Get ShoeGaze low cut frequency")

        .def("set_shoegaze_high_cut", &Map2AudioEngine::setShoeGazeHighCut,
             py::arg("hz"),
             "Set ShoeGaze high cut frequency (1000-20000 Hz)")
        .def("get_shoegaze_high_cut", &Map2AudioEngine::getShoeGazeHighCut,
             "Get ShoeGaze high cut frequency")

        .def("set_shoegaze_mix", &Map2AudioEngine::setShoeGazeMix,
             py::arg("percent"),
             "Set ShoeGaze wet/dry mix (0-100%)")
        .def("get_shoegaze_mix", &Map2AudioEngine::getShoeGazeMix,
             "Get ShoeGaze wet/dry mix")

        .def("set_shoegaze_stereo_width", &Map2AudioEngine::setShoeGazeStereoWidth,
             py::arg("percent"),
             "Set ShoeGaze stereo width (0-200%)")
        .def("get_shoegaze_stereo_width", &Map2AudioEngine::getShoeGazeStereoWidth,
             "Get ShoeGaze stereo width")

        // Advanced controls
        .def("set_shoegaze_reverb_diffusion", &Map2AudioEngine::setShoeGazeReverbDiffusion,
             py::arg("percent"),
             "Set ShoeGaze reverb diffusion (0-100%)")
        .def("get_shoegaze_reverb_diffusion", &Map2AudioEngine::getShoeGazeReverbDiffusion,
             "Get ShoeGaze reverb diffusion")

        .def("set_shoegaze_reverb_damping", &Map2AudioEngine::setShoeGazeReverbDamping,
             py::arg("percent"),
             "Set ShoeGaze reverb damping (0-100%)")
        .def("get_shoegaze_reverb_damping", &Map2AudioEngine::getShoeGazeReverbDamping,
             "Get ShoeGaze reverb damping")

        .def("set_shoegaze_shimmer_feedback", &Map2AudioEngine::setShoeGazeShimmerFeedback,
             py::arg("percent"),
             "Set ShoeGaze shimmer feedback/spiral (0-80%)")
        .def("get_shoegaze_shimmer_feedback", &Map2AudioEngine::getShoeGazeShimmerFeedback,
             "Get ShoeGaze shimmer feedback")

        .def("set_shoegaze_chorus_voices", &Map2AudioEngine::setShoeGazeChorusVoices,
             py::arg("voices"),
             "Set ShoeGaze chorus voice count (1-6)")
        .def("get_shoegaze_chorus_voices", &Map2AudioEngine::getShoeGazeChorusVoices,
             "Get ShoeGaze chorus voice count")

        .def("set_shoegaze_ducking", &Map2AudioEngine::setShoeGazeDucking,
             py::arg("percent"),
             "Set ShoeGaze ducking amount (0-100%)")
        .def("get_shoegaze_ducking", &Map2AudioEngine::getShoeGazeDucking,
             "Get ShoeGaze ducking amount")

        // Preset control
        .def("set_shoegaze_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setShoeGazePreset(stringToShoegazePreset(preset));
        }, py::arg("preset"), "Set ShoeGaze preset by name")

        .def("get_shoegaze_preset", [](const Map2AudioEngine& self) {
            return shoegazePresetToString(self.getShoeGazePreset());
        }, "Get current ShoeGaze preset name")

        // Bypass and spillover
        .def("set_shoegaze_bypass", &Map2AudioEngine::setShoeGazeBypass,
             py::arg("bypass"),
             "Bypass ShoeGaze processor")
        .def("is_shoegaze_bypassed", &Map2AudioEngine::isShoeGazeBypassed,
             "Check if ShoeGaze is bypassed")

        .def("set_shoegaze_spillover", &Map2AudioEngine::setShoeGazeSpillover,
             py::arg("enabled"),
             "Enable ShoeGaze spillover (tails when bypassed)")
        .def("has_shoegaze_spillover", &Map2AudioEngine::hasShoeGazeSpillover,
             "Check if ShoeGaze spillover is enabled")
        .def("stage_shoegaze_spillover", &Map2AudioEngine::stageShoeGazeSpillover,
             "Stage the current ShoeGaze state for snapshot spillover")

        // Bulk parameters
        .def("get_shoegaze_parameters", [](const Map2AudioEngine& self) {
            return shoegazeParamsToDict(self.getShoeGazeParameters());
        }, "Get all ShoeGaze parameters")

        .def("set_shoegaze_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setShoeGazeParameters(dictToShoegazeParams(params));
        }, py::arg("params"), "Set all ShoeGaze parameters at once")

        // Metering
        .def("get_shoegaze_metering", [](const Map2AudioEngine& self) {
            return shoegazeMeteringToDict(self.getShoeGazeMetering());
        }, "Get ShoeGaze metering data")

        // Preset info
        .def("get_shoegaze_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = Map2AudioEngine::getShoeGazeNumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<ShoeGazeProcessor::Preset>(i);
                auto info = Map2AudioEngine::getShoeGazePresetInfo(preset);
                py::dict d;
                d["id"] = shoegazePresetToString(preset);
                d["name"] = info.name ? std::string(info.name) : "";
                d["artist"] = info.artist ? std::string(info.artist) : "";
                d["description"] = info.description ? std::string(info.description) : "";
                result.append(d);
            }
            return result;
        }, "Get all available ShoeGaze presets")

        // ========================================
        // Lexi Love PCM 70 Reverb
        // ========================================

        // Algorithm control
        .def("set_lexilove_algorithm", [](Map2AudioEngine& self, int index) {
            self.setLexiLoveAlgorithm(index);
        }, py::arg("algorithm_index"), "Set Lexi Love algorithm by index (0-8)")

        .def("set_lexilove_algorithm_by_name", [](Map2AudioEngine& self, const std::string& name) {
            self.setLexiLoveAlgorithm(stringToLexiAlgorithm(name));
        }, py::arg("algorithm"), "Set Lexi Love algorithm by name")

        .def("get_lexilove_algorithm", &Map2AudioEngine::getLexiLoveAlgorithm,
             "Get current Lexi Love algorithm index")

        .def("get_lexilove_algorithm_name", [](const Map2AudioEngine& self) {
            return lexiAlgorithmToString(static_cast<LexiLoveProcessor::Algorithm>(self.getLexiLoveAlgorithm()));
        }, "Get current Lexi Love algorithm name")

        // Core parameters
        .def("set_lexilove_pre_delay", &Map2AudioEngine::setLexiLovePreDelay,
             py::arg("ms"),
             "Set Lexi Love pre-delay (0-500ms)")
        .def("get_lexilove_pre_delay", &Map2AudioEngine::getLexiLovePreDelay,
             "Get Lexi Love pre-delay")

        .def("set_lexilove_decay_time", &Map2AudioEngine::setLexiLoveDecayTime,
             py::arg("seconds"),
             "Set Lexi Love decay time (0.5-30s)")
        .def("get_lexilove_decay_time", &Map2AudioEngine::getLexiLoveDecayTime,
             "Get Lexi Love decay time")

        .def("set_lexilove_diffusion", &Map2AudioEngine::setLexiLoveDiffusion,
             py::arg("percent"),
             "Set Lexi Love diffusion (0-100%)")
        .def("get_lexilove_diffusion", &Map2AudioEngine::getLexiLoveDiffusion,
             "Get Lexi Love diffusion")

        .def("set_lexilove_mix", &Map2AudioEngine::setLexiLoveMix,
             py::arg("percent"),
             "Set Lexi Love wet/dry mix (0-100%)")
        .def("get_lexilove_mix", &Map2AudioEngine::getLexiLoveMix,
             "Get Lexi Love wet/dry mix")

        .def("set_lexilove_high_cut", &Map2AudioEngine::setLexiLoveHighCut,
             py::arg("hz"),
             "Set Lexi Love high cut frequency (1000-20000Hz)")
        .def("get_lexilove_high_cut", &Map2AudioEngine::getLexiLoveHighCut,
             "Get Lexi Love high cut frequency")

        .def("set_lexilove_low_cut", &Map2AudioEngine::setLexiLoveLowCut,
             py::arg("hz"),
             "Set Lexi Love low cut frequency (20-500Hz)")
        .def("get_lexilove_low_cut", &Map2AudioEngine::getLexiLoveLowCut,
             "Get Lexi Love low cut frequency")

        // Multi-band decay
        .def("set_lexilove_low_decay_mult", &Map2AudioEngine::setLexiLoveLowDecayMult,
             py::arg("mult"),
             "Set Lexi Love low frequency decay multiplier (0.25-2.0)")
        .def("get_lexilove_low_decay_mult", &Map2AudioEngine::getLexiLoveLowDecayMult,
             "Get Lexi Love low frequency decay multiplier")

        .def("set_lexilove_high_decay_mult", &Map2AudioEngine::setLexiLoveHighDecayMult,
             py::arg("mult"),
             "Set Lexi Love high frequency decay multiplier (0.25-2.0)")
        .def("get_lexilove_high_decay_mult", &Map2AudioEngine::getLexiLoveHighDecayMult,
             "Get Lexi Love high frequency decay multiplier")

        .def("set_lexilove_low_crossover", &Map2AudioEngine::setLexiLoveLowCrossover,
             py::arg("hz"),
             "Set Lexi Love low crossover frequency (100-2000Hz)")
        .def("get_lexilove_low_crossover", &Map2AudioEngine::getLexiLoveLowCrossover,
             "Get Lexi Love low crossover frequency")

        .def("set_lexilove_high_crossover", &Map2AudioEngine::setLexiLoveHighCrossover,
             py::arg("hz"),
             "Set Lexi Love high crossover frequency (2000-15000Hz)")
        .def("get_lexilove_high_crossover", &Map2AudioEngine::getLexiLoveHighCrossover,
             "Get Lexi Love high crossover frequency")

        // Early reflections
        .def("set_lexilove_early_level", &Map2AudioEngine::setLexiLoveEarlyLevel,
             py::arg("percent"),
             "Set Lexi Love early reflection level (0-100%)")
        .def("get_lexilove_early_level", &Map2AudioEngine::getLexiLoveEarlyLevel,
             "Get Lexi Love early reflection level")

        .def("set_lexilove_early_pattern", &Map2AudioEngine::setLexiLoveEarlyPattern,
             py::arg("percent"),
             "Set Lexi Love early reflection pattern/density (0-100%)")
        .def("get_lexilove_early_pattern", &Map2AudioEngine::getLexiLoveEarlyPattern,
             "Get Lexi Love early reflection pattern")

        // Modulation (sparkle)
        .def("set_lexilove_mod_depth", &Map2AudioEngine::setLexiLoveModDepth,
             py::arg("percent"),
             "Set Lexi Love modulation depth for sparkle (0-100%)")
        .def("get_lexilove_mod_depth", &Map2AudioEngine::getLexiLoveModDepth,
             "Get Lexi Love modulation depth")

        .def("set_lexilove_mod_rate", &Map2AudioEngine::setLexiLoveModRate,
             py::arg("hz"),
             "Set Lexi Love modulation rate (0.1-10Hz)")
        .def("get_lexilove_mod_rate", &Map2AudioEngine::getLexiLoveModRate,
             "Get Lexi Love modulation rate")

        // State control
        .def("set_lexilove_bypass", &Map2AudioEngine::setLexiLoveBypass,
             py::arg("bypass"),
             "Bypass Lexi Love processor")
        .def("is_lexilove_bypassed", &Map2AudioEngine::isLexiLoveBypassed,
             "Check if Lexi Love is bypassed")

        .def("set_lexilove_spillover", &Map2AudioEngine::setLexiLoveSpillover,
             py::arg("enabled"),
             "Enable Lexi Love spillover (tails when bypassed)")
        .def("has_lexilove_spillover", &Map2AudioEngine::hasLexiLoveSpillover,
             "Check if Lexi Love spillover is enabled")
        .def("stage_lexilove_spillover", &Map2AudioEngine::stageLexiLoveSpillover,
             "Stage the current Lexi Love state for snapshot spillover")

        // Bulk parameters
        .def("get_lexilove_parameters", [](const Map2AudioEngine& self) {
            return lexiParamsToDict(self.getLexiLoveParameters());
        }, "Get all Lexi Love parameters")

        .def("set_lexilove_parameters", [](Map2AudioEngine& self, const py::dict& params) {
            self.setLexiLoveParameters(dictToLexiParams(params));
        }, py::arg("params"), "Set all Lexi Love parameters at once")

        // Metering
        .def("get_lexilove_metering", [](const Map2AudioEngine& self) {
            return lexiMeteringToDict(self.getLexiLoveMetering());
        }, "Get Lexi Love metering data")

        // Algorithm info
        .def_static("get_lexilove_algorithms", []() {
            py::list algorithms;
            int numAlgorithms = Map2AudioEngine::getLexiLoveNumAlgorithms();
            for (int i = 0; i < numAlgorithms; ++i) {
                auto info = Map2AudioEngine::getLexiLoveAlgorithmInfo(i);
                py::dict d = lexiAlgorithmInfoToDict(info);
                d["index"] = i;
                d["id"] = lexiAlgorithmToString(static_cast<LexiLoveProcessor::Algorithm>(i));
                algorithms.append(d);
            }
            return algorithms;
        }, "Get all available Lexi Love algorithms")

        // ========================================
        // Ultra-Harmonizer Control
        // ========================================

        .def("set_h3000_bypass", &Map2AudioEngine::setH3000Bypass,
             py::arg("bypass"), "Bypass the H3000 processor")
        .def("is_h3000_bypassed", &Map2AudioEngine::isH3000Bypassed,
             "Check if H3000 is bypassed")

        // Algorithm selection (string overload)
        .def("set_h3000_algorithm", [](Map2AudioEngine& self, const std::string& algo) {
            self.setH3000Algorithm(stringToH3000Algorithm(algo));
        }, py::arg("algorithm"), "Set H3000 algorithm by name")

        // Algorithm selection (int overload)
        .def("set_h3000_algorithm", [](Map2AudioEngine& self, int algoIndex) {
            self.setH3000Algorithm(static_cast<H3000Processor::Algorithm>(algoIndex));
        }, py::arg("algorithm_index"), "Set H3000 algorithm by index (0-9)")

        .def("get_h3000_algorithm", [](const Map2AudioEngine& self) -> std::string {
            return h3000AlgorithmToString(static_cast<H3000Processor::Algorithm>(self.getH3000Algorithm()));
        }, "Get current H3000 algorithm")

        // Pitch parameters
        .def("set_h3000_pitch_l", &Map2AudioEngine::setH3000PitchL,
             py::arg("cents"), "Set left pitch shift in cents (-2400 to +2400)")
        .def("get_h3000_pitch_l", &Map2AudioEngine::getH3000PitchL,
             "Get left pitch shift in cents")
        .def("set_h3000_pitch_r", &Map2AudioEngine::setH3000PitchR,
             py::arg("cents"), "Set right pitch shift in cents (-2400 to +2400)")
        .def("get_h3000_pitch_r", &Map2AudioEngine::getH3000PitchR,
             "Get right pitch shift in cents")

        // Delay parameters
        .def("set_h3000_delay_l", &Map2AudioEngine::setH3000DelayL,
             py::arg("ms"), "Set left delay time in ms (0-1000)")
        .def("get_h3000_delay_l", &Map2AudioEngine::getH3000DelayL,
             "Get left delay time in ms")
        .def("set_h3000_delay_r", &Map2AudioEngine::setH3000DelayR,
             py::arg("ms"), "Set right delay time in ms (0-1000)")
        .def("get_h3000_delay_r", &Map2AudioEngine::getH3000DelayR,
             "Get right delay time in ms")

        // Feedback parameters
        .def("set_h3000_feedback", &Map2AudioEngine::setH3000Feedback,
             py::arg("percent"), "Set feedback amount (0-100)")
        .def("get_h3000_feedback", &Map2AudioEngine::getH3000Feedback,
             "Get feedback amount")
        .def("set_h3000_cross_feedback", &Map2AudioEngine::setH3000CrossFeedback,
             py::arg("percent"), "Set cross-channel feedback (0-100)")
        .def("get_h3000_cross_feedback", &Map2AudioEngine::getH3000CrossFeedback,
             "Get cross-channel feedback")

        // Modulation parameters
        .def("set_h3000_mod_depth", &Map2AudioEngine::setH3000ModDepth,
             py::arg("percent"), "Set modulation depth (0-100)")
        .def("get_h3000_mod_depth", &Map2AudioEngine::getH3000ModDepth,
             "Get modulation depth")
        .def("set_h3000_mod_rate", &Map2AudioEngine::setH3000ModRate,
             py::arg("hz"), "Set modulation rate in Hz (0.1-10)")
        .def("get_h3000_mod_rate", &Map2AudioEngine::getH3000ModRate,
             "Get modulation rate in Hz")

        // Filter parameters
        .def("set_h3000_low_cut", &Map2AudioEngine::setH3000LowCut,
             py::arg("hz"), "Set low cut frequency in Hz (20-500)")
        .def("get_h3000_low_cut", &Map2AudioEngine::getH3000LowCut,
             "Get low cut frequency in Hz")
        .def("set_h3000_high_cut", &Map2AudioEngine::setH3000HighCut,
             py::arg("hz"), "Set high cut frequency in Hz (2000-20000)")
        .def("get_h3000_high_cut", &Map2AudioEngine::getH3000HighCut,
             "Get high cut frequency in Hz")

        // Levels
        .def("set_h3000_mix", &Map2AudioEngine::setH3000Mix,
             py::arg("percent"), "Set wet/dry mix (0-100)")
        .def("get_h3000_mix", &Map2AudioEngine::getH3000Mix,
             "Get wet/dry mix")
        .def("set_h3000_level_l", &Map2AudioEngine::setH3000LevelL,
             py::arg("percent"), "Set left output level (0-100)")
        .def("get_h3000_level_l", &Map2AudioEngine::getH3000LevelL,
             "Get left output level")
        .def("set_h3000_level_r", &Map2AudioEngine::setH3000LevelR,
             py::arg("percent"), "Set right output level (0-100)")
        .def("get_h3000_level_r", &Map2AudioEngine::getH3000LevelR,
             "Get right output level")

        // Glide (portamento)
        .def("set_h3000_glide", &Map2AudioEngine::setH3000Glide,
             py::arg("ms"), "Set pitch glide time in ms (0-1000)")
        .def("get_h3000_glide", &Map2AudioEngine::getH3000Glide,
             "Get pitch glide time in ms")

        // Bulk parameters
        .def("get_h3000_parameters", [](const Map2AudioEngine& self) {
            return h3000ParamsToDict(self.getH3000Parameters());
        }, "Get all H3000 parameters")

        .def("set_h3000_parameters", [](Map2AudioEngine& self, const py::dict& params) {
            self.setH3000Parameters(dictToH3000Params(params));
        }, py::arg("params"), "Set all H3000 parameters at once")

        // Metering
        .def("get_h3000_metering", [](const Map2AudioEngine& self) {
            return h3000MeteringToDict(self.getH3000Metering());
        }, "Get H3000 metering data")

        // Algorithm info
        .def_static("get_h3000_algorithms", []() {
            py::list algorithms;
            int numAlgorithms = Map2AudioEngine::getH3000NumAlgorithms();
            for (int i = 0; i < numAlgorithms; ++i) {
                auto info = Map2AudioEngine::getH3000AlgorithmInfo(i);
                py::dict d = h3000AlgorithmInfoToDict(info);
                d["index"] = i;
                d["id"] = h3000AlgorithmToString(static_cast<H3000Processor::Algorithm>(i));
                algorithms.append(d);
            }
            return algorithms;
        }, "Get all available H3000 algorithms")

        // ========================================
        // Peavey 5150 Block Letter Amp Simulator
        // ========================================

        // Preamp controls
        .def("set_peavey5150_pre_gain", &Map2AudioEngine::setPeavey5150PreGain,
             py::arg("value"),
             "Set Peavey 5150 preamp gain (0-10)")
        .def("get_peavey5150_pre_gain", &Map2AudioEngine::getPeavey5150PreGain,
             "Get Peavey 5150 preamp gain")

        .def("set_peavey5150_post_gain", &Map2AudioEngine::setPeavey5150PostGain,
             py::arg("value"),
             "Set Peavey 5150 master volume (0-10)")
        .def("get_peavey5150_post_gain", &Map2AudioEngine::getPeavey5150PostGain,
             "Get Peavey 5150 master volume")

        // Tone stack
        .def("set_peavey5150_low", &Map2AudioEngine::setPeavey5150Low,
             py::arg("value"),
             "Set Peavey 5150 bass tone (0-10)")
        .def("get_peavey5150_low", &Map2AudioEngine::getPeavey5150Low,
             "Get Peavey 5150 bass tone")

        .def("set_peavey5150_mid", &Map2AudioEngine::setPeavey5150Mid,
             py::arg("value"),
             "Set Peavey 5150 mid tone (0-10)")
        .def("get_peavey5150_mid", &Map2AudioEngine::getPeavey5150Mid,
             "Get Peavey 5150 mid tone")

        .def("set_peavey5150_high", &Map2AudioEngine::setPeavey5150High,
             py::arg("value"),
             "Set Peavey 5150 treble tone (0-10)")
        .def("get_peavey5150_high", &Map2AudioEngine::getPeavey5150High,
             "Get Peavey 5150 treble tone")

        // Power amp
        .def("set_peavey5150_presence", &Map2AudioEngine::setPeavey5150Presence,
             py::arg("value"),
             "Set Peavey 5150 presence (0-10)")
        .def("get_peavey5150_presence", &Map2AudioEngine::getPeavey5150Presence,
             "Get Peavey 5150 presence")

        .def("set_peavey5150_resonance", &Map2AudioEngine::setPeavey5150Resonance,
             py::arg("value"),
             "Set Peavey 5150 resonance (0-10)")
        .def("get_peavey5150_resonance", &Map2AudioEngine::getPeavey5150Resonance,
             "Get Peavey 5150 resonance")

        .def("set_peavey5150_bias", &Map2AudioEngine::setPeavey5150Bias,
             py::arg("value"),
             "Set Peavey 5150 power tube bias (0-10, 0=cold stock)")
        .def("get_peavey5150_bias", &Map2AudioEngine::getPeavey5150Bias,
             "Get Peavey 5150 power tube bias")

        // Switches
        .def("set_peavey5150_bright", &Map2AudioEngine::setPeavey5150Bright,
             py::arg("on"),
             "Set Peavey 5150 bright switch")
        .def("get_peavey5150_bright", &Map2AudioEngine::getPeavey5150Bright,
             "Get Peavey 5150 bright switch state")

        // State
        .def("set_peavey5150_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setPeavey5150Preset(stringToPeavey5150Preset(preset));
        }, py::arg("preset"), "Set Peavey 5150 preset by name")

        .def("get_peavey5150_preset", [](const Map2AudioEngine& self) {
            return peavey5150PresetToString(self.getPeavey5150Preset());
        }, "Get current Peavey 5150 preset name")

        .def("set_peavey5150_bypass", &Map2AudioEngine::setPeavey5150Bypass,
             py::arg("bypass"),
             "Bypass Peavey 5150 processor")
        .def("is_peavey5150_bypassed", &Map2AudioEngine::isPeavey5150Bypassed,
             "Check if Peavey 5150 is bypassed")

        // Bulk parameters
        .def("get_peavey5150_parameters", [](const Map2AudioEngine& self) {
            return peavey5150ParamsToDict(self.getPeavey5150Parameters());
        }, "Get all Peavey 5150 parameters")

        .def("set_peavey5150_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setPeavey5150Parameters(dictToPeavey5150Params(params));
        }, py::arg("params"), "Set all Peavey 5150 parameters at once")

        // Metering
        .def("get_peavey5150_metering", [](const Map2AudioEngine& self) {
            return peavey5150MeteringToDict(self.getPeavey5150Metering());
        }, "Get Peavey 5150 metering data")

        // Preset info
        .def("get_peavey5150_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = Map2AudioEngine::getPeavey5150NumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<Peavey5150Processor::Preset>(i);
                auto info = Map2AudioEngine::getPeavey5150PresetInfo(preset);
                py::dict d;
                d["id"] = peavey5150PresetToString(preset);
                d["name"] = info.name ? std::string(info.name) : "";
                d["description"] = info.description ? std::string(info.description) : "";
                result.append(d);
            }
            return result;
        }, "Get all available Peavey 5150 presets")

        // ========================================
        // Tweed Bassman 5F6-A Amplifier Simulator
        // ========================================

        // Channel
        .def("set_tweedbassman_channel_mode", &Map2AudioEngine::setTweedBassmanChannelMode, py::arg("mode"),
             "Set channel mode (0=Normal, 1=Bright, 2=Jumped)")
        .def("get_tweedbassman_channel_mode", &Map2AudioEngine::getTweedBassmanChannelMode)
        .def("set_tweedbassman_normal_volume", &Map2AudioEngine::setTweedBassmanNormalVolume, py::arg("value"))
        .def("get_tweedbassman_normal_volume", &Map2AudioEngine::getTweedBassmanNormalVolume)
        .def("set_tweedbassman_bright_volume", &Map2AudioEngine::setTweedBassmanBrightVolume, py::arg("value"))
        .def("get_tweedbassman_bright_volume", &Map2AudioEngine::getTweedBassmanBrightVolume)
        .def("set_tweedbassman_bright_cap", &Map2AudioEngine::setTweedBassmanBrightCap, py::arg("on"))
        .def("get_tweedbassman_bright_cap", &Map2AudioEngine::getTweedBassmanBrightCap)

        // Preamp
        .def("set_tweedbassman_v1_tube_type", &Map2AudioEngine::setTweedBassmanV1TubeType, py::arg("type"),
             "Set V1 tube (0=12AY7, 1=12AX7, 2=5751, 3=12AT7)")
        .def("get_tweedbassman_v1_tube_type", &Map2AudioEngine::getTweedBassmanV1TubeType)
        .def("set_tweedbassman_cathode_bypass", &Map2AudioEngine::setTweedBassmanCathodeBypass, py::arg("on"))
        .def("get_tweedbassman_cathode_bypass", &Map2AudioEngine::getTweedBassmanCathodeBypass)
        .def("set_tweedbassman_cathode_bias", &Map2AudioEngine::setTweedBassmanCathodeBias, py::arg("mode"),
             "Set cathode bias (0=Hot/820, 1=Normal/1.5k, 2=Cool/2.7k)")
        .def("get_tweedbassman_cathode_bias", &Map2AudioEngine::getTweedBassmanCathodeBias)

        // Tone
        .def("set_tweedbassman_treble", &Map2AudioEngine::setTweedBassmanTreble, py::arg("value"))
        .def("get_tweedbassman_treble", &Map2AudioEngine::getTweedBassmanTreble)
        .def("set_tweedbassman_mid", &Map2AudioEngine::setTweedBassmanMid, py::arg("value"))
        .def("get_tweedbassman_mid", &Map2AudioEngine::getTweedBassmanMid)
        .def("set_tweedbassman_bass", &Map2AudioEngine::setTweedBassmanBass, py::arg("value"))
        .def("get_tweedbassman_bass", &Map2AudioEngine::getTweedBassmanBass)
        .def("set_tweedbassman_raw_switch", &Map2AudioEngine::setTweedBassmanRawSwitch, py::arg("on"))
        .def("get_tweedbassman_raw_switch", &Map2AudioEngine::getTweedBassmanRawSwitch)

        // Master
        .def("set_tweedbassman_master_volume", &Map2AudioEngine::setTweedBassmanMasterVolume, py::arg("value"))
        .def("get_tweedbassman_master_volume", &Map2AudioEngine::getTweedBassmanMasterVolume)

        // Power amp
        .def("set_tweedbassman_presence", &Map2AudioEngine::setTweedBassmanPresence, py::arg("value"))
        .def("get_tweedbassman_presence", &Map2AudioEngine::getTweedBassmanPresence)
        .def("set_tweedbassman_nfb_mode", &Map2AudioEngine::setTweedBassmanNFBMode, py::arg("mode"),
             "Set NFB mode (0=Stock/27k, 1=None, 2=High/10k)")
        .def("get_tweedbassman_nfb_mode", &Map2AudioEngine::getTweedBassmanNFBMode)
        .def("set_tweedbassman_power_tube_type", &Map2AudioEngine::setTweedBassmanPowerTubeType, py::arg("type"),
             "Set power tube (0=6L6, 1=6V6, 2=EL34, 3=KT66)")
        .def("get_tweedbassman_power_tube_type", &Map2AudioEngine::getTweedBassmanPowerTubeType)
        .def("set_tweedbassman_bias_mode", &Map2AudioEngine::setTweedBassmanBiasMode, py::arg("mode"),
             "Set bias mode (0=Fixed, 1=Cathode)")
        .def("get_tweedbassman_bias_mode", &Map2AudioEngine::getTweedBassmanBiasMode)
        .def("set_tweedbassman_rectifier_type", &Map2AudioEngine::setTweedBassmanRectifierType, py::arg("type"),
             "Set rectifier (0=GZ34, 1=5U4G, 2=5Y3, 3=SS)")
        .def("get_tweedbassman_rectifier_type", &Map2AudioEngine::getTweedBassmanRectifierType)

        // Output
        .def("set_tweedbassman_output_level", &Map2AudioEngine::setTweedBassmanOutputLevel, py::arg("dB"))
        .def("get_tweedbassman_output_level", &Map2AudioEngine::getTweedBassmanOutputLevel)
        .def("set_tweedbassman_cabinet_enabled", &Map2AudioEngine::setTweedBassmanCabinetEnabled, py::arg("on"))
        .def("get_tweedbassman_cabinet_enabled", &Map2AudioEngine::getTweedBassmanCabinetEnabled)
        .def("set_tweedbassman_cabinet_ir", &Map2AudioEngine::setTweedBassmanCabinetIR, py::arg("index"))
        .def("get_tweedbassman_cabinet_ir", &Map2AudioEngine::getTweedBassmanCabinetIR)

        // State
        .def("set_tweedbassman_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setTweedBassmanPreset(stringToTweedBassmanPreset(preset));
        }, py::arg("preset"), "Set Tweed Bassman preset by name")

        .def("get_tweedbassman_preset", [](const Map2AudioEngine& self) {
            return tweedBassmanPresetToString(self.getTweedBassmanPreset());
        }, "Get current Tweed Bassman preset name")

        .def("set_tweedbassman_bypass", &Map2AudioEngine::setTweedBassmanBypass, py::arg("bypass"))
        .def("is_tweedbassman_bypassed", &Map2AudioEngine::isTweedBassmanBypassed)

        // Bulk parameters
        .def("get_tweedbassman_parameters", [](const Map2AudioEngine& self) {
            return tweedBassmanParamsToDict(self.getTweedBassmanParameters());
        }, "Get all Tweed Bassman parameters")

        .def("set_tweedbassman_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setTweedBassmanParameters(dictToTweedBassmanParams(params));
        }, py::arg("params"), "Set all Tweed Bassman parameters at once")

        // Metering
        .def("get_tweedbassman_metering", [](const Map2AudioEngine& self) {
            return tweedBassmanMeteringToDict(self.getTweedBassmanMetering());
        }, "Get Tweed Bassman metering data")

        // Preset info
        .def("get_tweedbassman_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = Map2AudioEngine::getTweedBassmanNumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<TweedBassmanProcessor::Preset>(i);
                auto info = Map2AudioEngine::getTweedBassmanPresetInfo(preset);
                py::dict d;
                d["id"] = tweedBassmanPresetToString(preset);
                d["name"] = info.name ? std::string(info.name) : "";
                d["description"] = info.description ? std::string(info.description) : "";
                result.append(d);
            }
            return result;
        }, "Get all available Tweed Bassman presets")

        // ========================================
        // PassionFX Multi-Effect (Steve Vai Passion & Warfare)
        // ========================================

        // NoiseGate
        .def("set_passionfx_gate_enabled", &Map2AudioEngine::setPassionFXGateEnabled, py::arg("enabled"))
        .def("set_passionfx_gate_threshold", &Map2AudioEngine::setPassionFXGateThreshold, py::arg("dB"))
        .def("set_passionfx_gate_release", &Map2AudioEngine::setPassionFXGateRelease, py::arg("ms"))

        // Compressor
        .def("set_passionfx_comp_enabled", &Map2AudioEngine::setPassionFXCompEnabled, py::arg("enabled"))
        .def("set_passionfx_comp_threshold", &Map2AudioEngine::setPassionFXCompThreshold, py::arg("dB"))
        .def("set_passionfx_comp_ratio", &Map2AudioEngine::setPassionFXCompRatio, py::arg("ratio"))
        .def("set_passionfx_comp_attack", &Map2AudioEngine::setPassionFXCompAttack, py::arg("ms"))
        .def("set_passionfx_comp_release", &Map2AudioEngine::setPassionFXCompRelease, py::arg("ms"))
        .def("set_passionfx_comp_glassy", &Map2AudioEngine::setPassionFXCompGlassy, py::arg("glassy"))

        // Wah
        .def("set_passionfx_wah_enabled", &Map2AudioEngine::setPassionFXWahEnabled, py::arg("enabled"))
        .def("set_passionfx_wah_mode", &Map2AudioEngine::setPassionFXWahMode, py::arg("mode"))
        .def("set_passionfx_wah_position", &Map2AudioEngine::setPassionFXWahPosition, py::arg("position"))
        .def("set_passionfx_wah_q", &Map2AudioEngine::setPassionFXWahQ, py::arg("q"))

        // Phaser
        .def("set_passionfx_phaser_enabled", &Map2AudioEngine::setPassionFXPhaserEnabled, py::arg("enabled"))
        .def("set_passionfx_phaser_rate", &Map2AudioEngine::setPassionFXPhaserRate, py::arg("hz"))
        .def("set_passionfx_phaser_depth", &Map2AudioEngine::setPassionFXPhaserDepth, py::arg("depth"))
        .def("set_passionfx_phaser_stages", &Map2AudioEngine::setPassionFXPhaserStages, py::arg("stages"))
        .def("set_passionfx_phaser_feedback", &Map2AudioEngine::setPassionFXPhaserFeedback, py::arg("feedback"))

        // Chorus
        .def("set_passionfx_chorus_enabled", &Map2AudioEngine::setPassionFXChorusEnabled, py::arg("enabled"))
        .def("set_passionfx_chorus_rate", &Map2AudioEngine::setPassionFXChorusRate, py::arg("hz"))
        .def("set_passionfx_chorus_depth", &Map2AudioEngine::setPassionFXChorusDepth, py::arg("depth"))
        .def("set_passionfx_chorus_voices", &Map2AudioEngine::setPassionFXChorusVoices, py::arg("voices"))
        .def("set_passionfx_chorus_mix", &Map2AudioEngine::setPassionFXChorusMix, py::arg("mix"))

        // PitchShifter
        .def("set_passionfx_pitch_enabled", &Map2AudioEngine::setPassionFXPitchEnabled, py::arg("enabled"))
        .def("set_passionfx_pitch_semitones", &Map2AudioEngine::setPassionFXPitchSemitones, py::arg("semitones"))
        .def("set_passionfx_pitch_mix", &Map2AudioEngine::setPassionFXPitchMix, py::arg("mix"))

        // Harmonizer
        .def("set_passionfx_harm_enabled", &Map2AudioEngine::setPassionFXHarmEnabled, py::arg("enabled"))
        .def("set_passionfx_harm_voice1_interval", &Map2AudioEngine::setPassionFXHarmVoice1, py::arg("semitones"))
        .def("set_passionfx_harm_voice2_interval", &Map2AudioEngine::setPassionFXHarmVoice2, py::arg("semitones"))
        .def("set_passionfx_harm_detune_cents", &Map2AudioEngine::setPassionFXHarmDetune, py::arg("cents"))
        .def("set_passionfx_harm_mix", &Map2AudioEngine::setPassionFXHarmMix, py::arg("mix"))

        // Delay
        .def("set_passionfx_delay_enabled", &Map2AudioEngine::setPassionFXDelayEnabled, py::arg("enabled"))
        .def("set_passionfx_delay_time_l", &Map2AudioEngine::setPassionFXDelayTimeL, py::arg("ms"))
        .def("set_passionfx_delay_time_r", &Map2AudioEngine::setPassionFXDelayTimeR, py::arg("ms"))
        .def("set_passionfx_delay_feedback", &Map2AudioEngine::setPassionFXDelayFeedback, py::arg("feedback"))
        .def("set_passionfx_delay_mix", &Map2AudioEngine::setPassionFXDelayMix, py::arg("mix"))
        .def("set_passionfx_delay_freeze", &Map2AudioEngine::setPassionFXDelayFreeze, py::arg("freeze"))
        .def("set_passionfx_delay_pitch_shift_l", &Map2AudioEngine::setPassionFXDelayPitchShiftL, py::arg("semitones"))
        .def("set_passionfx_delay_pitch_shift_r", &Map2AudioEngine::setPassionFXDelayPitchShiftR, py::arg("semitones"))

        // Reverb
        .def("set_passionfx_reverb_enabled", &Map2AudioEngine::setPassionFXReverbEnabled, py::arg("enabled"))
        .def("set_passionfx_reverb_type", &Map2AudioEngine::setPassionFXReverbType, py::arg("type"))
        .def("set_passionfx_reverb_decay", &Map2AudioEngine::setPassionFXReverbDecay, py::arg("seconds"))
        .def("set_passionfx_reverb_shimmer_amount", &Map2AudioEngine::setPassionFXReverbShimmerAmount, py::arg("amount"))
        .def("set_passionfx_reverb_shimmer_interval", &Map2AudioEngine::setPassionFXReverbShimmerInterval, py::arg("semitones"))
        .def("set_passionfx_reverb_mix", &Map2AudioEngine::setPassionFXReverbMix, py::arg("mix"))
        .def("set_passionfx_reverb_freeze", &Map2AudioEngine::setPassionFXReverbFreeze, py::arg("freeze"))

        // EQ
        .def("set_passionfx_eq_enabled", &Map2AudioEngine::setPassionFXEqEnabled, py::arg("enabled"))
        .def("set_passionfx_eq_low_gain", &Map2AudioEngine::setPassionFXEqLowGain, py::arg("dB"))
        .def("set_passionfx_eq_mid_gain", &Map2AudioEngine::setPassionFXEqMidGain, py::arg("dB"))
        .def("set_passionfx_eq_high_gain", &Map2AudioEngine::setPassionFXEqHighGain, py::arg("dB"))
        .def("set_passionfx_eq_tilt", &Map2AudioEngine::setPassionFXEqTilt, py::arg("tilt"))

        // Exciter
        .def("set_passionfx_exciter_enabled", &Map2AudioEngine::setPassionFXExciterEnabled, py::arg("enabled"))
        .def("set_passionfx_exciter_warmth", &Map2AudioEngine::setPassionFXExciterWarmth, py::arg("warmth"))
        .def("set_passionfx_exciter_presence", &Map2AudioEngine::setPassionFXExciterPresence, py::arg("presence"))
        .def("set_passionfx_exciter_air", &Map2AudioEngine::setPassionFXExciterAir, py::arg("air"))

        // Tremolo
        .def("set_passionfx_trem_enabled", &Map2AudioEngine::setPassionFXTremEnabled, py::arg("enabled"))
        .def("set_passionfx_trem_rate", &Map2AudioEngine::setPassionFXTremRate, py::arg("hz"))
        .def("set_passionfx_trem_depth", &Map2AudioEngine::setPassionFXTremDepth, py::arg("depth"))
        .def("set_passionfx_trem_waveform", &Map2AudioEngine::setPassionFXTremWaveform, py::arg("waveform"))

        // Global
        .def("set_passionfx_mix", &Map2AudioEngine::setPassionFXMix, py::arg("mix"))
        .def("set_passionfx_output_level", &Map2AudioEngine::setPassionFXOutputLevel, py::arg("dB"))

        // State
        .def("set_passionfx_preset", [](Map2AudioEngine& self, const std::string& preset) {
            self.setPassionFXPreset(stringToPassionfxPreset(preset));
        }, py::arg("preset"), "Set PassionFX preset by name")

        .def("get_passionfx_preset", [](const Map2AudioEngine& self) {
            return passionfxPresetToString(self.getPassionFXPreset());
        }, "Get current PassionFX preset name")

        .def("set_passionfx_bypass", &Map2AudioEngine::setPassionFXBypass, py::arg("bypass"))
        .def("is_passionfx_bypassed", &Map2AudioEngine::isPassionFXBypassed)

        // Bulk parameters
        .def("get_passionfx_parameters", [](const Map2AudioEngine& self) {
            return passionfxParamsToDict(self.getPassionFXParameters());
        }, "Get all PassionFX parameters")

        .def("set_passionfx_parameters", [](Map2AudioEngine& self, py::dict params) {
            self.setPassionFXParameters(dictToPassionfxParams(params));
        }, py::arg("params"), "Set all PassionFX parameters at once")

        // Metering
        .def("get_passionfx_metering", [](const Map2AudioEngine& self) {
            return passionfxMeteringToDict(self.getPassionFXMetering());
        }, "Get PassionFX metering data")

        // Preset info
        .def("get_passionfx_presets", [](const Map2AudioEngine& /*self*/) {
            py::list result;
            int numPresets = Map2AudioEngine::getPassionFXNumPresets();
            for (int i = 0; i < numPresets; ++i) {
                auto preset = static_cast<PassionFXProcessor::Preset>(i);
                auto info = Map2AudioEngine::getPassionFXPresetInfo(preset);
                py::dict d;
                d["id"] = passionfxPresetToString(preset);
                d["name"] = info.name ? std::string(info.name) : "";
                d["track"] = info.track ? std::string(info.track) : "";
                d["description"] = info.description ? std::string(info.description) : "";
                result.append(d);
            }
            return result;
        }, "Get all available PassionFX presets")

        // ========================================
        // Pedalboard State (Legacy Compatibility)
        // ========================================

        .def("get_current_pedalboard", [](Map2AudioEngine& self) {
            py::dict d;
            d["name"] = "Current Chain";
            d["input_volume_db"] = 0.0;
            d["output_volume_db"] = 0.0;

            std::unordered_map<InstanceId, PluginInstance> loadedById;
            for (const auto& plugin : self.getPluginHost().getLoadedPlugins()) {
                loadedById.emplace(plugin.id, plugin);
            }

            py::list items;
            auto chain = self.getChainOrder();
            for (size_t i = 0; i < chain.size(); i++) {
                py::dict item;
                const auto instanceId = chain[i];
                item["instance_id"] = instanceId;
                item["position"] = static_cast<int>(i);
                item["plugin_position"] = static_cast<int>(i);
                item["is_enabled"] = true;
                item["controls"] = py::list();

                const auto loadedIt = loadedById.find(instanceId);
                if (loadedIt != loadedById.end()) {
                    item["uri"] = loadedIt->second.uri;
                    item["name"] = loadedIt->second.name;
                    item["bypassed"] = loadedIt->second.bypassed;
                } else {
                    item["uri"] = "";
                    item["name"] = "";
                    item["bypassed"] = false;
                }
                items.append(item);
            }
            d["items"] = items;
            return d;
        }, "Get current pedalboard configuration")
        .def("get_loaded_plugins", [](Map2AudioEngine& self) {
            py::list plugins;
            for (const auto& plugin : self.getPluginHost().getLoadedPlugins()) {
                plugins.append(pluginInstanceToDict(plugin));
            }
            return plugins;
        }, "List all loaded plugin instances, including detached resident instances")

        // ========================================
        // AVDECC Entity Methods (Phase 10)
        // ========================================

        #ifdef HAS_AVDECC
        .def("get_avdecc_entities", [](const Map2AudioEngine& self) {
            py::list entities;

            auto* avdecc = self.getAvdeccController();
            if (!avdecc) {
                return entities;  // Empty list if AVDECC not initialized
            }

            auto discovered = avdecc->getDiscoveredEntities();
            for (const auto& entity : discovered) {
                entities.append(avdeccEntityToDict(entity));
            }

            return entities;
        }, "Get list of discovered AVDECC entities")

        .def("get_avdecc_entity_model", [](const Map2AudioEngine& self, uint64_t entity_id) -> py::object {
            auto* avdecc = self.getAvdeccController();
            if (!avdecc) {
                return py::none();
            }

            auto json_opt = avdecc->getEntityModelJson(entity_id);
            if (!json_opt.has_value() || json_opt->empty()) {
                return py::none();
            }

            py::module_ json_module = py::module_::import("json");
            return json_module.attr("loads")(json_opt.value());
        }, py::arg("entity_id"),
           "Get complete entity model as JSON dict")

        // ========================================
        // AVDECC ACMP Methods (Phase 11)
        // ========================================

        .def("connect_stream", [](Map2AudioEngine& self,
                                  uint64_t talker_entity_id,
                                  uint16_t talker_stream_index,
                                  uint64_t listener_entity_id,
                                  uint16_t listener_stream_index) -> bool {
            auto* avdecc = self.getAvdeccController();
            if (!avdecc) return false;

            return avdecc->connectStream(
                talker_entity_id,
                talker_stream_index,
                listener_entity_id,
                listener_stream_index
            );
        }, py::arg("talker_entity_id"), py::arg("talker_stream_index"),
           py::arg("listener_entity_id"), py::arg("listener_stream_index"),
           "Connect AVTP stream via ACMP CONNECT_TX_COMMAND")

        .def("disconnect_stream", [](Map2AudioEngine& self,
                                     uint64_t talker_entity_id,
                                     uint16_t talker_stream_index,
                                     uint64_t listener_entity_id,
                                     uint16_t listener_stream_index) -> bool {
            auto* avdecc = self.getAvdeccController();
            if (!avdecc) return false;

            return avdecc->disconnectStream(
                talker_entity_id,
                talker_stream_index,
                listener_entity_id,
                listener_stream_index
            );
        }, py::arg("talker_entity_id"), py::arg("talker_stream_index"),
           py::arg("listener_entity_id"), py::arg("listener_stream_index"),
           "Disconnect AVTP stream via ACMP DISCONNECT_TX_COMMAND")

        .def("get_active_connections", [](const Map2AudioEngine& self) -> py::list {
            auto* avdecc = self.getAvdeccController();
            if (!avdecc) return py::list();

            py::list connections;
            auto active = avdecc->getActiveConnections();

            for (const auto& conn : active) {
                py::dict d;
                d["talker_entity_id"] = py::str(
                    juce::String::toHexString((int64_t)conn.talker_entity_id).toStdString());
                d["talker_unique_id"] = conn.talker_unique_id;
                d["listener_entity_id"] = py::str(
                    juce::String::toHexString((int64_t)conn.listener_entity_id).toStdString());
                d["listener_unique_id"] = conn.listener_unique_id;
                d["connected"] = conn.connected;
                d["stream_vlan_id"] = conn.stream_vlan_id;
                d["stream_id"] = py::str(
                    juce::String::toHexString((int64_t)conn.stream_id).toStdString());

                // Format dest MAC as string
                char mac_str[18];
                std::snprintf(mac_str, sizeof(mac_str), "%02x:%02x:%02x:%02x:%02x:%02x",
                    conn.stream_dest_mac[0], conn.stream_dest_mac[1],
                    conn.stream_dest_mac[2], conn.stream_dest_mac[3],
                    conn.stream_dest_mac[4], conn.stream_dest_mac[5]);
                d["stream_dest_mac"] = std::string(mac_str);

                connections.append(d);
            }

            return connections;
        }, "Get list of active ACMP stream connections")

        .def("get_stream_format", [](Map2AudioEngine& self,
                                     uint64_t entity_id,
                                     uint16_t stream_index,
                                     const std::string& direction,
                                     uint16_t configuration_index) -> py::dict {
            Map2Audio::StreamFormatOperationResult result;
            result.success = false;
            result.status = Map2Audio::AecpAemStatus::NOT_SUPPORTED;
            result.stream_format = 0;
            result.message = "avdecc_unavailable";

            auto* avdecc = self.getAvdeccController();
            if (!avdecc) {
                return streamFormatResultToDict(result);
            }

            auto descriptor_type = parseStreamDescriptorDirection(direction);
            if (!descriptor_type.has_value()) {
                result.status = Map2Audio::AecpAemStatus::BAD_ARGUMENTS;
                result.message = "invalid_direction";
                return streamFormatResultToDict(result);
            }

            result = avdecc->getStreamFormat(
                entity_id,
                *descriptor_type,
                stream_index,
                configuration_index);
            return streamFormatResultToDict(result);
        }, py::arg("entity_id"),
           py::arg("stream_index"),
           py::arg("direction"),
           py::arg("configuration_index") = 0,
           "Get AVDECC stream format via AECP GET_STREAM_FORMAT")

        .def("set_stream_format", [](Map2AudioEngine& self,
                                     uint64_t entity_id,
                                     uint16_t stream_index,
                                     const std::string& direction,
                                     uint64_t stream_format,
                                     uint16_t configuration_index) -> py::dict {
            Map2Audio::StreamFormatOperationResult result;
            result.success = false;
            result.status = Map2Audio::AecpAemStatus::NOT_SUPPORTED;
            result.stream_format = stream_format;
            result.message = "avdecc_unavailable";

            auto* avdecc = self.getAvdeccController();
            if (!avdecc) {
                return streamFormatResultToDict(result);
            }

            auto descriptor_type = parseStreamDescriptorDirection(direction);
            if (!descriptor_type.has_value()) {
                result.status = Map2Audio::AecpAemStatus::BAD_ARGUMENTS;
                result.message = "invalid_direction";
                return streamFormatResultToDict(result);
            }

            result = avdecc->setStreamFormat(
                entity_id,
                *descriptor_type,
                stream_index,
                stream_format,
                configuration_index);
            return streamFormatResultToDict(result);
        }, py::arg("entity_id"),
           py::arg("stream_index"),
           py::arg("direction"),
           py::arg("stream_format"),
           py::arg("configuration_index") = 0,
           "Set AVDECC stream format via AECP SET_STREAM_FORMAT")
        #endif

        // ========================================
        // T2507-5b — Multi-Track Recorder bindings
        // ========================================
        // Bridges the Python RecorderService (cycle 5 of the parent
        // autonomous Continue run) into the live engine. The Python
        // service owns session ids + state-machine semantics; these
        // bindings are the thin executor pass-through.

        .def("recorder_arm_session",
             [](Map2AudioEngine& self,
                const std::string& session_id,
                const std::string& parent_dir,
                double sample_rate,
                int num_channels) -> bool {
                 auto* svc = self.recorderService();
                 if (svc == nullptr) return false;
                 return svc->armSession(session_id,
                                        std::filesystem::path(parent_dir),
                                        sample_rate,
                                        num_channels);
             },
             py::arg("session_id"),
             py::arg("parent_dir"),
             py::arg("sample_rate") = 48000.0,
             py::arg("num_channels") = 2,
             "Arm a recorder session. Opens <parent_dir>/<session_id>/{pre.wav,"
             " post.wav}, initialises io_uring, spawns the writer thread,"
             " and arms the engine recorder. Returns false on any failure"
             " (already-active session, FS error, kernel < 6.10).")

        .def("recorder_stop_session",
             [](Map2AudioEngine& self) -> py::dict {
                 auto* svc = self.recorderService();
                 py::dict d;
                 if (svc == nullptr) {
                     d["active"] = false;
                     return d;
                 }
                 const auto status = svc->stopSession();
                 d["active"]                  = status.active;
                 d["session_id"]              = status.sessionId;
                 d["session_dir"]             = status.sessionDir.string();
                 d["total_samples"]           = status.totalSamplesProcessed;
                 d["channel_overflow_count"]  = status.channelOverflowCount;
                 d["pre_ring_overflow_count"] = status.preRingOverflowCount;
                 d["post_ring_overflow_count"] = status.postRingOverflowCount;
                 d["armed_at_iso"]            = status.armedAtIso;
                 py::dict pre, post;
                 pre["path"]              = status.preStats.path;
                 pre["frames_written"]    = status.preStats.framesWritten;
                 pre["bytes_written"]     = status.preStats.bytesWritten;
                 pre["iouring_submits"]   = status.preStats.ioUringSubmits;
                 pre["iouring_failures"]  = status.preStats.ioUringFailures;
                 post["path"]             = status.postStats.path;
                 post["frames_written"]   = status.postStats.framesWritten;
                 post["bytes_written"]    = status.postStats.bytesWritten;
                 post["iouring_submits"]  = status.postStats.ioUringSubmits;
                 post["iouring_failures"] = status.postStats.ioUringFailures;
                 d["pre"]  = pre;
                 d["post"] = post;
                 // T2507-6 — surface automation.jsonl stats.
                 py::dict autom;
                 autom["path"]            = status.automationStats.path;
                 autom["entries_written"] = status.automationStats.entriesWritten;
                 autom["bytes_written"]   = status.automationStats.bytesWritten;
                 autom["iouring_failures"] = status.automationStats.ioUringFailures;
                 d["automation"] = autom;
                 return d;
             },
             "Stop the active session. Drains the rings, finalises WAV"
             " headers, releases io_uring + file descriptors. Returns the"
             " final stat snapshot (active=false on success).")

        .def("recorder_get_status",
             [](const Map2AudioEngine& self) -> py::dict {
                 // recorderService() is non-const; const_cast is OK
                 // because getStatus() is logically const and acquires
                 // its own mutex.
                 auto* svc = const_cast<Map2AudioEngine&>(self).recorderService();
                 py::dict d;
                 if (svc == nullptr) {
                     d["active"] = false;
                     return d;
                 }
                 const auto status = svc->getStatus();
                 d["active"]                  = status.active;
                 d["session_id"]              = status.sessionId;
                 d["session_dir"]             = status.sessionDir.string();
                 d["total_samples"]           = status.totalSamplesProcessed;
                 d["channel_overflow_count"]  = status.channelOverflowCount;
                 d["pre_ring_overflow_count"] = status.preRingOverflowCount;
                 d["post_ring_overflow_count"] = status.postRingOverflowCount;
                 d["armed_at_iso"]            = status.armedAtIso;
                 return d;
             },
             "Snapshot of the current recorder session (or active=false).")

        // ========================================
        // T2512 — Multi-track looper bindings
        // ========================================

        .def("looper_record",
             [](Map2AudioEngine& self, int track) {
                 if (auto* l = self.looperEngine()) l->recordStomp(track);
             },
             py::arg("track"),
             "Record stomp — empty→record, record→play, play→overdub, overdub→play, stopped→play.")
        .def("looper_stop",
             [](Map2AudioEngine& self, int track) {
                 if (auto* l = self.looperEngine()) l->stopStomp(track);
             },
             py::arg("track"),
             "Stop or resume playback for the track.")
        .def("looper_clear",
             [](Map2AudioEngine& self, int track) {
                 if (auto* l = self.looperEngine()) l->clearStomp(track);
             },
             py::arg("track"),
             "Clear the track entirely.")
        .def("looper_undo",
             [](Map2AudioEngine& self, int track) {
                 if (auto* l = self.looperEngine()) l->undoStomp(track);
             },
             py::arg("track"))
        .def("looper_redo",
             [](Map2AudioEngine& self, int track) {
                 if (auto* l = self.looperEngine()) l->redoStomp(track);
             },
             py::arg("track"))
        .def("looper_set_level_db",
             [](Map2AudioEngine& self, int track, float db) {
                 if (auto* l = self.looperEngine()) l->setTrackLevelDb(track, db);
             },
             py::arg("track"), py::arg("db"))
        .def("looper_set_muted",
             [](Map2AudioEngine& self, int track, bool muted) {
                 if (auto* l = self.looperEngine()) l->setTrackMuted(track, muted);
             },
             py::arg("track"), py::arg("muted"))
        .def("looper_set_soloed",
             [](Map2AudioEngine& self, int track, bool soloed) {
                 if (auto* l = self.looperEngine()) l->setTrackSoloed(track, soloed);
             },
             py::arg("track"), py::arg("soloed"))
        .def("looper_set_reverse",
             [](Map2AudioEngine& self, int track, bool reverse) {
                 if (auto* l = self.looperEngine()) l->setTrackReverse(track, reverse);
             },
             py::arg("track"), py::arg("reverse"))
        .def("looper_set_half_speed",
             [](Map2AudioEngine& self, int track, bool half) {
                 if (auto* l = self.looperEngine()) l->setTrackHalfSpeed(track, half);
             },
             py::arg("track"), py::arg("half"))
        .def("looper_set_master_level_db",
             [](Map2AudioEngine& self, float db) {
                 if (auto* l = self.looperEngine()) l->setMasterLevelDb(db);
             },
             py::arg("db"))
        .def("looper_get_status",
             [](Map2AudioEngine& self) -> py::dict {
                 auto* l = self.looperEngine();
                 py::dict out;
                 if (l == nullptr) {
                     out["active_track_count"] = 0;
                     out["tracks"]             = py::list();
                     return out;
                 }
                 const auto status = l->getStatus();
                 out["active_track_count"] = status.activeTrackCount;
                 out["sync_master"]        = status.syncMaster;
                 out["master_level_db"]    = status.masterLevelDb;
                 py::list arr;
                 for (const auto& t : status.tracks) {
                     py::dict td;
                     td["track"]              = t.trackIndex;
                     td["state"]              = static_cast<int>(t.state);
                     td["loop_length_frames"] = t.loopLengthFrames;
                     td["playhead_frames"]    = t.playheadFrames;
                     td["layer_count"]        = t.layerCount;
                     td["level_db"]           = t.levelDb;
                     td["muted"]              = t.muted;
                     td["soloed"]             = t.soloed;
                     td["reverse"]            = t.reverse;
                     td["half_speed"]         = t.halfSpeed;
                     arr.append(td);
                 }
                 out["tracks"] = arr;
                 return out;
             },
             "Snapshot of all 4 looper tracks.")
        ;

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

#ifdef HAS_AVB
    // ========================================
    // AVB/TSN Network Audio Bindings
    // ========================================

    m.def("is_avb_available", []() {
        try {
            return getModuleEngine().isAvbAvailable();
        } catch (...) {
            return false;
        }
    }, "Check if AVB/TSN network audio is available");

    m.def("get_avb_device_count", []() {
        try {
            return getModuleEngine().getAvbDeviceCount();
        } catch (...) {
            return 0;
        }
    }, "Get number of available AVB audio devices");

    m.def("get_avb_device_names", []() {
        py::list devices;
        try {
            const auto names = getModuleEngine().getAvbDeviceNames();
            for (const auto& name : names) {
                devices.append(name);
            }
        } catch (...) {
        }
        return devices;
    }, "Get list of available AVB device names");

    m.def("get_avb_stream_stats", [](const std::string& stream_id) {
        std::string error;
        try {
            auto stats = getModuleEngine().getAvbStreamStats(stream_id, &error);
            if (stats) {
                return avbStreamStatsToDict(stream_id, *stats);
            }
        } catch (const std::exception& exc) {
            error = exc.what();
        } catch (...) {
            if (error.empty()) {
                error = "Unknown AVB stream statistics error";
            }
        }

        py::dict stats;
        stats["stream_id"] = stream_id;
        stats["available"] = false;
        stats["error"] = error.empty() ? "Stream not found" : error;
        return stats;
    }, py::arg("stream_id"),
       "Get statistics for specific AVB stream");

    m.def("get_all_avb_stream_stats", []() {
        py::list streams;

        try {
            auto& engine = getModuleEngine();
            const auto streamIds = engine.listAvbStreams();
            for (const auto& streamId : streamIds) {
                std::string error;
                auto stats = engine.getAvbStreamStats(streamId, &error);
                if (stats) {
                    streams.append(avbStreamStatsToDict(streamId, *stats));
                    continue;
                }

                py::dict unavailable;
                unavailable["stream_id"] = streamId;
                unavailable["available"] = false;
                unavailable["error"] = error.empty() ? "Stream not found" : error;
                streams.append(std::move(unavailable));
            }
        } catch (...) {
        }

        return streams;
    }, "Get statistics for all active AVB streams");

    m.def("get_avb_interface_info", [](const std::string& interface_name) {
        py::dict info;
        try {
            const auto ifaceInfo = getModuleEngine().getAvbInterfaceInfo(interface_name);
            info["interface"] = ifaceInfo.interfaceName;
            info["available"] = ifaceInfo.available;
            info["avb_enabled"] = ifaceInfo.avbEnabled;
            info["interface_exists"] = ifaceInfo.interfaceExists;
            info["ptp_ready"] = ifaceInfo.ptpReady;
            info["error"] = ifaceInfo.error;
        } catch (const std::exception& exc) {
            info["interface"] = interface_name;
            info["available"] = false;
            info["avb_enabled"] = false;
            info["interface_exists"] = false;
            info["ptp_ready"] = false;
            info["error"] = std::string(exc.what());
        } catch (...) {
            info["interface"] = interface_name;
            info["available"] = false;
            info["avb_enabled"] = false;
            info["interface_exists"] = false;
            info["ptp_ready"] = false;
            info["error"] = std::string("Unknown AVB interface error");
        }
        return info;
    }, py::arg("interface_name"),
       "Get AVB interface information");

    // ========================================
    // AVDECC Entity Model Bindings (Phase 10)
    // ========================================

    #ifdef HAS_AVDECC
    m.def("is_avdecc_available", []() -> bool {
        try {
            auto* avdecc = getModuleEngine().getAvdeccController();
            return avdecc != nullptr && avdecc->isRunning();
        } catch (...) {
            return false;
        }
    }, "Check if AVDECC is available in this build (compile-time check)");

    m.def("get_avdecc_entities", []() -> py::list {
        py::list entities;
        try {
            auto* avdecc = getModuleEngine().getAvdeccController();
            if (!avdecc) {
                return entities;
            }

            auto discovered = avdecc->getDiscoveredEntities();
            for (const auto& entity : discovered) {
                entities.append(avdeccEntityToDict(entity));
            }
        } catch (...) {
        }

        return entities;
    }, "Get list of discovered AVDECC entities");

    m.def("get_avdecc_entity_model", [](uint64_t entity_id) -> py::object {
        try {
            auto* avdecc = getModuleEngine().getAvdeccController();
            if (!avdecc) {
                return py::none();
            }

            auto json_opt = avdecc->getEntityModelJson(entity_id);
            if (json_opt.has_value() && !json_opt->empty()) {
                py::module_ json_module = py::module_::import("json");
                return json_module.attr("loads")(json_opt.value());
            }
        } catch (...) {
        }

        return py::none();
    }, py::arg("entity_id"),
       "Get complete entity model as JSON dict");

    #else
    // AVDECC not compiled - provide stub functions
    m.def("is_avdecc_available", []() -> bool {
        return false;
    }, "Check if AVDECC is available (always false when USE_AVDECC=OFF)");

    m.def("get_avdecc_entities", []() -> py::list {
        return py::list();
    }, "Get AVDECC entities (always empty when USE_AVDECC=OFF)");

    m.def("get_avdecc_entity_model", [](uint64_t entity_id) -> py::object {
        return py::none();
    }, py::arg("entity_id"),
       "Get entity model (always None when USE_AVDECC=OFF)");

    #endif // HAS_AVDECC

    // ── Tesira AVB Node bindings ──────────────────────────────────────────────
    // All five calls are lock-free atomic stores/loads; safe from Python thread.

    m.def("set_tesira_device_level",
        [](int device_idx, int channel, float level_db) -> bool {
            return getModuleEngine().setTesiraDeviceLevel(device_idx, channel, level_db);
        },
        py::arg("device_idx"), py::arg("channel"), py::arg("level_db"),
        "Set per-channel dB gain for a Tesira device slot (0 dB = unity)");

    m.def("set_tesira_device_mute",
        [](int device_idx, int channel, bool muted) -> bool {
            return getModuleEngine().setTesiraDeviceMute(device_idx, channel, muted);
        },
        py::arg("device_idx"), py::arg("channel"), py::arg("muted"),
        "Mute or unmute a single channel of a Tesira device slot");

    m.def("set_tesira_device_connected",
        [](int device_idx, bool connected) -> bool {
            return getModuleEngine().setTesiraDeviceConnected(device_idx, connected);
        },
        py::arg("device_idx"), py::arg("connected"),
        "Mark a Tesira device slot as connected (true) or disconnected (false)");

    m.def("set_tesira_device_preset",
        [](int device_idx, int preset_index) -> bool {
            return getModuleEngine().setTesiraDevicePreset(device_idx, preset_index);
        },
        py::arg("device_idx"), py::arg("preset_index"),
        "Set the active preset index for a Tesira device slot (-1 = none)");

    m.def("get_tesira_output_level",
        [](int device_idx, int channel) -> float {
            return getModuleEngine().getTesiraOutputLevel(device_idx, channel);
        },
        py::arg("device_idx"), py::arg("channel"),
        "Get the latest peak output level (dBFS) for a Tesira channel; returns -120 if no data");

#endif // HAS_AVB
}
