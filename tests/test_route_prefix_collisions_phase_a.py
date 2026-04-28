from fastapi.routing import APIRoute

from app.routes import cluster_update as cluster_update_routes
from app.routes import cluster_update_hybrid as cluster_update_hybrid_routes
from app.routes import midi_cluster as midi_cluster_routes


def _paths(router) -> set[str]:
    return {route.path for route in router.routes if isinstance(route, APIRoute)}


def test_cluster_update_hybrid_routes_use_distinct_prefix_from_primary_routes():
    primary_paths = _paths(cluster_update_routes.router)
    hybrid_paths = _paths(cluster_update_hybrid_routes.router)

    assert "/api/cluster/update/trigger" in primary_paths
    assert "/api/cluster/update/hybrid/application" in hybrid_paths
    assert primary_paths.isdisjoint(hybrid_paths)


# T2459-H7 — midi_cluster_proxy.py was deleted; the host-to-host
# protocol replaces the HTTP fan-out. The legacy prefix-collision test
# is retired alongside the module. The new cluster MIDI surfaces are
# tested in tests/test_cluster_midi_gateway.py.
