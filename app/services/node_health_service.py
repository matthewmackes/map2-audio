"""
Local and remote node health snapshots for the Node Display Standard.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from dataclasses import dataclass
from typing import Optional

import httpx
import psutil

from app.config import config_get
from app.models.node import NodeHealth, NodeServices
from app.utils.latency_pressure import (
    LatencyPressureInputs,
    compute_latency_pressure,
)
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RemoteNodeHealthTarget:
    node_id: str
    host: str


class NodeHealthService(Singleton):
    REMOTE_TIMEOUT_S = 2.0

    async def get_local_health(self) -> NodeHealth:
        audio_service = self._get_audio_service()
        services = NodeServices(
            backend=True,
            juce_engine=bool(audio_service.is_audio_running()) if audio_service else False,
            pipewire=await self._check_pipewire_running(),
        )

        cpu_percent = float(psutil.cpu_percent(interval=None))
        memory_percent = float(psutil.virtual_memory().percent)
        xrun_count = await self._get_local_xrun_count(audio_service)
        audio_latency_ms = self._get_audio_latency_ms(audio_service)

        latency_pressure = compute_latency_pressure(
            self._collect_latency_pressure_inputs(
                audio_service=audio_service,
                services=services,
                xrun_count=xrun_count,
                audio_latency_ms=audio_latency_ms,
            )
        )

        return NodeHealth(
            status=self._derive_status(
                services=services,
                cpu_percent=cpu_percent,
                xrun_count=xrun_count,
            ),
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            xrun_count=xrun_count,
            audio_latency_ms=audio_latency_ms,
            services=services,
            latency_pressure_score=latency_pressure.score,
            latency_pressure_percent=latency_pressure.pressure_percent,
            latency_pressure_status=latency_pressure.status,
        )

    def _collect_latency_pressure_inputs(
        self,
        *,
        audio_service,
        services: NodeServices,
        xrun_count: int,
        audio_latency_ms: float,
    ) -> LatencyPressureInputs:
        running: Optional[bool] = bool(services.juce_engine and services.pipewire)

        # Jitter / RTL stats (rolling 60s window, populated by the audio callback).
        jitter_p95: Optional[float] = None
        rtl_p95: Optional[float] = None
        try:
            from app.services.timing_jitter_collector import get_timing_jitter_collector

            stats = get_timing_jitter_collector().get_stats()
            jitter_value = float(stats.get("p95_ms", 0.0) or 0.0)
            rtl_value = float(stats.get("rtl_p95_ms", 0.0) or 0.0)
            jitter_p95 = jitter_value if jitter_value > 0.0 else None
            rtl_p95 = rtl_value if rtl_value > 0.0 else None
            sample_count = int(stats.get("sample_count", 0) or 0)
            if sample_count > 0:
                running = bool(stats.get("running", False))
        except Exception as exc:
            logger.debug("Latency pressure: jitter collector lookup failed: %s", exc)

        # CPU callback metrics (budget, current, headroom).
        callback_budget_ms: Optional[float] = None
        current_callback_ms: Optional[float] = None
        headroom_percent: Optional[float] = None
        if audio_service is not None:
            try:
                if hasattr(audio_service, "get_cpu_metrics"):
                    metrics = audio_service.get_cpu_metrics()
                    if asyncio.iscoroutine(metrics):
                        metrics = None  # avoid blocking; sync path only here
                else:
                    metrics = None
                if isinstance(metrics, dict):
                    budget = float(metrics.get("budget_ms", 0.0) or 0.0)
                    current = float(metrics.get("current_callback_ms", 0.0) or 0.0)
                    headroom = float(metrics.get("headroom_percent", 0.0) or 0.0)
                    callback_budget_ms = budget if budget > 0.0 else None
                    current_callback_ms = current if current > 0.0 else None
                    headroom_percent = headroom if headroom > 0.0 else None
            except Exception as exc:
                logger.debug("Latency pressure: CPU metrics lookup failed: %s", exc)

        # Total latency: prefer audio_latency_ms (buffer/sample-rate derived).
        total_latency_ms = audio_latency_ms if audio_latency_ms > 0.0 else None

        return LatencyPressureInputs(
            running=running,
            total_latency_ms=total_latency_ms,
            rtl_p95_ms=rtl_p95,
            jitter_p95_ms=jitter_p95,
            xrun_count=xrun_count,
            callback_budget_ms=callback_budget_ms,
            current_callback_ms=current_callback_ms,
            headroom_percent=headroom_percent,
        )

    async def get_remote_health(self, host: str) -> NodeHealth:
        normalized_host = str(host or "").strip()
        if not normalized_host:
            return self._offline_health()

        try:
            async with httpx.AsyncClient(timeout=self.REMOTE_TIMEOUT_S) as client:
                response = await client.get(f"http://{normalized_host}:8080/api/node/health")
                response.raise_for_status()
            return NodeHealth.model_validate(response.json())
        except Exception as exc:
            logger.debug("Remote node health lookup failed for %s: %s", normalized_host, exc)
            return self._offline_health()

    def _get_audio_service(self):
        try:
            from app.services.juce_engine_service import get_audio_engine

            return get_audio_engine()
        except Exception as exc:
            logger.debug("JUCE engine lookup failed: %s", exc)
            return None

    async def _get_local_xrun_count(self, audio_service) -> int:
        try:
            from app.services.audio_health_monitor import get_audio_health_monitor

            summary = get_audio_health_monitor().get_audio_health_summary()
            total_xruns = int(summary.get("total_xruns", 0) or 0)
            if total_xruns > 0:
                return total_xruns
        except Exception as exc:
            logger.debug("Audio health monitor lookup failed: %s", exc)

        if not audio_service:
            return 0

        try:
            return int(await audio_service.get_xrun_count())
        except Exception as exc:
            logger.debug("JUCE xrun lookup failed: %s", exc)
            return 0

    def _get_audio_latency_ms(self, audio_service) -> float:
        buffer_size = int(config_get("audio.buffer_size", 64) or 64)
        sample_rate = int(config_get("audio.sample_rate", 48000) or 48000)

        if audio_service:
            try:
                info = dict(audio_service.get_system_info() or {})
                buffer_size = int(info.get("buffer_size") or buffer_size)
                sample_rate = int(info.get("sample_rate") or sample_rate)
            except Exception as exc:
                logger.debug("JUCE system info lookup failed: %s", exc)

        return (buffer_size / sample_rate) * 1000.0 if sample_rate > 0 else 0.0

    async def _check_pipewire_running(self) -> bool:
        command = ["pw-cli", "info", "0"]

        def _run() -> bool:
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    check=False,
                    timeout=1,
                    text=True,
                )
                return completed.returncode == 0
            except Exception:
                return False

        return await asyncio.to_thread(_run)

    @staticmethod
    def _derive_status(*, services: NodeServices, cpu_percent: float, xrun_count: int) -> str:
        if not (services.backend and services.juce_engine and services.pipewire):
            return "critical"
        if cpu_percent > 85.0 or xrun_count > 0:
            return "warn"
        return "ok"

    @staticmethod
    def _offline_health() -> NodeHealth:
        return NodeHealth(
            status="offline",
            cpu_percent=0.0,
            memory_percent=0.0,
            xrun_count=0,
            audio_latency_ms=0.0,
            services=NodeServices(backend=False, juce_engine=False, pipewire=False),
        )


def get_node_health_service() -> NodeHealthService:
    return NodeHealthService.get_instance()


def reset_node_health_service() -> None:
    NodeHealthService.reset_instance()
