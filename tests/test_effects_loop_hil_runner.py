from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_effects_loops_hil_qualification.py"


class _FixtureServer:
    def __init__(self, payloads: dict) -> None:
        self.payloads = payloads
        self.bypass_calls: list[dict] = []
        self.server = HTTPServer(("127.0.0.1", 0), self._make_handler())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def _write_json(self, status: int, payload: dict) -> None:
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/api/effects-loops":
                    self._write_json(200, outer.payloads["list"])
                    return
                if self.path.startswith("/api/effects-loops/") and self.path.endswith("/metrics"):
                    loop_id = self.path.split("/")[3]
                    self._write_json(200, outer.payloads["metrics"][loop_id])
                    return
                self._write_json(404, {"error": "not found"})

            def do_POST(self) -> None:  # noqa: N802
                content_length = int(self.headers.get("Content-Length", "0") or 0)
                payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
                if self.path.startswith("/api/effects-loops/") and self.path.endswith("/activate"):
                    loop_id = self.path.split("/")[3]
                    self._write_json(200, outer.payloads["activate"][loop_id])
                    return
                if self.path.startswith("/api/effects-loops/") and self.path.endswith("/calibrate"):
                    loop_id = self.path.split("/")[3]
                    self._write_json(200, outer.payloads["calibrate"][loop_id])
                    return
                if self.path.startswith("/api/effects-loops/") and self.path.endswith("/bypass"):
                    loop_id = self.path.split("/")[3]
                    outer.bypass_calls.append({"loop_id": loop_id, "payload": payload})
                    self._write_json(200, {"status": "ok"})
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


def test_effects_loop_hil_runner_blocks_when_topology_is_missing(tmp_path: Path) -> None:
    server = _FixtureServer(
        {
            "list": {"loops": [], "count": 0},
            "activate": {},
            "calibrate": {},
            "metrics": {},
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
                "--churn-cycles",
                "2",
                "--sleep-seconds",
                "0",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 2, proc.stderr
        summary = json.loads((output_dir / "t030-hil-summary.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "BLOCKED"
        assert summary["effects_loops"]["loop_count"] == 0
        assert summary["gates"]["minimum_loop_topology_ready"]["status"] == "BLOCKED"
    finally:
        server.stop()


def test_effects_loop_hil_runner_passes_with_eight_loop_fixture(tmp_path: Path) -> None:
    loops = []
    activate = {}
    calibrate = {}
    metrics = {}
    for index in range(8):
        loop_id = f"loop_{index}"
        loops.append(
            {
                "loop_id": loop_id,
                "name": f"Loop {index}",
                "state_actual": "inactive",
                "health_status": "healthy",
                "send_endpoint_id": f"send_{index}",
                "return_endpoint_id": f"return_{index}",
            }
        )
        activate[loop_id] = {"success": True, "state": "active"}
        calibrate[loop_id] = {
            "success": True,
            "calibration_status": "calibrated",
            "engine_calibration": True,
            "measured_added_latency_ms": 0.22,
            "compensation_samples": 11,
        }
        metrics[loop_id] = {
            "loop_id": loop_id,
            "measured_added_latency_ms": 0.22,
            "compensation_samples": 11,
            "health_status": "healthy",
        }

    server = _FixtureServer(
        {
            "list": {"loops": loops, "count": len(loops)},
            "activate": activate,
            "calibrate": calibrate,
            "metrics": metrics,
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
                "--churn-cycles",
                "2",
                "--sleep-seconds",
                "0",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0, proc.stderr
        summary = json.loads((output_dir / "t030-hil-summary.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "PASS"
        assert summary["gates"]["latency_gate"]["status"] == "PASS"
        assert summary["gates"]["churn_soak_gate"]["status"] == "PASS"
        assert summary["effects_loops"]["selected_loop_count"] == 8
        assert summary["effects_loops"]["latency_samples_present"] == 8
        assert summary["churn"]["successful_operations"] == 16
        assert len(server.bypass_calls) == 16
        markdown = (output_dir / "T030_EFFECTS_LOOPS_HIL_SUMMARY.md").read_text(encoding="utf-8")
        assert "Conclusion: Pass:" in markdown
    finally:
        server.stop()
