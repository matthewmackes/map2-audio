"""
Modulation Processing API Routes
Chorus, Phaser, and EVH-style Pitch Shifter with Van Halen presets
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/modulation", tags=["modulation"])


# ========================================
# Chorus Models
# ========================================

class ChorusParams(BaseModel):
    """Chorus parameters"""
    rate: Optional[float] = Field(None, ge=0.1, le=10.0, description="LFO rate in Hz")
    depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    centre_delay: Optional[float] = Field(None, ge=1.0, le=30.0, description="Centre delay in ms")
    feedback: Optional[float] = Field(None, ge=-100.0, le=100.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    spread: Optional[float] = Field(None, ge=0.0, le=100.0, description="Stereo spread %")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class ChorusMetering(BaseModel):
    """Chorus metering data"""
    input_level: float
    output_level: float
    lfo_phase: float


# ========================================
# Phaser Models
# ========================================

class PhaserParams(BaseModel):
    """Phaser parameters"""
    rate: Optional[float] = Field(None, ge=0.05, le=5.0, description="LFO rate in Hz")
    depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    centre_frequency: Optional[float] = Field(None, ge=100.0, le=10000.0, description="Centre frequency in Hz")
    feedback: Optional[float] = Field(None, ge=-100.0, le=100.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class PhaserMetering(BaseModel):
    """Phaser metering data"""
    input_level: float
    output_level: float
    lfo_phase: float


# ========================================
# Pitch Shifter Models
# ========================================

class PitchShifterParams(BaseModel):
    """Pitch shifter parameters"""
    pitch_l: Optional[float] = Field(None, ge=-1200.0, le=1200.0, description="Left pitch shift in cents")
    pitch_r: Optional[float] = Field(None, ge=-1200.0, le=1200.0, description="Right pitch shift in cents")
    delay_l: Optional[float] = Field(None, ge=0.0, le=100.0, description="Left delay in ms")
    delay_r: Optional[float] = Field(None, ge=0.0, le=100.0, description="Right delay in ms")
    feedback: Optional[float] = Field(None, ge=0.0, le=90.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    spread: Optional[float] = Field(None, ge=0.0, le=200.0, description="Stereo spread %")
    preset: Optional[int] = Field(None, ge=0, le=14, description="Preset index")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class PitchShifterMetering(BaseModel):
    """Pitch shifter metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    grain_phase: float


class PresetInfo(BaseModel):
    """Van Halen preset information"""
    index: int
    name: str
    song: str
    album: str
    year: str
    description: str
    settings: Dict[str, Any]


# ========================================
# Chorus Routes
# ========================================

@router.get("/chorus")
async def get_chorus() -> Dict[str, Any]:
    """Get chorus parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_chorus_parameters()
    metering = await engine.get_chorus_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/chorus/parameters")
async def get_chorus_parameters() -> Dict[str, Any]:
    """Get chorus parameters only."""
    engine = get_audio_engine()
    return await engine.get_chorus_parameters()


@router.get("/chorus/metering")
async def get_chorus_metering() -> Dict[str, float]:
    """Get chorus metering data."""
    engine = get_audio_engine()
    return await engine.get_chorus_metering()


@router.patch("/chorus/parameters")
async def update_chorus_parameters(params: ChorusParams) -> Dict[str, Any]:
    """Update chorus parameters."""
    engine = get_audio_engine()

    if params.rate is not None:
        await engine.set_chorus_rate(params.rate)
    if params.depth is not None:
        await engine.set_chorus_depth(params.depth / 100.0)  # Convert to 0-1
    if params.centre_delay is not None:
        await engine.set_chorus_centre_delay(params.centre_delay)
    if params.feedback is not None:
        await engine.set_chorus_feedback(params.feedback / 100.0)  # Convert to -1 to 1
    if params.mix is not None:
        await engine.set_chorus_mix(params.mix / 100.0)  # Convert to 0-1
    if params.spread is not None:
        await engine.set_chorus_spread(params.spread / 100.0)
    if params.bypass is not None:
        await engine.set_chorus_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_chorus_parameters()}


@router.post("/chorus/bypass/{bypass}")
async def set_chorus_bypass(bypass: bool) -> Dict[str, Any]:
    """Set chorus bypass state."""
    engine = get_audio_engine()
    await engine.set_chorus_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Phaser Routes
# ========================================

@router.get("/phaser")
async def get_phaser() -> Dict[str, Any]:
    """Get phaser parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_phaser_parameters()
    metering = await engine.get_phaser_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/phaser/parameters")
async def get_phaser_parameters() -> Dict[str, Any]:
    """Get phaser parameters only."""
    engine = get_audio_engine()
    return await engine.get_phaser_parameters()


@router.get("/phaser/metering")
async def get_phaser_metering() -> Dict[str, float]:
    """Get phaser metering data."""
    engine = get_audio_engine()
    return await engine.get_phaser_metering()


@router.patch("/phaser/parameters")
async def update_phaser_parameters(params: PhaserParams) -> Dict[str, Any]:
    """Update phaser parameters."""
    engine = get_audio_engine()

    if params.rate is not None:
        await engine.set_phaser_rate(params.rate)
    if params.depth is not None:
        await engine.set_phaser_depth(params.depth / 100.0)  # Convert to 0-1
    if params.centre_frequency is not None:
        await engine.set_phaser_centre_frequency(params.centre_frequency)
    if params.feedback is not None:
        await engine.set_phaser_feedback(params.feedback / 100.0)  # Convert to -1 to 1
    if params.mix is not None:
        await engine.set_phaser_mix(params.mix / 100.0)  # Convert to 0-1
    if params.bypass is not None:
        await engine.set_phaser_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_phaser_parameters()}


@router.post("/phaser/bypass/{bypass}")
async def set_phaser_bypass(bypass: bool) -> Dict[str, Any]:
    """Set phaser bypass state."""
    engine = get_audio_engine()
    await engine.set_phaser_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Pitch Shifter Routes
# ========================================

@router.get("/pitch-shifter")
async def get_pitch_shifter() -> Dict[str, Any]:
    """Get pitch shifter parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_pitch_shifter_parameters()
    metering = await engine.get_pitch_shifter_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/pitch-shifter/parameters")
async def get_pitch_shifter_parameters() -> Dict[str, Any]:
    """Get pitch shifter parameters only."""
    engine = get_audio_engine()
    return await engine.get_pitch_shifter_parameters()


@router.get("/pitch-shifter/metering")
async def get_pitch_shifter_metering() -> Dict[str, float]:
    """Get pitch shifter metering data."""
    engine = get_audio_engine()
    return await engine.get_pitch_shifter_metering()


@router.patch("/pitch-shifter/parameters")
async def update_pitch_shifter_parameters(params: PitchShifterParams) -> Dict[str, Any]:
    """Update pitch shifter parameters."""
    engine = get_audio_engine()

    # If preset is set, apply it first (this will set pitch/delay values)
    if params.preset is not None:
        await engine.set_pitch_shifter_preset(params.preset)
    else:
        # Only set individual pitch/delay if not using a preset
        if params.pitch_l is not None:
            await engine.set_pitch_shifter_pitch_l(params.pitch_l)
        if params.pitch_r is not None:
            await engine.set_pitch_shifter_pitch_r(params.pitch_r)
        if params.delay_l is not None:
            await engine.set_pitch_shifter_delay_l(params.delay_l)
        if params.delay_r is not None:
            await engine.set_pitch_shifter_delay_r(params.delay_r)

    if params.feedback is not None:
        await engine.set_pitch_shifter_feedback(params.feedback / 100.0)  # Convert to 0-0.9
    if params.mix is not None:
        await engine.set_pitch_shifter_mix(params.mix)
    if params.spread is not None:
        await engine.set_pitch_shifter_spread(params.spread)
    if params.bypass is not None:
        await engine.set_pitch_shifter_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_pitch_shifter_parameters()}


@router.post("/pitch-shifter/preset/{preset_index}")
async def set_pitch_shifter_preset(preset_index: int) -> Dict[str, Any]:
    """
    Set pitch shifter to a Van Halen preset.

    Presets:
    0  - Manual (user settings)
    1  - Eruption (VH1 1978)
    2  - Unchained (Fair Warning 1981)
    3  - Little Guitars (Diver Down 1982)
    4  - Mean Street (Fair Warning 1981)
    5  - Drop Dead Legs (1984)
    6  - Panama (1984)
    7  - Cathedral (Diver Down 1982)
    8  - Hot For Teacher (1984)
    9  - Why Can't This Be Love (5150 1986)
    10 - Dreams (5150 1986)
    11 - Finish What Ya Started (OU812 1988)
    12 - Right Now (F.U.C.K. 1991)
    13 - Can't Stop Lovin' You (Balance 1995)
    14 - Humans Being (Twister 1996)
    """
    if preset_index < 0 or preset_index > 14:
        raise HTTPException(status_code=400, detail="Invalid preset index (0-14)")

    engine = get_audio_engine()
    await engine.set_pitch_shifter_preset(preset_index)

    return {
        "status": "ok",
        "preset": preset_index,
        "parameters": await engine.get_pitch_shifter_parameters()
    }


@router.post("/pitch-shifter/bypass/{bypass}")
async def set_pitch_shifter_bypass(bypass: bool) -> Dict[str, Any]:
    """Set pitch shifter bypass state."""
    engine = get_audio_engine()
    await engine.set_pitch_shifter_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.get("/pitch-shifter/presets")
async def get_pitch_shifter_presets() -> List[PresetInfo]:
    """
    Get all Van Halen-inspired pitch shifter presets.

    Based on documented vintage harmonizer settings from:
    - Audio equipment forums
    - VHLinks.com
    - Metropoulos Forum
    - Premier Guitar
    """
    return [
        PresetInfo(
            index=0,
            name="Manual",
            song="Custom",
            album="-",
            year="-",
            description="User-defined pitch shift settings",
            settings={}
        ),
        PresetInfo(
            index=1,
            name="Eruption",
            song="Eruption",
            album="Van Halen",
            year="1978",
            description="Classic VH1 tone - subtle +/-4c detune with 3/6ms delay stagger",
            settings={"pitch_l": 4, "pitch_r": -4, "delay_l": 3, "delay_r": 6, "mix": 40}
        ),
        PresetInfo(
            index=2,
            name="Unchained",
            song="Unchained",
            album="Fair Warning",
            year="1981",
            description="Punchy H910 detune for the main riff",
            settings={"pitch_l": 4, "pitch_r": -4, "delay_l": 3, "delay_r": 6, "mix": 35}
        ),
        PresetInfo(
            index=3,
            name="Little Guitars",
            song="Little Guitars",
            album="Diver Down",
            year="1982",
            description="Delicate shimmer for nylon-string intro",
            settings={"pitch_l": 5, "pitch_r": -5, "delay_l": 5, "delay_r": 10, "mix": 30}
        ),
        PresetInfo(
            index=4,
            name="Mean Street",
            song="Mean Street",
            album="Fair Warning",
            year="1981",
            description="Heavier detune for the slap-tap intro",
            settings={"pitch_l": 7, "pitch_r": -7, "delay_l": 8, "delay_r": 16, "mix": 45}
        ),
        PresetInfo(
            index=5,
            name="Drop Dead Legs",
            song="Drop Dead Legs",
            album="1984",
            year="1984",
            description="Sub-octave effect - left channel down 12 semitones",
            settings={"pitch_l": -1200, "pitch_r": 0, "delay_l": 0, "delay_r": 0, "mix": 25}
        ),
        PresetInfo(
            index=6,
            name="Panama",
            song="Panama",
            album="1984",
            year="1984",
            description="Classic H949 detune with staggered delay",
            settings={"pitch_l": 7, "pitch_r": -9, "delay_l": 8, "delay_r": 20, "mix": 40}
        ),
        PresetInfo(
            index=7,
            name="Cathedral",
            song="Cathedral",
            album="Diver Down",
            year="1982",
            description="Shimmer/echo effect with feedback for ethereal quality",
            settings={"pitch_l": 12, "pitch_r": -12, "delay_l": 80, "delay_r": 100, "feedback": 40, "mix": 50}
        ),
        PresetInfo(
            index=8,
            name="Hot For Teacher",
            song="Hot For Teacher",
            album="1984",
            year="1984",
            description="Punchy detune for the main riff",
            settings={"pitch_l": 6, "pitch_r": -6, "delay_l": 5, "delay_r": 12, "mix": 35}
        ),
        PresetInfo(
            index=9,
            name="Why Can't This Be Love",
            song="Why Can't This Be Love",
            album="5150",
            year="1986",
            description="Micropitch - the Sammy era signature sound",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 25, "mix": 45}
        ),
        PresetInfo(
            index=10,
            name="Dreams",
            song="Dreams",
            album="5150",
            year="1986",
            description="Wide stereo micropitch with longer delay",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 20, "delay_r": 50, "mix": 50}
        ),
        PresetInfo(
            index=11,
            name="Finish What Ya Started",
            song="Finish What Ya Started",
            album="OU812",
            year="1988",
            description="Clean subtle micropitch for acoustic tones",
            settings={"pitch_l": 6, "pitch_r": -6, "delay_l": 0, "delay_r": 15, "mix": 35}
        ),
        PresetInfo(
            index=12,
            name="Right Now",
            song="Right Now",
            album="For Unlawful Carnal Knowledge",
            year="1991",
            description="Thick micropitch for bold arena rock sound",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 25, "mix": 50}
        ),
        PresetInfo(
            index=13,
            name="Can't Stop Lovin' You",
            song="Can't Stop Lovin' You",
            album="Balance",
            year="1995",
            description="Smooth ballad tone with micropitch",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 20, "mix": 40}
        ),
        PresetInfo(
            index=14,
            name="Humans Being",
            song="Humans Being",
            album="Twister Soundtrack",
            year="1996",
            description="Thick dramatic detune with feedback",
            settings={"pitch_l": 12, "pitch_r": -12, "delay_l": 0, "delay_r": 30, "feedback": 15, "mix": 55}
        ),
    ]
