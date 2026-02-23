import asyncio
import sqlite3
from pathlib import Path
from types import SimpleNamespace

from app.routes import avb as avb_routes
from app.services.avb.aem_cache import AemCache
from app.services.avb import aem_cache as aem_cache_module
from app.services import juce_engine_service


ENTITY_ID_HEX = "0011223344556677"
ENTITY_MODEL_ID = int("00aa00bb00cc00dd", 16)
FIRMWARE_VERSION = "1.2.3"


def _inline_asyncio_to_thread(monkeypatch):
    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)


def _prepare_avdecc_route_env(monkeypatch, engine):
    _inline_asyncio_to_thread(monkeypatch)
    monkeypatch.setattr(avb_routes, "_is_avdecc_enabled", lambda: True)
    monkeypatch.setattr(avb_routes, "is_avb_available", lambda: True)
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: SimpleNamespace(_engine=engine))
    monkeypatch.setattr(juce_engine_service, "JUCE_AVAILABLE", False)
    monkeypatch.setattr(juce_engine_service, "juce_engine", None)


def _build_complete_model():
    return {
        "complete": True,
        "entity_descriptor": {"entity_name": "MAP2 Mock Entity"},
        "stream_inputs": [{"index": 0, "current_format": 0x0200000218000005}],
        "stream_outputs": [{"index": 0, "current_format": 0x0200000218000005}],
    }


def test_entity_model_route_cache_miss_then_hit(monkeypatch, tmp_path: Path):
    class _Engine:
        def __init__(self):
            self.model_calls = 0

        def get_avdecc_entities(self):
            return [
                {
                    "entity_id": ENTITY_ID_HEX,
                    "entity_model_id": f"{ENTITY_MODEL_ID:016x}",
                    "firmware_version": FIRMWARE_VERSION,
                }
            ]

        def get_avdecc_entity_model(self, _entity_id):
            self.model_calls += 1
            return _build_complete_model()

    cache = AemCache(db_path=str(tmp_path / "aem_cache_route_hit.db"))
    engine = _Engine()
    _prepare_avdecc_route_env(monkeypatch, engine)
    monkeypatch.setattr(aem_cache_module, "get_aem_cache", lambda: cache)

    first = asyncio.run(avb_routes.get_entity_model(ENTITY_ID_HEX))
    second = asyncio.run(avb_routes.get_entity_model(ENTITY_ID_HEX))

    assert first["cached"] is False
    assert second["cached"] is True
    assert first["complete"] is True
    assert second["complete"] is True
    assert engine.model_calls == 1

    stats = cache.get_stats()
    assert stats["entry_count"] == 1
    assert stats["miss_count"] == 1
    assert stats["hit_count"] == 1
    assert stats["invalidation_count"] == 0


def test_entity_model_route_invalidates_incomplete_cache_then_writebacks(monkeypatch, tmp_path: Path):
    class _Engine:
        def __init__(self):
            self.model_calls = 0

        def get_avdecc_entities(self):
            return [
                {
                    "entity_id": ENTITY_ID_HEX,
                    "entity_model_id": f"{ENTITY_MODEL_ID:016x}",
                    "firmware_version": FIRMWARE_VERSION,
                }
            ]

        def get_avdecc_entity_model(self, _entity_id):
            self.model_calls += 1
            return _build_complete_model()

    cache = AemCache(db_path=str(tmp_path / "aem_cache_route_incomplete.db"))
    cache.set(
        ENTITY_MODEL_ID,
        FIRMWARE_VERSION,
        {
            "complete": False,
            "missing": ["stream_descriptors"],
            "entity_descriptor": {"entity_name": "stale"},
        },
    )

    engine = _Engine()
    _prepare_avdecc_route_env(monkeypatch, engine)
    monkeypatch.setattr(aem_cache_module, "get_aem_cache", lambda: cache)

    first = asyncio.run(avb_routes.get_entity_model(ENTITY_ID_HEX))
    second = asyncio.run(avb_routes.get_entity_model(ENTITY_ID_HEX))

    assert first["cached"] is False
    assert first["complete"] is True
    assert second["cached"] is True
    assert engine.model_calls == 1

    stats = cache.get_stats()
    assert stats["invalidation_incomplete_count"] == 1
    assert stats["invalidation_count"] == 1
    assert stats["miss_count"] == 1
    assert stats["hit_count"] == 1


def test_aem_cache_invalidates_stale_entries(tmp_path: Path):
    db_path = tmp_path / "aem_cache_stale.db"
    cache = AemCache(db_path=str(db_path))
    cache.set(ENTITY_MODEL_ID, FIRMWARE_VERSION, _build_complete_model())

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            UPDATE entity_models
            SET created_at = datetime('now', '-2 day')
            WHERE entity_model_id = ? AND firmware_version = ?
            """,
            (ENTITY_MODEL_ID, FIRMWARE_VERSION),
        )
        conn.commit()

    assert cache.get(
        ENTITY_MODEL_ID,
        FIRMWARE_VERSION,
        max_age_seconds=60,
        require_complete=True,
    ) is None

    stats = cache.get_stats()
    assert stats["entry_count"] == 0
    assert stats["miss_count"] == 1
    assert stats["invalidation_stale_count"] == 1


def test_aem_cache_invalidates_incompatible_payload(tmp_path: Path):
    cache = AemCache(db_path=str(tmp_path / "aem_cache_incompatible.db"))
    cache.set(
        ENTITY_MODEL_ID,
        FIRMWARE_VERSION,
        {
            "complete": True,
            "entity_model_id": "ffffffffffffffff",
            "firmware_version": FIRMWARE_VERSION,
        },
    )

    assert cache.get(
        ENTITY_MODEL_ID,
        FIRMWARE_VERSION,
        require_complete=True,
        require_compatible=True,
    ) is None

    stats = cache.get_stats()
    assert stats["entry_count"] == 0
    assert stats["invalidation_incompatible_count"] == 1
    assert stats["miss_count"] == 1


def test_aem_cache_invalidates_corrupt_payload(tmp_path: Path):
    db_path = tmp_path / "aem_cache_corrupt.db"
    cache = AemCache(db_path=str(db_path))
    cache.set(ENTITY_MODEL_ID, FIRMWARE_VERSION, _build_complete_model())

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            UPDATE entity_models
            SET json_data = '{broken-json'
            WHERE entity_model_id = ? AND firmware_version = ?
            """,
            (ENTITY_MODEL_ID, FIRMWARE_VERSION),
        )
        conn.commit()

    assert cache.get(ENTITY_MODEL_ID, FIRMWARE_VERSION) is None

    stats = cache.get_stats()
    assert stats["entry_count"] == 0
    assert stats["invalidation_corrupt_count"] == 1
    assert stats["miss_count"] == 1
