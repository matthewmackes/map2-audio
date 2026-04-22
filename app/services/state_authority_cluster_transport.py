"""HTTP transport for the State Authority Layer 2 cluster reconciler.

`state_authority_cluster_reconciler.py` is pure composition — it takes
producer callbacks and tier handlers but ships no transport of its own.
This module provides the concrete HTTP-backed producers and handlers that
compose a fully-wired `ClusterReconciler` on a management node:

- **Peer enumeration** via `get_visible_remote_nodes()` from the cluster
  node-visibility service.
- **Observed-state fetch** via the existing `/api/node/{id}/proxy/...`
  routes using httpx against the local backend (the proxy middleware
  forwards to the remote node).
- **Correction handlers** (push_params, trigger_reactivation,
  redeploy_asset) that POST to the same proxy endpoints.

The transport is async + httpx-based, honors short timeouts (3s default)
to keep Layer 2 ticks fast, and degrades gracefully — any failure
surfaces as a None/False return so the reconciler classifies the node as
offline or drift without crashing.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Sequence

import httpx

logger = logging.getLogger(__name__)


DEFAULT_HTTP_TIMEOUT_S = 3.0


def local_api_base_url() -> str:
    port = os.getenv("MAP2_API_PORT", "8080")
    return f"http://127.0.0.1:{port}"


async def list_cluster_node_ids() -> Sequence[str]:
    """Enumerate peer node ids visible to this node.

    Falls back to an empty list when the cluster-visibility service is not
    available (single-node deployments, startup races, unit tests).
    """
    try:
        from app.services.cluster.node_visibility import get_visible_remote_nodes
    except Exception:
        return []
    try:
        _, visible_nodes = get_visible_remote_nodes()
    except Exception as exc:
        logger.debug("Cluster node enumeration failed: %s", exc)
        return []
    return tuple(sorted(visible_nodes or {}))


async def fetch_observed_snapshot(
    node_id: str,
    *,
    timeout_s: float = DEFAULT_HTTP_TIMEOUT_S,
) -> dict[str, Any] | None:
    """GET the remote node's live-snapshot state via the proxy.

    Returns None on any transport or status failure (including 404 when no
    live snapshot is active on the remote). The reconciler treats None as
    "node offline" per the plan's tiered-response classification.
    """
    url = f"{local_api_base_url()}/api/node/{node_id}/proxy/api/snapshots/live"
    try:
        async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
            response = await client.get(url)
    except httpx.HTTPError as exc:
        logger.debug("Observed-state fetch for %s failed: %s", node_id, exc)
        return None

    if not response.is_success:
        logger.debug(
            "Observed-state fetch for %s returned %s",
            node_id,
            response.status_code,
        )
        return None

    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


async def push_node_parameters(
    node_id: str,
    desired: dict[str, Any],
    *,
    timeout_s: float = DEFAULT_HTTP_TIMEOUT_S,
) -> bool:
    """Push desired per-plugin parameter map to the remote node.

    Uses the existing /api/node/{id}/proxy/api/snapshots/{sid}/apply
    endpoint (when the remote exposes it). Returns True only on HTTP
    success. Callers receive False for any failure so the reconciler
    status stays `drift`.
    """
    snapshot_id = desired.get("id") or desired.get("snapshot_id")
    if snapshot_id is None:
        return False
    url = (
        f"{local_api_base_url()}/api/node/{node_id}/proxy/"
        f"api/snapshots/{snapshot_id}/apply-parameters"
    )
    try:
        async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
            response = await client.post(url, json={"desired": desired})
    except httpx.HTTPError as exc:
        logger.debug("push_node_parameters %s failed: %s", node_id, exc)
        return False
    return response.is_success


async def trigger_node_reactivation(
    node_id: str,
    snapshot_id: str | None,
    *,
    timeout_s: float = DEFAULT_HTTP_TIMEOUT_S,
) -> bool:
    """Trigger a full snapshot re-activation on the remote node.

    Uses /api/node/{id}/proxy/api/snapshots/{sid}/activate — the same
    endpoint `snapshot_deployment_service` already uses for deployment.
    """
    if snapshot_id is None or not str(snapshot_id).strip():
        return False
    url = (
        f"{local_api_base_url()}/api/node/{node_id}/proxy/"
        f"api/snapshots/{snapshot_id}/activate"
    )
    try:
        async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
            response = await client.post(url)
    except httpx.HTTPError as exc:
        logger.debug("trigger_node_reactivation %s failed: %s", node_id, exc)
        return False
    return response.is_success


async def redeploy_asset_to_node(
    node_id: str,
    asset_ref: str,
    *,
    timeout_s: float = DEFAULT_HTTP_TIMEOUT_S,
) -> bool:
    """Request redeployment of one asset reference to the remote node.

    Asset references that are sha256:-prefixed look up the file in the
    local asset registry and push it; raw path references cannot be
    resolved by content-addressed lookup and are skipped (return False).
    """
    if not isinstance(asset_ref, str) or not asset_ref.strip():
        return False
    if not asset_ref.startswith("sha256:"):
        # Non-content-addressed ref — can't resolve via registry. Caller
        # should escalate (follow-up: trigger a full asset-sync).
        return False
    url = (
        f"{local_api_base_url()}/api/node/{node_id}/proxy/"
        f"api/assets/{asset_ref}/deploy"
    )
    try:
        async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
            response = await client.post(url)
    except httpx.HTTPError as exc:
        logger.debug("redeploy_asset_to_node %s failed: %s", node_id, exc)
        return False
    return response.is_success
