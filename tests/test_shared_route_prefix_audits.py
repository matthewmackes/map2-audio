from __future__ import annotations

from fastapi.routing import APIRoute

from app.routes import cluster_admin, cluster_flows, cluster_health, deployment, deployment_health


def _method_path_map(router) -> dict[tuple[str, str], str]:
    routes: dict[tuple[str, str], str] = {}
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted((route.methods or set()) - {"HEAD", "OPTIONS"}):
            routes[(method, route.path)] = route.endpoint.__name__
    return routes


def _duplicates(named_routers: list[tuple[str, object]]) -> list[tuple[str, str, str, str]]:
    seen: dict[tuple[str, str], tuple[str, str]] = {}
    duplicates: list[tuple[str, str, str, str]] = []

    for owner, router in named_routers:
        for key, endpoint_name in _method_path_map(router).items():
            previous = seen.get(key)
            if previous is None:
                seen[key] = (owner, endpoint_name)
                continue
            method, path = key
            duplicates.append((method, path, f"{previous[0]}.{previous[1]}", f"{owner}.{endpoint_name}"))

    return duplicates


def test_cluster_routes_with_shared_prefix_have_disjoint_method_path_pairs():
    duplicates = _duplicates(
        [
            ("cluster_admin", cluster_admin.router),
            ("cluster_flows", cluster_flows.router),
            ("cluster_health", cluster_health.router),
        ]
    )

    assert duplicates == []

    cluster_flow_paths = {path for (_method, path) in _method_path_map(cluster_flows.router)}
    cluster_health_paths = {path for (_method, path) in _method_path_map(cluster_health.router)}
    cluster_admin_paths = {path for (_method, path) in _method_path_map(cluster_admin.router)}

    assert "/api/cluster/flows/assignments" in cluster_flow_paths
    assert "/api/cluster/health" in cluster_health_paths
    assert "/api/cluster/status" in cluster_admin_paths
    assert cluster_admin_paths.isdisjoint(cluster_flow_paths)
    assert cluster_admin_paths.isdisjoint(cluster_health_paths)
    assert cluster_flow_paths.isdisjoint(cluster_health_paths)


def test_deployment_routes_with_shared_prefix_keep_health_namespace_disjoint():
    deployment_paths = _method_path_map(deployment.router)
    deployment_health_paths = _method_path_map(deployment_health.router)

    duplicates = _duplicates(
        [
            ("deployment", deployment.router),
            ("deployment_health", deployment_health.router),
        ]
    )

    assert duplicates == []
    assert ("GET", "/api/deployment/health/mode") in deployment_paths
    assert ("GET", "/api/deployment/health") in deployment_health_paths
    assert ("GET", "/api/deployment/health/checks") in deployment_health_paths
    assert ("GET", "/api/deployment/health/status") in deployment_health_paths
    assert ("GET", "/api/deployment/health/readiness") in deployment_health_paths
