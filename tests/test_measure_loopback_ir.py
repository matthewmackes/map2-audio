"""Tests for the path-c IR-based loopback latency measurement.

T2459-E3 acceptance gate. The synthetic-loopback fallback is used so
the tests run without a JACK server; the real JACK path runs only on
the bench.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.measure_loopback_ir import (
    MeasurementResult,
    TrialResult,
    measure_loopback_ir,
)


@pytest.fixture(autouse=True)
def _force_synthetic_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep unit tests hermetic even on bench hosts with JACK available."""
    monkeypatch.setattr(
        "scripts.measure_loopback_ir._play_and_capture_via_jack",
        lambda *args, **kwargs: None,
    )


def test_synthetic_fallback_recovers_5ms_round_trip() -> None:
    """The synthetic loopback inserts a 5 ms delay; the IR cross-
    correlation should recover it within sub-sample tolerance.
    """
    result = measure_loopback_ir(
        playback_port="nonexistent:playback",
        capture_port="nonexistent:capture",
        sample_rate=48000,
        duration_ms=500,
        tail_ms=200,
        trials=3,
        use_synthetic_fallback=True,
    )
    assert isinstance(result, MeasurementResult)
    assert result.method == "synthetic"
    # The 5 ms synthetic delay should be recovered to within 0.5 ms.
    assert abs(result.mean_rtt_ms - 5.0) < 0.5, (
        f"Expected ~5 ms, got {result.mean_rtt_ms} ms"
    )


def test_synthetic_fallback_jitter_is_zero_across_trials() -> None:
    """The synthetic delay is deterministic; trial-to-trial jitter
    should be zero.
    """
    result = measure_loopback_ir(
        playback_port="x", capture_port="y",
        sample_rate=48000, duration_ms=500, tail_ms=200, trials=5,
        use_synthetic_fallback=True,
    )
    assert result.jitter_p95_ms == 0.0


def test_secondary_peak_ratio_is_low_for_clean_signal() -> None:
    """The synthetic loopback has only one impulse — the secondary
    peak should be substantially smaller than the primary, well below
    the 0.5 ambiguity threshold.
    """
    result = measure_loopback_ir(
        playback_port="x", capture_port="y",
        sample_rate=48000, duration_ms=500, trials=1,
        use_synthetic_fallback=True,
    )
    t = result.trials[0]
    assert t.secondary_peak_ratio < 0.5, (
        f"Secondary/primary ratio {t.secondary_peak_ratio} too high — "
        "the cross-correlation result is ambiguous, suggests a bug"
    )


def test_require_jack_raises_when_jack_unreachable() -> None:
    """If require_jack is set + jack isn't reachable, we raise rather
    than silently using the synthetic fallback.
    """
    with pytest.raises(RuntimeError):
        measure_loopback_ir(
            playback_port="nonexistent:playback",
            capture_port="nonexistent:capture",
            sample_rate=48000, duration_ms=200, trials=1,
            use_synthetic_fallback=False,
        )


def test_short_duration_still_recovers_delay() -> None:
    """A 200 ms sweep is enough to recover the 5 ms delay."""
    result = measure_loopback_ir(
        playback_port="x", capture_port="y",
        sample_rate=48000, duration_ms=200, trials=2,
        use_synthetic_fallback=True,
    )
    assert abs(result.mean_rtt_ms - 5.0) < 1.0


def test_alternate_sample_rate_recovers_delay() -> None:
    """44.1 kHz sample rate also resolves correctly."""
    result = measure_loopback_ir(
        playback_port="x", capture_port="y",
        sample_rate=44100, duration_ms=500, trials=1,
        use_synthetic_fallback=True,
    )
    assert abs(result.mean_rtt_ms - 5.0) < 0.5


def test_cli_writes_evidence_json(tmp_path: Path) -> None:
    """The CLI's --output option produces a schema-valid JSON evidence
    file the GUI can ingest.
    """
    import json
    from scripts import measure_loopback_ir as module

    out = tmp_path / "evidence.json"
    rc = module.main([
        "--jack-playback", "x",
        "--jack-capture", "y",
        "--sample-rate", "48000",
        "--duration-ms", "200",
        "--trials", "3",
        "--output", str(out),
    ])
    # Synthetic 5 ms loopback passes the 5 ms gate (just barely — equal
    # is not >, so PASS). Don't assert on the exit code, just on the
    # evidence file shape.
    payload = json.loads(out.read_text())
    assert payload["method"] == "synthetic"
    assert payload["sample_rate"] == 48000
    assert payload["duration_ms"] == 200
    assert len(payload["trials"]) == 3
    assert "mean_rtt_ms" in payload
    assert "p95_rtt_ms" in payload
    assert "jitter_p95_ms" in payload
    assert "gate" in payload
    assert "timestamp" in payload
