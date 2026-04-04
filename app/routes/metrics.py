"""
Metrics and Monitoring API Routes
Provides endpoints for system metrics, performance monitoring, and Prometheus export.
"""

try:
    import json

    from fastapi import APIRouter, Response
    from app.deployment.deployment import get_deployment_config
    from app.services.performance_metrics import get_metrics_collector
    from app.services.request_latency_metrics import get_request_latency_collector
    from app.services.jack_audio import get_jack_client

    router = APIRouter(prefix="/api/metrics", tags=["metrics"])

    def _parse_json_list(value):
        """Return a JSON-backed list field from the cluster registry."""
        if isinstance(value, list):
            return value
        if not value:
            return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    def _build_cluster_node_data():
        """Build cluster node payloads for Prometheus export."""
        from app.services.cluster.registry import get_cluster_registry
        from app.services.cluster.health_aggregator import get_health_aggregator

        registry = get_cluster_registry()
        aggregator = get_health_aggregator()
        health = aggregator.get_cluster_health()
        node_health = health.get("nodes", {}) if isinstance(health, dict) else {}

        nodes = []
        for node in registry.get_all_nodes():
            node_id = node.get("id", "unknown")
            metrics = node_health.get(node_id, {})
            memory_total_bytes = int(node.get("total_memory_gb", 0) or 0) * (1024 ** 3)
            memory_percent = float(metrics.get("memory_percent", 0.0) or 0.0)
            nodes.append(
                {
                    "id": node_id,
                    "hostname": node.get("hostname", node_id),
                    "role": node.get("role", "unknown"),
                    "status": node.get("status", "unknown"),
                    "cpu_usage": float(metrics.get("cpu_percent", 0.0) or 0.0),
                    "cpu_cores": int(node.get("cpu_cores", 0) or 0),
                    "memory_usage": (memory_total_bytes * memory_percent / 100.0)
                    if memory_total_bytes
                    else 0.0,
                    "memory_total": memory_total_bytes if memory_total_bytes > 0 else 1,
                    "audio_dsp_load": float(metrics.get("dsp_load_percent", 0.0) or 0.0),
                    "xruns": int(metrics.get("xrun_count", 0) or 0),
                    "xrun_rate": float(metrics.get("xrun_rate", 0.0) or 0.0),
                    "audio_devices": len(_parse_json_list(node.get("audio_devices"))),
                    "uptime": 0.0,
                }
            )
        return nodes

    def _build_cluster_health_data():
        """Build cluster health payload for Prometheus export."""
        from app.services.cluster.registry import get_cluster_registry
        from app.services.cluster.health_aggregator import get_health_aggregator

        registry = get_cluster_registry()
        aggregator = get_health_aggregator()
        health = aggregator.get_cluster_health()
        registry_nodes = {
            node.get("id"): node.get("hostname", node.get("id", "unknown"))
            for node in registry.get_all_nodes()
        }
        node_payload = {}
        for node_id, metrics in (health.get("nodes", {}) or {}).items():
            node_payload[node_id] = {
                "score": float(metrics.get("health_score", 0.0) or 0.0),
                "hostname": registry_nodes.get(node_id, node_id),
            }
        return {
            "overall_score": float(health.get("overall_health", 0.0) or 0.0),
            "nodes": node_payload,
        }

    def _build_cluster_update_data():
        """Build update summary payload for Prometheus export."""
        from app.services.cluster.update_orchestrator import get_update_scheduler

        progress = get_update_scheduler().get_current_progress() or {}
        completed = int(progress.get("completed_nodes", 0) or 0)
        failed = int(progress.get("failed_nodes", 0) or 0)
        successful = max(completed - failed, 0)
        return {
            "total": int(progress.get("total_nodes", 0) or 0),
            "successful": successful,
            "pending": int(progress.get("remaining_nodes", 0) or 0),
        }

    def _build_cluster_prometheus_metrics() -> str:
        """
        Export cluster-level metrics only from management-plane nodes.

        Audio nodes keep their runtime exporter but do not host the heavy local
        monitoring stack, so they return only local MAP2 metrics.
        """
        if not get_deployment_config().hosts_monitoring_stack():
            return ""

        try:
            from app.services.cluster.prometheus_exporter import get_prometheus_exporter

            exporter = get_prometheus_exporter()
            exporter.set_data_providers(
                get_node_data=_build_cluster_node_data,
                get_health_data=_build_cluster_health_data,
                get_update_data=_build_cluster_update_data,
            )
            return exporter.get_exposition()
        except Exception:
            return ""

    @router.get("/current")
    async def get_current_metrics():
        """Get current system metrics.
        
        Returns JSON with CPU, memory, audio samples, uptime.
        """
        collector = await get_metrics_collector()
        metrics = await collector.collect_metrics()
        return metrics

    @router.get("/summary")
    async def get_metrics_summary():
        """Get metrics summary with averages, min, max.
        
        Returns summary statistics for CPU, memory, latency.
        """
        collector = await get_metrics_collector()
        return collector.get_summary()

    @router.get("/cpu")
    async def get_cpu_history(limit: int = 60):
        """Get CPU usage history.
        
        Args:
            limit: Number of samples to return (default 60)
            
        Returns list of CPU samples with timestamps.
        """
        collector = await get_metrics_collector()
        return {"history": collector.get_metrics_history("cpu", limit)}

    @router.get("/memory")
    async def get_memory_history(limit: int = 60):
        """Get memory usage history.
        
        Args:
            limit: Number of samples to return (default 60)
            
        Returns list of memory samples with timestamps.
        """
        collector = await get_metrics_collector()
        return {"history": collector.get_metrics_history("memory", limit)}

    @router.get("/latency")
    async def get_latency_history(limit: int = 60):
        """Get audio latency history.
        
        Args:
            limit: Number of samples to return (default 60)
            
        Returns list of latency samples in milliseconds.
        """
        collector = await get_metrics_collector()
        route_latency = get_request_latency_collector().snapshot()
        return {
            "history": collector.get_metrics_history("latency", limit),
            "routes": route_latency,
        }

    @router.get("/prometheus")
    async def get_prometheus_metrics():
        """Export metrics in Prometheus format.
        
        Returns metrics in text/plain Prometheus format for scraping.
        """
        collector = await get_metrics_collector()
        payloads = [collector.export_prometheus().strip()]
        cluster_metrics = _build_cluster_prometheus_metrics().strip()
        if cluster_metrics:
            payloads.append(cluster_metrics)
        content = "\n\n".join(part for part in payloads if part).strip() + "\n"
        return Response(
            content=content,
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    @router.get("/export")
    async def export_metrics_json():
        """Export all metrics as JSON.
        
        Returns complete metrics with history.
        """
        collector = await get_metrics_collector()
        return {
            "timestamp": collector.start_time.isoformat(),
            "current": collector.get_current_metrics(),
            "summary": collector.get_summary()
        }

    @router.get("/jack")
    async def get_jack_metrics():
        """Get JACK audio server metrics.
        
        Returns JACK server info if connected.
        """
        jack_client = await get_jack_client()
        return await jack_client.get_server_info()

    @router.get("/jack/latency")
    async def get_jack_latency():
        """Get JACK latency metrics.
        
        Returns current JACK latency in frames and milliseconds.
        """
        jack_client = await get_jack_client()
        if not jack_client.is_connected:
            return {"error": "Not connected to JACK"}
        
        latency_frames = await jack_client.get_latency_frames()
        latency_ms = await jack_client.get_latency_ms()
        
        return {
            "frames": latency_frames,
            "milliseconds": latency_ms,
            "sample_rate": jack_client.sample_rate,
            "buffer_size": jack_client.buffer_size
        }

except ImportError:
    router = None
