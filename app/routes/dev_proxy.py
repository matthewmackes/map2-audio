"""Development proxy route used by API Observatory request builder."""

from __future__ import annotations

import json
import os
from time import perf_counter
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import config_get
from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery


router = APIRouter(prefix="/api/dev/proxy", tags=["API Observatory"])

HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


class ProxyRequest(BaseModel):
    method: str = Field(default="GET")
    url: str = Field(..., min_length=1)
    headers: Dict[str, str] = Field(default_factory=dict)
    body: Optional[Any] = None
    timeout_ms: int = Field(default=30000, ge=1000, le=120000)
    node_id: Optional[str] = None


class ProxyTiming(BaseModel):
    dns_ms: Optional[float] = None
    connect_ms: Optional[float] = None
    tls_ms: Optional[float] = None
    ttfb_ms: Optional[float] = None
    download_ms: Optional[float] = None
    total_ms: float


class ProxyNodeResult(BaseModel):
    node_id: str
    status: int
    timing: ProxyTiming
    headers: Dict[str, str]
    body: Any
    size_bytes: int


class ProxyResponse(BaseModel):
    status: int
    timing: ProxyTiming
    headers: Dict[str, str]
    body: Any
    size_bytes: int
    content_type: Optional[str] = None
    nodes: Optional[list[ProxyNodeResult]] = None


def _proxy_enabled() -> bool:
    if os.getenv("MAP2_TEST_MODE", "").lower() in {"1", "true", "yes", "on"}:
        return True
    if os.getenv("MAP2_DEV_PROXY", "").lower() in {"1", "true", "yes", "on"}:
        return True
    return bool(config_get("app.debug", False))


def _normalize_method(method: str) -> str:
    candidate = method.upper().strip()
    if candidate not in HTTP_METHODS:
        raise HTTPException(status_code=422, detail=f"Unsupported method: {method}")
    return candidate


def _normalize_headers(headers: Dict[str, str]) -> Dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in {"host", "content-length"}
    }


def _format_body(raw_body: bytes, content_type: str) -> Any:
    if not raw_body:
        return None

    if "application/json" in content_type:
        try:
            return json.loads(raw_body.decode("utf-8"))
        except Exception:
            return raw_body.decode("utf-8", errors="replace")

    if "text/" in content_type or "xml" in content_type or "html" in content_type:
        return raw_body.decode("utf-8", errors="replace")

    # Binary payload fallback encoded as latin-1 compatible text.
    return raw_body.decode("latin-1", errors="replace")


def _resolve_peer_url(node_id: str) -> Optional[str]:
    discovery = get_enhanced_mdns_discovery()
    node = discovery.get_discovered_node(node_id)
    if node is None:
        for candidate in discovery.get_discovered_nodes(online_only=True):
            if candidate.node_id == node_id:
                node = candidate
                break
    if node is None or not node.addresses:
        return None
    return f"http://{node.addresses[0]}:{node.port or 8080}"


def _coerce_request_body(body: Any) -> tuple[Optional[bytes], Optional[str]]:
    if body is None:
        return None, None
    if isinstance(body, (dict, list)):
        return json.dumps(body).encode("utf-8"), "application/json"
    if isinstance(body, str):
        return body.encode("utf-8"), "text/plain"
    if isinstance(body, bytes):
        return body, None
    return json.dumps(body, default=str).encode("utf-8"), "application/json"


async def _execute_request(
    client: httpx.AsyncClient,
    *,
    method: str,
    target_url: str,
    headers: Dict[str, str],
    content: Optional[bytes],
) -> ProxyResponse:
    started = perf_counter()
    first_byte_ms: Optional[float] = None
    body_chunks: list[bytes] = []

    async with client.stream(method, target_url, headers=headers, content=content) as response:
        response_headers = dict(response.headers)
        content_type = response_headers.get("content-type", "")
        async for chunk in response.aiter_bytes():
            if first_byte_ms is None:
                first_byte_ms = (perf_counter() - started) * 1000.0
            body_chunks.append(chunk)

        raw_body = b"".join(body_chunks)
        total_ms = (perf_counter() - started) * 1000.0
        ttfb_ms = first_byte_ms if first_byte_ms is not None else total_ms
        download_ms = max(total_ms - ttfb_ms, 0.0)

        return ProxyResponse(
            status=response.status_code,
            headers=response_headers,
            body=_format_body(raw_body, content_type),
            size_bytes=len(raw_body),
            content_type=content_type,
            timing=ProxyTiming(
                dns_ms=None,
                connect_ms=None,
                tls_ms=None,
                ttfb_ms=round(ttfb_ms, 3),
                download_ms=round(download_ms, 3),
                total_ms=round(total_ms, 3),
            ),
        )


async def _proxy_single_target(
    request: Request,
    payload: ProxyRequest,
    *,
    node_id: Optional[str],
) -> ProxyResponse:
    method = _normalize_method(payload.method)
    headers = _normalize_headers(payload.headers)

    content, content_type = _coerce_request_body(payload.body)
    if content_type and "content-type" not in {key.lower() for key in headers}:
        headers["content-type"] = content_type

    parsed = urlparse(payload.url)
    raw_url = payload.url

    if node_id and node_id not in {"", "local", "local-node"}:
        peer_base_url = _resolve_peer_url(node_id)
        if peer_base_url is None:
            raise HTTPException(status_code=404, detail=f"Cluster node {node_id} not found")
        if raw_url.startswith("/"):
            raw_url = f"{peer_base_url}{raw_url}"
        else:
            # Keep path/query from url but force selected node host.
            overridden = urlparse(raw_url)
            query = f"?{overridden.query}" if overridden.query else ""
            raw_url = f"{peer_base_url}{overridden.path or '/'}{query}"

    is_relative_path = raw_url.startswith("/")
    is_local_host = parsed.hostname in {None, "localhost", "127.0.0.1"}
    is_local_port = parsed.port in {None, 80, 8080}

    timeout_s = payload.timeout_ms / 1000.0

    if is_relative_path or (is_local_host and is_local_port):
        path = raw_url if is_relative_path else f"{parsed.path or '/'}"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        if path.startswith("/api/dev/proxy"):
            raise HTTPException(status_code=400, detail="Nested calls to /api/dev/proxy are not allowed")
        transport = httpx.ASGITransport(app=request.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8080",
            timeout=timeout_s,
            follow_redirects=True,
        ) as client:
            return await _execute_request(
                client,
                method=method,
                target_url=path,
                headers=headers,
                content=content,
            )

    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
        return await _execute_request(
            client,
            method=method,
            target_url=raw_url,
            headers=headers,
            content=content,
        )


@router.post("")
async def proxy_request(request: Request, payload: ProxyRequest) -> ProxyResponse:
    if not _proxy_enabled():
        raise HTTPException(
            status_code=403,
            detail="Developer proxy is disabled. Set MAP2_DEV_PROXY=1 (or app.debug=true) to enable.",
        )

    target_node = payload.node_id.strip() if isinstance(payload.node_id, str) else None

    if target_node == "all":
        discovery = get_enhanced_mdns_discovery()
        node_ids = ["local-node"]
        for node in discovery.get_discovered_nodes(online_only=True):
            if node.node_id not in node_ids:
                node_ids.append(node.node_id)

        results: list[ProxyNodeResult] = []
        for node_id in node_ids:
            try:
                response = await _proxy_single_target(
                    request,
                    payload,
                    node_id=(None if node_id == "local-node" else node_id),
                )
                results.append(
                    ProxyNodeResult(
                        node_id=node_id,
                        status=response.status,
                        timing=response.timing,
                        headers=response.headers,
                        body=response.body,
                        size_bytes=response.size_bytes,
                    )
                )
            except HTTPException as exc:
                results.append(
                    ProxyNodeResult(
                        node_id=node_id,
                        status=exc.status_code,
                        timing=ProxyTiming(total_ms=0.0),
                        headers={},
                        body={"detail": exc.detail},
                        size_bytes=0,
                    )
                )

        return ProxyResponse(
            status=207,
            timing=ProxyTiming(total_ms=0.0),
            headers={},
            body={"broadcast": True},
            size_bytes=0,
            nodes=results,
        )

    return await _proxy_single_target(request, payload, node_id=target_node)
