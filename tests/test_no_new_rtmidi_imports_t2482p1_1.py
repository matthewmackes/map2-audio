"""T2482-P1.1 Gap E phase 9 (iter 59) — CI grep-fail guard.

Pins the consumer-by-consumer rtmidi-strip results from iters 54-58.
Any new `import rtmidi` or `from rtmidi import ...` line under
``app/`` MUST be in the Maschine carve-out
(`app/services/maschine/`) — the only place python-rtmidi is still
on the critical path. New imports anywhere else fail this test
immediately so the rtmidi removal can't silently regress.

Once the P1.2 follow-up adds `MidiCreateVirtualPortRequest` to the
controller-host IPC schema, the Maschine carve-out can be removed
and python-rtmidi dropped from `requirements-backend-runtime.txt`.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"

# Files in app/ that are PERMITTED to import rtmidi. Each entry must
# have a comment in this file explaining why. New entries require a
# matching deferral note in docs/architecture/.
ALLOWED_RTMIDI_PATHS = {
    # Maschine MK1 daemon — virtual-port creation requires rtmidi
    # until MidiCreateVirtualPortRequest IPC envelope lands (P1.2
    # follow-up). See docs/architecture/T2482_P1_1_MASCHINE_RTMIDI_DEFERRAL.md.
    "app/services/maschine/maschine_mk1_daemon.py",
    # Per-consumer transports that retain rtmidi as a lenient-mode
    # fallback after iters 54-58. These will lose their rtmidi
    # imports in the post-loop-6 hard-strip cycle.
    "app/services/ground_control_pro/midi_transport.py",  # iter 54
    "app/services/midi_hub/ports.py",                     # iter 57
    "app/services/midi_engine.py",                        # iter 58
    # Bridge base used by IntelFX + MPX-1 simulator path.
    "app/services/midi_sysex_bridge_base.py",
}


_RTMIDI_IMPORT_RE = re.compile(r"^\s*(import\s+rtmidi|from\s+rtmidi\s+import)", re.M)


class NoNewRtmidiImportsTests(unittest.TestCase):
    def test_no_unexpected_rtmidi_imports(self) -> None:
        """Find every rtmidi import in app/ and ensure each is allow-listed."""
        offenders: list[str] = []
        for py_file in APP_DIR.rglob("*.py"):
            if "__pycache__" in py_file.parts:
                continue
            text = py_file.read_text(encoding="utf-8", errors="replace")
            if not _RTMIDI_IMPORT_RE.search(text):
                continue
            rel = str(py_file.relative_to(REPO_ROOT))
            if rel not in ALLOWED_RTMIDI_PATHS:
                offenders.append(rel)
        if offenders:
            self.fail(
                "New rtmidi imports detected outside the iter-59 allow-list. "
                "Files: " + ", ".join(sorted(offenders)) + ". "
                "If a new rtmidi dependency is required, add the path to "
                "ALLOWED_RTMIDI_PATHS in this test AND a deferral note in "
                "docs/architecture/T2482_P1_1_RTMIDI_REMOVAL_READINESS.md."
            )

    def test_allow_list_entries_are_real_files(self) -> None:
        """Sanity check — every allow-list entry must point to a real file."""
        for rel in ALLOWED_RTMIDI_PATHS:
            path = REPO_ROOT / rel
            self.assertTrue(
                path.exists(),
                f"Allow-list entry points to a non-existent file: {rel}. "
                "Either restore the file or remove the entry.",
            )

    def test_allow_list_entries_actually_import_rtmidi(self) -> None:
        """No stale entries — every allow-list path must currently import rtmidi.

        Catches the case where a file was rtmidi-stripped but its allow-list
        entry was never removed. Stale allow-list entries hide future
        regressions.
        """
        stale: list[str] = []
        for rel in ALLOWED_RTMIDI_PATHS:
            path = REPO_ROOT / rel
            if not path.exists():
                continue  # caught by the previous test
            text = path.read_text(encoding="utf-8", errors="replace")
            if not _RTMIDI_IMPORT_RE.search(text):
                stale.append(rel)
        if stale:
            self.fail(
                "Allow-list contains paths that no longer import rtmidi: "
                + ", ".join(sorted(stale))
                + ". Remove these from ALLOWED_RTMIDI_PATHS to keep the guard tight."
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
