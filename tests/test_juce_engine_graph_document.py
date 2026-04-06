import sys
from pathlib import Path

import pytest


def _engine_module_dir() -> Path | None:
    repo_root = Path(__file__).resolve().parents[1]
    for candidate in (repo_root / "juce-engine" / "build", repo_root / "build"):
        if any(candidate.glob("map2_audio_engine*.so")):
            return candidate
    return None


@pytest.mark.skipif(_engine_module_dir() is None, reason="JUCE build output not found")
def test_graph_document_round_trip_restores_runtime_chain_state():
    module_dir = _engine_module_dir()
    assert module_dir is not None
    sys.path.insert(0, str(module_dir))
    import map2_audio_engine  # noqa: WPS433 - imported from local build output on demand

    engine = map2_audio_engine.create_engine()
    engine.set_sample_rate(48000)
    engine.set_buffer_size(64)

    try:
        assert engine.initialize("")

        instance_id = engine.load_plugin("map2://juce/convolution/reverb")
        assert instance_id > 0
        assert engine.replace_chain([instance_id]) is True

        seed_document = {
            "version": "2026.04",
            "meta": {"name": "Round Trip", "type": "snapshot"},
            "graph": {"nodes": [], "edges": []},
        }
        exported = engine.save_graph_document(seed_document)
        plugin = exported["graph"]["chains"][0]["plugins"][0]
        plugin["bypass"] = True

        assert engine.load_graph_document(exported) is True

        reloaded = engine.save_graph_document(seed_document)
        reloaded_plugin = reloaded["graph"]["chains"][0]["plugins"][0]

        assert reloaded_plugin["uri"] == "map2://juce/convolution/reverb"
        assert reloaded_plugin["bypass"] is True
        assert reloaded_plugin["loader_state"]["state_chunk_base64"]
    finally:
        engine.shutdown()


@pytest.mark.skipif(_engine_module_dir() is None, reason="JUCE build output not found")
def test_graph_document_load_can_arm_independent_crossfade_transition():
    module_dir = _engine_module_dir()
    assert module_dir is not None
    sys.path.insert(0, str(module_dir))
    import map2_audio_engine  # noqa: WPS433 - imported from local build output on demand

    engine = map2_audio_engine.create_engine()
    engine.set_sample_rate(48000)
    engine.set_buffer_size(64)

    try:
        assert engine.initialize("")

        instance_id = engine.load_plugin("map2://juce/convolution/reverb")
        assert instance_id > 0
        assert engine.replace_chain([instance_id]) is True

        next_document = {
            "version": "2026.04",
            "meta": {"name": "Crossfade", "type": "snapshot"},
            "graph": {
                "nodes": [
                    {
                        "id": "main-chain:0",
                        "uri": "map2:fx:brain",
                        "engine_uri": "map2://juce/brain",
                        "name": "Brain",
                        "bypass": False,
                        "parameters": {},
                        "state": {},
                    }
                ],
                "edges": [],
                "chains": [
                    {
                        "id": 1,
                        "source_key": "main-chain",
                        "name": "Main Chain",
                        "plugins": [
                            {
                                "position": 0,
                                "uri": "map2://juce/brain",
                                "canonical_uri": "map2:fx:brain",
                                "name": "Brain",
                                "bypass": False,
                                "parameters": {},
                                "loader_state": {},
                            }
                        ],
                    }
                ],
            },
        }

        assert engine.load_graph_document(
            next_document,
            use_independent_crossfade=True,
            max_crossfade_ms=240,
        ) is True
        assert engine.get_independent_graph_crossfade_count() >= 1

        reloaded = engine.save_graph_document(next_document)
        assert reloaded["graph"]["chains"][0]["plugins"][0]["uri"] == "map2://juce/brain"
    finally:
        engine.shutdown()
