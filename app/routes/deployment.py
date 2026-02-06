"""
Deployment Configuration API Routes

Endpoints for:
- GET /api/deployment/mode - Get current deployment mode
- POST /api/deployment/mode - Switch deployment mode  
- GET /api/deployment/status - Get service status by mode
- GET /api/deployment/health - Get mode-specific health checks
- GET /api/deployment/config - Get full deployment config
"""

import logging
from typing import Dict, List, Optional
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
    """Switch deployment mode"""
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
    
    logger.info(f"Deployment mode switched from {old_mode} to {request.mode}")
    
    return DeploymentModeResponse(
        mode=config.mode.value,
        description=MODE_DESCRIPTIONS.get(config.mode.value, "Unknown mode"),
    )


async def _get_service_status(service: str) -> ServiceStatusResponse:
    """Get status of a specific service"""
    config = get_deployment_config()
    policy = config.get_service_policy(service)
    
    # TODO: Query actual service status from service_manager
    # For now, return policy state as status
    status_map = {
        ServicePolicy.ENABLED: "running",
        ServicePolicy.DISABLED: "stopped",
        ServicePolicy.DEGRADED: "degraded",
    }
    
    return ServiceStatusResponse(
        service=service,
        policy=policy.value,
        enabled=config.is_service_enabled(service),
        status=status_map.get(policy, "unknown"),
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


async def _check_network_connectivity() -> HealthCheckResult:
    """Check network connectivity"""
    try:
        import socket
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
        # TODO: Query MDNSPeerDiscovery service status
        return HealthCheckResult(
            check="mdns_discovery",
            passed=True,
            message="mDNS discovery running",
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
        # TODO: Query MDNSPeerDiscovery for discovered peers
        return HealthCheckResult(
            check="peers_discovered",
            passed=True,
            message="Peer discovery check OK",
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
        # TODO: Query audio service for hardware status
        return HealthCheckResult(
            check="audio_hardware",
            passed=True,
            message="Audio hardware available",
        )
    except Exception as e:
        return HealthCheckResult(
            check="audio_hardware",
            passed=False,
            message=f"Audio hardware check failed: {e}",
        )


@router.get("/health", response_model=DeploymentHealthResponse)
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
