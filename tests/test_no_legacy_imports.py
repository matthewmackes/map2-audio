"""Regression guard for cleanup targets that must stay deleted."""

from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

TEXT_ROOTS = (
    REPO_ROOT / "app",
    REPO_ROOT / "tests",
    REPO_ROOT / "scripts",
    REPO_ROOT / "web" / "src",
)

TEXT_SUFFIXES = {
    ".cjs",
    ".js",
    ".jsx",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
}

EXCLUDED_TEXT_FILES = {
    REPO_ROOT / "tests" / "test_no_legacy_imports.py",
}

RETIRED_PATHS = (
    "app/lcd_models/lcd_event.py",
    "app/routes/audio.py",
    "app/routes/avb.py",
    "app/routes/latency.py",
    "app/routes/lcd_events.py",
    "app/routes/midi.py",
    "app/services/audio_io_v2.py",
    "app/services/cluster/distributed_event_bus.py",
    "app/services/event_bus.py",
    "app/services/lcd_event_bus.py",
    "app/services/service_manager.py",
    "app/services/snapshot_service.py",
    "app/services/unified_services.py",
)

RETIRED_TEXT_PATTERNS = (
    ("service-manager facade import", re.compile(r"\b(?:from|import)\s+app\.services\.service_manager\b|from\s+app\.services\s+import\s+service_manager\b")),
    ("unified-services facade import", re.compile(r"\b(?:from|import)\s+app\.services\.unified_services\b|from\s+app\.services\s+import\s+unified_services\b")),
    ("legacy snapshot-service import", re.compile(r"\b(?:from|import)\s+app\.services\.snapshot_service\b|from\s+app\.services\s+import\s+snapshot_service\b")),
    ("legacy MIDI v1 route import", re.compile(r"\b(?:from|import)\s+app\.routes\.midi\b|app\.routes\.midi\b")),
    ("legacy latency v1 route import", re.compile(r"\b(?:from|import)\s+app\.routes\.latency\b|app\.routes\.latency\b")),
    ("legacy event bus import", re.compile(r"\b(?:from|import)\s+app\.services\.(?:event_bus|lcd_event_bus)\b")),
    ("legacy cluster event bus import", re.compile(r"\b(?:from|import)\s+app\.services\.cluster\.distributed_event_bus\b")),
    ("PiPedal JUCE alias", re.compile(r"\b(?:get_pipedal_service|PiPedalConfig|PiPedalEngineService|PIPEDAL_AVAILABLE)\b")),
    ("legacy snapshot adapter", re.compile(r"\bto_legacy_snapshot_data\b")),
    ("plugin scanner compatibility wrapper", re.compile(r"\bPluginScannerCompat\b")),
    ("old audio_io_v2 module name", re.compile(r"\baudio_io_v2\b")),
    ("legacy localStorage migration marker", re.compile(r"legacy localStorage format")),
    ("legacy update-API variant", re.compile(r"\bUpdateApplicationApiVariant\b.*\blegacy\b")),
)


def _iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root in TEXT_ROOTS:
        for path in root.rglob("*"):
            if path in EXCLUDED_TEXT_FILES:
                continue
            if path.is_file() and path.suffix in TEXT_SUFFIXES:
                files.append(path)
    return sorted(files)


def test_retired_legacy_files_stay_deleted() -> None:
    existing = [path for path in RETIRED_PATHS if (REPO_ROOT / path).exists()]

    assert existing == []


def test_retired_legacy_imports_stay_deleted() -> None:
    violations: list[str] = []
    for path in _iter_source_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        relative_path = path.relative_to(REPO_ROOT)
        for label, pattern in RETIRED_TEXT_PATTERNS:
            for match in pattern.finditer(text):
                line_number = text.count("\n", 0, match.start()) + 1
                violations.append(f"{relative_path}:{line_number}: {label}: {match.group(0)!r}")

    assert violations == []
