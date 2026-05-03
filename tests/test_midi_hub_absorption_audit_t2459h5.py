"""T2459-H5 Slice 14 — MIDI Hub absorption audit doc coverage gate.

Asserts the audit doc enumerates every module under
`app/services/midi_hub/`. Without this gate, a new module added to
the hub would silently miss the absorption decision and the next
H5 slice would have to re-audit from scratch.
"""

from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HUB_DIR = REPO_ROOT / "app" / "services" / "midi_hub"
AUDIT_DOC = REPO_ROOT / "docs" / "midi" / "MIDI_HUB_ABSORPTION_AUDIT.md"


def _module_basenames() -> set[str]:
    """Module *basenames* (without extension) in app/services/midi_hub/."""
    return {p.stem for p in HUB_DIR.glob("*.py") if p.is_file()}


def test_audit_doc_exists() -> None:
    assert AUDIT_DOC.is_file(), f"missing audit doc at {AUDIT_DOC}"


def test_audit_doc_mentions_every_hub_module() -> None:
    text = AUDIT_DOC.read_text(encoding="utf-8")
    missing: list[str] = []
    for stem in sorted(_module_basenames()):
        # Match either the bare basename in a backtick or a `.py`
        # suffix; tolerate the audit pinning either form.
        bare = re.search(rf"`{re.escape(stem)}\.py`", text)
        if bare is None:
            bare = re.search(rf"`{re.escape(stem)}`", text)
        if bare is None:
            missing.append(stem)
    assert not missing, (
        "MIDI Hub absorption audit must enumerate every module under "
        "app/services/midi_hub/. Add the following to "
        "docs/midi/MIDI_HUB_ABSORPTION_AUDIT.md with a "
        "Python-stays / Host-eligible / Hardware-bound classification: "
        f"{missing}"
    )


def test_audit_doc_has_classification_summary_table() -> None:
    """The doc has a summary table with counts per classification.
    Pin the section header so a future PR doesn't accidentally drop
    it during a wholesale rewrite."""
    text = AUDIT_DOC.read_text(encoding="utf-8")
    assert "## Summary" in text, "audit must keep the Summary section"
    assert "Host-eligible" in text
    assert "Python stays" in text


def test_audit_doc_links_to_canonical_references() -> None:
    """Audit must cross-reference the canonical artifacts so future
    H5 slices know where to update next."""
    text = AUDIT_DOC.read_text(encoding="utf-8")
    assert "PROJECT_WORKLIST.md" in text
    assert "MIDI_BACKEND.md" in text
    assert "CLUSTER_MIDI_PROTOCOL.md" in text
    assert "MAP2MIDICONTROLLER_RETIREMENT.md" in text
