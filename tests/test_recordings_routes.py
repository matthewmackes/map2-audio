"""T2508-5 — Recordings artifact-registry HTTP route tests.

Mounts the recordings router on a bare FastAPI app, initializes an
in-memory SQLite DB, seeds rows directly into the
``state_authority_assets`` table, and exercises the 4 routes:

    GET    /api/recordings                  — list
    GET    /api/recordings/{hash}/metadata  — sidecar JSON
    GET    /api/recordings/{hash}/wav       — stream WAV
    DELETE /api/recordings/{hash}           — drop row + files

Tests are async (pytest-asyncio in auto mode) and use httpx.AsyncClient
so the route handlers + the seed code share the same event loop —
avoiding the aiosqlite cross-loop greenlet issue.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select

from app import database as database_module
from app.paths import Map2Paths
from app.routes.recordings import router
from app.services.upload_service import AssetType


# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'recordings-test.db'}"
    )


def _build_app(tmp_path: Path, monkeypatch) -> tuple[FastAPI, Path]:
    """Return the FastAPI app + recordings_dir tmpdir.

    Tests construct their own httpx.AsyncClient over an ASGI transport,
    keeping route handlers + seed code on the same event loop."""
    _init_temp_db(tmp_path)

    recordings_dir = tmp_path / "recordings-lib"
    recordings_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(
        Map2Paths,
        "recordings_library_dir",
        staticmethod(lambda: recordings_dir),
    )

    app = FastAPI()
    app.include_router(router)
    return app, recordings_dir


async def _seed_recording_row(
    *,
    asset_hash: str,
    file_name: str,
    size_bytes: int,
    asset_type: str = AssetType.RECORDING.value,
    source_path: str = "/var/lib/map2/recordings/take.wav",
) -> None:
    async with database_module.get_session() as session:
        row = database_module.StateAuthorityAsset(
            asset_hash=asset_hash,
            source_path=source_path,
            file_name=file_name,
            size_bytes=size_bytes,
            asset_type=asset_type,
        )
        session.add(row)


def _async_client(app: FastAPI) -> httpx.AsyncClient:
    """ASGI-transport client so routes run on the test event loop."""
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ---------------------------------------------------------------------------
# GET /api/recordings — list
# ---------------------------------------------------------------------------


async def test_list_recordings_empty_returns_zero_count(tmp_path, monkeypatch) -> None:
    app, _dir = _build_app(tmp_path, monkeypatch)
    async with _async_client(app) as client:
        resp = await client.get("/api/recordings")
    assert resp.status_code == 200
    assert resp.json() == {"recordings": [], "count": 0}


async def test_list_recordings_returns_only_recording_asset_type(tmp_path, monkeypatch) -> None:
    """A NAM model and a CABINET_IR in the same registry must NOT
    show up in the recordings list — the filter is exact on
    asset_type == 'recording'."""
    app, _dir = _build_app(tmp_path, monkeypatch)
    await _seed_recording_row(
        asset_hash="sha256:" + "a" * 64,
        file_name="take-1.wav",
        size_bytes=12345,
    )
    await _seed_recording_row(
        asset_hash="sha256:" + "b" * 64,
        file_name="MesaCab.wav",
        size_bytes=99,
        asset_type=AssetType.CABINET_IR.value,
    )
    await _seed_recording_row(
        asset_hash="sha256:" + "c" * 64,
        file_name="MesaAmp.nam",
        size_bytes=99,
        asset_type=AssetType.NAM.value,
    )

    async with _async_client(app) as client:
        resp = await client.get("/api/recordings")

    body = resp.json()
    assert body["count"] == 1
    assert body["recordings"][0]["file_name"] == "take-1.wav"
    assert body["recordings"][0]["asset_hash"] == "sha256:" + "a" * 64


async def test_list_recordings_orders_newest_first(tmp_path, monkeypatch) -> None:
    """Recordings list is ordered by created_at desc — most recent
    take appears at top of the operator's session-history pane."""
    import asyncio

    app, _dir = _build_app(tmp_path, monkeypatch)
    await _seed_recording_row(
        asset_hash="sha256:" + "1" * 64,
        file_name="early.wav",
        size_bytes=100,
    )
    await asyncio.sleep(0.01)
    await _seed_recording_row(
        asset_hash="sha256:" + "2" * 64,
        file_name="middle.wav",
        size_bytes=200,
    )
    await asyncio.sleep(0.01)
    await _seed_recording_row(
        asset_hash="sha256:" + "3" * 64,
        file_name="latest.wav",
        size_bytes=300,
    )

    async with _async_client(app) as client:
        resp = await client.get("/api/recordings")

    body = resp.json()
    names_in_order = [r["file_name"] for r in body["recordings"]]
    assert names_in_order == ["latest.wav", "middle.wav", "early.wav"]


# ---------------------------------------------------------------------------
# GET /api/recordings/{hash}/metadata
# ---------------------------------------------------------------------------


async def test_get_metadata_returns_sidecar_json(tmp_path, monkeypatch) -> None:
    app, recordings_dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "d" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="take-3.wav",
        size_bytes=2048,
    )
    (recordings_dir / "take-3.json").write_text(
        json.dumps({"session_id": "sess-42", "duration_samples": 96000}),
        encoding="utf-8",
    )

    async with _async_client(app) as client:
        resp = await client.get(f"/api/recordings/{asset_hash}/metadata")

    assert resp.status_code == 200
    assert resp.json() == {"session_id": "sess-42", "duration_samples": 96000}


async def test_get_metadata_unknown_hash_returns_404(tmp_path, monkeypatch) -> None:
    app, _dir = _build_app(tmp_path, monkeypatch)
    async with _async_client(app) as client:
        resp = await client.get("/api/recordings/sha256:nope/metadata")
    assert resp.status_code == 404


async def test_get_metadata_missing_sidecar_returns_404(tmp_path, monkeypatch) -> None:
    """Row exists but the JSON file isn't on disk."""
    app, _dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "e" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="lonely.wav",
        size_bytes=100,
    )

    async with _async_client(app) as client:
        resp = await client.get(f"/api/recordings/{asset_hash}/metadata")

    assert resp.status_code == 404
    assert "missing on disk" in resp.json()["detail"]


async def test_get_metadata_unreadable_sidecar_returns_500(tmp_path, monkeypatch) -> None:
    """Corrupted JSON returns 500 + descriptive detail."""
    app, recordings_dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "f" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="corrupt.wav",
        size_bytes=100,
    )
    (recordings_dir / "corrupt.json").write_text("{ not valid json", encoding="utf-8")

    async with _async_client(app) as client:
        resp = await client.get(f"/api/recordings/{asset_hash}/metadata")

    assert resp.status_code == 500
    assert "unreadable" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# GET /api/recordings/{hash}/wav
# ---------------------------------------------------------------------------


async def test_stream_wav_returns_file_with_correct_mime(tmp_path, monkeypatch) -> None:
    app, recordings_dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "1" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="take-streamed.wav",
        size_bytes=44,
    )
    wav_bytes = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 32
    (recordings_dir / "take-streamed.wav").write_bytes(wav_bytes)

    async with _async_client(app) as client:
        resp = await client.get(f"/api/recordings/{asset_hash}/wav")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content == wav_bytes


async def test_stream_wav_unknown_hash_returns_404(tmp_path, monkeypatch) -> None:
    app, _dir = _build_app(tmp_path, monkeypatch)
    async with _async_client(app) as client:
        resp = await client.get("/api/recordings/sha256:nope/wav")
    assert resp.status_code == 404


async def test_stream_wav_missing_file_returns_404(tmp_path, monkeypatch) -> None:
    """Row exists, registry has the hash, but the file isn't on disk."""
    app, _dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "2" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="phantom.wav",
        size_bytes=100,
        source_path="/nowhere/phantom.wav",
    )

    async with _async_client(app) as client:
        resp = await client.get(f"/api/recordings/{asset_hash}/wav")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/recordings/{hash}
# ---------------------------------------------------------------------------


async def test_delete_returns_204_and_drops_row_and_files(tmp_path, monkeypatch) -> None:
    app, recordings_dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "3" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="deletable.wav",
        size_bytes=100,
    )
    wav_path = recordings_dir / "deletable.wav"
    json_path = recordings_dir / "deletable.json"
    wav_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVE")
    json_path.write_text("{}", encoding="utf-8")

    async with _async_client(app) as client:
        resp = await client.delete(f"/api/recordings/{asset_hash}")
    assert resp.status_code == 204

    # Files gone from disk.
    assert not wav_path.exists()
    assert not json_path.exists()

    # Row gone from registry.
    async with database_module.get_session(read_only=True) as session:
        result = await session.execute(
            select(database_module.StateAuthorityAsset).where(
                database_module.StateAuthorityAsset.asset_hash == asset_hash
            )
        )
        assert result.scalar_one_or_none() is None

    # Subsequent list call returns empty.
    async with _async_client(app) as client:
        list_resp = await client.get("/api/recordings")
    assert list_resp.json()["count"] == 0


async def test_delete_unknown_hash_returns_404(tmp_path, monkeypatch) -> None:
    app, _dir = _build_app(tmp_path, monkeypatch)
    async with _async_client(app) as client:
        resp = await client.delete("/api/recordings/sha256:nope")
    assert resp.status_code == 404


async def test_delete_with_missing_files_still_drops_row(tmp_path, monkeypatch) -> None:
    """If the WAV / JSON files don't exist on disk (already cleaned
    up out-of-band), the registry row deletion still succeeds with
    204. A stranded registry row is worse than a stranded file."""
    app, _dir = _build_app(tmp_path, monkeypatch)
    asset_hash = "sha256:" + "4" * 64
    await _seed_recording_row(
        asset_hash=asset_hash,
        file_name="ghost.wav",
        size_bytes=100,
        source_path="/nowhere/ghost.wav",
    )

    async with _async_client(app) as client:
        resp = await client.delete(f"/api/recordings/{asset_hash}")

    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Operation IDs (API contract standards)
# ---------------------------------------------------------------------------


def test_route_operation_ids_are_unique_and_canonical() -> None:
    app = FastAPI()
    app.include_router(router)
    op_ids = [r.operation_id for r in app.routes if hasattr(r, "operation_id")]
    expected = {
        "recordings_list",
        "recordings_get_metadata",
        "recordings_stream_wav",
        "recordings_delete",
    }
    assert expected.issubset(set(op_ids))
    assert len(op_ids) == len(set(op_ids))
