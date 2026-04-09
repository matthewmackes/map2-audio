from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import logging
import threading
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

from app.database import get_session
from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

from .constants import PROFILE_ID
from .daemon import GroundControlProDaemon
from .field_map import expand_field_descriptors, load_field_map, offset_to_descriptors, unknown_byte_count
from .midi_transport import GroundControlMidiTransport
from .model import GroundControlJob, GroundControlModel, GroundControlTransportOptions, model_from_dict
from .parser import parse_container_to_model
from .serializer import compile_model
from .sysex_container import GroundControlSysexContainer
from .validator import validate_model, validate_sysex_bytes

_ground_control_pro_service_lock = threading.Lock()
logger = logging.getLogger(__name__)


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
        self._midi_hub = None
        self._midi_hub_loop: asyncio.AbstractEventLoop | None = None
        self._midi_subscriber_id = f"ground_control_pro:{id(self)}"
        self._restore_artifacts()
        self._restore_sessions()
        self._subscribe_to_midi_hub()
        self._daemon = GroundControlProDaemon(
            get_ports=self._list_ports_with_ground_control_matches,
            get_live_snapshot=self._get_live_snapshot_payload,
            repush_live_snapshot=self._repush_live_snapshot_assignments,
            emit=self._emit,
        )

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

    @staticmethod
    def _matches_ground_control_source(*, source_port: str, metadata: dict[str, Any] | None = None) -> bool:
        payload = dict(metadata or {})
        profile_id = str(payload.get("profile_id") or payload.get("device_profile_id") or "").strip().lower()
        if profile_id == "ground_control_pro":
            return True
        source = str(source_port or "").strip().lower()
        if "ground control" in source or "voodoo lab" in source:
            return True
        port_name = str(payload.get("port_name") or payload.get("source_port_name") or "").strip().lower()
        return "ground control" in port_name or "voodoo lab" in port_name

    @classmethod
    def _port_matches_ground_control(cls, port: dict[str, Any]) -> bool:
        return cls._matches_ground_control_source(
            source_port=str(port.get("name") or ""),
            metadata={"port_name": str(port.get("name") or "")},
        )

    async def _list_ports_with_ground_control_matches(self) -> dict[str, Any]:
        ports = self.transport.list_ports()
        inputs = ports.get("inputs") if isinstance(ports.get("inputs"), list) else []
        outputs = ports.get("outputs") if isinstance(ports.get("outputs"), list) else []
        ground_control_inputs = [port for port in inputs if isinstance(port, dict) and self._port_matches_ground_control(port)]
        ground_control_outputs = [port for port in outputs if isinstance(port, dict) and self._port_matches_ground_control(port)]
        return {
            **ports,
            "ground_control_inputs": ground_control_inputs,
            "ground_control_outputs": ground_control_outputs,
        }

    async def _ensure_daemon_started(self) -> None:
        await self._daemon.ensure_started()

    async def _get_live_snapshot_payload(self) -> dict[str, Any] | None:
        async with get_session() as session:
            return await SnapshotRuntimeStateService(session).get_live_snapshot_payload()

    async def _repush_live_snapshot_assignments(self) -> dict[str, Any]:
        live_snapshot_payload = await self._get_live_snapshot_payload()
        if not isinstance(live_snapshot_payload, dict):
            return {
                "status": "skipped",
                "status_label": "No live snapshot is active.",
                "reason": "missing_live_snapshot",
            }

        extensions = live_snapshot_payload.get("extensions")
        if not isinstance(extensions, dict):
            return {
                "status": "skipped",
                "status_label": "Live snapshot has no Ground Control Pro extension.",
                "reason": "missing_extensions",
            }

        extension_payload = extensions.get("ground_control_pro")
        if not isinstance(extension_payload, dict):
            return {
                "status": "skipped",
                "status_label": "Live snapshot has no Ground Control Pro assignments.",
                "reason": "missing_ground_control_pro_extension",
            }

        result = await self.push_snapshot_activation(
            snapshot_id=int(live_snapshot_payload.get("id") or 0),
            snapshot_name=str(live_snapshot_payload.get("name") or "Live Snapshot"),
            extension_payload=extension_payload,
        )
        preset_index = self._coerce_index(result.get("preset_index"), minimum=0, maximum=199)
        return {
            **result,
            "status_label": (
                f"Live snapshot preset {preset_index + 1} re-pushed."
                if preset_index is not None
                else "Live snapshot assignments re-pushed."
            ),
        }

    def _subscribe_to_midi_hub(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            self._midi_hub = get_midi_hub()
            self._midi_hub.subscribe(self._midi_subscriber_id, self._on_midi_hub_message)
        except Exception:
            logger.debug("Ground Control Pro service started without MIDI Hub subscription.", exc_info=True)

    def _on_midi_hub_message(self, message: Any) -> None:
        if self._midi_hub_loop is None:
            try:
                self._midi_hub_loop = asyncio.get_running_loop()
            except RuntimeError:
                return
        payload = bytes(getattr(message, "data", b"") or b"")
        if not payload:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.handle_inbound_message(
                    payload,
                    source_port=str(getattr(message, "source_port", "") or ""),
                    metadata=dict(getattr(message, "metadata", {}) or {}),
                ),
                self._midi_hub_loop,
            )
        except Exception as exc:  # pragma: no cover - callback scheduling path
            logger.debug("Ground Control Pro hub callback scheduling failed: %s", exc)

    @staticmethod
    def _parse_inbound_channel_message(data: bytes) -> dict[str, Any] | None:
        if not data:
            return None
        status = int(data[0]) & 0xFF
        message_type = status & 0xF0
        channel = (status & 0x0F) + 1
        if message_type == 0xB0 and len(data) >= 3:
            return {
                "trigger_type": "control_change",
                "channel": channel,
                "cc": int(data[1]) & 0x7F,
                "value": int(data[2]) & 0x7F,
            }
        if message_type == 0xC0 and len(data) >= 2:
            return {
                "trigger_type": "program_change",
                "channel": channel,
                "program": int(data[1]) & 0x7F,
                "value": 127,
            }
        return None

    @staticmethod
    def _iter_live_input_mappings(live_snapshot_payload: dict[str, Any]) -> list[dict[str, Any]]:
        extensions = live_snapshot_payload.get("extensions")
        if not isinstance(extensions, dict):
            return []
        gcp_payload = extensions.get("ground_control_pro")
        if not isinstance(gcp_payload, dict):
            return []
        input_map = gcp_payload.get("input_map")
        if isinstance(input_map, dict):
            mappings = input_map.get("mappings")
        else:
            mappings = None
        return [dict(item) for item in mappings or [] if isinstance(item, dict)]

    @staticmethod
    def _mapping_matches_event(mapping: dict[str, Any], event: dict[str, Any]) -> bool:
        trigger_type = str(mapping.get("trigger_type") or mapping.get("message_type") or "").strip().lower()
        if trigger_type not in {"control_change", "program_change"}:
            return False
        if trigger_type != event.get("trigger_type"):
            return False
        channel = GroundControlProService._coerce_index(mapping.get("channel", 0), minimum=0, maximum=16)
        if channel not in (None, 0) and channel != int(event.get("channel") or 0):
            return False
        if trigger_type == "control_change":
            cc = GroundControlProService._coerce_index(mapping.get("cc"), minimum=0, maximum=127)
            if cc is None or cc != int(event.get("cc") or -1):
                return False
            value_threshold = GroundControlProService._coerce_index(
                mapping.get("value_threshold", mapping.get("data2")),
                minimum=0,
                maximum=127,
            )
            if value_threshold is not None and int(event.get("value") or 0) < value_threshold:
                return False
            return True
        program = GroundControlProService._coerce_index(mapping.get("program"), minimum=0, maximum=127)
        return program is not None and program == int(event.get("program") or -1)

    @staticmethod
    async def _find_audio_grid_block(
        *,
        session: Any,
        action_payload: dict[str, Any],
    ) -> tuple[Any, dict[str, Any] | None]:
        from app.services.maschine_service import get_maschine_service

        maschine_service = get_maschine_service()
        projection = await maschine_service.get_audio_grid_projection(session)
        blocks = projection.get("blocks") if isinstance(projection.get("blocks"), list) else []
        target_block_id = str(action_payload.get("block_id") or "").strip()
        if target_block_id:
            block = next(
                (
                    dict(candidate)
                    for candidate in blocks
                    if isinstance(candidate, dict) and str(candidate.get("block_id") or "") == target_block_id
                ),
                None,
            )
            return maschine_service, block

        plugin_uri = str(action_payload.get("target_plugin_uri", action_payload.get("plugin_uri")) or "").strip()
        plugin_position = GroundControlProService._coerce_index(
            action_payload.get("target_plugin_position", action_payload.get("plugin_position")),
            minimum=0,
            maximum=1024,
        )
        for candidate in blocks:
            if not isinstance(candidate, dict):
                continue
            if plugin_uri and str(candidate.get("plugin_uri") or "") != plugin_uri:
                continue
            if plugin_position is not None and int(candidate.get("plugin_position") or -1) != plugin_position:
                continue
            return maschine_service, dict(candidate)
        return maschine_service, None

    async def _dispatch_toggle_plugin(
        self,
        *,
        session: Any,
        live_snapshot_payload: dict[str, Any],
        action_payload: dict[str, Any],
    ) -> dict[str, Any]:
        maschine_service, block = await self._find_audio_grid_block(session=session, action_payload=action_payload)
        if block is not None and block.get("block_id"):
            projection = await maschine_service.toggle_audio_grid_block_bypass(session, str(block["block_id"]))
            selected = next(
                (candidate for candidate in projection.get("blocks", []) if candidate.get("block_id") == block["block_id"]),
                None,
            )
            return {
                "status": "completed",
                "action_type": "toggle_plugin",
                "block_id": str(block["block_id"]),
                "bypassed": bool((selected or {}).get("bypassed", False)),
            }

        from app.services.chain_service import ChainService

        runtime_chain_id = self._coerce_index(
            action_payload.get("runtime_chain_id", action_payload.get("target_chain_id")),
            minimum=1,
            maximum=1_000_000_000,
        )
        plugin_uri = str(action_payload.get("target_plugin_uri", action_payload.get("plugin_uri")) or "").strip()
        plugin_position = self._coerce_index(
            action_payload.get("target_plugin_position", action_payload.get("plugin_position")),
            minimum=0,
            maximum=1024,
        )
        if runtime_chain_id is None or not plugin_uri:
            raise ValueError("toggle_plugin mapping requires a resolvable runtime chain and plugin URI")
        bypass = not self._coerce_bool_byte(action_payload.get("bypass", 0))
        applied = await ChainService(session).set_plugin_bypass(
            runtime_chain_id,
            plugin_uri,
            bool(bypass),
            plugin_position=plugin_position,
        )
        return {
            "status": "completed" if applied else "failed",
            "action_type": "toggle_plugin",
            "runtime_chain_id": runtime_chain_id,
            "plugin_uri": plugin_uri,
            "plugin_position": plugin_position,
            "bypassed": bool(bypass),
        }

    async def _dispatch_focus_block(
        self,
        *,
        session: Any,
        action_payload: dict[str, Any],
    ) -> dict[str, Any]:
        maschine_service, block = await self._find_audio_grid_block(session=session, action_payload=action_payload)
        if block is None or not block.get("block_id"):
            raise ValueError("focus_block mapping target could not be resolved in the audio grid")
        projection = await maschine_service.select_audio_grid_block(session, str(block["block_id"]))
        return {
            "status": "completed",
            "action_type": "focus_block",
            "selected_block_id": str(projection.get("selected_block_id") or ""),
            "plugin_uri": str(block.get("plugin_uri") or ""),
            "plugin_position": int(block.get("plugin_position") or 0),
        }

    async def _dispatch_set_routing(
        self,
        *,
        session: Any,
        live_snapshot_payload: dict[str, Any],
        action_payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.snapshot_service import SnapshotService

        snapshot_id = int(live_snapshot_payload.get("id") or 0)
        routing = live_snapshot_payload.get("routing") if isinstance(live_snapshot_payload.get("routing"), dict) else {}
        next_payload = dict(action_payload)
        routing_action = str(action_payload.get("routing_action") or "").strip().lower()
        if routing_action == "ab_switch_toggle":
            channels = [
                str(channel.get("channel_key") or "")
                for channel in live_snapshot_payload.get("channels", [])
                if isinstance(channel, dict) and str(channel.get("channel_key") or "").strip()
            ]
            current_channel = str(routing.get("active_channel_key") or "").strip()
            if len(channels) >= 2:
                next_channel = next((channel for channel in channels if channel != current_channel), channels[0])
            else:
                next_channel = current_channel or (channels[0] if channels else "")
            next_payload["mode"] = "ab_switch"
            next_payload["active_channel_key"] = next_channel
        updated = await SnapshotService(session).update_routing(snapshot_id, next_payload)
        if not isinstance(updated, dict):
            raise ValueError("set_routing mapping failed to update the live snapshot")
        return {
            "status": "completed",
            "action_type": "set_routing",
            "snapshot_id": snapshot_id,
            "routing": dict(updated.get("routing") or {}),
        }

    @staticmethod
    def _find_expression_mapping(
        live_snapshot_payload: dict[str, Any],
        mapping_id: str,
    ) -> dict[str, Any] | None:
        controls = live_snapshot_payload.get("controls") if isinstance(live_snapshot_payload.get("controls"), dict) else {}
        entries = controls.get("expression_mappings") if isinstance(controls.get("expression_mappings"), list) else []
        for entry in entries:
            if isinstance(entry, dict) and str(entry.get("id") or "").strip() == mapping_id:
                return dict(entry)
        return None

    async def _dispatch_expression_mapping(
        self,
        *,
        live_snapshot_payload: dict[str, Any],
        action_payload: dict[str, Any],
        event: dict[str, Any],
        source_port: str,
    ) -> dict[str, Any]:
        from app.services.expression_service import get_expression_service

        mapping_id = str(action_payload.get("expression_mapping_id") or action_payload.get("mapping_id") or "").strip()
        if not mapping_id:
            raise ValueError("expression_mapping action requires expression_mapping_id")
        mapping = self._find_expression_mapping(live_snapshot_payload, mapping_id)
        if mapping is None:
            raise ValueError(f"expression_mapping target '{mapping_id}' is not present on the live snapshot")
        get_expression_service().process_midi_cc(
            cc=int(mapping.get("cc") or 0),
            value=int(event.get("value") or 0),
            channel=max(1, int(mapping.get("channel") or 1)),
            source_port=source_port,
        )
        return {
            "status": "completed",
            "action_type": "expression_mapping",
            "expression_mapping_id": mapping_id,
            "cc": int(mapping.get("cc") or 0),
            "channel": max(1, int(mapping.get("channel") or 1)),
            "value": int(event.get("value") or 0),
        }

    async def _dispatch_live_mapping(
        self,
        *,
        session: Any,
        live_snapshot_payload: dict[str, Any],
        mapping: dict[str, Any],
        event: dict[str, Any],
        source_port: str,
    ) -> dict[str, Any]:
        action_type = str(mapping.get("action_type") or mapping.get("action") or "").strip().lower()
        if action_type == "toggle_plugin":
            return await self._dispatch_toggle_plugin(
                session=session,
                live_snapshot_payload=live_snapshot_payload,
                action_payload=mapping,
            )
        if action_type == "focus_block":
            return await self._dispatch_focus_block(session=session, action_payload=mapping)
        if action_type == "set_routing":
            return await self._dispatch_set_routing(
                session=session,
                live_snapshot_payload=live_snapshot_payload,
                action_payload=mapping,
            )
        if action_type == "expression_mapping":
            return await self._dispatch_expression_mapping(
                live_snapshot_payload=live_snapshot_payload,
                action_payload=mapping,
                event=event,
                source_port=source_port,
            )
        raise ValueError(f"Unsupported Ground Control Pro mapping action: {action_type}")

    async def handle_inbound_message(
        self,
        data: bytes,
        *,
        source_port: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        event = self._parse_inbound_channel_message(bytes(data))
        if event is None:
            return {"status": "skipped", "reason": "unsupported_message_type"}
        if not self._matches_ground_control_source(source_port=source_port, metadata=metadata):
            return {"status": "skipped", "reason": "non_ground_control_source"}

        async with get_session() as session:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            live_snapshot_payload = await SnapshotRuntimeStateService(session).get_live_snapshot_payload()
            if not isinstance(live_snapshot_payload, dict):
                return {"status": "skipped", "reason": "no_live_snapshot"}

            mappings = self._iter_live_input_mappings(live_snapshot_payload)
            matched = [mapping for mapping in mappings if self._mapping_matches_event(mapping, event)]
            if not matched:
                return {
                    "status": "skipped",
                    "reason": "no_matching_mapping",
                    "snapshot_id": int(live_snapshot_payload.get("id") or 0),
                }

            results: list[dict[str, Any]] = []
            for mapping in matched:
                result = await self._dispatch_live_mapping(
                    session=session,
                    live_snapshot_payload=live_snapshot_payload,
                    mapping=mapping,
                    event=event,
                    source_port=source_port,
                )
                results.append(result)

        payload = {
            "status": "completed",
            "source_port": source_port,
            "snapshot_id": int(live_snapshot_payload.get("id") or 0),
            "snapshot_name": str(live_snapshot_payload.get("name") or ""),
            "matched_count": len(results),
            "results": results,
        }
        await self._emit("ground-control-pro:input_dispatch", payload)
        return payload

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

    @staticmethod
    def _coerce_index(value: Any, *, minimum: int, maximum: int) -> int | None:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        if parsed < minimum or parsed > maximum:
            return None
        return parsed

    @staticmethod
    def _coerce_7bit(value: Any, *, fallback: int = 0) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = fallback
        return max(0, min(127, parsed))

    @staticmethod
    def _coerce_bool_byte(value: Any) -> int:
        if isinstance(value, bool):
            return 1 if value else 0
        try:
            return 1 if int(value) else 0
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _apply_indexed_byte_overrides(
        target: list[int],
        overrides: Any,
        *,
        maximum_length: int,
    ) -> list[int]:
        next_values = list(target[:maximum_length])
        if len(next_values) < maximum_length:
            next_values.extend([0] * (maximum_length - len(next_values)))
        if isinstance(overrides, list):
            sparse_entries = [item for item in overrides if isinstance(item, dict) and item.get("index") is not None]
            if sparse_entries:
                for entry in sparse_entries:
                    index = GroundControlProService._coerce_index(
                        entry.get("index"),
                        minimum=0,
                        maximum=maximum_length - 1,
                    )
                    if index is None:
                        continue
                    next_values[index] = GroundControlProService._coerce_7bit(entry.get("value"))
                return next_values
            for index, value in enumerate(overrides[:maximum_length]):
                next_values[index] = GroundControlProService._coerce_7bit(value)
        return next_values

    @staticmethod
    def _apply_indexed_bool_overrides(
        target: list[int],
        overrides: Any,
        *,
        maximum_length: int,
    ) -> list[int]:
        next_values = list(target[:maximum_length])
        if len(next_values) < maximum_length:
            next_values.extend([0] * (maximum_length - len(next_values)))
        if isinstance(overrides, list):
            sparse_entries = [item for item in overrides if isinstance(item, dict) and item.get("index") is not None]
            if sparse_entries:
                for entry in sparse_entries:
                    index = GroundControlProService._coerce_index(
                        entry.get("index"),
                        minimum=0,
                        maximum=maximum_length - 1,
                    )
                    if index is None:
                        continue
                    next_values[index] = GroundControlProService._coerce_bool_byte(entry.get("value"))
                return next_values
            for index, value in enumerate(overrides[:maximum_length]):
                next_values[index] = GroundControlProService._coerce_bool_byte(value)
        return next_values

    @staticmethod
    def _apply_program_change_overrides(
        target: list[dict[str, Any]],
        overrides: Any,
        *,
        maximum_length: int,
    ) -> list[dict[str, Any]]:
        next_values = [
            {
                "enabled": GroundControlProService._coerce_bool_byte(item.get("enabled")),
                "program": GroundControlProService._coerce_7bit(item.get("program")),
                "confidence": str(item.get("confidence", "inferred")),
            }
            for item in target[:maximum_length]
        ]
        if len(next_values) < maximum_length:
            next_values.extend(
                {
                    "enabled": 0,
                    "program": 0,
                    "confidence": "inferred",
                }
                for _ in range(maximum_length - len(next_values))
            )
        if not isinstance(overrides, list):
            return next_values

        sparse_entries = [item for item in overrides if isinstance(item, dict) and item.get("device_index") is not None]
        if sparse_entries:
            for entry in sparse_entries:
                index = GroundControlProService._coerce_index(
                    entry.get("device_index"),
                    minimum=0,
                    maximum=maximum_length - 1,
                )
                if index is None:
                    continue
                next_values[index] = {
                    "enabled": GroundControlProService._coerce_bool_byte(
                        entry.get("enabled", next_values[index].get("enabled", 0))
                    ),
                    "program": GroundControlProService._coerce_7bit(
                        entry.get("program", next_values[index].get("program", 0))
                    ),
                    "confidence": str(entry.get("confidence", next_values[index].get("confidence", "inferred"))),
                }
            return next_values

        for index, entry in enumerate(overrides[:maximum_length]):
            if not isinstance(entry, dict):
                continue
            next_values[index] = {
                "enabled": GroundControlProService._coerce_bool_byte(entry.get("enabled")),
                "program": GroundControlProService._coerce_7bit(entry.get("program")),
                "confidence": str(entry.get("confidence", "inferred")),
            }
        return next_values

    @staticmethod
    def _apply_instant_access_definition_overrides(
        target: list[dict[str, Any]],
        overrides: Any,
        *,
        maximum_length: int,
    ) -> list[dict[str, Any]]:
        next_values = [
            {
                "function": GroundControlProService._coerce_7bit(item.get("function")),
                "detail": GroundControlProService._coerce_7bit(item.get("detail")),
                "transmit_cc": GroundControlProService._coerce_7bit(item.get("transmit_cc")),
                "switch_type": GroundControlProService._coerce_7bit(item.get("switch_type")),
                "confidence": str(item.get("confidence", "inferred")),
            }
            for item in target[:maximum_length]
        ]
        if len(next_values) < maximum_length:
            next_values.extend(
                {
                    "function": 0,
                    "detail": 0,
                    "transmit_cc": 0,
                    "switch_type": 0,
                    "confidence": "inferred",
                }
                for _ in range(maximum_length - len(next_values))
            )
        if not isinstance(overrides, list):
            return next_values

        sparse_entries = [item for item in overrides if isinstance(item, dict) and item.get("index") is not None]
        if sparse_entries:
            for entry in sparse_entries:
                index = GroundControlProService._coerce_index(
                    entry.get("index"),
                    minimum=0,
                    maximum=maximum_length - 1,
                )
                if index is None:
                    continue
                current = next_values[index]
                next_values[index] = {
                    "function": GroundControlProService._coerce_7bit(entry.get("function", current.get("function", 0))),
                    "detail": GroundControlProService._coerce_7bit(entry.get("detail", current.get("detail", 0))),
                    "transmit_cc": GroundControlProService._coerce_7bit(
                        entry.get("transmit_cc", current.get("transmit_cc", 0))
                    ),
                    "switch_type": GroundControlProService._coerce_7bit(
                        entry.get("switch_type", current.get("switch_type", 0))
                    ),
                    "confidence": str(entry.get("confidence", current.get("confidence", "inferred"))),
                }
            return next_values

        for index, entry in enumerate(overrides[:maximum_length]):
            if not isinstance(entry, dict):
                continue
            next_values[index] = {
                "function": GroundControlProService._coerce_7bit(entry.get("function")),
                "detail": GroundControlProService._coerce_7bit(entry.get("detail")),
                "transmit_cc": GroundControlProService._coerce_7bit(entry.get("transmit_cc")),
                "switch_type": GroundControlProService._coerce_7bit(entry.get("switch_type")),
                "confidence": str(entry.get("confidence", "inferred")),
            }
        return next_values

    async def _resolve_push_transport_options(self, transport_payload: dict[str, Any] | None = None) -> GroundControlTransportOptions:
        payload = dict(transport_payload or {})
        output_port_index = payload.get("output_port_index")
        output_port_name = payload.get("output_port_name")
        if output_port_index is None and not output_port_name:
            ports = await self._list_ports_with_ground_control_matches()
            recommended_output = ports.get("recommended_output_index")
            outputs = (
                ports.get("ground_control_outputs")
                if isinstance(ports.get("ground_control_outputs"), list)
                else []
            )
            all_outputs = ports.get("outputs") if isinstance(ports.get("outputs"), list) else []
            if recommended_output is not None and any(
                isinstance(port, dict) and port.get("index") == recommended_output for port in outputs
            ):
                output_port_index = recommended_output
            elif len(outputs) == 1 and isinstance(outputs[0], dict):
                output_port_index = outputs[0].get("index")
            elif len(all_outputs) == 1 and isinstance(all_outputs[0], dict):
                output_port_index = all_outputs[0].get("index")

        return GroundControlTransportOptions(
            output_port_index=self._coerce_index(output_port_index, minimum=0, maximum=127),
            output_port_name=str(output_port_name).strip() or None if output_port_name is not None else None,
            inter_message_delay_ms=float(payload.get("inter_message_delay_ms", 0.0) or 0.0),
            chunk_size=self._coerce_index(payload.get("chunk_size"), minimum=1, maximum=65535),
            debug=bool(payload.get("debug", False)),
            dry_run_path=str(payload.get("dry_run_path") or "").strip() or None,
        )

    def build_snapshot_activation_model(
        self,
        *,
        session_id: str,
        activation_payload: dict[str, Any],
        snapshot_name: str | None = None,
    ) -> dict[str, Any]:
        if session_id not in self.sessions:
            raise KeyError(f"Unknown session id: {session_id}")

        model_payload = copy.deepcopy(self.sessions[session_id]["model"].to_dict())
        preset_payload = activation_payload.get("preset") if isinstance(activation_payload.get("preset"), dict) else {}
        preset_index = self._coerce_index(
            preset_payload.get("index", activation_payload.get("preset_index")),
            minimum=0,
            maximum=len(model_payload.get("presets", [])) - 1,
        )
        if preset_index is None:
            raise ValueError("Ground Control Pro snapshot activation requires a preset.index or preset_index")

        presets = model_payload.get("presets")
        if not isinstance(presets, list) or preset_index >= len(presets):
            raise ValueError(f"Ground Control Pro preset index {preset_index} is unavailable")
        target_preset = copy.deepcopy(presets[preset_index])

        if preset_payload.get("name") is not None:
            target_preset["name"] = str(preset_payload.get("name") or "").strip() or str(
                snapshot_name or target_preset.get("name") or f"SNAP {preset_index + 1}"
            )
        elif activation_payload.get("use_snapshot_name_as_preset_name"):
            target_preset["name"] = str(snapshot_name or target_preset.get("name") or f"SNAP {preset_index + 1}")

        target_preset["device_program_changes"] = self._apply_program_change_overrides(
            target_preset.get("device_program_changes") if isinstance(target_preset.get("device_program_changes"), list) else [],
            preset_payload.get("device_program_changes"),
            maximum_length=8,
        )
        target_preset["device_program_banks_raw"] = self._apply_indexed_byte_overrides(
            target_preset.get("device_program_banks_raw") if isinstance(target_preset.get("device_program_banks_raw"), list) else [],
            preset_payload.get("device_program_banks_raw"),
            maximum_length=8,
        )
        target_preset["gcx_loop_states"] = self._apply_indexed_bool_overrides(
            target_preset.get("gcx_loop_states") if isinstance(target_preset.get("gcx_loop_states"), list) else [],
            preset_payload.get("gcx_loop_states"),
            maximum_length=32,
        )
        target_preset["gcx_toggles"] = self._apply_indexed_bool_overrides(
            target_preset.get("gcx_toggles") if isinstance(target_preset.get("gcx_toggles"), list) else [],
            preset_payload.get("gcx_toggles"),
            maximum_length=4,
        )
        target_preset["instant_access_state"] = self._apply_indexed_bool_overrides(
            target_preset.get("instant_access_state") if isinstance(target_preset.get("instant_access_state"), list) else [],
            preset_payload.get("instant_access_state"),
            maximum_length=8,
        )
        presets[preset_index] = target_preset

        global_config = model_payload.get("global_config") if isinstance(model_payload.get("global_config"), dict) else {}
        activation_global_config = (
            activation_payload.get("global_config")
            if isinstance(activation_payload.get("global_config"), dict)
            else {}
        )
        global_config["instant_access"] = self._apply_instant_access_definition_overrides(
            global_config.get("instant_access") if isinstance(global_config.get("instant_access"), list) else [],
            activation_global_config.get("instant_access"),
            maximum_length=8,
        )
        model_payload["global_config"] = global_config
        model_payload["presets"] = presets
        return model_payload

    async def push_snapshot_activation(
        self,
        *,
        snapshot_id: int,
        snapshot_name: str,
        extension_payload: dict[str, Any],
    ) -> dict[str, Any]:
        await self._ensure_daemon_started()
        session_id = str(extension_payload.get("session_id") or "").strip()
        if not session_id:
            raise ValueError("Ground Control Pro snapshot activation requires extensions.ground_control_pro.session_id")
        activation_payload = (
            extension_payload.get("activation_push")
            if isinstance(extension_payload.get("activation_push"), dict)
            else {}
        )
        if activation_payload.get("enabled") is False:
            return {
                "status": "skipped",
                "reason": "disabled",
                "snapshot_id": int(snapshot_id),
                "session_id": session_id,
            }

        model_payload = self.build_snapshot_activation_model(
            session_id=session_id,
            activation_payload=activation_payload,
            snapshot_name=snapshot_name,
        )
        transport_options = await self._resolve_push_transport_options(
            activation_payload.get("transport")
            if isinstance(activation_payload.get("transport"), dict)
            else None
        )
        push_job = await self.push(
            compiled_artifact_id=None,
            session_id=session_id,
            model_payload=model_payload,
            options=transport_options,
            force=True,
        )
        result = push_job.get("result") if isinstance(push_job.get("result"), dict) else {}
        return {
            "status": "completed",
            "snapshot_id": int(snapshot_id),
            "snapshot_name": snapshot_name,
            "session_id": session_id,
            "preset_index": self._coerce_index(
                activation_payload.get("preset", {}).get("index", activation_payload.get("preset_index"))
                if isinstance(activation_payload.get("preset"), dict)
                else activation_payload.get("preset_index"),
                minimum=0,
                maximum=199,
            ),
            "artifact_id": result.get("artifact", {}).get("artifact_id") if isinstance(result.get("artifact"), dict) else None,
            "transport": result.get("transport") if isinstance(result.get("transport"), dict) else None,
        }

    async def get_ports(self) -> Dict[str, Any]:
        await self._ensure_daemon_started()
        ports = await self._list_ports_with_ground_control_matches()
        return {
            key: value
            for key, value in {
                **ports,
                "daemon_status": self._daemon.snapshot(),
            }.items()
            if key not in {"ground_control_inputs", "ground_control_outputs"}
        }

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

    def _latest_session_id(self) -> Optional[str]:
        latest_session_id: Optional[str] = None
        latest_updated_at = ""
        for session_id, session in self.sessions.items():
            updated_at = str(session.get("updated_at") or "")
            if latest_session_id is None or updated_at > latest_updated_at:
                latest_session_id = session_id
                latest_updated_at = updated_at
        return latest_session_id

    async def export_bundle_payload(self, session_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        resolved_session_id = session_id or self._latest_session_id()
        if not resolved_session_id or resolved_session_id not in self.sessions:
            return None

        session = self.sessions[resolved_session_id]
        source_artifact_id = session.get("source_artifact_id")
        if not source_artifact_id:
            return None

        source_artifact = self.artifacts.get(source_artifact_id)
        source_bytes = self._artifact_content_bytes(source_artifact_id)
        return {
            "profile_id": PROFILE_ID,
            "session_id": resolved_session_id,
            "source_name": str(session.get("source_name") or "ground-control-pro.syx"),
            "source_artifact_id": source_artifact_id,
            "compiled_artifact_id": session.get("compiled_artifact_id"),
            "backup_artifact_id": session.get("backup_artifact_id"),
            "sysex_base64": base64.b64encode(source_bytes).decode("ascii"),
            "model": session["model"].to_dict(),
            "validation": session["validation"].to_dict(),
            "artifacts": [dict(artifact) for artifact in session.get("artifacts", []) if isinstance(artifact, dict)],
            "artifact_metadata": copy.deepcopy(source_artifact.get("metadata") or {}) if isinstance(source_artifact, dict) else {},
        }

    async def import_bundle_payload(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not isinstance(payload, dict):
            return None
        sysex_base64 = str(payload.get("sysex_base64") or "").strip()
        if not sysex_base64:
            return None
        source_name = str(payload.get("source_name") or "ground-control-pro-bundle.syx").strip() or "ground-control-pro-bundle.syx"
        sysex_bytes = base64.b64decode(sysex_base64.encode("ascii"))
        session = await self.import_syx_bytes(sysex_bytes, source_name=source_name)
        return {
            "profile_id": PROFILE_ID,
            "session_id": session["session_id"],
            "source_artifact_id": session["summary"].get("source_artifact_id"),
            "backup_artifact_id": session["summary"].get("backup_artifact_id"),
            "compiled_artifact_id": session["summary"].get("compiled_artifact_id"),
            "source_name": session["source_name"],
        }


_ground_control_pro_service: Optional[GroundControlProService] = None


def get_ground_control_pro_service() -> GroundControlProService:
    global _ground_control_pro_service
    if _ground_control_pro_service is None:
        with _ground_control_pro_service_lock:
            if _ground_control_pro_service is None:
                _ground_control_pro_service = GroundControlProService()
    return _ground_control_pro_service
