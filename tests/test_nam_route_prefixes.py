from fastapi.routing import APIRoute

from app.routes import nam as nam_routes
from app.routes import nam_models as nam_library_routes


def _paths(router) -> set[str]:
    return {route.path for route in router.routes if isinstance(route, APIRoute)}


def test_nam_library_routes_use_distinct_prefixes_from_primary_nam_router():
    primary_paths = _paths(nam_routes.router)
    library_paths = _paths(nam_library_routes.router)

    assert "/api/nam/upload" in primary_paths
    assert "/api/nam/models" in primary_paths
    assert "/api/nam/library/upload" in library_paths
    assert "/api/nam/library/" in library_paths
    assert primary_paths.isdisjoint(library_paths)
