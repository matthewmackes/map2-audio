#!/usr/bin/env python3
"""
Run a sustained SynthForge Tier A soak test and archive timing/CPU/xrun evidence.

Default profile:
- Sample rate: 48 kHz
- Buffer size: 64
- Duration: 30 minutes
- Voice load cycle: 8/16/32/64 voices
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable


def parse_voice_levels(raw: str) -> list[int]:
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        raise ValueError("voice level list cannot be empty")
    values = []
    for value in parts:
        parsed = int(value)
        if parsed < 1 or parsed > 64:
            raise ValueError("voice levels must be within [1, 64]")
        values.append(parsed)
    return values


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def default_output_json(repo_root: Path) -> Path:
    day_dir = repo_root / "docs" / "fit-for-purpose-evidence" / datetime.now(UTC).strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return day_dir / f"synthforge-tier-a-soak-{stamp}.json"


def get_float(d: dict[str, Any], key: str, fallback: float = 0.0) -> float:
    value = d.get(key, fallback)
    if isinstance(value, (int, float)):
        return float(value)
    return fallback


def get_int(d: dict[str, Any], key: str, fallback: int = 0) -> int:
    value = d.get(key, fallback)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return fallback


def summarize_float(values: Iterable[float]) -> dict[str, float]:
    data = list(values)
    if not data:
        return {"min": 0.0, "max": 0.0, "mean": 0.0}
    return {"min": min(data), "max": max(data), "mean": statistics.fmean(data)}


def set_active_notes(engine: Any, channel: int, target_notes: list[int], active_notes: set[int], counters: dict[str, int]) -> None:
    desired = set(target_notes)
    to_off = sorted(active_notes - desired)
    to_on = sorted(desired - active_notes)

    for note in to_off:
        if engine.midi_inject_note_off(channel, note, 0):
            counters["accepted_note_off"] += 1
            active_notes.discard(note)
        else:
            counters["rejected_note_off"] += 1

    for note in to_on:
        if engine.midi_inject_note_on(channel, note, 100):
            counters["accepted_note_on"] += 1
            active_notes.add(note)
        else:
            counters["rejected_note_on"] += 1


def maybe_bypass_non_synth_processors(engine: Any) -> list[str]:
    bypass_methods = [
        "set_chorus_bypass",
        "set_phaser_bypass",
        "set_pitch_shifter_bypass",
        "set_shoegaze_bypass",
        "set_lexilove_bypass",
        "set_h3000_bypass",
        "set_peavey5150_bypass",
        "set_tweedbassman_bypass",
        "set_passionfx_bypass",
        "set_gate_bypass",
        "set_compressor_bypass",
        "set_limiter_bypass",
        "set_eq_bypass",
        "set_nam_bypass",
        "set_cabinet_bypass",
        "set_reverb_bypass",
    ]
    applied: list[str] = []
    for method in bypass_methods:
        fn = getattr(engine, method, None)
        if callable(fn):
            fn(True)
            applied.append(method)
    return applied


def build_markdown_report(result: dict[str, Any], output_json: Path, output_md: Path) -> None:
    thresholds = result["thresholds"]
    summary = result["summary"]
    checks = summary["checks"]
    check_mark = lambda ok: "PASS" if ok else "FAIL"

    system_info = result.get("system_info", {})
    device_name = system_info.get("audio_device") or system_info.get("audioDevice") or "unknown"

    lines = [
        f"# SynthForge Tier A Soak Validation ({result['metadata']['ended_at_utc']})",
        "",
        "## Profile",
        f"- Duration target: `{result['metadata']['duration_seconds_target']}s`",
        f"- Duration actual: `{result['metadata']['duration_seconds_actual']}s`",
        f"- Sample rate: `{result['config']['sample_rate_hz']} Hz`",
        f"- Buffer size: `{result['config']['buffer_size_samples']}`",
        f"- Voice cycle: `{result['config']['voice_levels']}`",
        f"- Sample interval: `{result['config']['sample_interval_seconds']}s`",
        f"- Warmup: `{result['config'].get('warmup_seconds', 0.0)}s`",
        f"- Reset stats after warmup: `{result['config'].get('reset_stats_after_warmup', False)}`",
        f"- Bypass non-synth: `{result['config'].get('bypass_non_synth', False)}`",
        "",
        "## Overall Result",
        f"- Status: `{'PASS' if summary['overall_pass'] else 'FAIL'}`",
        f"- Total samples: `{summary['sample_count']}`",
        f"- Final xrun count: `{summary['final_xrun_count']}`",
        f"- Device: `{device_name}`",
        "",
        "## Threshold Checks",
        f"- Xruns <= {thresholds['max_xruns']}: `{check_mark(checks['xruns_ok'])}`",
        f"- Min headroom >= {thresholds['min_headroom_percent']}%: `{check_mark(checks['headroom_ok'])}`",
        f"- Peak callback jitter <= {thresholds['max_peak_jitter_ms']} ms: `{check_mark(checks['jitter_ok'])}`",
        f"- Peak budget utilization <= {thresholds['max_budget_utilization_percent']}%: `{check_mark(checks['budget_utilization_ok'])}`",
        f"- Voice tracking hit each target: `{check_mark(checks['voice_tracking_ok'])}`",
        "",
        "## Key Metrics",
        f"- CPU total percent (min/max/mean): `{summary['cpu_total_percent']}`",
        f"- CPU headroom percent (min/max/mean): `{summary['cpu_headroom_percent']}`",
        f"- Callback jitter ms (min/max/mean): `{summary['callback_jitter_ms']}`",
        f"- Peak callback jitter ms observed: `{summary['peak_callback_jitter_ms']}`",
        f"- Budget utilization percent (min/max/mean): `{summary['budget_utilization_percent']}`",
        f"- Max active voices observed: `{summary['max_active_voices']}`",
        f"- Max peak voices observed: `{summary['max_peak_voices']}`",
        "",
        "## Voice Tracking by Target",
    ]

    for target, observed in summary["max_active_by_target"].items():
        alignment = summary["alignment_by_target"][target]
        lines.append(
            f"- Target `{target}` -> max `{observed}`, "
            f">=target alignment `{alignment['ge_target_percent']:.2f}%`, "
            f"exact-match alignment `{alignment['eq_target_percent']:.2f}%`"
        )

    lines.extend(
        [
            "",
            "## Artifacts",
            f"- JSON: `{output_json}`",
            "",
        ]
    )
    output_md.write_text("\n".join(lines), encoding="utf-8")


def run() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    parser = argparse.ArgumentParser(description="Run sustained SynthForge Tier A soak test.")
    parser.add_argument("--duration-seconds", type=int, default=1800, help="Soak duration in seconds (default: 1800)")
    parser.add_argument("--sample-interval-seconds", type=float, default=1.0, help="Metrics sample interval (default: 1.0)")
    parser.add_argument("--phase-seconds", type=float, default=5.0, help="Seconds per voice-load phase (default: 5.0)")
    parser.add_argument("--voice-levels", type=str, default="8,16,32,64", help="Comma-separated target voice counts.")
    parser.add_argument("--channel", type=int, default=1, help="MIDI channel for note injection (1-16)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Engine sample rate (default: 48000)")
    parser.add_argument("--buffer-size", type=int, default=64, help="Engine buffer size (default: 64)")
    parser.add_argument("--module-dir", type=Path, default=repo_root / "juce-engine" / "build", help="Directory containing map2_audio_engine module.")
    parser.add_argument("--output-json", type=Path, default=None, help="Output JSON path.")
    parser.add_argument("--output-md", type=Path, default=None, help="Output markdown summary path.")
    parser.add_argument("--log-every-seconds", type=float, default=60.0, help="Progress log cadence in seconds.")
    parser.add_argument(
        "--warmup-seconds",
        type=float,
        default=0.25,
        help="Warmup duration after start_audio before sampling (default: 0.25).",
    )
    parser.add_argument(
        "--reset-stats-after-warmup",
        action="store_true",
        help="Reset audio I/O stats and xrun counter after warmup before measurements.",
    )
    parser.add_argument(
        "--bypass-non-synth",
        action="store_true",
        help="Bypass non-SynthForge processors before soak to isolate synth runtime behavior.",
    )
    parser.add_argument("--threshold-max-xruns", type=int, default=0, help="Pass threshold: max xruns.")
    parser.add_argument("--threshold-min-headroom-percent", type=float, default=30.0, help="Pass threshold: minimum headroom percent.")
    parser.add_argument("--threshold-max-peak-jitter-ms", type=float, default=0.2, help="Pass threshold: peak callback jitter ms.")
    parser.add_argument("--threshold-max-budget-utilization-percent", type=float, default=70.0, help="Pass threshold: max callback budget utilization percent.")
    args = parser.parse_args()

    voice_levels = parse_voice_levels(args.voice_levels)
    channel = max(1, min(16, args.channel))

    output_json = args.output_json or default_output_json(repo_root)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md = args.output_md or output_json.with_suffix(".md")

    if not args.module_dir.exists():
        raise SystemExit(f"module dir does not exist: {args.module_dir}")

    sys.path.insert(0, str(args.module_dir))
    import map2_audio_engine  # pylint: disable=import-error

    engine = map2_audio_engine.create_engine()
    counters = {
        "accepted_note_on": 0,
        "accepted_note_off": 0,
        "rejected_note_on": 0,
        "rejected_note_off": 0,
    }
    samples: list[dict[str, Any]] = []
    active_notes: set[int] = set()
    note_pool = [36 + i for i in range(64)]

    started_utc = utc_now_iso()
    start_monotonic = 0.0
    last_log = 0.0

    engine.set_sample_rate(args.sample_rate)
    engine.set_buffer_size(args.buffer_size)

    init_ok = bool(engine.initialize(""))
    if not init_ok:
        raise SystemExit("engine.initialize failed")

    bypass_applied: list[str] = []
    if args.bypass_non_synth:
        bypass_applied = maybe_bypass_non_synth_processors(engine)

    start_ok = bool(engine.start_audio())
    if not start_ok:
        engine.shutdown()
        raise SystemExit("engine.start_audio failed")

    # Let callback path settle before sampling.
    time.sleep(max(0.0, args.warmup_seconds))
    if args.reset_stats_after_warmup:
        reset_stats = getattr(engine, "reset_audio_io_stats", None)
        if callable(reset_stats):
            reset_stats()
        reset_xruns = getattr(engine, "reset_xrun_counter", None)
        if callable(reset_xruns):
            reset_xruns()

    start_monotonic = time.monotonic()
    runtime_system_info = engine.get_system_info()

    try:
        next_sample = time.monotonic() + max(0.05, args.sample_interval_seconds)
        while True:
            elapsed = time.monotonic() - start_monotonic
            if elapsed >= args.duration_seconds:
                break

            phase_index = int(elapsed / max(0.1, args.phase_seconds)) % len(voice_levels)
            target_voices = voice_levels[phase_index]
            set_active_notes(engine, channel, note_pool[:target_voices], active_notes, counters)

            now = time.monotonic()
            if now >= next_sample:
                voice_metrics = engine.get_synthforge_voice_metrics()
                cpu_metrics = engine.get_cpu_metrics()
                audio_io_stats = engine.get_audio_io_stats()
                samples.append(
                    {
                        "timestamp_utc": utc_now_iso(),
                        "elapsed_seconds": round(elapsed, 3),
                        "target_voices": target_voices,
                        "active_notes_requested": len(active_notes),
                        "voice_active": get_int(voice_metrics, "active_voices"),
                        "voice_peak": get_int(voice_metrics, "peak_voices"),
                        "voice_part0": int(voice_metrics.get("voices_per_part")[0])
                        if isinstance(voice_metrics.get("voices_per_part"), list)
                        and len(voice_metrics.get("voices_per_part")) > 0
                        else 0,
                        "cpu_total_percent": get_float(cpu_metrics, "total_cpu_percent"),
                        "cpu_headroom_percent": get_float(cpu_metrics, "headroom_percent"),
                        "cpu_avg_percent": get_float(cpu_metrics, "average_cpu_percent"),
                        "xrun_count": get_int(audio_io_stats, "xrun_count"),
                        "callback_jitter_ms": get_float(audio_io_stats, "callback_jitter_ms"),
                        "peak_callback_jitter_ms": get_float(audio_io_stats, "peak_callback_jitter_ms"),
                        "avg_callback_duration_ms": get_float(audio_io_stats, "avg_callback_duration_ms"),
                        "peak_callback_duration_ms": get_float(audio_io_stats, "peak_callback_duration_ms"),
                        "budget_utilization_percent": get_float(audio_io_stats, "budget_utilization"),
                    }
                )
                next_sample = now + max(0.05, args.sample_interval_seconds)

            if elapsed - last_log >= max(5.0, args.log_every_seconds):
                if samples:
                    latest = samples[-1]
                    print(
                        "progress"
                        f" elapsed={int(elapsed)}s"
                        f" target={target_voices}"
                        f" active={latest['voice_active']}"
                        f" xruns={latest['xrun_count']}"
                        f" cpu={latest['cpu_total_percent']:.2f}%"
                        f" jitter_peak={latest['peak_callback_jitter_ms']:.3f}ms"
                    )
                last_log = elapsed

            time.sleep(0.01)
    finally:
        # Ensure all active notes are released before shutdown.
        for note in sorted(active_notes):
            if engine.midi_inject_note_off(channel, note, 0):
                counters["accepted_note_off"] += 1
            else:
                counters["rejected_note_off"] += 1
        active_notes.clear()
        time.sleep(0.1)
        engine.stop_audio()
        engine.shutdown()

    ended_utc = utc_now_iso()
    actual_duration = round(time.monotonic() - start_monotonic, 3)

    if not samples:
        raise SystemExit("no samples were captured")

    cpu_total_values = [s["cpu_total_percent"] for s in samples]
    cpu_headroom_values = [s["cpu_headroom_percent"] for s in samples]
    jitter_values = [s["callback_jitter_ms"] for s in samples]
    peak_jitter_values = [s["peak_callback_jitter_ms"] for s in samples]
    budget_values = [s["budget_utilization_percent"] for s in samples]
    active_voice_values = [s["voice_active"] for s in samples]
    peak_voice_values = [s["voice_peak"] for s in samples]

    max_active_by_target: dict[str, int] = {}
    alignment_by_target: dict[str, dict[str, float]] = {}
    for target in voice_levels:
        target_samples = [s["voice_active"] for s in samples if s["target_voices"] == target]
        max_active_by_target[str(target)] = max(target_samples) if target_samples else 0
        if target_samples:
            ge_target = sum(1 for value in target_samples if value >= target)
            eq_target = sum(1 for value in target_samples if value == target)
            total = len(target_samples)
            alignment_by_target[str(target)] = {
                "ge_target_percent": (ge_target / total) * 100.0,
                "eq_target_percent": (eq_target / total) * 100.0,
            }
        else:
            alignment_by_target[str(target)] = {
                "ge_target_percent": 0.0,
                "eq_target_percent": 0.0,
            }

    final_xrun_count = samples[-1]["xrun_count"]
    checks = {
        "xruns_ok": final_xrun_count <= args.threshold_max_xruns,
        "headroom_ok": min(cpu_headroom_values) >= args.threshold_min_headroom_percent,
        "jitter_ok": max(peak_jitter_values) <= args.threshold_max_peak_jitter_ms,
        "budget_utilization_ok": max(budget_values) <= args.threshold_max_budget_utilization_percent,
        "voice_tracking_ok": all(
            alignment_by_target[str(v)]["ge_target_percent"] >= 95.0
            and alignment_by_target[str(v)]["eq_target_percent"] >= 90.0
            for v in voice_levels
        ),
    }

    result = {
        "metadata": {
            "started_at_utc": started_utc,
            "ended_at_utc": ended_utc,
            "duration_seconds_target": args.duration_seconds,
            "duration_seconds_actual": actual_duration,
            "host": platform.node(),
            "platform": platform.platform(),
            "python_version": sys.version,
            "module_dir": str(args.module_dir),
        },
        "config": {
            "sample_rate_hz": args.sample_rate,
            "buffer_size_samples": args.buffer_size,
            "channel": channel,
            "sample_interval_seconds": args.sample_interval_seconds,
            "phase_seconds": args.phase_seconds,
            "voice_levels": voice_levels,
            "warmup_seconds": args.warmup_seconds,
            "reset_stats_after_warmup": bool(args.reset_stats_after_warmup),
            "bypass_non_synth": bool(args.bypass_non_synth),
            "bypass_methods_applied": bypass_applied,
        },
        "thresholds": {
            "max_xruns": args.threshold_max_xruns,
            "min_headroom_percent": args.threshold_min_headroom_percent,
            "max_peak_jitter_ms": args.threshold_max_peak_jitter_ms,
            "max_budget_utilization_percent": args.threshold_max_budget_utilization_percent,
        },
        "event_counters": counters,
        "system_info": runtime_system_info,
        "summary": {
            "sample_count": len(samples),
            "final_xrun_count": final_xrun_count,
            "cpu_total_percent": summarize_float(cpu_total_values),
            "cpu_headroom_percent": summarize_float(cpu_headroom_values),
            "callback_jitter_ms": summarize_float(jitter_values),
            "peak_callback_jitter_ms": max(peak_jitter_values),
            "budget_utilization_percent": summarize_float(budget_values),
            "max_active_voices": max(active_voice_values),
            "max_peak_voices": max(peak_voice_values),
            "max_active_by_target": max_active_by_target,
            "alignment_by_target": alignment_by_target,
            "checks": checks,
            "overall_pass": all(checks.values()),
        },
        "samples": samples,
    }

    output_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    build_markdown_report(result, output_json, output_md)

    print(f"wrote_json={output_json}")
    print(f"wrote_md={output_md}")
    print(f"overall_pass={result['summary']['overall_pass']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
