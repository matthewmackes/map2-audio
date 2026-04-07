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
        assert _migration_versions(db_path) == [1, 2, 3, 4, 5]

        database_module.apply_pending_schema_migrations_sync()
        assert _migration_versions(db_path) == [1, 2, 3, 4, 5]
    finally:
        if database_module._engine is not None:
            database_module._engine.dispose()
        database_module._engine = None
        database_module._SessionLocal = None
        database_module._sync_migrations_applied = False
