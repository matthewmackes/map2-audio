from __future__ import annotations

import pytest

from app.services.health_monitor import HealthStatus
from app.services.platform_event.lcd_feed import LCDFeedCategory, LCDFeedSeverity
from app.services.platform_event.kind import (
    ALL_KINDS,
    kind_for_lcd_surface_type,
)
from app.services.platform_event.severity import (
    FILTERED_SEVERITY,
    Severity,
    WEB_TONES,
    severity_from_health_status,
    severity_from_lcd_feed,
    severity_from_web_tone,
)

@pytest.mark.parametrize(("value", "expected"), [(member, Severity(member.value)) for member in LCDFeedSeverity])
def test_lcd_feed_severity_mapping_is_total(value: LCDFeedSeverity, expected: Severity) -> None:
    assert severity_from_lcd_feed(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (HealthStatus.HEALTHY, FILTERED_SEVERITY),
        (HealthStatus.DEGRADED, Severity.WARNING),
        (HealthStatus.CRITICAL, Severity.CRITICAL),
        (HealthStatus.OFFLINE, Severity.ERROR),
    ],
)
def test_health_status_mapping_is_total(value: HealthStatus, expected: str | Severity) -> None:
    assert severity_from_health_status(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("info", Severity.INFO),
        ("success", Severity.INFO),
        ("warn", Severity.WARNING),
        ("warning", Severity.WARNING),
        ("error", Severity.ERROR),
        ("critical", Severity.CRITICAL),
    ],
)
def test_web_tone_mapping_is_total(value: str, expected: Severity) -> None:
    assert value in WEB_TONES
    assert severity_from_web_tone(value) == expected


@pytest.mark.parametrize("value", list(LCDFeedCategory))
def test_lcd_surface_kind_mapping_is_total(value: LCDFeedCategory) -> None:
    mapped = kind_for_lcd_surface_type(value.value)
    assert mapped in ALL_KINDS
