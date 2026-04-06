"""
Foundational helpers for the MAP2 State Authority graph document.

This module establishes the monolithic schema location, canonical URI rules,
and content-addressed asset reference helpers without yet replacing the full
snapshot persistence stack.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
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
_LEGACY_COMPAT_URI_MAP = {
    "map2:fx:nam": "map2://juce/nam",
    "map2:fx:cabinet-ir": "map2://juce/convolution/cabinet",
    "map2:fx:reverb-ir": "map2://juce/convolution/reverb",
}
_ASSET_STATE_KEY_SUFFIXES = ("_path", "_file", "_asset")


@dataclass(frozen=True)
class AssetRegistryEntry:
    asset_hash: str
    source_path: str
    file_name: str
    size_bytes: int
    asset_type: str


class GraphDocumentValidationError(ValueError):
    """Raised when a State Authority graph document violates the locked schema."""

    def __init__(self, *, path: str, message: str, guidance: str) -> None:
        super().__init__(
            f"State Authority document validation failed at {path}: {message}. "
            f"Auto-repair guidance: {guidance}"
        )
        self.path = path
        self.guidance = guidance


@lru_cache(maxsize=1)
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


def legacy_compatible_plugin_uri(uri: str) -> str:
    value = str(uri or "").strip()
    return _LEGACY_COMPAT_URI_MAP.get(value, value)


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


def normalize_and_validate_graph_document(document: Mapping[str, Any]) -> dict[str, Any]:
    normalized = normalize_graph_document(document)
    validate_graph_document(normalized)
    return normalized


def validate_graph_document(document: Mapping[str, Any]) -> None:
    schema = load_snapshot_graph_schema()
    uri_pattern = re.compile(
        schema["properties"]["graph"]["properties"]["nodes"]["items"]["properties"]["uri"]["pattern"]
    )
    asset_hash_pattern = re.compile(
        schema["properties"]["assets"]["items"]["properties"]["hash"]["pattern"]
    )
    allowed_meta_types = set(schema["properties"]["meta"]["properties"]["type"]["enum"])

    if not isinstance(document, Mapping):
        _raise_validation_error(
            "$",
            "document must be an object",
            "Persist the normalized graph document dictionary instead of a scalar or list value.",
        )

    version = document.get("version")
    if version != SNAPSHOT_GRAPH_VERSION:
        _raise_validation_error(
            "$.version",
            f"expected constant '{SNAPSHOT_GRAPH_VERSION}' but found {version!r}",
            f"Rewrite the document through normalize_graph_document() so version is pinned to {SNAPSHOT_GRAPH_VERSION}.",
        )

    meta = _require_mapping(document, "meta")
    name = meta.get("name")
    if not isinstance(name, str) or not name.strip():
        _raise_validation_error(
            "$.meta.name",
            "name must be a non-empty string",
            "Populate meta.name from the snapshot title before persisting the document.",
        )
    meta_type = meta.get("type")
    if meta_type not in allowed_meta_types:
        _raise_validation_error(
            "$.meta.type",
            f"type must be one of {sorted(allowed_meta_types)!r}",
            "Set meta.type to 'snapshot' or 'template' before persisting the document.",
        )
    if "description" in meta and not isinstance(meta.get("description"), str):
        _raise_validation_error(
            "$.meta.description",
            "description must be a string",
            "Serialize description as a string value, using an empty string when unset.",
        )
    if "tags" in meta:
        _require_list_of_strings(meta["tags"], "$.meta.tags")
    if meta.get("program_number") is not None and not isinstance(meta.get("program_number"), int):
        _raise_validation_error(
            "$.meta.program_number",
            "program_number must be an integer",
            "Persist a whole-number MIDI program index or omit the field.",
        )

    graph = _require_mapping(document, "graph")
    nodes = _require_list(graph, "nodes")
    edges = _require_list(graph, "edges")
    for index, node in enumerate(nodes):
        path = f"$.graph.nodes[{index}]"
        node_map = _require_mapping_entry(node, path)
        for required_key in ("id", "uri", "name", "parameters", "state"):
            if required_key not in node_map:
                _raise_validation_error(
                    path,
                    f"missing required property '{required_key}'",
                    f"Persist each graph node with '{required_key}' populated before write.",
                )
        _require_non_empty_string(node_map.get("id"), f"{path}.id", "Assign a stable node identifier string.")
        uri = _require_non_empty_string(
            node_map.get("uri"),
            f"{path}.uri",
            "Canonicalize plugin URIs through canonicalize_plugin_uri() before persisting the document.",
        )
        if not uri_pattern.fullmatch(uri):
            _raise_validation_error(
                f"{path}.uri",
                f"uri {uri!r} does not match the locked schema pattern",
                "Use canonical map2:{type}:{name} URIs or a URN the schema explicitly allows.",
            )
        _require_non_empty_string(node_map.get("name"), f"{path}.name", "Persist the node display name as a non-empty string.")
        if "bypass" in node_map and not isinstance(node_map.get("bypass"), bool):
            _raise_validation_error(
                f"{path}.bypass",
                "bypass must be a boolean",
                "Serialize bypass as true or false, not a numeric or string sentinel.",
            )
        _require_mapping_value(node_map.get("parameters"), f"{path}.parameters", "Persist parameters as an object map.")
        _require_mapping_value(node_map.get("state"), f"{path}.state", "Persist loader state as an object map.")

    for index, edge in enumerate(edges):
        path = f"$.graph.edges[{index}]"
        edge_map = _require_mapping_entry(edge, path)
        for required_key in ("from", "to"):
            if required_key not in edge_map:
                _raise_validation_error(
                    path,
                    f"missing required property '{required_key}'",
                    "Persist each edge with explicit from/to node identifiers.",
                )
        _require_non_empty_string(edge_map.get("from"), f"{path}.from", "Persist a non-empty edge source identifier.")
        _require_non_empty_string(edge_map.get("to"), f"{path}.to", "Persist a non-empty edge target identifier.")

    assets = document.get("assets")
    if assets is not None:
        asset_list = _require_list(document, "assets")
        for index, asset in enumerate(asset_list):
            path = f"$.assets[{index}]"
            asset_map = _require_mapping_entry(asset, path)
            for required_key in ("hash", "name", "path", "size_bytes", "type"):
                if required_key not in asset_map:
                    _raise_validation_error(
                        path,
                        f"missing required property '{required_key}'",
                        "Persist every asset registry entry with hash, name, path, size_bytes, and type.",
                    )
            asset_hash = _require_non_empty_string(
                asset_map.get("hash"),
                f"{path}.hash",
                "Store content-addressed assets as sha256:<digest> references.",
            )
            if not asset_hash_pattern.fullmatch(asset_hash):
                _raise_validation_error(
                    f"{path}.hash",
                    f"hash {asset_hash!r} does not match the locked sha256 format",
                    "Rewrite file-backed loader references through register_asset_file() before persisting the document.",
                )
            _require_non_empty_string(asset_map.get("name"), f"{path}.name", "Persist the source file name as a non-empty string.")
            _require_non_empty_string(asset_map.get("path"), f"{path}.path", "Persist the resolved source path as a non-empty string.")
            size_bytes = asset_map.get("size_bytes")
            if not isinstance(size_bytes, int) or size_bytes < 0:
                _raise_validation_error(
                    f"{path}.size_bytes",
                    "size_bytes must be a non-negative integer",
                    "Persist the source file size in bytes when registering the asset.",
                )
            _require_non_empty_string(asset_map.get("type"), f"{path}.type", "Persist the asset type as a non-empty string.")


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


def _require_mapping(document: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = document.get(key)
    return _require_mapping_value(
        value,
        f"$.{key}",
        f"Persist {key} as an object that matches the locked graph-document schema.",
    )


def _require_mapping_entry(value: Any, path: str) -> Mapping[str, Any]:
    return _require_mapping_value(
        value,
        path,
        "Persist this entry as an object that matches the locked graph-document schema.",
    )


def _require_mapping_value(value: Any, path: str, guidance: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _raise_validation_error(path, "value must be an object", guidance)
    return value


def _require_list(document: Mapping[str, Any], key: str) -> list[Any]:
    value = document.get(key)
    if not isinstance(value, list):
        _raise_validation_error(
            f"$.{key}",
            "value must be an array",
            f"Persist {key} as an array that matches the locked graph-document schema.",
        )
    return value


def _require_list_of_strings(value: Any, path: str) -> None:
    if not isinstance(value, list):
        _raise_validation_error(path, "value must be an array of strings", "Serialize tags as a flat string array.")
    for index, item in enumerate(value):
        if not isinstance(item, str):
            _raise_validation_error(
                f"{path}[{index}]",
                "tag entries must be strings",
                "Serialize each tag as a plain string token.",
            )


def _require_non_empty_string(value: Any, path: str, guidance: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _raise_validation_error(path, "value must be a non-empty string", guidance)
    return value


def _raise_validation_error(path: str, message: str, guidance: str) -> None:
    raise GraphDocumentValidationError(path=path, message=message, guidance=guidance)
