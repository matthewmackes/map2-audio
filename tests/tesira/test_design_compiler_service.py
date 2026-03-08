import asyncio

from app import database as database_module
from app.services.tesira.tesira_design_compiler import TesiraDesignCompilerService
from app.services.tesira.tesira_design_workspace import TesiraDesignWorkspaceService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'tesira-design-compiler.db'}")


def _valid_graph():
    return {
        "nodes": [
            {
                "id": "in1",
                "block_type": "AudioInput",
                "instance_tag": "Input1",
                "io": {
                    "inputs": [],
                    "outputs": [{"name": "out", "domain": "audio", "channels": 1}],
                },
            },
            {
                "id": "out1",
                "block_type": "AudioOutput",
                "instance_tag": "Output1",
                "io": {
                    "inputs": [{"name": "in", "domain": "audio", "channels": 1}],
                    "outputs": [],
                },
            },
        ],
        "edges": [{"id": "e1", "source": "in1", "target": "out1"}],
        "groups": [],
    }


def test_compile_service_happy_path_and_recompile(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        workspace = TesiraDesignWorkspaceService()
        compiler = TesiraDesignCompilerService()

        created = await workspace.create_design(
            device_id="tesira_SN123",
            payload={"design_id": "design_main", "name": "Main", "graph": _valid_graph()},
        )

        first = await compiler.compile_design(
            device_id="tesira_SN123",
            design_id=created["design_id"],
            optimize=True,
            recompile=False,
        )
        assert first["status"] == "COMPILED"
        assert first["compile_revision"] == 1
        assert first["artifact"] is not None

        second = await compiler.compile_design(
            device_id="tesira_SN123",
            design_id=created["design_id"],
            optimize=True,
            recompile=False,
        )
        assert second["status"] == "UP_TO_DATE"
        assert second["compile_revision"] == 1

        third = await compiler.compile_design(
            device_id="tesira_SN123",
            design_id=created["design_id"],
            optimize=True,
            recompile=True,
        )
        assert third["status"] == "COMPILED"
        assert third["compile_revision"] == 2

        diagnostics = await compiler.get_diagnostics(
            device_id="tesira_SN123",
            design_id=created["design_id"],
        )
        assert diagnostics["compile_status"] == "COMPILED"
        assert diagnostics["compile_revision"] == 2

    asyncio.run(_run())


def test_compile_service_invalid_graph_fails(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        workspace = TesiraDesignWorkspaceService()
        compiler = TesiraDesignCompilerService()

        await workspace.create_design(
            device_id="tesira_SN123",
            payload={
                "design_id": "design_bad",
                "name": "Bad",
                "graph": {
                    "nodes": [
                        {
                            "id": "logic1",
                            "block_type": "LogicState",
                            "instance_tag": "LogicState1",
                            "io": {
                                "inputs": [{"name": "trigger", "domain": "control", "channels": 1}],
                                "outputs": [{"name": "state", "domain": "control", "channels": 1}],
                            },
                        },
                        {
                            "id": "out1",
                            "block_type": "AudioOutput",
                            "instance_tag": "Out1",
                            "io": {
                                "inputs": [{"name": "in", "domain": "audio", "channels": 1}],
                                "outputs": [],
                            },
                        },
                    ],
                    "edges": [{"id": "e1", "source": "logic1", "target": "out1"}],
                    "groups": [],
                },
            },
        )

        result = await compiler.compile_design(
            device_id="tesira_SN123",
            design_id="design_bad",
            optimize=False,
            recompile=False,
        )
        assert result["status"] == "FAILED"
        assert result["compile_status"] == "FAILED"
        assert result["artifact"] is None

    asyncio.run(_run())


def test_compile_service_compile_uncompiled_filter(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        workspace = TesiraDesignWorkspaceService()
        compiler = TesiraDesignCompilerService()

        await workspace.create_design(
            device_id="tesira_SN123",
            payload={"design_id": "design_one", "name": "One", "graph": _valid_graph()},
        )
        await workspace.create_design(
            device_id="tesira_SN123",
            payload={"design_id": "design_two", "name": "Two", "graph": _valid_graph()},
        )

        await compiler.compile_design(
            device_id="tesira_SN123",
            design_id="design_one",
            optimize=False,
            recompile=False,
        )

        result = await compiler.compile_all(
            device_id="tesira_SN123",
            optimize=False,
            recompile=False,
            only_uncompiled=True,
            include_templates=False,
        )

        assert result["count"] == 1
        assert result["results"][0]["design_id"] == "design_two"

    asyncio.run(_run())
