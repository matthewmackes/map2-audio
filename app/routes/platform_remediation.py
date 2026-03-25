from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import socket
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiohttp
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.cluster.integration_helpers import get_node_client
from app.services.cluster.node_visibility import VisibleRemoteNode, get_visible_remote_nodes
from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.version_manifest import get_version_manifest
from app.utils.platform_version import get_platform_version_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/platform-remediation", tags=["platform-remediation"])

ADOPTION_STATES = ("candidate", "claimable", "adopted", "ready", "blocked")
SYNC_STATES = ("outdated", "syncing", "failed", "held", "rollback_available")
CLONE_STATES = ("confirmed_clone", "suspected_clone")


class SyncCaptureRequest(BaseModel):
    source_node_id: str = Field(..., min_length=1)


class SyncRunRequest(BaseModel):
    node_ids: list[str] = Field(default_factory=list)
    dry_run: bool = False


class SyncRestoreRequest(BaseModel):
    history_file: str = Field(..., min_length=1)


class CloneRecoverRequest(BaseModel):
    node_ids: list[str] = Field(default_factory=list)
    management_node_ip: Optional[str] = None


def _slugify(value: str, fallback: str = "node") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or fallback


def _dedupe_hostname(base_hostname: str, existing: set[str]) -> str:
    candidate = base_hostname
    suffix = 2
    while candidate in existing:
        candidate = f"{base_hostname}-{suffix}"
        suffix += 1
    existing.add(candidate)
    return candidate


def _suggest_hostname(node: VisibleRemoteNode, existing: set[str]) -> str:
    base = _slugify(node.hostname or node.node_id or "node")
    if not base.startswith("map2-"):
        base = f"map2-{base}"
    return _dedupe_hostname(base, existing)


async def _fetch_remote_json(url: str, timeout: int = 8) -> Optional[dict[str, Any]]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=timeout) as response:
                if response.status != 200:
                    return None
                payload = await response.json()
                return payload if isinstance(payload, dict) else None
    except Exception:
        return None


async def _fetch_remote_post(url: str, payload: dict[str, Any], timeout: int = 30) -> Optional[dict[str, Any]]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=timeout) as response:
                body = await response.json()
                return body if isinstance(body, dict) else {"status_code": response.status}
    except Exception as exc:
        return {"status": "failed", "detail": str(exc)}


async def _collect_version_for_node(node: VisibleRemoteNode) -> dict[str, Any]:
    if not node.api_url:
        return {"version": None, "commit": None, "error": "missing_api_url"}
    payload = await _fetch_remote_json(f"{node.api_url}/api/version")
    if not payload:
        return {"version": None, "commit": None, "error": "unreachable"}
    return {
        "version": payload.get("version"),
        "commit": payload.get("commit"),
        "dirty": bool(payload.get("dirty", False)),
        "build_timestamp": payload.get("build_timestamp"),
        "error": None,
    }


async def _collect_bootstrap_status_for_node(node: VisibleRemoteNode) -> dict[str, Any]:
    if not node.api_url:
        return {"remote_fingerprint": None, "error": "missing_api_url"}
    payload = await _fetch_remote_json(f"{node.api_url}/api/bootstrap/status")
    if not payload:
        return {"remote_fingerprint": None, "error": "unreachable"}
    return {
        "remote_fingerprint": payload.get("remote_fingerprint"),
        "hostname": payload.get("hostname"),
        "node_id": payload.get("node_id"),
        "error": None,
    }


def _manifest_history_entries() -> list[dict[str, Any]]:
    service = get_version_manifest()
    history: list[dict[str, Any]] = []
    for filename in service.list_manifest_history():
        path = service.history_dir / filename
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
        history.append({
            "history_file": filename,
            "timestamp": payload.get("timestamp"),
            "source_node": payload.get("source_node"),
            "package_count": payload.get("package_count"),
        })
    history.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return history


async def _build_remediation_nodes() -> list[dict[str, Any]]:
    _, visible_nodes = get_visible_remote_nodes()
    local_node_id = socket.gethostname() or "local"
    local_version = get_platform_version_payload()

    nodes = sorted(visible_nodes.values(), key=lambda item: item.node_id)
    version_results, bootstrap_results = await asyncio.gather(
        asyncio.gather(*[_collect_version_for_node(node) for node in nodes]),
        asyncio.gather(*[_collect_bootstrap_status_for_node(node) for node in nodes]),
    )

    version_by_node = {node.node_id: result for node, result in zip(nodes, version_results)}
    bootstrap_by_node = {node.node_id: result for node, result in zip(nodes, bootstrap_results)}

    hostname_counts = Counter(node.hostname for node in nodes if node.hostname)
    fingerprint_counts = Counter(
        result.get("remote_fingerprint")
        for result in bootstrap_results
        if result.get("remote_fingerprint")
    )

    service = get_version_manifest()
    manifest = service.get_manifest()
    held_source = manifest.get("source_node") if isinstance(manifest, dict) else None
    history = _manifest_history_entries()
    rollback_available = bool(history)

    rendered: list[dict[str, Any]] = []
    for node in nodes:
        version_info = version_by_node.get(node.node_id, {})
        bootstrap_info = bootstrap_by_node.get(node.node_id, {})
        adoption_state = node.adoption_state or ("ready" if node.registered else "candidate")

        sync_states: list[str] = []
        if held_source:
            sync_states.append("held")
        if rollback_available:
            sync_states.append("rollback_available")
        if version_info.get("error"):
            sync_states.append("failed")
        elif version_info.get("version") and version_info.get("version") != local_version.get("version"):
            sync_states.append("outdated")

        clone_states: list[str] = []
        fingerprint = bootstrap_info.get("remote_fingerprint")
        if fingerprint and fingerprint_counts[fingerprint] > 1:
            clone_states.append("confirmed_clone")
        elif node.hostname and hostname_counts[node.hostname] > 1:
            clone_states.append("suspected_clone")

        rendered.append({
            "node_id": node.node_id,
            "hostname": node.hostname,
            "api_url": node.api_url,
            "host": node.host,
            "visible": node.visible,
            "registered": node.registered,
            "is_online": node.is_online,
            "adoption_state": adoption_state,
            "activation_state": node.activation_state,
            "trust_state": node.trust_state,
            "routing_ready": node.routing_ready,
            "readiness_status": node.readiness_status,
            "avb_auto_provision": (
                node.metadata.get("adoption", {}).get("avb_auto_provision")
                if isinstance(node.metadata.get("adoption"), dict)
                else None
            ),
            "version": version_info.get("version"),
            "commit": version_info.get("commit"),
            "version_error": version_info.get("error"),
            "remote_fingerprint": fingerprint,
            "sync_states": sync_states,
            "clone_states": clone_states,
            "is_source_of_truth": held_source == node.node_id,
            "rollback_available": rollback_available,
        })

    return rendered


def _summarize_counts(nodes: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    adoption_counts = {state: 0 for state in ADOPTION_STATES}
    sync_counts = {state: 0 for state in SYNC_STATES}
    clone_counts = {state: 0 for state in CLONE_STATES}

    for node in nodes:
        adoption_state = str(node.get("adoption_state") or "")
        if adoption_state in adoption_counts:
            adoption_counts[adoption_state] += 1
        for state in node.get("sync_states") or []:
            if state in sync_counts:
                sync_counts[state] += 1
        for state in node.get("clone_states") or []:
            if state in clone_counts:
                clone_counts[state] += 1

    return {
        "adoption": adoption_counts,
        "sync": sync_counts,
        "clone": clone_counts,
    }


@router.get("/summary")
async def get_platform_remediation_summary() -> dict[str, Any]:
    nodes = await _build_remediation_nodes()
    manifest = get_version_manifest().get_manifest()
    return {
        "status": "ok",
        "counts": _summarize_counts(nodes),
        "manifest": {
            "source_node": manifest.get("source_node") if isinstance(manifest, dict) else None,
            "timestamp": manifest.get("timestamp") if isinstance(manifest, dict) else None,
        },
        "nodes": nodes,
    }


@router.get("/sync/history")
async def list_sync_history() -> dict[str, Any]:
    return {"status": "ok", "items": _manifest_history_entries()}


@router.post("/sync/capture")
async def capture_sync_source(request: SyncCaptureRequest) -> dict[str, Any]:
    try:
        manifest = await asyncio.to_thread(get_version_manifest().capture_manifest, request.source_node_id)
        return {"status": "ok", "manifest": manifest}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to capture source-of-truth manifest: {exc}") from exc


@router.post("/sync/run")
async def run_sync(request: SyncRunRequest) -> dict[str, Any]:
    service = get_version_manifest()

    async def run_one(node_id: str) -> dict[str, Any]:
        try:
            result = await asyncio.to_thread(service.enforce_manifest, node_id, request.dry_run)
            return {"node_id": node_id, **result}
        except Exception as exc:
            return {"node_id": node_id, "status": "failed", "detail": str(exc)}

    results = await asyncio.gather(*[run_one(node_id) for node_id in request.node_ids])
    return {"status": "ok", "results": results}


@router.post("/sync/restore")
async def restore_sync_history(request: SyncRestoreRequest) -> dict[str, Any]:
    service = get_version_manifest()
    history_path = service.history_dir / request.history_file
    if not history_path.exists():
        raise HTTPException(status_code=404, detail=f"Manifest history file not found: {request.history_file}")
    try:
        shutil.copyfile(history_path, service.manifest_path)
        payload = json.loads(service.manifest_path.read_text(encoding="utf-8"))
        return {"status": "ok", "manifest": payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to restore manifest history: {exc}") from exc


@router.post("/sync/fix")
async def fix_sync_node(request: SyncRunRequest) -> dict[str, Any]:
    service = get_version_manifest()

    async def fix_one(node_id: str) -> dict[str, Any]:
        diff = await asyncio.to_thread(service.compare_node, node_id)
        packages = sorted(set(diff.added + list(diff.mismatched.keys())))
        if not packages:
            return {"node_id": node_id, "status": "ok", "message": "No packages require reinstall"}
        node_client = get_node_client(node_id, get_cluster_registry())
        if not node_client:
            return {"node_id": node_id, "status": "failed", "detail": "Node client unavailable"}
        cmd = "dnf reinstall -y " + " ".join(packages)
        rc, stdout, stderr = await asyncio.to_thread(node_client.execute_command, cmd, timeout=900, check_returncode=False)
        return {
            "node_id": node_id,
            "status": "ok" if rc == 0 else "failed",
            "stdout": stdout[-2000:],
            "stderr": stderr[-2000:],
            "command": cmd,
        }

    results = await asyncio.gather(*[fix_one(node_id) for node_id in request.node_ids])
    return {"status": "ok", "results": results}


@router.post("/clone/recover")
async def recover_cloned_nodes(request: CloneRecoverRequest) -> dict[str, Any]:
    _, visible_nodes = get_visible_remote_nodes()
    registry = get_cluster_registry()
    existing_hostnames = {
        str(node.get("hostname") or "").strip().lower()
        for node in registry.get_all_nodes()
        if str(node.get("hostname") or "").strip()
    }

    async def recover_one(node_id: str) -> dict[str, Any]:
        node = visible_nodes.get(node_id)
        if not node or not node.api_url:
            return {"node_id": node_id, "status": "failed", "detail": "Visible node or api_url not found"}

        target_hostname = _suggest_hostname(node, existing_hostnames)
        node_client = get_node_client(node_id, registry)
        if not node_client:
            return {"node_id": node_id, "status": "failed", "detail": "Node client unavailable"}

        phases: list[dict[str, Any]] = []
        hostname_cmd = f"hostnamectl set-hostname {target_hostname}"
        rc, stdout, stderr = await asyncio.to_thread(node_client.execute_command, hostname_cmd, timeout=60, check_returncode=False)
        phases.append({
            "phase": "set_hostname",
            "status": "ok" if rc == 0 else "failed",
            "stdout": stdout[-1000:],
            "stderr": stderr[-1000:],
            "hostname": target_hostname,
        })

        if rc != 0:
            return {"node_id": node_id, "status": "failed", "target_hostname": target_hostname, "phases": phases}

        payload = {
            "management_node_ip": request.management_node_ip,
            "rejoin": True,
            "clear_registry_state": True,
        }
        reset_response = await _fetch_remote_post(f"{node.api_url}/api/cluster/node/reset-default-rejoin", payload, timeout=180)
        phases.append({
            "phase": "reset_rejoin",
            "status": (reset_response or {}).get("status", "failed"),
            "response": reset_response,
        })

        if (reset_response or {}).get("status") not in {"ok", "partial"}:
            fix_rc, fix_stdout, fix_stderr = await asyncio.to_thread(
                node_client.execute_command,
                f"{hostname_cmd} && systemctl restart map2-backend",
                timeout=180,
                check_returncode=False,
            )
            phases.append({
                "phase": "fix",
                "status": "ok" if fix_rc == 0 else "failed",
                "stdout": fix_stdout[-1000:],
                "stderr": fix_stderr[-1000:],
            })
            return {
                "node_id": node_id,
                "status": "ok" if fix_rc == 0 else "failed",
                "target_hostname": target_hostname,
                "phases": phases,
                "next_workflow": "adoption",
            }

        return {
            "node_id": node_id,
            "status": "ok",
            "target_hostname": target_hostname,
            "phases": phases,
            "next_workflow": "adoption",
        }

    results = await asyncio.gather(*[recover_one(node_id) for node_id in request.node_ids])
    return {"status": "ok", "results": results}
