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


def test_normalize_landing_tiles_deduplicates_and_filters_invalid_values():
    normalized = special_settings._normalize_landing_tiles([
        {"route": "/labs", "size": "medium"},
        {"route": " /labs ", "size": "large"},
        {"route": "/", "size": "large"},
        {"route": "/platforms/overview", "size": "giant"},
        {"route": "/midi-hub", "size": "small"},
        {"route": "/midi-hub", "size": "medium"},
        {"route": "invalid", "size": "small"},
        {"route": "/artifacts"},
    ])

    assert normalized == [
        {"route": "/labs", "size": "medium"},
        {"route": "/midi-hub", "size": "small"},
        {"route": "/artifacts", "size": "medium"},
    ]


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


def test_normalize_snapshot_setlist_order_filters_invalid_values():
    normalized = special_settings._normalize_snapshot_setlist_order([9, " 7 ", 0, -2, True, "bad", 9, 11])

    assert normalized == [9, 7, 11]


def test_normalize_snapshot_editor_signal_canvas_settings():
    assert special_settings._normalize_snapshot_editor_flow_animation(" packet ") == "packet"
    assert special_settings._normalize_snapshot_editor_flow_animation("bad") == "cascade"
    assert special_settings._normalize_snapshot_editor_grid_backdrop("off") is False
    assert special_settings._normalize_snapshot_editor_grid_backdrop("yes") is True
    assert special_settings._normalize_snapshot_editor_node_shape(" hex ") == "hex"
    assert special_settings._normalize_snapshot_editor_node_shape("circle") == "square"


def test_get_special_settings_defaults_to_pinned_routes_when_missing(monkeypatch):
    @asynccontextmanager
    async def _fake_session_ctx():
        yield object()

    settings = SimpleNamespace(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        pinned_routes=None,
        landing_tiles=[{"route": "/labs", "size": "medium"}],
        snapshot_setlist_mode=True,
        snapshot_setlist_order=[12, "15", 12, 0],
        snapshot_editor_flow_animation="packet",
        snapshot_editor_grid_backdrop=False,
        snapshot_editor_node_shape="hex",
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
    assert [tile.model_dump() for tile in response.landing_tiles] == [{"route": "/labs", "size": "medium"}]
    assert response.snapshot_setlist_mode is True
    assert response.snapshot_setlist_order == [12, 15]
    assert response.snapshot_editor_flow_animation == "packet"
    assert response.snapshot_editor_grid_backdrop is False
    assert response.snapshot_editor_node_shape == "hex"
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
        landing_tiles=[],
        snapshot_setlist_mode=False,
        snapshot_setlist_order=[],
        snapshot_editor_flow_animation="cascade",
        snapshot_editor_grid_backdrop=True,
        snapshot_editor_node_shape="square",
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
                landing_tiles=[
                    {"route": "/labs", "size": "large"},
                    {"route": "/labs", "size": "small"},
                    {"route": "/platforms/overview", "size": "medium"},
                    {"route": "/", "size": "large"},
                ],
                snapshot_setlist_mode=True,
                snapshot_setlist_order=[5, "7", 5, 0],
                snapshot_editor_flow_animation="scan",
                snapshot_editor_grid_backdrop=False,
                snapshot_editor_node_shape="rounded",
                last_active_node=" node-b ",
            )
        )
    )

    assert settings.pinned_routes == ["/grid", "/mpx1"]
    assert settings.landing_tiles == [
        {"route": "/labs", "size": "large"},
        {"route": "/platforms/overview", "size": "medium"},
    ]
    assert settings.snapshot_setlist_mode is True
    assert settings.snapshot_setlist_order == [5, 7]
    assert settings.snapshot_editor_flow_animation == "scan"
    assert settings.snapshot_editor_grid_backdrop is False
    assert settings.snapshot_editor_node_shape == "rounded"
    assert settings.menu_location == "hidden"
    assert settings.last_active_node == "node-b"
    assert response.menu_location == "hidden"
    assert response.pinned_routes == ["/grid", "/mpx1"]
    assert [tile.model_dump() for tile in response.landing_tiles] == [
        {"route": "/labs", "size": "large"},
        {"route": "/platforms/overview", "size": "medium"},
    ]
    assert response.snapshot_setlist_mode is True
    assert response.snapshot_setlist_order == [5, 7]
    assert response.snapshot_editor_flow_animation == "scan"
    assert response.snapshot_editor_grid_backdrop is False
    assert response.snapshot_editor_node_shape == "rounded"
    assert response.last_active_node == "node-b"
    assert response.enabled is True


def test_update_request_accepts_legacy_promoted_routes_field():
    request = SpecialSettingsUpdateRequest(
        enabled=True,
        hidden_plugins=[],
        menu_location="top-nav",
        promoted_advanced_routes=["/welcome", "/grid", "bad"],
        **{
            "snapshot_editor.flow_animation": "pulse",
            "snapshot_editor.grid_backdrop": False,
            "snapshot_editor.node_shape": "hex",
        },
    )

    assert request.pinned_routes == ["/welcome", "/grid", "bad"]
    assert request.snapshot_editor_flow_animation == "pulse"
    assert request.snapshot_editor_grid_backdrop is False
    assert request.snapshot_editor_node_shape == "hex"
