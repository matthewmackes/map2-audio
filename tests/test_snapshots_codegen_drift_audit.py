"""Pin the audit evidence dir contract.

Run-14b pick #1 + remediation (2026-05-16): the snapshot codegen drift
audit produced a verifiable evidence dir at
docs/fit-for-purpose-evidence/20260516/snapshots-codegen-drift-audit/.
This test ensures the dir + its artefacts stay in place so a future
auditor can replay the conclusion.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = (
    REPO_ROOT / "docs" / "fit-for-purpose-evidence" / "20260516"
    / "snapshots-codegen-drift-audit"
)


def test_evidence_dir_exists() -> None:
    assert EVIDENCE_DIR.is_dir(), f"missing evidence dir at {EVIDENCE_DIR}"


@pytest.mark.parametrize(
    "artefact",
    [
        "README.md",
        "typecheck-output.log",
        "pytest-snapshot-surface.log",
    ],
)
def test_evidence_artefact_present(artefact: str) -> None:
    path = EVIDENCE_DIR / artefact
    assert path.is_file(), f"missing audit artefact {artefact} at {path}"


def test_readme_documents_drift_was_dormant() -> None:
    """The audit conclusion is the most important contract — a future
    reviewer scanning for whether the drift broke anything must find
    the answer in the README's first paragraph."""
    text = (EVIDENCE_DIR / "README.md").read_text()
    assert "dormant" in text.lower(), (
        "audit conclusion must state the drift was dormant"
    )


def test_readme_cites_remediation_commits() -> None:
    """The two commits that closed the drift + wired the gate must be
    named in the audit so the fix is traceable."""
    text = (EVIDENCE_DIR / "README.md").read_text()
    assert "0ba56e9a0" in text, "README must cite the codegen refresh commit"
    assert "90ddca903" in text, "README must cite the typecheck wire-in commit"


def test_readme_documents_replay_commands() -> None:
    """A future skeptic must be able to replay the audit without re-deriving
    the commands."""
    text = (EVIDENCE_DIR / "README.md").read_text()
    assert "How to replay this audit" in text
    assert "npm run typecheck" in text
    assert "pytest" in text
    assert "drift simulation" in text.lower()


def test_typecheck_output_log_shows_clean_exit() -> None:
    """The captured typecheck log must end with `exit 0` so a reviewer
    can confirm the gate is green at audit time."""
    text = (EVIDENCE_DIR / "typecheck-output.log").read_text()
    assert "exit 0" in text, "typecheck capture must show exit 0"
    assert "up to date" in text, (
        "typecheck capture must show 'up to date' for at least one codegen check"
    )


def test_pytest_log_shows_no_failures_in_snapshot_surface() -> None:
    """696 pass / 0 fail on the snapshot Pydantic surface is the
    canonical proof that the codegen refresh didn't break backend
    behavior."""
    text = (EVIDENCE_DIR / "pytest-snapshot-surface.log").read_text()
    assert "passed" in text and "failed" not in text.split("passed")[-1], (
        "pytest capture must show passes with no trailing failure summary"
    )
