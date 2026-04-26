"""Shared normalization helpers for special settings persistence."""

from __future__ import annotations

from typing import Optional

DEFAULT_PINNED_ROUTES: list[str] = []
DEFAULT_LANDING_TILES: list[dict[str, str]] = []
DEFAULT_MENU_LOCATION = "hidden"
DEFAULT_SNAPSHOT_SETLIST_MODE = False
DEFAULT_SNAPSHOT_SETLIST_ORDER: list[int] = []
DEFAULT_SNAPSHOT_EDITOR_FLOW_ANIMATION = "cascade"
DEFAULT_SNAPSHOT_EDITOR_GRID_BACKDROP = True
DEFAULT_SNAPSHOT_EDITOR_NODE_SHAPE = "square"
DEFAULT_SNAPSHOT_PRELOAD_PINS: list[int] = []
SNAPSHOT_PRELOAD_PIN_CAP = 5
SNAPSHOT_EDITOR_FLOW_ANIMATIONS = {
    "off",
    "dashmarch",
    "pulse",
    "packet",
    "morse",
    "reverse",
    "scan",
    "shimmer",
    "heartbeat",
    "ants",
    "slow",
    "cascade",
}
SNAPSHOT_EDITOR_NODE_SHAPES = {"square", "rounded", "hex"}
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


def normalize_snapshot_setlist_mode(enabled: object) -> bool:
    return bool(enabled)


def normalize_snapshot_setlist_order(order: Optional[list]) -> list[int]:
    if not order:
        return []

    normalized: list[int] = []
    seen: set[int] = set()

    for raw_snapshot_id in order:
        if isinstance(raw_snapshot_id, bool):
            continue

        if isinstance(raw_snapshot_id, int):
            snapshot_id = raw_snapshot_id
        elif isinstance(raw_snapshot_id, str):
            raw_value = raw_snapshot_id.strip()
            if not raw_value:
                continue
            try:
                snapshot_id = int(raw_value, 10)
            except ValueError:
                continue
        else:
            continue

        if snapshot_id < 1 or snapshot_id in seen:
            continue

        seen.add(snapshot_id)
        normalized.append(snapshot_id)

    return normalized


def resolve_snapshot_setlist_mode_from_settings(settings) -> bool:
    return normalize_snapshot_setlist_mode(
        getattr(settings, "snapshot_setlist_mode", DEFAULT_SNAPSHOT_SETLIST_MODE)
    )


def resolve_snapshot_setlist_order_from_settings(settings) -> list[int]:
    return normalize_snapshot_setlist_order(
        getattr(settings, "snapshot_setlist_order", DEFAULT_SNAPSHOT_SETLIST_ORDER)
    )


def normalize_snapshot_editor_flow_animation(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in SNAPSHOT_EDITOR_FLOW_ANIMATIONS:
            return normalized
    return DEFAULT_SNAPSHOT_EDITOR_FLOW_ANIMATION


def normalize_snapshot_editor_grid_backdrop(value: object) -> bool:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return bool(value)


def normalize_snapshot_editor_node_shape(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in SNAPSHOT_EDITOR_NODE_SHAPES:
            return normalized
    return DEFAULT_SNAPSHOT_EDITOR_NODE_SHAPE


def resolve_snapshot_editor_flow_animation_from_settings(settings) -> str:
    return normalize_snapshot_editor_flow_animation(
        getattr(
            settings,
            "snapshot_editor_flow_animation",
            DEFAULT_SNAPSHOT_EDITOR_FLOW_ANIMATION,
        )
    )


def resolve_snapshot_editor_grid_backdrop_from_settings(settings) -> bool:
    return normalize_snapshot_editor_grid_backdrop(
        getattr(
            settings,
            "snapshot_editor_grid_backdrop",
            DEFAULT_SNAPSHOT_EDITOR_GRID_BACKDROP,
        )
    )


def resolve_snapshot_editor_node_shape_from_settings(settings) -> str:
    return normalize_snapshot_editor_node_shape(
        getattr(
            settings,
            "snapshot_editor_node_shape",
            DEFAULT_SNAPSHOT_EDITOR_NODE_SHAPE,
        )
    )


def normalize_snapshot_preload_pins(pins: Optional[list]) -> list[int]:
    """T2454: ordered, deduplicated, capped-at-5 list of snapshot ids the
    operator has explicitly pinned for preload. Mirrors normalize_snapshot_setlist_order
    semantics — accepts ints or string-coerced ints, drops invalid entries, preserves
    the operator's chosen order."""
    if not pins:
        return []

    normalized: list[int] = []
    seen: set[int] = set()

    for raw_snapshot_id in pins:
        if isinstance(raw_snapshot_id, bool):
            continue

        if isinstance(raw_snapshot_id, int):
            snapshot_id = raw_snapshot_id
        elif isinstance(raw_snapshot_id, str):
            raw_value = raw_snapshot_id.strip()
            if not raw_value:
                continue
            try:
                snapshot_id = int(raw_value, 10)
            except ValueError:
                continue
        else:
            continue

        if snapshot_id < 1 or snapshot_id in seen:
            continue

        seen.add(snapshot_id)
        normalized.append(snapshot_id)
        if len(normalized) >= SNAPSHOT_PRELOAD_PIN_CAP:
            break

    return normalized


def resolve_snapshot_preload_pins_from_settings(settings) -> list[int]:
    return normalize_snapshot_preload_pins(
        getattr(settings, "snapshot_preload_pins", DEFAULT_SNAPSHOT_PRELOAD_PINS)
    )


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
