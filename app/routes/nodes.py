"""
Node discovery, health, topology, and proxy routes.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.models.node import NodeHealth, NodeIdentity, NodeTopology
from app.services.node_discovery_service import get_node_discovery_service
from app.services.node_health_service import get_node_health_service

router = APIRouter(prefix="/api/node", tags=["Node"])

_proxy_buckets: dict[str, deque[float]] = defaultdict(deque)
_proxy_lock = threading.Lock()
_PROXY_LIMIT = 60
_PROXY_WINDOW_S = 60.0


class NodeIdentityUpdateRequest(BaseModel):
    display_label: str = Field(default="", max_length=64)


@router.get("/identity", response_model=NodeIdentity, operation_id="get_node_identity")
async def get_node_identity() -> NodeIdentity:
    return await get_node_discovery_service().get_local_identity()


@router.get("/health", response_model=NodeHealth, operation_id="get_node_health")
async def get_node_health() -> NodeHealth:
    return await get_node_health_service().get_local_health()


@router.get("/topology", response_model=NodeTopology, operation_id="get_node_topology")
async def get_node_topology() -> NodeTopology:
    return await get_node_discovery_service().get_topology()


@router.patch("/identity", response_model=NodeIdentity, operation_id="patch_node_identity")
async def patch_node_identity(payload: NodeIdentityUpdateRequest) -> NodeIdentity:
    return await get_node_discovery_service().set_display_label(payload.display_label)


@router.api_route(
    "/{node_id}/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    operation_id="proxy_node_request",
)
async def proxy_node_request(node_id: str, path: str, request: Request):
    retry_after = _check_proxy_rate_limit(node_id)
    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "rate_limited",
                    "message": f"Proxy rate limit exceeded for node {node_id}",
                    "retry_after_seconds": retry_after,
                }
            },
            headers={"Retry-After": str(retry_after)},
        )

    normalized_path = _normalize_proxy_path(path)
    if normalized_path.startswith("/api/node/") and "/proxy/" in normalized_path:
        raise HTTPException(status_code=400, detail="Nested node proxy requests are not allowed")

    discovery_service = get_node_discovery_service()
    target = await discovery_service.resolve_known_node(node_id)
    if target is None:
        return _proxy_error(status_code=404, code="node_not_found", message=f"Unknown node '{node_id}'")

    body = await request.body()
    headers = _forward_headers(request)
    query_params = list(request.query_params.multi_items())

    try:
        if target.is_local:
            proxied = await _forward_local_proxy(
                app=request.app,
                method=request.method,
                path=normalized_path,
                headers=headers,
                query_params=query_params,
                body=body,
            )
        else:
            proxied = await _forward_remote_proxy(
                host=target.host,
                method=request.method,
                path=normalized_path,
                headers=headers,
                query_params=query_params,
                body=body,
            )
    except httpx.TimeoutException:
        return _proxy_error(status_code=504, code="node_unreachable", message=f"Timed out contacting node '{node_id}'")
    except httpx.HTTPError as exc:
        return _proxy_error(status_code=502, code="proxy_failed", message=f"Proxy request failed: {exc}")

    return _response_from_proxy(proxied)


def _normalize_proxy_path(path: str) -> str:
    normalized = str(path or "").strip().lstrip("/")
    if not normalized:
        raise HTTPException(status_code=400, detail="Proxy path cannot be empty")

    parts = [segment for segment in normalized.split("/") if segment]
    if any(segment in {".", ".."} for segment in parts):
        raise HTTPException(status_code=400, detail="Path traversal is not allowed")

    joined = "/".join(parts)
    if joined.startswith("api/"):
        return f"/{joined}"
    return f"/api/{joined}"


def _check_proxy_rate_limit(node_id: str) -> Optional[int]:
    now = time.monotonic()
    normalized_node_id = str(node_id or "").strip().lower()
    with _proxy_lock:
        bucket = _proxy_buckets[normalized_node_id]
        while bucket and (now - bucket[0]) >= _PROXY_WINDOW_S:
            bucket.popleft()
        if len(bucket) >= _PROXY_LIMIT:
            retry_after = max(1, int(_PROXY_WINDOW_S - (now - bucket[0])))
            return retry_after
        bucket.append(now)
    return None


def _forward_headers(request: Request) -> dict[str, str]:
    blocked = {"authorization", "host", "content-length", "connection"}
    return {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in blocked
    }


async def _forward_local_proxy(*, app, method: str, path: str, headers: dict[str, str], query_params, body: bytes):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://map2.local") as client:
        return await client.request(method, path, params=query_params, headers=headers, content=body)


async def _forward_remote_proxy(*, host: str, method: str, path: str, headers: dict[str, str], query_params, body: bytes):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await client.request(method, f"http://{host}:8080{path}", params=query_params, headers=headers, content=body)


def _response_from_proxy(response: httpx.Response) -> Response:
    forwarded_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "transfer-encoding", "connection"}
    }
    return Response(content=response.content, status_code=response.status_code, headers=forwarded_headers)


def _proxy_error(*, status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})
