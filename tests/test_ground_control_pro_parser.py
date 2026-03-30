from __future__ import annotations

from pathlib import Path

import pytest

from app.services.ground_control_pro.constants import PREAMBLE, SYSEX_NUM_BYTES, TERMINATOR
from app.services.ground_control_pro.field_map import expand_field_descriptors, unknown_byte_count
from app.services.ground_control_pro.parser import parse_container_to_model
from app.services.ground_control_pro.serializer import compile_model
from app.services.ground_control_pro.sysex_container import GroundControlSysexContainer
from app.services.ground_control_pro.validator import validate_model


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro"
ROUND_TRIP_FIXTURES = [
    "factory_default_v113.syx",
    "single_name_change_v113.syx",
    "single_channel_change_v113.syx",
    "single_ia_change_v113.syx",
    "single_pedal_change_v113.syx",
    "single_program_change_v113.syx",
]


def _read_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


@pytest.mark.parametrize("fixture_name", ROUND_TRIP_FIXTURES)
def test_ground_control_pro_fixtures_round_trip_byte_identically(fixture_name: str) -> None:
    data = _read_fixture(fixture_name)

    container = GroundControlSysexContainer.from_bytes(data)
    model = parse_container_to_model(container)
    compiled = compile_model(model, container)
    report = validate_model(model, base_bytes=data, compiled_bytes=compiled)

    assert len(data) == SYSEX_NUM_BYTES
    assert compiled == data
    assert report.errors == []
    assert report.round_trip_identity is True
    assert report.unknown_byte_count == unknown_byte_count()


def test_ground_control_pro_container_rejects_bad_size() -> None:
    with pytest.raises(ValueError, match="Expected 16567 bytes"):
        GroundControlSysexContainer.from_bytes(_read_fixture("factory_default_v113.syx")[:-1])


def test_ground_control_pro_container_rejects_bad_preamble() -> None:
    payload = bytearray(_read_fixture("factory_default_v113.syx"))
    payload[: len(PREAMBLE)] = b"\xF0\x7E\x00\x00\x00"

    with pytest.raises(ValueError, match="Invalid Ground Control Pro preamble"):
        GroundControlSysexContainer.from_bytes(bytes(payload))


def test_ground_control_pro_container_rejects_bad_terminator() -> None:
    payload = bytearray(_read_fixture("factory_default_v113.syx"))
    payload[-1] = 0x00

    with pytest.raises(ValueError, match="Invalid Ground Control Pro terminator"):
        GroundControlSysexContainer.from_bytes(bytes(payload))


def test_ground_control_pro_field_map_exposes_unknown_reserved_ranges() -> None:
    unknown_descriptors = [descriptor for descriptor in expand_field_descriptors() if descriptor.confidence == "unknown_reserved"]

    assert unknown_descriptors
    assert any("definition_raw" in descriptor.path for descriptor in unknown_descriptors)
    assert any("device_program_banks_raw" in descriptor.path for descriptor in unknown_descriptors)
