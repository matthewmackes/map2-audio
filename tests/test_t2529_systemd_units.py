"""T2529-A3 cycle 4 — systemd packaging-tree unit-file contract.

Locks the file-shape of every unit shipped to /usr/lib/systemd/system/
so a future operator-only edit can't silently re-introduce the operator
account (`User=mm`, `/home/mm/...`, `/run/user/1000`) that T2529 untied
the platform from.

The dev-host tree at `systemd/*.service` is deliberately NOT covered by
these tests — it still runs as the `mm` user against the developer's
working directory so live edits don't require an RPM rebuild. Only the
operator-installed copies (packaged for RPM into /usr/lib/systemd/system/)
must meet the T2529 contract.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGING_SYSTEMD = REPO_ROOT / "packaging" / "systemd"

# Units that MUST run as the dedicated map2 service user with FHS paths.
SERVICE_USER_UNITS = (
    "map2-backend.service",
    "map2-tui.service",
    "map2-cluster.service",
    "map2-frontend.service",
    "map2-prometheus.service",
    "map2-grafana.service",
    "map2-controller-host.service",
    "map2-sonobus-transport.service",
)

# Units that run as root (network daemons — PTP, SRP) and are exempt from
# the User=map2 check. They still must NOT reference operator-home paths.
ROOT_DAEMON_UNITS = (
    "map2-ptp4l.service",
    "map2-phc2sys.service",
    "map2-srpd.service",
)

ALL_UNITS = SERVICE_USER_UNITS + ROOT_DAEMON_UNITS + ("map2-avb.target",)


def _read_unit(name: str) -> str:
    path = PACKAGING_SYSTEMD / name
    assert path.is_file(), f"missing packaging unit at {path}"
    return path.read_text()


def _service_lines(text: str) -> Iterable[str]:
    """Yield trimmed non-comment lines from a unit file."""
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(";"):
            continue
        yield s


# ---------------------------------------------------------------------------
# Universal invariant: no /home/mm/, no /run/user/<UID>/, no UID-1000 in
# any unit shipped to /usr/lib/systemd/system/.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", ALL_UNITS)
def test_packaging_unit_has_no_operator_home_path(unit_name: str) -> None:
    """No /home/mm/ paths. Q3 lock — the entire T2529 epic exists to
    untie the install from the operator's account. Drift here would
    immediately re-introduce the silent failure mode on non-mm hosts."""
    text = _read_unit(unit_name)
    for line in _service_lines(text):
        assert "/home/mm/" not in line, (
            f"{unit_name} contains operator-home path /home/mm/ — "
            f"T2529 forbids it. Offending line: {line!r}"
        )


@pytest.mark.parametrize("unit_name", ALL_UNITS)
def test_packaging_unit_has_no_per_user_runtime_dir(unit_name: str) -> None:
    """No /run/user/<UID>/ references. Q2 lock — the system-wide
    PipeWire instance + per-service /run/map2 runtime dir are the
    canonical substrate; hardcoding /run/user/1000 broke fresh installs
    on non-mm operator accounts (the original T2529 trigger)."""
    text = _read_unit(unit_name)
    for line in _service_lines(text):
        assert "/run/user/" not in line, (
            f"{unit_name} references /run/user/<UID>/ — T2529 Q2 lock "
            f"requires /run/map2 or the system-wide PipeWire socket "
            f"(/run/pipewire-system/...). Offending line: {line!r}"
        )


@pytest.mark.parametrize("unit_name", ALL_UNITS)
def test_packaging_unit_has_no_legacy_opt_map2(unit_name: str) -> None:
    """No /opt/map2/ (without -audio suffix) paths. Q3 lock requires
    the canonical /opt/map2-audio/ application install root per FHS §3.13."""
    text = _read_unit(unit_name)
    for line in _service_lines(text):
        # Allow /opt/map2-audio/... but reject /opt/map2/ or /opt/map2$
        if "/opt/map2" in line:
            assert "/opt/map2-audio" in line or "/opt/map2/" not in line, (
                f"{unit_name} contains legacy /opt/map2/ path — Q3 lock "
                f"requires /opt/map2-audio/. Offending line: {line!r}"
            )


# ---------------------------------------------------------------------------
# Service-user units: User=map2, Group=map2
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", SERVICE_USER_UNITS)
def test_service_unit_runs_as_map2_user(unit_name: str) -> None:
    """Q1 lock: the canonical install runs every service as the dedicated
    `map2` system service user. Drift here would re-introduce the
    UID-1000 operator-account dependency."""
    text = _read_unit(unit_name)
    user_lines = [s for s in _service_lines(text) if s.startswith("User=")]
    assert user_lines, f"{unit_name} missing User= directive"
    for line in user_lines:
        assert line == "User=map2", (
            f"{unit_name} must use User=map2 per T2529 Q1 lock — got {line!r}"
        )


@pytest.mark.parametrize("unit_name", SERVICE_USER_UNITS)
def test_service_unit_uses_map2_group(unit_name: str) -> None:
    """Primary group is `map2` (auto-created by systemd-sysusers from the
    'u' line in /usr/lib/sysusers.d/map2.conf)."""
    text = _read_unit(unit_name)
    group_lines = [s for s in _service_lines(text) if s.startswith("Group=")]
    assert group_lines, f"{unit_name} missing Group= directive"
    for line in group_lines:
        assert line == "Group=map2", (
            f"{unit_name} must use Group=map2 — got {line!r}"
        )


# ---------------------------------------------------------------------------
# FHS-aligned WorkingDirectory + paths
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name,expected_wd",
    [
        ("map2-backend.service", "/opt/map2-audio"),
        ("map2-tui.service", "/opt/map2-audio"),
        ("map2-cluster.service", "/opt/map2-audio"),
        ("map2-frontend.service", "/opt/map2-audio/web"),
        ("map2-controller-host.service", "/opt/map2-audio"),
        ("map2-sonobus-transport.service", "/opt/map2-audio"),
    ],
)
def test_service_unit_working_directory_is_fhs(unit_name: str, expected_wd: str) -> None:
    """WorkingDirectory points at /opt/map2-audio (FHS §3.13)."""
    text = _read_unit(unit_name)
    wd_lines = [s for s in _service_lines(text) if s.startswith("WorkingDirectory=")]
    assert wd_lines, f"{unit_name} missing WorkingDirectory= directive"
    assert wd_lines[0] == f"WorkingDirectory={expected_wd}", (
        f"{unit_name} WorkingDirectory must be {expected_wd!r} per Q3 lock — "
        f"got {wd_lines[0]!r}"
    )


# ---------------------------------------------------------------------------
# Runtime dir: /run/map2, not per-user
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_xdg_runtime_dir_is_run_map2(unit_name: str) -> None:
    """XDG_RUNTIME_DIR must point at /run/map2 — the per-service runtime
    dir provisioned by systemd-tmpfiles. Per-user dirs (/run/user/<UID>)
    break fresh installs on non-1000-UID operators."""
    text = _read_unit(unit_name)
    xdg_lines = [s for s in _service_lines(text) if "XDG_RUNTIME_DIR" in s]
    assert xdg_lines, f"{unit_name} missing XDG_RUNTIME_DIR Environment= directive"
    for line in xdg_lines:
        assert "/run/map2" in line and "/run/user/" not in line, (
            f"{unit_name} XDG_RUNTIME_DIR must point at /run/map2 — got {line!r}"
        )


# ---------------------------------------------------------------------------
# System-wide PipeWire (Q2 lock)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_uses_system_wide_pipewire(unit_name: str) -> None:
    """Audio-touching units connect to the system-wide PipeWire instance
    at /run/pipewire-system/pipewire-0, NOT a per-user instance."""
    text = _read_unit(unit_name)
    pw_lines = [s for s in _service_lines(text) if "PIPEWIRE_REMOTE" in s]
    assert pw_lines, f"{unit_name} missing PIPEWIRE_REMOTE Environment= directive"
    for line in pw_lines:
        assert "/run/pipewire-system/" in line, (
            f"{unit_name} PIPEWIRE_REMOTE must point at the system-wide "
            f"instance (/run/pipewire-system/...) per Q2 lock — got {line!r}"
        )


# ---------------------------------------------------------------------------
# Supplementary groups: audio (everywhere), pipewire-system (audio-touching)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_lists_audio_supplementary_group(unit_name: str) -> None:
    """Audio-touching units list `audio` in SupplementaryGroups."""
    text = _read_unit(unit_name)
    sg_lines = [s for s in _service_lines(text) if s.startswith("SupplementaryGroups=")]
    assert sg_lines, f"{unit_name} missing SupplementaryGroups= directive"
    joined = " ".join(sg_lines)
    assert "audio" in joined, (
        f"{unit_name} must list `audio` in SupplementaryGroups — got {sg_lines!r}"
    )


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_lists_pipewire_system_group(unit_name: str) -> None:
    """Q2 lock: system-wide PipeWire socket access requires
    `pipewire-system` group membership."""
    text = _read_unit(unit_name)
    sg_lines = [s for s in _service_lines(text) if s.startswith("SupplementaryGroups=")]
    assert sg_lines, f"{unit_name} missing SupplementaryGroups= directive"
    joined = " ".join(sg_lines)
    assert "pipewire-system" in joined, (
        f"{unit_name} must list `pipewire-system` in SupplementaryGroups per Q2 — "
        f"got {sg_lines!r}"
    )


# ---------------------------------------------------------------------------
# ReadWritePaths: FHS state dirs only, no operator home
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_readwritepaths_fhs_only(unit_name: str) -> None:
    """ReadWritePaths must only list FHS state dirs (/run/map2, /var/lib/map2,
    /var/cache/map2, /var/log/map2). No /home/, /root/, /tmp/, /usr/local/."""
    text = _read_unit(unit_name)
    rwp_lines = [s for s in _service_lines(text) if s.startswith("ReadWritePaths=")]
    if not rwp_lines:
        return  # not all units list ReadWritePaths
    for line in rwp_lines:
        paths = line.removeprefix("ReadWritePaths=").split()
        for p in paths:
            assert not p.startswith("/home/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids /home/ paths"
            )
            assert not p.startswith("/root/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids /root/ paths"
            )
            assert not p.startswith("/usr/local/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids /usr/local/ paths"
            )


# ---------------------------------------------------------------------------
# EnvironmentFile drop-in support
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-frontend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ],
)
def test_service_unit_loads_environment_drop_in(unit_name: str) -> None:
    """Q3 lock: operators drop env overrides into /etc/map2/environment.d/*.env
    (group-writable by the map2 group; see tmpfiles.d). The unit must
    `EnvironmentFile=` from that dir with `-` prefix (tolerate-missing)."""
    text = _read_unit(unit_name)
    env_lines = [s for s in _service_lines(text) if s.startswith("EnvironmentFile=")]
    has_dropin = any("/etc/map2/environment.d/" in line for line in env_lines)
    assert has_dropin, (
        f"{unit_name} must EnvironmentFile=-/etc/map2/environment.d/*.env so "
        f"operators can drop in overrides without becoming root over /etc/map2/. "
        f"EnvironmentFile= lines found: {env_lines}"
    )


# ---------------------------------------------------------------------------
# RPM spec — make sure the new units are packaged
# ---------------------------------------------------------------------------


SPEC_FILE = REPO_ROOT / "packaging" / "rpm" / "map2.spec"


def test_rpm_spec_installs_controller_host_unit() -> None:
    """T2529-A3 — the controller-host daemon needs to ship in the RPM."""
    text = SPEC_FILE.read_text()
    assert (
        "install -m 644 packaging/systemd/map2-controller-host.service "
        "%{buildroot}/usr/lib/systemd/system/" in text
    ), "RPM spec must install map2-controller-host.service to /usr/lib/systemd/system/"


def test_rpm_spec_files_lists_controller_host_unit() -> None:
    """%files section must own the controller-host unit."""
    text = SPEC_FILE.read_text()
    assert "/usr/lib/systemd/system/map2-controller-host.service" in text, (
        "%files section must list /usr/lib/systemd/system/map2-controller-host.service"
    )


def test_rpm_spec_installs_cluster_and_frontend_units() -> None:
    """T2529-A3 — cluster + frontend units land alongside the rest."""
    text = SPEC_FILE.read_text()
    for unit in ("map2-cluster.service", "map2-frontend.service"):
        assert (
            f"install -m 644 packaging/systemd/{unit} "
            "%{buildroot}/usr/lib/systemd/system/" in text
        ), f"RPM spec must install {unit} to /usr/lib/systemd/system/"
        assert f"/usr/lib/systemd/system/{unit}" in text, (
            f"%files section must list /usr/lib/systemd/system/{unit}"
        )
