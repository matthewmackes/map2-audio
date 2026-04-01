"""Shared normalization helpers for special settings persistence."""

from __future__ import annotations

from typing import Optional

DEFAULT_PINNED_ROUTES: list[str] = []
DEFAULT_LANDING_TILES: list[dict[str, str]] = []
DEFAULT_MENU_LOCATION = "hidden"
LANDING_TILE_SIZES = {"small", "medium", "large"}


def is_supported_pinned_route(route: str) -> bool:
    return route.startswith("/") or route.startswith("platform:")


def is_supported_landing_tile_route(route: str) -> bool:
    return route.startswith("/") and route != "/"


def normalize_pinned_routes(routes: Optional[list]) -> list[str]:
    if not routes:
        return []

    normalized: list[str] = []
    seen: set[str] = set()

    for raw_route in routes:
        if not isinstance(raw_route, str):
            continue

        route = raw_route.strip()
        if not route or not is_supported_pinned_route(route) or route in seen:
            continue

        seen.add(route)
        normalized.append(route)

    return normalized


def normalize_landing_tiles(tiles: Optional[list]) -> list[dict[str, str]]:
    if not tiles:
        return []

    normalized: list[dict[str, str]] = []
    seen: set[str] = set()

    for raw_tile in tiles:
        if not isinstance(raw_tile, dict):
            continue

        raw_route = raw_tile.get("route")
        if not isinstance(raw_route, str):
            continue

        route = raw_route.strip()
        if not route or not is_supported_landing_tile_route(route) or route in seen:
            continue

        raw_size = raw_tile.get("size", "medium")
        if not isinstance(raw_size, str):
            continue

        size = raw_size.strip().lower() or "medium"
        if size not in LANDING_TILE_SIZES:
            continue

        seen.add(route)
        normalized.append({"route": route, "size": size})

    return normalized


def resolve_pinned_routes_from_settings(settings) -> list[str]:
    raw_routes = getattr(settings, "pinned_routes", None)
    if raw_routes is None:
        raw_routes = getattr(settings, "promoted_advanced_routes", DEFAULT_PINNED_ROUTES)
    return normalize_pinned_routes(raw_routes)


def resolve_landing_tiles_from_settings(settings) -> list[dict[str, str]]:
    return normalize_landing_tiles(getattr(settings, "landing_tiles", DEFAULT_LANDING_TILES))


def normalize_last_active_node(node_id: Optional[str]) -> Optional[str]:
    if node_id is None:
        return None
    if not isinstance(node_id, str):
        return None

    normalized = node_id.strip()
    if not normalized or normalized.lower() in {"null", "local"}:
        return None

    return normalized


def normalize_menu_location(menu_location: Optional[str]) -> str:
    if isinstance(menu_location, str) and menu_location.strip() == "mobile-only":
        return "mobile-only"
    return DEFAULT_MENU_LOCATION
