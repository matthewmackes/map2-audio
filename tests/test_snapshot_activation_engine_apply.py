import asyncio

from sqlalchemy import select

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services.chain_service import ChainService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-activation-engine-apply.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


class _ActivationApplyEngineStub:
    def __init__(self) -> None:
        self.is_available = True
        self.is_running = True
        self.loop_calls: list[tuple[int, list[dict[str, object]]]] = []
        self.parallel_group_calls: list[tuple[int, int]] = []
        self.parallel_branch_calls: list[tuple[int, int, int, int]] = []
        self.parallel_branch_chain_id_calls: list[tuple[int, int, int]] = []
        self.parallel_blend_calls: list[tuple[int, float]] = []
        self.parallel_switch_calls: list[tuple[int, int]] = []
        self.chain_mute_calls: list[tuple[int, bool]] = []
        self.chain_solo_calls: list[tuple[int, bool]] = []
        self.chain_mix_calls: list[tuple[int, float]] = []
        self._instance_ids: dict[tuple[str, int | None], int] = {}

    async def set_all_midi_commands(self, commands):
        self.commands = [dict(command) for command in commands]
        return True

    async def get_topology_mutation_stats(self):
        return None

    async def get_parallel_groups(self):
        return []

    async def remove_parallel_group(self, group_id: int) -> bool:
        return True

    async def set_chain_loop_insertions(self, chain_id: int, insertions: list[dict[str, object]]) -> bool:
        self.loop_calls.append((chain_id, [dict(entry) for entry in insertions]))
        return True

    async def create_parallel_group(self, position: int = -1, num_branches: int = 2) -> int:
        self.parallel_group_calls.append((position, num_branches))
        return len(self.parallel_group_calls)

    async def add_to_parallel_branch(self, group_id: int, branch_index: int, plugin_id: int, position: int = -1) -> bool:
        self.parallel_branch_calls.append((group_id, branch_index, plugin_id, position))
        return True

    async def set_parallel_branch_chain_id(self, group_id: int, branch_index: int, chain_id: int) -> bool:
        self.parallel_branch_chain_id_calls.append((group_id, branch_index, chain_id))
        return True

    async def set_parallel_ab_blend(self, group_id: int, blend: float) -> None:
        self.parallel_blend_calls.append((group_id, float(blend)))

    async def trigger_parallel_ab_switch(self, group_id: int, branch_index: int) -> bool:
        self.parallel_switch_calls.append((group_id, int(branch_index)))
        return True

    async def set_chain_mute(self, chain_id: int, muted: bool) -> bool:
        self.chain_mute_calls.append((chain_id, bool(muted)))
        return True

    async def set_chain_solo(self, chain_id: int, solo: bool) -> bool:
        self.chain_solo_calls.append((chain_id, bool(solo)))
        return True

    async def set_chain_dry_wet_mix(self, chain_id: int, dry_wet_mix: float) -> bool:
        self.chain_mix_calls.append((chain_id, float(dry_wet_mix)))
        return True

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None) -> int | None:
        key = (str(plugin_uri), plugin_position if isinstance(plugin_position, int) else None)
        if key not in self._instance_ids:
            self._instance_ids[key] = len(self._instance_ids) + 1
        return self._instance_ids[key]


async def _build_service(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    engine_stub = _ActivationApplyEngineStub()

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _healthy_channels(self, *, live_snapshot_payload):
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 0,
            "total_count": 0,
            "inactive_channels": [],
            "inactive_messages": [],
        }

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    session = database_module.get_session()
    return session, engine_stub


def test_snapshot_activation_applies_routing_channel_and_loop_state(tmp_path, monkeypatch):
    async def _run():
        session_ctx, engine_stub = await _build_service(tmp_path, monkeypatch)
        async with session_ctx as session:
            session.add(
                database_module.EffectsLoop(
                    loop_id="loop-a",
                    name="Loop A",
                    channels=2,
                    topology="serial_insert",
                )
            )
            await session.flush()

            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ActivationAudit",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                            "muted": True,
                            "solo": False,
                            "dry_wet_mix": 42.0,
                        },
                        {
                            "channel_key": "channel-b",
                            "label": "B",
                            "color": "#22c55e",
                            "chain_id": 2,
                            "muted": False,
                            "solo": True,
                            "dry_wet_mix": 88.0,
                        },
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "A",
                            "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}],
                            "loop_insertions": [{"loop_id": "loop-a", "slot_index": 0, "enabled": True, "mode": "serial_insert"}],
                        },
                        {
                            "id": 2,
                            "name": "B",
                            "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}],
                        },
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 25.0, "channel-b": 75.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            activated = await service.activate_snapshot(created["id"])

            assert activated is not None
            assert engine_stub.parallel_group_calls
            assert engine_stub.parallel_branch_calls
            assert engine_stub.parallel_branch_chain_id_calls
            assert engine_stub.parallel_blend_calls
            assert engine_stub.loop_calls
            assert engine_stub.chain_mute_calls
            assert engine_stub.chain_solo_calls
            assert engine_stub.chain_mix_calls

    asyncio.run(_run())


def test_live_routing_blend_edit_reapplies_without_full_reactivation(tmp_path, monkeypatch):
    async def _run():
        session_ctx, engine_stub = await _build_service(tmp_path, monkeypatch)
        async with session_ctx as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveBlendAudit",
                detail_payload={
                    "channels": [
                        {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                        {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                    ],
                    "chains": [
                        {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]},
                        {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}]},
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0, "channel-b": 0.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

            before_calls = len(engine_stub.parallel_blend_calls)
            updated = await service.update_routing(
                created["id"],
                {"blend_positions": {"channel-a": 40.0, "channel-b": 60.0}},
            )

            assert updated is not None
            assert updated["routing_requires_reactivation"] is False
            assert len(engine_stub.parallel_blend_calls) > before_calls

    asyncio.run(_run())


def test_live_ab_switch_edit_reapplies_active_channel_selection(tmp_path, monkeypatch):
    async def _run():
        session_ctx, engine_stub = await _build_service(tmp_path, monkeypatch)
        async with session_ctx as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveABSwitchAudit",
                detail_payload={
                    "channels": [
                        {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                        {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                    ],
                    "chains": [
                        {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]},
                        {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}]},
                    ],
                    "routing": {
                        "mode": "ab_switch",
                        "active_channel_key": "channel-b",
                        "blend_positions": {"channel-a": 100.0, "channel-b": 0.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

            before_calls = len(engine_stub.parallel_switch_calls)
            updated = await service.update_routing(
                created["id"],
                {"active_channel_key": "channel-a"},
            )

            assert updated is not None
            assert updated["routing_requires_reactivation"] is False
            assert updated["routing_apply"]["reason"] == "ab_switch_applied"
            assert len(engine_stub.parallel_switch_calls) > before_calls
            assert engine_stub.parallel_switch_calls[-1][1] == 0

            updated = await service.update_routing(
                created["id"],
                {"active_channel_key": "channel-b"},
            )
            assert updated is not None
            assert updated["routing_apply"]["reason"] == "ab_switch_applied"
            assert engine_stub.parallel_switch_calls[-1][1] == 1

    asyncio.run(_run())


def test_live_routing_mode_switch_reapplies_without_full_reactivation(tmp_path, monkeypatch):
    async def _run():
        session_ctx, engine_stub = await _build_service(tmp_path, monkeypatch)
        async with session_ctx as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveModeSwitchAudit",
                detail_payload={
                    "channels": [
                        {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                        {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                    ],
                    "chains": [
                        {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]},
                        {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}]},
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 50.0, "channel-b": 50.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert engine_stub.parallel_group_calls

            created_group_calls = len(engine_stub.parallel_group_calls)
            updated = await service.update_routing(
                created["id"],
                {
                    "mode": "series",
                    "active_channel_key": "channel-a",
                    "series_order": ["channel-a", "channel-b"],
                },
            )

            assert updated is not None
            assert updated["routing_requires_reactivation"] is False
            assert updated["routing_mode_changed_live"] is True
            assert updated["routing_apply"]["applied"] is True
            assert updated["routing_apply"]["reason"] == "non_parallel_mode"
            assert len(engine_stub.parallel_group_calls) == created_group_calls

    asyncio.run(_run())
