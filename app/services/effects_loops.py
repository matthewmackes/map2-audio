"""
Effects Loop Service

First-class external effects loops using AVB + Tesira send/return topology.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import (
    Chain,
    EffectsLoop,
    EffectsLoopCalibration,
    EffectsLoopInsertion,
    TesiraLoopTemplate,
)
from app.services.event_publisher import EventType, event_publisher

logger = logging.getLogger(__name__)

ALLOWED_LOOP_TOPOLOGIES = {
    "serial_insert",
    "parallel_send_return",
    "dual_parallel",
    "multiband_split",
}

ALLOWED_INSERTION_MODES = {
    "serial_insert",
    "parallel_send_return",
    "dual_parallel",
    "multiband_split",
}

CONNECTION_ROLE_SEND = "effects_loop_send"
CONNECTION_ROLE_RETURN = "effects_loop_return"
CONNECTION_ROLE_GENERAL = "general_route"


class EffectsLoopService:
    """Persistence + orchestration service for external effects loops."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        engine_service: Any = None,
        avb_router: Any = None,
        tesira_fleet: Any = None,
    ) -> None:
        self.session = session
        self._engine_service = engine_service
        self._avb_router = avb_router
        self._tesira_fleet = tesira_fleet

    # ------------------------------------------------------------------
    # Public loop CRUD
    # ------------------------------------------------------------------

    async def list_loops(self) -> List[Dict[str, Any]]:
        result = await self.session.execute(
            select(EffectsLoop).order_by(EffectsLoop.updated_at.desc(), EffectsLoop.id.desc())
        )
        loops = list(result.scalars().all())
        return [self._serialize_loop(loop) for loop in loops]

    async def get_loop(self, loop_id: str) -> Optional[Dict[str, Any]]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            return None
        return self._serialize_loop(loop)

    async def create_loop(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        loop_id = str(payload.get("loop_id") or self._new_loop_id())
        name = str(payload.get("name") or "New Effects Loop").strip()
        channels = self._coerce_int(payload.get("channels"), 2)
        topology = str(payload.get("topology") or "serial_insert").strip()

        self._validate_loop_channels(channels)
        self._validate_loop_topology(topology)

        if await self._load_loop(loop_id) is not None:
            raise ValueError(f"Loop '{loop_id}' already exists")

        template_id = self._coerce_optional_text(payload.get("template_id"))
        tesira_device_id = self._coerce_optional_text(payload.get("tesira_device_id"))
        if template_id is not None:
            await self._require_template(template_id=template_id, tesira_device_id=tesira_device_id)

        loop = EffectsLoop(
            loop_id=loop_id,
            name=name or "New Effects Loop",
            channels=channels,
            topology=topology,
            tesira_device_id=tesira_device_id,
            template_id=template_id,
            send_endpoint_id=self._coerce_optional_text(payload.get("send_endpoint_id")),
            return_endpoint_id=self._coerce_optional_text(payload.get("return_endpoint_id")),
            state_desired=str(payload.get("state_desired") or "inactive"),
            state_actual=str(payload.get("state_actual") or "inactive"),
            health_status=str(payload.get("health_status") or "unknown"),
            health_reason=self._coerce_optional_text(payload.get("health_reason")),
            target_added_latency_ms=0.5,
            measured_added_latency_ms=self._coerce_optional_float(payload.get("measured_added_latency_ms")),
            compensation_samples=self._coerce_int(payload.get("compensation_samples"), 0),
            calibration_status=str(payload.get("calibration_status") or "uncalibrated"),
        )

        self.session.add(loop)
        await self.session.flush()

        await self._sync_engine_loop_definitions()
        await self._publish_loop_state(loop, event="created")
        return self._serialize_loop(loop)

    async def update_loop(self, loop_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            return None

        if "name" in payload:
            name = str(payload.get("name") or "").strip()
            if name:
                loop.name = name

        if "channels" in payload:
            channels = self._coerce_int(payload.get("channels"), loop.channels)
            self._validate_loop_channels(channels)
            loop.channels = channels

        if "topology" in payload:
            topology = str(payload.get("topology") or "").strip()
            self._validate_loop_topology(topology)
            loop.topology = topology

        if "tesira_device_id" in payload:
            loop.tesira_device_id = self._coerce_optional_text(payload.get("tesira_device_id"))
        if "template_id" in payload:
            template_id = self._coerce_optional_text(payload.get("template_id"))
            if template_id is not None:
                await self._require_template(template_id=template_id, tesira_device_id=loop.tesira_device_id)
            loop.template_id = template_id

        if "send_endpoint_id" in payload:
            loop.send_endpoint_id = self._coerce_optional_text(payload.get("send_endpoint_id"))
        if "return_endpoint_id" in payload:
            loop.return_endpoint_id = self._coerce_optional_text(payload.get("return_endpoint_id"))

        if "state_desired" in payload:
            loop.state_desired = str(payload.get("state_desired") or loop.state_desired)
        if "state_actual" in payload:
            loop.state_actual = str(payload.get("state_actual") or loop.state_actual)

        if "health_status" in payload:
            loop.health_status = str(payload.get("health_status") or loop.health_status)
        if "health_reason" in payload:
            loop.health_reason = self._coerce_optional_text(payload.get("health_reason"))

        if "measured_added_latency_ms" in payload:
            loop.measured_added_latency_ms = self._coerce_optional_float(payload.get("measured_added_latency_ms"))
        if "compensation_samples" in payload:
            loop.compensation_samples = self._coerce_int(payload.get("compensation_samples"), loop.compensation_samples)
        if "calibration_status" in payload:
            loop.calibration_status = str(payload.get("calibration_status") or loop.calibration_status)

        loop.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        await self._sync_engine_loop_definitions()
        await self._publish_loop_state(loop, event="updated")
        return self._serialize_loop(loop)

    async def delete_loop(self, loop_id: str) -> bool:
        loop = await self._load_loop(loop_id)
        if loop is None:
            return False

        await self.session.delete(loop)
        await self.session.flush()

        await self._sync_engine_loop_definitions()
        await event_publisher.publish(
            "effects_loop_state",
            EventType.EFFECTS_LOOP_STATE,
            {"event": "deleted", "loop_id": loop_id, "timestamp": datetime.now(timezone.utc).isoformat() + "Z"},
        )
        return True

    # ------------------------------------------------------------------
    # Activation / bypass / calibration / metrics
    # ------------------------------------------------------------------

    async def activate_loop(self, loop_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            raise ValueError(f"Loop '{loop_id}' not found")

        payload = payload or {}
        audition_mode = bool(payload.get("audition_mode", False))

        preflight_ok, preflight_reason, role = await self._preflight_activation(loop)
        if not preflight_ok:
            loop.state_desired = "active"
            loop.state_actual = "inactive"
            loop.health_status = "blocked"
            loop.health_reason = preflight_reason
            loop.updated_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self._publish_loop_state(loop, event="activation_blocked")
            return {
                "success": False,
                "loop_id": loop.loop_id,
                "state": loop.state_actual,
                "reason": preflight_reason,
                "preflight": {"ok": False, "reason": preflight_reason},
            }

        connection_result = await self._connect_loop_route(loop, role)
        if not connection_result[0]:
            loop.state_desired = "active"
            loop.state_actual = "inactive"
            loop.health_status = "error"
            loop.health_reason = connection_result[1]
            loop.updated_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self._publish_loop_state(loop, event="activation_failed")
            return {
                "success": False,
                "loop_id": loop.loop_id,
                "state": loop.state_actual,
                "reason": connection_result[1],
                "preflight": {"ok": True},
            }

        apply_template_ok, template_reason = await self._apply_template_for_activation(loop)
        if not apply_template_ok:
            if audition_mode:
                await self._disconnect_loop_route(loop)
            loop.state_desired = "active"
            loop.state_actual = "inactive"
            loop.health_status = "error"
            loop.health_reason = template_reason
            loop.updated_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self._publish_loop_state(loop, event="activation_failed")
            return {
                "success": False,
                "loop_id": loop.loop_id,
                "state": loop.state_actual,
                "reason": template_reason,
                "preflight": {"ok": True},
            }

        loop.state_desired = "active"
        loop.state_actual = "active"
        loop.health_status = "healthy"
        loop.health_reason = ""
        loop.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        await self._sync_engine_loop_definitions()
        await self._sync_engine_insertions_for_loop(loop.loop_id)
        await self._publish_loop_state(loop, event="activated")

        return {
            "success": True,
            "loop_id": loop.loop_id,
            "state": loop.state_actual,
            "connection_role": role,
            "preflight": {"ok": True},
            "route": connection_result[2],
        }

    async def set_loop_bypass(self, loop_id: str, bypass: bool) -> Dict[str, Any]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            raise ValueError(f"Loop '{loop_id}' not found")

        engine = self._get_engine_service()
        engine_ok = True
        if engine is not None:
            try:
                if hasattr(engine, "set_loop_bypass"):
                    engine_ok = bool(await engine.set_loop_bypass(loop_id, bypass))
            except Exception as exc:
                logger.warning("set_loop_bypass engine call failed: %s", exc)
                engine_ok = False

        if bypass:
            loop.state_desired = "bypassed"
            loop.state_actual = "bypassed"
        else:
            loop.state_desired = "active"
            loop.state_actual = "active"

        if engine_ok:
            loop.health_status = "healthy"
            loop.health_reason = ""
        else:
            loop.health_status = "degraded"
            loop.health_reason = "Engine bypass command unavailable"
        loop.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        await self._publish_loop_state(loop, event="bypass_changed")

        return {
            "success": engine_ok,
            "loop_id": loop.loop_id,
            "bypass": bypass,
            "state_actual": loop.state_actual,
            "health_status": loop.health_status,
            "health_reason": loop.health_reason,
        }

    async def calibrate_loop(self, loop_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            raise ValueError(f"Loop '{loop_id}' not found")

        options = options or {}
        loop.calibration_status = "in_progress"
        loop.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        await event_publisher.publish(
            "effects_loop_calibration_progress",
            EventType.EFFECTS_LOOP_CALIBRATION_PROGRESS,
            {
                "loop_id": loop.loop_id,
                "status": "in_progress",
                "progress_pct": 5,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        )

        measured_ms: Optional[float] = None
        compensation_samples: Optional[int] = None
        engine = self._get_engine_service()
        engine_ok = False
        if engine is not None and hasattr(engine, "calibrate_loop"):
            try:
                engine_ok = bool(await engine.calibrate_loop(loop.loop_id, options))
            except Exception as exc:
                logger.warning("calibrate_loop engine call failed: %s", exc)
                engine_ok = False

        if engine is not None and hasattr(engine, "get_loop_metrics"):
            try:
                metric_payload = await engine.get_loop_metrics(loop.loop_id)
                metric = self._first_metric(metric_payload)
                if isinstance(metric, dict):
                    measured_ms = self._coerce_optional_float(metric.get("measured_added_latency_ms"))
                    comp_value = metric.get("compensation_samples")
                    if comp_value is not None:
                        compensation_samples = self._coerce_int(comp_value, 0)
            except Exception as exc:
                logger.debug("Engine metrics unavailable for loop %s: %s", loop.loop_id, exc)

        if measured_ms is None or compensation_samples is None:
            fallback_rate = await self._resolve_loop_sample_rate(loop)
            measured_ms = measured_ms if measured_ms is not None else min(0.5, max(0.05, 0.1 * loop.channels))
            compensation_samples = (
                compensation_samples
                if compensation_samples is not None
                else int(round((measured_ms / 1000.0) * float(fallback_rate)))
            )

        loop.measured_added_latency_ms = measured_ms
        loop.compensation_samples = compensation_samples
        loop.calibration_status = "calibrated" if engine_ok or measured_ms is not None else "failed"
        loop.health_status = "healthy" if loop.calibration_status == "calibrated" else "degraded"
        loop.health_reason = "" if loop.calibration_status == "calibrated" else "Calibration failed"
        loop.updated_at = datetime.now(timezone.utc)

        calibration = EffectsLoopCalibration(
            calibration_id=self._new_calibration_id(),
            loop_id=loop.loop_id,
            status=loop.calibration_status,
            measured_added_latency_ms=loop.measured_added_latency_ms,
            compensation_samples=loop.compensation_samples,
            notes={
                "engine_ok": engine_ok,
                "options": options,
            },
            measured_at=datetime.now(timezone.utc),
        )
        self.session.add(calibration)
        await self.session.flush()

        await event_publisher.publish(
            "effects_loop_calibration_progress",
            EventType.EFFECTS_LOOP_CALIBRATION_PROGRESS,
            {
                "loop_id": loop.loop_id,
                "status": loop.calibration_status,
                "progress_pct": 100,
                "measured_added_latency_ms": loop.measured_added_latency_ms,
                "compensation_samples": loop.compensation_samples,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        )
        await self._publish_loop_metrics(loop)
        await self._publish_loop_state(loop, event="calibrated")

        return {
            "success": loop.calibration_status == "calibrated",
            "loop_id": loop.loop_id,
            "calibration_status": loop.calibration_status,
            "measured_added_latency_ms": loop.measured_added_latency_ms,
            "compensation_samples": loop.compensation_samples,
            "engine_calibration": engine_ok,
            "calibration_id": calibration.calibration_id,
        }

    async def get_metrics(self, loop_id: str) -> Dict[str, Any]:
        loop = await self._load_loop(loop_id)
        if loop is None:
            raise ValueError(f"Loop '{loop_id}' not found")

        engine_metrics = await self._get_engine_metrics(loop_id)
        if engine_metrics:
            metric = dict(engine_metrics)
            metric.setdefault("loop_id", loop.loop_id)
            metric.setdefault("target_added_latency_ms", loop.target_added_latency_ms)
            metric.setdefault("measured_added_latency_ms", loop.measured_added_latency_ms)
            metric.setdefault("compensation_samples", loop.compensation_samples)
            metric["health_status"] = loop.health_status
            metric["health_reason"] = loop.health_reason
            await event_publisher.publish(
                "effects_loop_metrics",
                EventType.EFFECTS_LOOP_METRICS,
                metric,
            )
            return metric

        metric = {
            "loop_id": loop.loop_id,
            "state_actual": loop.state_actual,
            "target_added_latency_ms": loop.target_added_latency_ms,
            "measured_added_latency_ms": loop.measured_added_latency_ms,
            "compensation_samples": loop.compensation_samples,
            "channels": loop.channels,
            "health_status": loop.health_status,
            "health_reason": loop.health_reason,
            "updated_at": loop.updated_at.isoformat() if loop.updated_at else None,
        }
        await event_publisher.publish(
            "effects_loop_metrics",
            EventType.EFFECTS_LOOP_METRICS,
            metric,
        )
        return metric

    # ------------------------------------------------------------------
    # Templates
    # ------------------------------------------------------------------

    async def list_templates(self) -> List[Dict[str, Any]]:
        result = await self.session.execute(
            select(TesiraLoopTemplate).order_by(TesiraLoopTemplate.updated_at.desc(), TesiraLoopTemplate.id.desc())
        )
        templates = list(result.scalars().all())
        serialized: List[Dict[str, Any]] = []
        for template in templates:
            serialized.append(await self._serialize_template_with_runtime(template))
        return serialized

    async def upsert_template(self, template_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        tesira_device_id = self._coerce_optional_text(payload.get("tesira_device_id"))
        if not tesira_device_id:
            raise ValueError("tesira_device_id is required")

        result = await self.session.execute(
            select(TesiraLoopTemplate).filter(TesiraLoopTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None:
            template = TesiraLoopTemplate(template_id=template_id, tesira_device_id=tesira_device_id)
            self.session.add(template)

        template.tesira_device_id = tesira_device_id
        template.stream_in_tags = self._normalize_string_list(payload.get("stream_in_tags"))
        template.stream_out_tags = self._normalize_string_list(payload.get("stream_out_tags"))
        template.crosspoint_tags = self._normalize_string_list(payload.get("crosspoint_tags"))
        template.input_router_tag = self._coerce_optional_text(payload.get("input_router_tag"))
        template.output_router_tag = self._coerce_optional_text(payload.get("output_router_tag"))
        template.meter_tags = self._normalize_string_list(payload.get("meter_tags"))
        template.bypass_tags = self._normalize_string_list(payload.get("bypass_tags"))
        template.channel_map_policy = str(payload.get("channel_map_policy") or "direct")

        valid, reason = self._validate_template_fields(template)
        template.validation_status = "valid" if valid else "invalid"
        template.validation_error = None if valid else reason
        template.updated_at = datetime.now(timezone.utc)

        await self.session.flush()
        return await self._serialize_template_with_runtime(template)

    async def validate_template(self, template_id: str) -> Dict[str, Any]:
        result = await self.session.execute(
            select(TesiraLoopTemplate).filter(TesiraLoopTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise ValueError(f"Template '{template_id}' not found")

        valid, reason = self._validate_template_fields(template)
        template.validation_status = "valid" if valid else "invalid"
        template.validation_error = None if valid else reason
        template.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        runtime_status = await self._build_template_runtime_status(template)

        return {
            "template_id": template.template_id,
            "tesira_device_id": template.tesira_device_id,
            "valid": valid,
            "validation_status": template.validation_status,
            "reason": reason,
            "runtime_status": runtime_status,
        }

    async def get_template_runtime_status(self, template_id: str) -> Dict[str, Any]:
        result = await self.session.execute(
            select(TesiraLoopTemplate).filter(TesiraLoopTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise ValueError(f"Template '{template_id}' not found")

        runtime_status = await self._build_template_runtime_status(template)
        return {
            "template_id": template.template_id,
            "tesira_device_id": template.tesira_device_id,
            "runtime_status": runtime_status,
        }

    # ------------------------------------------------------------------
    # Chain insertion CRUD
    # ------------------------------------------------------------------

    async def list_chain_insertions(self, chain_id: int) -> Dict[str, Any]:
        await self._require_chain(chain_id)

        result = await self.session.execute(
            select(EffectsLoopInsertion)
            .filter(EffectsLoopInsertion.chain_id == chain_id)
            .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
        )
        insertions = list(result.scalars().all())

        loop_map = await self._load_loop_map([i.loop_id for i in insertions])
        insertion_payloads = [self._serialize_insertion(i) for i in insertions]
        resolved_loops = [self._serialize_loop(loop_map[loop_id]) for loop_id in sorted(loop_map.keys())]

        return {
            "chain_id": chain_id,
            "loop_insertions": insertion_payloads,
            "effects_loops": resolved_loops,
            "count": len(insertion_payloads),
        }

    async def insert_chain_loop(self, chain_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        await self._require_chain(chain_id)

        loop_id = self._coerce_optional_text(payload.get("loop_id"))
        if not loop_id:
            raise ValueError("loop_id is required")
        loop = await self._load_loop(loop_id)
        if loop is None:
            raise ValueError(f"Loop '{loop_id}' not found")

        slot_index = self._coerce_int(payload.get("slot_index"), 0)
        if slot_index < 0:
            raise ValueError("slot_index must be >= 0")

        mode = str(payload.get("mode") or "serial_insert")
        self._validate_insertion_mode(mode)

        await self._shift_chain_slots(chain_id=chain_id, start_slot=slot_index)

        insertion = EffectsLoopInsertion(
            insertion_id=str(payload.get("insertion_id") or self._new_insertion_id()),
            chain_id=chain_id,
            loop_id=loop_id,
            slot_index=slot_index,
            enabled=bool(payload.get("enabled", True)),
            mode=mode,
            blend_pct=self._coerce_float(payload.get("blend_pct"), 100.0),
            send_gain_db=self._coerce_float(payload.get("send_gain_db"), 0.0),
            return_gain_db=self._coerce_float(payload.get("return_gain_db"), 0.0),
            crossfade_ms=self._coerce_int(payload.get("crossfade_ms"), 12),
            band_split_hz=self._normalize_band_split(payload.get("band_split_hz")),
        )
        self.session.add(insertion)
        await self.session.flush()

        await self._sync_engine_insertions_for_chain(chain_id)
        return {
            "chain_id": chain_id,
            "insertion": self._serialize_insertion(insertion),
            "effects_loop": self._serialize_loop(loop),
        }

    async def update_chain_insertion(
        self,
        chain_id: int,
        insertion_id: str,
        payload: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        result = await self.session.execute(
            select(EffectsLoopInsertion).filter(
                EffectsLoopInsertion.chain_id == chain_id,
                EffectsLoopInsertion.insertion_id == insertion_id,
            )
        )
        insertion = result.scalar_one_or_none()
        if insertion is None:
            return None

        if "loop_id" in payload:
            loop_id = self._coerce_optional_text(payload.get("loop_id"))
            if not loop_id:
                raise ValueError("loop_id cannot be empty")
            loop = await self._load_loop(loop_id)
            if loop is None:
                raise ValueError(f"Loop '{loop_id}' not found")
            insertion.loop_id = loop_id

        if "slot_index" in payload:
            slot_index = self._coerce_int(payload.get("slot_index"), insertion.slot_index)
            if slot_index < 0:
                raise ValueError("slot_index must be >= 0")
            insertion.slot_index = slot_index

        if "enabled" in payload:
            insertion.enabled = bool(payload.get("enabled"))
        if "mode" in payload:
            mode = str(payload.get("mode") or "")
            self._validate_insertion_mode(mode)
            insertion.mode = mode

        if "blend_pct" in payload:
            insertion.blend_pct = self._coerce_float(payload.get("blend_pct"), insertion.blend_pct)
        if "send_gain_db" in payload:
            insertion.send_gain_db = self._coerce_float(payload.get("send_gain_db"), insertion.send_gain_db)
        if "return_gain_db" in payload:
            insertion.return_gain_db = self._coerce_float(payload.get("return_gain_db"), insertion.return_gain_db)
        if "crossfade_ms" in payload:
            insertion.crossfade_ms = self._coerce_int(payload.get("crossfade_ms"), insertion.crossfade_ms)
        if "band_split_hz" in payload:
            insertion.band_split_hz = self._normalize_band_split(payload.get("band_split_hz"))

        insertion.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

        await self._sync_engine_insertions_for_chain(chain_id)
        return self._serialize_insertion(insertion)

    async def delete_chain_insertion(self, chain_id: int, insertion_id: str) -> bool:
        result = await self.session.execute(
            select(EffectsLoopInsertion).filter(
                EffectsLoopInsertion.chain_id == chain_id,
                EffectsLoopInsertion.insertion_id == insertion_id,
            )
        )
        insertion = result.scalar_one_or_none()
        if insertion is None:
            return False

        await self.session.delete(insertion)
        await self.session.flush()
        await self._sync_engine_insertions_for_chain(chain_id)
        return True

    # ------------------------------------------------------------------
    # Helpers - orchestration
    # ------------------------------------------------------------------

    async def _preflight_activation(self, loop: EffectsLoop) -> Tuple[bool, str, str]:
        if not loop.send_endpoint_id or not loop.return_endpoint_id:
            return False, "Loop requires both send_endpoint_id and return_endpoint_id", CONNECTION_ROLE_GENERAL

        router = self._get_avb_router()
        if router is None:
            return False, "AVB router unavailable", CONNECTION_ROLE_GENERAL

        endpoints = getattr(router, "endpoints", {})
        talker = endpoints.get(loop.send_endpoint_id)
        listener = endpoints.get(loop.return_endpoint_id)

        if talker is None or listener is None:
            return False, "Configured AVB endpoints are not currently discovered", CONNECTION_ROLE_GENERAL

        if str(getattr(talker.direction, "value", talker.direction)) != "talker":
            return False, "send_endpoint_id must reference a talker endpoint", CONNECTION_ROLE_GENERAL
        if str(getattr(listener.direction, "value", listener.direction)) != "listener":
            return False, "return_endpoint_id must reference a listener endpoint", CONNECTION_ROLE_GENERAL

        if int(getattr(talker, "sample_rate", 0) or 0) != int(getattr(listener, "sample_rate", 0) or 0):
            return False, "Endpoint sample rates do not match", CONNECTION_ROLE_GENERAL

        available_channels = min(
            int(getattr(talker, "channels", 0) or 0),
            int(getattr(listener, "channels", 0) or 0),
        )
        if available_channels < int(loop.channels):
            return False, "Endpoint channel capacity is below configured loop channel count", CONNECTION_ROLE_GENERAL

        try:
            from app.services.avb import get_avb_readiness

            readiness = get_avb_readiness()
            checks = readiness.get("checks", {}) if isinstance(readiness, dict) else {}
            if not bool(checks.get("ptp4l_running", False)):
                return False, "PTP lock prerequisite failed (ptp4l not running)", CONNECTION_ROLE_GENERAL
        except Exception as exc:
            logger.debug("AVB readiness preflight check failed: %s", exc)

        talker_type = str(getattr(talker, "device_type", "unknown") or "unknown").lower()
        listener_type = str(getattr(listener, "device_type", "unknown") or "unknown").lower()

        role = CONNECTION_ROLE_GENERAL
        if talker_type == "tesira" and listener_type != "tesira":
            role = CONNECTION_ROLE_RETURN
        elif talker_type != "tesira" and listener_type == "tesira":
            role = CONNECTION_ROLE_SEND

        return True, "ok", role

    async def _connect_loop_route(self, loop: EffectsLoop, role: str) -> Tuple[bool, str, Dict[str, Any]]:
        router = self._get_avb_router()
        if router is None:
            return False, "AVB router unavailable", {}

        connect_fn = getattr(router, "connect", None)
        if not callable(connect_fn):
            return False, "AVB router connect API unavailable", {}

        try:
            connect_result = await connect_fn(
                loop.send_endpoint_id,
                loop.return_endpoint_id,
                return_details=True,
                connection_role=role,
                loop_id=loop.loop_id,
            )
        except TypeError:
            connect_result = await connect_fn(
                loop.send_endpoint_id,
                loop.return_endpoint_id,
                return_details=True,
            )
        except Exception as exc:
            return False, str(exc), {}

        if isinstance(connect_result, dict):
            if bool(connect_result.get("success", False)):
                return True, "ok", connect_result
            return False, str(connect_result.get("reason") or "Connection failed"), connect_result

        if bool(connect_result):
            return True, "ok", {}
        return False, "Connection failed", {}

    async def _disconnect_loop_route(self, loop: EffectsLoop) -> bool:
        router = self._get_avb_router()
        if router is None:
            return False
        disconnect_fn = getattr(router, "disconnect", None)
        if not callable(disconnect_fn):
            return False

        try:
            result = await disconnect_fn(loop.send_endpoint_id, loop.return_endpoint_id, return_details=True)
            if isinstance(result, dict):
                return bool(result.get("success", False))
            return bool(result)
        except TypeError:
            try:
                return bool(await disconnect_fn(loop.send_endpoint_id, loop.return_endpoint_id))
            except Exception:
                return False
        except Exception:
            return False

    async def _apply_template_for_activation(self, loop: EffectsLoop) -> Tuple[bool, str]:
        template_id = self._coerce_optional_text(loop.template_id)
        device_id = self._coerce_optional_text(loop.tesira_device_id)
        if template_id is None:
            return True, "no_template"

        result = await self.session.execute(
            select(TesiraLoopTemplate).filter(TesiraLoopTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None:
            return False, f"Template '{template_id}' not found"

        valid, reason = self._validate_template_fields(template)
        if not valid:
            return False, reason

        if not device_id:
            return True, "template_valid_no_device"

        fleet = self._get_tesira_fleet()
        if fleet is None:
            return True, "tesira_fleet_unavailable"

        device = fleet.get_device(device_id)
        if device is None or not bool(getattr(device, "connected", False)):
            return False, f"Tesira device '{device_id}' unavailable or disconnected"

        # Best-effort apply of bypass tags: mark loop path as unbypassed.
        bypass_tags = list(template.bypass_tags or [])
        for tag in bypass_tags:
            try:
                client = getattr(device, "_client", None)
                if client is not None:
                    await client.send(str(tag), "set", "bypass", "false")
            except Exception as exc:
                logger.warning("Failed to apply bypass tag %s on %s: %s", tag, device_id, exc)

        return True, "ok"

    async def _resolve_loop_sample_rate(self, loop: EffectsLoop) -> int:
        router = self._get_avb_router()
        if router is None:
            return 48000
        endpoints = getattr(router, "endpoints", {})
        send_ep = endpoints.get(loop.send_endpoint_id) if loop.send_endpoint_id else None
        if send_ep is not None:
            try:
                return max(1, int(getattr(send_ep, "sample_rate", 48000)))
            except Exception:
                return 48000
        return 48000

    # ------------------------------------------------------------------
    # Helpers - engine sync
    # ------------------------------------------------------------------

    async def _sync_engine_loop_definitions(self) -> None:
        engine = self._get_engine_service()
        if engine is None or not hasattr(engine, "set_external_loop_definitions"):
            return

        result = await self.session.execute(select(EffectsLoop))
        loops = list(result.scalars().all())
        payload = [self._serialize_loop_for_engine(loop) for loop in loops]

        try:
            await engine.set_external_loop_definitions(payload)
        except Exception as exc:
            logger.debug("Engine loop definition sync failed: %s", exc)

    async def _sync_engine_insertions_for_chain(self, chain_id: int) -> None:
        engine = self._get_engine_service()
        if engine is None or not hasattr(engine, "set_chain_loop_insertions"):
            return

        result = await self.session.execute(
            select(EffectsLoopInsertion)
            .filter(EffectsLoopInsertion.chain_id == chain_id)
            .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
        )
        insertions = list(result.scalars().all())
        payload = [self._serialize_insertion_for_engine(i) for i in insertions]

        try:
            await engine.set_chain_loop_insertions(chain_id, payload)
        except Exception as exc:
            logger.debug("Engine chain insertion sync failed for chain %s: %s", chain_id, exc)

    async def _sync_engine_insertions_for_loop(self, loop_id: str) -> None:
        result = await self.session.execute(
            select(EffectsLoopInsertion.chain_id).filter(EffectsLoopInsertion.loop_id == loop_id)
        )
        chain_ids = sorted({int(row[0]) for row in result.all() if row and row[0] is not None})
        for chain_id in chain_ids:
            await self._sync_engine_insertions_for_chain(chain_id)

    async def _get_engine_metrics(self, loop_id: str) -> Optional[Dict[str, Any]]:
        engine = self._get_engine_service()
        if engine is None or not hasattr(engine, "get_loop_metrics"):
            return None

        try:
            payload = await engine.get_loop_metrics(loop_id)
            metric = self._first_metric(payload)
            if isinstance(metric, dict):
                return metric
            return None
        except Exception as exc:
            logger.debug("Engine metrics unavailable for loop %s: %s", loop_id, exc)
            return None

    # ------------------------------------------------------------------
    # Helpers - lookups/serialization/validation
    # ------------------------------------------------------------------

    async def _load_loop(self, loop_id: str) -> Optional[EffectsLoop]:
        result = await self.session.execute(
            select(EffectsLoop).filter(EffectsLoop.loop_id == loop_id)
        )
        return result.scalar_one_or_none()

    async def _load_loop_map(self, loop_ids: Sequence[str]) -> Dict[str, EffectsLoop]:
        normalized = sorted({loop_id for loop_id in loop_ids if loop_id})
        if not normalized:
            return {}
        result = await self.session.execute(
            select(EffectsLoop).filter(EffectsLoop.loop_id.in_(normalized))
        )
        loops = list(result.scalars().all())
        return {loop.loop_id: loop for loop in loops}

    async def _require_chain(self, chain_id: int) -> Chain:
        result = await self.session.execute(select(Chain).filter(Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is None:
            raise ValueError(f"Chain {chain_id} not found")
        return chain

    async def _require_template(self, *, template_id: str, tesira_device_id: Optional[str]) -> TesiraLoopTemplate:
        result = await self.session.execute(
            select(TesiraLoopTemplate).filter(TesiraLoopTemplate.template_id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise ValueError(f"Template '{template_id}' not found")
        if tesira_device_id and template.tesira_device_id != tesira_device_id:
            raise ValueError(
                f"Template '{template_id}' belongs to device '{template.tesira_device_id}', "
                f"not '{tesira_device_id}'"
            )
        return template

    async def _shift_chain_slots(self, *, chain_id: int, start_slot: int) -> None:
        result = await self.session.execute(
            select(EffectsLoopInsertion)
            .filter(
                EffectsLoopInsertion.chain_id == chain_id,
                EffectsLoopInsertion.slot_index >= start_slot,
            )
            .order_by(EffectsLoopInsertion.slot_index.desc(), EffectsLoopInsertion.id.desc())
        )
        rows = list(result.scalars().all())
        for row in rows:
            row.slot_index += 1
            row.updated_at = datetime.now(timezone.utc)

    def _serialize_loop(self, loop: EffectsLoop) -> Dict[str, Any]:
        return {
            "loop_id": loop.loop_id,
            "name": loop.name,
            "channels": loop.channels,
            "topology": loop.topology,
            "tesira_device_id": loop.tesira_device_id,
            "template_id": loop.template_id,
            "send_endpoint_id": loop.send_endpoint_id,
            "return_endpoint_id": loop.return_endpoint_id,
            "state_desired": loop.state_desired,
            "state_actual": loop.state_actual,
            "health_status": loop.health_status,
            "health_reason": loop.health_reason,
            "target_added_latency_ms": loop.target_added_latency_ms,
            "measured_added_latency_ms": loop.measured_added_latency_ms,
            "compensation_samples": loop.compensation_samples,
            "calibration_status": loop.calibration_status,
            "created_at": loop.created_at.isoformat() if loop.created_at else None,
            "updated_at": loop.updated_at.isoformat() if loop.updated_at else None,
        }

    def _serialize_loop_for_engine(self, loop: EffectsLoop) -> Dict[str, Any]:
        return {
            "loop_id": loop.loop_id,
            "name": loop.name,
            "channels": int(loop.channels),
            "topology": loop.topology,
            "send_endpoint_id": loop.send_endpoint_id or "",
            "return_endpoint_id": loop.return_endpoint_id or "",
            "target_added_latency_ms": float(loop.target_added_latency_ms or 0.5),
            "measured_added_latency_ms": float(loop.measured_added_latency_ms or 0.0),
            "compensation_samples": int(loop.compensation_samples or 0),
            "bypass": loop.state_actual == "bypassed",
        }

    def _serialize_insertion(self, insertion: EffectsLoopInsertion) -> Dict[str, Any]:
        return {
            "insertion_id": insertion.insertion_id,
            "chain_id": insertion.chain_id,
            "loop_id": insertion.loop_id,
            "slot_index": insertion.slot_index,
            "enabled": insertion.enabled,
            "mode": insertion.mode,
            "blend_pct": insertion.blend_pct,
            "send_gain_db": insertion.send_gain_db,
            "return_gain_db": insertion.return_gain_db,
            "crossfade_ms": insertion.crossfade_ms,
            "band_split_hz": insertion.band_split_hz or [],
            "created_at": insertion.created_at.isoformat() if insertion.created_at else None,
            "updated_at": insertion.updated_at.isoformat() if insertion.updated_at else None,
        }

    def _serialize_insertion_for_engine(self, insertion: EffectsLoopInsertion) -> Dict[str, Any]:
        return {
            "insertion_id": insertion.insertion_id,
            "loop_id": insertion.loop_id,
            "slot_index": int(insertion.slot_index),
            "enabled": bool(insertion.enabled),
            "mode": insertion.mode,
            "blend_pct": float(insertion.blend_pct),
            "send_gain_db": float(insertion.send_gain_db),
            "return_gain_db": float(insertion.return_gain_db),
            "crossfade_ms": int(insertion.crossfade_ms),
            "band_split_hz": insertion.band_split_hz or [],
        }

    def _serialize_template(self, template: TesiraLoopTemplate) -> Dict[str, Any]:
        return {
            "template_id": template.template_id,
            "tesira_device_id": template.tesira_device_id,
            "stream_in_tags": list(template.stream_in_tags or []),
            "stream_out_tags": list(template.stream_out_tags or []),
            "crosspoint_tags": list(template.crosspoint_tags or []),
            "input_router_tag": template.input_router_tag,
            "output_router_tag": template.output_router_tag,
            "meter_tags": list(template.meter_tags or []),
            "bypass_tags": list(template.bypass_tags or []),
            "channel_map_policy": template.channel_map_policy,
            "validation_status": template.validation_status,
            "validation_error": template.validation_error,
            "created_at": template.created_at.isoformat() if template.created_at else None,
            "updated_at": template.updated_at.isoformat() if template.updated_at else None,
        }

    async def _serialize_template_with_runtime(self, template: TesiraLoopTemplate) -> Dict[str, Any]:
        payload = self._serialize_template(template)
        payload["runtime_status"] = await self._build_template_runtime_status(template)
        return payload

    async def _build_template_runtime_status(self, template: TesiraLoopTemplate) -> Dict[str, Any]:
        alarms: List[Dict[str, Any]] = []
        checked_at = datetime.now(timezone.utc).isoformat() + "Z"

        validation_status = str(template.validation_status or "unknown")
        if validation_status != "valid":
            alarms.append(
                {
                    "code": "template_validation",
                    "severity": "error",
                    "message": str(template.validation_error or "Template validation failed"),
                }
            )

        device_id = self._coerce_optional_text(template.tesira_device_id)
        if device_id is None:
            alarms.append(
                {
                    "code": "missing_device",
                    "severity": "error",
                    "message": "tesira_device_id is required for runtime validation",
                }
            )
            return self._summarize_runtime_status(alarms=alarms, checked_at=checked_at, status="error")

        fleet = self._get_tesira_fleet()
        if fleet is None:
            alarms.append(
                {
                    "code": "fleet_unavailable",
                    "severity": "warning",
                    "message": "Tesira fleet unavailable; runtime drift checks skipped",
                }
            )
            return self._summarize_runtime_status(alarms=alarms, checked_at=checked_at, status="unknown")

        get_device = getattr(fleet, "get_device", None)
        device = get_device(device_id) if callable(get_device) else None
        if device is None:
            alarms.append(
                {
                    "code": "device_missing",
                    "severity": "error",
                    "message": f"Tesira device '{device_id}' is not registered in fleet",
                }
            )
            return self._summarize_runtime_status(alarms=alarms, checked_at=checked_at, status="error")

        if not bool(getattr(device, "connected", False)):
            alarms.append(
                {
                    "code": "device_disconnected",
                    "severity": "error",
                    "message": f"Tesira device '{device_id}' is disconnected",
                }
            )
            return self._summarize_runtime_status(alarms=alarms, checked_at=checked_at, status="error")

        probe_results = await self._probe_template_runtime_tags(template, device)
        alarms.extend(probe_results["alarms"])
        status = self._runtime_status_from_alarms(alarms)
        summary = self._summarize_runtime_status(
            alarms=alarms,
            checked_at=checked_at,
            status=status,
        )
        summary["probed_tag_count"] = probe_results["probed_tag_count"]
        summary["failed_tag_count"] = probe_results["failed_tag_count"]
        return summary

    async def _probe_template_runtime_tags(self, template: TesiraLoopTemplate, device: Any) -> Dict[str, Any]:
        alarms: List[Dict[str, Any]] = []
        probed = 0
        failed = 0

        def unique_tags(values: Sequence[str]) -> List[str]:
            ordered: Dict[str, None] = {}
            for raw in values:
                text = str(raw or "").strip()
                if text:
                    ordered[text] = None
            return list(ordered.keys())

        checks: List[Tuple[str, str, List[Tuple[str, Tuple[Any, ...]]]]] = []
        checks.extend(
            ("stream_in", tag, [("numChannels", tuple())])
            for tag in unique_tags(template.stream_in_tags or [])
        )
        checks.extend(
            ("stream_out", tag, [("numChannels", tuple())])
            for tag in unique_tags(template.stream_out_tags or [])
        )
        checks.extend(
            (
                "crosspoint",
                tag,
                [("crosspointLevelOut", (1, 1)), ("crosspointLevelOut", (0, 0))],
            )
            for tag in unique_tags(template.crosspoint_tags or [])
        )
        checks.extend(
            (
                "input_router",
                template.input_router_tag,
                [("crosspointLevelOut", (1, 1)), ("crosspointLevelOut", (0, 0))],
            )
            for _ in ([template.input_router_tag] if template.input_router_tag else [])
        )
        checks.extend(
            (
                "output_router",
                template.output_router_tag,
                [("crosspointLevelOut", (1, 1)), ("crosspointLevelOut", (0, 0))],
            )
            for _ in ([template.output_router_tag] if template.output_router_tag else [])
        )
        checks.extend(
            ("meter", tag, [("level", (1,)), ("level", (0,))])
            for tag in unique_tags(template.meter_tags or [])
        )
        checks.extend(
            ("bypass", tag, [("bypass", tuple())])
            for tag in unique_tags(template.bypass_tags or [])
        )

        for tag_type, raw_tag, probes in checks:
            tag = str(raw_tag or "").strip()
            if not tag:
                continue
            probed += 1
            ok, detail = await self._probe_tesira_tag(device, tag, probes)
            if ok:
                continue
            failed += 1
            alarms.append(
                {
                    "code": "tag_probe_failed",
                    "severity": "error",
                    "message": f"Unable to validate {tag_type} tag '{tag}'",
                    "tag": tag,
                    "tag_type": tag_type,
                    "detail": detail,
                }
            )

        return {
            "alarms": alarms,
            "probed_tag_count": probed,
            "failed_tag_count": failed,
        }

    async def _probe_tesira_tag(
        self,
        device: Any,
        instance_tag: str,
        probes: Sequence[Tuple[str, Tuple[Any, ...]]],
    ) -> Tuple[bool, str]:
        client = getattr(device, "_client", None)
        send_fn = getattr(client, "send", None)
        if not callable(send_fn):
            return False, "tesira_client_unavailable"

        errors: List[str] = []
        for attribute, args in probes:
            try:
                response = await send_fn(instance_tag, "get", attribute, *args)
                if bool(getattr(response, "ok", False)):
                    return True, "ok"
                code = str(getattr(response, "error_code", "ERROR") or "ERROR")
                detail = str(getattr(response, "error_detail", "") or "")
                if detail:
                    errors.append(f"{attribute}: {code} ({detail})")
                else:
                    errors.append(f"{attribute}: {code}")
            except Exception as exc:
                errors.append(f"{attribute}: {exc}")

        return False, "; ".join(errors[:4]) if errors else "probe_failed"

    @staticmethod
    def _runtime_status_from_alarms(alarms: Sequence[Dict[str, Any]]) -> str:
        severities = {str(alarm.get("severity", "")).lower() for alarm in alarms}
        if "error" in severities:
            return "error"
        if "warning" in severities:
            return "warning"
        return "ok"

    @staticmethod
    def _summarize_runtime_status(
        *,
        alarms: Sequence[Dict[str, Any]],
        checked_at: str,
        status: str,
    ) -> Dict[str, Any]:
        return {
            "drift_status": status,
            "alarm_count": len(alarms),
            "alarms": list(alarms),
            "checked_at": checked_at,
        }

    async def _publish_loop_state(self, loop: EffectsLoop, *, event: str) -> None:
        await event_publisher.publish(
            "effects_loop_state",
            EventType.EFFECTS_LOOP_STATE,
            {
                "event": event,
                "loop": self._serialize_loop(loop),
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        )

    async def _publish_loop_metrics(self, loop: EffectsLoop) -> None:
        await event_publisher.publish(
            "effects_loop_metrics",
            EventType.EFFECTS_LOOP_METRICS,
            {
                "loop_id": loop.loop_id,
                "target_added_latency_ms": loop.target_added_latency_ms,
                "measured_added_latency_ms": loop.measured_added_latency_ms,
                "compensation_samples": loop.compensation_samples,
                "health_status": loop.health_status,
                "health_reason": loop.health_reason,
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            },
        )

    @staticmethod
    def _validate_template_fields(template: TesiraLoopTemplate) -> Tuple[bool, str]:
        stream_in_tags = list(template.stream_in_tags or [])
        stream_out_tags = list(template.stream_out_tags or [])
        if not stream_in_tags:
            return False, "stream_in_tags must contain at least one tag"
        if not stream_out_tags:
            return False, "stream_out_tags must contain at least one tag"

        if len(set(stream_in_tags)) != len(stream_in_tags):
            return False, "stream_in_tags contains duplicate tags"
        if len(set(stream_out_tags)) != len(stream_out_tags):
            return False, "stream_out_tags contains duplicate tags"

        if not template.channel_map_policy:
            return False, "channel_map_policy is required"

        return True, "ok"

    @staticmethod
    def _validate_loop_channels(channels: int) -> None:
        if channels < 1 or channels > 8:
            raise ValueError("channels must be within 1..8")

    @staticmethod
    def _validate_loop_topology(topology: str) -> None:
        if topology not in ALLOWED_LOOP_TOPOLOGIES:
            raise ValueError(f"topology must be one of: {sorted(ALLOWED_LOOP_TOPOLOGIES)}")

    @staticmethod
    def _validate_insertion_mode(mode: str) -> None:
        if mode not in ALLOWED_INSERTION_MODES:
            raise ValueError(f"mode must be one of: {sorted(ALLOWED_INSERTION_MODES)}")

    @staticmethod
    def _normalize_string_list(raw: Any) -> List[str]:
        if raw is None:
            return []
        if isinstance(raw, str):
            value = raw.strip()
            return [value] if value else []
        if isinstance(raw, (list, tuple, set)):
            out: List[str] = []
            for item in raw:
                text = str(item or "").strip()
                if text:
                    out.append(text)
            return out
        raise ValueError("Expected string or list of strings")

    @staticmethod
    def _normalize_band_split(raw: Any) -> List[float]:
        if raw is None:
            return []
        if isinstance(raw, (int, float)):
            value = float(raw)
            return [value] if value > 0 else []
        if isinstance(raw, (list, tuple, set)):
            out: List[float] = []
            for item in raw:
                try:
                    value = float(item)
                except Exception:
                    continue
                if value > 0:
                    out.append(value)
            return out
        return []

    @staticmethod
    def _coerce_optional_text(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None

    @staticmethod
    def _coerce_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except Exception:
            return int(default)

    @staticmethod
    def _coerce_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    @staticmethod
    def _coerce_optional_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None

    @staticmethod
    def _new_loop_id() -> str:
        return f"loop_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _new_insertion_id() -> str:
        return f"lin_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _new_calibration_id() -> str:
        return f"cal_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _first_metric(payload: Any) -> Optional[Dict[str, Any]]:
        if isinstance(payload, dict):
            return payload
        if isinstance(payload, list) and payload:
            first = payload[0]
            if isinstance(first, dict):
                return first
        return None

    def _get_engine_service(self) -> Any:
        if self._engine_service is not None:
            return self._engine_service
        try:
            from app.services.juce_engine_service import get_audio_engine

            self._engine_service = get_audio_engine()
        except Exception:
            self._engine_service = None
        return self._engine_service

    def _get_avb_router(self) -> Any:
        if self._avb_router is not None:
            return self._avb_router
        try:
            from app.services.avb.avb_router import get_avb_router

            self._avb_router = get_avb_router()
        except Exception:
            self._avb_router = None
        return self._avb_router

    def _get_tesira_fleet(self) -> Any:
        if self._tesira_fleet is not None:
            return self._tesira_fleet
        try:
            from app.services.tesira import get_tesira_fleet

            self._tesira_fleet = get_tesira_fleet()
        except Exception:
            self._tesira_fleet = None
        return self._tesira_fleet
