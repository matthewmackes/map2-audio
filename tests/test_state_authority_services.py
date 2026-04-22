"""Tests for the 7 day-1 sub-service facades (plan Q50 + Q97)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.state_authority_services import (
    SnapshotActivationService,
    SnapshotCommunityService,
    SnapshotControlMapService,
    SnapshotCrudService,
    SnapshotPortabilityService,
    SnapshotRevisionService,
    SnapshotTopologyService,
    StateAuthorityServices,
    build_state_authority_services,
)


@pytest.fixture
def owner() -> MagicMock:
    """A mock SnapshotService aggregator — async methods are AsyncMocks."""
    mock = MagicMock()
    # Seed each delegated async method used by the 7 services
    for async_method in (
        "get_snapshot",
        "get_template",
        "list_snapshots",
        "list_templates",
        "create_snapshot",
        "create_template",
        "update_snapshot",
        "update_template",
        "delete_snapshot",
        "duplicate_snapshot",
        "save_snapshot_as_new",
        "get_live_snapshot",
        "get_control_plane_snapshot",
        "get_control_plane_snapshot_id",
        "activate_snapshot",
        "plan_preload_candidates_for_snapshot",
        "add_channel",
        "update_channel",
        "remove_channel",
        "create_chain",
        "rename_chain",
        "add_plugin",
        "remove_plugin",
        "reorder_plugins",
        "set_plugin_bypass",
        "set_plugin_parameters",
        "update_plugin_parameter_by_position",
        "update_routing",
        "set_morph_position",
        "export_snapshot",
        "import_snapshot_bundle",
        "export_template",
        "list_revisions",
        "restore_revision",
        "get_revision_diff",
        "replace_midi_map",
        "get_snapshot_controls",
        "update_snapshot_controls",
        "list_community_snapshots",
        "share_snapshot_to_community",
        "rate_community_snapshot",
        "record_community_download",
    ):
        setattr(mock, async_method, AsyncMock(return_value={"delegated": async_method}))
    return mock


def test_build_state_authority_services_returns_bundle_of_seven(owner):
    services = build_state_authority_services(owner)
    assert isinstance(services, StateAuthorityServices)
    assert isinstance(services.crud, SnapshotCrudService)
    assert isinstance(services.activation, SnapshotActivationService)
    assert isinstance(services.topology, SnapshotTopologyService)
    assert isinstance(services.portability, SnapshotPortabilityService)
    assert isinstance(services.revision, SnapshotRevisionService)
    assert isinstance(services.control_map, SnapshotControlMapService)
    assert isinstance(services.community, SnapshotCommunityService)


def test_crud_service_delegates_every_method(owner):
    svc = SnapshotCrudService(owner)
    async def _run():
        assert await svc.get_snapshot(1) == {"delegated": "get_snapshot"}
        assert await svc.get_template(2) == {"delegated": "get_template"}
        assert await svc.list_snapshots() == {"delegated": "list_snapshots"}
        assert await svc.list_templates() == {"delegated": "list_templates"}
        await svc.create_snapshot(name="T")
        owner.create_snapshot.assert_awaited_with(name="T")
        await svc.update_snapshot(1, name="Updated")
        owner.update_snapshot.assert_awaited_with(1, name="Updated")
        assert await svc.delete_snapshot(1) == {"delegated": "delete_snapshot"}
        assert await svc.duplicate_snapshot(1) == {"delegated": "duplicate_snapshot"}
        assert await svc.save_snapshot_as_new(1, name="Copy") == {"delegated": "save_snapshot_as_new"}
    asyncio.run(_run())


def test_activation_service_delegates_live_and_control_plane(owner):
    svc = SnapshotActivationService(owner)
    async def _run():
        assert await svc.get_live_snapshot() == {"delegated": "get_live_snapshot"}
        assert await svc.get_control_plane_snapshot() == {"delegated": "get_control_plane_snapshot"}
        assert await svc.get_control_plane_snapshot_id() == {"delegated": "get_control_plane_snapshot_id"}
        assert await svc.activate_snapshot(1) == {"delegated": "activate_snapshot"}
    asyncio.run(_run())


def test_activation_plan_preload_candidates_returns_list(owner):
    owner.plan_preload_candidates_for_snapshot = AsyncMock(return_value=[10, 11, 12])
    svc = SnapshotActivationService(owner)
    result = asyncio.run(svc.plan_preload_candidates(1, limit=3))
    assert result == [10, 11, 12]
    owner.plan_preload_candidates_for_snapshot.assert_awaited_with(1, limit=3)


def test_activation_plan_preload_candidates_absent_returns_empty(owner):
    # Remove the method so the service falls back gracefully (Q86 not yet wired)
    del owner.plan_preload_candidates_for_snapshot
    svc = SnapshotActivationService(owner)
    result = asyncio.run(svc.plan_preload_candidates(1))
    assert result == []


def test_activation_falls_back_to_load_snapshot_when_activate_missing():
    owner = MagicMock()
    del owner.activate_snapshot
    owner.load_snapshot = AsyncMock(return_value={"loaded": True})
    svc = SnapshotActivationService(owner)
    result = asyncio.run(svc.activate_snapshot(42))
    assert result == {"loaded": True}
    owner.load_snapshot.assert_awaited_with(42)


def test_topology_service_delegates_chain_and_plugin_mutations(owner):
    svc = SnapshotTopologyService(owner)
    async def _run():
        await svc.add_channel(1, {"name": "A"})
        owner.add_channel.assert_awaited_with(1, {"name": "A"})
        await svc.create_chain(1, "Lead")
        owner.create_chain.assert_awaited_with(1, "Lead")
        await svc.add_plugin(1, 10, uri="map2:fx:nam")
        owner.add_plugin.assert_awaited_with(1, 10, uri="map2:fx:nam")
        await svc.remove_plugin(1, 10, 0)
        owner.remove_plugin.assert_awaited_with(1, 10, 0)
        await svc.set_plugin_bypass(1, 10, 0, True)
        owner.set_plugin_bypass.assert_awaited_with(1, 10, 0, True)
        await svc.update_routing(1, {"mode": "series"})
        owner.update_routing.assert_awaited_with(1, {"mode": "series"})
        await svc.set_morph_position(1, 0.75)
        owner.set_morph_position.assert_awaited_with(1, 0.75)
    asyncio.run(_run())


def test_portability_service_raises_when_owner_not_wired():
    owner = MagicMock(spec=[])
    svc = SnapshotPortabilityService(owner)
    with pytest.raises(NotImplementedError):
        asyncio.run(svc.export_snapshot(1))
    with pytest.raises(NotImplementedError):
        asyncio.run(svc.import_snapshot_bundle(b""))


def test_portability_service_delegates_when_owner_is_wired(owner):
    svc = SnapshotPortabilityService(owner)
    result = asyncio.run(svc.export_snapshot(1))
    assert result == {"delegated": "export_snapshot"}


def test_revision_service_lists_and_restores(owner):
    svc = SnapshotRevisionService(owner)
    async def _run():
        await svc.list_revisions(1)
        owner.list_revisions.assert_awaited_with(1)
        await svc.restore_revision(1, 5)
        owner.restore_revision.assert_awaited_with(1, 5)
        await svc.get_revision_diff(1, 2, 5)
        owner.get_revision_diff.assert_awaited_with(1, 2, 5)
    asyncio.run(_run())


def test_revision_diff_returns_none_when_method_absent():
    owner = MagicMock()
    del owner.get_revision_diff
    svc = SnapshotRevisionService(owner)
    result = asyncio.run(svc.get_revision_diff(1, 2, 5))
    assert result is None


def test_control_map_service_replaces_midi_map(owner):
    svc = SnapshotControlMapService(owner)
    asyncio.run(svc.replace_midi_map(1, [{"cc": 74}]))
    owner.replace_midi_map.assert_awaited_with(1, [{"cc": 74}])


def test_control_map_service_uses_snapshot_controls_fallback_when_no_dedicated_getter():
    owner = MagicMock()
    del owner.get_snapshot_controls
    owner.get_snapshot = AsyncMock(return_value={"controls": {"mappings": [{"cc": 74}]}})
    svc = SnapshotControlMapService(owner)
    result = asyncio.run(svc.get_controls(1))
    assert result == {"mappings": [{"cc": 74}]}


def test_community_service_returns_empty_list_when_owner_not_wired():
    owner = MagicMock()
    del owner.list_community_snapshots
    svc = SnapshotCommunityService(owner)
    result = asyncio.run(svc.list_community_snapshots())
    assert result == []


def test_community_service_records_download_silently_when_not_wired():
    owner = MagicMock()
    del owner.record_community_download
    svc = SnapshotCommunityService(owner)
    # Must not raise
    asyncio.run(svc.record_download(1))
