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


def test_normalize_last_active_node_coerces_local_and_blank_values():
    assert special_settings._normalize_last_active_node(" node-b ") == "node-b"
    assert special_settings._normalize_last_active_node("all") == "all"
    assert special_settings._normalize_last_active_node("local") is None
    assert special_settings._normalize_last_active_node(" null ") is None
    assert special_settings._normalize_last_active_node("") is None


def test_normalize_menu_location_hides_legacy_top_nav_values():
    assert special_settings._normalize_menu_location("top-nav") == "hidden"
    assert special_settings._normalize_menu_location(" hidden ") == "hidden"
    assert special_settings._normalize_menu_location("mobile-only") == "mobile-only"
    assert special_settings._normalize_menu_location("unexpected") == "hidden"


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
        last_active_node="node-b",
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
    assert response.menu_location == "hidden"
    assert response.last_active_node == "node-b"
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
        menu_location="hidden",
        pinned_routes=[],
        last_active_node=None,
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
                last_active_node=" node-b ",
            )
        )
    )

    assert settings.pinned_routes == ["/grid", "/mpx1"]
    assert settings.menu_location == "hidden"
    assert settings.last_active_node == "node-b"
    assert response.menu_location == "hidden"
    assert response.pinned_routes == ["/grid", "/mpx1"]
    assert response.last_active_node == "node-b"
    assert response.enabled is True


def test_update_request_accepts_legacy_promoted_routes_field():
    request = SpecialSettingsUpdateRequest(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        promoted_advanced_routes=["/welcome", "/grid", "bad"],
    )

    assert request.pinned_routes == ["/welcome", "/grid", "bad"]
