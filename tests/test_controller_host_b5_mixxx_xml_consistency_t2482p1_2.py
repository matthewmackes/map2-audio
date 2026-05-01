"""T2482-P1.2 Gap D (iter 67) — Mixxx XML import consistency check.

Companion to test_controller_host_b5_golden_t2482p1_2.py. The B5
golden test replays a STATIC fixture against the daemon. This test
parses the SAME Mixxx XML the fixture was derived from and verifies
the static fixture's descriptor matches what
mixxx_xml_reader.parse_mixxx_xml produces for the same control
indices.

Failing this test = the static fixture is drifting from the live
parser output (e.g., parser fix changed the field shape; fixture
needs re-recording).
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.services.controllers.mixxx_xml_reader import parse_mixxx_xml


REPO_ROOT = Path(__file__).resolve().parents[1]
MIXXX_XML = (
    REPO_ROOT / "device-packs" / "_mixx-imports" / "res" / "controllers"
    / "Akai-LPD8-RK.midi.xml"
)
FIXTURE = (
    REPO_ROOT / "tests" / "fixtures" / "controller_host_b5"
    / "mixxx_xml_imported_descriptor.fixture.json"
)


@unittest.skipUnless(MIXXX_XML.exists(),
                      f"Mixxx XML missing: {MIXXX_XML}")
class MixxxXmlConsistencyTests(unittest.TestCase):
    def setUp(self) -> None:
        self._fixture = json.loads(FIXTURE.read_text())
        self._result = parse_mixxx_xml(MIXXX_XML, pack_id="akai-lpd8-rk")

    def test_pack_id_and_model_match(self) -> None:
        desc = self._fixture["descriptor"]
        live = self._result.descriptor
        self.assertEqual(desc["pack_id"], live.pack_id)
        self.assertEqual(desc["model"], live.model)
        self.assertEqual(desc["kind"], live.kind)

    def test_first_two_controls_match_live_parse(self) -> None:
        # The fixture's controls[] is a 2-row subset matching the first
        # two rows of the real parse. If the parser's field shape
        # changes for status/midino/script/description, this test fails
        # immediately.
        live_controls = self._result.descriptor.controls
        self.assertGreaterEqual(len(live_controls), 2,
                                  "live parse should produce >= 2 controls")
        for i, fixture_ctrl in enumerate(self._fixture["descriptor"]["controls"]):
            live_ctrl = live_controls[i]
            self.assertEqual(fixture_ctrl["status"], live_ctrl.status,
                              f"control {i}: status mismatch")
            self.assertEqual(fixture_ctrl["midino"], live_ctrl.midino,
                              f"control {i}: midino mismatch")
            self.assertEqual(fixture_ctrl["script"], live_ctrl.script,
                              f"control {i}: script mismatch")
            self.assertEqual(fixture_ctrl["description"], live_ctrl.description,
                              f"control {i}: description mismatch")

    def test_live_parse_resolves_all_controls(self) -> None:
        # Per iter-65's fixture provenance comment, the LPD8 XML has
        # 132 controls. Pin that count so a future XML edit doesn't
        # silently drift the count.
        self.assertEqual(self._result.stats.total_controls, 132)
        self.assertEqual(self._result.stats.resolved_controls, 132)
        self.assertEqual(self._result.stats.skipped_controls, 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
