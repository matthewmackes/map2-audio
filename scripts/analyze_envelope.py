#!/usr/bin/env python3
"""Analyze transient envelope fidelity between a reference recording and a modeled candidate.

T099 quantitative gate script:
- Cross-correlate recordings for residual offset alignment.
- Compute 10ms Hann-window RMS envelope.
- Measure onset slope (dB/ms over first 20ms), peak level, and 10-90 rise time.
- Produce per-pair PNG overlays and JSON summaries.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np
from scipy import signal
from scipy.io import wavfile

matplotlib.use("Agg")
import matplotlib.pyplot as plt

EPS = 1e-12


@dataclass(frozen=True)
class AnalysisPair:
    pair_id: str
    reference: Path
    candidate: Path
    reference_label: str = "Reference"
    candidate_label: str = "Candidate"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze onset envelope fidelity for T099 phrase pairs.")
    parser.add_argument("--manifest", type=Path, help="JSON manifest listing analysis pairs.")
    parser.add_argument("--reference", type=Path, help="Reference WAV path for single-pair mode.")
    parser.add_argument("--candidate", type=Path, help="Candidate WAV path for single-pair mode.")
    parser.add_argument("--pair-id", type=str, help="Pair ID for single-pair mode.")
    parser.add_argument("--reference-label", type=str, default="Reference")
    parser.add_argument("--candidate-label", type=str, default="Candidate")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON and PNG outputs.")
    parser.add_argument(
        "--gate-slope-threshold",
        type=float,
        default=3.0,
        help="Absolute mean onset slope error gate in dB/ms (default: 3.0).",
    )
    parser.add_argument(
        "--plot-seconds",
        type=float,
        default=3.0,
        help="Waveform/envelope duration to plot from start in seconds (default: 3.0).",
    )
    return parser.parse_args()


def load_pairs(args: argparse.Namespace) -> list[AnalysisPair]:
    if args.manifest:
        payload = json.loads(args.manifest.read_text(encoding="utf-8"))
        raw_pairs = payload.get("pairs", [])
        pairs: list[AnalysisPair] = []
        for index, row in enumerate(raw_pairs):
            if not isinstance(row, dict):
                raise ValueError(f"Manifest pair index {index} is not an object.")
            pair_id = str(row.get("pair_id", "")).strip()
            reference = str(row.get("reference", "")).strip()
            candidate = str(row.get("candidate", "")).strip()
            if not pair_id or not reference or not candidate:
                raise ValueError(f"Manifest pair index {index} missing required fields.")
            pairs.append(
                AnalysisPair(
                    pair_id=pair_id,
                    reference=Path(reference),
                    candidate=Path(candidate),
                    reference_label=str(row.get("reference_label", "Reference")),
                    candidate_label=str(row.get("candidate_label", "Candidate")),
                )
            )
        if not pairs:
            raise ValueError("Manifest does not contain any pairs.")
        return pairs

    if not args.reference or not args.candidate or not args.pair_id:
        raise ValueError("Single-pair mode requires --reference, --candidate, and --pair-id.")

    return [
        AnalysisPair(
            pair_id=args.pair_id,
            reference=args.reference,
            candidate=args.candidate,
            reference_label=args.reference_label,
            candidate_label=args.candidate_label,
        )
    ]


def read_wav_mono(path: Path) -> tuple[int, np.ndarray]:
    sample_rate, data = wavfile.read(path)

    if data.ndim == 2:
        data = np.mean(data, axis=1)

    if np.issubdtype(data.dtype, np.integer):
        max_abs = float(np.iinfo(data.dtype).max)
        signal_float = data.astype(np.float64) / max_abs
    else:
        signal_float = data.astype(np.float64)

    peak = float(np.max(np.abs(signal_float))) if signal_float.size else 0.0
    if peak > 1.5:
        signal_float = signal_float / peak

    return sample_rate, signal_float


def maybe_resample(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate:
        return samples
    gcd = math.gcd(source_rate, target_rate)
    up = target_rate // gcd
    down = source_rate // gcd
    return signal.resample_poly(samples, up, down)


def align_signals(reference: np.ndarray, candidate: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    correlation = signal.correlate(candidate, reference, mode="full", method="fft")
    lag = int(np.argmax(correlation) - (len(reference) - 1))

    aligned_ref = reference
    aligned_cand = candidate

    if lag > 0:
        aligned_cand = aligned_cand[lag:]
    elif lag < 0:
        aligned_ref = aligned_ref[-lag:]

    length = min(len(aligned_ref), len(aligned_cand))
    if length <= 0:
        raise ValueError("Alignment produced zero overlap.")

    return aligned_ref[:length], aligned_cand[:length], lag


def hann_rms_envelope(samples: np.ndarray, sample_rate: int, window_ms: float = 10.0) -> tuple[np.ndarray, np.ndarray]:
    window_length = max(4, int(sample_rate * (window_ms / 1000.0)))
    window = signal.windows.hann(window_length, sym=False)
    window = window / np.sum(window)

    energy = np.convolve(samples * samples, window, mode="same")
    rms = np.sqrt(np.maximum(energy, EPS))
    db = 20.0 * np.log10(np.maximum(rms, 1e-9))
    return rms, db


def detect_onsets(envelope_db: np.ndarray, sample_rate: int) -> np.ndarray:
    onset_strength = np.diff(envelope_db, prepend=envelope_db[0])
    onset_strength = np.clip(onset_strength, a_min=0.0, a_max=None)

    smooth_width = max(1, int(sample_rate * 0.003))
    smooth_kernel = np.ones(smooth_width, dtype=np.float64) / smooth_width
    onset_strength = np.convolve(onset_strength, smooth_kernel, mode="same")

    peak_distance = max(1, int(sample_rate * 0.03))
    prominence = max(0.05, float(np.percentile(onset_strength, 80)) * 0.5)
    peaks, _ = signal.find_peaks(onset_strength, distance=peak_distance, prominence=prominence)

    floor = float(np.percentile(envelope_db, 20))
    filtered = np.array([idx for idx in peaks if envelope_db[idx] >= floor + 3.0], dtype=int)

    if filtered.size == 0:
        fallback = int(np.argmax(envelope_db))
        return np.array([fallback], dtype=int)

    return filtered


def metrics_for_onset(
    envelope_linear: np.ndarray,
    envelope_db: np.ndarray,
    onset_idx: int,
    sample_rate: int,
) -> dict[str, float] | None:
    if onset_idx < 0 or onset_idx >= len(envelope_linear):
        return None

    transient_horizon = max(2, int(sample_rate * 0.06))
    stop = min(len(envelope_linear), onset_idx + transient_horizon)
    segment_linear = envelope_linear[onset_idx:stop]
    segment_db = envelope_db[onset_idx:stop]

    if segment_linear.size < 3:
        return None

    slope_samples = max(2, int(sample_rate * 0.02))
    slope_stop = min(len(envelope_db), onset_idx + slope_samples)
    slope_segment = envelope_db[onset_idx:slope_stop]
    if slope_segment.size < 2:
        return None

    slope_duration_ms = max(1e-6, ((slope_segment.size - 1) / sample_rate) * 1000.0)
    onset_slope_db_per_ms = (float(np.max(slope_segment)) - float(slope_segment[0])) / slope_duration_ms
    peak_db = float(np.max(segment_db))

    baseline = float(segment_linear[0])
    peak_linear = float(np.max(segment_linear))
    dynamic = max(peak_linear - baseline, EPS)

    threshold_10 = baseline + dynamic * 0.10
    threshold_90 = baseline + dynamic * 0.90

    rise_10_idx = np.where(segment_linear >= threshold_10)[0]
    rise_90_idx = np.where(segment_linear >= threshold_90)[0]

    rise_time_ms = 0.0
    if rise_10_idx.size > 0 and rise_90_idx.size > 0:
        left = int(rise_10_idx[0])
        right = int(rise_90_idx[0])
        if right >= left:
            rise_time_ms = ((right - left) / sample_rate) * 1000.0

    return {
        "onset_slope_db_per_ms": onset_slope_db_per_ms,
        "peak_db": peak_db,
        "rise_time_ms": rise_time_ms,
    }


def summarize(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "std": 0.0, "max_abs": 0.0}

    array = np.asarray(values, dtype=np.float64)
    return {
        "mean": float(np.mean(array)),
        "std": float(np.std(array)),
        "max_abs": float(np.max(np.abs(array))),
    }


def analyze_pair(
    pair: AnalysisPair,
    output_dir: Path,
    gate_slope_threshold: float,
    plot_seconds: float,
) -> dict[str, Any]:
    reference_rate, reference = read_wav_mono(pair.reference)
    candidate_rate, candidate = read_wav_mono(pair.candidate)
    candidate = maybe_resample(candidate, candidate_rate, reference_rate)

    aligned_ref, aligned_candidate, lag_samples = align_signals(reference, candidate)

    ref_env_linear, ref_env_db = hann_rms_envelope(aligned_ref, reference_rate)
    cand_env_linear, cand_env_db = hann_rms_envelope(aligned_candidate, reference_rate)

    onset_indices = detect_onsets(ref_env_db, reference_rate)

    transient_rows: list[dict[str, float]] = []
    for onset_idx in onset_indices:
        ref_metrics = metrics_for_onset(ref_env_linear, ref_env_db, int(onset_idx), reference_rate)
        cand_metrics = metrics_for_onset(cand_env_linear, cand_env_db, int(onset_idx), reference_rate)
        if ref_metrics is None or cand_metrics is None:
            continue

        transient_rows.append(
            {
                "onset_sample": int(onset_idx),
                "reference_onset_slope_db_per_ms": ref_metrics["onset_slope_db_per_ms"],
                "candidate_onset_slope_db_per_ms": cand_metrics["onset_slope_db_per_ms"],
                "delta_onset_slope_db_per_ms": cand_metrics["onset_slope_db_per_ms"] - ref_metrics["onset_slope_db_per_ms"],
                "reference_peak_db": ref_metrics["peak_db"],
                "candidate_peak_db": cand_metrics["peak_db"],
                "delta_peak_db": cand_metrics["peak_db"] - ref_metrics["peak_db"],
                "reference_rise_time_ms": ref_metrics["rise_time_ms"],
                "candidate_rise_time_ms": cand_metrics["rise_time_ms"],
                "delta_rise_time_ms": cand_metrics["rise_time_ms"] - ref_metrics["rise_time_ms"],
            }
        )

    slope_summary = summarize([row["delta_onset_slope_db_per_ms"] for row in transient_rows])
    peak_summary = summarize([row["delta_peak_db"] for row in transient_rows])
    rise_summary = summarize([row["delta_rise_time_ms"] for row in transient_rows])

    slope_gate = "pass" if abs(slope_summary["mean"]) <= gate_slope_threshold else "fail"

    pair_result = {
        "pair_id": pair.pair_id,
        "reference_path": str(pair.reference),
        "candidate_path": str(pair.candidate),
        "reference_label": pair.reference_label,
        "candidate_label": pair.candidate_label,
        "sample_rate_hz": reference_rate,
        "alignment_lag_samples": lag_samples,
        "alignment_lag_ms": (lag_samples / reference_rate) * 1000.0,
        "transient_count": len(transient_rows),
        "metrics": {
            "delta_onset_slope_db_per_ms": slope_summary,
            "delta_peak_db": peak_summary,
            "delta_rise_time_ms": rise_summary,
        },
        "gate": {
            "slope_threshold_db_per_ms": gate_slope_threshold,
            "slope_mean_abs_db_per_ms": abs(slope_summary["mean"]),
            "slope_status": slope_gate,
        },
        "transients": transient_rows,
    }

    chart_path = output_dir / f"{pair.pair_id}.png"
    plot_pair(
        chart_path=chart_path,
        reference=aligned_ref,
        candidate=aligned_candidate,
        ref_env_db=ref_env_db,
        cand_env_db=cand_env_db,
        onsets=onset_indices,
        sample_rate=reference_rate,
        labels=(pair.reference_label, pair.candidate_label),
        plot_seconds=plot_seconds,
    )
    pair_result["chart_path"] = str(chart_path)

    pair_json_path = output_dir / f"{pair.pair_id}.json"
    pair_json_path.write_text(json.dumps(pair_result, indent=2), encoding="utf-8")
    pair_result["pair_json_path"] = str(pair_json_path)

    return pair_result


def plot_pair(
    chart_path: Path,
    reference: np.ndarray,
    candidate: np.ndarray,
    ref_env_db: np.ndarray,
    cand_env_db: np.ndarray,
    onsets: np.ndarray,
    sample_rate: int,
    labels: tuple[str, str],
    plot_seconds: float,
) -> None:
    max_samples = len(reference)
    if plot_seconds > 0:
        max_samples = min(max_samples, int(sample_rate * plot_seconds))

    time_axis = np.arange(max_samples, dtype=np.float64) / float(sample_rate)
    ref_plot = reference[:max_samples]
    cand_plot = candidate[:max_samples]
    ref_env_plot = ref_env_db[:max_samples]
    cand_env_plot = cand_env_db[:max_samples]

    fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)

    axes[0].plot(time_axis, ref_plot, color="#2563eb", linewidth=0.9, label=labels[0])
    axes[0].plot(time_axis, cand_plot, color="#f97316", linewidth=0.9, alpha=0.85, label=labels[1])
    axes[0].set_ylabel("Amplitude")
    axes[0].set_title("Waveform Overlay")
    axes[0].grid(alpha=0.2)
    axes[0].legend(loc="upper right")

    axes[1].plot(time_axis, ref_env_plot, color="#2563eb", linewidth=1.1, label=f"{labels[0]} envelope")
    axes[1].plot(time_axis, cand_env_plot, color="#f97316", linewidth=1.1, label=f"{labels[1]} envelope")
    for onset in onsets:
        if onset >= max_samples:
            continue
        axes[1].axvline(onset / sample_rate, color="#22c55e", alpha=0.18, linewidth=0.9)

    axes[1].set_ylabel("Envelope (dB)")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_title("10ms RMS Envelope + Detected Onsets")
    axes[1].grid(alpha=0.2)
    axes[1].legend(loc="upper right")

    fig.tight_layout()
    fig.savefig(chart_path, dpi=140)
    plt.close(fig)


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    pairs = load_pairs(args)

    results: list[dict[str, Any]] = []
    for pair in pairs:
        if not pair.reference.exists():
            raise FileNotFoundError(f"Reference WAV not found: {pair.reference}")
        if not pair.candidate.exists():
            raise FileNotFoundError(f"Candidate WAV not found: {pair.candidate}")
        results.append(
            analyze_pair(
                pair=pair,
                output_dir=output_dir,
                gate_slope_threshold=float(args.gate_slope_threshold),
                plot_seconds=float(args.plot_seconds),
            )
        )

    summary = {
        "pair_count": len(results),
        "results": results,
    }

    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {len(results)} analysis result(s) to {output_dir}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
