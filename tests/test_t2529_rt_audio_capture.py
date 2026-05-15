"""T2529-V2 cycle 20 — bench-side RT-audio evidence-capture contract.

Locks the shape of scripts/t2529_capture_rt_audio_evidence.sh so a future
operator-only edit can't silently drop one of the six required captures
or change the soak acceptance threshold.

The script itself is bench-gated (requires the production audio host).
These tests verify its structure; the bench operator runs the script
once per release.
"""

from __future__ import annotations

import stat
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
CAPTURE_SCRIPT = REPO_ROOT / "scripts" / "t2529_capture_rt_audio_evidence.sh"


def test_capture_script_exists() -> None:
    assert CAPTURE_SCRIPT.is_file(), f"missing capture script at {CAPTURE_SCRIPT}"


def test_capture_script_is_executable() -> None:
    mode = CAPTURE_SCRIPT.stat().st_mode
    assert mode & stat.S_IXUSR, (
        f"capture script must be executable; current mode = {oct(mode)}"
    )


def test_capture_script_uses_bash_shebang() -> None:
    text = CAPTURE_SCRIPT.read_text()
    first_line = text.splitlines()[0]
    assert first_line.startswith("#!"), "script must have a shebang"
    assert "bash" in first_line, "script must use bash"


def test_capture_script_uses_strict_bash_flags() -> None:
    text = CAPTURE_SCRIPT.read_text()
    assert "set -euo pipefail" in text, (
        "script must `set -euo pipefail` so missing commands or failed pipes fail loud"
    )


def test_capture_script_targets_canonical_evidence_dir() -> None:
    """The script must write into the canonical evidence dir."""
    text = CAPTURE_SCRIPT.read_text()
    assert "20260515/t2529-service-user/rt-audio-gates" in text, (
        "capture script must target the canonical evidence dir under "
        "docs/fit-for-purpose-evidence/"
    )


def test_capture_script_verifies_backend_running() -> None:
    """Without map2-backend active the audio thread isn't at SCHED_FIFO/80;
    capture would produce empty data. Script must pre-flight check."""
    text = CAPTURE_SCRIPT.read_text()
    assert "systemctl is-active" in text and "map2-backend" in text, (
        "capture script must verify map2-backend is active before capturing"
    )


# ---------------------------------------------------------------------------
# Six required captures
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "capture_file",
    [
        "pw-metadata.txt",            # PipeWire rate + quantum lock
        "jack-direct-verify.txt",     # JUCE → JACK direct path
        "ps-rt-threads.txt",          # SCHED_FIFO threads
        "getpcaps-per-unit.txt",      # Live caps per service PID
        "seccomp-deny.txt",           # Recent seccomp denials
        "soak-30min-output.txt",      # 30-min soak summary
    ],
)
def test_capture_script_produces_required_artefact(capture_file: str) -> None:
    text = CAPTURE_SCRIPT.read_text()
    assert capture_file in text, (
        f"capture script must produce {capture_file!r} — listed in the "
        f"MANIFEST.md as a V2 deliverable"
    )


# ---------------------------------------------------------------------------
# Capture-specific shape
# ---------------------------------------------------------------------------


def test_capture_script_runs_pw_metadata() -> None:
    """The PipeWire substrate gate runs `pw-metadata 0` to verify the
    rate + quantum lock-in."""
    text = CAPTURE_SCRIPT.read_text()
    assert "pw-metadata" in text, (
        "capture script must run pw-metadata for the PipeWire substrate check"
    )


def test_capture_script_enumerates_rt_threads_via_ps() -> None:
    """`ps -eLo ... cls,rtprio` with awk filter for cls=FF is the canonical
    way to enumerate SCHED_FIFO threads."""
    text = CAPTURE_SCRIPT.read_text()
    assert "ps -eLo" in text, "capture script must use ps -eLo for thread enumeration"
    assert "cls" in text and "rtprio" in text, (
        "ps -eLo must include cls + rtprio columns"
    )
    assert "FF" in text, (
        "awk filter must look for cls=FF (SCHED_FIFO)"
    )


def test_capture_script_runs_getpcaps_per_unit() -> None:
    """Live capability snapshot per service unit via getpcaps."""
    text = CAPTURE_SCRIPT.read_text()
    assert "getpcaps" in text, (
        "capture script must run getpcaps to verify live capability set"
    )
    # Must iterate over the canonical service units.
    for unit in (
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ):
        assert unit in text, (
            f"capture script must call getpcaps on {unit} (RT-eligibility unit)"
        )


def test_capture_script_checks_seccomp_denials() -> None:
    """ausearch finds recent seccomp denials in auditd. Expected output:
    empty (T2529-B3 baseline)."""
    text = CAPTURE_SCRIPT.read_text()
    assert "ausearch" in text, (
        "capture script must use ausearch to find seccomp denials"
    )
    assert "seccomp" in text, (
        "ausearch query must filter on -m seccomp"
    )


def test_capture_script_runs_30min_soak_with_correct_thresholds() -> None:
    """The soak must use the canonical RT thresholds:
    - max xruns: 0
    - max peak block jitter: 0.35 ms
    - duration: 1800 seconds (30 min)
    """
    text = CAPTURE_SCRIPT.read_text()
    assert "1800" in text, "soak must run for 1800 seconds (30 minutes)"
    assert "0.35" in text, (
        "soak peak-block-jitter threshold must be 0.35 ms"
    )
    assert "--threshold-max-xruns 0" in text, (
        "soak xrun threshold must be 0 (any xrun fails the gate)"
    )
    assert "--reset-stats-after-warmup" in text, (
        "soak must reset stats after warmup so startup spikes don't pollute the run"
    )


def test_capture_script_invokes_canonical_soak_runner() -> None:
    """The script must invoke the project's canonical soak runner."""
    text = CAPTURE_SCRIPT.read_text()
    assert "run_juce_random_fx_soak.py" in text, (
        "capture script must use the canonical juce-random-effects-soak runner"
    )


# ---------------------------------------------------------------------------
# Documentation
# ---------------------------------------------------------------------------


def test_capture_script_documents_t2529_v2_anchor() -> None:
    text = CAPTURE_SCRIPT.read_text()
    assert "T2529-V2" in text, (
        "capture script header must reference T2529-V2 (so a future "
        "operator can trace the anchor)"
    )


def test_capture_script_documents_acceptance_thresholds() -> None:
    """Header must document the SCHED_FIFO RT priority expectations
    + peak jitter threshold so the bench operator can verify."""
    text = CAPTURE_SCRIPT.read_text()
    assert "SCHED_FIFO/80" in text, (
        "header must document the SCHED_FIFO/80 expectation for JUCE audio"
    )
    assert "0.35 ms" in text, (
        "header must document the 0.35 ms peak block jitter threshold"
    )


def test_capture_script_documents_followup_actions() -> None:
    """Script must tell the operator what to do after capture (review,
    update MANIFEST, commit, close out worklist)."""
    text = CAPTURE_SCRIPT.read_text()
    assert "MANIFEST" in text, (
        "capture script must reference MANIFEST.md so the operator knows "
        "to flip Bench-gated → Filed rows"
    )
    assert "PROJECT_WORKLIST" in text or "worklist" in text.lower(), (
        "capture script must reference the worklist close-out"
    )
