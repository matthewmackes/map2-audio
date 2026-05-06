"""T2459-H4 slice 10 — Maschine MK1 module-inventory regression guard.

Pins the per-module classification documented in
``docs/midi/MASCHINE_MK1_HID_MIGRATION.md``. When a future commit:

  1. adds a new ``.py`` file to ``app/services/maschine/``, OR
  2. removes a module currently classified as "Stays Python", OR
  3. removes ``mk1_usb_transport.py`` *before* the slice-18 deletion
     PR has flipped the EXPECTED constants below,

…this test fails and forces the operator to either update the audit
doc + this constants table, or to open the deletion PR proper.

The intent is to make "did this module migration have a plan?" gate
impossible to forget on T2459-H4 follow-up slices.
"""

from __future__ import annotations

import pathlib

MASCHINE_DIR = (
    pathlib.Path(__file__).resolve().parent.parent
    / "app"
    / "services"
    / "maschine"
)

# Modules that survive the H4 migration (classification: "Stays Python"
# in MASCHINE_MK1_HID_MIGRATION.md §1).
EXPECTED_STAY_PYTHON: frozenset[str] = frozenset({
    "__init__.py",
    "maschine_mk1_daemon.py",
    "transport.py",
    "led_animations.py",
    "led_choreography.py",
    "admin_console.py",
    "boot_sequence.py",
    "shutdown_sequence.py",
    "incident_log.py",
    "long_op_feedback.py",
    "screensaver.py",
    "onboarding.py",
    "midi_map_config.py",
    # T2459-H4 slice 11 — the new host-client facade is the
    # replacement for mk1_usb_transport.py once slice 18 deletes
    # the legacy direct-USB path.
    "mk1_host_client_transport.py",
})

# Modules that get retired by the slice-18 deletion PR. While each
# remains on disk, this set documents the migration target. Once the
# deletion PR lands, drop the entry from this set; the audit test
# detects the deletion and the worklist completion note for slice 18
# captures the closeout.
EXPECTED_RETIRE: frozenset[str] = frozenset({
    "mk1_usb_transport.py",
})

# Modules that move host-side. Same lifecycle as EXPECTED_RETIRE: drop
# from the set when the file is removed from app/services/maschine/.
EXPECTED_MOVE_TO_HOST: frozenset[str] = frozenset({
    "mk1_protocol.py",
})

# Subdirectories that the audit walks but doesn't enforce per-file —
# their contents are render-side and stay Python.
EXPECTED_SUBDIRS: frozenset[str] = frozenset({
    "render",
    "fonts",
    "profiles",
})


def _classified_modules() -> frozenset[str]:
    return EXPECTED_STAY_PYTHON | EXPECTED_RETIRE | EXPECTED_MOVE_TO_HOST


def _on_disk_top_level_modules() -> set[str]:
    return {p.name for p in MASCHINE_DIR.iterdir() if p.is_file() and p.suffix == ".py"}


def _on_disk_subdirs() -> set[str]:
    return {p.name for p in MASCHINE_DIR.iterdir() if p.is_dir() and not p.name.startswith("__")}


def test_every_top_level_module_is_classified() -> None:
    """A new .py in app/services/maschine/ that lacks a classification
    in the audit doc fails this test."""
    on_disk = _on_disk_top_level_modules()
    classified = _classified_modules()
    unclassified = on_disk - classified
    assert unclassified == set(), (
        f"New maschine modules without a classification in "
        f"docs/midi/MASCHINE_MK1_HID_MIGRATION.md §1: {sorted(unclassified)}. "
        f"Add them to EXPECTED_STAY_PYTHON, EXPECTED_RETIRE, or "
        f"EXPECTED_MOVE_TO_HOST in this audit test."
    )


def test_classified_modules_exist_on_disk() -> None:
    """A module name in any EXPECTED set that no longer exists on disk
    forces a deliberate audit-doc + EXPECTED-set update."""
    on_disk = _on_disk_top_level_modules()
    expected = _classified_modules()
    missing = expected - on_disk
    assert missing == set(), (
        f"Classified modules missing from disk (deletion may have "
        f"happened ahead of slice 18): {sorted(missing)}. "
        f"Update the EXPECTED_* set + the audit doc accordingly."
    )


def test_stays_python_modules_present() -> None:
    """Pin every "stays Python" module so a future commit can't quietly
    delete a daemon / render / admin module."""
    on_disk = _on_disk_top_level_modules()
    missing = EXPECTED_STAY_PYTHON - on_disk
    assert missing == set(), (
        f"Modules expected to stay Python but missing from disk: "
        f"{sorted(missing)}. If this is a deliberate retirement, "
        f"update both this test and MASCHINE_MK1_HID_MIGRATION.md §1."
    )


def test_subdirectory_layout_matches_audit() -> None:
    """The render/fonts/profiles subdirs are render-side and pinned by
    the audit. A new sibling subdir flags an architecture change."""
    on_disk = _on_disk_subdirs()
    expected = EXPECTED_SUBDIRS
    missing = expected - on_disk
    assert missing == set(), (
        f"Expected subdirectories missing from app/services/maschine/: "
        f"{sorted(missing)}"
    )
    extra = on_disk - expected
    assert extra == set(), (
        f"New subdirectories under app/services/maschine/ that aren't "
        f"in the audit doc: {sorted(extra)}. Update EXPECTED_SUBDIRS + "
        f"MASCHINE_MK1_HID_MIGRATION.md §1."
    )


def test_audit_doc_exists() -> None:
    """The audit doc is the canonical reference for this test; if a
    cleanup script ever deletes it, fail loudly."""
    doc = (
        pathlib.Path(__file__).resolve().parent.parent
        / "docs"
        / "midi"
        / "MASCHINE_MK1_HID_MIGRATION.md"
    )
    assert doc.exists(), (
        f"Migration audit doc missing: {doc}. The audit-test guard "
        f"can't function without it."
    )


def test_retirement_target_still_exists_pre_slice_18() -> None:
    """Slice 18 deletes mk1_usb_transport.py. While the migration is
    in progress, the file MUST still be on disk — its absence means
    either slice 18 has shipped (in which case update EXPECTED_RETIRE)
    or someone deleted it accidentally."""
    transport = MASCHINE_DIR / "mk1_usb_transport.py"
    assert transport.exists(), (
        "mk1_usb_transport.py is missing. If slice 18 has shipped, "
        "drop the entry from EXPECTED_RETIRE in this audit test and "
        "update the migration-doc Status line."
    )
