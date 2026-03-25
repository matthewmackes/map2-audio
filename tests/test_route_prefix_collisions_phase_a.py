from fastapi.routing import APIRoute

from app.routes import cluster_update as cluster_update_routes
from app.routes import cluster_update_hybrid as cluster_update_hybrid_routes
from app.routes import midi_cluster as midi_cluster_routes
from app.routes import midi_cluster_proxy as midi_cluster_proxy_routes


def _paths(router) -> set[str]:
    return {route.path for route in router.routes if isinstance(route, APIRoute)}


def test_cluster_update_hybrid_routes_use_distinct_prefix_from_primary_routes():
    primary_paths = _paths(cluster_update_routes.router)
    hybrid_paths = _paths(cluster_update_hybrid_routes.router)

    assert "/api/cluster/update/trigger" in primary_paths
    assert "/api/cluster/update/hybrid/application" in hybrid_paths
    assert primary_paths.isdisjoint(hybrid_paths)


def test_midi_cluster_proxy_routes_use_distinct_prefix_from_primary_routes():
    primary_paths = _paths(midi_cluster_routes.router)
    proxy_paths = _paths(midi_cluster_proxy_routes.router)

    assert "/api/midi/cluster/nodes" in primary_paths
    assert "/api/midi/cluster/proxy/nodes/{node_id}/hub/{path:path}" in proxy_paths
    assert primary_paths.isdisjoint(proxy_paths)
