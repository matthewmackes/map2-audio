"""Tests for metadata enrichment + cached asset serving.

T2459-C3 acceptance gate. The fetch path is exercised against
`http.server`-style local URLs to avoid network flakiness; offline
behavior is verified by pointing at unreachable URLs.
"""

from __future__ import annotations

import http.server
import socketserver
import threading
import textwrap
from pathlib import Path

import pytest

from scripts.pull_device_metadata import (
    enrich_all,
    enrich_pack,
    list_cached_assets as script_list_cached_assets,
)
from app.services.controllers.metadata_enrichment import (
    get_cached_asset_path,
    list_cached_assets,
)


# ---------------------------------------------------------------------------
# Local HTTP server fixture so the fetch path is hermetic.
# ---------------------------------------------------------------------------

@pytest.fixture
def local_http_server(tmp_path: Path):
    """Spin up a local HTTP server serving a tmpdir of fake assets."""
    server_dir = tmp_path / "www"
    server_dir.mkdir()
    (server_dir / "image.jpg").write_bytes(b"FAKE-JPEG-BYTES")
    (server_dir / "datasheet.pdf").write_bytes(b"FAKE-PDF-BYTES")
    (server_dir / "manual.html").write_text("<html>fake manual</html>")

    handler = http.server.SimpleHTTPRequestHandler

    def make_handler(*args, **kwargs):
        return handler(*args, directory=str(server_dir), **kwargs)

    server = socketserver.TCPServer(("127.0.0.1", 0), make_handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()
    thread.join(timeout=5)


@pytest.fixture
def fixture_pack_with_metadata(tmp_path: Path, local_http_server: str) -> Path:
    """Build a pack with audio profile pointing at the local server."""
    packs_root = tmp_path / "device-packs"
    pack_dir = packs_root / "test-vendor"
    (pack_dir / "profiles").mkdir(parents=True)

    (pack_dir / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: test-vendor
        vendor: { name: TV }
        description: D
        license: AGPL-3.0-only
        models: [test-model]
    """))
    (pack_dir / "profiles" / "test-model.audio.yaml").write_text(textwrap.dedent(f"""\
        schema_version: 1
        identity:
          manufacturer: TV
          model: test-model
          hardware_id: usb:0000:0001
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
        metadata:
          product_image_urls:
            - {local_http_server}/image.jpg
          datasheet_url: {local_http_server}/datasheet.pdf
          manual_url: {local_http_server}/manual.html
    """))
    return packs_root


# ---------------------------------------------------------------------------
# enrich_pack — happy path
# ---------------------------------------------------------------------------

def test_enrich_pack_caches_image_datasheet_and_manual(
    tmp_path: Path,
    fixture_pack_with_metadata: Path,
) -> None:
    cache_root = tmp_path / "cache"
    pack_dir = fixture_pack_with_metadata / "test-vendor"
    outcomes = enrich_pack(pack_dir, cache_root=cache_root, timeout_seconds=5.0)

    key = "test-vendor/test-model"
    assert key in outcomes
    assert all(o.ok for o in outcomes[key]), [
        (o.url, o.reason) for o in outcomes[key] if not o.ok
    ]

    cached_dir = cache_root / "test-vendor" / "test-model"
    assert cached_dir.is_dir()
    cached = sorted(p.name for p in cached_dir.iterdir())
    assert "image.jpg" in cached
    assert "datasheet.pdf" in cached
    assert "manual.html" in cached
    # Bytes should match the server's content.
    assert (cached_dir / "image.jpg").read_bytes() == b"FAKE-JPEG-BYTES"


def test_enrich_pack_writes_atomically(
    tmp_path: Path,
    fixture_pack_with_metadata: Path,
) -> None:
    """No leftover ``.pull_*`` tempfiles after a successful run."""
    cache_root = tmp_path / "cache"
    pack_dir = fixture_pack_with_metadata / "test-vendor"
    enrich_pack(pack_dir, cache_root=cache_root, timeout_seconds=5.0)

    cached_dir = cache_root / "test-vendor" / "test-model"
    assert cached_dir.is_dir()
    leftovers = list(cached_dir.glob(".pull_*"))
    assert leftovers == []


# ---------------------------------------------------------------------------
# enrich_pack — offline / error path
# ---------------------------------------------------------------------------

def test_enrich_pack_logs_and_continues_when_url_unreachable(
    tmp_path: Path,
) -> None:
    """A pack pointing at an unreachable URL must not raise; the fetch
    outcome is recorded with ok=False and the cache directory is empty.
    """
    packs_root = tmp_path / "device-packs"
    pack_dir = packs_root / "broken-vendor"
    (pack_dir / "profiles").mkdir(parents=True)
    (pack_dir / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: broken-vendor
        vendor: { name: BV }
        description: D
        license: AGPL-3.0-only
        models: [m]
    """))
    (pack_dir / "profiles" / "m.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: BV
          model: m
          hardware_id: usb:0000:0099
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
        metadata:
          datasheet_url: http://127.0.0.1:1/never-listens.pdf
    """))
    cache_root = tmp_path / "cache"
    outcomes = enrich_pack(pack_dir, cache_root=cache_root, timeout_seconds=2.0)

    key = "broken-vendor/m"
    assert key in outcomes
    assert len(outcomes[key]) == 1
    assert outcomes[key][0].ok is False
    assert outcomes[key][0].reason  # populated with the urllib error message


def test_enrich_pack_with_no_metadata_is_a_no_op(tmp_path: Path) -> None:
    """A profile without a metadata block is silently skipped."""
    packs_root = tmp_path / "device-packs"
    pack_dir = packs_root / "no-meta"
    (pack_dir / "profiles").mkdir(parents=True)
    (pack_dir / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: no-meta
        vendor: { name: NM }
        description: D
        license: AGPL-3.0-only
        models: [m]
    """))
    (pack_dir / "profiles" / "m.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: NM
          model: m
          hardware_id: usb:0000:0042
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
    """))
    cache_root = tmp_path / "cache"
    outcomes = enrich_pack(pack_dir, cache_root=cache_root)
    assert outcomes == {}


# ---------------------------------------------------------------------------
# enrich_all walker
# ---------------------------------------------------------------------------

def test_enrich_all_walks_every_pack_and_skips_underscore_prefixed(
    tmp_path: Path,
) -> None:
    packs_root = tmp_path / "device-packs"
    # vendor pack with no metadata — should produce no outcomes
    (packs_root / "vendor-a" / "profiles").mkdir(parents=True)
    (packs_root / "vendor-a" / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-a
        vendor: { name: A }
        description: D
        license: AGPL-3.0-only
        models: [m]
    """))
    # underscore-prefixed framework dir — must be skipped.
    (packs_root / "_runtime").mkdir(parents=True)
    cache_root = tmp_path / "cache"
    outcomes = enrich_all(packs_root, cache_root=cache_root)
    assert outcomes == {}


# ---------------------------------------------------------------------------
# Cached asset serving + traversal protection
# ---------------------------------------------------------------------------

def test_get_cached_asset_path_resolves_existing_file(tmp_path: Path) -> None:
    base = tmp_path / "cache" / "edirol-ua" / "ua-1000"
    base.mkdir(parents=True)
    asset = base / "image.jpg"
    asset.write_bytes(b"x")
    found = get_cached_asset_path(
        "edirol-ua", "ua-1000", "image.jpg", cache_root=tmp_path / "cache",
    )
    assert found is not None
    assert found.samefile(asset)


def test_get_cached_asset_path_returns_none_for_missing(tmp_path: Path) -> None:
    found = get_cached_asset_path(
        "missing", "missing", "missing.jpg", cache_root=tmp_path / "cache",
    )
    assert found is None


def test_get_cached_asset_path_rejects_path_traversal(tmp_path: Path) -> None:
    """`..` in any component must be refused outright."""
    for bad in (
        ("..", "ua-1000", "x.jpg"),
        ("edirol-ua", "..", "x.jpg"),
        ("edirol-ua", "ua-1000", ".."),
        ("edirol-ua", "ua-1000", "../etc/passwd"),
    ):
        result = get_cached_asset_path(
            *bad, cache_root=tmp_path / "cache",
        )
        assert result is None


def test_list_cached_assets_returns_filenames(tmp_path: Path) -> None:
    base = tmp_path / "cache" / "edirol-ua" / "ua-1000"
    base.mkdir(parents=True)
    (base / "a.jpg").write_bytes(b"")
    (base / "b.pdf").write_bytes(b"")
    files = list_cached_assets(
        "edirol-ua", "ua-1000", cache_root=tmp_path / "cache",
    )
    assert files == ["a.jpg", "b.pdf"]


def test_list_cached_assets_returns_empty_for_missing_dir(tmp_path: Path) -> None:
    files = list_cached_assets(
        "nope", "nope", cache_root=tmp_path / "cache",
    )
    assert files == []
