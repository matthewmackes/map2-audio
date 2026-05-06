"""T2459-H4 slice 16 — Maschine MK1 transport caller-audit pin.

Pins every load-bearing reference to ``mk1_usb_transport`` in the
repo so the slice-18 deletion PR can land without missing call
sites. The audit doc (``MASCHINE_MK1_HID_MIGRATION.md`` §2)
enumerates the surfaces; this test enforces that enumeration.

Coverage strategy:
  - The daemon's reference is the **load-bearing** site that
    determines whether the legacy direct-USB path runs in
    production. Slice 18 deletes it.
  - Bench scripts in ``scripts/`` keep their direct USB access
    because they are operator-driven diagnostic tools, NOT part of
    the daemon's runtime path. They survive slice 18.
  - No tests should import the legacy transport directly.

If the audit drifts (e.g., a new app/services/* file adds a
`from app.services.maschine.mk1_usb_transport import ...`) this
test fails and forces a deliberate update.
"""

from __future__ import annotations

import pathlib
import re


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

# These directories are out-of-scope for the caller audit (they're
# shadow copies / generated artefacts, not authoring surfaces).
EXCLUDE_PREFIXES = (
    ".claude/worktrees/",
    "node_modules/",
    "build/",
    "dist/",
    "web/dist/",
)

# Caller classification — pinned by MASCHINE_MK1_HID_MIGRATION.md §2.
EXPECTED_DAEMON_CALLERS = {
    "app/services/maschine/maschine_mk1_daemon.py",
}
EXPECTED_BENCH_SCRIPTS = {
    "scripts/maschine_drain_test.py",
    "scripts/maschine_lcd_test.py",
    "scripts/maschine_led_input_mapper.py",
    "scripts/maschine_led_slot_walk.py",
    "scripts/maschine_led_walk.py",
    "scripts/maschine_phase1_verify.py",
    "scripts/maschine_probe.py",
    "scripts/maschine_render_bench.py",
    "scripts/maschine_roundrobin_test.py",
    "scripts/maschine_two_packet_test.py",
    "scripts/maschine_unused_slot_test.py",
    "scripts/maschine_unwedge_test.py",
}
# Test files that legitimately import the legacy transport for
# surface-parity assertions. Each one drives the slice-11/12
# regression guards; they survive slice 18 (the deletion PR will
# update them in the same atomic commit).
EXPECTED_PARITY_TESTS = {
    "tests/test_maschine_mk1_daemon_transport_factory_t2459h4.py",
    "tests/test_maschine_mk1_host_client_transport_t2459h4.py",
}


def _excluded(rel: str) -> bool:
    return any(rel.startswith(p) for p in EXCLUDE_PREFIXES)


def _find_imports() -> dict[str, list[str]]:
    """Walk the repo and group `from app.services.maschine.mk1_usb_transport`
    importer paths into the audit categories."""
    pattern = re.compile(
        r"^\s*from\s+app\.services\.maschine\.mk1_usb_transport\s+import",
        re.MULTILINE,
    )
    found: list[str] = []
    for path in REPO_ROOT.rglob("*.py"):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _excluded(rel):
            continue
        # Don't include the module itself.
        if rel == "app/services/maschine/mk1_usb_transport.py":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if pattern.search(text):
            found.append(rel)
    return {"daemon": [p for p in found if p in EXPECTED_DAEMON_CALLERS],
            "bench":  [p for p in found if p in EXPECTED_BENCH_SCRIPTS],
            "parity_tests": [p for p in found if p in EXPECTED_PARITY_TESTS],
            "other":  [p for p in found
                       if p not in EXPECTED_DAEMON_CALLERS
                       and p not in EXPECTED_BENCH_SCRIPTS
                       and p not in EXPECTED_PARITY_TESTS]}


def test_no_unaudited_callers_exist():
    """A new `from app.services.maschine.mk1_usb_transport import ...`
    in a path outside the audited set fails this test."""
    grouped = _find_imports()
    assert grouped["other"] == [], (
        "Unaudited importers of mk1_usb_transport: "
        f"{sorted(grouped['other'])}. Either add them to "
        "EXPECTED_DAEMON_CALLERS / EXPECTED_BENCH_SCRIPTS in this "
        "audit test (with a justification in MASCHINE_MK1_HID_MIGRATION.md "
        "§2) or remove the import."
    )


def test_daemon_caller_present_until_slice_18():
    """The daemon currently imports the legacy transport — that's the
    site slice 18 deletes. While the migration is in progress, this
    file MUST stay in EXPECTED_DAEMON_CALLERS."""
    grouped = _find_imports()
    assert "app/services/maschine/maschine_mk1_daemon.py" in grouped["daemon"], (
        "Daemon's import of mk1_usb_transport is missing — if slice 18 "
        "has shipped, drop the entry from EXPECTED_DAEMON_CALLERS in "
        "this test, drop the EXPECTED_RETIRE entry in "
        "test_maschine_mk1_module_inventory_t2459h4.py, and update "
        "MASCHINE_MK1_HID_MIGRATION.md §2 + §3."
    )


def test_bench_scripts_pinned_inventory():
    """Bench scripts that talk to USB directly survive slice 18 — pin
    their inventory so a later cleanup can't quietly delete one."""
    grouped = _find_imports()
    on_disk_bench = set(grouped["bench"])
    expected = EXPECTED_BENCH_SCRIPTS
    missing = expected - on_disk_bench
    extra = on_disk_bench - expected
    assert missing == set(), (
        f"Bench scripts in audit but missing on disk: {sorted(missing)}"
    )
    assert extra == set(), (
        f"Bench scripts on disk but not in audit: {sorted(extra)}. "
        f"Add to EXPECTED_BENCH_SCRIPTS or remove the import."
    )


def test_audit_doc_lists_caller_audit_section():
    """The audit doc must keep §2 'Caller audit' so this test's premise
    has a documentation anchor."""
    doc = REPO_ROOT / "docs" / "midi" / "MASCHINE_MK1_HID_MIGRATION.md"
    assert doc.exists()
    text = doc.read_text()
    assert "## 2. Caller audit" in text, "Audit doc §2 missing"


def test_load_bearing_call_sites_pinned_in_daemon():
    """The audit doc enumerates the daemon's three load-bearing call
    sites. Pin them as greppable strings so a refactor doesn't quietly
    relocate them."""
    daemon = (
        REPO_ROOT / "app" / "services" / "maschine" / "maschine_mk1_daemon.py"
    )
    text = daemon.read_text()
    # The factory still references the legacy class until slice 18.
    assert "MaschineMK1UsbTransport(" in text or "MaschineMK1UsbTransport |" in text, (
        "Daemon dropped its MaschineMK1UsbTransport reference — if "
        "slice 18 has shipped, update this audit test."
    )
    # The factory MUST still import + use the host-client facade.
    assert "MaschineMK1HostClientTransport" in text
    # The factory entry point.
    assert "_build_maschine_mk1_transport(" in text


def test_parity_tests_pinned():
    """Test files that legitimately import the legacy transport for
    surface-parity assertions stay pinned until slice 18 deletes the
    transport (and updates these tests in the same atomic commit)."""
    grouped = _find_imports()
    on_disk = set(grouped["parity_tests"])
    assert on_disk == EXPECTED_PARITY_TESTS, (
        f"Parity-test inventory drifted: expected {sorted(EXPECTED_PARITY_TESTS)}, "
        f"got {sorted(on_disk)}"
    )


def test_total_caller_count_pinned():
    """Total importers of mk1_usb_transport on master is
    1 daemon + 12 bench scripts + 2 parity tests = 15. Pin so a
    deviation forces a deliberate audit update."""
    grouped = _find_imports()
    total = (
        len(grouped["daemon"])
        + len(grouped["bench"])
        + len(grouped["parity_tests"])
        + len(grouped["other"])
    )
    assert total == 15, (
        f"Expected 15 mk1_usb_transport importers (1 daemon + 12 bench + "
        f"2 parity tests); saw {total}: daemon={grouped['daemon']} "
        f"bench={sorted(grouped['bench'])} "
        f"parity_tests={sorted(grouped['parity_tests'])} "
        f"other={sorted(grouped['other'])}"
    )
