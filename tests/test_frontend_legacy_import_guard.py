from __future__ import annotations

import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ACTIVE_FRONTEND_DIRS = [
    PROJECT_ROOT / "web" / "src" / "app",
    PROJECT_ROOT / "web" / "src" / "shared",
    PROJECT_ROOT / "web" / "src" / "map2",
]
LEGACY_IMPORT_PATTERN = re.compile(
    r"""(?x)
    (?:import|export)\s+.*?\s+from\s+["'][^"']*pipedal(?:/[^"']*)?["']
    |
    require\(\s*["'][^"']*pipedal(?:/[^"']*)?["']\s*\)
    """
)


def test_active_frontend_code_does_not_import_legacy_pipedal_modules() -> None:
    violations: list[str] = []

    for root in ACTIVE_FRONTEND_DIRS:
        for path in root.rglob("*.[tj]s*"):
            try:
                source = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                source = path.read_text(encoding="utf-8", errors="ignore")

            for line_number, line in enumerate(source.splitlines(), start=1):
                if LEGACY_IMPORT_PATTERN.search(line):
                    violations.append(f"{path.relative_to(PROJECT_ROOT)}:{line_number}: {line.strip()}")

    assert not violations, (
        "Active frontend code must not import from web/src/pipedal/. "
        "Move shared compatibility surfaces under web/src/shared or web/src/map2 instead.\n"
        + "\n".join(violations)
    )
