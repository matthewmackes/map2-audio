"""Engine-integration tests for the C++ MorphEngine.

These tests require the JUCE engine binary to be built. They are skipped in
CI/sandbox environments where the `.so` is absent.

Plan coverage (Q8, Q9, Q33, Q37, Q70):
- A/B/C/D quad morph
- Single atomic `set_morph_position(x, y)` API
- Position clamping to [0, 1]
- State introspection via `get_morph_state_json()`
- Configured-corner tracking
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest


def _engine_module_dir() -> Path | None:
    repo_root = Path(__file__).resolve().parents[1]
    for candidate in (repo_root / "juce-engine" / "build", repo_root / "build"):
        if any(candidate.glob("map2_audio_engine*.so")):
            return candidate
    return None


@pytest.mark.skipif(_engine_module_dir() is None, reason="JUCE build output not found")
def test_morph_position_atomic_xy_api_accepts_and_clamps():
    """Plan Q70 — single atomic `set_morph_position(x, y)`; inputs clamped to [0,1]."""
    module_dir = _engine_module_dir()
    assert module_dir is not None
    sys.path.insert(0, str(module_dir))
    import map2_audio_engine  # noqa: WPS433

    engine = map2_audio_engine.create_engine()
    engine.set_sample_rate(48000)
    engine.set_buffer_size(64)
    try:
        assert engine.initialize("")
        # No endpoints configured yet — position can still be set (morph math
        # short-circuits to identity until at least one endpoint is present).
        engine.set_morph_position_2d(0.25, 0.75)
        state = engine.get_morph_state()
        assert state["x"] == pytest.approx(0.25)
        assert state["y"] == pytest.approx(0.75)

        # Out-of-range inputs must be clamped, not rejected.
        engine.set_morph_position_2d(-1.0, 2.5)
        state = engine.get_morph_state()
        assert 0.0 <= state["x"] <= 1.0
        assert 0.0 <= state["y"] <= 1.0
    finally:
        engine.shutdown()


@pytest.mark.skipif(_engine_module_dir() is None, reason="JUCE build output not found")
def test_morph_state_json_reports_empty_configured_corners_initially():
    """Until setMorphEndpoint is called for each corner, the state must report
    the corner list it has actually received — never lie about configuration."""
    module_dir = _engine_module_dir()
    assert module_dir is not None
    sys.path.insert(0, str(module_dir))
    import map2_audio_engine  # noqa: WPS433

    engine = map2_audio_engine.create_engine()
    engine.set_sample_rate(48000)
    engine.set_buffer_size(64)
    try:
        assert engine.initialize("")
        engine.clear_morph_endpoints()
        state = engine.get_morph_state()
        assert "configured_corners" in state
        assert state["configured_corners"] == []
    finally:
        engine.shutdown()


@pytest.mark.skipif(_engine_module_dir() is None, reason="JUCE build output not found")
def test_clear_morph_endpoints_resets_configuration():
    module_dir = _engine_module_dir()
    assert module_dir is not None
    sys.path.insert(0, str(module_dir))
    import map2_audio_engine  # noqa: WPS433

    engine = map2_audio_engine.create_engine()
    engine.set_sample_rate(48000)
    engine.set_buffer_size(64)
    try:
        assert engine.initialize("")
        engine.set_morph_position_2d(0.33, 0.66)
        assert engine.clear_morph_endpoints() is True
        # Position is preserved across clear — clear resets endpoints, not position.
        state = engine.get_morph_state()
        assert state["configured_corners"] == []
    finally:
        engine.shutdown()
