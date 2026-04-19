from __future__ import annotations

import asyncio

import pytest

from app.services.maschine.admin_console import MaschineAdminConsoleService


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.start_calls = 0
        self.stop_calls = 0

    async def start_all(self):
        self.start_calls += 1
        return {"audio": True, "midi": True}

    async def stop_all(self):
        self.stop_calls += 1
        return {"audio": True, "midi": False}


class _FakeUpdateManager:
    def __init__(self) -> None:
        self.calls = 0

    async def trigger_full_update(self, *, update_system, update_application, version, node_id):
        self.calls += 1
        return {
            "status": "ok",
            "message": "Full update completed",
            "success": True,
        }


@pytest.mark.asyncio
async def test_admin_console_unlock_select_and_cancel_reset_confirmation():
    service = MaschineAdminConsoleService()

    snapshot = await service.confirm()
    assert snapshot["session_unlocked"] is True
    assert snapshot["confirmation_progress"] == 0

    snapshot = await service.select_relative(1)
    assert snapshot["selected_action_index"] == 1

    snapshot = await service.confirm()
    assert snapshot["confirmation_progress"] == 1

    snapshot = await service.cancel()
    assert snapshot["confirmation_progress"] == 0
    assert snapshot["session_unlocked"] is True


@pytest.mark.asyncio
async def test_admin_console_systemctl_action_runs_after_three_confirms():
    commands: list[tuple[str, ...]] = []

    async def _runner(command: tuple[str, ...]) -> tuple[int, str, str]:
        commands.append(command)
        await asyncio.sleep(0)
        return 0, "restarted", ""

    service = MaschineAdminConsoleService(command_runner=_runner)

    await service.unlock()
    await service.confirm()
    await service.confirm()
    snapshot = await service.confirm()
    assert snapshot["busy"] is True
    await service.wait_for_idle()

    final_snapshot = service.snapshot()
    assert commands == [("sudo", "-n", "systemctl", "restart", "map2-backend.service")]
    assert final_snapshot["busy"] is False
    assert final_snapshot["last_result"]["status"] == "completed"


@pytest.mark.asyncio
async def test_admin_console_orchestrator_and_update_actions_use_backend_services():
    orchestrator = _FakeOrchestrator()
    update_manager = _FakeUpdateManager()
    service = MaschineAdminConsoleService(
        command_runner=lambda _command: asyncio.sleep(0, result=(0, "", "")),
        orchestrator_provider=lambda: orchestrator,
        update_manager_provider=lambda: update_manager,
    )

    await service.unlock()
    await service.select_relative(3)
    await service.confirm()
    await service.confirm()
    await service.confirm()
    await service.wait_for_idle()
    assert orchestrator.start_calls == 1
    assert service.snapshot()["last_result"]["status"] == "completed"

    await service.select_relative(2)
    await service.confirm()
    await service.confirm()
    await service.confirm()
    await service.wait_for_idle()
    assert update_manager.calls == 1
    assert service.snapshot()["last_result"]["status"] == "completed"


def test_maschine_admin_sudoers_contract_and_installer_hook_exist():
    sudoers_text = open("config/sudoers/map2-maschine-admin", "r", encoding="utf-8").read()
    installer_text = open("scripts/install-node.sh", "r", encoding="utf-8").read()

    assert "map2-backend.service" in sudoers_text
    assert "map2-web-prod.service" in sudoers_text
    assert "map2-maschine.service" in sudoers_text
    assert "systemctl reboot" in sudoers_text
    assert "install_maschine_admin_sudoers" in installer_text
    assert "/etc/sudoers.d/map2-maschine-admin" in installer_text
