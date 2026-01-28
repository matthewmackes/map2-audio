"""
Valentine API Routes

Based on Valentine by Tote Bag Labs.
An aggressive compressor/saturator inspired by the Justice album sound.
Signal path: Crush -> Compress -> Saturate -> Soft Clip -> Output -> Mix
"""

try:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/valentine", tags=["valentine"])

    # State storage (would connect to actual Valentine processor in production)
    _valentine_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        "gainReduction": 0,
        # Valentine-specific parameters
        "crush": False,       # Bit crushing/downsampling to 27.5kHz
        "compress": 50,       # Gain before compression (0-100)
        "saturate": 30,       # Pre-waveshaper gain (0-100)
        "ratio": 4.0,         # Compression ratio (1-1000, 1000 = infinity)
        "attack": 20,         # Attack time (0-100)
        "release": 50,        # Release time (0-100)
        "output": 70,         # Wet signal output gain (0-100)
        "mix": 100,           # Wet/dry mix (0-100)
        "clipOutput": False,  # Enable output clipping
    }

    @router.get("/status")
    async def get_valentine_status():
        """Get Valentine compressor status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("valentine")

        # Return state with real-time levels (including gain reduction for compressor)
        return {
            **_valentine_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
            "gainReduction": levels["gainReduction"],
        }

    @router.post("/set-crush/{enabled}")
    async def set_valentine_crush(enabled: bool):
        """Enable/disable bit crushing (downsampling to 27.5kHz)."""
        _valentine_state["crush"] = enabled
        return {"status": "ok", "crush": enabled}

    @router.post("/set-compress/{value}")
    async def set_valentine_compress(value: float):
        """Set compression input gain (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Compress must be between 0 and 100")
        _valentine_state["compress"] = value
        return {"status": "ok", "compress": value}

    @router.post("/set-saturate/{value}")
    async def set_valentine_saturate(value: float):
        """Set saturation amount (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Saturate must be between 0 and 100")
        _valentine_state["saturate"] = value
        return {"status": "ok", "saturate": value}

    @router.post("/set-ratio/{value}")
    async def set_valentine_ratio(value: float):
        """Set compression ratio (1-1000, where 1000 = infinity)."""
        if not 1 <= value <= 1000:
            raise HTTPException(status_code=400, detail="Ratio must be between 1 and 1000")
        _valentine_state["ratio"] = value
        return {"status": "ok", "ratio": value}

    @router.post("/set-attack/{value}")
    async def set_valentine_attack(value: float):
        """Set attack time (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Attack must be between 0 and 100")
        _valentine_state["attack"] = value
        return {"status": "ok", "attack": value}

    @router.post("/set-release/{value}")
    async def set_valentine_release(value: float):
        """Set release time (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Release must be between 0 and 100")
        _valentine_state["release"] = value
        return {"status": "ok", "release": value}

    @router.post("/set-output/{value}")
    async def set_valentine_output(value: float):
        """Set output gain (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Output must be between 0 and 100")
        _valentine_state["output"] = value
        return {"status": "ok", "output": value}

    @router.post("/set-mix/{value}")
    async def set_valentine_mix(value: float):
        """Set wet/dry mix (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _valentine_state["mix"] = value
        return {"status": "ok", "mix": value}

    @router.post("/set-clip-output/{enabled}")
    async def set_valentine_clip_output(enabled: bool):
        """Enable/disable output clipping."""
        _valentine_state["clipOutput"] = enabled
        return {"status": "ok", "clipOutput": enabled}

    @router.post("/set-bypass/{bypass}")
    async def set_valentine_bypass(bypass: bool):
        """Set bypass state."""
        _valentine_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/valentine", tags=["valentine"])

    @router.get("/status")
    async def get_valentine_status():
        return {"available": False, "error": "Valentine dependencies not installed"}
