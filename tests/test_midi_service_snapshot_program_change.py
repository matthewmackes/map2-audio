import asyncio

from app import database as database_module
from app.services.midi_service import MIDIService
from app.services.snapshot_service import SnapshotService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-service-snapshot-program.db'}")


def _snapshot_detail_payload():
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
                "name": "Path A",
                "plugins": [],
            }
        ],
        "routing": {
            "mode": "parallel_blend",
            "active_channel_key": "channel-0",
            "blend_positions": {"channel-0": 100.0},
            "morph_position": 0.5,
            "series_order": ["channel-0"],
        },
        "midi_map": [{"action": "load_snapshot", "program_number": 23}],
    }


def test_midi_service_prefers_canonical_snapshot_program_recall(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    activation_calls: list[tuple[int, str]] = []

    async def _fake_activate_snapshot(self, snapshot_id, *, triggered_by="ui"):
        activation_calls.append((snapshot_id, triggered_by))
        return {
            "status": "success",
            "snapshot_id": snapshot_id,
            "name": "ProgramSnapshot",
            "snapshot_data": {"id": snapshot_id},
            "params_applied": 0,
            "bypass_applied": 0,
        }

    async def _fake_get_chain_by_program(self, program_number, session, bank_msb=0, bank_lsb=0):
        return 77

    async def _unexpected_activate_chain(self, chain_id, session):
        raise AssertionError(f"Chain fallback should not run when snapshot PC#{chain_id} exists")

    monkeypatch.setattr(SnapshotService, "activate_snapshot", _fake_activate_snapshot)
    monkeypatch.setattr(MIDIService, "get_chain_by_program", _fake_get_chain_by_program)
    monkeypatch.setattr(MIDIService, "activate_chain", _unexpected_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            snapshot_service = SnapshotService(session)
            created = await snapshot_service.create_snapshot(
                name="ProgramSnapshot",
                description="Canonical MIDI recall test",
                tags=["midi"],
                program_number=23,
                detail_payload=_snapshot_detail_payload(),
            )

            midi_service = MIDIService()
            chain_id = await midi_service.handle_program_change(channel=1, program=23, session=session)

            assert chain_id is None
            assert activation_calls == [(created["id"], "midi_pc")]

    asyncio.run(_run())


def test_midi_service_falls_back_to_chain_when_snapshot_mapping_is_missing(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    activated_chains: list[int] = []

    async def _fake_get_chain_by_program(self, program_number, session, bank_msb=0, bank_lsb=0):
        assert program_number == 99
        return 41

    async def _fake_activate_chain(self, chain_id, session):
        activated_chains.append(chain_id)
        return True

    async def _unexpected_activate_snapshot(self, snapshot_id, *, triggered_by="ui"):
        raise AssertionError("Snapshot activation should not run when no snapshot is mapped")

    monkeypatch.setattr(MIDIService, "get_chain_by_program", _fake_get_chain_by_program)
    monkeypatch.setattr(MIDIService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(SnapshotService, "activate_snapshot", _unexpected_activate_snapshot)

    async def _run():
        async with database_module.get_session() as session:
            midi_service = MIDIService()
            chain_id = await midi_service.handle_program_change(channel=1, program=99, session=session)

            assert chain_id == 41
            assert activated_chains == [41]

    asyncio.run(_run())
