"""
Foundational helpers for the MAP2 State Authority graph document.

This module establishes the monolithic schema location, canonical URI rules,
and content-addressed asset reference helpers without yet replacing the full
snapshot persistence stack.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_GRAPH_SCHEMA_PATH = _PROJECT_ROOT / "schemas" / "snapshot-graph-v1.schema.json"
SNAPSHOT_GRAPH_VERSION = "2026.04"

_EXACT_URI_MAP = {
    "map2://juce/nam": "map2:fx:nam",
    "map2://juce/convolution/cabinet": "map2:fx:cabinet-ir",
    "map2://juce/convolution/reverb": "map2:fx:reverb-ir",
    "urn:map2:nam-player": "map2:fx:nam",
    "urn:map2:ir-cabinet": "map2:fx:cabinet-ir",
    "urn:map2:ir-reverb": "map2:fx:reverb-ir",
}
_ASSET_STATE_KEY_SUFFIXES = ("_path", "_file", "_asset")


@dataclass(frozen=True)
class AssetRegistryEntry:
    asset_hash: str
    source_path: str
    file_name: str
    size_bytes: int
    asset_type: str


def load_snapshot_graph_schema() -> dict[str, Any]:
    return json.loads(SNAPSHOT_GRAPH_SCHEMA_PATH.read_text(encoding="utf-8"))


def canonicalize_plugin_uri(uri: str) -> str:
    value = str(uri or "").strip()
    if not value:
        return value
    if value in _EXACT_URI_MAP:
        return _EXACT_URI_MAP[value]
    if value.startswith("map2://"):
        parsed = urlparse(value)
        path_parts = [part for part in parsed.path.split("/") if part]
        if parsed.netloc == "juce" and path_parts:
            return f"map2:fx:{_slugify(_canonical_name_for_juce_path(path_parts))}"
        if parsed.netloc in {"io", "audio-io"} and path_parts:
            return f"map2:io:{_slugify(path_parts[-1])}"
        if parsed.netloc in {"sys", "system"} and path_parts:
            return f"map2:sys:{_slugify(path_parts[-1])}"
        if parsed.netloc in {"ctrl", "control"} and path_parts:
            return f"map2:ctrl:{_slugify(path_parts[-1])}"
    if value.startswith("map2:"):
        parts = value.split(":", 2)
        if len(parts) == 3:
            return f"map2:{parts[1].lower()}:{_slugify(parts[2])}"
        return value
    return value


def register_asset_file(file_path: str | Path, *, asset_type: str = "binary") -> AssetRegistryEntry:
    path = Path(file_path).expanduser().resolve()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return AssetRegistryEntry(
        asset_hash=f"sha256:{digest}",
        source_path=str(path),
        file_name=path.name,
        size_bytes=path.stat().st_size,
        asset_type=str(asset_type or "binary"),
    )


def extract_asset_references(document: Mapping[str, Any]) -> set[str]:
    references: set[str] = set()

    def _walk(value: Any) -> None:
        if isinstance(value, Mapping):
            for nested in value.values():
                _walk(nested)
            return
        if isinstance(value, list):
            for nested in value:
                _walk(nested)
            return
        if isinstance(value, str) and value.startswith("sha256:"):
            references.add(value)

    _walk(document)
    return references


def normalize_graph_document(document: Mapping[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(dict(document))
    normalized.setdefault("version", SNAPSHOT_GRAPH_VERSION)
    graph = normalized.setdefault("graph", {})
    nodes = graph.setdefault("nodes", [])
    normalized_assets: list[dict[str, Any]] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_uri = str(node.get("uri") or "").strip()
        if node_uri:
            node["uri"] = canonicalize_plugin_uri(node_uri)
        state = node.get("state")
        if not isinstance(state, dict):
            continue
        for key, value in list(state.items()):
            if not isinstance(value, str):
                continue
            if not key.endswith(_ASSET_STATE_KEY_SUFFIXES):
                continue
            entry = _try_register_asset_reference(value, asset_type=_infer_asset_type(key))
            if entry is None:
                continue
            state[key] = entry.asset_hash
            normalized_assets.append(
                {
                    "hash": entry.asset_hash,
                    "name": entry.file_name,
                    "path": entry.source_path,
                    "size_bytes": entry.size_bytes,
                    "type": entry.asset_type,
                }
            )

    if normalized_assets:
        deduped = {item["hash"]: item for item in normalized_assets}
        normalized["assets"] = list(deduped.values())

    return normalized


def _canonical_name_for_juce_path(path_parts: list[str]) -> str:
    if path_parts[:2] == ["convolution", "cabinet"]:
        return "cabinet-ir"
    if path_parts[:2] == ["convolution", "reverb"]:
        return "reverb-ir"
    return path_parts[-1]


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-") or "unknown"


def _infer_asset_type(state_key: str) -> str:
    lowered = state_key.lower()
    if "model" in lowered:
        return "nam-model"
    if "ir" in lowered:
        return "impulse-response"
    if "sample" in lowered:
        return "sample"
    return "binary"


def _try_register_asset_reference(value: str, *, asset_type: str) -> AssetRegistryEntry | None:
    text = str(value or "").strip()
    if not text or text.startswith("sha256:"):
        return None
    path = Path(text).expanduser()
    if not path.exists() or not path.is_file():
        return None
    return register_asset_file(path, asset_type=asset_type)
