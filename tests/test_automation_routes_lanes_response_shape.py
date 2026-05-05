"""Regression test for automation /lanes response shape.

The endpoint at ``app/routes/automation.py::list_lanes`` was annotated
``Dict[str, List[str]]`` while the body returned ``{"parameters": [...],
"count": int}``. FastAPI uses the return annotation as the response
model, so ``count`` (an int) failed Pydantic validation against
``List[str]`` and every call raised ``ResponseValidationError`` with
``'list_type', input: 0``. The error fired on every request and was
visible in the production journal as the last logged exception
before a 24+h asyncio-loop wedge (2026-05-04 19:01:00 UTC-4).

This test exercises the route through the FastAPI app so a future
regression that re-tightens the annotation immediately fails CI.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import automation


def _build_app() -> FastAPI:
    """The router already declares ``prefix="/api/automation"``; mount
    it without an outer prefix to avoid path doubling."""
    app = FastAPI()
    app.include_router(automation.router)
    return app


def test_list_lanes_returns_200_with_count_int() -> None:
    """The endpoint must return 200 with ``count`` as an int and
    ``parameters`` as a list — not a 500 ResponseValidationError."""
    app = _build_app()
    client = TestClient(app)

    resp = client.get("/api/automation/lanes")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, dict)
    assert "parameters" in body and isinstance(body["parameters"], list)
    assert "count" in body and isinstance(body["count"], int)
    assert body["count"] == len(body["parameters"])


def test_list_lanes_handler_annotation_is_not_list_str() -> None:
    """Pin against the original buggy annotation re-appearing."""
    import typing

    hints = typing.get_type_hints(automation.list_lanes)
    return_hint = hints.get("return")
    # The exact accepted form is ``Dict[str, Any]``; any narrowing back
    # to ``Dict[str, List[str]]`` must trip this guard.
    assert return_hint is not None
    origin = typing.get_origin(return_hint)
    args = typing.get_args(return_hint)
    assert origin is dict
    assert len(args) == 2
    key_type, value_type = args
    assert key_type is str
    # Any (or object) is fine; List[str] is the regression we ban.
    forbidden = (typing.List[str], list[str])
    assert value_type not in forbidden, (
        f"list_lanes return annotation regressed to {value_type!r}; "
        "this re-introduces the ResponseValidationError documented in "
        "this test's docstring."
    )
