#!/usr/bin/env python3
"""Run T209 API load qualification preflight, with optional load execution."""

from __future__ import annotations

import argparse
import json
import resource
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T209 API load qualification preflight.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON/markdown artifacts.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8080", help="Base API URL.")
    parser.add_argument("--run-id", default=f"t209-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}", help="Qualification run ID.")
    parser.add_argument("--min-open-files", type=int, default=65536, help="Minimum required soft RLIMIT_NOFILE.")
    parser.add_argument(
        "--load-command",
        default="",
        help="Optional shell command to execute only after all preflight gates pass.",
    )
    parser.add_argument(
        "--run-load-command",
        action="store_true",
        help="Execute --load-command after preflight passes.",
    )
    return parser.parse_args()


def request_json(
    api_base: str,
    path: str,
    *,
    run_id: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any] | None, str | None]:
    url = parse.urljoin(api_base.rstrip("/") + "/", path.lstrip("/"))
    headers = {"X-MAP2-Run-ID": run_id}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=5.0) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body) if body else {}
            return response.status, payload, None
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = None
        return exc.code, payload, body or str(exc)
    except Exception as exc:
        return 0, None, str(exc)


def fetch_json(api_base: str, path: str, *, run_id: str) -> tuple[int, dict[str, Any] | None, str | None]:
    return request_json(api_base, path, run_id=run_id, method="GET")


def check_open_file_limit(min_open_files: int) -> dict[str, Any]:
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    status = "PASS" if soft >= min_open_files else "BLOCKED"
    reason = (
        f"Open-file soft limit {soft} meets requirement >= {min_open_files}."
        if status == "PASS"
        else f"Open-file soft limit {soft} is below required >= {min_open_files}."
    )
    return {
        "status": status,
        "reason": reason,
        "soft_limit": int(soft),
        "hard_limit": int(hard),
        "required_minimum": int(min_open_files),
    }


def check_ready(api_base: str, run_id: str) -> dict[str, Any]:
    status_code, payload, error_text = fetch_json(api_base, "/api/ready", run_id=run_id)
    accepting_traffic = bool((payload or {}).get("accepting_traffic"))
    status = "PASS" if status_code == 200 and accepting_traffic else "BLOCKED"
    return {
        "status": status,
        "reason": (
            "API readiness probe reports accepting traffic."
            if status == "PASS"
            else f"Readiness probe did not report accepting traffic (status={status_code})."
        ),
        "http_status": status_code,
        "payload": payload,
        "error": error_text,
    }


def check_startup_order(api_base: str, run_id: str) -> dict[str, Any]:
    status_code, payload, error_text = fetch_json(api_base, "/api/services/startup-order", run_id=run_id)
    progress = (payload or {}).get("startup_progress", {}) if isinstance(payload, dict) else {}
    completed = int(progress.get("completed_services", 0))
    total = int(progress.get("total_services", 0))
    traffic_gates = (payload or {}).get("traffic_gate_services", []) if isinstance(payload, dict) else []
    startup_order = (payload or {}).get("startup_order", []) if isinstance(payload, dict) else []
    order_services = {
        str(item.get("name")): item
        for item in startup_order
        if isinstance(item, dict) and item.get("name")
    }
    gate_details_present = bool(traffic_gates) and all(name in order_services for name in traffic_gates)
    gate_metadata_ready = gate_details_present and all(
        bool(order_services[name].get("gates_accepting_traffic")) for name in traffic_gates
    )
    fallback_gate_completion = (
        bool(traffic_gates)
        and total > 0
        and completed >= min(len(traffic_gates), total)
    )
    ready = status_code == 200 and (gate_metadata_ready or fallback_gate_completion)
    return {
        "status": "PASS" if ready else "BLOCKED",
        "reason": (
            "Startup-order diagnostics report traffic-gate services ready for qualification."
            if ready
            else f"Startup-order diagnostics do not yet prove traffic-gate readiness (status={status_code}, completed={completed}, total={total})."
        ),
        "http_status": status_code,
        "traffic_gate_services": traffic_gates,
        "startup_progress": progress,
        "payload": payload,
        "error": error_text,
    }


def check_service(api_base: str, run_id: str, service_name: str) -> dict[str, Any]:
    status_code, payload, error_text = fetch_json(api_base, f"/api/services/status/{service_name}", run_id=run_id)
    healthy = None
    if isinstance(payload, dict):
        health = payload.get("health", {})
        if isinstance(health, dict):
            healthy = health.get("healthy")
    service_ready = (
        status_code == 200
        and isinstance(payload, dict)
        and payload.get("state") == "running"
        and healthy is not False
    )
    return {
        "status": "PASS" if service_ready else "BLOCKED",
        "reason": (
            f"Service {service_name} is running."
            if service_ready
            else f"Service {service_name} is not ready for qualification traffic (status={status_code})."
        ),
        "http_status": status_code,
        "payload": payload,
        "error": error_text,
    }


def check_route(api_base: str, run_id: str, path: str, *, expected_field: str | None = None) -> dict[str, Any]:
    status_code, payload, error_text = fetch_json(api_base, path, run_id=run_id)
    passed = status_code == 200 and (expected_field is None or expected_field in (payload or {}))
    return {
        "status": "PASS" if passed else "BLOCKED",
        "reason": (
            f"Route {path} responded successfully."
            if passed
            else f"Route {path} is not ready for qualification (status={status_code})."
        ),
        "http_status": status_code,
        "payload": payload,
        "error": error_text,
    }


def warm_runtime_routes(
    api_base: str,
    run_id: str,
    *,
    chain_inventory_payload: dict[str, Any] | None,
    plugin_discovery_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    warmup_ok = True

    def _record_attempt(
        *,
        name: str,
        method: str,
        path: str,
        status_code: int,
        ok: bool,
        error_text: str | None = None,
        detail: str | None = None,
    ) -> None:
        attempts.append(
            {
                "name": name,
                "method": method,
                "path": path,
                "http_status": status_code,
                "ok": ok,
                "error": error_text,
                "detail": detail,
            }
        )

    def _record_skip(*, name: str, detail: str) -> None:
        attempts.append(
            {
                "name": name,
                "method": "SKIP",
                "path": "",
                "http_status": 0,
                "ok": True,
                "error": None,
                "detail": detail,
            }
        )

    def _warm_get(name: str, path: str, *, expected_field: str | None = None) -> None:
        nonlocal warmup_ok
        status_code, payload, error_text = fetch_json(api_base, path, run_id=run_id)
        ok = status_code == 200 and (expected_field is None or expected_field in (payload or {}))
        _record_attempt(
            name=name,
            method="GET",
            path=path,
            status_code=status_code,
            ok=ok,
            error_text=error_text,
        )
        warmup_ok = warmup_ok and ok

    def _warm_post(
        name: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        success_statuses: set[str] | None = None,
    ) -> dict[str, Any] | None:
        nonlocal warmup_ok
        status_code, response_payload, error_text = request_json(
            api_base,
            path,
            run_id=run_id,
            method="POST",
            payload=payload,
        )
        ok = status_code == 200
        if ok and success_statuses is not None:
            ok = isinstance(response_payload, dict) and str(response_payload.get("status")) in success_statuses
        _record_attempt(
            name=name,
            method="POST",
            path=path,
            status_code=status_code,
            ok=ok,
            error_text=error_text,
        )
        warmup_ok = warmup_ok and ok
        return response_payload

    _warm_get("audio_status_route", "/api/audio/status", expected_field="running")
    _warm_get("audio_latency_route", "/api/audio/latency", expected_field="latency_ms")
    _warm_get("audio_levels_route", "/api/audio/levels", expected_field="input_left")
    _warm_get("plugin_list_route", "/api/plugins/list", expected_field="loaded")

    chains = (chain_inventory_payload or {}).get("chains", [])
    chain_id = None
    if isinstance(chains, list):
        for chain in chains:
            if isinstance(chain, dict) and chain.get("id") is not None:
                chain_id = int(chain["id"])
                break

    if chain_id is None:
        _record_skip(name="chain_runtime_routes", detail="No chain inventory entries available for detail/toggle warmup.")
    else:
        _warm_get("chain_detail_route", f"/api/chains/{chain_id}", expected_field="id")
        _warm_post(
            "chain_activate_route",
            f"/api/chains/{chain_id}/activate",
            success_statuses={"activated", "activate_throttled"},
        )
        time.sleep(0.5)
        _warm_post(
            "chain_deactivate_route",
            f"/api/chains/{chain_id}/deactivate",
            success_statuses={"deactivated", "deactivate_throttled"},
        )

    plugin_list_status, plugin_list_payload, plugin_list_error = fetch_json(api_base, "/api/plugins/list", run_id=run_id)
    if plugin_list_status != 200 or not isinstance(plugin_list_payload, dict):
        _record_attempt(
            name="plugin_batch_route",
            method="GET",
            path="/api/plugins/list",
            status_code=plugin_list_status,
            ok=False,
            error_text=plugin_list_error,
            detail="Failed to fetch loaded-plugin inventory for batch-parameter warmup.",
        )
        warmup_ok = False
    else:
        loaded_entries = plugin_list_payload.get("loaded", [])
        discovery_lookup = {
            str(plugin.get("uri")): plugin
            for plugin in (plugin_discovery_payload or {}).get("plugins", [])
            if isinstance(plugin, dict) and plugin.get("uri")
        }
        warmup_payload = None
        if isinstance(loaded_entries, list):
            for entry in loaded_entries:
                if not isinstance(entry, dict):
                    continue
                plugin_uri = entry.get("uri")
                plugin_info = discovery_lookup.get(str(plugin_uri))
                parameters = plugin_info.get("parameters", []) if isinstance(plugin_info, dict) else []
                if not plugin_uri or not isinstance(parameters, list) or not parameters:
                    continue
                first_param = parameters[0] if isinstance(parameters[0], dict) else {}
                try:
                    param_index = int(first_param.get("index", 0))
                except Exception:
                    param_index = 0
                try:
                    value = float(first_param.get("default", first_param.get("min", 0.0)))
                except Exception:
                    value = 0.0
                warmup_payload = {
                    "updates": [
                        {
                            "plugin_uri": str(plugin_uri),
                            "param_index": param_index,
                            "value": value,
                        }
                    ]
                }
                break

        if warmup_payload is None:
            _record_skip(
                name="plugin_batch_route",
                detail="No loaded plugin with discoverable parameters was available for batch warmup.",
            )
        else:
            response_payload = _warm_post(
                "plugin_batch_route",
                "/api/plugins/batch/parameters",
                payload=warmup_payload,
                success_statuses={"batch_complete"},
            )
            if isinstance(response_payload, dict) and int(response_payload.get("errors", 0)) > 0:
                warmup_ok = False
                attempts[-1]["ok"] = False
                attempts[-1]["detail"] = f"Batch warmup returned {response_payload.get('errors')} error(s)."

    return {
        "status": "PASS" if warmup_ok else "BLOCKED",
        "reason": (
            "Runtime hot paths warmed successfully before timed qualification."
            if warmup_ok
            else "One or more runtime warmup probes failed; timed load was not started."
        ),
        "attempts": attempts,
    }


def run_load_command(command: str, output_dir: Path) -> dict[str, Any]:
    stdout_path = output_dir / "load.stdout.txt"
    stderr_path = output_dir / "load.stderr.txt"
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
        "status": "PASS" if proc.returncode == 0 else "FAIL",
        "reason": (
            "Load command completed successfully."
            if proc.returncode == 0
            else f"Load command exited with code {proc.returncode}."
        ),
        "command": command,
        "returncode": int(proc.returncode),
        "stdout_artifact": str(stdout_path),
        "stderr_artifact": str(stderr_path),
    }


def build_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# T209 API Load Qualification Preflight",
        "",
        f"- Timestamp: `{summary['timestamp']}`",
        f"- Run ID: `{summary['run_id']}`",
        f"- API base: `{summary['api_base']}`",
        f"- Overall status: `{summary['overall_status']}`",
        "",
        "## Checks",
        "",
    ]
    for name, gate in summary["checks"].items():
        lines.append(f"- `{name}`: `{gate['status']}` - {gate['reason']}")
    if summary.get("load_command"):
        lines.extend(
            [
                "",
                "## Load Command",
                "",
                f"- Executed: `{summary['load_command']['executed']}`",
                f"- Status: `{summary['load_command']['status']}`",
                f"- Reason: {summary['load_command']['reason']}",
            ]
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    checks = {
        "open_file_limit": check_open_file_limit(args.min_open_files),
        "api_ready": check_ready(args.api_base, args.run_id),
        "startup_order": check_startup_order(args.api_base, args.run_id),
        "websocket_manager": check_service(args.api_base, args.run_id, "websocket_manager"),
        "chain_inventory_route": check_route(args.api_base, args.run_id, "/api/chains/", expected_field="chains"),
        "plugin_discovery_route": check_route(
            args.api_base,
            args.run_id,
            "/api/plugins/discover",
            expected_field="plugins",
        ),
    }

    if args.run_load_command and args.load_command.strip() and all(gate["status"] == "PASS" for gate in checks.values()):
        checks["runtime_route_warmup"] = warm_runtime_routes(
            args.api_base,
            args.run_id,
            chain_inventory_payload=checks["chain_inventory_route"].get("payload"),
            plugin_discovery_payload=checks["plugin_discovery_route"].get("payload"),
        )

    overall_status = "PASS" if all(gate["status"] == "PASS" for gate in checks.values()) else "BLOCKED"
    load_result = {
        "executed": False,
        "status": "SKIPPED",
        "reason": "No load command requested.",
    }
    if args.run_load_command and args.load_command.strip():
        if overall_status == "PASS":
            load_result = {"executed": True, **run_load_command(args.load_command, output_dir)}
            if load_result["status"] != "PASS":
                overall_status = "FAIL"
        else:
            load_result = {
                "executed": False,
                "status": "SKIPPED",
                "reason": "Preflight blocked load execution.",
                "command": args.load_command,
            }

    summary = {
        "task_id": "T209-subE",
        "timestamp": utc_now(),
        "run_id": args.run_id,
        "api_base": args.api_base,
        "overall_status": overall_status,
        "checks": checks,
        "load_command": load_result,
    }

    write_text(output_dir / "t209-api-load-preflight.json", json.dumps(summary, indent=2))
    write_text(output_dir / "T209_API_LOAD_PREFLIGHT.md", build_markdown(summary))

    print(json.dumps(summary, indent=2))
    return 0 if overall_status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
