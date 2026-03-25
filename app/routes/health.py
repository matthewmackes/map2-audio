"""
Health Route Handlers
API endpoints for system health and metadata.
"""

try:
    from fastapi import APIRouter, Response
    import time
    import os

    from app.services.system_health_summary import build_system_health_snapshot
    from app.utils.platform_version import get_platform_version_payload

    router = APIRouter(prefix="/api", tags=["health"])
    start_time = time.time()

    @router.get("/health")
    async def health_check():
        """System health check with comprehensive metrics."""
        return await build_system_health_snapshot(start_time)

    @router.get("/version")
    async def get_version(response: Response):
        """Get application version."""
        response.headers["Cache-Control"] = "public, max-age=60"
        return get_platform_version_payload()

    @router.get("/config")
    async def get_config(response: Response):
        """Get system configuration."""
        response.headers["Cache-Control"] = "public, max-age=60"
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

            if status["accepting_traffic"]:
                return JSONResponse(
                    status_code=200,
                    content={
                        "ready": True,
                        "accepting_traffic": True,
                        "uptime_seconds": status["uptime_seconds"],
                        "critical_services": status["summary"],
                        "traffic_gate_services": status["traffic_gate_services"],
                    }
                )
            else:
                return JSONResponse(
                    status_code=503,
                    content={
                        "ready": False,
                        "accepting_traffic": False,
                        "issues": status["issues"],
                        "critical_services": status["critical_services"],
                        "traffic_gate_services": status["traffic_gate_services"],
                        "dependency_levels": status["dependency_levels"],
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
