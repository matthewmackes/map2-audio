"""MAP2 State Authority — day-1 sub-service facades.

Plan Q50 locks "direct sub-services — no facade; routes call sub-services
directly" as the architectural contract. This module lands the **7 day-1
services** specified in Q97 as thin, focused wrappers over the existing
`SnapshotService` aggregator. Each service exposes the methods for exactly
one responsibility domain; implementation stays in the battle-tested
`SnapshotEditorMixin` / `SnapshotRuntimeMixin` / `SnapshotPersistenceMixin`
so Phase 2b can land without a risky rewrite of the underlying persistence
layer. Routes can import any of these sub-services directly and call its
domain methods without knowing the mixin composition.

Services (plan Q97 — full set of 7 from the start):

1. SnapshotCrudService            — create, read, update, delete, list,
                                    duplicate, save-as-new
2. SnapshotActivationService      — activate, live-snapshot, preflight,
                                    preload candidate planning
3. SnapshotTopologyService        — chain/channel/plugin/routing mutations
                                    on a graph doc
4. SnapshotPortabilityService     — import, export, bundle (ZIP), asset
                                    registry interactions
5. SnapshotRevisionService        — history, diff, rollback, auto-summary
6. SnapshotControlMapService      — unified control mapping CRUD
7. SnapshotCommunityService       — share, browse, rate, download tracking,
                                    template community workflows

Plus the four support services already in the scaffold
(`state_authority_activation_service`,
`state_authority_reconciliation_service`,
`state_authority_revision_service`,
`state_authority_document_service`) which this module does NOT replace —
it composes over them when needed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass(frozen=True)
class _ServiceContext:
    """Shared reference into the underlying SnapshotService aggregator."""

    owner: Any  # SnapshotService instance


class SnapshotCrudService:
    """CRUD + list + duplicate + save-as-new for snapshots and templates."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def get_snapshot(self, snapshot_id: int) -> dict[str, Any] | None:
        return await self._ctx.owner.get_snapshot(snapshot_id)

    async def get_template(self, template_id: int) -> dict[str, Any] | None:
        return await self._ctx.owner.get_template(template_id)

    async def list_snapshots(self) -> list[dict[str, Any]]:
        return await self._ctx.owner.list_snapshots()

    async def list_templates(self) -> list[dict[str, Any]]:
        return await self._ctx.owner.list_templates()

    async def create_snapshot(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.create_snapshot(*args, **kwargs)

    async def create_template(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.create_template(*args, **kwargs)

    async def update_snapshot(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.update_snapshot(*args, **kwargs)

    async def update_template(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.update_template(*args, **kwargs)

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        return await self._ctx.owner.delete_snapshot(snapshot_id)

    async def duplicate_snapshot(self, snapshot_id: int) -> dict[str, Any] | None:
        return await self._ctx.owner.duplicate_snapshot(snapshot_id)

    async def save_snapshot_as_new(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.save_snapshot_as_new(*args, **kwargs)


class SnapshotActivationService:
    """Activation lifecycle: live state, preflight, preload planning."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def get_live_snapshot(self) -> dict[str, Any] | None:
        return await self._ctx.owner.get_live_snapshot()

    async def get_control_plane_snapshot(self) -> dict[str, Any] | None:
        return await self._ctx.owner.get_control_plane_snapshot()

    async def get_control_plane_snapshot_id(self) -> int | None:
        return await self._ctx.owner.get_control_plane_snapshot_id()

    async def activate_snapshot(self, snapshot_id: int, **kwargs: Any) -> dict[str, Any] | None:
        if hasattr(self._ctx.owner, "activate_snapshot"):
            return await self._ctx.owner.activate_snapshot(snapshot_id, **kwargs)
        if hasattr(self._ctx.owner, "load_snapshot"):
            return await self._ctx.owner.load_snapshot(snapshot_id, **kwargs)
        raise NotImplementedError("SnapshotService must expose activate_snapshot or load_snapshot")

    async def plan_preload_candidates(self, snapshot_id: int, limit: int = 3) -> list[int]:
        """Return up to `limit` snapshot ids to background-stage (Q86 — top 3
        by activation history). Delegates when the owner supports it; falls
        back to an empty list when the feature isn't wired to this aggregator
        instance."""
        method = getattr(self._ctx.owner, "plan_preload_candidates_for_snapshot", None)
        if method is None:
            return []
        candidates = await method(snapshot_id, limit=limit)
        return list(candidates or [])


class SnapshotTopologyService:
    """Topology mutations: channels, chains, plugins, routing, morph."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def add_channel(self, snapshot_id: int, payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
        return await self._ctx.owner.add_channel(snapshot_id, payload)

    async def update_channel(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.update_channel(*args, **kwargs)

    async def remove_channel(self, snapshot_id: int, channel_id: int) -> dict[str, Any] | None:
        return await self._ctx.owner.remove_channel(snapshot_id, channel_id)

    async def create_chain(self, snapshot_id: int, name: str) -> dict[str, Any] | None:
        return await self._ctx.owner.create_chain(snapshot_id, name)

    async def rename_chain(self, snapshot_id: int, chain_id: int, name: str) -> dict[str, Any] | None:
        return await self._ctx.owner.rename_chain(snapshot_id, chain_id, name)

    async def add_plugin(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.add_plugin(*args, **kwargs)

    async def remove_plugin(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.remove_plugin(*args, **kwargs)

    async def reorder_plugins(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.reorder_plugins(*args, **kwargs)

    async def set_plugin_bypass(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.set_plugin_bypass(*args, **kwargs)

    async def set_plugin_parameters(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.set_plugin_parameters(*args, **kwargs)

    async def update_plugin_parameter_by_position(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        return await self._ctx.owner.update_plugin_parameter_by_position(*args, **kwargs)

    async def update_routing(self, snapshot_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        return await self._ctx.owner.update_routing(snapshot_id, payload)

    async def set_morph_position(self, snapshot_id: int, morph_position: float) -> dict[str, Any] | None:
        return await self._ctx.owner.set_morph_position(snapshot_id, morph_position)


class SnapshotPortabilityService:
    """Import, export, asset bundle (ZIP) workflows."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def export_snapshot(self, snapshot_id: int, **kwargs: Any) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "export_snapshot", None)
        if method is None:
            raise NotImplementedError("export_snapshot not wired on SnapshotService")
        return await method(snapshot_id, **kwargs)

    async def import_snapshot_bundle(self, payload: Any, **kwargs: Any) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "import_snapshot_bundle", None)
        if method is None:
            raise NotImplementedError("import_snapshot_bundle not wired on SnapshotService")
        return await method(payload, **kwargs)

    async def export_template(self, template_id: int, **kwargs: Any) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "export_template", None)
        if method is None:
            raise NotImplementedError("export_template not wired on SnapshotService")
        return await method(template_id, **kwargs)


class SnapshotRevisionService:
    """Revision history: list, diff, rollback, auto-summary (Q20 + Q31 + Q35)."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def list_revisions(self, snapshot_id: int) -> list[dict[str, Any]] | None:
        return await self._ctx.owner.list_revisions(snapshot_id)

    async def restore_revision(self, snapshot_id: int, revision_number: int) -> dict[str, Any] | None:
        return await self._ctx.owner.restore_revision(snapshot_id, revision_number)

    async def get_revision_diff(
        self, snapshot_id: int, from_revision: int, to_revision: int
    ) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "get_revision_diff", None)
        if method is None:
            return None
        return await method(snapshot_id, from_revision, to_revision)


class SnapshotControlMapService:
    """Unified control mapping CRUD (plan Q13 + Q49 + Q53)."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def replace_midi_map(
        self, snapshot_id: int, entries: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        return await self._ctx.owner.replace_midi_map(snapshot_id, entries)

    async def get_controls(self, snapshot_id: int) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "get_snapshot_controls", None)
        if method is not None:
            return await method(snapshot_id)
        snapshot = await self._ctx.owner.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        return snapshot.get("controls") or {}

    async def update_controls(
        self, snapshot_id: int, controls: dict[str, Any]
    ) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "update_snapshot_controls", None)
        if method is not None:
            return await method(snapshot_id, controls)
        # Fallback: use update_snapshot with a controls patch
        return await self._ctx.owner.update_snapshot(snapshot_id, controls_payload=controls)


class SnapshotCommunityService:
    """Community share / browse / rate / download tracking (plan Q74)."""

    def __init__(self, owner: Any) -> None:
        self._ctx = _ServiceContext(owner=owner)

    async def list_community_snapshots(self, **filters: Any) -> list[dict[str, Any]]:
        method = getattr(self._ctx.owner, "list_community_snapshots", None)
        if method is None:
            return []
        return await method(**filters)

    async def share_snapshot(self, snapshot_id: int, **metadata: Any) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "share_snapshot_to_community", None)
        if method is None:
            return None
        return await method(snapshot_id, **metadata)

    async def rate_snapshot(self, snapshot_id: int, rating: float) -> dict[str, Any] | None:
        method = getattr(self._ctx.owner, "rate_community_snapshot", None)
        if method is None:
            return None
        return await method(snapshot_id, rating)

    async def record_download(self, snapshot_id: int) -> None:
        method = getattr(self._ctx.owner, "record_community_download", None)
        if method is None:
            return
        await method(snapshot_id)


# ----------------------------------------------------------------------------
# Factory — bundles all 7 services around a single SnapshotService instance.
# ----------------------------------------------------------------------------


@dataclass(frozen=True)
class StateAuthorityServices:
    """Bundle of the 7 day-1 services for one SnapshotService aggregator
    instance. Routes receive this bundle and call the domain service they
    need directly (Q50 — no facade)."""

    crud: SnapshotCrudService
    activation: SnapshotActivationService
    topology: SnapshotTopologyService
    portability: SnapshotPortabilityService
    revision: SnapshotRevisionService
    control_map: SnapshotControlMapService
    community: SnapshotCommunityService


def build_state_authority_services(owner: Any) -> StateAuthorityServices:
    """Compose the 7 day-1 services around a single SnapshotService."""
    return StateAuthorityServices(
        crud=SnapshotCrudService(owner),
        activation=SnapshotActivationService(owner),
        topology=SnapshotTopologyService(owner),
        portability=SnapshotPortabilityService(owner),
        revision=SnapshotRevisionService(owner),
        control_map=SnapshotControlMapService(owner),
        community=SnapshotCommunityService(owner),
    )
