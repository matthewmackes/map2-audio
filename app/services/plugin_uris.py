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

# T2517 — connection-agnostic canonical URI. The legacy S/PDIF-specific URI is
# kept as an alias so snapshots that reference it continue to resolve.
LEXICON_MPX1_URI = "hardware://lexicon-mpx1"
LEXICON_MPX1_URI_LEGACY_SPDIF = "hardware://lexicon-mpx1-spdif"
LEXICON_MPX1_NAME = "Lexicon MPX-1"
LEXICON_MPX1_CATEGORY = "hardware-fx"
LEXICON_MPX1_BRAND_CATEGORY = "lexicon"


def build_lexicon_mpx1_plugin_descriptor() -> Dict[str, Any]:
    """Return the full Lexicon MPX-1 plugin descriptor.

    T2517 added connection-type metadata + singleton flag + interface
    capability requirements so the effects chooser can render the entry with
    availability gating and an AES/S/PDIF connection picker.
    """
    return {
        "uri": LEXICON_MPX1_URI,
        "aliases": [LEXICON_MPX1_URI_LEGACY_SPDIF],
        "name": LEXICON_MPX1_NAME,
        "author": "Lexicon / Harman",
        "brand": "Lexicon",
        "category": LEXICON_MPX1_CATEGORY,
        "brand_category": LEXICON_MPX1_BRAND_CATEGORY,
        "license": "Proprietary",
        "version": "1.0",
        "format": "Hardware",
        "format_name": "Hardware FX bridge (AES/EBU or S/PDIF)",
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
        # T2517 — only one physical MPX-1 exists per rig; chooser enforces.
        "singleton": True,
        # T2517 — both connection types supported per-instance; AES preferred
        # when an AES-capable interface is connected; falls back to S/PDIF.
        "connection_types": ["aes_ebu", "spdif_coax"],
        "preferred_connection": "aes_ebu",
        # T2517 — chooser availability gating. The descriptor only enables
        # insertion if at least one connected interface declares this
        # capability tag in its device-pack profile.
        "requires_interface_capability": ["digital_io_stereo"],
    }
