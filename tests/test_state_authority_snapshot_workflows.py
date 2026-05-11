from __future__ import annotations

import asyncio
import io
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import delete, select

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services import snapshot as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services import upload_service as upload_service_module
from app.services.chain_service import ChainService
from app.services.snapshot import SnapshotActivationPreflightError, SnapshotService
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'state-authority-workflows.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri == "urn:test:missing-plugin":
            return None
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


@pytest.fixture(autouse=True)
def _disable_background_snapshot_preload(monkeypatch):
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)


def test_snapshot_service_persists_and_reads_state_authority_document(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="DocumentBacked",
                detail_payload={
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
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            assert snapshot_row is not None
            assert snapshot_row.document["version"] == "2026.05"
            assert "map2:fx:nam" in [node["uri"] for node in snapshot_row.document["graph"]["nodes"]]

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(
                delete(database_module.SnapshotChainPlugin).where(
                    database_module.SnapshotChainPlugin.snapshot_chain_id.in_(
                        select(database_module.SnapshotChain.id).where(
                            database_module.SnapshotChain.snapshot_id == created["id"]
                        )
                    )
                )
            )
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            reloaded = await service.get_snapshot(created["id"])
            assert reloaded is not None
            assert "map2://juce/nam" in [plugin["uri"] for plugin in reloaded["chains"][0]["plugins"]]
            assert reloaded["channel_count"] == 1

    asyncio.run(_run())


def test_snapshot_service_resyncs_state_authority_document_after_compatibility_mutations(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="CompatProjectionSync",
                detail_payload={
                    "channels": [],
                    "chains": [],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": None,
                        "blend_positions": {},
                        "series_order": [],
                    },
                    "midi_map": [],
                },
            )

            with_chain = await service.create_chain(created["id"], "Primary Chain")
            chain_id = with_chain["chains"][0]["id"]
            with_plugin = await service.add_plugin(
                created["id"],
                chain_id,
                "urn:test:drive",
                plugin_name="Drive",
            )
            assert with_plugin is not None

            with_channel = await service.add_channel(
                created["id"],
                {
                    "channel_key": "channel-extra",
                    "label": "InputA",
                    "color": "#123456",
                    "chain_id": chain_id,
                },
            )
            assert with_channel is not None
            added_channel = next(
                channel
                for channel in with_channel["channels"]
                if channel["channel_key"] == "channel-extra"
            )
            channel_id = added_channel["id"]

            updated_channel = await service.update_channel(
                created["id"],
                channel_id,
                {"label": "InputAlpha", "dry_wet_mix": 55.0},
            )
            assert updated_channel is not None

            updated_routing = await service.update_routing(
                created["id"],
                {
                    "mode": "morph",
                    "active_channel_key": "channel-extra",
                    "morph_source_channel_key": "channel-extra",
                    "morph_target_channel_key": "channel-extra",
                    "series_order": ["channel-extra"],
                },
            )
            assert updated_routing is not None

            replaced_midi_map = await service.replace_midi_map(
                created["id"],
                [
                    {
                        "type": "program_change",
                        "channel": 1,
                        "program_number": 12,
                    }
                ],
            )
            assert replaced_midi_map is not None

            session.expire_all()
            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            assert snapshot_row is not None
            graph = snapshot_row.document["graph"]
            assert graph["routing"]["mode"] == "morph"
            graph_channel = next(
                channel
                for channel in graph["channels"]
                if channel["channel_key"] == "channel-extra"
            )
            assert graph_channel["label"] == "InputAlpha"
            assert graph_channel["dry_wet_mix"] == pytest.approx(55.0)
            assert any(
                plugin["uri"] == "urn:test:drive"
                for plugin in graph["chains"][0]["plugins"]
            )
            assert graph["midi_map"][0]["program_number"] == 12

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(
                delete(database_module.SnapshotChainPlugin).where(
                    database_module.SnapshotChainPlugin.snapshot_chain_id.in_(
                        select(database_module.SnapshotChain.id).where(
                            database_module.SnapshotChain.snapshot_id == created["id"]
                        )
                    )
                )
            )
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            reloaded = await service.get_snapshot(created["id"])
            assert reloaded is not None
            reloaded_channel = next(
                channel
                for channel in reloaded["channels"]
                if channel["channel_key"] == "channel-extra"
            )
            assert reloaded_channel["label"] == "InputAlpha"
            assert reloaded["routing"]["mode"] == "morph"
            assert any(
                plugin["uri"] == "urn:test:drive"
                for plugin in reloaded["chains"][0]["plugins"]
            )
            assert reloaded["midi_map"][0]["program_number"] == 12

    asyncio.run(_run())


def test_list_snapshots_uses_state_authority_document_when_projection_tables_are_missing(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="SummaryFallback",
                detail_payload={
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
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:drive",
                                    "name": "Drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(
                delete(database_module.SnapshotChainPlugin).where(
                    database_module.SnapshotChainPlugin.snapshot_chain_id.in_(
                        select(database_module.SnapshotChain.id).where(
                            database_module.SnapshotChain.snapshot_id == created["id"]
                        )
                    )
                )
            )
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            summaries = await service.list_snapshots()
            assert len(summaries) == 1
            assert summaries[0]["channel_count"] == 1
            assert summaries[0]["chain_count"] == 1
            assert summaries[0]["channels"][0]["label"] == "A"
            assert summaries[0]["channels"][0]["channel_key"] == "channel-0"

    asyncio.run(_run())


def test_snapshot_service_add_plugin_accepts_http_lv2_uri_in_state_authority_document(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="HttpLv2UriSnapshot",
                detail_payload={
                    "channels": [],
                    "chains": [],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": None,
                        "blend_positions": {},
                        "series_order": [],
                    },
                    "midi_map": [],
                },
            )

            with_chain = await service.create_chain(created["id"], "Primary Chain")
            chain_id = with_chain["chains"][0]["id"]
            plugin_uri = "http://distrho.sf.net/plugins/MVerb"

            with_plugin = await service.add_plugin(
                created["id"],
                chain_id,
                plugin_uri,
                plugin_name="MVerb",
            )

            assert with_plugin is not None
            assert any(
                plugin.get("uri") == plugin_uri
                for chain in with_plugin["chains"]
                for plugin in chain.get("plugins", [])
            )

            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            assert snapshot_row is not None
            assert any(
                node.get("uri") == plugin_uri
                for node in snapshot_row.document["graph"]["nodes"]
            )

    asyncio.run(_run())


def test_snapshot_service_rejects_invalid_state_authority_document_write(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            def _broken_document(snapshot, normalized, *, document_type="snapshot"):
                return {
                    "version": "2026.03",
                    "meta": {"name": snapshot.name, "type": "snapshot"},
                    "graph": {
                        "nodes": [
                            {
                                "id": "node-1",
                                "uri": "invalid uri",
                                "name": "Broken",
                                "parameters": {},
                                "state": {},
                            }
                        ],
                        "edges": [],
                    },
                }

            monkeypatch.setattr(service.state_authority_documents, "build_document", _broken_document)

            try:
                await service.create_snapshot(
                    name="InvalidDocWrite",
                    detail_payload={
                        "channels": [],
                        "chains": [],
                        "routing": {
                            "mode": "parallel_blend",
                            "active_channel_key": None,
                            "blend_positions": {},
                            "series_order": [],
                        },
                        "midi_map": [],
                    },
                )
            except ValueError as exc:
                assert "$.version" in str(exc)
                assert "Auto-repair guidance" in str(exc)
                await session.rollback()
            else:
                raise AssertionError("Invalid State Authority document write should fail")

            result = await session.execute(
                select(database_module.Snapshot).where(database_module.Snapshot.name == "InvalidDocWrite")
            )
            assert result.scalar_one_or_none() is None

    asyncio.run(_run())


def test_snapshot_service_restores_asset_paths_from_state_authority_registry(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    asset_path = tmp_path / "RegistryTone.nam"
    asset_path.write_bytes(b"registry-tone")

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="RegistryBacked",
                detail_payload={
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
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {
                                        "selected_asset_path": str(asset_path),
                                        "selected_model": "RegistryTone",
                                    },
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            asset_row = (await session.execute(select(database_module.StateAuthorityAsset))).scalar_one()
            assert asset_row.asset_hash.startswith("sha256:")
            assert asset_row.source_path == str(asset_path.resolve())

            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            document = dict(snapshot_row.document)
            graph = dict(document["graph"])
            nodes = list(graph["nodes"])
            nam_node = next(node for node in nodes if node["uri"] == "map2:fx:nam")
            assert nam_node["state"]["selected_asset_path"] == asset_row.asset_hash
            document["assets"] = []
            snapshot_row.document = document

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(
                delete(database_module.SnapshotChainPlugin).where(
                    database_module.SnapshotChainPlugin.snapshot_chain_id.in_(
                        select(database_module.SnapshotChain.id).where(
                            database_module.SnapshotChain.snapshot_id == created["id"]
                        )
                    )
                )
            )
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            reloaded = await service.get_snapshot(created["id"])
            assert reloaded is not None
            nam_plugin = next(
                plugin
                for plugin in reloaded["chains"][0]["plugins"]
                if plugin.get("uri") == "map2://juce/nam"
            )
            assert nam_plugin["loader_state"]["selected_asset_path"] == str(asset_path.resolve())
            assert nam_plugin["loader_state"]["selected_model"] == "RegistryTone"

    asyncio.run(_run())


def test_plan_preload_candidates_for_snapshot_returns_top_three_candidates(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            first = await service.create_snapshot(name="One", program_number=1)
            second = await service.create_snapshot(name="Two", program_number=2)
            third = await service.create_snapshot(name="Three", program_number=3)
            fourth = await service.create_snapshot(name="Four", program_number=4)
            fifth = await service.create_snapshot(name="Five", program_number=5)

            plan = await service.plan_preload_candidates_for_snapshot(first["id"], limit=3)
            assert plan == {
                "source_snapshot_id": first["id"],
                "source_snapshot_name": "One",
                "candidate_reason": "program_number",
                "candidates": [
                    {
                        "snapshot_id": second["id"],
                        "snapshot_name": "Two",
                        "program_number": 2,
                        "display_order": second["display_order"],
                    },
                    {
                        "snapshot_id": third["id"],
                        "snapshot_name": "Three",
                        "program_number": 3,
                        "display_order": third["display_order"],
                    },
                    {
                        "snapshot_id": fourth["id"],
                        "snapshot_name": "Four",
                        "program_number": 4,
                        "display_order": fourth["display_order"],
                    },
                ],
            }
            assert fifth["id"] not in [item["snapshot_id"] for item in plan["candidates"]]

    asyncio.run(_run())


def test_snapshot_activation_preflight_blocks_broken_assets_and_preserves_live_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _AudioInventoryStub:
        is_available = True

        def get_system_info(self):
            return {
                "available_input_devices": ["Stage Input"],
                "available_output_devices": ["House Left/Right"],
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr("app.services.engine_runtime_facade.get_engine_service", lambda: _AudioInventoryStub())
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    missing_model_path = tmp_path / "CleanTone.nam"
    missing_ir_path = tmp_path / "WideCab.wav"

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            current_live = await service.create_snapshot(
                name="CurrentLive",
                input_device="Stage Input",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "map2://juce/delay",
                                    "name": "Delay",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"mix": 0.45},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
            )
            activated_live = await service.activate_snapshot(current_live["id"])
            assert activated_live is not None
            assert activated_live["snapshot_id"] == current_live["id"]

            broken = await service.create_snapshot(
                name="BrokenPreflight",
                input_device="Tour Rack",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        },
                        {
                            "channel_key": "channel-b",
                            "label": "Ambient",
                            "color": "#22c55e",
                            "chain_id": 2,
                        },
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:missing-plugin",
                                    "name": "Ghost Drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {},
                                },
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 1,
                                    "bypass": False,
                                    "parameters": {},
                                    "loader_state": {
                                        "selected_asset_name": "CleanTone.nam",
                                        "selected_asset_path": str(missing_model_path),
                                    },
                                },
                            ],
                        },
                        {
                            "id": 2,
                            "name": "Ambient Chain",
                            "plugins": [
                                {
                                    "uri": "map2://juce/convolution/cabinet",
                                    "name": "Cabinet",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {},
                                    "loader_state": {
                                        "selected_asset_name": "WideCab.wav",
                                        "selected_asset_path": str(missing_ir_path),
                                        "ir_type": "cabinet",
                                    },
                                }
                            ],
                        },
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0, "channel-b": 100.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                },
            )

            try:
                await service.activate_snapshot(broken["id"])
            except SnapshotActivationPreflightError as exc:
                assert exc.failures == [
                    "Cannot go live: Channel Lead - plugin Ghost Drive is not installed on this node.",
                    "Cannot go live: Channel Lead - NAM model CleanTone.nam not found on this node.",
                    "Cannot go live: Channel Ambient - cabinet IR WideCab.wav not found on this node.",
                    "Cannot go live: Input device Tour Rack is not available on this node.",
                ]
                assert exc.detail_payload["phase"] == "VALIDATING"
                assert exc.detail_payload["blocking"] is True
                assert [issue["code"] for issue in exc.detail_payload["issues"]] == [
                    "missing_plugin",
                    "missing_asset",
                    "missing_asset",
                    "missing_input_device",
                ]
                assert [action["action"] for action in exc.detail_payload["repair_actions"]] == [
                    "install_plugin",
                    "restore_asset",
                    "restore_asset",
                    "select_available_device",
                ]
            else:
                raise AssertionError("Activation should fail when snapshot pre-flight validation finds missing dependencies")

            live_snapshot = await service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["id"] == current_live["id"]
            assert live_snapshot["name"] == "CurrentLive"

    asyncio.run(_run())


def test_snapshot_service_template_crud_and_portability(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            snapshot = await service.create_snapshot(
                name="OnlySnapshot",
                detail_payload={"chains": [], "channels": [], "routing": {}, "midi_map": []},
            )
            template = await service.create_template(
                name="AmpStackTemplate",
                description="Reusable graph template",
                tags=["template", "guitar"],
                detail_payload={
                    "chains": [
                        {
                            "id": 1,
                            "name": "Template Chain",
                            "plugins": [{"uri": "urn:test:amp", "parameters": {"gain": 0.5}}],
                        }
                    ],
                    "channels": [
                        {
                            "channel_key": "a",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "a", "blend_positions": {"a": 100.0}},
                    "midi_map": [],
                },
            )
            listed_snapshots = await service.list_snapshots()
            listed_templates = await service.list_templates()
            exported = await service.export_template(template["id"])
            imported = await service.import_template(exported)
            refetched_imported = await service.get_template(imported["id"])
            return snapshot, template, listed_snapshots, listed_templates, exported, refetched_imported

    snapshot, template, listed_snapshots, listed_templates, exported, refetched_imported = asyncio.run(_run())

    assert [item["id"] for item in listed_snapshots] == [snapshot["id"]]
    assert [item["id"] for item in listed_templates] == [template["id"]]
    assert template["document_type"] == "template"
    assert exported["template"]["document_type"] == "template"
    assert refetched_imported["document_type"] == "template"


def test_snapshot_service_template_live_link_cascade_preserves_local_overrides(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            template = await service.create_template(
                name="TemplateLiveLinkBase",
                description="Base template",
                detail_payload={
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
                            "name": "Template Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "name": "Template Plugin",
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {"mode": "clean"},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                },
            )

            linked = await service.create_snapshot(
                name="TemplateLinkedSnapshot",
                description="Linked snapshot",
                detail_payload={
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
                            "name": "Template Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "name": "Template Plugin",
                                    "parameters": {"gain": 0.9},
                                    "loader_state": {"mode": "clean"},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "extensions": {
                        "state_authority": {
                            "template_link": {
                                "template_id": template["id"],
                                "live_link": True,
                            }
                        }
                    },
                },
            )

            assert linked["chains"][0]["plugins"][1]["parameters"]["gain"] == 0.9
            template_link = linked["extensions"]["state_authority"]["template_link"]
            assert template_link["template_id"] == template["id"]
            assert template_link["live_link"] is True
            assert template_link["overlay"]["chains"][0]["plugins"][0]["parameters"]["gain"] == 0.9

            updated_template = await service.update_template(
                template["id"],
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "Main",
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
                            "name": "Template Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "name": "Template Plugin",
                                    "parameters": {"gain": 0.6},
                                    "loader_state": {"mode": "updated"},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                },
            )

            linked_after_update = await service.get_snapshot(linked["id"])
            assert linked_after_update is not None
            return template, linked, updated_template, linked_after_update

    template, linked, updated_template, linked_after_update = asyncio.run(_run())

    linked_plugins = linked_after_update["chains"][0]["plugins"]
    linked_plugin = next(plugin for plugin in linked_plugins if plugin["uri"] == "urn:test:plugin")

    assert updated_template is not None
    assert linked_after_update["channels"][0]["label"] == "Main"
    assert linked_plugin["parameters"]["gain"] == 0.9
    assert linked_after_update["extensions"]["state_authority"]["template_link"]["template_id"] == template["id"]
    assert linked_after_update["extensions"]["state_authority"]["template_link"]["live_link"] is True
    assert linked_after_update["snapshot_revision"] != linked["snapshot_revision"]


def test_snapshot_service_template_bundle_and_community_workflows(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    export_dir = tmp_path / "template-bundle-source"
    export_dir.mkdir(parents=True, exist_ok=True)
    nam_source = export_dir / "TemplateTone.nam"
    nam_source.write_bytes(b"template-nam")

    library_root = tmp_path / "template-bundle-library"
    storage_paths = {
        upload_service_module.AssetType.NAM: library_root / "nam",
        upload_service_module.AssetType.CABINET_IR: library_root / "ir" / "cabinets",
        upload_service_module.AssetType.REVERB_IR: library_root / "ir" / "reverbs",
        upload_service_module.AssetType.VST3: library_root / "vst3",
    }

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(
        upload_service_module.UnifiedUploadService,
        "get_storage_path",
        lambda self, asset_type: storage_paths[asset_type],
    )
    monkeypatch.setattr(upload_service_module, "_upload_service", None)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            template = await service.create_template(
                name="CommunityTemplate",
                description="Reusable template",
                tags=["template", "shared"],
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {
                                        "selected_model": "TemplateTone",
                                        "selected_asset_name": "TemplateTone",
                                        "selected_asset_path": str(nam_source),
                                    },
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            shared = await service.share_template(template["id"], author_name="Codex")
            assert shared is not None
            assert shared["community_shared"] is True

            community = await service.browse_community_templates(query="community", author="codex")
            assert [item["id"] for item in community] == [template["id"]]

            rated = await service.rate_community_template(shared["community_uuid"], 5)
            assert rated is not None
            assert rated["community_rating_count"] == 1

            bundle = await service.export_template_bundle(template["id"])
            assert bundle is not None
            assert bundle["filename"] == "CommunityTemplate.map2template"

            with zipfile.ZipFile(io.BytesIO(bundle["content"]), "r") as archive:
                payload = json.loads(archive.read("snapshot.json").decode("utf-8"))
                assert payload["template"]["name"] == "CommunityTemplate"
                bundled_assets = [asset for asset in payload["asset_manifest"] if asset.get("bundle_path")]
                assert len(bundled_assets) == 1

            downloaded = await service.record_community_template_download(shared["community_uuid"])
            assert downloaded is not None
            assert downloaded["filename"] == "CommunityTemplate.map2template"
            assert downloaded["community_uuid"] == shared["community_uuid"]

            imported = await service.import_template(downloaded["content"])
            assert imported["name"] == "CommunityTemplate"
            imported_plugin = next(
                plugin
                for plugin in imported["chains"][0]["plugins"]
                if plugin["uri"] == "map2://juce/nam"
            )
            assert imported_plugin["loader_state"]["selected_asset_path"].startswith(
                str(storage_paths[upload_service_module.AssetType.NAM])
            )

    asyncio.run(_run())
