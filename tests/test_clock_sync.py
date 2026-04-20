from __future__ import annotations

import logging

from app.config_schema import CANONICAL_CLOCK_SYNC_PROFILE
from app.services import clock_sync
from app.services.clock_sync import get_clock_sync_profile


def _getter(values: dict[str, object]):
    def _config_get(key: str, default=None):
        return values.get(key, default)

    return _config_get


def test_clock_sync_profile_prefers_canonical_key() -> None:
    profile = get_clock_sync_profile(
        _getter(
            {
                "clock_sync.selected_profile": "dual_locked_48k",
                "audio.sync_profile": "legacy_profile",
            }
        )
    )

    assert profile.name == "dual_locked_48k"
    assert profile.source_key == "clock_sync.selected_profile"
    assert str(profile) == "dual_locked_48k"


def test_clock_sync_profile_warns_once_for_legacy_fallback(caplog) -> None:
    clock_sync._LEGACY_SYNC_PROFILE_WARNING_EMITTED = False
    caplog.set_level(logging.WARNING, logger="app.services.clock_sync")
    getter = _getter({"audio.sync_profile": "spdif_master_48k"})

    first = get_clock_sync_profile(getter)
    second = get_clock_sync_profile(getter)

    assert first.name == "spdif_master_48k"
    assert first.source_key == "audio.sync_profile"
    assert second == first
    assert caplog.text.count("audio.sync_profile fallback") == 1


def test_clock_sync_profile_uses_locked_default_when_no_config_value() -> None:
    profile = get_clock_sync_profile(_getter({}))

    assert profile.name == CANONICAL_CLOCK_SYNC_PROFILE
    assert profile.source_key == "default"
