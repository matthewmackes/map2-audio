"""Backward-compatible session helpers backed by `app.database`."""

from app import database as database_module


def get_session(*args, **kwargs):
    return database_module.get_session(*args, **kwargs)


def get_db_session(*args, **kwargs):
    return database_module.get_session(*args, **kwargs)
