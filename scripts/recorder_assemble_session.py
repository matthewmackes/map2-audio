#!/usr/bin/env python3
"""T2510-4 — Cluster session-assembly tool.

Walks the cluster peer list (``GET /api/cluster/nodes``), fetches each
peer's recorded takes for a given ``session_id`` (via the per-node
proxy ``/api/node/{node_id}/proxy/api/recordings``), and builds a
single unified session manifest with per-take sample offsets and
proxied WAV references.

The manifest is the assembly hand-off for a cluster-wide synchronized
recording session (phase 6 of the T2504 recorder epic). Each
participating node writes its own local WAV takes; this tool stitches
the per-node registries into one document so a downstream importer can
align them on a shared timeline.

Sample-accurate alignment (``start_sample_offset``) is produced by
T2510-3 (AVB-derived clock alignment), which is not yet shipped. When
a take's sidecar metadata carries no offset, the manifest emits
``start_sample_offset = 0`` with ``offset_source = "absent"`` so an
assembler can fall back to naive head-alignment instead of crashing.
Once T2510-3 lands, the same field is populated with
``offset_source = "avb"``.

Run with:

    python3 scripts/recorder_assemble_session.py --session-id <id>
    python3 scripts/recorder_assemble_session.py --session-id <id> --output manifest.json
    python3 scripts/recorder_assemble_session.py --session-id <id> --node audio-node-2

Network I/O is confined to the thin ``fetch_*`` functions;
``build_session_manifest`` is pure (no I/O, no wall-clock) so it is
trivially unit-testable. The caller injects ``assembled_at`` — the
script's ``main()`` stamps it once at runtime; tests pass a fixed
value.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Optional, Protocol

logger = logging.getLogger("recorder_assemble_session")

DEFAULT_BASE_URL = "http://localhost:8080"
SCHEMA_VERSION = "2026.06-t2510-4"

# Sidecar-metadata keys that may carry the AVB-derived first-sample
# offset (T2510-3). Checked in order; the first present + numeric one
# wins. Multiple spellings are tolerated because the engine-side
# sidecar writer (T2507, deferred) has not yet pinned a single key.
_OFFSET_KEYS = ("start_sample_offset", "sample_offset", "start_sample")


class HttpClient(Protocol):
    """Minimal structural type for the bits of an httpx client we use.

    Declared as a Protocol so tests can hand in a stub without
    importing/instantiating a real ``httpx.Client``.
    """

    def get(self, url: str, **kwargs: Any) -> Any: ...


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def proxied_recordings_url(base_url: str, node_id: str) -> str:
    """URL that lists a peer node's recordings through the local proxy.

    The per-node proxy (``app/routes/nodes.py::proxy_node_request``)
    normalizes the trailing path: a bare ``recordings`` is rewritten to
    ``/api/recordings`` and an explicit ``api/recordings`` is preserved.
    We emit the explicit form for clarity.
    """
    return f"{base_url.rstrip('/')}/api/node/{node_id}/proxy/api/recordings"


def proxied_wav_url(base_url: str, node_id: str, asset_hash: str) -> str:
    """Proxied URL that streams one take's WAV from a peer node.

    Mirrors the registry route ``GET /api/recordings/{hash}/wav``
    (``app/routes/recordings.py``) reached through the per-node proxy.
    This is the ``wav_ref`` recorded on every manifest take — a stable,
    operator-fetchable reference rather than an inlined blob.
    """
    return (
        f"{base_url.rstrip('/')}"
        f"/api/node/{node_id}/proxy/api/recordings/{asset_hash}/wav"
    )


def proxied_metadata_url(base_url: str, node_id: str, asset_hash: str) -> str:
    """Proxied URL for a take's sidecar JSON (``.../metadata``)."""
    return (
        f"{base_url.rstrip('/')}"
        f"/api/node/{node_id}/proxy/api/recordings/{asset_hash}/metadata"
    )


# ---------------------------------------------------------------------------
# Network I/O (thin shells — kept free of business logic)
# ---------------------------------------------------------------------------


def fetch_cluster_nodes(client: HttpClient, base_url: str) -> list[dict[str, Any]]:
    """Return the cluster peer list from ``GET /api/cluster/nodes``.

    Response shape (``cluster_snapshots.py::get_cluster_nodes``):
    ``{"nodes": [ {<cluster_nodes row>}, ... ], "count": N}``. Each
    node row carries ``id`` (the node_id / primary key), ``hostname``,
    ``status``, ``role``, etc. (``ClusterRegistry._normalize_node_row``).
    We return the raw node dicts unchanged.
    """
    resp = client.get(f"{base_url.rstrip('/')}/api/cluster/nodes")
    resp.raise_for_status()
    payload = resp.json()
    nodes = payload.get("nodes", []) if isinstance(payload, dict) else []
    if not isinstance(nodes, list):
        return []
    return [n for n in nodes if isinstance(n, dict)]


def fetch_node_recordings(
    client: HttpClient,
    base_url: str,
    node_id: str,
    session_id: str,
) -> list[dict[str, Any]]:
    """Fetch + filter one peer node's takes for ``session_id``.

    Lists the node's recordings registry through the proxy
    (``GET .../proxy/api/recordings`` →
    ``RecordingListResponse{recordings: [...], count}``), then keeps
    only the takes belonging to ``session_id``.

    The recordings list rows (``RecordingSummary``) do NOT carry
    ``session_id`` — that lives in each take's sidecar metadata. So for
    every candidate row we fetch ``.../metadata`` and match on its
    ``session_id`` field. The sidecar also supplies the sample-rate,
    sample-count, chain/tap identity, and (once T2510-3 ships) the AVB
    ``start_sample_offset``. The fetched metadata is attached under
    ``_metadata`` on each returned row for the pure builder to consume.

    A take whose sidecar is missing/unreadable is skipped (logged at
    WARNING) rather than aborting the whole assembly — one node's
    partial registry must not sink the session manifest.
    """
    resp = client.get(proxied_recordings_url(base_url, node_id))
    resp.raise_for_status()
    payload = resp.json()
    rows = payload.get("recordings", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return []

    takes: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        asset_hash = row.get("asset_hash")
        if not asset_hash:
            continue
        metadata = _fetch_take_metadata(client, base_url, node_id, str(asset_hash))
        if metadata is None:
            continue
        if str(metadata.get("session_id", "")) != str(session_id):
            continue
        enriched = dict(row)
        enriched["_metadata"] = metadata
        takes.append(enriched)
    return takes


def _fetch_take_metadata(
    client: HttpClient,
    base_url: str,
    node_id: str,
    asset_hash: str,
) -> Optional[dict[str, Any]]:
    """Fetch one take's sidecar JSON; ``None`` on any failure."""
    try:
        resp = client.get(proxied_metadata_url(base_url, node_id, asset_hash))
        resp.raise_for_status()
        metadata = resp.json()
    except Exception as exc:  # noqa: BLE001 — per-take resilience
        logger.warning(
            "skipping take %s on node %s: metadata fetch failed: %s",
            asset_hash,
            node_id,
            exc,
        )
        return None
    if not isinstance(metadata, dict):
        logger.warning(
            "skipping take %s on node %s: sidecar JSON is not an object",
            asset_hash,
            node_id,
        )
        return None
    return metadata


# ---------------------------------------------------------------------------
# Pure manifest builder (NO I/O, NO wall-clock — assembled_at injected)
# ---------------------------------------------------------------------------


def _coerce_int(value: Any) -> Optional[int]:
    """Best-effort int coercion; ``None`` when not a clean integer."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _resolve_offset(metadata: dict[str, Any]) -> tuple[int, str]:
    """Resolve (start_sample_offset, offset_source) for one take.

    Returns the AVB-derived offset with ``offset_source="avb"`` when the
    sidecar carries it (T2510-3). Otherwise falls back to ``(0,
    "absent")`` so a downstream assembler can naive-head-align rather
    than fail. This is the explicit graceful-degradation contract for
    the not-yet-shipped clock-alignment field.
    """
    for key in _OFFSET_KEYS:
        if key in metadata:
            coerced = _coerce_int(metadata[key])
            if coerced is not None:
                return coerced, "avb"
    return 0, "absent"


def _build_take(node_id: str, base_url: str, row: dict[str, Any]) -> dict[str, Any]:
    """Project one registry row + its sidecar into a manifest take."""
    metadata = row.get("_metadata") or {}
    asset_hash = str(row.get("asset_hash", ""))
    offset, offset_source = _resolve_offset(metadata)
    return {
        "node_id": node_id,
        "asset_hash": asset_hash,
        "file_name": row.get("file_name"),
        "size_bytes": row.get("size_bytes"),
        "chain_id": metadata.get("chain_id"),
        "tap": metadata.get("tap"),
        "start_sample_offset": offset,
        "offset_source": offset_source,
        "sample_rate": _coerce_int(metadata.get("sample_rate")),
        "sample_count": _coerce_int(metadata.get("sample_count")),
        "wav_ref": proxied_wav_url(base_url, node_id, asset_hash),
    }


def build_session_manifest(
    session_id: str,
    takes_by_node: dict[str, list[dict[str, Any]]],
    *,
    assembled_at: str,
    base_url: str = DEFAULT_BASE_URL,
) -> dict[str, Any]:
    """Assemble the unified session manifest. PURE — no I/O, no clock.

    Args:
        session_id: the session being assembled.
        takes_by_node: ``{node_id: [registry_row_with__metadata, ...]}``.
            Each row is a ``RecordingSummary``-shaped dict (already
            filtered to this session) with the take's sidecar JSON
            attached under ``_metadata`` (as ``fetch_node_recordings``
            returns). Nodes with an empty list are still listed in the
            manifest's ``nodes`` array (they participated / were polled
            but contributed no takes).
        assembled_at: caller-injected ISO-8601 timestamp. Never reads
            the wall clock itself, so the function is deterministic.
        base_url: base URL used to form proxied ``wav_ref`` URLs.

    Returns the manifest document:
        ``{schema_version, session_id, assembled_at, base_url, nodes,
        takes, total_takes}``.
    """
    nodes = sorted(takes_by_node.keys())
    takes: list[dict[str, Any]] = []
    node_summaries: list[dict[str, Any]] = []

    for node_id in nodes:
        rows = takes_by_node.get(node_id) or []
        node_takes = [_build_take(node_id, base_url, row) for row in rows]
        takes.extend(node_takes)
        node_summaries.append({"node_id": node_id, "take_count": len(node_takes)})

    return {
        "schema_version": SCHEMA_VERSION,
        "session_id": session_id,
        "assembled_at": assembled_at,
        "base_url": base_url,
        "nodes": node_summaries,
        "takes": takes,
        "total_takes": len(takes),
    }


# ---------------------------------------------------------------------------
# Orchestration + CLI
# ---------------------------------------------------------------------------


def assemble_session(
    client: HttpClient,
    *,
    session_id: str,
    base_url: str,
    assembled_at: str,
    node_filter: Optional[str] = None,
) -> dict[str, Any]:
    """End-to-end assembly: walk peers, fetch takes, build the manifest."""
    nodes = fetch_cluster_nodes(client, base_url)
    takes_by_node: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        node_id = node.get("id")
        if not node_id:
            continue
        node_id = str(node_id)
        if node_filter is not None and node_id != node_filter:
            continue
        try:
            takes = fetch_node_recordings(client, base_url, node_id, session_id)
        except Exception as exc:  # noqa: BLE001 — one bad peer must not abort
            logger.warning("node %s unreachable / errored, skipping: %s", node_id, exc)
            takes = []
        takes_by_node[node_id] = takes

    return build_session_manifest(
        session_id,
        takes_by_node,
        assembled_at=assembled_at,
        base_url=base_url,
    )


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Assemble a unified cluster recording-session manifest by "
            "walking /api/cluster/nodes and each peer's recordings."
        )
    )
    parser.add_argument(
        "--session-id",
        required=True,
        help="Recording session id to assemble (e.g. sess-<uuid>).",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL}).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Write the manifest JSON to this path (default: stdout).",
    )
    parser.add_argument(
        "--node",
        default=None,
        help="Only assemble takes from this single node id (default: all peers).",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args(argv)

    # Wall-clock is read here, in main(), and injected into the pure
    # builder — never at import time, never inside build_session_manifest.
    assembled_at = datetime.now(timezone.utc).isoformat()

    import httpx  # local import keeps module importable without httpx for unit tests

    try:
        with httpx.Client(timeout=10.0) as client:
            manifest = assemble_session(
                client,
                session_id=args.session_id,
                base_url=args.base_url,
                assembled_at=assembled_at,
                node_filter=args.node,
            )
    except httpx.HTTPError as exc:
        logger.error("assembly failed talking to %s: %s", args.base_url, exc)
        return 1

    text = json.dumps(manifest, indent=2)
    if args.output:
        from pathlib import Path

        Path(args.output).write_text(text + "\n", encoding="utf-8")
        logger.info(
            "wrote manifest for session %s (%d take(s)) to %s",
            args.session_id,
            manifest["total_takes"],
            args.output,
        )
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
