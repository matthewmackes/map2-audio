from __future__ import annotations

import importlib.util
import json
import sys
from types import SimpleNamespace
from pathlib import Path


_LOAD_TEST_PATH = Path(__file__).resolve().parent / "load_test.py"
_SPEC = importlib.util.spec_from_file_location("map2_locust_load_test", _LOAD_TEST_PATH)
assert _SPEC is not None and _SPEC.loader is not None


class _EventHook:
    def add_listener(self, fn):
        return fn


locust_stub = SimpleNamespace(
    HttpUser=object,
    between=lambda *_args, **_kwargs: None,
    task=lambda *_args, **_kwargs: (lambda fn: fn),
    events=SimpleNamespace(
        test_start=_EventHook(),
        request=_EventHook(),
        test_stop=_EventHook(),
        quitting=_EventHook(),
    ),
)

_ORIGINAL_LOCUST = sys.modules.get("locust")
sys.modules["locust"] = locust_stub
load_test = importlib.util.module_from_spec(_SPEC)
try:
    _SPEC.loader.exec_module(load_test)
finally:
    if _ORIGINAL_LOCUST is not None:
        sys.modules["locust"] = _ORIGINAL_LOCUST
    else:
        sys.modules.pop("locust", None)


def test_rest_window_ignores_samples_before_grace_period():
    load_test._reset_rest_window(100.0)

    load_test._record_rest_result(80.0, failed=False, sample_finished_at=105.0)
    load_test._record_rest_result(20.0, failed=False, sample_finished_at=111.0)

    summary = load_test._steady_rest_summary()

    assert summary["sample_count"] == 1
    assert summary["p95_ms"] == 20.0
    assert summary["failures"] == 0


def test_rest_window_tracks_failures_after_grace_period():
    load_test._reset_rest_window(200.0)

    load_test._record_rest_result(50.0, failed=True, sample_finished_at=210.1)
    load_test._record_rest_result(10.0, failed=False, sample_finished_at=211.0)

    summary = load_test._steady_rest_summary()

    assert summary["sample_count"] == 2
    assert summary["failures"] == 1
    assert summary["p95_ms"] >= 10.0


def test_server_rest_gate_prefers_backend_metrics_when_available():
    failed, reasons, notes = load_test._evaluate_rest_gate(
        {"sample_count": 12, "p95_ms": 140.0, "failures": 1},
        server_summary={
            "total_requests": 400,
            "p95_ms": 22.5,
            "p99_ms": 120.0,
            "error_rate_percent": 0.0,
        },
    )

    assert failed is False
    assert reasons == []
    assert any("Client-side steady-state p95" in note for note in notes)
    assert any("Client-side steady-state window recorded 1 failure" in note for note in notes)


def test_server_rest_gate_fails_when_backend_metrics_exceed_threshold():
    failed, reasons, notes = load_test._evaluate_rest_gate(
        {"sample_count": 12, "p95_ms": 20.0, "failures": 0},
        server_summary={
            "total_requests": 400,
            "p95_ms": 125.0,
            "p99_ms": 120.0,
            "error_rate_percent": 0.25,
        },
    )

    assert failed is True
    assert any("Server-side REST p95" in reason for reason in reasons)
    assert any("Server-side REST error rate" in reason for reason in reasons)
    assert notes == []


def test_server_rest_summary_ignores_teardown_parse_body_errors():
    load_test._TEST_STARTED_AT = 100.0
    load_test._TEST_STOPPED_AT = 170.0

    events = [
        {
            "timestamp": "1970-01-01T00:02:00+00:00",
            "event_type": "http",
            "status": 200,
            "duration_ms": 10.0,
            "meta": {},
        },
        {
            "timestamp": "1970-01-01T00:02:49.500000+00:00",
            "event_type": "http",
            "status": 400,
            "path": "/api/plugins/batch/parameters",
            "duration_ms": 300.0,
            "meta": {"res_body": "{\"detail\":\"There was an error parsing the body\"}"},
        },
    ]

    summary = load_test._build_server_rest_summary(events)

    assert summary["total_requests"] == 1
    assert summary["p95_ms"] == 10.0
    assert summary["error_rate_percent"] == 0.0
    assert summary["ignored_errors"] == 1


def test_server_rest_summary_ignores_tail_parse_body_errors_without_test_stop_timestamp():
    load_test._TEST_STARTED_AT = 100.0
    load_test._TEST_STOPPED_AT = 0.0

    events = [
        {
            "timestamp": "1970-01-01T00:02:00+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/levels",
            "duration_ms": 10.0,
            "meta": {},
        },
        {
            "timestamp": "1970-01-01T00:02:49.500000+00:00",
            "event_type": "http",
            "status": 400,
            "path": "/api/plugins/batch/parameters",
            "duration_ms": 300.0,
            "meta": {"res_body": "{\"detail\":\"There was an error parsing the body\"}"},
        },
    ]

    summary = load_test._build_server_rest_summary(events)

    assert summary["total_requests"] == 1
    assert summary["p95_ms"] == 10.0
    assert summary["error_rate_percent"] == 0.0
    assert summary["ignored_errors"] == 1


def test_server_rest_summary_keeps_mid_run_parse_body_errors():
    load_test._TEST_STARTED_AT = 100.0
    load_test._TEST_STOPPED_AT = 170.0

    events = [
        {
            "timestamp": "1970-01-01T00:02:00+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/levels",
            "duration_ms": 10.0,
            "meta": {},
        },
        {
            "timestamp": "1970-01-01T00:02:20+00:00",
            "event_type": "http",
            "status": 400,
            "path": "/api/plugins/batch/parameters",
            "duration_ms": 300.0,
            "meta": {"res_body": "{\"detail\":\"There was an error parsing the body\"}"},
        },
        {
            "timestamp": "1970-01-01T00:02:40+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/latency",
            "duration_ms": 11.0,
            "meta": {},
        },
    ]

    summary = load_test._build_server_rest_summary(events)

    assert summary["total_requests"] == 3
    assert summary["error_rate_percent"] > 0.0
    assert summary["ignored_errors"] == 0


def test_server_rest_summary_excludes_tail_window_from_steady_state():
    load_test._TEST_STARTED_AT = 100.0
    load_test._TEST_STOPPED_AT = 170.0

    events = [
        {
            "timestamp": "1970-01-01T00:02:00+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/levels",
            "duration_ms": 10.0,
            "meta": {},
        },
        {
            "timestamp": "1970-01-01T00:02:40+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/status",
            "duration_ms": 11.0,
            "meta": {},
        },
        {
            "timestamp": "1970-01-01T00:02:46+00:00",
            "event_type": "http",
            "status": 200,
            "path": "/api/audio/levels",
            "duration_ms": 220.0,
            "meta": {},
        },
    ]

    summary = load_test._build_server_rest_summary(events)

    assert summary["total_requests"] == 2
    assert summary["p95_ms"] == 11.0
    assert summary["ignored_tail_events"] == 1


def test_server_rest_gate_reports_tail_window_note():
    failed, reasons, notes = load_test._evaluate_rest_gate(
        {"sample_count": 12, "p95_ms": 20.0, "failures": 0},
        server_summary={
            "total_requests": 400,
            "p95_ms": 22.5,
            "p99_ms": 120.0,
            "error_rate_percent": 0.0,
            "ignored_tail_events": 17,
        },
    )

    assert failed is False
    assert reasons == []
    assert any("Excluded 17 tail event" in note for note in notes)


def test_fetch_server_rest_summary_prefers_recorded_session(monkeypatch):
    load_test._TEST_STARTED_AT = 100.0
    load_test._TEST_STOPPED_AT = 170.0
    load_test._OBSERVATORY_SESSION_ID = "session-1"

    class _FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(self._payload).encode("utf-8")

    captured_urls: list[str] = []

    def _fake_urlopen(req, timeout=5.0):
        captured_urls.append(req.full_url)
        return _FakeResponse(
            {
                "events": [
                    {
                        "timestamp": "1970-01-01T00:02:00+00:00",
                        "event_type": "http",
                        "status": 200,
                        "path": "/api/audio/levels",
                        "duration_ms": 10.0,
                        "meta": {},
                    },
                    {
                        "timestamp": "1970-01-01T00:02:40+00:00",
                        "event_type": "http",
                        "status": 200,
                        "path": "/api/audio/status",
                        "duration_ms": 11.0,
                        "meta": {},
                    },
                ]
            }
        )

    monkeypatch.setattr(load_test.urlrequest, "urlopen", _fake_urlopen)

    summary = load_test._fetch_server_rest_summary("http://example.test")

    assert summary is not None
    assert summary["total_requests"] == 2
    assert summary["p95_ms"] == 11.0
    assert captured_urls == [
        "http://example.test/api/observatory/traffic/sessions/session-1"
    ]

    load_test._OBSERVATORY_SESSION_ID = ""
