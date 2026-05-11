"""T2508-5 — Recordings artifact-registry HTTP routes.

Operator-facing surface for browsing + retrieving captured WAV
takes. Pairs with the session-lifecycle routes from T2508-4
(``app/routes/recorder.py``): that module owns the in-flight
session state machine; this module exposes the *artefacts* the
recorder produces.

Routes under ``/api/recordings`` (note: unversioned per the
artifact-discovery convention — same as ``/api/nam-models``,
``/api/ir``, etc., which also serve registry-backed reads):

    GET    /api/recordings                  — list every "recording"
                                              asset registered.
    GET    /api/recordings/{hash}/metadata  — sidecar JSON for the
                                              take.
    GET    /api/recordings/{hash}/wav       — stream the WAV file.
    DELETE /api/recordings/{hash}           — drop the registry row
                                              + delete the file on
                                              disk.

The route layer is a thin read/write shell over the
``state_authority_assets`` table + the on-disk file at
``recordings_library_dir()``. No engine round-trip is needed for
list/GET/DELETE — recordings are passive artifacts.

RT-safety profile: pure asyncio + SQLAlchemy; never enters the
JUCE audioCallback.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.database import StateAuthorityAsset, get_session
from app.paths import Map2Paths
from app.services.upload_service import AssetType


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recordings", tags=["recordings"])


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class RecordingSummary(BaseModel):
    """One row in the recordings list. Mirrors the StateAuthorityAsset
    table verbatim so the operator sees the canonical registry shape."""

    asset_hash: str
    file_name: str
    size_bytes: int
    source_path: str
    created_at: str
    updated_at: str


class RecordingListResponse(BaseModel):
    recordings: list[RecordingSummary]
    count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _summary_from_row(row: StateAuthorityAsset) -> RecordingSummary:
    return RecordingSummary(
        asset_hash=row.asset_hash,
        file_name=row.file_name,
        size_bytes=row.size_bytes,
        source_path=row.source_path,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class _RowSnapshot:
    """Plain-Python projection of a StateAuthorityAsset row.

    SQLAlchemy with `expire_on_commit=True` expires row attributes
    once the session context exits. The recordings routes need to
    operate on row data after the session closes (FileResponse,
    file-system unlink), so we materialise the read-only subset
    here while the row is still bound to a session."""

    __slots__ = ("asset_hash", "file_name", "source_path", "size_bytes")

    def __init__(self, row: StateAuthorityAsset) -> None:
        self.asset_hash = row.asset_hash
        self.file_name = row.file_name
        self.source_path = row.source_path
        self.size_bytes = row.size_bytes


async def _get_recording_snapshot(asset_hash: str) -> Optional[_RowSnapshot]:
    async with get_session(read_only=True) as session:
        result = await session.execute(
            select(StateAuthorityAsset).where(
                StateAuthorityAsset.asset_hash == asset_hash,
                StateAuthorityAsset.asset_type == AssetType.RECORDING.value,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return _RowSnapshot(row)


def _resolve_file_path(snapshot: _RowSnapshot) -> Path:
    """Resolve the on-disk file for a snapshot.

    The recorder writes WAV files into ``recordings_library_dir()`` as
    ``<file_name>``. ``source_path`` records the path at registration
    time but the canonical location is the service-plane library dir;
    fall back to source_path if the library-dir resolution fails (e.g.
    operator manually moved the file).
    """
    library_path = Map2Paths.recordings_library_dir() / snapshot.file_name
    if library_path.exists():
        return library_path
    fallback = Path(snapshot.source_path)
    return fallback


def _resolve_metadata_path(snapshot: _RowSnapshot) -> Path:
    """Sidecar metadata path: same basename, `.json` extension.

    The recorder writes ``<session>/<take>.wav`` + a sidecar
    ``<take>.json`` alongside it. Resolution is independent of the
    WAV file's on-disk presence — operators legitimately delete a
    WAV but keep the sidecar metadata around for the session log,
    and the reverse case (sidecar in library dir, WAV moved out of
    band) should also resolve.

    Lookup order:
      1. ``<library_dir>/<basename>.json`` — canonical service-plane
         location.
      2. ``<dirname(source_path)>/<basename>.json`` — fallback to the
         registration-time directory.
    """
    base = Path(snapshot.file_name).with_suffix(".json").name
    library_path = Map2Paths.recordings_library_dir() / base
    if library_path.exists():
        return library_path
    fallback_dir = Path(snapshot.source_path).parent
    return fallback_dir / base


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=RecordingListResponse,
    operation_id="recordings_list",
    summary="List every captured recording in the artifact registry",
)
async def list_recordings() -> RecordingListResponse:
    async with get_session(read_only=True) as session:
        result = await session.execute(
            select(StateAuthorityAsset)
            .where(StateAuthorityAsset.asset_type == AssetType.RECORDING.value)
            .order_by(StateAuthorityAsset.created_at.desc())
        )
        # Project to plain Pydantic models inside the session so we
        # don't hit the expire_on_commit autoexpire when the session
        # context exits (see _RowSnapshot above).
        summaries = [_summary_from_row(r) for r in result.scalars().all()]
    return RecordingListResponse(
        recordings=summaries,
        count=len(summaries),
    )


@router.get(
    "/{asset_hash}/metadata",
    operation_id="recordings_get_metadata",
    summary="Fetch the sidecar JSON for a recording",
)
async def get_recording_metadata(asset_hash: str) -> dict:
    snapshot = await _get_recording_snapshot(asset_hash)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"recording {asset_hash!r} not found in registry",
        )
    metadata_path = _resolve_metadata_path(snapshot)
    if not metadata_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"sidecar JSON missing on disk for recording {asset_hash!r}",
        )
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("recordings: failed to read metadata for %s: %s", asset_hash, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"sidecar JSON unreadable for recording {asset_hash!r}: {exc}",
        )


@router.get(
    "/{asset_hash}/wav",
    operation_id="recordings_stream_wav",
    summary="Stream the WAV file for a recording",
)
async def stream_recording_wav(asset_hash: str) -> FileResponse:
    snapshot = await _get_recording_snapshot(asset_hash)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"recording {asset_hash!r} not found in registry",
        )
    wav_path = _resolve_file_path(snapshot)
    if not wav_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"WAV file missing on disk for recording {asset_hash!r}",
        )
    return FileResponse(
        path=str(wav_path),
        media_type="audio/wav",
        filename=snapshot.file_name,
    )


@router.delete(
    "/{asset_hash}",
    operation_id="recordings_delete",
    summary="Delete a recording (registry row + on-disk file)",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_recording(asset_hash: str) -> None:
    snapshot: Optional[_RowSnapshot] = None
    async with get_session() as session:
        result = await session.execute(
            select(StateAuthorityAsset).where(
                StateAuthorityAsset.asset_hash == asset_hash,
                StateAuthorityAsset.asset_type == AssetType.RECORDING.value,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"recording {asset_hash!r} not found in registry",
            )
        snapshot = _RowSnapshot(row)
        await session.delete(row)
        # File-system cleanup AFTER the SQL delete commits. If the
        # file delete fails we still want the registry row gone — a
        # stranded file is preferable to a phantom registry row that
        # serves 404 on every GET. The next periodic gc can sweep it.
    assert snapshot is not None  # We raise above if the row is None.
    wav_path = _resolve_file_path(snapshot)
    metadata_path = _resolve_metadata_path(snapshot)
    for path in (wav_path, metadata_path):
        try:
            if path.exists():
                path.unlink()
        except OSError as exc:
            logger.warning(
                "recordings: failed to unlink %s during delete %s: %s",
                path,
                asset_hash,
                exc,
            )
