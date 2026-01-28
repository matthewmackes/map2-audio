#!/usr/bin/env python3
"""
Database Migration: Add is_favorite and rating columns to ImpulseResponse and NAMModel tables.

Run with: python scripts/migrate_add_favorites_ratings.py
"""

import sqlite3
import os
import sys
from pathlib import Path

# Default database path
DB_PATH = Path("data/map2.db")

def migrate(db_path: Path = DB_PATH):
    """Add is_favorite and rating columns to existing tables."""

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        print("Creating fresh database with new schema...")
        return True  # New database will have columns from schema

    print(f"Migrating database: {db_path}")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    migrations = [
        # ImpulseResponse columns
        ("impulse_responses", "is_favorite", "INTEGER DEFAULT 0"),
        ("impulse_responses", "rating", "INTEGER"),
        # NAMModel columns
        ("nam_models", "is_favorite", "INTEGER DEFAULT 0"),
        ("nam_models", "rating", "INTEGER"),
        ("nam_models", "source_url", "VARCHAR(512)"),
    ]

    for table, column, column_type in migrations:
        try:
            # Check if column exists
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]

            if column in columns:
                print(f"  ✓ {table}.{column} already exists")
                continue

            # Add column
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
            print(f"  + Added {table}.{column}")

        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                print(f"  - Table {table} not found (will be created on next run)")
            else:
                print(f"  ! Error adding {table}.{column}: {e}")

    conn.commit()
    conn.close()

    print("Migration complete!")
    return True


if __name__ == "__main__":
    # Allow custom db path as argument
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DB_PATH
    success = migrate(db_path)
    sys.exit(0 if success else 1)
