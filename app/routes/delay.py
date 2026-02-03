"""
Delay Processing API Routes
Professional multi-tap stereo delay with tempo sync, modulation, and ducking
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import time

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/delay", tags=["delay"])


# ========================================
# Pydantic Models
# ========================================

class DelayParams(BaseModel):
    """Delay parameters - all optional for PATCH updates"""
    # Core delay
    delay_time_l: Optional[float] = Field(None, ge=1.0, le=2000.0, description="Left delay time in ms")
    delay_time_r: Optional[float] = Field(None, ge=1.0, le=2000.0, description="Right delay time in ms")
    feedback: Optional[float] = Field(None, ge=0.0, le=100.0, description="Feedback percentage")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix percentage")

    # Tempo sync
    tempo: Optional[float] = Field(None, ge=20.0, le=300.0, description="Tempo in BPM")
    tempo_sync_l: Optional[int] = Field(None, ge=0, le=16, description="Left tempo sync division (0=off)")
    tempo_sync_r: Optional[int] = Field(None, ge=0, le=16, description="Right tempo sync division (0=off)")

    # Multi-tap
    tap1_level: Optional[float] = Field(None, ge=0.0, le=100.0, description="Tap 1 level %")
    tap2_level: Optional[float] = Field(None, ge=0.0, le=100.0, description="Tap 2 level %")
    tap2_ratio: Optional[float] = Field(None, ge=0.1, le=1.0, description="Tap 2 delay ratio")
    tap3_level: Optional[float] = Field(None, ge=0.0, le=100.0, description="Tap 3 level %")
    tap3_ratio: Optional[float] = Field(None, ge=0.1, le=1.0, description="Tap 3 delay ratio")
    tap4_level: Optional[float] = Field(None, ge=0.0, le=100.0, description="Tap 4 level %")
    tap4_ratio: Optional[float] = Field(None, ge=0.1, le=1.0, description="Tap 4 delay ratio")

    # Stereo
    stereo_mode: Optional[int] = Field(None, ge=0, le=3, description="0=Mono, 1=Stereo, 2=PingPong, 3=DualMono")
    stereo_spread: Optional[float] = Field(None, ge=0.0, le=200.0, description="Stereo spread %")
    pan: Optional[float] = Field(None, ge=-100.0, le=100.0, description="Pan position")

    # Modulation
    mod_rate: Optional[float] = Field(None, ge=0.01, le=10.0, description="Modulation rate in Hz")
    mod_depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    mod_waveform: Optional[int] = Field(None, ge=0, le=2, description="0=Sine, 1=Triangle, 2=Random")

    # Filtering
    low_cut: Optional[float] = Field(None, ge=20.0, le=2000.0, description="Low cut frequency in Hz")
    high_cut: Optional[float] = Field(None, ge=1000.0, le=20000.0, description="High cut frequency in Hz")
    filter_in_loop: Optional[bool] = Field(None, description="Filter in feedback loop")

    # Diffusion
    diffusion: Optional[float] = Field(None, ge=0.0, le=100.0, description="Diffusion amount %")

    # Ducking
    duck_threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Ducking threshold in dB")
    duck_amount: Optional[float] = Field(None, ge=0.0, le=100.0, description="Ducking amount %")
    duck_release: Optional[float] = Field(None, ge=10.0, le=2000.0, description="Ducking release in ms")

    # Output
    output_level: Optional[float] = Field(None, ge=-12.0, le=12.0, description="Output level in dB")
    spillover: Optional[bool] = Field(None, description="Enable spillover (tails when bypassed)")
    bypass: Optional[bool] = Field(None, description="Bypass delay")


class TapTempoRequest(BaseModel):
    """Tap tempo request"""
    timestamp: Optional[float] = Field(None, description="Timestamp in ms (uses server time if not provided)")


class TapTempoResponse(BaseModel):
    """Tap tempo response"""
    tempo: Optional[float] = Field(None, description="Calculated tempo in BPM")
    taps: int = Field(description="Number of taps recorded")


class DelayMetering(BaseModel):
    """Delay metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    delay_level_l: float
    delay_level_r: float
    ducking_gain: float
    mod_phase: float


# ========================================
# Tap tempo state (per-session in future, global for now)
# ========================================

_tap_times: List[float] = []
_MAX_TAPS = 8


# ========================================
# Routes
# ========================================

@router.get("/")
async def get_delay() -> Dict[str, Any]:
    """Get delay parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_delay_parameters()
    metering = await engine.get_delay_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_delay_parameters() -> Dict[str, Any]:
    """Get delay parameters only."""
    engine = get_audio_engine()
    return await engine.get_delay_parameters()


@router.get("/metering")
async def get_delay_metering() -> Dict[str, float]:
    """Get delay metering data for real-time display."""
    engine = get_audio_engine()
    return await engine.get_delay_metering()


@router.patch("/parameters")
async def update_delay_parameters(params: DelayParams) -> Dict[str, Any]:
    """Update delay parameters."""
    engine = get_audio_engine()

    # Core delay
    if params.delay_time_l is not None:
        await engine.set_delay_time_l(params.delay_time_l)
    if params.delay_time_r is not None:
        await engine.set_delay_time_r(params.delay_time_r)
    if params.feedback is not None:
        await engine.set_delay_feedback(params.feedback)
    if params.mix is not None:
        await engine.set_delay_mix(params.mix)

    # Tempo sync
    if params.tempo is not None:
        await engine.set_delay_tempo(params.tempo)
    if params.tempo_sync_l is not None:
        await engine.set_delay_tempo_sync_l(params.tempo_sync_l)
    if params.tempo_sync_r is not None:
        await engine.set_delay_tempo_sync_r(params.tempo_sync_r)

    # Multi-tap
    if params.tap1_level is not None:
        await engine.set_delay_tap1_level(params.tap1_level)
    if params.tap2_level is not None:
        await engine.set_delay_tap2_level(params.tap2_level)
    if params.tap2_ratio is not None:
        await engine.set_delay_tap2_ratio(params.tap2_ratio)
    if params.tap3_level is not None:
        await engine.set_delay_tap3_level(params.tap3_level)
    if params.tap3_ratio is not None:
        await engine.set_delay_tap3_ratio(params.tap3_ratio)
    if params.tap4_level is not None:
        await engine.set_delay_tap4_level(params.tap4_level)
    if params.tap4_ratio is not None:
        await engine.set_delay_tap4_ratio(params.tap4_ratio)

    # Stereo
    if params.stereo_mode is not None:
        await engine.set_delay_stereo_mode(params.stereo_mode)
    if params.stereo_spread is not None:
        await engine.set_delay_stereo_spread(params.stereo_spread)
    if params.pan is not None:
        await engine.set_delay_pan(params.pan)

    # Modulation
    if params.mod_rate is not None:
        await engine.set_delay_mod_rate(params.mod_rate)
    if params.mod_depth is not None:
        await engine.set_delay_mod_depth(params.mod_depth)
    if params.mod_waveform is not None:
        await engine.set_delay_mod_waveform(params.mod_waveform)

    # Filtering
    if params.low_cut is not None:
        await engine.set_delay_low_cut(params.low_cut)
    if params.high_cut is not None:
        await engine.set_delay_high_cut(params.high_cut)
    if params.filter_in_loop is not None:
        await engine.set_delay_filter_in_loop(params.filter_in_loop)

    # Diffusion
    if params.diffusion is not None:
        await engine.set_delay_diffusion(params.diffusion)

    # Ducking
    if params.duck_threshold is not None:
        await engine.set_delay_duck_threshold(params.duck_threshold)
    if params.duck_amount is not None:
        await engine.set_delay_duck_amount(params.duck_amount)
    if params.duck_release is not None:
        await engine.set_delay_duck_release(params.duck_release)

    # Output
    if params.output_level is not None:
        await engine.set_delay_output_level(params.output_level)
    if params.spillover is not None:
        await engine.set_delay_spillover(params.spillover)
    if params.bypass is not None:
        await engine.set_delay_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_delay_parameters()}


@router.post("/bypass/{bypass}")
async def set_delay_bypass(bypass: bool) -> Dict[str, Any]:
    """Set delay bypass state."""
    engine = get_audio_engine()
    await engine.set_delay_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/tap-tempo")
async def tap_tempo(request: TapTempoRequest = None) -> TapTempoResponse:
    """
    Record a tap for tempo calculation.
    Call this endpoint repeatedly to tap out a tempo.
    Returns the calculated tempo after 2+ taps.
    """
    global _tap_times

    # Use provided timestamp or server time
    now = request.timestamp if request and request.timestamp else time.time() * 1000

    # Reset if more than 2 seconds since last tap
    if _tap_times and (now - _tap_times[-1]) > 2000:
        _tap_times = []

    # Record this tap
    _tap_times.append(now)

    # Keep only last N taps
    if len(_tap_times) > _MAX_TAPS:
        _tap_times = _tap_times[-_MAX_TAPS:]

    # Need at least 2 taps to calculate tempo
    if len(_tap_times) < 2:
        return TapTempoResponse(tempo=None, taps=len(_tap_times))

    # Calculate average interval
    intervals = [_tap_times[i + 1] - _tap_times[i] for i in range(len(_tap_times) - 1)]
    avg_interval = sum(intervals) / len(intervals)

    # Convert to BPM (60000ms / interval)
    tempo = 60000 / avg_interval
    tempo = max(20.0, min(300.0, tempo))

    # Apply to engine
    engine = get_audio_engine()
    await engine.set_delay_tempo(tempo)

    return TapTempoResponse(tempo=round(tempo, 1), taps=len(_tap_times))


@router.post("/tap-tempo/clear")
async def clear_tap_tempo() -> Dict[str, str]:
    """Clear tap tempo history."""
    global _tap_times
    _tap_times = []
    return {"status": "ok"}


@router.get("/effective-times")
async def get_effective_delay_times() -> Dict[str, float]:
    """
    Get the effective delay times after applying tempo sync.
    Useful for UI display when tempo sync is enabled.
    """
    engine = get_audio_engine()
    return await engine.get_delay_effective_times()


# ========================================
# Tempo Division Reference
# ========================================

TEMPO_DIVISIONS = [
    {"index": 0, "name": "Off", "beats": 0},
    {"index": 1, "name": "1/1", "beats": 4.0},
    {"index": 2, "name": "1/2", "beats": 2.0},
    {"index": 3, "name": "1/4", "beats": 1.0},
    {"index": 4, "name": "1/8", "beats": 0.5},
    {"index": 5, "name": "1/16", "beats": 0.25},
    {"index": 6, "name": "1/32", "beats": 0.125},
    {"index": 7, "name": "1/1D", "beats": 6.0},
    {"index": 8, "name": "1/2D", "beats": 3.0},
    {"index": 9, "name": "1/4D", "beats": 1.5},
    {"index": 10, "name": "1/8D", "beats": 0.75},
    {"index": 11, "name": "1/16D", "beats": 0.375},
    {"index": 12, "name": "1/1T", "beats": 2.667},
    {"index": 13, "name": "1/2T", "beats": 1.333},
    {"index": 14, "name": "1/4T", "beats": 0.667},
    {"index": 15, "name": "1/8T", "beats": 0.333},
    {"index": 16, "name": "1/16T", "beats": 0.167},
]


@router.get("/tempo-divisions")
async def get_tempo_divisions() -> List[Dict[str, Any]]:
    """Get available tempo sync divisions with beat values."""
    return TEMPO_DIVISIONS


@router.get("/calculate-delay")
async def calculate_delay_from_tempo(
    division: int,
    bpm: float = 120.0
) -> Dict[str, float]:
    """
    Calculate delay time from tempo division.
    Useful for UI to preview delay times.
    """
    if division < 0 or division >= len(TEMPO_DIVISIONS):
        raise HTTPException(status_code=400, detail="Invalid division index")

    if division == 0:
        return {"division": 0, "bpm": bpm, "delay_ms": 0}

    beats = TEMPO_DIVISIONS[division]["beats"]
    # delay_ms = (beats / (bpm / 60)) * 1000 = beats * 60000 / bpm
    delay_ms = beats * 60000 / bpm

    return {
        "division": division,
        "division_name": TEMPO_DIVISIONS[division]["name"],
        "bpm": bpm,
        "beats": beats,
        "delay_ms": round(delay_ms, 1)
    }
