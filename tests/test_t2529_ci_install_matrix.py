"""T2529-E3 + T2529-E4 cycles 16-17 — CI install-matrix contract.

Locks the GitHub Actions workflow shape that runs rpmlint + lintian +
clean-install verification on every push. Drift here (e.g. accidentally
removing the rpmlint step or downgrading from `-y` to `--dry-run`) would
silently re-open the packaging-defect window T2529-E1/E2 close.

These tests don't execute the CI workflow — they verify its definition.
The workflow itself is the actual gate.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "t2529-install-matrix.yml"


# ---------------------------------------------------------------------------
# Workflow file structure
# ---------------------------------------------------------------------------


def test_workflow_exists() -> None:
    assert WORKFLOW.is_file(), f"missing CI workflow at {WORKFLOW}"


def test_workflow_runs_on_push_to_master() -> None:
    """The workflow must run on every push to master so spec regressions
    are caught before reaching production."""
    text = WORKFLOW.read_text()
    assert "push:" in text, "workflow must trigger on push events"
    assert "master" in text, "workflow must trigger on master branch"


def test_workflow_runs_on_pull_request() -> None:
    """PRs that touch packaging must also trigger the gate."""
    text = WORKFLOW.read_text()
    assert "pull_request:" in text, "workflow must trigger on pull_request events"


def test_workflow_path_filter_includes_packaging() -> None:
    """The path filter must include `packaging/**` so PRs touching the
    spec / units / config trigger the gate."""
    text = WORKFLOW.read_text()
    assert "packaging/" in text, (
        "workflow path filter must include packaging/ so spec changes "
        "trigger the gate"
    )


# ---------------------------------------------------------------------------
# Job 1: static gates (T2529 pytest suite)
# ---------------------------------------------------------------------------


def test_workflow_has_static_pytest_job() -> None:
    """First job runs the pytest gate suite — fast-fail before the
    Fedora/Ubuntu jobs spend ~10 min on rpmbuild."""
    text = WORKFLOW.read_text()
    assert "static:" in text or "static-" in text, (
        "workflow must have a `static` (pytest gate) job"
    )
    assert "pytest" in text, "static job must run pytest"


def test_workflow_static_job_runs_all_t2529_test_files() -> None:
    """The static job must invoke EVERY T2529 test file so a future drift
    in one file doesn't get silently missed."""
    text = WORKFLOW.read_text()
    required_test_files = (
        "tests/test_t2529_sysusers_tmpfiles.py",
        "tests/test_t2529_rpm_scriptlets.py",
        "tests/test_t2529_systemd_units.py",
        "tests/test_t2529_paths_fhs.py",
        "tests/test_t2529_pipewire_system.py",
        "tests/test_t2529_install_docs.py",
        "tests/test_t2529_sandbox_hardening.py",
        "tests/test_t2529_capabilities.py",
        "tests/test_t2529_syscall_filter.py",
        "tests/test_t2529_security_docs.py",
        "tests/test_t2529_rpmlint_baseline.py",
        "tests/test_t2529_lintian_baseline.py",
    )
    for f in required_test_files:
        assert f in text, (
            f"workflow static job must invoke {f} — drift here would let a "
            f"future regression slip through CI"
        )


# ---------------------------------------------------------------------------
# Job 2: Fedora 41 (T2529-E3)
# ---------------------------------------------------------------------------


def test_workflow_has_fedora_41_job() -> None:
    text = WORKFLOW.read_text()
    assert "fedora:41" in text, (
        "workflow must run a fedora:41 container — Q5 lock requires this exact version"
    )
    assert "T2529-E3" in text, (
        "Fedora job must be labelled T2529-E3 (so a future cycle can trace anchor)"
    )


def test_workflow_fedora_runs_rpmlint() -> None:
    """The Fedora 41 job MUST execute the rpmlint baseline runner."""
    text = WORKFLOW.read_text()
    assert "scripts/lint_rpm_spec.sh" in text, (
        "Fedora job must invoke scripts/lint_rpm_spec.sh (T2529-E1 gate)"
    )


def test_workflow_fedora_runs_rpmbuild() -> None:
    text = WORKFLOW.read_text()
    assert "rpmbuild" in text, "Fedora job must invoke rpmbuild"


def test_workflow_fedora_installs_rpm() -> None:
    """The job must clean-install the produced RPM and verify scriptlets ran."""
    text = WORKFLOW.read_text()
    assert "dnf install" in text, "Fedora job must `dnf install` the produced RPM"


def test_workflow_fedora_verifies_map2_user_exists_post_install() -> None:
    """The T2529-A2 contract: after dnf install, `getent passwd map2`
    must succeed (sysusers_create_package fired in %pre)."""
    text = WORKFLOW.read_text()
    assert "getent passwd map2" in text, (
        "Fedora job must verify `getent passwd map2` succeeds after install"
    )


def test_workflow_fedora_verifies_fhs_dirs() -> None:
    """T2529-A1 contract: tmpfiles_create_package must have created each
    canonical FHS dir with map2:map2 ownership."""
    text = WORKFLOW.read_text()
    for fhs_dir in ("/var/lib/map2", "/var/cache/map2", "/var/log/map2", "/run/map2"):
        assert fhs_dir in text, (
            f"Fedora job must verify {fhs_dir} exists post-install (T2529-A1)"
        )


def test_workflow_fedora_verifies_q4_user_preservation_on_uninstall() -> None:
    """T2529 Q4 + FHS §5.5: dnf remove map2 MUST preserve the map2 user
    and /var/lib/map2 directory."""
    text = WORKFLOW.read_text()
    assert "dnf remove" in text, "Fedora job must uninstall to test scriptlets"
    assert "Q4" in text or "preserved" in text or "preserve" in text, (
        "Fedora job must verify Q4 user-preservation contract on uninstall"
    )


def test_workflow_fedora_runs_systemd_analyze_security() -> None:
    """T2529-B targets `systemd-analyze security < 2.0` per unit. The
    CI captures the score (passing or not — V2 evidence dir pins the
    formal numbers)."""
    text = WORKFLOW.read_text()
    assert "systemd-analyze security" in text, (
        "Fedora job must run systemd-analyze security per-unit"
    )


# ---------------------------------------------------------------------------
# Job 3: Ubuntu 24.04 (T2529-E4)
# ---------------------------------------------------------------------------


def test_workflow_has_ubuntu_2404_job() -> None:
    text = WORKFLOW.read_text()
    assert "ubuntu-24.04" in text, (
        "workflow must run a ubuntu-24.04 job — Q5 lock requires this exact version"
    )
    assert "T2529-E4" in text, (
        "Ubuntu job must be labelled T2529-E4"
    )


def test_workflow_ubuntu_installs_alien_and_lintian() -> None:
    text = WORKFLOW.read_text()
    assert "alien" in text and "lintian" in text, (
        "Ubuntu job must install both alien and lintian"
    )


def test_workflow_ubuntu_runs_lint_deb_via_alien() -> None:
    """The Ubuntu job MUST execute the lintian baseline runner."""
    text = WORKFLOW.read_text()
    assert "scripts/lint_deb_via_alien.sh" in text, (
        "Ubuntu job must invoke scripts/lint_deb_via_alien.sh (T2529-E2 gate)"
    )


# ---------------------------------------------------------------------------
# Job dependencies
# ---------------------------------------------------------------------------


def test_workflow_fedora_depends_on_static() -> None:
    """Fast-fail: the static pytest gates must pass before we spend
    ~10min on rpmbuild."""
    text = WORKFLOW.read_text()
    # Roughly: `needs: static` somewhere in the fedora-41 job.
    assert "needs: static" in text or "needs: [static]" in text, (
        "Fedora job must depend on the static job for fast-fail"
    )


def test_workflow_ubuntu_depends_on_fedora() -> None:
    """Ubuntu reuses the .rpm produced by Fedora, so it depends on it."""
    text = WORKFLOW.read_text()
    assert "needs: fedora-41" in text or "needs: [fedora-41]" in text, (
        "Ubuntu job must depend on the Fedora job"
    )


# ---------------------------------------------------------------------------
# Workflow documentation
# ---------------------------------------------------------------------------


def test_workflow_documents_t2529_anchor() -> None:
    text = WORKFLOW.read_text()
    assert "T2529" in text, "workflow must reference T2529 anchor"


def test_workflow_documents_q5_test_matrix() -> None:
    text = WORKFLOW.read_text()
    assert "Q5" in text or "test matrix" in text.lower(), (
        "workflow must reference the Q5 test-matrix lock"
    )
