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


class PublishBlockerCode(str, Enum):
    UNSAVED_DRAFT = "unsaved_draft"
    SNAPSHOT_INVALID = "snapshot_invalid"
    PLUGIN_MISSING = "plugin_missing"
    ASSET_MISSING = "asset_missing"
    AUDIO_INPUT_MISSING = "audio_input_missing"
    AUDIO_OUTPUT_MISSING = "audio_output_missing"
    MONITORING_OUTPUT_INVALID = "monitoring_output_invalid"
    LOCAL_ROUTING_INVALID = "local_routing_invalid"
    NETWORK_ROUTING_INVALID = "network_routing_invalid"
    NODE_OFFLINE = "node_offline"
    NODE_ASSIGNMENT_MISSING = "node_assignment_missing"
    NODE_SYNC_PENDING = "node_sync_pending"
    ENGINE_UNAVAILABLE = "engine_unavailable"
    ENGINE_APPLY_FAILED = "engine_apply_failed"
    CHANNEL_UNCONFIRMED = "channel_unconfirmed"
    OBSERVATION_STALE = "observation_stale"
    AUTHORITY_DIVERGED = "authority_diverged"
    AUTHORITY_CONFIRMATION_FAILED = "authority_confirmation_failed"


class PublishBlockerSeverity(str, Enum):
    BLOCKING = "blocking"
    WARNING = "warning"
    INFO = "info"


class PublishScope(str, Enum):
    DRAFT = "draft"
    INTENT = "intent"
    NODE = "node"
    CHANNEL = "channel"
    CLUSTER = "cluster"


class PublishRequirementStatus(str, Enum):
    READY = "ready"
    NEEDS_ATTENTION = "needs_attention"
    WAITING_FOR_CONFIRMATION = "waiting_for_confirmation"
    NOT_APPLICABLE = "not_applicable"


class SnapshotPublishStatus(str, Enum):
    READY = "ready"
    BLOCKED = "blocked"
    WAITING_FOR_CONFIRMATION = "waiting_for_confirmation"
    LIVE_CONFIRMED = "live_confirmed"
    DIVERGED = "diverged"


class PublishConfirmationStatus(str, Enum):
    PENDING = "pending"
    WAITING = "waiting"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    OFFLINE = "offline"


class PublishRepairAction(BaseModel):
    id: str
    label: str
    operator_message: Optional[str] = None
    technical_detail: Optional[str] = None
    scope: Optional[PublishScope] = None
    related_path_ids: list[str] = Field(default_factory=list)
    related_node_ids: list[str] = Field(default_factory=list)


class PublishBlocker(BaseModel):
    id: str
    code: PublishBlockerCode
    severity: PublishBlockerSeverity
    scope: PublishScope
    title: str
    operator_message: str
    technical_detail: Optional[str] = None
    recommended_action: str
    repair_action_id: Optional[str] = None
    prerequisite_of: list[PublishBlockerCode] = Field(default_factory=list)
    related_path_ids: list[str] = Field(default_factory=list)
    related_node_ids: list[str] = Field(default_factory=list)


class PublishRequirement(BaseModel):
    id: str
    label: str
    status: PublishRequirementStatus
    scope: PublishScope
    operator_message: str
    technical_detail: Optional[str] = None
    repair_actions: list[PublishRepairAction] = Field(default_factory=list)


class NodeConfirmationState(BaseModel):
    node_id: str
    status: PublishConfirmationStatus = PublishConfirmationStatus.PENDING
    operator_message: str
    technical_detail: Optional[str] = None
    observed_state_version: Optional[int] = None
    observed_at: Optional[str] = None


class ChannelConfirmationState(BaseModel):
    path_id: str
    label: Optional[str] = None
    status: PublishConfirmationStatus = PublishConfirmationStatus.PENDING
    operator_message: str
    technical_detail: Optional[str] = None
    related_node_id: Optional[str] = None
    observed_state_version: Optional[int] = None
    observed_at: Optional[str] = None


class SnapshotPublishReadiness(BaseModel):
    snapshot_id: int
    draft_revision_id: Optional[int] = None
    requested_revision_id: Optional[int] = None
    confirmed_revision_id: Optional[int] = None
    status: SnapshotPublishStatus
    requirements: list[PublishRequirement] = Field(default_factory=list)
    blockers: list[PublishBlocker] = Field(default_factory=list)
    warnings: list[PublishBlocker] = Field(default_factory=list)
    available_repairs: list[PublishRepairAction] = Field(default_factory=list)
    applicable_steps: list[str] = Field(default_factory=list)


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
    # T2506 — snapshot-bound recording session, threaded through the State
    # Authority graph so the JUCE engine can install/uninstall T2507 taps and
    # the T2508 recorder service can drive lifecycle. Both fields are `None`
    # when no recording session is bound to the snapshot.
    record_session_id: Optional[str] = None
    tap_matrix: dict[str, dict[str, bool]] = Field(default_factory=dict)
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
