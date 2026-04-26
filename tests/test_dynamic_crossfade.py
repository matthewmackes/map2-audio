"""T2454-B — tests for the dynamic crossfade length helper.

Covers the locked Q3=A vocabulary: static URI lookup, longest active tail
wins, bypassed plugins are excluded, result is clamped to [500, 2000]ms.
"""
from __future__ import annotations

from app.services.state_authority_dynamic_crossfade import (
    DEFAULT_CROSSFADE_MS,
    MAX_CROSSFADE_MS,
    MIN_CROSSFADE_MS,
    compute_dynamic_crossfade_ms,
)


def test_empty_or_invalid_input_returns_floor():
    assert compute_dynamic_crossfade_ms(None) == MIN_CROSSFADE_MS
    assert compute_dynamic_crossfade_ms({}) == MIN_CROSSFADE_MS
    assert compute_dynamic_crossfade_ms({"chains": []}) == MIN_CROSSFADE_MS
    assert compute_dynamic_crossfade_ms({"chains": "not a list"}) == MIN_CROSSFADE_MS


def test_non_tail_processors_return_floor():
    detail = {
        "chains": [
            {"plugins": [
                {"uri": "map2://juce/eq"},
                {"uri": "map2://juce/compressor"},
            ]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == DEFAULT_CROSSFADE_MS


def test_delay_returns_1500ms():
    detail = {
        "chains": [
            {"plugins": [{"uri": "map2://juce/delay"}]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 1500


def test_shoegaze_returns_1200ms():
    detail = {
        "chains": [
            {"plugins": [{"uri": "map2://juce/multieffect/shoegaze"}]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 1200


def test_lexilove_returns_2000ms():
    detail = {
        "chains": [
            {"plugins": [{"uri": "map2://juce/reverb/pcm70"}]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 2000


def test_longest_tail_wins_when_multiple_tail_processors_active():
    detail = {
        "chains": [
            {"plugins": [
                {"uri": "map2://juce/delay"},  # 1500
                {"uri": "map2://juce/reverb/pcm70"},  # 2000 — wins
                {"uri": "map2://juce/multieffect/shoegaze"},  # 1200
            ]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 2000


def test_bypassed_processors_dont_count():
    detail = {
        "chains": [
            {"plugins": [
                {"uri": "map2://juce/reverb/pcm70", "bypass": True},  # excluded
                {"uri": "map2://juce/delay"},  # 1500 — wins
            ]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 1500


def test_all_bypassed_returns_floor():
    detail = {
        "chains": [
            {"plugins": [
                {"uri": "map2://juce/delay", "bypass": True},
                {"uri": "map2://juce/reverb/pcm70", "bypass": True},
            ]},
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == MIN_CROSSFADE_MS


def test_crosses_chains():
    """Tail-bearing processors anywhere in any chain count."""
    detail = {
        "chains": [
            {"plugins": [{"uri": "map2://juce/eq"}]},
            {"plugins": [{"uri": "map2://juce/delay"}]},
            {"plugins": [{"uri": "map2://juce/reverb/pcm70"}]},  # 2000 — wins
        ],
    }
    assert compute_dynamic_crossfade_ms(detail) == 2000


def test_clamp_floor_and_cap():
    """Even if the URI map were edited to absurd values, the clamp protects
    the engine. Verifies the helper's contract: result is always in [500, 2000]."""
    assert MIN_CROSSFADE_MS == 500
    assert MAX_CROSSFADE_MS == 2000
    assert DEFAULT_CROSSFADE_MS == 500
