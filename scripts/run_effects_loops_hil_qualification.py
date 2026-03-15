#!/usr/bin/env python3
"""Run T030 effects-loop HIL qualification preflight, latency capture, and churn checks."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


@dataclass(frozen=True)
class GateStatus:
    status: str
    reason: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run T030 Tesira effects-loop HIL qualification.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8080/api", help="MAP2 API base (default: http://127.0.0.1:8080/api)")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON and markdown artifacts.")
    parser.add_argument("--min-loops", type=int, default=8, help="Minimum active topology size required for qualification.")
    parser.add_argument("--latency-threshold-ms", type=float, default=0.5, help="Per-loop added-latency gate (default: 0.5ms).")
    parser.add_argument("--churn-cycles", type=int, default=20, help="Number of bypass churn cycles to execute.")
    parser.add_argument("--sleep-seconds", type=float, default=0.2, help="Delay between churn operations.")
    parser.add_argument(
        "--loop-ids",
        default="",
        help="Comma-separated explicit loop IDs to qualify. Default selects the first --min-loops loops by loop_id.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 10.0) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}: {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Request failed for {url}: {exc.reason}") from exc

    if not body.strip():
        return {}
    payload_obj = json.loads(body)
    if not isinstance(payload_obj, dict):
        raise RuntimeError(f"Expected object JSON from {url}, got {type(payload_obj).__name__}")
    return payload_obj


def choose_loops(loops: list[dict[str, Any]], explicit_loop_ids: list[str], min_loops: int) -> list[dict[str, Any]]:
    by_id = {str(loop.get("loop_id", "")).strip(): loop for loop in loops}
    if explicit_loop_ids:
        selected: list[dict[str, Any]] = []
        for loop_id in explicit_loop_ids:
            loop = by_id.get(loop_id)
            if loop is not None:
                selected.append(loop)
        return selected

    return sorted(loops, key=lambda row: str(row.get("loop_id", "")))[:min_loops]


def response_ok(payload: dict[str, Any]) -> bool:
    if "success" in payload:
        return bool(payload.get("success"))
    if "status" in payload:
        return str(payload.get("status", "")).lower() not in {"error", "failed", "failure"}
    return True


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T030 Effects Loops HIL Qualification ({summary['checked_at_utc']})")
    lines.append("")
    lines.append(f"- selected_loop_count: `{summary['effects_loops']['selected_loop_count']}`")
    lines.append(f"- total_loop_count: `{summary['effects_loops']['loop_count']}`")
    lines.append(f"- active_loop_count: `{summary['effects_loops']['active_loop_count']}`")
    lines.append(f"- latency_samples_present: `{summary['effects_loops']['latency_samples_present']}`")
    lines.append(f"- overall_status: `{summary['overall_status']}`")
    lines.append("")
    lines.append("## Gates")
    lines.append("")
    lines.append("| Gate | Status | Reason |")
    lines.append("|---|---|---|")
    lines.append(
        f"| Minimum loop topology ready | {summary['gates']['minimum_loop_topology_ready']['status']} | "
        f"{summary['gates']['minimum_loop_topology_ready']['reason']} |"
    )
    lines.append(
        f"| Latency gate | {summary['gates']['latency_gate']['status']} | "
        f"{summary['gates']['latency_gate']['reason']} |"
    )
    lines.append(
        f"| Churn soak gate | {summary['gates']['churn_soak_gate']['status']} | "
        f"{summary['gates']['churn_soak_gate']['reason']} |"
    )
    lines.append("")
    if summary["loops"]:
        lines.append("## Loop Results")
        lines.append("")
        lines.append("| Loop | Health | Measured latency (ms) | Compensation samples | Activation | Calibration | Engine calibration |")
        lines.append("|---|---|---:|---:|---|---|---|")
        for row in summary["loops"]:
            lines.append(
                f"| {row['loop_id']} | {row['health_status']} | {row['measured_added_latency_ms']} | "
                f"{row['compensation_samples']} | {row['activation_status']} | {row['calibration_status']} | "
                f"{row['engine_calibration']} |"
            )
        lines.append("")
    lines.append(f"Conclusion: {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    listed = http_json("GET", f"{args.api_base.rstrip('/')}/effects-loops")
    loops = listed.get("loops", [])
    if not isinstance(loops, list):
        raise RuntimeError("effects-loops payload missing 'loops' list")

    explicit_loop_ids = [token.strip() for token in str(args.loop_ids).split(",") if token.strip()]
    selected = choose_loops([row for row in loops if isinstance(row, dict)], explicit_loop_ids, int(args.min_loops))
    active_loop_count = sum(1 for row in loops if str(row.get("state_actual", "")).lower() == "active")

    summary: dict[str, Any] = {
        "task_id": "T030",
        "checked_at_utc": utc_now(),
        "settings": {
            "api_base": args.api_base,
            "min_loops": int(args.min_loops),
            "latency_threshold_ms": float(args.latency_threshold_ms),
            "churn_cycles": int(args.churn_cycles),
            "sleep_seconds": float(args.sleep_seconds),
            "explicit_loop_ids": explicit_loop_ids,
        },
        "effects_loops": {
            "loop_count": len(loops),
            "selected_loop_count": len(selected),
            "active_loop_count": active_loop_count,
            "latency_samples_present": 0,
        },
        "gates": {
            "minimum_loop_topology_ready": {"status": "BLOCKED", "reason": ""},
            "latency_gate": {"status": "BLOCKED", "reason": ""},
            "churn_soak_gate": {"status": "BLOCKED", "reason": ""},
        },
        "loops": [],
        "churn": {
            "cycles": int(args.churn_cycles),
            "attempted_operations": 0,
            "successful_operations": 0,
            "failures": [],
        },
        "overall_status": "BLOCKED",
        "conclusion": "",
    }

    if len(selected) < int(args.min_loops):
        reason = (
            f"Need at least {int(args.min_loops)} loops for qualification; "
            f"found {len(selected)} selected loop(s) from {len(loops)} total."
        )
        summary["gates"]["minimum_loop_topology_ready"] = {"status": "BLOCKED", "reason": reason}
        summary["gates"]["latency_gate"] = {"status": "BLOCKED", "reason": "Latency gate cannot execute without minimum loop topology."}
        summary["gates"]["churn_soak_gate"] = {"status": "BLOCKED", "reason": "Churn soak cannot execute without minimum loop topology."}
        summary["conclusion"] = "Blocked: effects-loop topology not present for HIL execution."
        return 2, summary

    summary["gates"]["minimum_loop_topology_ready"] = {"status": "PASS", "reason": "Minimum loop topology present."}

    loop_rows: list[dict[str, Any]] = []
    metrics_with_latency = 0
    activation_failures: list[str] = []
    calibration_failures: list[str] = []
    engine_calibration_missing: list[str] = []
    latency_failures: list[str] = []

    for loop in selected:
        loop_id = str(loop.get("loop_id", "")).strip()
        activation_payload = http_json(
            "POST",
            f"{args.api_base.rstrip('/')}/effects-loops/{parse.quote(loop_id, safe='')}/activate",
            {"audition_mode": False},
        )
        calibration_payload = http_json(
            "POST",
            f"{args.api_base.rstrip('/')}/effects-loops/{parse.quote(loop_id, safe='')}/calibrate",
            {"options": {}},
        )
        metrics_payload = http_json(
            "GET",
            f"{args.api_base.rstrip('/')}/effects-loops/{parse.quote(loop_id, safe='')}/metrics",
        )

        measured_ms = metrics_payload.get("measured_added_latency_ms")
        compensation_samples = metrics_payload.get("compensation_samples")
        health_status = str(metrics_payload.get("health_status", loop.get("health_status", "unknown")))
        activation_ok = response_ok(activation_payload)
        calibration_ok = response_ok(calibration_payload)
        engine_calibration = bool(calibration_payload.get("engine_calibration"))

        if activation_ok is False:
            activation_failures.append(loop_id)
        if calibration_ok is False:
            calibration_failures.append(loop_id)
        if not engine_calibration:
            engine_calibration_missing.append(loop_id)
        if measured_ms is not None:
            metrics_with_latency += 1
            if float(measured_ms) > float(args.latency_threshold_ms):
                latency_failures.append(loop_id)

        loop_rows.append(
            {
                "loop_id": loop_id,
                "name": str(loop.get("name", "")).strip(),
                "health_status": health_status,
                "measured_added_latency_ms": measured_ms,
                "compensation_samples": compensation_samples,
                "activation_status": "PASS" if activation_ok else "FAIL",
                "activation_reason": str(activation_payload.get("reason", "")).strip(),
                "calibration_status": str(calibration_payload.get("calibration_status", "unknown")),
                "calibration_success": calibration_ok,
                "engine_calibration": engine_calibration,
            }
        )

    summary["loops"] = loop_rows
    summary["effects_loops"]["latency_samples_present"] = metrics_with_latency

    if activation_failures:
        summary["gates"]["latency_gate"] = {
            "status": "BLOCKED",
            "reason": f"Activation failed for loops: {', '.join(sorted(activation_failures))}",
        }
    elif calibration_failures:
        summary["gates"]["latency_gate"] = {
            "status": "FAIL",
            "reason": f"Calibration failed for loops: {', '.join(sorted(calibration_failures))}",
        }
    elif engine_calibration_missing:
        summary["gates"]["latency_gate"] = {
            "status": "BLOCKED",
            "reason": (
                "Real engine-backed calibration evidence missing for loops: "
                + ", ".join(sorted(engine_calibration_missing))
            ),
        }
    elif latency_failures:
        summary["gates"]["latency_gate"] = {
            "status": "FAIL",
            "reason": (
                f"Measured added latency exceeded {float(args.latency_threshold_ms):.3f}ms "
                f"for loops: {', '.join(sorted(latency_failures))}"
            ),
        }
    elif metrics_with_latency < len(selected):
        summary["gates"]["latency_gate"] = {
            "status": "BLOCKED",
            "reason": "Latency samples were not available for every selected loop.",
        }
    else:
        summary["gates"]["latency_gate"] = {
            "status": "PASS",
            "reason": f"All selected loops stayed within {float(args.latency_threshold_ms):.3f}ms added latency.",
        }

    churn_failures: list[dict[str, Any]] = []
    if summary["gates"]["latency_gate"]["status"] != "PASS":
        summary["gates"]["churn_soak_gate"] = {
            "status": "BLOCKED",
            "reason": "Churn soak skipped because latency gate did not pass cleanly.",
        }
    else:
        for cycle in range(1, int(args.churn_cycles) + 1):
            bypass_value = bool(cycle % 2 == 1)
            for loop in selected:
                loop_id = str(loop.get("loop_id", "")).strip()
                summary["churn"]["attempted_operations"] += 1
                try:
                    payload = http_json(
                        "POST",
                        f"{args.api_base.rstrip('/')}/effects-loops/{parse.quote(loop_id, safe='')}/bypass",
                        {"bypass": bypass_value},
                    )
                    if not response_ok(payload):
                        churn_failures.append(
                            {
                                "cycle": cycle,
                                "loop_id": loop_id,
                                "operation": "bypass",
                                "bypass": bypass_value,
                                "reason": str(payload.get("reason", "operation returned unsuccessful state")),
                            }
                        )
                    else:
                        summary["churn"]["successful_operations"] += 1
                except Exception as exc:  # pragma: no cover - exercised via subprocess integration tests
                    churn_failures.append(
                        {
                            "cycle": cycle,
                            "loop_id": loop_id,
                            "operation": "bypass",
                            "bypass": bypass_value,
                            "reason": str(exc),
                        }
                    )
                if float(args.sleep_seconds) > 0:
                    time.sleep(float(args.sleep_seconds))

        summary["churn"]["failures"] = churn_failures
        if churn_failures:
            summary["gates"]["churn_soak_gate"] = {
                "status": "FAIL",
                "reason": f"{len(churn_failures)} churn operations failed across {int(args.churn_cycles)} cycles.",
            }
        else:
            summary["gates"]["churn_soak_gate"] = {
                "status": "PASS",
                "reason": f"Completed {summary['churn']['successful_operations']} bypass operations with no failures.",
            }

    statuses = [
        summary["gates"]["minimum_loop_topology_ready"]["status"],
        summary["gates"]["latency_gate"]["status"],
        summary["gates"]["churn_soak_gate"]["status"],
    ]
    if "FAIL" in statuses:
        summary["overall_status"] = "FAIL"
        summary["conclusion"] = "Fail: one or more T030 effects-loop qualification gates failed."
        return 1, summary
    if "BLOCKED" in statuses:
        summary["overall_status"] = "BLOCKED"
        summary["conclusion"] = "Blocked: one or more T030 effects-loop qualification gates could not execute."
        return 2, summary

    summary["overall_status"] = "PASS"
    summary["conclusion"] = "Pass: minimum topology, latency gate, and churn soak gate all passed."
    return 0, summary


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "t030-hil-summary.json"
    md_path = args.output_dir / "T030_EFFECTS_LOOPS_HIL_SUMMARY.md"
    json_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(summary), encoding="utf-8")

    print(f"Wrote T030 summary to {json_path}")
    print(f"Wrote T030 markdown summary to {md_path}")
    print(f"Overall status: {summary['overall_status']}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
