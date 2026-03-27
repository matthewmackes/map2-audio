"""
Audio Diagnostics Route Handlers
Unified API for xrun detection, latency measurement, connection health,
and PipeWire recovery.

Endpoints:
  GET  /api/audio/diagnostics       - Full diagnostic snapshot
  GET  /api/audio/diagnostics/xruns - Xrun stats and history
  GET  /api/audio/diagnostics/latency - Latency breakdown (computed + measured)
  GET  /api/audio/diagnostics/health  - Connection health
  GET  /api/audio/diagnostics/recovery - PipeWire recovery status
  POST /api/audio/diagnostics/recovery/trigger - Force recovery
  POST /api/audio/diagnostics/xruns/reset - Reset xrun counter
  POST /api/audio/diagnostics/latency/set-measured - Report measured latency
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    import asyncio
    import time
    import subprocess
    import json
    import logging
    import os

    logger = logging.getLogger("map2.routes.audio_diagnostics")
    router = APIRouter(prefix="/api/audio/diagnostics", tags=["audio-diagnostics"])

    def _get_engine():
        """Get the JUCE engine instance."""
        try:
            from app.services.juce_engine_service import get_audio_engine
            svc = get_audio_engine()
            return svc.engine if svc and hasattr(svc, "engine") else None
        except Exception:
            return None

    def _get_recovery_service():
        """Get the PipeWire recovery service."""
        try:
            from app.services.pipewire_recovery import get_pipewire_recovery_service
            return get_pipewire_recovery_service()
        except Exception:
            return None

    @router.get("")
    async def get_full_diagnostics():
        """
        Full audio diagnostic snapshot combining xruns, latency,
        connection health, and PipeWire recovery state.
        """
        engine = _get_engine()
        recovery = _get_recovery_service()

        result = {
            "timestamp": time.time(),
            "engine_available": engine is not None,
        }

        # Audio I/O stats
        if engine is not None:
            try:
                stats = engine.get_audio_io_stats()
                result["io_stats"] = stats
            except Exception as e:
                result["io_stats_error"] = str(e)

            try:
                result["connection_health"] = engine.get_connection_health()
            except Exception as e:
                result["connection_health_error"] = str(e)

            try:
                result["cpu_metrics"] = engine.get_cpu_metrics()
            except Exception as e:
                result["cpu_metrics_error"] = str(e)

            try:
                result["latency"] = {
                    "chain_latency_samples": engine.get_total_latency_samples(),
                    "chain_latency_ms": engine.get_total_latency_ms(),
                    "device_reported_ms": engine.get_device_reported_latency_ms(),
                    "breakdown": engine.get_latency_breakdown(),
                }
            except Exception as e:
                result["latency_error"] = str(e)

        # PipeWire recovery state
        if recovery:
            result["recovery"] = recovery.get_status()

        return result

    @router.get("/xruns")
    async def get_xrun_stats():
        """Get xrun statistics and history."""
        engine = _get_engine()
        if engine is None:
            raise HTTPException(503, "Audio engine not available")

        try:
            stats = engine.get_audio_io_stats()
            history = engine.get_xrun_history()

            return {
                "xrun_count": stats.get("xrun_count", 0),
                "xruns_since_reset": stats.get("xruns_since_reset", 0),
                "last_xrun_timestamp": stats.get("last_xrun_timestamp", 0),
                "callback_jitter_ms": round(stats.get("callback_jitter_ms", 0), 3),
                "peak_callback_jitter_ms": round(stats.get("peak_callback_jitter_ms", 0), 3),
                "budget_utilization": round(stats.get("budget_utilization", 0), 1),
                "history": history,  # Last 64 xrun timestamps
            }
        except Exception as e:
            raise HTTPException(500, f"Failed to get xrun stats: {e}")

    @router.get("/latency")
    async def get_latency_info():
        """Get comprehensive latency breakdown."""
        engine = _get_engine()
        if engine is None:
            raise HTTPException(503, "Audio engine not available")

        try:
            stats = engine.get_audio_io_stats()

            result = {
                # Buffer/processing latency
                "buffer_latency_ms": round(stats.get("latency_ms", 0), 3),
                "callback_budget_ms": round(stats.get("callback_budget_ms", 0), 3),
                "avg_callback_duration_ms": round(stats.get("avg_callback_duration_ms", 0), 3),
                # Device-reported
                "device_input_latency_ms": round(stats.get("measured_input_latency_ms", 0), 3),
                "device_output_latency_ms": round(stats.get("measured_output_latency_ms", 0), 3),
                "device_total_latency_ms": round(engine.get_device_reported_latency_ms(), 3),
                # Chain latency
                "chain_latency_samples": engine.get_total_latency_samples(),
                "chain_latency_ms": round(engine.get_total_latency_ms(), 3),
                "per_plugin_latency": engine.get_latency_breakdown(),
                # Measured (from loopback test)
                "measured_round_trip_ms": stats.get("measured_round_trip_ms", -1),
            }

            # Try to load last measurement from script
            try:
                with open("/tmp/map2_latency_results.json") as f:
                    result["last_measurement"] = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                result["last_measurement"] = None

            return result
        except Exception as e:
            raise HTTPException(500, f"Failed to get latency info: {e}")

    @router.get("/health")
    async def get_audio_health():
        """Get audio device connection health."""
        engine = _get_engine()
        if engine is None:
            raise HTTPException(503, "Audio engine not available")

        try:
            health = engine.get_connection_health()
            stats = engine.get_audio_io_stats()

            return {
                **health,
                "uptime_seconds": round(stats.get("uptime_seconds", 0), 1),
                "cpu_usage": round(stats.get("cpu_usage", 0), 1),
                "samples_processed": stats.get("samples_processed", 0),
            }
        except Exception as e:
            raise HTTPException(500, f"Failed to get health: {e}")

    @router.get("/recovery")
    async def get_recovery_status():
        """Get PipeWire recovery service status."""
        recovery = _get_recovery_service()
        if recovery is None:
            return {
                "available": False,
                "message": "PipeWire recovery service not initialized"
            }
        return {
            "available": True,
            **recovery.get_status()
        }

    class RecoveryRequest(BaseModel):
        level: str = "auto"  # auto, soft, reconnect, restart, full

    @router.post("/recovery/trigger")
    async def trigger_recovery(request: RecoveryRequest):
        """Manually trigger PipeWire recovery at a specific level."""
        recovery = _get_recovery_service()
        if recovery is None:
            raise HTTPException(503, "Recovery service not available")

        result = await recovery.force_recovery(request.level)
        return result

    @router.post("/xruns/reset")
    async def reset_xrun_counter():
        """Reset the xrun counter."""
        engine = _get_engine()
        if engine is None:
            raise HTTPException(503, "Audio engine not available")

        engine.reset_xrun_counter()
        return {"status": "ok", "message": "Xrun counter reset"}

    class MeasuredLatencyRequest(BaseModel):
        round_trip_ms: float

    @router.post("/latency/set-measured")
    async def set_measured_latency(request: MeasuredLatencyRequest):
        """Report measured round-trip latency from loopback test."""
        engine = _get_engine()
        if engine is None:
            raise HTTPException(503, "Audio engine not available")

        if request.round_trip_ms < 0:
            raise HTTPException(400, "Latency must be non-negative")

        engine.set_measured_round_trip_latency(request.round_trip_ms)
        return {
            "status": "ok",
            "measured_round_trip_ms": request.round_trip_ms
        }

    @router.post("/latency/measure")
    async def run_latency_measurement(mode: str = "internal", duration: int = 5):
        """
        Run the latency measurement script.

        Modes:
        - internal: estimated latency (no loopback cable required)
        - loopback: measured round-trip latency using loopback cable
        """
        try:
            script_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "scripts",
                "measure_latency.sh",
            )

            if not os.path.exists(script_path):
                raise HTTPException(500, "Latency measurement script not found")

            mode = (mode or "internal").strip().lower()
            if mode not in {"internal", "loopback"}:
                raise HTTPException(400, "mode must be one of: internal, loopback")

            if duration < 1 or duration > 30:
                raise HTTPException(400, "duration must be between 1 and 30 seconds")

            args = [script_path, "--json", "--duration", str(duration)]
            if mode == "internal":
                args.insert(1, "--internal")

            proc = await asyncio.to_thread(subprocess.run,
                args,
                capture_output=True, text=True, timeout=30
            )
            if proc.returncode == 0 and proc.stdout.strip():
                data = json.loads(proc.stdout.strip())
                data["mode"] = mode
                return data
            else:
                return {
                    "status": "error",
                    "mode": mode,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr
                }
        except HTTPException:
            raise
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Measurement timed out")
        except Exception as e:
            raise HTTPException(500, f"Measurement failed: {e}")

except ImportError:
    # Graceful degradation if FastAPI not available
    pass
