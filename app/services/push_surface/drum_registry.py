"""Registry for drum-machine plugin instances addressable from Push workflows."""

from __future__ import annotations

import copy
import os
import socket
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import aiohttp


DRUM_PLUGIN_URIS = {"map2://juce/drums", "map2://juce/brain"}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _local_node_id() -> str:
    return str(os.environ.get("MAP2_NODE_ID") or socket.gethostname() or "local")


def _local_node_label() -> str:
    return str(os.environ.get("MAP2_NODE_LABEL") or _local_node_id())


@dataclass(frozen=True)
class DrumMachineInstanceDescriptor:
    instance_id: str
    node_id: str
    node_label: str
    snapshot_id: int | None
    snapshot_name: str | None
    chain_id: int | None
    chain_name: str | None
    plugin_id: int | None
    plugin_uri: str
    plugin_name: str
    plugin_position: int | None
    display_name: str
    is_live: bool
    is_audible: bool
    source: str
    capability_flags: tuple[str, ...]
    last_seen_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DrumInstanceRegistry:
    """Enumerate drum-machine instances from snapshot detail payloads."""

    async def _list_local_snapshot_summaries(self) -> list[dict[str, Any]]:
        from app.database import get_session
        from app.services.snapshot_service import SnapshotService

        async with get_session() as session:
            return await SnapshotService(session).list_snapshots()

    async def _get_local_snapshot_detail(self, snapshot_id: int) -> dict[str, Any] | None:
        from app.database import get_session
        from app.services.snapshot_service import SnapshotService

        async with get_session() as session:
            return await SnapshotService(session).get_snapshot(snapshot_id)

    async def _list_remote_nodes(self) -> list[dict[str, Any]]:
        from app.services.cluster.node_visibility import get_visible_remote_nodes

        _summary, visible_nodes = get_visible_remote_nodes()
        return [
            node.to_discovered_dict()
            for node in visible_nodes.values()
            if node.is_online and node.api_url and node.node_id != _local_node_id()
        ]

    async def _fetch_remote_json(self, url: str, timeout_s: float = 3.0) -> dict[str, Any] | None:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=timeout_s) as response:
                    if response.status != 200:
                        return None
                    payload = await response.json()
                    return payload if isinstance(payload, dict) else None
        except Exception:
            return None

    async def _list_remote_snapshot_summaries(self, node: dict[str, Any]) -> list[dict[str, Any]]:
        api_url = str(node.get("api_url") or "").rstrip("/")
        if not api_url:
            return []
        payload = await self._fetch_remote_json(f"{api_url}/api/snapshots")
        if not isinstance(payload, dict):
            return []
        snapshots = payload.get("snapshots", [])
        return snapshots if isinstance(snapshots, list) else []

    async def _get_remote_snapshot_detail(self, node: dict[str, Any], snapshot_id: int) -> dict[str, Any] | None:
        api_url = str(node.get("api_url") or "").rstrip("/")
        if not api_url:
            return None
        return await self._fetch_remote_json(f"{api_url}/api/snapshots/{snapshot_id}")

    async def _collect_instances_for_node(
        self,
        *,
        node_id: str,
        node_label: str,
        source: str,
        summaries: list[dict[str, Any]],
        detail_loader,
    ) -> list[DrumMachineInstanceDescriptor]:
        instances: list[DrumMachineInstanceDescriptor] = []
        for summary in summaries:
            snapshot_id = int(summary.get("id") or 0)
            if snapshot_id <= 0:
                continue
            detail = await detail_loader(snapshot_id)
            if detail is None:
                continue
            live_path_chain_ids = {
                int(path.get("snapshot_chain_id"))
                for path in detail.get("paths", [])
                if path.get("snapshot_chain_id") is not None and path.get("runtime_chain_id") is not None
            }
            for chain in detail.get("chains", []):
                chain_id = int(chain.get("id") or 0)
                chain_name = str(chain.get("name") or f"Chain {chain_id}")
                for plugin in chain.get("plugins", []):
                    uri = str(plugin.get("uri") or plugin.get("plugin_uri") or "").strip()
                    if uri not in DRUM_PLUGIN_URIS:
                        continue
                    plugin_position = plugin.get("position")
                    plugin_id = plugin.get("id")
                    plugin_name = str(plugin.get("name") or "Drum Machine")
                    instance_id = (
                        f"node:{node_id}:snapshot:{snapshot_id}:chain:{chain_id}:"
                        f"plugin:{int(plugin_id) if plugin_id is not None else int(plugin_position or 0)}"
                    )
                    is_live = chain_id in live_path_chain_ids or bool(summary.get("is_active", False))
                    instances.append(
                        DrumMachineInstanceDescriptor(
                            instance_id=instance_id,
                            node_id=node_id,
                            node_label=node_label,
                            snapshot_id=snapshot_id,
                            snapshot_name=str(summary.get("name") or f"Snapshot {snapshot_id}"),
                            chain_id=chain_id,
                            chain_name=chain_name,
                            plugin_id=int(plugin_id) if plugin_id is not None else None,
                            plugin_uri=uri,
                            plugin_name=plugin_name,
                            plugin_position=int(plugin_position) if plugin_position is not None else None,
                            display_name=f"{summary.get('name') or f'Snapshot {snapshot_id}'} / {chain_name}",
                            is_live=is_live,
                            is_audible=is_live and not bool(plugin.get("bypass", False)),
                            source=source,
                            capability_flags=("transport", "pads", "sequencer", "browser"),
                            last_seen_at=_utcnow_iso(),
                        )
                    )
        return instances

    async def list_instances(self) -> list[DrumMachineInstanceDescriptor]:
        instances: list[DrumMachineInstanceDescriptor] = []
        node_id = _local_node_id()
        node_label = _local_node_label()
        local_summaries = await self._list_local_snapshot_summaries()
        instances.extend(
            await self._collect_instances_for_node(
                node_id=node_id,
                node_label=node_label,
                source="snapshot",
                summaries=local_summaries,
                detail_loader=self._get_local_snapshot_detail,
            )
        )

        for remote_node in await self._list_remote_nodes():
            remote_node_id = str(remote_node.get("node_id") or "").strip()
            if not remote_node_id or remote_node_id == node_id:
                continue
            remote_summaries = await self._list_remote_snapshot_summaries(remote_node)
            instances.extend(
                await self._collect_instances_for_node(
                    node_id=remote_node_id,
                    node_label=str(remote_node.get("hostname") or remote_node.get("node_id") or remote_node_id),
                    source="cluster_snapshot",
                    summaries=remote_summaries,
                    detail_loader=lambda snapshot_id, remote_node=remote_node: self._get_remote_snapshot_detail(remote_node, snapshot_id),
                )
            )

        instances.sort(
            key=lambda item: (
                0 if item.is_live else 1,
                0 if item.is_audible else 1,
                item.node_label.lower(),
                (item.snapshot_name or "").lower(),
                item.chain_id or 0,
                item.plugin_position or 0,
            )
        )
        return instances

    async def get_instance(self, instance_id: str) -> DrumMachineInstanceDescriptor | None:
        for instance in await self.list_instances():
            if instance.instance_id == instance_id:
                return copy.deepcopy(instance)
        return None


_registry: DrumInstanceRegistry | None = None


def get_drum_instance_registry() -> DrumInstanceRegistry:
    global _registry
    if _registry is None:
        _registry = DrumInstanceRegistry()
    return _registry
