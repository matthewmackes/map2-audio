from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AudioStatePathStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    NOT_LOADED = "not_loaded"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class AudioStateEngineState(str, Enum):
    LIVE = "live"
    LIVE_WARNING = "live_warning"
    STOPPED = "stopped"
    OFFLINE = "offline"


class AudioStateDesiredIO(BaseModel):
    requested_input_device: Optional[str] = None
    requested_output_device: Optional[str] = None
    monitoring_output_index: Optional[int] = None


class AudioStateObservedIOSummary(BaseModel):
    effective_input_device: Optional[str] = None
    effective_output_device: Optional[str] = None


class AudioStateRouting(BaseModel):
    mode: str
    active_path_ids: list[str] = Field(default_factory=list)
    path_order: list[str] = Field(default_factory=list)
    morph_position: Optional[float] = None
    morph_source_path_id: Optional[str] = None
    morph_target_path_id: Optional[str] = None


class AudioStateDeployment(BaseModel):
    placement_mode: str = "local_only"
    preferred_nodes: list[str] = Field(default_factory=list)


class AudioStatePathRecord(BaseModel):
    path_id: str
    label: str
    snapshot_chain_id: Optional[int] = None
    runtime_chain_id: Optional[int] = None
    owner_node_id: Optional[str] = None
    status: AudioStatePathStatus
    status_reason: Optional[str] = None


class AudioStateDerivedStatus(BaseModel):
    active_channel_count: int = 0
    total_channel_count: int = 0
    inactive_messages: list[str] = Field(default_factory=list)


class AudioStateClusterStatus(BaseModel):
    sync_status: str = "unknown"
    applied_node_ids: list[str] = Field(default_factory=list)
    degraded_node_ids: list[str] = Field(default_factory=list)


class AudioStateEngineSummary(BaseModel):
    display_state: AudioStateEngineState = AudioStateEngineState.STOPPED
    is_warning: bool = False
    is_offline: bool = False


class AudioStateSnapshotRef(BaseModel):
    snapshot_id: int
    snapshot_revision_id: Optional[int] = None
    name: str


class CompiledSnapshotIntent(BaseModel):
    snapshot_id: int
    snapshot_revision_id: Optional[int] = None
    compiled_at: str
    intent_version: int = 1
    io: AudioStateDesiredIO
    routing: AudioStateRouting
    deployment: AudioStateDeployment = Field(default_factory=AudioStateDeployment)
    chains: list[dict[str, Any]] = Field(default_factory=list)
    extensions: dict[str, Any] = Field(default_factory=dict)


class AuthoritativeAudioState(BaseModel):
    schema_version: int = 1
    state_version: int
    leader_epoch: int
    committed_at: str
    origin_node_id: str
    source_snapshot: Optional[AudioStateSnapshotRef] = None
    desired: CompiledSnapshotIntent
    observed_summary: AudioStateObservedIOSummary = Field(default_factory=AudioStateObservedIOSummary)
    cluster: AudioStateClusterStatus = Field(default_factory=AudioStateClusterStatus)
    engine: AudioStateEngineSummary = Field(default_factory=AudioStateEngineSummary)
    paths: list[AudioStatePathRecord] = Field(default_factory=list)
    derived: AudioStateDerivedStatus = Field(default_factory=AudioStateDerivedStatus)
    extensions: dict[str, Any] = Field(default_factory=dict)


class AudioStateEnvelope(BaseModel):
    namespace: str
    key: str
    revision: Optional[int] = None
    value: AuthoritativeAudioState


class AudioStateDesiredEnvelope(BaseModel):
    namespace: str
    key: str
    revision: Optional[int] = None
    value: CompiledSnapshotIntent


class AudioStateObservation(BaseModel):
    node_id: str
    observed_state_version: int
    applied: bool = False
    effective_input_device: Optional[str] = None
    effective_output_device: Optional[str] = None
    runtime_paths: list[AudioStatePathRecord] = Field(default_factory=list)
    engine: AudioStateEngineSummary = Field(default_factory=AudioStateEngineSummary)
    runtime_metrics: dict[str, Any] = Field(default_factory=dict)
    observed_at: str
    extensions: dict[str, Any] = Field(default_factory=dict)


class AudioStateObservationEnvelope(BaseModel):
    namespace: str
    key: str
    revision: Optional[int] = None
    ttl_seconds: Optional[int] = None
    value: AudioStateObservation


class AudioStateObservationListResponse(BaseModel):
    namespace: str
    count: int
    observations: list[AudioStateObservationEnvelope] = Field(default_factory=list)


class SubmitDesiredAudioStateRequest(BaseModel):
    requested_by: str = "ui"
    leader_epoch: int = 1
    state_version: int
    committed_at: str
    origin_node_id: str
    source_snapshot: Optional[AudioStateSnapshotRef] = None
    desired: CompiledSnapshotIntent
    observed_summary: AudioStateObservedIOSummary = Field(default_factory=AudioStateObservedIOSummary)
    cluster: AudioStateClusterStatus = Field(default_factory=AudioStateClusterStatus)
    engine: AudioStateEngineSummary = Field(default_factory=AudioStateEngineSummary)
    paths: list[AudioStatePathRecord] = Field(default_factory=list)
    derived: AudioStateDerivedStatus = Field(default_factory=AudioStateDerivedStatus)
    extensions: dict[str, Any] = Field(default_factory=dict)

    def to_authoritative_state(self) -> AuthoritativeAudioState:
        return AuthoritativeAudioState(
            state_version=self.state_version,
            leader_epoch=self.leader_epoch,
            committed_at=self.committed_at,
            origin_node_id=self.origin_node_id,
            source_snapshot=self.source_snapshot,
            desired=self.desired,
            observed_summary=self.observed_summary,
            cluster=self.cluster,
            engine=self.engine,
            paths=self.paths,
            derived=self.derived,
            extensions=self.extensions,
        )


class AudioStateRouteStatus(BaseModel):
    status: Literal["ok"]
    namespace: str
    authority_backend: str


class ActivateSnapshotIntoAudioStateRequest(BaseModel):
    triggered_by: str = "ui"
    leader_epoch: int = 1
