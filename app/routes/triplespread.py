"""
TripleSpread API Routes

Based on Airwindows TripleSpread by Chris Johnson.
A stereo width effect that spreads frequencies across the stereo field in three bands.
"""

try:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/triplespread", tags=["triplespread"])

    # State storage (would connect to actual TripleSpread processor in production)
    _triplespread_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        "spread": 50,  # 0-100
        "mix": 100     # 0-100
    }

    @router.get("/status")
    async def get_triplespread_status():
        """Get TripleSpread processor status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("triplespread")

        # Return state with real-time levels
        return {
            **_triplespread_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    @router.post("/set-spread/{spread}")
    async def set_triplespread_spread(spread: float):
        """Set stereo spread amount (0-100)."""
        if not 0 <= spread <= 100:
            raise HTTPException(status_code=400, detail="Spread must be between 0 and 100")
        _triplespread_state["spread"] = spread
        return {"status": "ok", "spread": spread}

    @router.post("/set-mix/{mix}")
    async def set_triplespread_mix(mix: float):
        """Set wet/dry mix (0-100)."""
        if not 0 <= mix <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _triplespread_state["mix"] = mix
        return {"status": "ok", "mix": mix}

    @router.post("/set-bypass/{bypass}")
    async def set_triplespread_bypass(bypass: bool):
        """Set bypass state."""
        _triplespread_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/triplespread", tags=["triplespread"])

    @router.get("/status")
    async def get_triplespread_status():
        return {"available": False, "error": "TripleSpread dependencies not installed"}
