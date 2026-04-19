from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity


def make_platform_event(
    *,
    event_id: str = "00000000-0000-0000-0000-000000000000",
    kind: str = "system.cpu.critical",
    severity: Severity = Severity.CRITICAL,
    target_surfaces: list[str] | None = None,
) -> PlatformEvent:
    return PlatformEvent(
        event_id=event_id,
        kind=kind,
        severity=severity,
        source_node="AUDIO-NODE-0001",
        source_service="health_monitor",
        title="CPU critical" if severity == Severity.CRITICAL else "Workflow progress",
        message="CPU sustained at 95%" if kind.startswith("system.") else "Applying update",
        target_surfaces=target_surfaces or [],
    )


@pytest.fixture
def golden_dir() -> Path:
    return Path(__file__).resolve().parent / "golden"


def load_golden(path: Path) -> dict:
    return json.loads(path.read_text())
