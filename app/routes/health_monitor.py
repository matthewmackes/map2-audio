"""
Health Monitoring API Endpoints - Phase 2

Extended health monitoring endpoints for real-time dashboards and monitoring systems.
These extend the basic health.py with:
- Detailed service metrics
- Historical data retention
- Alert generation and notification
- Dependency tracking
- WebSocket integration (for live updates)
"""

from fastapi import APIRouter, HTTPException, Query, WebSocket
from typing import Optional, Dict, Any
from datetime import datetime
import json
import asyncio
import logging

from app.services.health_monitor import (
    get_health_monitor, HealthStatus, ServiceMetrics, Alert
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health-monitor", tags=["health-monitor"])


# ============================================================================
# BASIC STATUS ENDPOINTS
# ============================================================================

@router.get("/status")
async def get_health_status() -> Dict[str, Any]:
    """Get system health status summary."""
    monitor = get_health_monitor()
    summary = monitor.get_system_health_summary()
    return summary


@router.get("/overall")
async def get_overall_status() -> Dict[str, str]:
    """Get overall system status (quick endpoint)."""
    monitor = get_health_monitor()
    status = monitor.get_overall_status()
    
    return {
        "status": status.value,
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# SERVICE-SPECIFIC ENDPOINTS
# ============================================================================

@router.get("/services")
async def list_all_services() -> Dict[str, Any]:
    """List all monitored services with current metrics."""
    monitor = get_health_monitor()
    services = monitor.get_all_services_status()
    
    if not services:
        return {
            "services": {},
            "count": 0,
            "timestamp": datetime.now().isoformat()
        }
    
    return {
        "count": len(services),
        "timestamp": datetime.now().isoformat(),
        "services": {
            name: {
                "status": m.status.value,
                "response_time_ms": m.response_time_ms,
                "error_rate": m.error_rate,
                "success_rate": m.success_rate,
                "memory_mb": m.memory_mb,
                "cpu_percent": m.cpu_percent,
                "uptime_seconds": m.uptime_seconds,
                "request_count": m.request_count,
                "error_count": m.error_count,
                "last_updated": m.timestamp.isoformat()
            }
            for name, m in services.items()
        }
    }


@router.get("/services/{service_name}")
async def get_service_status(service_name: str) -> Dict[str, Any]:
    """Get detailed status for specific service."""
    monitor = get_health_monitor()
    metrics = monitor.get_service_status(service_name)
    
    if not metrics:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")
    
    return {
        "service": service_name,
        "status": metrics.status.value,
        "metrics": {
            "response_time_ms": metrics.response_time_ms,
            "error_rate": metrics.error_rate,
            "success_rate": metrics.success_rate,
            "memory_mb": metrics.memory_mb,
            "cpu_percent": metrics.cpu_percent,
            "uptime_seconds": metrics.uptime_seconds,
            "request_count": metrics.request_count,
            "error_count": metrics.error_count
        },
        "dependencies": {
            name: status.value
            for name, status in metrics.dependencies.items()
        },
        "last_error": metrics.last_error,
        "last_updated": metrics.timestamp.isoformat()
    }


# ============================================================================
# HISTORICAL DATA ENDPOINTS
# ============================================================================

@router.get("/services/{service_name}/history")
async def get_service_history(
    service_name: str,
    hours: int = Query(1, ge=1, le=24, description="Hours of history to retrieve")
) -> Dict[str, Any]:
    """Get historical metrics for a service (for charts/graphs)."""
    monitor = get_health_monitor()
    
    # Verify service exists
    if not monitor.get_service_status(service_name):
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")
    
    history = monitor.get_service_history(service_name, hours=hours)
    
    if not history:
        return {
            "service": service_name,
            "hours": hours,
            "data_points": 0,
            "history": []
        }
    
    return {
        "service": service_name,
        "hours": hours,
        "data_points": len(history),
        "history": [
            {
                "timestamp": m.timestamp.isoformat(),
                "status": m.status.value,
                "response_time_ms": m.response_time_ms,
                "error_rate": m.error_rate,
                "memory_mb": m.memory_mb,
                "cpu_percent": m.cpu_percent
            }
            for m in history
        ]
    }


# ============================================================================
# ALERTS ENDPOINTS
# ============================================================================

@router.get("/alerts")
async def get_active_alerts(
    service_name: Optional[str] = Query(None, description="Filter alerts by service")
) -> Dict[str, Any]:
    """Get active alerts."""
    monitor = get_health_monitor()
    alerts = monitor.get_active_alerts(service_name)
    
    return {
        "timestamp": datetime.now().isoformat(),
        "count": len(alerts),
        "alerts": [
            {
                "service": a.service_name,
                "rule": a.alert_rule_name,
                "metric": a.metric,
                "value": a.value,
                "threshold": a.threshold,
                "severity": a.severity,
                "message": a.message,
                "timestamp": a.timestamp.isoformat()
            }
            for a in alerts
        ]
    }


@router.get("/alerts/history")
async def get_alerts_history(
    limit: int = Query(50, ge=1, le=1000, description="Max alerts to return"),
    severity: Optional[str] = Query(None, description="Filter by severity: info, warning, critical")
) -> Dict[str, Any]:
    """Get alert history."""
    monitor = get_health_monitor()
    alerts = monitor.get_alert_history(limit=limit)
    
    # Filter by severity if specified
    if severity:
        alerts = [a for a in alerts if a.severity == severity]
    
    return {
        "timestamp": datetime.now().isoformat(),
        "count": len(alerts),
        "alerts": [
            {
                "service": a.service_name,
                "rule": a.alert_rule_name,
                "metric": a.metric,
                "value": a.value,
                "threshold": a.threshold,
                "severity": a.severity,
                "message": a.message,
                "timestamp": a.timestamp.isoformat()
            }
            for a in alerts
        ]
    }


# ============================================================================
# DEPENDENCY AND RELATIONSHIP ENDPOINTS
# ============================================================================

@router.get("/dependencies")
async def get_service_dependencies() -> Dict[str, Any]:
    """Get service dependency graph."""
    monitor = get_health_monitor()
    graph = monitor.get_dependency_graph()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "graph": graph
    }


@router.get("/services/{service_name}/dependencies")
async def get_service_dependencies_detail(service_name: str) -> Dict[str, Any]:
    """Get dependencies for specific service."""
    monitor = get_health_monitor()
    metrics = monitor.get_service_status(service_name)
    
    if not metrics:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")
    
    return {
        "service": service_name,
        "dependencies": {
            name: status.value
            for name, status in metrics.dependencies.items()
        },
        "total_dependencies": len(metrics.dependencies),
        "healthy_dependencies": sum(
            1 for s in metrics.dependencies.values()
            if s == HealthStatus.HEALTHY
        ),
        "timestamp": metrics.timestamp.isoformat()
    }


# ============================================================================
# STATISTICS ENDPOINTS
# ============================================================================

@router.get("/stats")
async def get_health_statistics() -> Dict[str, Any]:
    """Get comprehensive health statistics."""
    monitor = get_health_monitor()
    services = monitor.get_all_services_status()
    
    if not services:
        return {
            "total_services": 0,
            "status_distribution": {
                "healthy": 0,
                "degraded": 0,
                "critical": 0,
                "offline": 0
            },
            "average_metrics": {
                "response_time_ms": 0,
                "error_rate": 0,
                "memory_mb": 0,
                "cpu_percent": 0
            },
            "active_alerts": 0,
            "timestamp": datetime.now().isoformat()
        }
    
    return {
        "total_services": len(services),
        "status_distribution": {
            "healthy": sum(1 for m in services.values() if m.status == HealthStatus.HEALTHY),
            "degraded": sum(1 for m in services.values() if m.status == HealthStatus.DEGRADED),
            "critical": sum(1 for m in services.values() if m.status == HealthStatus.CRITICAL),
            "offline": sum(1 for m in services.values() if m.status == HealthStatus.OFFLINE),
        },
        "average_metrics": {
            "response_time_ms": sum(m.response_time_ms for m in services.values()) / len(services),
            "error_rate": sum(m.error_rate for m in services.values()) / len(services),
            "memory_mb": sum(m.memory_mb for m in services.values()) / len(services),
            "cpu_percent": sum(m.cpu_percent for m in services.values()) / len(services),
        },
        "active_alerts": len(monitor.get_active_alerts()),
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# DASHBOARD SUMMARY ENDPOINT
# ============================================================================

@router.get("/dashboard")
async def get_dashboard_data() -> Dict[str, Any]:
    """
    Get all data needed for a health dashboard.
    
    Combines status, alerts, and statistics in one response.
    """
    monitor = get_health_monitor()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "overall_status": monitor.get_overall_status().value,
        "summary": monitor.get_system_health_summary(),
        "services_count": len(monitor.get_all_services_status()),
        "active_alerts": [
            {
                "service": a.service_name,
                "rule": a.alert_rule_name,
                "severity": a.severity,
                "message": a.message,
                "timestamp": a.timestamp.isoformat()
            }
            for a in monitor.get_active_alerts()
        ]
    }


# ============================================================================
# WEBSOCKET ENDPOINT FOR LIVE UPDATES
# ============================================================================

# Store active WebSocket connections for broadcasting
_ws_connections: set = set()


@router.websocket("/ws")
async def websocket_health_updates(websocket: WebSocket):
    """
    WebSocket endpoint for real-time health updates.
    
    Sends health status updates every 5 seconds or on significant changes.
    """
    await websocket.accept()
    _ws_connections.add(websocket)
    monitor = get_health_monitor()
    
    try:
        # Send initial status
        status = {
            "type": "initial",
            "data": monitor.get_system_health_summary()
        }
        await websocket.send_json(status)
        
        # Send periodic updates
        while True:
            await asyncio.sleep(5)  # Update every 5 seconds
            
            update = {
                "type": "health_update",
                "timestamp": datetime.now().isoformat(),
                "data": monitor.get_system_health_summary()
            }
            
            try:
                await websocket.send_json(update)
            except Exception as e:
                logger.error(f"Error sending WebSocket update: {e}")
                break
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    
    finally:
        _ws_connections.discard(websocket)
        try:
            await websocket.close()
        except:
            pass


async def broadcast_health_alert(alert: Alert):
    """Broadcast alert to all connected WebSocket clients."""
    message = {
        "type": "alert",
        "alert": {
            "service": alert.service_name,
            "rule": alert.alert_rule_name,
            "severity": alert.severity,
            "message": alert.message,
            "timestamp": alert.timestamp.isoformat()
        }
    }
    
    for ws in _ws_connections:
        try:
            await ws.send_json(message)
        except Exception as e:
            logger.error(f"Error broadcasting alert: {e}")
