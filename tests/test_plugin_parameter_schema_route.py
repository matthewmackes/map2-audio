import asyncio
from types import SimpleNamespace

from fastapi import Response

from app.routes import plugins


def test_get_parameter_schema_serializes_native_and_lv2_descriptors(monkeypatch):
    async def _fake_discover_plugins(response, refresh=False):
        return {
            "plugins": [
                {
                    "uri": "native://synth",
                    "name": "Native Synth",
                    "format": "JUCE",
                    "parameters": [
                        {
                            "index": 0,
                            "name": "Cutoff Frequency",
                            "symbol": "cutoff",
                            "min": 20.0,
                            "max": 20000.0,
                            "default": 1000.0,
                            "is_toggled": False,
                            "is_log": True,
                        }
                    ],
                },
                {
                    "uri": "lv2://plate",
                    "name": "Plate Verb",
                    "format": "LV2",
                    "parameters": [
                        {
                            "index": 1,
                            "name": "Mix",
                            "symbol": "mix",
                            "min": 0.0,
                            "max": 100.0,
                            "default": 50.0,
                            "is_toggled": False,
                            "is_log": False,
                        },
                        {
                            "index": 2,
                            "name": "Resonance",
                            "symbol": "resonance",
                            "min": 0.0,
                            "max": 1.0,
                            "default": 0.5,
                            "is_toggled": False,
                            "is_log": False,
                            "unit": "ratio",
                        }
                    ],
                },
                {
                    "uri": "hardware://mpx1",
                    "name": "MPX-1",
                    "format": "Hardware",
                    "parameters": [],
                },
            ],
            "cached": False,
        }

    monkeypatch.setattr(plugins, "discover_plugins", _fake_discover_plugins)

    payload = asyncio.run(plugins.get_parameter_schema(Response(), refresh=False))

    assert payload["count"] == 3
    assert payload["schema"]["native://synth:cutoff"]["profile"] == "frequency"
    assert payload["schema"]["native://synth:cutoff"]["unit"] == "Hz"
    assert payload["schema"]["lv2://plate:mix"]["defaultValue"] == 50.0
    assert payload["schema"]["lv2://plate:resonance"]["profile"] == "normalized_0_1"
    assert payload["schema"]["lv2://plate:resonance"]["unit"] == "ratio"
    assert [plugin["source"] for plugin in payload["plugins"]] == ["native", "lv2"]
    assert all(plugin["pluginId"] != "hardware://mpx1" for plugin in payload["plugins"])


def test_build_parameter_schema_payload_treats_transformed_lv2_plugins_as_lv2():
    payload = plugins._build_parameter_schema_payload(
        [
            {
                "uri": "lv2://delay",
                "name": "LV2 Delay",
                "format": "LV2",
                "parameters": [
                    {
                        "index": 0,
                        "name": "Feedback",
                        "symbol": "feedback",
                        "min": 0.0,
                        "max": 1.0,
                        "default": 0.35,
                        "is_toggled": False,
                        "is_log": False,
                    }
                ],
            }
        ]
    )

    assert payload["count"] == 1
    assert payload["plugins"][0]["source"] == "lv2"
    assert payload["plugins"][0]["format"] == "LV2"
    assert payload["schema"]["lv2://delay:feedback"]["profile"] == "normalized_0_1"


def test_load_juce_processors_normalizes_enum_defaults_to_numeric_indices(monkeypatch):
    monkeypatch.setattr(plugins, "_juce_processors_cache", [])

    payload = plugins._get_juce_processors()
    eq_plugin = next(plugin for plugin in payload if plugin["uri"] == "map2://juce/eq/parametric")
    band_type = next(parameter for parameter in eq_plugin["parameters"] if parameter["symbol"] == "band0_type")

    assert band_type["min"] == 0.0
    assert band_type["max"] == 7.0
    assert band_type["default"] == 0.0
    assert band_type["options"] == [
        "peak",
        "lowshelf",
        "highshelf",
        "lowpass",
        "highpass",
        "bandpass",
        "notch",
        "allpass",
    ]


def test_load_juce_processors_preserves_explicit_parameter_units(monkeypatch):
    monkeypatch.setattr(plugins, "_juce_processors_cache", [])

    payload = plugins._get_juce_processors()
    compressor = next(plugin for plugin in payload if plugin["uri"] == "map2://juce/dynamics/compressor")
    attack = next(parameter for parameter in compressor["parameters"] if parameter["symbol"] == "attack")

    assert attack["unit"] == "ms"


def test_transform_plugin_preserves_lv2_parameter_units():
    plugin = SimpleNamespace(
        uri="lv2://delay",
        name="LV2 Delay",
        author="Unit Test",
        category="Delay",
        class_label="Delay",
        version="1.0",
        license="MIT",
        has_ui=False,
        in_port_count=2,
        out_port_count=2,
        parameters=[
            SimpleNamespace(
                index=0,
                name="Feedback",
                symbol="feedback",
                min_value=0.0,
                max_value=0.95,
                default_value=0.4,
                is_toggled=False,
                is_logarithmic=False,
                unit="ratio",
            )
        ],
    )

    payload = plugins._transform_plugin(plugin)

    assert payload["parameters"][0]["unit"] == "ratio"


def test_get_parameter_schema_covers_every_discovered_native_and_lv2_parameter(monkeypatch):
    monkeypatch.setattr(plugins, "_juce_processors_cache", [])
    discovered_plugins = [
        next(plugin for plugin in plugins._get_juce_processors() if plugin["uri"] == "map2://juce/eq/parametric"),
        {
            "uri": "lv2://plate",
            "name": "Plate Verb",
            "format": "LV2",
            "parameters": [
                {
                    "index": 0,
                    "name": "Mix",
                    "symbol": "mix",
                    "min": 0.0,
                    "max": 100.0,
                    "default": 50.0,
                    "is_toggled": False,
                    "is_log": False,
                }
            ],
        },
        {
            "uri": "hardware://mpx1",
            "name": "MPX-1",
            "format": "Hardware",
            "parameters": [],
        },
    ]

    async def _fake_discover_plugins(response, refresh=False):
        return {
            "plugins": discovered_plugins,
            "cached": False,
        }

    monkeypatch.setattr(plugins, "discover_plugins", _fake_discover_plugins)

    payload = asyncio.run(plugins.get_parameter_schema(Response(), refresh=False))

    missing_keys = []
    for plugin_entry in discovered_plugins:
        if str(plugin_entry.get("format", "")).upper() not in {"JUCE", "LV2"}:
            continue
        for parameter in plugin_entry.get("parameters", []):
            index = int(parameter.get("index", 0))
            raw_key = str(parameter.get("symbol") or parameter.get("name") or "").strip()
            schema_key = f"{plugin_entry['uri']}:{plugins._normalize_parameter_key(raw_key, f'param-{index}')}"
            if schema_key not in payload["schema"]:
                missing_keys.append(schema_key)

    assert missing_keys == []
