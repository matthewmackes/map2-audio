"""Shared presentation hints for PlatformEvent surfaces."""

from __future__ import annotations

from dataclasses import dataclass

from .envelope import PlatformEvent
from .severity import Severity


@dataclass(frozen=True)
class PresentationHints:
    led_color: str
    led_animation: str
    lcd_icon: str
    sound: bool
    ttl_seconds: int
    urgent: bool
    mcu_prefix: str
    web_tone: str
    web_stage_class: str


_SEVERITY_HINTS: dict[Severity, PresentationHints] = {
    Severity.CRITICAL: PresentationHints(
        led_color="red",
        led_animation="pulse_fast",
        lcd_icon="!!",
        sound=True,
        ttl_seconds=300,
        urgent=True,
        mcu_prefix="CRIT ",
        web_tone="error",
        web_stage_class="critical",
    ),
    Severity.ERROR: PresentationHints(
        led_color="red",
        led_animation="pulse",
        lcd_icon="!",
        sound=True,
        ttl_seconds=300,
        urgent=True,
        mcu_prefix="ERR ",
        web_tone="error",
        web_stage_class="warning",
    ),
    Severity.WARNING: PresentationHints(
        led_color="yellow",
        led_animation="blink",
        lcd_icon="!",
        sound=False,
        ttl_seconds=300,
        urgent=True,
        mcu_prefix="WARN ",
        web_tone="warning",
        web_stage_class="warning",
    ),
    Severity.INFO: PresentationHints(
        led_color="white",
        led_animation="steady",
        lcd_icon="i",
        sound=False,
        ttl_seconds=300,
        urgent=False,
        mcu_prefix="INFO ",
        web_tone="info",
        web_stage_class="info",
    ),
}

_WORKFLOW_KIND_SUFFIXES = (".progress", ".started", ".completed", ".cancelled")
_DOWNLOAD_KINDS = {"ir.download.progress", "soundfont.download.progress"}


def hints_for(event: PlatformEvent) -> PresentationHints:
    base = _SEVERITY_HINTS[event.severity]
    ttl_seconds = event.ttl_seconds

    if event.kind.startswith("workflow.") or event.kind in _DOWNLOAD_KINDS or event.kind.endswith(_WORKFLOW_KIND_SUFFIXES):
        return PresentationHints(
            led_color="white" if event.severity == Severity.INFO else base.led_color,
            led_animation="progress" if event.severity == Severity.INFO else base.led_animation,
            lcd_icon=">",
            sound=base.sound,
            ttl_seconds=ttl_seconds,
            urgent=event.severity != Severity.INFO,
            mcu_prefix="JOB ",
            web_tone="info" if event.severity == Severity.INFO else base.web_tone,
            web_stage_class="workflow",
        )

    if event.kind.startswith("snapshot.live."):
        return PresentationHints(
            led_color="green",
            led_animation="steady",
            lcd_icon="SN",
            sound=False,
            ttl_seconds=ttl_seconds,
            urgent=False,
            mcu_prefix="LIVE ",
            web_tone="info",
            web_stage_class="snapshot",
        )

    return PresentationHints(
        led_color=base.led_color,
        led_animation=base.led_animation,
        lcd_icon=base.lcd_icon,
        sound=bool(base.sound if event.sound is None else event.sound),
        ttl_seconds=ttl_seconds,
        urgent=base.urgent or event.ack_required,
        mcu_prefix=base.mcu_prefix,
        web_tone=base.web_tone,
        web_stage_class=base.web_stage_class,
    )
