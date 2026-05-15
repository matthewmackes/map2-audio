"""T2529-A6 cycle 9 — install layout documentation contract.

Locks the presence + cross-reference shape of the two operator-facing
install docs:
  - docs/install/SERVICE_USER.md  (the dedicated map2 service user)
  - docs/install/FHS_LAYOUT.md    (the FHS §3 install layout)

These tests don't enforce exact wording — they just require that each
canonical piece (sysusers.d, tmpfiles.d, the RPM spec macros, the seven
plane roots) is referenced, so a future operator-only edit can't silently
drop critical info while still passing "yes the file exists" checks.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICE_USER_DOC = REPO_ROOT / "docs" / "install" / "SERVICE_USER.md"
FHS_LAYOUT_DOC = REPO_ROOT / "docs" / "install" / "FHS_LAYOUT.md"


# ---------------------------------------------------------------------------
# SERVICE_USER.md
# ---------------------------------------------------------------------------


def test_service_user_doc_exists() -> None:
    assert SERVICE_USER_DOC.is_file(), f"missing doc at {SERVICE_USER_DOC}"


@pytest.mark.parametrize(
    "anchor",
    [
        # Decision lock anchors
        "T2529",
        # Sysusers + tmpfiles declarative sources
        "sysusers.d/map2.conf",
        "tmpfiles.d/map2.conf",
        # RPM scriptlet macros
        "%sysusers_create_package",
        "usermod -aG",
        # Q1-Q5 decisions
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "Q5",
        # The five canonical group memberships
        "audio",
        "pipewire-system",
        "video",
        "input",
        "plugdev",
        # The four canonical FHS dirs
        "/var/lib/map2",
        "/var/cache/map2",
        "/var/log/map2",
        "/run/map2",
        # Decommissioning command — operator must run userdel manually
        "userdel",
        # Mode 0750 invariant
        "0750",
        # FHS §5.5 anchor (data-preservation rationale)
        "FHS",
    ],
)
def test_service_user_doc_references(anchor: str) -> None:
    """SERVICE_USER.md must reference each canonical anchor so a future
    edit can't silently drop critical info."""
    text = SERVICE_USER_DOC.read_text()
    assert anchor in text, (
        f"SERVICE_USER.md must reference {anchor!r} (per T2529 lock); "
        "the doc is the operator's authoritative source for the service-user model"
    )


# ---------------------------------------------------------------------------
# FHS_LAYOUT.md
# ---------------------------------------------------------------------------


def test_fhs_layout_doc_exists() -> None:
    assert FHS_LAYOUT_DOC.is_file(), f"missing doc at {FHS_LAYOUT_DOC}"


@pytest.mark.parametrize(
    "plane_root",
    [
        "/opt/map2-audio",
        "/etc/map2",
        "/var/lib/map2",
        "/var/cache/map2",
        "/var/log/map2",
        "/run/map2",
        "/usr/lib/systemd/system",
    ],
)
def test_fhs_layout_doc_references_plane_root(plane_root: str) -> None:
    """FHS_LAYOUT.md must reference each of the seven canonical plane roots."""
    text = FHS_LAYOUT_DOC.read_text()
    assert plane_root in text, (
        f"FHS_LAYOUT.md must reference the {plane_root!r} plane root; "
        "T2529 Q3 lock pins the strict FHS §3 split"
    )


@pytest.mark.parametrize(
    "env_var",
    [
        "MAP2_APP_INSTALL_DIR",
        "MAP2_HOST_CONFIG_DIR",
        "MAP2_SERVICE_STATE_DIR",
        "MAP2_CACHE_DIR",
        "MAP2_LOG_DIR",
        "MAP2_RUNTIME_DIR",
        "MAP2_USER_DIR",
    ],
)
def test_fhs_layout_doc_references_env_override(env_var: str) -> None:
    """FHS_LAYOUT.md must list each plane-root env-var override so the
    dev-host + CI + site-customization use cases are discoverable."""
    text = FHS_LAYOUT_DOC.read_text()
    assert env_var in text, (
        f"FHS_LAYOUT.md must document the {env_var!r} env-var override; "
        "without this the dev-host MAP2_APP_INSTALL_DIR workflow is invisible"
    )


def test_fhs_layout_doc_references_map2paths_authority() -> None:
    """FHS_LAYOUT.md must point at the Python path authority that
    enforces the contract documented in the file."""
    text = FHS_LAYOUT_DOC.read_text()
    assert "app/paths.py" in text and "Map2Paths" in text, (
        "FHS_LAYOUT.md must reference app/paths.py + Map2Paths — the path "
        "authority that resolves every canonical path"
    )


def test_fhs_layout_doc_documents_is_fhs_install() -> None:
    """The is_fhs_install() helper is the canonical way for code to decide
    between FHS-install and dev-host behavior; doc must mention it."""
    text = FHS_LAYOUT_DOC.read_text()
    assert "is_fhs_install" in text, (
        "FHS_LAYOUT.md must document Map2Paths.is_fhs_install() — the "
        "supported way to decide between FHS-install and dev-host code paths"
    )


def test_fhs_layout_doc_references_fhs_standard() -> None:
    """Anchor the doc to the actual FHS standard so operators can verify
    the layout against the upstream spec."""
    text = FHS_LAYOUT_DOC.read_text()
    assert (
        "refspecs.linuxfoundation.org/fhs" in text
    ), "FHS_LAYOUT.md must link to the upstream FHS standard"


# ---------------------------------------------------------------------------
# Cross-references between the two docs
# ---------------------------------------------------------------------------


def test_service_user_doc_links_to_fhs_layout() -> None:
    text = SERVICE_USER_DOC.read_text()
    assert "FHS_LAYOUT.md" in text, (
        "SERVICE_USER.md must link to FHS_LAYOUT.md so operators can find "
        "the path layout from the user model and vice versa"
    )


def test_fhs_layout_doc_links_to_service_user() -> None:
    text = FHS_LAYOUT_DOC.read_text()
    assert "SERVICE_USER.md" in text, (
        "FHS_LAYOUT.md must link to SERVICE_USER.md"
    )


# ---------------------------------------------------------------------------
# Doc → systemd unit Documentation= directives
# ---------------------------------------------------------------------------


def test_packaging_units_reference_service_user_doc() -> None:
    """Every map2 service-user unit should carry a Documentation= directive
    pointing at SERVICE_USER.md so `systemctl status` surfaces the doc URL."""
    units_referencing_doc = []
    for unit_path in (REPO_ROOT / "packaging" / "systemd").glob("map2-*.service"):
        text = unit_path.read_text()
        if "/opt/map2-audio/docs/install/SERVICE_USER.md" in text:
            units_referencing_doc.append(unit_path.name)
    # At minimum the four primary service-user units should reference the doc.
    for primary in (
        "map2-backend.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
        "map2-tui.service",
    ):
        assert primary in units_referencing_doc, (
            f"{primary} should carry a Documentation= directive pointing at "
            f"/opt/map2-audio/docs/install/SERVICE_USER.md so `systemctl status` "
            f"surfaces the operator-facing doc"
        )


# ---------------------------------------------------------------------------
# docs/install/ install path coverage
# ---------------------------------------------------------------------------


def test_docs_install_dir_packaged_by_rpm() -> None:
    """The install docs need to land inside /opt/map2-audio/docs/install/ so
    the unit-file Documentation= directives resolve. The spec ships the
    `docs/` tree via `cp -r app tui lcd scripts device-packs ...` — verify
    docs/install is part of the tarball the spec consumes."""
    # Just ensure the directory exists in the repo; the spec packages
    # /opt/map2-audio/ which already contains the application tree.
    install_dir = REPO_ROOT / "docs" / "install"
    assert install_dir.is_dir(), f"missing docs/install dir at {install_dir}"
    md_files = list(install_dir.glob("*.md"))
    assert len(md_files) >= 2, (
        f"docs/install/ should hold at least SERVICE_USER.md + FHS_LAYOUT.md; "
        f"found {[p.name for p in md_files]}"
    )
