#!/usr/bin/env python3
"""Run the T076 manual-package Tesira deployment HIL bundle."""

from __future__ import annotations

import argparse
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T076 manual-package deployment HIL bundle.")
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8080/api",
        help="MAP2 API base (default: http://127.0.0.1:8080/api)",
    )
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for JSON, markdown, and downloaded package artifacts.")
    parser.add_argument("--layout-id", required=True, help="Tesira layout ID to qualify.")
    parser.add_argument("--layout-version", default="1.0.0", help="Tesira layout version to qualify.")
    parser.add_argument(
        "--device-ids",
        default="",
        help="Optional comma-separated Tesira device IDs to target. Default uses all visible Tesira devices.",
    )
    parser.add_argument(
        "--min-connected-devices",
        type=int,
        default=1,
        help="Minimum connected Tesira devices required for the certification run.",
    )
    parser.add_argument(
        "--min-active-streams",
        type=int,
        default=0,
        help="Minimum active AVB streams required across the selected devices after manual upload.",
    )
    parser.add_argument(
        "--accepted-ptp-states",
        default="MASTER,SLAVE",
        help="Comma-separated PTP states treated as locked after manual upload.",
    )
    parser.add_argument(
        "--manual-upload-confirmed",
        action="store_true",
        help="Confirm that the operator has already uploaded/deployed the package in SageVue and wants post-upload verification.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_csv(raw: str) -> list[str]:
    return [token.strip() for token in str(raw).split(",") if token.strip()]


def safe_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value).strip())
    cleaned = cleaned.strip("._")
    return cleaned or fallback


def http_request(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 15.0) -> bytes:
    data = None
    headers = {"Accept": "application/json, application/zip"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return response.read()
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}: {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Request failed for {url}: {exc.reason}") from exc


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 15.0) -> Any:
    body = http_request(method, url, payload=payload, timeout=timeout)
    if not body.strip():
        return {}
    return json.loads(body.decode("utf-8"))


def normalize_state(raw: Any) -> str:
    return str(raw or "").strip().upper()


def is_stream_active(stream: dict[str, Any]) -> bool:
    state_keys = ("active", "is_active", "connected", "streaming")
    for key in state_keys:
        if key in stream:
            return bool(stream.get(key))

    state = normalize_state(stream.get("state") or stream.get("status") or stream.get("connection_status"))
    if state:
        return state in {"ACTIVE", "CONNECTED", "STREAMING", "RUNNING"}
    return True


def build_manual_package_url(api_base: str, layout_id: str, layout_version: str, device_id: str) -> str:
    query = parse.urlencode({"version": layout_version, "device_id": device_id})
    return f"{api_base.rstrip('/')}/tesira/layouts/{parse.quote(layout_id, safe='')}/manual-package?{query}"


def inspect_package(package_bytes: bytes, *, layout_id: str, layout_version: str) -> dict[str, Any]:
    safe_layout = safe_name(layout_id, "layout")
    safe_version = safe_name(layout_version, "1.0.0")
    expected_manifest = f"{safe_layout}_{safe_version}.manifest.json"
    expected_tmf = f"{safe_layout}_{safe_version}.tmf"

    with zipfile.ZipFile(io.BytesIO(package_bytes), "r") as zf:
        names = sorted(zf.namelist())
        manifest = {}
        if expected_manifest in names:
            manifest = json.loads(zf.read(expected_manifest).decode("utf-8"))
        has_tmf = expected_tmf in names
        has_missing_tmf_note = "MISSING_TMF.txt" in names
        return {
            "zip_entries": names,
            "manifest_name": expected_manifest,
            "tmf_name": expected_tmf,
            "readme_present": "README_UPLOAD_TO_SAGEVUE.md" in names,
            "manifest_present": expected_manifest in names,
            "tmf_present": has_tmf,
            "missing_tmf_note_present": has_missing_tmf_note,
            "manifest": manifest,
        }


def filter_selected_devices(devices: list[dict[str, Any]], explicit_device_ids: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    if not explicit_device_ids:
        return devices, []
    selected = [row for row in devices if str(row.get("device_id", "")).strip() in explicit_device_ids]
    found = {str(row.get("device_id", "")).strip() for row in selected}
    missing = [device_id for device_id in explicit_device_ids if device_id not in found]
    return selected, missing


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T076 Manual Deployment HIL Bundle ({summary['captured_at']})")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Layout: `{summary['layout_id']}` v`{summary['layout_version']}`")
    lines.append(f"- Selected devices: `{len(summary['selected_devices'])}`")
    lines.append(f"- Manual upload confirmed: `{summary['settings']['manual_upload_confirmed']}`")
    lines.append(f"- Overall status: `{summary['overall_status']}`")
    lines.append("")
    lines.append("## Gates")
    lines.append("")
    lines.append("| Gate | Status | Reason |")
    lines.append("|---|---|---|")
    for gate_name, gate in summary["gates"].items():
        lines.append(f"| {gate_name} | {gate['status']} | {gate['reason']} |")
    lines.append("")
    if summary["packages"]:
        lines.append("## Manual Package Checks")
        lines.append("")
        lines.append("| Device | README | Manifest | TMF | Artifact |")
        lines.append("|---|---|---|---|---|")
        for pkg in summary["packages"]:
            lines.append(
                f"| {pkg['device_id']} | {pkg['readme_present']} | {pkg['manifest_present']} | "
                f"{pkg['tmf_present']} | `{pkg['artifact_path']}` |"
            )
        lines.append("")
    if summary["device_details"]:
        lines.append("## Post-Upload Device State")
        lines.append("")
        lines.append("| Device | Connected | AVB streams | PTP state | Faults |")
        lines.append("|---|---|---:|---|---:|")
        for row in summary["device_details"]:
            lines.append(
                f"| {row['device_id']} | {row['connected']} | {row['active_stream_count']} | "
                f"{row['ptp_state']} | {row['fault_count']} |"
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
    packages_dir = output_dir / "packages"
    packages_dir.mkdir(parents=True, exist_ok=True)

    api_base = args.api_base.rstrip("/")
    accepted_ptp_states = {normalize_state(token) for token in parse_csv(args.accepted_ptp_states)}
    explicit_device_ids = parse_csv(args.device_ids)

    sagevue_status = http_json("GET", f"{api_base}/tesira/sagevue/status")
    layout_query = parse.urlencode({"version": args.layout_version})
    layout = http_json("GET", f"{api_base}/tesira/layouts/{parse.quote(args.layout_id, safe='')}?{layout_query}")
    devices_payload = http_json("GET", f"{api_base}/tesira/devices")
    if not isinstance(sagevue_status, dict) or not isinstance(layout, dict):
        raise RuntimeError("Unexpected Tesira layout/SageVue payload")
    if not isinstance(devices_payload, list):
        raise RuntimeError("Expected /tesira/devices to return a JSON list")
    devices = [row for row in devices_payload if isinstance(row, dict)]
    selected_devices, missing_device_ids = filter_selected_devices(devices, explicit_device_ids)

    summary: dict[str, Any] = {
        "task_id": "T076",
        "captured_at": utc_now(),
        "layout_id": args.layout_id,
        "layout_version": args.layout_version,
        "settings": {
            "api_base": api_base,
            "device_ids": explicit_device_ids,
            "min_connected_devices": int(args.min_connected_devices),
            "min_active_streams": int(args.min_active_streams),
            "accepted_ptp_states": sorted(accepted_ptp_states),
            "manual_upload_confirmed": bool(args.manual_upload_confirmed),
        },
        "sagevue_status": sagevue_status,
        "layout": layout,
        "selected_devices": selected_devices,
        "missing_device_ids": missing_device_ids,
        "packages": [],
        "device_details": [],
        "gates": {
            "manual_upload_mode_ready": {"status": "BLOCKED", "reason": ""},
            "layout_catalog_ready": {"status": "BLOCKED", "reason": ""},
            "target_devices_ready": {"status": "BLOCKED", "reason": ""},
            "manual_package_ready": {"status": "BLOCKED", "reason": ""},
            "manual_upload_execution": {"status": "BLOCKED", "reason": ""},
            "post_upload_verification": {"status": "BLOCKED", "reason": ""},
        },
        "overall_status": "BLOCKED",
        "conclusion": "",
    }

    if bool(sagevue_status.get("manual_upload_required")):
        summary["gates"]["manual_upload_mode_ready"] = {
            "status": "PASS",
            "reason": "Backend reports manual SageVue upload as the supported deployment workflow.",
        }
    else:
        summary["gates"]["manual_upload_mode_ready"] = {
            "status": "BLOCKED",
            "reason": "Backend is not advertising manual-upload mode; current T076 workflow assumptions are stale.",
        }

    if layout.get("layout_id") == args.layout_id:
        summary["gates"]["layout_catalog_ready"] = {
            "status": "PASS",
            "reason": f"Layout {args.layout_id} v{args.layout_version} is present in the catalog.",
        }
    else:
        summary["gates"]["layout_catalog_ready"] = {
            "status": "BLOCKED",
            "reason": f"Layout {args.layout_id} v{args.layout_version} is missing from the catalog.",
        }

    connected_selected = sum(1 for row in selected_devices if bool(row.get("connected")))
    if missing_device_ids:
        summary["gates"]["target_devices_ready"] = {
            "status": "BLOCKED",
            "reason": f"Requested Tesira devices not found: {', '.join(missing_device_ids)}.",
        }
    elif connected_selected < int(args.min_connected_devices):
        summary["gates"]["target_devices_ready"] = {
            "status": "BLOCKED",
            "reason": (
                f"Need at least {int(args.min_connected_devices)} connected Tesira devices; "
                f"found {connected_selected}."
            ),
        }
    else:
        summary["gates"]["target_devices_ready"] = {
            "status": "PASS",
            "reason": f"{connected_selected} target Tesira device(s) connected and ready for package download/upload.",
        }

    package_failures: list[str] = []
    if summary["gates"]["layout_catalog_ready"]["status"] == "PASS" and summary["gates"]["target_devices_ready"]["status"] == "PASS":
        for device in selected_devices:
            device_id = str(device.get("device_id", "")).strip()
            package_url = build_manual_package_url(api_base, args.layout_id, args.layout_version, device_id)
            package_bytes = http_request("GET", package_url, timeout=30.0)
            artifact_name = f"{safe_name(args.layout_id, 'layout')}_{safe_name(args.layout_version, '1.0.0')}_{safe_name(device_id, 'device')}.zip"
            artifact_path = packages_dir / artifact_name
            artifact_path.write_bytes(package_bytes)
            package_summary = inspect_package(package_bytes, layout_id=args.layout_id, layout_version=args.layout_version)
            package_summary["device_id"] = device_id
            package_summary["artifact_path"] = str(artifact_path.relative_to(output_dir))
            summary["packages"].append(package_summary)

            manifest_target = str((package_summary.get("manifest") or {}).get("target_device_id") or "").strip()
            if not package_summary["readme_present"]:
                package_failures.append(f"{device_id}: README missing")
            if not package_summary["manifest_present"]:
                package_failures.append(f"{device_id}: manifest missing")
            if not package_summary["tmf_present"]:
                package_failures.append(f"{device_id}: TMF missing")
            if manifest_target and manifest_target != device_id:
                package_failures.append(f"{device_id}: manifest target_device_id mismatch ({manifest_target})")

    if package_failures:
        summary["gates"]["manual_package_ready"] = {
            "status": "BLOCKED",
            "reason": "; ".join(package_failures),
        }
    elif summary["packages"]:
        summary["gates"]["manual_package_ready"] = {
            "status": "PASS",
            "reason": f"Manual SageVue package downloaded and verified for {len(summary['packages'])} device(s).",
        }
    else:
        summary["gates"]["manual_package_ready"] = {
            "status": "BLOCKED",
            "reason": "Package verification did not run because layout/device preflight was not ready.",
        }

    if not args.manual_upload_confirmed:
        summary["gates"]["manual_upload_execution"] = {
            "status": "BLOCKED",
            "reason": "Manual SageVue upload/deploy has not been confirmed yet; rerun with --manual-upload-confirmed after the lab step.",
        }
        summary["gates"]["post_upload_verification"] = {
            "status": "BLOCKED",
            "reason": "Post-upload verification is skipped until manual upload is confirmed.",
        }
    else:
        summary["gates"]["manual_upload_execution"] = {
            "status": "PASS",
            "reason": "Operator confirmed the manual SageVue upload/deploy step.",
        }
        detail_failures: list[str] = []
        total_active_streams = 0
        for device in selected_devices:
            device_id = str(device.get("device_id", "")).strip()
            detail = http_json("GET", f"{api_base}/tesira/devices/{parse.quote(device_id, safe='')}")
            if not isinstance(detail, dict):
                raise RuntimeError(f"Expected device detail object for {device_id}")
            streams = detail.get("avb_streams", [])
            stream_list = [row for row in streams if isinstance(row, dict)] if isinstance(streams, list) else []
            active_stream_count = sum(1 for row in stream_list if is_stream_active(row))
            total_active_streams += active_stream_count
            ptp_status = detail.get("ptp_status", {}) if isinstance(detail.get("ptp_status"), dict) else {}
            ptp_state = normalize_state(ptp_status.get("state") or detail.get("ptp_state"))
            detail_row = {
                "device_id": device_id,
                "connected": bool(detail.get("connected")),
                "active_stream_count": active_stream_count,
                "ptp_state": ptp_state,
                "fault_count": len(detail.get("faults", [])) if isinstance(detail.get("faults"), list) else int(detail.get("fault_count") or 0),
            }
            summary["device_details"].append(detail_row)

            if not detail_row["connected"]:
                detail_failures.append(f"{device_id}: device is not connected after manual upload")
            if accepted_ptp_states and ptp_state not in accepted_ptp_states:
                detail_failures.append(f"{device_id}: PTP state {ptp_state or 'UNKNOWN'} is not in {sorted(accepted_ptp_states)}")

        if total_active_streams < int(args.min_active_streams):
            detail_failures.append(
                f"Need at least {int(args.min_active_streams)} active AVB stream(s) after manual upload; found {total_active_streams}."
            )

        if detail_failures:
            summary["gates"]["post_upload_verification"] = {
                "status": "BLOCKED",
                "reason": "; ".join(detail_failures),
            }
        else:
            summary["gates"]["post_upload_verification"] = {
                "status": "PASS",
                "reason": "Selected devices stayed connected and satisfied the post-upload AVB/PTP verification gates.",
            }

    gate_statuses = {gate["status"] for gate in summary["gates"].values()}
    if gate_statuses == {"PASS"}:
        summary["overall_status"] = "PASS"
        summary["conclusion"] = "Pass: the current manual SageVue deployment workflow is ready/evidenced for T076."
        return 0, summary

    summary["overall_status"] = "BLOCKED"
    if (
        summary["gates"]["manual_upload_mode_ready"]["status"] == "PASS"
        and summary["gates"]["layout_catalog_ready"]["status"] == "PASS"
        and summary["gates"]["target_devices_ready"]["status"] == "PASS"
        and summary["gates"]["manual_package_ready"]["status"] == "PASS"
        and not args.manual_upload_confirmed
    ):
        summary["conclusion"] = "Blocked: preflight is ready, but the operator must complete the manual SageVue upload and rerun post-upload verification."
    else:
        summary["conclusion"] = "Blocked: T076 manual-package preflight or post-upload verification is still missing required evidence."
    return 2, summary


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)
    json_path = args.output_dir / "t076-manual-deploy-hil-summary.json"
    markdown_path = args.output_dir / "t076-manual-deploy-hil-summary.md"
    json_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(summary) + "\n", encoding="utf-8")
    print(summary["conclusion"])
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
