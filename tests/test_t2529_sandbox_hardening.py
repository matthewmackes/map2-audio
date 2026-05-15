"""T2529-B1 cycle 10 — systemd sandbox hardening contract.

Locks the per-unit Protect* / NoNewPrivileges / Restrict* directives so a
future operator-only edit can't silently re-open the sandbox.

Target: `systemd-analyze security` score < 2.0 per unit (B2-B3 close the
remaining gap with CapabilityBoundingSet + SystemCallFilter). This cycle
just enforces the directive set is correct.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGING_SYSTEMD = REPO_ROOT / "packaging" / "systemd"

# Units that MUST carry the full T2529-B1 sandbox set.
HARDENED_UNITS = (
    "map2-backend.service",
    "map2-tui.service",
    "map2-cluster.service",
    "map2-frontend.service",
    "map2-prometheus.service",
    "map2-grafana.service",
    "map2-controller-host.service",
    "map2-sonobus-transport.service",
    "map2-srpd.service",
)


def _unit_text(name: str) -> str:
    path = PACKAGING_SYSTEMD / name
    assert path.is_file(), f"missing packaging unit at {path}"
    return path.read_text()


# ---------------------------------------------------------------------------
# Sandbox directive coverage — every hardened unit must carry the full set
# ---------------------------------------------------------------------------


# Directives we require on every hardened unit. Each is paired with the
# accepted value forms (both `yes` and `true` are valid systemd booleans).
_REQUIRED_DIRECTIVES = (
    ("NoNewPrivileges", ("yes", "true")),
    ("PrivateTmp", ("yes", "true")),
    ("ProtectSystem", ("strict",)),
    ("ProtectHome", ("yes", "true", "read-only")),
    ("ProtectKernelTunables", ("yes", "true")),
    ("ProtectKernelModules", ("yes", "true")),
    ("ProtectKernelLogs", ("yes", "true")),
    ("ProtectControlGroups", ("yes", "true")),
    ("ProtectClock", ("yes", "true")),
    ("ProtectHostname", ("yes", "true")),
    ("RestrictSUIDSGID", ("yes", "true")),
    ("RestrictNamespaces", ("yes", "true")),
    ("LockPersonality", ("yes", "true")),
)


@pytest.mark.parametrize("unit_name", HARDENED_UNITS)
@pytest.mark.parametrize("directive,accepted", _REQUIRED_DIRECTIVES)
def test_unit_carries_sandbox_directive(
    unit_name: str, directive: str, accepted: tuple
) -> None:
    """Every hardened unit must set each Protect*/Restrict*/Lock* directive
    to an accepted value."""
    text = _unit_text(unit_name)
    matched = False
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(";"):
            continue
        if not s.startswith(f"{directive}="):
            continue
        value = s.split("=", 1)[1].strip().lower()
        assert value in accepted, (
            f"{unit_name}: {directive}={value!r} not in accepted set {accepted}"
        )
        matched = True
    assert matched, (
        f"{unit_name} missing {directive}= directive — T2529-B1 sandbox model "
        f"requires it on every service unit"
    )


# ---------------------------------------------------------------------------
# RestrictAddressFamilies allowlist
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", HARDENED_UNITS)
def test_unit_restricts_address_families(unit_name: str) -> None:
    """Every hardened unit must enumerate an AF allowlist via
    RestrictAddressFamilies=. Wildcards (no directive at all) re-expose
    the entire AF_* space."""
    text = _unit_text(unit_name)
    raf_lines = [
        s.strip() for s in text.splitlines()
        if s.strip().startswith("RestrictAddressFamilies=")
    ]
    assert raf_lines, (
        f"{unit_name} must set RestrictAddressFamilies= to an explicit "
        "allowlist — wildcards re-expose AF_BLUETOOTH, AF_CAN, AF_RDS, etc."
    )
    # AF_UNIX must be in every allowlist (UDS for systemd notify + log).
    joined = " ".join(raf_lines)
    assert "AF_UNIX" in joined, (
        f"{unit_name} RestrictAddressFamilies must include AF_UNIX (systemd "
        f"notify socket + journal) — got {raf_lines!r}"
    )


@pytest.mark.parametrize(
    "unit_name,required_family",
    [
        # Network-facing units need AF_INET + AF_INET6
        ("map2-backend.service", "AF_INET"),
        ("map2-controller-host.service", "AF_INET"),
        ("map2-sonobus-transport.service", "AF_INET"),
        ("map2-prometheus.service", "AF_INET"),
        ("map2-grafana.service", "AF_INET"),
        ("map2-frontend.service", "AF_INET"),
        # AVB SRPD needs AF_PACKET for raw 1722/1Qat frames
        ("map2-srpd.service", "AF_PACKET"),
    ],
)
def test_unit_address_family_includes_required(unit_name: str, required_family: str) -> None:
    text = _unit_text(unit_name)
    raf_lines = [
        s.strip() for s in text.splitlines()
        if s.strip().startswith("RestrictAddressFamilies=")
    ]
    joined = " ".join(raf_lines)
    assert required_family in joined, (
        f"{unit_name} RestrictAddressFamilies must include {required_family} — "
        f"got {raf_lines!r}"
    )


# ---------------------------------------------------------------------------
# Anti-regression: don't disable hardening with weak values
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", HARDENED_UNITS)
def test_unit_does_not_disable_protect_system(unit_name: str) -> None:
    """ProtectSystem must be `strict` — not `full` or `yes` (both weaker)."""
    text = _unit_text(unit_name)
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("ProtectSystem="):
            continue
        value = s.split("=", 1)[1].strip().lower()
        assert value == "strict", (
            f"{unit_name}: ProtectSystem={value!r} is weaker than `strict` — "
            f"T2529-B1 requires `strict` so /usr is mounted read-only and "
            f"/etc /var inherit the same restriction"
        )


@pytest.mark.parametrize("unit_name", HARDENED_UNITS)
def test_unit_does_not_disable_namespaces(unit_name: str) -> None:
    """RestrictNamespaces=yes — prevents process from creating new
    namespaces (CLONE_NEW*). Disabling reopens container-escape paths."""
    text = _unit_text(unit_name)
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("RestrictNamespaces="):
            continue
        value = s.split("=", 1)[1].strip().lower()
        assert value in ("yes", "true"), (
            f"{unit_name}: RestrictNamespaces={value!r} disables the namespace "
            f"sandbox — T2529-B1 forbids that"
        )


# ---------------------------------------------------------------------------
# RT-safety: units that need RT scheduling must NOT set RestrictRealtime=true
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",       # JUCE audio callback SCHED_FIFO/80
        "map2-controller-host.service",  # libremidi SCHED_FIFO/70
        "map2-sonobus-transport.service",  # AOO SCHED_FIFO/40
    ],
)
def test_rt_unit_does_not_restrict_realtime(unit_name: str) -> None:
    """RT-eligibility critical: these units self-elevate threads to SCHED_FIFO.
    RestrictRealtime=true (sandboxing default) blocks that and silently
    kills RT scheduling on the audio path."""
    text = _unit_text(unit_name)
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("RestrictRealtime="):
            continue
        value = s.split("=", 1)[1].strip().lower()
        assert value not in ("yes", "true"), (
            f"{unit_name}: RestrictRealtime={value!r} — this unit needs "
            f"SCHED_FIFO eligibility; T2529-B1 explicitly leaves it OFF"
        )


# ---------------------------------------------------------------------------
# ReadWritePaths still FHS-clean after hardening
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("unit_name", HARDENED_UNITS)
def test_unit_readwritepaths_fhs_only(unit_name: str) -> None:
    """ProtectSystem=strict + ReadWritePaths is the FHS write-allowlist.
    Drift to /home/, /root/, /usr/local/ would defeat the model."""
    text = _unit_text(unit_name)
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("ReadWritePaths="):
            continue
        paths = s.removeprefix("ReadWritePaths=").split()
        for p in paths:
            assert not p.startswith("/home/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids"
            )
            assert not p.startswith("/root/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids"
            )
            assert not p.startswith("/usr/local/"), (
                f"{unit_name} ReadWritePaths lists {p!r} — T2529 forbids"
            )
