"""T2482-P2.9 part 1: verification-suite scaffold tests.

Verifies the verifier composer runs cleanly against an empty store
and against a populated store; exercises the per-consumer expectation
gates.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.brain import write_brain_device_binding
from app.services.midi.projections.gpio import (
    make_gpio_to_midi_payload,
    make_midi_to_gpio_payload,
)
from app.services.midi.projections.snapshot import (
    legacy_entry_to_create_payload,
)
from app.services.midi.projections.transport import (
    make_create_payload as make_transport_payload,
)
from app.services.midi.verification import (
    SuiteResult,
    VerificationResult,
    run_full_suite,
    verify_brain_consumer,
    verify_device_pack_consumer,
    verify_gpio_consumer,
    verify_plugin_param_consumer,
    verify_snapshot_consumer,
    verify_tesira_ttp_consumer,
    verify_transport_consumer,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'verify.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- Per-consumer verifier tests ----------


def test_verify_snapshot_consumer_ok(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "ab-toggle"},
                    snapshot_id=42, legacy_entry_index=0,
                )
            )
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 1, "program_number": 5, "action": "load"},
                    snapshot_id=42, legacy_entry_index=1,
                )
            )
            await session.commit()
            r = await verify_snapshot_consumer(
                authority, snapshot_id=42, expected_actions=["ab-toggle", "load"]
            )
            assert r.ok is True, r.detail
            assert r.counts["entries"] == 2

    asyncio.run(_run())


def test_verify_snapshot_consumer_fails_on_empty(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            r = await verify_snapshot_consumer(authority, snapshot_id=42)
            assert r.ok is False
            assert "no entries" in r.detail

    asyncio.run(_run())


def test_verify_snapshot_consumer_fails_on_action_mismatch(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "ab-toggle"},
                    snapshot_id=42, legacy_entry_index=0,
                )
            )
            await session.commit()
            r = await verify_snapshot_consumer(
                authority, snapshot_id=42, expected_actions=["wrong-action"]
            )
            assert r.ok is False
            assert "mismatch" in r.detail

    asyncio.run(_run())


def test_verify_brain_consumer_ok(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="Brain — KBD",
            )
            await session.commit()
            r = await verify_brain_consumer(authority, device_id="kbd:abc")
            assert r.ok is True
            assert r.counts["bindings"] == 1

    asyncio.run(_run())


def test_verify_plugin_param_consumer_requires_args(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            r = await verify_plugin_param_consumer(authority)
            assert r.ok is False
            assert "snapshot_id" in r.detail

    asyncio.run(_run())


def test_verify_transport_consumer_with_expected_set(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_transport_payload(consumer_id="clock", source_type="midi_clock", role="master")
            )
            await session.commit()
            r = await verify_transport_consumer(authority, expected_consumer_ids=["clock"])
            assert r.ok is True

    asyncio.run(_run())


def test_verify_gpio_consumer_counts(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_gpio_payload(pin=1, source_type="midi_cc", channel=0, cc=64)
            )
            await authority.create(
                make_gpio_to_midi_payload(
                    pin=2,
                    target_type="engine_command",
                    target_descriptor={"command": "tap-tempo"},
                )
            )
            await session.commit()
            r = await verify_gpio_consumer(
                authority, expected_input_count=1, expected_output_count=1
            )
            assert r.ok is True

    asyncio.run(_run())


def test_verify_gpio_consumer_fails_on_count_mismatch(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            r = await verify_gpio_consumer(
                authority, expected_input_count=5, expected_output_count=0
            )
            assert r.ok is False
            assert "inputs" in r.detail

    asyncio.run(_run())


def test_verify_tesira_and_device_pack_empty_ok(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            r1 = await verify_tesira_ttp_consumer(authority)
            r2 = await verify_device_pack_consumer(authority)
            # Both should pass (no assertions made; empty is fine).
            assert r1.ok is True
            assert r2.ok is True

    asyncio.run(_run())


# ---------- Suite composition tests ----------


def test_run_full_suite_aggregates_results(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "ab-toggle"},
                    snapshot_id=42, legacy_entry_index=0,
                )
            )
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="Brain — KBD",
            )
            await session.commit()
            suite = await run_full_suite(
                authority,
                snapshot_ids=[42],
                brain_device_ids=["kbd:abc"],
            )
            assert isinstance(suite, SuiteResult)
            assert suite.ok is True
            assert suite.passed >= 2
            assert "passed" in suite.summary()

    asyncio.run(_run())


def test_run_full_suite_reports_failures(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # No bindings written. Snapshot verifier asks about
            # snapshot 42 → fails.
            suite = await run_full_suite(
                authority, snapshot_ids=[42],
            )
            assert suite.ok is False
            assert suite.failed >= 1
            # The four global verifiers (transport/gpio/ttp/device_pack)
            # have no expectations and should pass.
            assert suite.passed >= 4

    asyncio.run(_run())
