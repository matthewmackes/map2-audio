"""T2521-9: SonoBus + AOO licensing-notice presence tests.

Verifies that `docs/THIRD_PARTY_NOTICES.md` and
`docs/architecture/LICENSE_COMPATIBILITY.md` carry the required AOO
(BSD-3) + SonoBus (GPLv3, brand-only) entries with the locked
decisions cited. Catches accidental regressions where someone deletes
or rewrites a row without re-running the audit.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _notices() -> str:
    return (REPO_ROOT / "docs" / "THIRD_PARTY_NOTICES.md").read_text()


def _license_audit() -> str:
    return (
        REPO_ROOT / "docs" / "architecture" / "LICENSE_COMPATIBILITY.md"
    ).read_text()


def test_notices_lists_aoo_as_vendored_bsd3():
    text = _notices()
    assert "AOO (Audio Over OSC)" in text
    assert "BSD-3-Clause" in text
    assert "vendor/aoo/" in text


def test_notices_clarifies_sonobus_is_brand_only_no_linkage():
    text = _notices()
    assert "SonoBus" in text
    assert "Brand name + protocol compatibility target only" in text
    # Confirms the locked Q1 decision: no SonoBus binary in the runtime.
    assert "MAP2 does **not** vendor or link the SonoBus" in text


def test_notices_lists_sonobus_system_dependencies():
    text = _notices()
    # Build deps wired by T2521-8 installer manifest.
    assert "libopus" in text
    assert "libuv" in text
    assert "Avahi" in text or "avahi" in text


def test_license_audit_has_aoo_row():
    text = _license_audit()
    assert "AOO (Audio Over OSC)" in text
    assert "BSD-3-Clause" in text
    assert "vendor/aoo/" in text


def test_license_audit_marks_sonobus_as_no_linkage():
    text = _license_audit()
    assert "SonoBus (application)" in text
    # AGPLv3-compatibility conclusion for the SonoBus row is "no linkage"
    assert "no linkage" in text.lower()


def test_license_audit_has_libopus_libuv_avahi_rows():
    text = _license_audit()
    assert "Opus codec" in text
    assert "libuv" in text
    assert "Avahi" in text


def test_license_audit_conclusion_mentions_t2521():
    text = _license_audit()
    assert "T2521" in text
    assert "AGPLv3" in text


def test_audit_history_records_t2521_9_update():
    """The audit's update-history line should reflect the 2026-05-13
    AOO/SonoBus addition so future readers can spot when the row arrived."""
    text = _license_audit()
    assert "2026-05-13" in text
    assert "T2521-9" in text
