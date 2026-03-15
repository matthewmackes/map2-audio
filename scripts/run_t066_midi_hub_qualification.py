#!/usr/bin/env python3
"""Run the T066 MIDI Hub regression, perf, and HIL-preflight qualification bundle."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

DEFAULT_REGRESSION_COMMAND = (
    "timeout 300s pytest -q "
    "tests/midi_hub/test_traffic_routes.py "
    "tests/midi_hub/test_consumer_migration.py "
    "tests/midi_hub/test_device_registry.py "
    "tests/midi_hub/test_gateway.py"
)
DEFAULT_TYPECHECK_COMMAND = "npm --prefix web run typecheck"
DEFAULT_MESSAGE_HEX = "90 3C 64"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T066 MIDI Hub qualification bundle.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON, markdown, and raw command artifacts.")
    parser.add_argument(
        "--regression-command",
        default=DEFAULT_REGRESSION_COMMAND,
        help="Shell command for the core MIDI Hub regression suite.",
    )
    parser.add_argument(
        "--typecheck-command",
        default=DEFAULT_TYPECHECK_COMMAND,
        help="Shell command for the frontend/API contract gate.",
    )
    parser.add_argument(
        "--adapter-precheck-script",
        type=Path,
        default=REPO_ROOT / "scripts" / "run_t066_usb_din_adapter_qualification.py",
        help="Path to the T066-subQ adapter precheck script.",
    )
    parser.add_argument("--adapter-label", default="Generic USB-to-DIN Adapter", help="Human-readable adapter label.")
    parser.add_argument(
        "--adapter-name-pattern",
        default="",
        help="Optional case-insensitive adapter name substring required by the precheck.",
    )
    parser.add_argument(
        "--adapter-api-base",
        default="http://127.0.0.1:8080/api/midi/hub",
        help="MIDI Hub API base URL for the adapter precheck.",
    )
    parser.add_argument("--adapter-session-id", default="", help="Optional network session ID for adapter SysEx smoke send.")
    parser.add_argument(
        "--adapter-identity-request",
        default="F0 7E 7F 06 01 F7",
        help="Hex payload used for the optional adapter SysEx smoke send.",
    )
    parser.add_argument(
        "--adapter-traffic-limit",
        type=int,
        default=200,
        help="Traffic snapshot limit forwarded to the adapter precheck.",
    )
    parser.add_argument(
        "--adapter-post-send-delay-seconds",
        type=float,
        default=0.5,
        help="Delay after optional adapter SysEx send before the post-send traffic snapshot.",
    )
    parser.add_argument("--perf-burst-count", type=int, default=10_000, help="Number of benchmark messages to route.")
    parser.add_argument(
        "--perf-timeout-seconds",
        type=float,
        default=10.0,
        help="Maximum wall time to wait for the benchmark to drain the routed burst.",
    )
    parser.add_argument(
        "--perf-poll-interval-seconds",
        type=float,
        default=0.002,
        help="Poll interval passed to the in-process MidiHub benchmark instance.",
    )
    parser.add_argument(
        "--perf-inflight-window",
        type=int,
        default=2048,
        help="Maximum benchmark messages kept in flight before draining the destination queue.",
    )
    parser.add_argument(
        "--perf-message-hex",
        default=DEFAULT_MESSAGE_HEX,
        help="Hex bytes used for the benchmark MIDI message payload.",
    )
    parser.add_argument(
        "--target-latency-per-hop-us",
        type=float,
        default=100.0,
        help="Target added latency per route hop in microseconds.",
    )
    parser.add_argument(
        "--target-throughput-msgs-per-sec",
        type=float,
        default=10_000.0,
        help="Target sustained throughput in messages per second.",
    )
    parser.add_argument(
        "--required-soak-seconds",
        type=float,
        default=86_400.0,
        help="Required long-duration soak time before the runner can mark the soak gate PASS.",
    )
    parser.add_argument(
        "--soak-seconds",
        type=float,
        default=0.0,
        help="Observed soak duration already completed for this qualification bundle.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def parse_hex_bytes(value: str) -> bytes:
    tokens = [token for token in value.replace(",", " ").split() if token]
    if not tokens:
        raise ValueError("no hex bytes provided")
    payload: list[int] = []
    for token in tokens:
        number = int(token, 16)
        if number < 0 or number > 255:
            raise ValueError(f"byte out of range: {token}")
        payload.append(number)
    return bytes(payload)


def run_shell_command(command: str, stdout_path: Path, stderr_path: Path) -> dict[str, Any]:
    proc = subprocess.run(
        command,
        shell=True,
        executable="/bin/bash",
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    write_text(stdout_path, proc.stdout)
    write_text(stderr_path, proc.stderr)
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout_artifact": str(stdout_path),
        "stderr_artifact": str(stderr_path),
    }


def command_gate_result(
    *,
    name: str,
    command_result: dict[str, Any],
    output_dir: Path,
    success_reason: str,
) -> dict[str, Any]:
    status = "PASS" if int(command_result["returncode"]) == 0 else "FAIL"
    reason = success_reason if status == "PASS" else f"{name} command exited with code {command_result['returncode']}."
    return {
        "status": status,
        "reason": reason,
        "command": command_result["command"],
        "returncode": int(command_result["returncode"]),
        "stdout_artifact": relpath(Path(command_result["stdout_artifact"]), output_dir),
        "stderr_artifact": relpath(Path(command_result["stderr_artifact"]), output_dir),
    }


def run_adapter_precheck(args: argparse.Namespace, output_dir: Path) -> dict[str, Any]:
    script_path = args.adapter_precheck_script.resolve()
    precheck_dir = output_dir / "adapter-precheck"
    precheck_dir.mkdir(parents=True, exist_ok=True)

    if not script_path.exists():
        return {
            "status": "FAIL",
            "reason": f"Adapter precheck script is missing: {script_path}",
            "script": str(script_path),
            "returncode": 127,
            "summary_artifact": None,
        }

    command = [
        sys.executable,
        str(script_path),
        "--output-dir",
        str(precheck_dir),
        "--adapter-label",
        str(args.adapter_label),
        "--api-base",
        str(args.adapter_api_base),
        "--identity-request",
        str(args.adapter_identity_request),
        "--traffic-limit",
        str(int(args.adapter_traffic_limit)),
        "--post-send-delay-seconds",
        str(float(args.adapter_post_send_delay_seconds)),
    ]
    if str(args.adapter_name_pattern).strip():
        command.extend(["--adapter-name-pattern", str(args.adapter_name_pattern)])
    if str(args.adapter_session_id).strip():
        command.extend(["--session-id", str(args.adapter_session_id)])

    stdout_path = precheck_dir / "runner.stdout.txt"
    stderr_path = precheck_dir / "runner.stderr.txt"
    proc = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    write_text(stdout_path, proc.stdout)
    write_text(stderr_path, proc.stderr)

    summary_path = precheck_dir / "t066-usb-din-adapter-qualification.json"
    summary_payload: dict[str, Any] = {}
    if summary_path.exists():
        try:
            parsed = json.loads(summary_path.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                summary_payload = parsed
        except json.JSONDecodeError:
            summary_payload = {}

    overall = str(summary_payload.get("overall_status") or "").upper()
    if overall == "PASS" and proc.returncode == 0:
        status = "PASS"
        reason = "Adapter precheck passed."
    elif overall == "BLOCKED" or proc.returncode == 2:
        status = "BLOCKED"
        reason = str(summary_payload.get("conclusion") or "Adapter precheck is blocked by missing hardware/runtime prerequisites.")
    else:
        status = "FAIL"
        reason = (
            str(summary_payload.get("conclusion") or "").strip()
            or f"Adapter precheck exited with code {proc.returncode}."
        )

    return {
        "status": status,
        "reason": reason,
        "script": str(script_path),
        "command": command,
        "returncode": int(proc.returncode),
        "stdout_artifact": relpath(stdout_path, output_dir),
        "stderr_artifact": relpath(stderr_path, output_dir),
        "summary_artifact": relpath(summary_path, output_dir) if summary_path.exists() else None,
        "precheck_overall_status": overall or None,
    }


def run_performance_microbench(args: argparse.Namespace, output_dir: Path) -> dict[str, Any]:
    perf_dir = output_dir / "performance"
    perf_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = perf_dir / "midi_hub_perf_microbench.json"

    try:
        message_bytes = parse_hex_bytes(str(args.perf_message_hex))
    except ValueError as exc:
        payload = {
            "status": "FAIL",
            "reason": f"Invalid benchmark MIDI payload: {exc}",
            "artifact": relpath(artifact_path, output_dir),
        }
        write_text(artifact_path, json.dumps(payload, indent=2) + "\n")
        return payload

    from app.config import get_config
    from app.services.midi_hub.hub import MidiHub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
    from app.services.midi_hub.router import MidiRouter
    from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor

    queue_size = max(4096, int(args.perf_inflight_window) * 4, int(args.perf_burst_count) // 2)
    config = get_config()
    original_cluster_enabled = bool(config.get("midi.cluster.enabled", True))
    if original_cluster_enabled:
        config.set("midi.cluster.enabled", False, save=False)

    hub = MidiHub(
        poll_interval_s=max(0.0005, float(args.perf_poll_interval_seconds)),
        hotplug_interval_s=max(5.0, float(args.perf_timeout_seconds)),
        auto_discover_alsa=False,
    )
    source_port = VirtualMidiPort(port_id="src", name="Bench Source", direction="input", queue_size=queue_size)
    destination_port = VirtualMidiPort(port_id="dst", name="Bench Destination", direction="duplex", queue_size=queue_size)
    hub.register_port(source_port, open_now=False)
    hub.register_port(destination_port, open_now=False)
    monitor = MidiTrafficMonitor(capacity=max(50_000, queue_size), export_dir=perf_dir / "traffic-exports")
    router = MidiRouter(hub=hub, persist_path=perf_dir / "routes.json", traffic_monitor=monitor)
    router.add_route(
        {
            "route_id": "bench_route",
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 100,
        }
    )

    payload: dict[str, Any]
    try:
        hub.start()
        router.start()
        time.sleep(0.02)
        destination_port.read_transmitted(max_messages=queue_size)
        monitor.clear()

        latency_started_ns = time.perf_counter_ns()
        if not hub.inject(MidiMessage(data=message_bytes, timestamp_ns=time.time_ns(), source_port="src")):
            raise RuntimeError("failed to inject latency probe into the MidiHub benchmark instance")

        latency_timeout_at = time.perf_counter() + max(0.5, float(args.perf_timeout_seconds) / 4.0)
        single_route_hop_latency_ms: float | None = None
        while time.perf_counter() < latency_timeout_at:
            delivered = destination_port.read_transmitted(max_messages=1)
            if delivered:
                single_route_hop_latency_ms = (time.perf_counter_ns() - latency_started_ns) / 1_000_000.0
                break
            time.sleep(0.0005)

        if single_route_hop_latency_ms is None:
            raise RuntimeError("latency probe did not reach the destination queue before timeout")

        monitor.clear()
        injected_count = 0
        received_count = 0
        failed_injections = 0
        started_ns = time.perf_counter_ns()
        timeout_at = time.perf_counter() + max(0.5, float(args.perf_timeout_seconds))
        inflight_window = max(32, int(args.perf_inflight_window))
        while time.perf_counter() < timeout_at and received_count < int(args.perf_burst_count):
            while injected_count < int(args.perf_burst_count) and (injected_count - received_count) < inflight_window:
                ok = hub.inject(
                    MidiMessage(
                        data=message_bytes,
                        timestamp_ns=time.time_ns(),
                        source_port="src",
                    )
                )
                if not ok:
                    failed_injections += 1
                    break
                injected_count += 1

            delivered_batch = destination_port.read_transmitted(max_messages=4096)
            if delivered_batch:
                received_count += len(delivered_batch)
                continue

            time.sleep(0.0005)

        elapsed_seconds = max((time.perf_counter_ns() - started_ns) / 1_000_000_000.0, 0.000001)
        throughput_msgs_per_sec = received_count / elapsed_seconds
        delivery_ratio = (received_count / injected_count) if injected_count else 0.0
        target_latency_ms = float(args.target_latency_per_hop_us) / 1000.0
        meets_latency_target = single_route_hop_latency_ms <= target_latency_ms
        meets_throughput_target = throughput_msgs_per_sec >= float(args.target_throughput_msgs_per_sec)
        meets_delivery_target = injected_count == int(args.perf_burst_count) and received_count == injected_count

        failures: list[str] = []
        if not meets_latency_target:
            failures.append(
                f"Measured route hop latency {single_route_hop_latency_ms:.3f} ms exceeds the {target_latency_ms:.3f} ms target."
            )
        if not meets_throughput_target:
            failures.append(
                f"Measured throughput {throughput_msgs_per_sec:.2f} msg/s is below the {float(args.target_throughput_msgs_per_sec):.2f} msg/s target."
            )
        if not meets_delivery_target:
            failures.append(
                f"Delivered {received_count} of {injected_count or int(args.perf_burst_count)} injected benchmark messages before timeout."
            )
        if failed_injections:
            failures.append(f"MidiHub rejected {failed_injections} benchmark injections while queues were saturated.")

        status = "PASS" if not failures else "BLOCKED"
        reason = "Performance microbench met the configured targets." if status == "PASS" else " ".join(failures)
        payload = {
            "status": status,
            "reason": reason,
            "timestamp": utc_now(),
            "burst_count": int(args.perf_burst_count),
            "injected_count": injected_count,
            "received_count": received_count,
            "failed_injections": failed_injections,
            "elapsed_seconds": elapsed_seconds,
            "throughput_msgs_per_sec": throughput_msgs_per_sec,
            "single_route_hop_latency_ms": single_route_hop_latency_ms,
            "delivery_ratio": delivery_ratio,
            "target_latency_per_hop_us": float(args.target_latency_per_hop_us),
            "target_throughput_msgs_per_sec": float(args.target_throughput_msgs_per_sec),
            "meets_latency_target": meets_latency_target,
            "meets_throughput_target": meets_throughput_target,
            "meets_delivery_target": meets_delivery_target,
            "hub_stats": hub.to_dict(),
            "traffic_stats": monitor.stats(),
            "artifact": relpath(artifact_path, output_dir),
        }
    except Exception as exc:
        payload = {
            "status": "FAIL",
            "reason": f"Performance microbench failed to execute: {exc}",
            "artifact": relpath(artifact_path, output_dir),
        }
    finally:
        try:
            router.stop()
        except Exception:
            pass
        try:
            hub.stop()
        except Exception:
            pass
        if original_cluster_enabled:
            config.set("midi.cluster.enabled", True, save=False)

    write_text(artifact_path, json.dumps(payload, indent=2) + "\n")
    return payload


def soak_gate(args: argparse.Namespace) -> dict[str, Any]:
    observed = max(0.0, float(args.soak_seconds))
    required = max(0.0, float(args.required_soak_seconds))
    if observed >= required:
        return {
            "status": "PASS",
            "reason": f"Observed soak duration {observed:.1f}s meets the required {required:.1f}s gate.",
            "observed_soak_seconds": observed,
            "required_soak_seconds": required,
        }
    return {
        "status": "BLOCKED",
        "reason": f"Observed soak duration {observed:.1f}s is below the required {required:.1f}s gate.",
        "observed_soak_seconds": observed,
        "required_soak_seconds": required,
    }


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    commands_dir = output_dir / "commands"
    commands_dir.mkdir(parents=True, exist_ok=True)

    regression_command = run_shell_command(
        str(args.regression_command),
        commands_dir / "software_regression.stdout.txt",
        commands_dir / "software_regression.stderr.txt",
    )
    regression_gate = command_gate_result(
        name="Software regression",
        command_result=regression_command,
        output_dir=output_dir,
        success_reason="Core MIDI Hub regression suite passed.",
    )

    typecheck_command = run_shell_command(
        str(args.typecheck_command),
        commands_dir / "frontend_typecheck.stdout.txt",
        commands_dir / "frontend_typecheck.stderr.txt",
    )
    typecheck_gate = command_gate_result(
        name="Frontend typecheck",
        command_result=typecheck_command,
        output_dir=output_dir,
        success_reason="Frontend/API contract typecheck passed.",
    )

    performance_gate = run_performance_microbench(args, output_dir)
    adapter_gate = run_adapter_precheck(args, output_dir)
    soak_duration_gate = soak_gate(args)

    gates = {
        "software_regression": regression_gate,
        "frontend_typecheck": typecheck_gate,
        "performance_microbench": performance_gate,
        "adapter_precheck": adapter_gate,
        "soak_duration": soak_duration_gate,
    }

    statuses = [str(gate.get("status", "FAIL")).upper() for gate in gates.values()]
    if any(status == "FAIL" for status in statuses):
        overall_status = "FAIL"
        exit_code = 1
    elif any(status != "PASS" for status in statuses):
        overall_status = "BLOCKED"
        exit_code = 2
    else:
        overall_status = "PASS"
        exit_code = 0

    if overall_status == "PASS":
        conclusion = "Pass: MIDI Hub regression, performance, adapter precheck, and soak-duration gates all passed."
    elif overall_status == "FAIL":
        failing = ", ".join(name for name, gate in gates.items() if str(gate.get("status")).upper() == "FAIL")
        conclusion = f"Fail: at least one qualification gate failed ({failing})."
    else:
        blocked = ", ".join(name for name, gate in gates.items() if str(gate.get("status")).upper() == "BLOCKED")
        conclusion = f"Blocked: remaining qualification gates depend on missing runtime, hardware, or soak prerequisites ({blocked})."

    summary = {
        "task_id": "T066-subR",
        "checked_at_utc": utc_now(),
        "settings": {
            "regression_command": str(args.regression_command),
            "typecheck_command": str(args.typecheck_command),
            "adapter_precheck_script": str(args.adapter_precheck_script.resolve()),
            "adapter_api_base": str(args.adapter_api_base),
            "adapter_label": str(args.adapter_label),
            "adapter_name_pattern": str(args.adapter_name_pattern) or None,
            "perf_burst_count": int(args.perf_burst_count),
            "perf_timeout_seconds": float(args.perf_timeout_seconds),
            "perf_poll_interval_seconds": float(args.perf_poll_interval_seconds),
            "perf_inflight_window": int(args.perf_inflight_window),
            "target_latency_per_hop_us": float(args.target_latency_per_hop_us),
            "target_throughput_msgs_per_sec": float(args.target_throughput_msgs_per_sec),
            "soak_seconds": float(args.soak_seconds),
            "required_soak_seconds": float(args.required_soak_seconds),
        },
        "gates": gates,
        "overall_status": overall_status,
        "conclusion": conclusion,
    }
    return exit_code, summary


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T066 MIDI Hub Qualification Summary ({summary['checked_at_utc']})")
    lines.append("")
    lines.append(f"- overall_status: `{summary['overall_status']}`")
    lines.append(f"- task_id: `{summary['task_id']}`")
    lines.append("")
    lines.append("## Gates")
    lines.append("")
    lines.append("| Gate | Status | Detail |")
    lines.append("|---|---|---|")
    for key, gate in summary["gates"].items():
        label = key.replace("_", " ")
        lines.append(f"| {label} | {gate['status']} | {str(gate.get('reason') or '').replace('|', '/')} |")
    lines.append("")
    performance = summary["gates"]["performance_microbench"]
    if performance.get("artifact"):
        lines.append("## Performance")
        lines.append("")
        lines.append(f"- burst_count: `{performance.get('burst_count')}`")
        lines.append(f"- injected_count: `{performance.get('injected_count')}`")
        lines.append(f"- received_count: `{performance.get('received_count')}`")
        lines.append(f"- throughput_msgs_per_sec: `{performance.get('throughput_msgs_per_sec')}`")
        lines.append(f"- single_route_hop_latency_ms: `{performance.get('single_route_hop_latency_ms')}`")
        lines.append(f"- delivery_ratio: `{performance.get('delivery_ratio')}`")
        lines.append(f"- artifact: `{performance.get('artifact')}`")
        lines.append("")
    lines.append("## Artifacts")
    lines.append("")
    for key, gate in summary["gates"].items():
        for artifact_key in ("stdout_artifact", "stderr_artifact", "summary_artifact", "artifact"):
            artifact = gate.get(artifact_key)
            if artifact:
                lines.append(f"- {key}.{artifact_key}: `{artifact}`")
    lines.append("")
    lines.append(f"Conclusion: {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    exit_code, summary = build_summary(args)
    json_path = output_dir / "t066-midi-hub-qualification-summary.json"
    markdown_path = output_dir / "T066_MIDI_HUB_QUALIFICATION_SUMMARY.md"
    write_text(json_path, json.dumps(summary, indent=2) + "\n")
    write_text(markdown_path, render_markdown(summary))

    print(summary["conclusion"])
    print(json_path)
    print(markdown_path)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
