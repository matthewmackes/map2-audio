import asyncio

from app.services.juce_engine_service import JuceEngineService


class _FakeShoeGazeEngine:
    def get_shoegaze_parameters(self):
        return {
            "atmosphere": 61.0,
            "decay": 8.5,
            "shimmer": 42.0,
            "shimmer_pitch": 12.0,
            "modulation": 54.0,
            "mod_rate": 0.9,
            "drive": 28.0,
            "delay_time": 480.0,
            "delay_feedback": 36.0,
            "delay_mod": 18.0,
            "low_cut": 110.0,
            "high_cut": 9600.0,
            "mix": 57.0,
            "stereo_width": 172.0,
            "reverb_diffusion": 91.0,
            "reverb_damping": 33.0,
            "shimmer_feedback": 47.0,
            "chorus_voices": 5,
            "ducking_amount": 26.0,
            "preset_name": "loveless",
            "spillover": False,
            "bypass": True,
        }


def test_get_shoegaze_parameters_includes_advanced_controls_and_legacy_fallbacks():
    service = JuceEngineService()
    service._engine = _FakeShoeGazeEngine()

    payload = asyncio.run(service.get_shoegaze_parameters())

    assert payload["reverb_diffusion"] == 91.0
    assert payload["reverb_damping"] == 33.0
    assert payload["shimmer_feedback"] == 47.0
    assert payload["chorus_voices"] == 5
    assert payload["ducking"] == 26.0
    assert payload["preset"] == "loveless"
    assert payload["spillover"] is False
    assert payload["bypass"] is True
