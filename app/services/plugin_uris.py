from __future__ import annotations

from typing import Any, Dict

JUCE_URI_PREFIX = "map2://juce/"

COMPRESSOR_PLUGIN_URI = "map2://juce/dynamics/compressor"
LIMITER_PLUGIN_URI = "map2://juce/dynamics/limiter"
NOISE_GATE_PLUGIN_URI = "map2://juce/dynamics/gate"

NAM_PLUGIN_URI = "map2://juce/nam"
NAM_CONFIG_PLUGIN_URIS = (NAM_PLUGIN_URI, "urn:map2:nam-player")
NAM_FAMILY_URIS = frozenset(NAM_CONFIG_PLUGIN_URIS)

CABINET_IR_PLUGIN_URI = "map2://juce/convolution/cabinet"
CABINET_IR_CONFIG_PLUGIN_URIS = (CABINET_IR_PLUGIN_URI, "urn:map2:ir-cabinet")
CABINET_IR_FAMILY_URIS = frozenset(CABINET_IR_CONFIG_PLUGIN_URIS)

REVERB_IR_PLUGIN_URI = "map2://juce/convolution/reverb"
REVERB_IR_CONFIG_PLUGIN_URIS = (REVERB_IR_PLUGIN_URI, "urn:map2:ir-reverb")
REVERB_IR_FAMILY_URIS = frozenset(REVERB_IR_CONFIG_PLUGIN_URIS)

SEQUENCER_PLUGIN_URI = "map2://juce/sequencer"
DRUMS_PLUGIN_URI = "map2://juce/drums"
SYNTHFORGE_PLUGIN_URI = "map2://juce/synthforge"

LEXICON_MPX1_URI = "hardware://lexicon-mpx1-spdif"
LEXICON_MPX1_NAME = "Lexicon MPX-1"
LEXICON_MPX1_CATEGORY = "lexicon"


def build_lexicon_mpx1_plugin_descriptor() -> Dict[str, Any]:
    return {
        "uri": LEXICON_MPX1_URI,
        "name": LEXICON_MPX1_NAME,
        "author": "Lexicon / Harman",
        "brand": "Lexicon",
        "category": LEXICON_MPX1_CATEGORY,
        "license": "Proprietary",
        "version": "1.0",
        "format": "Hardware",
        "format_name": "Hardware S/PDIF",
        "class_label": "Hardware Effect",
        "file_path": "",
        "in_ports": 2,
        "out_ports": 2,
        "audio_inputs": 2,
        "audio_outputs": 2,
        "has_ui": False,
        "has_midi_input": True,
        "has_midi_output": True,
        "latency_samples": 0,
        "parameters": [],
        "ports": [],
        "priority": 1,
        "is_hardware": True,
    }
