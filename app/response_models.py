"""
API Response Models

Standardized Pydantic models for all API responses.
Provides type safety, validation, and automatic OpenAPI documentation.
"""

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


# ==================== Standard Response Wrapper ====================

class StatusEnum(str, Enum):
    """Response status values."""
    SUCCESS = "success"
    ERROR = "error"
    WARNING = "warning"


class APIResponse(BaseModel):
    """Standard API response wrapper."""
    status: StatusEnum
    message: str
    data: Optional[Dict[str, Any]] = None
    errors: Optional[List[str]] = None
    timestamp: datetime = Field(default_factory=datetime.now)


# ==================== Plugin Responses ====================

class PluginInfo(BaseModel):
    """Plugin information."""
    uri: str
    name: str
    category: Optional[str] = None
    author: Optional[str] = None
    audio_inputs: int = 0
    audio_outputs: int = 0
    is_rt_safe: bool = False
    has_gui: bool = False


class PluginLoadResponse(BaseModel):
    """Response for plugin load operation."""
    success: bool
    instance_id: Optional[str] = None
    plugin_uri: str
    message: str
    position: Optional[int] = None


class PluginUnloadResponse(BaseModel):
    """Response for plugin unload operation."""
    success: bool
    instance_id: str
    message: str


class PluginListResponse(BaseModel):
    """Response for plugin list."""
    plugins: List[PluginInfo]
    total: int
    categories: Optional[List[str]] = None


class PluginParameterInfo(BaseModel):
    """Plugin parameter information."""
    index: int
    symbol: str
    name: str
    value: float
    default: float
    minimum: float
    maximum: float
    is_integer: bool = False
    is_toggled: bool = False
    is_logarithmic: bool = False
    unit: Optional[str] = None


class PluginParametersResponse(BaseModel):
    """Response for plugin parameters."""
    instance_id: str
    parameters: List[PluginParameterInfo]


# ==================== Chain Responses ====================

class ChainPluginInfo(BaseModel):
    """Plugin in a chain."""
    instance_id: str
    plugin_uri: str
    plugin_name: str
    position: int
    bypassed: bool = False


class ChainInfo(BaseModel):
    """Chain information."""
    id: int
    name: str
    plugins: List[ChainPluginInfo]
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ChainListResponse(BaseModel):
    """Response for chain list."""
    chains: List[ChainInfo]
    total: int
    active_chain_id: Optional[int] = None


class ChainCreateResponse(BaseModel):
    """Response for chain creation."""
    success: bool
    chain_id: int
    name: str
    message: str


# ==================== Audio Engine Responses ====================

class AudioDeviceInfo(BaseModel):
    """Audio device information."""
    index: int
    name: str
    channels_in: int
    channels_out: int
    sample_rate: float
    latency_ms: float
    is_input: bool
    is_output: bool
    is_default: bool = False


class AudioStatusResponse(BaseModel):
    """Audio engine status."""
    running: bool
    initialized: bool
    sample_rate: int
    buffer_size: int
    channels: int
    input_device: Optional[str] = None
    output_device: Optional[str] = None
    cpu_load: Optional[float] = None
    xrun_count: Optional[int] = None
    latency_ms: Optional[float] = None


class AudioDeviceListResponse(BaseModel):
    """Response for audio device list."""
    devices: List[AudioDeviceInfo]
    total: int
    default_input: Optional[int] = None
    default_output: Optional[int] = None


# ==================== MIDI Responses ====================

class MIDIDeviceInfo(BaseModel):
    """MIDI device information."""
    index: int
    name: str
    type: str  # "input" or "output"
    is_open: bool = False


class MIDIMappingInfo(BaseModel):
    """MIDI CC mapping information."""
    id: int
    channel: int
    cc_number: int
    plugin_uri: str
    parameter_index: int
    parameter_name: Optional[str] = None
    min_value: float = 0.0
    max_value: float = 1.0


class MIDIStatusResponse(BaseModel):
    """MIDI system status."""
    enabled: bool
    input_device: Optional[MIDIDeviceInfo] = None
    output_device: Optional[MIDIDeviceInfo] = None
    mappings_count: int
    learning: bool = False


class MIDIDeviceListResponse(BaseModel):
    """Response for MIDI device list."""
    input_devices: List[MIDIDeviceInfo]
    output_devices: List[MIDIDeviceInfo]
    total_inputs: int
    total_outputs: int


# ==================== System Responses ====================

class SystemHealthResponse(BaseModel):
    """System health status."""
    status: str  # "healthy", "degraded", "critical"
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    temperature: Optional[float] = None
    services: Dict[str, str]  # service_name -> status


class PerformanceMetrics(BaseModel):
    """Performance metrics."""
    cpu_load: float
    memory_mb: float
    audio_xruns: int
    audio_latency_ms: float
    active_plugins: int
    processing_time_us: float


class SystemInfoResponse(BaseModel):
    """System information."""
    platform: str
    python_version: str
    app_version: str
    uptime_seconds: float
    services_running: int
    services_total: int


# ==================== Configuration Responses ====================

class ConfigOptionInfo(BaseModel):
    """Configuration option information."""
    key: str
    value: Any
    default: Any
    description: str
    type: str
    choices: Optional[List[Any]] = None


class ConfigListResponse(BaseModel):
    """Response for configuration list."""
    options: List[ConfigOptionInfo]
    total: int


class ConfigUpdateResponse(BaseModel):
    """Response for configuration update."""
    success: bool
    key: str
    old_value: Any
    new_value: Any
    requires_restart: bool = False


# ==================== Preset Responses ====================

class PresetInfo(BaseModel):
    """Preset information."""
    id: int
    name: str
    plugin_uri: str
    plugin_name: Optional[str] = None
    parameters: Dict[str, float]
    created_at: Optional[datetime] = None
    tags: Optional[List[str]] = None


class PresetListResponse(BaseModel):
    """Response for preset list."""
    presets: List[PresetInfo]
    total: int
    plugin_uri: Optional[str] = None


class PresetSaveResponse(BaseModel):
    """Response for preset save."""
    success: bool
    preset_id: int
    name: str
    message: str


# ==================== Error Responses ====================

class ErrorDetail(BaseModel):
    """Detailed error information."""
    code: str
    message: str
    field: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    path: Optional[str] = None
    request_id: Optional[str] = None


# ==================== Batch Operations ====================

class BatchOperationResult(BaseModel):
    """Result of a single batch operation."""
    index: int
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None


class BatchOperationResponse(BaseModel):
    """Response for batch operations."""
    total: int
    successful: int
    failed: int
    results: List[BatchOperationResult]

# ==================== Host Machine Info ====================

class DiskInfo(BaseModel):
    """Disk health information."""
    name: str
    model: str
    size_gb: float
    health_status: str  # "healthy", "warning", "critical"
    temperature_c: Optional[float] = None
    used_percent: float
    smart_status: Optional[str] = None
    reallocated_sectors: Optional[int] = None
    uncorrectable_errors: Optional[int] = None
    power_on_hours: Optional[int] = None
    estimated_lifespan_percent: Optional[float] = None


class HostMachineInfo(BaseModel):
    """Host machine hardware information."""
    manufacturer: str  # "dell", "lenovo", "hp", "other"
    model: str
    product_name: str
    serial_number: Optional[str] = None
    bios_version: Optional[str] = None
    bios_date: Optional[str] = None
    system_uuid: Optional[str] = None
    chassis_type: Optional[str] = None
    cpu_model: str
    cpu_cores: int
    cpu_threads: int
    cpu_frequency_ghz: Optional[float] = None
    ram_total_gb: float
    motherboard: Optional[str] = None
    firmware_version: Optional[str] = None


class DiskHealthData(BaseModel):
    """Disk health data."""
    disks: List[DiskInfo]
    last_updated: datetime = Field(default_factory=datetime.now)


class SystemHealthOverview(BaseModel):
    """System health overview."""
    overall_health: str  # "excellent", "good", "warning", "critical"
    last_updated: datetime = Field(default_factory=datetime.now)
    temperature: Optional[Dict[str, Any]] = None
    power: Optional[Dict[str, Any]] = None
    fans: Optional[List[Dict[str, Any]]] = None


class BrandingAssets(BaseModel):
    """Manufacturer branding assets."""
    manufacturer: str
    logo_url: str
    product_image_url: str
    marketing_name: str
    support_url: str
    warranty_status: Optional[str] = None