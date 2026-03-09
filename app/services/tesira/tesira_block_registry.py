"""
Versioned Tesira block registry.

Provides a shared source of block-family definitions for MAP2-native design
workspace palette and runtime DSP probe profiles.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List


_DEFAULT_PROFILE = "forte_ci_v1"


def _param(value_type: str, unit: str = "", min_value: float | None = None, max_value: float | None = None, step: float | None = None, indexed: bool = True) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "value_type": value_type,
        "unit": unit,
        "indexed": indexed,
    }
    if min_value is not None:
        payload["min_value"] = min_value
    if max_value is not None:
        payload["max_value"] = max_value
    if step is not None:
        payload["step"] = step
    return payload


def _audio_io(inputs: int, outputs: int, channels: int = 1) -> Dict[str, Any]:
    return {
        "inputs": [{"name": "in", "domain": "audio", "channels": channels}] if inputs else [],
        "outputs": [{"name": "out", "domain": "audio", "channels": channels}] if outputs else [],
    }


def _control_io(inputs: int = 1, outputs: int = 1) -> Dict[str, Any]:
    return {
        "inputs": [{"name": "in", "domain": "control", "channels": inputs}] if inputs else [],
        "outputs": [{"name": "out", "domain": "control", "channels": outputs}] if outputs else [],
    }


_REGISTRY: Dict[str, Dict[str, Any]] = {
    _DEFAULT_PROFILE: {
        "profile": _DEFAULT_PROFILE,
        "label": "Tesira Forte CI default profile",
        "blocks": [
            {
                "block_type": "AudioInput",
                "title": "Audio Input",
                "category": "io",
                "probe": None,
                "io": _audio_io(inputs=0, outputs=1, channels=1),
                "parameter_map": {
                    "gain": _param("FLOAT", "dB", -100.0, 20.0, 0.1, indexed=False),
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "input"},
            },
            {
                "block_type": "AudioOutput",
                "title": "Audio Output",
                "category": "io",
                "probe": None,
                "io": _audio_io(inputs=1, outputs=0, channels=1),
                "parameter_map": {
                    "gain": _param("FLOAT", "dB", -100.0, 20.0, 0.1, indexed=False),
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "output"},
            },
            {
                "block_type": "LevelControl",
                "title": "Level Control",
                "category": "gain",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "LEVEL",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "level": _param("FLOAT", "dB", -100.0, 20.0, 0.1),
                    "mute": _param("BOOL"),
                },
                "editor": {"family": "level"},
            },
            {
                "block_type": "LevelMeter",
                "title": "Level Meter",
                "category": "metering",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "METER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "level": _param("FLOAT", "dBu", -120.0, 24.0, 0.1),
                    "peak": _param("FLOAT", "dBu", -120.0, 24.0, 0.1),
                },
                "editor": {"family": "meter"},
            },
            {
                "block_type": "Mixer",
                "title": "Mixer",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputChannels",
                    "default_channels": 8,
                    "runtime_block_type": "MIXER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=8),
                "parameter_map": {
                    "crosspointLevelOut": _param("FLOAT", "dB", -100.0, 20.0, 0.1),
                    "crosspointMute": _param("BOOL"),
                },
                "editor": {"family": "matrix"},
            },
            {
                "block_type": "MatrixMixer",
                "title": "Matrix Mixer",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputChannels",
                    "default_channels": 12,
                    "runtime_block_type": "MATRIX",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=12),
                "parameter_map": {
                    "crosspointLevelOut": _param("FLOAT", "dB", -100.0, 20.0, 0.1),
                    "crosspointMute": _param("BOOL"),
                },
                "editor": {"family": "matrix"},
            },
            {
                "block_type": "Router",
                "title": "Router",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputs",
                    "default_channels": 8,
                    "runtime_block_type": "ROUTER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=8),
                "parameter_map": {
                    "crosspointLevelOut": _param("FLOAT", "dB", -100.0, 20.0, 0.1),
                    "crosspointMute": _param("BOOL"),
                },
                "editor": {"family": "router"},
            },
            {
                "block_type": "PEQ",
                "title": "Parametric EQ",
                "category": "eq",
                "probe": {
                    "probe_attribute": "numBands",
                    "default_channels": 8,
                    "runtime_block_type": "PEQ",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "eqBandFrequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "eqBandGain": _param("FLOAT", "dB", -24.0, 24.0, 0.1),
                    "eqBandQ": _param("FLOAT", "", 0.1, 20.0, 0.1),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "eq"},
            },
            {
                "block_type": "GraphicEQ",
                "title": "Graphic EQ",
                "category": "eq",
                "probe": {
                    "probe_attribute": "numBands",
                    "default_channels": 31,
                    "runtime_block_type": "GEQ",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "bandGain": _param("FLOAT", "dB", -24.0, 12.0, 0.5),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "eq"},
            },
            {
                "block_type": "Compressor",
                "title": "Compressor",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "COMPRESSOR",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "threshold": _param("FLOAT", "dB", -60.0, 0.0, 0.1),
                    "ratio": _param("FLOAT", "", 1.0, 20.0, 0.1),
                    "attack": _param("FLOAT", "ms", 0.1, 500.0, 0.1),
                    "release": _param("FLOAT", "ms", 1.0, 2000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "Limiter",
                "title": "Limiter",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "LIMITER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "threshold": _param("FLOAT", "dB", -20.0, 20.0, 0.1),
                    "attack": _param("FLOAT", "ms", 0.05, 100.0, 0.05),
                    "release": _param("FLOAT", "ms", 1.0, 1000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "NoiseGate",
                "title": "Noise Gate",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "NOISE_GATE",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "threshold": _param("FLOAT", "dB", -80.0, 0.0, 0.1),
                    "range": _param("FLOAT", "dB", -80.0, 0.0, 0.1),
                    "attack": _param("FLOAT", "ms", 0.1, 500.0, 0.1),
                    "release": _param("FLOAT", "ms", 1.0, 2000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "AGC",
                "title": "AGC",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "AGC",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "targetLevel": _param("FLOAT", "dB", -40.0, 0.0, 0.1),
                    "maxGain": _param("FLOAT", "dB", 0.0, 30.0, 0.1),
                    "attack": _param("FLOAT", "ms", 1.0, 2000.0, 1.0),
                    "release": _param("FLOAT", "ms", 10.0, 5000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "Delay",
                "title": "Delay",
                "category": "time",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "DELAY",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "delay": _param("FLOAT", "ms", 0.0, 2000.0, 0.1),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "time"},
            },
            {
                "block_type": "Ducker",
                "title": "Ducker",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "DUCKER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "depth": _param("FLOAT", "dB", -40.0, 0.0, 0.1),
                    "threshold": _param("FLOAT", "dB", -60.0, 0.0, 0.1),
                    "attack": _param("FLOAT", "ms", 0.1, 1000.0, 0.1),
                    "release": _param("FLOAT", "ms", 1.0, 5000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "SourceSelector",
                "title": "Source Selector",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputs",
                    "default_channels": 8,
                    "runtime_block_type": "SELECTOR",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "sourceSelection": _param("INT", "", 1.0, 64.0, 1.0, indexed=False),
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "selector"},
            },
            {
                "block_type": "Crossover",
                "title": "Crossover",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numBands",
                    "default_channels": 2,
                    "runtime_block_type": "CROSSOVER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=2),
                "parameter_map": {
                    "crossoverFrequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "slope": _param("INT", "dB/oct", 6.0, 48.0, 6.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "AECInput",
                "title": "AEC Input",
                "category": "aec",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "AEC",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "aecBypass": _param("BOOL"),
                    "nlpEnable": _param("BOOL"),
                },
                "editor": {"family": "aec"},
            },
            {
                "block_type": "AECReference",
                "title": "AEC Reference",
                "category": "aec",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "AEC_REF",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "referenceGain": _param("FLOAT", "dB", -24.0, 24.0, 0.1),
                },
                "editor": {"family": "aec"},
            },
            {
                "block_type": "LogicState",
                "title": "Logic State",
                "category": "control",
                "probe": {
                    "probe_attribute": "state",
                    "default_channels": 1,
                    "runtime_block_type": "GPIO",
                },
                "io": _control_io(1, 1),
                "parameter_map": {
                    "state": _param("BOOL"),
                },
                "editor": {"family": "logic"},
            },
            {
                "block_type": "LogicMeter",
                "title": "Logic Meter",
                "category": "control",
                "probe": {
                    "probe_attribute": "state",
                    "default_channels": 1,
                    "runtime_block_type": "LOGIC_METER",
                },
                "io": _control_io(1, 1),
                "parameter_map": {
                    "state": _param("BOOL"),
                },
                "editor": {"family": "logic"},
            },
            {
                "block_type": "ExplicitAVBInStream",
                "title": "AVB Input Stream",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 8,
                    "runtime_block_type": "AVB_STREAM_IN",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=8),
                "parameter_map": {
                    "streamEnabled": _param("BOOL", indexed=False),
                    "latency": _param("FLOAT", "ms", 0.0, 20.0, 0.1, indexed=False),
                },
                "editor": {"family": "stream"},
            },
            {
                "block_type": "ExplicitAVBOutStream",
                "title": "AVB Output Stream",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 8,
                    "runtime_block_type": "AVB_STREAM_OUT",
                },
                "io": _audio_io(inputs=1, outputs=0, channels=8),
                "parameter_map": {
                    "streamEnabled": _param("BOOL", indexed=False),
                    "latency": _param("FLOAT", "ms", 0.0, 20.0, 0.1, indexed=False),
                },
                "editor": {"family": "stream"},
            },
            {
                "block_type": "USBInput",
                "title": "USB Input",
                "category": "io",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 2,
                    "runtime_block_type": "USB_IN",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=2),
                "parameter_map": {
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "input"},
            },
            {
                "block_type": "USBOutput",
                "title": "USB Output",
                "category": "io",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 2,
                    "runtime_block_type": "USB_OUT",
                },
                "io": _audio_io(inputs=1, outputs=0, channels=2),
                "parameter_map": {
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "output"},
            },
            {
                "block_type": "ToneGenerator",
                "title": "Tone Generator",
                "category": "generator",
                "probe": {
                    "probe_attribute": "frequency",
                    "default_channels": 1,
                    "runtime_block_type": "GENERATOR",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0, indexed=False),
                    "level": _param("FLOAT", "dB", -80.0, 0.0, 0.1, indexed=False),
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "generator"},
            },
            {
                "block_type": "NoiseGenerator",
                "title": "Noise Generator",
                "category": "generator",
                "probe": {
                    "probe_attribute": "level",
                    "default_channels": 1,
                    "runtime_block_type": "GENERATOR",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=1),
                "parameter_map": {
                    "level": _param("FLOAT", "dB", -80.0, 0.0, 0.1, indexed=False),
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "generator"},
            },
            {
                "block_type": "VoIPInput",
                "title": "VoIP Input",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "VOIP_IN",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=1),
                "parameter_map": {
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "network"},
            },
            {
                "block_type": "VoIPOutput",
                "title": "VoIP Output",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "VOIP_OUT",
                },
                "io": _audio_io(inputs=1, outputs=0, channels=1),
                "parameter_map": {
                    "mute": _param("BOOL", indexed=False),
                },
                "editor": {"family": "network"},
            },
            {
                "block_type": "HighPassFilter",
                "title": "High Pass Filter",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "HPF",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "slope": _param("INT", "dB/oct", 6.0, 48.0, 6.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "LowPassFilter",
                "title": "Low Pass Filter",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "LPF",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "slope": _param("INT", "dB/oct", 6.0, 48.0, 6.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "BandPassFilter",
                "title": "Band Pass Filter",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "BPF",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "q": _param("FLOAT", "", 0.1, 20.0, 0.1),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "NotchFilter",
                "title": "Notch Filter",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "NOTCH",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 20.0, 20000.0, 1.0),
                    "q": _param("FLOAT", "", 0.1, 20.0, 0.1),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "FIRFilter",
                "title": "FIR Filter",
                "category": "filter",
                "probe": {
                    "probe_attribute": "numTaps",
                    "default_channels": 256,
                    "runtime_block_type": "FIR",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "preset": _param("STRING", indexed=False),
                    "latency": _param("FLOAT", "ms", 0.0, 200.0, 0.1, indexed=False),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "filter"},
            },
            {
                "block_type": "AutomaticMixer",
                "title": "Automatic Mixer",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputChannels",
                    "default_channels": 8,
                    "runtime_block_type": "AUTO_MIXER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=8),
                "parameter_map": {
                    "nomAttenuation": _param("FLOAT", "dB", -30.0, 0.0, 0.1),
                    "priority": _param("INT", "", 1.0, 16.0, 1.0),
                    "gateOpen": _param("BOOL"),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "matrix"},
            },
            {
                "block_type": "FeedbackSuppressor",
                "title": "Feedback Suppressor",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numFilters",
                    "default_channels": 8,
                    "runtime_block_type": "AFS",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "fixedFilters": _param("INT", "", 0.0, 16.0, 1.0, indexed=False),
                    "liveFilters": _param("INT", "", 0.0, 16.0, 1.0, indexed=False),
                    "resetFilters": _param("BOOL", indexed=False),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "Expander",
                "title": "Expander",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "EXPANDER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "threshold": _param("FLOAT", "dB", -80.0, 0.0, 0.1),
                    "ratio": _param("FLOAT", "", 1.0, 20.0, 0.1),
                    "attack": _param("FLOAT", "ms", 0.1, 500.0, 0.1),
                    "release": _param("FLOAT", "ms", 1.0, 2000.0, 1.0),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "DeEsser",
                "title": "De-Esser",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "DEESSER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "frequency": _param("FLOAT", "Hz", 1000.0, 12000.0, 1.0),
                    "threshold": _param("FLOAT", "dB", -60.0, 0.0, 0.1),
                    "depth": _param("FLOAT", "dB", 0.0, 24.0, 0.1),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "RmsMeter",
                "title": "RMS Meter",
                "category": "metering",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "RMS_METER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "rms": _param("FLOAT", "dBu", -120.0, 24.0, 0.1),
                    "peak": _param("FLOAT", "dBu", -120.0, 24.0, 0.1),
                },
                "editor": {"family": "meter"},
            },
            {
                "block_type": "PeakHoldMeter",
                "title": "Peak Hold Meter",
                "category": "metering",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "PEAK_METER",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "peak": _param("FLOAT", "dBu", -120.0, 24.0, 0.1),
                    "holdTime": _param("FLOAT", "ms", 10.0, 10000.0, 1.0),
                    "resetHold": _param("BOOL"),
                },
                "editor": {"family": "meter"},
            },
            {
                "block_type": "AudioDelayMatrix",
                "title": "Audio Delay Matrix",
                "category": "routing",
                "probe": {
                    "probe_attribute": "numInputChannels",
                    "default_channels": 8,
                    "runtime_block_type": "DELAY_MATRIX",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=8),
                "parameter_map": {
                    "crosspointLevelOut": _param("FLOAT", "dB", -100.0, 20.0, 0.1),
                    "crosspointMute": _param("BOOL"),
                    "crosspointDelay": _param("FLOAT", "ms", 0.0, 2000.0, 0.1),
                },
                "editor": {"family": "matrix"},
            },
            {
                "block_type": "Aes67Input",
                "title": "AES67 Input",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 8,
                    "runtime_block_type": "AES67_IN",
                },
                "io": _audio_io(inputs=0, outputs=1, channels=8),
                "parameter_map": {
                    "streamEnabled": _param("BOOL", indexed=False),
                    "packetTime": _param("FLOAT", "ms", 0.125, 4.0, 0.125, indexed=False),
                },
                "editor": {"family": "stream"},
            },
            {
                "block_type": "Aes67Output",
                "title": "AES67 Output",
                "category": "network",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 8,
                    "runtime_block_type": "AES67_OUT",
                },
                "io": _audio_io(inputs=1, outputs=0, channels=8),
                "parameter_map": {
                    "streamEnabled": _param("BOOL", indexed=False),
                    "packetTime": _param("FLOAT", "ms", 0.125, 4.0, 0.125, indexed=False),
                },
                "editor": {"family": "stream"},
            },
            {
                "block_type": "GpioOutput",
                "title": "GPIO Output",
                "category": "control",
                "probe": {
                    "probe_attribute": "state",
                    "default_channels": 1,
                    "runtime_block_type": "GPIO_OUT",
                },
                "io": _control_io(1, 0),
                "parameter_map": {
                    "state": _param("BOOL", indexed=False),
                },
                "editor": {"family": "logic"},
            },
            {
                "block_type": "TimerControl",
                "title": "Timer Control",
                "category": "control",
                "probe": {
                    "probe_attribute": "period",
                    "default_channels": 1,
                    "runtime_block_type": "TIMER",
                },
                "io": _control_io(1, 1),
                "parameter_map": {
                    "period": _param("FLOAT", "ms", 1.0, 60000.0, 1.0, indexed=False),
                    "running": _param("BOOL", indexed=False),
                    "pulseWidth": _param("FLOAT", "ms", 1.0, 10000.0, 1.0, indexed=False),
                },
                "editor": {"family": "logic"},
            },
            {
                "block_type": "BooleanLogic",
                "title": "Boolean Logic",
                "category": "control",
                "probe": {
                    "probe_attribute": "state",
                    "default_channels": 1,
                    "runtime_block_type": "LOGIC",
                },
                "io": _control_io(2, 1),
                "parameter_map": {
                    "mode": _param("STRING", indexed=False),
                    "state": _param("BOOL", indexed=False),
                },
                "editor": {"family": "logic"},
            },
            {
                "block_type": "LoudnessCompensation",
                "title": "Loudness Compensation",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "LOUDNESS",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "targetSpl": _param("FLOAT", "dB", 60.0, 100.0, 0.1, indexed=False),
                    "intensity": _param("FLOAT", "%", 0.0, 100.0, 1.0, indexed=False),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
            {
                "block_type": "AmbientNoiseCompensator",
                "title": "Ambient Noise Compensator",
                "category": "dynamics",
                "probe": {
                    "probe_attribute": "numChannels",
                    "default_channels": 1,
                    "runtime_block_type": "ANC",
                },
                "io": _audio_io(inputs=1, outputs=1, channels=1),
                "parameter_map": {
                    "targetLevel": _param("FLOAT", "dB", -40.0, 0.0, 0.1, indexed=False),
                    "maxBoost": _param("FLOAT", "dB", 0.0, 20.0, 0.1, indexed=False),
                    "bypass": _param("BOOL"),
                },
                "editor": {"family": "dynamics"},
            },
        ],
    }
}


def get_profile(profile: str | None = None) -> Dict[str, Any]:
    selected = profile or _DEFAULT_PROFILE
    if selected not in _REGISTRY:
        raise ValueError(f"Unknown Tesira block registry profile '{selected}'")
    return deepcopy(_REGISTRY[selected])


def list_blocks(profile: str | None = None) -> List[Dict[str, Any]]:
    return list(get_profile(profile)["blocks"])


def list_probe_profiles(profile: str | None = None) -> Dict[str, Dict[str, Any]]:
    blocks = list_blocks(profile)
    result: Dict[str, Dict[str, Any]] = {}
    for block in blocks:
        probe = block.get("probe")
        if not isinstance(probe, dict):
            continue
        prefix = str(block.get("block_type", "")).strip()
        if not prefix:
            continue
        result[prefix] = {
            "block_type": str(probe.get("runtime_block_type", prefix)).strip() or prefix,
            "probe_attribute": str(probe.get("probe_attribute", "numChannels")).strip() or "numChannels",
            "default_channels": int(probe.get("default_channels", 1) or 1),
            "parameter_map": dict(block.get("parameter_map") or {}),
            "editor": dict(block.get("editor") or {}),
            "category": str(block.get("category", "processing")),
            "title": str(block.get("title", prefix)),
        }
    return result


def list_profiles() -> List[str]:
    return sorted(_REGISTRY.keys())
