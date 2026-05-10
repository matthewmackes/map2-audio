"""T2499 mega-epic Phase 0.2/0.3 — Configurator per-device routes.

Validates the kind-agnostic per-pack routes:
  - GET/PUT/DELETE /api/devices/configurator/{pack_id}/overrides
  - GET            /api/devices/configurator/{pack_id}/learn/last-event

These routes are thin wrappers over the framework registry: each
pack registers its own ``OverrideStore`` and ``LearnEventSource``
implementations, and the routes route through them.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator, Mapping

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.devices._shared import (
    ConfiguratorRegistration,
    DeviceConfiguratorRegistry,
    DeviceLearnEventSnapshot,
    LearnEventSource,
    YamlOverrideStore,
)
from app.services.devices._shared.registry import get_default_registry


@pytest.fixture
def isolated_registry(monkeypatch) -> Iterator[DeviceConfiguratorRegistry]:
    """Replace the process-wide singleton with a fresh registry so
    tests can register packs without leaking into other suites."""
    fresh = DeviceConfiguratorRegistry()
    monkeypatch.setattr(
        "app.routes.configurator_devices.get_default_registry",
        lambda: fresh,
    )
    yield fresh


@pytest.fixture
def app(isolated_registry: DeviceConfiguratorRegistry) -> FastAPI:
    from app.routes import configurator_devices

    application = FastAPI()
    application.include_router(configurator_devices.router)
    return application


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def yaml_dir(tmp_path: Path) -> Path:
    return tmp_path / "devices"


def _register_pack(
    registry: DeviceConfiguratorRegistry,
    *,
    pack_id: str,
    yaml_dir: Path,
    learn_source: "LearnEventSource | None" = None,
) -> None:
    store = YamlOverrideStore(pack_id=pack_id, slug="overrides", directory=yaml_dir)
    registry.register(
        ConfiguratorRegistration(
            pack_id=pack_id,
            display_name=pack_id.replace("_", " ").title(),
            override_store=store,
            learn_event_source=learn_source,
        )
    )


class _FakeLearnEventSource:
    """LearnEventSource stub backed by a mutable list of snapshots."""

    def __init__(self) -> None:
        self.snapshot = DeviceLearnEventSnapshot(sequence=0, observed_at=None, event=None)

    def push(self, *, event: Mapping[str, Any], observed_at: float) -> None:
        self.snapshot = DeviceLearnEventSnapshot(
            sequence=self.snapshot.sequence + 1,
            observed_at=observed_at,
            event=event,
        )

    def last_event(self) -> DeviceLearnEventSnapshot:
        return self.snapshot


# ---------------------------------------------------------------------------
# Overrides routes
# ---------------------------------------------------------------------------


class TestOverridesRoutes:
    def test_get_returns_404_for_unregistered_pack(self, client: TestClient) -> None:
        response = client.get("/api/devices/configurator/nonexistent/overrides")
        assert response.status_code == 404
        assert "nonexistent" in response.json()["detail"]

    def test_get_returns_404_when_pack_has_no_override_store(
        self, client: TestClient, isolated_registry: DeviceConfiguratorRegistry
    ) -> None:
        isolated_registry.register(
            ConfiguratorRegistration(
                pack_id="no_overrides",
                display_name="No Overrides Pack",
            )
        )
        response = client.get("/api/devices/configurator/no_overrides/overrides")
        assert response.status_code == 404
        assert "override store" in response.json()["detail"]

    def test_get_returns_null_payload_when_file_missing(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        response = client.get("/api/devices/configurator/testpack/overrides")
        assert response.status_code == 200
        body = response.json()
        assert body["pack_id"] == "testpack"
        assert body["payload"] is None
        assert body["path"].endswith("testpack-overrides.yaml")

    def test_put_creates_override_file(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        response = client.put(
            "/api/devices/configurator/testpack/overrides",
            json={"payload": {"bindings": {"slot-a": {"event_kind": "hid"}}}},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["pack_id"] == "testpack"
        on_disk = yaml_dir / "testpack-overrides.yaml"
        assert on_disk.exists()

    def test_put_then_get_round_trip(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        client.put(
            "/api/devices/configurator/testpack/overrides",
            json={"payload": {"bindings": {"slot-a": {"value": 0.5}}}},
        )
        response = client.get("/api/devices/configurator/testpack/overrides")
        assert response.status_code == 200
        body = response.json()
        assert body["payload"]["bindings"]["slot-a"]["value"] == 0.5
        # Auto-injected schema metadata is round-tripped.
        assert body["payload"]["schema_version"] == 1
        assert body["payload"]["device"] == "testpack"

    def test_put_rejects_payload_with_wrong_device(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        response = client.put(
            "/api/devices/configurator/testpack/overrides",
            json={"payload": {"device": "wrong_pack", "bindings": {}}},
        )
        assert response.status_code == 409

    def test_put_rejects_payload_with_wrong_schema_version(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        response = client.put(
            "/api/devices/configurator/testpack/overrides",
            json={"payload": {"schema_version": 99, "bindings": {}}},
        )
        assert response.status_code == 409

    def test_delete_removes_existing_file(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        client.put(
            "/api/devices/configurator/testpack/overrides",
            json={"payload": {"bindings": {}}},
        )
        response = client.delete("/api/devices/configurator/testpack/overrides")
        assert response.status_code == 200
        body = response.json()
        assert body["deleted"] is True
        # Idempotent: second delete reports `deleted: false`.
        response = client.delete("/api/devices/configurator/testpack/overrides")
        assert response.status_code == 200
        assert response.json()["deleted"] is False


# ---------------------------------------------------------------------------
# Learn last-event route
# ---------------------------------------------------------------------------


class TestLearnLastEventRoute:
    def test_returns_404_for_unregistered_pack(self, client: TestClient) -> None:
        response = client.get("/api/devices/configurator/nope/learn/last-event")
        assert response.status_code == 404

    def test_returns_404_when_pack_has_no_learn_source(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        response = client.get("/api/devices/configurator/testpack/learn/last-event")
        assert response.status_code == 404
        assert "Learn event source" in response.json()["detail"]

    def test_returns_baseline_snapshot_when_no_event_observed(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        source = _FakeLearnEventSource()
        _register_pack(
            isolated_registry,
            pack_id="testpack",
            yaml_dir=yaml_dir,
            learn_source=source,
        )
        response = client.get("/api/devices/configurator/testpack/learn/last-event")
        assert response.status_code == 200
        body = response.json()
        assert body["pack_id"] == "testpack"
        assert body["sequence"] == 0
        assert body["event"] is None
        assert body["observed_at"] is None

    def test_returns_pushed_hid_event(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        source = _FakeLearnEventSource()
        _register_pack(
            isolated_registry,
            pack_id="testpack",
            yaml_dir=yaml_dir,
            learn_source=source,
        )
        source.push(
            event={
                "kind": "hid",
                "vendor_id": 0x17CC,
                "product_id": 0x0808,
                "control_id": "pad-7",
                "control_kind": "pad",
                "value": 0.62,
            },
            observed_at=1715260000.0,
        )
        response = client.get("/api/devices/configurator/testpack/learn/last-event")
        body = response.json()
        assert body["sequence"] == 1
        assert body["event"]["kind"] == "hid"
        assert body["event"]["control_id"] == "pad-7"
        assert body["observed_at"] == 1715260000.0

    def test_sequence_increments_monotonically(
        self,
        client: TestClient,
        isolated_registry: DeviceConfiguratorRegistry,
        yaml_dir: Path,
    ) -> None:
        source = _FakeLearnEventSource()
        _register_pack(
            isolated_registry,
            pack_id="testpack",
            yaml_dir=yaml_dir,
            learn_source=source,
        )
        for n in range(3):
            source.push(
                event={"kind": "hid", "control_id": f"pad-{n}", "value": n * 0.1},
                observed_at=1000.0 + n,
            )
        response = client.get("/api/devices/configurator/testpack/learn/last-event")
        body = response.json()
        assert body["sequence"] == 3
        assert body["event"]["control_id"] == "pad-2"


# ---------------------------------------------------------------------------
# Registry primitive reporting
# ---------------------------------------------------------------------------


class TestPrimitiveReporting:
    def test_supported_primitives_includes_learn(self, isolated_registry: DeviceConfiguratorRegistry, yaml_dir: Path) -> None:
        source = _FakeLearnEventSource()
        _register_pack(
            isolated_registry,
            pack_id="testpack",
            yaml_dir=yaml_dir,
            learn_source=source,
        )
        registration = isolated_registry.get("testpack")
        assert registration is not None
        primitives = registration.supported_primitives
        assert "override" in primitives
        assert "learn" in primitives

    def test_supported_primitives_omits_learn_when_no_source(
        self, isolated_registry: DeviceConfiguratorRegistry, yaml_dir: Path
    ) -> None:
        _register_pack(isolated_registry, pack_id="testpack", yaml_dir=yaml_dir)
        registration = isolated_registry.get("testpack")
        assert registration is not None
        assert "learn" not in registration.supported_primitives
