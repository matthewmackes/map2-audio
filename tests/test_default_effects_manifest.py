import asyncio
from types import SimpleNamespace

import app.services.chain_service as chain_service_module
import app.services.default_effects_loader as default_effects_loader_module
from app.services.chain_service import ChainService
from app.services.default_effects_loader import DefaultEffectsLoader
from app.services.default_effects_manifest import (
    get_default_effects_manifest_path,
    load_default_effects_manifest,
)


def test_default_effects_manifest_points_to_deployment_inventory():
    path = get_default_effects_manifest_path()

    assert path.exists()
    assert path.name == "default_lv2_effects.json"
    assert "deployment" in path.parts


def test_default_effects_manifest_matches_live_lv2_authority_set():
    manifest = load_default_effects_manifest()
    uris = {plugin["uri"] for plugin in manifest["plugins"]}

    assert "http://distrho.sf.net/plugins/MVerb" in uris
    assert "https://github.com/michaelwillis/dragonfly-reverb" in uris
    assert "urn:dragonfly:room" in uris
    assert "http://two-play.com/plugins/toob-delay" not in uris
    assert "https://michaelwillis.github.io/dragonfly-reverb#hall" not in uris


def test_chain_service_list_templates_uses_deployment_manifest(monkeypatch):
    monkeypatch.setattr(
        chain_service_module,
        "load_default_effects_manifest",
        lambda: {
            "default_chains": [
                {
                    "name": "Hall Wash",
                    "description": "Test template",
                    "plugins": ["urn:test:reverb"],
                }
            ]
        },
    )

    templates = asyncio.run(ChainService(None).list_templates())

    assert templates == [
        {
            "name": "Hall Wash",
            "description": "Test template",
            "plugin_count": 1,
            "plugins": ["urn:test:reverb"],
        }
    ]


def test_default_effects_loader_uses_deployment_manifest(monkeypatch):
    manifest = {
        "plugins": [{"uri": "urn:test:plugin", "name": "Test", "author": "Tester"}],
        "default_chains": [{"name": "Test Chain", "plugins": ["urn:test:plugin"]}],
    }
    monkeypatch.setattr(default_effects_loader_module, "load_default_effects_manifest", lambda: manifest)

    loader = DefaultEffectsLoader(SimpleNamespace())

    assert loader.load_config() is True
    assert loader.config_path == get_default_effects_manifest_path()
    assert loader.default_effects == manifest["plugins"]
    assert loader.default_chains == manifest["default_chains"]
