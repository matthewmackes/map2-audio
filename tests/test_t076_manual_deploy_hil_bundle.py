from __future__ import annotations

import io
import json
import subprocess
import sys
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t076_manual_deploy_hil_bundle.py"


def _build_package(layout_id: str, version: str, device_id: str, *, include_tmf: bool) -> bytes:
    safe_layout = layout_id
    safe_version = version
    manifest_name = f"{safe_layout}_{safe_version}.manifest.json"
    tmf_name = f"{safe_layout}_{safe_version}.tmf"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README_UPLOAD_TO_SAGEVUE.md", "steps")
        zf.writestr(
            manifest_name,
            json.dumps({"layout_id": layout_id, "version": version, "target_device_id": device_id}),
        )
        if include_tmf:
            zf.writestr(tmf_name, b"tmf")
        else:
            zf.writestr("MISSING_TMF.txt", "missing")
    return buffer.getvalue()


class _FixtureServer:
    def __init__(self, payloads: dict[str, object], package_bytes_by_device: dict[str, bytes]) -> None:
        self.payloads = payloads
        self.package_bytes_by_device = package_bytes_by_device
        self.server = HTTPServer(("127.0.0.1", 0), self._make_handler())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def _write_json(self, status: int, payload: object) -> None:
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def _write_zip(self, status: int, payload: bytes) -> None:
                self.send_response(status)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path == "/api/tesira/sagevue/status":
                    self._write_json(200, outer.payloads["sagevue_status"])
                    return
                if parsed.path == "/api/tesira/devices":
                    self._write_json(200, outer.payloads["devices"])
                    return
                if parsed.path == "/api/tesira/layouts/forte_ci_default":
                    self._write_json(200, outer.payloads["layout"])
                    return
                if parsed.path == "/api/tesira/layouts/forte_ci_default/manual-package":
                    device_id = parse_qs(parsed.query).get("device_id", [""])[0]
                    self._write_zip(200, outer.package_bytes_by_device[device_id])
                    return
                if parsed.path.startswith("/api/tesira/devices/"):
                    device_id = parsed.path.split("/")[4]
                    detail = outer.payloads.get("details", {}).get(device_id)
                    if detail is not None:
                        self._write_json(200, detail)
                        return
                self._write_json(404, {"error": "not found"})

            def log_message(self, format: str, *args) -> None:  # noqa: A003
                return

        return Handler

    @property
    def api_base(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}/api"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def test_t076_bundle_blocks_until_manual_upload_is_confirmed(tmp_path: Path) -> None:
    server = _FixtureServer(
        {
            "sagevue_status": {"enabled": False, "manual_upload_required": True},
            "layout": {"layout_id": "forte_ci_default", "version": "1.0.0"},
            "devices": [{"device_id": "tesira_a", "connected": True}],
            "details": {},
        },
        {"tesira_a": _build_package("forte_ci_default", "1.0.0", "tesira_a", include_tmf=True)},
    )
    server.start()
    try:
        output_dir = tmp_path / "blocked"
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--api-base",
                server.api_base,
                "--output-dir",
                str(output_dir),
                "--layout-id",
                "forte_ci_default",
                "--layout-version",
                "1.0.0",
                "--device-ids",
                "tesira_a",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 2, proc.stderr
        summary = json.loads((output_dir / "t076-manual-deploy-hil-summary.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "BLOCKED"
        assert summary["gates"]["manual_package_ready"]["status"] == "PASS"
        assert summary["gates"]["manual_upload_execution"]["status"] == "BLOCKED"
    finally:
        server.stop()


def test_t076_bundle_passes_after_manual_upload_confirmation(tmp_path: Path) -> None:
    server = _FixtureServer(
        {
            "sagevue_status": {"enabled": False, "manual_upload_required": True},
            "layout": {"layout_id": "forte_ci_default", "version": "1.0.0"},
            "devices": [
                {"device_id": "tesira_a", "connected": True},
                {"device_id": "tesira_b", "connected": True},
            ],
            "details": {
                "tesira_a": {
                    "device_id": "tesira_a",
                    "connected": True,
                    "avb_streams": [{"stream_id": "stream_a"}],
                    "ptp_status": {"state": "MASTER"},
                    "faults": [],
                },
                "tesira_b": {
                    "device_id": "tesira_b",
                    "connected": True,
                    "avb_streams": [{"stream_id": "stream_b"}],
                    "ptp_status": {"state": "SLAVE"},
                    "faults": [],
                },
            },
        },
        {
            "tesira_a": _build_package("forte_ci_default", "1.0.0", "tesira_a", include_tmf=True),
            "tesira_b": _build_package("forte_ci_default", "1.0.0", "tesira_b", include_tmf=True),
        },
    )
    server.start()
    try:
        output_dir = tmp_path / "pass"
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--api-base",
                server.api_base,
                "--output-dir",
                str(output_dir),
                "--layout-id",
                "forte_ci_default",
                "--layout-version",
                "1.0.0",
                "--device-ids",
                "tesira_a,tesira_b",
                "--min-connected-devices",
                "2",
                "--min-active-streams",
                "1",
                "--manual-upload-confirmed",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0, proc.stderr
        summary = json.loads((output_dir / "t076-manual-deploy-hil-summary.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "PASS"
        assert all(gate["status"] == "PASS" for gate in summary["gates"].values())
        assert len(summary["packages"]) == 2
        assert (output_dir / "packages" / "forte_ci_default_1.0.0_tesira_a.zip").exists()
        markdown = (output_dir / "t076-manual-deploy-hil-summary.md").read_text(encoding="utf-8")
        assert "Pass: the current manual SageVue deployment workflow is ready" in markdown
    finally:
        server.stop()
