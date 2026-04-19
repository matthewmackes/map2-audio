"""
Canonical system-health aggregation for the public /api/health payload.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict

import psutil

from app.services.platform_event.status import get_platform_event_status_snapshot


async def build_system_health_snapshot(started_at: float) -> Dict[str, Any]:
    """Build the structured health payload returned by ``GET /api/health``."""
    uptime = time.time() - started_at

    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    memory_mb = memory_info.rss / (1024 * 1024)
    memory_percent = psutil.virtual_memory().percent

    cpu_percent = 0.0
    audio_running = False
    plugins_loaded = 0
    services_running = 0
    services_total = 0
    services_required_running = 0
    services_required_total = 0
    services_optional_running = 0
    services_optional_total = 0
    dependency_errors: list[str] = []

    try:
        from app.services.service_orchestrator import get_orchestrator

        orchestrator = get_orchestrator()
        status = orchestrator.get_all_status()

        for service in status.get("services", {}).values():
            services_total += 1
            service_state = service.get("state")
            is_optional = bool(service.get("is_optional", False))

            if is_optional:
                services_optional_total += 1
            else:
                services_required_total += 1

            if service_state == "running":
                services_running += 1
                if is_optional:
                    services_optional_running += 1
                else:
                    services_required_running += 1

        audio_status = orchestrator.get_service_status("juce_engine")
        if audio_status and audio_status.get("state") == "running":
            audio_running = True

        plugin_status = orchestrator.get_service_status("plugin_loader")
        if plugin_status and plugin_status.get("health", {}).get("metrics"):
            plugins_loaded = plugin_status["health"]["metrics"].get("plugin_count", 0)
    except Exception as exc:
        dependency_errors.append(f"service_orchestrator: {exc}")

    buffer_underruns = 0
    history_samples = 3600
    active_alerts = 0
    try:
        from app.services.performance_metrics import get_metrics_collector

        collector = await get_metrics_collector()
        latest_cpu_sample = collector.cpu_history[-1]["value"] if collector.cpu_history else None
        if latest_cpu_sample is not None:
            cpu_percent = float(latest_cpu_sample)
        else:
            current_metrics = collector.get_current_metrics()
            cpu_percent = float(current_metrics.get("cpu_percent", 0.0))
        buffer_underruns = collector.buffer_underruns
        history_samples = collector.max_history
        active_alerts = len(collector.get_alerts())
    except Exception as exc:
        dependency_errors.append(f"performance_metrics: {exc}")
        cpu_percent = float(psutil.cpu_percent(interval=None))

    nam_available = False
    gpu_device = None
    try:
        from app.services.nam_processor import NAM_AVAILABLE

        nam_available = NAM_AVAILABLE
    except Exception as exc:
        dependency_errors.append(f"nam_processor: {exc}")

    ir_available = False
    try:
        from app.services.ir_processor import SCIPY_AVAILABLE

        ir_available = SCIPY_AVAILABLE
    except Exception as exc:
        dependency_errors.append(f"ir_processor: {exc}")

    midi_cluster = {
        "enabled": False,
        "node_count": 0,
        "connection_count": 0,
        "clock_status": "disabled",
        "master_node_id": None,
        "strategy": None,
        "is_master": False,
        "drift_ms": 0.0,
        "sync_offset_ms": 0.0,
    }
    try:
        from app.config import config_get

        midi_cluster["enabled"] = bool(config_get("midi.cluster.enabled", False))
        if midi_cluster["enabled"]:
            from app.services.midi_hub.cluster_clock import get_midi_cluster_clock
            from app.services.midi_hub.cluster_router import get_midi_cluster_router
            from app.services.midi_hub.midi_discovery import get_midi_discovery_service

            discovery_summary = get_midi_discovery_service().get_discovery_summary()
            clock_state = get_midi_cluster_clock().get_state()
            connections = get_midi_cluster_router().get_connections()
            midi_cluster.update(
                {
                    "node_count": int(discovery_summary.get("total_nodes", 0)),
                    "connection_count": len(connections),
                    "clock_status": (
                        "master"
                        if clock_state.is_master
                        else "external" if clock_state.master_node_id is None else "synced"
                    ),
                    "master_node_id": clock_state.master_node_id,
                    "strategy": clock_state.strategy.value,
                    "is_master": clock_state.is_master,
                    "drift_ms": float(clock_state.drift_ms),
                    "sync_offset_ms": float(clock_state.sync_offset_ms),
                }
            )
    except Exception as exc:
        dependency_errors.append(f"midi_cluster: {exc}")

    platform_event_status = {
        "legacy_buses_removed": False,
        "dual_emitters_remaining": None,
        "platform_event_store": {
            "available": False,
            "db_path": None,
            "exists": False,
            "retention_days": None,
            "size_bytes": 0,
            "legacy_source_path": None,
        },
        "platform_event_federation": {
            "available": False,
            "mesh_running": False,
            "mesh_interval_seconds": None,
            "connection_count": 0,
            "connected_nodes": [],
            "topics": [],
        },
    }
    try:
        platform_event_status = get_platform_event_status_snapshot()
    except Exception as exc:
        dependency_errors.append(f"platform_event: {exc}")

    issues = []
    overall_status = "healthy"

    if services_total == 0:
        issues.append("No orchestrator service data available")
    elif services_required_total > 0 and services_required_running < services_required_total:
        issues.append(
            f"Only {services_required_running}/{services_required_total} required orchestrator services are running"
        )

    if not audio_running:
        issues.append("Audio engine service not running")

    if not bool(platform_event_status["platform_event_store"].get("available")):
        issues.append("PlatformEvent store unavailable")

    if cpu_percent >= 95:
        issues.append(f"CPU usage critical ({cpu_percent:.1f}%)")
    elif cpu_percent >= 85:
        issues.append(f"CPU usage high ({cpu_percent:.1f}%)")

    if memory_percent >= 95:
        issues.append(f"Memory usage critical ({memory_percent:.1f}%)")
    elif memory_percent >= 85:
        issues.append(f"Memory usage high ({memory_percent:.1f}%)")

    if issues:
        overall_status = "degraded"
    if services_required_total > 0 and services_required_running == 0:
        overall_status = "critical"

    subsystem_health_monitor = {
        "overall_status": overall_status,
        "service_count": services_total,
        "active_alerts_count": active_alerts,
    }
    try:
        from app.services.health_monitor import get_health_monitor

        subsystem_health_monitor = get_health_monitor().get_system_health_summary()
    except Exception:
        pass

    subsystem_audio = {
        "status": "healthy" if audio_running else "offline",
        "is_running": audio_running,
        "total_xruns": buffer_underruns,
        "latency_ms": None,
        "recent_alerts": [],
    }
    try:
        from app.services.audio_health_monitor import get_audio_health_monitor

        subsystem_audio = get_audio_health_monitor().get_audio_health_summary()
    except Exception:
        pass

    subsystem_node = {
        "status": "ok" if audio_running else "critical",
        "cpu_percent": cpu_percent,
        "memory_percent": memory_percent,
        "xrun_count": buffer_underruns,
        "audio_latency_ms": None,
    }
    try:
        from app.services.node_health_service import get_node_health_service

        subsystem_node = await get_node_health_service().get_local_health()
        if hasattr(subsystem_node, "model_dump"):
            subsystem_node = subsystem_node.model_dump()
    except Exception:
        pass

    subsystem_deployment = {
        "overall_status": "unknown",
        "checks_passed": 0,
        "checks_warned": 0,
        "checks_failed": 0,
        "total_checks": 0,
    }
    try:
        from app.services.deployment_health import get_deployment_health_checker

        subsystem_deployment = await get_deployment_health_checker().get_overall_status()
    except Exception:
        pass

    subsystems = {
        "system": {
            "status": overall_status,
            "uptime_seconds": uptime,
            "cpu_percent": cpu_percent,
            "memory_mb": memory_mb,
            "memory_percent": memory_percent,
            "issues": issues,
        },
        "orchestrator": {
            "services_running": services_running,
            "services_total": services_total,
            "services_required_running": services_required_running,
            "services_required_total": services_required_total,
            "services_optional_running": services_optional_running,
            "services_optional_total": services_optional_total,
        },
        "performance": {
            "buffer_underruns": buffer_underruns,
            "history_samples": history_samples,
            "active_alerts": active_alerts,
        },
        "audio": subsystem_audio,
        "plugins": {
            "plugins_loaded": plugins_loaded,
            "nam_available": nam_available,
            "ir_rt_safe": ir_available,
        },
        "node": subsystem_node,
        "deployment": subsystem_deployment,
        "health_monitor": subsystem_health_monitor,
        "cluster": {
            "midi_cluster": midi_cluster,
        },
        "platform_events": {
            "legacy_buses_removed": platform_event_status["legacy_buses_removed"],
            "dual_emitters_remaining": platform_event_status["dual_emitters_remaining"],
            "store": platform_event_status["platform_event_store"],
            "federation": platform_event_status["platform_event_federation"],
        },
    }

    return {
        "status": overall_status,
        "overall_status": overall_status,
        "uptime_seconds": uptime,
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb,
        "memory_percent": memory_percent,
        "audio_running": audio_running,
        "plugins_loaded": plugins_loaded,
        "services_running": services_running,
        "services_total": services_total,
        "services_required_running": services_required_running,
        "services_required_total": services_required_total,
        "services_optional_running": services_optional_running,
        "services_optional_total": services_optional_total,
        "buffer_underruns": buffer_underruns,
        "history_samples": history_samples,
        "active_alerts": active_alerts,
        "nam_available": nam_available,
        "gpu_device": gpu_device,
        "ir_rt_safe": ir_available,
        "chain_morphing": True,
        "midi_cluster": midi_cluster,
        "legacy_buses_removed": platform_event_status["legacy_buses_removed"],
        "dual_emitters_remaining": platform_event_status["dual_emitters_remaining"],
        "platform_event_store": platform_event_status["platform_event_store"],
        "platform_event_federation": platform_event_status["platform_event_federation"],
        "issues": issues,
        "dependency_errors": dependency_errors,
        "subsystems": subsystems,
    }
