import asyncio

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
