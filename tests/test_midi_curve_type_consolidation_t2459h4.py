from __future__ import annotations

from app.midi.curves import CurveType as CanonicalCurveType
from app.services import midi_models, midi_device_profiles, midi_engine


def test_curve_type_is_shared_across_midi_services() -> None:
    assert midi_models.CurveType is CanonicalCurveType
    assert midi_device_profiles.CurveType is CanonicalCurveType
    assert midi_engine.CurveType is CanonicalCurveType


def test_curve_type_has_expected_values() -> None:
    assert CanonicalCurveType.LINEAR.value == "linear"
    assert CanonicalCurveType.LOGARITHMIC.value == "logarithmic"
    assert CanonicalCurveType.EXPONENTIAL.value == "exponential"
    assert CanonicalCurveType.S_CURVE.value == "s_curve"
    assert CanonicalCurveType.REVERSE.value == "reverse"


def test_midi_mapping_dto_uses_shared_curve_type_default() -> None:
    dto = midi_models.MIDIMappingDTO()
    assert dto.curve_type is CanonicalCurveType.LINEAR
