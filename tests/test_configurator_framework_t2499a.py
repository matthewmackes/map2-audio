"""T2499-A slice 1: Configurator framework primitives.

Validates the shared framework that subsequent slices build on:

  - Protocols carry the right shape (runtime_checkable)
  - YamlOverrideStore writes atomically and validates schema/device
  - DeviceConfiguratorRegistry is thread-safe and reports primitive
    availability per registration

These tests do NOT touch real hardware — they verify the framework
itself. The MeloAudio refactor onto this framework lands in slice 3
(cycle 4) with its own parity test.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Iterator, Mapping, Optional

import pytest

from app.services.devices._shared import (
    BindingPushResult,
    BindingPusher,
    ConfigInstallEvent,
    ConfigInstallPhase,
    ConfigInstaller,
    ConfiguratorRegistration,
    DeviceConfiguratorRegistry,
    DeviceDetectionStatus,
    DeviceDetector,
    DeviceDiscoverer,
    DeviceDiscoverySession,
    DevicePresence,
    OverrideStore,
    YamlOverrideStore,
)
from app.services.devices._shared.override_store import OverrideSchemaError


# ---------------------------------------------------------------------------
# DevicePresence + DeviceDetectionStatus
# ---------------------------------------------------------------------------


class TestDevicePresence:
    def test_is_present_false_only_for_not_present(self) -> None:
        assert DevicePresence.NOT_PRESENT.is_present is False
        assert DevicePresence.PRESENT_STOCK.is_present is True
        assert DevicePresence.PRESENT_CUSTOM.is_present is True
        assert DevicePresence.PRESENT_BOOTLOADER.is_present is True
        assert DevicePresence.PRESENT_UNKNOWN.is_present is True

    def test_is_recognised_excludes_present_unknown(self) -> None:
        assert DevicePresence.NOT_PRESENT.is_recognised is False
        assert DevicePresence.PRESENT_UNKNOWN.is_recognised is False
        assert DevicePresence.PRESENT_STOCK.is_recognised is True
        assert DevicePresence.PRESENT_CUSTOM.is_recognised is True
        assert DevicePresence.PRESENT_BOOTLOADER.is_recognised is True


class TestDeviceDetectionStatus:
    def test_immutable_dataclass_with_defaults(self) -> None:
        status = DeviceDetectionStatus(
            pack_id="acme",
            presence=DevicePresence.PRESENT_STOCK,
            transport="usb-sysfs",
        )
        assert status.serial is None
        assert status.raw == {}
        with pytest.raises(Exception):
            status.pack_id = "different"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Protocols (runtime_checkable + structural typing)
# ---------------------------------------------------------------------------


class _StubDetector:
    def detect(self) -> DeviceDetectionStatus:
        return DeviceDetectionStatus(
            pack_id="stub",
            presence=DevicePresence.NOT_PRESENT,
            transport="stub",
        )


class _StubPusher:
    def push(self, bindings: Mapping[str, Any]) -> BindingPushResult:
        return BindingPushResult(pushed=len(bindings))


class TestProtocols:
    def test_detector_is_runtime_checkable(self) -> None:
        assert isinstance(_StubDetector(), DeviceDetector)
        assert not isinstance(object(), DeviceDetector)

    def test_pusher_is_runtime_checkable(self) -> None:
        assert isinstance(_StubPusher(), BindingPusher)
        assert not isinstance(object(), BindingPusher)


# ---------------------------------------------------------------------------
# ConfigInstallPhase / ConfigInstallEvent
# ---------------------------------------------------------------------------


class TestConfigInstallPhase:
    def test_terminal_phases(self) -> None:
        assert ConfigInstallPhase.SUCCESS.is_terminal is True
        assert ConfigInstallPhase.FAILED.is_terminal is True
        assert ConfigInstallPhase.PRE_CHECK.is_terminal is False
        assert ConfigInstallPhase.INSTALLING.is_terminal is False
        assert ConfigInstallPhase.POST_CHECK.is_terminal is False


class TestConfigInstallEvent:
    def test_progress_optional(self) -> None:
        event = ConfigInstallEvent(
            phase=ConfigInstallPhase.INSTALLING, message="writing flash"
        )
        assert event.progress_pct is None
        assert event.error is None


# ---------------------------------------------------------------------------
# YamlOverrideStore
# ---------------------------------------------------------------------------


@pytest.fixture
def override_dir(tmp_path: Path) -> Path:
    target = tmp_path / "devices"
    target.mkdir()
    return target


class TestYamlOverrideStore:
    def test_path_uses_pack_id_and_slug(self, override_dir: Path) -> None:
        store = YamlOverrideStore(
            pack_id="acme", slug="midi-pad-discovered", directory=override_dir
        )
        assert store.path() == str(override_dir / "acme-midi-pad-discovered.yaml")

    def test_default_slug_is_override(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        assert store.path() == str(override_dir / "acme-override.yaml")

    def test_pack_id_required(self) -> None:
        with pytest.raises(ValueError):
            YamlOverrideStore(pack_id="")
        with pytest.raises(ValueError):
            YamlOverrideStore(pack_id="   ")

    def test_load_returns_none_when_file_missing(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        assert store.load() is None

    def test_save_then_load_roundtrip(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        path = store.save({"bindings": {"pad-1": {"cc": 64}}, "notes": "hi"})
        assert Path(path).exists()
        loaded = store.load()
        assert loaded is not None
        assert loaded["bindings"] == {"pad-1": {"cc": 64}}
        assert loaded["notes"] == "hi"
        assert loaded["device"] == "acme"
        assert loaded["schema_version"] == 1

    def test_save_is_atomic_no_dotfile_left_behind(
        self, override_dir: Path
    ) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        store.save({"x": 1})
        leftovers = [
            p for p in override_dir.iterdir() if p.name.startswith(".") and p.name.endswith(".tmp")
        ]
        assert leftovers == []

    def test_save_preserves_explicit_schema_version(
        self, override_dir: Path
    ) -> None:
        store = YamlOverrideStore(
            pack_id="acme", schema_version=2, directory=override_dir
        )
        store.save({"schema_version": 2, "x": 1})
        loaded = store.load()
        assert loaded is not None
        assert loaded["schema_version"] == 2

    def test_save_rejects_wrong_schema_version(self, override_dir: Path) -> None:
        store = YamlOverrideStore(
            pack_id="acme", schema_version=2, directory=override_dir
        )
        with pytest.raises(OverrideSchemaError):
            store.save({"schema_version": 1, "x": 1})

    def test_load_rejects_wrong_device(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        # Hand-write a file that claims a different device
        target = override_dir / "acme-override.yaml"
        target.write_text(
            "schema_version: 1\ndevice: other_pack\nbindings: {}\n",
            encoding="utf-8",
        )
        with pytest.raises(OverrideSchemaError):
            store.load()

    def test_load_rejects_non_mapping_yaml(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        target = override_dir / "acme-override.yaml"
        target.write_text("- just\n- a\n- list\n", encoding="utf-8")
        with pytest.raises(OverrideSchemaError):
            store.load()

    def test_load_treats_empty_file_as_none(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        target = override_dir / "acme-override.yaml"
        target.write_text("", encoding="utf-8")
        assert store.load() is None

    def test_delete_returns_false_when_missing(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        assert store.delete() is False

    def test_delete_returns_true_after_save(self, override_dir: Path) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        store.save({"x": 1})
        assert store.delete() is True
        assert store.load() is None

    def test_directory_created_on_save(self, tmp_path: Path) -> None:
        nested = tmp_path / "deep" / "tree" / "devices"
        store = YamlOverrideStore(pack_id="acme", directory=nested)
        store.save({"x": 1})
        assert nested.is_dir()
        assert (nested / "acme-override.yaml").exists()

    def test_implements_override_store_protocol(
        self, override_dir: Path
    ) -> None:
        store = YamlOverrideStore(pack_id="acme", directory=override_dir)
        assert isinstance(store, OverrideStore)


# ---------------------------------------------------------------------------
# DeviceConfiguratorRegistry
# ---------------------------------------------------------------------------


def _registration(pack_id: str = "acme", **kwargs: Any) -> ConfiguratorRegistration:
    defaults: dict[str, Any] = dict(pack_id=pack_id, display_name=pack_id.title())
    defaults.update(kwargs)
    return ConfiguratorRegistration(**defaults)


class TestConfiguratorRegistration:
    def test_supported_primitives_empty_when_all_none(self) -> None:
        reg = _registration()
        assert reg.supported_primitives == ()

    def test_supported_primitives_reports_only_provided_slots(self) -> None:
        reg = _registration(detector=_StubDetector(), pusher=_StubPusher())
        assert reg.supported_primitives == ("detection", "push")


class TestDeviceConfiguratorRegistry:
    def test_register_and_get(self) -> None:
        registry = DeviceConfiguratorRegistry()
        reg = _registration("acme")
        registry.register(reg)
        assert registry.get("acme") is reg

    def test_register_empty_pack_id_rejected(self) -> None:
        registry = DeviceConfiguratorRegistry()
        with pytest.raises(ValueError):
            registry.register(_registration(""))

    def test_register_duplicate_raises(self) -> None:
        registry = DeviceConfiguratorRegistry()
        registry.register(_registration("acme"))
        with pytest.raises(ValueError):
            registry.register(_registration("acme"))

    def test_register_idempotent_for_same_object(self) -> None:
        registry = DeviceConfiguratorRegistry()
        reg = _registration("acme")
        registry.register(reg)
        registry.register(reg)  # same instance — not a conflict
        assert len(registry) == 1

    def test_unregister_then_reregister(self) -> None:
        registry = DeviceConfiguratorRegistry()
        registry.register(_registration("acme"))
        assert registry.unregister("acme") is True
        assert registry.unregister("acme") is False
        registry.register(_registration("acme", display_name="ACME v2"))
        assert registry.get("acme").display_name == "ACME v2"

    def test_list_sorted_by_pack_id(self) -> None:
        registry = DeviceConfiguratorRegistry()
        registry.register(_registration("zeta"))
        registry.register(_registration("alpha"))
        registry.register(_registration("mu"))
        assert tuple(r.pack_id for r in registry.list()) == ("alpha", "mu", "zeta")

    def test_contains_and_len(self) -> None:
        registry = DeviceConfiguratorRegistry()
        assert "acme" not in registry
        assert 42 not in registry  # type: ignore[operator]
        registry.register(_registration("acme"))
        assert "acme" in registry
        assert len(registry) == 1

    def test_thread_safety_under_concurrent_register(self) -> None:
        # Many concurrent registrations of distinct pack_ids; the
        # registry must not lose any.
        registry = DeviceConfiguratorRegistry()
        errors: list[Exception] = []

        def worker(idx: int) -> None:
            try:
                registry.register(_registration(f"pack-{idx}"))
            except Exception as exc:  # pragma: no cover - defensive
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(25)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []
        assert len(registry) == 25


class TestDefaultRegistrySingleton:
    def test_default_registry_is_a_singleton(self) -> None:
        from app.services.devices._shared import get_default_registry

        first = get_default_registry()
        second = get_default_registry()
        assert first is second
