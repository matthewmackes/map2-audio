"""Cluster and deployment domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class ClusterAPI(DomainClient):
    async def get_cluster_health(self) -> APIResult:
        return await self.transport.get("/api/cluster/health")

    async def get_online_nodes(self) -> APIResult:
        return await self.transport.get("/api/cluster/online-nodes")

    async def get_deployment_mode(self) -> APIResult:
        return await self.transport.get("/api/deployment/mode")

    async def set_deployment_mode(self, mode: str) -> APIResult:
        return await self.transport.post("/api/deployment/mode", json={"mode": mode})

    async def get_deployment_status(self) -> APIResult:
        return await self.transport.get("/api/deployment/status")

    async def get_deployment_health_status(self) -> APIResult:
        return await self.transport.get("/api/deployment/health/status")

    async def get_health_checks(self) -> APIResult:
        return await self.transport.get("/api/deployment/health/checks")

    async def get_readiness_checklist(self) -> APIResult:
        return await self.transport.get("/api/deployment/health/readiness")

    async def run_remediation(self, action: str) -> APIResult:
        return await self.transport.post(f"/api/deployment/remediation/{action}")
