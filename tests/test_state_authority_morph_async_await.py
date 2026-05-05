"""Regression test for the missing-await bug in state_authority morph routes.

Before 2026-05-05, ``app/routes/state_authority.py`` had three bugs of
the same shape:

  - ``post_morph_position`` line 165: ``set_position(x, y)`` not awaited.
  - ``post_morph_position`` line 169: ``state_getter() or {}`` not awaited.
  - ``get_morph_state`` line 194: ``state_getter() or {}`` not awaited.

The real ``JuceSnapshotBridgeMixin.set_morph_position_2d`` and
``get_morph_state`` are ``async def`` and use ``asyncio.to_thread``
internally. Calling them without ``await`` returns a coroutine, and the
next line (``state.get("x", ...)``) raises
``'coroutine' object has no attribute 'get'``.

The pre-existing route-tests at ``tests/test_state_authority_routes.py``
masked the bug because their fake engine declared the methods as plain
``def``. This test pins the bug class with two complementary signals:

  1. The fake engine is verified to be ``inspect.iscoroutinefunction``
     for both methods — matches the real ``JuceSnapshotBridgeMixin``
     shape. If a future refactor weakens the fake back to ``def``, the
     pin test below catches it.

  2. A dedicated fake whose ``get_morph_state`` returns a coroutine
     drives the route end-to-end and asserts a 200, not a 500 with
     ``'coroutine' object has no attribute 'get'``.
"""

from __future__ import annotations

import inspect
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.state_authority import router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class _AsyncEngine:
    """Engine double whose morph methods are real coroutines, just like
    the real ``JuceSnapshotBridgeMixin``."""

    def __init__(self) -> None:
        self._state = {"x": 0.42, "y": 0.66, "configured_corners": ["A"]}

    async def set_morph_position_2d(self, x: float, y: float) -> bool:
        self._state["x"] = float(x)
        self._state["y"] = float(y)
        return True

    async def get_morph_state(self) -> dict:
        return dict(self._state)


def test_post_morph_position_awaits_both_engine_methods() -> None:
    """End-to-end: ``post_morph_position`` must await
    ``set_morph_position_2d`` AND ``get_morph_state``. Pre-fix this
    failed with 500 + 'coroutine' object has no attribute 'get'."""
    fake = _AsyncEngine()
    with patch("app.routes.state_authority.get_audio_engine", return_value=fake):
        client = _client()
        response = client.post(
            "/api/state-authority/morph/position",
            json={"x": 0.10, "y": 0.90},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["x"] == 0.10
    assert body["y"] == 0.90
    assert body["configured_corners"] == ["A"]


def test_get_morph_state_awaits_engine_method() -> None:
    """End-to-end: ``get_morph_state`` must await the engine getter."""
    fake = _AsyncEngine()
    with patch("app.routes.state_authority.get_audio_engine", return_value=fake):
        client = _client()
        response = client.get("/api/state-authority/morph/state")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["x"] == 0.42
    assert body["y"] == 0.66
    assert body["configured_corners"] == ["A"]


def test_morph_routes_handle_engine_method_returning_none() -> None:
    """Pin the ``or {}`` fallback that the route uses when the engine
    returns None. The ``await`` placement matters: ``await getter() or {}``
    parses as ``await(getter()) or {}`` which evaluates correctly,
    whereas the original ``getter() or {}`` returned a coroutine
    (truthy) and the ``or`` short-circuited away."""

    class _NoneEngine:
        async def set_morph_position_2d(self, x: float, y: float) -> bool:
            return True

        async def get_morph_state(self) -> dict | None:
            return None

    fake = _NoneEngine()
    with patch("app.routes.state_authority.get_audio_engine", return_value=fake):
        client = _client()
        response = client.get("/api/state-authority/morph/state")
    assert response.status_code == 200, response.text
    body = response.json()
    # Falls through to the (0.5, 0.5, []) defaults.
    assert body["x"] == 0.5
    assert body["y"] == 0.5
    assert body["configured_corners"] == []


def test_existing_fake_engine_models_real_async_shape() -> None:
    """Pin the fake at ``tests/test_state_authority_routes.py::_FakeEngine``
    against future drift back to plain ``def``. The fake's pre-2026-05-05
    sync shape is what allowed the missing-await bug to ship undetected."""
    from tests.test_state_authority_routes import _FakeEngine

    assert inspect.iscoroutinefunction(_FakeEngine.set_morph_position_2d), (
        "_FakeEngine.set_morph_position_2d must remain async to mirror "
        "the real JuceSnapshotBridgeMixin shape; see this test's "
        "docstring for context on the missing-await bug."
    )
    assert inspect.iscoroutinefunction(_FakeEngine.get_morph_state), (
        "_FakeEngine.get_morph_state must remain async to mirror "
        "the real JuceSnapshotBridgeMixin shape; see this test's "
        "docstring for context on the missing-await bug."
    )
