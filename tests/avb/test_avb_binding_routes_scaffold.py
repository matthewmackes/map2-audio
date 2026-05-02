"""T2490-2: AVB binding routes scaffold tests.

Mirrors `tests/midi/test_routes_scaffold.py`. Verifies the
`/api/avb/bindings/*` router exposes the expected endpoints with the
right method + path; does not exercise live behavior (the authority
unit tests in `test_avb_binding_authority.py` cover semantics).
"""

from __future__ import annotations

from app.services.avb.binding_routes import router


def _route_set() -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for route in router.routes:
        methods = getattr(route, "methods", None) or set()
        for m in methods:
            out.add((m, getattr(route, "path", "")))
    return out


def test_router_has_expected_prefix():
    assert router.prefix == "/api/avb"


def test_router_has_avb_services_tag():
    assert "AVB Services" in router.tags


def test_list_endpoint_present():
    assert ("GET", "/api/avb/bindings") in _route_set()


def test_get_endpoint_present():
    assert ("GET", "/api/avb/bindings/{binding_id}") in _route_set()


def test_count_endpoint_present():
    assert ("GET", "/api/avb/bindings/count") in _route_set()


def test_create_endpoint_present():
    assert ("POST", "/api/avb/bindings") in _route_set()


def test_update_endpoint_present():
    assert ("PATCH", "/api/avb/bindings/{binding_id}") in _route_set()


def test_delete_endpoint_present():
    assert ("DELETE", "/api/avb/bindings/{binding_id}") in _route_set()


def test_disable_endpoint_present():
    assert ("POST", "/api/avb/bindings/{binding_id}/disable") in _route_set()


def test_enable_endpoint_present():
    assert ("POST", "/api/avb/bindings/{binding_id}/enable") in _route_set()
