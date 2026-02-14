import asyncio
import json

from app.routes import sidechain


def _sample_connection(connection_id: str) -> sidechain.SidechainConnection:
    return sidechain.SidechainConnection(
        id=connection_id,
        sourcePluginId=1,
        sourcePluginName="Source",
        destPluginId=2,
        destPluginName="Dest",
        destBus=1,
        active=True,
    )


def test_sidechain_persist_and_load_roundtrip(tmp_path, monkeypatch):
    store_path = tmp_path / "sidechain_connections.json"
    monkeypatch.setattr(sidechain, "_sidechain_store_path", store_path)

    with sidechain._sidechain_lock:
        sidechain._sidechain_connections = {
            "1_2_1": _sample_connection("1_2_1"),
            "3_4_1": _sample_connection("3_4_1"),
        }

    sidechain._persist_sidechain_connections_to_disk()

    with sidechain._sidechain_lock:
        sidechain._sidechain_connections = {}

    sidechain._load_sidechain_connections_from_disk()

    with sidechain._sidechain_lock:
        assert set(sidechain._sidechain_connections.keys()) == {"1_2_1", "3_4_1"}
        assert sidechain._sidechain_connections["1_2_1"].sourcePluginId == 1


def test_sidechain_load_malformed_file_resets_cache(tmp_path, monkeypatch):
    store_path = tmp_path / "sidechain_connections.json"
    store_path.write_text("{broken-json", encoding="utf-8")
    monkeypatch.setattr(sidechain, "_sidechain_store_path", store_path)

    with sidechain._sidechain_lock:
        sidechain._sidechain_connections = {"x": _sample_connection("x")}

    sidechain._load_sidechain_connections_from_disk()

    with sidechain._sidechain_lock:
        assert sidechain._sidechain_connections == {}


def test_get_sidechain_connections_returns_cached_on_engine_failure(monkeypatch):
    with sidechain._sidechain_lock:
        sidechain._sidechain_connections = {"1_2_1": _sample_connection("1_2_1")}

    monkeypatch.setattr(sidechain, "get_audio_engine", lambda: (_ for _ in ()).throw(RuntimeError("engine down")))

    result = asyncio.run(sidechain.get_sidechain_connections())
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0].id == "1_2_1"
