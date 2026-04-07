from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi import HTTPException

from app.utils.route_helpers import api_route


def test_api_route_logs_success_without_status_glyphs(caplog):
    @api_route(log_success=True)
    async def _handler():
        return {"ok": True}

    with caplog.at_level(logging.INFO, logger="app.utils.route_helpers"):
        result = asyncio.run(_handler())

    assert result == {"ok": True}
    assert caplog.records[0].getMessage().endswith("._handler completed successfully")
    assert all(symbol not in caplog.text for symbol in ("✅", "❌"))


def test_api_route_logs_failures_without_status_glyphs(caplog):
    @api_route(default_status=418)
    async def _handler():
        raise ValueError("bad input")

    with caplog.at_level(logging.ERROR, logger="app.utils.route_helpers"):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_handler())

    assert exc_info.value.status_code == 418
    assert caplog.records[0].getMessage().endswith("._handler failed: bad input")
    assert all(symbol not in caplog.text for symbol in ("✅", "❌"))
