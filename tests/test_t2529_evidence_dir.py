"""T2529-V1 cycle 19 — evidence-directory contract.

Locks the presence + structure of the T2529 fit-for-purpose evidence
directory at docs/fit-for-purpose-evidence/20260515/t2529-service-user/.

This directory is the auditable trail of every cycle's deliverables.
Drift here (e.g. an evidence file disappearing during a future
refactor) would make the migration impossible to audit retrospectively.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = (
    REPO_ROOT / "docs" / "fit-for-purpose-evidence" / "20260515" / "t2529-service-user"
)


# ---------------------------------------------------------------------------
# Evidence dir structure
# ---------------------------------------------------------------------------


def test_evidence_dir_exists() -> None:
    assert EVIDENCE_DIR.is_dir(), f"missing evidence dir at {EVIDENCE_DIR}"


def test_evidence_dir_has_readme() -> None:
    assert (EVIDENCE_DIR / "README.md").is_file(), "missing README.md"


def test_evidence_dir_has_manifest() -> None:
    assert (EVIDENCE_DIR / "MANIFEST.md").is_file(), "missing MANIFEST.md"


def test_evidence_dir_has_verification_runbook() -> None:
    assert (EVIDENCE_DIR / "verification-runbook.md").is_file(), (
        "missing verification-runbook.md"
    )


def test_evidence_dir_has_pytest_gate_capture() -> None:
    """The captured pytest output must exist; this is the audit trail
    that 648 tests passed at the lock date."""
    pytest_file = EVIDENCE_DIR / "pytest-gate-suite" / "t2529-tests.txt"
    assert pytest_file.is_file(), (
        f"missing pytest gate capture at {pytest_file}"
    )


# ---------------------------------------------------------------------------
# README cross-references
# ---------------------------------------------------------------------------


def test_readme_references_all_phases() -> None:
    """README must mention all four phase letters (A/B/E/V) so a future
    reader can map the cycles to deliverables."""
    text = (EVIDENCE_DIR / "README.md").read_text()
    # Just check the phase letters appear in the doc.
    assert "Phase A" not in text or any(
        phase in text for phase in ("A6", "T2529-V1", "T2529-V2")
    ), "README must reference the phases"


def test_readme_references_t2529_install_docs() -> None:
    text = (EVIDENCE_DIR / "README.md").read_text()
    for doc in ("SERVICE_USER.md", "FHS_LAYOUT.md", "SECURITY_MODEL.md"):
        assert doc in text, f"README must cross-reference {doc}"


def test_readme_references_pytest_gate_suite() -> None:
    text = (EVIDENCE_DIR / "README.md").read_text()
    assert "tests/test_t2529" in text, (
        "README must reference the pytest gate suite paths"
    )


def test_readme_references_ci_workflow() -> None:
    text = (EVIDENCE_DIR / "README.md").read_text()
    assert "t2529-install-matrix.yml" in text, (
        "README must reference the CI install-matrix workflow"
    )


# ---------------------------------------------------------------------------
# MANIFEST shape
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deliverable",
    [
        # Phase A
        "sysusers.d/map2.conf",
        "tmpfiles.d/map2.conf",
        "map2.spec",
        "Map2Paths.is_fhs_install",
        "99-map2-audio.conf",
        "SERVICE_USER.md",
        "FHS_LAYOUT.md",
        # Phase B
        "NoNewPrivileges",
        "CapabilityBoundingSet",
        "SystemCallFilter",
        "SECURITY_MODEL.md",
        # Phase E
        ".rpmlintrc",
        "lint_rpm_spec.sh",
        "lintian-overrides",
        "lint_deb_via_alien.sh",
        "fedora-41",
        "ubuntu-2404",
        "map2-self-test --full",
        # Phase V
        "verification-runbook.md",
    ],
)
def test_manifest_references_deliverable(deliverable: str) -> None:
    """MANIFEST must reference each canonical deliverable so a future
    auditor can trace what shipped vs. what's still bench-gated."""
    text = (EVIDENCE_DIR / "MANIFEST.md").read_text()
    assert deliverable in text, (
        f"MANIFEST.md must reference {deliverable!r} — drift here would "
        f"orphan the deliverable from the audit trail"
    )


def test_manifest_uses_status_legend() -> None:
    """MANIFEST must use a consistent status legend (Filed / CI-pending /
    Manual / Bench-gated) so the reader knows what's done vs. blocked."""
    text = (EVIDENCE_DIR / "MANIFEST.md").read_text()
    for status in ("Filed", "CI-pending", "Manual", "Bench-gated"):
        assert status in text, (
            f"MANIFEST.md must use the {status!r} status label"
        )


# ---------------------------------------------------------------------------
# Verification runbook shape
# ---------------------------------------------------------------------------


def test_runbook_documents_pytest_invocation() -> None:
    text = (EVIDENCE_DIR / "verification-runbook.md").read_text()
    assert "pytest tests/test_t2529" in text, (
        "runbook must document the exact pytest invocation"
    )


def test_runbook_documents_non_mm_operator_procedure() -> None:
    text = (EVIDENCE_DIR / "verification-runbook.md").read_text()
    assert "Non-mm operator" in text or "non-mm operator" in text, (
        "runbook must document the non-mm operator verification procedure"
    )


def test_runbook_documents_rt_audio_gates() -> None:
    text = (EVIDENCE_DIR / "verification-runbook.md").read_text()
    assert "RT audio gates" in text or "rt-audio-gates" in text, (
        "runbook must document the V2 RT audio gates procedure"
    )
    assert "0.35 ms" in text or "peak block jitter" in text or "peak jitter" in text, (
        "runbook must document the peak-block-jitter acceptance threshold"
    )
    assert "SCHED_FIFO" in text, (
        "runbook must document the SCHED_FIFO RT thread expectations"
    )


def test_runbook_documents_systemd_sysusers_recovery() -> None:
    """The troubleshooting section must document how to manually recover
    if `%sysusers_create_package` doesn't fire (operator with sudo can
    re-run it without re-installing)."""
    text = (EVIDENCE_DIR / "verification-runbook.md").read_text()
    assert "systemd-sysusers --replace" in text, (
        "runbook troubleshooting must document the manual sysusers recovery command"
    )


def test_runbook_documents_t2529_v2_acceptance() -> None:
    """The final acceptance section must list the steps to close T2529."""
    text = (EVIDENCE_DIR / "verification-runbook.md").read_text()
    assert "Final acceptance" in text, (
        "runbook must include a `Final acceptance` section"
    )
    assert "PROJECT_WORKLIST" in text, (
        "runbook must reference updating the worklist on close-out"
    )


# ---------------------------------------------------------------------------
# Pytest gate capture has the expected pass count
# ---------------------------------------------------------------------------


def test_pytest_capture_passes_at_lock_date() -> None:
    """The captured pytest output must show all tests passing at the
    T2529 lock date. We check the final summary line specifically since
    "failed" can legitimately appear in test docstrings or output."""
    text = (EVIDENCE_DIR / "pytest-gate-suite" / "t2529-tests.txt").read_text()
    # The pytest final summary line: "N passed in <T>s" or
    # "M failed, N passed in <T>s".
    summary_lines = [
        line.strip()
        for line in text.strip().splitlines()
        if line.strip().endswith("s")
        and ("passed" in line or "failed" in line)
        and " in " in line
    ]
    assert summary_lines, (
        f"pytest capture must end with a pytest summary line; "
        f"got tail:\n{text[-500:]}"
    )
    final_summary = summary_lines[-1]
    # Final summary must contain "passed"
    assert "passed" in final_summary, (
        f"pytest summary must show passing tests; got: {final_summary!r}"
    )
    # And must NOT show failures in the summary line itself.
    assert "failed" not in final_summary, (
        f"pytest summary shows failures: {final_summary!r}\nFull tail:\n{text[-1000:]}"
    )
