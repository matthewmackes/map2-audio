import asyncio
from unittest.mock import patch

from app.services.tesira.ttp_ssh_client import TTPSSHClient


def test_parse_ok_response():
    resp = TTPSSHClient._parse_response("+OK value=12.5")
    assert resp.ok is True
    assert float(resp.value) == 12.5


def test_parse_error_response():
    resp = TTPSSHClient._parse_response("-ERR INSTANCE_TAG_NOT_FOUND")
    assert resp.ok is False
    assert resp.error_code == "INSTANCE_TAG_NOT_FOUND"


def test_reconnect_task_is_singleton_until_done():
    client = TTPSSHClient(host="10.0.0.5", password="super-secret")
    original_create_task = asyncio.create_task

    async def _pending():
        await asyncio.Event().wait()

    created = []

    def _fake_create_task(coro, name=None):
        task = original_create_task(_pending(), name=name)
        created.append(task)
        coro.close()
        return task

    async def _run():
        with patch("app.services.tesira.ttp_ssh_client.asyncio.create_task", side_effect=_fake_create_task):
            client._ensure_reconnect_task()
            client._ensure_reconnect_task()
            await asyncio.sleep(0)
            assert len(created) == 1
            created[0].cancel()
            try:
                await created[0]
            except asyncio.CancelledError:
                pass

    asyncio.run(_run())
