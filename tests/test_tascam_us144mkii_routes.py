"""T2515-6 — TASCAM US-144MKII route tests using a real TestClient."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import tascam_us144mkii as tascam_routes
from app.services.devices import tascam_us144mkii_preflight as preflight
from app.services.devices.tascam_us144mkii_preflight import (
    BOOT_PID,
    EnumerationStage,
    OPERATIONAL_PID,
    OPERATIONAL_VID,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(tascam_routes.router)
    return TestClient(app)


@pytest.fixture
def usb_root(tmp_path: Path, monkeypatch):
    root = tmp_path / "sys_bus_usb_devices"
    root.mkdir()
    monkeypatch.setattr(preflight, "_SYS_USB_DEVICES", root)
    return root


@pytest.fixture
def proc_modules(tmp_path: Path, monkeypatch):
    path = tmp_path / "proc_modules"
    path.write_text("")
    monkeypatch.setattr(preflight, "_PROC_MODULES", path)
    return path


def _write_module_loaded(proc_modules: Path) -> None:
    proc_modules.write_text(
        "snd_usb_us144mkii 16384 0 - Live 0x0000000000000000\n"
    )


def _add_usb_device(usb_root: Path, vid: str, pid: str, *, name: str = "1-2") -> Path:
    devdir = usb_root / name
    devdir.mkdir()
    (devdir / "idVendor").write_text(f"{vid}\n")
    (devdir / "idProduct").write_text(f"{pid}\n")
    return devdir


# ----------------------------------------------------------------------------
# GET /status
# ----------------------------------------------------------------------------

def test_status_returns_operational_state(client, usb_root, proc_modules):
    _write_module_loaded(proc_modules)
    _add_usb_device(usb_root, OPERATIONAL_VID, OPERATIONAL_PID)

    resp = client.get("/api/v1/devices/tascam-us144mkii/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["module_loaded"] is True
    assert body["enumeration_stage"] == EnumerationStage.OPERATIONAL
    assert body["operational_path"] is not None
    assert body["remediation_hint"] is None
    assert body["vid_pid"].lower() == f"{OPERATIONAL_VID}:{OPERATIONAL_PID}".lower()
    assert body["boot_vid_pid"].lower() == f"{OPERATIONAL_VID}:{BOOT_PID}".lower()
    assert body["canonical_name"] == "TASCAM US-144MKII"
    assert body["tier1_sample_rate_hz"] == 48000
    assert body["tier1_buffer_samples"] == 64


def test_status_returns_boot_mode_state(client, usb_root, proc_modules):
    _write_module_loaded(proc_modules)
    _add_usb_device(usb_root, OPERATIONAL_VID, BOOT_PID)

    resp = client.get("/api/v1/devices/tascam-us144mkii/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["module_loaded"] is True
    assert body["enumeration_stage"] == EnumerationStage.BOOT_MODE
    assert body["operational_path"] is None
    assert body["remediation_hint"] is not None


def test_status_returns_disconnected_when_no_module_or_device(client, usb_root, proc_modules):
    # /proc/modules empty, no usb device added
    resp = client.get("/api/v1/devices/tascam-us144mkii/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["module_loaded"] is False
    assert body["enumeration_stage"] == EnumerationStage.DISCONNECTED
    assert "modprobe" in body["remediation_hint"]


# ----------------------------------------------------------------------------
# GET /capabilities
# ----------------------------------------------------------------------------

def test_capabilities_static_profile(client):
    resp = client.get("/api/v1/devices/tascam-us144mkii/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "TASCAM US-144MKII"
    assert body["manufacturer"] == "TASCAM"
    assert body["kernel_module"] == "snd-usb-us144mkii"
    assert body["input_channels"] == 4
    assert body["output_channels"] == 4
    assert body["sample_rate"] == 48000
    assert body["buffer_size"] == 64
    assert body["spdif_send_channels"] == [2, 3]
    assert body["spdif_return_channels"] == [2, 3]
    assert body["analog_send_channels"] == [0, 1]


# ----------------------------------------------------------------------------
# POST /reset
# ----------------------------------------------------------------------------

def test_reset_refuses_without_confirm(client):
    resp = client.post("/api/v1/devices/tascam-us144mkii/reset")
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "confirmation_required"


def test_reset_returns_503_when_usbreset_missing(client, monkeypatch):
    monkeypatch.setattr(tascam_routes, "_usbreset_available", lambda: None)
    resp = client.post("/api/v1/devices/tascam-us144mkii/reset?confirm=true")
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "usbreset_unavailable"
