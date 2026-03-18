from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t209_api_load_qualification.py"


class _Handler(BaseHTTPRequestHandler):
    routes: dict[str, tuple[int, dict]] = {}

    def do_GET(self) -> None:  # noqa: N802
        status, payload = self.routes.get(self.path, (404, {"detail": "not found"}))
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def _serve(routes: dict[str, tuple[int, dict]]):
    _Handler.routes = routes
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def test_t209_preflight_passes_with_ready_fixture(tmp_path: Path) -> None:
    server, thread = _serve(
        {
            "/api/ready": (200, {"ready": True, "accepting_traffic": True}),
            "/api/services/startup-order": (
                200,
                {
                    "traffic_gate_services": ["database", "command_queue", "websocket_manager"],
                    "startup_progress": {"completed_services": 3, "total_services": 3},
                },
            ),
            "/api/services/status/websocket_manager": (
                200,
                {"state": "running", "health": {"healthy": True}},
            ),
            "/api/chains/": (200, {"chains": [], "count": 0}),
            "/api/plugins/discover": (200, {"plugins": [], "count": 0}),
        }
    )
    try:
        output_dir = tmp_path / "out"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--output-dir",
                str(output_dir),
                "--api-base",
                f"http://127.0.0.1:{server.server_port}",
                "--min-open-files",
                "1",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert result.returncode == 0
    summary = json.loads((output_dir / "t209-api-load-preflight.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "PASS"
    assert summary["checks"]["api_ready"]["status"] == "PASS"
    assert summary["checks"]["plugin_discovery_route"]["status"] == "PASS"


def test_t209_preflight_blocks_when_readiness_is_not_accepting_traffic(tmp_path: Path) -> None:
    server, thread = _serve(
        {
            "/api/ready": (503, {"ready": False, "accepting_traffic": False}),
            "/api/services/startup-order": (
                200,
                {
                    "traffic_gate_services": ["database", "command_queue", "websocket_manager"],
                    "startup_progress": {"completed_services": 2, "total_services": 3},
                },
            ),
            "/api/services/status/websocket_manager": (
                200,
                {"state": "starting", "health": {"healthy": False}},
            ),
            "/api/chains/": (503, {"detail": {"reason": "chain_store_warming"}}),
            "/api/plugins/discover": (503, {"detail": {"reason": "plugin_inventory_warming"}}),
        }
    )
    try:
        output_dir = tmp_path / "out"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--output-dir",
                str(output_dir),
                "--api-base",
                f"http://127.0.0.1:{server.server_port}",
                "--min-open-files",
                "1",
                "--load-command",
                "echo should-not-run",
                "--run-load-command",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert result.returncode == 1
    summary = json.loads((output_dir / "t209-api-load-preflight.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "BLOCKED"
    assert summary["checks"]["api_ready"]["status"] == "BLOCKED"
    assert summary["load_command"]["executed"] is False
    assert summary["load_command"]["reason"] == "Preflight blocked load execution."
