from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError

from app import database as database_module


def _init_temp_db(tmp_path: Path, filename: str) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / filename}")


def test_fresh_schema_rejects_duplicate_plugin_presets_and_ratings(tmp_path):
    _init_temp_db(tmp_path, "preset-constraints.db")

    async def _run() -> None:
        async with database_module.get_session() as session:
            session.add(
                database_module.PluginPreset(
                    name="Studio Lead",
                    plugin_uri="urn:test:plugin",
                    plugin_name="Test Plugin",
                    parameters="{}",
                )
            )
            await session.flush()

        async with database_module.get_session() as session:
            session.add(
                database_module.PluginPreset(
                    name="Studio Lead",
                    plugin_uri="urn:test:plugin",
                    plugin_name="Test Plugin",
                    parameters="{}",
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()

        async with database_module.get_session() as session:
            preset = database_module.CommunityPreset(
                uuid="community-preset-1",
                name="Shared Lead",
                plugin_uri="urn:test:plugin",
                plugin_name="Test Plugin",
                parameters="{}",
            )
            session.add(preset)
            await session.flush()
            session.add(
                database_module.PresetRating(
                    preset_id=preset.id,
                    user_fingerprint="f" * 32,
                    rating=5,
                )
            )
            await session.flush()

        async with database_module.get_session() as session:
            session.add(
                database_module.PresetRating(
                    preset_id=1,
                    user_fingerprint="f" * 32,
                    rating=3,
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()

    asyncio.run(_run())


def test_preset_uniqueness_migration_deduplicates_existing_rows(tmp_path):
    db_path = tmp_path / "preset-migration.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE plugin_presets (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                plugin_uri TEXT NOT NULL
            );
            CREATE TABLE community_presets (
                id INTEGER PRIMARY KEY,
                rating_sum FLOAT DEFAULT 0.0,
                rating_count INTEGER DEFAULT 0
            );
            CREATE TABLE preset_ratings (
                id INTEGER PRIMARY KEY,
                preset_id INTEGER NOT NULL,
                user_fingerprint TEXT NOT NULL,
                rating INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            "INSERT INTO plugin_presets (id, name, plugin_uri) VALUES (1, 'Studio Lead', 'urn:test:plugin')"
        )
        conn.execute(
            "INSERT INTO plugin_presets (id, name, plugin_uri) VALUES (2, 'Studio Lead', 'urn:test:plugin')"
        )
        conn.execute(
            "INSERT INTO plugin_presets (id, name, plugin_uri) VALUES (3, 'Clean Verb', 'urn:test:plugin')"
        )
        conn.execute(
            "INSERT INTO community_presets (id, rating_sum, rating_count) VALUES (1, 11.0, 3)"
        )
        conn.execute(
            "INSERT INTO preset_ratings (id, preset_id, user_fingerprint, rating) VALUES (1, 1, 'fingerprint-a', 4)"
        )
        conn.execute(
            "INSERT INTO preset_ratings (id, preset_id, user_fingerprint, rating) VALUES (2, 1, 'fingerprint-a', 2)"
        )
        conn.execute(
            "INSERT INTO preset_ratings (id, preset_id, user_fingerprint, rating) VALUES (3, 1, 'fingerprint-b', 5)"
        )
        conn.commit()

    database_module._engine = create_engine(f"sqlite:///{db_path}")
    try:
        database_module._ensure_preset_uniqueness_schema_sync()
    finally:
        database_module._engine.dispose()
        database_module._engine = None

    with sqlite3.connect(db_path) as conn:
        plugin_presets = conn.execute(
            "SELECT id, name, plugin_uri FROM plugin_presets ORDER BY id"
        ).fetchall()
        preset_ratings = conn.execute(
            "SELECT id, preset_id, user_fingerprint, rating FROM preset_ratings ORDER BY id"
        ).fetchall()
        rating_totals = conn.execute(
            "SELECT rating_sum, rating_count FROM community_presets WHERE id = 1"
        ).fetchone()

        assert plugin_presets == [
            (1, "Studio Lead", "urn:test:plugin"),
            (3, "Clean Verb", "urn:test:plugin"),
        ]
        assert preset_ratings == [
            (1, 1, "fingerprint-a", 4),
            (3, 1, "fingerprint-b", 5),
        ]
        assert rating_totals == (9.0, 2)

        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO plugin_presets (name, plugin_uri) VALUES ('Studio Lead', 'urn:test:plugin')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO preset_ratings (preset_id, user_fingerprint, rating) VALUES (1, 'fingerprint-a', 1)"
            )
