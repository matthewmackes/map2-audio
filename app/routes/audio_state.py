from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import get_config
from app.database import get_session
from app.models.audio_state import (
    ActivateSnapshotIntoAudioStateRequest,
    AudioStateObservation,
    AudioStateObservationEnvelope,
    AudioStateObservationListResponse,
    AudioStateRouteStatus,
    AudioStateDesiredEnvelope,
    AudioStateEnvelope,
    SubmitDesiredAudioStateRequest,
)
from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService
from app.services.audio_state_snapshot_compiler import build_initial_authoritative_audio_state
from app.services.snapshot_runtime_state_service import resolve_local_node_id
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/api/audio/state", tags=["audio-state"])


def _service() -> AudioStateAuthorityService:
    return AudioStateAuthorityService()


def _http_error(exc: AudioStateAuthorityError) -> HTTPException:
    detail = str(exc)
    if "No committed" in detail or "No desired" in detail:
        return HTTPException(status_code=404, detail=detail)
    return HTTPException(status_code=503, detail=detail)


@router.get("/status", response_model=AudioStateRouteStatus)
async def get_audio_state_authority_status() -> AudioStateRouteStatus:
    manager = get_config()
    namespace = str(manager.get("audio_state.etcd_namespace", "/map2/audio-state/v1") or "/map2/audio-state/v1")
    backend = str(manager.get("audio_state.authority_backend", "etcd") or "etcd")
    return AudioStateRouteStatus(status="ok", namespace=namespace.rstrip("/"), authority_backend=backend)


@router.get("/committed", response_model=AudioStateEnvelope)
async def get_committed_audio_state() -> AudioStateEnvelope:
    try:
        return await _service().get_committed_state()
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.get("/desired", response_model=AudioStateDesiredEnvelope)
async def get_desired_audio_state() -> AudioStateDesiredEnvelope:
    try:
        return await _service().get_desired_state()
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.put("/desired", response_model=AudioStateEnvelope)
async def put_desired_audio_state(request: SubmitDesiredAudioStateRequest) -> AudioStateEnvelope:
    service = _service()
    try:
        desired_envelope = await service.put_desired_state(request.desired)
        committed = request.to_authoritative_state()
        committed_envelope = await service.put_committed_state(committed)
        return AudioStateEnvelope(
            namespace=committed_envelope.namespace,
            key=committed_envelope.key,
            revision=committed_envelope.revision or desired_envelope.revision,
            value=committed,
        )
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.put("/observed/{node_id}", response_model=AudioStateObservationEnvelope)
async def put_audio_state_observation(node_id: str, request: AudioStateObservation) -> AudioStateObservationEnvelope:
    if request.node_id != node_id:
        raise HTTPException(status_code=400, detail="request.node_id must match the path node_id")
    try:
        return await _service().put_observation(request)
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.get("/observed", response_model=AudioStateObservationListResponse)
async def list_audio_state_observations(state_version: int | None = None) -> AudioStateObservationListResponse:
    try:
        return await _service().list_observations(state_version=state_version)
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.post("/reconcile", response_model=AudioStateEnvelope)
async def reconcile_audio_state() -> AudioStateEnvelope:
    try:
        return await _service().reconcile_committed_state()
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)


@router.post("/snapshots/{snapshot_id}/activate", response_model=AudioStateEnvelope)
async def activate_snapshot_into_audio_state(
    snapshot_id: int,
    request: ActivateSnapshotIntoAudioStateRequest,
) -> AudioStateEnvelope:
    async with get_session() as session:
        service = SnapshotService(session)
        detail = await service.get_snapshot(snapshot_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")

    authority = _service()
    try:
        state_version = await authority.next_state_version()
        initial_state = build_initial_authoritative_audio_state(
            detail,
            origin_node_id=resolve_local_node_id(),
            state_version=state_version,
            leader_epoch=request.leader_epoch,
        )
        await authority.put_desired_state(initial_state.desired)
        return await authority.put_committed_state(initial_state)
    except AudioStateAuthorityError as exc:
        raise _http_error(exc)
