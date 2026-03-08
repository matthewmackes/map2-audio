import asyncio

from app import database as database_module
from app.services.tesira.tesira_design_workspace import TesiraDesignWorkspaceService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'tesira-design-workspace.db'}")


def test_design_workspace_crud_and_validation(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        svc = TesiraDesignWorkspaceService()
        created = await svc.create_design(
            device_id="tesira_SN123",
            payload={
                "name": "Main Design",
                "graph": {
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
                            "id": "level1",
                            "block_type": "LevelControl",
                            "instance_tag": "LevelControl1",
                            "io": {
                                "inputs": [{"name": "in", "domain": "audio", "channels": 1}],
                                "outputs": [{"name": "out", "domain": "audio", "channels": 1}],
                            },
                        },
                    ],
                    "edges": [{"id": "e1", "source": "in1", "target": "level1"}],
                    "groups": [],
                },
            },
        )
        assert created["device_id"] == "tesira_SN123"

        listed = await svc.list_designs(device_id="tesira_SN123")
        assert len(listed) == 1

        fetched = await svc.get_design(device_id="tesira_SN123", design_id=created["design_id"])
        assert fetched is not None
        assert fetched["name"] == "Main Design"

        validation = svc.validate_graph(fetched["graph"])
        assert validation["ok"] is True

        updated = await svc.update_design(
            device_id="tesira_SN123",
            design_id=created["design_id"],
            payload={"name": "Main Design v2"},
        )
        assert updated is not None
        assert updated["name"] == "Main Design v2"

        deleted = await svc.delete_design(device_id="tesira_SN123", design_id=created["design_id"])
        assert deleted is True

    asyncio.run(_run())


def test_design_workspace_validation_catches_mismatch_and_duplicates(tmp_path):
    _init_temp_db(tmp_path)
    svc = TesiraDesignWorkspaceService()

    graph = {
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
                "instance_tag": "LogicState1",
                "io": {
                    "inputs": [{"name": "in", "domain": "audio", "channels": 2}],
                    "outputs": [],
                },
            },
        ],
        "edges": [
            {"id": "e1", "source": "logic1", "target": "out1"},
        ],
        "groups": [{"id": "grp1", "name": "bad", "node_ids": ["missing"]}],
    }

    validation = svc.validate_graph(graph)
    assert validation["ok"] is False
    assert any("duplicate instance_tag" in err for err in validation["errors"])
    assert any("domain mismatch" in err for err in validation["errors"])
    assert any("references unknown node" in err for err in validation["errors"])


def test_design_workspace_block_library_is_versioned_and_expanded():
    svc = TesiraDesignWorkspaceService()
    library = svc.design_block_library()
    block_types = {entry["block_type"] for entry in library}

    assert len(library) >= 25
    assert "LevelControl" in block_types
    assert "Compressor" in block_types
    assert "ExplicitAVBOutStream" in block_types
