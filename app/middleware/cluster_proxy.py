"""
Cluster API proxy middleware

Intercepts /api/* requests and optionally forwards them to remote cluster nodes
based on the `node_id` query parameter or `X-MAP2-Node-ID` header.
Fan-out to all nodes is supported via `node_id=all`.
"""

from __future__ import annotations

import asyncio
import time
from typing import Dict, Iterable, List, Optional, Tuple

import httpx
from fastapi import Response
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import config_get
from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.cluster.mdns_discovery_enhanced import (
    EnhancedMDNSDiscovery,
    MDNSNode,
    get_enhanced_mdns_discovery,
)

# Routes that must never be proxied
PROXY_EXCLUDE_PREFIXES: Tuple[str, ...] = (
    "/api/cluster",
    "/api/raft",
    "/api/ws",
    "/api/websocket",
    "/ws",
)


def _strip_node_param(params: Iterable[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """Return query params without node_id."""
    return [(k, v) for (k, v) in params if k != "node_id"]


class _NodeClient:
    """Small helper that owns an httpx client per node."""

    def __init__(self, node_id: str, base_url: str, timeout_s: float, max_connections: int):
        limits = httpx.Limits(max_connections=max_connections, max_keepalive_connections=max_connections)
        self.node_id = node_id
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(limits=limits, timeout=timeout_s, follow_redirects=True)

    async def request(self, method: str, path: str, params: List[Tuple[str, str]], headers: Dict[str, str], body: bytes):
        url = f"{self.base_url}{path}"
        return await self.client.request(method, url, params=params, headers=headers, content=body)

    async def aclose(self):
        await self.client.aclose()


class ClusterProxyMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self.enabled = bool(config_get("cluster.proxy_enabled", True))
        self.timeout_s = float(config_get("cluster.proxy_timeout_ms", 5000)) / 1000.0
        self.max_conn = int(config_get("cluster.proxy_max_connections_per_node", 10))
        self.local_port = int(config_get("backend.port", 8080))
        self.discovery: EnhancedMDNSDiscovery = get_enhanced_mdns_discovery()
        self.local_node_id: str = get_enhanced_node_identity().get_node_id()
        self.clients: Dict[str, _NodeClient] = {}
        self.metrics: Dict[str, Dict[str, float]] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if not self.enabled or scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "") or ""
        if not path.startswith("/api") or path.startswith(PROXY_EXCLUDE_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Reject websocket upgrades here; handled separately in T105-sub03
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        if headers.get("upgrade", "").lower() == "websocket":
            response = Response(content="WebSocket proxying not supported here", status_code=400)
            await response(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        node_id = request.query_params.get("node_id") or request.headers.get("X-MAP2-Node-ID")
        if not node_id or node_id == self.local_node_id:
            await self.app(scope, receive, send)
            return

        if request.headers.get("x-map2-proxy-origin"):
            response = Response(content="Proxy loop detected", status_code=400)
            await response(scope, receive, send)
            return

        # Cache body for potential fan-out reuse
        body = await request.body()
        clean_params = _strip_node_param(request.query_params.multi_items())

        try:
            if node_id == "all":
                response = await self._fanout(request, clean_params, body)
            else:
                response = await self._proxy_single(node_id, request, clean_params, body)
        except httpx.TimeoutException as exc:
            response = Response(
                content=f"Timeout contacting node {node_id}: {exc}",
                status_code=504,
            )
        except httpx.HTTPError as exc:
            response = Response(
                content=f"Proxy error contacting node {node_id}: {exc}",
                status_code=502,
            )

        await response(scope, receive, send)

    async def _proxy_single(self, node_id: str, request: Request, params: List[Tuple[str, str]], body: bytes) -> Response:
        node = self._resolve_node(node_id)
        if node is None:
            return Response(content=f"Node {node_id} not found or offline", status_code=404)

        client = await self._get_client(node)
        headers = dict(request.headers)
        headers["X-MAP2-Proxy-Origin"] = self.local_node_id

        started = time.perf_counter()
        try:
            resp = await client.request(request.method, request.url.path, params, headers, body)
        except httpx.HTTPError:
            elapsed_ms = (time.perf_counter() - started) * 1000
            self._record_metric(node.node_id, success=False, latency_ms=elapsed_ms)
            raise
        elapsed_ms = (time.perf_counter() - started) * 1000
        self._record_metric(node.node_id, success=resp.is_success, latency_ms=elapsed_ms)

        proxy_headers = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-length", "transfer-encoding", "connection")}
        proxy_headers["X-MAP2-Proxy-Source"] = node.node_id
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=proxy_headers,
            media_type=resp.headers.get("content-type"),
        )

    async def _proxy_local(self, request: Request, params: List[Tuple[str, str]], body: bytes) -> Response:
        client = self.clients.get(self.local_node_id)
        if client is None:
            client = _NodeClient(
                self.local_node_id,
                f"http://127.0.0.1:{self.local_port}",
                self.timeout_s,
                self.max_conn,
            )
            self.clients[self.local_node_id] = client

        headers = dict(request.headers)
        headers["X-MAP2-Proxy-Origin"] = self.local_node_id

        started = time.perf_counter()
        try:
            resp = await client.request(request.method, request.url.path, params, headers, body)
        except httpx.HTTPError:
            elapsed_ms = (time.perf_counter() - started) * 1000
            self._record_metric(self.local_node_id, success=False, latency_ms=elapsed_ms)
            raise
        elapsed_ms = (time.perf_counter() - started) * 1000
        self._record_metric(self.local_node_id, success=resp.is_success, latency_ms=elapsed_ms)

        proxy_headers = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-length", "transfer-encoding", "connection")}
        proxy_headers["X-MAP2-Proxy-Source"] = self.local_node_id
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=proxy_headers,
            media_type=resp.headers.get("content-type"),
        )

    async def _fanout(self, request: Request, params: List[Tuple[str, str]], body: bytes) -> Response:
        nodes = self.discovery.get_discovered_nodes(online_only=True)
        tasks = [self._proxy_local(request, params, body)]
        node_ids = [self.local_node_id]
        for node in nodes:
            if node.node_id == self.local_node_id:
                continue
            tasks.append(self._proxy_single(node.node_id, request, params, body))
            node_ids.append(node.node_id)

        results = await asyncio.gather(*tasks, return_exceptions=True)
        payload = {"nodes": {}}
        status_code = 200
        for node_id, result in zip(node_ids, results):
            if isinstance(result, Response):
                body_value: object
                try:
                    # attempt to decode JSON body if possible
                    import json

                    body_value = json.loads(result.body.decode() or "null")
                except Exception:
                    body_value = result.body.decode(errors="ignore")
                payload["nodes"][node_id] = {
                    "status_code": result.status_code,
                    "body": body_value,
                }
            else:
                payload["nodes"][node_id] = {
                    "status_code": 502,
                    "body": str(result),
                }
                status_code = 207
        return Response(content=self._json_dump(payload), media_type="application/json", status_code=status_code)

    def _resolve_node(self, node_id: str) -> Optional[MDNSNode]:
        node = self.discovery.get_discovered_node(node_id)
        if node and node.is_online(self.discovery.cache_timeout):
            return node
        # fallback to any cached node match
        return next((n for n in self.discovery.get_discovered_nodes(online_only=True) if n.node_id == node_id), None)

    async def _get_client(self, node: MDNSNode) -> _NodeClient:
        if node.node_id in self.clients:
            return self.clients[node.node_id]
        base_url = f"http://{(node.addresses[0] if node.addresses else '127.0.0.1')}:{node.port}"
        client = _NodeClient(node.node_id, base_url, self.timeout_s, self.max_conn)
        self.clients[node.node_id] = client
        return client

    def _record_metric(self, node_id: str, success: bool, latency_ms: float):
        metrics = self.metrics.setdefault(node_id, {"count": 0, "errors": 0, "p50_ms": latency_ms})
        metrics["count"] += 1
        if not success:
            metrics["errors"] += 1
        metrics["p50_ms"] = (metrics["p50_ms"] + latency_ms) / 2.0

    @staticmethod
    def _json_dump(payload: object) -> str:
        import json

        return json.dumps(payload, default=str)
