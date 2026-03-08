import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app import database as database_module
from app.services.chain_service import ChainService
from app.services.effects_loops import EffectsLoopService
from app.services.avb.avb_router import StreamDirection


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'effects-loops-test.db'}")


async def _seed_chain(chain_id: int):
    async with database_module.get_session() as session:
        session.add(
            database_module.Chain(
                id=chain_id,
                name=f"Chain {chain_id}",
                is_active=False,
                config="{}",
            )
        )
        await session.flush()


class _FakeEngine:
    def __init__(self):
        self.loop_definitions = []
        self.chain_insertions = {}

    async def set_external_loop_definitions(self, payload):
        self.loop_definitions = list(payload)
        return True

    async def set_chain_loop_insertions(self, chain_id, insertions):
        self.chain_insertions[int(chain_id)] = list(insertions)
        return True

    async def set_loop_bypass(self, _loop_id, _bypass):
        return True

    async def calibrate_loop(self, _loop_id, _options):
        return True

    async def get_loop_metrics(self, loop_id=""):
        return [{
            "loop_id": loop_id,
            "measured_added_latency_ms": 0.25,
            "compensation_samples": 12,
        }]


class _FakeRouter:
    def __init__(self):
        talker = SimpleNamespace(
            entity_id="0011223344556677",
            unique_id=1,
            direction=StreamDirection.TALKER,
            device_type="map2",
            device_name="MAP2 Talker",
            channels=2,
            sample_rate=48000,
            mac_address="00:11:22:33:44:55",
            available=True,
            endpoint_id=lambda: "talker-1",
        )
        listener = SimpleNamespace(
            entity_id="8899aabbccddeeff",
            unique_id=2,
            direction=StreamDirection.LISTENER,
            device_type="tesira",
            device_name="Tesira Listener",
            channels=2,
            sample_rate=48000,
            mac_address="66:77:88:99:aa:bb",
            available=True,
            endpoint_id=lambda: "listener-1",
        )
        self.endpoints = {
            "talker-1": talker,
            "listener-1": listener,
        }
        self.connect_calls = []

    async def connect(self, talker_id, listener_id, **kwargs):
        self.connect_calls.append((talker_id, listener_id, kwargs))
        return {
            "success": True,
            "connection_id": f"{talker_id}→{listener_id}",
            "trace_id": "connect-test",
        }

    async def disconnect(self, _talker_id, _listener_id, **_kwargs):
        return {"success": True, "trace_id": "disconnect-test"}


class _FakeTesiraResponse:
    def __init__(self, ok: bool, error_code: str = "", error_detail: str = ""):
        self.ok = ok
        self.error_code = error_code
        self.error_detail = error_detail


class _FakeTesiraClient:
    def __init__(self, failing_tags=None):
        self.failing_tags = set(failing_tags or [])

    async def send(self, instance_tag, _service, _attribute, *_args):
        if instance_tag in self.failing_tags:
            return _FakeTesiraResponse(False, error_code="OBJECT_NOT_FOUND", error_detail="missing instance tag")
        return _FakeTesiraResponse(True)


class _FakeTesiraDevice:
    def __init__(self, device_id: str, connected: bool = True, failing_tags=None):
        self.device_id = device_id
        self.connected = connected
        self._client = _FakeTesiraClient(failing_tags=failing_tags)


class _FakeTesiraFleet:
    def __init__(self, devices):
        self._devices = {d.device_id: d for d in devices}

    def get_device(self, device_id):
        return self._devices.get(device_id)


def test_effects_loop_channel_validation(tmp_path):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(1))

    async def _run():
        async with database_module.get_session() as session:
            service = EffectsLoopService(session)
            with pytest.raises(ValueError, match="channels must be within 1..8"):
                await service.create_loop({
                    "name": "Invalid",
                    "channels": 9,
                    "topology": "serial_insert",
                })

    asyncio.run(_run())


def test_template_validation_pass_and_fail(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            service = EffectsLoopService(session)
            invalid = await service.upsert_template(
                "tmpl-invalid",
                {
                    "tesira_device_id": "tesira_1",
                    "stream_in_tags": [],
                    "stream_out_tags": ["out.1"],
                },
            )
            assert invalid["validation_status"] == "invalid"

            valid = await service.upsert_template(
                "tmpl-valid",
                {
                    "tesira_device_id": "tesira_1",
                    "stream_in_tags": ["in.1", "in.2"],
                    "stream_out_tags": ["out.1", "out.2"],
                    "crosspoint_tags": ["xpt.main"],
                    "channel_map_policy": "direct",
                },
            )
            assert valid["validation_status"] == "valid"

            validation = await service.validate_template("tmpl-valid")
            assert validation["valid"] is True

    asyncio.run(_run())


def test_create_insert_activate_bypass_delete_loop(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(7))
    monkeypatch.setattr(
        "app.services.avb.get_avb_readiness",
        lambda *args, **kwargs: {"checks": {"ptp4l_running": True}},
    )

    async def _run():
        fake_engine = _FakeEngine()
        fake_router = _FakeRouter()

        async with database_module.get_session() as session:
            service = EffectsLoopService(
                session,
                engine_service=fake_engine,
                avb_router=fake_router,
                tesira_fleet=None,
            )

            loop = await service.create_loop({
                "name": "Vocal Verb",
                "channels": 2,
                "topology": "serial_insert",
                "send_endpoint_id": "talker-1",
                "return_endpoint_id": "listener-1",
            })
            loop_id = loop["loop_id"]

            inserted = await service.insert_chain_loop(7, {
                "loop_id": loop_id,
                "slot_index": 0,
                "mode": "serial_insert",
            })
            assert inserted["insertion"]["loop_id"] == loop_id

            activated = await service.activate_loop(loop_id, {"audition_mode": False})
            assert activated["success"] is True
            assert activated["connection_role"] == "effects_loop_send"
            assert fake_router.connect_calls

            bypassed = await service.set_loop_bypass(loop_id, True)
            assert bypassed["state_actual"] == "bypassed"

            deleted = await service.delete_loop(loop_id)
            assert deleted is True

            remaining = await service.list_chain_insertions(7)
            assert remaining["count"] == 0

    asyncio.run(_run())


def test_template_runtime_status_reports_probe_failures(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        healthy_fleet = _FakeTesiraFleet([_FakeTesiraDevice("tesira_ok")])
        unhealthy_fleet = _FakeTesiraFleet([_FakeTesiraDevice("tesira_bad", failing_tags={"missing.tag"})])

        async with database_module.get_session() as session:
            service = EffectsLoopService(session, tesira_fleet=healthy_fleet)
            template = await service.upsert_template(
                "tmpl-runtime",
                {
                    "tesira_device_id": "tesira_ok",
                    "stream_in_tags": ["ExplicitAVBInStream1"],
                    "stream_out_tags": ["ExplicitAVBOutStream1"],
                    "meter_tags": ["LevelControl1"],
                    "bypass_tags": ["BypassBlock1"],
                    "crosspoint_tags": ["Router1"],
                    "channel_map_policy": "direct",
                },
            )
            runtime = template["runtime_status"]
            assert runtime["drift_status"] in {"ok", "warning"}
            assert runtime["alarm_count"] == 0

        async with database_module.get_session() as session:
            service = EffectsLoopService(session, tesira_fleet=unhealthy_fleet)
            await service.upsert_template(
                "tmpl-runtime-bad",
                {
                    "tesira_device_id": "tesira_bad",
                    "stream_in_tags": ["missing.tag"],
                    "stream_out_tags": ["ExplicitAVBOutStream1"],
                    "channel_map_policy": "direct",
                },
            )
            validation = await service.validate_template("tmpl-runtime-bad")
            runtime = validation["runtime_status"]
            assert runtime["drift_status"] == "error"
            assert runtime["alarm_count"] >= 1
            assert any(alarm.get("code") == "tag_probe_failed" for alarm in runtime.get("alarms", []))

    asyncio.run(_run())


def test_chain_service_returns_loop_insertions_and_resolved_loops(tmp_path):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(11))

    async def _run():
        async with database_module.get_session() as session:
            loop_service = EffectsLoopService(session)
            loop = await loop_service.create_loop({
                "name": "Drum Parallel",
                "channels": 2,
                "topology": "parallel_send_return",
            })
            await loop_service.insert_chain_loop(11, {
                "loop_id": loop["loop_id"],
                "slot_index": 0,
                "mode": "parallel_send_return",
                "blend_pct": 35.0,
            })

        async with database_module.get_session() as session:
            chain_service = ChainService(session)
            chain = await chain_service.get_chain(11)

        assert chain is not None
        assert chain["loop_insertions"][0]["loop_id"] == loop["loop_id"]
        assert chain["effects_loops"][0]["loop_id"] == loop["loop_id"]

        async with database_module.get_session() as session:
            result = await session.execute(select(database_module.EffectsLoopInsertion))
            assert len(list(result.scalars().all())) == 1

    asyncio.run(_run())


def test_engine_sync_orders_insertions_and_preserves_dsp_fields(tmp_path):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(13))

    async def _run():
        fake_engine = _FakeEngine()
        async with database_module.get_session() as session:
            service = EffectsLoopService(
                session,
                engine_service=fake_engine,
                avb_router=None,
                tesira_fleet=None,
            )

            loop_a = await service.create_loop(
                {
                    "name": "Loop A",
                    "channels": 2,
                    "topology": "serial_insert",
                }
            )
            loop_b = await service.create_loop(
                {
                    "name": "Loop B",
                    "channels": 2,
                    "topology": "parallel_send_return",
                }
            )

            await service.insert_chain_loop(
                13,
                {
                    "loop_id": loop_a["loop_id"],
                    "slot_index": 1,
                    "mode": "serial_insert",
                    "blend_pct": 100.0,
                    "send_gain_db": -3.0,
                    "return_gain_db": 1.5,
                    "crossfade_ms": 24,
                },
            )
            await service.insert_chain_loop(
                13,
                {
                    "loop_id": loop_b["loop_id"],
                    "slot_index": 0,
                    "mode": "parallel_send_return",
                    "blend_pct": 35.0,
                    "send_gain_db": -6.0,
                    "return_gain_db": 2.0,
                    "crossfade_ms": 48,
                },
            )

            payload = fake_engine.chain_insertions[13]
            assert [row["slot_index"] for row in payload] == [0, 2]
            assert payload[0]["loop_id"] == loop_b["loop_id"]
            assert payload[0]["mode"] == "parallel_send_return"
            assert payload[0]["blend_pct"] == pytest.approx(35.0)
            assert payload[0]["send_gain_db"] == pytest.approx(-6.0)
            assert payload[0]["return_gain_db"] == pytest.approx(2.0)
            assert payload[0]["crossfade_ms"] == 48

            assert payload[1]["loop_id"] == loop_a["loop_id"]
            assert payload[1]["mode"] == "serial_insert"
            assert payload[1]["blend_pct"] == pytest.approx(100.0)
            assert payload[1]["send_gain_db"] == pytest.approx(-3.0)
            assert payload[1]["return_gain_db"] == pytest.approx(1.5)
            assert payload[1]["crossfade_ms"] == 24

    asyncio.run(_run())
