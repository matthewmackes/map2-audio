from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t066_usb_din_adapter_qualification.py"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


class _FixtureServer:
    def __init__(self, *, send_ok: bool = True) -> None:
        self.send_ok = send_ok
        self.server = HTTPServer(("127.0.0.1", 0), self._make_handler())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def _write_json(self, status: int, payload: dict) -> None:
                body = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self) -> None:  # noqa: N802
                if self.path == "/api/midi/hub/start":
                    self._write_json(200, {"running": True, "router_running": True})
                    return
                if self.path == "/api/midi/hub/network/sessions/session1/send":
                    self._write_json(200, {"ok": outer.send_ok})
                    return
                self._write_json(404, {"error": "not found"})

            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/api/midi/hub/status":
                    self._write_json(200, {"running": True, "port_count": 2, "route_count": 1})
                    return
                if self.path == "/api/midi/hub/network/sessions":
                    self._write_json(200, {"count": 1, "sessions": [{"session_id": "session1"}]})
                    return
                if self.path.startswith("/api/midi/hub/traffic/snapshot"):
                    self._write_json(200, {"captured_total": 12, "capacity": 4096, "items": []})
                    return
                self._write_json(404, {"error": "not found"})

            def log_message(self, format: str, *args) -> None:  # noqa: A003
                return

        return Handler

    @property
    def api_base(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}/api/midi/hub"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def test_t066_runner_blocks_when_sequencer_is_unavailable(tmp_path: Path) -> None:
    server = _FixtureServer()
    server.start()
    try:
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        _write_executable(
            bin_dir / "aconnect",
            """#!/usr/bin/env bash
echo "can't open sequencer" >&2
exit 1
""",
        )
        _write_executable(
            bin_dir / "amidi",
            """#!/usr/bin/env bash
printf '%s\n' 'Dir Device    Name'
""",
        )

        output_dir = tmp_path / "blocked"
        env = os.environ.copy()
        env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--output-dir",
                str(output_dir),
                "--api-base",
                server.api_base,
                "--adapter-name-pattern",
                "UM-ONE",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

        assert proc.returncode == 2, proc.stderr
        summary = json.loads((output_dir / "t066-usb-din-adapter-qualification.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "BLOCKED"
        assert summary["checks"]["alsa_sequencer_access"]["status"] == "BLOCKED"
    finally:
        server.stop()


def test_t066_runner_passes_with_adapter_and_sysex_session(tmp_path: Path) -> None:
    server = _FixtureServer(send_ok=True)
    server.start()
    try:
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        _write_executable(
            bin_dir / "aconnect",
            """#!/usr/bin/env bash
cat <<'EOF'
client 20: 'UM-ONE' [type=kernel,card=2]
  0 'UM-ONE MIDI 1'
EOF
""",
        )
        _write_executable(
            bin_dir / "amidi",
            """#!/usr/bin/env bash
cat <<'EOF'
Dir Device    Name
IO  hw:2,0,0  UM-ONE MIDI 1
EOF
""",
        )

        output_dir = tmp_path / "pass"
        env = os.environ.copy()
        env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--output-dir",
                str(output_dir),
                "--api-base",
                server.api_base,
                "--adapter-label",
                "Roland UM-ONE mk2",
                "--adapter-name-pattern",
                "UM-ONE",
                "--session-id",
                "session1",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

        assert proc.returncode == 0, proc.stderr
        summary = json.loads((output_dir / "t066-usb-din-adapter-qualification.json").read_text(encoding="utf-8"))
        assert summary["overall_status"] == "PASS"
        assert summary["checks"]["adapter_detection"]["status"] == "PASS"
        assert summary["checks"]["sysex_smoke_send"]["status"] == "PASS"
        markdown = (output_dir / "T066_USB_DIN_ADAPTER_QUALIFICATION.md").read_text(encoding="utf-8")
        assert "Conclusion: Pass:" in markdown
    finally:
        server.stop()
