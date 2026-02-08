"""
Tweed Bassman 5F6-A Amplifier Simulator API Routes
Fender Bassman (1958-60) with full mod suite: tube swaps, cathode bypass,
rectifier selection, NFB modes, jumped channels, and 14 factory presets.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/amp/tweedbassman", tags=["tweedbassman"])


# ========================================
# Models
# ========================================

class TweedBassmanParams(BaseModel):
    """Tweed Bassman amplifier parameters"""
    # Channel
    channel_mode: Optional[int] = Field(None, ge=0, le=2, description="0=Normal, 1=Bright, 2=Jumped")
    normal_volume: Optional[float] = Field(None, ge=0.0, le=10.0, description="Normal channel volume")
    bright_volume: Optional[float] = Field(None, ge=0.0, le=10.0, description="Bright channel volume")
    bright_cap: Optional[bool] = Field(None, description="100pF bright cap on/off")

    # Preamp
    v1_tube_type: Optional[int] = Field(None, ge=0, le=3, description="0=12AY7, 1=12AX7, 2=5751, 3=12AT7")
    cathode_bypass: Optional[bool] = Field(None, description="V2A cathode bypass cap")
    cathode_bias: Optional[int] = Field(None, ge=0, le=2, description="0=Hot(820), 1=Normal(1.5k), 2=Cool(2.7k)")

    # Tone
    treble: Optional[float] = Field(None, ge=0.0, le=10.0, description="Treble tone control")
    mid: Optional[float] = Field(None, ge=0.0, le=10.0, description="Mid tone control")
    bass: Optional[float] = Field(None, ge=0.0, le=10.0, description="Bass tone control")
    raw_switch: Optional[bool] = Field(None, description="Tone stack bypass")

    # Master
    master_volume: Optional[float] = Field(None, ge=0.0, le=10.0, description="Master volume")

    # Power amp
    presence: Optional[float] = Field(None, ge=0.0, le=10.0, description="Presence control (NFB shelf)")
    nfb_mode: Optional[int] = Field(None, ge=0, le=2, description="0=Stock(27k), 1=None, 2=High(10k)")
    power_tube_type: Optional[int] = Field(None, ge=0, le=3, description="0=6L6, 1=6V6, 2=EL34, 3=KT66")
    bias_mode: Optional[int] = Field(None, ge=0, le=1, description="0=Fixed, 1=Cathode")
    rectifier_type: Optional[int] = Field(None, ge=0, le=3, description="0=GZ34, 1=5U4G, 2=5Y3, 3=SS")

    # Output
    output_level: Optional[float] = Field(None, ge=-24.0, le=6.0, description="Output level in dB")
    cabinet_enabled: Optional[bool] = Field(None, description="Cabinet simulation on/off")
    cabinet_ir: Optional[int] = Field(None, ge=0, le=2, description="0=SM57, 1=Ribbon, 2=Room")

    # State
    bypass: Optional[bool] = Field(None, description="Bypass effect")


# ========================================
# Routes
# ========================================

@router.get("")
async def get_tweedbassman() -> Dict[str, Any]:
    """Get Tweed Bassman parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_tweedbassman_parameters()
    metering = await engine.get_tweedbassman_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_tweedbassman_parameters() -> Dict[str, Any]:
    """Get Tweed Bassman parameters only."""
    engine = get_audio_engine()
    return await engine.get_tweedbassman_parameters()


@router.get("/metering")
async def get_tweedbassman_metering() -> Dict[str, float]:
    """Get Tweed Bassman metering data."""
    engine = get_audio_engine()
    return await engine.get_tweedbassman_metering()


@router.patch("/parameters")
async def update_tweedbassman_parameters(params: TweedBassmanParams) -> Dict[str, Any]:
    """Update Tweed Bassman parameters."""
    engine = get_audio_engine()

    # Channel
    if params.channel_mode is not None:
        await engine.set_tweedbassman_channel_mode(params.channel_mode)
    if params.normal_volume is not None:
        await engine.set_tweedbassman_normal_volume(params.normal_volume)
    if params.bright_volume is not None:
        await engine.set_tweedbassman_bright_volume(params.bright_volume)
    if params.bright_cap is not None:
        await engine.set_tweedbassman_bright_cap(params.bright_cap)

    # Preamp
    if params.v1_tube_type is not None:
        await engine.set_tweedbassman_v1_tube_type(params.v1_tube_type)
    if params.cathode_bypass is not None:
        await engine.set_tweedbassman_cathode_bypass(params.cathode_bypass)
    if params.cathode_bias is not None:
        await engine.set_tweedbassman_cathode_bias(params.cathode_bias)

    # Tone
    if params.treble is not None:
        await engine.set_tweedbassman_treble(params.treble)
    if params.mid is not None:
        await engine.set_tweedbassman_mid(params.mid)
    if params.bass is not None:
        await engine.set_tweedbassman_bass(params.bass)
    if params.raw_switch is not None:
        await engine.set_tweedbassman_raw_switch(params.raw_switch)

    # Master
    if params.master_volume is not None:
        await engine.set_tweedbassman_master_volume(params.master_volume)

    # Power amp
    if params.presence is not None:
        await engine.set_tweedbassman_presence(params.presence)
    if params.nfb_mode is not None:
        await engine.set_tweedbassman_nfb_mode(params.nfb_mode)
    if params.power_tube_type is not None:
        await engine.set_tweedbassman_power_tube_type(params.power_tube_type)
    if params.bias_mode is not None:
        await engine.set_tweedbassman_bias_mode(params.bias_mode)
    if params.rectifier_type is not None:
        await engine.set_tweedbassman_rectifier_type(params.rectifier_type)

    # Output
    if params.output_level is not None:
        await engine.set_tweedbassman_output_level(params.output_level)
    if params.cabinet_enabled is not None:
        await engine.set_tweedbassman_cabinet_enabled(params.cabinet_enabled)
    if params.cabinet_ir is not None:
        await engine.set_tweedbassman_cabinet_ir(params.cabinet_ir)

    # State
    if params.bypass is not None:
        await engine.set_tweedbassman_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_tweedbassman_parameters()}


@router.post("/bypass/{bypass}")
async def set_tweedbassman_bypass(bypass: bool) -> Dict[str, Any]:
    """Set Tweed Bassman bypass state."""
    engine = get_audio_engine()
    await engine.set_tweedbassman_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/preset/{preset_name}")
async def load_tweedbassman_preset(preset_name: str) -> Dict[str, Any]:
    """Load a Tweed Bassman preset by name."""
    engine = get_audio_engine()
    await engine.set_tweedbassman_preset(preset_name)
    return {
        "status": "ok",
        "preset": preset_name,
        "parameters": await engine.get_tweedbassman_parameters()
    }


@router.get("/presets")
async def get_tweedbassman_presets() -> List[Dict[str, str]]:
    """Get all available Tweed Bassman presets."""
    engine = get_audio_engine()
    return await engine.get_tweedbassman_presets()
