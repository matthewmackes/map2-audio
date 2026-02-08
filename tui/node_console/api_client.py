"""
Async HTTP client for the MAP2 backend API.

Thin wrapper around httpx with:
- Connection pooling & keep-alive
- Automatic timeout (2 s per request)
- Graceful error handling (never raises — returns None on failure)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)


class NodeAPIClient:
    """Lightweight async client for the local MAP2 REST API."""

    def __init__(self, base_url: str = "http://localhost:8080", timeout: float = 2.0):
        self.base_url = base_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    # ── lifecycle ────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                limits=httpx.Limits(
                    max_connections=6,
                    max_keepalive_connections=3,
                    keepalive_expiry=30.0,
                ),
            )

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── generic helpers ──────────────────────────────────────────────────

    async def _get(self, path: str) -> Optional[Dict[str, Any]]:
        try:
            await self.start()
            assert self._client is not None
            resp = await self._client.get(path)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("GET %s failed: %s", path, exc)
            return None

    async def _post(self, path: str, json: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        try:
            await self.start()
            assert self._client is not None
            resp = await self._client.post(path, json=json or {})
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.debug("POST %s failed: %s", path, exc)
            return None

    # ── specific endpoints ───────────────────────────────────────────────

    async def health(self) -> Optional[Dict]:
        return await self._get("/api/health")

    async def version(self) -> Optional[Dict]:
        return await self._get("/api/version")

    async def audio_status(self) -> Optional[Dict]:
        return await self._get("/api/audio/status")

    async def audio_latency(self) -> Optional[Dict]:
        return await self._get("/api/audio/latency")

    async def audio_levels(self) -> Optional[Dict]:
        return await self._get("/api/audio/levels")

    async def pipewire_status(self) -> Optional[Dict]:
        return await self._get("/api/pipewire/status")

    async def pipewire_devices(self) -> Optional[Dict]:
        return await self._get("/api/pipewire/devices")

    async def pipewire_settings(self) -> Optional[Dict]:
        return await self._get("/api/pipewire/settings")

    async def deployment_mode(self) -> Optional[Dict]:
        return await self._get("/api/deployment/mode")

    async def deployment_status(self) -> Optional[Dict]:
        return await self._get("/api/deployment/status")

    async def deployment_health(self) -> Optional[Dict]:
        return await self._get("/api/deployment/health")

    async def cluster_health(self) -> Optional[Dict]:
        return await self._get("/api/cluster/health")

    async def cluster_online_nodes(self) -> Optional[Dict]:
        return await self._get("/api/cluster/online-nodes")

    async def realtime_status(self) -> Optional[Dict]:
        return await self._get("/api/system/realtime-status")

    # ── actions ──────────────────────────────────────────────────────────

    async def set_mode(self, mode: str) -> Optional[Dict]:
        return await self._post("/api/deployment/mode", {"mode": mode})

    async def restart_audio(self) -> Optional[Dict]:
        return await self._post("/api/audio/restart")

    async def restart_pipewire(self) -> Optional[Dict]:
        return await self._post("/api/pipewire/restart")

    async def restart_backend(self) -> Optional[Dict]:
        return await self._post("/api/system/restart-backend")

    async def restart_system(self) -> Optional[Dict]:
        return await self._post("/api/system/restart")
