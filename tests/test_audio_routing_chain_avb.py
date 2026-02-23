import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import database as database_module
from app.routes import audio as audio_routes


class _AudioServiceStub:
    def __init__(self):
        self.is_available = True
        self._engine = SimpleNamespace(
            set_input_channels=lambda _ports: True,
            set_output_channels=lambda _ports: True,
        )

    def get_system_info(self):
        return {
            "audio_device": "Test Interface",
            "input_channels": 4,
            "output_channels": 4,
            "sample_rate": 48000,
        }


class _AvbServiceStub:
    def __init__(self, capabilities):
        self._capabilities = capabilities

    def get_channel_capabilities(self, *, system_info=None):
        return self._capabilities


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'audio-routing-test.db'}")


def _seed_chain(chain_id: int):
    async def _seed():
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

    asyncio.run(_seed())


def _read_chain_config(chain_id: int):
    async def _read():
        async with database_module.get_session() as session:
            result = await session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is None:
                return None
            return json.loads(chain.config or "{}")

    return asyncio.run(_read())


def test_chain_routing_persists_avb_endpoints(monkeypatch, tmp_path):
    _init_temp_db(tmp_path)
    _seed_chain(101)

    capabilities = {
        "local_inputs": [
            {"index": 0, "name": "Input 1", "available": True},
            {"index": 1, "name": "Input 2", "available": True},
            {"index": 2, "name": "Input 3", "available": True},
            {"index": 3, "name": "Input 4", "available": True},
        ],
        "local_outputs": [
            {"index": 0, "name": "Output 1", "available": True},
            {"index": 1, "name": "Output 2", "available": True},
            {"index": 2, "name": "Output 3", "available": True},
            {"index": 3, "name": "Output 4", "available": True},
        ],
        "avb_talkers": [
            {"endpoint_id": "node-a:talker-1", "direction": "talker", "device_name": "Talker A", "available": True, "channels": 2, "sample_rate": 48000}
        ],
        "avb_listeners": [
            {"endpoint_id": "node-b:listener-1", "direction": "listener", "device_name": "Listener B", "available": True, "channels": 2, "sample_rate": 48000}
        ],
    }

    monkeypatch.setattr(audio_routes, "get_audio_engine", lambda: _AudioServiceStub())
    monkeypatch.setattr(
        "app.services.avb.avb_service.get_avb_service",
        lambda: _AvbServiceStub(capabilities),
    )
    monkeypatch.setattr(
        audio_routes,
        "_port_routing_config",
        {
            "input_ports": [0, 1],
            "output_ports": [0, 1],
            "input_avb_endpoints": [],
            "output_avb_endpoints": [],
        },
    )
    monkeypatch.setattr(audio_routes, "_chain_port_routing", {})

    updated = asyncio.run(
        audio_routes.set_chain_port_routing(
            chain_id=101,
            input_ports=[0, 1],
            output_ports=[2, 3],
            input_avb_endpoints=["node-a:talker-1"],
            output_avb_endpoints=["node-b:listener-1"],
        )
    )

    assert updated["success"] is True
    assert updated["is_override"] is True
    assert updated["input_avb_endpoints"] == ["node-a:talker-1"]
    assert updated["output_avb_endpoints"] == ["node-b:listener-1"]
    assert len(updated["input_bindings"]) == 3
    assert len(updated["output_bindings"]) == 3

    from_db = _read_chain_config(101)
    assert from_db["audio_routing"]["input_ports"] == [0, 1]
    assert from_db["audio_routing"]["output_ports"] == [2, 3]
    assert from_db["audio_routing"]["input_avb_endpoints"] == ["node-a:talker-1"]
    assert from_db["audio_routing"]["output_avb_endpoints"] == ["node-b:listener-1"]

    fetched = asyncio.run(audio_routes.get_chain_port_routing(101))
    assert fetched["is_override"] is True
    assert fetched["input_avb_endpoints"] == ["node-a:talker-1"]

    cleared = asyncio.run(audio_routes.clear_chain_port_routing(101))
    assert cleared["success"] is True
    assert cleared["is_override"] is False
    assert cleared["input_avb_endpoints"] == []
    assert cleared["output_avb_endpoints"] == []

    from_db_after_clear = _read_chain_config(101)
    assert "audio_routing" not in from_db_after_clear


def test_chain_routing_rejects_unknown_avb_endpoints(monkeypatch, tmp_path):
    _init_temp_db(tmp_path)
    _seed_chain(202)

    capabilities = {
        "local_inputs": [{"index": 0, "name": "Input 1", "available": True}],
        "local_outputs": [{"index": 0, "name": "Output 1", "available": True}],
        "avb_talkers": [{"endpoint_id": "node-a:talker-1", "direction": "talker", "device_name": "Talker A", "available": True, "channels": 2, "sample_rate": 48000}],
        "avb_listeners": [{"endpoint_id": "node-b:listener-1", "direction": "listener", "device_name": "Listener B", "available": True, "channels": 2, "sample_rate": 48000}],
    }

    monkeypatch.setattr(audio_routes, "get_audio_engine", lambda: _AudioServiceStub())
    monkeypatch.setattr(
        "app.services.avb.avb_service.get_avb_service",
        lambda: _AvbServiceStub(capabilities),
    )
    monkeypatch.setattr(audio_routes, "_chain_port_routing", {})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            audio_routes.set_chain_port_routing(
                chain_id=202,
                input_ports=[0],
                output_ports=[0],
                input_avb_endpoints=["node-z:missing-talker"],
                output_avb_endpoints=["node-b:listener-1"],
            )
        )

    assert exc.value.status_code == 400
    assert "Invalid input AVB endpoint" in str(exc.value.detail)
