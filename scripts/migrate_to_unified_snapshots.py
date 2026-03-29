#!/usr/bin/env python3
"""
Migrate legacy flow snapshots, chains, engine snapshots, and flow deployments
into the unified snapshot schema.

This script is idempotent. It marks migrated records with legacy-source tags:
- legacy-flow-snapshot:<id>
- legacy-chain:<id>
- legacy-engine-snapshot:<slot>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.database import (
    Chain,
    FlowAssignment,
    FlowDeployment,
    FlowSnapshot,
    Snapshot,
    SnapshotDeployment,
    _resolve_database_path,
    init_db,
)
from app.services.snapshot_service import SnapshotService

args = argparse.Namespace(skip_backup=False)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Migrate legacy MAP2 snapshot data into unified snapshots")
    parser.add_argument("--skip-backup", action="store_true", help="Skip database backup before migration")
    return parser


def backup_database_file(skip_backup: bool) -> Path | None:
    db_path = _resolve_database_path()
    if skip_backup or not db_path.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = db_path.with_suffix(f".bak-{stamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def build_detail_from_legacy_chain(chain_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "channels": [
            {
                "channel_key": "channel-0",
                "label": "A",
                "color": "#2563eb",
                "muted": False,
                "solo": False,
                "dry_wet_mix": 100.0,
                "chain_id": 1,
            }
        ],
        "chains": [
            {
                "id": 1,
                "name": chain_payload.get("name") or "Legacy Chain",
                "plugins": [
                    {
                        "uri": plugin.get("uri"),
                        "name": plugin.get("name"),
                        "position": plugin.get("position", index),
                        "bypass": bool(plugin.get("bypassed", plugin.get("bypass", False))),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "loader_state": dict(plugin.get("loader_state") or {}),
                    }
                    for index, plugin in enumerate(chain_payload.get("plugins", []))
                    if plugin.get("uri")
                ],
                "loop_insertions": list(chain_payload.get("loop_insertions") or []),
                "effects_loops": list(chain_payload.get("effects_loops") or []),
            }
        ],
        "routing": {
            "mode": "parallel_blend",
            "active_channel_key": "channel-0",
            "blend_positions": {},
            "morph_position": 0.5,
            "morph_source_channel_key": None,
            "morph_target_channel_key": None,
            "series_order": ["channel-0"],
        },
        "midi_map": [],
    }


def build_detail_from_engine_snapshot(slot: dict[str, Any], slot_index: int) -> dict[str, Any]:
    channels = []
    chains = []
    plugin_states = slot.get("plugin_states", []) or []
    for index, chain_state in enumerate(plugin_states):
        chain_id = index + 1
        channel_key = f"channel-{index}"
        channels.append(
            {
                "channel_key": channel_key,
                "label": chr(65 + index) if index < 26 else f"Ch{index + 1}",
                "color": "#2563eb",
                "muted": False,
                "solo": False,
                "dry_wet_mix": 100.0,
                "chain_id": chain_id,
            }
        )
        chains.append(
            {
                "id": chain_id,
                "name": chain_state.get("name") or f"Engine Slot {slot_index + 1} Chain {chain_id}",
                "plugins": [
                    {
                        "uri": plugin.get("uri"),
                        "name": plugin.get("name"),
                        "position": plugin.get("position", plugin_index),
                        "bypass": bool(plugin.get("bypass", plugin.get("bypassed", False))),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "loader_state": dict(plugin.get("loader_state") or {}),
                    }
                    for plugin_index, plugin in enumerate(chain_state.get("plugins", []))
                    if plugin.get("uri")
                ],
                "loop_insertions": list(slot.get("loop_insertions", [])),
                "effects_loops": list(slot.get("effects_loops", [])),
            }
        )

    if not channels:
        channels.append(
            {
                "channel_key": "channel-0",
                "label": "A",
                "color": "#2563eb",
                "muted": False,
                "solo": False,
                "dry_wet_mix": 100.0,
                "chain_id": None,
            }
        )

    return {
        "channels": channels,
        "chains": chains,
        "routing": {
            "mode": "parallel_blend",
            "active_channel_key": channels[0]["channel_key"],
            "blend_positions": {},
            "morph_position": 0.5,
            "morph_source_channel_key": None,
            "morph_target_channel_key": None,
            "series_order": [channel["channel_key"] for channel in channels],
        },
        "midi_map": [],
    }


async def migrate() -> None:
    init_db()
    backup_path = backup_database_file(skip_backup=args.skip_backup)

    from app.database import get_session
    from app.services.chain_service import ChainService

    async with get_session() as session:
        service = SnapshotService(session)
        existing_snapshots = await service.list_snapshots()
        migrated_tags = {
            tag
            for snapshot in existing_snapshots
            for tag in snapshot.get("tags", [])
        }

        created_count = 0

        # Phase 1/2: migrate flow snapshots.
        result = await session.execute(select(FlowSnapshot).order_by(FlowSnapshot.display_order.asc(), FlowSnapshot.created_at.asc()))
        flow_snapshots = result.scalars().all()
        for flow_snapshot in flow_snapshots:
            migration_tag = f"legacy-flow-snapshot:{flow_snapshot.id}"
            if migration_tag in migrated_tags:
                continue
            detail_payload = json.loads(flow_snapshot.snapshot_data or "{}")
            tags = list(flow_snapshot.tags or [])
            tags.append(migration_tag)
            snapshot = await service.create_snapshot(
                name=flow_snapshot.name,
                description=flow_snapshot.description or "",
                tags=tags,
                program_number=flow_snapshot.program_number,
                detail_payload=detail_payload,
                is_favorite=bool(flow_snapshot.is_favorite),
            )
            if flow_snapshot.is_active:
                await service.activate_snapshot(snapshot["id"], triggered_by="migration")
            migrated_tags.add(migration_tag)
            created_count += 1

        # Phase 3: migrate orphan chains into one-channel snapshots.
        referenced_chain_ids: set[int] = set()
        for flow_snapshot in flow_snapshots:
            try:
                payload = json.loads(flow_snapshot.snapshot_data or "{}")
            except Exception:
                payload = {}
            for channel in payload.get("flowSlots", []) or []:
                chain_id = channel.get("chainId")
                if isinstance(chain_id, int):
                    referenced_chain_ids.add(chain_id)

        chain_result = await session.execute(select(Chain).order_by(Chain.id.asc()))
        legacy_chains = chain_result.scalars().all()
        chain_service = ChainService(session)
        for chain in legacy_chains:
            if chain.id in referenced_chain_ids:
                continue
            migration_tag = f"legacy-chain:{chain.id}"
            if migration_tag in migrated_tags:
                continue
            chain_payload = await chain_service.get_chain(chain.id)
            if chain_payload is None:
                continue
            snapshot = await service.create_snapshot(
                name=chain_payload["name"],
                description="Migrated orphan chain",
                tags=[migration_tag],
                detail_payload=build_detail_from_legacy_chain(chain_payload),
            )
            migrated_tags.add(migration_tag)
            created_count += 1

        # Phase 4: migrate engine snapshots from ~/.map2/engine_snapshots.json.
        engine_snapshot_path = Path.home() / ".map2" / "engine_snapshots.json"
        if engine_snapshot_path.exists():
            payload = json.loads(engine_snapshot_path.read_text(encoding="utf-8"))
            for slot in payload.get("snapshots", []) or []:
                if not isinstance(slot, dict) or not slot.get("has_data"):
                    continue
                slot_id = int(slot.get("id", 0))
                migration_tag = f"legacy-engine-snapshot:{slot_id}"
                if migration_tag in migrated_tags:
                    continue
                await service.create_snapshot(
                    name=slot.get("name") or f"Engine Snapshot {slot_id + 1}",
                    description="Migrated engine snapshot slot",
                    tags=[migration_tag],
                    detail_payload=build_detail_from_engine_snapshot(slot, slot_id),
                )
                migrated_tags.add(migration_tag)
                created_count += 1

        # Phase 5: migrate flow deployment data when a snapshot contains the old flow ID.
        deployments = await service.list_deployments()
        existing_snapshot_deployments = {(item["snapshot_id"], item["primary_node_id"]) for item in deployments}
        flow_assignment_result = await session.execute(select(FlowAssignment))
        assignments = flow_assignment_result.scalars().all()
        flow_deployment_result = await session.execute(select(FlowDeployment))
        deployment_rows = flow_deployment_result.scalars().all()

        snapshot_details = [await service.get_snapshot(snapshot["id"]) for snapshot in await service.list_snapshots()]
        snapshot_details = [item for item in snapshot_details if item is not None]
        snapshot_by_channel_key = {
            channel["channel_key"]: snapshot
            for snapshot in snapshot_details
            for channel in snapshot.get("channels", [])
        }

        status_by_flow_id = {row.flow_id: row for row in deployment_rows}
        for assignment in assignments:
            snapshot = snapshot_by_channel_key.get(assignment.flow_id)
            if snapshot is None:
                continue
            key = (snapshot["id"], assignment.assigned_node_id)
            if key in existing_snapshot_deployments:
                continue
            deployment_row = status_by_flow_id.get(assignment.flow_id)
            deployment = await service.create_deployment(
                snapshot["id"],
                primary_node_id=assignment.assigned_node_id,
                standby_node_ids=list(deployment_row.standby_node_ids or []) if deployment_row else [],
                assignment_strategy=assignment.assignment_strategy or "manual",
                redundancy_enabled=bool(deployment_row and deployment_row.standby_node_ids),
                deployment_status=deployment_row.deployment_status if deployment_row else "active",
                error_message=deployment_row.error_message if deployment_row else None,
            )
            if deployment is not None:
                await service.add_deployment_history(
                    deployment["id"],
                    snapshot_id=snapshot["id"],
                    to_node_id=assignment.assigned_node_id,
                    action="migrated",
                    notes=f"Migrated from flow assignment {assignment.flow_id}",
                )
                existing_snapshot_deployments.add(key)

        # Phase 6: verify row counts.
        unified_snapshot_count = len(await service.list_snapshots())
        deployment_count = len(await service.list_deployments())

        print("Unified snapshot migration complete")
        print(f"Database backup: {backup_path if backup_path else 'skipped'}")
        print(f"Legacy flow snapshots: {len(flow_snapshots)}")
        print(f"Legacy chains: {len(legacy_chains)}")
        print(f"Legacy flow assignments: {len(assignments)}")
        print(f"Unified snapshots: {unified_snapshot_count}")
        print(f"Unified deployments: {deployment_count}")
        print(f"Created this run: {created_count}")
        print("Phase 7 (manual): review and drop legacy flow/chain tables after validation.")


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(migrate())
