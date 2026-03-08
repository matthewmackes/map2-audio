from app.services.tesira.tesira_block_registry import get_profile, list_blocks, list_probe_profiles, list_profiles


def test_registry_profiles_and_default_shape():
    profiles = list_profiles()
    assert "forte_ci_v1" in profiles

    profile = get_profile()
    assert profile["profile"] == "forte_ci_v1"
    assert isinstance(profile["blocks"], list)


def test_registry_expands_block_families():
    blocks = list_blocks()
    block_types = {entry["block_type"] for entry in blocks}

    assert len(blocks) >= 25
    assert "LevelControl" in block_types
    assert "Compressor" in block_types
    assert "AGC" in block_types
    assert "ExplicitAVBInStream" in block_types


def test_probe_profiles_include_runtime_metadata():
    profiles = list_probe_profiles()

    assert "LevelControl" in profiles
    assert profiles["LevelControl"]["probe_attribute"] == "numChannels"
    assert profiles["LevelControl"]["block_type"] == "LEVEL"
    assert "parameter_map" in profiles["LevelControl"]
