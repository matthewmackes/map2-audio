from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List

from .constants import CONFIG_OFFSET, NUM_PRESETS, PRESET_NUM_BYTES, PRESET_OFFSET


@dataclass(frozen=True)
class FieldTemplate:
    scope: str
    path_template: str
    offset: int
    width: int
    count: int
    stride: int
    encoding: str
    confidence: str
    editable: bool


@dataclass(frozen=True)
class ExpandedFieldDescriptor:
    path: str
    absolute_offset: int
    width: int
    encoding: str
    confidence: str
    editable: bool
    scope: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _field_map_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "ground_control_pro_field_map.json"


@lru_cache(maxsize=1)
def load_field_map() -> Dict[str, Any]:
    return json.loads(_field_map_path().read_text(encoding="utf-8"))


def load_templates() -> List[FieldTemplate]:
    raw_templates = load_field_map().get("templates", [])
    return [
        FieldTemplate(
            scope=str(entry["scope"]),
            path_template=str(entry["path_template"]),
            offset=int(entry["offset"]),
            width=int(entry["width"]),
            count=int(entry.get("count", 1)),
            stride=int(entry.get("stride", 0)),
            encoding=str(entry.get("encoding", "uint7")),
            confidence=str(entry.get("confidence", "inferred")),
            editable=bool(entry.get("editable", True)),
        )
        for entry in raw_templates
    ]


def _expand_single(template: FieldTemplate) -> Iterable[ExpandedFieldDescriptor]:
    if template.scope == "config":
        if template.count <= 1:
            yield ExpandedFieldDescriptor(
                path=template.path_template,
                absolute_offset=CONFIG_OFFSET + template.offset,
                width=template.width,
                encoding=template.encoding,
                confidence=template.confidence,
                editable=template.editable,
                scope=template.scope,
            )
            return

        for index in range(template.count):
            yield ExpandedFieldDescriptor(
                path=template.path_template.format(index=index),
                absolute_offset=CONFIG_OFFSET + template.offset + (index * template.stride),
                width=template.width,
                encoding=template.encoding,
                confidence=template.confidence,
                editable=template.editable,
                scope=template.scope,
            )
        return

    if template.count <= 1:
        for preset_index in range(NUM_PRESETS):
            yield ExpandedFieldDescriptor(
                path=template.path_template.format(preset_index=preset_index),
                absolute_offset=PRESET_OFFSET + (preset_index * PRESET_NUM_BYTES) + template.offset,
                width=template.width,
                encoding=template.encoding,
                confidence=template.confidence,
                editable=template.editable,
                scope=template.scope,
            )
        return

    for preset_index in range(NUM_PRESETS):
        for index in range(template.count):
            yield ExpandedFieldDescriptor(
                path=template.path_template.format(preset_index=preset_index, index=index),
                absolute_offset=PRESET_OFFSET + (preset_index * PRESET_NUM_BYTES) + template.offset + (index * template.stride),
                width=template.width,
                encoding=template.encoding,
                confidence=template.confidence,
                editable=template.editable,
                scope=template.scope,
            )


@lru_cache(maxsize=1)
def expand_field_descriptors() -> List[ExpandedFieldDescriptor]:
    descriptors: List[ExpandedFieldDescriptor] = []
    for template in load_templates():
        descriptors.extend(_expand_single(template))
    return descriptors


@lru_cache(maxsize=1)
def offset_to_descriptors() -> Dict[int, List[ExpandedFieldDescriptor]]:
    mapping: Dict[int, List[ExpandedFieldDescriptor]] = {}
    for descriptor in expand_field_descriptors():
        for offset in range(descriptor.absolute_offset, descriptor.absolute_offset + descriptor.width):
            mapping.setdefault(offset, []).append(descriptor)
    return mapping


def unknown_byte_count() -> int:
    return sum(
        descriptor.width
        for descriptor in expand_field_descriptors()
        if descriptor.confidence == "unknown_reserved"
    )
