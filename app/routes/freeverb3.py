"""
Freeverb3 API Routes

Based on GNU Freeverb3 by Teru Kamogashira.
High-quality algorithmic reverb with multiple algorithms and SIMD optimization.
"""

try:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/freeverb3", tags=["freeverb3"])

    # State storage (would connect to actual Freeverb3 processor in production)
    _freeverb3_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        # Reverb type selection
        "reverbType": "freeverb",
        # Common reverb parameters
        "roomSize": 50,           # 0-100
        "damping": 50,            # 0-100
        "width": 100,             # 0-100
        "predelay": 0,            # ms (0-200)
        "decay": 50,              # 0-100
        # Tone controls
        "lowCut": 20,             # Hz (20-500)
        "highCut": 20000,         # Hz (1000-20000)
        # Modulation
        "modulation": 0,          # 0-100
        "modFreq": 1.0,           # Hz (0.1-10)
        # Early reflections
        "earlyMix": 30,           # 0-100
        "earlySize": 50,          # 0-100
        # Output
        "mix": 30,                # 0-100
        "outputGain": 0,          # dB (-24 to 24)
        # Diffusion
        "diffusion": 70,          # 0-100
        # Spin/wander
        "spin": 50,               # 0-100
        "wander": 50,             # 0-100
    }

    # Valid reverb types
    REVERB_TYPES = ['freeverb', 'strev', 'nrev', 'progenitor', 'zrev', 'earlyref']

    @router.get("/status")
    async def get_freeverb3_status():
        """Get Freeverb3 reverb status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("freeverb3")

        # Return state with real-time levels
        return {
            **_freeverb3_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    @router.post("/set-reverb-type/{reverb_type}")
    async def set_freeverb3_reverb_type(reverb_type: str):
        """Set reverb algorithm type."""
        if reverb_type not in REVERB_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid reverb type. Must be one of: {REVERB_TYPES}")
        _freeverb3_state["reverbType"] = reverb_type
        return {"status": "ok", "reverbType": reverb_type}

    @router.post("/set-room-size/{value}")
    async def set_freeverb3_room_size(value: float):
        """Set room size (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Room size must be between 0 and 100")
        _freeverb3_state["roomSize"] = value
        return {"status": "ok", "roomSize": value}

    @router.post("/set-damping/{value}")
    async def set_freeverb3_damping(value: float):
        """Set high frequency damping (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Damping must be between 0 and 100")
        _freeverb3_state["damping"] = value
        return {"status": "ok", "damping": value}

    @router.post("/set-width/{value}")
    async def set_freeverb3_width(value: float):
        """Set stereo width (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Width must be between 0 and 100")
        _freeverb3_state["width"] = value
        return {"status": "ok", "width": value}

    @router.post("/set-predelay/{value}")
    async def set_freeverb3_predelay(value: float):
        """Set pre-delay in ms (0-200)."""
        if not 0 <= value <= 200:
            raise HTTPException(status_code=400, detail="Pre-delay must be between 0 and 200 ms")
        _freeverb3_state["predelay"] = value
        return {"status": "ok", "predelay": value}

    @router.post("/set-decay/{value}")
    async def set_freeverb3_decay(value: float):
        """Set decay time (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Decay must be between 0 and 100")
        _freeverb3_state["decay"] = value
        return {"status": "ok", "decay": value}

    @router.post("/set-low-cut/{value}")
    async def set_freeverb3_low_cut(value: float):
        """Set low cut frequency in Hz (20-500)."""
        if not 20 <= value <= 500:
            raise HTTPException(status_code=400, detail="Low cut must be between 20 and 500 Hz")
        _freeverb3_state["lowCut"] = value
        return {"status": "ok", "lowCut": value}

    @router.post("/set-high-cut/{value}")
    async def set_freeverb3_high_cut(value: float):
        """Set high cut frequency in Hz (1000-20000)."""
        if not 1000 <= value <= 20000:
            raise HTTPException(status_code=400, detail="High cut must be between 1000 and 20000 Hz")
        _freeverb3_state["highCut"] = value
        return {"status": "ok", "highCut": value}

    @router.post("/set-modulation/{value}")
    async def set_freeverb3_modulation(value: float):
        """Set modulation depth (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Modulation must be between 0 and 100")
        _freeverb3_state["modulation"] = value
        return {"status": "ok", "modulation": value}

    @router.post("/set-mod-freq/{value}")
    async def set_freeverb3_mod_freq(value: float):
        """Set modulation frequency in Hz (0.1-10)."""
        if not 0.1 <= value <= 10:
            raise HTTPException(status_code=400, detail="Mod frequency must be between 0.1 and 10 Hz")
        _freeverb3_state["modFreq"] = value
        return {"status": "ok", "modFreq": value}

    @router.post("/set-early-mix/{value}")
    async def set_freeverb3_early_mix(value: float):
        """Set early reflections mix (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Early mix must be between 0 and 100")
        _freeverb3_state["earlyMix"] = value
        return {"status": "ok", "earlyMix": value}

    @router.post("/set-early-size/{value}")
    async def set_freeverb3_early_size(value: float):
        """Set early reflections size (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Early size must be between 0 and 100")
        _freeverb3_state["earlySize"] = value
        return {"status": "ok", "earlySize": value}

    @router.post("/set-mix/{value}")
    async def set_freeverb3_mix(value: float):
        """Set wet/dry mix (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _freeverb3_state["mix"] = value
        return {"status": "ok", "mix": value}

    @router.post("/set-output-gain/{value}")
    async def set_freeverb3_output_gain(value: float):
        """Set output gain in dB (-24 to 24)."""
        if not -24 <= value <= 24:
            raise HTTPException(status_code=400, detail="Output gain must be between -24 and 24 dB")
        _freeverb3_state["outputGain"] = value
        return {"status": "ok", "outputGain": value}

    @router.post("/set-diffusion/{value}")
    async def set_freeverb3_diffusion(value: float):
        """Set diffusion amount (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Diffusion must be between 0 and 100")
        _freeverb3_state["diffusion"] = value
        return {"status": "ok", "diffusion": value}

    @router.post("/set-spin/{value}")
    async def set_freeverb3_spin(value: float):
        """Set spin amount (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Spin must be between 0 and 100")
        _freeverb3_state["spin"] = value
        return {"status": "ok", "spin": value}

    @router.post("/set-wander/{value}")
    async def set_freeverb3_wander(value: float):
        """Set wander amount (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Wander must be between 0 and 100")
        _freeverb3_state["wander"] = value
        return {"status": "ok", "wander": value}

    @router.post("/set-bypass/{bypass}")
    async def set_freeverb3_bypass(bypass: bool):
        """Set bypass state."""
        _freeverb3_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/freeverb3", tags=["freeverb3"])

    @router.get("/status")
    async def get_freeverb3_status():
        return {"available": False, "error": "Freeverb3 dependencies not installed"}
