from __future__ import annotations

import hashlib
import json
import os
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Optional

from app.utils.singleton import Singleton

DEFAULT_APPEARANCE_FILE = Path(os.path.expanduser("~/.config/map2/plugin_appearance_overrides.json"))
MAX_CUSTOM_SVG_BYTES = 32 * 1024


def _normalize_hex_color(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None

    trimmed = value.strip()
    if len(trimmed) == 4 and trimmed.startswith("#"):
        chars = trimmed[1:]
        if all(char in "0123456789abcdefABCDEF" for char in chars):
            return f"#{chars[0] * 2}{chars[1] * 2}{chars[2] * 2}".lower()

    if len(trimmed) == 7 and trimmed.startswith("#") and all(char in "0123456789abcdefABCDEF" for char in trimmed[1:]):
        return trimmed.lower()

    return None


def _validate_svg_markup(svg_text: str) -> str:
    stripped = svg_text.strip()
    if not stripped:
        raise ValueError("Custom SVG payload cannot be empty.")
    encoded = stripped.encode("utf-8")
    if len(encoded) > MAX_CUSTOM_SVG_BYTES:
        raise ValueError(f"Custom SVG payload exceeds {MAX_CUSTOM_SVG_BYTES} bytes.")
    lowered = stripped.lower()
    if "<svg" not in lowered or "</svg>" not in lowered:
        raise ValueError("Custom icon uploads must be valid SVG markup.")
    return stripped


def _normalize_override_payload(uri: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {"uri": uri}

    accent = _normalize_hex_color(payload.get("accent_color"))
    if accent:
        normalized["accent_color"] = accent

    dark_variant = _normalize_hex_color(payload.get("dark_variant"))
    if dark_variant:
        normalized["dark_variant"] = dark_variant

    light_variant = _normalize_hex_color(payload.get("light_variant"))
    if light_variant:
        normalized["light_variant"] = light_variant

    icon_id = payload.get("icon_identifier")
    if isinstance(icon_id, str) and icon_id.strip():
        normalized["icon_identifier"] = icon_id.strip()

    custom_svg = payload.get("custom_svg")
    if isinstance(custom_svg, str) and custom_svg.strip():
        normalized["custom_svg"] = _validate_svg_markup(custom_svg)

    description = payload.get("description")
    if isinstance(description, str):
        trimmed = description.strip()
        if trimmed:
            normalized["description"] = trimmed

    return normalized


class PluginAppearanceService(Singleton):
    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = Path(storage_path or os.getenv("MAP2_PLUGIN_APPEARANCES_FILE") or DEFAULT_APPEARANCE_FILE)
        self._lock = threading.RLock()

    @property
    def storage_path(self) -> Path:
        return self._storage_path

    def _read_store(self) -> Dict[str, Dict[str, Any]]:
        if not self._storage_path.exists():
            return {}
        with self._storage_path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
        if not isinstance(raw, dict):
            return {}
        normalized: Dict[str, Dict[str, Any]] = {}
        for uri, payload in raw.items():
            if not isinstance(uri, str) or not isinstance(payload, dict):
                continue
            normalized_payload = _normalize_override_payload(uri, payload)
            if len(normalized_payload) > 1:
                normalized[uri] = normalized_payload
        return normalized

    def _write_store(self, store: Dict[str, Dict[str, Any]]) -> None:
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        with self._storage_path.open("w", encoding="utf-8") as handle:
            json.dump(store, handle, indent=2, sort_keys=True)
            handle.write("\n")

    def list_overrides(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            return deepcopy(self._read_store())

    def get_override(self, uri: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            store = self._read_store()
            payload = store.get(uri)
            return deepcopy(payload) if payload is not None else None

    def put_override(self, uri: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            store = self._read_store()
            normalized = _normalize_override_payload(uri, payload)
            if len(normalized) <= 1:
                store.pop(uri, None)
                self._write_store(store)
                return {"uri": uri}
            store[uri] = normalized
            self._write_store(store)
            return deepcopy(normalized)

    def delete_override(self, uri: str) -> bool:
        with self._lock:
            store = self._read_store()
            removed = uri in store
            if removed:
                store.pop(uri, None)
                self._write_store(store)
            return removed

    def put_custom_icon(self, uri: str, svg_text: str) -> Dict[str, Any]:
        with self._lock:
            store = self._read_store()
            normalized_svg = _validate_svg_markup(svg_text)
            digest = hashlib.sha1(f"{uri}:{normalized_svg}".encode("utf-8")).hexdigest()[:12]
            payload = store.get(uri, {"uri": uri})
            payload = _normalize_override_payload(uri, payload)
            payload["custom_svg"] = normalized_svg
            payload["icon_identifier"] = f"custom:{digest}"
            store[uri] = payload
            self._write_store(store)
            return deepcopy(payload)


def get_plugin_appearance_service() -> PluginAppearanceService:
    return PluginAppearanceService.get_instance()
