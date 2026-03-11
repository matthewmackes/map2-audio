import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models import SpecialSettingsUpdateRequest
from app.routes import special_settings


def test_normalize_pinned_routes_deduplicates_and_filters_invalid_values():
    normalized = special_settings._normalize_pinned_routes(
        ["/grid", " /grid ", "", "grid", "#menu", "/welcome", 7, "/welcome"]
    )

    assert normalized == ["/grid", "/welcome"]


def test_get_special_settings_defaults_to_pinned_routes_when_missing(monkeypatch):
    @asynccontextmanager
    async def _fake_session_ctx():
        yield object()

    settings = SimpleNamespace(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        pinned_routes=None,
        promoted_advanced_routes=["/welcome", "/grid"],
        version=3,
        last_updated=datetime.now(timezone.utc),
        updated_by_node="node-a",
    )

    async def _fake_get_special_settings_db(_session):
        return settings

    monkeypatch.setattr(special_settings, "get_session", _fake_session_ctx)
    monkeypatch.setattr(special_settings, "get_special_settings_db", _fake_get_special_settings_db)

    response = asyncio.run(special_settings.get_special_settings())

    assert response.pinned_routes == ["/welcome", "/grid"]
    assert response.version == 3


def test_update_special_settings_normalizes_pinned_routes(monkeypatch):
    class _FakeSession:
        async def flush(self):
            return None

    fake_session = _FakeSession()

    @asynccontextmanager
    async def _fake_session_ctx():
        yield fake_session

    settings = SimpleNamespace(
        enabled=False,
        hidden_plugins=[],
        menu_location="top-nav",
        pinned_routes=[],
        version=1,
        last_updated=datetime.now(timezone.utc),
        updated_by_node=None,
    )

    async def _fake_get_special_settings_db(_session):
        return settings

    monkeypatch.setattr(special_settings, "CLUSTER_MODE", False)
    monkeypatch.setattr(special_settings, "get_session", _fake_session_ctx)
    monkeypatch.setattr(special_settings, "get_special_settings_db", _fake_get_special_settings_db)

    response = asyncio.run(
        special_settings.update_special_settings(
            SpecialSettingsUpdateRequest(
                enabled=True,
                hidden_plugins=["map2://plugin/a"],
                menu_location="top-nav",
                pinned_routes=["/grid", "invalid", "/grid", "/mpx1"],
            )
        )
    )

    assert settings.pinned_routes == ["/grid", "/mpx1"]
    assert response.pinned_routes == ["/grid", "/mpx1"]
    assert response.enabled is True


def test_update_request_accepts_legacy_promoted_routes_field():
    request = SpecialSettingsUpdateRequest(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        promoted_advanced_routes=["/welcome", "/grid", "bad"],
    )

    assert request.pinned_routes == ["/welcome", "/grid", "bad"]
