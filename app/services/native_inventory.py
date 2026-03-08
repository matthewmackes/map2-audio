"""
Native JUCE inventory readiness helpers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from app.config import config_get

_REPO_ROOT = Path(__file__).resolve().parents[2]
_JUCE_CATALOG_PATH = _REPO_ROOT / "app" / "deployment" / "juce_processors.json"


def load_native_catalog() -> List[str]:
    if not _JUCE_CATALOG_PATH.exists():
        return []
    try:
        payload = json.loads(_JUCE_CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    processors = payload.get("processors", [])
    if not isinstance(processors, list):
        return []

    uris: List[str] = []
    for item in processors:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri", "")).strip()
        if uri.startswith("map2://juce/"):
            uris.append(uri)

    # deterministic unique order
    seen = set()
    unique: List[str] = []
    for uri in uris:
        if uri in seen:
            continue
        seen.add(uri)
        unique.append(uri)
    return unique


def _is_native_uri(uri: str) -> bool:
    return str(uri).startswith("map2://juce/")


async def probe_native_loadability(*, probe_load: bool = False, limit: int | None = None) -> Dict[str, Any]:
    catalog = load_native_catalog()
    limit_value = int(limit) if isinstance(limit, int) and limit > 0 else len(catalog)
    target_uris = catalog[:limit_value]

    result: Dict[str, Any] = {
        "catalog_count": len(catalog),
        "probe_count": len(target_uris),
        "loadable_count": 0,
        "failed_count": 0,
        "failed_uris": [],
        "probe_load": bool(probe_load),
        "required": bool(config_get("plugins.native_inventory_required", True)),
        "minimum_loadable": int(config_get("plugins.native_inventory_min_loadable", 1)),
    }

    if not probe_load:
        result["state"] = "catalog_only"
        result["ready"] = result["catalog_count"] >= result["minimum_loadable"]
        return result

    try:
        from app.services.juce_engine_service import get_audio_engine

        engine = get_audio_engine()
        if not (engine and engine.is_available and engine.is_running):
            result["state"] = "engine_unavailable"
            result["ready"] = False
            return result

        for uri in target_uris:
            instance_id = await engine.load_plugin(uri)
            if isinstance(instance_id, int) and instance_id > 0:
                result["loadable_count"] += 1
                try:
                    await engine.unload_plugin(instance_id)
                except Exception:
                    pass
            else:
                result["failed_count"] += 1
                result["failed_uris"].append(uri)

        result["state"] = "probed"
    except Exception as exc:
        result["state"] = "probe_error"
        result["error"] = str(exc)
        result["ready"] = False
        return result

    min_loadable = max(1, int(result["minimum_loadable"]))
    result["ready"] = result["loadable_count"] >= min_loadable
    return result


async def evaluate_inventory_gate(*, probe_load: bool = False) -> Dict[str, Any]:
    payload = await probe_native_loadability(probe_load=probe_load)
    required = bool(payload.get("required", True))
    ready = bool(payload.get("ready", False))
    payload["gate_pass"] = ready or not required
    payload["gate_mode"] = "required" if required else "warn"
    return payload


def filter_native_uris(uris: List[str]) -> List[str]:
    seen = set()
    filtered: List[str] = []
    for uri in uris:
        if not _is_native_uri(uri):
            continue
        if uri in seen:
            continue
        seen.add(uri)
        filtered.append(uri)
    return filtered
