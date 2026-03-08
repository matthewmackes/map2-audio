import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models import SpecialSettingsUpdateRequest
from app.routes import special_settings


def test_normalize_promoted_routes_deduplicates_and_filters_invalid_values():
    normalized = special_settings._normalize_promoted_routes(
        ["/grid", " /grid ", "", "grid", "#menu", "/welcome", 7, "/welcome"]
    )

    assert normalized == ["/grid", "/welcome"]


def test_get_special_settings_defaults_promoted_routes_when_missing(monkeypatch):
    @asynccontextmanager
    async def _fake_session_ctx():
        yield object()

    settings = SimpleNamespace(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        promoted_advanced_routes=None,
        version=3,
        last_updated=datetime.now(timezone.utc),
        updated_by_node="node-a",
    )

    async def _fake_get_special_settings_db(_session):
        return settings

    monkeypatch.setattr(special_settings, "get_session", _fake_session_ctx)
    monkeypatch.setattr(special_settings, "get_special_settings_db", _fake_get_special_settings_db)

    response = asyncio.run(special_settings.get_special_settings())

    assert response.promoted_advanced_routes == ["/welcome", "/grid"]
    assert response.version == 3


def test_update_special_settings_normalizes_promoted_routes(monkeypatch):
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
        promoted_advanced_routes=[],
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
                promoted_advanced_routes=["/grid", "invalid", "/grid", "/mpx1"],
            )
        )
    )

    assert settings.promoted_advanced_routes == ["/grid", "/mpx1"]
    assert response.promoted_advanced_routes == ["/grid", "/mpx1"]
    assert response.enabled is True
