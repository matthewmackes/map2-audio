"""Mixxx imports immutability gate.

T2459-E5. The hard contract: once `device-packs/_mixx-imports/` is
populated by `scripts/sync_mixxx_imports.py` from upstream Mixxx,
NO file in that subtree may be modified locally. MAP2-side metadata
goes in sidecar `<file>.MAP2.yaml` files, not in the imported XML/JS.

This test verifies the invariant by recomputing SHA-256 checksums
over every imported file and comparing against the stored manifest at
`device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt`.

If a Mixxx-imported file has been edited in-place, this test fails
with the file's path and a hint to put the change in a `.MAP2.yaml`
sidecar instead.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
IMPORTS_ROOT = REPO_ROOT / "device-packs" / "_mixx-imports"
CHECKSUMS_PATH = IMPORTS_ROOT / "IMPORT_CHECKSUMS.txt"


def _parse_checksums() -> dict[str, str]:
    if not CHECKSUMS_PATH.exists():
        pytest.skip(f"{CHECKSUMS_PATH} missing — run scripts/sync_mixxx_imports.py --checksum-only")
    out: dict[str, str] = {}
    for line in CHECKSUMS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        sha, rel = parts
        out[rel] = sha
    return out


def _checksum_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_imports_root_exists() -> None:
    assert IMPORTS_ROOT.is_dir(), (
        f"Missing {IMPORTS_ROOT}. Run scripts/sync_mixxx_imports.py "
        "to populate the Mixxx imports corpus."
    )


def test_license_mixx_present() -> None:
    license_path = IMPORTS_ROOT / "LICENSE.MIXX"
    assert license_path.exists(), (
        "device-packs/_mixx-imports/LICENSE.MIXX is missing. The "
        "GPLv2-or-later attribution for the imported Mixxx files is "
        "non-negotiable — restore the file from upstream."
    )


def test_manifest_present() -> None:
    assert (IMPORTS_ROOT / "MANIFEST.yaml").exists()


def test_checksums_file_present() -> None:
    assert CHECKSUMS_PATH.exists(), (
        "IMPORT_CHECKSUMS.txt is missing. Run "
        "`python3 scripts/sync_mixxx_imports.py --checksum-only /tmp/dummy` "
        "to regenerate."
    )


def test_no_mixxx_imported_file_has_been_edited() -> None:
    """The hard immutability gate.

    Compares the SHA-256 of every file in the corpus against the
    stored manifest. A mismatch means a Mixxx-imported file was
    edited locally — that violates the upstream license + the
    project's import-only-via-sync rule.
    """
    expected = _parse_checksums()
    if not expected:
        pytest.skip("No checksums recorded yet.")

    failures: list[str] = []
    for rel, expected_sha in expected.items():
        path = REPO_ROOT / rel
        if not path.exists():
            failures.append(f"{rel}: file referenced in checksum manifest is missing")
            continue
        # Skip MAP2-mutable sidecars (defensive — the sync script
        # already excludes them, but be explicit).
        if path.name.endswith(".MAP2.yaml"):
            continue
        actual = _checksum_file(path)
        if actual != expected_sha:
            failures.append(
                f"{rel}: SHA mismatch (expected {expected_sha[:12]}…, "
                f"got {actual[:12]}…). Mixxx-imported files are read-only — "
                "put MAP2-side metadata in a `.MAP2.yaml` sidecar instead."
            )

    # Also check for files that exist in the import tree but aren't in
    # the manifest — that's a sign of a partial sync that needs to be
    # finished by re-running the script.
    actual_files: set[str] = set()
    for p in IMPORTS_ROOT.rglob("*"):
        if not p.is_file():
            continue
        if p.name.endswith(".MAP2.yaml"):
            continue
        if p == CHECKSUMS_PATH:
            continue
        if p.name in {"MANIFEST.yaml", "LICENSE.MIXX"}:
            continue
        actual_files.add(str(p.relative_to(REPO_ROOT)))

    extra = actual_files - set(expected.keys())
    for rel in sorted(extra):
        failures.append(
            f"{rel}: present in imports tree but missing from checksum manifest. "
            "Run scripts/sync_mixxx_imports.py --checksum-only to refresh."
        )

    assert not failures, (
        "Mixxx-imports immutability violations:\n  "
        + "\n  ".join(failures)
    )


def test_corpus_size_meets_expected_floor() -> None:
    """The full upstream Mixxx corpus is ~290 mapping files plus shared
    runtime libraries. The combined import (with Mixxx's HID screen
    QML files included) totals around 397 files at the upstream commit
    captured in MANIFEST.yaml. If the count drops below 200 something
    has gone wrong with the import.
    """
    expected = _parse_checksums()
    assert len(expected) >= 200, (
        f"Mixxx imports corpus has only {len(expected)} files; expected "
        "≥200. Re-run scripts/sync_mixxx_imports.py to refresh."
    )
