"""Retirement shim for legacy MIDI v1 routers.

Worklist: T2459-H5 (slice 12 — explicit v1 retirement flow).

When ``MAP2_MIDI_LEGACY_RETIRED`` is truthy, ``wrap_legacy_router`` returns a
catch-all shim router that responds with HTTP 410 Gone for every path the
original legacy router exposed. When the flag is unset/falsy (default) it
returns the original router unchanged so behavior matches the pre-retirement
deprecation window.
"""

from __future__ import annotations

import os
from typing import Iterable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


_TRUTHY = {"1", "true", "yes", "on"}

# Fixed sunset date for the deprecation window. Re-evaluated when the flag
# flips to True in production.
SUNSET_HEADER = "Wed, 01 Jul 2026 00:00:00 GMT"
SUCCESSOR_PREFIX = "/api/v2/midi"


def is_legacy_midi_retired() -> bool:
    """Return True when MAP2_MIDI_LEGACY_RETIRED selects the 410-Gone path."""
    return os.environ.get("MAP2_MIDI_LEGACY_RETIRED", "").strip().lower() in _TRUTHY


def _retired_response(request: Request) -> JSONResponse:
    body = {
        "error": {
            "code": "midi_v1_retired",
            "message": f"{request.url.path} retired; use {SUCCESSOR_PREFIX}/...",
            "details": {"replacement_prefix": SUCCESSOR_PREFIX},
        }
    }
    headers = {
        "Sunset": SUNSET_HEADER,
        "Link": f"<{SUCCESSOR_PREFIX}>; rel=\"successor-version\"",
        "Deprecation": "true",
    }
    return JSONResponse(status_code=410, content=body, headers=headers)


def _collect_legacy_paths(legacy_router: APIRouter) -> list[str]:
    """Return every path the legacy router exposes (deduped, sorted)."""
    paths: set[str] = set()
    for route in legacy_router.routes:
        path = getattr(route, "path", None)
        if path:
            paths.add(path)
    return sorted(paths)


def _build_retired_router(
    legacy_router: APIRouter,
    *,
    methods: Iterable[str] = ("GET", "POST", "PUT", "DELETE", "PATCH"),
) -> APIRouter:
    """Build a sub-router that returns 410 for every path from ``legacy_router``."""
    router = APIRouter()
    method_list = list(methods)
    for path in _collect_legacy_paths(legacy_router):
        router.add_api_route(
            path,
            _retired_response,
            methods=method_list,
            deprecated=True,
            include_in_schema=False,
        )
    return router


def include_legacy_midi_router(parent: APIRouter, legacy_router: APIRouter) -> None:
    """Mount ``legacy_router`` on ``parent`` honoring the retirement flag."""
    if is_legacy_midi_retired():
        parent.include_router(_build_retired_router(legacy_router))
    else:
        parent.include_router(legacy_router, deprecated=True)
