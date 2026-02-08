"""
System status collectors.

Gathers data from three sources:
1. Local system  — psutil, /proc, /sys, subprocess commands
2. MAP2 REST API — health, audio, deployment, cluster endpoints
3. Config files  — /etc/guitarfx-mode.conf

Everything is async and timeout-guarded.  The main entry point is
`collect_snapshot()` which returns an immutable `NodeSnapshot`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import socket
import subprocess
import time
from pathlib import Path
from typing import List, Optional

import psutil

from .api_client import NodeAPIClient
from .models import (
    AudioChannel,
    AudioEngineStatus,
    ClusterPeer,
    ClusterStatus,
    CpuInfo,
    HealthLevel,
    MemoryInfo,
    NetworkInterface,
    NodeMode,
    NodeSnapshot,
    PipewireStatus,
    ServiceInfo,
    ServiceState,
    TemperatureInfo,
)

logger = logging.getLogger(__name__)

MODE_CONF_PATH = Path("/etc/guitarfx-mode.conf")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _run_cmd(cmd: str, timeout: float = 1.5) -> Optional[str]:
    """Run a shell command with timeout, return stdout or None."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def _read_file_line(path: str) -> Optional[str]:
    """Read first non-empty line from a file."""
    try:
        with open(path) as f:
            for line in f:
                stripped = line.strip()
                if stripped:
                    return stripped
    except Exception:
        pass
    return None


# ── Local system collectors ──────────────────────────────────────────────────

def collect_hostname() -> str:
    return socket.gethostname()


def collect_uptime() -> float:
    return time.time() - psutil.boot_time()


def collect_cpu() -> CpuInfo:
    load = os.getloadavg()
    governor = _read_file_line(
        "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
    ) or "unknown"
    isolated = _read_file_line("/sys/devices/system/cpu/isolated") or ""
    return CpuInfo(
        percent=psutil.cpu_percent(interval=0),
        core_count=psutil.cpu_count(logical=True) or 1,
        load_avg_1=load[0],
        load_avg_5=load[1],
        load_avg_15=load[2],
        governor=governor,
        isolated_cores=isolated,
    )


def collect_memory() -> MemoryInfo:
    vm = psutil.virtual_memory()
    sw = psutil.swap_memory()
    return MemoryInfo(
        total_mb=vm.total / (1024 * 1024),
        used_mb=vm.used / (1024 * 1024),
        percent=vm.percent,
        swap_percent=sw.percent,
    )


def collect_temperature() -> TemperatureInfo:
    cpu_temp = None
    try:
        temps = psutil.sensors_temperatures()
        for label in ("coretemp", "k10temp", "cpu_thermal", "acpitz"):
            if label in temps and temps[label]:
                cpu_temp = temps[label][0].current
                break
    except Exception:
        pass
    return TemperatureInfo(cpu_temp_c=cpu_temp)


def collect_network() -> List[NetworkInterface]:
    interfaces: List[NetworkInterface] = []
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    for name, stat in stats.items():
        if name == "lo":
            continue
        ipv4 = ""
        if name in addrs:
            for addr in addrs[name]:
                if addr.family == socket.AF_INET:
                    ipv4 = addr.address
                    break
        interfaces.append(NetworkInterface(
            name=name,
            is_up=stat.isup,
            ipv4=ipv4,
            speed_mbps=stat.speed,
        ))
    return interfaces


def collect_node_mode() -> NodeMode:
    """Read mode from /etc/guitarfx-mode.conf."""
    if MODE_CONF_PATH.exists():
        try:
            for line in MODE_CONF_PATH.read_text().splitlines():
                line = line.strip()
                if line.startswith("MODE="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'").lower()
                    if val in ("audio", "all-in-one", "management"):
                        return NodeMode(val)
        except Exception:
            pass
    # Fallback: environment variable
    env_mode = os.getenv("MAP2_DEPLOYMENT_MODE", "").lower().replace("audio-node", "audio")
    if env_mode in ("audio", "all-in-one", "management"):
        return NodeMode(env_mode)
    return NodeMode.UNKNOWN


def collect_service_states() -> List[ServiceInfo]:
    """Check systemd service status for key MAP2 services."""
    services_to_check = [
        "map2-backend",
        "pipewire",
        "pipewire-pulse",
        "wireplumber",
    ]
    result: List[ServiceInfo] = []
    for svc in services_to_check:
        output = _run_cmd(f"systemctl is-active {svc} 2>/dev/null")
        if output == "active":
            state = ServiceState.RUNNING
        elif output == "failed":
            state = ServiceState.FAILED
        elif output == "inactive":
            state = ServiceState.STOPPED
        else:
            state = ServiceState.UNKNOWN
        result.append(ServiceInfo(name=svc, state=state))
    return result


# ── API-based collectors ─────────────────────────────────────────────────────

async def collect_from_api(client: NodeAPIClient) -> dict:
    """Fetch all API data in parallel, return raw dicts."""
    results = {}
    tasks = {
        "health": client.health(),
        "version": client.version(),
        "audio": client.audio_status(),
        "latency": client.audio_latency(),
        "pipewire": client.pipewire_status(),
        "pw_settings": client.pipewire_settings(),
        "deploy_mode": client.deployment_mode(),
        "deploy_health": client.deployment_health(),
        "cluster": client.cluster_health(),
        "cluster_nodes": client.cluster_online_nodes(),
    }
    gathered = await asyncio.gather(
        *tasks.values(), return_exceptions=True,
    )
    for key, value in zip(tasks.keys(), gathered):
        if isinstance(value, Exception):
            results[key] = None
        else:
            results[key] = value
    return results


def _parse_pipewire(pw_data: Optional[dict], pw_settings: Optional[dict]) -> PipewireStatus:
    if not pw_data:
        return PipewireStatus()
    state = ServiceState.RUNNING if pw_data.get("running") else ServiceState.STOPPED
    sr = 0
    bs = 0
    quantum = 0
    if pw_settings:
        sr = pw_settings.get("rate", pw_settings.get("default_rate", 0))
        quantum = pw_settings.get("quantum", pw_settings.get("default_quantum", 0))
        bs = quantum
    latency = (quantum / sr * 1000) if sr and quantum else 0.0
    return PipewireStatus(
        state=state,
        sample_rate=sr,
        buffer_size=bs,
        latency_ms=round(latency, 2),
        quantum=quantum,
    )


def _parse_audio(api: dict) -> AudioEngineStatus:
    health = api.get("health") or {}
    audio = api.get("audio") or {}
    latency_data = api.get("latency") or {}

    state = ServiceState.RUNNING if health.get("audio_running") else ServiceState.STOPPED
    return AudioEngineStatus(
        state=state,
        sample_rate=audio.get("sample_rate", 48000),
        buffer_size=audio.get("buffer_size", 256),
        latency_ms=latency_data.get("round_trip_ms", 0.0),
        xruns=audio.get("xruns", 0),
        nam_available=health.get("nam_available", False),
        ir_available=health.get("ir_rt_safe", False),
        plugins_loaded=health.get("plugins_loaded", 0),
    )


def _parse_cluster(cluster_data: Optional[dict], nodes_data: Optional[dict]) -> ClusterStatus:
    if not cluster_data:
        return ClusterStatus()
    peers: List[ClusterPeer] = []
    if nodes_data and isinstance(nodes_data, list):
        for n in nodes_data:
            peers.append(ClusterPeer(
                node_id=n.get("node_id", ""),
                hostname=n.get("hostname", ""),
                ip=n.get("ip", ""),
                mode=n.get("mode", ""),
                health=HealthLevel.HEALTHY if n.get("healthy") else HealthLevel.WARNING,
                latency_ms=n.get("latency_ms", 0),
                last_heartbeat=n.get("last_heartbeat", 0),
            ))
    return ClusterStatus(
        enabled=True,
        peer_count=len(peers),
        peers=peers,
        clock_source=cluster_data.get("clock_source", "local"),
        clock_synced=cluster_data.get("clock_synced", False),
    )


def _compute_health(
    api_reachable: bool,
    services: List[ServiceInfo],
    pipewire: PipewireStatus,
    audio: AudioEngineStatus,
) -> HealthLevel:
    """Derive overall health from sub-statuses."""
    if not api_reachable:
        return HealthLevel.CRITICAL
    failed = [s for s in services if s.state == ServiceState.FAILED]
    if failed:
        return HealthLevel.CRITICAL
    if pipewire.state != ServiceState.RUNNING:
        return HealthLevel.CRITICAL
    if audio.state != ServiceState.RUNNING:
        return HealthLevel.WARNING
    if audio.xruns > 50:
        return HealthLevel.WARNING
    return HealthLevel.HEALTHY


# ── Main collector ───────────────────────────────────────────────────────────

async def collect_snapshot(client: NodeAPIClient) -> NodeSnapshot:
    """Collect a full node snapshot.  Safe — never raises."""
    errors: List[str] = []

    # Local metrics (fast, sync)
    hostname = collect_hostname()
    uptime = collect_uptime()
    cpu = collect_cpu()
    memory = collect_memory()
    temp = collect_temperature()
    net = collect_network()
    mode = collect_node_mode()
    services = collect_service_states()

    # API metrics (async, may fail)
    api_data: dict = {}
    api_reachable = False
    api_version = ""
    try:
        api_data = await asyncio.wait_for(collect_from_api(client), timeout=4.0)
        if api_data.get("health"):
            api_reachable = True
        ver = api_data.get("version")
        if ver:
            api_version = ver.get("version", "")
    except asyncio.TimeoutError:
        errors.append("API collection timed out")
    except Exception as exc:
        errors.append(f"API error: {exc}")

    pipewire = _parse_pipewire(api_data.get("pipewire"), api_data.get("pw_settings"))
    audio = _parse_audio(api_data)
    cluster = _parse_cluster(api_data.get("cluster"), api_data.get("cluster_nodes"))

    health_data = api_data.get("health") or {}
    health = _compute_health(api_reachable, services, pipewire, audio)

    # Deployment mode from API overrides local file
    dm = api_data.get("deploy_mode")
    if dm and dm.get("mode"):
        raw = dm["mode"].lower().replace("audio-node", "audio").replace("_", "-")
        if raw in ("audio", "all-in-one", "management"):
            mode = NodeMode(raw)

    return NodeSnapshot(
        hostname=hostname,
        mode=mode,
        health=health,
        uptime_seconds=uptime,
        cpu=cpu,
        memory=memory,
        temperature=temp,
        network_interfaces=net,
        pipewire=pipewire,
        audio=audio,
        cluster=cluster,
        services=services,
        api_reachable=api_reachable,
        api_version=api_version,
        services_running=health_data.get("services_running", 0),
        services_total=health_data.get("services_total", 0),
        collector_errors=errors,
    )
