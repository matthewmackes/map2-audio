"""T2503 Set 4 — Pydantic schemas for the DAW REST surface.

Every model uses the project-wide error envelope shape from
``docs/api-contract-standards.md``. Numbering matches the 17 ``daw.*`` verbs
in ``app/services/daw_handlers.py``.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class TrackType(str, Enum):
    AUDIO = "audio"
    MIDI = "midi"


# --- Transport ---


class TransportPlayRequest(BaseModel):
    pass  # no body — kept for forward extensibility


class TransportStopRequest(BaseModel):
    pass


class TransportRecordRequest(BaseModel):
    arm: bool = Field(..., description="True to arm the transport for recording.")


class TransportSetPositionRequest(BaseModel):
    samples: int = Field(..., ge=0, description="Position in samples (sample-accurate at 48 kHz).")


# --- Project lifecycle ---


class ProjectNewRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name; used as the directory name under ~/.map2/daw/.")


class ProjectLoadRequest(BaseModel):
    path: str = Field(..., min_length=1, description="Absolute path to a project.json or its containing directory.")


class ProjectSaveRequest(BaseModel):
    pass


class ProjectStatusResponse(BaseModel):
    name: Optional[str] = Field(default=None, description="Loaded project name; null when no project is open.")
    path: Optional[str] = Field(default=None, description="On-disk path to the project directory.")
    dirty: bool = Field(default=False, description="True when there are unsaved changes.")


# --- Tracks ---


class TrackCreateRequest(BaseModel):
    type: TrackType = Field(..., description="Audio or MIDI track type.")
    name: Optional[str] = Field(default=None, max_length=255, description="Display name; defaults to type-numbered (Audio 1, MIDI 1, ...).")


class TrackResponse(BaseModel):
    id: int = Field(..., description="Track ID; stable across the project lifetime.")
    type: TrackType
    name: str
    armed: bool = Field(default=False)


class TrackSetArmRequest(BaseModel):
    armed: bool = Field(..., description="True to arm for recording.")


# --- Clips ---


class ClipAddRequest(BaseModel):
    track_id: int = Field(..., description="Track to attach the clip to.")
    start_samples: int = Field(..., ge=0, description="Clip start position in samples.")
    length_samples: int = Field(..., ge=1, description="Clip duration in samples.")
    source: str = Field(..., min_length=1, description="Source: a relative path to a .wav under <project>/audio/, or a MIDI sequence reference.")


class ClipResponse(BaseModel):
    id: int
    track_id: int
    start_samples: int
    length_samples: int
    source: str


class ClipMoveRequest(BaseModel):
    new_start_samples: int = Field(..., ge=0)


# --- Automation ---


class AutomationSetPointRequest(BaseModel):
    lane_id: int = Field(..., description="Automation lane ID.")
    position: float = Field(..., ge=0.0, description="Position in beats (or samples; depends on lane unit).")
    value: float = Field(..., description="Target value at the position.")


# --- Plugins ---


class PluginAddToTrackRequest(BaseModel):
    plugin_uri: str = Field(..., min_length=1, description="LV2 URI or 'map2:nam' / 'map2:cab-ir' / 'map2:reverb-ir' for native plugins.")


class PluginInstanceResponse(BaseModel):
    track_id: int
    slot_index: int
    plugin_uri: str
    enabled: bool = Field(default=True)


class PluginSetParamRequest(BaseModel):
    param_id: str = Field(..., min_length=1, description="Plugin-specific parameter identifier (LV2 symbol or plugin-defined string).")
    value: float = Field(..., description="Normalized parameter value in the plugin's own range.")


# --- Generic action response (200 OK envelope) ---


class DawActionAccepted(BaseModel):
    """Generic positive response for fire-and-forget actions.

    The DAW core processes verbs asynchronously over engine_command; this
    response only confirms the verb was accepted by the FastAPI surface and
    dispatched. State changes propagate via the WebSocket events stream.
    """

    accepted: bool = Field(default=True)
    verb: str = Field(..., description="The dispatched ``daw.*`` verb.")


# --- WebSocket event envelope ---


class DawEvent(BaseModel):
    """Envelope for events delivered over /api/v1/daw/events.

    ``kind`` is a stable string ID (transport_changed, track_added,
    clip_moved, plugin_param_changed, project_dirty, mode_changed, ...).
    ``payload`` is event-specific JSON.
    """

    kind: str = Field(..., description="Event discriminator.")
    payload: dict = Field(default_factory=dict)
    timestamp: Optional[float] = Field(default=None, description="Wall-clock seconds since epoch when the event was emitted by the engine.")
