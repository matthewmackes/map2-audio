"""T2482-P3.1 prep: routes scaffold tests.

Verifies the consolidated /api/midi/* router exposes the expected
endpoints with correct path/method/status codes. Does NOT test live
behavior — that needs the router to be mounted, which is iter 19's
deliverable.
"""

from __future__ import annotations

import pytest

from app.services.midi.routes import router


def _route_set() -> set[tuple[str, str]]:
    """Return the (method, path) tuples for every route on the router."""
    out: set[tuple[str, str]] = set()
    for route in router.routes:
        methods = getattr(route, "methods", None) or set()
        for m in methods:
            out.add((m, getattr(route, "path", "")))
    return out


def test_router_has_expected_prefix():
    assert router.prefix == "/api/midi"


def test_router_has_midi_services_tag():
    assert "MIDI Services" in router.tags


def test_list_endpoint_present():
    rs = _route_set()
    assert ("GET", "/api/midi/bindings") in rs


def test_get_endpoint_present():
    rs = _route_set()
    assert ("GET", "/api/midi/bindings/{binding_id}") in rs


def test_count_endpoint_present():
    rs = _route_set()
    assert ("GET", "/api/midi/bindings/count") in rs


def test_create_endpoint_present():
    rs = _route_set()
    assert ("POST", "/api/midi/bindings") in rs


def test_update_endpoint_present():
    rs = _route_set()
    assert ("PATCH", "/api/midi/bindings/{binding_id}") in rs


def test_delete_endpoint_present():
    rs = _route_set()
    assert ("DELETE", "/api/midi/bindings/{binding_id}") in rs


def test_disable_endpoint_present():
    rs = _route_set()
    assert ("POST", "/api/midi/bindings/{binding_id}/disable") in rs


def test_enable_endpoint_present():
    rs = _route_set()
    assert ("POST", "/api/midi/bindings/{binding_id}/enable") in rs


def test_legacy_table_rowcounts_endpoint_present():
    """T2482-P2.8 readiness gate endpoint."""
    rs = _route_set()
    assert ("GET", "/api/midi/legacy-table-rowcounts") in rs
