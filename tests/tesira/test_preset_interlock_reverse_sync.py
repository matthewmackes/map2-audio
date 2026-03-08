from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.tesira.preset_interlock import InterlockRule, TesiraPresetInterlock


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_reverse_sync_emits_mapping_payload(monkeypatch):
    interlock = TesiraPresetInterlock(fleet=MagicMock())
    monkeypatch.setattr("app.database.get_session", lambda read_only=True: _FakeSessionContext())

    interlock._get_rules_for_tesira_preset = AsyncMock(return_value=[  # type: ignore[attr-defined]
        InterlockRule(
            id=10,
            map2_preset_id=4,
            tesira_device_id="tesira_SN100",
            tesira_preset_index=3,
            created_at="2026-03-08T00:00:00Z",
        )
    ])
    interlock._broadcast_reverse_sync_detected = AsyncMock()  # type: ignore[attr-defined]

    await interlock.on_tesira_preset_changed("tesira_SN100", 3)

    interlock._broadcast_reverse_sync_detected.assert_awaited_once()  # type: ignore[attr-defined]
    payload = interlock._broadcast_reverse_sync_detected.await_args.args[0]  # type: ignore[attr-defined]
    assert payload["device_id"] == "tesira_SN100"
    assert payload["preset_index"] == 3
    assert payload["matched"] is True
    assert payload["map2_preset_ids"] == [4]
