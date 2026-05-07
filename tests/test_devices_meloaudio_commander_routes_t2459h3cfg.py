"""T2459-H3-CFG Phase 5 slice 1 — Configurator API route tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices_meloaudio_commander as routes
from app.services.devices.meloaudio import (
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    CommanderFirmwareKind,
    CommanderStatus,
    save_override,
)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes.router)
    return app


# ---------------------------------------------------------------------------
# /status — firmware kind classification surface
# ---------------------------------------------------------------------------


def test_status_returns_not_present_when_no_device(monkeypatch) -> None:
    monkeypatch.setattr(
        routes,
        "detect_commander_status",
        lambda: CommanderStatus(
            firmware_kind=CommanderFirmwareKind.NOT_PRESENT,
            vendor_id=None,
            product_id=None,
            product_string=None,
            manufacturer_string=None,
            serial=None,
            sysfs_path=None,
            bcd_device=None,
        ),
    )
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/status")
    assert response.status_code == 200
    body = response.json()
    assert body["firmware_kind"] == "not_present"
    assert body["is_present"] is False
    assert body["supports_discovery_wizard"] is False
    assert body["supports_canonical_config_push"] is False
    assert body["vendor_id"] is None


def test_status_returns_stock_kind_with_descriptors(monkeypatch) -> None:
    monkeypatch.setattr(
        routes,
        "detect_commander_status",
        lambda: CommanderStatus(
            firmware_kind=CommanderFirmwareKind.STOCK,
            vendor_id=0x2EEE,
            product_id=0x0301,
            product_string="TSMIDI2.0",
            manufacturer_string="MeloAudio",
            serial="000000000000011",
            sysfs_path="/sys/bus/usb/devices/3-7",
            bcd_device="2.00",
        ),
    )
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/status")
    assert response.status_code == 200
    body = response.json()
    assert body["firmware_kind"] == "stock"
    assert body["is_present"] is True
    assert body["supports_discovery_wizard"] is True
    assert body["supports_canonical_config_push"] is False
    assert body["vendor_id"] == 0x2EEE
    assert body["product_id"] == 0x0301
    assert body["product_string"] == "TSMIDI2.0"
    assert body["manufacturer_string"] == "MeloAudio"
    assert body["serial"] == "000000000000011"
    assert body["bcd_device"] == "2.00"


def test_status_returns_custom_firmware_capability(monkeypatch) -> None:
    monkeypatch.setattr(
        routes,
        "detect_commander_status",
        lambda: CommanderStatus(
            firmware_kind=CommanderFirmwareKind.CUSTOM,
            vendor_id=0x2EEE,
            product_id=0x0301,
            product_string="STM32 Customisable Midi Foot Controller",
            manufacturer_string="harvie256",
            serial="ABC",
            sysfs_path="/sys/bus/usb/devices/3-7",
            bcd_device="1.00",
        ),
    )
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/status")
    body = response.json()
    assert body["firmware_kind"] == "custom"
    assert body["supports_canonical_config_push"] is True
    assert body["supports_discovery_wizard"] is True


def test_status_returns_dfu_bootloader(monkeypatch) -> None:
    monkeypatch.setattr(
        routes,
        "detect_commander_status",
        lambda: CommanderStatus(
            firmware_kind=CommanderFirmwareKind.DFU_BOOTLOADER,
            vendor_id=0x0483,
            product_id=0xDF11,
            product_string="STM32 BOOTLOADER",
            manufacturer_string="STMicroelectronics",
            serial=None,
            sysfs_path="/sys/bus/usb/devices/3-7",
            bcd_device=None,
        ),
    )
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/status")
    body = response.json()
    assert body["firmware_kind"] == "dfu_bootloader"
    assert body["is_present"] is True   # device IS on the bus, just in flash mode
    assert body["supports_discovery_wizard"] is False
    assert body["supports_canonical_config_push"] is False


# ---------------------------------------------------------------------------
# /override — read + delete
# ---------------------------------------------------------------------------


def test_override_returns_absent_when_file_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(
        routes,
        "override_yaml_path",
        lambda: tmp_path / "missing.yaml",
    )
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/override")
    assert response.status_code == 200
    body = response.json()
    assert body["has_override"] is False
    assert body["bindings"] == []


def test_override_returns_loaded_override(monkeypatch, tmp_path: Path) -> None:
    target = tmp_path / "override.yaml"
    save_override(
        CommanderDiscoveryOverride(
            bindings={
                CommanderControl.TOP_1: CommanderDiscoveryEvent(
                    status=0xB0, midino=24, channel=1, raw_value=127
                ),
                CommanderControl.BOTTOM_A: CommanderDiscoveryEvent(
                    status=0xC0, midino=0, channel=1
                ),
            },
            captured_at_utc="2026-05-07T15:00:00+00:00",
            device_serial="ABC",
            notes="HIL",
        ),
        path=target,
    )
    monkeypatch.setattr(routes, "override_yaml_path", lambda: target)
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/override")
    assert response.status_code == 200
    body = response.json()
    assert body["has_override"] is True
    assert body["captured_at_utc"] == "2026-05-07T15:00:00+00:00"
    assert body["device_serial"] == "ABC"
    assert body["notes"] == "HIL"
    assert body["file_path"] == str(target)
    assert len(body["bindings"]) == 2
    by_control = {b["control"]: b for b in body["bindings"]}
    assert by_control["top_1"]["status"] == "0xB0"
    assert by_control["top_1"]["midino"] == 24
    assert by_control["top_1"]["channel"] == 1
    assert by_control["top_1"]["raw_value"] == 127
    assert by_control["bottom_a"]["raw_value"] is None


def test_override_get_returns_500_on_corrupt_file(monkeypatch, tmp_path: Path) -> None:
    target = tmp_path / "override.yaml"
    target.write_text("invalid: yaml: [unclosed", encoding="utf-8")
    monkeypatch.setattr(routes, "override_yaml_path", lambda: target)
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/override")
    assert response.status_code == 500
    assert "malformed" in response.json()["detail"]


def test_override_delete_removes_file(monkeypatch, tmp_path: Path) -> None:
    target = tmp_path / "override.yaml"
    target.write_text("schema_version: 1\ndevice: meloaudio_midi_commander\nbindings: {}\n")
    monkeypatch.setattr(routes, "override_yaml_path", lambda: target)
    client = TestClient(_build_app())
    response = client.delete("/api/devices/meloaudio/commander/override")
    assert response.status_code == 204
    assert not target.exists()


def test_override_delete_is_idempotent_when_file_missing(monkeypatch, tmp_path: Path) -> None:
    """Deleting a non-existent override is a no-op, not a 404. Operators
    re-clicking 'reset to defaults' shouldn't see errors.
    """
    target = tmp_path / "missing.yaml"
    monkeypatch.setattr(routes, "override_yaml_path", lambda: target)
    client = TestClient(_build_app())
    response = client.delete("/api/devices/meloaudio/commander/override")
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# /firmware/bundled
# ---------------------------------------------------------------------------


def test_bundled_firmware_empty_directory(monkeypatch, tmp_path: Path) -> None:
    """When no bundled firmware files exist, the response surfaces the
    fact so the UI can hide the 'Install Custom Firmware' button.
    """
    monkeypatch.setattr(routes, "FIRMWARE_BUNDLE_DIR", tmp_path)
    monkeypatch.setattr(routes, "list_bundled_firmware", lambda *_a, **_kw: [])
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/firmware/bundled")
    assert response.status_code == 200
    body = response.json()
    assert body["has_bundled_firmware"] is False
    assert body["firmwares"] == []
    assert body["bundle_dir"] == str(tmp_path)


def test_bundled_firmware_lists_dfu_files(monkeypatch, tmp_path: Path) -> None:
    f1 = tmp_path / "harvie256-v1.0.dfu"
    f1.write_bytes(b"x" * 1234)
    f2 = tmp_path / "harvie256-v2.0.dfu"
    f2.write_bytes(b"y" * 5678)

    monkeypatch.setattr(routes, "FIRMWARE_BUNDLE_DIR", tmp_path)
    monkeypatch.setattr(routes, "list_bundled_firmware", lambda *_a, **_kw: [f1, f2])
    client = TestClient(_build_app())
    response = client.get("/api/devices/meloaudio/commander/firmware/bundled")
    body = response.json()
    assert body["has_bundled_firmware"] is True
    assert len(body["firmwares"]) == 2
    assert body["firmwares"][0]["name"] == "harvie256-v1.0.dfu"
    assert body["firmwares"][0]["size_bytes"] == 1234
    assert body["firmwares"][1]["name"] == "harvie256-v2.0.dfu"
    assert body["firmwares"][1]["size_bytes"] == 5678


# ---------------------------------------------------------------------------
# Smoke: live router includes
# ---------------------------------------------------------------------------


def test_router_prefix_and_tags() -> None:
    """Lock the route prefix so the frontend can hard-code its API URL."""
    assert routes.router.prefix == "/api/devices/meloaudio/commander"
    assert "MeloAudio Commander Configurator" in routes.router.tags
