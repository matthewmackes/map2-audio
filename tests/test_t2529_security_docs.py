"""T2529-B4 cycle 13 — security model documentation contract.

Locks the presence + reference shape of docs/install/SECURITY_MODEL.md
so a future operator-only edit can't silently drop a layer of the
sandbox model description.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SECURITY_DOC = REPO_ROOT / "docs" / "install" / "SECURITY_MODEL.md"


def test_security_doc_exists() -> None:
    assert SECURITY_DOC.is_file(), f"missing doc at {SECURITY_DOC}"


# ---------------------------------------------------------------------------
# Four-layer model coverage
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "layer",
    [
        "Identity",
        "Filesystem",
        "Capabilities",
        "Syscalls",
    ],
)
def test_security_doc_documents_layer(layer: str) -> None:
    """SECURITY_MODEL.md must document each of the four security layers."""
    text = SECURITY_DOC.read_text()
    assert layer in text, (
        f"SECURITY_MODEL.md must describe the {layer!r} layer of the sandbox model"
    )


# ---------------------------------------------------------------------------
# Mechanism coverage — every directive that appears in the units must be
# documented here, otherwise an operator has nowhere to look for the rationale
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "directive",
    [
        # Identity layer
        "User=map2",
        # Filesystem layer
        "ProtectSystem=strict",
        "ProtectHome",
        "PrivateTmp",
        "ReadWritePaths",
        # Network layer
        "RestrictAddressFamilies",
        # Capability layer
        "CapabilityBoundingSet",
        "AmbientCapabilities",
        # Syscall layer
        "SystemCallFilter",
        "SystemCallErrorNumber",
        "SystemCallArchitectures",
        # Kernel-surface
        "NoNewPrivileges",
        "ProtectKernelTunables",
        "ProtectKernelModules",
        "ProtectKernelLogs",
        "ProtectControlGroups",
        "RestrictSUIDSGID",
        "RestrictNamespaces",
        "LockPersonality",
    ],
)
def test_security_doc_references_directive(directive: str) -> None:
    """Every systemd directive used in the hardened units must be documented."""
    text = SECURITY_DOC.read_text()
    assert directive in text, (
        f"SECURITY_MODEL.md must reference the {directive!r} directive — "
        "operators need a single doc to find the rationale for each one"
    )


# ---------------------------------------------------------------------------
# Capability set coverage — each cap that any unit requests must be documented
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cap",
    [
        "CAP_SYS_NICE",
        "CAP_NET_RAW",
        "CAP_NET_BIND_SERVICE",
        "CAP_NET_ADMIN",
        "CAP_SYS_TIME",
        "CAP_SYS_ADMIN",  # documented as FORBIDDEN
    ],
)
def test_security_doc_references_capability(cap: str) -> None:
    text = SECURITY_DOC.read_text()
    assert cap in text, (
        f"SECURITY_MODEL.md must reference {cap!r} — every capability "
        f"requested by ANY unit needs a rationale here"
    )


# ---------------------------------------------------------------------------
# Syscall class coverage
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "syscall_class",
    [
        # Allowlist classes
        "@system-service",
        "@audio",
        "@resources",
        "@network-io",
        "@clock",
        # Denylist classes
        "@debug",
        "@module",
        "@mount",
        "@obsolete",
        "@privileged",
        "@raw-io",
        "@reboot",
        "@swap",
    ],
)
def test_security_doc_references_syscall_class(syscall_class: str) -> None:
    text = SECURITY_DOC.read_text()
    assert syscall_class in text, (
        f"SECURITY_MODEL.md must reference the {syscall_class!r} syscall class "
        "(either as an allowlist or denylist entry)"
    )


# ---------------------------------------------------------------------------
# RT carve-out + verification model
# ---------------------------------------------------------------------------


def test_security_doc_documents_rt_carve_out() -> None:
    """RT-audio units leave RestrictRealtime=false deliberately. Doc must
    explain why so a future hardening pass doesn't silently break audio."""
    text = SECURITY_DOC.read_text()
    assert "RestrictRealtime" in text, (
        "SECURITY_MODEL.md must document the RestrictRealtime carve-out for "
        "RT-audio units (otherwise a future hardening pass will set it to "
        "true and silently kill RT scheduling)"
    )
    assert "SCHED_FIFO" in text, (
        "SECURITY_MODEL.md must mention SCHED_FIFO in the RT carve-out"
    )


def test_security_doc_documents_verification_model() -> None:
    """systemd-analyze security + getpcaps are the operator-facing
    verification commands; doc must reference both."""
    text = SECURITY_DOC.read_text()
    assert "systemd-analyze security" in text, (
        "SECURITY_MODEL.md must reference `systemd-analyze security` — "
        "the canonical verification command"
    )
    assert "getpcaps" in text, (
        "SECURITY_MODEL.md must reference `getpcaps` — the live-capability "
        "verification command"
    )


# ---------------------------------------------------------------------------
# Threat model section
# ---------------------------------------------------------------------------


def test_security_doc_documents_threat_model() -> None:
    """Doc must explicitly state what the model defends against AND what
    it does NOT defend against. Operators making deployment decisions
    need to know the limits."""
    text = SECURITY_DOC.read_text()
    assert "Threat model" in text or "threat model" in text, (
        "SECURITY_MODEL.md must include an explicit threat model section "
        "(both in-scope AND out-of-scope mitigations)"
    )
    # The four canonical in-scope threats:
    in_scope_anchors = (
        "Operator-account compromise",
        "Plugin-loaded code execution",
        "Container-escape",
        "Filesystem traversal",
    )
    for anchor in in_scope_anchors:
        assert anchor in text, (
            f"SECURITY_MODEL.md threat model must address {anchor!r}"
        )


# ---------------------------------------------------------------------------
# Cross-references between docs
# ---------------------------------------------------------------------------


def test_security_doc_links_to_service_user() -> None:
    text = SECURITY_DOC.read_text()
    assert "SERVICE_USER.md" in text, (
        "SECURITY_MODEL.md must link to SERVICE_USER.md"
    )


def test_security_doc_links_to_fhs_layout() -> None:
    text = SECURITY_DOC.read_text()
    assert "FHS_LAYOUT.md" in text, (
        "SECURITY_MODEL.md must link to FHS_LAYOUT.md"
    )


def test_security_doc_links_to_pytest_gate_suite() -> None:
    text = SECURITY_DOC.read_text()
    assert "tests/test_t2529" in text, (
        "SECURITY_MODEL.md must reference the pytest gate suite that enforces "
        "the contract"
    )


# ---------------------------------------------------------------------------
# Unit Documentation= directives should reference this doc
# ---------------------------------------------------------------------------


def test_srpd_unit_references_security_model() -> None:
    """The root AVB daemons run with elevated privileges; their unit
    Documentation= directive should point operators at SECURITY_MODEL.md
    so they can audit the granted caps."""
    unit_path = REPO_ROOT / "packaging" / "systemd" / "map2-srpd.service"
    text = unit_path.read_text()
    assert "SECURITY_MODEL.md" in text, (
        "map2-srpd.service should carry a Documentation= directive pointing "
        "at /opt/map2-audio/docs/install/SECURITY_MODEL.md (root daemon "
        "operators need easy access to the threat model)"
    )
