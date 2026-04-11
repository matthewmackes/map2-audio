from __future__ import annotations

from datetime import datetime, timezone

from app.services.audio_meters import MeterBroadcaster


def test_audio_meter_levels_use_utc_timestamp() -> None:
    broadcaster = MeterBroadcaster()
    payload = broadcaster.get_levels()

    parsed = datetime.fromisoformat(payload["timestamp"])
    assert parsed.tzinfo == timezone.utc
