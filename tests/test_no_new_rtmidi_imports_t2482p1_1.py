"""T2482-P1.1 Gap E phase 9 (iter 59) → loop 9 / iter 88 — CI grep-fail guard.

Pins the post-loop-9 contract: ZERO `import rtmidi` lines in app/.

Original (iter 59) shape: a 5-entry allow-list of files that still
needed rtmidi after loop 6's lenient-mode soft-strips. SHIP loop 9
(iters 81-86) hard-stripped each of those 5 surfaces by porting them
to MidiHostClient; SHIP loop 9 / iter 87 then dropped python-rtmidi
from `requirements-backend-runtime.txt` entirely. iter 88 locks the
empty contract: no `import rtmidi` anywhere in `app/` — period. New
imports anywhere fail this test immediately so a regression cannot
silently bring rtmidi back.

If a future surface genuinely needs rtmidi again (e.g., a
hardware-only diagnostic CLI that doesn't fit the controller-host
model), update this allow-list AND add a deferral note in
docs/architecture/.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"

# T2482 loop 9 / iter 88: empty allow-list. Maintained as the
# explicit "no exceptions" contract — loop 9 (iters 81-86) ported
# every previous entry to host-routed equivalents; iter 87 dropped
# the python-rtmidi dep from the runtime requirements file.
#
# Historical entries (each removed in the named iter):
# - app/services/maschine/maschine_mk1_daemon.py  (iter 86)
# - app/services/ground_control_pro/midi_transport.py  (iter 82)
# - app/services/midi_hub/ports.py  (iter 85)
# - app/services/midi_engine.py  (iter 83)
# - app/services/midi_sysex_bridge_base.py  (iter 84)
ALLOWED_RTMIDI_PATHS: set[str] = set()


_RTMIDI_IMPORT_RE = re.compile(r"^\s*(import\s+rtmidi|from\s+rtmidi\s+import)", re.M)


class NoRtmidiImportsTests(unittest.TestCase):
    def test_zero_rtmidi_imports_in_app(self) -> None:
        """Locks the iter-88 contract: NO `import rtmidi` in app/.

        Allow-list is empty; any match is a regression. Iter-87
        already removed python-rtmidi from requirements, so a stray
        new import would fail at install/runtime — this test catches
        it earlier (at PR review).
        """
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
                "NEW rtmidi import detected after the iter-88 hard-strip. "
                "Files: " + ", ".join(sorted(offenders)) + ". "
                "python-rtmidi was dropped from requirements in iter 87 "
                "and the project no longer depends on it. If a new "
                "rtmidi dependency is genuinely required, both: (a) add "
                "the path to ALLOWED_RTMIDI_PATHS in this test with a "
                "deferral note explaining why; and (b) restore the "
                "python-rtmidi line in requirements-backend-runtime.txt."
            )

    def test_allow_list_remains_empty(self) -> None:
        """Pin the contract: ALLOWED_RTMIDI_PATHS must be empty.

        If a future change adds a path here, the doc-string above
        mandates a deferral note. This test prevents the allow-list
        from silently growing.
        """
        self.assertEqual(
            ALLOWED_RTMIDI_PATHS, set(),
            "Iter 88 locked ALLOWED_RTMIDI_PATHS = set(). Adding a path "
            "here requires explicit operator approval + a deferral note "
            "in docs/architecture/."
        )

    def test_python_rtmidi_not_in_requirements(self) -> None:
        """python-rtmidi was dropped from requirements in iter 87.

        This test ensures it doesn't sneak back in via a future
        regression. The line `python-rtmidi>=...` would re-introduce
        the runtime dep that loop 9 worked to remove.
        """
        req_file = REPO_ROOT / "requirements-backend-runtime.txt"
        text = req_file.read_text(encoding="utf-8")
        # Search for the actual install spec, not historical comments.
        # An install line starts at column 0 with the package name.
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") or not stripped:
                continue
            self.assertFalse(
                stripped.startswith("python-rtmidi"),
                f"python-rtmidi reintroduced in {req_file.name}: {line!r}. "
                "Iter 87 removed it after the loop-9 hard-strips. If a new "
                "rtmidi-dependent surface genuinely exists, update this "
                "test + the iter-88 allow-list together."
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
