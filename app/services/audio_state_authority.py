from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.config import get_config
from app.models.audio_state import (
    AudioStateClusterStatus,
    AudioStateDerivedStatus,
    AudioStateDesiredEnvelope,
    AudioStateEnvelope,
    AudioStateEngineState,
    AudioStateEngineSummary,
    AudioStateObservation,
    AudioStateObservationEnvelope,
    AudioStateObservationListResponse,
    AudioStatePathRecord,
    AudioStatePathStatus,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)


class AudioStateAuthorityError(RuntimeError):
    """Raised when the authoritative audio state backend cannot satisfy a request."""


def _b64encode(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _b64decode(value: str) -> str:
    return base64.b64decode(value.encode("ascii")).decode("utf-8")


def _range_end(prefix: str) -> str:
    if not prefix:
        return "\0"
    prefix_bytes = bytearray(prefix.encode("utf-8"))
    for index in range(len(prefix_bytes) - 1, -1, -1):
        if prefix_bytes[index] < 0xFF:
            prefix_bytes[index] += 1
            return prefix_bytes[: index + 1].decode("utf-8", errors="ignore")
    return "\0"


@dataclass(frozen=True)
class AudioStateEtcdConfig:
    endpoints: tuple[str, ...]
    namespace: str
    connect_timeout_s: float
    request_timeout_s: float
    verify_tls: bool | str
    observation_ttl_s: int


def load_audio_state_etcd_config() -> AudioStateEtcdConfig:
    manager = get_config()
    verify_tls = bool(manager.get("audio_state.etcd_verify_tls", True))
    ca_cert_path = str(manager.get("audio_state.etcd_ca_cert_path", "") or "").strip()
    return AudioStateEtcdConfig(
        endpoints=tuple(str(item).strip() for item in (manager.get("audio_state.etcd_endpoints", []) or []) if str(item).strip()),
        namespace=str(manager.get("audio_state.etcd_namespace", "/map2/audio-state/v1") or "/map2/audio-state/v1").rstrip("/"),
        connect_timeout_s=float(manager.get("audio_state.etcd_connect_timeout_s", 2.0) or 2.0),
        request_timeout_s=float(manager.get("audio_state.etcd_request_timeout_s", 5.0) or 5.0),
        verify_tls=ca_cert_path if ca_cert_path else verify_tls,
        observation_ttl_s=int(manager.get("audio_state.node_observation_ttl_s", 15) or 15),
    )


class EtcdV3JsonClient:
    """Minimal etcd v3 JSON API client for authoritative audio-state storage."""

    def __init__(self, config: AudioStateEtcdConfig):
        if not config.endpoints:
            raise AudioStateAuthorityError("audio_state.etcd_endpoints is empty")
        self.config = config

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        timeout = httpx.Timeout(self.config.request_timeout_s, connect=self.config.connect_timeout_s)
        last_error: Exception | None = None
        for endpoint in self.config.endpoints:
            url = f"{endpoint.rstrip('/')}{path}"
            try:
                async with httpx.AsyncClient(timeout=timeout, verify=self.config.verify_tls) as client:
                    response = await client.post(url, json=payload)
                    response.raise_for_status()
                    return response.json()
            except Exception as exc:  # pragma: no cover - network failure path
                last_error = exc
        raise AudioStateAuthorityError(f"Failed etcd request {path}: {last_error}")

    async def get_json(self, key: str) -> tuple[Optional[dict[str, Any]], Optional[int]]:
        response = await self._post("/v3/kv/range", {"key": _b64encode(key)})
        kvs = response.get("kvs") or []
        if not kvs:
            return None, None
        first = kvs[0]
        raw_value = first.get("value")
        if not isinstance(raw_value, str):
            return None, None
        revision = int(first.get("mod_revision")) if first.get("mod_revision") is not None else None
        return json.loads(_b64decode(raw_value)), revision

    async def get_prefix_json(self, prefix: str) -> list[tuple[str, dict[str, Any], Optional[int]]]:
        response = await self._post(
            "/v3/kv/range",
            {
                "key": _b64encode(prefix),
                "range_end": _b64encode(_range_end(prefix)),
            },
        )
        kvs = response.get("kvs") or []
        rows: list[tuple[str, dict[str, Any], Optional[int]]] = []
        for item in kvs:
            raw_key = item.get("key")
            raw_value = item.get("value")
            if not isinstance(raw_key, str) or not isinstance(raw_value, str):
                continue
            rows.append(
                (
                    _b64decode(raw_key),
                    json.loads(_b64decode(raw_value)),
                    int(item.get("mod_revision")) if item.get("mod_revision") is not None else None,
                )
            )
        return rows

    async def put_json(self, key: str, value: dict[str, Any], lease_id: Optional[int] = None) -> Optional[int]:
        payload: dict[str, Any] = {
            "key": _b64encode(key),
            "value": _b64encode(json.dumps(value, sort_keys=True, separators=(",", ":"))),
        }
        if lease_id is not None:
            payload["lease"] = lease_id
        response = await self._post("/v3/kv/put", payload)
        header = response.get("header") or {}
        revision = header.get("revision")
        return int(revision) if revision is not None else None

    async def grant_lease(self, ttl_seconds: int) -> int:
        response = await self._post("/v3/lease/grant", {"TTL": ttl_seconds})
        lease_id = response.get("ID")
        if lease_id is None:
            raise AudioStateAuthorityError("etcd lease grant did not return an ID")
        return int(lease_id)


class AudioStateAuthorityService:
    """Authoritative etcd-backed storage facade for the audio-state control plane."""

    COMMITTED_SUFFIX = "committed"
    DESIRED_SUFFIX = "desired"
    OBSERVED_SUFFIX = "observed"

    def __init__(self, config: AudioStateEtcdConfig | None = None):
        self.config = config or load_audio_state_etcd_config()
        self.client = EtcdV3JsonClient(self.config)

    @property
    def namespace(self) -> str:
        return self.config.namespace

    def _key(self, suffix: str) -> str:
        return f"{self.namespace}/{suffix}"

    def observation_key(self, node_id: str) -> str:
        normalized = node_id.strip()
        if not normalized:
            raise AudioStateAuthorityError("node_id is required for audio-state observations")
        return f"{self.namespace}/{self.OBSERVED_SUFFIX}/{normalized}"

    async def get_committed_state(self) -> AudioStateEnvelope:
        payload, revision = await self.client.get_json(self._key(self.COMMITTED_SUFFIX))
        if payload is None:
            raise AudioStateAuthorityError("No committed authoritative audio state exists in etcd")
        return AudioStateEnvelope(
            namespace=self.namespace,
            key=self._key(self.COMMITTED_SUFFIX),
            revision=revision,
            value=AuthoritativeAudioState.model_validate(payload),
        )

    async def next_state_version(self) -> int:
        try:
            current = await self.get_committed_state()
        except AudioStateAuthorityError as exc:
            if "No committed authoritative audio state exists" in str(exc):
                return 1
            raise
        return int(current.value.state_version) + 1

    async def get_desired_state(self) -> AudioStateDesiredEnvelope:
        payload, revision = await self.client.get_json(self._key(self.DESIRED_SUFFIX))
        if payload is None:
            raise AudioStateAuthorityError("No desired audio state exists in etcd")
        return AudioStateDesiredEnvelope(
            namespace=self.namespace,
            key=self._key(self.DESIRED_SUFFIX),
            revision=revision,
            value=CompiledSnapshotIntent.model_validate(payload),
        )

    async def put_desired_state(self, desired: CompiledSnapshotIntent) -> AudioStateDesiredEnvelope:
        key = self._key(self.DESIRED_SUFFIX)
        revision = await self.client.put_json(key, desired.model_dump(mode="json"))
        return AudioStateDesiredEnvelope(namespace=self.namespace, key=key, revision=revision, value=desired)

    async def put_committed_state(self, state: AuthoritativeAudioState) -> AudioStateEnvelope:
        key = self._key(self.COMMITTED_SUFFIX)
        revision = await self.client.put_json(key, state.model_dump(mode="json"))
        return AudioStateEnvelope(namespace=self.namespace, key=key, revision=revision, value=state)

    async def put_observation(self, observation: AudioStateObservation) -> AudioStateObservationEnvelope:
        lease_id = await self.client.grant_lease(self.config.observation_ttl_s)
        key = self.observation_key(observation.node_id)
        revision = await self.client.put_json(key, observation.model_dump(mode="json"), lease_id=lease_id)
        return AudioStateObservationEnvelope(
            namespace=self.namespace,
            key=key,
            revision=revision,
            ttl_seconds=self.config.observation_ttl_s,
            value=observation,
        )

    async def list_observations(self, *, state_version: int | None = None) -> AudioStateObservationListResponse:
        prefix = self._key(f"{self.OBSERVED_SUFFIX}/")
        rows = await self.client.get_prefix_json(prefix)
        observations = [
            AudioStateObservationEnvelope(
                namespace=self.namespace,
                key=key,
                revision=revision,
                ttl_seconds=self.config.observation_ttl_s,
                value=AudioStateObservation.model_validate(payload),
            )
            for key, payload, revision in rows
        ]
        if state_version is not None:
            observations = [
                item for item in observations
                if int(item.value.observed_state_version) == int(state_version)
            ]
        observations.sort(key=lambda item: (item.value.observed_at, item.value.node_id), reverse=True)
        return AudioStateObservationListResponse(
            namespace=self.namespace,
            count=len(observations),
            observations=observations,
        )

    async def reconcile_committed_state(self) -> AudioStateEnvelope:
        current = await self.get_committed_state()
        observations_response = await self.list_observations(state_version=current.value.state_version)
        merged = self._merge_observations_into_committed_state(current.value, observations_response.observations)
        return await self.put_committed_state(merged)

    def _merge_observations_into_committed_state(
        self,
        current: AuthoritativeAudioState,
        observations: list[AudioStateObservationEnvelope],
    ) -> AuthoritativeAudioState:
        path_map = {path.path_id: path.model_copy(deep=True) for path in current.paths}
        applied_node_ids: list[str] = []
        degraded_node_ids: list[str] = []

        for envelope in observations:
            observation = envelope.value
            if observation.applied:
                applied_node_ids.append(observation.node_id)
            for runtime_path in observation.runtime_paths:
                existing = path_map.get(runtime_path.path_id)
                if existing is None:
                    path_map[runtime_path.path_id] = runtime_path.model_copy(update={"owner_node_id": observation.node_id})
                    continue
                path_map[runtime_path.path_id] = existing.model_copy(
                    update={
                        "runtime_chain_id": runtime_path.runtime_chain_id,
                        "owner_node_id": observation.node_id,
                        "status": runtime_path.status,
                        "status_reason": runtime_path.status_reason,
                        "snapshot_chain_id": runtime_path.snapshot_chain_id or existing.snapshot_chain_id,
                    }
                )

            path_statuses = {runtime_path.status for runtime_path in observation.runtime_paths}
            is_degraded = observation.engine.is_offline or observation.engine.is_warning or any(
                status in {AudioStatePathStatus.NOT_LOADED, AudioStatePathStatus.OFFLINE, AudioStatePathStatus.DEGRADED}
                for status in path_statuses
            )
            if is_degraded:
                degraded_node_ids.append(observation.node_id)

        expected_node_ids = current.desired.deployment.preferred_nodes or [current.origin_node_id]
        applied_set = set(applied_node_ids)
        degraded_set = set(degraded_node_ids)

        if not applied_set:
            sync_status = "pending_apply"
        elif degraded_set:
            sync_status = "degraded"
        elif all(node_id in applied_set for node_id in expected_node_ids):
            sync_status = "synced"
        else:
            sync_status = "partial_apply"

        engine = self._resolve_engine_summary(current, observations, expected_node_ids)
        observed_summary = current.observed_summary.model_copy(deep=True)
        preferred_observation = self._pick_preferred_observation(observations, current.origin_node_id)
        if preferred_observation is not None:
            observed_summary = observed_summary.model_copy(
                update={
                    "effective_input_device": preferred_observation.effective_input_device or observed_summary.effective_input_device,
                    "effective_output_device": preferred_observation.effective_output_device or observed_summary.effective_output_device,
                }
            )

        merged_paths = list(path_map.values())
        merged_paths.sort(key=lambda item: current.desired.routing.path_order.index(item.path_id) if item.path_id in current.desired.routing.path_order else len(current.desired.routing.path_order))
        active_count = sum(1 for path in merged_paths if path.status == AudioStatePathStatus.ACTIVE)
        inactive_messages = [
            self._format_path_status_message(path)
            for path in merged_paths
            if path.status != AudioStatePathStatus.ACTIVE
        ]

        return current.model_copy(
            update={
                "committed_at": self._current_timestamp(),
                "observed_summary": observed_summary,
                "cluster": AudioStateClusterStatus(
                    sync_status=sync_status,
                    applied_node_ids=sorted(applied_set),
                    degraded_node_ids=sorted(degraded_set),
                ),
                "engine": engine,
                "paths": merged_paths,
                "derived": AudioStateDerivedStatus(
                    active_channel_count=active_count,
                    total_channel_count=len(merged_paths),
                    inactive_messages=inactive_messages,
                ),
            }
        )

    def _resolve_engine_summary(
        self,
        current: AuthoritativeAudioState,
        observations: list[AudioStateObservationEnvelope],
        expected_node_ids: list[str],
    ) -> AudioStateEngineSummary:
        if not observations:
            return current.engine

        observed_states = [
            item.value.engine.display_state
            for item in observations
            if item.value.node_id in expected_node_ids or not expected_node_ids
        ]
        if not observed_states:
            observed_states = [item.value.engine.display_state for item in observations]

        display_state = AudioStateEngineState.STOPPED
        if any(state == AudioStateEngineState.OFFLINE for state in observed_states):
            display_state = AudioStateEngineState.OFFLINE
        elif any(state == AudioStateEngineState.LIVE_WARNING for state in observed_states):
            display_state = AudioStateEngineState.LIVE_WARNING
        elif any(state == AudioStateEngineState.LIVE for state in observed_states):
            display_state = AudioStateEngineState.LIVE

        return AudioStateEngineSummary(
            display_state=display_state,
            is_warning=display_state == AudioStateEngineState.LIVE_WARNING,
            is_offline=display_state == AudioStateEngineState.OFFLINE,
        )

    def _pick_preferred_observation(
        self,
        observations: list[AudioStateObservationEnvelope],
        origin_node_id: str,
    ) -> AudioStateObservation | None:
        for envelope in observations:
            if envelope.value.node_id == origin_node_id:
                return envelope.value
        return observations[0].value if observations else None

    def _format_path_status_message(self, path: AudioStatePathRecord) -> str:
        if path.status == AudioStatePathStatus.PENDING:
            return f"Channel {path.label} pending apply."
        if path.status == AudioStatePathStatus.NOT_LOADED:
            return f"Channel {path.label} is not loaded."
        if path.status == AudioStatePathStatus.OFFLINE:
            return f"Channel {path.label} is offline."
        if path.status == AudioStatePathStatus.DEGRADED:
            return f"Channel {path.label} is degraded."
        return f"Channel {path.label} status unknown."

    def _current_timestamp(self) -> str:
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
