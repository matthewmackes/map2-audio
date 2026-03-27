from __future__ import annotations

import json
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import urlopen


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT_DIR / "scripts" / "serve_web_dist.mjs"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class _BackendHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            payload = json.dumps({"status": "healthy"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return


def _start_backend() -> tuple[ThreadingHTTPServer, Thread, int]:
    port = _free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), _BackendHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, port


def _wait_for_http(url: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=1):
                return
        except Exception:
            time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {url}")


def _read_until(sock: socket.socket, marker: bytes, timeout: float = 2.0) -> bytes:
    sock.settimeout(timeout)
    payload = b""
    while marker not in payload:
        chunk = sock.recv(4096)
        if not chunk:
            break
        payload += chunk
    return payload


def _write_minimal_dist(dist_dir: Path) -> None:
    assets_dir = dist_dir / "assets"
    css_dir = dist_dir / "css"
    assets_dir.mkdir(parents=True)
    css_dir.mkdir(parents=True)

    (dist_dir / "index.html").write_text(
        """<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/css/modGui.css" />
    <script type="module" crossorigin src="/assets/index-abcdefgh.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>
""",
        encoding="utf-8",
    )
    (assets_dir / "index-abcdefgh.js").write_text("console.log('ok');\n", encoding="utf-8")
    (css_dir / "modGui.css").write_text("body { color: white; }\n", encoding="utf-8")


def test_production_server_distinguishes_spa_routes_from_static_assets(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    _write_minimal_dist(dist_dir)

    backend_server, backend_thread, backend_port = _start_backend()
    frontend_port = _free_port()
    proc = subprocess.Popen(
        [
            "node",
            str(SCRIPT_PATH),
            "--host",
            "127.0.0.1",
            "--port",
            str(frontend_port),
            "--backend-host",
            "127.0.0.1",
            "--backend-port",
            str(backend_port),
            "--dist",
            str(dist_dir),
        ],
        cwd=ROOT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        _wait_for_http(f"http://127.0.0.1:{frontend_port}/")

        with urlopen(f"http://127.0.0.1:{frontend_port}/", timeout=2) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
            assert response.headers.get("Content-Type", "").startswith("text/html")
            assert response.headers.get("Cache-Control") == "no-store, must-revalidate"
            assert "/assets/index-abcdefgh.js" in body

        with urlopen(f"http://127.0.0.1:{frontend_port}/dashboard", timeout=2) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
            assert response.headers.get("Content-Type", "").startswith("text/html")
            assert "<div id=\"root\"></div>" in body

        with urlopen(f"http://127.0.0.1:{frontend_port}/assets/index-abcdefgh.js", timeout=2) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
            assert response.headers.get("Content-Type", "").startswith("text/javascript")
            assert response.headers.get("Cache-Control") == "public, max-age=31536000, immutable"
            assert "console.log('ok');" in body

        with urlopen(f"http://127.0.0.1:{frontend_port}/api/health", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
            assert response.status == 200
            assert payload["status"] == "healthy"

        try:
            urlopen(f"http://127.0.0.1:{frontend_port}/assets/missing.js", timeout=2)
        except HTTPError as exc:
            body = exc.read().decode("utf-8")
            assert exc.code == 404
            assert "<!doctype html>" not in body.lower()
        else:
            raise AssertionError("Expected missing asset request to return 404")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

        backend_server.shutdown()
        backend_thread.join(timeout=5)


def test_production_server_exits_promptly_on_sigterm(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    _write_minimal_dist(dist_dir)

    backend_server, backend_thread, backend_port = _start_backend()
    frontend_port = _free_port()
    proc = subprocess.Popen(
        [
            "node",
            str(SCRIPT_PATH),
            "--host",
            "127.0.0.1",
            "--port",
            str(frontend_port),
            "--backend-host",
            "127.0.0.1",
            "--backend-port",
            str(backend_port),
            "--dist",
            str(dist_dir),
        ],
        cwd=ROOT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        _wait_for_http(f"http://127.0.0.1:{frontend_port}/")
        proc.terminate()
        proc.wait(timeout=5)
        assert proc.returncode is not None
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        backend_server.shutdown()
        backend_thread.join(timeout=5)


def test_production_server_sigterm_closes_keepalive_connections(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    _write_minimal_dist(dist_dir)

    backend_server, backend_thread, backend_port = _start_backend()
    frontend_port = _free_port()
    proc = subprocess.Popen(
        [
            "node",
            str(SCRIPT_PATH),
            "--host",
            "127.0.0.1",
            "--port",
            str(frontend_port),
            "--backend-host",
            "127.0.0.1",
            "--backend-port",
            str(backend_port),
            "--dist",
            str(dist_dir),
        ],
        cwd=ROOT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    keepalive_socket: socket.socket | None = None
    try:
        _wait_for_http(f"http://127.0.0.1:{frontend_port}/")
        keepalive_socket = socket.create_connection(("127.0.0.1", frontend_port), timeout=2)
        keepalive_socket.sendall(
            b"GET / HTTP/1.1\r\n"
            b"Host: 127.0.0.1\r\n"
            b"Connection: keep-alive\r\n\r\n"
        )
        payload = _read_until(keepalive_socket, b"</html>")
        assert b"200 OK" in payload

        proc.terminate()
        proc.wait(timeout=2)
        assert proc.returncode is not None
    finally:
        if keepalive_socket is not None:
            keepalive_socket.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        backend_server.shutdown()
        backend_thread.join(timeout=5)
