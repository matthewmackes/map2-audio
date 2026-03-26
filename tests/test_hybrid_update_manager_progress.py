import pytest

from app.services.cluster.hybrid_update_manager import (
    HybridUpdateConfig,
    HybridUpdateManager,
    UpdateEnvironment,
    UpdateMode,
)
from app.services.cluster.map2_git_updater import UpdateResult


class FakeGitUpdater:
    async def update_application(self, *, branch="main", node_id=None, validate=True, progress_callback=None):
        if progress_callback:
            progress_callback("validate-source", "running", "Validating repository state")
            progress_callback("validate-source", "completed", "Repository validation passed")
            progress_callback("prepare-local-state", "running", "Stashing local changes")
            progress_callback("prepare-local-state", "completed", "Stashed local changes")
            progress_callback("fetch-update-payload", "running", f"Fetching branch {branch}")
            progress_callback("fetch-update-payload", "completed", f"Fetched origin/{branch}")
            progress_callback("apply-target-version", "running", f"Checking out origin/{branch}")
            progress_callback("apply-target-version", "completed", f"Checked out origin/{branch}")
            progress_callback("refresh-runtime-dependencies", "running", "Refreshing Python dependencies")
            progress_callback("refresh-runtime-dependencies", "completed", "Python dependencies refreshed")
            progress_callback("refresh-frontend-dependencies", "running", "Refreshing frontend dependencies")
            progress_callback("refresh-frontend-dependencies", "completed", "Frontend dependencies refreshed")
            progress_callback("rebuild-frontend-assets", "running", "Building frontend bundle")
            progress_callback("rebuild-frontend-assets", "completed", "Frontend build completed")
            progress_callback("validate-and-finalize", "running", "Running post-update validation checks")
            progress_callback("validate-and-finalize", "completed", "Validation passed on commit def67890")

        return UpdateResult(
            success=True,
            commit_before="abc12345",
            commit_after="def67890",
            message="Updated from abc12345 to def67890",
            duration_seconds=12.5,
        )

    async def get_current_branch(self, node_id=None):
        return "master"


def _make_manager() -> HybridUpdateManager:
    manager = HybridUpdateManager(
        HybridUpdateConfig(
            mode=UpdateMode.GIT,
            environment=UpdateEnvironment.DEVELOPMENT,
            app_path="/tmp/map2-audio",
        )
    )
    manager.git_updater = FakeGitUpdater()
    manager.mode = UpdateMode.GIT
    return manager


def test_application_status_exposes_ten_pending_questions_when_idle():
    manager = _make_manager()
    manager.get_current_version = lambda node_id=None: "abc12345"  # type: ignore[method-assign]
    manager.application_progress = manager._make_idle_progress()

    status = manager.get_application_status()

    assert status["status"] == "idle"
    assert status["running"] is False
    assert len(status["steps"]) == 10
    assert all(step["status"] == "pending" for step in status["steps"])


@pytest.mark.asyncio
async def test_trigger_application_update_tracks_all_ten_progress_steps():
    manager = _make_manager()
    current_versions = iter(["abc12345", "abc12345", "def67890"])
    manager.get_current_version = lambda node_id=None: next(current_versions, "def67890")  # type: ignore[method-assign]

    result = await manager.trigger_application_update(branch="master")
    status = manager.get_application_status()

    assert result["status"] == "ok"
    assert status["status"] == "completed"
    assert status["running"] is False
    assert status["current_step_key"] == "validate-and-finalize"
    assert status["current_step_index"] == 9
    assert status["current_version"] == "def67890"
    assert len(status["steps"]) == 10
    assert all(step["status"] == "completed" for step in status["steps"])
    assert status["message"] == "Updated from abc12345 to def67890"
