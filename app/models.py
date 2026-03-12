"""
Pydantic Response Models
Schemas for API responses.
"""

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import List, Dict, Any, Optional


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
    plugins: List[str] = []  # Plugin URIs


class MIDIDeviceResponse(BaseModel):
    """MIDI device information."""
    index: int
    name: str
    type: str  # "input" or "output"


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


class SpecialSettingsResponse(BaseModel):
    """Special mode settings response."""
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    hidden_plugins: List[str] = []
    menu_location: str = "top-nav"
    pinned_routes: List[str] = Field(default_factory=list)
    last_active_node: Optional[str] = None
    version: int = 1
    last_updated: Optional[str] = None  # ISO timestamp
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
    menu_location: str  # "top-nav" | "mobile-only" | "hidden"
    pinned_routes: List[str] = Field(default_factory=list)
    last_active_node: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_routes(cls, data):
        if isinstance(data, dict) and "pinned_routes" not in data and "promoted_advanced_routes" in data:
            data = dict(data)
            data["pinned_routes"] = data.get("promoted_advanced_routes") or []
        return data


class PasswordAuthRequest(BaseModel):
    """Password authentication request."""
    password: str


class PasswordAuthResponse(BaseModel):
    """Password authentication response."""
    success: bool
    message: str = ""
