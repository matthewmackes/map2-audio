"""T2431-I — single-node backend for the audio-state authority contract.

Keeps `AudioStateAuthorityService`'s public surface (committed / desired /
observed + reconcile_committed_state) honest on a single-node MAP2 install
without requiring etcd. The authority is still the sole source of truth;
it just lives in a process-local store backed by a JSON file under the
service-plane state directory (``Map2Paths.service_file('audio_state/
local.json')`` by default). Observations expire after
``audio_state.node_observation_ttl_s``, matching the etcd lease semantics.

This backend is selected by ``audio_state.authority_backend = "local"``
and is the recommended default for single-node appliances. When the user
scales to a multi-node cluster, switching back to ``"etcd"`` preserves
the contract because both backends implement the same methods.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

from app.models.audio_state import (
    AudioStateDesiredEnvelope,
    AudioStateEnvelope,
    AudioStateObservation,
    AudioStateObservationEnvelope,
    AudioStateObservationListResponse,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)

logger = logging.getLogger(__name__)


COMMITTED_KEY = "committed"
DESIRED_KEY = "desired"
OBSERVED_PREFIX = "observed"


def _now() -> float:
    return time.time()


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


class LocalAudioStateBackend:
    """In-process authority backend honoring the AudioStateAuthority contract.

    All methods mirror ``AudioStateAuthorityService`` shapes so the concrete
    facade can swap backends without its callers noticing. Persistence is
    optional — if ``storage_path`` is provided, the backend reads it on
    construction and rewrites atomically on every mutation.
    """

    def __init__(
        self,
        *,
        namespace: str = "/map2/audio-state/v1",
        observation_ttl_s: int = 15,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._namespace = namespace.rstrip("/")
        self._observation_ttl_s = int(observation_ttl_s)
        self._storage_path = storage_path
        self._lock = asyncio.Lock()
        self._revision = 0
        self._committed: Optional[dict[str, Any]] = None  # JSON-serialized AuthoritativeAudioState
        self._committed_revision: Optional[int] = None
        self._desired: Optional[dict[str, Any]] = None
        self._desired_revision: Optional[int] = None
        # observed: node_id -> (payload, revision, expires_at_epoch)
        self._observations: dict[str, tuple[dict[str, Any], int, float]] = {}
        self._load_from_disk()

    # -- public shape ------------------------------------------------------

    @property
    def namespace(self) -> str:
        return self._namespace

    def _key(self, suffix: str) -> str:
        return f"{self._namespace}/{suffix}"

    def observation_key(self, node_id: str) -> str:
        normalized = str(node_id).strip()
        if not normalized:
            from app.services.audio_state_authority import AudioStateAuthorityError  # avoid circular import

            raise AudioStateAuthorityError("node_id is required for audio-state observations")
        return f"{self._namespace}/{OBSERVED_PREFIX}/{normalized}"

    # -- committed ---------------------------------------------------------

    async def get_committed_state(self) -> AudioStateEnvelope:
        from app.services.audio_state_authority import AudioStateAuthorityError

        async with self._lock:
            if self._committed is None:
                raise AudioStateAuthorityError("No committed authoritative audio state exists locally")
            value = AuthoritativeAudioState.model_validate(self._committed)
            return AudioStateEnvelope(
                namespace=self._namespace,
                key=self._key(COMMITTED_KEY),
                revision=self._committed_revision,
                value=value,
            )

    async def next_state_version(self) -> int:
        async with self._lock:
            if self._committed is None:
                return 1
            return int(AuthoritativeAudioState.model_validate(self._committed).state_version) + 1

    async def put_committed_state(self, state: AuthoritativeAudioState) -> AudioStateEnvelope:
        async with self._lock:
            self._revision += 1
            self._committed = state.model_dump(mode="json")
            self._committed_revision = self._revision
            self._persist()
            return AudioStateEnvelope(
                namespace=self._namespace,
                key=self._key(COMMITTED_KEY),
                revision=self._committed_revision,
                value=state,
            )

    # -- desired -----------------------------------------------------------

    async def get_desired_state(self) -> AudioStateDesiredEnvelope:
        from app.services.audio_state_authority import AudioStateAuthorityError

        async with self._lock:
            if self._desired is None:
                raise AudioStateAuthorityError("No desired audio state exists locally")
            value = CompiledSnapshotIntent.model_validate(self._desired)
            return AudioStateDesiredEnvelope(
                namespace=self._namespace,
                key=self._key(DESIRED_KEY),
                revision=self._desired_revision,
                value=value,
            )

    async def put_desired_state(self, desired: CompiledSnapshotIntent) -> AudioStateDesiredEnvelope:
        async with self._lock:
            self._revision += 1
            self._desired = desired.model_dump(mode="json")
            self._desired_revision = self._revision
            self._persist()
            return AudioStateDesiredEnvelope(
                namespace=self._namespace,
                key=self._key(DESIRED_KEY),
                revision=self._desired_revision,
                value=desired,
            )

    # -- observations ------------------------------------------------------

    async def put_observation(self, observation: AudioStateObservation) -> AudioStateObservationEnvelope:
        async with self._lock:
            self._revision += 1
            expires = _now() + self._observation_ttl_s
            payload = observation.model_dump(mode="json")
            self._observations[observation.node_id] = (payload, self._revision, expires)
            self._persist()
            return AudioStateObservationEnvelope(
                namespace=self._namespace,
                key=self.observation_key(observation.node_id),
                revision=self._revision,
                ttl_seconds=self._observation_ttl_s,
                value=observation,
            )

    async def list_observations(
        self, *, state_version: int | None = None
    ) -> AudioStateObservationListResponse:
        async with self._lock:
            self._evict_expired_locked()
            envelopes: list[AudioStateObservationEnvelope] = []
            for node_id, (payload, revision, _expires) in self._observations.items():
                observation = AudioStateObservation.model_validate(payload)
                if state_version is not None and int(observation.observed_state_version) != int(state_version):
                    continue
                envelopes.append(
                    AudioStateObservationEnvelope(
                        namespace=self._namespace,
                        key=self.observation_key(node_id),
                        revision=revision,
                        ttl_seconds=self._observation_ttl_s,
                        value=observation,
                    )
                )
            envelopes.sort(
                key=lambda item: (item.value.observed_at, item.value.node_id),
                reverse=True,
            )
            return AudioStateObservationListResponse(
                namespace=self._namespace,
                count=len(envelopes),
                observations=envelopes,
            )

    # -- persistence + eviction -------------------------------------------

    def _evict_expired_locked(self) -> None:
        now = _now()
        expired = [node_id for node_id, (_p, _r, exp) in self._observations.items() if exp <= now]
        for node_id in expired:
            self._observations.pop(node_id, None)
        if expired:
            self._persist()

    def _persist(self) -> None:
        if self._storage_path is None:
            return
        data = {
            "namespace": self._namespace,
            "revision": self._revision,
            "committed": self._committed,
            "committed_revision": self._committed_revision,
            "desired": self._desired,
            "desired_revision": self._desired_revision,
            "observations": {
                node_id: {
                    "payload": payload,
                    "revision": revision,
                    "expires_at": expires,
                }
                for node_id, (payload, revision, expires) in self._observations.items()
            },
        }
        try:
            _atomic_write_json(self._storage_path, data)
        except OSError as exc:
            logger.warning("LocalAudioStateBackend: failed to persist %s: %s", self._storage_path, exc)

    def _load_from_disk(self) -> None:
        if self._storage_path is None or not self._storage_path.exists():
            return
        try:
            with self._storage_path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning(
                "LocalAudioStateBackend: failed to load %s (starting empty): %s",
                self._storage_path,
                exc,
            )
            return
        if not isinstance(data, dict):
            return
        self._revision = int(data.get("revision") or 0)
        self._committed = data.get("committed")
        committed_revision = data.get("committed_revision")
        self._committed_revision = int(committed_revision) if committed_revision is not None else None
        self._desired = data.get("desired")
        desired_revision = data.get("desired_revision")
        self._desired_revision = int(desired_revision) if desired_revision is not None else None

        observations_raw = data.get("observations") or {}
        now = _now()
        for node_id, entry in observations_raw.items():
            if not isinstance(entry, dict):
                continue
            expires = float(entry.get("expires_at") or 0.0)
            if expires <= now:
                continue  # expired across restart
            payload = entry.get("payload")
            revision = int(entry.get("revision") or 0)
            if isinstance(payload, dict):
                self._observations[node_id] = (payload, revision, expires)
