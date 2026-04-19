from __future__ import annotations

import pytest

from app.lcd_models.lcd_event import EventSeverity as LCDSeverity
from app.lcd_models.lcd_event import EventType as LCDEventType
from app.services.cluster.distributed_event_bus import EventSeverity as ClusterSeverity
from app.services.cluster.distributed_event_bus import EventType as ClusterEventType
from app.services.event_bus import EventType as EventBusType
from app.services.event_publisher import EventType as PublisherEventType
from app.services.health_monitor import HealthStatus
from app.services.platform_event.kind import (
    ALL_KINDS,
    kind_for_cluster_event_value,
    kind_for_event_bus_value,
    kind_for_event_publisher_value,
    kind_for_lcd_event_value,
)
from app.services.platform_event.severity import (
    FILTERED_SEVERITY,
    Severity,
    WEB_TONES,
    severity_from_cluster,
    severity_from_health_status,
    severity_from_lcd,
    severity_from_web_tone,
)


@pytest.mark.parametrize(("value", "expected"), [(member, Severity(member.value)) for member in LCDSeverity])
def test_lcd_severity_mapping_is_total(value: LCDSeverity, expected: Severity) -> None:
    assert severity_from_lcd(value) == expected


@pytest.mark.parametrize(("value", "expected"), [(member, Severity(member.value)) for member in ClusterSeverity])
def test_cluster_severity_mapping_is_total(value: ClusterSeverity, expected: Severity) -> None:
    assert severity_from_cluster(value) == expected


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


@pytest.mark.parametrize("value", list(EventBusType))
def test_event_bus_kind_mapping_is_total(value: EventBusType) -> None:
    mapped = kind_for_event_bus_value(value.value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", list(ClusterEventType))
def test_cluster_kind_mapping_is_total(value: ClusterEventType) -> None:
    mapped = kind_for_cluster_event_value(value.value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", list(PublisherEventType))
def test_event_publisher_kind_mapping_is_total(value: PublisherEventType) -> None:
    mapped = kind_for_event_publisher_value(value.value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", list(LCDEventType))
def test_lcd_kind_mapping_is_total(value: LCDEventType) -> None:
    mapped = kind_for_lcd_event_value(value.value)
    assert mapped in ALL_KINDS
