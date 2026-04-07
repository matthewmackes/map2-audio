"""Backward-compatible session helpers backed by `app.database`."""

from app.database import get_session, get_session as get_db_session
