"""Tests for the State Authority public API routes."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.state_authority import router


def _client() -> TestClient:
    """Mount the router on a bare FastAPI app so these tests do not pull the
    entire app.main stack (which requires a full config/database fixture)."""
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


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
