"""
Node discovery and health schemas for the Node Display Standard.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _NodeBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class NodeRole(str, Enum):
    audio_node = "audio_node"
    management_node = "management_node"
    all_in_one = "all_in_one"


class NodeServices(_NodeBaseModel):
    backend: bool = True
    juce_engine: bool = False
    pipewire: bool = False


LatencyPressureStatusLiteral = Literal["waiting", "offline", "stable", "watch", "critical"]


class NodeHealth(_NodeBaseModel):
    status: Literal["ok", "warn", "critical", "offline"] = "offline"
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    xrun_count: int = 0
    audio_latency_ms: float = 0.0
    services: NodeServices = Field(default_factory=NodeServices)
    # First-class latency pressure (mirrors web/src/app/utils/latencyPressure.ts).
    # null score/percent => no telemetry available yet for this node ("waiting").
    latency_pressure_score: Optional[int] = None
    latency_pressure_percent: Optional[int] = None
    latency_pressure_status: LatencyPressureStatusLiteral = "waiting"


class NodeIdentity(_NodeBaseModel):
    hostname: str
    display_label: Optional[str] = None
    role: NodeRole
    node_id: str


class NodeSummary(NodeIdentity, NodeHealth):
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    is_local: bool = False
    is_viewed: bool = False


class NodeAudioEdge(_NodeBaseModel):
    source_node_id: str
    dest_node_id: str
    stream_type: Literal["avb", "jack"] = "avb"
    active: bool = False


class NodeNetworkEdge(_NodeBaseModel):
    source_node_id: str
    dest_node_id: str
    latency_ms: Optional[float] = None


class NodeTopology(_NodeBaseModel):
    nodes: list[NodeSummary] = Field(default_factory=list)
    audio_edges: list[NodeAudioEdge] = Field(default_factory=list)
    network_edges: list[NodeNetworkEdge] = Field(default_factory=list)
