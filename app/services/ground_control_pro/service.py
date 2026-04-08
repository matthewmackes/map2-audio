from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import threading
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher

from .constants import PROFILE_ID
from .field_map import expand_field_descriptors, load_field_map, offset_to_descriptors, unknown_byte_count
from .midi_transport import GroundControlMidiTransport
from .model import GroundControlJob, GroundControlModel, GroundControlTransportOptions, model_from_dict
from .parser import parse_container_to_model
from .serializer import compile_model
from .sysex_container import GroundControlSysexContainer
from .validator import validate_model, validate_sysex_bytes

_ground_control_pro_service_lock = threading.Lock()


class GroundControlProService:
    def __init__(
        self,
        base_dir: Optional[Path] = None,
        transport: Optional[GroundControlMidiTransport] = None,
        publisher: Optional[RealtimeMessagePublisher] = None,
    ) -> None:
        self.base_dir = base_dir or (Path.home() / ".map2" / "ground_control_pro")
        self.artifacts_dir = self.base_dir / "artifacts"
        self.exports_dir = self.base_dir / "exports"
        self.sessions_index_path = self.base_dir / "sessions.json"
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)
        self.transport = transport or GroundControlMidiTransport()
        self._publisher = publisher or event_publisher
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.jobs: Dict[str, GroundControlJob] = {}
        self.artifacts: Dict[str, Dict[str, Any]] = {}
        self.field_map = load_field_map()
        self.fixture_dir = Path(__file__).resolve().parents[2] / "data" / "ground_control_pro" / "fixtures"
        self._restore_artifacts()
        self._restore_sessions()

    def _restore_artifacts(self) -> None:
        """Reload artifact manifests from disk so artifact references survive restart."""
        for manifest_path in self.artifacts_dir.glob("*.yml"):
            try:
                manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
                if isinstance(manifest, dict) and "artifact_id" in manifest:
                    artifact_file = Path(manifest.get("path", ""))
                    if artifact_file.exists():
                        self.artifacts[manifest["artifact_id"]] = manifest
            except Exception:
                continue

    def _restore_sessions(self) -> None:
        """Reload session index from disk so active sessions survive restart."""
        if not self.sessions_index_path.exists():
            return
        try:
            index = json.loads(self.sessions_index_path.read_text(encoding="utf-8"))
            if not isinstance(index, dict):
                return
            for session_id, entry in index.items():
                source_artifact_id = entry.get("source_artifact_id")
                if not source_artifact_id or source_artifact_id not in self.artifacts:
                    continue
                source_path = Path(self.artifacts[source_artifact_id]["path"])
                if not source_path.exists():
                    continue
                try:
                    data = source_path.read_bytes()
                    container = GroundControlSysexContainer.from_bytes(data)
                    model = parse_container_to_model(container)
                    compiled_bytes = compile_model(model, container)
                    validation = validate_model(model, base_bytes=data, compiled_bytes=compiled_bytes)
                    session_artifacts = []
                    for aid in entry.get("artifact_ids", []):
                        if aid in self.artifacts:
                            session_artifacts.append(self.artifacts[aid])
                    self.sessions[session_id] = {
                        "source_name": entry.get("source_name", "restored"),
                        "created_at": entry.get("created_at", self._timestamp()),
                        "updated_at": entry.get("updated_at", self._timestamp()),
                        "base_bytes": data,
                        "model": model,
                        "validation": validation,
                        "source_artifact_id": source_artifact_id,
                        "compiled_artifact_id": entry.get("compiled_artifact_id"),
                        "backup_artifact_id": entry.get("backup_artifact_id"),
                        "artifacts": session_artifacts,
                    }
                except Exception:
                    continue
        except Exception:
            pass

    def _persist_sessions(self) -> None:
        """Write session index to disk for restart recovery."""
        index: Dict[str, Any] = {}
        for session_id, session in self.sessions.items():
            index[session_id] = {
                "source_name": session.get("source_name"),
                "created_at": session.get("created_at"),
                "updated_at": session.get("updated_at"),
                "source_artifact_id": session.get("source_artifact_id"),
                "compiled_artifact_id": session.get("compiled_artifact_id"),
                "backup_artifact_id": session.get("backup_artifact_id"),
                "artifact_ids": [a.get("artifact_id") for a in session.get("artifacts", []) if isinstance(a, dict)],
            }
        try:
            self.sessions_index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
        except Exception:
            pass

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _validation_allows_transmit(validation: Dict[str, Any]) -> bool:
        return bool(
            not validation.get("errors")
            and validation.get("exact_size_ok")
            and validation.get("preamble_ok")
            and validation.get("terminator_ok")
            and validation.get("offsets_ok")
            and validation.get("field_ranges_ok")
            and validation.get("unknown_bytes_preserved")
            and validation.get("round_trip_identity")
        )

    async def _emit(self, topic: str, payload: Dict[str, Any]) -> None:
        await self._publisher.publish_message(
            {"type": topic, "data": payload},
            topics=(topic, "ground-control-pro"),
        )

    def _create_job(self, job_type: str) -> GroundControlJob:
        now = self._timestamp()
        job = GroundControlJob(
            job_id=str(uuid.uuid4()),
            job_type=job_type,
            status="running",
            progress=0.0,
            created_at=now,
            updated_at=now,
        )
        self.jobs[job.job_id] = job
        return job

    def _update_job(self, job: GroundControlJob, *, status: Optional[str] = None, progress: Optional[float] = None, result: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> GroundControlJob:
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = progress
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        job.updated_at = self._timestamp()
        self.jobs[job.job_id] = job
        return job

    def _archive_artifact(self, *, kind: str, extension: str, content: bytes | str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        artifact_id = str(uuid.uuid4())
        artifact_path = self.artifacts_dir / f"{artifact_id}{extension}"
        manifest_path = self.artifacts_dir / f"{artifact_id}.yml"
        if isinstance(content, bytes):
            artifact_path.write_bytes(content)
            size_bytes = len(content)
            content_sha256 = hashlib.sha256(content).hexdigest()
        else:
            artifact_path.write_text(content, encoding="utf-8")
            size_bytes = len(content.encode("utf-8"))
            content_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
        manifest = {
            "artifact_id": artifact_id,
            "kind": kind,
            "path": str(artifact_path),
            "size_bytes": size_bytes,
            "sha256": content_sha256,
            "created_at": self._timestamp(),
            "metadata": metadata,
        }
        manifest_path.write_text(yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8")
        self.artifacts[artifact_id] = manifest
        return manifest

    def _session_payload(self, session_id: str) -> Dict[str, Any]:
        session = self.sessions[session_id]
        return {
            "session_id": session_id,
            "source_name": session["source_name"],
            "profile_id": PROFILE_ID,
            "created_at": session["created_at"],
            "updated_at": session["updated_at"],
            "model": session["model"].to_dict(),
            "validation": session["validation"].to_dict(),
            "summary": {
                "preset_count": len(session["model"].presets),
                "unknown_byte_count": unknown_byte_count(),
                "source_artifact_id": session.get("source_artifact_id"),
                "compiled_artifact_id": session.get("compiled_artifact_id"),
                "backup_artifact_id": session.get("backup_artifact_id"),
            },
            "artifacts": session.get("artifacts", []),
        }

    def _append_artifact_to_session(self, session_id: Optional[str], artifact: Dict[str, Any]) -> None:
        if not session_id or session_id not in self.sessions:
            return
        session = self.sessions[session_id]
        session["updated_at"] = self._timestamp()
        session.setdefault("artifacts", []).append(artifact)

    def _artifact_content_bytes(self, artifact_id: str) -> bytes:
        artifact = self.artifacts.get(artifact_id)
        if artifact is None:
            raise KeyError(f"Unknown artifact id: {artifact_id}")
        return Path(artifact["path"]).read_bytes()

    def _resolve_fixture_bytes(self, fixture_name: str) -> bytes:
        fixture_path = self.fixture_dir / fixture_name
        if not fixture_path.exists():
            raise FileNotFoundError(f"Fixture not found: {fixture_name}")
        return fixture_path.read_bytes()

    async def get_ports(self) -> Dict[str, Any]:
        return self.transport.list_ports()

    async def get_field_map(self) -> Dict[str, Any]:
        return {
            **self.field_map,
            "unknown_byte_count": unknown_byte_count(),
            "expanded_count": len(expand_field_descriptors()),
        }

    async def import_syx_bytes(self, data: bytes, *, source_name: str = "upload.syx") -> Dict[str, Any]:
        container = GroundControlSysexContainer.from_bytes(data)
        model = parse_container_to_model(container)
        round_trip_bytes = compile_model(model, container)
        validation = validate_model(model, base_bytes=data, compiled_bytes=round_trip_bytes)
        source_artifact = self._archive_artifact(
            kind="source_syx",
            extension=".syx",
            content=data,
            metadata={"source_name": source_name, "profile_id": PROFILE_ID},
        )
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            "source_name": source_name,
            "created_at": self._timestamp(),
            "updated_at": self._timestamp(),
            "base_bytes": bytes(data),
            "model": model,
            "validation": validation,
            "source_artifact_id": source_artifact["artifact_id"],
            "compiled_artifact_id": None,
            "backup_artifact_id": None,
            "artifacts": [source_artifact],
        }
        payload = self._session_payload(session_id)
        await self._emit("ground-control-pro:session", payload)
        await self._emit("ground-control-pro:validation", {"session_id": session_id, "validation": validation.to_dict()})
        self._persist_sessions()
        return payload

    async def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            raise KeyError(f"Unknown session id: {session_id}")
        return self._session_payload(session_id)

    async def compile_session(self, session_id: str, model_payload: Dict[str, Any]) -> Dict[str, Any]:
        if session_id not in self.sessions:
            raise KeyError(f"Unknown session id: {session_id}")
        session = self.sessions[session_id]
        model = model_from_dict(model_payload)
        base_container = GroundControlSysexContainer.from_bytes(session["base_bytes"])
        compiled_bytes = compile_model(model, base_container)
        validation = validate_model(model, base_bytes=session["base_bytes"], compiled_bytes=compiled_bytes)
        artifact = self._archive_artifact(
            kind="compiled_syx",
            extension=".syx",
            content=compiled_bytes,
            metadata={"session_id": session_id, "profile_id": PROFILE_ID, "validation": validation.to_dict()},
        )
        session["updated_at"] = self._timestamp()
        session["model"] = model
        session["validation"] = validation
        session["compiled_artifact_id"] = artifact["artifact_id"]
        session["artifacts"].append(artifact)
        await self._emit("ground-control-pro:validation", {"session_id": session_id, "validation": validation.to_dict()})
        self._persist_sessions()
        return {
            "session_id": session_id,
            "artifact": artifact,
            "validation": validation.to_dict(),
            "model": model.to_dict(),
        }

    async def export_json(self, session_id: str, model_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        session = self.sessions[session_id]
        model = model_from_dict(model_payload) if model_payload else session["model"]
        payload = json.dumps(model.to_dict(), indent=2, sort_keys=True)
        artifact = self._archive_artifact(
            kind="json_export",
            extension=".json",
            content=payload,
            metadata={"session_id": session_id, "profile_id": PROFILE_ID},
        )
        self._append_artifact_to_session(session_id, artifact)
        return {"artifact": artifact, "json": json.loads(payload)}

    async def export_yaml(self, session_id: str, model_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        session = self.sessions[session_id]
        model = model_from_dict(model_payload) if model_payload else session["model"]
        payload = yaml.safe_dump(model.to_dict(), sort_keys=False)
        artifact = self._archive_artifact(
            kind="yaml_export",
            extension=".yml",
            content=payload,
            metadata={"session_id": session_id, "profile_id": PROFILE_ID},
        )
        self._append_artifact_to_session(session_id, artifact)
        return {"artifact": artifact, "yaml": payload}

    async def backup(self, options: GroundControlTransportOptions, *, create_session: bool = True) -> Dict[str, Any]:
        job = self._create_job("backup")
        await self._emit("ground-control-pro:backup_progress", {"job_id": job.job_id, "progress": 0.05, "status": "waiting_for_sysex"})
        try:
            capture = await self.transport.receive_sysex(options)
            capture_transport = {key: value for key, value in capture.items() if key != "bytes"}
            validation = validate_sysex_bytes(capture["bytes"])
            artifact = self._archive_artifact(
                kind="backup_syx",
                extension=".syx",
                content=capture["bytes"],
                metadata={"transport": capture_transport, "validation": validation.to_dict(), "profile_id": PROFILE_ID},
            )
            payload: Dict[str, Any] = {"artifact": artifact, "validation": validation.to_dict()}
            if create_session:
                session = await self.import_syx_bytes(capture["bytes"], source_name=f"backup:{capture['port_name']}")
                self.sessions[session["session_id"]]["backup_artifact_id"] = artifact["artifact_id"]
                self.sessions[session["session_id"]]["artifacts"].append(artifact)
                payload["session"] = session
            self._update_job(job, status="completed", progress=1.0, result=payload)
            await self._emit("ground-control-pro:backup_progress", {"job_id": job.job_id, "progress": 1.0, "status": "completed", "result": payload})
            self._persist_sessions()
            return job.to_dict()
        except Exception as exc:
            self._update_job(job, status="failed", progress=1.0, error=str(exc))
            await self._emit("ground-control-pro:backup_progress", {"job_id": job.job_id, "progress": 1.0, "status": "failed", "error": str(exc)})
            raise

    async def push(self, *, compiled_artifact_id: Optional[str], session_id: Optional[str], model_payload: Optional[Dict[str, Any]], options: GroundControlTransportOptions, force: bool = False) -> Dict[str, Any]:
        job = self._create_job("push")
        await self._emit("ground-control-pro:push_progress", {"job_id": job.job_id, "progress": 0.05, "status": "preparing"})
        try:
            artifact_id = compiled_artifact_id
            validation: Optional[Dict[str, Any]] = None
            if artifact_id is None:
                if not session_id:
                    raise ValueError("Either compiled_artifact_id or session_id is required for push")
                compile_result = await self.compile_session(session_id, model_payload or self.sessions[session_id]["model"].to_dict())
                artifact_id = compile_result["artifact"]["artifact_id"]
                validation = compile_result["validation"]
            elif session_id and session_id in self.sessions:
                validation = self.sessions[session_id]["validation"].to_dict()

            if session_id and session_id in self.sessions and not force:
                backup_artifact_id = self.sessions[session_id].get("backup_artifact_id")
                if not backup_artifact_id:
                    raise ValueError("A fresh backup is required before push; use backup first or set force=true")

            candidate_bytes = self._artifact_content_bytes(artifact_id)
            if validation is None:
                validation = validate_sysex_bytes(candidate_bytes).to_dict()
            if not self._validation_allows_transmit(validation):
                raise ValueError("Push refused because validation did not pass all structural and round-trip safety checks")

            transmit_result = await self.transport.send_sysex(candidate_bytes, options)
            await self._emit("ground-control-pro:traffic", {"job_id": job.job_id, "traffic": transmit_result.get("traffic", [])})
            artifact = self._archive_artifact(
                kind="transmit_syx",
                extension=".syx",
                content=candidate_bytes,
                metadata={"source_artifact_id": artifact_id, "transport": transmit_result, "validation": validation},
            )
            self._append_artifact_to_session(session_id, artifact)
            payload = {"artifact": artifact, "transport": transmit_result, "validation": validation}
            self._update_job(job, status="completed", progress=1.0, result=payload)
            await self._emit("ground-control-pro:push_progress", {"job_id": job.job_id, "progress": 1.0, "status": "completed", "result": payload})
            self._persist_sessions()
            return job.to_dict()
        except Exception as exc:
            self._update_job(job, status="failed", progress=1.0, error=str(exc))
            await self._emit("ground-control-pro:push_progress", {"job_id": job.job_id, "progress": 1.0, "status": "failed", "error": str(exc)})
            raise

    async def redump_verify(self, compiled_artifact_id: str, options: GroundControlTransportOptions) -> Dict[str, Any]:
        job = self._create_job("redump_verify")
        await self._emit("ground-control-pro:verify_progress", {"job_id": job.job_id, "progress": 0.05, "status": "capturing"})
        try:
            expected = self._artifact_content_bytes(compiled_artifact_id)
            capture = await self.transport.receive_sysex(options)
            capture_transport = {key: value for key, value in capture.items() if key != "bytes"}
            actual = capture["bytes"]
            match = expected == actual
            verify_artifact = self._archive_artifact(
                kind="verify_redump_syx",
                extension=".syx",
                content=actual,
                metadata={"compiled_artifact_id": compiled_artifact_id, "transport": capture_transport, "match": match},
            )
            for maybe_session_id, session in self.sessions.items():
                if session.get("compiled_artifact_id") == compiled_artifact_id:
                    self._append_artifact_to_session(maybe_session_id, verify_artifact)
                    break
            diff = self.build_diff(left_bytes=expected, right_bytes=actual, left_label="compiled", right_label="redump")
            payload = {"artifact": verify_artifact, "match": match, "diff": diff}
            self._update_job(job, status="completed", progress=1.0, result=payload)
            await self._emit("ground-control-pro:verify_progress", {"job_id": job.job_id, "progress": 1.0, "status": "completed", "result": payload})
            return job.to_dict()
        except Exception as exc:
            self._update_job(job, status="failed", progress=1.0, error=str(exc))
            await self._emit("ground-control-pro:verify_progress", {"job_id": job.job_id, "progress": 1.0, "status": "failed", "error": str(exc)})
            raise

    def build_diff(self, *, left_bytes: bytes, right_bytes: bytes, left_label: str, right_label: str) -> Dict[str, Any]:
        changed_offsets = [offset for offset in range(min(len(left_bytes), len(right_bytes))) if left_bytes[offset] != right_bytes[offset]]
        descriptors_by_offset = offset_to_descriptors()
        changes = []
        for offset in changed_offsets:
            labels = sorted({descriptor.path for descriptor in descriptors_by_offset.get(offset, [])})
            changes.append(
                {
                    "offset": offset,
                    "left": left_bytes[offset],
                    "right": right_bytes[offset],
                    "labels": labels,
                }
            )
        return {
            "left_label": left_label,
            "right_label": right_label,
            "changed_count": len(changes),
            "changes": changes,
        }

    async def diff(self, *, left_artifact_id: Optional[str] = None, right_artifact_id: Optional[str] = None, left_fixture: Optional[str] = None, right_fixture: Optional[str] = None) -> Dict[str, Any]:
        if left_artifact_id:
            left_bytes = self._artifact_content_bytes(left_artifact_id)
            left_label = left_artifact_id
        elif left_fixture:
            left_bytes = self._resolve_fixture_bytes(left_fixture)
            left_label = left_fixture
        else:
            raise ValueError("One left-hand artifact or fixture reference is required")

        if right_artifact_id:
            right_bytes = self._artifact_content_bytes(right_artifact_id)
            right_label = right_artifact_id
        elif right_fixture:
            right_bytes = self._resolve_fixture_bytes(right_fixture)
            right_label = right_fixture
        else:
            raise ValueError("One right-hand artifact or fixture reference is required")

        return self.build_diff(left_bytes=left_bytes, right_bytes=right_bytes, left_label=left_label, right_label=right_label)

    async def get_job(self, job_id: str) -> Dict[str, Any]:
        if job_id not in self.jobs:
            raise KeyError(f"Unknown job id: {job_id}")
        return self.jobs[job_id].to_dict()

    async def get_artifact(self, artifact_id: str) -> Dict[str, Any]:
        artifact = self.artifacts.get(artifact_id)
        if artifact is None:
            raise KeyError(f"Unknown artifact id: {artifact_id}")
        path = Path(artifact["path"])
        content_preview = None
        if path.suffix in {".json", ".yml", ".yaml"}:
            content_preview = path.read_text(encoding="utf-8")
        else:
            content_preview = base64.b64encode(path.read_bytes()).decode("ascii")
        return {**artifact, "content_preview": content_preview}


_ground_control_pro_service: Optional[GroundControlProService] = None


def get_ground_control_pro_service() -> GroundControlProService:
    global _ground_control_pro_service
    if _ground_control_pro_service is None:
        with _ground_control_pro_service_lock:
            if _ground_control_pro_service is None:
                _ground_control_pro_service = GroundControlProService()
    return _ground_control_pro_service
