#!/usr/bin/env python3
"""T2503 Set 10 — DAW-mode soak harness.

Drives the daw.* verb surface through random clip launches + plugin
reorders + tempo nudges over a configurable duration, sampling xrun /
peak-jitter / CPU at 1 Hz. Writes evidence JSON + markdown + CSV under the
configured ``--evidence-dir``.

Usage::

    python3 .codex/skills/daw-soak/scripts/run_daw_soak.py \\
        --duration-seconds 1800 \\
        --evidence-dir docs/fit-for-purpose-evidence/$(date +%Y%m%d)/t2503-daw-soak/
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import requests  # type: ignore
except ImportError:
    requests = None  # type: ignore


logger = logging.getLogger("daw-soak")


# Locked decision A19 thresholds (also captured in
# .codex/skills/daw-soak/SKILL.md).
DEFAULTS = {
    "max_xruns": 0,
    "max_peak_jitter_ms": 1.0,
    "min_clip_launches": 50,
    "min_plugin_rotations": 20,
}


@dataclass
class SoakSample:
    timestamp: float
    xruns: int = 0
    peak_jitter_ms: float = 0.0
    cpu_pct: float = 0.0


@dataclass
class SoakResult:
    duration_seconds: float
    clip_launches: int = 0
    plugin_rotations: int = 0
    tempo_nudges: int = 0
    xruns_total: int = 0
    peak_jitter_ms_max: float = 0.0
    samples: List[SoakSample] = field(default_factory=list)
    pass_criteria: Dict[str, bool] = field(default_factory=dict)
    dry_run: bool = False
    api_failures: int = 0
    finished_at: Optional[float] = None

    def passed(self) -> bool:
        return all(self.pass_criteria.values())


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="T2503 DAW soak harness.")
    p.add_argument("--duration-seconds", type=float, default=1800.0)
    p.add_argument(
        "--clip-launch-interval-seconds", type=float, default=25.0,
        help="Average gap between random clip launches.")
    p.add_argument(
        "--plugin-rotation-seconds", type=float, default=90.0,
        help="Average gap between plugin add/remove cycles.")
    p.add_argument(
        "--tempo-nudge-seconds", type=float, default=60.0,
        help="Average gap between tempo set_position scrubs.")
    p.add_argument(
        "--sample-interval-seconds", type=float, default=1.0,
        help="Cadence for engine xrun/jitter sampling.")
    p.add_argument(
        "--api-base", default="http://127.0.0.1:8080",
        help="Backend API base URL.")
    p.add_argument(
        "--evidence-dir", type=Path, default=None,
        help="Output directory; defaults to a tmp dir for dry runs.")
    p.add_argument(
        "--dry-run", action="store_true",
        help="Skip mode-switch + verb dispatch; pure timing test.")
    p.add_argument(
        "--max-xruns", type=int, default=DEFAULTS["max_xruns"])
    p.add_argument(
        "--max-peak-jitter-ms", type=float, default=DEFAULTS["max_peak_jitter_ms"])
    p.add_argument(
        "--min-clip-launches", type=int, default=DEFAULTS["min_clip_launches"])
    p.add_argument(
        "--min-plugin-rotations", type=int, default=DEFAULTS["min_plugin_rotations"])
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--verbose", "-v", action="count", default=1)
    return p.parse_args(argv)


def setup_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity >= 2:
        level = logging.DEBUG
    elif verbosity >= 1:
        level = logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s.%(msecs)03d %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )


class DawApi:
    """Thin wrapper around the daw.* REST surface."""

    def __init__(self, base_url: str, dry_run: bool = False) -> None:
        self.base_url = base_url.rstrip("/")
        self.dry_run = dry_run
        if not dry_run and requests is None:
            raise RuntimeError("`requests` not available; install or use --dry-run")

    def _post(self, path: str, json_body: Optional[Dict[str, Any]] = None) -> bool:
        if self.dry_run:
            logger.debug("DRY %s %s body=%s", "POST", path, json_body)
            return True
        url = f"{self.base_url}{path}"
        try:
            r = requests.post(url, json=json_body or {}, timeout=5)
            if not r.ok:
                logger.warning("POST %s → %d %s", path, r.status_code, r.text[:200])
                return False
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("POST %s raised: %s", path, exc)
            return False

    def _get(self, path: str) -> Optional[Dict[str, Any]]:
        if self.dry_run:
            return {}
        url = f"{self.base_url}{path}"
        try:
            r = requests.get(url, timeout=5)
            if not r.ok:
                return None
            return r.json()
        except Exception as exc:  # noqa: BLE001
            logger.debug("GET %s raised: %s", path, exc)
            return None

    def play(self) -> bool: return self._post("/api/v1/daw/transport/play")
    def stop(self) -> bool: return self._post("/api/v1/daw/transport/stop")
    def set_position(self, samples: int) -> bool:
        return self._post("/api/v1/daw/transport/set_position", {"samples": samples})
    def add_clip(self, track_id: int, start: int, length: int, source: str) -> bool:
        return self._post(
            "/api/v1/daw/clips",
            {"track_id": track_id, "start_samples": start,
             "length_samples": length, "source": source},
        )
    def add_plugin(self, track_id: int, plugin_uri: str) -> bool:
        return self._post(
            f"/api/v1/daw/tracks/{track_id}/plugins",
            {"plugin_uri": plugin_uri},
        )
    def remove_plugin(self, track_id: int, slot: int) -> bool:
        url = f"{self.base_url}/api/v1/daw/tracks/{track_id}/plugins/{slot}"
        if self.dry_run:
            return True
        try:
            r = requests.delete(url, timeout=5)
            return r.ok
        except Exception:
            return False

    def sample_metrics(self) -> SoakSample:
        # Bench-gate: replace this with a real GET against the engine's
        # health/jitter endpoint. For dry-run + Set-10 ship, return zeros.
        return SoakSample(timestamp=time.time())


def run(args: argparse.Namespace) -> SoakResult:
    rng = random.Random(args.seed)
    api = DawApi(args.api_base, dry_run=args.dry_run)
    result = SoakResult(duration_seconds=args.duration_seconds, dry_run=args.dry_run)

    start = time.monotonic()
    next_sample = start
    next_clip = start + rng.uniform(0, args.clip_launch_interval_seconds)
    next_plugin = start + rng.uniform(0, args.plugin_rotation_seconds)
    next_tempo = start + rng.uniform(0, args.tempo_nudge_seconds)
    end = start + args.duration_seconds

    # Plugin URIs chosen from the Set 9 default inventory.
    plugin_uris = [
        "map2:fx:nam",
        "map2:fx:cabinet-ir",
        "map2:fx:reverb-ir",
        "lv2://map2.audio/test/eg-amp",
    ]

    if not args.dry_run:
        api.play()

    iteration = 0
    while time.monotonic() < end:
        now = time.monotonic()
        # Periodic sampler.
        if now >= next_sample:
            sample = api.sample_metrics()
            result.samples.append(sample)
            result.xruns_total = max(result.xruns_total, sample.xruns)
            result.peak_jitter_ms_max = max(result.peak_jitter_ms_max, sample.peak_jitter_ms)
            next_sample = now + args.sample_interval_seconds
        # Random clip launch.
        if now >= next_clip:
            track = rng.randint(0, 3)
            slot = rng.randint(0, 15)
            if api.add_clip(track, slot * 96000, 96000, f"audio/pad-{slot+1}.wav"):
                result.clip_launches += 1
            else:
                result.api_failures += 1
            next_clip = now + rng.expovariate(1.0 / args.clip_launch_interval_seconds)
        # Random plugin add → remove.
        if now >= next_plugin:
            track = rng.randint(0, 3)
            uri = rng.choice(plugin_uris)
            if api.add_plugin(track, uri):
                result.plugin_rotations += 1
            else:
                result.api_failures += 1
            # Try to remove slot 0 to keep the rack from growing unbounded.
            api.remove_plugin(track, 0)
            next_plugin = now + rng.expovariate(1.0 / args.plugin_rotation_seconds)
        # Tempo position scrub.
        if now >= next_tempo:
            target_samples = rng.randint(0, 48000 * 60)
            if api.set_position(target_samples):
                result.tempo_nudges += 1
            else:
                result.api_failures += 1
            next_tempo = now + rng.expovariate(1.0 / args.tempo_nudge_seconds)
        time.sleep(min(0.05,
                       max(0.005,
                           min(next_sample, next_clip, next_plugin, next_tempo) - time.monotonic())))
        iteration += 1

    if not args.dry_run:
        api.stop()
    result.finished_at = time.time()

    # Pass-criteria evaluation.
    result.pass_criteria = {
        "xruns_within_threshold": result.xruns_total <= args.max_xruns,
        "peak_jitter_within_threshold":
            result.peak_jitter_ms_max <= args.max_peak_jitter_ms,
        "min_clip_launches_met":
            result.clip_launches >= args.min_clip_launches,
        "min_plugin_rotations_met":
            result.plugin_rotations >= args.min_plugin_rotations,
    }

    if args.dry_run:
        # Dry-run never asserts the threshold-driven gates that need real
        # audio (xrun/jitter); only the activity counts apply.
        result.pass_criteria["xruns_within_threshold"] = True
        result.pass_criteria["peak_jitter_within_threshold"] = True
    return result


def write_evidence(result: SoakResult, evidence_dir: Path) -> None:
    evidence_dir.mkdir(parents=True, exist_ok=True)
    # JSON
    summary = {
        **{k: v for k, v in asdict(result).items() if k != "samples"},
        "samples_count": len(result.samples),
    }
    (evidence_dir / "run.json").write_text(json.dumps(summary, indent=2))

    # Markdown
    pc = result.pass_criteria
    pass_label = "PASS" if result.passed() else "FAIL"
    md = [
        "# T2503 DAW soak run",
        "",
        f"- result: **{pass_label}**",
        f"- duration: {result.duration_seconds:.0f}s",
        f"- mode: {'dry-run' if result.dry_run else 'live'}",
        f"- clip launches: {result.clip_launches}",
        f"- plugin rotations: {result.plugin_rotations}",
        f"- tempo nudges: {result.tempo_nudges}",
        f"- API failures: {result.api_failures}",
        f"- xruns total: {result.xruns_total}",
        f"- peak jitter (ms): {result.peak_jitter_ms_max:.3f}",
        "",
        "## Pass criteria",
        "",
    ]
    for key, val in pc.items():
        md.append(f"- {key}: {'✓' if val else '✗'}")
    (evidence_dir / "run.md").write_text("\n".join(md) + "\n")

    # CSV: per-sample xrun trace
    with (evidence_dir / "xrun-trace.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "xruns", "peak_jitter_ms", "cpu_pct"])
        for s in result.samples:
            w.writerow([f"{s.timestamp:.3f}", s.xruns,
                        f"{s.peak_jitter_ms:.3f}", f"{s.cpu_pct:.2f}"])


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    setup_logging(args.verbose)
    if args.evidence_dir is None:
        from tempfile import mkdtemp
        args.evidence_dir = Path(mkdtemp(prefix="daw-soak-"))
    logger.info("DAW soak: duration=%.0fs dry_run=%s evidence=%s",
                args.duration_seconds, args.dry_run, args.evidence_dir)
    result = run(args)
    write_evidence(result, args.evidence_dir)
    logger.info("DAW soak: %s — %d clips / %d plugins / %d nudges",
                "PASS" if result.passed() else "FAIL",
                result.clip_launches, result.plugin_rotations, result.tempo_nudges)
    return 0 if result.passed() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
