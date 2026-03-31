"""Persistent configuration for the Push surface subsystem."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.services.push_surface.models.capabilities import SurfaceColor


RUNTIME_CONFIG_FIELDS: tuple[str, ...] = (
    "enabled",
    "preferred_profile",
    "input_port_name",
    "output_port_name",
    "bank_size",
    "encoder_acceleration",
    "selection_behavior",
    "safe_mode",
    "routing_write_permissions",
    "experimental_protocol",
    "diagnostics_directory",
    "auto_reconnect_interval_s",
    "rest_base_url",
    "websocket_url",
    "default_bridge",
)


def _default_config_path() -> Path:
    return Path(os.getenv("MAP2_PUSH_SURFACE_CONFIG", Path.home() / ".map2" / "push_surface.json"))


def _load_runtime_config_overrides(defaults: "PushSurfaceConfig") -> dict[str, Any]:
    try:
        from app.config import get_config as get_runtime_config_manager
    except Exception:
        return {}

    runtime_config = get_runtime_config_manager()
    overrides: dict[str, Any] = {}
    for field_name in RUNTIME_CONFIG_FIELDS:
        runtime_key = f"push_surface.{field_name}"
        default_value = getattr(defaults, field_name)
        runtime_value = runtime_config.get(runtime_key, default_value)
        if runtime_value != default_value:
            overrides[field_name] = runtime_value
    return overrides


@dataclass
class PushSurfaceConfig:
    """Persisted operator configuration for Push surface behavior."""

    enabled: bool = False
    preferred_profile: str | None = None
    input_port_id: str | None = None
    output_port_id: str | None = None
    input_port_name: str | None = None
    output_port_name: str | None = None
    bank_size: int = 8
    encoder_acceleration: float = 1.0
    selection_behavior: str = "press_select_press_open"
    safe_mode: bool = True
    routing_write_permissions: str = "confirm"
    experimental_protocol: bool = False
    diagnostics_directory: str = str(Path.home() / ".map2" / "push_surface" / "diagnostics")
    auto_reconnect_interval_s: float = 1.0
    rest_base_url: str = "http://127.0.0.1:8080"
    websocket_url: str = "ws://127.0.0.1:8080/ws/events"
    default_bridge: str = "direct"
    category_colors: dict[str, str] = field(
        default_factory=lambda: {
            "input": SurfaceColor.GREEN.value,
            "amp": SurfaceColor.ORANGE.value,
            "cab/ir": SurfaceColor.AMBER.value,
            "eq/filter": SurfaceColor.YELLOW.value,
            "dynamics": SurfaceColor.CYAN.value,
            "modulation": SurfaceColor.BLUE.value,
            "delay": SurfaceColor.MAGENTA.value,
            "reverb": SurfaceColor.WHITE.value,
            "utility": SurfaceColor.DIM.value,
            "avb i/o": SurfaceColor.GREEN.value,
            "midi/router": SurfaceColor.CYAN.value,
            "unknown": SurfaceColor.WHITE.value,
        }
    )

    @classmethod
    def load(cls, path: Path | None = None) -> "PushSurfaceConfig":
        config_path = path or _default_config_path()
        known: dict[str, Any] = {}
        if not config_path.exists():
            loaded = cls()
            loaded.apply_updates(_load_runtime_config_overrides(loaded))
            return loaded
        try:
            payload = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            loaded = cls()
            loaded.apply_updates(_load_runtime_config_overrides(loaded))
            return loaded
        if isinstance(payload, dict):
            field_names = set(cls.__dataclass_fields__.keys())
            for key, value in payload.items():
                if key in field_names:
                    known[key] = value
        loaded = cls(**known)
        loaded.apply_updates(_load_runtime_config_overrides(loaded))
        return loaded

    def save(self, path: Path | None = None) -> Path:
        config_path = path or _default_config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(asdict(self), indent=2, sort_keys=True), encoding="utf-8")
        return config_path

    def apply_updates(self, updates: dict[str, Any]) -> None:
        field_names = set(self.__dataclass_fields__.keys())
        for key, value in updates.items():
            if key in field_names:
                setattr(self, key, value)

    def runtime_config_payload(self) -> dict[str, Any]:
        return {field_name: getattr(self, field_name) for field_name in RUNTIME_CONFIG_FIELDS}

    def color_for_category(self, category: str) -> SurfaceColor:
        value = self.category_colors.get(str(category or "").strip().lower(), self.category_colors["unknown"])
        try:
            return SurfaceColor(value)
        except ValueError:
            return SurfaceColor.WHITE
