"""
Pydantic Response Models
Schemas for API responses.
"""

from pydantic import BaseModel
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
    enabled: bool = False
    hidden_plugins: List[str] = []
    menu_location: str = "top-nav"
    promoted_advanced_routes: List[str] = ["/welcome", "/grid"]
    version: int = 1
    last_updated: Optional[str] = None  # ISO timestamp
    updated_by_node: Optional[str] = None


class SpecialSettingsUpdateRequest(BaseModel):
    """Request to update special settings."""
    enabled: bool
    hidden_plugins: List[str]
    menu_location: str  # "top-nav" | "mobile-only" | "hidden"
    promoted_advanced_routes: List[str] = ["/welcome", "/grid"]


class PasswordAuthRequest(BaseModel):
    """Password authentication request."""
    password: str


class PasswordAuthResponse(BaseModel):
    """Password authentication response."""
    success: bool
    message: str = ""
