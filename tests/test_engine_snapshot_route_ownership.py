from app.routes import engine as engine_routes
from app.routes import snapshots as snapshot_routes


def _paths(router) -> set[str]:
    return {route.path for route in router.routes}


def test_snapshot_listing_lives_only_on_snapshot_router():
    engine_paths = _paths(engine_routes.router)
    snapshot_paths = _paths(snapshot_routes.router)

    assert "/api/engine/snapshots" not in engine_paths
    assert "/api/engine/snapshots" in snapshot_paths
