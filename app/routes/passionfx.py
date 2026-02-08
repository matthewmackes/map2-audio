"""
PassionFX Multi-Effect API Routes
Multi-effect processor inspired by Steve Vai's "Passion and Warfare" album effects chain
12 internal DSP modules: NoiseGate, Compressor, Wah, Phaser, Chorus, PitchShifter,
Harmonizer, Delay, Reverb, EQ, Exciter, Tremolo
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/multieffect/passionfx", tags=["passionfx"])


# ========================================
# PassionFX Models
# ========================================

class PassionFXParams(BaseModel):
    """PassionFX multi-effect parameters"""
    # NoiseGate
    gate_enabled: Optional[bool] = Field(None, description="Enable noise gate")
    gate_threshold: Optional[float] = Field(None, ge=-80.0, le=0.0, description="Gate threshold in dB")
    gate_release: Optional[float] = Field(None, ge=5.0, le=2000.0, description="Gate release time in ms")

    # Compressor
    comp_enabled: Optional[bool] = Field(None, description="Enable compressor")
    comp_threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Compressor threshold in dB")
    comp_ratio: Optional[float] = Field(None, ge=1.0, le=20.0, description="Compressor ratio")
    comp_attack: Optional[float] = Field(None, ge=0.01, le=300.0, description="Compressor attack time in ms")
    comp_release: Optional[float] = Field(None, ge=10.0, le=3000.0, description="Compressor release time in ms")
    comp_glassy: Optional[bool] = Field(None, description="Enable glassy compression mode")

    # Wah
    wah_enabled: Optional[bool] = Field(None, description="Enable wah effect")
    wah_mode: Optional[int] = Field(None, ge=0, le=2, description="Wah mode (0=classic, 1=vocal, 2=custom)")
    wah_position: Optional[float] = Field(None, ge=0.0, le=1.0, description="Wah pedal position")
    wah_q: Optional[float] = Field(None, ge=1.0, le=15.0, description="Wah Q/resonance")

    # Phaser
    phaser_enabled: Optional[bool] = Field(None, description="Enable phaser")
    phaser_rate: Optional[float] = Field(None, ge=0.05, le=10.0, description="Phaser LFO rate in Hz")
    phaser_depth: Optional[float] = Field(None, ge=0.0, le=1.0, description="Phaser depth")
    phaser_stages: Optional[int] = Field(None, ge=2, le=16, description="Number of phaser stages")
    phaser_feedback: Optional[float] = Field(None, ge=-0.95, le=0.95, description="Phaser feedback")

    # Chorus
    chorus_enabled: Optional[bool] = Field(None, description="Enable chorus")
    chorus_rate: Optional[float] = Field(None, ge=0.1, le=5.0, description="Chorus LFO rate in Hz")
    chorus_depth: Optional[float] = Field(None, ge=0.0, le=1.0, description="Chorus depth")
    chorus_voices: Optional[int] = Field(None, ge=1, le=6, description="Number of chorus voices")
    chorus_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Chorus wet/dry mix")

    # PitchShifter
    pitch_enabled: Optional[bool] = Field(None, description="Enable pitch shifter")
    pitch_semitones: Optional[float] = Field(None, ge=-36.0, le=36.0, description="Pitch shift in semitones")
    pitch_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Pitch shifter wet/dry mix")

    # Harmonizer
    harm_enabled: Optional[bool] = Field(None, description="Enable harmonizer")
    harm_voice1_interval: Optional[int] = Field(None, ge=-12, le=12, description="Harmonizer voice 1 interval in semitones")
    harm_voice2_interval: Optional[int] = Field(None, ge=-12, le=12, description="Harmonizer voice 2 interval in semitones")
    harm_detune_cents: Optional[float] = Field(None, ge=0.0, le=25.0, description="Harmonizer detune in cents")
    harm_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Harmonizer wet/dry mix")

    # Delay
    delay_enabled: Optional[bool] = Field(None, description="Enable delay")
    delay_time_l: Optional[float] = Field(None, ge=1.0, le=8000.0, description="Left delay time in ms")
    delay_time_r: Optional[float] = Field(None, ge=1.0, le=8000.0, description="Right delay time in ms")
    delay_feedback: Optional[float] = Field(None, ge=0.0, le=0.95, description="Delay feedback")
    delay_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Delay wet/dry mix")
    delay_freeze: Optional[bool] = Field(None, description="Freeze delay buffer")
    delay_pitch_shift_l: Optional[int] = Field(None, ge=-12, le=12, description="Left delay pitch shift in semitones")
    delay_pitch_shift_r: Optional[int] = Field(None, ge=-12, le=12, description="Right delay pitch shift in semitones")

    # Reverb
    reverb_enabled: Optional[bool] = Field(None, description="Enable reverb")
    reverb_type: Optional[int] = Field(None, ge=0, le=4, description="Reverb type (0=room, 1=hall, 2=plate, 3=cathedral, 4=infinite)")
    reverb_decay: Optional[float] = Field(None, ge=0.1, le=30.0, description="Reverb decay time in seconds")
    reverb_shimmer_amount: Optional[float] = Field(None, ge=0.0, le=1.0, description="Reverb shimmer amount")
    reverb_shimmer_interval: Optional[int] = Field(None, ge=-24, le=24, description="Reverb shimmer pitch interval in semitones")
    reverb_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Reverb wet/dry mix")
    reverb_freeze: Optional[bool] = Field(None, description="Freeze reverb buffer")

    # EQ
    eq_enabled: Optional[bool] = Field(None, description="Enable EQ")
    eq_low_gain: Optional[float] = Field(None, ge=-12.0, le=12.0, description="EQ low band gain in dB")
    eq_mid_gain: Optional[float] = Field(None, ge=-12.0, le=12.0, description="EQ mid band gain in dB")
    eq_high_gain: Optional[float] = Field(None, ge=-12.0, le=12.0, description="EQ high band gain in dB")
    eq_tilt: Optional[float] = Field(None, ge=-1.0, le=1.0, description="EQ tilt (-1=dark, 0=flat, 1=bright)")

    # Exciter
    exciter_enabled: Optional[bool] = Field(None, description="Enable exciter")
    exciter_warmth: Optional[float] = Field(None, ge=0.0, le=1.0, description="Exciter warmth amount")
    exciter_presence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Exciter presence amount")
    exciter_air: Optional[float] = Field(None, ge=0.0, le=1.0, description="Exciter air/brilliance amount")

    # Tremolo
    trem_enabled: Optional[bool] = Field(None, description="Enable tremolo")
    trem_rate: Optional[float] = Field(None, ge=0.5, le=20.0, description="Tremolo rate in Hz")
    trem_depth: Optional[float] = Field(None, ge=0.0, le=1.0, description="Tremolo depth")
    trem_waveform: Optional[int] = Field(None, ge=0, le=5, description="Tremolo waveform (0=sine, 1=triangle, 2=square, 3=saw, 4=ramp, 5=random)")

    # Global
    mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="Global wet/dry mix")
    output_level: Optional[float] = Field(None, ge=-24.0, le=12.0, description="Output level in dB")

    # State
    preset: Optional[str] = Field(None, description="Preset name")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class PassionFXMetering(BaseModel):
    """PassionFX metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    gate_gain_reduction: float
    comp_gain_reduction: float
    wah_frequency: float
    phaser_lfo_phase: float
    chorus_lfo_phase: float
    pitch_detected_hz: float
    delay_level_l: float
    delay_level_r: float
    reverb_level_l: float
    reverb_level_r: float
    trem_lfo_phase: float


class PassionFXPresetInfo(BaseModel):
    """PassionFX preset information"""
    id: str
    name: str
    artist: str
    description: str


# ========================================
# PassionFX Routes
# ========================================

@router.get("")
async def get_passionfx() -> Dict[str, Any]:
    """Get PassionFX parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_passionfx_parameters()
    metering = await engine.get_passionfx_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_passionfx_parameters() -> Dict[str, Any]:
    """Get PassionFX parameters only."""
    engine = get_audio_engine()
    return await engine.get_passionfx_parameters()


@router.get("/metering")
async def get_passionfx_metering() -> Dict[str, float]:
    """Get PassionFX metering data."""
    engine = get_audio_engine()
    return await engine.get_passionfx_metering()


@router.patch("/parameters")
async def update_passionfx_parameters(params: PassionFXParams) -> Dict[str, Any]:
    """Update PassionFX parameters."""
    engine = get_audio_engine()

    # NoiseGate
    if params.gate_enabled is not None:
        await engine.set_passionfx_gate_enabled(params.gate_enabled)
    if params.gate_threshold is not None:
        await engine.set_passionfx_gate_threshold(params.gate_threshold)
    if params.gate_release is not None:
        await engine.set_passionfx_gate_release(params.gate_release)

    # Compressor
    if params.comp_enabled is not None:
        await engine.set_passionfx_comp_enabled(params.comp_enabled)
    if params.comp_threshold is not None:
        await engine.set_passionfx_comp_threshold(params.comp_threshold)
    if params.comp_ratio is not None:
        await engine.set_passionfx_comp_ratio(params.comp_ratio)
    if params.comp_attack is not None:
        await engine.set_passionfx_comp_attack(params.comp_attack)
    if params.comp_release is not None:
        await engine.set_passionfx_comp_release(params.comp_release)
    if params.comp_glassy is not None:
        await engine.set_passionfx_comp_glassy(params.comp_glassy)

    # Wah
    if params.wah_enabled is not None:
        await engine.set_passionfx_wah_enabled(params.wah_enabled)
    if params.wah_mode is not None:
        await engine.set_passionfx_wah_mode(params.wah_mode)
    if params.wah_position is not None:
        await engine.set_passionfx_wah_position(params.wah_position)
    if params.wah_q is not None:
        await engine.set_passionfx_wah_q(params.wah_q)

    # Phaser
    if params.phaser_enabled is not None:
        await engine.set_passionfx_phaser_enabled(params.phaser_enabled)
    if params.phaser_rate is not None:
        await engine.set_passionfx_phaser_rate(params.phaser_rate)
    if params.phaser_depth is not None:
        await engine.set_passionfx_phaser_depth(params.phaser_depth)
    if params.phaser_stages is not None:
        await engine.set_passionfx_phaser_stages(params.phaser_stages)
    if params.phaser_feedback is not None:
        await engine.set_passionfx_phaser_feedback(params.phaser_feedback)

    # Chorus
    if params.chorus_enabled is not None:
        await engine.set_passionfx_chorus_enabled(params.chorus_enabled)
    if params.chorus_rate is not None:
        await engine.set_passionfx_chorus_rate(params.chorus_rate)
    if params.chorus_depth is not None:
        await engine.set_passionfx_chorus_depth(params.chorus_depth)
    if params.chorus_voices is not None:
        await engine.set_passionfx_chorus_voices(params.chorus_voices)
    if params.chorus_mix is not None:
        await engine.set_passionfx_chorus_mix(params.chorus_mix)

    # PitchShifter
    if params.pitch_enabled is not None:
        await engine.set_passionfx_pitch_enabled(params.pitch_enabled)
    if params.pitch_semitones is not None:
        await engine.set_passionfx_pitch_semitones(params.pitch_semitones)
    if params.pitch_mix is not None:
        await engine.set_passionfx_pitch_mix(params.pitch_mix)

    # Harmonizer
    if params.harm_enabled is not None:
        await engine.set_passionfx_harm_enabled(params.harm_enabled)
    if params.harm_voice1_interval is not None:
        await engine.set_passionfx_harm_voice1_interval(params.harm_voice1_interval)
    if params.harm_voice2_interval is not None:
        await engine.set_passionfx_harm_voice2_interval(params.harm_voice2_interval)
    if params.harm_detune_cents is not None:
        await engine.set_passionfx_harm_detune_cents(params.harm_detune_cents)
    if params.harm_mix is not None:
        await engine.set_passionfx_harm_mix(params.harm_mix)

    # Delay
    if params.delay_enabled is not None:
        await engine.set_passionfx_delay_enabled(params.delay_enabled)
    if params.delay_time_l is not None:
        await engine.set_passionfx_delay_time_l(params.delay_time_l)
    if params.delay_time_r is not None:
        await engine.set_passionfx_delay_time_r(params.delay_time_r)
    if params.delay_feedback is not None:
        await engine.set_passionfx_delay_feedback(params.delay_feedback)
    if params.delay_mix is not None:
        await engine.set_passionfx_delay_mix(params.delay_mix)
    if params.delay_freeze is not None:
        await engine.set_passionfx_delay_freeze(params.delay_freeze)
    if params.delay_pitch_shift_l is not None:
        await engine.set_passionfx_delay_pitch_shift_l(params.delay_pitch_shift_l)
    if params.delay_pitch_shift_r is not None:
        await engine.set_passionfx_delay_pitch_shift_r(params.delay_pitch_shift_r)

    # Reverb
    if params.reverb_enabled is not None:
        await engine.set_passionfx_reverb_enabled(params.reverb_enabled)
    if params.reverb_type is not None:
        await engine.set_passionfx_reverb_type(params.reverb_type)
    if params.reverb_decay is not None:
        await engine.set_passionfx_reverb_decay(params.reverb_decay)
    if params.reverb_shimmer_amount is not None:
        await engine.set_passionfx_reverb_shimmer_amount(params.reverb_shimmer_amount)
    if params.reverb_shimmer_interval is not None:
        await engine.set_passionfx_reverb_shimmer_interval(params.reverb_shimmer_interval)
    if params.reverb_mix is not None:
        await engine.set_passionfx_reverb_mix(params.reverb_mix)
    if params.reverb_freeze is not None:
        await engine.set_passionfx_reverb_freeze(params.reverb_freeze)

    # EQ
    if params.eq_enabled is not None:
        await engine.set_passionfx_eq_enabled(params.eq_enabled)
    if params.eq_low_gain is not None:
        await engine.set_passionfx_eq_low_gain(params.eq_low_gain)
    if params.eq_mid_gain is not None:
        await engine.set_passionfx_eq_mid_gain(params.eq_mid_gain)
    if params.eq_high_gain is not None:
        await engine.set_passionfx_eq_high_gain(params.eq_high_gain)
    if params.eq_tilt is not None:
        await engine.set_passionfx_eq_tilt(params.eq_tilt)

    # Exciter
    if params.exciter_enabled is not None:
        await engine.set_passionfx_exciter_enabled(params.exciter_enabled)
    if params.exciter_warmth is not None:
        await engine.set_passionfx_exciter_warmth(params.exciter_warmth)
    if params.exciter_presence is not None:
        await engine.set_passionfx_exciter_presence(params.exciter_presence)
    if params.exciter_air is not None:
        await engine.set_passionfx_exciter_air(params.exciter_air)

    # Tremolo
    if params.trem_enabled is not None:
        await engine.set_passionfx_trem_enabled(params.trem_enabled)
    if params.trem_rate is not None:
        await engine.set_passionfx_trem_rate(params.trem_rate)
    if params.trem_depth is not None:
        await engine.set_passionfx_trem_depth(params.trem_depth)
    if params.trem_waveform is not None:
        await engine.set_passionfx_trem_waveform(params.trem_waveform)

    # Global
    if params.mix is not None:
        await engine.set_passionfx_mix(params.mix)
    if params.output_level is not None:
        await engine.set_passionfx_output_level(params.output_level)

    # State
    if params.preset is not None:
        await engine.set_passionfx_preset(params.preset)
    if params.bypass is not None:
        await engine.set_passionfx_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_passionfx_parameters()}


@router.post("/bypass/{bypass}")
async def set_passionfx_bypass(bypass: bool) -> Dict[str, Any]:
    """Set PassionFX bypass state."""
    engine = get_audio_engine()
    await engine.set_passionfx_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/preset/{preset_name}")
async def load_passionfx_preset(preset_name: str) -> Dict[str, Any]:
    """Load a PassionFX preset by name."""
    engine = get_audio_engine()
    await engine.set_passionfx_preset(preset_name)
    return {
        "status": "ok",
        "preset": preset_name,
        "parameters": await engine.get_passionfx_parameters()
    }


@router.get("/presets")
async def get_passionfx_presets() -> List[Dict[str, str]]:
    """Get all available PassionFX presets."""
    engine = get_audio_engine()
    return await engine.get_passionfx_presets()
