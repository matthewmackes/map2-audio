"""Shared SysEx program-name auto-tagging utilities.

Worklist: T2459-H4 (SysEx parser consolidation slice)
"""

from __future__ import annotations

import re
from typing import Iterable


TagMap = list[tuple[re.Pattern[str], list[str]]]


_COMMON_TAG_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"\bplate\b", ("plate", "reverb")),
    (r"\bhall\b", ("hall", "reverb")),
    (r"\broom\b", ("room", "reverb")),
    (r"\bspring\b", ("spring", "reverb")),
    (r"\bchamber\b", ("chamber", "reverb")),
    (r"\becho\b", ("echo", "delay")),
    (r"\bdelay\b", ("delay",)),
    (r"\bslap\b", ("slap", "delay")),
    (r"\bping\b", ("pingpong", "delay")),
    (r"\bchorus\b", ("chorus",)),
    (r"\bpitch\b", ("pitch",)),
    (r"\bshift\b", ("pitch",)),
    (r"\bwhammy\b", ("pitch",)),
    (r"\bdetune\b", ("pitch",)),
    (r"\bharmony\b", ("pitch",)),
    (r"\bocta(ve)?\b", ("pitch",)),
    (r"\beq\b", ("eq",)),
    (r"\bvocal\b", ("vocal",)),
    (r"\bguitar\b", ("guitar",)),
    (r"\bdrum\b", ("drums",)),
    (r"\bsnare\b", ("drums",)),
    (r"\bbass\b", ("bass",)),
    (r"\bambi(ent)?\b", ("ambient",)),
    (r"\bshimmer\b", ("ambient",)),
    (r"\bglass\b", ("ambient",)),
    (r"\bgate\b", ("gate",)),
    (r"\breverse\b", ("reverse",)),
)

_MPX1_ONLY_TAG_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"\bflange\b", ("flange", "chorus")),
    (r"\bphase\b", ("phaser", "chorus")),
    (r"\brotary\b", ("rotary", "chorus")),
    (r"\bvibrato\b", ("vibrato", "chorus")),
)

_INTELFX_ONLY_TAG_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"\bhush\b", ("hush", "noise_reduction")),
    (r"\bcomp(ressor)?\b", ("compressor",)),
    (r"\bwah\b", ("wah",)),
    (r"\bflange\b", ("flanger", "chorus")),
    (r"\bphase\b", ("phaser",)),
    (r"\brotary\b", ("rotary", "chorus")),
    (r"\btremolo\b", ("tremolo",)),
    (r"\bvibrato\b", ("vibrato", "chorus")),
    (r"\breverb\b", ("reverb",)),
    (r"\bclean\b", ("clean",)),
    (r"\bcrunch\b", ("crunch",)),
    (r"\blead\b", ("lead",)),
    (r"\bacoustic\b", ("acoustic",)),
)


def _compile_specs(specs: Iterable[tuple[str, tuple[str, ...]]]) -> TagMap:
    return [(re.compile(pattern, re.I), list(tags)) for pattern, tags in specs]


def compile_mpx1_tag_map() -> TagMap:
    return _compile_specs((*_COMMON_TAG_SPECS, *_MPX1_ONLY_TAG_SPECS))


def compile_intelfx_tag_map() -> TagMap:
    return _compile_specs((*_COMMON_TAG_SPECS, *_INTELFX_ONLY_TAG_SPECS))


def auto_tag_from_name(name: str, tag_map: TagMap) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for pattern, tag_list in tag_map:
        if pattern.search(name):
            for tag in tag_list:
                if tag not in seen:
                    tags.append(tag)
                    seen.add(tag)
    return tags

