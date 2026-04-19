"""Canonical PlatformEvent severity mapping."""

from __future__ import annotations

from enum import StrEnum
from typing import Final, Literal

from app.lcd_models.lcd_event import EventSeverity as LCDSeverity
from app.services.health_monitor import HealthStatus


class Severity(StrEnum):
    CRITICAL = "critical"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


FILTERED_SEVERITY: Final = "filtered"
SeverityOrFiltered = Severity | Literal["filtered"]

WEB_TONES: Final[tuple[str, ...]] = (
    "info",
    "success",
    "warn",
    "warning",
    "error",
    "critical",
)

_LCD_SEVERITY_MAP: Final[dict[LCDSeverity, Severity]] = {
    LCDSeverity.INFO: Severity.INFO,
    LCDSeverity.WARNING: Severity.WARNING,
    LCDSeverity.ERROR: Severity.ERROR,
    LCDSeverity.CRITICAL: Severity.CRITICAL,
}

_HEALTH_STATUS_MAP: Final[dict[HealthStatus, SeverityOrFiltered]] = {
    HealthStatus.HEALTHY: FILTERED_SEVERITY,
    HealthStatus.DEGRADED: Severity.WARNING,
    HealthStatus.CRITICAL: Severity.CRITICAL,
    HealthStatus.OFFLINE: Severity.ERROR,
}

_WEB_TONE_MAP: Final[dict[str, Severity]] = {
    "info": Severity.INFO,
    "success": Severity.INFO,
    "warn": Severity.WARNING,
    "warning": Severity.WARNING,
    "error": Severity.ERROR,
    "critical": Severity.CRITICAL,
}


def severity_from_lcd(value: LCDSeverity) -> Severity:
    return _LCD_SEVERITY_MAP[value]


def severity_from_cluster(value: object) -> Severity:
    normalized = str(getattr(value, "value", value) or "").strip().lower()
    try:
        return Severity(normalized)
    except ValueError as exc:
        raise ValueError(f"Unknown cluster severity: {value}") from exc


def severity_from_health_status(value: HealthStatus) -> SeverityOrFiltered:
    return _HEALTH_STATUS_MAP[value]


def severity_from_web_tone(value: str) -> Severity:
    normalized = str(value or "").strip().lower()
    try:
        return _WEB_TONE_MAP[normalized]
    except KeyError as exc:
        raise ValueError(f"Unknown web tone: {value}") from exc
