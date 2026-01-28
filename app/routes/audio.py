"""
Audio Route Handlers
API endpoints for audio control and status.
Integrated with JUCE audio engine service.
Includes new audio health monitoring endpoints.
"""

try:
    from fastapi import APIRouter, HTTPException, Query
    from typing import Dict, Any, Optional, List
    from app.services.juce_engine_service import get_audio_engine

    # Import new audio health monitoring
    try:
        from app.services.audio_health_monitor import get_audio_health_monitor, init_audio_health_monitor
        from app.services.audio_io_v2 import AudioIOFactory, BUFFER_PRESETS
        AUDIO_HEALTH_AVAILABLE = True
    except ImportError:
        AUDIO_HEALTH_AVAILABLE = False

    # Import plugin health tracking
    try:
        from app.services.plugin_health import get_plugin_health_tracker
        PLUGIN_HEALTH_AVAILABLE = True
    except ImportError:
        PLUGIN_HEALTH_AVAILABLE = False

    router = APIRouter(prefix="/api/audio", tags=["audio"])

    @router.get("/status")
    async def get_audio_status_route():
        """Get audio engine status from JUCE."""
        service = get_audio_engine()

        if not service.is_available:
            return {
                "running": False,
                "error": "JUCE audio engine not available",
                "sample_rate": 0,
                "buffer_size": 0,
                "cpu_load": 0.0,
                "engine": "juce",
                "available": False
            }

        # Get JUCE system info
        info = service.get_system_info()

        return {
            "running": service.is_audio_running(),
            "sample_rate": info.get("sample_rate", 48000),
            "buffer_size": info.get("buffer_size", 128),
            "cpu_load": info.get("cpu_load", 0.0),
            "engine": "juce",
            "version": info.get("version", "unknown"),
            "plugin_count": info.get("plugin_count", 0),
            "active_pedalboard": info.get("active_pedalboard", None),
            "available": True
        }

    @router.post("/start")
    async def start_audio_route():
        """Start JUCE audio processing."""
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        success = await service.start_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to start audio")

        return {"success": True, "message": "JUCE audio started"}

    @router.post("/stop")
    async def stop_audio_route():
        """Stop JUCE audio processing."""
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        success = await service.stop_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop audio")

        return {"success": True, "message": "JUCE audio stopped"}

    @router.get("/latency")
    async def get_latency():
        """Get audio latency in milliseconds."""
        service = get_audio_engine()

        if not service.is_available:
            return {"latency_ms": 0.0}

        info = service.get_system_info()
        # Calculate latency from buffer size and sample rate
        buffer_size = info.get("buffer_size", 128)
        sample_rate = info.get("sample_rate", 48000)
        latency_ms = (buffer_size / sample_rate) * 1000.0 if sample_rate > 0 else 0.0

        return {"latency_ms": latency_ms}

    @router.get("/pipedal")
    async def get_pipedal_metrics():
        """Get PiPedal-style audio metrics (CPU load, xruns, etc.)."""
        service = get_audio_engine()

        if not service.is_available:
            return {
                "cpu_load": 0.0,
                "xruns": 0,
                "underruns": 0,
                "overruns": 0,
                "running": False,
                "available": False
            }

        info = service.get_system_info()

        # Get CPU load from engine
        cpu_load = info.get("cpu_load", 0.0)
        if isinstance(cpu_load, str):
            try:
                cpu_load = float(cpu_load.replace('%', ''))
            except:
                cpu_load = 0.0

        return {
            "cpu_load": cpu_load,
            "xruns": info.get("xruns", 0),
            "underruns": info.get("underruns", 0),
            "overruns": info.get("overruns", 0),
            "running": service.is_audio_running(),
            "available": service.is_available,
            "sample_rate": info.get("sample_rate", 48000),
            "buffer_size": info.get("buffer_size", 256)
        }

    @router.get("/levels")
    async def get_levels():
        """Get current audio levels from JUCE VU meters."""
        service = get_audio_engine()

        if not service.is_available:
            return {
                "input_left": 0.0,
                "input_right": 0.0,
                "output_left": 0.0,
                "output_right": 0.0
            }

        levels = await service.get_vu_levels()
        return levels

    @router.get("/levels/plugins")
    async def get_plugin_levels():
        """Get per-plugin VU levels from JUCE."""
        service = get_audio_engine()

        if not service.is_available:
            return {"plugins": []}

        levels = await service.get_plugin_vu_levels()
        return {"plugins": levels}

    @router.get("/juce")
    async def get_juce_metrics():
        """Get JUCE audio engine-specific metrics."""
        service = get_audio_engine()

        if not service.is_available:
            return {
                "available": False,
                "error": "JUCE audio engine not available"
            }

        info = service.get_system_info()

        # Get current pedalboard
        pedalboard = await service.get_current_pedalboard()

        return {
            "available": True,
            "running": service.is_audio_running(),
            "version": info.get("version"),
            "sample_rate": info.get("sample_rate"),
            "buffer_size": info.get("buffer_size"),
            "alsa_device": info.get("alsa_device"),
            "plugin_count": info.get("plugin_count"),
            "loaded_plugins": len(pedalboard.get("items", [])),
            "active_pedalboard": pedalboard.get("name"),
            "current_snapshot": info.get("current_snapshot"),
            "cpu_load": info.get("cpu_load", 0.0),
            "underruns": info.get("underruns", 0),
            "midi_enabled": info.get("midi_enabled", False)
        }

    @router.post("/config")
    async def configure_audio(sample_rate: int = None, buffer_size: int = None):
        """
        Configure audio engine settings.

        Args:
            sample_rate: Optional sample rate in Hz (44100, 48000, 96000, 192000)
            buffer_size: Optional buffer size in samples (64, 128, 256, 512, 1024)

        Returns:
            Configuration update status and new settings
        """
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        success = True
        updated_settings = {}

        # Update sample rate if provided
        if sample_rate is not None:
            supported_rates = [44100, 48000, 96000, 192000]
            if sample_rate not in supported_rates:
                raise HTTPException(status_code=400, detail=f"Unsupported sample rate. Must be one of: {supported_rates}")

            success = await service.set_sample_rate(sample_rate)
            if success:
                updated_settings["sample_rate"] = sample_rate

        # Update buffer size if provided
        if buffer_size is not None:
            supported_sizes = [64, 128, 256, 512, 1024]
            if buffer_size not in supported_sizes:
                raise HTTPException(status_code=400, detail=f"Unsupported buffer size. Must be one of: {supported_sizes}")

            success = await service.set_buffer_size(buffer_size)
            if success:
                updated_settings["buffer_size"] = buffer_size

        if not success:
            raise HTTPException(status_code=500, detail="Failed to apply configuration changes")

        # Get updated status
        info = service.get_system_info()

        return {
            "success": True,
            "message": "Audio configuration updated",
            "updated_settings": updated_settings,
            "current_config": {
                "sample_rate": info.get("sample_rate", 48000),
                "buffer_size": info.get("buffer_size", 256),
                "cpu_load": info.get("cpu_load", 0.0)
            }
        }

    @router.post("/restart")
    async def restart_audio():
        """
        Restart the audio engine.

        Stops audio processing and restarts the engine.
        This may cause brief audio interruption.

        Returns:
            Restart status and new engine state
        """
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        # Stop audio
        await service.stop_audio()

        # Wait a brief moment
        import asyncio
        await asyncio.sleep(0.5)

        # Start audio
        success = await service.start_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to restart audio engine")

        # Get updated status
        info = service.get_system_info()

        return {
            "success": True,
            "message": "Audio engine restarted",
            "running": service.is_audio_running(),
            "status": {
                "sample_rate": info.get("sample_rate", 48000),
                "buffer_size": info.get("buffer_size", 256),
                "cpu_load": info.get("cpu_load", 0.0)
            }
        }

    @router.post("/test")
    async def test_audio():
        """
        Run audio interface diagnostics.

        Tests JUCE audio engine functionality and performance.
        Returns diagnostics results including latency measurement and quality score.

        Returns:
            Test results with latency, sample rate, buffer size, and quality score
        """
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        # Get current audio info
        info = service.get_system_info()
        
        sample_rate = info.get("sample_rate", 48000)
        buffer_size = info.get("buffer_size", 256)
        cpu_load = info.get("cpu_load", 0.0)
        underruns = info.get("underruns", 0)

        # Calculate latency in milliseconds
        latency_ms = (buffer_size / sample_rate * 1000.0) if sample_rate > 0 else 0.0

        # Calculate quality score (0-100)
        # Scoring logic:
        # - Latency: <5ms = +30, <10ms = +20, <20ms = +10, <40ms = +5
        # - CPU Load: <50% = +30, <70% = +15, <80% = +5
        # - No underruns: +30, Some underruns: +10
        # - Running: +5
        score = 0

        # Latency scoring
        if latency_ms < 5:
            score += 30
        elif latency_ms < 10:
            score += 20
        elif latency_ms < 20:
            score += 10
        elif latency_ms < 40:
            score += 5

        # CPU load scoring
        if cpu_load < 50:
            score += 30
        elif cpu_load < 70:
            score += 15
        elif cpu_load < 80:
            score += 5

        # Underrun scoring
        if underruns == 0:
            score += 30
        elif underruns < 5:
            score += 10

        # Running scoring
        if service.is_audio_running():
            score += 5

        # Ensure score is between 0 and 100
        score = max(0, min(100, score))

        return {
            "success": True,
            "latency_ms": round(latency_ms, 2),
            "sample_rate": sample_rate,
            "buffer_size": buffer_size,
            "cpu_load": cpu_load,
            "underruns": underruns,
            "score": score,
            "status": "healthy" if score >= 80 else "warning" if score >= 50 else "critical"
        }

    # =========================================================================
    # NEW: Audio Health Monitoring Endpoints
    # =========================================================================

    @router.get("/health")
    async def get_audio_health() -> Dict[str, Any]:
        """
        Get comprehensive audio health status.

        Returns:
            Audio health summary including:
            - Thread state (healthy/warning/stalled)
            - Signal state (present/weak/absent)
            - XRun statistics
            - Buffer health
            - Recent alerts
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {
                "available": False,
                "error": "Audio health monitoring not available"
            }

        try:
            monitor = get_audio_health_monitor()
            return monitor.get_audio_health_summary()
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }

    @router.get("/health/alerts")
    async def get_audio_alerts(limit: int = Query(20, ge=1, le=100)) -> Dict[str, Any]:
        """
        Get recent audio alerts.

        Args:
            limit: Maximum number of alerts to return (1-100)

        Returns:
            List of recent audio alerts (XRuns, stalls, signal loss, etc.)
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"alerts": [], "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            alerts = monitor.get_recent_alerts(limit)
            return {
                "alerts": alerts,
                "count": len(alerts)
            }
        except Exception as e:
            return {"alerts": [], "error": str(e)}

    @router.get("/health/xruns")
    async def get_xrun_stats() -> Dict[str, Any]:
        """
        Get XRun (buffer underrun/overrun) statistics.

        Returns:
            XRun counts, rates, and recent events
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"available": False, "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            summary = monitor.get_audio_health_summary()

            return {
                "available": True,
                "total_xruns": summary.get("total_xruns", 0),
                "xrun_rate_per_minute": summary.get("xrun_rate_per_minute", 0),
                "status": "critical" if summary.get("xrun_rate_per_minute", 0) >= 5.0
                         else "warning" if summary.get("xrun_rate_per_minute", 0) >= 1.0
                         else "healthy",
                "thresholds": {
                    "warning": "1.0 XRuns/min",
                    "critical": "5.0 XRuns/min"
                }
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.get("/health/signal")
    async def get_signal_status() -> Dict[str, Any]:
        """
        Get input signal detection status.

        Returns:
            Signal state, level, and auto-mute status
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"available": False, "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            summary = monitor.get_audio_health_summary()

            return {
                "available": True,
                "signal_state": summary.get("signal_state", "unknown"),
                "input_level_db": summary.get("input_level_db", -96),
                "is_auto_muted": summary.get("is_auto_muted", False),
                "thresholds": {
                    "signal_present": "-40 dB",
                    "weak_signal": "-50 dB",
                    "noise_floor": "-60 dB"
                }
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.post("/health/unmute")
    async def force_unmute() -> Dict[str, Any]:
        """
        Force unmute audio output (override auto-mute).

        Returns:
            Success status
        """
        if not AUDIO_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Audio health monitoring not available")

        try:
            monitor = get_audio_health_monitor()
            if monitor._audio_manager:
                monitor._audio_manager.force_unmute()
                return {"success": True, "message": "Auto-mute disabled"}
            else:
                return {"success": False, "error": "Audio manager not initialized"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/buffer-presets")
    async def get_buffer_presets() -> Dict[str, Any]:
        """
        Get available buffer size presets.

        Returns:
            Dictionary of buffer presets with latency calculations
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {
                "presets": {
                    "standard": {"size": 256, "latency_ms": 5.3}
                }
            }

        presets = {}
        sample_rate = 48000  # Default

        for name, size in BUFFER_PRESETS.items():
            latency_ms = (size / sample_rate) * 1000
            presets[name] = {
                "size": size,
                "latency_ms": round(latency_ms, 2),
                "description": f"{size} samples @ {sample_rate}Hz"
            }

        return {
            "presets": presets,
            "current_sample_rate": sample_rate
        }

    # =========================================================================
    # NEW: Plugin Health Endpoints
    # =========================================================================

    @router.get("/plugins/health")
    async def get_plugins_health() -> Dict[str, Any]:
        """
        Get health status for all tracked plugins.

        Returns:
            Per-plugin health metrics including:
            - Processing times
            - Error counts
            - RT-safety status
            - Bypass state
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            return {"available": False, "error": "Plugin health tracking not available"}

        try:
            tracker = get_plugin_health_tracker()
            all_health = tracker.get_all_plugin_health()

            return {
                "available": True,
                "plugins": [p for p in all_health if p],
                "total": len(all_health),
                "bypassed_count": len(tracker.get_bypassed_plugins()),
                "unhealthy_count": len(tracker.get_unhealthy_plugins())
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.get("/plugins/health/{plugin_uri:path}")
    async def get_plugin_health(plugin_uri: str) -> Dict[str, Any]:
        """
        Get health status for a specific plugin.

        Args:
            plugin_uri: Plugin URI to query

        Returns:
            Plugin health metrics
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            health = tracker.get_plugin_health(plugin_uri)

            if health is None:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return health
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/plugins/bypass/{plugin_uri:path}")
    async def bypass_plugin(plugin_uri: str, reason: str = Query("Manual bypass")) -> Dict[str, Any]:
        """
        Manually bypass a plugin.

        Args:
            plugin_uri: Plugin URI to bypass
            reason: Reason for bypass

        Returns:
            Success status
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            success = tracker.manual_bypass(plugin_uri, reason)

            if not success:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return {"success": True, "message": f"Plugin bypassed: {plugin_uri}", "reason": reason}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/plugins/enable/{plugin_uri:path}")
    async def enable_plugin(plugin_uri: str) -> Dict[str, Any]:
        """
        Re-enable a bypassed plugin.

        Args:
            plugin_uri: Plugin URI to re-enable

        Returns:
            Success status
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            success = tracker.re_enable_plugin(plugin_uri)

            if not success:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return {"success": True, "message": f"Plugin re-enabled: {plugin_uri}"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/plugins/bypassed")
    async def get_bypassed_plugins() -> Dict[str, Any]:
        """
        Get list of currently bypassed plugins.

        Returns:
            List of bypassed plugin URIs
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            return {"bypassed": [], "error": "Plugin health tracking not available"}

        try:
            tracker = get_plugin_health_tracker()
            bypassed = tracker.get_bypassed_plugins()

            return {
                "bypassed": bypassed,
                "count": len(bypassed)
            }
        except Exception as e:
            return {"bypassed": [], "error": str(e)}

except ImportError:
    router = None
