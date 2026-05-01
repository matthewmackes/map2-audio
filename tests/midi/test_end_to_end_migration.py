"""T2482-P2.9 part 2: end-to-end migration smoke test.

Single integration test that:
  1. Seeds a realistic legacy DB (snapshot_midi_maps + midi_mappings rows)
  2. Runs both migration scripts (P2.3 snapshot + P2.5 plugin_param)
  3. Re-runs both (idempotency check)
  4. Runs the full verification suite (P2.9 part 1) end-to-end
  5. Asserts every per-consumer verifier passes

This is the gate that proves Phase 2's authority + projections + migration
scripts compose correctly on a representative starting state.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import text

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.plugin_param import migrate_midi_mappings_table
from app.services.midi.projections.snapshot import migrate_snapshot_midi_maps_table
from app.services.midi.verification import (
    run_full_suite,
    verify_plugin_param_consumer,
    verify_snapshot_consumer,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'e2e-mig.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_phase2_migration_end_to_end(tmp_path):
    """The big gate: legacy data → canonical authority → verifier suite."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            # ---------- Seed legacy data ----------

            # Two snapshots, mixed entry shapes
            await session.execute(
                text("INSERT INTO snapshots (name, version) VALUES "
                     "('Stage Setup', 1), ('Studio Setup', 1)")
            )
            await session.execute(
                text(
                    "INSERT INTO snapshot_midi_maps (snapshot_id, entries) "
                    "VALUES (1, :entries1), (2, :entries2)"
                ),
                {
                    "entries1": (
                        '[{"channel":0,"cc":7,"action":"ab-toggle"},'
                        '{"channel":1,"program_number":5,"action":"load"}]'
                    ),
                    "entries2": (
                        '[{"channel":0,"note":60,"action":"morph",'
                        '"curve":"exponential"}]'
                    ),
                },
            )

            # One chain + one MIDIMapping row pointing at it
            await session.execute(text("INSERT INTO chains (id, name) VALUES (1, 'Lead Chain')"))
            await session.execute(
                text(
                    "INSERT INTO midi_mappings ("
                    "channel, cc, chain_id, target_plugin_uri, "
                    "target_plugin_position, target_param_index, "
                    "target_param_symbol, min_val, max_val, "
                    "curve_type, invert, feedback_enabled, feedback_cc, "
                    "name, is_learned, is_enabled"
                    ") VALUES "
                    "(0, 11, 1, 'map2:fx:eq', 0, 0, 'low_gain', "
                    "  -12.0, 12.0, 'linear', 0, 1, NULL, 'EQ Low', 0, 1)"
                )
            )
            await session.commit()

            authority = MidiBindingAuthority(session)

            # ---------- Run migrations ----------

            snap_stats = await migrate_snapshot_midi_maps_table(authority)
            param_stats = await migrate_midi_mappings_table(authority)
            await session.commit()

            assert snap_stats["snapshots_migrated"] == 2
            assert snap_stats["entries_migrated"] == 3
            assert param_stats["mappings_migrated"] == 1

            # ---------- Idempotency check ----------

            snap_stats_2 = await migrate_snapshot_midi_maps_table(authority)
            param_stats_2 = await migrate_midi_mappings_table(authority)
            await session.commit()

            assert snap_stats_2["snapshots_migrated"] == 0
            assert snap_stats_2["snapshots_skipped"] == 2
            assert param_stats_2["mappings_migrated"] == 0
            assert param_stats_2["mappings_skipped"] == 1

            # Total binding count: 3 snapshot entries + 1 plugin_param = 4
            assert await authority.count() == 4

            # ---------- Per-consumer verification ----------

            r1 = await verify_snapshot_consumer(
                authority, snapshot_id=1,
                expected_actions=["ab-toggle", "load"],
            )
            assert r1.ok is True, r1.detail

            r2 = await verify_snapshot_consumer(
                authority, snapshot_id=2,
                expected_actions=["morph"],
            )
            assert r2.ok is True, r2.detail

            r3 = await verify_plugin_param_consumer(
                authority,
                chain_id=1,
                plugin_uri="map2:fx:eq",
                param_index=0,
                expected_count=1,
            )
            assert r3.ok is True, r3.detail

            # ---------- Full suite composition ----------

            suite = await run_full_suite(
                authority,
                snapshot_ids=[1, 2],
                brain_device_ids=None,  # no brain bindings in this scenario
                plugin_param_snapshot_ids=None,  # plugin_params here are global, not snapshot-scoped
            )
            assert suite.ok is True, (
                f"suite failed: {suite.summary()} "
                f"failures: {[r.detail for r in suite.results if not r.ok]}"
            )
            # 2 snapshot verifiers + 4 globals = at least 6 results
            assert suite.passed >= 6

    asyncio.run(_run())
