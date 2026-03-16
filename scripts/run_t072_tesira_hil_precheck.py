#!/usr/bin/env python3
"""Run the T072 Tesira parity HIL prerequisite precheck bundle."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T072 Tesira parity HIL precheck.")
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8080/api",
        help="MAP2 API base (default: http://127.0.0.1:8080/api)",
    )
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON and markdown artifacts.")
    parser.add_argument(
        "--device-ids",
        default="",
        help="Optional comma-separated Tesira device IDs to require in the precheck. Default uses all discovered Tesira devices.",
    )
    parser.add_argument(
        "--min-connected-devices",
        type=int,
        default=2,
        help="Minimum connected Tesira devices required for the live HIL matrix.",
    )
    parser.add_argument(
        "--min-avb-discovered-devices",
        type=int,
        default=1,
        help="Minimum discovered AVB entities required before the HIL matrix can proceed.",
    )
    parser.add_argument(
        "--min-active-streams",
        type=int,
        default=1,
        help="Minimum active AVB streams required before the HIL matrix can proceed.",
    )
    parser.add_argument(
        "--accepted-ptp-states",
        default="MASTER,SLAVE",
        help="Comma-separated AVB/Tesira PTP states treated as locked/ready.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_csv(raw: str) -> list[str]:
    return [token.strip() for token in str(raw).split(",") if token.strip()]


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 10.0) -> Any:
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
    return json.loads(body)


def normalize_state(raw: Any) -> str:
    return str(raw or "").strip().upper()


def is_stream_active(stream: dict[str, Any]) -> bool:
    for key in ("active", "is_active", "connected", "streaming"):
        if key in stream:
            return bool(stream.get(key))

    state = normalize_state(stream.get("state") or stream.get("status") or stream.get("connection_status"))
    return state in {"ACTIVE", "CONNECTED", "STREAMING", "RUNNING"}


def filter_selected_devices(
    devices: list[dict[str, Any]],
    topology_nodes: list[dict[str, Any]],
    explicit_device_ids: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    if not explicit_device_ids:
        return devices, topology_nodes, []

    selected_devices = [row for row in devices if str(row.get("device_id", "")).strip() in explicit_device_ids]
    selected_nodes = [row for row in topology_nodes if str(row.get("device_id", "")).strip() in explicit_device_ids]
    found = {str(row.get("device_id", "")).strip() for row in selected_devices}
    missing = [device_id for device_id in explicit_device_ids if device_id not in found]
    return selected_devices, selected_nodes, missing


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T072 HIL Precheck ({summary['captured_at']})")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(
        f"- Tesira device scope: `{summary['selected_device_count']}` selected / `{summary['tesira_fleet_health'].get('connected_devices', 0)}` connected"
    )
    lines.append(f"- AVB discovered-device count: `{summary['avb_devices'].get('discovered_count', 0)}`")
    lines.append(f"- AVB active stream count: `{summary['avb_streams'].get('active_stream_count', 0)}`")
    lines.append(f"- AVB PTP state: `{summary['avb_ptp_status'].get('state', 'UNKNOWN')}`")
    lines.append(f"- Overall status: `{summary['overall_status']}`")
    lines.append("")
    lines.append("## Gates")
    lines.append("")
    lines.append("| Gate | Status | Reason |")
    lines.append("|---|---|---|")
    for gate_name, gate in summary["gates"].items():
        lines.append(f"| {gate_name} | {gate['status']} | {gate['reason']} |")
    lines.append("")
    if summary["selected_devices"]:
        lines.append("## Selected Tesira Devices")
        lines.append("")
        lines.append("| Device ID | Connected | Transport | Faults | AVB streams | PTP state |")
        lines.append("|---|---|---|---:|---:|---|")
        for row in summary["selected_devices"]:
            lines.append(
                f"| {row['device_id']} | {row['connected']} | {row.get('transport') or ''} | "
                f"{row.get('fault_count', 0)} | {row.get('avb_stream_count', 0)} | {row.get('ptp_state') or ''} |"
            )
        lines.append("")
    lines.append("## Conclusion")
    lines.append("")
    lines.append(f"- {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    api_base = args.api_base.rstrip("/")
    explicit_device_ids = parse_csv(args.device_ids)
    accepted_ptp_states = {normalize_state(token) for token in parse_csv(args.accepted_ptp_states)}

    tesira_devices_payload = http_json("GET", f"{api_base}/tesira/devices")
    if not isinstance(tesira_devices_payload, list):
        raise RuntimeError("Expected /tesira/devices to return a JSON list")
    tesira_devices = [row for row in tesira_devices_payload if isinstance(row, dict)]

    tesira_fleet_health = http_json("GET", f"{api_base}/tesira/fleet/health")
    tesira_ptp_topology = http_json("GET", f"{api_base}/tesira/fleet/ptp-topology")
    avb_devices = http_json("GET", f"{api_base}/avb/devices")
    avb_streams = http_json("GET", f"{api_base}/avb/streams")
    avb_ptp_status = http_json("GET", f"{api_base}/avb/ptp/status")

    if not isinstance(tesira_fleet_health, dict) or not isinstance(tesira_ptp_topology, dict):
        raise RuntimeError("Tesira fleet endpoints returned unexpected payloads")
    if not isinstance(avb_devices, dict) or not isinstance(avb_streams, dict) or not isinstance(avb_ptp_status, dict):
        raise RuntimeError("AVB endpoints returned unexpected payloads")

    topology_nodes_raw = tesira_ptp_topology.get("nodes", [])
    topology_nodes = [row for row in topology_nodes_raw if isinstance(row, dict)] if isinstance(topology_nodes_raw, list) else []

    selected_devices, selected_nodes, missing_device_ids = filter_selected_devices(
        tesira_devices,
        topology_nodes,
        explicit_device_ids,
    )
    active_streams = [
        row for row in (avb_streams.get("streams", []) if isinstance(avb_streams.get("streams"), list) else [])
        if isinstance(row, dict) and is_stream_active(row)
    ]

    connected_selected = sum(1 for row in selected_devices if bool(row.get("connected")))
    selected_device_ids = [str(row.get("device_id", "")).strip() for row in selected_devices]
    selected_node_states = {str(row.get("device_id", "")).strip(): normalize_state(row.get("ptp_state")) for row in selected_nodes}

    summary: dict[str, Any] = {
        "task_id": "T072",
        "captured_at": utc_now(),
        "settings": {
            "api_base": api_base,
            "device_ids": explicit_device_ids,
            "min_connected_devices": int(args.min_connected_devices),
            "min_avb_discovered_devices": int(args.min_avb_discovered_devices),
            "min_active_streams": int(args.min_active_streams),
            "accepted_ptp_states": sorted(accepted_ptp_states),
        },
        "selected_device_count": len(selected_devices),
        "selected_device_ids": selected_device_ids,
        "missing_device_ids": missing_device_ids,
        "tesira_devices": tesira_devices,
        "selected_devices": selected_devices,
        "tesira_fleet_health": tesira_fleet_health,
        "tesira_ptp_topology": tesira_ptp_topology,
        "avb_devices": dict(avb_devices),
        "avb_streams": dict(avb_streams),
        "avb_ptp_status": avb_ptp_status,
        "gates": {
            "tesira_control_ready": {"status": "BLOCKED", "reason": ""},
            "avb_discovery_ready": {"status": "BLOCKED", "reason": ""},
            "avb_stream_ready": {"status": "BLOCKED", "reason": ""},
            "ptp_lock_ready": {"status": "BLOCKED", "reason": ""},
        },
        "overall_status": "BLOCKED",
        "conclusion": "",
    }
    summary["avb_streams"]["active_stream_count"] = len(active_streams)

    if missing_device_ids:
        summary["gates"]["tesira_control_ready"] = {
            "status": "BLOCKED",
            "reason": f"Requested Tesira devices not found: {', '.join(missing_device_ids)}.",
        }
    elif connected_selected < int(args.min_connected_devices):
        summary["gates"]["tesira_control_ready"] = {
            "status": "BLOCKED",
            "reason": (
                f"Need at least {int(args.min_connected_devices)} connected Tesira devices; "
                f"found {connected_selected} in scope."
            ),
        }
    else:
        summary["gates"]["tesira_control_ready"] = {
            "status": "PASS",
            "reason": f"{connected_selected} Tesira device(s) connected and reachable.",
        }

    discovered_count = int(avb_devices.get("discovered_count") or 0)
    if not bool(avb_devices.get("available")):
        summary["gates"]["avb_discovery_ready"] = {
            "status": "BLOCKED",
            "reason": str(avb_devices.get("error") or "AVB devices endpoint reports unavailable."),
        }
    elif discovered_count < int(args.min_avb_discovered_devices):
        summary["gates"]["avb_discovery_ready"] = {
            "status": "BLOCKED",
            "reason": (
                f"Need at least {int(args.min_avb_discovered_devices)} discovered AVB device(s); "
                f"found {discovered_count}."
            ),
        }
    else:
        summary["gates"]["avb_discovery_ready"] = {
            "status": "PASS",
            "reason": f"{discovered_count} AVB discovered device(s) present.",
        }

    if not bool(avb_streams.get("available", True)):
        summary["gates"]["avb_stream_ready"] = {
            "status": "BLOCKED",
            "reason": str(avb_streams.get("error") or "AVB streams endpoint reports unavailable."),
        }
    elif len(active_streams) < int(args.min_active_streams):
        summary["gates"]["avb_stream_ready"] = {
            "status": "BLOCKED",
            "reason": f"Need at least {int(args.min_active_streams)} active AVB stream(s); found {len(active_streams)}.",
        }
    else:
        summary["gates"]["avb_stream_ready"] = {
            "status": "PASS",
            "reason": f"{len(active_streams)} active AVB stream(s) present.",
        }

    host_ptp_state = normalize_state(avb_ptp_status.get("state"))
    failing_nodes = [
        device_id
        for device_id, state in selected_node_states.items()
        if state and state not in accepted_ptp_states
    ]
    if not bool(avb_ptp_status.get("available", True)):
        summary["gates"]["ptp_lock_ready"] = {
            "status": "BLOCKED",
            "reason": str(avb_ptp_status.get("error") or "AVB PTP endpoint reports unavailable."),
        }
    elif host_ptp_state not in accepted_ptp_states:
        summary["gates"]["ptp_lock_ready"] = {
            "status": "BLOCKED",
            "reason": (
                f"Host AVB PTP state is {host_ptp_state or 'UNKNOWN'}; "
                f"expected one of {', '.join(sorted(accepted_ptp_states))}."
            ),
        }
    elif failing_nodes:
        summary["gates"]["ptp_lock_ready"] = {
            "status": "BLOCKED",
            "reason": (
                "Tesira fleet PTP topology is not locked for: "
                f"{', '.join(failing_nodes)}."
            ),
        }
    else:
        summary["gates"]["ptp_lock_ready"] = {
            "status": "PASS",
            "reason": (
                f"Host AVB PTP state {host_ptp_state} and selected Tesira nodes match accepted states."
            ),
        }

    gate_statuses = {gate["status"] for gate in summary["gates"].values()}
    if gate_statuses == {"PASS"}:
        summary["overall_status"] = "PASS"
        summary["conclusion"] = "Pass: T072 HIL prerequisites are ready for a live parity-lab execution window."
        return 0, summary

    summary["overall_status"] = "BLOCKED"
    summary["conclusion"] = (
        "Blocked: Tesira control, AVB entity/stream presence, or PTP lock prerequisites are still incomplete for T072."
    )
    return 2, summary


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)

    json_path = args.output_dir / "t072-hil-precheck.json"
    markdown_path = args.output_dir / "t072-hil-precheck.md"
    json_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(summary) + "\n", encoding="utf-8")
    print(summary["conclusion"])
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
