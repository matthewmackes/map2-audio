"""T2482-P1.5 / iter 34: pytest wrapper for the device-pack JS test
harness.

Discovers + runs every `test_*.js` file under `device-packs/_tests/`
and `device-packs/<vendor>/scripts/__tests__/` via Node, then asserts
exit code 0. This keeps device-pack JS tests in the same pytest
invocation as everything else (CI doesn't need a second runner).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent
PACKS_ROOT = REPO_ROOT / "device-packs"
HARNESS_DIR = PACKS_ROOT / "_tests"


def _discover_js_tests() -> list[Path]:
    tests: list[Path] = []
    # Top-level harness tests.
    if HARNESS_DIR.exists():
        for p in sorted(HARNESS_DIR.glob("test_*.js")):
            tests.append(p)
    # Per-vendor tests under <vendor>/scripts/__tests__/.
    for vendor in sorted(PACKS_ROOT.iterdir()):
        if not vendor.is_dir() or vendor.name.startswith("_"):
            continue
        candidates = vendor / "scripts" / "__tests__"
        if candidates.exists():
            for p in sorted(candidates.glob("test_*.js")):
                tests.append(p)
    return tests


@pytest.mark.skipif(
    shutil.which("node") is None,
    reason="node is not installed; device-pack JS tests skipped",
)
@pytest.mark.parametrize(
    "js_test_path", _discover_js_tests(), ids=lambda p: str(p.relative_to(REPO_ROOT))
)
def test_device_pack_js(js_test_path: Path):
    result = subprocess.run(
        ["node", str(js_test_path)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        msg = (
            f"\n--- stdout ---\n{result.stdout}"
            f"\n--- stderr ---\n{result.stderr}"
        )
        pytest.fail(f"Node test {js_test_path.name} failed (exit={result.returncode}):{msg}")
