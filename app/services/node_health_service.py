"""
Local and remote node health snapshots for the Node Display Standard.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import threading
from dataclasses import dataclass
from typing import Optional

import httpx
import psutil

from app.config import config_get
from app.models.node import NodeHealth, NodeServices

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RemoteNodeHealthTarget:
    node_id: str
    host: str


class NodeHealthService:
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


_node_health_service: Optional[NodeHealthService] = None
_node_health_service_lock = threading.Lock()


def get_node_health_service() -> NodeHealthService:
    global _node_health_service
    if _node_health_service is None:
        with _node_health_service_lock:
            if _node_health_service is None:
                _node_health_service = NodeHealthService()
    return _node_health_service
