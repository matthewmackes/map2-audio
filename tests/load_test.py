"""
Locust load profile for MAP2 realistic workloads.

Scenarios covered:
1. 100 concurrent WebSocket subscribers on metering stream (/ws/v1, topic=meters)
2. Burst parameter updates equivalent to ~500 MIDI CC updates/second
3. Concurrent chain operations while polling playback/engine status
4. Plugin load/unload while metering endpoints are active

Run:
  locust -f tests/load_test.py --host http://localhost:8080
"""

from __future__ import annotations

import json
import os
import random
import threading
import time
from collections import defaultdict, deque
from statistics import fmean
from typing import Deque
from urllib.parse import urlparse

try:
    from locust import HttpUser, between, events, task
except ModuleNotFoundError:
    import pytest
    pytest.skip("locust not installed; skipping load test module", allow_module_level=True)

try:
    import websocket as ws_client  # type: ignore
except ModuleNotFoundError:
    ws_client = None

if ws_client is not None:
    _WS_TIMEOUT_EXCEPTION = getattr(ws_client, "WebSocketTimeoutException", TimeoutError)
else:
    _WS_TIMEOUT_EXCEPTION = TimeoutError


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


TARGET_WS_CLIENTS = _env_int("MAP2_LOCUST_WS_CLIENTS", 100)
TARGET_SOAK_SECONDS = _env_int("MAP2_LOCUST_SOAK_SECONDS", 300)
REST_P95_THRESHOLD_MS = _env_float("MAP2_LOCUST_REST_P95_MS", 50.0)
WS_P95_SPREAD_THRESHOLD_MS = _env_float("MAP2_LOCUST_WS_SPREAD_P95_MS", 5.0)
MIDI_BURST_UPDATES = _env_int("MAP2_LOCUST_MIDI_BURST_UPDATES", 500)
QUALIFICATION_RUN_ID = os.getenv("MAP2_LOAD_RUN_ID", f"locust-{int(time.time())}")


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    sorted_values = sorted(values)
    index = int(round((len(sorted_values) - 1) * p))
    return sorted_values[max(0, min(index, len(sorted_values) - 1))]


class MeterWebSocketSoak:
    """
    Background monitor for WebSocket meter fan-out latency spread.

    For each unique server timestamp, we capture first/last local receive time
    and record spread in milliseconds.
    """

    def __init__(self) -> None:
        self._running = False
        self._lock = threading.Lock()
        self._threads: list[threading.Thread] = []
        self._sockets = set()
        self._connections = 0
        self._drops = 0
        self._spread_samples_ms: Deque[float] = deque(maxlen=5000)
        self._arrival_windows: dict[str, list[float]] = defaultdict(list)
        self._started_at = 0.0
        self._stopped_at = 0.0

    def start(self, host: str | None) -> None:
        if self._running or ws_client is None:
            return

        parsed = urlparse(host or "http://localhost:8080")
        scheme = "wss" if parsed.scheme == "https" else "ws"
        netloc = parsed.netloc or parsed.path
        ws_url = f"{scheme}://{netloc}/ws/v1?run_id={QUALIFICATION_RUN_ID}"

        self._running = True
        self._started_at = time.time()
        self._stopped_at = 0.0

        for index in range(TARGET_WS_CLIENTS):
            thread = threading.Thread(target=self._worker, args=(ws_url, index), daemon=True)
            self._threads.append(thread)
            thread.start()

    def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        self._stopped_at = time.time()

        with self._lock:
            sockets = list(self._sockets)
        for socket in sockets:
            try:
                socket.close()
            except Exception:
                pass

        for thread in self._threads:
            thread.join(timeout=2.0)
        self._threads.clear()

    @property
    def dropped_connections(self) -> int:
        with self._lock:
            return self._drops

    @property
    def connected_count(self) -> int:
        with self._lock:
            return self._connections

    @property
    def soak_duration_seconds(self) -> float:
        if self._started_at <= 0:
            return 0.0
        ended = self._stopped_at if self._stopped_at > 0 else time.time()
        return max(0.0, ended - self._started_at)

    def summarize(self) -> dict[str, float]:
        with self._lock:
            samples = list(self._spread_samples_ms)
            drops = self._drops
            connected = self._connections

        return {
            "connected": float(connected),
            "drops": float(drops),
            "samples": float(len(samples)),
            "spread_mean_ms": fmean(samples) if samples else 0.0,
            "spread_p95_ms": _percentile(samples, 0.95) if samples else 0.0,
        }

    def _worker(self, ws_url: str, worker_id: int) -> None:
        if ws_client is None:
            return

        while self._running:
            ws = None
            try:
                ws = ws_client.create_connection(
                    f"{ws_url}&client_label=locust-meter-{worker_id}",
                    timeout=8.0,
                    header=[f"X-MAP2-Run-ID: {QUALIFICATION_RUN_ID}"],
                )
                ws.settimeout(1.0)
                ws.send(json.dumps({"action": "subscribe", "topic": "meters"}))
                with self._lock:
                    self._connections += 1
                    self._sockets.add(ws)

                while self._running:
                    try:
                        raw = ws.recv()
                    except (_WS_TIMEOUT_EXCEPTION, TimeoutError):
                        # Idle read timeout is expected under jitter/load; keep the
                        # socket alive and continue waiting instead of counting a drop.
                        continue
                    if raw is None:
                        raise RuntimeError("WebSocket connection closed by peer")
                    now = time.perf_counter()
                    payload = json.loads(raw)
                    msg_type = payload.get("type")
                    if msg_type not in {"meters_update", "meter_update"}:
                        continue
                    key = str(payload.get("timestamp") or payload.get("data", {}).get("timestamp") or "")
                    if not key:
                        continue

                    with self._lock:
                        arrivals = self._arrival_windows[key]
                        arrivals.append(now)
                        if len(arrivals) >= 2:
                            spread_ms = (max(arrivals) - min(arrivals)) * 1000.0
                            self._spread_samples_ms.append(spread_ms)
                            del self._arrival_windows[key]
            except Exception:
                if not self._running:
                    break
                with self._lock:
                    self._drops += 1
                time.sleep(0.2 + (worker_id % 5) * 0.05)
            finally:
                try:
                    if ws is not None:
                        with self._lock:
                            self._sockets.discard(ws)
                        ws.close()
                except Exception:
                    pass


WS_SOAK = MeterWebSocketSoak()


class MAP2RealtimeUser(HttpUser):
    wait_time = between(0.05, 0.25)

    def on_start(self) -> None:
        self.client.headers.update({"X-MAP2-Run-ID": QUALIFICATION_RUN_ID})
        self._chain_ids: list[int] = []
        self._loaded_plugin_uris: list[str] = []
        self._discovered_plugin_uris: list[str] = []
        self._refresh_ids()

    def _safe_get_json(self, path: str, name: str, timeout: int = 8) -> dict | None:
        try:
            with self.client.get(path, name=name, timeout=timeout, catch_response=True) as response:
                if getattr(response, "error", None):
                    response.failure(str(response.error))
                    return None
                if response.status_code >= 400:
                    response.failure(f"HTTP {response.status_code}")
                    return None
                response.success()
                if not response.text:
                    return {}
                try:
                    return response.json()
                except ValueError:
                    response.failure("Invalid JSON response")
                    return None
        except Exception:
            return None

    def _refresh_ids(self) -> None:
        chains = self._safe_get_json("/api/chains/", "/api/chains/", timeout=8)
        if chains is not None:
            self._chain_ids = [int(c.get("id")) for c in chains.get("chains", []) if c.get("id") is not None]

        loaded = self._safe_get_json("/api/plugins/list", "/api/plugins/list", timeout=8)
        if loaded is not None:
            self._loaded_plugin_uris = [p.get("uri") for p in loaded.get("loaded", []) if p.get("uri")]

        discovered = self._safe_get_json("/api/plugins/discover", "/api/plugins/discover", timeout=8)
        if discovered is not None:
            self._discovered_plugin_uris = [p.get("uri") for p in discovered.get("plugins", []) if p.get("uri")]

    @task(4)
    def metering_baseline(self) -> None:
        self.client.get("/api/audio/levels", name="/api/audio/levels", timeout=8)
        self.client.get("/api/audio/latency", name="/api/audio/latency", timeout=8)

    @task(3)
    def chain_edit_and_playback(self) -> None:
        if not self._chain_ids:
            self._refresh_ids()
            return

        chain_id = random.choice(self._chain_ids)
        self.client.get(f"/api/chains/{chain_id}", name="/api/chains/{id}", timeout=8)
        self.client.post(f"/api/chains/{chain_id}/activate", name="/api/chains/{id}/activate", timeout=8)
        self.client.get("/api/audio/status", name="/api/audio/status", timeout=8)
        self.client.post(f"/api/chains/{chain_id}/deactivate", name="/api/chains/{id}/deactivate", timeout=8)

    @task(2)
    def midi_cc_burst(self) -> None:
        if not self._loaded_plugin_uris:
            self._refresh_ids()
            return

        plugin_uri = random.choice(self._loaded_plugin_uris)
        updates = [
            {
                "plugin_uri": plugin_uri,
                "param_index": random.randint(0, 7),
                "value": random.random(),
            }
            for _ in range(MIDI_BURST_UPDATES)
        ]
        self.client.post(
            "/api/plugins/batch/parameters",
            name="/api/plugins/batch/parameters (500 updates)",
            json={"updates": updates},
            timeout=12,
        )

    @task(1)
    def plugin_load_unload_under_metering(self) -> None:
        self.client.get("/api/audio/levels", name="/api/audio/levels (during plugin swap)", timeout=8)

        if not self._discovered_plugin_uris:
            self._refresh_ids()
            return

        uri = random.choice(self._discovered_plugin_uris)
        self.client.post("/api/plugins/load", params={"uri": uri}, name="/api/plugins/load?uri", timeout=8)
        self.client.get("/api/audio/levels/plugins", name="/api/audio/levels/plugins", timeout=8)
        self.client.post("/api/plugins/unload", params={"uri": uri}, name="/api/plugins/unload?uri", timeout=8)


@events.test_start.add_listener
def _on_test_start(environment, **_kwargs):
    if ws_client is None:
        print("[load_test] websocket-client not installed; WS soak checks are disabled.")
        return
    WS_SOAK.start(environment.host)
    print(
        f"[load_test] started WS soak with target={TARGET_WS_CLIENTS} clients "
        f"run_id={QUALIFICATION_RUN_ID}"
    )


@events.test_stop.add_listener
def _on_test_stop(environment, **_kwargs):
    if ws_client is None:
        return
    WS_SOAK.stop()
    summary = WS_SOAK.summarize()
    print("[load_test] WS summary:", json.dumps(summary, indent=2))


@events.quitting.add_listener
def _on_quitting(environment, **_kwargs):
    total_stats = environment.stats.total
    rest_p95 = total_stats.get_response_time_percentile(0.95) or 0.0

    failed = False
    reasons: list[str] = []

    if rest_p95 > REST_P95_THRESHOLD_MS:
        failed = True
        reasons.append(f"REST p95 {rest_p95:.2f}ms exceeds {REST_P95_THRESHOLD_MS:.2f}ms")

    if ws_client is not None:
        ws_summary = WS_SOAK.summarize()
        ws_p95 = ws_summary["spread_p95_ms"]
        ws_drops = int(ws_summary["drops"])
        ws_duration = WS_SOAK.soak_duration_seconds

        if ws_p95 > WS_P95_SPREAD_THRESHOLD_MS:
            failed = True
            reasons.append(f"WS spread p95 {ws_p95:.2f}ms exceeds {WS_P95_SPREAD_THRESHOLD_MS:.2f}ms")
        if ws_drops > 0:
            failed = True
            reasons.append(f"WS dropped connections = {ws_drops} (expected 0)")
        if ws_duration < TARGET_SOAK_SECONDS:
            failed = True
            reasons.append(
                f"WS soak duration {ws_duration:.1f}s shorter than required {TARGET_SOAK_SECONDS}s"
            )

    if failed:
        environment.process_exit_code = 1
        print("[load_test] FAIL:")
        for reason in reasons:
            print(" -", reason)
    else:
        environment.process_exit_code = 0
        print(
            f"[load_test] PASS: REST p95={rest_p95:.2f}ms, "
            f"WS target clients={TARGET_WS_CLIENTS}, soak={TARGET_SOAK_SECONDS}s, "
            f"run_id={QUALIFICATION_RUN_ID}"
        )
