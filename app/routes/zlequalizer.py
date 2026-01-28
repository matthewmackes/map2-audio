"""
ZLEqualizer API Routes

Based on ZL Equalizer by ZL-Audio.
A 24-band dynamic parametric EQ with multiple filter types, filter structures,
stereo modes, side-chain, analyzer, and collision detection.

Features:
- 8 filter types: peak, low_shelf, low_pass, high_shelf, high_pass, notch, band_pass, tilt_shelf
- 6 filter structures: minimum_phase, state_variable, parallel, matched_phase, mixed_phase, zero_phase
- 7 slope options: 6, 12, 24, 36, 48, 72, 96 dB/oct
- 5 stereo modes: stereo, left, right, mid, side
- Dynamic EQ with threshold, knee, attack, release
- Per-band side-chain with filter type, slope, freq, Q
- Analyzer with pre/post/side spectrum, collision detection
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from typing import List, Optional

    router = APIRouter(prefix="/api/zlequalizer", tags=["zlequalizer"])

    # Valid options
    VALID_FILTER_TYPES = ["peak", "low_shelf", "low_pass", "high_shelf", "high_pass", "notch", "band_pass", "tilt_shelf"]
    VALID_FILTER_STRUCTURES = ["minimum_phase", "state_variable", "parallel", "matched_phase", "mixed_phase", "zero_phase"]
    VALID_SLOPES = [6, 12, 24, 36, 48, 72, 96]
    VALID_STEREO_MODES = ["stereo", "left", "right", "mid", "side"]
    VALID_SIDECHAIN_FILTER_TYPES = ["band_pass", "low_pass", "high_pass"]
    VALID_FFT_SLOPES = [0, 3, 4.5]

    # Band parameters model
    class BandParams(BaseModel):
        enabled: Optional[bool] = None
        solo: Optional[bool] = None
        freq: Optional[float] = None
        gain: Optional[float] = None
        q: Optional[float] = None
        filterType: Optional[str] = None
        slope: Optional[int] = None
        stereoMode: Optional[str] = None
        # Dynamic parameters
        dynamicEnabled: Optional[bool] = None
        targetGain: Optional[float] = None
        threshold: Optional[float] = None
        knee: Optional[float] = None
        attack: Optional[float] = None
        release: Optional[float] = None
        # Side-chain parameters
        sideChainFilterType: Optional[str] = None
        sideChainSlope: Optional[int] = None
        sideChainFreq: Optional[float] = None
        sideChainQ: Optional[float] = None
        bandLink: Optional[bool] = None
        externalSideChain: Optional[bool] = None

    # Request model for band update from frontend
    class BandUpdateRequest(BaseModel):
        bandIndex: int
        settings: BandParams

    # Analyzer settings model
    class AnalyzerSettings(BaseModel):
        showPre: Optional[bool] = None
        showPost: Optional[bool] = None
        showSide: Optional[bool] = None
        decaySpeed: Optional[float] = None
        fftSlope: Optional[float] = None
        collisionDetection: Optional[bool] = None
        collisionStrength: Optional[float] = None

    # Default band template
    def _create_default_band(index: int):
        # Space 24 bands logarithmically across 20Hz-20kHz
        freq = 20 * (20000 / 20) ** (index / 23)
        return {
            "enabled": False,
            "solo": False,
            "freq": round(freq, 1),
            "gain": 0.0,
            "q": 0.707,
            "filterType": "peak",
            "slope": 12,
            "stereoMode": "stereo",
            # Dynamic parameters
            "dynamicEnabled": False,
            "targetGain": 0.0,
            "threshold": -20.0,
            "knee": 6.0,
            "attack": 20.0,
            "release": 200.0,
            # Side-chain parameters
            "sideChainFilterType": "band_pass",
            "sideChainSlope": 12,
            "sideChainFreq": round(freq, 1),
            "sideChainQ": 0.707,
            "bandLink": False,
            "externalSideChain": False
        }

    # State storage (would connect to actual ZL Equalizer processor in production)
    _zlequalizer_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 0,
        # Global parameters
        "filterStructure": "minimum_phase",  # Global filter structure
        "outputGain": 0.0,        # Output gain in dB (-24 to 24)
        "scale": 1.0,             # Scale multiplier for all gains (0-2)
        "lookahead": 0.0,         # Lookahead in ms (0-20)
        "phaseFlip": False,       # Invert output phase
        "autoGain": False,        # Auto gain compensation (AGC)
        "staticGainComp": False,  # Static gain compensation (SGC)
        "dynamicLearn": False,    # Dynamic threshold/knee learning
        "dynamicRelative": False, # Dynamic relative mode
        "mix": 100,               # Wet/dry mix (0-100)
        # Band data
        "numBands": 24,
        "activeBands": 0,
        "bands": [_create_default_band(i) for i in range(24)],
        # Analyzer settings
        "analyzer": {
            "showPre": False,
            "showPost": True,
            "showSide": False,
            "decaySpeed": 50.0,
            "fftSlope": 3.0,
            "collisionDetection": False,
            "collisionStrength": 50.0
        },
        # Analyzer data for visualization
        "frequencyResponse": [],
        "preSpectrum": [],
        "postSpectrum": [],
        "sideSpectrum": []
    }

    @router.get("/status")
    async def get_zlequalizer_status():
        """Get ZL Equalizer status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Count active bands
        _zlequalizer_state["activeBands"] = sum(1 for b in _zlequalizer_state["bands"] if b["enabled"])

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("zlequalizer")

        # Return state with real-time levels
        return {
            **_zlequalizer_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    # ===== Global Parameter Endpoints =====

    @router.post("/set-filter-structure/{structure}")
    async def set_zlequalizer_filter_structure(structure: str):
        """Set global filter structure."""
        if structure not in VALID_FILTER_STRUCTURES:
            raise HTTPException(status_code=400, detail=f"Filter structure must be one of: {VALID_FILTER_STRUCTURES}")
        _zlequalizer_state["filterStructure"] = structure
        # Update latency based on structure
        latency_map = {
            "minimum_phase": 0,
            "state_variable": 0,
            "parallel": 0,
            "matched_phase": 11,
            "mixed_phase": 21,
            "zero_phase": 171
        }
        _zlequalizer_state["latency"] = latency_map.get(structure, 0)
        return {"status": "ok", "filterStructure": structure, "latency": _zlequalizer_state["latency"]}

    @router.post("/set-output-gain/{value}")
    async def set_zlequalizer_output_gain(value: float):
        """Set output gain in dB (-24 to 24)."""
        if not -24 <= value <= 24:
            raise HTTPException(status_code=400, detail="Output gain must be between -24 and 24 dB")
        _zlequalizer_state["outputGain"] = value
        return {"status": "ok", "outputGain": value}

    @router.post("/set-scale/{value}")
    async def set_zlequalizer_scale(value: float):
        """Set scale multiplier for all gains (0-2)."""
        if not 0 <= value <= 2:
            raise HTTPException(status_code=400, detail="Scale must be between 0 and 2")
        _zlequalizer_state["scale"] = value
        return {"status": "ok", "scale": value}

    @router.post("/set-mix/{value}")
    async def set_zlequalizer_mix(value: float):
        """Set wet/dry mix (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _zlequalizer_state["mix"] = value
        return {"status": "ok", "mix": value}

    @router.post("/set-bypass/{bypass}")
    async def set_zlequalizer_bypass(bypass: bool):
        """Set bypass state."""
        _zlequalizer_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

    @router.post("/set-auto-gain/{enabled}")
    async def set_zlequalizer_auto_gain(enabled: bool):
        """Enable/disable auto gain compensation (AGC)."""
        _zlequalizer_state["autoGain"] = enabled
        return {"status": "ok", "autoGain": enabled}

    @router.post("/set-static-gain-comp/{enabled}")
    async def set_zlequalizer_static_gain_comp(enabled: bool):
        """Enable/disable static gain compensation (SGC)."""
        _zlequalizer_state["staticGainComp"] = enabled
        return {"status": "ok", "staticGainComp": enabled}

    @router.post("/set-phase-flip/{enabled}")
    async def set_zlequalizer_phase_flip(enabled: bool):
        """Enable/disable phase inversion."""
        _zlequalizer_state["phaseFlip"] = enabled
        return {"status": "ok", "phaseFlip": enabled}

    @router.post("/set-lookahead/{value}")
    async def set_zlequalizer_lookahead(value: float):
        """Set lookahead in ms (0-20)."""
        if not 0 <= value <= 20:
            raise HTTPException(status_code=400, detail="Lookahead must be between 0 and 20 ms")
        _zlequalizer_state["lookahead"] = value
        return {"status": "ok", "lookahead": value}

    @router.post("/set-dynamic-learn/{enabled}")
    async def set_zlequalizer_dynamic_learn(enabled: bool):
        """Enable/disable dynamic threshold/knee learning."""
        _zlequalizer_state["dynamicLearn"] = enabled
        return {"status": "ok", "dynamicLearn": enabled}

    @router.post("/set-dynamic-relative/{enabled}")
    async def set_zlequalizer_dynamic_relative(enabled: bool):
        """Enable/disable dynamic relative mode (volume sensitivity)."""
        _zlequalizer_state["dynamicRelative"] = enabled
        return {"status": "ok", "dynamicRelative": enabled}

    # ===== Analyzer Endpoints =====

    @router.post("/analyzer/set-show-pre/{enabled}")
    async def set_analyzer_show_pre(enabled: bool):
        """Show/hide pre-EQ spectrum."""
        _zlequalizer_state["analyzer"]["showPre"] = enabled
        return {"status": "ok", "showPre": enabled}

    @router.post("/analyzer/set-show-post/{enabled}")
    async def set_analyzer_show_post(enabled: bool):
        """Show/hide post-EQ spectrum."""
        _zlequalizer_state["analyzer"]["showPost"] = enabled
        return {"status": "ok", "showPost": enabled}

    @router.post("/analyzer/set-show-side/{enabled}")
    async def set_analyzer_show_side(enabled: bool):
        """Show/hide side-chain spectrum."""
        _zlequalizer_state["analyzer"]["showSide"] = enabled
        return {"status": "ok", "showSide": enabled}

    @router.post("/analyzer/set-decay-speed/{value}")
    async def set_analyzer_decay_speed(value: float):
        """Set analyzer decay speed (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Decay speed must be between 0 and 100")
        _zlequalizer_state["analyzer"]["decaySpeed"] = value
        return {"status": "ok", "decaySpeed": value}

    @router.post("/analyzer/set-fft-slope/{value}")
    async def set_analyzer_fft_slope(value: float):
        """Set FFT tilt slope (0, 3, or 4.5 dB/oct)."""
        if value not in VALID_FFT_SLOPES:
            raise HTTPException(status_code=400, detail=f"FFT slope must be one of: {VALID_FFT_SLOPES}")
        _zlequalizer_state["analyzer"]["fftSlope"] = value
        return {"status": "ok", "fftSlope": value}

    @router.post("/analyzer/set-collision-detection/{enabled}")
    async def set_analyzer_collision_detection(enabled: bool):
        """Enable/disable collision detection."""
        _zlequalizer_state["analyzer"]["collisionDetection"] = enabled
        return {"status": "ok", "collisionDetection": enabled}

    @router.post("/analyzer/set-collision-strength/{value}")
    async def set_analyzer_collision_strength(value: float):
        """Set collision detection strength (0-100)."""
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail="Collision strength must be between 0 and 100")
        _zlequalizer_state["analyzer"]["collisionStrength"] = value
        return {"status": "ok", "collisionStrength": value}

    @router.post("/analyzer/settings")
    async def set_analyzer_settings(settings: AnalyzerSettings):
        """Update multiple analyzer settings at once."""
        analyzer = _zlequalizer_state["analyzer"]
        if settings.showPre is not None:
            analyzer["showPre"] = settings.showPre
        if settings.showPost is not None:
            analyzer["showPost"] = settings.showPost
        if settings.showSide is not None:
            analyzer["showSide"] = settings.showSide
        if settings.decaySpeed is not None:
            if not 0 <= settings.decaySpeed <= 100:
                raise HTTPException(status_code=400, detail="Decay speed must be between 0 and 100")
            analyzer["decaySpeed"] = settings.decaySpeed
        if settings.fftSlope is not None:
            if settings.fftSlope not in VALID_FFT_SLOPES:
                raise HTTPException(status_code=400, detail=f"FFT slope must be one of: {VALID_FFT_SLOPES}")
            analyzer["fftSlope"] = settings.fftSlope
        if settings.collisionDetection is not None:
            analyzer["collisionDetection"] = settings.collisionDetection
        if settings.collisionStrength is not None:
            if not 0 <= settings.collisionStrength <= 100:
                raise HTTPException(status_code=400, detail="Collision strength must be between 0 and 100")
            analyzer["collisionStrength"] = settings.collisionStrength
        return {"status": "ok", "analyzer": analyzer}

    # ===== Band Endpoints =====

    def _update_band(band: dict, params: BandParams):
        """Helper to update band parameters with validation."""
        if params.enabled is not None:
            band["enabled"] = params.enabled
        if params.solo is not None:
            band["solo"] = params.solo
        if params.freq is not None:
            if not 20 <= params.freq <= 20000:
                raise HTTPException(status_code=400, detail="Frequency must be between 20 and 20000 Hz")
            band["freq"] = params.freq
        if params.gain is not None:
            if not -30 <= params.gain <= 30:
                raise HTTPException(status_code=400, detail="Gain must be between -30 and 30 dB")
            band["gain"] = params.gain
        if params.q is not None:
            if not 0.1 <= params.q <= 20:
                raise HTTPException(status_code=400, detail="Q must be between 0.1 and 20")
            band["q"] = params.q
        if params.filterType is not None:
            if params.filterType not in VALID_FILTER_TYPES:
                raise HTTPException(status_code=400, detail=f"Filter type must be one of: {VALID_FILTER_TYPES}")
            band["filterType"] = params.filterType
        if params.slope is not None:
            if params.slope not in VALID_SLOPES:
                raise HTTPException(status_code=400, detail=f"Slope must be one of: {VALID_SLOPES}")
            band["slope"] = params.slope
        if params.stereoMode is not None:
            if params.stereoMode not in VALID_STEREO_MODES:
                raise HTTPException(status_code=400, detail=f"Stereo mode must be one of: {VALID_STEREO_MODES}")
            band["stereoMode"] = params.stereoMode
        # Dynamic parameters
        if params.dynamicEnabled is not None:
            band["dynamicEnabled"] = params.dynamicEnabled
        if params.targetGain is not None:
            if not -30 <= params.targetGain <= 30:
                raise HTTPException(status_code=400, detail="Target gain must be between -30 and 30 dB")
            band["targetGain"] = params.targetGain
        if params.threshold is not None:
            if not -60 <= params.threshold <= 0:
                raise HTTPException(status_code=400, detail="Threshold must be between -60 and 0 dB")
            band["threshold"] = params.threshold
        if params.knee is not None:
            if not 0 <= params.knee <= 30:
                raise HTTPException(status_code=400, detail="Knee must be between 0 and 30 dB")
            band["knee"] = params.knee
        if params.attack is not None:
            if not 0 <= params.attack <= 500:
                raise HTTPException(status_code=400, detail="Attack must be between 0 and 500 ms")
            band["attack"] = params.attack
        if params.release is not None:
            if not 0 <= params.release <= 5000:
                raise HTTPException(status_code=400, detail="Release must be between 0 and 5000 ms")
            band["release"] = params.release
        # Side-chain parameters
        if params.sideChainFilterType is not None:
            if params.sideChainFilterType not in VALID_SIDECHAIN_FILTER_TYPES:
                raise HTTPException(status_code=400, detail=f"Side-chain filter type must be one of: {VALID_SIDECHAIN_FILTER_TYPES}")
            band["sideChainFilterType"] = params.sideChainFilterType
        if params.sideChainSlope is not None:
            if params.sideChainSlope not in VALID_SLOPES:
                raise HTTPException(status_code=400, detail=f"Side-chain slope must be one of: {VALID_SLOPES}")
            band["sideChainSlope"] = params.sideChainSlope
        if params.sideChainFreq is not None:
            if not 20 <= params.sideChainFreq <= 20000:
                raise HTTPException(status_code=400, detail="Side-chain frequency must be between 20 and 20000 Hz")
            band["sideChainFreq"] = params.sideChainFreq
        if params.sideChainQ is not None:
            if not 0.1 <= params.sideChainQ <= 20:
                raise HTTPException(status_code=400, detail="Side-chain Q must be between 0.1 and 20")
            band["sideChainQ"] = params.sideChainQ
        if params.bandLink is not None:
            band["bandLink"] = params.bandLink
        if params.externalSideChain is not None:
            band["externalSideChain"] = params.externalSideChain

    @router.post("/set-band/{band_index}")
    async def set_zlequalizer_band(band_index: int, params: BandParams):
        """Update a specific EQ band's parameters."""
        if not 0 <= band_index < 24:
            raise HTTPException(status_code=400, detail="Band index must be between 0 and 23")
        band = _zlequalizer_state["bands"][band_index]
        _update_band(band, params)
        return {"status": "ok", "band": band_index, "params": band}

    @router.post("/set-band")
    async def set_zlequalizer_band_from_body(request: BandUpdateRequest):
        """Update a specific EQ band's parameters (body-based)."""
        band_index = request.bandIndex
        if not 0 <= band_index < 24:
            raise HTTPException(status_code=400, detail="Band index must be between 0 and 23")
        band = _zlequalizer_state["bands"][band_index]
        _update_band(band, request.settings)
        return {"status": "ok", "band": band_index, "params": band}

    @router.post("/reset-bands")
    async def reset_zlequalizer_bands():
        """Reset all bands to default state."""
        _zlequalizer_state["bands"] = [_create_default_band(i) for i in range(24)]
        _zlequalizer_state["activeBands"] = 0
        return {"status": "ok", "message": "All bands reset to default"}

    @router.post("/solo-band/{band_index}")
    async def solo_zlequalizer_band(band_index: int):
        """Solo a specific band (unsolo all others)."""
        if not 0 <= band_index < 24:
            raise HTTPException(status_code=400, detail="Band index must be between 0 and 23")
        for i, band in enumerate(_zlequalizer_state["bands"]):
            band["solo"] = (i == band_index)
        return {"status": "ok", "soloedBand": band_index}

    @router.post("/unsolo-all")
    async def unsolo_all_bands():
        """Unsolo all bands."""
        for band in _zlequalizer_state["bands"]:
            band["solo"] = False
        return {"status": "ok", "message": "All bands unsoloed"}

    # ===== Utility Endpoints =====

    @router.post("/invert-gains")
    async def invert_all_gains():
        """Invert gain of all enabled bands."""
        for band in _zlequalizer_state["bands"]:
            if band["enabled"]:
                band["gain"] = -band["gain"]
                band["targetGain"] = -band["targetGain"]
        return {"status": "ok", "message": "Gains inverted"}

    @router.post("/split-lr")
    async def split_left_right():
        """Split bands to Left/Right stereo mode alternately."""
        for i, band in enumerate(_zlequalizer_state["bands"]):
            if band["enabled"]:
                band["stereoMode"] = "left" if i % 2 == 0 else "right"
        return {"status": "ok", "message": "Bands split L/R"}

    @router.post("/split-ms")
    async def split_mid_side():
        """Split bands to Mid/Side stereo mode alternately."""
        for i, band in enumerate(_zlequalizer_state["bands"]):
            if band["enabled"]:
                band["stereoMode"] = "mid" if i % 2 == 0 else "side"
        return {"status": "ok", "message": "Bands split M/S"}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/zlequalizer", tags=["zlequalizer"])

    @router.get("/status")
    async def get_zlequalizer_status():
        return {"available": False, "error": "ZLEqualizer dependencies not installed"}
