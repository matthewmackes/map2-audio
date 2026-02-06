"""
Deployment Health and Remediation API

Endpoints for:
- GET /api/deployment/health/checks - Run all health checks
- GET /api/deployment/health/status - Get overall health status
- POST /api/deployment/remediation/{action} - Execute remediation action
- GET /api/deployment/remediation/available - List available remediation actions
"""

import logging
from typing import List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.deployment_health import get_deployment_health_checker
from app.services.deployment_remediation import (
    get_remediation_service,
    RemediationAction,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployment", tags=["Deployment Health"])


class HealthCheckResponse(BaseModel):
    """Single health check result"""
    name: str
    status: str
    message: str
    remediation: str | None = None
    command: str | None = None


class HealthStatusResponse(BaseModel):
    """Overall health status"""
    mode: str
    overall_status: str
    checks_passed: int
    checks_warned: int
    checks_failed: int
    total_checks: int
    last_checked: str
    last_check_timestamp: str | None = None


class RemediationActionResponse(BaseModel):
    """Result of remediation action"""
    action: str
    success: bool
    message: str
    details: str | None = None


class RemediationListResponse(BaseModel):
    """Available remediation actions"""
    actions: List[str]


@router.get("/health/checks", response_model=List[HealthCheckResponse])
async def get_health_checks():
    """Run all deployment health checks"""
    try:
        checker = get_deployment_health_checker()
        checks = await checker.run_all_checks()
        
        return [
            HealthCheckResponse(
                name=check.check_name,
                status=check.status.value,
                message=check.message,
                remediation=check.remediation,
                command=check.command,
            )
            for check in checks
        ]
    except Exception as e:
        logger.error(f"Error running health checks: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")


@router.get("/health/status", response_model=HealthStatusResponse)
async def get_health_status():
    """Get overall deployment health status"""
    try:
        checker = get_deployment_health_checker()
        status = await checker.get_overall_status()
        
        return HealthStatusResponse(
            mode=status['mode'],
            overall_status=status['overall_status'],
            checks_passed=status['checks_passed'],
            checks_warned=status['checks_warned'],
            checks_failed=status['checks_failed'],
            total_checks=status['total_checks'],
            last_checked=status['last_checked'],
            last_check_timestamp=status.get('last_check_timestamp'),
        )
    except Exception as e:
        logger.error(f"Error getting health status: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {e}")


class ReadinessItem(BaseModel):
    """Single readiness check item"""
    name: str
    required: bool
    status: str
    message: str


class ReadinessResponse(BaseModel):
    """Readiness checklist response"""
    mode: str
    ready: bool
    items: List[ReadinessItem]


@router.get("/health/readiness", response_model=ReadinessResponse)
async def get_readiness_checklist():
    """Get readiness checklist for current deployment mode"""
    try:
        checker = get_deployment_health_checker()
        checks = await checker.run_all_checks()
        status = await checker.get_overall_status()
        
        items = [
            ReadinessItem(
                name=check.check_name,
                required=check.check_name in ['network_connectivity', 'database_connectivity'],
                status=check.status.value,
                message=check.message,
            )
            for check in checks
        ]
        
        # Ready if no failures in required checks
        required_passed = all(
            item.status != 'fail' for item in items if item.required
        )
        
        return ReadinessResponse(
            mode=status['mode'],
            ready=required_passed,
            items=items,
        )
    except Exception as e:
        logger.error(f"Error getting readiness checklist: {e}")
        raise HTTPException(status_code=500, detail=f"Readiness check failed: {e}")


@router.get("/health")
async def get_full_health_report():
    """Get full health report with all details"""
    try:
        checker = get_deployment_health_checker()
        return await checker.get_overall_status()
    except Exception as e:
        logger.error(f"Error getting full health report: {e}")
        raise HTTPException(status_code=500, detail=f"Health report failed: {e}")


@router.post("/remediation/{action}", response_model=RemediationActionResponse)
async def execute_remediation(action: str):
    """Execute a remediation action"""
    try:
        # Parse action
        try:
            remediation_action = RemediationAction(action)
        except ValueError:
            available = [a.value for a in RemediationAction]
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action. Available actions: {', '.join(available)}"
            )
        
        # Execute
        service = get_remediation_service()
        result = await service.execute_action(remediation_action)
        
        logger.info(f"Remediation action {action} executed: {result.message}")
        
        return RemediationActionResponse(
            action=action,
            success=result.success,
            message=result.message,
            details=result.details,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing remediation action {action}: {e}")
        raise HTTPException(status_code=500, detail=f"Remediation failed: {e}")


@router.get("/remediation/available", response_model=RemediationListResponse)
async def list_remediation_actions():
    """List available remediation actions"""
    return RemediationListResponse(
        actions=[a.value for a in RemediationAction]
    )


@router.get("/readiness-checklist")
async def get_readiness_checklist():
    """
    Get mode readiness checklist - prerequisites for current deployment mode
    """
    from app.deployment.deployment import get_deployment_config, DeploymentMode
    
    config = get_deployment_config()
    
    checklist = {
        "mode": config.mode.value,
        "description": "",
        "items": [],
    }
    
    # Mode-specific requirements
    if config.mode == DeploymentMode.ALL_IN_ONE:
        checklist["description"] = "Single device with all capabilities"
        checklist["items"] = [
            {
                "requirement": "Network connectivity",
                "status": "unknown",
                "critical": False,
                "remediation": "Check network connection",
            },
            {
                "requirement": "Audio hardware",
                "status": "unknown",
                "critical": True,
                "remediation": "Check audio hardware connection",
            },
            {
                "requirement": "Database",
                "status": "unknown",
                "critical": True,
                "remediation": "Check database availability",
            },
            {
                "requirement": "SSH service",
                "status": "unknown",
                "critical": False,
                "remediation": "Start SSH service if needed",
            },
        ]
    
    elif config.mode == DeploymentMode.AUDIO_NODE:
        checklist["description"] = "Audio processing node"
        checklist["items"] = [
            {
                "requirement": "Audio hardware",
                "status": "unknown",
                "critical": True,
                "remediation": "Check audio hardware connection",
            },
            {
                "requirement": "Network connectivity",
                "status": "unknown",
                "critical": True,
                "remediation": "Check network connection",
            },
            {
                "requirement": "mDNS discovery",
                "status": "unknown",
                "critical": False,
                "remediation": "Enable avahi-daemon",
            },
            {
                "requirement": "SSH keys configured",
                "status": "unknown",
                "critical": True,
                "remediation": "Generate SSH keys via API",
            },
        ]
    
    elif config.mode == DeploymentMode.CONTROL_NODE:
        checklist["description"] = "Control/UI node"
        checklist["items"] = [
            {
                "requirement": "Network connectivity",
                "status": "unknown",
                "critical": True,
                "remediation": "Check network connection",
            },
            {
                "requirement": "mDNS discovery",
                "status": "unknown",
                "critical": True,
                "remediation": "Enable avahi-daemon",
            },
            {
                "requirement": "Peer discovery (Audio-Node)",
                "status": "unknown",
                "critical": True,
                "remediation": "Ensure audio-node is reachable",
            },
            {
                "requirement": "SSH keys configured",
                "status": "unknown",
                "critical": True,
                "remediation": "Generate SSH keys via API",
            },
        ]
    
    elif config.mode == DeploymentMode.FRONTEND_ONLY:
        checklist["description"] = "Frontend-only mode"
        checklist["items"] = [
            {
                "requirement": "Network connectivity",
                "status": "unknown",
                "critical": True,
                "remediation": "Check network connection",
            },
            {
                "requirement": "Remote backend configured",
                "status": "unknown",
                "critical": True,
                "remediation": "Set remote backend URL",
            },
            {
                "requirement": "Web UI accessible",
                "status": "unknown",
                "critical": False,
                "remediation": "Check web UI URL",
            },
        ]
    
    return checklist
