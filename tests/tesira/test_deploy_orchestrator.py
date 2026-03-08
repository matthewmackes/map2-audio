import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app import database as database_module
from app.services.tesira.tesira_deploy_orchestrator import TesiraDeployOrchestrator
import app.services.tesira as tesira_services


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'tesira-deploy-orchestrator.db'}")


async def _await_terminal(orchestrator: TesiraDeployOrchestrator, job_id: str):
    for _ in range(100):
        job = await orchestrator.get_job(job_id)
        if job and job["status"] in {"succeeded", "failed", "rolled_back"}:
            return job
        await asyncio.sleep(0.02)
    return await orchestrator.get_job(job_id)


def test_deploy_orchestrator_dry_run_success(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    fake_device = SimpleNamespace(
        connected=True,
        host="172.20.146.237",
        get_info=AsyncMock(
            return_value={
                "hostname": "tesira-a",
                "serial_number": "SN123",
                "firmware_version": "5.0.0",
            }
        ),
        get_ptp_status=AsyncMock(return_value={"state": "SLAVE"}),
    )
    fake_fleet = SimpleNamespace(get_device=lambda _device_id: fake_device)
    fake_catalog = SimpleNamespace(
        get_layout=AsyncMock(
            return_value={"layout_id": "forte_ci_default", "version": "1.0.0", "checksum": "sha:1"}
        )
    )
    fake_sagevue = SimpleNamespace(deploy_layout=AsyncMock(return_value={"job_id": "sv1"}))

    monkeypatch.setattr(tesira_services, "get_tesira_fleet", lambda: fake_fleet)
    monkeypatch.setattr(tesira_services, "get_tesira_layout_catalog", lambda: fake_catalog)
    monkeypatch.setattr(tesira_services, "get_tesira_sagevue_client", lambda: fake_sagevue)

    orchestrator = TesiraDeployOrchestrator()

    async def _run():
        created = await orchestrator.start_deployment(
            device_id="tesira_SN123",
            layout_id="forte_ci_default",
            layout_version="1.0.0",
            dry_run=True,
            requested_by="test",
            rollback_layout_id="forte_ci_backup",
            rollback_layout_version="0.9.0",
        )
        assert created["status"] == "queued"

        completed = await _await_terminal(orchestrator, created["job_id"])
        assert completed is not None
        assert completed["status"] == "succeeded"
        assert completed["stage"] == "commit"
        stages = [evt["stage"] for evt in completed["events"]]
        assert "preflight" in stages
        assert "deploy" in stages
        assert "verify" in stages
        assert "commit" in stages

    asyncio.run(_run())
    fake_sagevue.deploy_layout.assert_not_called()


def test_deploy_orchestrator_fails_when_device_missing(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    fake_fleet = SimpleNamespace(get_device=lambda _device_id: None)
    fake_catalog = SimpleNamespace(
        get_layout=AsyncMock(return_value={"layout_id": "forte_ci_default", "version": "1.0.0", "checksum": "sha:1"})
    )
    fake_sagevue = SimpleNamespace(deploy_layout=AsyncMock(return_value={"job_id": "sv1"}))

    monkeypatch.setattr(tesira_services, "get_tesira_fleet", lambda: fake_fleet)
    monkeypatch.setattr(tesira_services, "get_tesira_layout_catalog", lambda: fake_catalog)
    monkeypatch.setattr(tesira_services, "get_tesira_sagevue_client", lambda: fake_sagevue)

    orchestrator = TesiraDeployOrchestrator()

    async def _run():
        created = await orchestrator.start_deployment(
            device_id="tesira_missing",
            layout_id="forte_ci_default",
            layout_version="1.0.0",
            dry_run=False,
        )
        completed = await _await_terminal(orchestrator, created["job_id"])
        assert completed is not None
        assert completed["status"] == "failed"
        assert "not found" in (completed["error_detail"] or "").lower()

    asyncio.run(_run())


def test_deploy_orchestrator_rollback_path(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    fake_device = SimpleNamespace(
        connected=True,
        host="172.20.146.237",
        get_info=AsyncMock(return_value={"hostname": "tesira-a"}),
        get_ptp_status=AsyncMock(return_value={"state": "MASTER"}),
    )
    fake_fleet = SimpleNamespace(get_device=lambda _device_id: fake_device)
    fake_catalog = SimpleNamespace(
        get_layout=AsyncMock(return_value={"layout_id": "forte_ci_default", "version": "1.0.0", "checksum": "sha:1"})
    )
    fake_sagevue = SimpleNamespace(deploy_layout=AsyncMock(return_value={"job_id": "sv-rollback"}))

    monkeypatch.setattr(tesira_services, "get_tesira_fleet", lambda: fake_fleet)
    monkeypatch.setattr(tesira_services, "get_tesira_layout_catalog", lambda: fake_catalog)
    monkeypatch.setattr(tesira_services, "get_tesira_sagevue_client", lambda: fake_sagevue)

    orchestrator = TesiraDeployOrchestrator()

    async def _run():
        created = await orchestrator.start_deployment(
            device_id="tesira_SN123",
            layout_id="forte_ci_default",
            layout_version="1.0.0",
            dry_run=True,
            rollback_layout_id="forte_ci_backup",
            rollback_layout_version="0.9.0",
        )
        completed = await _await_terminal(orchestrator, created["job_id"])
        assert completed is not None
        assert completed["status"] == "succeeded"

        rolled = await orchestrator.rollback_job(job_id=created["job_id"], requested_by="tester")
        assert rolled["status"] == "rolled_back"
        assert rolled["stage"] == "rollback"

    asyncio.run(_run())
