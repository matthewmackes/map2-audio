"""Tests for the State Authority public API routes."""

from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.state_authority import router


def _client() -> TestClient:
    """Mount the router on a bare FastAPI app so these tests do not pull the
    entire app.main stack (which requires a full config/database fixture)."""
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class _FakeEngine:
    """Mirrors the real ``JuceSnapshotBridgeMixin`` shape: both engine
    methods are ``async def`` and the route handlers must await them.

    Prior to 2026-05-05 these were declared as plain ``def`` here, which
    let the synchronous-call bug at ``state_authority.py::get_morph_state``
    pass tests while breaking the production endpoint with
    ``'coroutine' object has no attribute 'get'``. Keep the async shape
    so a future regression to the unawaited pattern fails this test."""

    def __init__(self, state: dict | None = None):
        self._state = state or {"x": 0.5, "y": 0.5, "configured_corners": []}
        self._last_position: tuple[float, float] | None = None

    async def set_morph_position_2d(self, x: float, y: float) -> bool:
        self._last_position = (x, y)
        self._state["x"] = max(0.0, min(1.0, x))
        self._state["y"] = max(0.0, min(1.0, y))
        return True

    async def get_morph_state(self) -> dict:
        return dict(self._state)


def test_get_uri_catalog_lists_every_canonical_entry():
    client = _client()
    response = client.get("/api/state-authority/uri-catalog")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == len(payload["entries"])
    assert payload["count"] > 40, "catalog should cover at least 40 canonical URIs"
    uris = {entry["uri"] for entry in payload["entries"]}
    assert "map2:fx:nam" in uris
    assert "map2:sys:output-limiter" in uris
    assert "map2:io:input" in uris
    assert "map2:ctrl:morph" in uris


def test_get_uri_catalog_filters_by_type():
    client = _client()
    for catalog_type in ("fx", "io", "sys", "ctrl"):
        response = client.get(f"/api/state-authority/uri-catalog/{catalog_type}")
        assert response.status_code == 200
        payload = response.json()
        for entry in payload["entries"]:
            assert entry["type"] == catalog_type


def test_get_uri_catalog_rejects_unknown_type_with_error_envelope():
    client = _client()
    response = client.get("/api/state-authority/uri-catalog/weird")
    assert response.status_code == 400
    payload = response.json()
    assert "detail" in payload
    error = payload["detail"]["error"]
    assert error["code"] == "invalid_catalog_type"
    assert "received" in error["details"]
    assert error["details"]["received"] == "weird"


def test_post_uri_resolve_canonicalizes_legacy_uri_and_returns_catalog_entry():
    client = _client()
    response = client.post(
        "/api/state-authority/uri-resolve",
        json={"uri": "map2://juce/nam"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["input"] == "map2://juce/nam"
    assert payload["canonical"] == "map2:fx:nam"
    entry = payload["entry"]
    assert entry is not None
    assert entry["uri"] == "map2:fx:nam"
    assert entry["label"] == "Neural Amp Modeler"
    assert "gain" in entry["default_parameters"]


def test_post_uri_resolve_returns_null_entry_for_uncatalogued_third_party_uri():
    client = _client()
    response = client.post(
        "/api/state-authority/uri-resolve",
        json={"uri": "http://distrho.sf.net/plugins/MVerb"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["input"] == "http://distrho.sf.net/plugins/MVerb"
    # Third-party URIs pass through unchanged
    assert payload["canonical"] == "http://distrho.sf.net/plugins/MVerb"
    assert payload["entry"] is None


def test_post_uri_resolve_rejects_empty_input():
    client = _client()
    response = client.post("/api/state-authority/uri-resolve", json={"uri": ""})
    # Pydantic rejects with 422 per FastAPI convention
    assert response.status_code == 422


def test_get_state_authority_schema_returns_monolithic_schema():
    client = _client()
    response = client.get("/api/state-authority/schema")
    assert response.status_code == 200
    schema = response.json()
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "MAP2 Snapshot Graph v2026.04"
    assert "meta" in schema["properties"]
    assert "graph" in schema["properties"]
    assert "routing" in schema["properties"]
    assert "effects_loops" in schema["properties"]
    assert "controls" in schema["properties"]
    assert "deployment" in schema["properties"]
    assert "templates" in schema["properties"]


# ---------------------------------------------------------------------------
# Morph pad — XY position setter and state getter.
# ---------------------------------------------------------------------------


def test_post_morph_position_updates_engine_and_returns_clamped_state():
    fake = _FakeEngine()
    with patch("app.routes.state_authority.get_audio_engine", return_value=fake):
        client = _client()
        response = client.post(
            "/api/state-authority/morph/position",
            json={"x": 0.25, "y": 0.75},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["x"] == 0.25
    assert body["y"] == 0.75
    assert body["configured_corners"] == []


def test_post_morph_position_returns_503_when_engine_missing():
    with patch("app.routes.state_authority.get_audio_engine", return_value=None):
        client = _client()
        response = client.post(
            "/api/state-authority/morph/position",
            json={"x": 0.5, "y": 0.5},
        )
    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "engine_unavailable"


def test_post_morph_position_returns_501_when_engine_lacks_morph_api():
    class _StaleEngine:
        pass
    with patch("app.routes.state_authority.get_audio_engine", return_value=_StaleEngine()):
        client = _client()
        response = client.post(
            "/api/state-authority/morph/position",
            json={"x": 0.5, "y": 0.5},
        )
    assert response.status_code == 501
    assert response.json()["detail"]["error"]["code"] == "morph_api_not_exposed"


def test_get_morph_state_returns_current_engine_state():
    fake = _FakeEngine(state={"x": 0.33, "y": 0.77, "configured_corners": ["A", "C"]})
    with patch("app.routes.state_authority.get_audio_engine", return_value=fake):
        client = _client()
        response = client.get("/api/state-authority/morph/state")
    assert response.status_code == 200
    body = response.json()
    assert body["x"] == 0.33
    assert body["y"] == 0.77
    assert body["configured_corners"] == ["A", "C"]


# ---------------------------------------------------------------------------
# Graph document inspector routes — live-document + snapshots/{id}/document.
# ---------------------------------------------------------------------------


class _FakeSnapshot:
    def __init__(self, id: int, name: str, document: dict, is_active: bool):
        self.id = id
        self.name = name
        self.document = document
        self.is_active = is_active


class _FakeSession:
    """Minimal async session double supporting `.execute(stmt).scalars().first()`."""

    def __init__(self, result_snapshot):
        self._result = result_snapshot

    async def execute(self, _stmt):
        class _ScalarsProxy:
            def __init__(self, inner):
                self._inner = inner
            def first(self):
                return self._inner
        class _ResultProxy:
            def __init__(self, inner):
                self._inner = inner
            def scalars(self):
                return _ScalarsProxy(self._inner)
        return _ResultProxy(self._result)


def _session_ctx(snapshot):
    """Build an async-context-manager that yields a _FakeSession."""
    class _Ctx:
        async def __aenter__(self_inner):
            return _FakeSession(snapshot)
        async def __aexit__(self_inner, *args):
            return None
    return _Ctx()


def test_get_live_document_returns_active_snapshots_graph_doc():
    doc = {
        "version": "2026.04",
        "meta": {"name": "Live Tone", "type": "snapshot"},
        "graph": {"nodes": [{"id": "n1", "uri": "map2:fx:nam"}], "edges": []},
    }
    fake = _FakeSnapshot(id=42, name="Live Tone", document=doc, is_active=True)

    with patch("app.database.get_session", return_value=_session_ctx(fake)):
        client = _client()
        response = client.get("/api/state-authority/live-document")
    assert response.status_code == 200
    body = response.json()
    assert body["snapshot_id"] == 42
    assert body["snapshot_name"] == "Live Tone"
    assert body["is_live"] is True
    assert body["document"]["meta"]["name"] == "Live Tone"
    assert body["document"]["graph"]["nodes"][0]["uri"] == "map2:fx:nam"


def test_get_live_document_returns_404_when_no_snapshot_is_active():
    with patch("app.database.get_session", return_value=_session_ctx(None)):
        client = _client()
        response = client.get("/api/state-authority/live-document")
    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "no_live_snapshot"


def test_get_snapshot_document_returns_document_for_any_snapshot_id():
    doc = {
        "version": "2026.04",
        "meta": {"name": "Archived Tone", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
    }
    fake = _FakeSnapshot(id=101, name="Archived Tone", document=doc, is_active=False)

    with patch("app.database.get_session", return_value=_session_ctx(fake)):
        client = _client()
        response = client.get("/api/state-authority/snapshots/101/document")
    assert response.status_code == 200
    body = response.json()
    assert body["snapshot_id"] == 101
    assert body["is_live"] is False
    assert body["document"]["meta"]["name"] == "Archived Tone"


def test_get_snapshot_document_returns_404_when_id_missing():
    with patch("app.database.get_session", return_value=_session_ctx(None)):
        client = _client()
        response = client.get("/api/state-authority/snapshots/999/document")
    assert response.status_code == 404
    error = response.json()["detail"]["error"]
    assert error["code"] == "snapshot_not_found"
    assert error["details"]["snapshot_id"] == 999


def test_get_snapshot_document_returns_empty_dict_when_document_is_null():
    """JSONB column defaults to {} via SQLAlchemy default=dict, but handle
    None defensively in case of a legacy row."""
    fake = _FakeSnapshot(id=50, name="Legacy", document=None, is_active=False)

    with patch("app.database.get_session", return_value=_session_ctx(fake)):
        client = _client()
        response = client.get("/api/state-authority/snapshots/50/document")
    assert response.status_code == 200
    assert response.json()["document"] == {}


def test_get_reconciliation_metrics_returns_json_and_prometheus():
    client = _client()
    response = client.get("/api/state-authority/reconciliation/metrics")
    assert response.status_code == 200
    body = response.json()
    assert "metrics" in body
    assert "prometheus" in body
    assert "map2_state_authority_local_runs_total" in body["prometheus"]
    assert body["metrics"]["local_runs_total"] == 0
