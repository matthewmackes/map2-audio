"""T2529-B2 cycle 11 — per-unit CapabilityBoundingSet contract.

Locks the per-unit capability model so each service runs with the minimum
capability set it actually needs. Drift here would re-open the unbounded
capability inheritance the default systemd policy allows.

Reference: `man 7 capabilities`, `man 5 systemd.exec` § "Capabilities".
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGING_SYSTEMD = REPO_ROOT / "packaging" / "systemd"


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
# Audio-RT units: CAP_SYS_NICE for SCHED_FIFO self-elevation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-backend.service",         # JUCE audio callback at SCHED_FIFO/80
        "map2-controller-host.service",  # libremidi I/O at SCHED_FIFO/70
        "map2-sonobus-transport.service",  # AOO send/receive at SCHED_FIFO/40
    ],
)
def test_audio_unit_grants_cap_sys_nice(unit_name: str) -> None:
    """RT-eligible units need CAP_SYS_NICE in BOTH AmbientCapabilities
    (inherited by threads) and CapabilityBoundingSet (cap doesn't get
    dropped). Without ambient, pthread_setschedparam returns EPERM and
    the audio path silently runs at SCHED_OTHER."""
    text = _unit_text(unit_name)
    ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    assert "CAP_SYS_NICE" in ambient, (
        f"{unit_name} must list CAP_SYS_NICE in AmbientCapabilities — "
        f"RT-thread elevation fails without it"
    )
    assert "CAP_SYS_NICE" in bounding, (
        f"{unit_name} must list CAP_SYS_NICE in CapabilityBoundingSet — "
        f"AmbientCapabilities can't grant a cap that isn't in the bound"
    )


# ---------------------------------------------------------------------------
# Backend: CAP_NET_RAW for AVDECC libpcap packet sockets
# ---------------------------------------------------------------------------


def test_backend_grants_cap_net_raw() -> None:
    """Backend embeds the AVDECC controller (la_avdecc + libpcap). The
    pcap packet socket needs CAP_NET_RAW or it falls back to non-raw
    mode and the AVDECC AECP/ACMP frames are corrupt."""
    text = _unit_text("map2-backend.service")
    ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    assert "CAP_NET_RAW" in ambient, (
        "backend.service must list CAP_NET_RAW in AmbientCapabilities for "
        "the AVDECC libpcap packet socket"
    )
    assert "CAP_NET_RAW" in bounding, (
        "backend.service must list CAP_NET_RAW in CapabilityBoundingSet"
    )


# ---------------------------------------------------------------------------
# SonoBus transport: CAP_NET_BIND_SERVICE for AOO transport ports
# ---------------------------------------------------------------------------


def test_sonobus_transport_grants_cap_net_bind_service() -> None:
    """SonoBus daemon binds the AOO UDP port range; default
    MAP2_SONOBUS_UDP_PORT_BASE=10000 is unprivileged but operators may
    override to <1024 (e.g. port 53 for tunneling)."""
    text = _unit_text("map2-sonobus-transport.service")
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    assert "CAP_NET_BIND_SERVICE" in bounding, (
        "sonobus-transport.service must list CAP_NET_BIND_SERVICE in "
        "CapabilityBoundingSet so operators can override the UDP port "
        "to a privileged range"
    )


# ---------------------------------------------------------------------------
# AVB infra: SRPD/PTP4L/PHC2SYS need network admin + time
# ---------------------------------------------------------------------------


def test_srpd_grants_avb_caps() -> None:
    """SRP/MSRP daemon needs CAP_NET_ADMIN (stream reservation netlink)
    + CAP_NET_RAW (raw IEEE 802.1Qat frames)."""
    text = _unit_text("map2-srpd.service")
    ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    for cap in ("CAP_NET_ADMIN", "CAP_NET_RAW"):
        assert cap in ambient, f"srpd.service must list {cap} in AmbientCapabilities"
        assert cap in bounding, f"srpd.service must list {cap} in CapabilityBoundingSet"


def test_ptp4l_grants_time_caps() -> None:
    """ptp4l needs CAP_SYS_TIME (PHC adjustment) + CAP_NET_ADMIN
    + CAP_NET_RAW (raw PTP sockets)."""
    text = _unit_text("map2-ptp4l.service")
    ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    for cap in ("CAP_NET_ADMIN", "CAP_NET_RAW", "CAP_SYS_TIME"):
        assert cap in ambient, f"ptp4l.service must list {cap} in AmbientCapabilities"
        assert cap in bounding, f"ptp4l.service must list {cap} in CapabilityBoundingSet"


def test_phc2sys_grants_time_caps() -> None:
    """phc2sys needs CAP_SYS_TIME (set system clock from PHC)
    + CAP_NET_ADMIN (read PHC over netlink)."""
    text = _unit_text("map2-phc2sys.service")
    ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
    bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
    for cap in ("CAP_SYS_TIME", "CAP_NET_ADMIN"):
        assert cap in ambient, f"phc2sys.service must list {cap} in AmbientCapabilities"
        assert cap in bounding, f"phc2sys.service must list {cap} in CapabilityBoundingSet"


# ---------------------------------------------------------------------------
# Empty bounding set — units that need no capabilities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-tui.service",          # localhost HTTP only, no privileges
        "map2-cluster.service",      # Python service, no privileges
        "map2-frontend.service",     # static HTTP on port 3000, no privileges
        "map2-prometheus.service",   # 127.0.0.1:9090, no privileges
        "map2-grafana.service",      # port 3000, no privileges
    ],
)
def test_non_privileged_unit_has_empty_bounding_set(unit_name: str) -> None:
    """Non-privileged units must declare `CapabilityBoundingSet=` (empty)
    to drop the entire CAP_* set. Without this directive, the unit
    inherits the systemd default (every CAP_*)."""
    text = _unit_text(unit_name)
    bounding_lines = [
        s.strip() for s in text.splitlines()
        if s.strip().startswith("CapabilityBoundingSet=")
    ]
    assert bounding_lines, (
        f"{unit_name} missing CapabilityBoundingSet= directive — without "
        f"this, the unit inherits every CAP_* capability from systemd default"
    )
    # The empty form (`CapabilityBoundingSet=`) drops all caps.
    values = [line.split("=", 1)[1].strip() for line in bounding_lines]
    assert all(v == "" for v in values), (
        f"{unit_name} CapabilityBoundingSet must be EMPTY (no caps); got {values!r}"
    )


@pytest.mark.parametrize(
    "unit_name",
    [
        "map2-tui.service",
        "map2-cluster.service",
        "map2-frontend.service",
        "map2-prometheus.service",
        "map2-grafana.service",
    ],
)
def test_non_privileged_unit_has_empty_ambient_set(unit_name: str) -> None:
    """Non-privileged units must declare `AmbientCapabilities=` (empty)
    too. Otherwise inheriting threads can still see ambient caps."""
    text = _unit_text(unit_name)
    ambient_lines = [
        s.strip() for s in text.splitlines()
        if s.strip().startswith("AmbientCapabilities=")
    ]
    assert ambient_lines, (
        f"{unit_name} missing AmbientCapabilities= directive"
    )
    values = [line.split("=", 1)[1].strip() for line in ambient_lines]
    assert all(v == "" for v in values), (
        f"{unit_name} AmbientCapabilities must be EMPTY; got {values!r}"
    )


# ---------------------------------------------------------------------------
# Capability least-privilege: backend must NOT request unrelated caps
# ---------------------------------------------------------------------------


def test_backend_does_not_request_cap_sys_admin() -> None:
    """CAP_SYS_ADMIN is the systemd 'God mode' capability. T2529-B2
    forbids it on every MAP2 unit. None of our daemons need it."""
    for unit_name in (
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
        "map2-tui.service",
        "map2-cluster.service",
        "map2-frontend.service",
        "map2-prometheus.service",
        "map2-grafana.service",
        "map2-srpd.service",
        "map2-ptp4l.service",
        "map2-phc2sys.service",
    ):
        text = _unit_text(unit_name)
        ambient = " ".join(_directive_values(text, "AmbientCapabilities"))
        bounding = " ".join(_directive_values(text, "CapabilityBoundingSet"))
        assert "CAP_SYS_ADMIN" not in ambient, (
            f"{unit_name} requests CAP_SYS_ADMIN in AmbientCapabilities — "
            f"T2529-B2 forbids this 'God mode' capability"
        )
        assert "CAP_SYS_ADMIN" not in bounding, (
            f"{unit_name} requests CAP_SYS_ADMIN in CapabilityBoundingSet — "
            f"T2529-B2 forbids it"
        )
