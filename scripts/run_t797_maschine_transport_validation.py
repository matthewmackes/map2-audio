#!/usr/bin/env python3
"""Run live Maschine MK1 transport validation and record the results."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.services.maschine.transport import PyUsbBulkMaschineTransport, probe_sysfs_usb_device


def _sanitize_bytes(payload: bytes | None, *, preview_bytes: int = 64) -> dict[str, Any]:
    if payload is None:
        return {
            "received": False,
            "length": 0,
            "preview_hex": "",
        }
    preview = bytes(payload[:preview_bytes])
    return {
        "received": True,
        "length": len(payload),
        "preview_hex": preview.hex(),
    }


def _render_markdown(report: dict[str, Any]) -> str:
    pre_probe = report.get("pre_probe") or {}
    connect_info = report.get("connect_info") or {}
    read_report = report.get("read_report") or {}
    device_node = ((pre_probe.get("device_node") or {}) if isinstance(pre_probe, dict) else {}) or {}
    preferred = ((pre_probe.get("preferred_bulk_pair") or {}) if isinstance(pre_probe, dict) else {}) or {}
    device_visible = bool(pre_probe.get("interfaces")) if isinstance(pre_probe, dict) else None

    lines = [
        "# Maschine MK1 Transport Validation",
        "",
        f"- Status: `{report.get('status')}`",
        f"- Timestamp (UTC): `{report.get('captured_at_utc')}`",
        f"- User: `{report.get('user')}`",
        f"- Device visible: `{device_visible}`",
        f"- Device node: `{device_node.get('path')}`",
        f"- Device access: `{device_node.get('current_user_can_access')}` (`{device_node.get('mode_octal')}` `{device_node.get('owner_name')}:{device_node.get('group_name')}`)",
        f"- Preferred path: alt `{preferred.get('alternate_setting')}` OUT `{preferred.get('write_endpoint_address_hex')}` IN `{preferred.get('read_endpoint_address_hex')}`",
        f"- Connected: `{report.get('connected')}`",
        f"- Kernel detach allowed: `{report.get('allow_kernel_detach')}`",
        f"- Kernel driver active at connect: `{connect_info.get('kernel_driver_active')}`",
        f"- Read received: `{read_report.get('received')}` length `{read_report.get('length')}`",
        "",
        "## Notes",
        "",
        f"- Probe note: {pre_probe.get('note') or connect_info.get('note')}",
        f"- Connect note: {connect_info.get('note')}",
        f"- Read preview hex: `{read_report.get('preview_hex')}`",
        "",
        "## Repo-Owned Host Policy",
        "",
        "- Install `config/udev/90-map2-maschine-mk1.rules` into `/etc/udev/rules.d/`.",
        "- Reload udev and retrigger the USB device so `/dev/bus/usb/*/*` becomes `0660 root:audio`.",
        "- Enable the runtime transport policy with `allow_kernel_detach=true` and `transport_preference=pyusb-bulk` or `auto`.",
    ]
    return "\n".join(lines) + "\n"


def run_validation(*, vendor_id: int, product_id: int, max_length: int, timeout_ms: int) -> dict[str, Any]:
    pre_probe = probe_sysfs_usb_device(vendor_id, product_id)
    transport = PyUsbBulkMaschineTransport(
        vendor_id=vendor_id,
        product_id=product_id,
        allow_kernel_detach=True,
    )
    connect_info: dict[str, Any] = {}
    connected = False
    payload: bytes | None = None
    try:
        connected, connect_info = transport.connect()
        if connected:
            payload = transport.read_report(max_length=max_length, timeout_ms=timeout_ms)
    finally:
        transport.disconnect()
    post_probe = probe_sysfs_usb_device(vendor_id, product_id)
    return {
        "status": "pass" if connected and payload is not None else "fail",
        "captured_at_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "user": {
            "uid": pre_probe.get("device_node", {}).get("current_uid"),
            "gid": pre_probe.get("device_node", {}).get("current_gid"),
        },
        "vendor_id": f"{vendor_id:04x}",
        "product_id": f"{product_id:04x}",
        "allow_kernel_detach": True,
        "connected": connected,
        "disconnect_complete": True,
        "pre_probe": pre_probe,
        "connect_info": connect_info,
        "read_report": _sanitize_bytes(payload),
        "post_disconnect_probe": post_probe,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory that will receive JSON and Markdown reports.")
    parser.add_argument("--vendor-id", type=lambda value: int(value, 0), default=0x17CC)
    parser.add_argument("--product-id", type=lambda value: int(value, 0), default=0x0808)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--timeout-ms", type=int, default=50)
    args = parser.parse_args()

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    report = run_validation(
        vendor_id=args.vendor_id,
        product_id=args.product_id,
        max_length=args.max_length,
        timeout_ms=args.timeout_ms,
    )
    json_path = output_dir / "t797-maschine-transport-validation.json"
    markdown_path = output_dir / "T797_MASCHINE_TRANSPORT_VALIDATION.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(_render_markdown(report), encoding="utf-8")
    print(json_path)
    print(markdown_path)
    return 0 if report.get("status") == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
