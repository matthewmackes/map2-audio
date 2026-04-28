from __future__ import annotations

from app.services.sysex_tags import (
    auto_tag_from_name,
    compile_intelfx_tag_map,
    compile_mpx1_tag_map,
)


def test_mpx1_and_intelfx_maps_share_core_tags() -> None:
    mpx = compile_mpx1_tag_map()
    intel = compile_intelfx_tag_map()

    mpx_tags = set(auto_tag_from_name("Hall Plate Delay", mpx))
    intel_tags = set(auto_tag_from_name("Hall Plate Delay", intel))

    assert {"hall", "plate", "delay", "reverb"} <= mpx_tags
    assert {"hall", "plate", "delay", "reverb"} <= intel_tags


def test_mpx1_specific_flange_tag_is_preserved() -> None:
    tags = auto_tag_from_name("Wide Flange Chorus", compile_mpx1_tag_map())
    assert "flange" in tags
    assert "chorus" in tags


def test_intelfx_specific_hush_and_flanger_tags_are_preserved() -> None:
    tags = auto_tag_from_name("Noise Hush Flange", compile_intelfx_tag_map())
    assert "hush" in tags
    assert "noise_reduction" in tags
    assert "flanger" in tags
