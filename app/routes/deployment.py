"""
Deployment Configuration API Routes

Endpoints for:
- GET /api/deployment/mode - Get current deployment mode
- POST /api/deployment/mode - Switch deployment mode
- GET /api/deployment/status - Get service status by mode
- GET /api/deployment/health/mode - Get mode-specific health checks
- GET /api/deployment/config - Get full deployment config
"""

import asyncio
import logging
import subprocess
import socket
from urllib.request import urlopen
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deployment.deployment import (
    get_deployment_config,
    DeploymentMode,
    ServicePolicy,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployment", tags=["Deployment"])


class DeploymentModeResponse(BaseModel):
    """Current deployment mode"""
    mode: str
    description: str


class ServiceStatusResponse(BaseModel):
    """Status of a service"""
    service: str
    policy: str
    enabled: bool
    status: str  # "running", "stopped", "degraded"


class DeploymentStatusResponse(BaseModel):
    """Full deployment status"""
    mode: str
    services: List[ServiceStatusResponse]
    created_at: str
    updated_at: str


class SetModeRequest(BaseModel):
    """Request to change deployment mode"""
    mode: str


class HealthCheckResult(BaseModel):
    """Result of a health check"""
    check: str
    passed: bool
    message: str
    expected: Optional[str] = None
    actual: Optional[str] = None


class DeploymentHealthResponse(BaseModel):
    """Deployment health checks by mode"""
    mode: str
    overall_health: str  # "healthy", "degraded", "unhealthy"
    checks: List[HealthCheckResult]


MODE_DESCRIPTIONS = {
    "ALL-IN-ONE": "Single device running all services",
    "AUDIO-NODE": "Dedicated audio processing node with API",
    "CONTROL-NODE": "Control/UI node without audio processing",
    "FRONTEND-ONLY": "Lightweight frontend mode with minimal backend",
}


@router.get("/mode", response_model=DeploymentModeResponse)
async def get_deployment_mode():
    """Get current deployment mode"""
    config = get_deployment_config()
    return DeploymentModeResponse(
        mode=config.mode.value,
        description=MODE_DESCRIPTIONS.get(config.mode.value, "Unknown mode"),
    )


@router.post("/mode", response_model=DeploymentModeResponse)
async def set_deployment_mode(request: SetModeRequest):
    """
    Switch deployment mode.
    
    Updates all config stores (deployment.json, guitarfx-mode.conf, /etc/map2/environment)
    and installs the correct systemd override.
    
    Note: The backend service will need to be restarted for systemd-level changes 
    (Nice, CPUAffinity, RT priority) to take effect. Use POST /api/system/restart-backend
    after this call, or pass restart=true in the request.
    """
    try:
        mode = DeploymentMode(request.mode)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Must be one of: {', '.join([m.value for m in DeploymentMode])}"
        )
    
    config = get_deployment_config()
    old_mode = config.mode.value
    config.set_mode(mode)
    
    # Also update the system-level config files so all stores agree
    await _sync_system_config(mode)
    
    logger.info(f"Deployment mode switched from {old_mode} to {request.mode}")
    
    return DeploymentModeResponse(
        mode=config.mode.value,
        description=MODE_DESCRIPTIONS.get(config.mode.value, "Unknown mode"),
    )


async def _sync_system_config(mode: DeploymentMode):
    """
    Sync the deployment mode to all system config stores.
    
    This ensures guitarfx-mode.conf, /etc/map2/environment, and
    the systemd override all agree with deployment.json.
    """
    
    # Map deployment enum → guitarfx-mode.conf value
    mode_map = {
        DeploymentMode.ALL_IN_ONE: "all-in-one",
        DeploymentMode.AUDIO_NODE: "audio",
        DeploymentMode.CONTROL_NODE: "management",
        DeploymentMode.FRONTEND_ONLY: "management",
    }
    gfx_mode = mode_map.get(mode, "all-in-one")
    
    try:
        # Use the unified map2-mode script if available (handles all stores + systemd)
        result = await asyncio.to_thread(
            subprocess.run,
            ["/usr/local/bin/map2-mode", "apply"],
            capture_output=True, text=True, timeout=15,
            env={**__import__('os').environ, "SUDO_ASKPASS": "/bin/false"}
        )
        if result.returncode == 0:
            logger.info(f"System config synced via map2-mode apply")
            return
    except Exception as e:
        logger.debug(f"map2-mode script not available: {e}")
    
    # Fallback: update guitarfx-mode.conf directly if we have write access
    try:
        with open("/etc/guitarfx-mode.conf", "w") as f:
            f.write(f"MODE={gfx_mode}\n")
        logger.info(f"Updated guitarfx-mode.conf → {gfx_mode}")
    except PermissionError:
        logger.warning("Cannot write to /etc/guitarfx-mode.conf (need root)")
    except Exception as e:
        logger.warning(f"Failed to update guitarfx-mode.conf: {e}")


async def _get_service_status(service: str) -> ServiceStatusResponse:
    """Get status of a specific service"""
    config = get_deployment_config()
    policy = config.get_service_policy(service)

    # Default status from deployment policy
    status_map = {
        ServicePolicy.ENABLED: "running",
        ServicePolicy.DISABLED: "stopped",
        ServicePolicy.DEGRADED: "degraded",
    }
    resolved_status = status_map.get(policy, "unknown")

    # Map deployment service names to orchestrator service names where possible
    service_aliases = {
        "juce_engine": "juce_engine",
        "plugin_loader": "plugin_loader",
        "database": "database",
        "lcd_manager": "lcd_display",
    }

    def _map_orchestrator_state(state: str) -> str:
        state = (state or "").lower()
        if state in {"running"}:
            return "running"
        if state in {"degraded", "failed", "restarting"}:
            return "degraded"
        return "stopped"

    # 1) Prefer orchestrator state for managed services.
    try:
        from app.services.service_orchestrator import get_orchestrator
        orchestrator = get_orchestrator()
        alias = service_aliases.get(service)
        if alias:
            svc = orchestrator.get_service_status(alias)
            if svc:
                resolved_status = _map_orchestrator_state(svc.get("state", ""))
    except Exception as e:
        logger.debug(f"Orchestrator status lookup failed for {service}: {e}")

    # 2) Service-specific checks for services not covered by orchestrator aliases.
    try:
        from app.services import service_manager
        from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

        if service in {"juce_engine", "audio_io"}:
            audio_status = service_manager.get_audio_status()
            resolved_status = "running" if audio_status.get("running") else "stopped"
        elif service == "mdns_discovery":
            discovery = get_enhanced_mdns_discovery()
            _ = discovery.get_cluster_summary()
            resolved_status = "running"
        elif service == "api_server":
            # If this endpoint is serving, API is operational.
            resolved_status = "running"
        elif service == "web_ui":
            # Probe frontend production endpoint quickly.
            def _probe_web_ui() -> bool:
                try:
                    with urlopen("http://127.0.0.1:3000/", timeout=1.5) as resp:
                        return 200 <= resp.status < 500
                except Exception:
                    return False
            web_ok = await asyncio.to_thread(_probe_web_ui)
            resolved_status = "running" if web_ok else "stopped"
    except Exception as e:
        logger.debug(f"Service-specific status lookup failed for {service}: {e}")

    return ServiceStatusResponse(
        service=service,
        policy=policy.value,
        enabled=config.is_service_enabled(service),
        status=resolved_status,
    )


@router.get("/status", response_model=DeploymentStatusResponse)
async def get_deployment_status():
    """Get full deployment status including all services"""
    config = get_deployment_config()
    
    # Get status for all services
    services = []
    for service in config.service_policies.keys():
        service_status = await _get_service_status(service)
        services.append(service_status)
    
    return DeploymentStatusResponse(
        mode=config.mode.value,
        services=services,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.get("/config")
async def get_full_config():
    """Get full deployment configuration"""
    config = get_deployment_config()
    return config.to_dict()


@router.get("/verify")
async def verify_mode_consistency():
    """
    Verify all mode config stores agree.
    
    Checks guitarfx-mode.conf, deployment.json, /etc/map2/environment,
    and the active systemd override for consistency.
    
    Returns:
        {
            "consistent": true/false,
            "stores": { ... },
            "issues": [...]
        }
    """
    import os
    import re

    stores = {}
    issues = []

    # 1. guitarfx-mode.conf
    gfx_mode = "missing"
    try:
        with open("/etc/guitarfx-mode.conf", "r") as f:
            for line in f:
                if line.startswith("MODE="):
                    gfx_mode = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        issues.append("guitarfx-mode.conf not found")
    stores["guitarfx_mode_conf"] = gfx_mode

    # 2. deployment.json
    config = get_deployment_config()
    stores["deployment_json"] = config.mode.value

    # 3. /etc/map2/environment
    env_mode = "missing"
    try:
        with open("/etc/map2/environment", "r") as f:
            for line in f:
                if line.startswith("MAP2_DEPLOYMENT_MODE="):
                    env_mode = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        issues.append("/etc/map2/environment not found")
    stores["etc_map2_environment"] = env_mode

    # 4. systemd override
    override_mode = "none"
    override_path = "/etc/systemd/system/map2-backend.service.d/10-mode.conf"
    legacy_aio = "/etc/systemd/system/map2-backend.service.d/all-in-one-override.conf"
    legacy_audio = "/etc/systemd/system/map2-backend.service.d/audio-mode-override.conf"

    if os.path.exists(override_path):
        try:
            with open(override_path) as f:
                m = re.search(r"^# MAP2_MODE=(.+)$", f.read(), re.MULTILINE)
                override_mode = m.group(1) if m else "unknown"
        except Exception:
            override_mode = "error"
    if os.path.exists(legacy_aio) and os.path.exists(legacy_audio):
        override_mode = "CONFLICT(both legacy overrides present)"
        issues.append("Both legacy overrides installed simultaneously — run 'sudo map2-mode apply'")
    stores["systemd_override"] = override_mode

    # Check agreement
    mode_map = {
        "audio": "AUDIO-NODE",
        "all-in-one": "ALL-IN-ONE",
        "management": "CONTROL-NODE",
    }
    expected_deploy = mode_map.get(gfx_mode, "UNKNOWN")

    if config.mode.value != expected_deploy and gfx_mode != "missing":
        issues.append(f"deployment.json ({config.mode.value}) disagrees with guitarfx-mode.conf ({gfx_mode} → {expected_deploy})")
    if env_mode not in ("missing",) and env_mode != expected_deploy:
        issues.append(f"/etc/map2/environment ({env_mode}) disagrees with guitarfx-mode.conf ({gfx_mode} → {expected_deploy})")

    return {
        "consistent": len(issues) == 0,
        "canonical_mode": gfx_mode,
        "stores": stores,
        "issues": issues,
    }


async def _check_network_connectivity() -> HealthCheckResult:
    """Check network connectivity"""
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=2)
        return HealthCheckResult(
            check="network_connectivity",
            passed=True,
            message="Network connectivity OK",
        )
    except Exception as e:
        return HealthCheckResult(
            check="network_connectivity",
            passed=False,
            message=f"Network connectivity failed: {e}",
        )


async def _check_mdns_discovery() -> HealthCheckResult:
    """Check mDNS discovery service"""
    try:
        from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

        discovery = get_enhanced_mdns_discovery()
        summary = discovery.get_cluster_summary()

        return HealthCheckResult(
            check="mdns_discovery",
            passed=True,
            message=f"mDNS discovery running (online nodes: {summary.get('online_nodes', 0)})",
        )
    except Exception as e:
        return HealthCheckResult(
            check="mdns_discovery",
            passed=False,
            message=f"mDNS discovery check failed: {e}",
        )


async def _check_ssh_connectivity() -> HealthCheckResult:
    """Check SSH key availability"""
    try:
        from pathlib import Path
        ssh_dir = Path.home() / ".ssh"
        ssh_keys = list(ssh_dir.glob("map2_*"))
        
        if ssh_keys:
            return HealthCheckResult(
                check="ssh_keys",
                passed=True,
                message=f"SSH keys available ({len(ssh_keys)} keys)",
            )
        else:
            return HealthCheckResult(
                check="ssh_keys",
                passed=False,
                message="No SSH keys found",
            )
    except Exception as e:
        return HealthCheckResult(
            check="ssh_keys",
            passed=False,
            message=f"SSH key check failed: {e}",
        )


async def _check_peers_discovered() -> HealthCheckResult:
    """Check if any peers have been discovered"""
    try:
        config = get_deployment_config()
        if config.mode == DeploymentMode.ALL_IN_ONE:
            return HealthCheckResult(
                check="peers_discovered",
                passed=True,
                message="Peer discovery not required in all-in-one mode",
            )

        from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

        discovery = get_enhanced_mdns_discovery()
        summary = discovery.get_cluster_summary()
        online_nodes = int(summary.get("online_nodes", 0))
        total_nodes = int(summary.get("total_discovered", 0))
        passed = online_nodes > 0

        return HealthCheckResult(
            check="peers_discovered",
            passed=passed,
            message=(
                f"Discovered {online_nodes} online peer(s) ({total_nodes} total cached)"
                if passed
                else "No online peers discovered"
            ),
        )
    except Exception as e:
        return HealthCheckResult(
            check="peers_discovered",
            passed=False,
            message=f"Peer discovery check failed: {e}",
        )


async def _check_audio_hardware() -> HealthCheckResult:
    """Check audio hardware availability"""
    try:
        from app.services import service_manager

        audio_status = service_manager.get_audio_status()
        running = bool(audio_status.get("running"))

        # Also verify ALSA card presence as hardware-level fallback
        def _count_alsa_cards() -> int:
            try:
                with open("/proc/asound/cards", "r") as f:
                    return sum(1 for line in f if line.lstrip()[:1].isdigit())
            except Exception:
                return 0

        card_count = await asyncio.to_thread(_count_alsa_cards)
        passed = running or card_count > 0

        if running:
            message = (
                f"Audio engine running ({audio_status.get('sample_rate', 0)}Hz, "
                f"buffer={audio_status.get('buffer_size', 0)})"
            )
        elif card_count > 0:
            message = f"Audio hardware detected ({card_count} ALSA card(s))"
        else:
            message = "No active audio engine and no ALSA hardware detected"

        return HealthCheckResult(
            check="audio_hardware",
            passed=passed,
            message=message,
        )
    except Exception as e:
        return HealthCheckResult(
            check="audio_hardware",
            passed=False,
            message=f"Audio hardware check failed: {e}",
        )


@router.get("/health/mode", response_model=DeploymentHealthResponse)
async def get_deployment_health():
    """Get mode-specific health checks"""
    config = get_deployment_config()
    
    # Build checks based on mode
    checks: List[HealthCheckResult] = []
    
    # Common checks for all modes
    checks.append(await _check_network_connectivity())
    checks.append(await _check_mdns_discovery())
    checks.append(await _check_ssh_connectivity())
    
    # Mode-specific checks
    if config.mode in [DeploymentMode.AUDIO_NODE, DeploymentMode.ALL_IN_ONE]:
        checks.append(await _check_audio_hardware())
    
    if config.mode in [DeploymentMode.AUDIO_NODE, DeploymentMode.CONTROL_NODE, DeploymentMode.ALL_IN_ONE]:
        checks.append(await _check_peers_discovered())
    
    # Determine overall health
    failed_checks = [c for c in checks if not c.passed]
    if not failed_checks:
        overall = "healthy"
    elif len(failed_checks) <= 2:
        overall = "degraded"
    else:
        overall = "unhealthy"
    
    return DeploymentHealthResponse(
        mode=config.mode.value,
        overall_health=overall,
        checks=checks,
    )
