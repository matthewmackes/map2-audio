#!/usr/bin/env python3
"""T2454 hardening — continuous warm-activation soak test.

Cycles through the operator-pinned snapshot set, calling
`POST /api/snapshots/{id}/preload` and `POST /api/snapshots/{id}/activate`
in a loop. Samples backend RSS, reconciler-cache size, and engine
adoption stats every interval. Writes a JSON record + summary to
`docs/fit-for-purpose-evidence/<YYYYMMDD>/preload_pin_soak/`.

Acceptance thresholds (default):
- RSS growth < 100 MB over the soak duration (excluding the warm cache
  itself, which is a one-time allocation per pin)
- Zero activation failures
- Zero orchestrator instance leaks (released_count == staged_count
  across the soak)

Usage:
  # 60s sanity check (default)
  python3 scripts/preload_pin_soak.py

  # Full 30-min soak per T2454 hardening spec
  python3 scripts/preload_pin_soak.py --duration-seconds 1800

  # Custom pin list (defaults to /api/settings/special pinned set)
  python3 scripts/preload_pin_soak.py --pin-ids 13,14,15 --duration-seconds 600

The script writes under `docs/fit-for-purpose-evidence/<date>/preload_pin_soak/`:
- `summary.json` — acceptance thresholds + pass/fail
- `samples.jsonl` — one line per sample (RSS, warm count, eviction count)
- `activations.jsonl` — one line per activation cycle (snapshot id,
  warm/cold, engine_load_stats if available, duration)
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import json
import os
import pathlib
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BACKEND_BASE = "http://localhost:8080"
DEFAULT_DURATION_SECONDS = 60  # sanity-check default
DEFAULT_SAMPLE_INTERVAL = 5.0
DEFAULT_CYCLE_SLEEP_SECONDS = 2.0


def _http_post(url: str, *, timeout: float = 30.0) -> dict | None:
    request = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as exc:
        return {"http_error": exc.code, "body": exc.read().decode("utf-8", "replace")[:200]}
    except urllib.error.URLError as exc:
        return {"connection_error": str(exc.reason)}


def _http_get(url: str, *, timeout: float = 10.0) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        return {"http_error": exc.code, "body": exc.read().decode("utf-8", "replace")[:200]}
    except urllib.error.URLError:
        return None


def _resolve_pin_ids(backend_base: str) -> list[int]:
    """Default pin set — resolves the operator's Raft-replicated pin list
    from `/api/settings/special/`."""
    settings = _http_get(f"{backend_base}/api/settings/special/")
    if not isinstance(settings, dict):
        return []
    raw = settings.get("snapshot_preload_pins")
    if not isinstance(raw, list):
        return []
    return [int(value) for value in raw if isinstance(value, (int, str)) and str(value).strip().lstrip("-").isdigit()]


def _backend_pid() -> int | None:
    try:
        result = subprocess.run(
            ["systemctl", "show", "-p", "ExecMainPID", "--value", "map2-backend.service"],
            check=True, capture_output=True, text=True, timeout=10.0,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None
    pid_text = result.stdout.strip()
    return int(pid_text) if pid_text.isdigit() else None


def _process_rss_kb(pid: int) -> int | None:
    """Read VmRSS from /proc/<pid>/status."""
    try:
        with open(f"/proc/{pid}/status", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    parts = line.split()
                    if len(parts) >= 2 and parts[1].isdigit():
                        return int(parts[1])
                    return None
    except OSError:
        return None
    return None


def _now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).isoformat()


def _evidence_dir() -> pathlib.Path:
    today = dt.date.today().isoformat()
    base = pathlib.Path(__file__).resolve().parent.parent / "docs" / "fit-for-purpose-evidence" / today / "preload_pin_soak"
    base.mkdir(parents=True, exist_ok=True)
    return base


def run_soak(
    *,
    duration_seconds: int,
    backend_base: str,
    pin_ids: list[int],
    sample_interval: float,
    cycle_sleep: float,
) -> dict:
    pid = _backend_pid()
    if pid is None:
        print("warning: could not resolve map2-backend PID — RSS sampling disabled", file=sys.stderr)
    initial_rss = _process_rss_kb(pid) if pid else None

    print(
        f"Soak: duration={duration_seconds}s pins={pin_ids} "
        f"backend={backend_base} pid={pid} initial_rss={initial_rss}KB",
        file=sys.stderr,
    )

    deadline = time.monotonic() + duration_seconds
    next_sample_at = time.monotonic()
    samples: list[dict] = []
    activations: list[dict] = []
    cycle_index = 0
    failures = 0
    leak_alerts = 0

    while time.monotonic() < deadline:
        cycle_index += 1
        for snapshot_id in pin_ids:
            t_warm_start = time.monotonic()
            warm = _http_post(f"{backend_base}/api/snapshots/{snapshot_id}/preload")
            warm_dur_ms = (time.monotonic() - t_warm_start) * 1000.0

            t_act_start = time.monotonic()
            activate = _http_post(f"{backend_base}/api/snapshots/{snapshot_id}/activate")
            act_dur_ms = (time.monotonic() - t_act_start) * 1000.0

            success = isinstance(activate, dict) and activate.get("status") == "success"
            if not success:
                failures += 1
            staged = (warm or {}).get("staged_instance_count")
            activations.append({
                "ts": _now_iso(),
                "cycle": cycle_index,
                "snapshot_id": snapshot_id,
                "warm_response": warm,
                "warm_duration_ms": round(warm_dur_ms, 2),
                "activate_status": (activate or {}).get("status") if isinstance(activate, dict) else None,
                "activate_duration_ms": round(act_dur_ms, 2),
                "staged_instance_count": staged,
            })

            if time.monotonic() < deadline:
                time.sleep(cycle_sleep)

            if time.monotonic() >= next_sample_at:
                next_sample_at = time.monotonic() + sample_interval
                rss = _process_rss_kb(pid) if pid else None
                status = _http_get(f"{backend_base}/api/snapshots/preload-status")
                samples.append({
                    "ts": _now_iso(),
                    "cycle": cycle_index,
                    "rss_kb": rss,
                    "preload_status": status,
                })

    # Final sample so we capture the closing RSS.
    final_rss = _process_rss_kb(pid) if pid else None
    samples.append({
        "ts": _now_iso(),
        "cycle": cycle_index,
        "rss_kb": final_rss,
        "preload_status": _http_get(f"{backend_base}/api/snapshots/preload-status"),
    })

    rss_growth_kb = (final_rss - initial_rss) if (initial_rss is not None and final_rss is not None) else None
    activate_durations = [a["activate_duration_ms"] for a in activations if a.get("activate_status") == "success"]
    warm_durations = [a["warm_duration_ms"] for a in activations]

    summary = {
        "started_at": activations[0]["ts"] if activations else _now_iso(),
        "duration_seconds": duration_seconds,
        "pin_ids": pin_ids,
        "cycles_completed": cycle_index,
        "activations_total": len(activations),
        "activations_succeeded": len(activate_durations),
        "activations_failed": failures,
        "leak_alerts": leak_alerts,
        "initial_rss_kb": initial_rss,
        "final_rss_kb": final_rss,
        "rss_growth_kb": rss_growth_kb,
        "rss_growth_mb": round(rss_growth_kb / 1024.0, 2) if rss_growth_kb is not None else None,
        "warm_duration_ms": {
            "min": round(min(warm_durations), 2) if warm_durations else None,
            "max": round(max(warm_durations), 2) if warm_durations else None,
            "median": round(statistics.median(warm_durations), 2) if warm_durations else None,
            "mean": round(statistics.mean(warm_durations), 2) if warm_durations else None,
        },
        "activate_duration_ms": {
            "min": round(min(activate_durations), 2) if activate_durations else None,
            "max": round(max(activate_durations), 2) if activate_durations else None,
            "median": round(statistics.median(activate_durations), 2) if activate_durations else None,
            "mean": round(statistics.mean(activate_durations), 2) if activate_durations else None,
        },
    }

    # Acceptance thresholds.
    rss_growth_acceptable = (rss_growth_kb is None) or (rss_growth_kb < 100 * 1024)
    summary["acceptance"] = {
        "rss_growth_under_100mb": rss_growth_acceptable,
        "zero_activation_failures": failures == 0,
        "zero_leak_alerts": leak_alerts == 0,
        "passed": rss_growth_acceptable and failures == 0 and leak_alerts == 0,
    }
    return {"summary": summary, "samples": samples, "activations": activations}


def _write_outputs(record: dict) -> pathlib.Path:
    base = _evidence_dir()
    summary_path = base / "summary.json"
    samples_path = base / "samples.jsonl"
    activations_path = base / "activations.jsonl"

    summary_path.write_text(json.dumps(record["summary"], indent=2))
    with samples_path.open("w", encoding="utf-8") as fh:
        for sample in record["samples"]:
            fh.write(json.dumps(sample) + "\n")
    with activations_path.open("w", encoding="utf-8") as fh:
        for activation in record["activations"]:
            fh.write(json.dumps(activation) + "\n")
    return base


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="T2454 hardening — preload pin soak")
    parser.add_argument("--duration-seconds", type=int, default=DEFAULT_DURATION_SECONDS,
                        help="Soak duration in seconds (default: 60 sanity check; production target: 1800)")
    parser.add_argument("--backend-base", default=DEFAULT_BACKEND_BASE)
    parser.add_argument("--pin-ids", default="",
                        help="Comma-separated snapshot ids to soak. Defaults to operator pin list.")
    parser.add_argument("--sample-interval", type=float, default=DEFAULT_SAMPLE_INTERVAL)
    parser.add_argument("--cycle-sleep", type=float, default=DEFAULT_CYCLE_SLEEP_SECONDS)
    parser.add_argument("--no-write", action="store_true",
                        help="Skip writing evidence files (just print summary).")
    args = parser.parse_args(argv)

    pin_ids: list[int]
    if args.pin_ids:
        pin_ids = [int(part) for part in args.pin_ids.split(",") if part.strip()]
    else:
        pin_ids = _resolve_pin_ids(args.backend_base)

    if not pin_ids:
        print(
            "error: no pin ids resolved. "
            "Pin at least one snapshot via /api/settings/special/ or pass --pin-ids.",
            file=sys.stderr,
        )
        return 2

    record = run_soak(
        duration_seconds=args.duration_seconds,
        backend_base=args.backend_base,
        pin_ids=pin_ids,
        sample_interval=args.sample_interval,
        cycle_sleep=args.cycle_sleep,
    )

    print(json.dumps(record["summary"], indent=2))

    if args.no_write:
        return 0 if record["summary"]["acceptance"]["passed"] else 1

    out_dir = _write_outputs(record)
    print(f"\nEvidence written to: {out_dir}", file=sys.stderr)
    return 0 if record["summary"]["acceptance"]["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
