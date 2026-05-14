"""Pydantic shapes for the SonoBusBinding canonical authority.

T2521-3. Mirrors `app/services/avb/binding_schemas.py` shape-for-shape
so the `/api/sonobus/bindings` REST surface looks identical to
`/api/avb/bindings` to operator-tooling consumers.

Authority enforces these shapes on every write; per-consumer projection
adapters (T2521-7 onwards) build them from per-consumer request shapes.

Defaults reflect the T2521 locked decisions:
- Q7/Q8: PCM 24-bit / 48 kHz default for both MAP2-to-MAP2 and non-MAP2
  client paths.
- Q9: lowest-practical jitter buffer (4 ms), resend policy
  "burst_loss_only".
- Q14: full multichannel from day one (channel_count default 1, cap 32).
- Q18: AVB preferred by default; SonoBus is fallback.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------- Constrained vocabularies ----------

SonoBusBindingConsumerType = Literal[
    "sonobus_peer",
    "sonobus_group",
    "sonobus_stream",
    "sonobus_client_session",
    "cluster_route",
]

SonoBusBindingKind = Literal[
    "peer",
    "group",
    "stream",
    "client_session",
]

SonoBusBindingSourceType = Literal[
    "aoo_source",
    "aoo_sink",
    "peer_endpoint",
    "engine_signal",
]

SonoBusBindingTargetType = Literal[
    "aoo_sink",
    "aoo_source",
    "peer_endpoint",
    "engine_sink",
]

SonoBusBindingScope = Literal["global", "snapshot", "node", "cluster"]

SonoBusCodecProfile = Literal["pcm", "opus_lowlatency", "opus_voip"]
"""Per Q7/Q8 v1 ships PCM only; Opus slots reserved for future expansion."""

SonoBusResendPolicy = Literal["off", "burst_loss_only", "full"]

SonoBusListenerCapability = Literal["map2", "sonobus_native", "aoo_native"]

SonoBusTransportPriority = Literal[
    "avb_preferred",
    "sonobus_preferred",
    "sonobus_only",
]

SonoBusTransportProtocol = Literal["udp", "udp_tls"]

SonoBusClusterRole = Literal["primary", "fallback", "peer"]


# ---------- Wire shapes ----------


class _SonoBusBindingBase(BaseModel):
    """Common fields shared by Create / Update / Read."""

    model_config = ConfigDict(extra="forbid")

    consumer_type: SonoBusBindingConsumerType
    consumer_id: str = Field(min_length=1, max_length=255)
    consumer_label: str = Field(default="", max_length=255)

    binding_kind: SonoBusBindingKind = "stream"

    source_type: SonoBusBindingSourceType
    source_descriptor: dict[str, Any] = Field(default_factory=dict)

    target_type: SonoBusBindingTargetType
    target_descriptor: dict[str, Any] = Field(default_factory=dict)

    stream_format: Optional[str] = Field(default="pcm_s24_48000", max_length=64)
    codec_profile: Optional[SonoBusCodecProfile] = "pcm"
    jitter_buffer_ms: Optional[int] = Field(default=4, ge=0, le=2000)
    resend_policy: Optional[SonoBusResendPolicy] = "burst_loss_only"
    latency_target_ms: Optional[int] = Field(default=8, ge=1, le=2000)
    channel_count: int = Field(default=1, ge=1, le=32)

    group_id: Optional[str] = Field(default=None, max_length=80)
    session_label: Optional[str] = Field(default=None, max_length=120)

    transport_protocol: SonoBusTransportProtocol = "udp"
    bind_interface: Optional[str] = Field(default=None, max_length=40)
    bind_port_local: Optional[int] = Field(default=None, ge=1, le=65535)
    server_endpoint: Optional[str] = Field(default=None, max_length=255)

    talker_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_capability: Optional[SonoBusListenerCapability] = "map2"
    cluster_role: Optional[SonoBusClusterRole] = None
    transport_priority: SonoBusTransportPriority = "avb_preferred"

    scope: SonoBusBindingScope = "global"
    scope_id: Optional[str] = Field(default=None, max_length=255)

    enabled: bool = True

    source: str = Field(default="manual", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SonoBusBindingCreate(_SonoBusBindingBase):
    """POST payload — authority assigns binding_id + timestamps + author."""

    created_by: str = Field(default="unknown", max_length=80)


class SonoBusBindingUpdate(BaseModel):
    """PATCH payload — every field optional. Authority bumps modified_at +
    modified_by on any successful write."""

    model_config = ConfigDict(extra="forbid")

    consumer_label: Optional[str] = Field(default=None, max_length=255)
    binding_kind: Optional[SonoBusBindingKind] = None
    source_descriptor: Optional[dict[str, Any]] = None
    target_descriptor: Optional[dict[str, Any]] = None
    stream_format: Optional[str] = Field(default=None, max_length=64)
    codec_profile: Optional[SonoBusCodecProfile] = None
    jitter_buffer_ms: Optional[int] = Field(default=None, ge=0, le=2000)
    resend_policy: Optional[SonoBusResendPolicy] = None
    latency_target_ms: Optional[int] = Field(default=None, ge=1, le=2000)
    channel_count: Optional[int] = Field(default=None, ge=1, le=32)
    group_id: Optional[str] = Field(default=None, max_length=80)
    session_label: Optional[str] = Field(default=None, max_length=120)
    transport_protocol: Optional[SonoBusTransportProtocol] = None
    bind_interface: Optional[str] = Field(default=None, max_length=40)
    bind_port_local: Optional[int] = Field(default=None, ge=1, le=65535)
    server_endpoint: Optional[str] = Field(default=None, max_length=255)
    talker_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_capability: Optional[SonoBusListenerCapability] = None
    cluster_role: Optional[SonoBusClusterRole] = None
    transport_priority: Optional[SonoBusTransportPriority] = None
    scope: Optional[SonoBusBindingScope] = None
    scope_id: Optional[str] = Field(default=None, max_length=255)
    enabled: Optional[bool] = None
    source: Optional[str] = Field(default=None, max_length=80)
    metadata: Optional[dict[str, Any]] = None
    modified_by: str = Field(default="unknown", max_length=80)


class SonoBusBindingRead(_SonoBusBindingBase):
    """GET response — full binding record."""

    binding_id: str = Field(min_length=36, max_length=36)
    created_at: datetime
    created_by: str = Field(max_length=80)
    modified_at: datetime
    modified_by: str = Field(max_length=80)
