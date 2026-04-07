from __future__ import annotations

from typing import Any

from app.config import get_config
from app.services.plugin_uris import NOISE_GATE_PLUGIN_URI
NOISE_GATE_SYSTEM_ROLE = "noise_gate"
NOISE_GATE_THRESHOLD_CONFIG_KEY = "snapshots.global_noise_gate_threshold_db"
NOISE_GATE_RELEASE_CONFIG_KEY = "snapshots.global_noise_gate_release_ms"
DEFAULT_NOISE_GATE_THRESHOLD_DB = -40.0
DEFAULT_NOISE_GATE_RELEASE_MS = 100.0
DEFAULT_NOISE_GATE_RATIO = 10.0
DEFAULT_NOISE_GATE_ATTACK_MS = 1.0
SYSTEM_BLOCK_BADGE_LABEL = "SYS"


def get_global_noise_gate_defaults() -> dict[str, float]:
    config = get_config()
    threshold = config.get_float(
        NOISE_GATE_THRESHOLD_CONFIG_KEY,
        DEFAULT_NOISE_GATE_THRESHOLD_DB,
    )
    release = config.get_float(
        NOISE_GATE_RELEASE_CONFIG_KEY,
        DEFAULT_NOISE_GATE_RELEASE_MS,
    )
    return {
        "threshold_db": threshold,
        "release_ms": release,
    }


def build_system_noise_gate_parameters(
    parameters: dict[str, Any] | None = None,
) -> dict[str, float]:
    defaults = get_global_noise_gate_defaults()
    payload = dict(parameters or {})
    threshold = payload.get("threshold", defaults["threshold_db"])
    release = payload.get("release", defaults["release_ms"])
    ratio = payload.get("ratio", DEFAULT_NOISE_GATE_RATIO)
    attack = payload.get("attack", DEFAULT_NOISE_GATE_ATTACK_MS)

    def _coerce(value: Any, fallback: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    return {
        "threshold": _coerce(threshold, defaults["threshold_db"]),
        "ratio": _coerce(ratio, DEFAULT_NOISE_GATE_RATIO),
        "attack": _coerce(attack, DEFAULT_NOISE_GATE_ATTACK_MS),
        "release": _coerce(release, defaults["release_ms"]),
    }


def build_system_noise_gate_loader_state(
    loader_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(loader_state or {})
    payload["system_block_role"] = NOISE_GATE_SYSTEM_ROLE
    payload["system_block_locked"] = True
    payload["system_block_label"] = SYSTEM_BLOCK_BADGE_LABEL
    return payload


def is_system_noise_gate_loader_state(loader_state: Any) -> bool:
    return (
        isinstance(loader_state, dict)
        and loader_state.get("system_block_role") == NOISE_GATE_SYSTEM_ROLE
    )


def is_system_noise_gate_plugin_payload(plugin: Any) -> bool:
    return (
        isinstance(plugin, dict)
        and str(plugin.get("uri") or plugin.get("plugin_uri") or "").strip() == NOISE_GATE_PLUGIN_URI
        and is_system_noise_gate_loader_state(plugin.get("loader_state"))
    )


def build_system_noise_gate_plugin(
    *,
    position: int = 0,
    name: str = "Noise Gate",
    parameters: dict[str, Any] | None = None,
    loader_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "uri": NOISE_GATE_PLUGIN_URI,
        "name": name,
        "position": int(position),
        "bypass": False,
        "parameters": build_system_noise_gate_parameters(parameters),
        "loader_state": build_system_noise_gate_loader_state(loader_state),
        "is_placeholder": False,
    }


def ensure_system_noise_gate_at_chain_head(
    plugins: list[dict[str, Any]] | None,
    *,
    apply_defaults: bool,
) -> list[dict[str, Any]]:
    ordered_plugins = [
        dict(plugin)
        for plugin in (plugins or [])
        if isinstance(plugin, dict)
    ]
    ordered_plugins.sort(key=lambda plugin: int(plugin.get("position", 0)))

    system_gate_index = next(
        (
            index
            for index, plugin in enumerate(ordered_plugins)
            if is_system_noise_gate_plugin_payload(plugin)
        ),
        None,
    )

    if system_gate_index is None and apply_defaults:
        ordered_plugins.insert(0, build_system_noise_gate_plugin(position=0))
    elif system_gate_index is not None:
        system_gate = ordered_plugins.pop(system_gate_index)
        normalized_gate = build_system_noise_gate_plugin(
            position=0,
            name=str(system_gate.get("name") or "Noise Gate"),
            parameters=system_gate.get("parameters") if isinstance(system_gate.get("parameters"), dict) else None,
            loader_state=system_gate.get("loader_state") if isinstance(system_gate.get("loader_state"), dict) else None,
        )
        ordered_plugins.insert(0, normalized_gate)

    normalized_plugins: list[dict[str, Any]] = []
    for index, plugin in enumerate(ordered_plugins):
        normalized_plugin = dict(plugin)
        normalized_plugin["position"] = index
        normalized_plugins.append(normalized_plugin)
    return normalized_plugins


def default_chain_system_blocks() -> list[dict[str, Any]]:
    return [{
        "role": NOISE_GATE_SYSTEM_ROLE,
        "plugin_uri": NOISE_GATE_PLUGIN_URI,
        "position": 0,
        "label": SYSTEM_BLOCK_BADGE_LABEL,
    }]


def extract_chain_system_blocks(plugins: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    descriptors: list[dict[str, Any]] = []
    for plugin in plugins or []:
        if not is_system_noise_gate_plugin_payload(plugin):
            continue
        descriptors.append({
            "role": NOISE_GATE_SYSTEM_ROLE,
            "plugin_uri": NOISE_GATE_PLUGIN_URI,
            "position": int(plugin.get("position", 0)),
            "label": SYSTEM_BLOCK_BADGE_LABEL,
        })
    return descriptors


def chain_system_block_descriptor_for_plugin(
    system_blocks: list[dict[str, Any]] | None,
    *,
    plugin_uri: str,
    plugin_position: int,
) -> dict[str, Any] | None:
    for descriptor in system_blocks or []:
        if not isinstance(descriptor, dict):
            continue
        if descriptor.get("plugin_uri") != plugin_uri:
            continue
        try:
            descriptor_position = int(descriptor.get("position", -1))
        except (TypeError, ValueError):
            continue
        if descriptor_position == plugin_position:
            return descriptor
    return None


def is_system_noise_gate_descriptor(descriptor: Any) -> bool:
    return (
        isinstance(descriptor, dict)
        and descriptor.get("role") == NOISE_GATE_SYSTEM_ROLE
        and descriptor.get("plugin_uri") == NOISE_GATE_PLUGIN_URI
    )
