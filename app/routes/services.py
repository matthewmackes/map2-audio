"""
Service Orchestrator API Routes

Provides REST API endpoints for service management and monitoring.
"""

import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.service_orchestrator import get_orchestrator, ServiceState

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/services", tags=["services"])


# === Request/Response Models ===

class ServiceAction(BaseModel):
    """Request model for service actions."""
    service: str


class ServiceActionResponse(BaseModel):
    """Response model for service actions."""
    success: bool
    service: str
    state: str
    message: Optional[str] = None


class BulkActionResponse(BaseModel):
    """Response model for bulk service actions."""
    success: bool
    results: Dict[str, bool]
    message: Optional[str] = None


# === Service Status Endpoints ===

@router.get("/status")
async def get_all_services_status() -> Dict[str, Any]:
    """
    Get status of all services.

    Returns comprehensive status including:
    - Orchestrator state (running, uptime)
    - All registered services with their current state
    - Health information for each service
    - Startup order for debugging
    """
    orchestrator = get_orchestrator()
    return orchestrator.get_all_status()


@router.get("/status/{service_name}")
async def get_service_status(service_name: str) -> Dict[str, Any]:
    """
    Get status of a specific service.

    Args:
        service_name: Name of the service (e.g., 'audio_engine', 'database')

    Returns:
        Detailed status including state, health, metrics, timestamps
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_service_status(service_name)

    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    return status


@router.get("/summary")
async def get_services_summary() -> Dict[str, Any]:
    """
    Get summary counts of services by state.

    Returns:
        Count of services in each state (running, stopped, failed, etc.)
    """
    orchestrator = get_orchestrator()
    summary = orchestrator.get_summary()

    total = sum(summary.values())
    healthy = summary.get(ServiceState.RUNNING.value, 0)

    return {
        "total_services": total,
        "healthy_services": healthy,
        "health_percentage": (healthy / total * 100) if total > 0 else 0,
        "by_state": summary
    }


@router.get("/health")
async def get_services_health() -> Dict[str, Any]:
    """
    Quick health check for all services.

    Returns:
        Overall health status and list of any unhealthy services
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status()

    unhealthy = []
    for name, service in status["services"].items():
        if service["state"] not in (ServiceState.RUNNING.value, ServiceState.STOPPED.value):
            unhealthy.append({
                "name": name,
                "display_name": service["display_name"],
                "state": service["state"],
                "error": service.get("last_error")
            })
        elif service["state"] == ServiceState.RUNNING.value and not service["health"]["healthy"]:
            unhealthy.append({
                "name": name,
                "display_name": service["display_name"],
                "state": "degraded",
                "message": service["health"]["message"]
            })

    return {
        "healthy": len(unhealthy) == 0,
        "orchestrator_running": status["orchestrator"]["running"],
        "uptime_seconds": status["orchestrator"]["uptime_seconds"],
        "unhealthy_services": unhealthy
    }


# === Service Control Endpoints ===

@router.post("/start-all")
async def start_all_services() -> BulkActionResponse:
    """
    Start all services in dependency order.

    This initiates the full startup sequence, respecting service
    dependencies and priority levels.
    """
    orchestrator = get_orchestrator()

    try:
        results = await orchestrator.start_all()
        success = all(results.values())

        return BulkActionResponse(
            success=success,
            results=results,
            message="All services started" if success else "Some services failed to start"
        )
    except Exception as e:
        logger.error(f"Failed to start all services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop-all")
async def stop_all_services() -> BulkActionResponse:
    """
    Stop all services in reverse dependency order.

    This performs a graceful shutdown of all running services.
    """
    orchestrator = get_orchestrator()

    try:
        results = await orchestrator.stop_all()
        success = all(results.values())

        return BulkActionResponse(
            success=success,
            results=results,
            message="All services stopped" if success else "Some services had errors during shutdown"
        )
    except Exception as e:
        logger.error(f"Failed to stop all services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start/{service_name}")
async def start_service(service_name: str) -> ServiceActionResponse:
    """
    Start a specific service.

    Note: Dependencies must be running first.
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_service_status(service_name)

    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    # Check dependencies
    for dep in status["dependencies"]:
        dep_status = orchestrator.get_service_status(dep)
        if dep_status and dep_status["state"] != ServiceState.RUNNING.value:
            raise HTTPException(
                status_code=400,
                detail=f"Dependency '{dep}' is not running"
            )

    try:
        success = await orchestrator._start_service(service_name)
        updated_status = orchestrator.get_service_status(service_name)

        return ServiceActionResponse(
            success=success,
            service=service_name,
            state=updated_status["state"],
            message=updated_status.get("last_error")
        )
    except Exception as e:
        logger.error(f"Failed to start service {service_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop/{service_name}")
async def stop_service(service_name: str) -> ServiceActionResponse:
    """
    Stop a specific service.

    Note: Dependent services should be stopped first.
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_service_status(service_name)

    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    try:
        success = await orchestrator._stop_service(service_name)
        updated_status = orchestrator.get_service_status(service_name)

        return ServiceActionResponse(
            success=success,
            service=service_name,
            state=updated_status["state"],
            message=updated_status.get("last_error")
        )
    except Exception as e:
        logger.error(f"Failed to stop service {service_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restart/{service_name}")
async def restart_service(service_name: str) -> ServiceActionResponse:
    """
    Restart a specific service.

    Performs a stop followed by start.
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_service_status(service_name)

    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    try:
        success = await orchestrator.restart_service(service_name)
        updated_status = orchestrator.get_service_status(service_name)

        return ServiceActionResponse(
            success=success,
            service=service_name,
            state=updated_status["state"],
            message="Service restarted" if success else updated_status.get("last_error")
        )
    except Exception as e:
        logger.error(f"Failed to restart service {service_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === Service Information Endpoints ===

@router.get("/list")
async def list_services(
    state: Optional[str] = Query(None, description="Filter by state"),
    priority: Optional[int] = Query(None, description="Filter by priority (1-5)")
) -> List[Dict[str, Any]]:
    """
    List all registered services.

    Args:
        state: Optional filter by state (running, stopped, failed, etc.)
        priority: Optional filter by priority level (1=critical, 5=background)

    Returns:
        List of services with basic information
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status()

    services = []
    for name, service in status["services"].items():
        # Apply filters
        if state and service["state"] != state:
            continue
        if priority and service["priority"] != priority:
            continue

        services.append({
            "name": name,
            "display_name": service["display_name"],
            "description": service["description"],
            "state": service["state"],
            "priority": service["priority"],
            "is_optional": service["is_optional"],
            "healthy": service["health"]["healthy"]
        })

    # Sort by priority, then name
    services.sort(key=lambda s: (s["priority"], s["name"]))

    return services


@router.get("/dependencies/{service_name}")
async def get_service_dependencies(service_name: str) -> Dict[str, Any]:
    """
    Get dependency information for a service.

    Returns:
        - Direct dependencies
        - Services that depend on this service
        - Dependency chain visualization
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status()

    if service_name not in status["services"]:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    service = status["services"][service_name]

    # Find dependents (services that depend on this one)
    dependents = []
    for name, svc in status["services"].items():
        if service_name in svc["dependencies"]:
            dependents.append(name)

    return {
        "service": service_name,
        "dependencies": service["dependencies"],
        "dependents": dependents,
        "can_stop": len(dependents) == 0 or all(
            status["services"][d]["state"] == ServiceState.STOPPED.value
            for d in dependents
        ),
        "can_start": all(
            status["services"][d]["state"] == ServiceState.RUNNING.value
            for d in service["dependencies"]
            if d in status["services"]
        )
    }


@router.get("/metrics")
async def get_service_metrics() -> Dict[str, Any]:
    """
    Get aggregated metrics from all services.

    Returns combined metrics from all running services.
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status()

    metrics = {}
    for name, service in status["services"].items():
        if service["health"]["metrics"]:
            metrics[name] = service["health"]["metrics"]

    return {
        "orchestrator": {
            "uptime_seconds": status["orchestrator"]["uptime_seconds"],
            "running": status["orchestrator"]["running"]
        },
        "services": metrics
    }


# === Startup Order Endpoint ===

@router.get("/startup-order")
async def get_startup_order() -> Dict[str, Any]:
    """
    Get the calculated service startup order.

    Returns the order in which services will be started,
    based on their dependencies and priorities.
    """
    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status()
    dependency_map = orchestrator.get_startup_dependency_map()

    order_with_details = []
    for i, name in enumerate(status["startup_order"]):
        service = status["services"].get(name, {})
        order_with_details.append({
            "order": i + 1,
            "name": name,
            "display_name": service.get("display_name", name),
            "priority": service.get("priority"),
            "dependencies": service.get("dependencies", []),
            "is_optional": service.get("is_optional", False),
            "level": dependency_map["services"].get(name, {}).get("level"),
            "dependents": dependency_map["services"].get(name, {}).get("dependents", []),
            "gates_accepting_traffic": dependency_map["services"].get(name, {}).get("gates_accepting_traffic", False),
        })

    return {
        "startup_order": order_with_details,
        "shutdown_order": list(reversed([item["name"] for item in order_with_details])),
        "dependency_levels": dependency_map["dependency_levels"],
        "traffic_gate_services": dependency_map["traffic_gate_services"],
        "startup_progress": dependency_map["startup_progress"],
    }
