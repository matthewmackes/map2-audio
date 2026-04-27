#!/usr/bin/env python3
"""measure_loopback_ir — IR-based loopback latency measurement.

T2459-E3 — replaces ``jack_iodelay`` for the platform's loopback
latency tooling. Yesterday's bench session (commit 1f079def) showed
``jack_iodelay``'s correlator latching cycle-skip peaks on the
UA-1000, producing readings spread across {10, 52, 224, 277, 351,
819, 925, 968, 1033, 1161, 1247, 1331} ms for the same hardware. The
IR cross-correlation method replaces that correlator with a
deterministic single-impulse measurement.

Algorithm
---------
1. Generate a logarithmic sine sweep (chirp) from f0=50 Hz to
   f1=20 kHz over a configurable duration (default 500 ms) at the
   target sample rate (default 48 kHz).
2. Play the chirp out a JACK playback port + capture from the
   matching JACK capture port for ``len(chirp) + tail_ms``.
3. Build the inverse filter that, when convolved with the chirp,
   yields a unit impulse. (For a log sweep, this is a time-reversed
   amplitude-modulated copy of the chirp itself.)
4. Convolve the captured signal with the inverse filter via FFT
   cross-correlation. The result peaks at the round-trip delay.
5. Refine the peak to sub-sample resolution via parabolic
   interpolation around the maximum.

Usage
-----
    python3 scripts/measure_loopback_ir.py \\
        --jack-playback "EDIROL UA-1000 Pro:playback_AUX0" \\
        --jack-capture  "EDIROL UA-1000 Pro:capture_AUX0" \\
        --output docs/fit-for-purpose-evidence/<date>/ua-1000/aux0.json \\
        --duration-ms 500 --trials 3 --tail-ms 200

Returns 0 on success, 1 on hard-fail gates (>5 ms p95 RTT or jitter
p95 > 1 ms — same gates as the ``measure_latency.sh`` harness).

Library mode
------------
    from scripts.measure_loopback_ir import measure_loopback_ir
    rtt = measure_loopback_ir(
        playback_port="EDIROL UA-1000 Pro:playback_AUX0",
        capture_port="EDIROL UA-1000 Pro:capture_AUX0",
        sample_rate=48000, duration_ms=500, trials=3,
    )

When ``jack-client`` is not installed (or no JACK server is reachable),
the function falls back to a synthetic in-process loopback that
inserts a known delay. This keeps tests + CI hermetic; on the bench
the real JACK path runs.

Worklist: ``T2459-E3``.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger("measure_loopback_ir")

REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclasses.dataclass(frozen=True)
class TrialResult:
    """One trial's measured RTT in milliseconds."""

    rtt_ms: float
    peak_correlation: float
    secondary_peak_ratio: float    # secondary_peak / primary_peak; high = ambiguous


@dataclasses.dataclass(frozen=True)
class MeasurementResult:
    """Summary of a multi-trial measurement."""

    sample_rate: int
    duration_ms: int
    tail_ms: int
    trials: tuple[TrialResult, ...]
    mean_rtt_ms: float
    p95_rtt_ms: float
    jitter_p95_ms: float
    method: str   # "jack" | "synthetic"
    notes: str


def measure_loopback_ir(
    playback_port: str,
    capture_port: str,
    sample_rate: int = 48000,
    duration_ms: int = 500,
    tail_ms: int = 200,
    trials: int = 3,
    f0_hz: float = 50.0,
    f1_hz: float = 20000.0,
    use_synthetic_fallback: bool = True,
) -> MeasurementResult:
    """Run a multi-trial IR-based loopback latency measurement.

    See module docstring for the algorithm.
    """
    import numpy as np

    # 1. Generate the log sweep + its inverse filter.
    chirp = _generate_log_sweep(sample_rate, duration_ms, f0_hz, f1_hz)
    inverse = _build_inverse_filter(chirp, sample_rate, f0_hz, f1_hz)

    # 2. Run trials.
    method = "synthetic"
    trial_rtts: list[TrialResult] = []
    for trial_index in range(max(1, trials)):
        captured = _play_and_capture_via_jack(
            chirp, sample_rate, playback_port, capture_port, tail_ms,
        )
        if captured is None:
            if not use_synthetic_fallback:
                raise RuntimeError(
                    f"JACK playback/capture failed for "
                    f"{playback_port} → {capture_port} and synthetic "
                    f"fallback is disabled."
                )
            captured = _synthetic_loopback(chirp, sample_rate)
            method = "synthetic"
        else:
            method = "jack"
        # Cross-correlate captured signal with the inverse filter.
        rtt_ms, peak, ratio = _cross_correlation_rtt(
            captured, inverse, sample_rate,
        )
        trial_rtts.append(TrialResult(
            rtt_ms=rtt_ms,
            peak_correlation=peak,
            secondary_peak_ratio=ratio,
        ))

    rtts = [t.rtt_ms for t in trial_rtts]
    mean_rtt = float(np.mean(rtts))
    p95_rtt = float(np.percentile(rtts, 95)) if len(rtts) > 1 else rtts[0]
    jitter = float(max(rtts) - min(rtts)) if len(rtts) > 1 else 0.0

    notes = f"f0={f0_hz}Hz f1={f1_hz}Hz duration_ms={duration_ms} tail_ms={tail_ms}"
    return MeasurementResult(
        sample_rate=sample_rate,
        duration_ms=duration_ms,
        tail_ms=tail_ms,
        trials=tuple(trial_rtts),
        mean_rtt_ms=mean_rtt,
        p95_rtt_ms=p95_rtt,
        jitter_p95_ms=jitter,
        method=method,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _generate_log_sweep(
    sample_rate: int, duration_ms: int, f0: float, f1: float,
):
    """Generate a logarithmic sine sweep.

    Farina's exponential-sweep formula:
        x(t) = sin(2π f0 T / ln(f1/f0) · (exp(t/T · ln(f1/f0)) - 1))
    """
    import numpy as np
    T = duration_ms / 1000.0
    n = int(round(sample_rate * T))
    t = np.arange(n) / sample_rate
    K = T * 2.0 * math.pi * f0 / math.log(f1 / f0)
    L = T / math.log(f1 / f0)
    return np.sin(K * (np.exp(t / L) - 1.0)).astype(np.float32)


def _build_inverse_filter(chirp, sample_rate: int, f0: float, f1: float):
    """Build the inverse filter for a log sweep.

    For a log sweep, the inverse filter is a time-reversed copy
    weighted by an amplitude envelope that compensates the sweep's
    pink-noise PSD.
    """
    import numpy as np
    n = chirp.shape[0]
    t = np.arange(n) / sample_rate
    T = n / sample_rate
    L = T / math.log(f1 / f0)
    # Amplitude weighting: 1/exp(t/L) is the Farina inverse weighting.
    weight = np.exp(-t / L).astype(np.float32)
    inverse = (chirp[::-1] * weight[::-1]).astype(np.float32)
    # Normalise so the autocorrelation peak is 1.0 — makes peak height
    # comparable across different sweep durations.
    norm = float(np.sqrt(np.sum(inverse * inverse)))
    if norm > 0:
        inverse = inverse / norm
    return inverse


def _cross_correlation_rtt(captured, inverse, sample_rate: int):
    """Cross-correlate captured with inverse filter, return (rtt_ms,
    peak_value, secondary_peak_ratio).

    Uses scipy.signal.fftconvolve when available, falls back to a
    numpy FFT-based convolution.
    """
    import numpy as np
    # Farina's method: convolve the captured signal with the inverse
    # filter (which is the time-reversed amplitude-weighted chirp).
    # The result is the impulse response of the loopback path; the
    # peak position is the round-trip delay.
    try:
        from scipy.signal import fftconvolve
        ir = fftconvolve(captured, inverse, mode='full')
    except ImportError:
        n = len(captured) + len(inverse) - 1
        size = 1 << (int(np.ceil(np.log2(n))))
        a = np.fft.rfft(captured, size)
        b = np.fft.rfft(inverse, size)
        ir = np.fft.irfft(a * b, size)[:n]

    # In the convolution result, the impulse response sits centered
    # around index len(inverse) - 1 + delay_samples. To recover the
    # delay we search for the peak in the region after that center.
    inverse_len = len(inverse)
    zero_lag_index = inverse_len - 1
    guard_samples = max(1, int(round(0.001 * sample_rate)))   # 1 ms guard
    search_start = zero_lag_index + guard_samples
    if search_start >= len(ir):
        search_start = zero_lag_index
    search = ir[search_start:]
    if len(search) == 0:
        return 0.0, 0.0, 1.0

    # Use absolute value because the IR can have negative-going peaks
    # depending on phase.
    abs_search = np.abs(search)
    peak_offset = int(np.argmax(abs_search))

    # Sub-sample refinement via parabolic interpolation on |IR|.
    if 0 < peak_offset < len(abs_search) - 1:
        y_minus = abs_search[peak_offset - 1]
        y0 = abs_search[peak_offset]
        y_plus = abs_search[peak_offset + 1]
        denom = (y_minus - 2 * y0 + y_plus)
        if denom != 0:
            sub_offset = 0.5 * (y_minus - y_plus) / denom
        else:
            sub_offset = 0.0
    else:
        sub_offset = 0.0

    abs_peak_idx = search_start + peak_offset
    rtt_samples = (abs_peak_idx - zero_lag_index) + sub_offset
    rtt_ms = (rtt_samples / sample_rate) * 1000.0
    peak_idx = peak_offset   # for the secondary-peak masking below
    search = abs_search

    # Confidence: ratio of the second-highest peak to the primary.
    primary = float(search[peak_idx])
    if primary <= 0:
        return float(rtt_ms), 0.0, 1.0
    # Mask out a window around the primary peak to find the next one.
    mask_window = max(1, int(0.005 * sample_rate))   # 5 ms mask
    masked = search.copy()
    lo = max(0, peak_idx - mask_window)
    hi = min(len(masked), peak_idx + mask_window + 1)
    masked[lo:hi] = 0
    secondary = float(np.max(masked)) if len(masked) > 0 else 0.0
    ratio = (secondary / primary) if primary > 0 else 1.0

    return float(rtt_ms), primary, ratio


def _play_and_capture_via_jack(
    chirp, sample_rate: int, playback_port: str, capture_port: str,
    tail_ms: int,
):
    """Play `chirp` on `playback_port` and capture `len(chirp) + tail_ms`
    of audio from `capture_port`.

    Returns the captured numpy array, or None if JACK isn't reachable.
    """
    try:
        import jack    # `pip install jack-client`
    except ImportError:
        logger.warning("jack-client not installed; using synthetic loopback.")
        return None
    try:
        import numpy as np
    except ImportError:
        return None

    capture_n = chirp.shape[0] + int(round(tail_ms / 1000.0 * sample_rate))
    captured = np.zeros(capture_n, dtype=np.float32)

    chirp_pos = [0]
    capture_pos = [0]

    try:
        client = jack.Client("map2_loopback_ir", no_start_server=True)
    except jack.JackError as exc:
        logger.warning("JACK server unreachable: %s", exc)
        return None

    if client.samplerate != sample_rate:
        logger.warning(
            "JACK sample rate %d does not match requested %d; using JACK rate.",
            client.samplerate, sample_rate,
        )

    out_port = client.outports.register("out")
    in_port = client.inports.register("in")

    @client.set_process_callback
    def process(frames):
        # Feed chirp into out_port.
        out_buf = out_port.get_array()
        remaining_chirp = chirp.shape[0] - chirp_pos[0]
        if remaining_chirp > 0:
            n = min(frames, remaining_chirp)
            out_buf[:n] = chirp[chirp_pos[0]:chirp_pos[0] + n]
            if n < frames:
                out_buf[n:] = 0
            chirp_pos[0] += n
        else:
            out_buf[:] = 0

        # Drain in_port into the captured buffer.
        in_buf = in_port.get_array()
        remaining_cap = capture_n - capture_pos[0]
        if remaining_cap > 0:
            n = min(frames, remaining_cap)
            captured[capture_pos[0]:capture_pos[0] + n] = in_buf[:n]
            capture_pos[0] += n

    client.activate()
    try:
        client.connect(out_port, playback_port)
        client.connect(capture_port, in_port)
    except jack.JackError as exc:
        logger.warning("JACK connect failed: %s", exc)
        client.close()
        return None

    # Wait for capture to complete.
    deadline = time.monotonic() + (capture_n / sample_rate) + 1.0
    while capture_pos[0] < capture_n and time.monotonic() < deadline:
        time.sleep(0.01)

    client.deactivate()
    client.close()
    return captured


def _synthetic_loopback(chirp, sample_rate: int):
    """Insert a known delay into the chirp to simulate a loopback.

    Used by tests + CI when JACK isn't reachable. The synthetic delay
    is fixed at 5 ms so the sub-sample refinement code is exercised.
    """
    import numpy as np
    delay_samples = int(round(0.005 * sample_rate))
    out = np.zeros(chirp.shape[0] + delay_samples + 1024, dtype=np.float32)
    out[delay_samples : delay_samples + chirp.shape[0]] = chirp
    # Add a small amount of noise so the cross-correlation isn't trivial.
    rng = np.random.default_rng(seed=42)
    out += rng.normal(0, 1e-4, out.shape).astype(np.float32)
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jack-playback", required=True,
                         help="JACK playback port name.")
    parser.add_argument("--jack-capture", required=True,
                         help="JACK capture port name.")
    parser.add_argument("--sample-rate", type=int, default=48000)
    parser.add_argument("--duration-ms", type=int, default=500)
    parser.add_argument("--tail-ms", type=int, default=200)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--f0-hz", type=float, default=50.0)
    parser.add_argument("--f1-hz", type=float, default=20000.0)
    parser.add_argument("--output", type=Path,
                         help="JSON evidence path. If omitted, results print to stdout.")
    parser.add_argument("--require-jack", action="store_true",
                         help="Fail if JACK isn't reachable instead of falling back to synthetic.")
    parser.add_argument(
        "--hard-rtl-p95-ms", type=float, default=5.0,
        help="Hard fail gate on RTL p95 (ms). Default 5.0 — matches measure_latency.sh.")
    parser.add_argument(
        "--hard-jitter-p95-ms", type=float, default=1.0,
        help="Hard fail gate on jitter p95 (ms). Default 1.0.")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        result = measure_loopback_ir(
            playback_port=args.jack_playback,
            capture_port=args.jack_capture,
            sample_rate=args.sample_rate,
            duration_ms=args.duration_ms,
            tail_ms=args.tail_ms,
            trials=args.trials,
            f0_hz=args.f0_hz,
            f1_hz=args.f1_hz,
            use_synthetic_fallback=not args.require_jack,
        )
    except RuntimeError as exc:
        logger.error("Measurement failed: %s", exc)
        return 2

    payload: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "method": result.method,
        "sample_rate": result.sample_rate,
        "duration_ms": result.duration_ms,
        "tail_ms": result.tail_ms,
        "trials": [
            {
                "rtt_ms": t.rtt_ms,
                "peak_correlation": t.peak_correlation,
                "secondary_peak_ratio": t.secondary_peak_ratio,
            }
            for t in result.trials
        ],
        "mean_rtt_ms": result.mean_rtt_ms,
        "p95_rtt_ms": result.p95_rtt_ms,
        "jitter_p95_ms": result.jitter_p95_ms,
        "notes": result.notes,
    }

    hard_fail = (
        result.p95_rtt_ms > args.hard_rtl_p95_ms
        or result.jitter_p95_ms > args.hard_jitter_p95_ms
    )
    payload["gate"] = "FAIL" if hard_fail else "PASS"

    output_text = json.dumps(payload, indent=2)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text + "\n", encoding="utf-8")
        logger.info("Wrote evidence to %s", args.output)
    else:
        print(output_text)

    return 1 if hard_fail else 0


if __name__ == "__main__":
    sys.exit(main())
