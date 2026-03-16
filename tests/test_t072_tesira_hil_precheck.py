from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t072_tesira_hil_precheck.py"


class _FixtureServer:
    def __init__(self, payloads: dict[str, object]) -> None:
        self.payloads = payloads
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

            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/api/tesira/devices":
                    self._write_json(200, outer.payloads["tesira_devices"])
                    return
                if self.path == "/api/tesira/fleet/health":
                    self._write_json(200, outer.payloads["tesira_fleet_health"])
                    return
                if self.path == "/api/tesira/fleet/ptp-topology":
                    self._write_json(200, outer.payloads["tesira_ptp_topology"])
                    return
                if self.path == "/api/avb/devices":
                    self._write_json(200, outer.payloads["avb_devices"])
                    return
                if self.path == "/api/avb/streams":
                    self._write_json(200, outer.payloads["avb_streams"])
                    return
                if self.path == "/api/avb/ptp/status":
                    self._write_json(200, outer.payloads["avb_ptp_status"])
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


def test_t072_precheck_blocks_when_avb_prereqs_are_missing(tmp_path: Path) -> None:
    server = _FixtureServer(
        {
            "tesira_devices": [
                {"device_id": "tesira_a", "connected": True, "transport": "telnet", "fault_count": 0, "avb_stream_count": 0, "ptp_state": None},
                {"device_id": "tesira_b", "connected": True, "transport": "telnet", "fault_count": 0, "avb_stream_count": 0, "ptp_state": None},
            ],
            "tesira_fleet_health": {"status": "healthy", "total_devices": 2, "connected_devices": 2, "offline_devices": 0},
            "tesira_ptp_topology": {
                "nodes": [
                    {"device_id": "tesira_a", "ptp_state": "NO_LINK"},
                    {"device_id": "tesira_b", "ptp_state": "LINK_UP"},
                ]
            },
            "avb_devices": {"available": True, "discovered_count": 0, "discovered_devices": []},
            "avb_streams": {"available": True, "streams": []},
            "avb_ptp_status": {"available": True, "state": "INITIALIZING", "grandmaster_id": None},
        }
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
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 2, proc.stderr
        summary = json.loads((output_dir / "t072-hil-precheck.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "BLOCKED"
        assert summary["gates"]["tesira_control_ready"]["status"] == "PASS"
        assert summary["gates"]["avb_discovery_ready"]["status"] == "BLOCKED"
        assert summary["gates"]["avb_stream_ready"]["status"] == "BLOCKED"
        assert summary["gates"]["ptp_lock_ready"]["status"] == "BLOCKED"
    finally:
        server.stop()


def test_t072_precheck_passes_when_prereqs_are_ready(tmp_path: Path) -> None:
    server = _FixtureServer(
        {
            "tesira_devices": [
                {"device_id": "tesira_a", "connected": True, "transport": "telnet", "fault_count": 0, "avb_stream_count": 1, "ptp_state": "MASTER"},
                {"device_id": "tesira_b", "connected": True, "transport": "telnet", "fault_count": 0, "avb_stream_count": 1, "ptp_state": "SLAVE"},
            ],
            "tesira_fleet_health": {"status": "healthy", "total_devices": 2, "connected_devices": 2, "offline_devices": 0},
            "tesira_ptp_topology": {
                "nodes": [
                    {"device_id": "tesira_a", "ptp_state": "MASTER"},
                    {"device_id": "tesira_b", "ptp_state": "SLAVE"},
                ]
            },
            "avb_devices": {
                "available": True,
                "discovered_count": 2,
                "discovered_devices": [{"entity_id": "a"}, {"entity_id": "b"}],
            },
            "avb_streams": {
                "available": True,
                "streams": [
                    {"stream_id": "stream_a", "active": True},
                    {"stream_id": "stream_b", "active": False},
                ],
            },
            "avb_ptp_status": {"available": True, "state": "SLAVE", "grandmaster_id": "gm-1"},
        }
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
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0, proc.stderr
        summary = json.loads((output_dir / "t072-hil-precheck.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "PASS"
        assert summary["avb_streams"]["active_stream_count"] == 1
        assert all(gate["status"] == "PASS" for gate in summary["gates"].values())
        markdown = (output_dir / "t072-hil-precheck.md").read_text(encoding="utf-8")
        assert "Pass: T072 HIL prerequisites are ready" in markdown
    finally:
        server.stop()
