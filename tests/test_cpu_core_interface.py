"""Pytest checks for CPU core configuration interface wiring."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYSTEM_ROUTES = PROJECT_ROOT / "app" / "routes" / "system.py"
CPU_OVERVIEW = PROJECT_ROOT / "web" / "src" / "app" / "components" / "CPUStatusOverview.tsx"
CORE_MANAGER = PROJECT_ROOT / "web" / "src" / "app" / "components" / "CoreAssignmentManager.tsx"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_system_route_file_exists():
    assert SYSTEM_ROUTES.exists(), "app/routes/system.py not found"


def test_system_routes_expose_cpu_config_endpoints():
    content = _read(SYSTEM_ROUTES)
    assert '@router.get("/core-config")' in content
    assert '@router.post("/core-config")' in content
    assert '@router.post("/core-assignments")' in content
    assert '@router.get("/cpu-info")' in content
    assert '@router.get("/realtime-capabilities")' in content


def test_frontend_cpu_components_exist():
    assert CPU_OVERVIEW.exists(), "CPUStatusOverview.tsx not found"
    if not CORE_MANAGER.exists():
        content = _read(CPU_OVERVIEW)
        assert "handleSaveCore" in content, "Core management UI not found"


def test_cpu_overview_uses_real_api_paths():
    content = _read(CPU_OVERVIEW)
    assert "/api/system/core-config" in content
    assert "/api/system/core-assignments" in content


def test_cpu_overview_has_edit_and_save_flow():
    content = _read(CPU_OVERVIEW)
    assert "handleSaveCore" in content
    assert "editingCoreId" in content
    assert "priority" in content
    assert "isolated" in content
