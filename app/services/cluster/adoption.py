"""
Shared node-adoption lifecycle for unmanaged MAP2 peers.
"""

from __future__ import annotations

import json
import logging
import re
import socket
import sqlite3
from contextlib import contextmanager
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlparse
from uuid import uuid4

from app.services.cluster.registry import ClusterRegistry, get_cluster_registry
from app.utils.platform_version import get_platform_version

logger = logging.getLogger(__name__)

TrustState = Literal["unknown", "claimed", "trusted", "lost", "orphaned"]
AdoptionState = Literal["candidate", "claimable", "adopted", "ready", "blocked", "orphaned"]
ActivationState = Literal["standby", "active"]
CheckStatus = Literal["pass", "warn", "fail"]


class AdoptionError(RuntimeError):
    """Base adoption service error."""


class AdoptionNotFoundError(AdoptionError):
    """Raised when an adoption record does not exist."""


class AdoptionConflictError(AdoptionError):
    """Raised when an adoption action conflicts with current state."""


class AdoptionTransitionError(AdoptionError):
    """Raised when an invalid state transition is requested."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            return datetime.fromisoformat(raw)
        except ValueError:
            return None
    return None


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _parse_json_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "to_dict"):
        try:
            parsed = value.to_dict()
        except Exception:
            parsed = None
        if isinstance(parsed, dict):
            return dict(parsed)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _parse_json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return list(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except Exception:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _normalize_token(value: Optional[str], *, fallback: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value or "").strip("-").lower()
    return normalized or fallback


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _stringify_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, sort_keys=True)
        except Exception:
            return str(value)
    return str(value)


def _candidate_sort_rank(state: str) -> int:
    order = {
        "blocked": 0,
        "candidate": 1,
        "claimable": 2,
        "adopted": 3,
        "ready": 4,
        "orphaned": 5,
    }
    return order.get(state, 99)


@dataclass
class ReadinessCheck:
    id: str
    status: CheckStatus
    message: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "message": self.message,
            "details": dict(self.details),
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ReadinessCheck":
        return cls(
            id=str(payload.get("id") or "unknown"),
            status=str(payload.get("status") or "warn"),  # type: ignore[arg-type]
            message=_normalize_text(payload.get("message")),
            details=_parse_json_dict(payload.get("details")),
        )


@dataclass
class ReadinessReport:
    status: Literal["ready", "warning", "blocked"]
    checks: list[ReadinessCheck]
    computed_at: datetime

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "checks": [check.to_dict() for check in self.checks],
            "computed_at": _isoformat(self.computed_at),
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> Optional["ReadinessReport"]:
        if not payload:
            return None
        computed_at = _parse_datetime(payload.get("computed_at")) or _utcnow()
        checks = [ReadinessCheck.from_dict(item) for item in _parse_json_list(payload.get("checks")) if isinstance(item, dict)]
        status = str(payload.get("status") or "warning")
        if status not in {"ready", "warning", "blocked"}:
            status = "warning"
        return cls(status=status, checks=checks, computed_at=computed_at)

    def summary(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "blocking_count": len([check for check in self.checks if check.status == "fail"]),
            "warning_count": len([check for check in self.checks if check.status == "warn"]),
            "computed_at": _isoformat(self.computed_at),
        }


@dataclass
class AdoptionRecord:
    candidate_id: str
    remote_node_id: Optional[str]
    node_id: Optional[str]
    hostname: str
    display_name: Optional[str]
    api_url: Optional[str]
    addresses: list[str]
    software_version: Optional[str]
    capabilities: Dict[str, Any]
    trust_state: TrustState
    adoption_state: AdoptionState
    activation_state: ActivationState
    claimed_by_node_id: Optional[str]
    remote_fingerprint: Optional[str]
    registered: bool
    visible: bool
    readiness: Optional[ReadinessReport]
    first_seen: datetime
    last_seen: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> Dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "remote_node_id": self.remote_node_id,
            "node_id": self.node_id,
            "hostname": self.hostname,
            "display_name": self.display_name,
            "api_url": self.api_url,
            "addresses_json": json.dumps(self.addresses),
            "software_version": self.software_version,
            "capabilities_json": json.dumps(self.capabilities),
            "trust_state": self.trust_state,
            "adoption_state": self.adoption_state,
            "activation_state": self.activation_state,
            "claimed_by_node_id": self.claimed_by_node_id,
            "remote_fingerprint": self.remote_fingerprint,
            "registered": 1 if self.registered else 0,
            "visible": 1 if self.visible else 0,
            "readiness_json": json.dumps(self.readiness.to_dict()) if self.readiness else None,
            "first_seen": _isoformat(self.first_seen),
            "last_seen": _isoformat(self.last_seen),
            "metadata_json": json.dumps(self.metadata),
        }

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "AdoptionRecord":
        readiness_payload = _parse_json_dict(row.get("readiness_json"))
        readiness = ReadinessReport.from_dict(readiness_payload)
        return cls(
            candidate_id=str(row.get("candidate_id") or ""),
            remote_node_id=_normalize_text(row.get("remote_node_id")),
            node_id=_normalize_text(row.get("node_id")),
            hostname=str(row.get("hostname") or "unknown"),
            display_name=_normalize_text(row.get("display_name")),
            api_url=_normalize_text(row.get("api_url")),
            addresses=[str(item) for item in _parse_json_list(row.get("addresses_json")) if _normalize_text(item)],
            software_version=_normalize_text(row.get("software_version")),
            capabilities=_parse_json_dict(row.get("capabilities_json")),
            trust_state=str(row.get("trust_state") or "unknown"),  # type: ignore[arg-type]
            adoption_state=str(row.get("adoption_state") or "candidate"),  # type: ignore[arg-type]
            activation_state=str(row.get("activation_state") or "standby"),  # type: ignore[arg-type]
            claimed_by_node_id=_normalize_text(row.get("claimed_by_node_id")),
            remote_fingerprint=_normalize_text(row.get("remote_fingerprint")),
            registered=bool(row.get("registered")),
            visible=bool(row.get("visible")),
            readiness=readiness,
            first_seen=_parse_datetime(row.get("first_seen")) or _utcnow(),
            last_seen=_parse_datetime(row.get("last_seen")) or _utcnow(),
            metadata=_parse_json_dict(row.get("metadata_json")),
        )

    def sort_key(self) -> tuple[int, str, str]:
        return (
            _candidate_sort_rank(self.adoption_state),
            self.display_name or self.hostname,
            self.candidate_id,
        )


class AdoptionStore:
    """SQLite-backed storage for adoption records and event history."""

    DB_PATH = ClusterRegistry.DB_PATH

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path or self.DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    @contextmanager
    def _connection(self) -> sqlite3.Connection:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS adoption_records (
                    candidate_id TEXT PRIMARY KEY,
                    remote_node_id TEXT,
                    node_id TEXT UNIQUE,
                    hostname TEXT NOT NULL,
                    display_name TEXT,
                    api_url TEXT,
                    addresses_json TEXT DEFAULT '[]',
                    software_version TEXT,
                    capabilities_json TEXT DEFAULT '{}',
                    trust_state TEXT DEFAULT 'unknown',
                    adoption_state TEXT DEFAULT 'candidate',
                    activation_state TEXT DEFAULT 'standby',
                    claimed_by_node_id TEXT,
                    remote_fingerprint TEXT,
                    registered INTEGER DEFAULT 0,
                    visible INTEGER DEFAULT 1,
                    readiness_json TEXT,
                    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata_json TEXT DEFAULT '{}'
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS adoption_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    candidate_id TEXT NOT NULL,
                    node_id TEXT,
                    event_type TEXT NOT NULL,
                    actor TEXT,
                    payload_json TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_adoption_records_remote_node_id ON adoption_records(remote_node_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_adoption_records_state ON adoption_records(adoption_state)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_adoption_events_candidate ON adoption_events(candidate_id)"
            )
            conn.commit()

    def upsert_record(self, record: AdoptionRecord) -> AdoptionRecord:
        row = record.to_row()
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO adoption_records (
                    candidate_id, remote_node_id, node_id, hostname, display_name, api_url,
                    addresses_json, software_version, capabilities_json, trust_state,
                    adoption_state, activation_state, claimed_by_node_id, remote_fingerprint,
                    registered, visible, readiness_json, first_seen, last_seen, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(candidate_id) DO UPDATE SET
                    remote_node_id = excluded.remote_node_id,
                    node_id = excluded.node_id,
                    hostname = excluded.hostname,
                    display_name = excluded.display_name,
                    api_url = excluded.api_url,
                    addresses_json = excluded.addresses_json,
                    software_version = excluded.software_version,
                    capabilities_json = excluded.capabilities_json,
                    trust_state = excluded.trust_state,
                    adoption_state = excluded.adoption_state,
                    activation_state = excluded.activation_state,
                    claimed_by_node_id = excluded.claimed_by_node_id,
                    remote_fingerprint = excluded.remote_fingerprint,
                    registered = excluded.registered,
                    visible = excluded.visible,
                    readiness_json = excluded.readiness_json,
                    first_seen = excluded.first_seen,
                    last_seen = excluded.last_seen,
                    metadata_json = excluded.metadata_json
                """,
                (
                    row["candidate_id"],
                    row["remote_node_id"],
                    row["node_id"],
                    row["hostname"],
                    row["display_name"],
                    row["api_url"],
                    row["addresses_json"],
                    row["software_version"],
                    row["capabilities_json"],
                    row["trust_state"],
                    row["adoption_state"],
                    row["activation_state"],
                    row["claimed_by_node_id"],
                    row["remote_fingerprint"],
                    row["registered"],
                    row["visible"],
                    row["readiness_json"],
                    row["first_seen"],
                    row["last_seen"],
                    row["metadata_json"],
                ),
            )
            conn.commit()
        return record

    def get_record(self, candidate_id: str) -> Optional[AdoptionRecord]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM adoption_records WHERE candidate_id = ?",
                (candidate_id,),
            )
            row = cursor.fetchone()
            return AdoptionRecord.from_row(dict(row)) if row else None

    def get_record_by_node_id(self, node_id: str) -> Optional[AdoptionRecord]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM adoption_records WHERE node_id = ?",
                (node_id,),
            )
            row = cursor.fetchone()
            return AdoptionRecord.from_row(dict(row)) if row else None

    def list_records(self) -> list[AdoptionRecord]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM adoption_records ORDER BY candidate_id")
            return [AdoptionRecord.from_row(dict(row)) for row in cursor.fetchall()]

    def delete_record(self, candidate_id: str) -> bool:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM adoption_records WHERE candidate_id = ?", (candidate_id,))
            conn.commit()
            return cursor.rowcount > 0

    def append_event(
        self,
        *,
        candidate_id: str,
        node_id: Optional[str],
        event_type: str,
        actor: Optional[str],
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO adoption_events (candidate_id, node_id, event_type, actor, payload_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    candidate_id,
                    node_id,
                    event_type,
                    actor,
                    json.dumps(payload or {}, sort_keys=True, separators=(",", ":")),
                ),
            )
            conn.commit()


class AdoptionService:
    """Business logic for MAP2 node adoption."""

    def __init__(
        self,
        *,
        store: Optional[AdoptionStore] = None,
        registry: Optional[ClusterRegistry] = None,
    ):
        self.store = store or AdoptionStore()
        self.registry = registry or get_cluster_registry()

    def _get_local_clone_source(self) -> Dict[str, Any]:
        from app.config import config_get
        from app.deployment.deployment import get_deployment_config

        hostname = socket.gethostname() or "localhost"
        try:
            deployment_mode = str(get_deployment_config().mode.value or "ALL-IN-ONE").upper()
        except Exception:
            deployment_mode = "ALL-IN-ONE"
        api_port = _coerce_int(config_get("backend.port", 8080), 8080)
        return {
            "node_id": "local",
            "hostname": hostname,
            "display_name": "This node",
            "role": deployment_mode,
            "deployment_mode": deployment_mode,
            "api_url": f"http://127.0.0.1:{api_port}",
            "is_local": True,
            "status": "online",
            "version": get_platform_version(),
        }

    def _registry_clone_source_from_row(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        node_id = _normalize_text(row.get("id") or row.get("node_id"))
        if not node_id:
            return None

        metadata = _parse_json_dict(row.get("metadata"))
        api_url = _normalize_text(metadata.get("url") or metadata.get("node_url"))
        if not api_url:
            host = _normalize_text(row.get("ip_address"))
            port = _coerce_int(metadata.get("api_port"), 8080)
            if host:
                api_url = f"http://{host}:{port}"

        display_name = (
            _normalize_text(metadata.get("display_name"))
            or _normalize_text(metadata.get("node_label"))
            or _normalize_text(metadata.get("friendly_name"))
        )

        return {
            "node_id": node_id,
            "hostname": _normalize_text(row.get("hostname")) or node_id,
            "display_name": display_name,
            "role": _normalize_text(row.get("role")) or "AUDIO-NODE",
            "deployment_mode": _normalize_text(row.get("deployment_mode")) or _normalize_text(row.get("role")) or "AUDIO-NODE",
            "api_url": api_url,
            "is_local": False,
            "status": _normalize_text(row.get("status")) or "unknown",
            "version": _normalize_text(row.get("version")),
        }

    def list_clone_sources(self, *, target_node_id: Optional[str] = None) -> list[Dict[str, Any]]:
        normalized_target = _normalize_text(target_node_id)
        sources: list[Dict[str, Any]] = []
        seen: set[str] = set()

        local_source = self._get_local_clone_source()
        if local_source["node_id"] != normalized_target:
            sources.append(local_source)
            seen.add(local_source["node_id"])

        for row in self.registry.get_all_nodes():
            descriptor = self._registry_clone_source_from_row(row)
            if descriptor is None:
                continue
            node_id = descriptor["node_id"]
            if node_id == normalized_target or node_id in seen:
                continue
            sources.append(descriptor)
            seen.add(node_id)

        return [sources[0], *sorted(sources[1:], key=lambda item: (item.get("hostname") or "", item.get("node_id") or ""))] if sources else []

    def _resolve_clone_source(self, source_node_id: str, *, target_node_id: Optional[str]) -> Dict[str, Any]:
        normalized_source = _normalize_text(source_node_id)
        if not normalized_source:
            raise AdoptionTransitionError("A clone source node is required")

        for source in self.list_clone_sources(target_node_id=target_node_id):
            if _normalize_text(source.get("node_id")) == normalized_source:
                return source
        raise AdoptionNotFoundError(f"Clone source {normalized_source} not found")

    def _request_remote_json(
        self,
        method: str,
        url: str,
        *,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        import httpx

        try:
            response = httpx.request(method.upper(), url, json=payload, timeout=5.0)
        except httpx.HTTPError as exc:
            raise AdoptionTransitionError(f"Remote request failed for {url}: {exc}") from exc

        if response.status_code >= 400:
            detail = None
            try:
                response_payload = response.json()
            except Exception:
                response_payload = {}
            if isinstance(response_payload, dict):
                detail = _normalize_text(response_payload.get("detail") or response_payload.get("message"))
            raise AdoptionTransitionError(detail or f"Remote request failed for {url} with status {response.status_code}")

        try:
            parsed = response.json()
        except Exception as exc:
            raise AdoptionTransitionError(f"Remote request returned invalid JSON for {url}") from exc

        if not isinstance(parsed, dict):
            raise AdoptionTransitionError(f"Remote request returned an unsupported payload for {url}")
        return parsed

    def _try_request_remote_json(
        self,
        method: str,
        url: str,
        *,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        try:
            return self._request_remote_json(method, url, payload=payload)
        except AdoptionTransitionError:
            return None

    def _fetch_clone_source_snapshot(self, source: Dict[str, Any]) -> Dict[str, Any]:
        source_api_url = _normalize_text(source.get("api_url"))
        if not source_api_url:
            raise AdoptionTransitionError("Clone source does not advertise a management API")

        base_url = source_api_url.rstrip("/")
        return {
            "deployment_mode": self._request_remote_json("GET", f"{base_url}/api/deployment/mode"),
            "runtime_profile": self._try_request_remote_json("GET", f"{base_url}/api/runtime-profiles/status"),
            "audio_source_of_truth": self._try_request_remote_json("GET", f"{base_url}/api/audio/source-of-truth"),
            "avb_status": self._try_request_remote_json("GET", f"{base_url}/api/avb/status"),
        }

    def _clone_group(
        self,
        *,
        group_id: str,
        label: str,
        description: str,
        items: list[Dict[str, str]],
        apply_kind: str,
        apply_payload: Dict[str, Any],
        default_selected: bool = True,
    ) -> Dict[str, Any]:
        return {
            "id": group_id,
            "label": label,
            "description": description,
            "items": items,
            "default_selected": bool(default_selected),
            "apply": {
                "kind": apply_kind,
                **apply_payload,
            },
        }

    def _build_clone_group_payloads(
        self,
        *,
        source: Dict[str, Any],
        snapshot: Dict[str, Any],
    ) -> Dict[str, Dict[str, Any]]:
        groups: Dict[str, Dict[str, Any]] = {}

        deployment_payload = _parse_json_dict(snapshot.get("deployment_mode"))
        source_mode = _normalize_text(deployment_payload.get("mode")) or _normalize_text(source.get("deployment_mode"))
        source_role = _normalize_text(source.get("role")) or source_mode
        if source_mode or source_role:
            items: list[Dict[str, str]] = []
            if source_mode:
                items.append({"key": "deployment.mode", "label": "Deployment mode", "value": source_mode})
            if source_role:
                items.append({"key": "cluster.role", "label": "Cluster role", "value": source_role})
            groups["role_profile"] = self._clone_group(
                group_id="role_profile",
                label="Role and deployment mode",
                description="Copy the source node's deployment mode and cluster role defaults.",
                items=items,
                apply_kind="deployment",
                apply_payload={
                    "deployment_mode": source_mode or "AUDIO-NODE",
                    "role": source_role or source_mode or "AUDIO-NODE",
                },
            )

        runtime_payload = _parse_json_dict(snapshot.get("runtime_profile"))
        current_profile = _normalize_text(runtime_payload.get("current_profile"))
        if current_profile and current_profile.upper() != "N/A":
            groups["runtime_profile"] = self._clone_group(
                group_id="runtime_profile",
                label="Runtime profile",
                description="Copy the source node's current audio runtime profile policy.",
                items=[
                    {"key": "audio.runtime_profile", "label": "Runtime profile", "value": current_profile},
                ],
                apply_kind="runtime_profile",
                apply_payload={"profile": current_profile},
            )

        source_of_truth = _parse_json_dict(snapshot.get("audio_source_of_truth"))
        profile_payload = _parse_json_dict(source_of_truth.get("profile"))
        configured_payload = _parse_json_dict(source_of_truth.get("configured"))
        clock_values: Dict[str, Any] = {}
        selected_profile = _normalize_text(profile_payload.get("selected_profile"))
        profile_version = _normalize_text(profile_payload.get("profile_version"))
        clock_master = _normalize_text(profile_payload.get("clock_master"))
        engine_rate_hz = configured_payload.get("engine_rate_hz")
        avb_stream_rate_hz = configured_payload.get("avb_stream_rate_hz")
        spdif_rate_hz = configured_payload.get("spdif_rate_hz")
        buffer_size_samples = configured_payload.get("buffer_size_samples")
        bits_per_sample = configured_payload.get("bits_per_sample")
        allowed_rates_hz = configured_payload.get("allowed_rates_hz")
        require_hard_lock = configured_payload.get("require_hard_lock")
        allow_resampler = configured_payload.get("allow_resampler")
        clock_items: list[Dict[str, str]] = []

        if selected_profile:
            clock_values["clock_sync.selected_profile"] = selected_profile
            clock_values["audio.sync_profile"] = selected_profile
            clock_items.append({"key": "clock_sync.selected_profile", "label": "Clock profile", "value": selected_profile})
        if profile_version:
            clock_values["clock_sync.profile_version"] = profile_version
            clock_items.append({"key": "clock_sync.profile_version", "label": "Profile version", "value": profile_version})
        if clock_master:
            clock_values["clock_sync.clock_master"] = clock_master
            clock_values["audio.clock_master"] = clock_master
            clock_items.append({"key": "clock_sync.clock_master", "label": "Clock master", "value": clock_master})
        if engine_rate_hz is not None:
            clock_values["clock_sync.engine_rate_hz"] = engine_rate_hz
            clock_values["audio.sample_rate"] = engine_rate_hz
            clock_items.append({"key": "clock_sync.engine_rate_hz", "label": "Engine rate", "value": _stringify_value(engine_rate_hz)})
        if avb_stream_rate_hz is not None:
            clock_values["clock_sync.avb_stream_rate_hz"] = avb_stream_rate_hz
            clock_items.append({"key": "clock_sync.avb_stream_rate_hz", "label": "AVB stream rate", "value": _stringify_value(avb_stream_rate_hz)})
        if spdif_rate_hz is not None:
            clock_values["clock_sync.spdif_rate_hz"] = spdif_rate_hz
            clock_items.append({"key": "clock_sync.spdif_rate_hz", "label": "S/PDIF rate", "value": _stringify_value(spdif_rate_hz)})
        if buffer_size_samples is not None:
            clock_values["clock_sync.buffer_size_samples"] = buffer_size_samples
            clock_values["audio.buffer_size"] = buffer_size_samples
            clock_items.append({"key": "clock_sync.buffer_size_samples", "label": "Buffer size", "value": _stringify_value(buffer_size_samples)})
        if bits_per_sample is not None:
            clock_values["clock_sync.bits_per_sample"] = bits_per_sample
            clock_values["audio.bits_per_sample"] = bits_per_sample
            clock_items.append({"key": "clock_sync.bits_per_sample", "label": "Bit depth", "value": _stringify_value(bits_per_sample)})
        if isinstance(allowed_rates_hz, list) and allowed_rates_hz:
            clock_values["clock_sync.allowed_rates_hz"] = allowed_rates_hz
            clock_values["audio.allowed_rates_hz"] = allowed_rates_hz
            clock_items.append({"key": "clock_sync.allowed_rates_hz", "label": "Allowed rates", "value": _stringify_value(allowed_rates_hz)})
        if require_hard_lock is not None:
            clock_values["clock_sync.require_hard_lock"] = bool(require_hard_lock)
            clock_items.append({"key": "clock_sync.require_hard_lock", "label": "Require hard lock", "value": _stringify_value(bool(require_hard_lock))})
        if allow_resampler is not None:
            clock_values["clock_sync.allow_resampler"] = bool(allow_resampler)
            clock_items.append({"key": "clock_sync.allow_resampler", "label": "Allow resampler", "value": _stringify_value(bool(allow_resampler))})

        if clock_values:
            groups["clock_sync"] = self._clone_group(
                group_id="clock_sync",
                label="Clock and sync profile",
                description="Copy source clock-profile settings, engine rate, buffer size, and lock behavior.",
                items=clock_items,
                apply_kind="config",
                apply_payload={"values": clock_values},
            )

        avb_config = _parse_json_dict(_parse_json_dict(snapshot.get("avb_status")).get("config"))
        configured_avb = _parse_json_dict(configured_payload.get("avb"))
        avb_values: Dict[str, Any] = {}
        avb_items: list[Dict[str, str]] = []
        avb_enabled = configured_avb.get("enabled", avb_config.get("enabled"))
        avb_interface = _normalize_text(configured_avb.get("interface") or _parse_json_dict(snapshot.get("avb_status")).get("interface"))
        avb_auto_connect = configured_avb.get("auto_connect", avb_config.get("auto_connect"))
        avb_ptp_domain = configured_avb.get("ptp_domain", avb_config.get("ptp_domain"))
        avb_max_streams = configured_avb.get("max_streams", avb_config.get("max_streams"))

        if avb_enabled is not None:
            avb_values["avb.enabled"] = bool(avb_enabled)
            avb_items.append({"key": "avb.enabled", "label": "AVB enabled", "value": _stringify_value(bool(avb_enabled))})
        if avb_interface:
            avb_values["avb.interface"] = avb_interface
            avb_items.append({"key": "avb.interface", "label": "AVB interface", "value": avb_interface})
        if avb_auto_connect is not None:
            avb_values["avb.auto_connect"] = bool(avb_auto_connect)
            avb_items.append({"key": "avb.auto_connect", "label": "Auto-connect", "value": _stringify_value(bool(avb_auto_connect))})
        if avb_ptp_domain is not None:
            avb_values["avb.ptp_domain"] = avb_ptp_domain
            avb_items.append({"key": "avb.ptp_domain", "label": "PTP domain", "value": _stringify_value(avb_ptp_domain)})
        if avb_max_streams is not None:
            avb_values["avb.max_streams"] = avb_max_streams
            avb_items.append({"key": "avb.max_streams", "label": "Max streams", "value": _stringify_value(avb_max_streams)})

        if avb_values:
            groups["avb_defaults"] = self._clone_group(
                group_id="avb_defaults",
                label="AVB defaults",
                description="Copy safe AVB interface and stream-capacity defaults from the source node.",
                items=avb_items,
                apply_kind="config",
                apply_payload={"values": avb_values},
            )

        return groups

    def preview_clone_profile(self, node_id: str, *, source_node_id: str) -> Dict[str, Any]:
        record = self._require_node(node_id)
        if record.adoption_state not in {"adopted", "ready", "blocked"}:
            raise AdoptionTransitionError("Only adopted nodes can preview cloned profiles")

        source = self._resolve_clone_source(source_node_id, target_node_id=node_id)
        snapshot = self._fetch_clone_source_snapshot(source)
        groups = self._build_clone_group_payloads(source=source, snapshot=snapshot)

        return {
            "source": source,
            "target": record,
            "groups": [
                {
                    "id": group["id"],
                    "label": group["label"],
                    "description": group["description"],
                    "default_selected": group["default_selected"],
                    "items": list(group["items"]),
                }
                for group in groups.values()
            ],
        }

    def _candidate_id_for_visible_node(self, visible: Any) -> str:
        remote_node_id = (
            _normalize_text(getattr(visible, "node_id", None))
            or _normalize_text(getattr(visible, "hostname", None))
            or _normalize_text(getattr(visible, "host", None))
            or uuid4().hex[:12]
        )
        return f"cand_{_normalize_token(remote_node_id, fallback='node')}"

    def _extract_visible_metadata(self, visible: Any) -> Dict[str, Any]:
        metadata = _parse_json_dict(getattr(visible, "metadata", None))
        metadata.setdefault("visibility_state", _normalize_text(getattr(visible, "visibility_state", None)))
        metadata.setdefault("sources", sorted(getattr(visible, "sources", [])))
        metadata.setdefault("node_mode", _normalize_text(getattr(visible, "node_mode", None)))
        metadata.setdefault("host", _normalize_text(getattr(visible, "host", None)))
        metadata.setdefault("port", getattr(visible, "port", None))
        metadata.setdefault("avb_enabled", bool(getattr(visible, "avb_enabled", True)))
        return metadata

    def _extract_software_version(self, visible: Any, metadata: Dict[str, Any]) -> Optional[str]:
        return (
            _normalize_text(metadata.get("software_version"))
            or _normalize_text(metadata.get("version"))
            or _normalize_text(getattr(visible, "software_version", None))
        )

    def _build_record_from_visible_node(self, visible: Any, candidate_id: str) -> AdoptionRecord:
        metadata = self._extract_visible_metadata(visible)
        registered = bool(getattr(visible, "registered", False))
        is_visible = bool(getattr(visible, "visible", getattr(visible, "is_online", True)))
        remote_node_id = _normalize_text(getattr(visible, "node_id", None))
        activation_state: ActivationState = "active" if registered and is_visible else "standby"
        adoption_state: AdoptionState = "ready" if registered else "candidate"
        trust_state: TrustState = "trusted" if registered else "unknown"

        return AdoptionRecord(
            candidate_id=candidate_id,
            remote_node_id=remote_node_id,
            node_id=remote_node_id if registered else None,
            hostname=_normalize_text(getattr(visible, "hostname", None)) or remote_node_id or "unknown",
            display_name=None,
            api_url=_normalize_text(getattr(visible, "api_url", None)),
            addresses=[str(item) for item in getattr(visible, "addresses", []) if _normalize_text(item)],
            software_version=self._extract_software_version(visible, metadata),
            capabilities=_parse_json_dict(getattr(visible, "capabilities", None)),
            trust_state=trust_state,
            adoption_state=adoption_state,
            activation_state=activation_state,
            claimed_by_node_id=None,
            remote_fingerprint=_normalize_text(metadata.get("remote_fingerprint")),
            registered=registered,
            visible=is_visible,
            readiness=None,
            first_seen=_parse_datetime(getattr(visible, "discovered_at", None))
            or _parse_datetime(getattr(visible, "last_seen", None))
            or _utcnow(),
            last_seen=_parse_datetime(getattr(visible, "last_seen", None)) or _utcnow(),
            metadata=metadata,
        )

    def _merge_record_with_visible_node(
        self,
        existing: AdoptionRecord,
        visible: Any,
        candidate_id: str,
    ) -> AdoptionRecord:
        metadata = self._extract_visible_metadata(visible)
        metadata.update(existing.metadata)
        remote_node_id = (
            existing.remote_node_id
            or _normalize_text(getattr(visible, "node_id", None))
            or existing.node_id
        )
        registered = bool(getattr(visible, "registered", False) or existing.registered or existing.node_id)
        merged = AdoptionRecord(
            candidate_id=candidate_id,
            remote_node_id=remote_node_id,
            node_id=existing.node_id or (remote_node_id if registered else None),
            hostname=_normalize_text(getattr(visible, "hostname", None)) or existing.hostname,
            display_name=existing.display_name,
            api_url=_normalize_text(getattr(visible, "api_url", None)) or existing.api_url,
            addresses=[str(item) for item in getattr(visible, "addresses", []) if _normalize_text(item)] or existing.addresses,
            software_version=self._extract_software_version(visible, metadata) or existing.software_version,
            capabilities=_parse_json_dict(getattr(visible, "capabilities", None)) or existing.capabilities,
            trust_state=existing.trust_state,
            adoption_state=existing.adoption_state,
            activation_state=existing.activation_state,
            claimed_by_node_id=existing.claimed_by_node_id,
            remote_fingerprint=existing.remote_fingerprint or _normalize_text(metadata.get("remote_fingerprint")),
            registered=registered,
            visible=bool(getattr(visible, "visible", getattr(visible, "is_online", True))),
            readiness=existing.readiness,
            first_seen=existing.first_seen,
            last_seen=_parse_datetime(getattr(visible, "last_seen", None)) or existing.last_seen,
            metadata=metadata,
        )
        if merged.trust_state == "unknown" and registered:
            merged.trust_state = "trusted"
        if merged.adoption_state == "candidate" and registered:
            merged.adoption_state = "ready"
        if merged.activation_state == "standby" and registered and bool(getattr(visible, "routing_ready", False)):
            merged.activation_state = "active"
        return merged

    def reconcile_visible_candidates(self) -> int:
        from app.services.cluster.node_visibility import get_visible_remote_nodes

        _, visible_nodes = get_visible_remote_nodes()
        seen_candidate_ids: set[str] = set()

        for visible in visible_nodes.values():
            candidate_id = self._candidate_id_for_visible_node(visible)
            existing = self.store.get_record(candidate_id)
            if existing is None:
                remote_node_id = _normalize_text(getattr(visible, "node_id", None))
                if remote_node_id:
                    existing = self.store.get_record_by_node_id(remote_node_id)
            if existing is None:
                record = self._build_record_from_visible_node(visible, candidate_id)
            else:
                record = self._merge_record_with_visible_node(existing, visible, candidate_id)
            self.store.upsert_record(record)
            seen_candidate_ids.add(record.candidate_id)

        for record in self.store.list_records():
            if record.candidate_id in seen_candidate_ids:
                continue
            if record.visible:
                record.visible = False
                self.store.upsert_record(record)

        return len(seen_candidate_ids)

    def list_candidates(self, *, refresh: bool = True) -> list[AdoptionRecord]:
        if refresh:
            self.reconcile_visible_candidates()
        records = self.store.list_records()
        return sorted(records, key=lambda record: record.sort_key())

    def get_candidate(self, candidate_id: str, *, refresh: bool = True) -> Optional[AdoptionRecord]:
        if refresh:
            self.reconcile_visible_candidates()
        return self.store.get_record(candidate_id)

    def get_node(self, node_id: str, *, refresh: bool = True) -> Optional[AdoptionRecord]:
        if refresh:
            self.reconcile_visible_candidates()
        return self.store.get_record_by_node_id(node_id)

    def _hostname_conflict(self, record: AdoptionRecord) -> Optional[str]:
        for node in self.registry.get_all_nodes():
            node_id = _normalize_text(node.get("id") or node.get("node_id"))
            hostname = _normalize_text(node.get("hostname"))
            if not hostname or hostname != record.hostname:
                continue
            if record.node_id and node_id == record.node_id:
                continue
            if record.remote_node_id and node_id == record.remote_node_id:
                continue
            return node_id or record.hostname
        return None

    def _evaluate_readiness(self, record: AdoptionRecord) -> ReadinessReport:
        metadata = dict(record.metadata)
        local_version = get_platform_version()
        checks: list[ReadinessCheck] = []

        if not record.software_version:
            checks.append(
                ReadinessCheck(
                    id="version_match",
                    status="warn",
                    message="Remote software version is not advertised.",
                    details={"local_version": local_version},
                )
            )
        elif record.software_version == local_version:
            checks.append(
                ReadinessCheck(
                    id="version_match",
                    status="pass",
                    message="Remote software version matches the local node.",
                    details={"local_version": local_version, "remote_version": record.software_version},
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="version_match",
                    status="fail",
                    message="Remote software version does not match the local node.",
                    details={"local_version": local_version, "remote_version": record.software_version},
                )
            )

        conflict_node_id = self._hostname_conflict(record)
        if conflict_node_id:
            checks.append(
                ReadinessCheck(
                    id="hostname_conflict",
                    status="fail",
                    message="Hostname already exists in the cluster registry.",
                    details={"conflicting_node_id": conflict_node_id, "hostname": record.hostname},
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="hostname_conflict",
                    status="pass",
                    message="No hostname conflict detected in the cluster registry.",
                )
            )

        if record.api_url and record.visible:
            checks.append(
                ReadinessCheck(
                    id="api_reachability",
                    status="pass",
                    message="Management API endpoint is available from discovery data.",
                    details={"api_url": record.api_url},
                )
            )
        elif record.api_url:
            checks.append(
                ReadinessCheck(
                    id="api_reachability",
                    status="warn",
                    message="Management API URL is known, but the node is not currently visible.",
                    details={"api_url": record.api_url},
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="api_reachability",
                    status="fail",
                    message="Management API URL is not known for this candidate.",
                )
            )

        avb_capability = record.capabilities.get("avb")
        if avb_capability is None:
            avb_capability = metadata.get("avb_enabled")
        if avb_capability is False:
            checks.append(
                ReadinessCheck(
                    id="avb_capability",
                    status="fail",
                    message="Node reports AVB as disabled.",
                )
            )
        elif avb_capability is True:
            checks.append(
                ReadinessCheck(
                    id="avb_capability",
                    status="pass",
                    message="Node reports AVB capability.",
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="avb_capability",
                    status="warn",
                    message="AVB capability is not explicitly advertised.",
                )
            )

        ptp_state = str(metadata.get("ptp_state") or "").strip().upper()
        if ptp_state in {"LOCKED", "MASTER", "SLAVE", "PASSIVE"}:
            checks.append(
                ReadinessCheck(
                    id="ptp_readiness",
                    status="pass",
                    message=f"PTP state is {ptp_state}.",
                )
            )
        elif ptp_state in {"INITIALIZING", "LISTENING", "UNKNOWN", ""}:
            checks.append(
                ReadinessCheck(
                    id="ptp_readiness",
                    status="warn",
                    message="PTP readiness is not locked yet.",
                    details={"ptp_state": ptp_state or "UNKNOWN"},
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="ptp_readiness",
                    status="fail",
                    message="PTP reports a blocking state.",
                    details={"ptp_state": ptp_state},
                )
            )

        requested_role = _normalize_text(metadata.get("requested_role")) or _normalize_text(metadata.get("node_mode"))
        if requested_role:
            checks.append(
                ReadinessCheck(
                    id="role_compatibility",
                    status="pass",
                    message=f"Role {requested_role} is present for this node.",
                    details={"role": requested_role},
                )
            )
        else:
            checks.append(
                ReadinessCheck(
                    id="role_compatibility",
                    status="warn",
                    message="No explicit node role has been recorded yet.",
                )
            )

        if any(check.status == "fail" for check in checks):
            status: Literal["ready", "warning", "blocked"] = "blocked"
        elif any(check.status == "warn" for check in checks):
            status = "warning"
        else:
            status = "ready"

        return ReadinessReport(status=status, checks=checks, computed_at=_utcnow())

    def compute_readiness(self, candidate_id: str) -> ReadinessReport:
        record = self.get_candidate(candidate_id, refresh=True)
        if record is None:
            raise AdoptionNotFoundError(f"Candidate {candidate_id} not found")

        readiness = self._evaluate_readiness(record)
        record.readiness = readiness
        if record.node_id or record.adoption_state in {"adopted", "ready", "blocked"}:
            record.adoption_state = "blocked" if readiness.status == "blocked" else "ready" if record.activation_state == "active" else "adopted"
        self.store.upsert_record(record)
        return readiness

    def _require_candidate(self, candidate_id: str) -> AdoptionRecord:
        record = self.get_candidate(candidate_id, refresh=True)
        if record is None:
            raise AdoptionNotFoundError(f"Candidate {candidate_id} not found")
        return record

    def _require_node(self, node_id: str) -> AdoptionRecord:
        record = self.get_node(node_id, refresh=True)
        if record is None:
            raise AdoptionNotFoundError(f"Node {node_id} not found")
        return record

    def _verify_remote_pairing(
        self,
        record: AdoptionRecord,
        *,
        pairing_code: Optional[str],
        bootstrap_token: Optional[str],
        actor_node_id: Optional[str],
    ) -> Dict[str, Any]:
        if not record.api_url:
            raise AdoptionTransitionError("Candidate does not advertise a bootstrap-capable management API")

        import httpx

        claim_url = f"{record.api_url.rstrip('/')}/api/bootstrap/claim"
        try:
            response = httpx.post(
                claim_url,
                json={
                    "pairing_code": _normalize_text(pairing_code),
                    "bootstrap_token": _normalize_text(bootstrap_token),
                    "requester_node_id": _normalize_text(actor_node_id),
                },
                timeout=5.0,
            )
        except httpx.HTTPError as exc:
            raise AdoptionTransitionError(f"Remote bootstrap claim failed: {exc}") from exc

        if response.status_code != 200:
            detail = None
            try:
                payload = response.json()
            except Exception:
                payload = {}
            if isinstance(payload, dict):
                detail = _normalize_text(payload.get("detail") or payload.get("message"))
            raise AdoptionTransitionError(detail or f"Remote bootstrap claim failed with status {response.status_code}")

        payload = response.json()
        if not isinstance(payload, dict):
            raise AdoptionTransitionError("Remote bootstrap claim returned an invalid payload")

        claim_token = _normalize_text(payload.get("claim_token"))
        if not claim_token:
            raise AdoptionTransitionError("Remote bootstrap claim did not return a claim token")

        return {
            "claim_token": claim_token,
            "token_expires_at": _normalize_text(payload.get("token_expires_at")),
            "remote_fingerprint": _normalize_text(payload.get("remote_fingerprint")),
            "remote_node_id": _normalize_text(payload.get("node_id")) or record.remote_node_id,
        }

    def _finalize_remote_claim(self, record: AdoptionRecord, *, actor_node_id: Optional[str]) -> None:
        claim_token = _normalize_text(record.metadata.get("remote_claim_token"))
        if not claim_token or not record.api_url:
            raise AdoptionTransitionError("Candidate is missing a verified remote claim token")

        import httpx

        finalize_url = f"{record.api_url.rstrip('/')}/api/bootstrap/finalize"
        try:
            response = httpx.post(
                finalize_url,
                json={
                    "claim_token": claim_token,
                    "requester_node_id": _normalize_text(actor_node_id),
                    "adopted_node_id": record.node_id,
                },
                timeout=5.0,
            )
        except httpx.HTTPError as exc:
            raise AdoptionTransitionError(f"Remote bootstrap finalize failed: {exc}") from exc

        if response.status_code != 200:
            detail = None
            try:
                payload = response.json()
            except Exception:
                payload = {}
            if isinstance(payload, dict):
                detail = _normalize_text(payload.get("detail") or payload.get("message"))
            raise AdoptionTransitionError(detail or f"Remote bootstrap finalize failed with status {response.status_code}")

    def claim_candidate(
        self,
        candidate_id: str,
        pairing_code: Optional[str],
        actor_node_id: Optional[str],
        *,
        bootstrap_token: Optional[str] = None,
    ) -> AdoptionRecord:
        record = self._require_candidate(candidate_id)
        if record.adoption_state == "orphaned":
            raise AdoptionTransitionError("Orphaned nodes must be reconciled before they can be claimed")

        normalized_code = str(pairing_code or "").strip()
        normalized_bootstrap_token = str(bootstrap_token or "").strip()
        if not normalized_bootstrap_token and (
            not normalized_code.isdigit() or len(normalized_code) < 6 or len(normalized_code) > 8
        ):
            raise AdoptionTransitionError("Pairing code must be 6-8 digits")

        remote_claim = self._verify_remote_pairing(
            record,
            pairing_code=normalized_code or None,
            bootstrap_token=normalized_bootstrap_token or None,
            actor_node_id=actor_node_id,
        )

        record.trust_state = "claimed"
        record.adoption_state = "claimable"
        record.claimed_by_node_id = _normalize_text(actor_node_id)
        record.metadata["claimed_at"] = _isoformat(_utcnow())
        record.metadata["remote_claim_token"] = remote_claim["claim_token"]
        record.metadata["remote_claim_token_expires_at"] = remote_claim["token_expires_at"]
        if remote_claim.get("remote_node_id"):
            record.remote_node_id = remote_claim["remote_node_id"]
        if remote_claim.get("remote_fingerprint"):
            record.remote_fingerprint = remote_claim["remote_fingerprint"]
        self.store.upsert_record(record)
        self.store.append_event(
            candidate_id=record.candidate_id,
            node_id=record.node_id,
            event_type="claim",
            actor=record.claimed_by_node_id,
            payload={
                "pairing_code_length": len(normalized_code) if normalized_code else 0,
                "claim_method": "bootstrap-token" if normalized_bootstrap_token else "pairing-code",
                "remote_claim_token_expires_at": remote_claim["token_expires_at"],
            },
        )
        return record

    def _assign_node_id(self, record: AdoptionRecord) -> str:
        if record.node_id:
            return record.node_id
        if record.remote_node_id:
            return record.remote_node_id
        base = _normalize_token(record.display_name or record.hostname, fallback="node")
        return f"node-{base}-{uuid4().hex[:8]}"

    def _build_registry_metadata(self, record: AdoptionRecord, *, role: str, actor_node_id: Optional[str]) -> Dict[str, Any]:
        parsed = urlparse(record.api_url or "")
        metadata = dict(record.metadata)
        metadata.update(
            {
                "url": record.api_url,
                "node_url": record.api_url,
                "api_port": parsed.port or 8080,
                "adoption_candidate_id": record.candidate_id,
                "adoption_state": record.adoption_state,
                "activation_state": record.activation_state,
                "trust_state": record.trust_state,
                "adopted_by": _normalize_text(actor_node_id),
                "adopted_at": _isoformat(_utcnow()),
                "requested_role": role,
            }
        )
        if record.remote_node_id:
            metadata["remote_node_id"] = record.remote_node_id
        return metadata

    def _upsert_registry_entry(
        self,
        record: AdoptionRecord,
        *,
        role: Optional[str] = None,
        deployment_mode: Optional[str] = None,
        metadata_updates: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not record.node_id:
            raise AdoptionTransitionError("Target node has not been assigned a stable node ID")

        existing = self.registry.get_node(record.node_id) or {}
        existing_metadata = _parse_json_dict(existing.get("metadata"))
        if metadata_updates:
            existing_metadata.update(metadata_updates)

        host = _normalize_text(existing.get("ip_address"))
        if not host and record.api_url:
            parsed = urlparse(record.api_url)
            host = parsed.hostname
        if not host and record.addresses:
            host = record.addresses[0]

        capabilities = dict(record.capabilities)
        audio_devices = _parse_json_list(existing.get("audio_devices"))
        if not audio_devices:
            raw_audio_devices = capabilities.get("audio_interfaces") or []
            audio_devices = raw_audio_devices if isinstance(raw_audio_devices, list) else []

        midi_devices = _parse_json_list(existing.get("midi_devices"))
        if not midi_devices:
            raw_midi_devices = capabilities.get("midi_devices") or []
            midi_devices = raw_midi_devices if isinstance(raw_midi_devices, list) else []

        resolved_role = role or _normalize_text(existing.get("role")) or _normalize_text(record.metadata.get("requested_role")) or "AUDIO-NODE"
        resolved_mode = deployment_mode or _normalize_text(existing.get("deployment_mode")) or resolved_role

        ok = self.registry.add_or_update_node(
            node_id=record.node_id,
            hostname=record.hostname,
            ip_address=host,
            mac_address=_normalize_text(existing.get("mac_address")),
            role=resolved_role,
            deployment_mode=resolved_mode,
            cpu_cores=_coerce_int(existing.get("cpu_cores"), _coerce_int(capabilities.get("cpu_cores"), 0)),
            total_memory_gb=_coerce_int(existing.get("total_memory_gb"), _coerce_int(capabilities.get("memory_gb") or capabilities.get("total_memory_gb"), 0)),
            audio_devices=audio_devices,
            midi_input_count=_coerce_int(existing.get("midi_input_count"), _coerce_int(capabilities.get("midi_inputs"), 0)),
            midi_output_count=_coerce_int(existing.get("midi_output_count"), _coerce_int(capabilities.get("midi_outputs"), 0)),
            midi_devices=midi_devices,
            storage_gb=_coerce_int(existing.get("storage_gb"), _coerce_int(capabilities.get("storage_gb"), 0)),
            status=_normalize_text(existing.get("status")) or ("online" if record.visible else "offline"),
            health_score=float(existing.get("health_score") or 50.0),
            version=_normalize_text(existing.get("version")) or record.software_version or get_platform_version(),
            metadata=existing_metadata,
        )
        if not ok:
            raise AdoptionConflictError(f"Failed to update adopted node {record.node_id} in the cluster registry")

    def adopt_candidate(
        self,
        candidate_id: str,
        *,
        display_name: Optional[str],
        role: str,
        activation_mode: ActivationState,
        actor_node_id: Optional[str],
    ) -> AdoptionRecord:
        record = self._require_candidate(candidate_id)
        if record.adoption_state not in {"claimable", "adopted", "ready"}:
            raise AdoptionTransitionError("Candidate must be claimed before adoption")

        requested_role = _normalize_text(role) or "AUDIO-NODE"
        record.display_name = _normalize_text(display_name) or record.display_name
        record.node_id = self._assign_node_id(record)
        record.registered = True
        record.visible = True if record.visible else record.visible
        record.trust_state = "trusted"
        record.adoption_state = "adopted"
        record.activation_state = activation_mode
        record.metadata["requested_role"] = requested_role

        self._finalize_remote_claim(record, actor_node_id=actor_node_id)
        record.metadata["remote_claim_finalized_at"] = _isoformat(_utcnow())

        host = None
        if record.api_url:
            parsed = urlparse(record.api_url)
            host = parsed.hostname
        if not host and record.addresses:
            host = record.addresses[0]

        capabilities = dict(record.capabilities)
        audio_devices = capabilities.get("audio_interfaces") or []
        midi_devices = capabilities.get("midi_devices") or []

        ok = self.registry.add_or_update_node(
            node_id=record.node_id,
            hostname=record.hostname,
            ip_address=host,
            role=requested_role,
            deployment_mode=requested_role,
            cpu_cores=_coerce_int(capabilities.get("cpu_cores"), 0),
            total_memory_gb=_coerce_int(
                capabilities.get("memory_gb") or capabilities.get("total_memory_gb"),
                0,
            ),
            audio_devices=audio_devices if isinstance(audio_devices, list) else [],
            midi_input_count=_coerce_int(capabilities.get("midi_inputs"), 0),
            midi_output_count=_coerce_int(capabilities.get("midi_outputs"), 0),
            midi_devices=midi_devices if isinstance(midi_devices, list) else [],
            storage_gb=_coerce_int(capabilities.get("storage_gb"), 0),
            status="online" if record.visible else "offline",
            version=record.software_version or get_platform_version(),
            metadata=self._build_registry_metadata(record, role=requested_role, actor_node_id=actor_node_id),
        )
        if not ok:
            raise AdoptionConflictError(f"Failed to register adopted node {record.node_id}")

        readiness = self._evaluate_readiness(record)
        record.readiness = readiness
        if activation_mode == "active":
            if readiness.status == "blocked":
                record.activation_state = "standby"
                self.store.upsert_record(record)
                raise AdoptionTransitionError("Candidate is adopted but not promotable because readiness is blocked")
            record.adoption_state = "ready"
        self.store.upsert_record(record)
        self.store.append_event(
            candidate_id=record.candidate_id,
            node_id=record.node_id,
            event_type="adopt",
            actor=_normalize_text(actor_node_id),
            payload={"role": requested_role, "activation_mode": activation_mode},
        )
        return record

    def apply_clone_profile(
        self,
        node_id: str,
        *,
        source_node_id: str,
        group_ids: list[str],
        actor_node_id: Optional[str],
    ) -> Dict[str, Any]:
        record = self._require_node(node_id)
        if record.adoption_state not in {"adopted", "ready", "blocked"}:
            raise AdoptionTransitionError("Only adopted nodes can receive cloned profiles")
        if not record.api_url:
            raise AdoptionTransitionError("Target node does not advertise a management API")

        source = self._resolve_clone_source(source_node_id, target_node_id=node_id)
        snapshot = self._fetch_clone_source_snapshot(source)
        groups = self._build_clone_group_payloads(source=source, snapshot=snapshot)
        if not groups:
            raise AdoptionTransitionError("Selected clone source does not expose any cloneable profile groups")

        requested_group_ids = [_normalize_text(group_id) for group_id in group_ids if _normalize_text(group_id)]
        if not requested_group_ids:
            raise AdoptionTransitionError("At least one clone profile group must be selected")

        unknown_groups = [group_id for group_id in requested_group_ids if group_id not in groups]
        if unknown_groups:
            raise AdoptionTransitionError(f"Unknown clone profile groups requested: {', '.join(unknown_groups)}")

        apply_order = [group_id for group_id in ("role_profile", "runtime_profile", "clock_sync", "avb_defaults") if group_id in requested_group_ids]
        apply_order.extend([group_id for group_id in requested_group_ids if group_id not in apply_order])

        target_base_url = record.api_url.rstrip("/")
        applied_group_ids: list[str] = []
        applied_items: dict[str, list[str]] = {}
        updated_role: Optional[str] = None
        updated_deployment_mode: Optional[str] = None

        for group_id in apply_order:
            group = groups[group_id]
            apply_payload = _parse_json_dict(group.get("apply"))
            kind = _normalize_text(apply_payload.get("kind"))
            if kind == "deployment":
                updated_deployment_mode = _normalize_text(apply_payload.get("deployment_mode")) or "AUDIO-NODE"
                updated_role = _normalize_text(apply_payload.get("role")) or updated_deployment_mode
                self._request_remote_json(
                    "POST",
                    f"{target_base_url}/api/deployment/mode",
                    payload={"mode": updated_deployment_mode},
                )
            elif kind == "runtime_profile":
                profile = _normalize_text(apply_payload.get("profile"))
                if not profile:
                    continue
                self._request_remote_json(
                    "POST",
                    f"{target_base_url}/api/runtime-profiles/switch",
                    payload={"profile": profile, "force": True, "dry_run": False},
                )
            elif kind == "config":
                values = _parse_json_dict(apply_payload.get("values"))
                for key, value in values.items():
                    self._request_remote_json(
                        "PUT",
                        f"{target_base_url}/api/cluster/config/runtime",
                        payload={"key": key, "value": value, "scope": "node"},
                    )
            else:
                continue

            applied_group_ids.append(group_id)
            applied_items[group_id] = [item["key"] for item in group.get("items", []) if isinstance(item, dict) and _normalize_text(item.get("key"))]

        if updated_role:
            record.metadata["requested_role"] = updated_role
        if updated_deployment_mode:
            record.metadata["deployment_mode"] = updated_deployment_mode

        clone_summary = {
            "source_node_id": source.get("node_id"),
            "source_hostname": source.get("hostname"),
            "applied_group_ids": applied_group_ids,
            "applied_item_keys": applied_items,
            "applied_at": _isoformat(_utcnow()),
            "applied_by": _normalize_text(actor_node_id),
        }
        record.metadata["profile_clone"] = clone_summary
        self._upsert_registry_entry(
            record,
            role=updated_role,
            deployment_mode=updated_deployment_mode,
            metadata_updates={"profile_clone": clone_summary},
        )

        record.readiness = self._evaluate_readiness(record)
        if record.readiness.status == "blocked":
            record.adoption_state = "blocked"
            if record.activation_state == "active":
                record.activation_state = "standby"
        else:
            record.adoption_state = "ready" if record.activation_state == "active" else "adopted"

        self.store.upsert_record(record)
        self.store.append_event(
            candidate_id=record.candidate_id,
            node_id=record.node_id,
            event_type="clone_profile",
            actor=_normalize_text(actor_node_id),
            payload={
                "source_node_id": source.get("node_id"),
                "source_hostname": source.get("hostname"),
                "applied_group_ids": applied_group_ids,
                "applied_item_keys": applied_items,
            },
        )
        return {
            "record": record,
            "source": source,
            "applied_group_ids": applied_group_ids,
        }

    def promote_node(self, node_id: str, actor_node_id: Optional[str]) -> AdoptionRecord:
        record = self._require_node(node_id)
        readiness = self._evaluate_readiness(record)
        record.readiness = readiness
        if readiness.status == "blocked":
            record.adoption_state = "blocked"
            record.activation_state = "standby"
            self.store.upsert_record(record)
            raise AdoptionTransitionError("Candidate readiness is blocked and cannot be promoted")

        record.trust_state = "trusted"
        record.adoption_state = "ready"
        record.activation_state = "active"
        self.store.upsert_record(record)
        self.store.append_event(
            candidate_id=record.candidate_id,
            node_id=record.node_id,
            event_type="promote",
            actor=_normalize_text(actor_node_id),
            payload={"readiness_status": readiness.status},
        )
        return record

    def forget_candidate(self, candidate_id: str) -> None:
        record = self._require_candidate(candidate_id)
        if record.node_id:
            raise AdoptionConflictError("Adopted nodes cannot be forgotten through the candidate delete path")
        if not self.store.delete_record(candidate_id):
            raise AdoptionNotFoundError(f"Candidate {candidate_id} not found")

    def apply_visibility_overlay(self, nodes: Dict[str, Any]) -> None:
        for record in self.store.list_records():
            target = None
            if record.remote_node_id and record.remote_node_id in nodes:
                target = nodes[record.remote_node_id]
            elif record.node_id and record.node_id in nodes:
                target = nodes[record.node_id]
            if target is None:
                continue

            target.trust_state = record.trust_state
            target.adoption_state = record.adoption_state
            target.activation_state = record.activation_state
            target.readiness_status = record.readiness.status if record.readiness else None
            target.adoption_candidate_id = record.candidate_id
            target.metadata.setdefault("adoption", {})
            target.metadata["adoption"].update(
                {
                    "candidate_id": record.candidate_id,
                    "node_id": record.node_id,
                    "remote_node_id": record.remote_node_id,
                    "trust_state": record.trust_state,
                    "adoption_state": record.adoption_state,
                    "activation_state": record.activation_state,
                    "readiness_status": record.readiness.status if record.readiness else None,
                    "readiness_summary": record.readiness.summary() if record.readiness else None,
                    "avb_auto_provision": record.metadata.get("avb_auto_provision"),
                }
            )
            target.registered = bool(record.registered or target.registered)
            target.visible = bool(record.visible)
            if hasattr(target, "recompute_state"):
                target.recompute_state()


_adoption_service: Optional[AdoptionService] = None


def set_adoption_service(service: Optional[AdoptionService]) -> None:
    global _adoption_service
    _adoption_service = service


def get_adoption_service() -> AdoptionService:
    global _adoption_service
    if _adoption_service is None:
        _adoption_service = AdoptionService()
    return _adoption_service
