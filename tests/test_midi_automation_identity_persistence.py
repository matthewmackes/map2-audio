import asyncio
import sqlite3

import pytest
from sqlalchemy import select

from app import database as database_module
from app.services.automation_engine import AutomationEngine, CurveType, ModulationSource
from app.services.juce_engine_service import JuceEngineService
from app.services.midi_engine import MIDIEngineService
from app.services.midi_service import MIDIMappingDTO, MIDIService, CurveType as MIDICurveType


def _reset_db_state() -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._async_engine = None
    database_module._async_session_maker = None
    database_module._engine = None
    database_module._SessionLocal = None


def _init_temp_async_db(tmp_path, name: str) -> None:
    _reset_db_state()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / name}")


async def _dispose_db() -> None:
    await database_module.dispose_async_db()
    _reset_db_state()


def test_sqlite_schema_upgrade_adds_duplicate_identity_columns(tmp_path):
    db_path = tmp_path / "legacy-midi-automation.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE midi_mappings ("
            "id INTEGER PRIMARY KEY, channel INTEGER, cc INTEGER, "
            "target_plugin_uri VARCHAR(255), target_param_index INTEGER)"
        )
        conn.execute(
            "CREATE TABLE midi_learn_state ("
            "id INTEGER PRIMARY KEY, target_plugin_uri VARCHAR(255) NOT NULL, "
            "target_param_index INTEGER NOT NULL)"
        )
        conn.execute(
            "CREATE TABLE automation_lanes ("
            "id INTEGER PRIMARY KEY, parameter_id VARCHAR(255) UNIQUE NOT NULL, "
            "plugin_uri VARCHAR(255) NOT NULL, param_index INTEGER NOT NULL)"
        )
        conn.commit()

    _init_temp_async_db(tmp_path, "legacy-midi-automation.db")

    async def _run() -> None:
        async with database_module.get_session(read_only=True):
            pass

    asyncio.run(_run())

    with sqlite3.connect(db_path) as conn:
        midi_mapping_columns = {row[1] for row in conn.execute("PRAGMA table_info(midi_mappings)")}
        midi_learn_columns = {row[1] for row in conn.execute("PRAGMA table_info(midi_learn_state)")}
        automation_columns = {row[1] for row in conn.execute("PRAGMA table_info(automation_lanes)")}

    assert "target_plugin_position" in midi_mapping_columns
    assert "target_plugin_position" in midi_learn_columns
    assert "plugin_position" in automation_columns

    asyncio.run(_dispose_db())


class _FakeMIDIControlEngine:
    def __init__(self) -> None:
        self.mapping_calls: list[dict] = []
        self.mapping_batches: list[list[dict]] = []
        self.learn_calls: list[dict] = []
        self.parameter_reads: list[tuple[str, int, int | None]] = []

    async def set_midi_cc_mapping(self, **kwargs):
        self.mapping_calls.append(dict(kwargs))
        return True

    async def set_all_midi_mappings(self, mappings):
        self.mapping_batches.append(list(mappings))
        return True

    async def start_midi_learn(self, plugin_uri: str, param_index: int, **kwargs):
        self.learn_calls.append(
            {
                "plugin_uri": plugin_uri,
                "param_index": param_index,
                **kwargs,
            }
        )
        return True

    async def stop_midi_learn(self):
        return True

    async def get_plugin_parameter(self, plugin_uri: str, param_index: int, *, plugin_position: int | None = None):
        self.parameter_reads.append((plugin_uri, param_index, plugin_position))
        return 0.42


@pytest.mark.asyncio
async def test_midi_service_persists_and_syncs_duplicate_safe_targets(tmp_path):
    _init_temp_async_db(tmp_path, "midi-service-identity.db")
    service = MIDIService()
    fake_engine = _FakeMIDIControlEngine()
    service.set_engine(fake_engine)
    service.set_active_chain(7)

    async with database_module.get_session() as session:
        session.add(database_module.Chain(id=7, name="Identity Chain", is_active=True))
        await session.flush()
        mapping_id = await service.create_mapping(
            MIDIMappingDTO(
                channel=1,
                cc=21,
                chain_id=7,
                target_plugin_uri="urn:test:duplicate",
                target_plugin_position=3,
                target_param_index=2,
                target_param_symbol="gain",
                curve_type=MIDICurveType.LINEAR,
            ),
            session,
        )
        assert mapping_id is not None

        mapping = await service.get_mapping(mapping_id, session)
        assert mapping is not None
        assert mapping["target_plugin_position"] == 3

        await service._send_chain_feedback(7, session)  # noqa: SLF001
        await service.start_learn(
            chain_id=7,
            plugin_uri="urn:test:duplicate",
            plugin_position=4,
            param_index=1,
            param_symbol="drive",
        )
        learn_status = service.get_learn_status()
        assert learn_status["target"]["plugin_position"] == 4

        learned_mapping_id = await service.complete_learn(2, 74, session)
        assert learned_mapping_id is not None

    async with database_module.get_session(read_only=True) as session:
        result = await session.execute(select(database_module.MIDIMapping).order_by(database_module.MIDIMapping.id))
        rows = result.scalars().all()
        assert [row.target_plugin_position for row in rows] == [3, 4]

    assert fake_engine.mapping_calls[0]["plugin_position"] == 3
    assert fake_engine.learn_calls[0]["plugin_position"] == 4
    assert fake_engine.parameter_reads == [("urn:test:duplicate", 2, 3)]

    await _dispose_db()


@pytest.mark.asyncio
async def test_midi_engine_persists_and_rehydrates_plugin_position(tmp_path):
    _init_temp_async_db(tmp_path, "midi-engine-identity.db")
    service = MIDIEngineService()
    captured: list[tuple] = []

    async def _callback(*args):
        captured.append(args)

    service.set_parameter_callback(_callback)

    await service.add_mapping(
        channel=1,
        message_type="cc",
        cc_number=14,
        target_plugin_uri="urn:test:duplicate",
        target_plugin_position=5,
        target_param_index=1,
        target_param_name="Drive",
    )
    await service._handle_cc(1, 14, 64)  # noqa: SLF001
    await service.start_learn(
        "urn:test:duplicate",
        1,
        target_plugin_position=6,
        target_param_name="Drive",
    )

    async with database_module.get_session(read_only=True) as session:
        result = await session.execute(select(database_module.MIDILearnState))
        learn_state = result.scalar_one()
        assert learn_state.target_plugin_position == 6

    rehydrated = MIDIEngineService()
    await rehydrated.load_mappings_from_db()
    loaded_mappings = await rehydrated.get_mappings()

    assert captured and captured[0][3] == 5
    assert loaded_mappings[0]["target_plugin_position"] == 5

    await _dispose_db()


@pytest.mark.asyncio
async def test_automation_engine_persists_and_exports_duplicate_safe_parameter_ids(tmp_path):
    _init_temp_async_db(tmp_path, "automation-engine-identity.db")
    engine = AutomationEngine()
    captured: list[tuple] = []

    async def _callback(*args):
        captured.append(args)

    engine.set_parameter_callback(_callback)

    lane = engine.add_lane(
        plugin_uri="urn:test:duplicate",
        param_index=2,
        plugin_position=8,
        param_name="Mix",
        modulation_source=ModulationSource.TIMELINE,
    )
    lane.add_point(0.0, 0.75, CurveType.LINEAR)
    engine.is_playing = True
    engine.current_time = 0.0
    await engine._process_all_lanes()  # noqa: SLF001
    await engine.save_to_database()

    rehydrated = AutomationEngine()
    count = await rehydrated.load_from_database()

    exported = rehydrated.export_all()
    single = rehydrated.export_automation(lane.parameter_id)

    assert count == 1
    assert captured and captured[0][3] == 8
    assert lane.parameter_id == "urn:test:duplicate:2@8"
    assert exported[0]["plugin_position"] == 8
    assert single is not None and single["plugin_position"] == 8
    assert rehydrated.get_parameter_value(lane.parameter_id, 0.0) == pytest.approx(0.75)

    await _dispose_db()


class _FakeNativeMidiBindings:
    def __init__(self) -> None:
        self.updated: list[tuple[int, dict]] = []
        self.added: list[dict] = []
        self.set_all_calls: list[list[dict]] = []
        self.learn_calls: list[tuple] = []
        self.parameter_reads: list[tuple[int, int]] = []

    def midi_update_cc_mapping(self, mapping_id: int, payload: dict) -> bool:
        self.updated.append((mapping_id, dict(payload)))
        return False

    def midi_add_cc_mapping(self, payload: dict) -> int:
        self.added.append(dict(payload))
        return int(payload["id"])

    def midi_set_all_cc_mappings(self, payloads: list[dict]) -> None:
        self.set_all_calls.append([dict(item) for item in payloads])

    def midi_start_learn(
        self,
        chain_id: int,
        plugin_id: int,
        param_symbol: str,
        param_index: int,
        min_val: float,
        max_val: float,
        curve: str,
    ) -> None:
        self.learn_calls.append((chain_id, plugin_id, param_symbol, param_index, min_val, max_val, curve))

    def midi_is_learning(self) -> bool:
        return True

    def midi_get_learn_target(self) -> dict:
        return {"plugin_id": 404, "parameter_index": 2}

    def get_parameter(self, instance_id: int, param_index: int) -> float:
        self.parameter_reads.append((instance_id, param_index))
        return 0.33


@pytest.mark.asyncio
async def test_juce_engine_service_resolves_duplicate_identity_for_midi_bindings(monkeypatch):
    service = JuceEngineService()
    native = _FakeNativeMidiBindings()
    monkeypatch.setattr(service, "_engine", native)
    monkeypatch.setattr(service, "_get_instance_id_for_uri", lambda uri, position=None: 404 if position == 4 else 303)

    created = await service.set_midi_cc_mapping(
        mapping_id=9,
        channel=2,
        cc=71,
        plugin_uri="urn:test:duplicate",
        plugin_position=4,
        param_index=3,
        param_symbol="gain",
        feedback_cc=99,
    )
    batch = await service.set_all_midi_mappings(
        [
            {
                "id": 9,
                "channel": 2,
                "cc": 71,
                "chain_id": 6,
                "target_plugin_uri": "urn:test:duplicate",
                "target_plugin_position": 4,
                "target_param_index": 3,
                "target_param_symbol": "gain",
                "min_val": 0.0,
                "max_val": 1.0,
                "curve_type": "linear",
                "invert": False,
                "is_enabled": True,
                "feedback_enabled": True,
                "feedback_cc": 99,
            }
        ]
    )
    learn = await service.start_midi_learn(
        "urn:test:duplicate",
        3,
        chain_id=6,
        plugin_position=4,
        param_symbol="gain",
    )
    value = await service.get_plugin_parameter("urn:test:duplicate", 3, plugin_position=4)

    assert created is True
    assert batch is True
    assert learn is True
    assert value == pytest.approx(0.33)
    assert native.added[0]["target_plugin"] == 404
    assert native.set_all_calls[0][0]["target_plugin"] == 404
    assert native.learn_calls[0][:4] == (6, 404, "gain", 3)
    assert native.parameter_reads == [(404, 3)]
