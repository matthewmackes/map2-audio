# Prometheus Metrics Exporter
# Exports system metrics in Prometheus format for integration with monitoring stacks

from fastapi import APIRouter, Response
from typing import Dict, List
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/metrics", tags=["metrics"])


class PrometheusMetrics:
    """Prometheus metrics exporter"""

    @staticmethod
    def format_metric(
        name: str,
        value: float,
        labels: Dict[str, str] = None,
        help_text: str = "",
        metric_type: str = "gauge",
    ) -> str:
        """Format a single metric in Prometheus text format"""
        lines = []

        if help_text:
            lines.append(f"# HELP {name} {help_text}")

        lines.append(f"# TYPE {name} {metric_type}")

        if labels:
            label_str = ",".join([f'{k}="{v}"' for k, v in labels.items()])
            lines.append(f'{name}{{{label_str}}} {value}')
        else:
            lines.append(f"{name} {value}")

        return "\n".join(lines)

    @staticmethod
    def generate_system_metrics(health_data: dict, disk_data: dict) -> str:
        """Generate all system metrics in Prometheus format"""
        metrics = []

        # Temperature metrics
        metrics.append(
            PrometheusMetrics.format_metric(
                "system_cpu_temperature_celsius",
                health_data.get("cpu_temp_celsius", 0),
                help_text="Current CPU temperature in Celsius",
            )
        )

        metrics.append(
            PrometheusMetrics.format_metric(
                "system_cpu_temperature_max_celsius",
                health_data.get("max_temp_celsius", 0),
                help_text="Maximum CPU temperature in Celsius",
            )
        )

        # CPU metrics
        metrics.append(
            PrometheusMetrics.format_metric(
                "system_cpu_usage_percent",
                health_data.get("cpu_usage_percent", 0),
                help_text="CPU usage percentage (0-100)",
            )
        )

        # Memory metrics
        metrics.append(
            PrometheusMetrics.format_metric(
                "system_memory_usage_percent",
                health_data.get("memory_usage_percent", 0),
                help_text="Memory usage percentage (0-100)",
            )
        )

        # Disk metrics per device
        for disk in disk_data.get("disks", []):
            device = disk.get("device", "unknown")
            labels = {"device": device}

            metrics.append(
                PrometheusMetrics.format_metric(
                    "system_disk_total_mb",
                    disk.get("size_mb", 0),
                    labels=labels,
                    help_text="Total disk space in MB",
                )
            )

            metrics.append(
                PrometheusMetrics.format_metric(
                    "system_disk_used_mb",
                    disk.get("used_mb", 0),
                    labels=labels,
                    help_text="Used disk space in MB",
                )
            )

            metrics.append(
                PrometheusMetrics.format_metric(
                    "system_disk_available_mb",
                    disk.get("available_mb", 0),
                    labels=labels,
                    help_text="Available disk space in MB",
                )
            )

            metrics.append(
                PrometheusMetrics.format_metric(
                    "system_disk_usage_percent",
                    disk.get("use_percent", 0),
                    labels=labels,
                    help_text="Disk usage percentage (0-100)",
                )
            )

            # Health status as numeric
            health_map = {"good": 1, "warning": 2, "critical": 3}
            health_status = health_map.get(disk.get("overall_health", "good"), 0)

            metrics.append(
                PrometheusMetrics.format_metric(
                    "system_disk_health_status",
                    health_status,
                    labels=labels,
                    help_text="Disk health status (1=good, 2=warning, 3=critical)",
                )
            )

        # Timestamp
        metrics.append(
            PrometheusMetrics.format_metric(
                "system_metrics_timestamp_seconds",
                datetime.now().timestamp(),
                help_text="Unix timestamp of metrics collection",
            )
        )

        return "\n\n".join(metrics)


@router.get("/prometheus", response_class=Response)
async def prometheus_metrics(
    # Inject dependencies as needed
) -> Response:
    """
    Prometheus metrics endpoint
    
    Returns metrics in Prometheus text format (0.0.4)
    Compatible with Prometheus, Grafana, and other monitoring tools
    
    Example:
    ```
    system_cpu_temperature_celsius 52.3
    system_cpu_usage_percent 35
    system_memory_usage_percent 62
    system_disk_usage_percent{device="/dev/sda"} 70
    ```
    """
    try:
        # Get current metrics (would come from your data source)
        from app.routes.system import get_health_overview, get_disk_health

        health_data = await get_health_overview()
        disk_data = await get_disk_health()

        # Generate Prometheus format
        prometheus_text = PrometheusMetrics.generate_system_metrics(health_data, disk_data)

        return Response(content=prometheus_text, media_type="text/plain; version=0.0.4")

    except Exception as e:
        logger.error(f"Failed to generate Prometheus metrics: {e}")
        return Response(
            content="# Error generating metrics\n",
            media_type="text/plain",
            status_code=500,
        )


@router.get("/prometheus/health", response_class=Response)
async def prometheus_health_check() -> Response:
    """Health check endpoint for Prometheus scraper"""
    return Response(content="# Prometheus health check OK\n", media_type="text/plain")


@router.get("/metrics/export-json")
async def export_metrics_json() -> dict:
    """
    Export metrics in JSON format
    Useful for webhooks and custom integrations
    """
    from app.routes.system import get_health_overview, get_disk_health

    health_data = await get_health_overview()
    disk_data = await get_disk_health()

    return {
        "timestamp": datetime.now().isoformat(),
        "system": {
            "temperature": {
                "current_celsius": health_data.get("cpu_temp_celsius", 0),
                "max_celsius": health_data.get("max_temp_celsius", 0),
            },
            "cpu": {"usage_percent": health_data.get("cpu_usage_percent", 0)},
            "memory": {"usage_percent": health_data.get("memory_usage_percent", 0)},
            "disks": disk_data.get("disks", []),
        },
    }


@router.get("/metrics/summary")
async def get_metrics_summary() -> dict:
    """Get high-level metrics summary for dashboards"""
    from app.routes.system import get_health_overview, get_disk_health

    health_data = await get_health_overview()
    disk_data = await get_disk_health()

    # Calculate disk statistics
    total_disk_size = sum(d.get("size_mb", 0) for d in disk_data.get("disks", []))
    total_disk_used = sum(d.get("used_mb", 0) for d in disk_data.get("disks", []))
    avg_disk_usage = (
        (total_disk_used / total_disk_size * 100) if total_disk_size > 0 else 0
    )

    return {
        "summary": {
            "status": "healthy",
            "last_updated": datetime.now().isoformat(),
        },
        "temperature": {
            "current": health_data.get("cpu_temp_celsius", 0),
            "max": health_data.get("max_temp_celsius", 0),
            "unit": "celsius",
        },
        "cpu": {
            "usage_percent": health_data.get("cpu_usage_percent", 0),
        },
        "memory": {
            "usage_percent": health_data.get("memory_usage_percent", 0),
        },
        "disk": {
            "total_size_mb": total_disk_size,
            "total_used_mb": total_disk_used,
            "average_usage_percent": avg_disk_usage,
            "device_count": len(disk_data.get("disks", [])),
        },
    }


# Docker Compose example for Prometheus scraping:
"""
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

prometheus.yml:
  global:
    scrape_interval: 15s
    
  scrape_configs:
    - job_name: 'map2-host-machine'
      static_configs:
        - targets: ['localhost:8000']
      metrics_path: '/api/metrics/prometheus'
      scrape_interval: 10s
"""
