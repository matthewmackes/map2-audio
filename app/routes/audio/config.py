"""
Audio engine lifecycle and configuration /api/audio routes.
"""

from .common import *

router = APIRouter()
@router.post("/start")
async def start_audio_route():
    """Start JUCE audio processing."""
    service = get_engine_service()

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
    service = get_engine_service()

    if not service.is_available:
        raise HTTPException(status_code=503, detail="JUCE audio engine not available")

    success = await service.stop_audio()

    if not success:
        raise HTTPException(status_code=500, detail="Failed to stop audio")

    return {"success": True, "message": "JUCE audio stopped"}

@router.post("/config")
async def configure_audio(
    sample_rate: int = None,
    buffer_size: int = None,
    audio_device: str | None = None,
    input_channel_mode: str | None = None,
    input_gain_db: float | None = None,
    output_gain_db: float | None = None,
):
    """
    Configure audio engine settings.

    Args:
        sample_rate: Optional sample rate in Hz (44100, 48000, 96000, 192000)
        buffer_size: Optional buffer size in samples (64, 128, 256, 512, 1024)

    Returns:
        Configuration update status and new settings
    """
    service = get_engine_service()

    if not service.is_available:
        raise HTTPException(status_code=503, detail="JUCE audio engine not available")

    success = True
    updated_settings = {}

    normalized_audio_device = str(audio_device or "").strip()
    normalized_input_channel_mode = str(input_channel_mode or "").strip().lower()

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

    if normalized_audio_device:
        success = await service.set_audio_device(normalized_audio_device)
        if success:
            updated_settings["audio_device"] = normalized_audio_device

    if normalized_input_channel_mode:
        supported_modes = {"mono_left", "mono_right", "stereo"}
        if normalized_input_channel_mode not in supported_modes:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported input channel mode. Must be one of: {sorted(supported_modes)}",
            )

        success = await service.set_input_channel_mode(normalized_input_channel_mode)
        if success:
            updated_settings["input_channel_mode"] = normalized_input_channel_mode

    if input_gain_db is not None:
        normalized_input_gain = max(-24.0, min(24.0, float(input_gain_db)))
        success = await service.set_input_gain_db(normalized_input_gain)
        if success:
            updated_settings["input_gain_db"] = normalized_input_gain

    if output_gain_db is not None:
        normalized_output_gain = max(-24.0, min(24.0, float(output_gain_db)))
        success = await service.set_output_gain_db(normalized_output_gain)
        if success:
            updated_settings["output_gain_db"] = normalized_output_gain

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
            "cpu_load": info.get("cpu_load", 0.0),
            "audio_device": info.get("audio_device"),
            "input_channel_mode": info.get("input_channel_mode", "stereo"),
            "input_gain_db": info.get("input_gain_db", 0.0),
            "output_gain_db": info.get("output_gain_db", 0.0),
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
    service = get_engine_service()

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
    service = get_engine_service()

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
