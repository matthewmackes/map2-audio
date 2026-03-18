from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import system


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(system.router)
    return TestClient(app)


def test_docs_list_includes_recursive_metadata(tmp_path, monkeypatch):
    docs_root = tmp_path / "docs"
    (docs_root / "midi").mkdir(parents=True)
    (docs_root / "README.md").write_text("# Welcome\n\nPlatform orientation guide.\n", encoding="utf-8")
    (docs_root / "midi" / "CLOCK_SYNC.md").write_text(
        "# Clock Sync\n\nUse this guide for transport alignment.\n\n## MIDI Clock\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(system, "_DOCS_ROOT", docs_root)
    client = _build_client()

    response = client.get("/api/system/docs/list")

    assert response.status_code == 200
    payload = response.json()
    assert any(entry["name"] == "README.md" and entry["title"] == "Welcome" for entry in payload)
    assert any(
        entry["name"] == "midi/CLOCK_SYNC.md"
        and entry["category"] == "Midi"
        and "MIDI Clock" in entry["headings"]
        for entry in payload
    )


def test_docs_route_reads_nested_markdown_and_blocks_traversal(tmp_path, monkeypatch):
    docs_root = tmp_path / "docs"
    (docs_root / "guides").mkdir(parents=True)
    (docs_root / "guides" / "SETUP.md").write_text("# Setup\n\nNested guide.\n", encoding="utf-8")
    monkeypatch.setattr(system, "_DOCS_ROOT", docs_root)
    client = _build_client()

    response = client.get("/api/system/docs/guides/SETUP.md")
    blocked = client.get("/api/system/docs/%2E%2E%2Fsecret.md")

    assert response.status_code == 200
    assert "Nested guide." in response.text
    assert blocked.status_code == 400
