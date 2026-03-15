#!/usr/bin/env python3
"""Capture T066-subQ USB-to-DIN adapter qualification evidence."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IDENTITY_REQUEST = [240, 126, 127, 6, 1, 247]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T066 USB-to-DIN adapter qualification capture.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON, markdown, and raw command artifacts.")
    parser.add_argument("--adapter-label", default="Generic USB-to-DIN Adapter", help="Human-readable adapter label for the summary.")
    parser.add_argument(
        "--adapter-name-pattern",
        default="",
        help="Optional case-insensitive substring expected in `aconnect -l` or `amidi -l` output.",
    )
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8080/api/midi/hub",
        help="MIDI Hub API base URL (default: http://127.0.0.1:8080/api/midi/hub).",
    )
    parser.add_argument(
        "--session-id",
        default="",
        help="Optional network session ID for SysEx smoke send via /network/sessions/{id}/send.",
    )
    parser.add_argument(
        "--identity-request",
        default="F0 7E 7F 06 01 F7",
        help="Hex bytes for the optional SysEx smoke send (default: MIDI Identity Request).",
    )
    parser.add_argument("--traffic-limit", type=int, default=200, help="Traffic snapshot limit (default: 200).")
    parser.add_argument(
        "--post-send-delay-seconds",
        type=float,
        default=0.5,
        help="Delay after optional SysEx send before the post-send traffic snapshot (default: 0.5).",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def run_command(command: list[str], stdout_path: Path, stderr_path: Path) -> dict[str, Any]:
    try:
        proc = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        write_text(stdout_path, "")
        write_text(stderr_path, f"{exc}\n")
        return {
            "command": command,
            "returncode": 127,
            "stdout_artifact": str(stdout_path),
            "stderr_artifact": str(stderr_path),
            "stdout": "",
            "stderr": str(exc),
        }

    write_text(stdout_path, proc.stdout)
    write_text(stderr_path, proc.stderr)
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout_artifact": str(stdout_path),
        "stderr_artifact": str(stderr_path),
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def http_json(method: str, url: str, output_path: Path, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url, data=data, headers=headers, method=method.upper())
    result: dict[str, Any]
    try:
        with request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            status_code = int(getattr(response, "status", 200))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        status_code = int(exc.code)
        result = {"ok": False, "status_code": status_code, "error": body or str(exc)}
        write_text(output_path, json.dumps(result, indent=2) + "\n")
        return result
    except error.URLError as exc:
        result = {"ok": False, "status_code": None, "error": str(exc.reason)}
        write_text(output_path, json.dumps(result, indent=2) + "\n")
        return result

    try:
        payload_obj = json.loads(body) if body.strip() else {}
    except json.JSONDecodeError:
        payload_obj = {"raw_body": body}
    result = {
        "ok": True,
        "status_code": status_code,
        "payload": payload_obj,
    }
    write_text(output_path, json.dumps(result, indent=2) + "\n")
    return result


def parse_hex_bytes(value: str) -> list[int]:
    tokens = [token for token in value.replace(",", " ").split() if token]
    if not tokens:
        return list(DEFAULT_IDENTITY_REQUEST)
    payload: list[int] = []
    for token in tokens:
        token = token.strip()
        base = 16 if any(ch in token.lower() for ch in "abcdef") or token.lower().startswith("0x") else 16
        number = int(token, base)
        if number < 0 or number > 255:
            raise ValueError(f"byte out of range: {token}")
        payload.append(number)
    return payload


def adapter_match(pattern: str, command_outputs: list[str]) -> bool:
    if not pattern.strip():
        return True
    lowered = pattern.lower()
    return any(lowered in output.lower() for output in command_outputs)


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        identity_request = parse_hex_bytes(str(args.identity_request))
    except ValueError as exc:
        summary = {
            "task_id": "T066-subQ",
            "checked_at_utc": utc_now(),
            "adapter_label": args.adapter_label,
            "adapter_name_pattern": str(args.adapter_name_pattern) or None,
            "settings": {
                "api_base": args.api_base,
                "session_id": str(args.session_id) or None,
                "identity_request": str(args.identity_request),
                "traffic_limit": int(args.traffic_limit),
            },
            "checks": {
                "identity_request": {
                    "status": "FAIL",
                    "detail": str(exc),
                }
            },
            "observations": {},
            "artifacts": {},
            "overall_status": "FAIL",
            "conclusion": f"Fail: invalid identity request payload ({exc}).",
        }
        return 1, summary

    artifacts_dir = output_dir / "raw"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    aconnect = run_command(["aconnect", "-l"], artifacts_dir / "aconnect.stdout.txt", artifacts_dir / "aconnect.stderr.txt")
    amidi = run_command(["amidi", "-l"], artifacts_dir / "amidi.stdout.txt", artifacts_dir / "amidi.stderr.txt")
    discovery = run_command(
        [
            "python3",
            "-c",
            (
                "import json;"
                "from app.services.midi_hub.ports import discover_alsa_port_descriptors as d;"
                "print(json.dumps(d(), indent=2))"
            ),
        ],
        artifacts_dir / "alsa_discovery.stdout.txt",
        artifacts_dir / "alsa_discovery.stderr.txt",
    )

    sequencer_access = aconnect["returncode"] == 0 and "can't open sequencer" not in aconnect["stderr"].lower()
    adapter_detected = adapter_match(str(args.adapter_name_pattern), [aconnect["stdout"], amidi["stdout"]])

    start_result = http_json("POST", f"{args.api_base.rstrip('/')}/start", artifacts_dir / "hub_start.json")
    status_result = http_json("GET", f"{args.api_base.rstrip('/')}/status", artifacts_dir / "hub_status.json")
    sessions_result = http_json("GET", f"{args.api_base.rstrip('/')}/network/sessions", artifacts_dir / "network_sessions.json")
    traffic_before = http_json(
        "GET",
        f"{args.api_base.rstrip('/')}/traffic/snapshot?{parse.urlencode({'limit': int(args.traffic_limit)})}",
        artifacts_dir / "traffic_snapshot_before.json",
    )

    sysex_step: dict[str, Any]
    traffic_after: dict[str, Any] | None = None
    if str(args.session_id).strip():
        send_result = http_json(
            "POST",
            f"{args.api_base.rstrip('/')}/network/sessions/{parse.quote(str(args.session_id), safe='')}/send",
            artifacts_dir / "network_send_identity_request.json",
            payload={"message": list(identity_request)},
        )
        if send_result.get("ok") and float(args.post_send_delay_seconds) > 0:
            time.sleep(float(args.post_send_delay_seconds))
        traffic_after = http_json(
            "GET",
            f"{args.api_base.rstrip('/')}/traffic/snapshot?{parse.urlencode({'limit': int(args.traffic_limit)})}",
            artifacts_dir / "traffic_snapshot_after.json",
        )
        send_payload = send_result.get("payload") if isinstance(send_result.get("payload"), dict) else {}
        send_ok = bool(send_result.get("ok")) and bool(send_payload.get("ok", False))
        sysex_step = {
            "status": "PASS" if send_ok else "FAIL",
            "reason": "Identity request submitted through network session." if send_ok else "Identity request send failed.",
            "send_result_artifact": relpath(artifacts_dir / "network_send_identity_request.json", output_dir),
        }
    else:
        sysex_step = {
            "status": "SKIPPED",
            "reason": "No --session-id provided; SysEx smoke send was not attempted.",
            "send_result_artifact": None,
        }

    checks = {
        "alsa_sequencer_access": {
            "status": "PASS" if sequencer_access else "BLOCKED",
            "detail": "ALSA sequencer command path is available." if sequencer_access else "ALSA sequencer is unavailable or cannot be opened.",
        },
        "adapter_detection": {
            "status": "PASS" if adapter_detected else "BLOCKED",
            "detail": (
                f"Detected adapter pattern `{args.adapter_name_pattern}` in command output."
                if str(args.adapter_name_pattern).strip() and adapter_detected
                else (
                    "No adapter pattern requested; detection gate treated as satisfied."
                    if not str(args.adapter_name_pattern).strip()
                    else f"Did not find adapter pattern `{args.adapter_name_pattern}` in `aconnect -l` or `amidi -l` output."
                )
            ),
        },
        "hub_api": {
            "status": "PASS" if start_result.get("ok") and status_result.get("ok") else "BLOCKED",
            "detail": "MIDI Hub API start/status endpoints responded." if start_result.get("ok") and status_result.get("ok") else "MIDI Hub API did not respond cleanly.",
        },
        "traffic_snapshot": {
            "status": "PASS" if traffic_before.get("ok") else "BLOCKED",
            "detail": "Traffic snapshot endpoint responded." if traffic_before.get("ok") else "Traffic snapshot endpoint did not respond cleanly.",
        },
        "sysex_smoke_send": sysex_step,
    }

    blocked = any(checks[key]["status"] == "BLOCKED" for key in ("alsa_sequencer_access", "adapter_detection", "hub_api", "traffic_snapshot"))
    failed = checks["sysex_smoke_send"]["status"] == "FAIL"
    if blocked:
        overall_status = "BLOCKED"
        exit_code = 2
        conclusion = "Blocked: adapter qualification prerequisites are not present on this host."
    elif failed:
        overall_status = "FAIL"
        exit_code = 1
        conclusion = "Fail: adapter was visible, but the requested SysEx smoke send did not succeed."
    elif checks["sysex_smoke_send"]["status"] == "PASS":
        overall_status = "PASS"
        exit_code = 0
        conclusion = "Pass: baseline adapter inventory and optional SysEx smoke send were captured."
    else:
        overall_status = "PARTIAL"
        exit_code = 0
        conclusion = "Partial: adapter inventory and hub evidence were captured, but SysEx smoke send was skipped."

    sessions_payload = sessions_result.get("payload") if isinstance(sessions_result.get("payload"), dict) else {}
    traffic_payload = traffic_before.get("payload") if isinstance(traffic_before.get("payload"), dict) else {}
    traffic_after_payload = traffic_after.get("payload") if isinstance(traffic_after, dict) and isinstance(traffic_after.get("payload"), dict) else {}
    status_payload = status_result.get("payload") if isinstance(status_result.get("payload"), dict) else {}

    summary: dict[str, Any] = {
        "task_id": "T066-subQ",
        "checked_at_utc": utc_now(),
        "adapter_label": args.adapter_label,
        "adapter_name_pattern": str(args.adapter_name_pattern) or None,
        "settings": {
            "api_base": args.api_base,
            "session_id": str(args.session_id) or None,
            "identity_request": list(identity_request),
            "traffic_limit": int(args.traffic_limit),
        },
        "checks": checks,
        "observations": {
            "hub_running": bool(status_payload.get("running")),
            "hub_port_count": status_payload.get("port_count"),
            "route_count": status_payload.get("route_count"),
            "network_session_count": sessions_payload.get("count"),
            "traffic_captured_total_before": traffic_payload.get("captured_total"),
            "traffic_captured_total_after": traffic_after_payload.get("captured_total"),
        },
        "artifacts": {
            "aconnect_stdout": relpath(artifacts_dir / "aconnect.stdout.txt", output_dir),
            "aconnect_stderr": relpath(artifacts_dir / "aconnect.stderr.txt", output_dir),
            "amidi_stdout": relpath(artifacts_dir / "amidi.stdout.txt", output_dir),
            "amidi_stderr": relpath(artifacts_dir / "amidi.stderr.txt", output_dir),
            "alsa_discovery_stdout": relpath(artifacts_dir / "alsa_discovery.stdout.txt", output_dir),
            "alsa_discovery_stderr": relpath(artifacts_dir / "alsa_discovery.stderr.txt", output_dir),
            "hub_start": relpath(artifacts_dir / "hub_start.json", output_dir),
            "hub_status": relpath(artifacts_dir / "hub_status.json", output_dir),
            "network_sessions": relpath(artifacts_dir / "network_sessions.json", output_dir),
            "traffic_snapshot_before": relpath(artifacts_dir / "traffic_snapshot_before.json", output_dir),
            "traffic_snapshot_after": relpath(artifacts_dir / "traffic_snapshot_after.json", output_dir) if traffic_after is not None else None,
        },
        "overall_status": overall_status,
        "conclusion": conclusion,
    }
    return exit_code, summary


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T066 USB-to-DIN Adapter Qualification ({summary['checked_at_utc']})")
    lines.append("")
    lines.append(f"- adapter_label: `{summary['adapter_label']}`")
    lines.append(f"- overall_status: `{summary['overall_status']}`")
    lines.append(f"- adapter_name_pattern: `{summary['adapter_name_pattern'] or 'n/a'}`")
    lines.append("")
    lines.append("## Checks")
    lines.append("")
    lines.append("| Check | Status | Detail |")
    lines.append("|---|---|---|")
    for key in ("alsa_sequencer_access", "adapter_detection", "hub_api", "traffic_snapshot", "sysex_smoke_send"):
        row = summary["checks"][key]
        lines.append(f"| {key} | {row['status']} | {row['detail'] if 'detail' in row else row['reason']} |")
    lines.append("")
    lines.append("## Observations")
    lines.append("")
    observations = summary["observations"]
    lines.append(f"- hub_running: `{observations['hub_running']}`")
    lines.append(f"- hub_port_count: `{observations['hub_port_count']}`")
    lines.append(f"- network_session_count: `{observations['network_session_count']}`")
    lines.append(f"- traffic_captured_total_before: `{observations['traffic_captured_total_before']}`")
    lines.append(f"- traffic_captured_total_after: `{observations['traffic_captured_total_after']}`")
    lines.append("")
    lines.append("## Artifacts")
    lines.append("")
    for key, value in summary["artifacts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.append("")
    lines.append(f"Conclusion: {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)
    output_dir = args.output_dir.resolve()
    summary_json = output_dir / "t066-usb-din-adapter-qualification.json"
    summary_md = output_dir / "T066_USB_DIN_ADAPTER_QUALIFICATION.md"
    write_text(summary_json, json.dumps(summary, indent=2) + "\n")
    write_text(summary_md, render_markdown(summary))
    print(json.dumps({"overall_status": summary["overall_status"], "summary_file": str(summary_json)}))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
