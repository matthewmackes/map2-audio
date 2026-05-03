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

from fastapi import APIRouter, Depends, Request, Response
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


def _wrap_legacy_with_runtime_headers(legacy_router: APIRouter) -> APIRouter:
    """Wrap a legacy router so every response carries the deprecation
    advisory headers at runtime.

    FastAPI dependency injection delivers the underlying ``Response``
    object via ``response: Response`` parameter (the import must come
    from ``fastapi``, not ``starlette.responses``; FastAPI's runtime
    type-introspection treats the starlette type as a query
    parameter and rejects the request with 422). Mutating
    ``response.headers`` in the dep's body propagates to the final
    response that FastAPI builds for the route.
    """
    wrapper = APIRouter()

    async def _inject_deprecation_headers(response: Response) -> None:
        response.headers["Sunset"] = SUNSET_HEADER
        response.headers["Link"] = f"<{SUCCESSOR_PREFIX}>; rel=\"successor-version\""
        response.headers["Deprecation"] = "true"

    wrapper.include_router(
        legacy_router,
        deprecated=True,
        dependencies=[Depends(_inject_deprecation_headers)],
    )
    return wrapper


def include_legacy_midi_router(parent: APIRouter, legacy_router: APIRouter) -> None:
    """Mount ``legacy_router`` on ``parent`` honoring the retirement flag.

    Pre-retirement (default): the legacy router stays mounted with
    `deprecated=True`, AND every response carries the runtime
    deprecation advisory headers (Sunset / Link / Deprecation).

    Post-retirement (`MAP2_MIDI_LEGACY_RETIRED=1`): the legacy router
    is replaced with a 410-Gone shim that responds on every path
    with the same advisory headers + the canonical error envelope.
    """
    if is_legacy_midi_retired():
        parent.include_router(_build_retired_router(legacy_router))
    else:
        parent.include_router(_wrap_legacy_with_runtime_headers(legacy_router))


# ---------------------------------------------------------------------------
# T2459-H5 Slice 15 — operator-visible retirement schedule.
# ---------------------------------------------------------------------------
#
# When the legacy MIDI v1 routers are still mounted in deprecation mode
# (`MAP2_MIDI_LEGACY_RETIRED` unset / falsy), operators have no in-band
# signal for *when* the 410-Gone flip will land. The schedule endpoint
# below surfaces the deprecation window state — flag value, sunset
# date, replacement prefix, and a "days remaining" hint computed
# against the system clock — so the operator UI can render a Carbon
# `InlineNotification` ("MIDI v1 retires in N days") on the relevant
# pages.

import datetime as _dt
import email.utils as _email_utils
from fastapi import APIRouter as _APIRouter

retirement_status_router = _APIRouter(tags=["MIDI"])


def _parse_sunset_header(header: str) -> _dt.datetime | None:
    """Parse the IETF HTTP date format used in the Sunset header.

    Returns a UTC-aware datetime or None on parse failure.
    """
    try:
        parsed = _email_utils.parsedate_to_datetime(header)
    except (TypeError, ValueError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
    return parsed.astimezone(_dt.timezone.utc)


def _retirement_status_payload() -> dict:
    """Build the retirement-status envelope returned by the REST endpoint."""
    retired = is_legacy_midi_retired()
    sunset_dt = _parse_sunset_header(SUNSET_HEADER)
    now = _dt.datetime.now(_dt.timezone.utc)
    days_remaining: int | None = None
    if sunset_dt is not None and not retired:
        delta = sunset_dt - now
        # Negative delta = sunset has passed but the flag hasn't been
        # flipped yet; the operator surface should treat that as
        # "0 days, retirement overdue".
        days_remaining = max(0, delta.days)
    return {
        "retired": retired,
        "sunset": SUNSET_HEADER,
        "sunset_iso": sunset_dt.isoformat() if sunset_dt else None,
        "successor_prefix": SUCCESSOR_PREFIX,
        "now": now.isoformat(),
        "days_remaining": days_remaining,
        "flag_env_var": "MAP2_MIDI_LEGACY_RETIRED",
    }


@retirement_status_router.get(
    "/api/v2/midi/legacy_retirement_status",
    summary="MIDI v1 legacy-route retirement schedule + flag state",
)
async def get_midi_legacy_retirement_status() -> dict:
    """T2459-H5 Slice 15 — surface the retirement window state.

    Returns the deprecation-window metadata operators need to schedule
    their migration off the legacy `/api/v1/midi/...` mounts. The
    endpoint lives under the v2 prefix so it survives the 410-Gone
    flip.
    """
    return _retirement_status_payload()
