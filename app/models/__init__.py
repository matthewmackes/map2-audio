"""
Shared Pydantic models exposed from `app.models`.

Legacy route-facing models live directly in this package, and node-display
schemas remain exposed from `app.models.node`.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .node import *  # noqa: F401,F403


class PluginResponse(BaseModel):
    """Plugin information response."""

    uri: str
    name: str
    category: str = "Unclassified"
    parameters: List[Dict[str, Any]] = []
    audio_in: int = 0
    audio_out: int = 2


class ChainResponse(BaseModel):
    """Signal chain response."""

    id: int
    name: str
    is_active: bool = False
    plugins: List[str] = []


class MIDIDeviceResponse(BaseModel):
    """MIDI device information."""

    index: int
    name: str
    type: str


class AudioStatusResponse(BaseModel):
    """Audio engine status."""

    running: bool
    sample_rate: int
    buffer_size: int
    channels: int
    cpu_load: float = 0.0


class SystemHealthResponse(BaseModel):
    """System health status."""

    status: str
    uptime_seconds: float
    cpu_percent: float
    memory_mb: float
    audio_running: bool
    plugins_loaded: int


class SpecialSettingsLandingTile(BaseModel):
    """Landing-page launcher tile placement."""

    route: str
    size: Literal["small", "medium", "large"] = "medium"


class SpecialSettingsResponse(BaseModel):
    """Special mode settings response."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    hidden_plugins: List[str] = []
    menu_location: str = "hidden"
    pinned_routes: List[str] = Field(default_factory=list)
    landing_tiles: List[SpecialSettingsLandingTile] = Field(default_factory=list)
    snapshot_setlist_mode: bool = False
    snapshot_setlist_order: List[int] = Field(default_factory=list)
    snapshot_editor_flow_animation: Literal[
        "off",
        "dashmarch",
        "pulse",
        "packet",
        "morse",
        "reverse",
        "scan",
        "shimmer",
        "heartbeat",
        "ants",
        "slow",
        "cascade",
    ] = Field(default="cascade", alias="snapshot_editor.flow_animation")
    snapshot_editor_grid_backdrop: bool = Field(default=True, alias="snapshot_editor.grid_backdrop")
    snapshot_editor_node_shape: Literal["square", "rounded", "hex"] = Field(
        default="square",
        alias="snapshot_editor.node_shape",
    )
    # T2454: ordered list of snapshot ids (max 5) the operator has explicitly
    # pinned for preload. Cap enforced in normalize_snapshot_preload_pins.
    snapshot_preload_pins: List[int] = Field(default_factory=list)
    last_active_node: Optional[str] = None
    version: int = 1
    last_updated: Optional[str] = None
    updated_by_node: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_routes(cls, data):
        if isinstance(data, dict) and "pinned_routes" not in data and "promoted_advanced_routes" in data:
            data = dict(data)
            data["pinned_routes"] = data.get("promoted_advanced_routes") or []
        return data


class SpecialSettingsUpdateRequest(BaseModel):
    """Request to update special settings."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    hidden_plugins: List[str]
    menu_location: str
    pinned_routes: List[str] = Field(default_factory=list)
    landing_tiles: List[SpecialSettingsLandingTile] = Field(default_factory=list)
    snapshot_setlist_mode: bool = False
    snapshot_setlist_order: List[int] = Field(default_factory=list)
    snapshot_editor_flow_animation: Literal[
        "off",
        "dashmarch",
        "pulse",
        "packet",
        "morse",
        "reverse",
        "scan",
        "shimmer",
        "heartbeat",
        "ants",
        "slow",
        "cascade",
    ] = Field(default="cascade", alias="snapshot_editor.flow_animation")
    snapshot_editor_grid_backdrop: bool = Field(default=True, alias="snapshot_editor.grid_backdrop")
    snapshot_editor_node_shape: Literal["square", "rounded", "hex"] = Field(
        default="square",
        alias="snapshot_editor.node_shape",
    )
    snapshot_preload_pins: List[int] = Field(default_factory=list)
    last_active_node: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_routes(cls, data):
        if isinstance(data, dict) and "pinned_routes" not in data and "promoted_advanced_routes" in data:
            data = dict(data)
            data["pinned_routes"] = data.get("promoted_advanced_routes") or []
        return data
