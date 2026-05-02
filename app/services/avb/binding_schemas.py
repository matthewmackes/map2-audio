"""Pydantic shapes for the AvbBinding canonical authority.

T2490-2. Mirrors `app/services/midi/schemas.py` shape-for-shape so the
`/api/avb/bindings` REST surface looks identical to `/api/midi/bindings`
to operator-tooling consumers.

Authority enforces these shapes on every write; per-consumer projection
adapters (T2490-3 onwards) build them from per-consumer request shapes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------- Constrained vocabularies ----------

AvbBindingConsumerType = Literal[
    "avdecc_stream",
    "tesira_preset",
    "tesira_block",
    "cluster_route",
    "srp_reservation",
]

AvbBindingSourceType = Literal[
    "avdecc_talker",
    "avdecc_listener",
    "tesira_subscription",
    "engine_signal",
]

AvbBindingTargetType = Literal[
    "avdecc_listener",
    "tesira_apply",
    "engine_sink",
    "cluster_listener",
]

AvbBindingScope = Literal["global", "snapshot", "node", "cluster"]

AvbSrpClass = Literal["A", "B"]


# ---------- Wire shapes ----------


class _AvbBindingBase(BaseModel):
    """Common fields shared by Create / Update / Read."""

    model_config = ConfigDict(extra="forbid")

    consumer_type: AvbBindingConsumerType
    consumer_id: str = Field(min_length=1, max_length=255)
    consumer_label: str = Field(default="", max_length=255)

    source_type: AvbBindingSourceType
    source_descriptor: dict[str, Any] = Field(default_factory=dict)

    target_type: AvbBindingTargetType
    target_descriptor: dict[str, Any] = Field(default_factory=dict)

    stream_id: Optional[str] = Field(default=None, max_length=64)
    stream_format: Optional[str] = Field(default=None, max_length=64)
    srp_class: Optional[AvbSrpClass] = None

    talker_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_node_id: Optional[str] = Field(default=None, max_length=64)

    scope: AvbBindingScope = "global"
    scope_id: Optional[str] = Field(default=None, max_length=255)

    enabled: bool = True

    source: str = Field(default="manual", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AvbBindingCreate(_AvbBindingBase):
    """POST payload — authority assigns binding_id + timestamps + author."""

    created_by: str = Field(default="unknown", max_length=80)


class AvbBindingUpdate(BaseModel):
    """PATCH payload — every field optional. Authority bumps modified_at +
    modified_by on any successful write."""

    model_config = ConfigDict(extra="forbid")

    consumer_label: Optional[str] = Field(default=None, max_length=255)
    source_descriptor: Optional[dict[str, Any]] = None
    target_descriptor: Optional[dict[str, Any]] = None
    stream_id: Optional[str] = Field(default=None, max_length=64)
    stream_format: Optional[str] = Field(default=None, max_length=64)
    srp_class: Optional[AvbSrpClass] = None
    talker_node_id: Optional[str] = Field(default=None, max_length=64)
    listener_node_id: Optional[str] = Field(default=None, max_length=64)
    scope: Optional[AvbBindingScope] = None
    scope_id: Optional[str] = Field(default=None, max_length=255)
    enabled: Optional[bool] = None
    source: Optional[str] = Field(default=None, max_length=80)
    metadata: Optional[dict[str, Any]] = None
    modified_by: str = Field(default="unknown", max_length=80)


class AvbBindingRead(_AvbBindingBase):
    """GET response — full binding record."""

    binding_id: str = Field(min_length=36, max_length=36)
    created_at: datetime
    created_by: str = Field(max_length=80)
    modified_at: datetime
    modified_by: str = Field(max_length=80)
