#!/usr/bin/env python3
"""
Database migration script to add featured amp columns to NAMModel table.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from app.database import get_db

def migrate_add_featured_columns():
    """Add featured columns to nam_models table."""
    db = get_db()
    try:
        # Check if columns already exist
        result = db.execute(
            text("PRAGMA table_info(nam_models)")
        ).fetchall()
        
        column_names = [row[1] for row in result]
        
        migrations = []
        
        if 'is_featured' not in column_names:
            migrations.append(
                "ALTER TABLE nam_models ADD COLUMN is_featured BOOLEAN DEFAULT 0"
            )
        
        if 'featured_position' not in column_names:
            migrations.append(
                "ALTER TABLE nam_models ADD COLUMN featured_position INTEGER DEFAULT NULL"
            )
        
        if 'source_tone3000_id' not in column_names:
            migrations.append(
                "ALTER TABLE nam_models ADD COLUMN source_tone3000_id VARCHAR(255) DEFAULT NULL"
            )
        
        if 'source_tone3000_name' not in column_names:
            migrations.append(
                "ALTER TABLE nam_models ADD COLUMN source_tone3000_name VARCHAR(255) DEFAULT NULL"
            )
        
        if not migrations:
            print("✓ All featured columns already exist")
            return True
        
        for migration_sql in migrations:
            print(f"Executing: {migration_sql}")
            db.execute(text(migration_sql))
            print(f"✓ Success")
        
        db.commit()
        print("\n✅ Migration complete!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = migrate_add_featured_columns()
    sys.exit(0 if success else 1)
