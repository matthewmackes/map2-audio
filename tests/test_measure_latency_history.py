"""T2459-G6 — measure-latency/history endpoint tests.

Walks a tmp evidence tree to confirm the route lists prior loopback
measurements correctly: filters by pack/model, sorts most-recent
first, applies the limit, and tolerates malformed JSON gracefully.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes


@pytest.fixture
def evidence_tree(tmp_path, monkeypatch):
    """Build a fake repo-root evidence tree.

    Layout:
      tmp/
        docs/fit-for-purpose-evidence/20260425/edirol-ua/ua-1000/loopback-100000.json
        docs/fit-for-purpose-evidence/20260426/edirol-ua/ua-1000/loopback-110000.json
        docs/fit-for-purpose-evidence/20260427/edirol-ua/ua-1000/loopback-120000.json
        docs/fit-for-purpose-evidence/20260427/edirol-ua/ua-1000/broken.json
        docs/fit-for-purpose-evidence/20260427/hotone/jogg/loopback-130000.json
    """
    docs = tmp_path / "docs" / "fit-for-purpose-evidence"
    rows = [
        ("20260425", "edirol-ua", "ua-1000", "loopback-100000.json", "2026-04-25T10:00:00+00:00", 4.5),
        ("20260426", "edirol-ua", "ua-1000", "loopback-110000.json", "2026-04-26T11:00:00+00:00", 4.2),
        ("20260427", "edirol-ua", "ua-1000", "loopback-120000.json", "2026-04-27T12:00:00+00:00", 3.9),
        ("20260427", "hotone", "jogg", "loopback-130000.json", "2026-04-27T13:00:00+00:00", 5.1),
    ]
    for date_dir, pack, model, fname, ts, mean in rows:
        d = docs / date_dir / pack / model
        d.mkdir(parents=True, exist_ok=True)
        (d / fname).write_text(json.dumps({
            "timestamp": ts,
            "pack_id": pack,
            "model": model,
            "method": "synthetic",
            "mean_rtt_ms": mean,
            "p95_rtt_ms": mean + 0.4,
            "jitter_p95_ms": 0.2,
            "trials": [{"rtt_ms": mean, "peak_correlation": 0.95, "secondary_peak_ratio": 0.1}],
        }), encoding="utf-8")

    # Drop a malformed JSON file in the way of one of the lookups.
    (docs / "20260427" / "edirol-ua" / "ua-1000" / "broken.json").write_text(
        "{not valid", encoding="utf-8",
    )

    # Patch the route's __file__ resolution so the endpoint walks our
    # tmp tree instead of the real repo. Strategy: monkeypatch
    # ``Path(__file__).resolve().parents[2]`` lookup via overriding the
    # module's evidence_root computation by patching Path.
    import app.routes.devices as mod
    # The history function constructs the root via local Path imports;
    # we need a different approach — patch the module's `__file__` via
    # creating a dummy file under a path that resolves to tmp_path.
    # Easiest: monkeypatch Path so `Path(__file__).resolve().parents[2]`
    # returns tmp_path.
    real_resolve = Path.resolve
    def fake_resolve(self, *args, **kwargs):
        result = real_resolve(self, *args, **kwargs)
        if "app/routes/devices.py" in str(result):
            class _Shim:
                def __init__(self, base):
                    self._base = base
                @property
                def parents(self):
                    return [self._base, self._base, self._base]
            return _Shim(tmp_path)   # type: ignore[return-value]
        return result
    monkeypatch.setattr(Path, "resolve", fake_resolve)
    return tmp_path


@pytest.fixture
def app(evidence_tree):
    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


def test_history_lists_pack_model_in_recent_first_order(client):
    r = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "edirol-ua", "model": "ua-1000"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 3
    timestamps = [row["timestamp"] for row in body["history"]]
    assert timestamps == sorted(timestamps, reverse=True)
    assert body["history"][0]["mean_rtt_ms"] == 3.9
    assert body["history"][2]["mean_rtt_ms"] == 4.5


def test_history_filters_by_pack_and_model(client):
    r = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "hotone", "model": "jogg"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["history"][0]["mean_rtt_ms"] == 5.1


def test_history_returns_empty_for_unknown_pack(client):
    r = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "does-not-exist", "model": "missing"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body == {"history": [], "count": 0}


def test_history_limit_caps_results(client):
    r = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "edirol-ua", "model": "ua-1000", "limit": 1},
    )
    body = r.json()
    assert body["count"] == 1
    assert body["history"][0]["mean_rtt_ms"] == 3.9


def test_history_tolerates_malformed_json(client):
    """The broken.json file should be skipped, not crash the route."""
    r = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "edirol-ua", "model": "ua-1000"},
    )
    assert r.status_code == 200
    body = r.json()
    # 3 valid + 1 malformed = 3 rows.
    assert body["count"] == 3
