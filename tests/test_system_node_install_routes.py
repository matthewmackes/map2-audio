from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routes import system


@pytest.mark.asyncio
async def test_apply_node_install_passes_structured_payload_to_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_run(config, *, dry_run: bool, auto_yes: bool):
        captured["config"] = config
        captured["dry_run"] = dry_run
        captured["auto_yes"] = auto_yes
        return {"ok": True, "returncode": 0, "stdout": "ok", "stderr": ""}

    monkeypatch.setattr(system, "_run_node_install", fake_run)

    payload = await system.apply_node_install(
        {
            "config": {"node_id": "node-a", "node_name": "Node A", "install_mode": "rpm"},
            "dry_run": True,
            "auto_yes": False,
        }
    )

    assert captured["config"]["node_id"] == "node-a"
    assert captured["dry_run"] is True
    assert captured["auto_yes"] is False
    assert payload["ok"] is True


@pytest.mark.asyncio
async def test_apply_node_install_requires_config_object() -> None:
    with pytest.raises(HTTPException) as exc:
        await system.apply_node_install({"config": "invalid"})

    assert exc.value.status_code == 400
