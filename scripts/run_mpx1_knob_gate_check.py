#!/usr/bin/env python3
"""Run MPX1 inbound knob gate validation and write JSON/Markdown artifacts."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import websockets


def _api_get(base_url: str, path: str) -> Dict[str, Any]:
    with urllib.request.urlopen(base_url + path, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _api_post(base_url: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    request = urllib.request.Request(
        base_url + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _percentile(values: List[float], percentile: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return float(values[0])
    sorted_values = sorted(values)
    index = (len(sorted_values) - 1) * percentile
    lo = math.floor(index)
    hi = math.ceil(index)
    if lo == hi:
        return float(sorted_values[int(index)])
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (index - lo))


async def _capture_ws(ws_url: str, duration_sec: float) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    end_time = time.time() + duration_sec

    async with websockets.connect(ws_url, ping_interval=None, close_timeout=1) as websocket:
        while time.time() < end_time:
            timeout = max(0.05, min(1.0, end_time - time.time()))
            try:
                raw = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            except asyncio.TimeoutError:
                continue

            received_ts = time.time()
            message = json.loads(raw)
            source_ts = float(message.get("timestamp", received_ts))
            events.append(
                {
                    "type": str(message.get("type", "")),
                    "timestamp": source_ts,
                    "received_ts": received_ts,
                    "delay_ms": (received_ts - source_ts) * 1000.0,
                    "data": message.get("data", {}),
                }
            )

    return events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080", help="MAP2 API base URL")
    parser.add_argument("--input-port-index", type=int, default=1, help="MPX input port index")
    parser.add_argument("--output-port-index", type=int, default=1, help="MPX output port index")
    parser.add_argument("--name-hint", default="mpx", help="Port match hint")
    parser.add_argument(
        "--connect-mode",
        choices=["auto", "always", "never"],
        default="auto",
        help=(
            "MIDI connect behavior: "
            "'auto' reuses an existing matching connection when possible, "
            "'always' forces reconnect, "
            "'never' skips connect entirely."
        ),
    )
    parser.add_argument(
        "--probe-midi-ports",
        action="store_true",
        help="Include /api/mpx1/midi/ports probe in report (disabled by default to reduce ALSA churn).",
    )
    parser.add_argument("--sweep-param-id", default="pitch.alg_00.mix", help="Param id for zipper-free sweep")
    parser.add_argument("--sweep-updates", type=int, default=120, help="Number of 40ms sweep updates")
    parser.add_argument("--capture-seconds", type=float, default=45.0, help="Inbound WS capture duration")
    parser.add_argument("--latency-threshold-ms", type=float, default=150.0, help="Pass threshold for latency")
    parser.add_argument(
        "--inbound-mode",
        choices=["strict", "program_fallback"],
        default="strict",
        help=(
            "Inbound event qualification mode. "
            "'strict' requires panel_status/param_rx. "
            "'program_fallback' also accepts program_changed as knob telemetry."
        ),
    )
    parser.add_argument("--output-json", required=True, help="Output JSON path")
    parser.add_argument("--output-md", required=True, help="Output markdown path")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://") + "/api/mpx1/ws"

    output_json = Path(args.output_json)
    output_md = Path(args.output_md)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    health_before = _api_get(base_url, "/api/mpx1/health")
    state_before = _api_get(base_url, "/api/mpx1/state")
    ports: Dict[str, Any] = {"skipped": True}
    if args.probe_midi_ports:
        ports = _api_get(base_url, "/api/mpx1/midi/ports")

    should_connect = args.connect_mode == "always"
    if args.connect_mode == "auto":
        connected_before = bool(state_before.get("connected", False))
        input_before = state_before.get("input_port_index")
        output_before = state_before.get("output_port_index")
        matches = (
            connected_before
            and input_before is not None
            and output_before is not None
            and int(input_before) == int(args.input_port_index)
            and int(output_before) == int(args.output_port_index)
        )
        should_connect = not matches

    connect: Dict[str, Any]
    if should_connect:
        connect = _api_post(
            base_url,
            "/api/mpx1/midi/connect",
            {
                "input_port_index": args.input_port_index,
                "output_port_index": args.output_port_index,
                "name_hint": args.name_hint,
            },
        )
    else:
        connect = {"skipped": True, "mode": args.connect_mode}

    state = _api_get(base_url, "/api/mpx1/state")

    diagnostics_before = _api_get(base_url, "/api/mpx1/diagnostics?limit=500")
    packet_error_before = int(diagnostics_before.get("packet_error_count", 0))

    for index in range(args.sweep_updates):
        value = float((index * 11) % 128)
        _api_post(base_url, f"/api/mpx1/param/{args.sweep_param_id}", {"value": value})
        time.sleep(0.04)

    diagnostics_after_sweep = _api_get(base_url, "/api/mpx1/diagnostics?limit=500")
    packet_error_after = int(diagnostics_after_sweep.get("packet_error_count", 0))
    packet_error_delta = packet_error_after - packet_error_before

    ws_events = asyncio.run(_capture_ws(ws_url, float(args.capture_seconds)))
    panel_events = [event for event in ws_events if event.get("type") == "mpx1:panel_status"]
    param_rx_events = [event for event in ws_events if event.get("type") == "mpx1:param_rx"]
    program_events = [event for event in ws_events if event.get("type") == "mpx1:program_changed"]

    qualified_events = panel_events + param_rx_events
    if args.inbound_mode == "program_fallback":
        qualified_events = qualified_events + program_events

    combined_delays = [float(event["delay_ms"]) for event in qualified_events]
    inbound_detected = len(qualified_events) > 0
    latency_ok = inbound_detected and (max(combined_delays) <= float(args.latency_threshold_ms))

    summary = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "connection": {
            "health_before": health_before,
            "state_before": state_before,
            "ports": ports,
            "connect_mode": args.connect_mode,
            "connect_result": connect,
            "state_after_connect": state,
        },
        "ui_sweep": {
            "param_id": args.sweep_param_id,
            "updates_sent": args.sweep_updates,
            "interval_ms": 40,
            "packet_error_before": packet_error_before,
            "packet_error_after": packet_error_after,
            "packet_error_delta": packet_error_delta,
        },
        "physical_capture": {
            "duration_sec": args.capture_seconds,
            "inbound_mode": args.inbound_mode,
            "ws_event_count": len(ws_events),
            "panel_status_count": len(panel_events),
            "param_rx_count": len(param_rx_events),
            "program_changed_count": len(program_events),
            "qualified_event_count": len(qualified_events),
            "panel_control_values": [event.get("data", {}).get("control_value") for event in panel_events[:40]],
            "latency_ms": {
                "sample_count": len(combined_delays),
                "min": min(combined_delays) if combined_delays else None,
                "avg": statistics.mean(combined_delays) if combined_delays else None,
                "max": max(combined_delays) if combined_delays else None,
                "p99": _percentile(combined_delays, 0.99),
            },
            "sample_events": ws_events[:25],
        },
        "acceptance": {
            "connected": bool(state.get("connected", False)),
            "ui_knob_drag_no_packet_errors": packet_error_delta == 0,
            "physical_knob_inbound_detected": inbound_detected,
            "physical_knob_latency_lt_threshold": latency_ok,
            "latency_threshold_ms": args.latency_threshold_ms,
        },
    }
    summary["acceptance"]["overall_pass"] = all(
        [
            summary["acceptance"]["connected"],
            summary["acceptance"]["ui_knob_drag_no_packet_errors"],
            summary["acceptance"]["physical_knob_inbound_detected"],
            summary["acceptance"]["physical_knob_latency_lt_threshold"],
        ]
    )

    output_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    lines = [
        "# MPX1 Knob Gate Validation",
        "",
        "## Connection",
        f"- Connected: `{summary['acceptance']['connected']}`",
        f"- MIDI in/out indices: `{state.get('input_port_index')}` / `{state.get('output_port_index')}`",
        "",
        "## 40ms Sweep (UI Knob-Drag Proxy)",
        f"- Parameter: `{args.sweep_param_id}`",
        f"- Updates sent: `{args.sweep_updates}`",
        f"- Packet error delta: `{packet_error_delta}`",
        "",
        "## Physical Inbound Capture (WebSocket)",
        f"- Duration: `{args.capture_seconds:.0f}s`",
        f"- Inbound mode: `{args.inbound_mode}`",
        f"- `mpx1:panel_status` events: `{len(panel_events)}`",
        f"- `mpx1:param_rx` events: `{len(param_rx_events)}`",
        f"- `mpx1:program_changed` events: `{len(program_events)}`",
        f"- Qualified inbound events: `{len(qualified_events)}`",
    ]
    if combined_delays:
        lines.append(
            "- Latency ms min/avg/max/p99: "
            f"`{min(combined_delays):.3f}` / `{statistics.mean(combined_delays):.3f}` / "
            f"`{max(combined_delays):.3f}` / `{_percentile(combined_delays, 0.99):.3f}`"
        )
    else:
        lines.append("- Latency: `N/A` (no inbound knob/status event captured)")

    lines.extend(
        [
            "",
            "## Acceptance Gate Summary",
            f"- Connected: `{'PASS' if summary['acceptance']['connected'] else 'FAIL'}`",
            (
                "- Zipper-free proxy (no packet errors during 40ms sweep): "
                f"`{'PASS' if summary['acceptance']['ui_knob_drag_no_packet_errors'] else 'FAIL'}`"
            ),
            (
                "- Physical knob inbound detected: "
                f"`{'PASS' if summary['acceptance']['physical_knob_inbound_detected'] else 'FAIL'}`"
            ),
            (
                f"- Physical knob <{args.latency_threshold_ms:.0f}ms UI update confirmed: "
                f"`{'PASS' if summary['acceptance']['physical_knob_latency_lt_threshold'] else 'FAIL'}`"
            ),
            "",
            "## Result",
            f"- Overall: `{'PASS' if summary['acceptance']['overall_pass'] else 'FAIL'}`",
        ]
    )
    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(summary["acceptance"], indent=2))
    print(str(output_json))
    print(str(output_md))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
