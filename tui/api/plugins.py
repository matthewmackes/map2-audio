"""Plugin inventory domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class PluginsAPI(DomainClient):
    async def list_plugins(self) -> APIResult:
        return await self.transport.get("/api/engine/plugins")

    async def discover_plugins(self, refresh: bool = False) -> APIResult:
        endpoint = "/api/plugins/discover"
        if refresh:
            endpoint = f"{endpoint}?refresh=true"
        return await self.transport.get(endpoint)

    async def refresh_plugins(self) -> APIResult:
        return await self.transport.post("/api/plugins/refresh")
