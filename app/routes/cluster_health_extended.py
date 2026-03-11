"""Cluster-wide health aggregation endpoints."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/cluster/health/extended", tags=["cluster-health"])

BASE_URL = "http://127.0.0.1:8080"
FANOUT_PARAM = {"node_id": "all"}


async def _fanout_get(path: str) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url, params=FANOUT_PARAM)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Fan-out request failed: {resp.text}")
    payload = resp.json()
    return payload.get("nodes", {})


def _collect_bodies(nodes: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for node_id, node_resp in nodes.items():
        body = node_resp.get("body", {})
        out[node_id] = body
    return out


@router.get("/audio")
async def get_audio_health():
    nodes_status = await _fanout_get("/api/audio/status")
    nodes_health = await _fanout_get("/api/audio/health")
    status_bodies = _collect_bodies(nodes_status)
    health_bodies = _collect_bodies(nodes_health)
    aggregated: Dict[str, Any] = {}
    for node_id, status in status_bodies.items():
        aggregated[node_id] = {
            "status": status,
            "health": health_bodies.get(node_id, {}),
        }
    return {"nodes": aggregated}


@router.get("/audio/xruns")
async def get_audio_xruns():
    nodes_health = await _fanout_get("/api/audio/health")
    timeline: List[Dict[str, Any]] = []
    for node_id, node_resp in nodes_health.items():
        body = node_resp.get("body", {})
        for event in body.get("xrun_history", []) or []:
            entry = dict(event)
            entry["node_id"] = node_id
            timeline.append(entry)
    timeline.sort(key=lambda e: e.get("timestamp", 0))
    return {"count": len(timeline), "events": timeline[-1000:]}


@router.get("/dsp")
async def get_dsp():
    nodes = await _fanout_get("/api/dsp/status")
    return {"nodes": _collect_bodies(nodes)}


@router.get("/pipewire")
async def get_pipewire():
    nodes = await _fanout_get("/api/pipewire/status")
    return {"nodes": _collect_bodies(nodes)}


@router.get("/plugins")
async def get_plugins():
    from app.services.cluster.plugin_inventory_sync import get_cluster_plugin_inventory

    inventory = get_cluster_plugin_inventory()
    catalog = await inventory.get_cluster_catalog()
    common = await inventory.get_common_plugins()
    unique = await inventory.get_unique_plugins()
    encoded_unique = {node: [p.__dict__ for p in plist] for node, plist in unique.items()}
    return {
        "count": len(catalog),
        "plugins": [p.__dict__ for p in catalog],
        "common": [p.__dict__ for p in common],
        "unique": encoded_unique,
    }


@router.get("/devices")
async def get_devices(node_id: Optional[str] = None, search: Optional[str] = None):
    from app.services.cluster.hardware_inventory import get_cluster_hardware_inventory

    inventory = get_cluster_hardware_inventory()
    if search:
        matches = await inventory.find_device(search)
        return {"query": search, "count": len(matches), "matches": matches}

    if node_id:
        hardware = await inventory.get_node_hardware(node_id)
        if hardware is None:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        return {"node": hardware.to_dict()}

    nodes = await inventory.get_inventory()
    encoded_nodes = {node_key: hardware.to_dict() for node_key, hardware in nodes.items()}
    return {
        "nodes": encoded_nodes,
        "summary": {
            "node_count": len(encoded_nodes),
            "usb_audio_device_count": sum(len(hardware.usb_audio_devices) for hardware in nodes.values()),
            "midi_device_count": sum(len(hardware.midi_devices) for hardware in nodes.values()),
            "pipewire_device_count": sum(len(hardware.pipewire_devices) for hardware in nodes.values()),
        },
    }


@router.get("/services")
async def get_services():
    nodes = await _fanout_get("/api/services/status")
    return {"nodes": _collect_bodies(nodes)}


@router.get("/alerts")
async def get_alerts():
    # Fallback to health endpoint alerts if dedicated alert monitor missing
    nodes = await _fanout_get("/api/audio/health")
    alerts: List[Dict[str, Any]] = []
    for node_id, resp in nodes.items():
        for alert in resp.get("body", {}).get("alerts", []) or []:
            entry = dict(alert)
            entry["node_id"] = node_id
            alerts.append(entry)
    return {"count": len(alerts), "alerts": alerts}


@router.get("/overview")
async def get_overview():
    audio_nodes = await _fanout_get("/api/audio/status")
    cpu_nodes = await _fanout_get("/api/metrics/summary")
    total_nodes = len(audio_nodes)
    online_nodes = sum(1 for n in audio_nodes.values() if n.get("status_code") == 200)
    total_plugins = 0
    avg_cpu = 0.0
    cpu_samples = 0
    for node_resp in cpu_nodes.values():
        body = node_resp.get("body", {})
        cpu = body.get("cpu_percent")
        if cpu is not None:
            avg_cpu += cpu
            cpu_samples += 1
    if cpu_samples:
        avg_cpu /= cpu_samples
    for node_resp in audio_nodes.values():
        body = node_resp.get("body", {})
        total_plugins += len(body.get("plugins", [])) if isinstance(body.get("plugins"), list) else 0
    return {
        "total_nodes": total_nodes,
        "online_nodes": online_nodes,
        "avg_cpu_percent": round(avg_cpu, 2) if cpu_samples else None,
        "total_plugins": total_plugins,
    }
