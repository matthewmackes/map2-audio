"""Clock-sync configuration helpers."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any, Callable

from app.config_schema import CANONICAL_CLOCK_SYNC_PROFILE

logger = logging.getLogger(__name__)

_LEGACY_SYNC_PROFILE_WARNING_EMITTED = False


@dataclass(frozen=True)
class ClockSyncProfile:
    """Resolved clock-sync profile and the config key that supplied it."""

    name: str
    source_key: str

    def __str__(self) -> str:
        return self.name


def _has_value(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def get_clock_sync_profile(
    config_getter: Callable[[str, Any], Any] | None = None,
) -> ClockSyncProfile:
    """Resolve the active clock-sync profile through the canonical fallback chain."""
    if config_getter is None:
        from app.config import config_get as config_getter

    selected_profile = config_getter("clock_sync.selected_profile", None)
    if _has_value(selected_profile):
        return ClockSyncProfile(str(selected_profile), "clock_sync.selected_profile")

    legacy_profile = config_getter("audio.sync_profile", None)
    if _has_value(legacy_profile):
        global _LEGACY_SYNC_PROFILE_WARNING_EMITTED
        if not _LEGACY_SYNC_PROFILE_WARNING_EMITTED:
            logger.warning(
                "Using legacy audio.sync_profile fallback for clock sync profile; "
                "write clock_sync.selected_profile instead."
            )
            _LEGACY_SYNC_PROFILE_WARNING_EMITTED = True
        return ClockSyncProfile(str(legacy_profile), "audio.sync_profile")

    return ClockSyncProfile(CANONICAL_CLOCK_SYNC_PROFILE, "default")
