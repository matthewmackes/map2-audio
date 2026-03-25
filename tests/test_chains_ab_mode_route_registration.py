import re

from app.routes import chains_ab_mode


def _registered_route_modules() -> list[str]:
    text = open("/home/mm/map2-audio/app/main.py", "r", encoding="utf-8").read()
    match = re.search(r"route_modules\s*=\s*\[(.*?)\]", text, re.S)
    assert match is not None
    return re.findall(r"'([^']+)'", match.group(1))


def _paths() -> set[str]:
    return {route.path for route in chains_ab_mode.router.routes}


def test_chains_ab_mode_routes_are_registered_in_main():
    route_modules = _registered_route_modules()

    assert "chains_ab_mode" in route_modules


def test_chains_ab_mode_router_exposes_live_ab_endpoints():
    paths = _paths()

    assert "/api/chains/{chain_id}/duplicate" in paths
    assert "/api/chains/{chain_id}/blend" in paths
    assert "/api/chains/{chain_a_id}/compare/{chain_b_id}" in paths
    assert "/api/chains/{chain_id}/morph" in paths
