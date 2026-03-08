import asyncio

from app import database as database_module
from app.services.tesira.layout_catalog import TesiraLayoutCatalogService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'tesira-layout-catalog.db'}")


def test_layout_catalog_import_list_get(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        svc = TesiraLayoutCatalogService()
        imported = await svc.import_layout(
            {
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Forte CI Default",
                "device_family": "FORTE_CI",
                "channel_profile": "12x8",
                "required_firmware": "4.10.0",
                "checksum": "sha256:abc123",
                "artifact_uri": "s3://layouts/forte_ci_default_1.0.0.tlf",
                "instance_tag_map": {"level": "LevelControl1"},
                "feature_flags": ["avb", "gpio"],
                "notes": "baseline",
                "is_active": True,
            }
        )

        assert imported["layout_id"] == "forte_ci_default"
        assert imported["device_family"] == "FORTE_CI"
        assert imported["feature_flags"] == ["avb", "gpio"]

        listed = await svc.list_layouts()
        assert len(listed) == 1
        assert listed[0]["layout_id"] == "forte_ci_default"

        fetched = await svc.get_layout("forte_ci_default")
        assert fetched is not None
        assert fetched["version"] == "1.0.0"
        assert fetched["instance_tag_map"]["level"] == "LevelControl1"

    asyncio.run(_run())


def test_layout_catalog_upsert_updates_existing_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        svc = TesiraLayoutCatalogService()

        await svc.import_layout(
            {
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Original",
                "device_family": "FORTE_CI",
                "checksum": "sha256:old",
            }
        )

        updated = await svc.import_layout(
            {
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Updated",
                "device_family": "FORTE_CI",
                "checksum": "sha256:new",
                "feature_flags": ["avb", "presets", "avb"],
            }
        )

        assert updated["name"] == "Updated"
        assert updated["checksum"] == "sha256:new"
        assert updated["feature_flags"] == ["avb", "presets"]

        listed = await svc.list_layouts()
        assert len(listed) == 1

    asyncio.run(_run())


def test_layout_catalog_filters_by_family_and_active(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        svc = TesiraLayoutCatalogService()

        await svc.import_layout(
            {
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Forte",
                "device_family": "FORTE_CI",
                "checksum": "sha256:1",
                "is_active": True,
            }
        )
        await svc.import_layout(
            {
                "layout_id": "server_io_default",
                "version": "1.0.0",
                "name": "Server IO",
                "device_family": "SERVER_IO",
                "checksum": "sha256:2",
                "is_active": False,
            }
        )

        forte_only = await svc.list_layouts(device_family="FORTE_CI")
        assert len(forte_only) == 1
        assert forte_only[0]["layout_id"] == "forte_ci_default"

        active_only = await svc.list_layouts()
        assert len(active_only) == 1
        assert active_only[0]["layout_id"] == "forte_ci_default"

        with_inactive = await svc.list_layouts(include_inactive=True)
        assert len(with_inactive) == 2

    asyncio.run(_run())
