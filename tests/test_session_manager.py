from __future__ import annotations

import json
from datetime import datetime, timezone

from app.services.session_manager import SessionManager


def test_session_manager_creates_utc_metadata(tmp_path):
    manager = SessionManager(sessions_dir=tmp_path / "sessions")

    session = manager.create_session("UTC Session", description="demo", author="tester")

    created_at = datetime.fromisoformat(session.metadata.created_at)
    modified_at = datetime.fromisoformat(session.metadata.modified_at)
    assert created_at.tzinfo == timezone.utc
    assert modified_at.tzinfo == timezone.utc


def test_session_manager_save_persists_utc_modified_at(tmp_path):
    manager = SessionManager(sessions_dir=tmp_path / "sessions")
    session = manager.create_session("UTC Save")

    path = manager.save_session(session, create_backup=False)
    payload = json.loads(path.read_text())
    modified_at = datetime.fromisoformat(payload["metadata"]["modified_at"])

    assert modified_at.tzinfo == timezone.utc


def test_session_manager_backup_name_stays_stable(tmp_path):
    manager = SessionManager(sessions_dir=tmp_path / "sessions")
    session = manager.create_session("Backup Stable")
    path = manager.save_session(session, create_backup=False)

    manager.save_session(session, path=path, create_backup=True)
    backups = sorted((tmp_path / "sessions" / "backups").glob("Backup Stable_*.map2"))

    assert backups
    assert len(backups[0].stem.rsplit("_", 2)) == 3
