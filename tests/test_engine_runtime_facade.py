from __future__ import annotations

import pytest

from app.services import engine_runtime_facade as facade


class _FakeService:
    def __init__(self, *, is_available: bool = True, engine=None):
        self.is_available = is_available
        self.engine = engine


def test_require_engine_service_returns_service(monkeypatch):
    service = _FakeService(is_available=True)
    monkeypatch.setattr(facade, "get_engine_service", lambda: service)

    assert facade.require_engine_service() is service


def test_require_engine_service_raises_when_unavailable(monkeypatch):
    monkeypatch.setattr(facade, "get_engine_service", lambda: _FakeService(is_available=False))

    with pytest.raises(Exception) as exc:
        facade.require_engine_service()

    assert exc.value.status_code == 503


def test_require_initialized_engine_returns_service_and_engine(monkeypatch):
    engine = object()
    service = _FakeService(is_available=True, engine=engine)
    monkeypatch.setattr(facade, "get_engine_service", lambda: service)

    returned_service, returned_engine = facade.require_initialized_engine()

    assert returned_service is service
    assert returned_engine is engine
