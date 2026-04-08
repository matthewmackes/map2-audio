import asyncio
import inspect
import sqlite3
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from sqlalchemy import Column, Integer, String, create_engine, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.database import RetryingAsyncSession, RetryingSession
from app import database as database_module


Base = declarative_base()


class RetryItem(Base):
    __tablename__ = "retry_items"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)


def _schedule_lock_release(conn: sqlite3.Connection, delay_s: float) -> threading.Thread:
    def _release() -> None:
        time.sleep(delay_s)
        conn.commit()
        conn.close()

    thread = threading.Thread(target=_release, daemon=True)
    thread.start()
    return thread


def test_retrying_session_replays_locked_insert_commit():
    with TemporaryDirectory() as td:
        db_path = Path(td) / "retry-sync.db"
        engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        SessionLocal = sessionmaker(bind=engine, class_=RetryingSession, expire_on_commit=False)

        lock_conn = sqlite3.connect(db_path, timeout=5.0, check_same_thread=False)
        lock_conn.execute("PRAGMA journal_mode=WAL")
        lock_conn.execute("BEGIN IMMEDIATE")
        lock_conn.execute("INSERT INTO retry_items(name) VALUES (?)", ("held",))
        lock_thread = _schedule_lock_release(lock_conn, 0.20)

        session = SessionLocal()
        try:
            session.add(RetryItem(name="worker"))
            session.commit()
            names = session.execute(select(RetryItem.name).order_by(RetryItem.id)).scalars().all()
            assert names == ["held", "worker"]
        finally:
            session.close()
            engine.dispose()
            lock_thread.join(timeout=1.0)


@pytest.mark.asyncio
async def test_retrying_async_session_replays_locked_update_and_delete():
    with TemporaryDirectory() as td:
        db_path = Path(td) / "retry-async.db"
        sync_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(sync_engine)
        with sync_engine.begin() as conn:
            conn.execute(RetryItem.__table__.insert().values(name="base"))

        async_engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        SessionLocal = async_sessionmaker(
            async_engine,
            class_=RetryingAsyncSession,
            expire_on_commit=False,
        )

        lock_conn = sqlite3.connect(db_path, timeout=5.0, check_same_thread=False)
        lock_conn.execute("PRAGMA journal_mode=WAL")
        lock_conn.execute("BEGIN IMMEDIATE")
        lock_conn.execute("UPDATE retry_items SET name = ? WHERE id = 1", ("held-update",))
        update_lock_thread = _schedule_lock_release(lock_conn, 0.20)

        async with SessionLocal() as session:
            item = await session.get(RetryItem, 1)
            item.name = "worker-update"
            await session.commit()

            updated_names = (await session.execute(select(RetryItem.name).order_by(RetryItem.id))).scalars().all()
            assert updated_names == ["worker-update"]

            delete_lock_conn = sqlite3.connect(db_path, timeout=5.0, check_same_thread=False)
            delete_lock_conn.execute("PRAGMA journal_mode=WAL")
            delete_lock_conn.execute("BEGIN IMMEDIATE")
            delete_lock_conn.execute("UPDATE retry_items SET name = ? WHERE id = 1", ("held-delete",))
            delete_lock_thread = _schedule_lock_release(delete_lock_conn, 0.20)

            await session.delete(item)
            await session.commit()

            remaining = (await session.execute(select(RetryItem.id))).scalars().all()
            assert remaining == []

        await async_engine.dispose()
        sync_engine.dispose()
        update_lock_thread.join(timeout=1.0)
        delete_lock_thread.join(timeout=1.0)


def test_retry_flags_are_instance_local():
    sync_session_a = RetryingSession()
    sync_session_b = RetryingSession()
    async_session_a = RetryingAsyncSession(bind=None)
    async_session_b = RetryingAsyncSession(bind=None)
    try:
        assert sync_session_a._sqlite_lock_retry_active is False
        assert sync_session_b._sqlite_lock_retry_active is False
        sync_session_a._sqlite_lock_retry_active = True
        assert sync_session_b._sqlite_lock_retry_active is False

        assert async_session_a._sqlite_lock_retry_active is False
        assert async_session_b._sqlite_lock_retry_active is False
        async_session_a._sqlite_lock_retry_active = True
        assert async_session_b._sqlite_lock_retry_active is False
    finally:
        sync_session_a.close()
        sync_session_b.close()
        asyncio.run(async_session_a.close())
        asyncio.run(async_session_b.close())


def test_async_sqlite_retry_uses_asyncio_sleep_not_time_sleep():
    source = inspect.getsource(database_module._run_async_sqlite_lock_retry)
    assert "await asyncio.sleep" in source
    assert "time.sleep" not in source
