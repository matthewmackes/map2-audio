from __future__ import annotations

import pytest

from app.routes import avb


@pytest.mark.asyncio
async def test_apply_avb_setup_uses_noninteractive_script_and_returns_status(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_run(script_name: str, *args: str, timeout: int = 900):
        captured["script_name"] = script_name
        captured["args"] = args
        captured["timeout"] = timeout
        return {"ok": True, "command": ["bash", script_name, *args], "returncode": 0, "stdout": "ok", "stderr": ""}

    async def fake_status():
        return {"state": "configured", "interface": "enp2s0"}

    monkeypatch.setattr(avb, "_run_avb_setup_script", fake_run)
    monkeypatch.setattr(avb, "get_avb_status", fake_status)

    payload = await avb.apply_avb_setup(avb.AVBSetupRequest(interface="enp2s0", dry_run=True, auto_yes=True))

    assert captured["script_name"] == "setup_avb.sh"
    assert captured["args"] == ("--yes", "--interface", "enp2s0", "--dry-run")
    assert payload["ok"] is True
    assert payload["status"]["interface"] == "enp2s0"


@pytest.mark.asyncio
async def test_apply_avb_ptp_setup_uses_noninteractive_script_and_returns_status(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_run(script_name: str, *args: str, timeout: int = 900):
        captured["script_name"] = script_name
        captured["args"] = args
        captured["timeout"] = timeout
        return {"ok": True, "command": ["bash", script_name, *args], "returncode": 0, "stdout": "ok", "stderr": ""}

    async def fake_ptp():
        return {"available": True, "port_state": "MASTER"}

    async def fake_tsn():
        return {"available": True, "mqprio_configured": True}

    monkeypatch.setattr(avb, "_run_avb_setup_script", fake_run)
    monkeypatch.setattr(avb, "get_ptp_status", fake_ptp)
    monkeypatch.setattr(avb, "get_tsn_status", fake_tsn)

    payload = await avb.apply_avb_ptp_setup(
        avb.AVBPTPSetupRequest(interface="enp3s0", domain=5, priority=64, dry_run=False, auto_yes=True)
    )

    assert captured["script_name"] == "setup_avb_ptp.sh"
    assert captured["args"] == ("--yes", "--interface", "enp3s0", "--domain", "5", "--priority", "64")
    assert payload["ok"] is True
    assert payload["ptp"]["port_state"] == "MASTER"
    assert payload["tsn"]["mqprio_configured"] is True
