from __future__ import annotations

import asyncio

from app.services.db_pool_manager import ConnectionPoolConfig, DatabasePoolManager


class _FakeSession:
    def __init__(self) -> None:
        self.executed = []

    async def execute(self, statement):
        self.executed.append(str(statement))


def test_database_pool_manager_health_check_uses_text_statement(monkeypatch):
    manager = DatabasePoolManager()
    manager._initialized = True
    manager._config = ConnectionPoolConfig()
    fake_session = _FakeSession()

    class _Ctx:
        async def __aenter__(self):
            return fake_session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(manager, "session", lambda: _Ctx())

    healthy = asyncio.run(manager.health_check())

    assert healthy is True
    assert fake_session.executed
    assert "SELECT 1" in fake_session.executed[0]


def test_database_session_module_reexports_canonical_get_session():
    import app.database as database_module
    import app.database_session as session_module

    assert session_module.get_session is database_module.get_session
    assert session_module.get_db_session is database_module.get_session
