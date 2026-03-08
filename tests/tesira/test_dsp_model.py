from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock

import pytest

from app.services.tesira.tesira_dsp_model import TesiraDspModel


@dataclass
class _Resp:
    ok: bool
    value: object = None
    error_code: str | None = None
    error_detail: str | None = None


class _FakeClient:
    async def send(self, instance_tag: str, command: str, attribute: str, *args):
        if command == "get" and instance_tag == "LevelControl1" and attribute == "numChannels":
            return _Resp(ok=True, value=4)
        if command == "get" and instance_tag == "PEQ1" and attribute == "numBands":
            return _Resp(ok=True, value=6)
        if command == "get" and attribute == "mute":
            return _Resp(ok=True, value=True)
        if command == "set":
            return _Resp(ok=True, value=None)
        return _Resp(ok=False, error_code="not_found", error_detail="missing")


class _FakeDevice:
    device_id = "tesira_test_1"
    _client = _FakeClient()


@pytest.mark.asyncio
async def test_probe_device_discovers_known_blocks():
    model = TesiraDspModel()
    model._persist_blocks = AsyncMock()  # type: ignore[method-assign]

    result = await model.probe_device(_FakeDevice(), max_instances=4)
    tags = {b.instance_tag for b in result.blocks}
    assert "LevelControl1" in tags
    assert "PEQ1" in tags
    assert result.discovered_count >= 2
    level_block = next(b for b in result.blocks if b.instance_tag == "LevelControl1")
    assert level_block.category == "gain"
    assert level_block.editor.get("family") == "level"


@pytest.mark.asyncio
async def test_bulk_get_and_set():
    model = TesiraDspModel()
    device = _FakeDevice()

    set_results = await model.bulk_set(
        device,
        [{"id": "s1", "instance_tag": "LevelControl1", "attribute": "mute", "args": [1], "value": True}],
    )
    assert set_results[0]["ok"] is True

    get_results = await model.bulk_get(
        device,
        [{"id": "g1", "instance_tag": "LevelControl1", "attribute": "mute", "args": [1]}],
    )
    assert get_results[0]["ok"] is True
    assert get_results[0]["value"] is True
