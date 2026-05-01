"""T2482-P1.2 Gap F.1 (iter 62) — new IPC envelopes coverage.

Pins the wire-form contract for the 3 new envelopes added in iter 62:
- MappingDeactivate (inbound)
- MappingReload (inbound)
- EventFeedback (outbound)

The corresponding C++ struct mirrors land in iter 63 with a
schema-sync test that ensures both sides stay in lockstep.
"""

from __future__ import annotations

import unittest

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    EventFeedback,
    FIELD_MANIFEST,
    MappingDeactivate,
    MappingDescriptorPayload,
    MappingReload,
    decode_frame,
    encode_frame,
)


class SchemaVersionBumpTests(unittest.TestCase):
    def test_schema_version_is_at_least_2(self) -> None:
        # Iter 62 bumped the version from 1 → 2 to mark the additive
        # F.1 envelope addition. Assert >= so a future bump doesn't
        # break this test.
        self.assertGreaterEqual(SCHEMA_VERSION, 2)


class MappingDeactivateTests(unittest.TestCase):
    def test_required_fields(self) -> None:
        msg: MappingDeactivate = {
            "type": "mapping_deactivate",
            "msg_id": "abc",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "voodoo-lab.gcp",
        }
        self.assertEqual(msg["type"], "mapping_deactivate")
        self.assertEqual(msg["controller_key"], "voodoo-lab.gcp")

    def test_round_trip_through_encode_decode(self) -> None:
        msg: MappingDeactivate = {
            "type": "mapping_deactivate",
            "msg_id": "xyz",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "lexicon.mpx1",
        }
        decoded, rest = decode_frame(encode_frame(msg))
        self.assertEqual(rest, b"")
        assert decoded is not None
        self.assertEqual(decoded["type"], "mapping_deactivate")
        self.assertEqual(decoded["controller_key"], "lexicon.mpx1")
        self.assertEqual(decoded["schema_version"], SCHEMA_VERSION)

    def test_field_manifest_lists_envelope(self) -> None:
        self.assertIn("MappingDeactivate", FIELD_MANIFEST)
        fields = FIELD_MANIFEST["MappingDeactivate"]
        self.assertIn("type", fields)
        self.assertIn("msg_id", fields)
        self.assertIn("schema_version", fields)
        self.assertIn("controller_key", fields)


class MappingReloadTests(unittest.TestCase):
    def _sample_descriptor(self) -> MappingDescriptorPayload:
        return MappingDescriptorPayload(
            pack_id="lexicon",
            model="mpx1",
            kind="midi",
            scripts=[],
            controls=[],
            outputs=[],
            settings=[],
            mixxx_alias_table={},
        )

    def test_required_fields(self) -> None:
        msg: MappingReload = {
            "type": "mapping_reload",
            "msg_id": "reload-1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "lexicon.mpx1",
            "descriptor": self._sample_descriptor(),
        }
        self.assertEqual(msg["descriptor"]["pack_id"], "lexicon")
        self.assertEqual(msg["descriptor"]["model"], "mpx1")

    def test_round_trip_preserves_descriptor_shape(self) -> None:
        msg: MappingReload = {
            "type": "mapping_reload",
            "msg_id": "reload-2",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "rocktron.intelfx",
            "descriptor": MappingDescriptorPayload(
                pack_id="rocktron",
                model="intelfx",
                kind="midi",
                scripts=["intelfx.js"],
                controls=[],
                outputs=[],
                settings=[],
                mixxx_alias_table={},
            ),
        }
        decoded, rest = decode_frame(encode_frame(msg))
        self.assertEqual(rest, b"")
        assert decoded is not None
        self.assertEqual(decoded["type"], "mapping_reload")
        self.assertEqual(decoded["descriptor"]["pack_id"], "rocktron")
        self.assertEqual(decoded["descriptor"]["scripts"], ["intelfx.js"])

    def test_field_manifest_lists_envelope(self) -> None:
        self.assertIn("MappingReload", FIELD_MANIFEST)
        fields = FIELD_MANIFEST["MappingReload"]
        self.assertIn("descriptor", fields)


class EventFeedbackTests(unittest.TestCase):
    def test_minimal_required_fields(self) -> None:
        msg: EventFeedback = {
            "type": "event_feedback",
            "msg_id": "ef-1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "voodoo-lab.gcp",
            "stage": "received",
            "timestamp_ns": 1234567890,
        }
        self.assertEqual(msg["stage"], "received")
        self.assertEqual(msg["timestamp_ns"], 1234567890)

    def test_all_stages_round_trip(self) -> None:
        for stage in ("received", "matched", "dispatched", "drained"):
            msg: EventFeedback = {
                "type": "event_feedback",
                "msg_id": f"ef-{stage}",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-A",
                "stage": stage,
                "timestamp_ns": 100,
            }
            decoded, _ = decode_frame(encode_frame(msg))
            assert decoded is not None
            self.assertEqual(decoded["stage"], stage)

    def test_optional_fields_round_trip(self) -> None:
        msg: EventFeedback = {
            "type": "event_feedback",
            "msg_id": "ef-full",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "ctrl-B",
            "stage": "drained",
            "timestamp_ns": 999,
            "detail": "callback returned cleanly",
            "inbound_bytes": [0xB0, 0x07, 0x40],
            "callback_name": "MPX1.bypass_toggle",
            "engine_command_count": 2,
            "outbound_short_count": 1,
            "outbound_sysex_count": 0,
        }
        decoded, _ = decode_frame(encode_frame(msg))
        assert decoded is not None
        self.assertEqual(decoded["detail"], "callback returned cleanly")
        self.assertEqual(decoded["inbound_bytes"], [0xB0, 0x07, 0x40])
        self.assertEqual(decoded["callback_name"], "MPX1.bypass_toggle")
        self.assertEqual(decoded["engine_command_count"], 2)
        self.assertEqual(decoded["outbound_short_count"], 1)
        self.assertEqual(decoded["outbound_sysex_count"], 0)

    def test_field_manifest_lists_envelope(self) -> None:
        self.assertIn("EventFeedback", FIELD_MANIFEST)
        fields = FIELD_MANIFEST["EventFeedback"]
        self.assertIn("stage", fields)
        self.assertIn("timestamp_ns", fields)
        self.assertIn("inbound_bytes", fields)


class InboundMessageUnionTests(unittest.TestCase):
    def test_inbound_union_includes_new_envelopes(self) -> None:
        # The InboundMessage type alias in app.schemas.controller_host
        # should now accept MappingDeactivate + MappingReload. Verify
        # by string match on the type alias's __args__.
        from app.schemas.controller_host import InboundMessage
        type_names = [arg.__name__ for arg in InboundMessage.__args__]
        self.assertIn("MappingDeactivate", type_names)
        self.assertIn("MappingReload", type_names)

    def test_outbound_union_includes_event_feedback(self) -> None:
        from app.schemas.controller_host import OutboundMessage
        type_names = [arg.__name__ for arg in OutboundMessage.__args__]
        self.assertIn("EventFeedback", type_names)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
