"""
Audio Route Handlers
API endpoints for audio control and status.
Integrated with JUCE audio engine service.
Includes new audio health monitoring endpoints.
"""

import asyncio
import subprocess

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

        # Initialize engine first if not already initialized
        if not service.is_running:
            init_success = await service.initialize()
            if not init_success:
                raise HTTPException(status_code=500, detail="Failed to initialize audio engine")

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
            except Exception:
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
            # Check if sample_rate is locked
            from app.config import get_config
            cfg = get_config()
            if hasattr(cfg, 'is_locked') and cfg.is_locked('audio.sample_rate'):
                raise HTTPException(
                    status_code=403,
                    detail="Sample rate is LOCKED for Tier A performance. Must be changed in systemd service and restart."
                )
            
            supported_rates = [44100, 48000, 96000, 192000]
            if sample_rate not in supported_rates:
                raise HTTPException(status_code=400, detail=f"Unsupported sample rate. Must be one of: {supported_rates}")

            success = await service.set_sample_rate(sample_rate)
            if success:
                updated_settings["sample_rate"] = sample_rate

        # Update buffer size if provided
        if buffer_size is not None:
            # Check if buffer_size is locked
            from app.config import get_config
            cfg = get_config()
            if hasattr(cfg, 'is_locked') and cfg.is_locked('audio.buffer_size'):
                raise HTTPException(
                    status_code=403,
                    detail="Buffer size is LOCKED at 64 samples for <3ms latency. Must be changed in systemd service and restart."
                )
            
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

    # =========================================================================
    # ALSA Diagnostics Endpoints
    # =========================================================================

    @router.get("/alsa/info")
    async def get_alsa_info() -> Dict[str, Any]:
        """Get ALSA device information."""

        cards = []
        current_device = "unknown"
        driver = "snd-usb-audio"
        state = "stopped"

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["cat", "/proc/asound/cards"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                i = 0
                while i < len(lines):
                    line = lines[i].strip()
                    if line and line[0].isdigit():
                        parts = line.split('[')
                        if len(parts) >= 2:
                            card_id = int(parts[0].strip())
                            card_name = parts[1].split(']')[0].strip() if ']' in parts[1] else parts[1].strip()
                            driver_name = "unknown"
                            if i + 1 < len(lines):
                                driver_line = lines[i + 1].strip()
                                driver_name = driver_line.split(' - ')[0].strip() if ' - ' in driver_line else driver_line
                            cards.append({
                                "id": card_id,
                                "name": card_name,
                                "driver": driver_name,
                                "devices": []
                            })
                    i += 1

            service = get_audio_engine()
            if service.is_available and service.is_audio_running():
                state = "running"
                info = service.get_system_info()
                current_device = info.get("alsa_device", "hw:0,0")
        except Exception:
            state = "error"

        return {"cards": cards, "current_device": current_device, "driver": driver, "state": state}

    @router.post("/alsa/reset")
    async def reset_alsa_state() -> Dict[str, Any]:
        """Reset ALSA state."""

        try:
            result = await asyncio.to_thread(subprocess.run, ["alsactl", "restore"], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return {"success": True, "message": "ALSA state restored successfully"}
            result2 = await asyncio.to_thread(subprocess.run, ["alsactl", "init"], capture_output=True, text=True, timeout=10)
            if result2.returncode == 0:
                return {"success": True, "message": "ALSA initialized successfully"}
            return {"success": False, "message": f"ALSA reset failed: {result.stderr or result2.stderr}"}
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "ALSA reset timed out"}
        except FileNotFoundError:
            return {"success": False, "message": "alsactl not found"}
        except Exception as e:
            return {"success": False, "message": f"ALSA reset error: {str(e)}"}

    # =========================================================================
    # Full Diagnostics Endpoint
    # =========================================================================

    @router.post("/diagnostics/full")
    async def run_full_diagnostic() -> Dict[str, Any]:
        """Run full diagnostic suite."""
        from datetime import datetime

        tests = []
        recommendations = []
        overall_status = "pass"
        start_time = datetime.now()
        service = get_audio_engine()

        # Test 1: Engine availability
        t1 = datetime.now()
        engine_available = service.is_available
        tests.append({
            "success": engine_available,
            "test_name": "Engine Availability",
            "duration_ms": (datetime.now() - t1).total_seconds() * 1000,
            "xruns_detected": 0,
            "message": "JUCE audio engine is available" if engine_available else "JUCE audio engine not available"
        })
        if not engine_available:
            overall_status = "fail"
            recommendations.append("Check that the JUCE audio engine is properly compiled and installed")

        # Test 2: Audio running state
        t2 = datetime.now()
        is_running = service.is_audio_running() if engine_available else False
        tests.append({
            "success": is_running,
            "test_name": "Audio Running",
            "duration_ms": (datetime.now() - t2).total_seconds() * 1000,
            "xruns_detected": 0,
            "message": "Audio processing is active" if is_running else "Audio processing is stopped"
        })
        if not is_running and engine_available:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append("Start the audio engine to enable processing")

        # Test 3: Latency measurement
        t3 = datetime.now()
        info = service.get_system_info() if engine_available else {}
        buffer_size = info.get("buffer_size", 256)
        sample_rate = info.get("sample_rate", 48000)
        latency_ms = (buffer_size / sample_rate * 1000) if sample_rate > 0 else 0
        latency_ok = latency_ms < 20
        tests.append({
            "success": latency_ok,
            "test_name": "Latency Check",
            "duration_ms": (datetime.now() - t3).total_seconds() * 1000,
            "latency_ms": round(latency_ms, 2),
            "xruns_detected": 0,
            "message": f"Latency is {latency_ms:.2f}ms" + (" (acceptable)" if latency_ok else " (high)")
        })
        if not latency_ok:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append(f"Consider reducing buffer size (current: {buffer_size} samples)")

        # Test 4: CPU load check
        t4 = datetime.now()
        cpu_load = info.get("cpu_load", 0)
        if isinstance(cpu_load, str):
            try:
                cpu_load = float(cpu_load.replace('%', ''))
            except Exception:
                cpu_load = 0
        cpu_ok = cpu_load < 70
        tests.append({
            "success": cpu_ok,
            "test_name": "CPU Load",
            "duration_ms": (datetime.now() - t4).total_seconds() * 1000,
            "quality_score": 1.0 - (cpu_load / 100),
            "xruns_detected": 0,
            "message": f"CPU load is {cpu_load:.1f}%" + (" (healthy)" if cpu_ok else " (high)")
        })
        if not cpu_ok:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append("High CPU load - consider disabling some plugins or increasing buffer size")

        # Test 5: XRun check
        t5 = datetime.now()
        underruns = info.get("underruns", 0)
        xruns = info.get("xruns", underruns)
        xrun_ok = xruns < 10
        tests.append({
            "success": xrun_ok,
            "test_name": "XRun Detection",
            "duration_ms": (datetime.now() - t5).total_seconds() * 1000,
            "xruns_detected": xruns,
            "message": f"{xruns} XRuns detected" + (" (acceptable)" if xrun_ok else " (excessive)")
        })
        if not xrun_ok:
            overall_status = "fail" if xruns > 50 else "warning"
            recommendations.append("High XRun count - increase buffer size or check system load")

        if overall_status == "pass" and not recommendations:
            recommendations.append("All diagnostics passed - system is operating normally")

        return {
            "timestamp": start_time.isoformat(),
            "overall_status": overall_status,
            "tests": tests,
            "recommendations": recommendations
        }

    @router.post("/health/xruns/clear")
    async def clear_xruns() -> Dict[str, Any]:
        """Clear the XRun counter."""
        service = get_audio_engine()
        if not service.is_available:
            return {"success": False, "error": "Audio engine not available"}
        try:
            if hasattr(service, 'clear_xruns'):
                await service.clear_xruns()
            if AUDIO_HEALTH_AVAILABLE:
                try:
                    monitor = get_audio_health_monitor()
                    if hasattr(monitor, 'reset_xrun_counter'):
                        monitor.reset_xrun_counter()
                except Exception:
                    pass
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @router.post("/test/sample-rate")
    async def test_sample_rate(rate: int = Query(..., description="Sample rate to test")) -> Dict[str, Any]:
        """Test a specific sample rate."""
        from datetime import datetime
        service = get_audio_engine()
        test_start = datetime.now()

        if not service.is_available:
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": 0, "xruns_detected": 0, "message": "Audio engine not available"}

        supported_rates = [44100, 48000, 88200, 96000, 192000]
        if rate not in supported_rates:
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": (datetime.now() - test_start).total_seconds() * 1000, "xruns_detected": 0, "message": f"Unsupported sample rate. Supported: {supported_rates}"}

        info = service.get_system_info()
        original_rate = info.get("sample_rate", 48000)

        try:
            success = await service.set_sample_rate(rate)
            duration_ms = (datetime.now() - test_start).total_seconds() * 1000
            if success:
                await service.set_sample_rate(original_rate)
                return {"success": True, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": duration_ms, "xruns_detected": 0, "message": f"Sample rate {rate} Hz is supported"}
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": duration_ms, "xruns_detected": 0, "message": f"Failed to set sample rate to {rate} Hz"}
        except Exception as e:
            try:
                await service.set_sample_rate(original_rate)
            except Exception:
                pass
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": (datetime.now() - test_start).total_seconds() * 1000, "xruns_detected": 0, "message": f"Error: {str(e)}"}

    @router.post("/test/buffer-stability")
    async def test_buffer_stability(
        buffer_size: int = Query(..., description="Buffer size to test"),
        duration: int = Query(5, description="Test duration in seconds")
    ) -> Dict[str, Any]:
        """Test buffer stability at a specific buffer size."""
        service = get_audio_engine()

        if not service.is_available:
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": "Audio engine not available"}

        supported_sizes = [32, 64, 128, 256, 512, 1024, 2048, 4096]
        if buffer_size not in supported_sizes:
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Unsupported buffer size. Try: {supported_sizes}"}

        info = service.get_system_info()
        original_buffer = info.get("buffer_size", 256)
        initial_xruns = info.get("underruns", 0) + info.get("xruns", 0)
        cpu_samples = []

        try:
            success = await service.set_buffer_size(buffer_size)
            if not success:
                return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Failed to set buffer size to {buffer_size}"}

            sample_interval = 0.25
            samples_needed = int(duration / sample_interval)
            for _ in range(samples_needed):
                await asyncio.sleep(sample_interval)
                current_info = service.get_system_info()
                cpu = current_info.get("cpu_load", 0)
                if isinstance(cpu, str):
                    try:
                        cpu = float(cpu.replace('%', ''))
                    except Exception:
                        cpu = 0
                cpu_samples.append(cpu)

            final_info = service.get_system_info()
            final_xruns = final_info.get("underruns", 0) + final_info.get("xruns", 0)
            xruns_during_test = max(0, final_xruns - initial_xruns)
            await service.set_buffer_size(original_buffer)

            avg_cpu = sum(cpu_samples) / len(cpu_samples) if cpu_samples else 0
            peak_cpu = max(cpu_samples) if cpu_samples else 0
            xrun_penalty = min(xruns_during_test * 0.1, 0.5)
            cpu_penalty = max(0, (avg_cpu - 50) / 100)
            stability_score = max(0, 1.0 - xrun_penalty - cpu_penalty)

            if stability_score >= 0.9 and xruns_during_test == 0:
                recommendation = f"Buffer size {buffer_size} is stable for your system"
            elif stability_score >= 0.7:
                recommendation = f"Buffer size {buffer_size} is marginally stable - consider a larger buffer"
            else:
                recommendation = f"Buffer size {buffer_size} is unstable - increase to {min(buffer_size * 2, 2048)} or higher"

            return {"success": xruns_during_test == 0 and stability_score >= 0.7, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": xruns_during_test, "avg_cpu_load": round(avg_cpu, 2), "peak_cpu_load": round(peak_cpu, 2), "stability_score": round(stability_score, 3), "recommendation": recommendation}
        except Exception as e:
            try:
                await service.set_buffer_size(original_buffer)
            except Exception:
                pass
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Test error: {str(e)}"}

    # =========================================================================
    # Audio Port Routing Endpoints
    # =========================================================================

    # Store for port routing configuration (persisted in memory, could be extended to DB)
    _port_routing_config = {
        "input_ports": [0, 1],  # Default: first stereo pair
        "output_ports": [0, 1],  # Default: first stereo pair
    }

    # Per-chain port routing overrides: { chain_id: { "input_ports": [...], "output_ports": [...] } }
    _chain_port_routing: Dict[int, Dict[str, list]] = {}

    @router.get("/ports")
    async def get_available_ports() -> Dict[str, Any]:
        """
        Get available audio input/output ports on the connected interface.

        Returns:
            List of input and output ports with their names and indices
        """
        service = get_audio_engine()

        if not service.is_available:
            return {
                "available": False,
                "inputs": [],
                "outputs": [],
                "error": "Audio engine not available"
            }

        info = service.get_system_info()
        input_channels = info.get("input_channels", 2)
        output_channels = info.get("output_channels", 2)
        device_name = info.get("alsa_device", "hw:0,0")

        # Generate port lists based on channel counts
        # For Edirol UA-1000: 10 in, 10 out
        # For Hotone Jogg: 2 in, 2 out
        inputs = []
        outputs = []

        # Define port names for known devices
        ua1000_inputs = [
            "Input 1 (Analog)",
            "Input 2 (Analog)",
            "Input 3 (Analog)",
            "Input 4 (Analog)",
            "S/PDIF L",
            "S/PDIF R",
            "ADAT 1",
            "ADAT 2",
            "ADAT 3",
            "ADAT 4",
        ]
        ua1000_outputs = [
            "Output 1 (Main L)",
            "Output 2 (Main R)",
            "Output 3",
            "Output 4",
            "Output 5",
            "Output 6",
            "Output 7",
            "Output 8",
            "S/PDIF L",
            "S/PDIF R",
        ]

        for i in range(input_channels):
            if "UA1000" in device_name or input_channels >= 10:
                name = ua1000_inputs[i] if i < len(ua1000_inputs) else f"Input {i + 1}"
            else:
                name = f"Input {i + 1}" if input_channels > 2 else ("Left" if i == 0 else "Right")
            inputs.append({
                "index": i,
                "name": name,
                "type": "input"
            })

        for i in range(output_channels):
            if "UA1000" in device_name or output_channels >= 10:
                name = ua1000_outputs[i] if i < len(ua1000_outputs) else f"Output {i + 1}"
            else:
                name = f"Output {i + 1}" if output_channels > 2 else ("Left" if i == 0 else "Right")
            outputs.append({
                "index": i,
                "name": name,
                "type": "output"
            })

        return {
            "available": True,
            "device": device_name,
            "inputs": inputs,
            "outputs": outputs,
            "input_count": input_channels,
            "output_count": output_channels
        }

    @router.get("/routing")
    async def get_port_routing() -> Dict[str, Any]:
        """
        Get current audio port routing configuration.

        Returns:
            Currently selected input and output ports
        """
        service = get_audio_engine()

        if not service.is_available:
            return {
                "available": False,
                "input_ports": [],
                "output_ports": [],
                "error": "Audio engine not available"
            }

        return {
            "available": True,
            "input_ports": _port_routing_config["input_ports"],
            "output_ports": _port_routing_config["output_ports"]
        }

    @router.post("/routing")
    async def set_port_routing(
        input_ports: List[int] = Query(None, description="Input port indices to use"),
        output_ports: List[int] = Query(None, description="Output port indices to use")
    ) -> Dict[str, Any]:
        """
        Set audio port routing configuration.

        Args:
            input_ports: List of input port indices (e.g., [0, 1] for stereo)
            output_ports: List of output port indices (e.g., [0, 1] for main outputs)

        Returns:
            Updated routing configuration
        """
        global _port_routing_config
        service = get_audio_engine()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="Audio engine not available")

        info = service.get_system_info()
        max_inputs = info.get("input_channels", 2)
        max_outputs = info.get("output_channels", 2)

        # Validate and update input ports
        if input_ports is not None:
            # Validate port indices
            for port in input_ports:
                if port < 0 or port >= max_inputs:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid input port {port}. Valid range: 0-{max_inputs - 1}"
                    )
            _port_routing_config["input_ports"] = input_ports

            # Apply to engine if supported
            try:
                if hasattr(service._engine, 'set_input_channels'):
                    service._engine.set_input_channels(input_ports)
            except Exception as e:
                logger.warning(f"Could not apply input routing to engine: {e}")

        # Validate and update output ports
        if output_ports is not None:
            for port in output_ports:
                if port < 0 or port >= max_outputs:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid output port {port}. Valid range: 0-{max_outputs - 1}"
                    )
            _port_routing_config["output_ports"] = output_ports

            # Apply to engine if supported
            try:
                if hasattr(service._engine, 'set_output_channels'):
                    service._engine.set_output_channels(output_ports)
            except Exception as e:
                logger.warning(f"Could not apply output routing to engine: {e}")

        return {
            "success": True,
            "message": "Port routing updated",
            "input_ports": _port_routing_config["input_ports"],
            "output_ports": _port_routing_config["output_ports"]
        }

    @router.get("/routing/chain/{chain_id}")
    async def get_chain_port_routing(chain_id: int) -> Dict[str, Any]:
        """
        Get port routing for a specific chain.
        Falls back to global routing if no per-chain override exists.
        """
        if chain_id in _chain_port_routing:
            return {
                "available": True,
                "chain_id": chain_id,
                "input_ports": _chain_port_routing[chain_id].get("input_ports", _port_routing_config["input_ports"]),
                "output_ports": _chain_port_routing[chain_id].get("output_ports", _port_routing_config["output_ports"]),
                "is_override": True,
            }
        return {
            "available": True,
            "chain_id": chain_id,
            "input_ports": _port_routing_config["input_ports"],
            "output_ports": _port_routing_config["output_ports"],
            "is_override": False,
        }

    @router.post("/routing/chain/{chain_id}")
    async def set_chain_port_routing(
        chain_id: int,
        input_ports: List[int] = Query(None, description="Input port indices for this chain"),
        output_ports: List[int] = Query(None, description="Output port indices for this chain"),
    ) -> Dict[str, Any]:
        """
        Set port routing for a specific chain/flow.
        """
        service = get_audio_engine()
        if not service.is_available:
            raise HTTPException(status_code=503, detail="Audio engine not available")

        info = service.get_system_info()
        max_inputs = info.get("input_channels", 2)
        max_outputs = info.get("output_channels", 2)

        if chain_id not in _chain_port_routing:
            _chain_port_routing[chain_id] = {
                "input_ports": list(_port_routing_config["input_ports"]),
                "output_ports": list(_port_routing_config["output_ports"]),
            }

        if input_ports is not None:
            for port in input_ports:
                if port < 0 or port >= max_inputs:
                    raise HTTPException(status_code=400, detail=f"Invalid input port {port}. Valid range: 0-{max_inputs - 1}")
            _chain_port_routing[chain_id]["input_ports"] = input_ports
            try:
                if hasattr(service._engine, 'set_input_channels'):
                    service._engine.set_input_channels(input_ports)
            except Exception as e:
                logger.warning(f"Could not apply chain input routing to engine: {e}")

        if output_ports is not None:
            for port in output_ports:
                if port < 0 or port >= max_outputs:
                    raise HTTPException(status_code=400, detail=f"Invalid output port {port}. Valid range: 0-{max_outputs - 1}")
            _chain_port_routing[chain_id]["output_ports"] = output_ports
            try:
                if hasattr(service._engine, 'set_output_channels'):
                    service._engine.set_output_channels(output_ports)
            except Exception as e:
                logger.warning(f"Could not apply chain output routing to engine: {e}")

        return {
            "success": True,
            "message": f"Chain {chain_id} port routing updated",
            "chain_id": chain_id,
            "input_ports": _chain_port_routing[chain_id]["input_ports"],
            "output_ports": _chain_port_routing[chain_id]["output_ports"],
        }

    @router.delete("/routing/chain/{chain_id}")
    async def clear_chain_port_routing(chain_id: int) -> Dict[str, Any]:
        """
        Remove per-chain port routing override (revert to global).
        """
        if chain_id in _chain_port_routing:
            del _chain_port_routing[chain_id]
        return {
            "success": True,
            "message": f"Chain {chain_id} reverted to global routing",
            "chain_id": chain_id,
            "input_ports": _port_routing_config["input_ports"],
            "output_ports": _port_routing_config["output_ports"],
        }

    @router.get("/ports/presets")
    async def get_port_presets() -> Dict[str, Any]:
        """
        Get common port routing presets for the connected interface.

        Returns:
            List of preset routing configurations
        """
        service = get_audio_engine()

        if not service.is_available:
            return {"presets": []}

        info = service.get_system_info()
        input_channels = info.get("input_channels", 2)
        output_channels = info.get("output_channels", 2)

        presets = []

        # Always have stereo preset
        presets.append({
            "id": "stereo",
            "name": "Stereo (1-2)",
            "description": "Standard stereo input/output",
            "input_ports": [0, 1],
            "output_ports": [0, 1]
        })

        # Add mono preset
        presets.append({
            "id": "mono",
            "name": "Mono (1)",
            "description": "Mono input to stereo output",
            "input_ports": [0],
            "output_ports": [0, 1]
        })

        # Multi-channel presets for interfaces with more ports
        if input_channels >= 4:
            presets.append({
                "id": "inputs_3_4",
                "name": "Inputs 3-4",
                "description": "Use inputs 3 and 4",
                "input_ports": [2, 3],
                "output_ports": [0, 1]
            })

        if input_channels >= 6:
            presets.append({
                "id": "spdif_in",
                "name": "S/PDIF Input",
                "description": "Digital S/PDIF input",
                "input_ports": [4, 5],
                "output_ports": [0, 1]
            })

        if output_channels >= 4:
            presets.append({
                "id": "outputs_3_4",
                "name": "Outputs 3-4",
                "description": "Route to outputs 3 and 4",
                "input_ports": [0, 1],
                "output_ports": [2, 3]
            })

        if output_channels >= 10:
            presets.append({
                "id": "spdif_out",
                "name": "S/PDIF Output",
                "description": "Digital S/PDIF output",
                "input_ports": [0, 1],
                "output_ports": [8, 9]
            })
            presets.append({
                "id": "all_analog_out",
                "name": "All Analog Outputs",
                "description": "Route to all 8 analog outputs",
                "input_ports": [0, 1],
                "output_ports": [0, 1, 2, 3, 4, 5, 6, 7]
            })

        return {
            "presets": presets,
            "current": {
                "input_ports": _port_routing_config["input_ports"],
                "output_ports": _port_routing_config["output_ports"]
            }
        }

except ImportError:
    router = None
