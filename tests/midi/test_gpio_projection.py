"""T2482-P2.6 part 2: GPIO projection tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.gpio import (
    list_gpio_bindings,
    make_gpio_input_consumer_id,
    make_gpio_output_consumer_id,
    make_gpio_to_midi_payload,
    make_midi_to_gpio_payload,
    parse_gpio_consumer_id,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'gpio.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- consumer_id format ----------


def test_make_gpio_input_consumer_id():
    assert make_gpio_input_consumer_id(7) == "input:7"


def test_make_gpio_output_consumer_id():
    assert make_gpio_output_consumer_id(3) == "output:3"


def test_pin_validation_rejects_out_of_range():
    with pytest.raises(ValueError):
        make_gpio_input_consumer_id(0)
    with pytest.raises(ValueError):
        make_gpio_input_consumer_id(13)
    with pytest.raises(ValueError):
        make_gpio_output_consumer_id(-1)


def test_parse_gpio_consumer_id_round_trip():
    assert parse_gpio_consumer_id("input:7") == ("input", 7)
    assert parse_gpio_consumer_id("output:3") == ("output", 3)


def test_parse_gpio_consumer_id_rejects_malformed():
    with pytest.raises(ValueError):
        parse_gpio_consumer_id("no_colon")
    with pytest.raises(ValueError):
        parse_gpio_consumer_id("sideways:5")
    with pytest.raises(ValueError):
        parse_gpio_consumer_id("input:13")
    with pytest.raises(ValueError):
        parse_gpio_consumer_id("input:abc")


# ---------- payload shaping ----------


def test_midi_to_gpio_payload_cc():
    p = make_midi_to_gpio_payload(
        pin=5, source_type="midi_cc", channel=0, cc=64, pulse_ms=50
    )
    assert p.consumer_type == "gpio"
    assert p.consumer_id == "input:5"
    assert p.source_type == "midi_cc"
    assert p.source_descriptor == {"channel": 0, "cc": 64}
    assert p.target_type == "gpio_output"
    assert p.target_descriptor["pin"] == 5
    assert p.target_descriptor["pulse_ms"] == 50


def test_midi_to_gpio_payload_note_no_cc_field():
    p = make_midi_to_gpio_payload(
        pin=5, source_type="midi_note", channel=0, note=60, cc=99
    )
    assert "cc" not in p.source_descriptor
    assert p.source_descriptor == {"channel": 0, "note": 60}


def test_gpio_to_midi_payload():
    p = make_gpio_to_midi_payload(
        pin=3,
        target_type="engine_command",
        target_descriptor={"command": "tap-tempo"},
        edge="rising",
    )
    assert p.consumer_id == "output:3"
    assert p.source_type == "gpio_input"
    assert p.source_descriptor["pin"] == 3
    assert p.source_descriptor["direction"] == "input"
    assert p.source_descriptor["edge"] == "rising"
    assert p.target_descriptor["command"] == "tap-tempo"


def test_gpio_to_midi_rejects_invalid_edge():
    with pytest.raises(ValueError):
        make_gpio_to_midi_payload(
            pin=3,
            target_type="engine_command",
            target_descriptor={},
            edge="circular",
        )


def test_extras_pass_through():
    p = make_midi_to_gpio_payload(
        pin=5, source_type="midi_cc", channel=0, cc=64,
        extras={"vendor_inversion": True},
    )
    assert p.metadata["extra"]["vendor_inversion"] is True


# ---------- DB-backed listing ----------


def test_list_unfiltered_returns_all_gpio_bindings(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_gpio_payload(
                    pin=1, source_type="midi_cc", channel=0, cc=64
                )
            )
            await authority.create(
                make_gpio_to_midi_payload(
                    pin=2, target_type="engine_command",
                    target_descriptor={"command": "tap-tempo"},
                )
            )
            await session.commit()
            all_gpio = await list_gpio_bindings(authority)
            assert len(all_gpio) == 2

    asyncio.run(_run())


def test_list_filtered_by_direction(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_gpio_payload(pin=1, source_type="midi_cc", channel=0, cc=64)
            )
            await authority.create(
                make_midi_to_gpio_payload(pin=2, source_type="midi_cc", channel=0, cc=65)
            )
            await authority.create(
                make_gpio_to_midi_payload(
                    pin=3, target_type="engine_command",
                    target_descriptor={"command": "tap-tempo"},
                )
            )
            await session.commit()
            inputs = await list_gpio_bindings(authority, direction="input")
            outputs = await list_gpio_bindings(authority, direction="output")
            assert len(inputs) == 2
            assert len(outputs) == 1

    asyncio.run(_run())


def test_list_filtered_by_pin(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_gpio_payload(pin=5, source_type="midi_cc", channel=0, cc=64)
            )
            await authority.create(
                make_midi_to_gpio_payload(pin=7, source_type="midi_cc", channel=0, cc=64)
            )
            await session.commit()
            for_pin5 = await list_gpio_bindings(authority, pin=5)
            for_pin7 = await list_gpio_bindings(authority, pin=7)
            assert len(for_pin5) == 1
            assert len(for_pin7) == 1
            assert for_pin5[0].consumer_id == "input:5"

    asyncio.run(_run())
