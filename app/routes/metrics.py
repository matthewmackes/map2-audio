"""
Metrics and Monitoring API Routes
Provides endpoints for system metrics, performance monitoring, and Prometheus export.
"""

try:
    from fastapi import APIRouter
    from app.services.performance_metrics import get_metrics_collector
    from app.services.jack_audio import get_jack_client

    router = APIRouter(prefix="/api/metrics", tags=["metrics"])

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
        return {"history": collector.get_metrics_history("latency", limit)}

    @router.get("/prometheus")
    async def get_prometheus_metrics():
        """Export metrics in Prometheus format.
        
        Returns metrics in text/plain Prometheus format for scraping.
        """
        collector = await get_metrics_collector()
        return {"metrics": collector.export_prometheus()}

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
