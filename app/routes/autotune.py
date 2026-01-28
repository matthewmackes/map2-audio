"""
Zita AT1 Auto-Tune API Routes

Based on Fons Adriaensen's zita-at1 - an auto-tuner with:
- Pitch correction with clean resampling
- Configurable note selection (chromatic, scales)
- MIDI control for target notes
- Low latency mode option
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from typing import List

    router = APIRouter(prefix="/api/autotune", tags=["autotune"])

    # State storage (would connect to actual auto-tune processor in production)
    _autotune_state = {
        "available": True,
        "bypass": False,
        "inputLevel": -60,
        "outputLevel": -60,
        "peakInput": -60,
        "peakOutput": -60,
        "latency": 21,
        "pitchError": 0,
        "detectedNote": None,
        "detectedFrequency": 0,
        "tuning": 440,
        "bias": 0.5,
        "filter": 0.5,
        "correction": 1.0,
        "offset": 0,
        "enabledNotes": [True] * 12,
        "midiEnabled": False,
        "midiChannel": 0,
        "lowLatencyMode": False
    }

    class NotesParams(BaseModel):
        notes: List[bool]

    class MidiParams(BaseModel):
        enabled: bool
        channel: int

    @router.get("/status")
    async def get_autotune_status():
        """Get Zita AT1 auto-tune processor status."""
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("autotune")

        # Return state with real-time levels
        return {
            **_autotune_state,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
        }

    @router.post("/set-tuning/{tuning}")
    async def set_autotune_tuning(tuning: float):
        """Set reference tuning frequency for A (430-450 Hz)."""
        if not 430 <= tuning <= 450:
            raise HTTPException(status_code=400, detail="Tuning must be between 430 and 450 Hz")
        _autotune_state["tuning"] = tuning
        return {"status": "ok", "tuning": tuning}

    @router.post("/set-bias/{bias}")
    async def set_autotune_bias(bias: float):
        """Set bias - preference for staying on current note (0-1)."""
        if not 0 <= bias <= 1:
            raise HTTPException(status_code=400, detail="Bias must be between 0 and 1")
        _autotune_state["bias"] = bias
        return {"status": "ok", "bias": bias}

    @router.post("/set-filter/{filter_val}")
    async def set_autotune_filter(filter_val: float):
        """Set filter - smoothing amount on pitch correction (0-1)."""
        if not 0 <= filter_val <= 1:
            raise HTTPException(status_code=400, detail="Filter must be between 0 and 1")
        _autotune_state["filter"] = filter_val
        return {"status": "ok", "filter": filter_val}

    @router.post("/set-correction/{correction}")
    async def set_autotune_correction(correction: float):
        """Set correction amount - how much pitch error gets corrected (0-1)."""
        if not 0 <= correction <= 1:
            raise HTTPException(status_code=400, detail="Correction must be between 0 and 1")
        _autotune_state["correction"] = correction
        return {"status": "ok", "correction": correction}

    @router.post("/set-offset/{offset}")
    async def set_autotune_offset(offset: int):
        """Set pitch offset in cents (-200 to 200, i.e., +/- 2 semitones)."""
        if not -200 <= offset <= 200:
            raise HTTPException(status_code=400, detail="Offset must be between -200 and 200 cents")
        _autotune_state["offset"] = offset
        return {"status": "ok", "offset": offset}

    @router.post("/set-notes")
    async def set_autotune_notes(params: NotesParams):
        """Set which notes are valid correction targets (12 booleans for C through B)."""
        if len(params.notes) != 12:
            raise HTTPException(status_code=400, detail="Must provide exactly 12 boolean values")
        _autotune_state["enabledNotes"] = params.notes
        return {"status": "ok", "enabledNotes": params.notes}

    @router.post("/set-midi")
    async def set_autotune_midi(params: MidiParams):
        """Set MIDI control settings."""
        if not 0 <= params.channel <= 16:
            raise HTTPException(status_code=400, detail="MIDI channel must be 0 (Omni) or 1-16")
        _autotune_state["midiEnabled"] = params.enabled
        _autotune_state["midiChannel"] = params.channel
        return {"status": "ok", "midiEnabled": params.enabled, "midiChannel": params.channel}

    @router.post("/set-low-latency/{enabled}")
    async def set_autotune_low_latency(enabled: bool):
        """Enable/disable low latency mode (~10ms vs ~21ms)."""
        _autotune_state["lowLatencyMode"] = enabled
        _autotune_state["latency"] = 10 if enabled else 21
        return {"status": "ok", "lowLatencyMode": enabled, "latency": _autotune_state["latency"]}

    @router.post("/set-bypass/{bypass}")
    async def set_autotune_bypass(bypass: bool):
        """Set auto-tune bypass state."""
        _autotune_state["bypass"] = bypass
        return {"status": "ok", "bypass": bypass}

    # Scale presets
    @router.post("/preset/chromatic")
    async def set_preset_chromatic():
        """Set all 12 notes as valid targets (chromatic)."""
        _autotune_state["enabledNotes"] = [True] * 12
        return {"status": "ok", "preset": "chromatic", "enabledNotes": _autotune_state["enabledNotes"]}

    @router.post("/preset/major")
    async def set_preset_major():
        """Set major scale notes as valid targets (C major pattern)."""
        # C, D, E, F, G, A, B
        _autotune_state["enabledNotes"] = [True, False, True, False, True, True, False, True, False, True, False, True]
        return {"status": "ok", "preset": "major", "enabledNotes": _autotune_state["enabledNotes"]}

    @router.post("/preset/minor")
    async def set_preset_minor():
        """Set natural minor scale notes as valid targets."""
        # A minor pattern applied to C: C, D, Eb, F, G, Ab, Bb
        _autotune_state["enabledNotes"] = [True, False, True, True, False, True, False, True, True, False, True, False]
        return {"status": "ok", "preset": "minor", "enabledNotes": _autotune_state["enabledNotes"]}

    @router.post("/preset/pentatonic")
    async def set_preset_pentatonic():
        """Set major pentatonic scale notes as valid targets."""
        # C, D, E, G, A
        _autotune_state["enabledNotes"] = [True, False, True, False, True, False, False, True, False, True, False, False]
        return {"status": "ok", "preset": "pentatonic", "enabledNotes": _autotune_state["enabledNotes"]}

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/autotune", tags=["autotune"])

    @router.get("/status")
    async def get_autotune_status():
        return {"available": False, "error": "Auto-tune dependencies not installed"}
