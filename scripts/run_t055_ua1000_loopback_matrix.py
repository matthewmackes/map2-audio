#!/usr/bin/env python3
"""Run the T055 UA-1000 tuned-vs-rollback analog loopback matrix."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T055 UA-1000 analog loopback matrix.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for matrix artifacts.")
    parser.add_argument(
        "--measure-script",
        type=Path,
        default=REPO_ROOT / "scripts" / "measure_latency.sh",
        help="Path to the latency measurement script (default: scripts/measure_latency.sh).",
    )
    parser.add_argument("--duration", type=int, default=15, help="Per-trial measurement window in seconds.")
    parser.add_argument("--trials", type=int, default=3, help="Number of repeated trials per condition.")
    parser.add_argument("--host", default="http://127.0.0.1:8080", help="Backend base URL for measure_latency.sh.")
    parser.add_argument("--jack-playback-port", default="", help="Explicit JACK playback port override.")
    parser.add_argument("--jack-capture-port", default="", help="Explicit JACK capture port override.")
    parser.add_argument("--ua1000-pattern", default="UA-1000", help="Case-insensitive JACK port match for UA-1000.")
    parser.add_argument("--tuned-setup-cmd", default="", help="Optional command to prepare the tuned condition.")
    parser.add_argument("--rollback-setup-cmd", default="", help="Optional command to prepare the rollback condition.")
    parser.add_argument("--restore-cmd", default="", help="Optional command to restore steady-state after the matrix.")
    parser.add_argument("--tuned-verify-cmd", default="", help="Optional command to verify the tuned condition.")
    parser.add_argument("--rollback-verify-cmd", default="", help="Optional command to verify the rollback condition.")
    parser.add_argument("--stabilize-seconds", type=float, default=2.0, help="Delay after each setup command.")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    ordered = sorted(values)
    k = (len(ordered) - 1) * (p / 100.0)
    lo = int(math.floor(k))
    hi = int(math.ceil(k))
    if lo == hi:
        return float(ordered[lo])
    return float(ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo))


def relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run_shell_command(command: str, log_path: Path) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        command,
        shell=True,
        executable="/bin/bash",
        capture_output=True,
        text=True,
        check=False,
    )
    log_lines = [
        f"$ {command}",
        "",
        "[stdout]",
        proc.stdout.rstrip(),
        "",
        "[stderr]",
        proc.stderr.rstrip(),
        "",
        f"[returncode] {proc.returncode}",
    ]
    write_text(log_path, "\n".join(log_lines).rstrip() + "\n")
    return proc


def run_process(command: list[str], stdout_path: Path, stderr_path: Path) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(command, capture_output=True, text=True, check=False)
    write_text(stdout_path, proc.stdout)
    write_text(stderr_path, proc.stderr)
    return proc


def read_measurement(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} does not contain an object payload")
    return payload


def extract_trial_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    mean_ms: float | None = None
    p95_ms: float | None = None
    jitter_p95_ms: float | None = None
    xruns = int(payload.get("xruns", 0) or 0)
    gate = str(payload.get("gate", payload.get("status", "unknown"))).upper()

    rtl_payload = payload.get("rtl")
    if isinstance(rtl_payload, dict):
        mean_ms = rtl_payload.get("mean_ms")
        p95_ms = rtl_payload.get("p95_ms", mean_ms)

    jitter_payload = payload.get("jitter")
    if isinstance(jitter_payload, dict):
        jitter_p95_ms = jitter_payload.get("p95_ms")

    if mean_ms is None:
        mean_ms = payload.get("round_trip_ms")
    if p95_ms is None:
        p95_ms = payload.get("p95_ms", mean_ms)
    if jitter_p95_ms is None:
        jitter_p95_ms = payload.get("jitter_p95_ms")

    if mean_ms is None or p95_ms is None:
        raise ValueError("measurement payload is missing RTT fields")

    return {
        "mean_ms": float(mean_ms),
        "p95_ms": float(p95_ms),
        "jitter_p95_ms": float(jitter_p95_ms) if jitter_p95_ms is not None else None,
        "xruns": xruns,
        "gate": gate,
    }


def select_port(lines: list[str], ua1000_pattern: str, overrides: str, candidates: list[str]) -> str:
    if overrides:
        return overrides
    lowered_pattern = ua1000_pattern.lower()
    for suffix in candidates:
        for line in lines:
            line_stripped = line.strip()
            if lowered_pattern not in line_stripped.lower():
                continue
            if line_stripped.endswith(suffix):
                return line_stripped
    return ""


def detect_preflight(args: argparse.Namespace, output_dir: Path) -> dict[str, Any]:
    jack_lsp_path = output_dir / "jack_lsp.txt"
    try:
        proc = subprocess.run(["jack_lsp"], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        write_text(jack_lsp_path, "jack_lsp not found\n")
        return {
            "status": "BLOCKED",
            "reason": "jack_lsp is unavailable on this host.",
            "ua1000_port_count": 0,
            "jack_lsp_artifact": relpath(jack_lsp_path, output_dir),
            "selected_playback_port": args.jack_playback_port or None,
            "selected_capture_port": args.jack_capture_port or None,
        }

    write_text(jack_lsp_path, proc.stdout)
    if proc.returncode != 0:
        return {
            "status": "BLOCKED",
            "reason": f"jack_lsp exited with code {proc.returncode}.",
            "ua1000_port_count": 0,
            "jack_lsp_artifact": relpath(jack_lsp_path, output_dir),
            "selected_playback_port": args.jack_playback_port or None,
            "selected_capture_port": args.jack_capture_port or None,
        }

    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    lowered_pattern = args.ua1000_pattern.lower()
    ua1000_lines = [line for line in lines if lowered_pattern in line.lower()]
    playback_port = select_port(
        lines,
        args.ua1000_pattern,
        args.jack_playback_port,
        ["playback_AUX0", "playback_1", "playback_FL"],
    )
    capture_port = select_port(
        lines,
        args.ua1000_pattern,
        args.jack_capture_port,
        ["capture_AUX0", "capture_1", "capture_FL"],
    )

    if not ua1000_lines:
        reason = "UA-1000 ports are absent from the current JACK graph."
        status = "BLOCKED"
    elif not playback_port or not capture_port:
        reason = "UA-1000 JACK ports were visible but the runner could not resolve playback/capture endpoints."
        status = "BLOCKED"
    else:
        reason = "UA-1000 JACK ports are available for the loopback matrix."
        status = "PASS"

    return {
        "status": status,
        "reason": reason,
        "ua1000_port_count": len(ua1000_lines),
        "jack_lsp_artifact": relpath(jack_lsp_path, output_dir),
        "selected_playback_port": playback_port or None,
        "selected_capture_port": capture_port or None,
        "matched_ports": ua1000_lines,
    }


def measure_command_prefix(path: Path) -> list[str]:
    if path.suffix == ".sh":
        return ["bash", str(path)]
    return [str(path)]


def run_condition(
    *,
    label: str,
    args: argparse.Namespace,
    output_dir: Path,
    playback_port: str,
    capture_port: str,
    setup_cmd: str,
    verify_cmd: str,
) -> dict[str, Any]:
    condition_dir = output_dir / label
    condition_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, Any] = {
        "label": label,
        "setup_command": setup_cmd or None,
        "verify_command": verify_cmd or None,
        "setup_status": "SKIPPED",
        "verify_status": "SKIPPED",
        "setup_log": None,
        "verify_log": None,
        "trial_count_requested": int(args.trials),
        "trial_count_measured": 0,
        "trial_count_failed": 0,
        "trial_files": [],
        "measured_trial_files": [],
        "failed_trials": [],
        "trial_mean_rtt_ms": [],
        "trial_p95_rtt_ms": [],
        "trial_jitter_p95_ms": [],
        "trial_gates": [],
        "mean_round_trip_ms": None,
        "p95_round_trip_ms": None,
        "best_round_trip_ms": None,
        "worst_round_trip_ms": None,
        "mean_trial_p95_ms": None,
        "xruns_total": 0,
        "status": "FAIL",
        "reason": "",
    }

    if setup_cmd:
        setup_log = condition_dir / "setup.log"
        proc = run_shell_command(setup_cmd, setup_log)
        summary["setup_log"] = relpath(setup_log, output_dir)
        summary["setup_status"] = "PASS" if proc.returncode == 0 else "FAIL"
        if proc.returncode != 0:
            summary["reason"] = f"{label} setup command failed with exit code {proc.returncode}."
            summary["trial_count_failed"] = int(args.trials)
            return summary

    if float(args.stabilize_seconds) > 0:
        time.sleep(float(args.stabilize_seconds))

    if verify_cmd:
        verify_log = condition_dir / "verify.log"
        proc = run_shell_command(verify_cmd, verify_log)
        summary["verify_log"] = relpath(verify_log, output_dir)
        summary["verify_status"] = "PASS" if proc.returncode == 0 else "FAIL"
        if proc.returncode != 0:
            summary["reason"] = f"{label} verify command failed with exit code {proc.returncode}."
            summary["trial_count_failed"] = int(args.trials)
            return summary

    measure_prefix = measure_command_prefix(Path(args.measure_script))
    for trial_number in range(1, int(args.trials) + 1):
        trial_path = condition_dir / f"trial{trial_number}.json"
        stdout_path = condition_dir / f"trial{trial_number}.stdout.txt"
        stderr_path = condition_dir / f"trial{trial_number}.stderr.txt"
        command = [
            *measure_prefix,
            "--jack",
            "--duration",
            str(int(args.duration)),
            "--host",
            args.host,
            "--output",
            str(trial_path),
            "--jack-playback-port",
            playback_port,
            "--jack-capture-port",
            capture_port,
        ]

        proc = run_process(command, stdout_path, stderr_path)
        summary["trial_files"].append(relpath(trial_path, output_dir))

        if proc.returncode in (0, 1) and trial_path.exists():
            try:
                payload = read_measurement(trial_path)
                metrics = extract_trial_metrics(payload)
            except (json.JSONDecodeError, OSError, ValueError) as exc:
                summary["failed_trials"].append(
                    {
                        "trial_number": trial_number,
                        "file": relpath(trial_path, output_dir),
                        "reason": f"invalid measurement payload: {exc}",
                    }
                )
                continue

            summary["measured_trial_files"].append(relpath(trial_path, output_dir))
            summary["trial_mean_rtt_ms"].append(round(metrics["mean_ms"], 4))
            summary["trial_p95_rtt_ms"].append(round(metrics["p95_ms"], 4))
            if metrics["jitter_p95_ms"] is not None:
                summary["trial_jitter_p95_ms"].append(round(float(metrics["jitter_p95_ms"]), 4))
            summary["trial_gates"].append(metrics["gate"])
            summary["xruns_total"] += int(metrics["xruns"])
            summary["trial_count_measured"] += 1
            continue

        error_reason = f"measurement command exited with code {proc.returncode}"
        if not trial_path.exists():
            error_reason += " and did not write a trial artifact"
        summary["failed_trials"].append(
            {
                "trial_number": trial_number,
                "file": relpath(trial_path, output_dir),
                "reason": error_reason,
            }
        )

    summary["trial_count_failed"] = int(args.trials) - int(summary["trial_count_measured"])
    if summary["trial_count_measured"] > 0:
        means = [float(value) for value in summary["trial_mean_rtt_ms"]]
        p95s = [float(value) for value in summary["trial_p95_rtt_ms"]]
        summary["mean_round_trip_ms"] = round(sum(means) / len(means), 4)
        summary["p95_round_trip_ms"] = round(percentile(means, 95), 4)
        summary["best_round_trip_ms"] = round(min(means), 4)
        summary["worst_round_trip_ms"] = round(max(means), 4)
        summary["mean_trial_p95_ms"] = round(sum(p95s) / len(p95s), 4)

    if summary["trial_count_measured"] == int(args.trials):
        summary["status"] = "PASS"
        summary["reason"] = f"Captured {int(args.trials)}/{int(args.trials)} requested {label} trials."
    elif summary["trial_count_measured"] == 0:
        summary["status"] = "FAIL"
        summary["reason"] = f"No usable {label} trials were captured."
    else:
        summary["status"] = "FAIL"
        summary["reason"] = (
            f"Captured only {summary['trial_count_measured']}/{int(args.trials)} requested {label} trials."
        )
    return summary


def comparison_summary(tuned: dict[str, Any], rollback: dict[str, Any]) -> dict[str, Any]:
    if tuned["status"] != "PASS" or rollback["status"] != "PASS":
        return {
            "status": "INCOMPLETE",
            "mean_round_trip_delta_ms": None,
            "p95_round_trip_delta_ms": None,
            "recommendation": "Incomplete matrix: rerun the missing condition(s) after restoring UA-1000 loopback signal.",
        }

    tuned_mean = float(tuned["mean_round_trip_ms"])
    rollback_mean = float(rollback["mean_round_trip_ms"])
    tuned_p95 = float(tuned["p95_round_trip_ms"])
    rollback_p95 = float(rollback["p95_round_trip_ms"])
    mean_delta = round(rollback_mean - tuned_mean, 4)
    p95_delta = round(rollback_p95 - tuned_p95, 4)

    if mean_delta >= 0.25 and p95_delta >= 0.0 and int(tuned["xruns_total"]) <= int(rollback["xruns_total"]):
        recommendation = "Keep `51-ua1000-low-latency.conf`; tuned mode reduced round-trip latency."
        status = "KEEP_TUNED"
    elif mean_delta <= -0.25 or p95_delta <= -0.25 or int(tuned["xruns_total"]) > int(rollback["xruns_total"]):
        recommendation = "Rollback `51-ua1000-low-latency.conf`; tuned mode was not better on measured RTT stability."
        status = "ROLLBACK"
    else:
        recommendation = "Inconclusive delta: repeat the UA-1000 matrix and inspect loopback routing before deciding."
        status = "INCONCLUSIVE"

    return {
        "status": status,
        "mean_round_trip_delta_ms": mean_delta,
        "p95_round_trip_delta_ms": p95_delta,
        "recommendation": recommendation,
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T055 UA-1000 Loopback Matrix ({summary['checked_at_utc']})")
    lines.append("")
    lines.append(f"- overall_status: `{summary['overall_status']}`")
    lines.append(f"- ua1000_port_count: `{summary['preflight']['ua1000_port_count']}`")
    lines.append(f"- playback_port: `{summary['preflight'].get('selected_playback_port')}`")
    lines.append(f"- capture_port: `{summary['preflight'].get('selected_capture_port')}`")
    lines.append("")
    lines.append("## Preflight")
    lines.append("")
    lines.append(f"- status: `{summary['preflight']['status']}`")
    lines.append(f"- reason: {summary['preflight']['reason']}")
    lines.append(f"- jack_lsp_artifact: `{summary['preflight']['jack_lsp_artifact']}`")
    lines.append("")
    lines.append("## Conditions")
    lines.append("")
    lines.append("| Condition | Status | Measured trials | Mean RTT (ms) | P95 RTT (ms) | XRUNs |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for key in ("tuned", "rollback"):
        row = summary["conditions"][key]
        lines.append(
            f"| {row['label']} | {row['status']} | {row['trial_count_measured']}/{row['trial_count_requested']} | "
            f"{row['mean_round_trip_ms']} | {row['p95_round_trip_ms']} | {row['xruns_total']} |"
        )
    lines.append("")
    lines.append("## Comparison")
    lines.append("")
    lines.append(f"- status: `{summary['comparison']['status']}`")
    lines.append(f"- mean_round_trip_delta_ms: `{summary['comparison']['mean_round_trip_delta_ms']}`")
    lines.append(f"- p95_round_trip_delta_ms: `{summary['comparison']['p95_round_trip_delta_ms']}`")
    lines.append(f"- recommendation: {summary['comparison']['recommendation']}")
    lines.append("")
    if summary["restore"]["command"]:
        lines.append("## Restore")
        lines.append("")
        lines.append(f"- status: `{summary['restore']['status']}`")
        lines.append(f"- log: `{summary['restore']['log']}`")
        lines.append("")
    lines.append(f"Conclusion: {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "task_id": "T055",
        "checked_at_utc": utc_now(),
        "settings": {
            "duration_seconds": int(args.duration),
            "trials_per_condition": int(args.trials),
            "host": args.host,
            "measure_script": str(args.measure_script),
            "ua1000_pattern": args.ua1000_pattern,
            "stabilize_seconds": float(args.stabilize_seconds),
        },
        "preflight": {},
        "conditions": {},
        "comparison": {},
        "restore": {"command": args.restore_cmd or None, "status": "SKIPPED", "log": None},
        "overall_status": "BLOCKED",
        "conclusion": "",
    }

    preflight = detect_preflight(args, output_dir)
    summary["preflight"] = preflight
    if preflight["status"] != "PASS":
        summary["conditions"] = {
            "tuned": {
                "label": "tuned",
                "status": "BLOCKED",
                "reason": "Skipped because preflight failed.",
                "trial_count_requested": int(args.trials),
                "trial_count_measured": 0,
                "trial_count_failed": int(args.trials),
                "xruns_total": 0,
                "mean_round_trip_ms": None,
                "p95_round_trip_ms": None,
            },
            "rollback": {
                "label": "rollback",
                "status": "BLOCKED",
                "reason": "Skipped because preflight failed.",
                "trial_count_requested": int(args.trials),
                "trial_count_measured": 0,
                "trial_count_failed": int(args.trials),
                "xruns_total": 0,
                "mean_round_trip_ms": None,
                "p95_round_trip_ms": None,
            },
        }
        summary["comparison"] = {
            "status": "INCOMPLETE",
            "mean_round_trip_delta_ms": None,
            "p95_round_trip_delta_ms": None,
            "recommendation": "Reconnect or activate the UA-1000 so JACK exposes UA-1000 ports, then rerun the matrix.",
        }
        summary["overall_status"] = "BLOCKED"
        summary["conclusion"] = "Blocked: UA-1000-specific loopback matrix cannot run until JACK exposes UA-1000 ports."
        return 2, summary

    tuned = run_condition(
        label="tuned",
        args=args,
        output_dir=output_dir,
        playback_port=str(preflight["selected_playback_port"]),
        capture_port=str(preflight["selected_capture_port"]),
        setup_cmd=str(args.tuned_setup_cmd or ""),
        verify_cmd=str(args.tuned_verify_cmd or ""),
    )
    rollback = run_condition(
        label="rollback",
        args=args,
        output_dir=output_dir,
        playback_port=str(preflight["selected_playback_port"]),
        capture_port=str(preflight["selected_capture_port"]),
        setup_cmd=str(args.rollback_setup_cmd or ""),
        verify_cmd=str(args.rollback_verify_cmd or ""),
    )
    summary["conditions"] = {"tuned": tuned, "rollback": rollback}
    summary["comparison"] = comparison_summary(tuned, rollback)

    restore_failed = False
    if args.restore_cmd:
        restore_log = output_dir / "restore.log"
        proc = run_shell_command(args.restore_cmd, restore_log)
        summary["restore"] = {
            "command": args.restore_cmd,
            "status": "PASS" if proc.returncode == 0 else "FAIL",
            "log": relpath(restore_log, output_dir),
        }
        restore_failed = proc.returncode != 0

    if tuned["status"] == "PASS" and rollback["status"] == "PASS" and not restore_failed:
        summary["overall_status"] = "PASS"
        summary["conclusion"] = f"Pass: captured the full UA-1000 tuned-vs-rollback matrix. {summary['comparison']['recommendation']}"
        return 0, summary

    summary["overall_status"] = "FAIL"
    if restore_failed:
        summary["conclusion"] = "Fail: matrix ran, but the restore command failed."
    else:
        summary["conclusion"] = "Fail: matrix did not capture all requested tuned and rollback trials."
    return 1, summary


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)
    output_dir = Path(args.output_dir)
    json_path = output_dir / "t055-loopback-matrix-summary.json"
    markdown_path = output_dir / "T055_UA1000_LOOPBACK_MATRIX_SUMMARY.md"
    write_text(json_path, json.dumps(summary, indent=2) + "\n")
    write_text(markdown_path, render_markdown(summary))
    print(json.dumps({"overall_status": summary["overall_status"], "summary_file": str(json_path)}))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
