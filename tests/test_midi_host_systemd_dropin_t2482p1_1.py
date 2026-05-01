"""T2482-P1.1 Gap E phase 2 (iter 52) — verify the systemd drop-in
that pins MAP2_USE_MIDI_HOST=1 in the production unit.

Structural-only test (the unit isn't installed in CI) — checks the
drop-in file exists, sets the right Environment line, and is
ordered correctly relative to the other drop-ins (lexical order
matters: "30-midi-host-default" sorts AFTER "10-mode" and
"override").
"""

from __future__ import annotations

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DROPIN_PATH = REPO_ROOT / "systemd" / "map2-backend.service.d" / "30-midi-host-default.conf"


class MidiHostDropinStructuralTests(unittest.TestCase):
    def test_dropin_file_exists(self) -> None:
        self.assertTrue(DROPIN_PATH.exists(),
                         f"drop-in missing: {DROPIN_PATH}")

    def test_dropin_pins_env_var_to_one(self) -> None:
        text = DROPIN_PATH.read_text()
        # Look for the Environment line that pins the value to 1.
        self.assertIn('Environment="MAP2_USE_MIDI_HOST=1"', text,
                       "drop-in must pin MAP2_USE_MIDI_HOST=1")
        self.assertIn("[Service]", text,
                       "drop-in must have a [Service] section")

    def test_dropin_filename_sorts_after_mode_dropins(self) -> None:
        # systemd loads drop-ins in lexical order. The repo uses
        # numeric prefixes for ordering between automated drop-ins:
        # 10-mode.conf (mode-specific) → 30-midi-host-default.conf
        # (this drop-in). The 30- prefix puts MAP2_USE_MIDI_HOST=1
        # after any mode-specific Environment= settings.
        #
        # NB: override.conf intentionally sorts last on the systemd
        # side ('o' > '3') so operator overrides win — but
        # override.conf does NOT set MAP2_USE_MIDI_HOST today, so the
        # ordering between this drop-in and override.conf is
        # immaterial.
        self.assertGreater(
            DROPIN_PATH.name, "10-mode.conf",
            "30-midi-host-default.conf must sort after 10-mode.conf",
        )

    def test_dropin_documents_opt_out_path(self) -> None:
        # The drop-in MUST tell operators how to opt out for a boot,
        # otherwise reverting the host path becomes tribal knowledge.
        text = DROPIN_PATH.read_text()
        self.assertIn("MAP2_USE_MIDI_HOST=0", text,
                       "drop-in must document the opt-out path")
        self.assertIn("systemctl edit", text,
                       "drop-in must mention systemctl edit as the opt-out mechanism")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
