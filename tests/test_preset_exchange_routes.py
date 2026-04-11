from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import database as database_module
from app.routes import preset_exchange as exchange_routes
from app.services import preset_converter_service as converter_service
from app.services.cluster import content_distributor
from app.services.cluster import enhanced_node_identity as identity_service


def _init_temp_db(tmp_path: Path, filename: str) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / filename}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(exchange_routes.router)
    return TestClient(app)


async def _seed_plugin_preset(
    *,
    name: str,
    plugin_uri: str,
    plugin_name: str = "Test Plugin",
    parameters: dict[str, object] | None = None,
    is_default: bool = False,
) -> int:
    async with database_module.get_session() as session:
        preset = database_module.PluginPreset(
            name=name,
            plugin_uri=plugin_uri,
            plugin_name=plugin_name,
            parameters=json.dumps(parameters or {"gain": 0.5}),
            tags=["seeded"],
            category="User",
            description="Seeded preset",
            is_default=is_default,
        )
        session.add(preset)
        await session.flush()
        return int(preset.id)


async def _read_import_state() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    async with database_module.get_session() as session:
        presets = (await session.execute(select(database_module.PluginPreset))).scalars().all()
        history = (await session.execute(select(database_module.PresetImportHistory))).scalars().all()
        return (
            [
                {
                    "id": int(preset.id),
                    "name": str(preset.name),
                    "plugin_uri": str(preset.plugin_uri),
                    "parameters": json.loads(preset.parameters),
                    "tags": list(preset.tags or []),
                }
                for preset in presets
            ],
            [
                {
                    "source_file_hash": str(item.source_file_hash),
                    "original_filename": str(item.original_filename),
                    "converted_preset_id": item.converted_preset_id,
                    "target_plugin_uri": item.target_plugin_uri,
                }
                for item in history
            ],
        )


async def _read_presets() -> list[dict[str, object]]:
    async with database_module.get_session() as session:
        presets = (
            await session.execute(select(database_module.PluginPreset).order_by(database_module.PluginPreset.id))
        ).scalars().all()
        return [
            {
                "id": int(preset.id),
                "name": str(preset.name),
                "parameters": json.loads(preset.parameters),
            }
            for preset in presets
        ]


async def _seed_community_preset(
    *,
    uuid: str,
    name: str,
    plugin_uri: str,
    parameters: dict[str, object] | None = None,
    rating_sum: int = 0,
    rating_count: int = 0,
) -> int:
    async with database_module.get_session() as session:
        preset = database_module.CommunityPreset(
            uuid=uuid,
            name=name,
            plugin_uri=plugin_uri,
            plugin_name="Community Plugin",
            parameters=json.dumps(parameters or {"gain": 0.5}),
            author_name="Tester",
            description="Community preset",
            category="User",
            tags=["community"],
            license="CC-BY-4.0",
            source_file_hash=f"hash-{uuid}",
            is_approved=True,
            rating_sum=rating_sum,
            rating_count=rating_count,
        )
        session.add(preset)
        await session.flush()
        return int(preset.id)


async def _seed_rating(*, preset_id: int, fingerprint: str, rating: int) -> int:
    async with database_module.get_session() as session:
        row = database_module.PresetRating(
            preset_id=preset_id,
            user_fingerprint=fingerprint,
            rating=rating,
        )
        session.add(row)
        await session.flush()
        return int(row.id)


async def _read_rating(rating_id: int) -> dict[str, object]:
    async with database_module.get_session() as session:
        row = await session.get(database_module.PresetRating, rating_id)
        assert row is not None
        return {
            "rating": int(row.rating),
            "updated_at": row.updated_at,
        }


class _FakeConverter:
    supported_formats = [
        {"name": "MAP2UPF", "extension": ".map2preset", "can_import": True, "can_export": True},
        {"name": "JUCE", "extension": ".jucepreset", "can_import": True, "can_export": True},
    ]

    def import_preset(self, file_path: Path, target_plugin_uri: str | None = None):
        assert file_path.exists()
        return SimpleNamespace(
            success=True,
            name="Imported Lead",
            plugin_identifier=target_plugin_uri or "urn:test:plugin",
            parameters={"gain": 0.75, "mix": 0.2},
            original_format=converter_service.PresetFormat.MAP2UPF,
            metadata={"plugin_name": "Imported Plugin"},
            warnings=["legacy metadata preserved"],
            errors=[],
        )

    def compute_file_hash(self, file_path: Path) -> str:
        return "import-hash"


class _FakeDistributor:
    def __init__(self) -> None:
        self.availability_calls: list[dict[str, object]] = []
        self.library_deploy_calls: list[dict[str, object]] = []

    async def get_preset_availability(self, preset_id, targets, *, source_node_id=None):
        self.availability_calls.append(
            {
                "preset_id": preset_id,
                "targets": targets,
                "source_node_id": source_node_id,
            }
        )
        return {"node-a": True, "node-b": False}

    async def deploy_library_item(self, content_type, path_token, target_node_ids, *, source_node_id=None):
        self.library_deploy_calls.append(
            {
                "content_type": content_type,
                "path_token": path_token,
                "target_node_ids": list(target_node_ids),
                "source_node_id": source_node_id,
            }
        )
        return {node_id: node_id == "node-a" for node_id in target_node_ids}


def test_import_route_persists_imported_preset_and_history(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "preset-exchange-import.db")
    monkeypatch.setattr(converter_service, "get_preset_converter", lambda: _FakeConverter())
    client = _build_client()

    response = client.post(
        "/api/preset-exchange/import?plugin_uri=urn:test:import-target&save_to_library=true",
        files={"file": ("lead.map2preset", b"{\"format_type\":\"map2upf\"}", "application/json")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "success": True,
        "preset_id": 1,
        "name": "Imported Lead",
        "plugin_identifier": "urn:test:import-target",
        "original_format": "map2upf",
        "parameters_imported": 2,
        "message": "Successfully imported 'Imported Lead' with 2 parameters",
        "warnings": ["legacy metadata preserved"],
    }

    presets, history = asyncio.run(_read_import_state())
    assert len(presets) == 1
    assert presets[0]["name"] == "Imported Lead"
    assert presets[0]["plugin_uri"] == "urn:test:import-target"
    assert presets[0]["parameters"] == {"gain": 0.75, "mix": 0.2}
    assert presets[0]["tags"] == ["map2upf", "imported"]

    assert len(history) == 1
    assert history[0]["source_file_hash"] == "import-hash"
    assert history[0]["original_filename"] == "lead.map2preset"
    assert history[0]["converted_preset_id"] == presets[0]["id"]
    assert history[0]["target_plugin_uri"] == "urn:test:import-target"


def test_formats_route_returns_converter_contract(monkeypatch):
    monkeypatch.setattr(converter_service, "get_preset_converter", lambda: _FakeConverter())
    client = _build_client()

    response = client.get("/api/preset-exchange/formats")

    assert response.status_code == 200
    assert response.json() == {
        "formats": _FakeConverter.supported_formats,
        "primary_format": "map2upf",
        "recommended_extension": ".map2preset",
    }


def test_cluster_preset_export_and_import_round_trip(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "preset-exchange-cluster.db")
    preset_id = asyncio.run(
        _seed_plugin_preset(
            name="Source Preset",
            plugin_uri="urn:test:cluster-plugin",
            parameters={"gain": 0.65, "mix": 0.35},
            is_default=True,
        )
    )
    monkeypatch.setattr(
        identity_service,
        "get_enhanced_node_identity",
        lambda: SimpleNamespace(get_node_id=lambda: "node-local"),
    )
    client = _build_client()

    export_response = client.get(f"/api/preset-exchange/cluster/presets/{preset_id}")

    assert export_response.status_code == 200
    bundle = export_response.json()
    assert bundle["preset_id"] == preset_id
    assert bundle["source_node_id"] == "node-local"
    assert bundle["checksum"] == exchange_routes._preset_checksum(
        "urn:test:cluster-plugin",
        {"gain": 0.65, "mix": 0.35},
    )
    parsed = datetime.fromisoformat(bundle["exported_at"])
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)

    bundle["name"] = "Imported Clone"
    bundle["is_default"] = False
    import_response = client.post("/api/preset-exchange/import-cluster", json=bundle)

    assert import_response.status_code == 200
    assert import_response.json() == {
        "success": True,
        "preset_id": 2,
        "status": "created",
        "already_exists": False,
        "checksum": bundle["checksum"],
        "source_node_id": "node-local",
    }

    presets = asyncio.run(_read_presets())
    assert [preset["name"] for preset in presets] == ["Source Preset", "Imported Clone"]
    assert presets[1]["parameters"] == {"gain": 0.65, "mix": 0.35}


def test_rate_community_preset_updates_existing_rating_with_utc_timestamp(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "preset-exchange-rating.db")
    preset_id = asyncio.run(
        _seed_community_preset(
            uuid="community-preset-1",
            name="Rated Preset",
            plugin_uri="urn:test:community-plugin",
            rating_sum=2,
            rating_count=1,
        )
    )
    rating_id = asyncio.run(_seed_rating(preset_id=preset_id, fingerprint="f" * 32, rating=2))
    fixed_now = datetime(2026, 4, 11, 12, 5, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(exchange_routes, "utc_now", lambda: fixed_now)
    client = _build_client()

    response = client.post(
        "/api/preset-exchange/community/community-preset-1/rate",
        params={"rating": 5, "fingerprint": "f" * 32},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "preset_uuid": "community-preset-1",
        "new_rating": 5.0,
        "rating_count": 1,
    }

    stored = asyncio.run(_read_rating(rating_id))
    assert stored["rating"] == 5
    assert stored["updated_at"] == fixed_now.replace(tzinfo=None)


def test_cluster_library_file_routes_and_distributor_delegation(tmp_path, monkeypatch):
    nam_root = tmp_path / "nam"
    model_path = nam_root / "amp" / "edge.nam"
    model_path.parent.mkdir(parents=True)
    model_path.write_bytes(b"nam-bytes")
    (nam_root / "amp" / "README.txt").write_text("ignore", encoding="utf-8")

    monkeypatch.setattr(
        exchange_routes,
        "_cluster_content_roots",
        lambda content_type: {"nam_0": nam_root} if content_type == "nam" else {},
    )
    distributor = _FakeDistributor()
    monkeypatch.setattr(content_distributor, "get_content_distributor", lambda: distributor)
    client = _build_client()

    library_response = client.get("/api/preset-exchange/cluster/library?content_type=nam")

    assert library_response.status_code == 200
    payload = library_response.json()
    assert payload["content_type"] == "nam"
    assert payload["count"] == 1
    assert payload["items"] == [
        {
            "path_token": "nam_0:amp/edge.nam",
            "relative_path": "amp/edge.nam",
            "filename": "edge.nam",
            "size_bytes": 9,
            "checksum": hashlib.sha256(b"nam-bytes").hexdigest(),
            "asset_type": "nam",
        }
    ]

    file_response = client.get(
        "/api/preset-exchange/cluster/files/nam",
        params={"path_token": "nam_0:amp/edge.nam"},
    )

    assert file_response.status_code == 200
    assert file_response.content == b"nam-bytes"
    assert file_response.headers["content-disposition"].endswith('filename="edge.nam"')

    availability_response = client.get(
        "/api/preset-exchange/availability?preset_id=7&target_node_ids=node-a,node-b&source_node_id=node-local"
    )
    assert availability_response.status_code == 200
    assert availability_response.json() == {"node-a": True, "node-b": False}
    assert distributor.availability_calls == [
        {
            "preset_id": 7,
            "targets": ["node-a", "node-b"],
            "source_node_id": "node-local",
        }
    ]

    deploy_response = client.post(
        "/api/preset-exchange/deploy",
        json={
            "content_type": "nam",
            "path_token": "nam_0:amp/edge.nam",
            "source_node_id": "node-local",
            "target_node_id": "node-a",
        },
    )

    assert deploy_response.status_code == 200
    assert deploy_response.json() == {
        "content_type": "nam",
        "path_token": "nam_0:amp/edge.nam",
        "source_node_id": "node-local",
        "targets": ["node-a"],
        "results": {"node-a": True},
        "successful": ["node-a"],
        "failed": [],
    }
    assert distributor.library_deploy_calls == [
        {
            "content_type": "nam",
            "path_token": "nam_0:amp/edge.nam",
            "target_node_ids": ["node-a"],
            "source_node_id": "node-local",
        }
    ]
