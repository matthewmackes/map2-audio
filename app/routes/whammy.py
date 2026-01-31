"""
dm-Whammy API Routes

Based on davemollen/dm-Whammy - A pitch shifting effect inspired by the DigiTech Whammy pedal.
Mono pitch shifter with ±24 semitone range, grain-based processing.
LV2 plugin installed at ~/.lv2/dm-Whammy.lv2/
"""

try:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/whammy", tags=["whammy"])

    # State storage (would connect to actual dm-Whammy LV2 processor in production)
    _whammy_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        # dm-Whammy parameters
        "pitch": 12,   # Pitch shift in semitones (-24 to +24, default 12 = one octave up)
        "dry": -70,    # Dry level in dB (-70 to 6, default -70 = silent)
        "wet": 0       # Wet level in dB (-70 to 6, default 0)
    }

    @router.get("/status")
    async def get_whammy_status():
        """Get dm-Whammy processor status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("whammy")

        # Return state with real-time levels
        return {
            **_whammy_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    @router.post("/set-pitch/{pitch}")
    async def set_whammy_pitch(pitch: float):
        """Set pitch shift in semitones (-24 to +24)."""
        if not -24 <= pitch <= 24:
            raise HTTPException(status_code=400, detail="Pitch must be between -24 and +24 semitones")
        _whammy_state["pitch"] = pitch
        return {"status": "ok", "pitch": pitch}

    @router.post("/set-dry/{dry}")
    async def set_whammy_dry(dry: float):
        """Set dry level in dB (-70 to 6)."""
        if not -70 <= dry <= 6:
            raise HTTPException(status_code=400, detail="Dry level must be between -70 and 6 dB")
        _whammy_state["dry"] = dry
        return {"status": "ok", "dry": dry}

    @router.post("/set-wet/{wet}")
    async def set_whammy_wet(wet: float):
        """Set wet level in dB (-70 to 6)."""
        if not -70 <= wet <= 6:
            raise HTTPException(status_code=400, detail="Wet level must be between -70 and 6 dB")
        _whammy_state["wet"] = wet
        return {"status": "ok", "wet": wet}

    @router.post("/set-bypass/{bypass}")
    async def set_whammy_bypass(bypass: bool):
        """Set bypass state."""
        _whammy_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/whammy", tags=["whammy"])

    @router.get("/status")
    async def get_whammy_status():
        return {"available": False, "error": "dm-Whammy dependencies not installed"}
