import asyncio

from app import database as database_module
from app.routes import effects_loops as routes


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'effects-loops-routes.db'}")


async def _seed_chain(chain_id: int):
    async with database_module.get_session() as session:
        session.add(
            database_module.Chain(
                id=chain_id,
                name=f"Chain {chain_id}",
                is_active=False,
                config="{}",
            )
        )
        await session.flush()


def test_effects_loop_route_crud_contract(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        created = await routes.create_effects_loop(
            routes.EffectsLoopCreateRequest(
                name="Route Loop",
                channels=2,
                topology="serial_insert",
            )
        )
        loop_id = created["loop_id"]

        listed = await routes.list_effects_loops()
        assert listed["count"] == 1
        assert listed["loops"][0]["loop_id"] == loop_id

        fetched = await routes.get_effects_loop(loop_id)
        assert fetched["name"] == "Route Loop"

        patched = await routes.patch_effects_loop(
            loop_id,
            routes.EffectsLoopUpdateRequest(name="Route Loop Updated"),
        )
        assert patched["name"] == "Route Loop Updated"

        metrics = await routes.get_effects_loop_metrics(loop_id)
        assert metrics["loop_id"] == loop_id

        deleted = await routes.delete_effects_loop(loop_id)
        assert deleted["status"] == "deleted"

        listed_after = await routes.list_effects_loops()
        assert listed_after["count"] == 0

    asyncio.run(_run())


def test_chain_loop_insertion_route_contract(tmp_path):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(21))

    async def _run():
        loop = await routes.create_effects_loop(
            routes.EffectsLoopCreateRequest(
                name="Insertable",
                channels=2,
                topology="parallel_send_return",
            )
        )

        inserted = await routes.insert_chain_loop(
            21,
            routes.ChainLoopInsertionCreateRequest(
                loop_id=loop["loop_id"],
                slot_index=0,
                mode="parallel_send_return",
                blend_pct=42.0,
            ),
        )
        insertion_id = inserted["insertion"]["insertion_id"]
        assert inserted["insertion"]["loop_id"] == loop["loop_id"]

        listed = await routes.list_chain_loops(21)
        assert listed["count"] == 1
        assert listed["loop_insertions"][0]["insertion_id"] == insertion_id

        patched = await routes.patch_chain_loop_insertion(
            21,
            insertion_id,
            routes.ChainLoopInsertionUpdateRequest(blend_pct=55.0),
        )
        assert patched["insertion"]["blend_pct"] == 55.0

        deleted = await routes.delete_chain_loop_insertion(21, insertion_id)
        assert deleted["status"] == "deleted"

        listed_after = await routes.list_chain_loops(21)
        assert listed_after["count"] == 0

    asyncio.run(_run())


def test_tesira_template_runtime_status_route_contract(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        upserted = await routes.upsert_tesira_loop_template(
            "tmpl-route",
            routes.TesiraLoopTemplatePutRequest(
                tesira_device_id="tesira_route",
                stream_in_tags=["ExplicitAVBInStream1"],
                stream_out_tags=["ExplicitAVBOutStream1"],
                channel_map_policy="direct",
            ),
        )
        assert upserted["template_id"] == "tmpl-route"
        assert "runtime_status" in upserted

        validated = await routes.validate_tesira_loop_template("tmpl-route")
        assert validated["template_id"] == "tmpl-route"
        assert "runtime_status" in validated

        runtime = await routes.get_tesira_loop_template_runtime_status("tmpl-route")
        assert runtime["template_id"] == "tmpl-route"
        assert "runtime_status" in runtime
        assert runtime["runtime_status"]["drift_status"] in {"ok", "warning", "error", "unknown"}

    asyncio.run(_run())
