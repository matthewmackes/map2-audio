"""Cluster-wide plugin inventory aggregation."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import httpx

from app.utils.singleton import Singleton


@dataclass
class ClusterPlugin:
    uri: str
    name: str
    category: str
    version: str
    installed_on: List[str]
    format: Optional[str] = None


class ClusterPluginInventory(Singleton):
    def __init__(self) -> None:
        self._cache: List[ClusterPlugin] = []
        self._by_node: Dict[str, List[Dict]] = {}
        self._cached_at: float = 0.0
        self._ttl = 300.0  # 5 minutes
        self._lock = asyncio.Lock()
        self._client = httpx.AsyncClient(timeout=8.0)

    async def refresh_from_nodes(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if now - self._cached_at < self._ttl:
                return
            resp = await self._client.get("http://127.0.0.1:8080/api/plugins/summary", params={"node_id": "all"})
            resp.raise_for_status()
            payload = resp.json()
            nodes = payload.get("nodes", {})
            by_node: Dict[str, List[Dict]] = {}
            for node_id, node_resp in nodes.items():
                body = node_resp.get("body", [])
                if isinstance(body, list):
                    by_node[node_id] = body
            catalog = self._merge(by_node)
            self._cache = catalog
            self._by_node = by_node
            self._cached_at = now

    def _merge(self, by_node: Dict[str, List[Dict]]) -> List[ClusterPlugin]:
        merged: Dict[str, ClusterPlugin] = {}
        for node_id, plugins in by_node.items():
            for plugin in plugins:
                uri = plugin.get("uri") or plugin.get("plugin_uri") or ""
                if not uri:
                    continue
                entry = merged.get(uri)
                if entry is None:
                    entry = ClusterPlugin(
                        uri=uri,
                        name=plugin.get("name", uri),
                        category=plugin.get("category", "Unknown"),
                        version=plugin.get("version", "unknown"),
                        installed_on=[],
                        format=plugin.get("format"),
                    )
                    merged[uri] = entry
                entry.installed_on.append(node_id)
        return list(merged.values())

    async def get_cluster_catalog(self) -> List[ClusterPlugin]:
        await self.refresh_from_nodes()
        return self._cache

    async def get_node_plugins(self) -> Dict[str, List[Dict]]:
        await self.refresh_from_nodes()
        return self._by_node

    async def get_common_plugins(self) -> List[ClusterPlugin]:
        await self.refresh_from_nodes()
        node_count = len(self._by_node)
        if node_count == 0:
            return []
        return [p for p in self._cache if len(p.installed_on) == node_count]

    async def get_unique_plugins(self) -> Dict[str, List[ClusterPlugin]]:
        await self.refresh_from_nodes()
        unique: Dict[str, List[ClusterPlugin]] = {}
        for plugin in self._cache:
            if len(plugin.installed_on) == 1:
                node_id = plugin.installed_on[0]
                unique.setdefault(node_id, []).append(plugin)
        return unique

def get_cluster_plugin_inventory() -> ClusterPluginInventory:
    return ClusterPluginInventory.get_instance()
