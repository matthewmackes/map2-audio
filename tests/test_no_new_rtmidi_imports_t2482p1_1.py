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
# have a comment explaining why. New entries require a matching
# deferral note in docs/architecture/.
#
# Iter 79 update: after iters 54-78 (loop 6 hard-strips + loop 8
# Maschine-flip + sysex_bridge / midi_hub / midi_engine hard-strips),
# rtmidi has moved from "production primary path" to "narrow secondary
# surface". Each remaining import has a specific scope documented
# below; none of these are dropable without a deeper refactor that
# exceeds SHIP loop 8's scope.
ALLOWED_RTMIDI_PATHS = {
    # Maschine MK1 daemon — Iter-76 flipped the primary path to the
    # controller-host's MidiCreateVirtualPortRequest IPC envelope.
    # rtmidi survives only as a fallback when the host's
    # create_virtual_port returns level=error (transitional CI / dev
    # flows). Drop in a future loop once a "raise on host-fail" mode
    # is acceptable for Maschine.
    "app/services/maschine/maschine_mk1_daemon.py",
    # GCP midi_transport — REMOVED FROM ALLOW-LIST in iter 82 (loop 9).
    # receive_sysex was refactored from rtmidi-polling to
    # MidiHostClient.subscribe()-based event-driven receive. Test
    # factory injection still works but no longer carries a rtmidi
    # fallback.
    # midi_hub/ports.py — REMOVED FROM ALLOW-LIST in iter 85 (loop 9).
    # AlsaMidiPort.open() / send / receive refactored to delegate to
    # MidiHostClient (open_midi_input + subscribe + send_short_message
    # / send_sysex). Per-port subscription buffers events in a deque
    # the receive() drain reads. dispose_rtmidi_client also removed.
    # midi_engine.py — REMOVED FROM ALLOW-LIST in iter 83 (loop 9).
    # Both the rtmidi-direct discovery branch AND the persistent
    # _midi_in / _midi_out for live MIDI binding were stripped.
    # Production live MIDI flows through MidiHub (host-routed via
    # iter 78) or falls to virtual placeholder when MidiHub disabled.
    # midi_sysex_bridge_base.py — REMOVED FROM ALLOW-LIST in iter 84
    # (loop 9). build_midi_sysex_runtime no longer imports rtmidi;
    # IntelFX + MPX-1 production MIDI routes through the
    # controller-host (iter-77 sysex_device_bridge enumeration +
    # iter-83 midi_engine binding). Simulator path unchanged.
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
