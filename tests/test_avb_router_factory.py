from types import SimpleNamespace

import pytest

from app.services.avb import avb_router
from app.services import juce_engine_service


@pytest.fixture(autouse=True)
def _reset_router_singleton():
    avb_router._avb_router = None
    yield
    avb_router._avb_router = None


def test_get_avb_router_tolerates_missing_engine_bindings(monkeypatch):
    def _raise_engine_error():
        raise RuntimeError("engine unavailable")

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", _raise_engine_error)

    router = avb_router.get_avb_router()

    assert isinstance(router, avb_router.AvbRouter)
    assert router.engine_service is None
    assert router.avdecc_entity is None
    assert avb_router.get_avb_router() is router


def test_get_avb_router_initializes_with_engine_and_avdecc(monkeypatch):
    avdecc_entity = object()
    engine = SimpleNamespace(get_avdecc_entity=lambda: avdecc_entity)
    engine_service = SimpleNamespace(_engine=engine)

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: engine_service)

    router = avb_router.get_avb_router()

    assert router.engine_service is engine_service
    assert router.avdecc_entity is avdecc_entity


def test_get_avb_router_late_binds_existing_singleton(monkeypatch):
    router = avb_router.AvbRouter(engine_service=None, avdecc_entity=None)
    avb_router._avb_router = router

    avdecc_entity = object()
    engine = SimpleNamespace(avdeccEntity=avdecc_entity)
    engine_service = SimpleNamespace(_engine=engine)

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: engine_service)

    resolved = avb_router.get_avb_router()

    assert resolved is router
    assert resolved.engine_service is engine_service
    assert resolved.avdecc_entity is avdecc_entity
