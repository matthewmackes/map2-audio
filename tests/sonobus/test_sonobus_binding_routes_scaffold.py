"""T2521-5: SonoBus binding routes scaffold tests.

Mirrors `tests/avb/test_avb_binding_routes_scaffold.py`. Verifies the
`/api/sonobus/*` router exposes the expected endpoints with the right
method + path; does not exercise live behavior (the authority unit
tests in `test_sonobus_binding_authority.py` cover semantics; live
integration tests in `test_sonobus_binding_routes_live.py` cover the
HTTP path).
"""

from __future__ import annotations

from app.services.sonobus.binding_routes import router


def _route_set() -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for route in router.routes:
        methods = getattr(route, "methods", None) or set()
        for m in methods:
            out.add((m, getattr(route, "path", "")))
    return out


def test_router_has_expected_prefix():
    assert router.prefix == "/api/sonobus"


def test_router_has_sonobus_tag():
    assert "SonoBus" in router.tags


def test_status_endpoint_present():
    assert ("GET", "/api/sonobus/status") in _route_set()


def test_list_endpoint_present():
    assert ("GET", "/api/sonobus/bindings") in _route_set()


def test_get_endpoint_present():
    assert ("GET", "/api/sonobus/bindings/{binding_id}") in _route_set()


def test_count_endpoint_present():
    assert ("GET", "/api/sonobus/bindings/count") in _route_set()


def test_matrix_endpoint_present():
    assert ("GET", "/api/sonobus/bindings/matrix") in _route_set()


def test_cluster_matrix_endpoint_present():
    assert ("GET", "/api/sonobus/cluster/bindings/matrix") in _route_set()


def test_peers_endpoint_present():
    assert ("GET", "/api/sonobus/peers") in _route_set()


def test_groups_endpoint_present():
    assert ("GET", "/api/sonobus/groups") in _route_set()


def test_sessions_endpoint_present():
    assert ("GET", "/api/sonobus/sessions") in _route_set()


def test_profiles_endpoint_present():
    assert ("GET", "/api/sonobus/profiles") in _route_set()
    assert ("GET", "/api/sonobus/profiles/{profile_id}") in _route_set()


def test_create_endpoint_present():
    assert ("POST", "/api/sonobus/bindings") in _route_set()


def test_update_endpoint_present():
    assert ("PATCH", "/api/sonobus/bindings/{binding_id}") in _route_set()


def test_delete_endpoint_present():
    assert ("DELETE", "/api/sonobus/bindings/{binding_id}") in _route_set()


def test_disable_endpoint_present():
    assert ("POST", "/api/sonobus/bindings/{binding_id}/disable") in _route_set()


def test_enable_endpoint_present():
    assert ("POST", "/api/sonobus/bindings/{binding_id}/enable") in _route_set()
