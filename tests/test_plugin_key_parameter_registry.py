from app.routes import plugins
from app.services.plugin_key_parameter_registry import (
    attach_plugin_key_parameter_metadata,
    resolve_plugin_key_parameter,
)


def test_resolve_plugin_key_parameter_prefers_common_effect_family_defaults():
    cases = [
        (
            {
                "uri": "map2://juce/delay",
                "name": "Stereo Delay",
                "category": "Delay",
                "parameters": [
                    {"index": 0, "name": "Delay L", "symbol": "delay_time_l"},
                    {"index": 1, "name": "Feedback", "symbol": "feedback"},
                    {"index": 2, "name": "Mix", "symbol": "mix"},
                ],
            },
            ("delay", "feedback"),
        ),
        (
            {
                "uri": "urn:test:plate",
                "name": "Plate Verb",
                "category": "Reverb",
                "parameters": [
                    {"index": 0, "name": "Decay", "symbol": "decay"},
                    {"index": 1, "name": "Mix", "symbol": "mix"},
                    {"index": 2, "name": "Bypass", "symbol": "bypass"},
                ],
            },
            ("reverb", "mix"),
        ),
        (
            {
                "uri": "urn:test:drive",
                "name": "Crunch Drive",
                "category": "Distortion",
                "parameters": [
                    {"index": 0, "name": "Tone", "symbol": "tone"},
                    {"index": 1, "name": "Drive", "symbol": "drive"},
                    {"index": 2, "name": "Level", "symbol": "level"},
                ],
            },
            ("gain", "drive"),
        ),
        (
            {
                "uri": "map2://juce/modulation/phaser",
                "name": "Stage Phaser",
                "category": "Modulation",
                "parameters": [
                    {"index": 0, "name": "Rate", "symbol": "rate"},
                    {"index": 1, "name": "Depth", "symbol": "depth"},
                    {"index": 2, "name": "Mix", "symbol": "mix"},
                ],
            },
            ("modulation", "depth"),
        ),
    ]

    for plugin, (expected_family, expected_symbol) in cases:
        resolved = resolve_plugin_key_parameter(plugin)
        assert resolved is not None
        assert resolved.family == expected_family
        assert resolved.parameter_symbol == expected_symbol
        assert resolved.selection_strategy == "family_override"


def test_resolve_plugin_key_parameter_falls_back_to_first_meaningful_parameter():
    resolved = resolve_plugin_key_parameter(
        {
            "uri": "urn:test:utility",
            "name": "Utility Widget",
            "category": "Utility",
            "parameters": [
                {"index": 0, "name": "Program", "symbol": "program"},
                {"index": 1, "name": "Wet Level", "symbol": "wet_level"},
                {"index": 2, "name": "Bypass", "symbol": "bypass"},
            ],
        }
    )

    assert resolved is not None
    assert resolved.family == "generic"
    assert resolved.parameter_symbol == "wet_level"
    assert resolved.selection_strategy == "first_usable_parameter"


def test_attach_plugin_key_parameter_metadata_sets_explicit_null_without_usable_parameters():
    payload = attach_plugin_key_parameter_metadata(
        {
            "uri": "hardware://lexicon-mpx1-spdif",
            "name": "Lexicon MPX-1",
            "category": "Hardware",
            "parameters": [
                {"index": 0, "name": "Preset", "symbol": "preset"},
                {"index": 1, "name": "Bypass", "symbol": "bypass"},
            ],
        }
    )

    assert payload["key_parameter"] is None


def test_juce_processor_inventory_exposes_key_parameter_metadata(monkeypatch):
    monkeypatch.setattr(plugins, "_juce_processors_cache", [])

    processors = {plugin["uri"]: plugin for plugin in plugins._get_juce_processors()}

    assert processors["map2://juce/delay"]["key_parameter"]["parameter_symbol"] == "feedback"
    assert processors["map2://juce/convolution/reverb"]["key_parameter"]["parameter_symbol"] == "mix"
    assert processors["map2://juce/nam"]["key_parameter"]["parameter_symbol"] == "input_gain"
    assert processors["map2://juce/modulation/phaser"]["key_parameter"]["parameter_symbol"] == "depth"
