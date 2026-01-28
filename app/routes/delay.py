"""
Cocoa Delay API Routes

Based on tesselode/cocoa-delay - a warm delay plugin with:
- Delay time drift (wow/flutter)
- Wet level ducking
- Pan modes (static, ping-pong, circular)
- Drive section (Airwindows-derived saturation)
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from typing import Optional

    router = APIRouter(prefix="/api/delay", tags=["delay"])

    # State storage (would connect to actual delay processor in production)
    _delay_state = {
        "available": True,
        "mix": 50,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        "delayTime": 375,
        "feedback": 40,
        "drift": 0,
        "ducking": 0,
        "panMode": "static",
        "pan": 0,
        "driveEnabled": False,
        "driveAmount": 0,
        "lowCut": 80,
        "highCut": 12000,
        "tempoSync": False,
        "syncDivision": "1/4"
    }

    class DriveParams(BaseModel):
        enabled: bool
        amount: float

    @router.get("/status")
    async def get_delay_status():
        """Get Cocoa Delay processor status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("delay")

        # Return state with real-time levels
        return {
            **_delay_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    @router.post("/set-mix/{mix}")
    async def set_delay_mix(mix: float):
        """Set delay wet/dry mix (0-100)."""
        if not 0 <= mix <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _delay_state["mix"] = mix
        return {"status": "ok", "mix": mix}

    @router.post("/set-time/{time}")
    async def set_delay_time(time: float):
        """Set delay time in milliseconds (1-2000)."""
        if not 1 <= time <= 2000:
            raise HTTPException(status_code=400, detail="Delay time must be between 1 and 2000ms")
        _delay_state["delayTime"] = time
        return {"status": "ok", "delayTime": time}

    @router.post("/set-feedback/{feedback}")
    async def set_delay_feedback(feedback: float):
        """Set delay feedback (0-100)."""
        if not 0 <= feedback <= 100:
            raise HTTPException(status_code=400, detail="Feedback must be between 0 and 100")
        _delay_state["feedback"] = feedback
        return {"status": "ok", "feedback": feedback}

    @router.post("/set-drift/{drift}")
    async def set_delay_drift(drift: float):
        """Set delay time drift/wow-flutter amount (0-100)."""
        if not 0 <= drift <= 100:
            raise HTTPException(status_code=400, detail="Drift must be between 0 and 100")
        _delay_state["drift"] = drift
        return {"status": "ok", "drift": drift}

    @router.post("/set-ducking/{ducking}")
    async def set_delay_ducking(ducking: float):
        """Set wet level ducking amount (0-100)."""
        if not 0 <= ducking <= 100:
            raise HTTPException(status_code=400, detail="Ducking must be between 0 and 100")
        _delay_state["ducking"] = ducking
        return {"status": "ok", "ducking": ducking}

    @router.post("/set-pan-mode/{mode}")
    async def set_delay_pan_mode(mode: str):
        """Set pan mode (static, pingpong, circular)."""
        if mode not in ("static", "pingpong", "circular"):
            raise HTTPException(status_code=400, detail="Pan mode must be static, pingpong, or circular")
        _delay_state["panMode"] = mode
        return {"status": "ok", "panMode": mode}

    @router.post("/set-pan/{pan}")
    async def set_delay_pan(pan: float):
        """Set stereo pan position (-100 to 100)."""
        if not -100 <= pan <= 100:
            raise HTTPException(status_code=400, detail="Pan must be between -100 and 100")
        _delay_state["pan"] = pan
        return {"status": "ok", "pan": pan}

    @router.post("/set-drive")
    async def set_delay_drive(params: DriveParams):
        """Set drive section parameters."""
        _delay_state["driveEnabled"] = params.enabled
        if not 0 <= params.amount <= 100:
            raise HTTPException(status_code=400, detail="Drive amount must be between 0 and 100")
        _delay_state["driveAmount"] = params.amount
        return {"status": "ok", "driveEnabled": params.enabled, "driveAmount": params.amount}

    @router.post("/set-low-cut/{freq}")
    async def set_delay_low_cut(freq: float):
        """Set low cut filter frequency (20-2000 Hz)."""
        if not 20 <= freq <= 2000:
            raise HTTPException(status_code=400, detail="Low cut must be between 20 and 2000 Hz")
        _delay_state["lowCut"] = freq
        return {"status": "ok", "lowCut": freq}

    @router.post("/set-high-cut/{freq}")
    async def set_delay_high_cut(freq: float):
        """Set high cut filter frequency (1000-20000 Hz)."""
        if not 1000 <= freq <= 20000:
            raise HTTPException(status_code=400, detail="High cut must be between 1000 and 20000 Hz")
        _delay_state["highCut"] = freq
        return {"status": "ok", "highCut": freq}

    @router.post("/set-bypass/{bypass}")
    async def set_delay_bypass(bypass: bool):
        """Set delay bypass state."""
        _delay_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

    @router.post("/set-tempo-sync/{enabled}")
    async def set_delay_tempo_sync(enabled: bool):
        """Enable/disable tempo sync."""
        _delay_state["tempoSync"] = enabled
        return {"status": "ok", "tempoSync": enabled}

    @router.post("/set-sync-division/{division}")
    async def set_delay_sync_division(division: str):
        """Set tempo sync note division."""
        valid_divisions = ["1/1", "1/2", "1/2T", "1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32"]
        if division not in valid_divisions:
            raise HTTPException(status_code=400, detail=f"Division must be one of: {', '.join(valid_divisions)}")
        _delay_state["syncDivision"] = division
        return {"status": "ok", "syncDivision": division}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/delay", tags=["delay"])

    @router.get("/status")
    async def get_delay_status():
        return {"available": False, "error": "Delay dependencies not installed"}
