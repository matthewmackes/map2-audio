"""
MAP2 Audio Cluster - Prometheus Metrics API Endpoint

FastAPI route for /metrics endpoint providing Prometheus-compatible metrics.
"""

from fastapi import APIRouter, Response, HTTPException
from typing import Callable, Optional
import logging

from app.services.cluster.prometheus_exporter import MetricsManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["prometheus"])

# Global metrics manager instance
_metrics_manager: Optional[MetricsManager] = None


def initialize_prometheus_metrics(
        get_node_data: Optional[Callable] = None,
        get_health_data: Optional[Callable] = None,
        get_update_data: Optional[Callable] = None) -> None:
    """
    Initialize Prometheus metrics manager with data providers.
    
    Call this during application startup to configure metrics collection.
    
    Args:
        get_node_data: Callable to get node data
        get_health_data: Callable to get health data
        get_update_data: Callable to get update data
    """
    global _metrics_manager
    
    _metrics_manager = MetricsManager()
    
    if get_node_data or get_health_data or get_update_data:
        _metrics_manager.set_data_providers(
            get_node_data=get_node_data,
            get_health_data=get_health_data,
            get_update_data=get_update_data
        )
    
    logger.info("Prometheus metrics initialized")


def get_prometheus_manager() -> MetricsManager:
    """Get Prometheus metrics manager instance."""
    global _metrics_manager
    
    if _metrics_manager is None:
        _metrics_manager = MetricsManager()
    
    return _metrics_manager


@router.get("/prometheus/metrics", response_class=Response)
async def get_prometheus_metrics() -> Response:
    """
    Get Prometheus-formatted metrics (standard /metrics endpoint).
    
    Returns:
        Response with Prometheus text format metrics
        
    Example:
        GET /api/prometheus/metrics
        
        # HELP map2_cluster_nodes_total Total number of nodes in the cluster
        # TYPE map2_cluster_nodes_total gauge
        map2_cluster_nodes_total 5 1707123456000
        
        # HELP map2_cluster_node_health_score Node health score (0-100)
        # TYPE map2_cluster_node_health_score gauge
        map2_cluster_node_health_score{node_id="node-1",hostname="audio-01"} 95 1707123456000
        
    See Also:
        - GET /api/prometheus/metrics/health
        - GET /api/prometheus/metrics/nodes
        - GET /api/prometheus/metrics/audio
    """
    try:
        manager = get_prometheus_manager()
        exposition = manager.get_exposition()
        
        return Response(
            content=exposition,
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating Prometheus metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/health", response_class=Response)
async def get_prometheus_health_metrics() -> Response:
    """
    Get health-specific metrics only.
    
    Returns:
        Response with health metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to health metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "health" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating health metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/nodes", response_class=Response)
async def get_prometheus_node_metrics() -> Response:
    """
    Get node-specific metrics only.
    
    Includes: availability, CPU, memory, audio, uptime
    
    Returns:
        Response with node metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to node metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "node" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating node metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/audio", response_class=Response)
async def get_prometheus_audio_metrics() -> Response:
    """
    Get audio-specific metrics only.
    
    Includes: DSP load, xruns, xrun rate, audio devices
    
    Returns:
        Response with audio metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to audio metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "audio" in line.lower() or "xrun" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating audio metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/network", response_class=Response)
async def get_prometheus_network_metrics() -> Response:
    """
    Get network-specific metrics only.
    
    Includes: latency, packet loss
    
    Returns:
        Response with network metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to network metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "latency" in line.lower() or "packet_loss" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating network metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/updates", response_class=Response)
async def get_prometheus_update_metrics() -> Response:
    """
    Get update operation metrics only.
    
    Includes: update success rate, pending updates
    
    Returns:
        Response with update metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to update metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "update" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating update metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")


@router.get("/prometheus/metrics/backups", response_class=Response)
async def get_prometheus_backup_metrics() -> Response:
    """
    Get backup operation metrics only.
    
    Includes: backup count, success rate, backup size, backup age
    
    Returns:
        Response with backup metrics in Prometheus format
    """
    try:
        manager = get_prometheus_manager()
        manager.collect_metrics()
        
        # Filter to backup metrics only
        lines = []
        exposition = manager.exporter.generate_exposition()
        
        for line in exposition.split("\n"):
            if "backup" in line.lower() or line.startswith("#"):
                lines.append(line)
        
        return Response(
            content="\n".join(lines) + "\n",
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error generating backup metrics: {e}")
        raise HTTPException(status_code=500, detail="Error generating metrics")
