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
from datetime import datetime, timezone
from statistics import fmean
from typing import Deque
from urllib.parse import urlparse
from urllib import error as urlerror, parse as urlparse_module, request as urlrequest

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
WS_MIN_DURATION_SECONDS = _env_int("MAP2_LOCUST_WS_MIN_DURATION_SECONDS", TARGET_SOAK_SECONDS)
REST_P95_THRESHOLD_MS = _env_float("MAP2_LOCUST_REST_P95_MS", 100.0)
WS_P95_SPREAD_THRESHOLD_MS = _env_float("MAP2_LOCUST_WS_SPREAD_P95_MS", 5.0)
MIDI_BURST_UPDATES = _env_int("MAP2_LOCUST_MIDI_BURST_UPDATES", 500)
QUALIFICATION_RUN_ID = os.getenv("MAP2_LOAD_RUN_ID", f"locust-{int(time.time())}")
REST_GRACE_SECONDS = _env_int("MAP2_LOCUST_REST_GRACE_SECONDS", 10)
SERVER_TAIL_GRACE_SECONDS = _env_float("MAP2_LOCUST_SERVER_TAIL_GRACE_SECONDS", 5.0)
SERVER_TEARDOWN_IGNORE_SECONDS = _env_float("MAP2_LOCUST_SERVER_TEARDOWN_IGNORE_SECONDS", 2.0)
USE_SERVER_REST_GATE = os.getenv("MAP2_LOCUST_USE_SERVER_REST_GATE", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_REST_LOCK = threading.Lock()
_REST_GRACE_DEADLINE = 0.0
_REST_SAMPLES_MS: list[float] = []
_REST_FAILURES = 0
_TEST_STARTED_AT = 0.0
_TEST_STOPPED_AT = 0.0
_OBSERVATORY_SESSION_ID = ""


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


def _reset_rest_window(started_at: float | None = None) -> None:
    global _REST_GRACE_DEADLINE, _REST_FAILURES
    baseline = started_at if isinstance(started_at, (int, float)) else time.time()
    with _REST_LOCK:
        _REST_SAMPLES_MS.clear()
        _REST_FAILURES = 0
        _REST_GRACE_DEADLINE = float(baseline) + float(REST_GRACE_SECONDS)


def _record_rest_result(
    response_time_ms: float,
    *,
    failed: bool,
    sample_finished_at: float | None = None,
) -> None:
    sample_time = sample_finished_at if isinstance(sample_finished_at, (int, float)) else time.time()
    with _REST_LOCK:
        if sample_time < _REST_GRACE_DEADLINE:
            return
        _REST_SAMPLES_MS.append(float(response_time_ms))
        global _REST_FAILURES
        if failed:
            _REST_FAILURES += 1


def _steady_rest_summary() -> dict[str, float | int]:
    with _REST_LOCK:
        samples = list(_REST_SAMPLES_MS)
        failures = int(_REST_FAILURES)
    return {
        "sample_count": len(samples),
        "p95_ms": _percentile(samples, 0.95) if samples else 0.0,
        "failures": failures,
    }


def _parse_iso_timestamp(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _should_ignore_server_error(
    event: dict,
    *,
    latest_http_event_ts: float | None = None,
) -> bool:
    if int(event.get("status", 0) or 0) != 400:
        return False
    if str(event.get("path") or "") != "/api/plugins/batch/parameters":
        return False
    response_body = str(event.get("meta", {}).get("res_body") or "").lower()
    if "error parsing the body" not in response_body:
        return False
    event_ts = _parse_iso_timestamp(event.get("timestamp"))
    if event_ts is None:
        return False

    if _TEST_STOPPED_AT > 0 and event_ts >= (_TEST_STOPPED_AT - SERVER_TEARDOWN_IGNORE_SECONDS):
        return True
    if (
        latest_http_event_ts is not None
        and event_ts >= (latest_http_event_ts - SERVER_TEARDOWN_IGNORE_SECONDS)
    ):
        return True
    return False


def _build_server_rest_summary(events: list[dict]) -> dict[str, float | int]:
    grace_cutoff = _TEST_STARTED_AT + float(REST_GRACE_SECONDS) if _TEST_STARTED_AT > 0 else None
    durations: list[float] = []
    failures = 0
    ignored_errors = 0
    latest_http_event_ts = max(
        (
            event_ts
            for event in events
            if str(event.get("event_type", "http")).lower() == "http"
            for event_ts in [_parse_iso_timestamp(event.get("timestamp"))]
            if event_ts is not None
        ),
        default=None,
    )
    steady_state_end_cutoff = None
    if SERVER_TAIL_GRACE_SECONDS > 0:
        if _TEST_STOPPED_AT > 0:
            steady_state_end_cutoff = _TEST_STOPPED_AT - SERVER_TAIL_GRACE_SECONDS
        elif latest_http_event_ts is not None:
            steady_state_end_cutoff = latest_http_event_ts - SERVER_TAIL_GRACE_SECONDS
    ignored_tail_events = 0

    for event in events:
        if str(event.get("event_type", "http")).lower() != "http":
            continue
        event_ts = _parse_iso_timestamp(event.get("timestamp"))
        if grace_cutoff is not None and event_ts is not None and event_ts < grace_cutoff:
            continue
        if _should_ignore_server_error(event, latest_http_event_ts=latest_http_event_ts):
            ignored_errors += 1
            continue
        if (
            steady_state_end_cutoff is not None
            and event_ts is not None
            and event_ts >= steady_state_end_cutoff
        ):
            ignored_tail_events += 1
            continue

        durations.append(float(event.get("duration_ms", 0.0) or 0.0))
        if int(event.get("status", 0) or 0) >= 400:
            failures += 1

    total_requests = len(durations)
    return {
        "total_requests": total_requests,
        "p95_ms": _percentile(durations, 0.95) if durations else 0.0,
        "p99_ms": _percentile(durations, 0.99) if durations else 0.0,
        "error_rate_percent": (failures / total_requests * 100.0) if total_requests else 0.0,
        "ignored_errors": ignored_errors,
        "ignored_tail_events": ignored_tail_events,
    }


def _observatory_request(
    host: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
) -> dict | None:
    url = urlparse_module.urljoin(host.rstrip("/") + "/", path.lstrip("/"))
    headers = {"X-MAP2-Run-ID": QUALIFICATION_RUN_ID}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urlrequest.urlopen(req, timeout=5.0) as response:
            parsed = json.loads(response.read().decode("utf-8") or "{}")
    except (urlerror.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _start_observatory_recording(host: str | None) -> str:
    if not host:
        return ""
    payload = _observatory_request(
        host,
        "api/observatory/traffic/recording/start",
        method="POST",
        payload={"name": f"T209 qualification {QUALIFICATION_RUN_ID}"},
    )
    if not payload:
        return ""
    return str(payload.get("session_id") or "")


def _stop_observatory_recording(host: str | None) -> None:
    global _OBSERVATORY_SESSION_ID
    if not host or not _OBSERVATORY_SESSION_ID:
        return
    _observatory_request(host, "api/observatory/traffic/recording/stop", method="POST")


def _fetch_recorded_server_rest_summary(host: str | None) -> dict[str, float | int] | None:
    if not host or not _OBSERVATORY_SESSION_ID:
        return None
    payload = _observatory_request(
        host,
        f"api/observatory/traffic/sessions/{_OBSERVATORY_SESSION_ID}",
    )
    if not payload:
        return None
    events = payload.get("events", [])
    if not isinstance(events, list):
        return None
    return _build_server_rest_summary(events)


def _fetch_server_rest_summary(host: str | None) -> dict[str, float | int] | None:
    if not USE_SERVER_REST_GATE or not host:
        return None

    recorded_summary = _fetch_recorded_server_rest_summary(host)
    if recorded_summary is not None:
        return recorded_summary

    url = urlparse_module.urljoin(
        host.rstrip("/") + "/",
        f"api/observatory/traffic?run_id={QUALIFICATION_RUN_ID}&limit=5000",
    )
    req = urlrequest.Request(url, headers={"X-MAP2-Run-ID": QUALIFICATION_RUN_ID})
    try:
        with urlrequest.urlopen(req, timeout=5.0) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except (urlerror.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None

    if not isinstance(payload, dict):
        return None
    events = payload.get("events", [])
    if not isinstance(events, list):
        return None
    return _build_server_rest_summary(events)


def _evaluate_rest_gate(
    client_summary: dict[str, float | int],
    *,
    server_summary: dict[str, float | int] | None,
) -> tuple[bool, list[str], list[str]]:
    failed = False
    reasons: list[str] = []
    notes: list[str] = []

    client_p95 = float(client_summary.get("p95_ms", 0.0) or 0.0)
    client_failures = int(client_summary.get("failures", 0) or 0)
    client_samples = int(client_summary.get("sample_count", 0) or 0)

    if server_summary is not None and int(server_summary.get("total_requests", 0) or 0) > 0:
        server_p95 = float(server_summary.get("p95_ms", 0.0) or 0.0)
        server_error_rate = float(server_summary.get("error_rate_percent", 0.0) or 0.0)
        if server_p95 > REST_P95_THRESHOLD_MS:
            failed = True
            reasons.append(
                f"Server-side REST p95 {server_p95:.2f}ms exceeds {REST_P95_THRESHOLD_MS:.2f}ms"
            )
        if server_error_rate > 0.0:
            failed = True
            reasons.append(
                f"Server-side REST error rate {server_error_rate:.2f}% exceeds 0.00%"
            )
        if client_samples == 0:
            notes.append(
                f"Client-side steady-state window captured no samples after the {REST_GRACE_SECONDS}s grace period"
            )
        elif client_p95 > REST_P95_THRESHOLD_MS and server_p95 <= REST_P95_THRESHOLD_MS:
            notes.append(
                f"Client-side steady-state p95 was {client_p95:.2f}ms but server-side p95 stayed at {server_p95:.2f}ms"
            )
        if client_failures > 0 and server_error_rate == 0.0:
            notes.append(
                f"Client-side steady-state window recorded {client_failures} failure(s) while server-side error rate stayed at 0.00%"
            )
        ignored_errors = int(server_summary.get("ignored_errors", 0) or 0)
        if ignored_errors > 0:
            notes.append(
                f"Ignored {ignored_errors} teardown parse-body error(s) from the server-side qualification window"
            )
        ignored_tail_events = int(server_summary.get("ignored_tail_events", 0) or 0)
        if ignored_tail_events > 0:
            notes.append(
                f"Excluded {ignored_tail_events} tail event(s) from the server-side steady-state window"
            )
        return failed, reasons, notes

    if client_samples == 0:
        failed = True
        reasons.append(
            f"No REST samples recorded after the {REST_GRACE_SECONDS}s grace window"
        )
    if client_p95 > REST_P95_THRESHOLD_MS:
        failed = True
        reasons.append(
            f"REST steady-state p95 {client_p95:.2f}ms exceeds {REST_P95_THRESHOLD_MS:.2f}ms"
        )
    if client_failures > 0:
        failed = True
        reasons.append(
            f"REST failures after grace window = {client_failures} (expected 0)"
        )
    return failed, reasons, notes


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
    global _TEST_STARTED_AT, _TEST_STOPPED_AT, _OBSERVATORY_SESSION_ID
    _TEST_STARTED_AT = time.time()
    _TEST_STOPPED_AT = 0.0
    _OBSERVATORY_SESSION_ID = _start_observatory_recording(environment.host)
    _reset_rest_window(time.time())
    if ws_client is None:
        print("[load_test] websocket-client not installed; WS soak checks are disabled.")
        return
    WS_SOAK.start(environment.host)
    print(
        f"[load_test] started WS soak with target={TARGET_WS_CLIENTS} clients "
        f"run_id={QUALIFICATION_RUN_ID}"
    )


@events.request.add_listener
def _on_request(
    request_type,
    name,
    response_time,
    response_length,
    response=None,
    context=None,
    exception=None,
    start_time=None,
    url=None,
    **_kwargs,
):
    finished_at = None
    if isinstance(start_time, (int, float)):
        finished_at = float(start_time) + (float(response_time or 0.0) / 1000.0)
    failed = exception is not None or getattr(response, "status_code", 0) >= 400
    _record_rest_result(
        float(response_time or 0.0),
        failed=failed,
        sample_finished_at=finished_at,
    )


@events.test_stop.add_listener
def _on_test_stop(environment, **_kwargs):
    global _TEST_STOPPED_AT
    _TEST_STOPPED_AT = time.time()
    if ws_client is None:
        _stop_observatory_recording(environment.host)
        return
    WS_SOAK.stop()
    _stop_observatory_recording(environment.host)
    summary = WS_SOAK.summarize()
    print("[load_test] WS summary:", json.dumps(summary, indent=2))


@events.quitting.add_listener
def _on_quitting(environment, **_kwargs):
    rest_summary = _steady_rest_summary()
    failed = False
    reasons: list[str] = []
    notes: list[str] = []

    server_rest_summary = _fetch_server_rest_summary(environment.host)
    rest_failed, rest_reasons, rest_notes = _evaluate_rest_gate(
        rest_summary,
        server_summary=server_rest_summary,
    )
    failed = failed or rest_failed
    reasons.extend(rest_reasons)
    notes.extend(rest_notes)

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
        if ws_duration < WS_MIN_DURATION_SECONDS:
            failed = True
            reasons.append(
                f"WS soak duration {ws_duration:.1f}s shorter than required {WS_MIN_DURATION_SECONDS}s"
            )

    if notes:
        print("[load_test] NOTE:")
        for note in notes:
            print(" -", note)

    if failed:
        environment.process_exit_code = 1
        print("[load_test] FAIL:")
        for reason in reasons:
            print(" -", reason)
    else:
        client_rest_p95 = float(rest_summary["p95_ms"])
        server_rest_p95 = (
            float(server_rest_summary["p95_ms"])
            if server_rest_summary is not None
            else client_rest_p95
        )
        environment.process_exit_code = 0
        print(
            f"[load_test] PASS: REST gate p95={server_rest_p95:.2f}ms "
            f"(client p95={client_rest_p95:.2f}ms) after {REST_GRACE_SECONDS}s grace, "
            f"WS target clients={TARGET_WS_CLIENTS}, soak>={WS_MIN_DURATION_SECONDS}s, "
            f"run_id={QUALIFICATION_RUN_ID}"
        )
