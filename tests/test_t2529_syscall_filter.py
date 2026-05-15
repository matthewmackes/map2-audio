"""T2529-B3 cycle 12 — SystemCallFilter seccomp contract.

Locks the per-unit seccomp allowlist + denylist so a future operator-only
edit can't silently re-expose @debug, @module, @mount, @privileged, or
@raw-io syscalls.

Reference: `man 5 systemd.exec` § "SystemCallFilter=".
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGING_SYSTEMD = REPO_ROOT / "packaging" / "systemd"

# Units that MUST carry T2529-B3 seccomp directives.
SECCOMP_UNITS = (
    "map2-backend.service",
    "map2-tui.service",
    "map2-cluster.service",
    "map2-frontend.service",
    "map2-prometheus.service",
    "map2-grafana.service",
    "map2-controller-host.service",
    "map2-sonobus-transport.service",
    "map2-srpd.service",
    "map2-ptp4l.service",
    "map2-phc2sys.service",
)


def _unit_text(name: str) -> str:
    path = PACKAGING_SYSTEMD / name
    assert path.is_file(), f"missing packaging unit at {path}"
    return path.read_text()


def _directive_values(text: str, directive: str) -> Iterable[str]:
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("#") or s.startswith(";"):
            continue
        if not s.startswith(f"{directive}="):
            continue
        yield s.split("=", 1)[1].strip()


# ---------------------------------------------------------------------------
# SystemCallFilter must be set on every unit
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", SECCOMP_UNITS)
def test_unit_sets_system_call_filter(unit_name: str) -> None:
    """Every hardened unit must declare SystemCallFilter= (allowlist +
    denylist with `~` prefix). Without this, the unit inherits the
    systemd default (everything allowed)."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallFilter"))
    assert values, (
        f"{unit_name} missing SystemCallFilter= directive — T2529-B3 requires "
        f"a per-unit seccomp allowlist"
    )


@pytest.mark.parametrize("unit_name", SECCOMP_UNITS)
def test_unit_uses_system_service_allowlist(unit_name: str) -> None:
    """@system-service is the canonical allowlist for service-style daemons.
    Every MAP2 unit must include it."""
    text = _unit_text(unit_name)
    joined = " ".join(_directive_values(text, "SystemCallFilter"))
    assert "@system-service" in joined, (
        f"{unit_name} SystemCallFilter must include @system-service — the "
        f"canonical service-daemon allowlist"
    )


# ---------------------------------------------------------------------------
# SystemCallErrorNumber + SystemCallArchitectures
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", SECCOMP_UNITS)
def test_unit_sets_system_call_error_number(unit_name: str) -> None:
    """SystemCallErrorNumber=EPERM causes denied syscalls to return EPERM
    instead of SIGSYS (which would kill the process). EPERM keeps the
    unit responsive while still blocking the syscall."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallErrorNumber"))
    assert values, (
        f"{unit_name} missing SystemCallErrorNumber= — denied syscalls "
        f"will SIGSYS-kill the process without it"
    )
    assert values[-1] == "EPERM", (
        f"{unit_name} SystemCallErrorNumber must be EPERM — SIGSYS kills "
        f"the unit on first denied syscall (e.g. a Python library probing "
        f"for a feature)"
    )


@pytest.mark.parametrize("unit_name", SECCOMP_UNITS)
def test_unit_restricts_to_native_arch(unit_name: str) -> None:
    """SystemCallArchitectures=native restricts the unit to the host's
    primary ABI — drops x32 / i386 / aarch64 compat layers that bypass
    the seccomp filter."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallArchitectures"))
    assert values, (
        f"{unit_name} missing SystemCallArchitectures= — compat ABIs "
        f"bypass the seccomp filter without it"
    )
    assert "native" in values[-1], (
        f"{unit_name} SystemCallArchitectures must be `native` to drop "
        f"compat ABIs — got {values[-1]!r}"
    )


# ---------------------------------------------------------------------------
# Denylist invariants — these MUST be blocked across every unit
# ---------------------------------------------------------------------------


_REQUIRED_DENIES = ("@debug", "@module", "@mount", "@obsolete", "@raw-io", "@reboot", "@swap")


@pytest.mark.parametrize("unit_name", SECCOMP_UNITS)
@pytest.mark.parametrize("denied_set", _REQUIRED_DENIES)
def test_unit_denies_dangerous_syscall_set(unit_name: str, denied_set: str) -> None:
    """Every unit must deny @debug (ptrace), @module (kernel-module load),
    @mount (mount/pivot_root), @obsolete (deprecated), @raw-io (iopl),
    @reboot, @swap. T2529-B3 forbids any unit from accessing these."""
    text = _unit_text(unit_name)
    # The denylist line starts with `~` to indicate negation.
    values = list(_directive_values(text, "SystemCallFilter"))
    deny_lines = [v for v in values if v.startswith("~")]
    assert deny_lines, (
        f"{unit_name} missing SystemCallFilter=~<deny set> directive — "
        f"each unit needs a negation list to drop dangerous syscall classes"
    )
    joined_deny = " ".join(deny_lines)
    assert denied_set in joined_deny, (
        f"{unit_name} SystemCallFilter denylist must include {denied_set} — "
        f"got {deny_lines!r}"
    )


# ---------------------------------------------------------------------------
# @privileged: forbidden on every unit EXCEPT AVB infra (SRPD/PTP4L/PHC2SYS
# need root + privileged syscalls). The audio units run as map2 (non-root)
# so @privileged is meaningless anyway, but we deny it explicitly.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-frontend.service",
        "map2-prometheus.service",
        "map2-grafana.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_non_root_unit_denies_privileged_syscalls(unit_name: str) -> None:
    """Non-root (User=map2) units must deny @privileged for defense-in-depth
    against future SetUID-binary or capability-inheritance regressions."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallFilter"))
    deny_lines = [v for v in values if v.startswith("~")]
    joined = " ".join(deny_lines)
    assert "@privileged" in joined, (
        f"{unit_name} must deny @privileged syscalls — defense-in-depth "
        f"against future regression (caps-elevation, setuid-binary, etc.)"
    )


# ---------------------------------------------------------------------------
# @clock: PTP4L + PHC2SYS need to call clock_settime/adjtimex; the rest
# must NOT have @clock in their allowlist
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-frontend.service",
        "map2-prometheus.service",
        "map2-grafana.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
        "map2-srpd.service",
    ],
)
def test_non_time_unit_denies_clock_syscalls(unit_name: str) -> None:
    """Only PTP4L + PHC2SYS get @clock. Every other unit must deny it —
    otherwise a runaway Python script could clobber the system clock."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallFilter"))
    # @clock must NOT appear in any allowlist line (lines without leading `~`)
    allow_lines = [v for v in values if not v.startswith("~")]
    joined_allow = " ".join(allow_lines)
    assert "@clock" not in joined_allow, (
        f"{unit_name} allowlist contains @clock — only PTP4L + PHC2SYS "
        f"are permitted to call clock_settime/adjtimex"
    )


# ---------------------------------------------------------------------------
# Audio-RT units: @audio + @resources are REQUIRED
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_rt_unit_allowlist_includes_audio_and_resources(unit_name: str) -> None:
    """RT-audio units need @audio (ALSA ioctl + sound device control)
    and @resources (sched_setaffinity, setpriority, mlock). Without
    these, RT scheduling silently fails."""
    text = _unit_text(unit_name)
    values = list(_directive_values(text, "SystemCallFilter"))
    allow_lines = [v for v in values if not v.startswith("~")]
    joined = " ".join(allow_lines)
    assert "@audio" in joined, (
        f"{unit_name} allowlist must include @audio — RT audio path needs "
        f"ALSA ioctls and sound device control"
    )
    assert "@resources" in joined, (
        f"{unit_name} allowlist must include @resources — sched_setaffinity, "
        f"setpriority, mlock are all in this set"
    )
