from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import packages as package_routes
from app.services.package_manager import Package, PackageStatus, PackageType


class _FakePackageManager:
    REALTIME_PACKAGES_PIP = ["jack-client", "numpy"]
    REALTIME_PACKAGES_DNF = ["rtkit"]

    def __init__(self, tmp_path: Path) -> None:
        self.ir_paths = [tmp_path / "irs"]
        self.nam_paths = [tmp_path / "nams"]
        self.install_calls: list[tuple[str, PackageType, str | None, str | None]] = []
        self.remove_calls: list[tuple[str, PackageType]] = []
        self.search_args = None
        self.ir_scans = 0
        self.nam_scans = 0
        self.packages = {
            "pip:jack-client": Package(
                name="jack-client",
                type=PackageType.SYSTEM_PIP,
                version="1.0",
                status=PackageStatus.INSTALLED,
                tags=["audio", "realtime"],
            ),
            "dnf:rtkit": Package(
                name="rtkit",
                type=PackageType.SYSTEM_DNF,
                version="0.13",
                status=PackageStatus.AVAILABLE,
                tags=["system"],
            ),
            "nam:edge": Package(
                name="edge",
                type=PackageType.NAM_MODEL,
                version="2.0",
                status=PackageStatus.INSTALLED,
                tags=["amp"],
            ),
        }

    async def scan_all(self, force_rescan: bool):
        return {
            PackageType.SYSTEM_PIP: [self.packages["pip:jack-client"]],
            PackageType.NAM_MODEL: [self.packages["nam:edge"]],
        }

    def get_statistics(self):
        return {"total": 3, "installed": 2}

    def search_packages(self, *, query, package_type, status, tags):
        self.search_args = {
            "query": query,
            "package_type": package_type,
            "status": status,
            "tags": tags,
        }
        return [self.packages["pip:jack-client"]]

    def get_package(self, package_name: str, package_type: PackageType):
        return self.packages.get(f"{package_type.value}:{package_name}")

    async def install_package(self, package_name: str, package_type: PackageType, source_url=None, source_path=None):
        self.install_calls.append((package_name, package_type, source_url, source_path))
        return package_name != "numpy"

    async def remove_package(self, package_name: str, package_type: PackageType):
        self.remove_calls.append((package_name, package_type))
        return True

    async def scan_ir_files(self):
        self.ir_scans += 1

    async def scan_nam_models(self):
        self.nam_scans += 1


def _build_client(monkeypatch, manager: _FakePackageManager) -> TestClient:
    app = FastAPI()
    app.include_router(package_routes.router)
    monkeypatch.setattr(package_routes, "package_manager", manager)
    return TestClient(app)


def test_package_inventory_routes_scan_list_info_and_stats(monkeypatch, tmp_path):
    manager = _FakePackageManager(tmp_path)
    client = _build_client(monkeypatch, manager)

    scan = client.post("/api/packages/scan?force_rescan=true")
    listing = client.get(
        "/api/packages/list",
        params={"package_type": "pip", "status": "installed", "query": "jack", "tags": "audio,realtime"},
    )
    stats = client.get("/api/packages/statistics")
    info = client.get("/api/packages/pip/jack-client")

    assert scan.status_code == 200
    assert scan.json() == {
        "status": "success",
        "packages_by_type": {
            "pip": [manager.packages["pip:jack-client"].to_dict()],
            "nam": [manager.packages["nam:edge"].to_dict()],
        },
        "statistics": {"total": 3, "installed": 2},
    }
    assert listing.status_code == 200
    assert listing.json() == {
        "packages": [manager.packages["pip:jack-client"].to_dict()],
        "count": 1,
    }
    assert manager.search_args == {
        "query": "jack",
        "package_type": PackageType.SYSTEM_PIP,
        "status": PackageStatus.INSTALLED,
        "tags": ["audio", "realtime"],
    }
    assert stats.status_code == 200
    assert stats.json() == {"total": 3, "installed": 2}
    assert info.status_code == 200
    assert info.json() == manager.packages["pip:jack-client"].to_dict()


def test_package_install_remove_and_upload_routes(monkeypatch, tmp_path):
    manager = _FakePackageManager(tmp_path)
    client = _build_client(monkeypatch, manager)

    invalid_install = client.post(
        "/api/packages/install",
        json={"package_name": "new-lv2", "package_type": "lv2"},
    )
    install = client.post(
        "/api/packages/install",
        json={"package_name": "jack-client", "package_type": "pip"},
    )
    remove = client.post(
        "/api/packages/remove",
        json={"package_name": "jack-client", "package_type": "pip"},
    )
    upload_ir = client.post(
        "/api/packages/upload/ir",
        data={"file_type": "cabinet"},
        files={"file": ("cab.wav", b"wave-data", "audio/wav")},
    )
    upload_nam = client.post(
        "/api/packages/upload/nam",
        files={"file": ("edge.nam", b"nam-data", "application/octet-stream")},
    )

    assert invalid_install.status_code == 400
    assert invalid_install.json() == {"detail": "source_url or source_path required for type: lv2"}
    assert install.status_code == 200
    assert install.json() == {"status": "success", "message": "Installed jack-client"}
    assert remove.status_code == 200
    assert remove.json() == {"status": "success", "message": "Removed jack-client"}
    assert upload_ir.status_code == 200
    assert upload_ir.json() == {
        "status": "success",
        "message": "Uploaded cab.wav",
        "path": str(tmp_path / "irs" / "cabinets" / "cab.wav"),
    }
    assert upload_nam.status_code == 200
    assert upload_nam.json() == {
        "status": "success",
        "message": "Uploaded edge.nam",
        "path": str(tmp_path / "nams" / "edge.nam"),
    }
    assert manager.install_calls == [("jack-client", PackageType.SYSTEM_PIP, None, None)]
    assert manager.remove_calls == [("jack-client", PackageType.SYSTEM_PIP)]
    assert manager.ir_scans == 1
    assert manager.nam_scans == 1


def test_realtime_package_routes_summarize_existing_and_partial_installs(monkeypatch, tmp_path):
    manager = _FakePackageManager(tmp_path)
    client = _build_client(monkeypatch, manager)

    realtime = client.get("/api/packages/realtime-packages")
    install = client.post("/api/packages/install-realtime-deps")

    assert realtime.status_code == 200
    assert realtime.json() == {
        "pip_packages": [manager.packages["pip:jack-client"].to_dict()],
        "dnf_packages": [manager.packages["dnf:rtkit"].to_dict()],
        "total": 2,
    }
    assert install.status_code == 200
    assert install.json() == {
        "status": "partial",
        "results": {
            "pip": {
                "success": ["jack-client"],
                "failed": ["numpy"],
            },
            "dnf": {
                "success": ["rtkit"],
                "failed": [],
            },
        },
        "summary": {
            "total_success": 2,
            "total_failed": 1,
        },
    }
