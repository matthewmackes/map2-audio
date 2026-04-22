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
    # Tier 1: exact-match legacy pair-wise map (hand-curated historical URIs).
    if value in _EXACT_URI_MAP:
        return _EXACT_URI_MAP[value]
    # Tier 2: URI catalog alias index (registered `aliases` on catalog entries).
    # This lets the tonechaser catalog be the source of truth for new-vocabulary
    # aliases without re-editing _EXACT_URI_MAP on every addition.
    try:
        from app.services.state_authority_uri_catalog import lookup_alias
        aliased = lookup_alias(value)
        if aliased:
            return aliased
    except ImportError:  # pragma: no cover — defensive; catalog module is in-tree
        pass
    # Tier 3: structural rewrite of the map2:// URL form.
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
    # Tier 4: canonical form already — slugify the name portion for stable output.
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
    morph = graph.get("morph")
    if not isinstance(morph, Mapping):
        morph = {}
    normalized_morph = {
        "mode": _normalize_graph_morph_mode(morph.get("mode")),
        "position": _normalize_morph_position(morph.get("position", 0.5)),
        "source_channel_key": _normalize_optional_string(morph.get("source_channel_key")),
        "target_channel_key": _normalize_optional_string(morph.get("target_channel_key")),
    }
    source_mode = morph.get("source_mode")
    if isinstance(source_mode, str):
        lowered = source_mode.strip().lower()
        if lowered in {"intra", "cross"}:
            normalized_morph["source_mode"] = lowered
    endpoints = morph.get("endpoints")
    if isinstance(endpoints, Mapping):
        normalized_endpoints: dict[str, dict[str, Any]] = {}
        for key in ("A", "B", "C", "D"):
            payload = endpoints.get(key)
            if isinstance(payload, Mapping):
                normalized_endpoints[key] = dict(payload)
        if normalized_endpoints:
            normalized_morph["endpoints"] = normalized_endpoints
    graph["morph"] = normalized_morph
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
    morph = _require_mapping_value(
        graph.get("morph"),
        "$.graph.morph",
        "Persist graph.morph as an object with explicit mode, position, and source/target channel keys.",
    )
    allowed_morph_modes = {"off", "snapshot", "intra_snapshot", "cross_snapshot", "quad"}
    morph_mode = morph.get("mode")
    if morph_mode not in allowed_morph_modes:
        _raise_validation_error(
            "$.graph.morph.mode",
            f"mode must be one of {sorted(allowed_morph_modes)!r}",
            "Persist graph.morph.mode as off, snapshot, intra_snapshot, cross_snapshot, or quad.",
        )
    morph_position = morph.get("position")
    if isinstance(morph_position, Mapping):
        for axis in ("x", "y"):
            axis_value = morph_position.get(axis)
            if not isinstance(axis_value, (int, float)) or not 0.0 <= float(axis_value) <= 1.0:
                _raise_validation_error(
                    f"$.graph.morph.position.{axis}",
                    f"{axis} must be a number between 0.0 and 1.0",
                    "Clamp graph.morph.position.x and graph.morph.position.y into [0.0, 1.0].",
                )
    elif not isinstance(morph_position, (int, float)) or not 0.0 <= float(morph_position) <= 1.0:
        _raise_validation_error(
            "$.graph.morph.position",
            "position must be a number between 0.0 and 1.0 OR an object with x,y in [0,1]",
            "Clamp graph.morph.position into the inclusive 0.0-1.0 range, or use {x, y} for quad.",
        )
    if morph_mode == "quad":
        endpoints = morph.get("endpoints")
        if not isinstance(endpoints, Mapping) or not any(
            isinstance(endpoints.get(k), Mapping) for k in ("A", "B", "C", "D")
        ):
            _raise_validation_error(
                "$.graph.morph.endpoints",
                "quad morph requires at least one of A/B/C/D endpoints",
                "Populate graph.morph.endpoints.{A,B,C,D} with per-plugin parameter maps before persisting quad mode.",
            )
        if isinstance(endpoints, Mapping):
            for endpoint_key in ("A", "B", "C", "D"):
                endpoint_value = endpoints.get(endpoint_key)
                if endpoint_value is not None and not isinstance(endpoint_value, Mapping):
                    _raise_validation_error(
                        f"$.graph.morph.endpoints.{endpoint_key}",
                        "endpoint must be a parameter map object",
                        "Persist each endpoint as {node_id: {param: value}} or omit the key.",
                    )
    for field_name in ("source_channel_key", "target_channel_key"):
        field_value = morph.get(field_name)
        if field_value is not None and (not isinstance(field_value, str) or not field_value.strip()):
            _raise_validation_error(
                f"$.graph.morph.{field_name}",
                "value must be null or a non-empty string",
                f"Persist graph.morph.{field_name} as null or the stable channel_key string.",
            )

    _validate_graph_groups(graph.get("groups"))
    _validate_graph_channels(graph.get("channels"))
    _validate_routing_section(document.get("routing"))
    _validate_effects_loops(document.get("effects_loops"))
    _validate_controls_section(document.get("controls"))
    _validate_io_section(document.get("io"))
    _validate_tempo_section(document.get("tempo"))
    _validate_output_safety(document.get("output_safety"))
    _validate_deployment_section(document.get("deployment"))
    _validate_templates_section(document.get("templates"))

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
                "Use canonical map2:{type}:{name} URIs or a valid absolute third-party plugin URI.",
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


def _normalize_graph_morph_mode(value: Any) -> str:
    lowered = str(value or "").strip().lower()
    if lowered in {"snapshot", "intra_snapshot", "cross_snapshot", "quad"}:
        return lowered
    return "off"


def _normalize_morph_position(value: Any) -> Any:
    """Accept scalar 0..1 OR {x, y} object for quad morph — return normalized form."""
    if isinstance(value, Mapping):
        x = _clamp01(value.get("x", 0.5))
        y = _clamp01(value.get("y", 0.5))
        return {"x": x, "y": y}
    return _clamp01(value)


def _normalize_optional_string(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _clamp01(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, numeric))


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


_ALLOWED_ROUTING_MODES = {"parallel_blend", "series", "single"}
_ALLOWED_GROUP_TYPES = {"parallel", "series"}
_ALLOWED_DEPLOYMENT_STATUSES = {"draft", "staged", "active", "failing", "retired"}
_ALLOWED_DEPLOYMENT_STRATEGIES = {"manual", "auto", "redundant"}
_ALLOWED_CONTROL_SOURCE_TYPES = {
    "midi_cc",
    "midi_pc",
    "midi_note",
    "expression",
    "maschine_encoder",
    "maschine_pad",
    "osc",
    "gpio",
}
_ALLOWED_CONTROL_CURVES = {"linear", "logarithmic", "exponential", "toggle", "stepped"}
_ALLOWED_LOOP_INSERTION_MODES = {"serial_insert", "parallel_send"}
_ALLOWED_PORT_KINDS = {"audio", "sidechain", "control"}
_CHANNEL_KEY_PATTERN = re.compile(r"^[A-F]$")


def _validate_graph_groups(groups: Any) -> None:
    if groups is None:
        return
    if not isinstance(groups, list):
        _raise_validation_error(
            "$.graph.groups",
            "groups must be an array",
            "Persist graph.groups as a list of group objects or omit the key.",
        )
    for index, group in enumerate(groups):
        path = f"$.graph.groups[{index}]"
        group_map = _require_mapping_entry(group, path)
        for required_key in ("id", "type", "branches"):
            if required_key not in group_map:
                _raise_validation_error(
                    path,
                    f"missing required property '{required_key}'",
                    f"Persist each group with '{required_key}' populated.",
                )
        _require_non_empty_string(group_map.get("id"), f"{path}.id", "Assign a stable group identifier.")
        group_type = group_map.get("type")
        if group_type not in _ALLOWED_GROUP_TYPES:
            _raise_validation_error(
                f"{path}.type",
                f"type must be one of {sorted(_ALLOWED_GROUP_TYPES)!r}",
                "Use 'parallel' or 'series' for graph.groups[*].type.",
            )
        branches = group_map.get("branches")
        if not isinstance(branches, list):
            _raise_validation_error(
                f"{path}.branches",
                "branches must be an array of arrays",
                "Persist branches as a list of node-id arrays, one per branch.",
            )
        for b_index, branch in enumerate(branches):
            if not isinstance(branch, list):
                _raise_validation_error(
                    f"{path}.branches[{b_index}]",
                    "branch must be a list of node ids",
                    "Persist each branch as an array of stable node identifiers.",
                )
            for n_index, node_id in enumerate(branch):
                if not isinstance(node_id, str) or not node_id.strip():
                    _raise_validation_error(
                        f"{path}.branches[{b_index}][{n_index}]",
                        "branch entries must be non-empty node id strings",
                        "Persist branch node references as stable non-empty strings.",
                    )
        blend = group_map.get("blend")
        if blend is not None:
            if not isinstance(blend, (int, float)) or not 0.0 <= float(blend) <= 1.0:
                _raise_validation_error(
                    f"{path}.blend",
                    "blend must be a number in [0.0, 1.0]",
                    "Persist group.blend as a normalized [0,1] crossfade position.",
                )


def _validate_graph_channels(channels: Any) -> None:
    """Validate graph.channels structure.

    Channel keys are conventionally A–F (the canonical tonechaser channels), but
    the runtime validator accepts any non-empty string to remain
    backward-compatible with existing persisted snapshots that use UUID-scoped
    or legacy channel identifiers. The schema file still documents ^[A-F]$ as
    the preferred pattern for new writers.
    """
    if channels is None:
        return
    if not isinstance(channels, list):
        _raise_validation_error(
            "$.graph.channels",
            "channels must be an array",
            "Persist graph.channels as a list of channel objects or omit the key.",
        )
    seen_keys: set[str] = set()
    for index, channel in enumerate(channels):
        path = f"$.graph.channels[{index}]"
        channel_map = _require_mapping_entry(channel, path)
        # Accept both 'key' (plan canonical) and 'channel_key' (legacy projection) —
        # plan-conformant writers use 'key'; existing persisted documents use
        # 'channel_key'. Both are treated as stable non-empty channel identifiers.
        key = channel_map.get("key")
        if key is None:
            key = channel_map.get("channel_key")
        if not isinstance(key, str) or not key.strip():
            _raise_validation_error(
                f"{path}.key",
                "key must be a non-empty string",
                "Persist channel.key as a stable non-empty identifier (A–F preferred for tonechaser workflows).",
            )
        if key in seen_keys:
            _raise_validation_error(
                f"{path}.key",
                f"duplicate channel key {key!r}",
                "Each channel key must appear at most once per snapshot.",
            )
        seen_keys.add(key)
        dry_wet = channel_map.get("dry_wet_mix")
        if dry_wet is not None:
            if not isinstance(dry_wet, (int, float)) or not 0.0 <= float(dry_wet) <= 100.0:
                _raise_validation_error(
                    f"{path}.dry_wet_mix",
                    "dry_wet_mix must be a number in [0.0, 100.0]",
                    "Persist channel dry_wet_mix as a 0..100 percentage.",
                )
        chain_nodes = channel_map.get("chain_nodes")
        if chain_nodes is not None:
            if not isinstance(chain_nodes, list):
                _raise_validation_error(
                    f"{path}.chain_nodes",
                    "chain_nodes must be a list of node ids",
                    "Persist channel.chain_nodes as an ordered array of stable node ids.",
                )
            for n_index, node_id in enumerate(chain_nodes):
                if not isinstance(node_id, str) or not node_id.strip():
                    _raise_validation_error(
                        f"{path}.chain_nodes[{n_index}]",
                        "chain_nodes entries must be non-empty node id strings",
                        "Persist chain_nodes as non-empty node identifier strings.",
                    )


def _validate_routing_section(routing: Any) -> None:
    if routing is None:
        return
    routing_map = _require_mapping_value(
        routing,
        "$.routing",
        "Persist routing as an object with mode + active_channel_key + blend_positions + series_order.",
    )
    mode = routing_map.get("mode")
    if mode is not None and mode not in _ALLOWED_ROUTING_MODES:
        _raise_validation_error(
            "$.routing.mode",
            f"mode must be one of {sorted(_ALLOWED_ROUTING_MODES)!r}",
            "Use parallel_blend, series, or single.",
        )
    blend_positions = routing_map.get("blend_positions")
    if blend_positions is not None:
        if not isinstance(blend_positions, Mapping):
            _raise_validation_error(
                "$.routing.blend_positions",
                "blend_positions must be an object mapping channel key to [0,1] value",
                "Persist blend_positions as {'A': 0.7, 'B': 0.3, ...}.",
            )
        for key, value in blend_positions.items():
            if not isinstance(value, (int, float)) or not 0.0 <= float(value) <= 1.0:
                _raise_validation_error(
                    f"$.routing.blend_positions.{key}",
                    "value must be a number in [0.0, 1.0]",
                    "Clamp blend position values into [0,1].",
                )
    series_order = routing_map.get("series_order")
    if series_order is not None:
        _require_list_of_strings(series_order, "$.routing.series_order")


def _validate_effects_loops(loops: Any) -> None:
    if loops is None:
        return
    if not isinstance(loops, list):
        _raise_validation_error(
            "$.effects_loops",
            "effects_loops must be an array",
            "Persist effects_loops as a list of loop objects or omit the key.",
        )
    for index, loop in enumerate(loops):
        path = f"$.effects_loops[{index}]"
        loop_map = _require_mapping_entry(loop, path)
        _require_non_empty_string(loop_map.get("id"), f"{path}.id", "Assign a stable effects loop identifier.")
        insertions = loop_map.get("insertions")
        if insertions is None:
            continue
        if not isinstance(insertions, list):
            _raise_validation_error(
                f"{path}.insertions",
                "insertions must be an array",
                "Persist insertions as a list of insertion objects or omit the key.",
            )
        for i_index, insertion in enumerate(insertions):
            i_path = f"{path}.insertions[{i_index}]"
            insertion_map = _require_mapping_entry(insertion, i_path)
            _require_non_empty_string(
                insertion_map.get("after_node"),
                f"{i_path}.after_node",
                "Persist after_node as the stable id of the node this insertion follows.",
            )
            if not isinstance(insertion_map.get("enabled"), bool):
                _raise_validation_error(
                    f"{i_path}.enabled",
                    "enabled must be a boolean",
                    "Persist insertion.enabled as true or false.",
                )
            mode = insertion_map.get("mode")
            if mode is not None and mode not in _ALLOWED_LOOP_INSERTION_MODES:
                _raise_validation_error(
                    f"{i_path}.mode",
                    f"mode must be one of {sorted(_ALLOWED_LOOP_INSERTION_MODES)!r}",
                    "Use serial_insert or parallel_send.",
                )
            blend_pct = insertion_map.get("blend_pct")
            if blend_pct is not None:
                if not isinstance(blend_pct, (int, float)) or not 0.0 <= float(blend_pct) <= 100.0:
                    _raise_validation_error(
                        f"{i_path}.blend_pct",
                        "blend_pct must be a number in [0.0, 100.0]",
                        "Persist insertion.blend_pct as a 0..100 percentage.",
                    )
            crossfade_ms = insertion_map.get("crossfade_ms")
            if crossfade_ms is not None:
                if not isinstance(crossfade_ms, int) or not 0 <= crossfade_ms <= 500:
                    _raise_validation_error(
                        f"{i_path}.crossfade_ms",
                        "crossfade_ms must be an integer in [0, 500]",
                        "Cap insertion.crossfade_ms at 500ms to match the engine's max crossfade.",
                    )


def _validate_controls_section(controls: Any) -> None:
    if controls is None:
        return
    controls_map = _require_mapping_value(
        controls,
        "$.controls",
        "Persist controls as an object with optional mappings + footswitch_labels + controller_display.",
    )
    mappings = controls_map.get("mappings")
    if mappings is not None:
        if not isinstance(mappings, list):
            _raise_validation_error(
                "$.controls.mappings",
                "mappings must be an array",
                "Persist controls.mappings as a list of mapping objects.",
            )
        for index, mapping in enumerate(mappings):
            path = f"$.controls.mappings[{index}]"
            mapping_map = _require_mapping_entry(mapping, path)
            source = mapping_map.get("source")
            if not isinstance(source, Mapping):
                _raise_validation_error(
                    f"{path}.source",
                    "source must be an object",
                    "Persist each mapping with an explicit {type: ..., ...} source object.",
                )
            source_type = source.get("type")
            if source_type not in _ALLOWED_CONTROL_SOURCE_TYPES:
                _raise_validation_error(
                    f"{path}.source.type",
                    f"type must be one of {sorted(_ALLOWED_CONTROL_SOURCE_TYPES)!r}",
                    "Use one of the day-1 source types.",
                )
            _require_non_empty_string(
                mapping_map.get("target"),
                f"{path}.target",
                "Persist target as an OSC path string, e.g. /channel/A/node/<id>/param/<name>.",
            )
            rng = mapping_map.get("range")
            if rng is not None:
                if (
                    not isinstance(rng, list)
                    or len(rng) != 2
                    or not all(isinstance(item, (int, float)) for item in rng)
                ):
                    _raise_validation_error(
                        f"{path}.range",
                        "range must be a two-element numeric array [min, max]",
                        "Persist mapping range as [min, max] numbers.",
                    )
            curve = mapping_map.get("curve")
            if curve is not None and curve not in _ALLOWED_CONTROL_CURVES:
                _raise_validation_error(
                    f"{path}.curve",
                    f"curve must be one of {sorted(_ALLOWED_CONTROL_CURVES)!r}",
                    "Use linear, logarithmic, exponential, toggle, or stepped.",
                )
    labels = controls_map.get("footswitch_labels")
    if labels is not None:
        if not isinstance(labels, Mapping):
            _raise_validation_error(
                "$.controls.footswitch_labels",
                "footswitch_labels must be an object",
                "Persist footswitch_labels as {'1': 'Boost', '2': 'Delay', ...}.",
            )
        for key, value in labels.items():
            if not isinstance(value, str):
                _raise_validation_error(
                    f"$.controls.footswitch_labels.{key}",
                    "label must be a string",
                    "Persist each footswitch label as a plain string.",
                )


def _validate_io_section(io: Any) -> None:
    if io is None:
        return
    io_map = _require_mapping_value(
        io,
        "$.io",
        "Persist io as an object with input_device + output_device + monitoring_output_index.",
    )
    monitoring = io_map.get("monitoring_output_index")
    if monitoring is not None and not isinstance(monitoring, int):
        _raise_validation_error(
            "$.io.monitoring_output_index",
            "monitoring_output_index must be an integer or null",
            "Persist io.monitoring_output_index as the numeric channel index.",
        )


def _validate_tempo_section(tempo: Any) -> None:
    if tempo is None:
        return
    tempo_map = _require_mapping_value(
        tempo,
        "$.tempo",
        "Persist tempo as an object with bpm.",
    )
    bpm = tempo_map.get("bpm")
    if bpm is not None:
        if not isinstance(bpm, (int, float)) or not 20.0 <= float(bpm) <= 300.0:
            _raise_validation_error(
                "$.tempo.bpm",
                "bpm must be a number in [20.0, 300.0]",
                "Clamp tempo.bpm into the musical 20–300 BPM range.",
            )


def _validate_output_safety(output_safety: Any) -> None:
    if output_safety is None:
        return
    safety_map = _require_mapping_value(
        output_safety,
        "$.output_safety",
        "Persist output_safety as an object with reference_dbfs + warning_threshold_db.",
    )
    reference = safety_map.get("reference_dbfs")
    if reference is not None:
        if not isinstance(reference, (int, float)) or float(reference) > 0.0:
            _raise_validation_error(
                "$.output_safety.reference_dbfs",
                "reference_dbfs must be a number <= 0.0",
                "Persist output_safety.reference_dbfs as a non-positive dBFS value.",
            )
    warning = safety_map.get("warning_threshold_db")
    if warning is not None:
        if not isinstance(warning, (int, float)) or float(warning) < 0.0:
            _raise_validation_error(
                "$.output_safety.warning_threshold_db",
                "warning_threshold_db must be a non-negative number",
                "Persist output_safety.warning_threshold_db as a non-negative dB delta.",
            )


def _validate_deployment_section(deployment: Any) -> None:
    if deployment is None:
        return
    deployment_map = _require_mapping_value(
        deployment,
        "$.deployment",
        "Persist deployment as an object with primary_node_id + standby_node_ids + status + strategy + redundancy_enabled + history.",
    )
    status = deployment_map.get("status")
    if status is not None and status not in _ALLOWED_DEPLOYMENT_STATUSES:
        _raise_validation_error(
            "$.deployment.status",
            f"status must be one of {sorted(_ALLOWED_DEPLOYMENT_STATUSES)!r}",
            "Use draft, staged, active, failing, or retired.",
        )
    strategy = deployment_map.get("strategy")
    if strategy is not None and strategy not in _ALLOWED_DEPLOYMENT_STRATEGIES:
        _raise_validation_error(
            "$.deployment.strategy",
            f"strategy must be one of {sorted(_ALLOWED_DEPLOYMENT_STRATEGIES)!r}",
            "Use manual, auto, or redundant.",
        )
    standby_ids = deployment_map.get("standby_node_ids")
    if standby_ids is not None:
        _require_list_of_strings(standby_ids, "$.deployment.standby_node_ids")
    history = deployment_map.get("history")
    if history is not None:
        if not isinstance(history, list):
            _raise_validation_error(
                "$.deployment.history",
                "history must be an array",
                "Persist deployment.history as an ordered list of event objects.",
            )
        if len(history) > 20:
            _raise_validation_error(
                "$.deployment.history",
                f"history has {len(history)} entries, max is 20",
                "Prune deployment.history to the 20 most recent entries before persisting.",
            )
        for index, event in enumerate(history):
            event_map = _require_mapping_entry(event, f"$.deployment.history[{index}]")
            _require_non_empty_string(
                event_map.get("timestamp"),
                f"$.deployment.history[{index}].timestamp",
                "Persist history entry timestamp as an ISO-8601 string.",
            )
            _require_non_empty_string(
                event_map.get("action"),
                f"$.deployment.history[{index}].action",
                "Persist history entry action as a non-empty descriptor string.",
            )


def _validate_templates_section(templates: Any) -> None:
    if templates is None:
        return
    templates_map = _require_mapping_value(
        templates,
        "$.templates",
        "Persist templates as an object with base + overlays + linked.",
    )
    base = templates_map.get("base")
    if base is not None and (not isinstance(base, str) or not base.strip()):
        _raise_validation_error(
            "$.templates.base",
            "base must be null or a non-empty string",
            "Persist templates.base as null or the base template identifier.",
        )
    overlays = templates_map.get("overlays")
    if overlays is not None:
        _require_list_of_strings(overlays, "$.templates.overlays")
    linked = templates_map.get("linked")
    if linked is not None and not isinstance(linked, bool):
        _raise_validation_error(
            "$.templates.linked",
            "linked must be a boolean",
            "Persist templates.linked as true or false.",
        )


def _raise_validation_error(path: str, message: str, guidance: str) -> None:
    raise GraphDocumentValidationError(path=path, message=message, guidance=guidance)
