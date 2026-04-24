"""
Runtime profile policy helpers.

Provides node-type-aware runtime profile semantics used by API routes
and plugin residency controls.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

from app.config import config_get, config_set
from app.deployment.deployment import DeploymentMode, get_deployment_config

PROFILE_EDIT = "Edit"
PROFILE_PERFORMANCE = "Performance"
PROFILE_CONTROL_ONLY = "N/A"

_AUDIO_NODE_TYPES = {
    DeploymentMode.ALL_IN_ONE.value,
    DeploymentMode.AUDIO_NODE.value,
}


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_node_type(node_type: str | None) -> str:
    candidate = str(node_type or "").strip().upper()
    if candidate in {
        DeploymentMode.ALL_IN_ONE.value,
        DeploymentMode.AUDIO_NODE.value,
        DeploymentMode.CONTROL_NODE.value,
        DeploymentMode.FRONTEND_ONLY.value,
    }:
        return candidate
    return DeploymentMode.ALL_IN_ONE.value


def get_node_type() -> str:
    # T2437: prefer the canonical authority resolver. If it raises
    # (circular import during boot, missing module, etc.) we fall back to
    # the legacy path so the audio runtime is never starved of a mode.
    try:
        from app.deployment.authority import resolve_deployment_mode

        return normalize_node_type(resolve_deployment_mode())
    except Exception:
        pass
    try:
        return normalize_node_type(get_deployment_config().mode.value)
    except Exception:
        return normalize_node_type(os.getenv("MAP2_DEPLOYMENT_MODE", DeploymentMode.ALL_IN_ONE.value))


def is_audio_capable_node(node_type: str | None = None) -> bool:
    return normalize_node_type(node_type or get_node_type()) in _AUDIO_NODE_TYPES


def _normalize_profile(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in {"edit"}:
        return PROFILE_EDIT
    if candidate in {"performance", "perf"}:
        return PROFILE_PERFORMANCE
    if candidate in {"n/a", "na", "control", "control-only"}:
        return PROFILE_CONTROL_ONLY
    return ""


def get_default_profile(node_type: str | None = None) -> str:
    resolved_node = normalize_node_type(node_type or get_node_type())
    if resolved_node == DeploymentMode.AUDIO_NODE.value:
        return PROFILE_PERFORMANCE
    if resolved_node == DeploymentMode.ALL_IN_ONE.value:
        boot_profile = _normalize_profile(os.getenv("MAP2_RUNTIME_BOOT_PROFILE", ""))
        if boot_profile in {PROFILE_EDIT, PROFILE_PERFORMANCE}:
            return boot_profile
        if _truthy(os.getenv("MAP2_HEADLESS_LIVE", "")):
            return PROFILE_PERFORMANCE
        return PROFILE_EDIT
    return PROFILE_CONTROL_ONLY


def get_supported_profiles(node_type: str | None = None) -> List[str]:
    if is_audio_capable_node(node_type):
        return [PROFILE_EDIT, PROFILE_PERFORMANCE]
    return [PROFILE_CONTROL_ONLY]


def get_profile_policy(profile: str, node_type: str | None = None) -> Dict[str, Any]:
    resolved_node = normalize_node_type(node_type or get_node_type())
    normalized = _normalize_profile(profile)
    if not is_audio_capable_node(resolved_node):
        return {
            "graph_mutation_policy": "disabled",
            "target_buffer_size": None,
            "effect_residency_default": False,
            "allow_plugin_churn": False,
            "rt_hardening_mode": "not_applicable",
            "native_inventory_gate": "not_applicable",
            "label": PROFILE_CONTROL_ONLY,
        }

    if normalized == PROFILE_PERFORMANCE:
        return {
            "graph_mutation_policy": "frozen",
            "target_buffer_size": 64,
            "effect_residency_default": True,
            "allow_plugin_churn": False,
            "rt_hardening_mode": "enforce",
            "native_inventory_gate": "required",
            "label": PROFILE_PERFORMANCE,
        }

    return {
        "graph_mutation_policy": "guarded",
        "target_buffer_size": 128,
        "effect_residency_default": False,
        "allow_plugin_churn": True,
        "rt_hardening_mode": "monitor",
        "native_inventory_gate": "warn",
        "label": PROFILE_EDIT,
    }


def get_current_profile(node_type: str | None = None) -> str:
    resolved_node = normalize_node_type(node_type or get_node_type())
    configured = _normalize_profile(config_get("audio.runtime_profile", ""))
    allowed = set(get_supported_profiles(resolved_node))
    if configured and configured in allowed:
        return configured
    return get_default_profile(resolved_node)


def get_runtime_profile_status(node_type: str | None = None) -> Dict[str, Any]:
    resolved_node = normalize_node_type(node_type or get_node_type())
    current_profile = get_current_profile(resolved_node)
    default_profile = get_default_profile(resolved_node)
    supported_profiles = get_supported_profiles(resolved_node)
    policy = get_profile_policy(current_profile, resolved_node)
    return {
        "node_type": resolved_node,
        "audio_capable": is_audio_capable_node(resolved_node),
        "supported_profiles": supported_profiles,
        "default_profile": default_profile,
        "current_profile": current_profile,
        "profile_policy": policy,
    }


def get_capability_matrix() -> Dict[str, Dict[str, Any]]:
    matrix: Dict[str, Dict[str, Any]] = {}
    for node_type in [
        DeploymentMode.ALL_IN_ONE.value,
        DeploymentMode.AUDIO_NODE.value,
        DeploymentMode.CONTROL_NODE.value,
        DeploymentMode.FRONTEND_ONLY.value,
    ]:
        default_profile = get_default_profile(node_type)
        matrix[node_type] = {
            "audio_capable": is_audio_capable_node(node_type),
            "supported_profiles": get_supported_profiles(node_type),
            "default_profile": default_profile,
            "default_policy": get_profile_policy(default_profile, node_type),
        }
    return matrix


def apply_runtime_profile(profile: str, *, node_type: str | None = None) -> Dict[str, Any]:
    resolved_node = normalize_node_type(node_type or get_node_type())
    normalized = _normalize_profile(profile)
    supported = get_supported_profiles(resolved_node)
    if normalized not in supported:
        raise ValueError(
            f"Profile '{profile}' is not supported for node type '{resolved_node}'. "
            f"Allowed: {', '.join(supported)}"
        )

    if normalized == PROFILE_CONTROL_ONLY:
        raise ValueError(f"Node type '{resolved_node}' does not support audio runtime profile switching.")

    policy = get_profile_policy(normalized, resolved_node)
    config_set("audio.runtime_profile", normalized)
    config_set("audio.graph_mutation_policy", policy["graph_mutation_policy"])
    config_set("plugins.effect_residency", bool(policy["effect_residency_default"]))
    config_set("plugins.allow_plugin_churn", bool(policy["allow_plugin_churn"]))

    return {
        "node_type": resolved_node,
        "applied_profile": normalized,
        "policy": policy,
    }


def get_standard_defaults_matrix() -> Dict[str, Dict[str, Any]]:
    """
    Canonical defaults matrix for features:
    1) runtime profile
    3) effect residency
    5) RT hardening
    7) native JUCE inventory gate
    """
    return {
        "dev": {
            "runtime_profile_audio_node": PROFILE_PERFORMANCE,
            "runtime_profile_all_in_one": PROFILE_EDIT,
            "effect_residency_default": False,
            "rt_hardening_policy": "monitor_only",
            "native_inventory_gate": "warn",
            "kill_switches": {
                "runtime_profile_switch": "MAP2_DISABLE_RUNTIME_PROFILE_SWITCH",
                "effect_residency": "MAP2_DISABLE_EFFECT_RESIDENCY",
                "rt_hardening": "MAP2_DISABLE_RT_HARDENING",
                "native_inventory_gate": "MAP2_DISABLE_NATIVE_INVENTORY_GATE",
            },
        },
        "lab": {
            "runtime_profile_audio_node": PROFILE_PERFORMANCE,
            "runtime_profile_all_in_one": PROFILE_PERFORMANCE,
            "effect_residency_default": True,
            "rt_hardening_policy": "enforce_and_verify",
            "native_inventory_gate": "fail",
            "kill_switches": {
                "runtime_profile_switch": "MAP2_DISABLE_RUNTIME_PROFILE_SWITCH",
                "effect_residency": "MAP2_DISABLE_EFFECT_RESIDENCY",
                "rt_hardening": "MAP2_DISABLE_RT_HARDENING",
                "native_inventory_gate": "MAP2_DISABLE_NATIVE_INVENTORY_GATE",
            },
        },
        "release": {
            "runtime_profile_audio_node": PROFILE_PERFORMANCE,
            "runtime_profile_all_in_one": PROFILE_PERFORMANCE,
            "effect_residency_default": True,
            "rt_hardening_policy": "required",
            "native_inventory_gate": "fail",
            "kill_switches": {
                "runtime_profile_switch": "MAP2_DISABLE_RUNTIME_PROFILE_SWITCH",
                "effect_residency": "MAP2_DISABLE_EFFECT_RESIDENCY",
                "rt_hardening": "MAP2_DISABLE_RT_HARDENING",
                "native_inventory_gate": "MAP2_DISABLE_NATIVE_INVENTORY_GATE",
            },
        },
    }
