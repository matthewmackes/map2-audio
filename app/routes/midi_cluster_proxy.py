"""Proxy MIDI Hub API calls to remote cluster nodes."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from app.services.midi_hub.midi_discovery import get_midi_discovery_service


router = APIRouter(prefix="/api/midi/cluster/proxy", tags=["MIDI Cluster"])


async def _resolve_node_base_url(node_id: str) -> str:
    discovery = get_midi_discovery_service()
    node = discovery.discovered_midi_nodes.get(node_id)
    if node is None:
        nodes = discovery.get_discovered_nodes(online_only=True)
        node = next((n for n in nodes if n.node_id == node_id), None)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    if not node.addresses:
        raise HTTPException(status_code=502, detail=f"Node {node_id} has no reachable address")
    address = node.addresses[0]
    scheme = "http"  # cluster peers run HTTP on port 8000/8080
    port = node.port or 8000
    return f"{scheme}://{address}:{port}"


@router.api_route("/nodes/{node_id}/hub/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_midi_hub(request: Request, node_id: str, path: str):
    base_url = await _resolve_node_base_url(node_id)
    target_url = f"{base_url}/api/{path}"

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            proxied_headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
            proxied_headers["X-MAP2-Proxy-Origin"] = node_id
            body = await request.body()
            response = await client.request(
                request.method,
                target_url,
                params=request.query_params,
                headers=proxied_headers,
                content=body,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"Timeout contacting node {node_id}: {exc}")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Proxy error contacting node {node_id}: {exc}")

    response_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "transfer-encoding", "connection", "content-encoding"}
    }
    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=response_headers,
    )
