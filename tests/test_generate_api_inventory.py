from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi import FastAPI, WebSocket

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "generate_api_inventory.py"
SPEC = importlib.util.spec_from_file_location("generate_api_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_build_inventory_detects_duplicates_websockets_and_event_types(tmp_path):
    app = FastAPI()

    @app.get("/items", tags=["items"], operation_id="shared_operation")
    async def list_items():
        return {"items": []}

    @app.post("/widgets", tags=["widgets"], operation_id="shared_operation")
    async def create_widget():
        return {"ok": True}

    @app.websocket("/ws/updates")
    async def updates_socket(websocket: WebSocket):
        await websocket.accept()
        await websocket.send_json({"type": "meter_update", "value": 1})

    source_root = tmp_path / "app"
    source_root.mkdir()
    (source_root / "sample.py").write_text(
        "def emit_update(manager):\n"
        "    manager.broadcast({'type': 'meter_update', 'payload': 1})\n"
        "    manager.notify(payload={'event': 'snapshot_ready'})\n",
        encoding="utf-8",
    )

    inventory = MODULE.build_inventory(app, source_root=source_root)

    assert inventory["summary"]["openapi_path_count"] == 2
    assert inventory["summary"]["http_operation_count"] == 2
    assert inventory["summary"]["websocket_route_count"] == 1
    assert inventory["summary"]["duplicate_operation_id_count"] == 1
    assert inventory["event_message_type_counts"]["meter_update"] == 1
    assert inventory["event_message_type_counts"]["snapshot_ready"] == 1
    assert inventory["duplicate_operation_ids"][0]["operation_id"] == "shared_operation"
    assert inventory["duplicate_operation_ids"][0]["routes"][0]["path"] == "/items"
    assert inventory["websocket_routes"][0]["path"] == "/ws/updates"

    markdown = MODULE.render_markdown(inventory)
    assert "MAP2 API Surface Inventory" in markdown
    assert "`shared_operation`" in markdown
    assert "`meter_update`" in markdown
