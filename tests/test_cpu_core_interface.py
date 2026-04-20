"""Pytest checks for CPU core configuration interface wiring."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYSTEM_ROUTES = PROJECT_ROOT / "app" / "routes" / "system.py"
SYSTEM_ARCHITECTURE = PROJECT_ROOT / "web" / "src" / "app" / "components" / "SystemArchitectureFlow.tsx"


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
    assert SYSTEM_ARCHITECTURE.exists(), "SystemArchitectureFlow.tsx not found"


def test_cpu_overview_uses_real_api_paths():
    content = _read(SYSTEM_ARCHITECTURE)
    assert "/api/system/core-config" in content
    assert "/api/system-tests/test/juce-engine/latest" in content


def test_cpu_overview_has_edit_and_save_flow():
    content = _read(SYSTEM_ARCHITECTURE)
    assert "SCHED_FIFO" in content
    assert "priority" in content
    assert "utilization" in content
