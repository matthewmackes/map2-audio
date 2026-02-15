"""
Health Route Handlers
API endpoints for system health and metadata.
"""

try:
    from fastapi import APIRouter
    import time
    import psutil
    import os

    router = APIRouter(prefix="/api", tags=["health"])
    start_time = time.time()

    @router.get("/health")
    async def health_check():
        """System health check with comprehensive metrics."""
        uptime = time.time() - start_time

        # Get current process for memory
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / (1024 * 1024)  # Convert bytes to MB
        memory_percent = psutil.virtual_memory().percent

        # Get CPU percentage (interval=0.1 for quick sampling)
        cpu_percent = psutil.cpu_percent(interval=0.1)

        # Get service status from orchestrator
        audio_running = False
        plugins_loaded = 0
        services_running = 0
        services_total = 0
        dependency_errors = []
        try:
            from app.services.service_orchestrator import get_orchestrator
            orchestrator = get_orchestrator()
            status = orchestrator.get_all_status()

            # Count running services
            for service in status.get("services", {}).values():
                services_total += 1
                if service.get("state") == "running":
                    services_running += 1

            # Check audio engine specifically
            audio_status = orchestrator.get_service_status("audio_engine")
            if audio_status and audio_status.get("state") == "running":
                audio_running = True

            # Get plugin count
            plugin_status = orchestrator.get_service_status("plugin_loader")
            if plugin_status and plugin_status.get("health", {}).get("metrics"):
                plugins_loaded = plugin_status["health"]["metrics"].get("plugin_count", 0)
        except Exception as e:
            dependency_errors.append(f"service_orchestrator: {e}")

        # Get performance metrics info
        buffer_underruns = 0
        history_samples = 3600
        active_alerts = 0
        try:
            from app.services.performance_metrics import get_metrics_collector
            collector = get_metrics_collector()
            buffer_underruns = collector.buffer_underrun_count
            history_samples = collector.max_history
            active_alerts = len(collector.get_alerts())
        except Exception as e:
            dependency_errors.append(f"performance_metrics: {e}")

        # Get NAM status (via JUCE C++ engine, no GPU - uses CPU-based NeuralAmpModelerCore)
        nam_available = False
        gpu_device = None  # NAM no longer uses GPU (PyTorch removed, uses C++ inference)
        try:
            from app.services.nam_processor import NAM_AVAILABLE
            nam_available = NAM_AVAILABLE
        except Exception as e:
            dependency_errors.append(f"nam_processor: {e}")

        # Get IR processor status
        ir_available = False
        try:
            from app.services.ir_processor import SCIPY_AVAILABLE
            ir_available = SCIPY_AVAILABLE
        except Exception as e:
            dependency_errors.append(f"ir_processor: {e}")

        issues = []
        status = "healthy"

        if services_total == 0:
            issues.append("No orchestrator service data available")
        elif services_running < services_total:
            issues.append(
                f"Only {services_running}/{services_total} orchestrator services are running"
            )

        if not audio_running:
            issues.append("Audio engine service not running")

        if cpu_percent >= 95:
            issues.append(f"CPU usage critical ({cpu_percent:.1f}%)")
        elif cpu_percent >= 85:
            issues.append(f"CPU usage high ({cpu_percent:.1f}%)")

        if memory_percent >= 95:
            issues.append(f"Memory usage critical ({memory_percent:.1f}%)")
        elif memory_percent >= 85:
            issues.append(f"Memory usage high ({memory_percent:.1f}%)")

        if issues:
            status = "degraded"
        if services_total > 0 and services_running == 0:
            status = "critical"

        return {
            "status": status,
            "uptime_seconds": uptime,
            "cpu_percent": cpu_percent,
            "memory_mb": memory_mb,
            "memory_percent": memory_percent,
            "audio_running": audio_running,
            "plugins_loaded": plugins_loaded,
            "services_running": services_running,
            "services_total": services_total,
            # Performance monitoring
            "buffer_underruns": buffer_underruns,
            "history_samples": history_samples,
            "active_alerts": active_alerts,
            # Processing capabilities
            "nam_available": nam_available,
            "gpu_device": gpu_device,
            "ir_rt_safe": ir_available,
            "chain_morphing": True,
            "issues": issues,
            "dependency_errors": dependency_errors,
        }

    @router.get("/version")
    async def get_version():
        """Get application version."""
        return {
            "app": "Mackes Audio Platform V2",
            "version": "1.24.25.1",
            "api_version": "v1",
        }

    @router.get("/config")
    async def get_config():
        """Get system configuration."""
        return {
            "sample_rates": [44100, 48000, 96000],
            "buffer_sizes": [128, 256, 512, 1024],
            "max_channels": 2,
            "max_plugins": 32,
        }

    @router.get("/ready")
    async def ready_check():
        """
        Kubernetes-style readiness probe.

        Returns 200 if all critical services are running and healthy.
        Returns 503 if system is not ready to accept traffic.

        Use this endpoint for load balancer health checks.
        """
        from fastapi.responses import JSONResponse
        from app.services.service_orchestrator import get_orchestrator

        try:
            orchestrator = get_orchestrator()
            status = orchestrator.get_ready_status()

            if status["ready"]:
                return JSONResponse(
                    status_code=200,
                    content={
                        "ready": True,
                        "uptime_seconds": status["uptime_seconds"],
                        "critical_services": status["summary"],
                    }
                )
            else:
                return JSONResponse(
                    status_code=503,
                    content={
                        "ready": False,
                        "issues": status["issues"],
                        "critical_services": status["critical_services"],
                    }
                )
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={
                    "ready": False,
                    "error": str(e),
                }
            )

    @router.get("/live")
    async def liveness_check():
        """
        Kubernetes-style liveness probe.

        Returns 200 if the process is alive and responding.
        This is a lightweight check that doesn't validate service health.

        Use this endpoint for container orchestration restart decisions.
        """
        return {
            "alive": True,
            "uptime_seconds": time.time() - start_time,
            "pid": os.getpid(),
        }

    @router.get("/startup")
    async def startup_check():
        """
        Kubernetes-style startup probe.

        Returns 200 once the orchestrator has completed initial startup.
        Returns 503 during startup phase.

        Use this endpoint to delay readiness/liveness checks during slow startups.
        """
        from fastapi.responses import JSONResponse
        from app.services.service_orchestrator import get_orchestrator

        try:
            orchestrator = get_orchestrator()
            status = orchestrator.get_all_status()

            if status["orchestrator"]["running"]:
                return JSONResponse(
                    status_code=200,
                    content={
                        "started": True,
                        "startup_time": status["orchestrator"]["startup_time"],
                        "uptime_seconds": status["orchestrator"]["uptime_seconds"],
                    }
                )
            else:
                return JSONResponse(
                    status_code=503,
                    content={
                        "started": False,
                        "message": "Orchestrator not yet started",
                    }
                )
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={
                    "started": False,
                    "error": str(e),
                }
            )

except ImportError:
    router = None
