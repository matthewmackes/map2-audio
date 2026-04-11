from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import text

import app.database as database_module


def _columns(db_path: Path, table_name: str) -> set[str]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {str(row[1]) for row in rows}
    finally:
        conn.close()


def _migration_versions(db_path: Path) -> list[int]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
        return [int(row[0]) for row in rows]
    finally:
        conn.close()


def test_sync_init_applies_tracked_schema_migrations_once(tmp_path):
    db_path = tmp_path / "tracked-migrations.db"
    sqlite_url = f"sqlite:///{db_path}"

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE special_settings (id INTEGER PRIMARY KEY, promoted_advanced_routes TEXT)")
        conn.commit()
    finally:
        conn.close()

    database_module.init_db(sqlite_url)
    try:
        assert "pinned_routes" in _columns(db_path, "special_settings")
        assert _migration_versions(db_path) == [1, 2, 3, 4, 5, 6, 8]

        database_module.apply_pending_schema_migrations_sync()
        assert _migration_versions(db_path) == [1, 2, 3, 4, 5, 6, 8]
    finally:
        if database_module._engine is not None:
            database_module._engine.dispose()
        database_module._engine = None
        database_module._SessionLocal = None
        database_module._sync_migrations_applied = False


def test_sync_init_adds_missing_plugin_metadata_columns(tmp_path):
    db_path = tmp_path / "legacy-plugin-metadata.db"
    sqlite_url = f"sqlite:///{db_path}"

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE plugins (
                id INTEGER PRIMARY KEY,
                uri VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                author VARCHAR(255),
                version VARCHAR(20),
                parameters TEXT,
                created_at DATETIME,
                updated_at DATETIME,
                reported_latency_samples INTEGER,
                measured_latency_samples INTEGER,
                has_latency_port BOOLEAN,
                latency_port_index INTEGER,
                priority INTEGER,
                auto_bypass_on_overload BOOLEAN,
                estimated_cpu_us FLOAT,
                is_hard_rt_capable BOOLEAN,
                has_options_interface BOOLEAN,
                has_state_interface BOOLEAN,
                has_worker_interface BOOLEAN,
                bundle_path VARCHAR(512)
            )
            """
        )
        conn.execute(
            """
            INSERT INTO plugins (
                uri, name, category, parameters, reported_latency_samples,
                measured_latency_samples, has_latency_port, priority,
                auto_bypass_on_overload, estimated_cpu_us, is_hard_rt_capable,
                has_options_interface, has_state_interface, has_worker_interface
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "map2://legacy/plugin",
                "Legacy Plugin",
                "Legacy",
                "{}",
                0,
                0,
                0,
                5,
                1,
                100.0,
                0,
                0,
                0,
                0,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    database_module.init_db(sqlite_url)
    try:
        plugin_columns = _columns(db_path, "plugins")
        assert {"tags", "user_description", "is_favorite", "is_hidden"}.issubset(plugin_columns)

        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute(
                "SELECT tags, user_description, is_favorite, is_hidden FROM plugins WHERE uri = ?",
                ("map2://legacy/plugin",),
            ).fetchone()
        finally:
            conn.close()

        assert row == ("[]", "", 0, 0)
    finally:
        if database_module._engine is not None:
            database_module._engine.dispose()
        database_module._engine = None
        database_module._SessionLocal = None
        database_module._sync_migrations_applied = False
