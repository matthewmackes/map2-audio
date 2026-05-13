from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services.port80_proxy import LISTEN_PORT, TARGET_HOST, TARGET_PORT, PortProxy


ROOT = Path(__file__).resolve().parents[1]


def test_port80_proxy_targets_static_web_server_not_backend() -> None:
    """The :80 proxy must forward to the :3000 static web server, not directly
    to the :8080 FastAPI backend.

    Why this matters: the static server on :3000 already proxies /api/* and
    WebSocket upgrades to :8080 *and* SPA-falls-back unknown paths to index.html.
    A direct :80 → :8080 chain would bypass the SPA fallback and surface
    FastAPI's bare {"detail":"Not Found"} to mobile clients hitting a React
    route, so this regression test pins the post-2026-05-13 target.
    """
    assert LISTEN_PORT == 80
    assert TARGET_HOST == "127.0.0.1"
    assert TARGET_PORT == 3000, (
        "port80_proxy must forward to the static web server on :3000, "
        "not directly to FastAPI on :8080"
    )


async def _start_echo_server() -> tuple[asyncio.AbstractServer, int]:
    async def handle_echo(
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    break
                writer.write(data)
                await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(handle_echo, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    return server, port


def test_port80_proxy_systemd_unit_targets_the_standalone_module() -> None:
    unit_text = (ROOT / "systemd" / "map2-port80-proxy.service").read_text(encoding="utf-8")

    assert "ExecStart=/usr/bin/python3 -m app.services.port80_proxy" in unit_text
    assert "Requires=map2-backend.service" in unit_text
    assert "After=network.target map2-backend.service" in unit_text


@pytest.mark.asyncio
async def test_port_proxy_forwards_bytes_bidirectionally() -> None:
    target_server, target_port = await _start_echo_server()
    proxy = PortProxy(listen_port=0, target_host="127.0.0.1", target_port=target_port)

    try:
        assert await proxy.start() is True
        proxy_port = proxy._server.sockets[0].getsockname()[1]

        reader, writer = await asyncio.open_connection("127.0.0.1", proxy_port)
        writer.write(b"map2-proxy-smoke")
        await writer.drain()

        echoed = await reader.readexactly(len(b"map2-proxy-smoke"))
        assert echoed == b"map2-proxy-smoke"

        writer.close()
        await writer.wait_closed()
    finally:
        await proxy.stop()
        target_server.close()
        await target_server.wait_closed()
